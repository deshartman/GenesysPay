/**
 * Pay Completion Handler for SIP REFER-to-Pay Flow
 *
 * Triggered when Twilio Pay completes (success, failure, or cancel).
 * Retrieves payment token and REFER details, then reconnects call to
 * original SIP destination with payment token in custom x-header.
 *
 * Flow:
 * 1) Receive Pay completion event
 * 2) Retrieve REFER details from Sync Map (target, UUI, etc.)
 * 3) If payment succeeded, retrieve payment token from Pay Sync Map
 * 4) Build SIP URI with UUI header and payment token header (if available)
 * 5) Dial SIP target to complete the transfer
 * 6) Clean up REFER data from Sync Map
 *
 * Error Handling:
 * - If payment fails/cancelled: Transfer anyway without token (per requirement)
 * - If REFER data not found: Say error message and hang up
 * - If payment token unavailable: Use Payment SID as fallback
 *
 * Environment Variables:
 * - PAY_SYNC_SERVICE_SID: Twilio Sync service SID
 * - SYNC_PAY_MAP_NAME: Sync map name for payment/REFER data
 * - SERVER_URL: Server base URL for callbacks
 * - ACCOUNT_SID: Twilio Account SID
 * - AUTH_TOKEN: Twilio Auth Token
 */
exports.handler = async (context, event, callback) => {
  const restClient = require('twilio')(context.ACCOUNT_SID, context.AUTH_TOKEN);
  const voiceResponse = new Twilio.twiml.VoiceResponse();

  const callSid = event.CallSid;
  const paymentSid = event.PaymentSid;
  const result = event.Result;  // 'success', 'payment-connector-error', 'cancel'

  console.log(`reconnectAfterPay: Pay completed for Call ${callSid}, Result: ${result}, PaymentSid: ${paymentSid}`);

  try {
    // Step 1: Retrieve REFER details from Sync Map
    console.log(`reconnectAfterPay: Fetching REFER data for key: REFER_${callSid}`);

    const referItem = await restClient.sync.v1.services(context.PAY_SYNC_SERVICE_SID)
      .syncMaps(context.SYNC_PAY_MAP_NAME)
      .syncMapItems(`REFER_${callSid}`)
      .fetch();

    const referData = referItem.data;
    const referTo = referData.referTo;
    const UUI = referData.uui;

    console.log(`reconnectAfterPay: Retrieved REFER target: ${referTo}`);
    console.log(`reconnectAfterPay: Retrieved UUI: ${UUI}`);

    // Step 2: Normalize REFER target (same logic as callTransfer.js)
    let target = referTo.trim();
    if (target.startsWith('<') && target.endsWith('>')) {
      target = target.slice(1, -1);
    }
    if (target.startsWith('sip:') && !target.startsWith('sip:+')) {
      target = target.replace('sip:', 'sip:+');
    } else if (!target.startsWith('sip:') && !target.startsWith('+')) {
      target = `+${target}`;
    }

    console.log(`reconnectAfterPay: Normalized target: ${target}`);

    // Step 3: Build SIP URI with UUI (always include)
    let sipTarget;
    if (target.includes('?')) {
      sipTarget = `${target}&User-to-User=${UUI}`;
    } else {
      sipTarget = `${target}?User-to-User=${UUI}`;
    }

    // Step 4: Add payment token if payment succeeded
    if (result === 'success' && paymentSid) {
      console.log(`reconnectAfterPay: Payment succeeded, retrieving payment token`);

      // Retrieve payment data from Sync Map
      try {
        const paymentItem = await restClient.sync.v1.services(context.PAY_SYNC_SERVICE_SID)
          .syncMaps(context.SYNC_PAY_MAP_NAME)
          .syncMapItems(paymentSid)
          .fetch();

        const paymentToken = paymentItem.data.PaymentToken || paymentSid;
        sipTarget += `&X-Twilio-Payment-Token=${paymentToken}`;
        console.log(`reconnectAfterPay: Added payment token to SIP headers`);
      } catch (payErr) {
        console.warn(`reconnectAfterPay: Could not retrieve payment token: ${payErr.message}`);
        console.warn(`reconnectAfterPay: Using Payment SID as fallback token`);
        sipTarget += `&X-Twilio-Payment-Token=${paymentSid}`;
      }
    } else {
      console.log(`reconnectAfterPay: Payment ${result}, transferring without token`);
    }

    console.log(`reconnectAfterPay: Dialing SIP target: ${sipTarget}`);

    // Step 5: Dial the SIP target with headers
    voiceResponse.dial().sip(
      {
        statusCallbackEvent: 'answered',
        statusCallback: `${context.SERVER_URL}/sync/uuiSyncUpdate?CallDirection=toSIP&UUI=${UUI}`,
        statusCallbackMethod: 'POST'
      },
      sipTarget
    );

    // Step 6: Clean up REFER data from Sync Map
    try {
      await restClient.sync.v1.services(context.PAY_SYNC_SERVICE_SID)
        .syncMaps(context.SYNC_PAY_MAP_NAME)
        .syncMapItems(`REFER_${callSid}`)
        .remove();
      console.log(`reconnectAfterPay: Cleaned up REFER data from Sync Map`);
    } catch (cleanupErr) {
      console.warn(`reconnectAfterPay: Could not clean up REFER data: ${cleanupErr.message}`);
      // Non-fatal error, continue
    }

    return callback(null, voiceResponse);

  } catch (error) {
    console.error(`reconnectAfterPay Error: ${error.message}`);
    console.error(`Stack trace: ${error.stack}`);

    // Fallback: hang up gracefully
    voiceResponse.say('We encountered an error processing your payment. Please try again.');
    voiceResponse.hangup();
    return callback(null, voiceResponse);
  }
};
