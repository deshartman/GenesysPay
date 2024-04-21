/**
 * This is the StatusCallback URL for the Pay API to update the pay Sync map with the data we received.
 * 
 * NOTE: Initially, the data received, will be the Connector data and contain the PKxxx value.
 *
 * {
      "PaymentConnector": "PGP_MOCK",
      "DateCreated": "2021-08-10T03:55:53.408Z",
      "PaymentMethod": "credit-card",
      "CallSid": "CAfc8f6c8101fca0723d77312b81d8e79a",
      "ChargeAmount": "9.99",
      "AccountSid": "ACxxxxx",
      "Sid": "PK248a4899c8e3311dabc8edadfb9aa07e"
    }
 * 
 * 1) Extract PaySID (PKXXX) and set at key for map.
 * 2) Use the received object as map item data.
 * 
 * The next update will be the capture data, replacing the connector data, so use that as the data
 * 
  { 
    "SecurityCode": "xxx",
    "PaymentCardType": "visa",
    "Sid": "PK5967a7414bd0566b5fba68d7728e3923",
    "PaymentConfirmationCode": "ch_a9dc6297cd1a4fb095e61b1a9cf2dd1d",
    "CallSid": "CAc99f75b7f210edd87b01577c84655b4a",
    "Result": "success",
    "AccountSid": "AC75xxxxxx",
    "ProfileId": "",
    "DateUpdated": "2021-08-10T03:58:27.290Z",
    "PaymentToken": "",
    "PaymentMethod": "credit-card",
    "PaymentCardNumber": "xxxxxxxxxxxx1111",
    "ExpirationDate": "1225"
  }
 * 
 * Process:
 * 1) Update the mapItem with the new Pay data.
 * 2) Finally, send the Sid as a response
 * 
 */
exports.handler = async (context, event, callback) => {

  const restClient = context.getTwilioClient();

  // Update it under a try/catch and if the Item does not exist, create it first and then add item
  try {
    // Delete the HTTP headers
    delete event.request;

    await restClient.sync.services(context.PAY_SYNC_SERVICE_SID)
      .syncMaps(context.SYNC_PAY_MAP_NAME)
      .syncMapItems(event.Sid)
      .update({
        data: event
      });
    // console.log(`Updated Pay Map: ${event.Sid}`);
    console.log(`Updated Pay Map ${Date.now().toLocaleString}: ${event.Sid} and data: ${JSON.stringify(event, null, 4)}`);
  } catch (error) {
    // console.log("Item does not exist, so create it");
    try {
      await restClient.sync.services(context.PAY_SYNC_SERVICE_SID)
        .syncMaps(context.SYNC_PAY_MAP_NAME)
        .syncMapItems
        .create({
          key: event.Sid,
          data: event,
          ttl: 43200  // 12 hours
        });
      console.log(`Created Pay Map: ${event.Sid} and data: ${event}`);
    } catch (error) {
      console.error(`Error creating Pay Map: ${error}`);
      return callback(`Error creating Pay Map: ${error}`);
    }
    // console.log(`Updated Pay Map: ${event.Sid}`);
    return callback(null, event.Sid);

  }
};
