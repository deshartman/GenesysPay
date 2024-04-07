/**
 * This is the StatusCallback where the toPSTN call handler POSTs to.
 * 
 * Now update the UUI Sync Map with UUI value we received from the SIP Domain and the CallSID
 * 
 * Process:
 * ??? 1) Extract UUI value from SIP Domain call leg (parent Call SID) ????
 * 1) Use the event.UUI value passed in
 * 2) Write into UUI sync Map
 * 3) Create new mapItem with inbound call Sid as key and UUI.
 * 4) return the UUI
 * 
 */
exports.handler = async (context, event, callback) => {

  console.info(`uuiSyncUpdate: Dialing ${event.To} with Caller ID ${event.From} for Call SID: ${event.CallSid} with UUI ${event.UUI}`);

  const restClient = context.getTwilioClient();

  // console.log("uuiSyncUpdate: event: ", event);

  // Direction of the call
  let PSTNSideCallSid
  if (event.CallDirection === "toPSTN") {
    PSTNSideCallSid = event.CallSid;
    console.log(`uuiSyncUpdate: toPSTN with PSTNSideCallSid: ${PSTNSideCallSid}`);
  }

  if (event.CallDirection == "toSIP") {// toSIP
    PSTNSideCallSid = event.ParentCallSid;
    console.log(`uuiSyncUpdate: toSIP with PSTNSideCallSid: ${PSTNSideCallSid}`);
  }

  // console.log(`uuiSyncUpdate: This call SID: ${event.CallSid} and ParentCall Sid: ${event.parentCallSid}`);

  // console.info(`OutboundSyncUpdate Event Details: ${JSON.stringify(event, null, 4)}`);
  // TODO: Check if the UUI header is passed as part of event, so we can use it directly
  // const uui = "UUI" + Date.now; // DEMO Code to simulate UUI
  const uui = event.UUI;

  if (uui) {
    try {
      // Write the CallSid into Sync
      await restClient.sync.services(context.PAY_SYNC_SERVICE_SID)
        .syncMaps(context.SYNC_UUI_MAP_NAME)
        .syncMapItems
        .create({
          key: uui,
          data: {
            "uui": uui,
            "pstnSid": PSTNSideCallSid
          },
          ttl: 43200  // Keep the UUI item for 12 hours
        });
      return callback(null, uui);
    } catch (error) {
      return callback(`Error creating UUI Map: ${error}`, null);
    }
  } else {
    return callback('No UUI from call, so cannot establish Pay', null);
  }
};
