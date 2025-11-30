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

  // Enhanced logging setup
  const timestamp = new Date().toISOString();
  const callSid = event.callSid;

  console.log(`[${timestamp}] === START CAPTURE REQUESTED ===`);
  console.log(`[${timestamp}] CallSid: ${callSid}`);
  console.log(`[${timestamp}] Request Parameters:`);
  console.log(`[${timestamp}] - Charge Amount: ${event.chargeAmount}`);
  console.log(`[${timestamp}] - Currency: ${event.currency}`);
  console.log(`[${timestamp}] - Token Type: ${event.tokenType || 'N/A'}`);
  console.log(`[${timestamp}] - Payment Connector: ${context.PAYMENT_CONNECTOR}`);

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

  console.log(`[${timestamp}] Creating payment session...`);
  console.log(`[${timestamp}] Session Config: ${JSON.stringify(sessionData, null, 2)}`);

  // Now create the payment session
  try {
    const paymentSession = await twilioClient.calls(event.callSid)
      .payments
      .create(sessionData);

    console.log(`[${timestamp}] ✓ SUCCESS: Payment session created`);
    console.log(`[${timestamp}] PaymentSid: ${paymentSession.sid}`);
    console.log(`[${timestamp}] CallSid: ${callSid}`);
    console.log(`[${timestamp}] Status: ${paymentSession.status}`);
    console.log(`[${timestamp}] Payment Method: ${paymentSession.paymentMethod}`);
    console.log(`[${timestamp}] Status Callback: ${sessionData.statusCallback}`);
    console.log(`[${timestamp}] Full Response: ${JSON.stringify(paymentSession, null, 2)}`);
    console.log(`[${timestamp}] === START CAPTURE COMPLETE ===`);

    twilioResponse.setBody(paymentSession);
    return callback(null, twilioResponse);
  } catch (error) {
    console.error(`[${timestamp}] ✗ FAILED: Error starting payment session`);
    console.error(`[${timestamp}] CallSid: ${callSid}`);
    console.error(`[${timestamp}] Error Message: ${error.message}`);
    console.error(`[${timestamp}] Error Code: ${error.code || 'N/A'}`);
    console.error(`[${timestamp}] More Info: ${error.moreInfo || 'N/A'}`);
    console.error(`[${timestamp}] Full Error: ${JSON.stringify(error, null, 2)}`);
    console.error(`[${timestamp}] === START CAPTURE FAILED ===`);

    twilioResponse.setStatusCode(400);
    twilioResponse.setBody({
      error: `Unable to start payment for Call SID ${event.callSid}. Please verify: (1) The call is currently active, (2) The Call SID is correct, (3) The call has not already completed. Error: ${error.message}`
    });
    return callback(null, twilioResponse);
  }
};