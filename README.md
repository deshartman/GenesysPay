# GenesysPay Integration

This project consists of two main components that work together to handle payment processing with Genesys and Twilio integration. The client has been migrated to TypeScript for improved type safety and development experience.

**Version 2.1.0** - Latest updates include deployment script fixes and enhanced visual feedback during payment capture.

**Latest Changes:** See [CHANGELOG.md](CHANGELOG.md) for version history and migration notes.

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
SERVER_URL=htpps://your_server_url. If this is ngrok, then use the prefix style, e.g., https://server-SOMENAME.ngrok.io

# Payment configuration
PAYMENT_CONNECTOR=your_payment_connector
INCLUDE_CVC=true
INCLUDE_POSTAL_CODE=false

# Sync service configuration
PAY_SYNC_SERVICE_NAME name of the Sync service
PAY_SYNC_SERVICE_SID=your_sync_service_sid  # Set after running setupSyncServices

# SIP configuration (required for call routing)
# SIP_DOMAIN_URI=your_sip_domain  # Format: customer.sip.example.com (no sip: prefix or port)
# Used by /pv/callToSIP to route inbound PSTN calls to customer's SIP Domain

# One-time setup variables (only needed for initial sync service setup)
# PAY_SYNC_SERVICE_NAME=your_sync_service_name  # Used by setupSyncServices.js

# Sync map names (default values, only change if needed)
# SYNC_PAY_MAP_NAME=payMap  # Stores payment session data
# SYNC_UUI_MAP_NAME=uuiMap  # Stores UUI to CallSid mappings
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
pnpm run deploy
```

**Note:** The server automatically copies JSClient files to the `assets/` directory when starting or deploying. This ensures the latest client files are available through the serverless functions.

8. Configure Twilio Console resources:
   - Set up phone number webhooks for inbound calls
   - Configure SIP Domain for outbound calls
   - See the [Twilio Console Configuration](#twilio-console-configuration) section below for detailed steps

**Important:** For local development, configure webhooks with your ngrok URL. For production, use your Twilio Runtime domain.

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
SERVER_URL=https://server.ngrok.dev
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

## Twilio Console Configuration

After deploying your serverless functions (either locally via ngrok or to production), you need to configure Twilio Console resources to route calls through your application.

### Overview

This integration requires two types of call routing:

1. **Inbound PSTN to SIP** - Routes incoming phone calls to a customer's SIP Domain
2. **Outbound SIP to PSTN** - Routes calls from a customer's SIP Domain to phone numbers

Both routing types use User-to-User Information (UUI) headers to track calls and enable payment capture.

### Prerequisites

Before configuring the Twilio Console, ensure:
- Your serverless functions are deployed and accessible
- You have your SERVER_URL available (from your .env file)
- You have a Twilio phone number (for inbound calls)
- You have configured your SIP_DOMAIN_URI (for SIP routing)

### 1. Phone Number Configuration (Inbound PSTN to SIP)

#### Purpose
Configure a Twilio phone number to route inbound PSTN calls to your customer's SIP Domain using the `/pv/callToSIP` function.

#### Configuration Steps

1. **Navigate to Phone Numbers**
   - Log into Twilio Console at https://console.twilio.com
   - In the left sidebar, expand "Phone Numbers"
   - Click "Manage" → "Active numbers"
   - Select the phone number you want to configure

2. **Configure Voice Webhook**
   - Scroll to the "Voice Configuration" section
   - Under "A CALL COMES IN":
     - Set dropdown to "Webhook"
     - Enter URL: `https://your-runtime-domain/pv/callToSIP`
       - For local development: `https://your-ngrok-domain/pv/callToSIP`
       - For production: `https://your-twilio-runtime-domain/pv/callToSIP`
     - Set HTTP method to "POST"

3. **Save Configuration**
   - Click "Save" at the bottom of the page

#### What Happens
- When someone calls this phone number, Twilio invokes `/pv/callToSIP`
- The function extracts the inbound CallSid
- It dials the customer's SIP Domain with the CallSid as the User-to-User identifier
- When the SIP leg answers, a status callback is triggered to `/sync/uuiSyncUpdate`
- The UUI mapping (CallSid → PSTN CallSid) is stored in Sync for payment attachment

