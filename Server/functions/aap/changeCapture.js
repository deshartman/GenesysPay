exports.handler = async (context, event, callback) => {

  // Add CORS handling headers. TODO: Remove for production deployment
  const twilioResponse = new Twilio.Response();

  twilioResponse.appendHeader("Access-Control-Allow-Origin", "*");
  twilioResponse.appendHeader("Access-Control-Allow-Methods", "GET, POST,OPTIONS");
  twilioResponse.appendHeader('Access-Control-Allow-Headers', 'Content-Type');
  twilioResponse.appendHeader("Content-Type", "application/json");

  // Get a reference to the Twilio REST helper library
  const twilioClient = context.getTwilioClient();

  // Enhanced logging setup
  const timestamp = new Date().toISOString();
  const callSid = event.callSid;
  const paymentSid = event.paymentSid;
  const captureType = event.captureType;

  console.log(`[${timestamp}] === CHANGE CAPTURE REQUESTED ===`);
  console.log(`[${timestamp}] CallSid: ${callSid}`);
  console.log(`[${timestamp}] PaymentSid: ${paymentSid}`);
  console.log(`[${timestamp}] Capture Type: ${captureType}`);

  // Check if there is a call in progress for this callSid
  console.log(`[${timestamp}] Verifying call status...`);
  const callResource = await twilioClient.calls(event.callSid).fetch();
  console.log(`[${timestamp}] Call status: ${callResource.status}`);

  if (callResource.status !== 'in-progress') {
    console.error(`[${timestamp}] ✗ FAILED: Call not in progress for ${callSid}`);
    console.error(`[${timestamp}] === CHANGE CAPTURE FAILED ===`);
    return callback(`startCapture error: Call not in progress for ${event.callSid}`);
  }

  try {
    console.log(`[${timestamp}] Updating payment session...`);
    console.log(`[${timestamp}] Update Config: {`);
    console.log(`[${timestamp}]   capture: ${event.captureType}`);
    console.log(`[${timestamp}]   statusCallback: ${context.SERVER_URL}/sync/paySyncUpdate`);
    console.log(`[${timestamp}] }`);

    const paymentSession = await twilioClient.calls(event.callSid)
      .payments(event.paymentSid)
      .update({
        capture: event.captureType,
        idempotencyKey: event.callSid + Date.now().toString(),
        statusCallback: `${context.SERVER_URL}/sync/paySyncUpdate`,
        // statusCallback: `/sync/paySyncUpdate`,  // This is the default statusCallback, which is being looked at in https://issues.corp.twilio.com/browse/VAUTO-1432
      });

    console.log(`[${timestamp}] ✓ SUCCESS: Changed capture type`);
    console.log(`[${timestamp}] PaymentSid: ${paymentSession.sid}`);
    console.log(`[${timestamp}] New Capture Type: ${event.captureType}`);
    console.log(`[${timestamp}] Payment Status: ${paymentSession.status}`);
    console.log(`[${timestamp}] Full Response: ${JSON.stringify(paymentSession, null, 2)}`);
    console.log(`[${timestamp}] === CHANGE CAPTURE COMPLETE ===`);

    twilioResponse.setBody(paymentSession);
    return callback(null, twilioResponse); // Pay Object
  } catch (error) {
    console.error(`[${timestamp}] ✗ FAILED: Error changing capture type`);
    console.error(`[${timestamp}] CallSid: ${callSid}`);
    console.error(`[${timestamp}] PaymentSid: ${paymentSid}`);
    console.error(`[${timestamp}] Requested Capture Type: ${captureType}`);
    console.error(`[${timestamp}] Error Message: ${error.message}`);
    console.error(`[${timestamp}] Error Code: ${error.code || 'N/A'}`);
    console.error(`[${timestamp}] Full Error: ${JSON.stringify(error, null, 2)}`);
    console.error(`[${timestamp}] === CHANGE CAPTURE FAILED ===`);

    twilioResponse.setStatusCode(400);
    return callback(twilioResponse.setBody(`Error with changeType for callSID: ${event.callSid} - ${error.message}`));
  }
};
