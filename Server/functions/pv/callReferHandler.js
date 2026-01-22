/**
 * Unified SIP REFER Handler
 *
 * This function is triggered when a SIP phone sends a REFER message to transfer a call.
 * It intelligently routes to either:
 * - Pay-first flow: If REFER target matches PAY_TRIGGER_NUMBER
 * - Normal transfer: For all other transfer targets
 *
 * Pay-First Flow (when target = PAY_TRIGGER_NUMBER):
 * 1) Captures REFER details and stores them in Sync Map
 * 2) Disconnects SIP leg and initiates Twilio Pay for tokenization
 * 3) After payment, reconnects to configured destination with payment token
 *
 * Normal Transfer Flow (all other targets):
 * 1) Extracts transfer target and UUI from REFER
 * 2) Determines if SIP or PSTN destination
 * 3) Dials target immediately while preserving UUI tracking
 *
 * Configuration:
 * - Set this as the referUrl on your initial <Dial> verbs
 * - URL: /pv/callReferHandler
 *
 * Environment Variables Required:
 * - PAY_TRIGGER_NUMBER: Special number that triggers Pay flow (e.g., +19999999999)
 * - PAYMENT_CONNECTOR: Payment gateway connector name
 * - INCLUDE_CVC: Whether to require security code
 * - INCLUDE_POSTAL_CODE: Whether to require postal code
 * - PAY_SYNC_SERVICE_SID: Twilio Sync service SID
 * - SYNC_PAY_MAP_NAME: Sync map name for payment/REFER data
 * - SERVER_URL: Base URL for callbacks
 * - ACCOUNT_SID: Twilio Account SID
 * - AUTH_TOKEN: Twilio Auth Token
 * - SIP_DOMAIN_URI: SIP domain for routing (optional)
 */
exports.handler = async (context, event, callback) => {
  const voiceResponse = new Twilio.twiml.VoiceResponse();

  // Step 1: Validate ReferTransferTarget exists
  if (!event.ReferTransferTarget) {
    console.error(`callReferHandler: No ReferTransferTarget for Call SID: ${event.CallSid}`);
    return callback('Missing ReferTransferTarget parameter');
  }

  const referTo = event.ReferTransferTarget;
  const callSid = event.CallSid;

  // Step 2: Check if this is a Pay-first transfer
  const payTriggerNumber = context.PAY_TRIGGER_NUMBER || '+19999999999';
  const isPayTransfer = referTo.includes(payTriggerNumber);

  console.log(`callReferHandler: REFER received for Call ${callSid}`);
  console.log(`callReferHandler: Target: ${referTo}`);
  console.log(`callReferHandler: Pay trigger number: ${payTriggerNumber}`);
  console.log(`callReferHandler: Is Pay transfer: ${isPayTransfer}`);

  if (isPayTransfer) {
    // ============================================
    // PAY-FIRST FLOW
    // ============================================
    return handlePayFirstTransfer(context, event, callback, voiceResponse);
  } else {
    // ============================================
    // NORMAL TRANSFER FLOW
    // ============================================
    return handleNormalTransfer(context, event, callback, voiceResponse);
  }
};

/**
 * Handle Pay-First Transfer Flow
 * Stores REFER details and returns <Pay> TwiML for tokenization
 */
