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

    // Enhanced logging setup
    const timestamp = new Date().toISOString();
    const callSid = event.CallSid;
    const paymentSid = event.Sid;

    // Determine event type based on what fields are present
    let eventType = 'UNKNOWN';
    if (event.PaymentConnector && !event.PaymentCardNumber) {
      eventType = 'PAYMENT_INITIATED';
    } else if (event.PaymentCardNumber) {
      eventType = 'CAPTURE_UPDATE';
    } else if (event.Result) {
      eventType = 'PAYMENT_RESULT';
    }

    console.log(`[${timestamp}] === SYNC UPDATE RECEIVED ===`);
    console.log(`[${timestamp}] CallSid: ${callSid}`);
    console.log(`[${timestamp}] PaymentSid: ${paymentSid}`);
    console.log(`[${timestamp}] Event Type: ${eventType}`);
    console.log(`[${timestamp}] Full Event Data: ${JSON.stringify(event, null, 2)}`);

    console.log(`[${timestamp}] Attempting to UPDATE existing Sync Map item...`);
    console.log(`[${timestamp}] - Service: ${context.PAY_SYNC_SERVICE_SID}`);
    console.log(`[${timestamp}] - Map: ${context.SYNC_PAY_MAP_NAME}`);
    console.log(`[${timestamp}] - Key: ${paymentSid}`);

    await restClient.sync.v1.services(context.PAY_SYNC_SERVICE_SID)
      .syncMaps(context.SYNC_PAY_MAP_NAME)
      .syncMapItems(event.Sid)
      .update({
        data: event
      });

    console.log(`[${timestamp}] ✓ SUCCESS: Updated Sync Map item ${paymentSid} for CallSid ${callSid}`);
    console.log(`[${timestamp}] === SYNC UPDATE COMPLETE ===`);
    return callback(null, event.Sid);
  } catch (error) {
    // Need to re-declare these since they're in try block scope
    const timestamp = new Date().toISOString();
    const callSid = event.CallSid;
    const paymentSid = event.Sid;

    console.log(`[${timestamp}] Map item doesn't exist yet, creating new item...`);
    try {
      await restClient.sync.v1.services(context.PAY_SYNC_SERVICE_SID)
        .syncMaps(context.SYNC_PAY_MAP_NAME)
        .syncMapItems
        .create({
          key: event.Sid,
          data: event,
          ttl: 43200  // 12 hours
        });
      console.log(`[${timestamp}] ✓ SUCCESS: Created new Sync Map item ${paymentSid} for CallSid ${callSid}`);
      console.log(`[${timestamp}] Created with TTL: 43200 seconds (12 hours)`);
      console.log(`[${timestamp}] === SYNC UPDATE COMPLETE ===`);
      return callback(null, event.Sid);
    } catch (error) {
      console.error(`[${timestamp}] ✗ FAILED: Error creating Sync Map item for CallSid ${callSid}, PaymentSid ${paymentSid}`);
      console.error(`[${timestamp}] Error details: ${error.message}`);
      console.error(`[${timestamp}] Full error: ${JSON.stringify(error, null, 2)}`);
      return callback(`Error creating Pay Map: ${error}`);
    }

  }
};
