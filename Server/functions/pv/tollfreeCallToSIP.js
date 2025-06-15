/**
 * This is the inbound call from PSTN to a Toll Free number that routes the call to the Customer destination SIP Domain.
 * 
 * The key here is to extract the "TollFreeMobileOriginationLocation" from the call and send as an x-header in the SIP INVITE for mobile calls. For Landline calls, the x-header is not needed.
 */
exports.handler = async (context, event, callback) => {

  const restClient = context.getTwilioClient();
  const voiceResponse = new Twilio.twiml.VoiceResponse();
  const MOLI = event.TollFreeMobileOriginationLocation

  try {
    const sipTo = `${event.To}@${context.SIP_DOMAIN_URI}?User-to-User=${MOLI}`;
    console.info(`callToSIP: Calling SIP URI: ${sipTo} for Call SID: ${event.CallSid} and UUI: ${MOLI}`)

    // Dial SIP URL
    voiceResponse.dial().sip(sipTo);

    return callback(null, voiceResponse);
  } catch (error) {
    return callback(`Error with callToSIP: ${error}`);
  }
};