async function handlePayFirstTransfer(context, event, callback, voiceResponse) {
  const referTo = event.ReferTransferTarget;
  const referredBy = event["SipHeader_Referred-By"] || 'Unknown';
  const callSid = event.CallSid;
  const UUI = event["SipHeader_x-inin-cnv"]
           || event["SipHeader_User-to-User"]
           || callSid;

  // Log REFER details
  console.log('=== SIP REFER TO PAY ===');
  console.log(`Call SID: ${callSid}`);
  console.log(`Refer-To: ${referTo}`);
  console.log(`Referred-By: ${referredBy}`);
  console.log(`UUI: ${UUI}`);
  console.log(`From: ${event.From}`);
  console.log('========================');

  try {
    // Initialize Twilio REST client for Sync operations
    const restClient = require('twilio')(context.ACCOUNT_SID, context.AUTH_TOKEN);

    // Store REFER details in Sync Map for later retrieval
    const referData = {
      callSid: callSid,
      referTo: referTo,
      referredBy: referredBy,
      uui: UUI,
      from: event.From,
      timestamp: new Date().toISOString()
    };

    console.log(`callReferHandler: Storing REFER data in Sync Map for key: REFER_${callSid}`);

    await restClient.sync.v1.services(context.PAY_SYNC_SERVICE_SID)
      .syncMaps(context.SYNC_PAY_MAP_NAME)
      .syncMapItems
      .create({
        key: `REFER_${callSid}`,
        data: referData,
        ttl: 43200  // 12 hours
      });

    console.log(`callReferHandler: REFER data stored successfully`);

    // Return <Pay> TwiML to capture credit card for tokenization
    voiceResponse.pay({
      chargeAmount: 0,  // Tokenization only, no charge
      tokenType: 'one-time',
      paymentConnector: context.PAYMENT_CONNECTOR,
      securityCode: context.INCLUDE_CVC === 'true',
      postalCode: context.INCLUDE_POSTAL_CODE === 'true',
      statusCallback: `${context.SERVER_URL}/sync/paySyncUpdate`,
      action: `${context.SERVER_URL}/pv/reconnectAfterPay`,
      timeout: 60,
      currency: 'USD'
    });

    console.log(`callReferHandler: Returning <Pay> TwiML for tokenization`);

    return callback(null, voiceResponse);

  } catch (error) {
    console.error(`callReferHandler Pay Flow Error for Call SID ${callSid}: ${error.message}`);
    console.error(`Stack trace: ${error.stack}`);

    // Fallback: return error message to caller
    voiceResponse.say('We encountered an error processing your request. Please try again.');
    voiceResponse.hangup();
    return callback(null, voiceResponse);
  }
}

/**
 * Handle Normal Transfer Flow
 * Dials the transfer target immediately (SIP or PSTN)
 */
async function handleNormalTransfer(context, event, callback, voiceResponse) {
  // Clean and normalize transfer target
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

  console.log(`callReferHandler: Processing normal transfer for Call SID ${event.CallSid} to target: ${target}`);

  // Extract UUI from headers
  const UUI = event["SipHeader_x-inin-cnv"]
           || event["SipHeader_User-to-User"]
           || event.CallSid;

  console.log(`callReferHandler: UUI for transfer: ${UUI}`);

  try {
    // Determine transfer type and validate
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
        console.error(`callReferHandler: Invalid E.164 number: ${transferDestination}`);
        voiceResponse.reject({ reason: 'busy' });
        return callback(null, voiceResponse);
      }
    }

    // Extract original caller for caller ID
    let callerIdForTransfer = event.From;
    if (callerIdForTransfer && callerIdForTransfer.startsWith('sip:')) {
      const callerMatch = callerIdForTransfer.match(/^sip:((\+)?[0-9]+)@(.*)/);
      if (callerMatch) {
        callerIdForTransfer = callerMatch[1];
      }
    }

    console.log(`callReferHandler: Type=${transferType}, Destination=${transferDestination}, CallerID=${callerIdForTransfer}`);

    // Dial the transfer target based on type
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
      console.log(`callReferHandler: Dialing PSTN ${transferDestination} with UUI ${UUI}`);

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
      console.log(`callReferHandler: Dialing SIP ${sipTarget} with UUI ${UUI}`);
    }

    return callback(null, voiceResponse);

  } catch (error) {
    console.error(`callReferHandler Normal Transfer Error for Call SID ${event.CallSid}: ${error.message}`);
    console.error(`Stack trace: ${error.stack}`);
    return callback(`Error with callReferHandler: ${error}`);
  }
}
