import uuidv4 from 'uuid/v4';

const APPLE_PAY_URL = 'https://apple.com/apple-pay';
const PAYPAL_URL = 'https://paypal.com';

export class PaymentResponse {
  constructor({
    requestId,
    methodName,
    details,
    shippingAddress,
    shippingOption,
    payerName,
    payerEmail,
    payerPhone
  }) {
    this.requestId = requestId;
    this.methodName = methodName;
    this.details = details;
    this.shippingAddress = shippingAddress || null;
    this.shippingOption = shippingOption || null;
    this.payerName = payerName || null;
    this.payerEmail = payerEmail || null;
    this.payerPhone = payerPhone || null;
  }

  complete(result = 'unknown') {}

  toJSON() {
    return JSON.stringify({
      requestId: this.requestId,
      methodName: this.methodName,
      shippingAddress: this.shippingAddress,
      shippingOption: this.shippingOption,
      payerName: this.payerName,
      payerEmail: this.payerEmail,
      payerPhone: this.payerPhone
    });
  }
}

export class PaymentRequest {
  constructor(methodData, details, options) {
    if (window.PaymentRequest) {
      const native = new window.PaymentRequest(methodData, details, options);
      this.id = native.id;
      this.native = native;
    } else {
      this.id = 'id' in details ? details.id : uuidv4();
    }
    this.methodData = [...methodData];
    this.details = {...details, id: this.id};
    this.options = {...options};
    this.shippingAddress = null;
    this.shippingOption = null;
    this.shippingType = null;
    // attribute EventHandler onshippingaddresschange;
    // attribute EventHandler onshippingoptionchange;
    if (
      typeof ApplePaySession !== 'undefined' &&
      methodData[0].data.merchantValidationURL
    ) {
      const {data} = methodData[0];
      this.onmerchantvalidation = event => {
        event.complete(fetch(
          data.merchantValidationURL,
          {
            method: 'POST',
            headers: new Headers({
              'Content-Type': 'application/json'
            }),
            body: JSON.stringify({
              validation_url: event.validationURL,
              merchant_id: data.merchantIdentifier,
              domain_name: location.hostname,
              display_name: data.displayName
            })
          }
        ).then(response => response.json()));
      };
    }
    this._abort = null;
  }

