/* Copyright 2017-2018 Copper, Inc. */

const {env} = process;

const arc = require('@architect/functions');
const fetch = require('node-fetch');

const PAYPAL_API_BASE_URL =
  env.PAYPAL_ENV === 'live' ?
    'https://api.paypal.com/v1' :
    'https://api.sandbox.paypal.com/v1'
;

function btoa(str) {
  return new Buffer(str).toString('base64');
}

function createResponse(result) {
  return {
    html: `<!doctype html>
      <meta charset=utf-8>
      <script>
        opener.postMessage(${result}, '*')
      </script>`
  };
}

function route(req, res) {
  const pid = req.query['paymentId'];
  if (pid) {
    fetch(`${PAYPAL_API_BASE_URL}/payments/payment/${pid}`, {
      headers: {
        'Authorization': 'Basic ' +
          btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`)
      }
    }).then(response =>
      response.json()
    ).then(result => {
      res(createResponse(JSON.stringify(result)));
    }).catch(({name, message}) => {
      res(createResponse(JSON.stringify(
        {
          error: name,
          error_description: message
        }
      )));
    });
  } else {
    res(createResponse(JSON.stringify({error: 'ABORT'})));
  }
}

exports.handler = arc.html.get(route);
