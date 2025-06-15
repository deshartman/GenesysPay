/**
 * This is the outbound to PSTN voice handler that routes the call from the Customer's SIP Domain to a PSTN destination.
 * 
 */
exports.handler = async (context, event, callback) => {

  const voiceResponse = new Twilio.twiml.VoiceResponse();

  let to = event.To.match(/^sip:((\+)?[0-9]+)@(.*)/)[1];  // Extract the +E.164 number from the SIP URI
  let from = event.From.match(/^sip:((\+)?[0-9]+)@(.*)/)[1]; // Extract the +E.164 number from the SIP URI

  try {
    console.info(`Dialling ${to} with Caller ID ${from} for Call SID: ${event.CallSid}`);

    voiceResponse.dial({ callerId: from }).number(to);

    return callback(null, voiceResponse);
  } catch (error) {
    return callback(`Error with callToPSTN: ${error}`);
  }
};
