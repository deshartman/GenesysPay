# GenesysPay Integration

This project consists of two main components that work together to handle payment processing with Genesys and Twilio integration:

## Server

The server component is built using Twilio Serverless Functions and handles various aspects of payment processing, call management, and synchronization.

### Setup

1. Navigate to the Server directory:
```bash
cd Server
```

2. Install dependencies:
```bash
pnpm install
```

3. Install Twilio CLI globally (if not already installed):
```bash
npm install -g @twilio/cli
twilio plugins:install @twilio-labs/plugin-serverless
```

4. Create a `.env` file based on `.env copy`:
```bash
cp '.env copy' .env
```

5. Configure the following environment variables in `.env`:
```
# Required Twilio credentials
ACCOUNT_SID=your_twilio_account_sid
AUTH_TOKEN=your_twilio_auth_token

# Server configuration
SERVER_URL=your_server_url. If this is ngrok, then use the prefix style, e.g., server-SOMENAME.ngrok.io

# Payment configuration
PAYMENT_CONNECTOR=your_payment_connector
INCLUDE_CVC=true
INCLUDE_POSTAL_CODE=false

# Sync service configuration
PAY_SYNC_SERVICE_NAME name of the Sync service
PAY_SYNC_SERVICE_SID=your_sync_service_sid  # Set after running setupSyncServices

# Optional SIP configuration
# SIP_DOMAIN_URI=your_sip_domain

# One-time setup variables (only needed for initial sync service setup)
# PAY_SYNC_SERVICE_NAME=your_sync_service_name  # Used by setupSyncServices.js
```

6. Set up the Sync service (one-time setup):
```bash
# 1. Uncomment PAY_SYNC_SERVICE_NAME in .env and set a unique name
# 2. Run the setup endpoint:
curl -X POST https://<your-runtime-domain>/sync/setupSyncServices
# 3. Copy the returned service SID to PAY_SYNC_SERVICE_SID in .env
```

7. Deploy the serverless functions:
```bash
pnpm deploy
```

**Note:** The server automatically copies JSClient files to the `assets/` directory when starting or deploying. This ensures the latest client files are available through the serverless functions.

## Local Development

### Prerequisites for Local Testing

1. Install ngrok globally for creating secure tunnels:
```bash
npm install -g ngrok
```

### Running Locally

1. Start ngrok tunnel (required for Twilio callbacks):
```bash
ngrok http --domain server.ngrok.dev 3000
```
This creates a tunnel from your custom ngrok domain to localhost:3000 where pnpm start will run.

2. Update your `.env` file with your ngrok domain:
```bash
SERVER_URL=server.ngrok.dev
```

3. Start the server for local development:
```bash
pnpm start
```

### Access the Application

- JSClient files are served from the Server's assets directory
- Server functions will be available at your ngrok domain (e.g., https://server.ngrok.dev)
- The `pnpm start` command automatically copies JSClient files before starting the local server

## Notes

- Ensure all environment variables are properly configured in the Server's `.env` file
- The Server component must be deployed to Twilio for production use
- Local development of the Server component requires the Twilio CLI with serverless plugin

## Deployment

### Production Deployment

1. Ensure all environment variables are properly configured in the Server's `.env` file
2. Update SERVER_URL to your production domain (not ngrok)
3. Deploy to Twilio Serverless:
```bash
pnpm deploy
```

The deployment process will:
- Copy JSClient files to the assets directory
- Deploy all serverless functions to Twilio
- Make your application available at your Twilio Runtime domain

**Note:** If you prefer to use the Twilio CLI directly with `twilio serverless:deploy`, remember to first copy JSClient files to the assets directory:
```bash
pnpm run copy-assets
twilio serverless:deploy
```

### Environment Configuration for Production

Make sure to update these key variables for production:
- `SERVER_URL`: Your production domain (remove ngrok domain)
- `ACCOUNT_SID` and `AUTH_TOKEN`: Your production Twilio credentials
- `PAY_SYNC_SERVICE_SID`: The Sync service SID from your production setup

## JSClient

A lightweight HTML/JavaScript client for handling payment processing UI. This is a static client that doesn't require a build process.

### Setup

The JSClient files are static HTML/JavaScript files located in the `JSClient/src/` directory. No installation or build process is required - the files are automatically copied to the Server's assets directory when starting or deploying the server.

## Phone Call Flow

1. **Initiating a Call**
   - The call is initiated through either `functions/pv/callToPSTN.js` (for regular phone numbers) or `functions/pv/callToSIP.js` (for SIP endpoints)
   - Upon successful connection, Twilio generates a unique Call SID

2. **Capturing the Call SID**
   - The Call SID is returned in the response from the call initiation function
   - This SID is used to track the specific call session

3. **Using the Call SID in the JSClient**
   - Enter the Call SID in the JSClient application
   - The JSClient uses this SID to:
     - Sync with the call status through the Sync service (`functions/sync/paySyncUpdate.protected.js`)
     - Handle payment capture (`functions/aap/startCapture.js` and `functions/aap/changeCapture.js`)
     - Monitor call status changes (`functions/aap/changeStatus.js`)

4. **Payment Processing**
   - During the call, payment information is tokenized (`functions/connector/tokenize.js`)
   - The payment is processed through the charge endpoint (`functions/connector/charge.js`)
   - Real-time updates are synchronized using Twilio Sync

## Automatic Payment Capture Logic

The JSClient implements intelligent automatic progression through payment field capture, eliminating the need for manual intervention between payment steps.

### How It Works

1. **User-Defined Capture Order**
   - The system uses a configurable `userCaptureOrderArray` that defines the preferred order for capturing payment information
   - Default order: `['payment-card-number', 'security-code', 'expiration-date']`
   - This can be customized based on business requirements or user preferences

2. **Server Response Tracking**
   - The server responds with a `Required` field containing a comma-separated list of payment fields still needed
   - Example: `"payment-card-number, expiration-date, security-code"`
   - As fields are successfully captured, they are removed from this list

3. **Automatic Progression Logic**
   - The system continuously monitors the `Required` field from server responses
   - When a field is no longer in the `Required` list, it automatically progresses to the next field in the `userCaptureOrderArray`
   - This happens transparently without user intervention

4. **Content-Based Validation**
   - Instead of simply counting fields, the system validates the actual content
   - Checks if the current capture type is still present in the `Required` array
   - Only progresses when the current field is confirmed as captured by the server

### Example Flow

**Initial State:**
- Capture Order: `['payment-card-number', 'security-code', 'expiration-date']`
- Server Required: `'payment-card-number, expiration-date, security-code'`

**Step 1:** User enters card number
- Server Required becomes: `'expiration-date, security-code'`
- System detects `payment-card-number` is no longer required
- Automatically switches to `security-code` capture

**Step 2:** User enters security code
- Server Required becomes: `'expiration-date'`
- System detects `security-code` is no longer required
- Automatically switches to `expiration-date` capture

**Step 3:** User enters expiration date
- Server Required becomes: `''` (empty)
- System detects all fields captured
- Enables submit button and emits completion event

### Benefits

- **Seamless User Experience**: No manual clicking between fields
- **Flexible Ordering**: Easily customize capture sequence
- **Robust Validation**: Content-based progression prevents errors
- **Error Recovery**: Individual fields can be reset and recaptured
- **Real-time Sync**: Uses Twilio Sync for instant updates