  show() {
    const requestId = this.id;
    if (!requestId) {
      throw new DOMException('INVALID_STATE', DOMException.INVALID_STATE_ERR);
    }
    const {methodData, details, options} = this;
    const {supportedMethods, data} = methodData[0]; 
    const {displayItems, total} = details;
    switch (supportedMethods) {
    case APPLE_PAY_URL:
      if (this.native) {
        this.native.onmerchantvalidation = this.onmerchantvalidation;
        return this.native.show();
      }
      if (typeof ApplePaySession === 'undefined') {
        return Promise.reject(
          new DOMException('NOT_SUPPORTED', DOMException.NOT_SUPPORTED_ERR)
        );
      }
      const requestedFields = [];
      if (options.requestPayerName) {
        requestedFields.push('name');
      }
      if (options.requestPayerEmail) {
        requestedFields.push('email');
      }
      if (options.requestPayerPhone) {
        requestedFields.push('phone');
      }
      if (options.requestShipping) {
        requestedFields.push('postalAddress');
      }
      const that = this;
      return new Promise((resolve, reject) => {
        const session = new ApplePaySession(2, {
          ...data,
          currencyCode: total.amount.currency,
          total: {
            label: total.label,
            amount: total.amount.value
          },
          lineItems: displayItems && displayItems.map(
            ({label, amount: {value}}) => (
              {
                label,
                type: 'final',
                amount: value
              }
            )
          ),
          requiredShippingContactFields: requestedFields
        });
        session.onvalidatemerchant = event => {
          that.onmerchantvalidation({
            ...event,
            complete: sessionPromise => {
              sessionPromise.then(merchantSession => {
                session.completeMerchantValidation(
                  merchantSession
                );
              }).catch(reject);
            }
          });
        };
        session.oncancel = () => {
          reject(new DOMException('ABORT', DOMException.ABORT_ERR));
        };
        session.onpaymentauthorized = ({payment}) => {
          let shippingAddress;
          let payerName;
          let payerEmail;
          let payerPhone;
          const contact = payment.shippingContact;
          if (contact) {
            const {givenName, familyName} = contact;
            if (givenName) {
              payerName = givenName;
              if (familyName) {
                payerName += ' ' + familyName;
              }
            } else if (familyName) {
              payerName = familyName;
            }
            if (contact.emailAddress) {
              payerEmail = contact.emailAddress;
            }
            if (contact.phoneNumber) {
              payerPhone = contact.phoneNumber;
            }
            if (contact.shippingAddress) {
              const address = contact.shippingAddress;
              shippingAddress = {
                city: address.locality || '',
                country: address.country || '',
                dependentLocality: address.subLocality || '',
                languageCode: '',
                organization: '',
                phone: address.phoneNumber || '',
                postalCode: address.postalCode || '',
                recipient: payerName || '',
                region: address.administrativeArea || '',
                sortingCode: '',
                addressLine: address.addressLines || []
              };
            }
          }
          const response = new PaymentResponse({
            requestId,
            methodName: 'https://apple.com/apple-pay',
            details: payment,
            shippingAddress,
            // shippingOption,
            payerName,
            payerEmail,
            payerPhone
          });
          response.complete = (result = 'unknown') => {
            session.completePayment(
              result === 'success' ?
                ApplePaySession.STATUS_SUCCESS :
                ApplePaySession.STATUS_FAILURE
            );
          };
          resolve(response);
        };
        that._abort = () => {
          session.abort();
          that._abort = null;
        };
        session.begin();
      });
      break;
    case PAYPAL_URL:
      return new Promise((resolve, reject) => {
        const form = document.createElement('form');
        form.action = data.checkoutURL;
        form.method = 'post';
        form.target = requestId;
        const input = document.createElement('input');
        input.name = 'payment';
        input.value = JSON.stringify({
          intent: data.intent,
          payer: {
            payment_method: 'paypal'
          },
          transactions: [{
            reference_id: requestId,
            amount: {
              total: total.amount.value,
              currency: total.amount.currency
            },
            payment_options: {
              allowed_payment_method:
                data.allowedPaymentMethod
            },
            item_list: displayItems && displayItems.map(
              ({label, amount: {currency, value}}) => (
                {
                  name: label,
                  price: value,
                  currency
                }
              )
            )
          }],
          experience_profile_id: data.experienceProfileId,
          redirect_urls: {
            return_url: data.returnURL,
            cancel_url: data.returnURL
          }
        });
        form.appendChild(input);
        const win = window.open(data.checkoutURL, requestId);
        const iv = setInterval(() => {
          if (win.closed) {
            clearInterval(iv);
            reject(new DOMException('ABORT', DOMException.ABORT_ERR));
          }
        });
        form.submit();
        window.onmessage = event => {
          win.close();
          const payment = event.data;
          if (!payment) {
            reject(new DOMException('ABORT', DOMException.ABORT_ERR));
            return;
          }
          if (payment.error) {
            reject(new Error(payment.error_description || payment.error));
            return;
          }
          let shippingAddress;
          let payerName;
          let payerEmail;
          let payerPhone;
          const {payer_info} = payment.payer;
          if (payer_info) {
            const {first_name, last_name} = payer_info;
            if (first_name) {
              payerName = first_name;
              if (last_name) {
                payerName += ' ' + last_name;
              }
            } else if (last_name) {
              payerName = last_name;
            }
            if (payer_info.email) {
              payerEmail = payer_info.email;
            }
            if (payer_info.shipping_address) {
              const address = payer_info.shipping_address;
              const addressLine = [address.line1];
              if (address.line2) {
                addressLine.push(address.line2);
              }
              payerPhone = address.phone || '';
              shippingAddress = {
                city: address.city || '',
                country: address.country_code || '',
                dependentLocality: '',
                languageCode: '',
                organization: '',
                phone: payerPhone,
                postalCode: address.postal_code || '',
                recipient: address.recipient_name || '',
                region: address.state || '',
                sortingCode: '',
                addressLine
              };
            }
          }
          const response = new PaymentResponse({
            requestId,
            methodName: PAYPAL_URL,
            details: payment,
            shippingAddress,
            // shippingOption,
            payerName,
            payerEmail,
            payerPhone
          });
          resolve(response);
        };
      });
      break;
    default:
      if (this.native) {
        return this.native.show();
      }
      return Promise.reject(
        new DOMException('NOT_SUPPORTED', DOMException.NOT_SUPPORTED_ERR)
      );
    }
  }

  abort() {
    if (!this.id) {
      throw new DOMException('INVALID_STATE', DOMException.INVALID_STATE_ERR);
    }
    if (this.native) {
      this.native.abort();
    } else if (this._abort) {
      this._abort();
    }
  }

  canMakePayment() {
    const {supportedMethods, data} = this.methodData[0];
    switch (supportedMethods) {
    case APPLE_PAY_URL:
      if (!this.native && typeof ApplePaySession !== 'undefined') {
        return ApplePaySession.canMakePaymentsWithActiveCard(
          data.merchantId
        );
      }
      break;
    case PAYPAL_URL:
      return Promise.resolve(!!data.checkoutURL);
    }
    if (this.native) {
      return this.native.canMakePayment();
    }
    return Promise.resolve(false);
  }
}
