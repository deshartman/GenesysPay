/**
 * This is the inbound call from PSTN that routes the call to the Customer destination SIP Domain.
 * 
 * The PSTN side call SID is written into a Sync Map as reference, so Pay can be attached.
 * 
 * Process:
 * 1) Assume uuiMap exists and create new mapItem with inbound call Sid as key and uui.
 * 2) If it fails, SyncMap uuiMap does not exist, so create it and add new data.
 * 3) Finally, create new call leg.
 * 
 */
exports.handler = async (context, event, callback) => {

  const restClient = context.getTwilioClient();

  // Write the incoming PSTN call's Call SID as the UUI into Sync
  try {
    // Make the call to the SIP Domain
    const voiceResponse = new Twilio.twiml.VoiceResponse();

    // Send to SIP user -> sip:+number@SIP_DOMAIN_URI?User-to-User=CAxxxxx
    const sipTo = event.To + '@' + context.SIP_DOMAIN_URI + '?' + 'User-to-User=' + event.CallSid;

    // Extract the PSTN side UUI reference
    const UUI = event.CallSid;

    console.info(`callToSIP: Calling SIP URI: ${sipTo} for Call SID: ${event.CallSid} and UUI: ${UUI}`)

    // Dial SIP URL
    voiceResponse.dial().sip(
      {
        // Only update Sync when call is answered
        statusCallbackEvent: 'answered',
        statusCallback: context.SERVER_URL + `/sync/uuiSyncUpdate?CallDirection=toSIP&UUI=${UUI}`,
        statusCallbackMethod: 'POST'
      },
      sipTo);
    return callback(null, voiceResponse);
  } catch (error) {
    return callback(`Error with callToSIP: ${error}`);
  }
};
