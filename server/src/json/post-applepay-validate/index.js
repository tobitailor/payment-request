/* Copyright 2017-2018 Copper, Inc. */

const {env} = process;

const arc = require('@architect/functions');
const fs = require('fs');
const fetch = require('node-fetch');
const https = require('https');

const CA_PATH = './merchant.pem';

const VALIDATION_URL =
  'https://apple-pay-gateway-cert.apple.com/paymentservices/startSession'
;

function route(req, res) {
  const {body} = req;
  const uri = body.validation_url || VALIDATION_URL;
  const ca = fs.readFileSync(CA_PATH, 'utf8');
  const merchantIdentifier = body.merchant_id || env.APPLE_PAY_MERCHANT_ID;
  const domainName = body.domain_name || env.APPLE_PAY_DOMAIN_NAME;
  const displayName = body.display_name || env.APPLE_PAY_DISPLAY_NAME;
  fetch(uri, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({merchantIdentifier, domainName, displayName}),
    agent: new https.Agent({
      key: ca,
      cert: ca
    })
  }).then(response =>
    response.json()
  ).then(json => {
    res({json});
  }).catch(res);
}

exports.handler = arc.json.post(route);
