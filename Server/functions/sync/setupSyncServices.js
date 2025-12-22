/**
 * This function sets up the Sync services needed for the code. It is a one-time setup that checks for existing
 * Sync Service and Maps, creating them only if they don't exist (idempotent).
 *
 * Call this function directly in your browser:
 * ```
 * https://<runtime-domain>/sync/setupSyncServices
 * ```
 *
 * Or using curl:
 * ```
 * curl https://<runtime-domain>/sync/setupSyncServices
 * ```
 *
 */
exports.handler = async (context, event, callback) => {

  // Add CORS handling headers
  const twilioResponse = new Twilio.Response();

  twilioResponse.appendHeader("Access-Control-Allow-Origin", "*");
  twilioResponse.appendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  // Create a Twilio client for Sync operations
  // Sync automatically uses sync.twilio.com regardless of Functions deployment region
  const restClient = require('twilio')(context.ACCOUNT_SID, context.AUTH_TOKEN);

  const results = {
    syncService: null,
    payMap: null,
    uuiMap: null
  };

  try {
    // Check if Sync Service already exists by listing all services
    const services = await restClient.sync.v1.services.list();
    const existingService = services.find(s => s.friendlyName === context.PAY_SYNC_SERVICE_NAME);

    let syncService;
    if (existingService) {
      syncService = existingService;
      context.PAY_SYNC_SERVICE_SID = existingService.sid;
      console.info(`Sync Service ${context.PAY_SYNC_SERVICE_NAME} already exists with SID: ${context.PAY_SYNC_SERVICE_SID}`);
      results.syncService = 'exists';
    } else {
      // Create new Sync Service
      syncService = await restClient.sync.services.create({ friendlyName: context.PAY_SYNC_SERVICE_NAME });
      context.PAY_SYNC_SERVICE_SID = syncService.sid;
      console.info(`Sync Service ${context.PAY_SYNC_SERVICE_NAME} created with SID: ${context.PAY_SYNC_SERVICE_SID}`);
      results.syncService = 'created';
    }

    // Check and create the Payment Sync Map
    try {
      // Try to fetch the map to see if it exists
      await restClient.sync.v1.services(context.PAY_SYNC_SERVICE_SID)
        .syncMaps(context.SYNC_PAY_MAP_NAME)
        .fetch();
      console.info(`Sync Map ${context.SYNC_PAY_MAP_NAME} already exists`);
      results.payMap = 'exists';
    } catch (error) {
      // If map doesn't exist (404), create it
      if (error.status === 404) {
        try {
          await restClient.sync.v1.services(context.PAY_SYNC_SERVICE_SID)
            .syncMaps
            .create({ uniqueName: context.SYNC_PAY_MAP_NAME });
          console.info(`Sync Map ${context.SYNC_PAY_MAP_NAME} created`);
          results.payMap = 'created';
        } catch (createError) {
          console.error(`Error creating ${context.SYNC_PAY_MAP_NAME}: ${createError}`);
          twilioResponse.setStatusCode(400);
          return callback(twilioResponse.setBody(`Error creating ${context.SYNC_PAY_MAP_NAME}: ${createError}`));
        }
      } else {
        console.error(`Error checking ${context.SYNC_PAY_MAP_NAME}: ${error}`);
        twilioResponse.setStatusCode(400);
        return callback(twilioResponse.setBody(`Error checking ${context.SYNC_PAY_MAP_NAME}: ${error}`));
      }
    }

    // Check and create the UUI Sync Map
    try {
      // Try to fetch the map to see if it exists
      await restClient.sync.v1.services(context.PAY_SYNC_SERVICE_SID)
        .syncMaps(context.SYNC_UUI_MAP_NAME)
        .fetch();
      console.info(`Sync Map ${context.SYNC_UUI_MAP_NAME} already exists`);
      results.uuiMap = 'exists';
    } catch (error) {
      // If map doesn't exist (404), create it
      if (error.status === 404) {
        try {
          await restClient.sync.v1.services(context.PAY_SYNC_SERVICE_SID)
            .syncMaps
            .create({ uniqueName: context.SYNC_UUI_MAP_NAME });
          console.info(`Sync Map ${context.SYNC_UUI_MAP_NAME} created`);
          results.uuiMap = 'created';
        } catch (createError) {
          console.error(`Error creating ${context.SYNC_UUI_MAP_NAME}: ${createError}`);
          twilioResponse.setStatusCode(400);
          return callback(twilioResponse.setBody(`Error creating ${context.SYNC_UUI_MAP_NAME}: ${createError}`));
        }
      } else {
        console.error(`Error checking ${context.SYNC_UUI_MAP_NAME}: ${error}`);
        twilioResponse.setStatusCode(400);
        return callback(twilioResponse.setBody(`Error checking ${context.SYNC_UUI_MAP_NAME}: ${error}`));
      }
    }

    // Build HTML response for browser display
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Sync Services Setup</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        h1 { color: #0d122b; }
        .status { background: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin: 20px 0; border-radius: 4px; }
        .section { background: #f5f5f5; padding: 15px; margin: 15px 0; border-radius: 4px; }
        .label { font-weight: bold; color: #555; }
        .value { font-family: monospace; background: white; padding: 8px; margin: 5px 0; border-radius: 3px; display: inline-block; }
        .sid { font-family: monospace; background: #fff3cd; padding: 8px; margin: 5px 0; border-radius: 3px; display: block; font-size: 14px; cursor: pointer; }
        .sid:hover { background: #ffe69c; }
        .action { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; margin-left: 10px; }
        .exists { background: #e3f2fd; color: #1976d2; }
        .created { background: #e8f5e9; color: #388e3c; }
    </style>
</head>
<body>
    <h1>✓ Sync Services Setup Complete</h1>

    <div class="section">
        <div class="label">Sync Service: ${context.PAY_SYNC_SERVICE_NAME}</div>
        <div class="sid" onclick="navigator.clipboard.writeText('${context.PAY_SYNC_SERVICE_SID}'); alert('SID copied to clipboard!')" title="Click to copy">
            ${context.PAY_SYNC_SERVICE_SID}
        </div>
        <span class="action ${results.syncService}">${results.syncService}</span>
    </div>

    <div class="section">
        <div class="label">Payment Sync Map: ${context.SYNC_PAY_MAP_NAME}</div>
        <span class="action ${results.payMap}">${results.payMap}</span>
    </div>

    <div class="section">
        <div class="label">UUI Sync Map: ${context.SYNC_UUI_MAP_NAME}</div>
        <span class="action ${results.uuiMap}">${results.uuiMap}</span>
    </div>
</body>
</html>`;

    twilioResponse.appendHeader("Content-Type", "text/html");
    twilioResponse.setBody(html);
    return callback(null, twilioResponse);
  } catch (error) {
    console.error(`Error setting up Sync Service: ${error}`);
    twilioResponse.setStatusCode(400);
    return callback(twilioResponse.setBody(`Error setting up Sync Service ${context.PAY_SYNC_SERVICE_NAME}: ${error}`));
  }
};
