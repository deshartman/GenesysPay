/**
 * Inbound PSTN call handler that routes to Customer SIP Domain WITH REFER SUPPORT
 *
 * Same as callToSIP.js but with answerOnBridge and referUrl for warm transfer capability.
 * Uses unified callReferHandler which intelligently routes based on PAY_TRIGGER_NUMBER:
 * - If agent transfers to PAY_TRIGGER_NUMBER: Initiates Pay-first flow
 * - If agent transfers to any other number: Normal transfer flow
 *
 * Process:
 * 1) Receive inbound PSTN call
 * 2) Route call to SIP Domain with REFER support enabled
 * 3) When SIP agent presses transfer:
 *    - Transfer to PAY_TRIGGER_NUMBER → Pay IVR, then reconnect with payment token
 *    - Transfer to normal number → Standard warm transfer
 *
 * This can also be done using TwiML:
 *
 * <Response>
 *    <Dial answerOnBridge="true" referUrl="/pv/callReferHandler" referMethod="POST">
 *      <Sip
 *        statusCallbackEvent: 'answered',
 *        statusCallback: `{{SERVER_URL}}/sync/uuiSyncUpdate?CallDirection=toSIP&UUI={{CallSid}}`,
 *        statusCallbackMethod: 'POST'>
 *       sip:{{To}}@{{SIP_DOMAIN_URI}}?User-to-User={{CallSid}}
 *      </Sip>
 *    </Dial>
 * </Response>
 *
 */
exports.handler = async (context, event, callback) => {

  const restClient = context.getTwilioClient();
  const voiceResponse = new Twilio.twiml.VoiceResponse();
  const UUI = event.CallSid;  // Extract the PSTN side UUI reference

  try {
    const sipTo = `${event.To}@${context.SIP_DOMAIN_URI}?User-to-User=${UUI}`;
    // console.info(`callToSIPwithRefer: Calling SIP URI: ${sipTo} for Call SID: ${event.CallSid} and UUI: ${UUI}`)

    // Dial SIP URL with REFER support for warm transfers
    voiceResponse.dial({
      answerOnBridge: true,        // Keep caller connected during transfer (warm transfer)
      referUrl: '/pv/callReferHandler', // Webhook for unified REFER handling (normal transfer or pay-first)
      referMethod: 'POST'
    }).sip(
      {
        // Only update Sync when call is answered
        statusCallbackEvent: 'answered',
        statusCallback: `${context.SERVER_URL}/sync/uuiSyncUpdate?CallDirection=toSIP&UUI=${UUI}`,
        statusCallbackMethod: 'POST'
      },
      sipTo);

    return callback(null, voiceResponse);
  } catch (error) {
    return callback(`Error with callToSIPwithRefer: ${error}`);
  }
};
