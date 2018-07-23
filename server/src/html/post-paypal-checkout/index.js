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

function route(req, res) {
  const authorization = 'Basic ' +
  fetch(`${PAYPAL_API_BASE_URL}/payments/payment`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' +
        btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`),
      'Content-Type': 'application/json'
    },
    body: decodeURIComponent(req.body.payment)
  }).then(response =>
    response.json()
  ).then(result => {
    if (result.links) {
      res({location: result.links[1].href});
    } else {
      res({html: JSON.stringify(result)})
    }
  }).catch(res);
}

exports.handler = arc.html.post(route);
