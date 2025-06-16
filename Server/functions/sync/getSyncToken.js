/**
 * @param {string} identity - The identity of the callSid
 * 
 * Returns Sync Token used in the PayClient.
 */
// import { AccessToken } from 'twilio';
// var SyncGrant = AccessToken.SyncGrant;

exports.handler = async (context, event, callback) => {

    const AccessToken = require('twilio').jwt.AccessToken;
    const SyncGrant = AccessToken.SyncGrant;

    // Add CORS handling headers
    const twilioResponse = new Twilio.Response();

    twilioResponse.appendHeader("Access-Control-Allow-Origin", "*");
    twilioResponse.appendHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    twilioResponse.appendHeader("Content-Type", "application/json");

    // Get a reference to the Twilio REST helper library
    const twilioClient = context.getTwilioClient();

    // Create a "grant" identifying the Sync service instance for this app.
    var syncGrant = new SyncGrant({
        serviceSid: context.PAY_SYNC_SERVICE_SID,
    });

    // Create an access token which we will sign and return to the client, containing the grant we just created and specifying the identity.
    var token = new AccessToken(
        context.ACCOUNT_SID,
        context.API_KEY,
        context.API_SECRET,
        { identity: event.callSid || 'defaultIdentity' }
    );
    // Add the Token specific options
    token.addGrant(syncGrant);
    // token.identity = event.callSid;

    if (token) {
        // Serialize the token to a JWT string and include it in a JSON response
        twilioResponse.setBody(token.toJwt());
        return callback(null, twilioResponse); // JWT Token
    } else {
        twilioResponse.setStatusCode(400);
        return callback(twilioResponse.setBody(`Error with getting Sync Token`));
    }
};