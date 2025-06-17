/* 
This function allows the Client to start a payment session for a particular Call SID passed as part of the UUI
The first thing to check is if there is actually an active call for the callSid. This is in effect the security mechanism to limit who can call this function
*/
exports.handler = async (context, event, callback) => {

  // Add CORS handling headers. TODO: Remove for production deployment
  ////////////////////////
  const twilioResponse = new Twilio.Response();
  twilioResponse.appendHeader("Access-Control-Allow-Origin", "*");
  twilioResponse.appendHeader("Access-Control-Allow-Methods", "GET, POST,OPTIONS");
  twilioResponse.appendHeader('Access-Control-Allow-Headers', 'Content-Type');
  twilioResponse.appendHeader("Content-Type", "application/json");
  ////////////////////////

  // Get a reference to the Twilio REST helper library
  const twilioClient = context.getTwilioClient();

  // console.log(`Starting payment session for event: ${JSON.stringify(event, null, 2)} `);

  // Create the payment session
  const sessionData = {
    idempotencyKey: event.callSid + Date.now().toString(),
    statusCallback: `${context.SERVER_URL}/sync/paySyncUpdate`,
    // statusCallback: `/sync/paySyncUpdate`, // This is the default statusCallback, which is being looked at in https://issues.corp.twilio.com/browse/VAUTO-1432
    ...(event.chargeAmount === 0 ? { tokenType: event.tokenType } : {}), // Only include tokenType if chargeAmount is 0
    chargeAmount: event.chargeAmount,
    currency: event.currency,
    paymentConnector: context.PAYMENT_CONNECTOR,
    securityCode: context.INCLUDE_CVC,
    postalCode: context.INCLUDE_POSTAL_CODE
  }

  console.log(`Starting payment session for callSID: ${event.callSid} with data: ${JSON.stringify(sessionData)}`);

  // Now create the payment session
  try {
    const paymentSession = await twilioClient.calls(event.callSid)
      .payments
      .create(sessionData);

    console.log(`Payment session created for callSID: ${event.callSid} with session data: ${JSON.stringify(paymentSession)}`);

    twilioResponse.setBody(paymentSession);
    return callback(null, twilioResponse);
  } catch (error) {
    console.error(`Error starting payment session for callSID: ${event.callSid} - ${error}`);
    twilioResponse.setStatusCode(400);
    twilioResponse.setBody({
      error: `Invalid Call SID: ${event.callSid}. Please check that the call is active.`
    });
    return callback(null, twilioResponse);
  }
};