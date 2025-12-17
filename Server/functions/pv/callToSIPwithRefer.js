/**
 * This is the inbound call from PSTN that routes the call to the Customer destination SIP Domain WITH REFER SUPPORT.
 *
 * Same as callToSIP.js but with answerOnBridge and referUrl for warm transfer capability.
 *
 * The PSTN side call SID is written into a Sync Map as reference, so Pay can be attached.
 *
 * Process:
 * 1) Assume uuiMap exists and create new mapItem with inbound call Sid as key and uui.
 * 2) If it fails, SyncMap uuiMap does not exist, so create it and add new data.
 * 3) Finally, create new call leg with REFER support enabled.
 *
 *  This can also be done using Twiml:
 *
 * <Response>
 *    <Dial answerOnBridge="true" referUrl="/pv/callTransfer" referMethod="POST">
 *      <Sip
 *        statusCallbackEvent: 'answered',
 *        statusCallback: `{{SYNC_SERVER_URL}}/sync/uuiSyncUpdate?CallDirection=toSIP&UUI={{CallSid}}`,
 *        statusCallbackMethod: 'POST'>
 *       sip:{{To}}@{{SIP_DOMAIN_URI}}?User-to-User={{CallSid}}
 *      </Sip>
 *    </Dial>
 * </Response>
 *
 * NOTE: SYNC_SERVER_URL must point to US1 Functions URL (Sync only works in US1)
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
      referUrl: '/pv/callTransfer', // Webhook for REFER handling
      referMethod: 'POST'
    }).sip(
      {
        // Only update Sync when call is answered
        statusCallbackEvent: 'answered',
        statusCallback: `${context.SYNC_SERVER_URL}/sync/uuiSyncUpdate?CallDirection=toSIP&UUI=${UUI}`,
        statusCallbackMethod: 'POST'
      },
      sipTo);

    return callback(null, voiceResponse);
  } catch (error) {
    return callback(`Error with callToSIPwithRefer: ${error}`);
  }
};