#### Environment Variables Used
- `SIP_DOMAIN_URI` - The customer's SIP domain (e.g., `customer.sip.example.com`)

### 2. SIP Domain Configuration (Outbound SIP to PSTN)

#### Purpose
Configure a SIP Domain to route outbound calls from your customer's SIP infrastructure to PSTN phone numbers using the `/pv/callToPSTN` function.

#### Configuration Steps

1. **Navigate to SIP Domains**
   - Log into Twilio Console at https://console.twilio.com
   - In the left sidebar, expand "Phone Numbers"
   - Click "Manage" → "SIP Domains"

2. **Create or Select SIP Domain**
   - Click "+ Add New Domain" if creating new, or select existing domain
   - If creating new:
     - Enter a unique domain name (e.g., `genesyspay-production.sip.twilio.com`)
     - Click "Create"

3. **Configure Voice Settings**
   - Scroll to "Voice Configuration" section
   - Under "REQUEST URL":
     - Enter URL: `https://your-runtime-domain/pv/callToPSTN`
       - For local development: `https://your-ngrok-domain/pv/callToPSTN`
       - For production: `https://your-twilio-runtime-domain/pv/callToPSTN`
     - Set HTTP method to "POST"

4. **Configure SIP Registration** (if needed)
   - Under "SIP Registration", enable if your customer's system requires registration
   - Configure credentials and IP ACL as needed for your security requirements

5. **Save Configuration**
   - Click "Save" at the bottom of the page

#### What Happens
- When a call comes from the customer's SIP Domain to this Twilio SIP Domain
- Twilio invokes `/pv/callToPSTN`
- The function extracts the E.164 destination number from the SIP URI
- It extracts the UUI from the custom `x-inin-cnv` header
- The call is routed to the PSTN destination
- When the PSTN leg answers, a status callback is triggered to `/sync/uuiSyncUpdate`
- The UUI mapping (UUI → PSTN CallSid) is stored in Sync for payment attachment

#### Environment Variables Used
- None directly, but the function parses E.164 numbers from SIP URIs

#### Required SIP Headers
- `x-inin-cnv` - Custom header containing the UUI identifier from Genesys

### 3. Status Callback Flow

Both `callToSIP` and `callToPSTN` use the same status callback endpoint to track call connections.

#### Endpoint
`/sync/uuiSyncUpdate`

#### Purpose
Maps User-to-User Information (UUI) identifiers to PSTN CallSids, enabling payment capture attachment.

#### How It Works
1. When a call leg is answered, Twilio posts to this endpoint
2. For `toPSTN` calls:
   - Receives UUI from query parameter (extracted from `x-inin-cnv` header)
   - Receives CallSid from the event
   - PSTN CallSid = event.CallSid
3. For `toSIP` calls:
   - Receives UUI from query parameter (the parent CallSid)
   - PSTN CallSid = event.ParentCallSid
4. Creates a Sync Map item in `uuiMap`:
   - Key: UUI value
   - Data: `{ uui: <value>, pstnSid: <CallSid> }`
   - TTL: 12 hours

#### Sync Map Structure
The `uuiMap` stores the mapping:
```json
{
  "key": "CA1234567890abcdef1234567890abcdef",
  "data": {
    "uui": "CA1234567890abcdef1234567890abcdef",
    "pstnSid": "CA9876543210fedcba9876543210fedcba"
  }
}
```

### 4. Verification Steps

After configuration, verify your setup:

1. **Test Inbound PSTN to SIP**
   - Call your configured Twilio phone number
   - Verify the call routes to your customer's SIP Domain
   - Check Function logs in Twilio Console:
     - Navigate to "Monitor" → "Logs" → "Functions"
     - Look for `callToSIP` executions
     - Verify `uuiSyncUpdate` was called

2. **Test Outbound SIP to PSTN**
   - Initiate a call from your customer's SIP infrastructure
   - Verify the call routes to the PSTN destination
   - Check Function logs in Twilio Console:
     - Look for `callToPSTN` executions
     - Verify `uuiSyncUpdate` was called

