/**
 * This is the outbound to PSTN voice handler that routes the call from the Customer's SIP Domain to a PSTN destination.
 * The PSTN side call SID is written into a Sync map as reference, so Pay can be attached.
 *
 * In this particular case, the SIP Domain needs to send a UUI in the SIP header and we extract it as "SipHeader_User-to-User". See https://www.twilio.com/docs/voice/api/sending-sip#uui-user-to-user-information-header
 * Once the call is connected, we call the StatusCallback to write the UUI & callSID in the UUI sync map.
 * 
 */
exports.handler = async (context, event, callback) => {

  const voiceResponse = new Twilio.twiml.VoiceResponse();

  let to = event.To.match(/^sip:((\+)?[0-9]+)@(.*)/)[1];  // Extract the +E.164 number from the SIP URI
  let from = event.From.match(/^sip:((\+)?[0-9]+)@(.*)/)[1]; // Extract the +E.164 number from the SIP URI

  // Extract the SIP side UUI reference
  const UUI = event["SipHeader_x-inin-cnv"] || Date.now();

  try {
    // console.info(`Dialling ${to} with Caller ID ${from} for Call SID: ${event.CallSid} with UUI ${UUI}`);

    voiceResponse.dial({ callerId: from }).number(
      {
        // Only update Sync when call is answered
        statusCallbackEvent: 'answered',
        statusCallback: `/sync/uuiSyncUpdate?CallDirection=toPSTN&UUI=${UUI}`,
        statusCallbackMethod: 'POST'
      },
      to);

    return callback(null, voiceResponse);
  } catch (error) {
    return callback(`Error with callToPSTN: ${error}`);
  }
};
