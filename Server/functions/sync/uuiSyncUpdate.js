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

  // Add CORS handling headers
  const twilioResponse = new Twilio.Response();

  twilioResponse.appendHeader("Access-Control-Allow-Origin", "*");
  twilioResponse.appendHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  twilioResponse.appendHeader("Content-Type", "application/json");

  const restClient = context.getTwilioClient();

  // Direction of the call
  let PSTNSideCallSid
  if (event.CallDirection === "toPSTN") {
    PSTNSideCallSid = event.CallSid;
  }

  if (event.CallDirection == "toSIP") {// toSIP
    PSTNSideCallSid = event.ParentCallSid;
  }

  console.log(`uuiSyndUpdate: Updating UUI Sync Map with UUI: ${event.UUI} and PSTN Call SID: ${PSTNSideCallSid}`);

  // TODO: Check if the UUI header is passed as part of event, so we can use it directly
  // const uui = "UUI" + Date.now; // DEMO Code to simulate UUI
  const uui = event.UUI;

  if (uui) {
    try {
      // Write the CallSid into Sync
      await restClient.sync.v1.services(context.PAY_SYNC_SERVICE_SID)
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
      twilioResponse.setBody(uui);
      return callback(null, twilioResponse);
    } catch (error) {
      twilioResponse.setStatusCode(400);
      return callback(twilioResponse.setBody(`Error creating UUI Map: ${error}`));
    }
  } else {
    twilioResponse.setStatusCode(400);
    return callback(twilioResponse.setBody('No UUI from call, so cannot establish Pay'));
  }
};
