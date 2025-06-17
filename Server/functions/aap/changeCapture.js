exports.handler = async (context, event, callback) => {

  // Add CORS handling headers. TODO: Remove for production deployment
  const twilioResponse = new Twilio.Response();

  twilioResponse.appendHeader("Access-Control-Allow-Origin", "*");
  twilioResponse.appendHeader("Access-Control-Allow-Methods", "GET, POST,OPTIONS");
  twilioResponse.appendHeader('Access-Control-Allow-Headers', 'Content-Type');
  twilioResponse.appendHeader("Content-Type", "application/json");

  // Get a reference to the Twilio REST helper library
  const twilioClient = context.getTwilioClient();

  // Check if there is a call in progress for this callSid
  const callResource = await twilioClient.calls(event.callSid).fetch();

  console.log(`changeCapture API for callSID: ${event.callSid} - capture Type: ${event.captureType}`);

  if (callResource.status !== 'in-progress') {
    return callback(`startCapture error: Call not in progress for ${event.callSid}`);
  }

  try {
    const paymentSession = await twilioClient.calls(event.callSid)
      .payments(event.paymentSid)
      .update({
        capture: event.captureType,
        idempotencyKey: event.callSid + Date.now().toString(),
        statusCallback: `${context.SERVER_URL}/sync/paySyncUpdate`,
        // statusCallback: `/sync/paySyncUpdate`,  // This is the default statusCallback, which is being looked at in https://issues.corp.twilio.com/browse/VAUTO-1432
      });

    console.log(`Payment session for ${paymentSession.sid} update with captureType: ${event.captureType}`);
    twilioResponse.setBody(paymentSession);

    return callback(null, twilioResponse); // Pay Object
  } catch (error) {
    twilioResponse.setStatusCode(400);
    return callback(twilioResponse.setBody(`Error with changeType for callSID: ${event.callSid} - {error}`));
  }
};