3. **Verify Sync Map Data**
   - Navigate to "Sync" in Twilio Console
   - Open your configured Sync Service (PAY_SYNC_SERVICE_SID)
   - Open the `uuiMap` Sync Map
   - Verify entries are created with UUI and pstnSid

4. **Test Payment Capture**
   - With an active call, use the JSClient
   - Enter the CallSid (from UUI lookup if needed)
   - Verify payment capture works through the call flow

### 5. Troubleshooting

**Issue: Calls not routing**
- Verify webhook URLs are correct and accessible
- Check that SERVER_URL matches your actual deployment URL
- Verify SIP_DOMAIN_URI is configured in .env
- Review Function logs for error messages

**Issue: UUI not mapping**
- Verify status callbacks are reaching `/sync/uuiSyncUpdate`
- Check PAY_SYNC_SERVICE_SID is configured correctly
- Verify `uuiMap` exists in your Sync Service
- Check Function logs for `uuiSyncUpdate` errors

**Issue: Payment capture fails**
- Verify the CallSid matches the PSTN leg (check uuiMap)
- Ensure call is still active when starting payment capture
- Check that `payMap` exists in your Sync Service
- Verify PAYMENT_CONNECTOR is configured correctly

**Issue: x-inin-cnv header not found**
- Verify Genesys is sending the custom header
- Check SIP logs to confirm header presence
- The function will fallback to `Date.now()` if header is missing

### 6. Security Considerations

**Webhook URLs**
- All webhook URLs are public endpoints
- Functions validate call states before processing
- Consider implementing additional authentication if needed

**SIP Domain Access**
- Configure IP Access Control Lists (ACLs) to restrict access
- Use SIP registration with credentials for additional security
- Monitor logs for unauthorized access attempts

**Environment Variables**
- Never commit AUTH_TOKEN to version control
- Rotate credentials regularly
- Use separate Twilio accounts for development and production

## Deployment

### Production Deployment

1. Ensure all environment variables are properly configured in the Server's `.env` file
2. Update SERVER_URL to your production domain (not ngrok). Remember to remove/comment out the ngrok domain and include the https:// prefix.
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
- `SERVER_URL`: Your production domain (e.g., `https://yourdomain.com`)
- `ACCOUNT_SID` and `AUTH_TOKEN`: Your production Twilio credentials
- `PAY_SYNC_SERVICE_SID`: The Sync service SID from your production setup

## JSClient

A lightweight HTML/TypeScript client for handling payment processing UI, providing type safety and improved development experience.

### Setup

The JSClient is implemented in TypeScript and located in the `JSClient/src/` directory. The TypeScript files are automatically compiled to JavaScript and copied to the Server's assets directory during server startup or deployment.

#### TypeScript Implementation

- **Type Safety**: Full TypeScript implementation with strict type checking
- **Twilio Integration**: Uses existing Twilio Sync type definitions without custom interfaces
- **Modern JavaScript**: Compiled to ES2022 with module support
- **Event-Driven**: PaymentClient extends EventTarget for clean event handling

## Phone Call Flow

**Note:** This section describes the high-level call flow. For detailed Twilio Console configuration required to enable this flow, see the [Twilio Console Configuration](#twilio-console-configuration) section.

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

### Call Routing Functions

The phone call flow is enabled by two routing functions:

- **`/pv/callToSIP`** - Routes inbound PSTN calls to customer's SIP Domain
  - Configured as webhook on Twilio phone numbers
  - Passes CallSid as User-to-User identifier
  - See [Phone Number Configuration](#1-phone-number-configuration-inbound-pstn-to-sip)

- **`/pv/callToPSTN`** - Routes outbound SIP Domain calls to PSTN
  - Configured as request URL on SIP Domains
  - Extracts UUI from `x-inin-cnv` header
  - See [SIP Domain Configuration](#2-sip-domain-configuration-outbound-sip-to-pstn)

Both functions trigger `/sync/uuiSyncUpdate` status callbacks to enable payment attachment via UUI mapping.

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


