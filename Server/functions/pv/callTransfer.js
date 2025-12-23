/**
 * Warm Transfer Handler for SIP REFER
 *
 * This function is triggered when a SIP phone sends a REFER message to transfer a call.
 * It extracts the transfer target from ReferTransferTarget, determines if it's a SIP or PSTN
 * destination, and completes the transfer while preserving UUI tracking.
 *
 * Process:
 * 1) Receive REFER webhook with ReferTransferTarget
 * 2) Parse target to determine if SIP or PSTN
 * 3) Extract and preserve UUI from call headers
 * 4) Dial transfer target with appropriate status callbacks
 * 5) Update UUI Sync Map when transfer target answers
 *
 * Configuration:
 * - Set this as the referUrl on your initial <Dial> verbs
 * - URL: /pv/callTransfer
 *
 * Environment Variables Used:
 * - SIP_DOMAIN_URI: For constructing SIP destinations (optional)
 */
exports.handler = async (context, event, callback) => {

  const voiceResponse = new Twilio.twiml.VoiceResponse();

  // Step 1: Validate ReferTransferTarget exists
  if (!event.ReferTransferTarget) {
    console.error(`callTransfer: No ReferTransferTarget for Call SID: ${event.CallSid}`);
    return callback('Missing ReferTransferTarget parameter');
  }

  // Step 2: Clean and normalize transfer target
  let target = event.ReferTransferTarget.trim();
  if (target.startsWith('<') && target.endsWith('>')) {
    target = target.slice(1, -1);
  }

  // Add + prefix if missing (for both SIP and PSTN)
  if (target.startsWith('sip:') && !target.startsWith('sip:+')) {
    target = target.replace('sip:', 'sip:+');
  } else if (!target.startsWith('sip:') && !target.startsWith('+')) {
    target = `+${target}`;
  }

  console.log(`callTransfer: Processing REFER for Call SID ${event.CallSid} to target: ${target}`);

  // Step 3: Extract UUI from headers
  const UUI = event["SipHeader_x-inin-cnv"]
           || event["SipHeader_User-to-User"]
           || event.CallSid;

  console.log(`callTransfer: UUI for transfer: ${UUI}`);

  try {
    // Step 4: Determine transfer type and validate
    let transferType;
    let transferDestination;

    if (target.startsWith('sip:')) {
      // SIP call
      transferType = 'sip';
      transferDestination = target;
    } else {
      // PSTN call
      transferType = 'pstn';
      transferDestination = target;

      // Validate E.164 format
      if (!transferDestination.match(/^\+[1-9]\d{1,14}$/)) {
        console.error(`callTransfer: Invalid E.164 number: ${transferDestination}`);
        voiceResponse.reject({ reason: 'busy' });
        return callback(null, voiceResponse);
      }
    }

    // Step 5: Extract original caller for caller ID
    let callerIdForTransfer = event.From;
    if (callerIdForTransfer && callerIdForTransfer.startsWith('sip:')) {
      const callerMatch = callerIdForTransfer.match(/^sip:((\+)?[0-9]+)@(.*)/);
      if (callerMatch) {
        callerIdForTransfer = callerMatch[1];
      }
    }

    console.log(`callTransfer: Type=${transferType}, Destination=${transferDestination}, CallerID=${callerIdForTransfer}`);

    // Step 6: Dial the transfer target based on type
    if (transferType === 'pstn') {
      // Transfer to PSTN number
      voiceResponse.dial({ callerId: callerIdForTransfer }).number(
        {
          statusCallbackEvent: 'answered',
          statusCallback: `${context.SERVER_URL}/sync/uuiSyncUpdate?CallDirection=toPSTN&UUI=${UUI}`,
          statusCallbackMethod: 'POST'
        },
        transferDestination
      );
      console.log(`callTransfer: Dialing PSTN ${transferDestination} with UUI ${UUI}`);

    } else if (transferType === 'sip') {
      // Transfer to SIP destination, pass UUI in header
      const sipTarget = transferDestination.includes('?')
        ? `${transferDestination}&User-to-User=${UUI}`
        : `${transferDestination}?User-to-User=${UUI}`;

      voiceResponse.dial().sip(
        {
          statusCallbackEvent: 'answered',
          statusCallback: `${context.SERVER_URL}/sync/uuiSyncUpdate?CallDirection=toSIP&UUI=${UUI}`,
          statusCallbackMethod: 'POST'
        },
        sipTarget
      );
      console.log(`callTransfer: Dialing SIP ${sipTarget} with UUI ${UUI}`);
    }

    return callback(null, voiceResponse);

  } catch (error) {
    console.error(`callTransfer Error for Call SID ${event.CallSid}: ${error.message}`);
    console.error(`Stack trace: ${error.stack}`);
    return callback(`Error with callTransfer: ${error}`);
  }
};
