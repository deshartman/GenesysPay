# GenesysPay Integration

This project consists of two main components that work together to handle payment processing with Genesys and Twilio integration. The client has been migrated to TypeScript for improved type safety and development experience.

**Version 2.2.1** - Latest updates include dedicated SYNC_SERVER_URL for multi-region deployments and local development with ngrok.

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

4. Create environment files based on `.env.example`:
```bash
# For development
cp .env.example .env.dev

# For production
cp .env.example .env.prod
```

5. Configure the following environment variables in `.env.dev` (for local development) and `.env.prod` (for production):
```
# Required Twilio credentials
ACCOUNT_SID=your_twilio_account_sid
AUTH_TOKEN=your_twilio_auth_token

# Server configuration
SERVER_URL=https://your_server_url  # For dev: use ngrok (e.g., https://server-SOMENAME.ngrok.io)

# Sync server configuration
# IMPORTANT: This must point to your deployed US1 Twilio Functions URL (not ngrok!)
# SYNC_SERVER_URL is used for all Sync statusCallback URLs and must be accessible by Twilio
# For initial setup: Leave as placeholder, deploy once, then update with your Functions URL
SYNC_SERVER_URL=https://your-deployed-functions-url.twil.io

# Payment configuration
PAYMENT_CONNECTOR=your_payment_connector
INCLUDE_CVC=true
INCLUDE_POSTAL_CODE=false

# Sync service configuration
# NOTE: Twilio Sync is only available in the us1 region. The code automatically
# configures Sync API calls to use us1, regardless of where your Functions are deployed.
# This allows deployment to au1, ie1, or other regions while still using Sync.
PAY_SYNC_SERVICE_NAME=name_of_the_sync_service
PAY_SYNC_SERVICE_SID=your_sync_service_sid  # Set after running setupSyncServices

# SIP configuration (required for call routing)
# SIP_DOMAIN_URI=your_sip_domain  # Format: customer.sip.example.com (no sip: prefix or port)
# Used by /pv/callToSIP to route inbound PSTN calls to customer's SIP Domain

# Sync map names (default values, only change if needed)
# SYNC_PAY_MAP_NAME=payMap  # Stores payment session data
# SYNC_UUI_MAP_NAME=uuiMap  # Stores UUI to CallSid mappings
```

6. **Initial Deployment to Get Functions URL** (Required for SYNC_SERVER_URL):
```bash
# Deploy the functions to get your Twilio Functions URL
pnpm run deploy

# After deployment completes, Twilio will display your Functions URL:
# Example output:
# Deployment Details
# Domain: genesyspay-3512-dev.sydney.au1.twil.io
# Service:
#   GenesysPay (ZS...)
# Environment:
#   production (ZE...)
# Build SID:
#   ZB...

# Copy the Domain URL (e.g., https://genesyspay-3512-dev.sydney.au1.twil.io)
# Update SYNC_SERVER_URL in both .env.dev and .env.prod with this URL

# Example:
# SYNC_SERVER_URL=https://genesyspay-3512-dev.sydney.au1.twil.io
```

**Why SYNC_SERVER_URL is Required:**
- Twilio Sync callbacks must reach your deployed Functions, not local dev servers
- In development: `SERVER_URL` uses ngrok for local testing, but `SYNC_SERVER_URL` points to deployed Functions
- In production: Both `SERVER_URL` and `SYNC_SERVER_URL` typically point to the same deployed Functions URL
- This separation allows local development with ngrok while maintaining Sync functionality

7. Set up the Sync service (one-time setup):
```bash
# 1. Ensure PAY_SYNC_SERVICE_NAME is set in your .env.dev file
# 2. Run the setup endpoint using your deployed Functions URL:
curl -X POST https://<your-runtime-domain>/sync/setupSyncServices
# 3. Copy the returned service SID to PAY_SYNC_SERVICE_SID in both .env.dev and .env.prod
```

8. **Redeploy with Updated Environment Variables**:
```bash
# After updating SYNC_SERVER_URL and PAY_SYNC_SERVICE_SID in your .env files:
pnpm run deploy
```

**Note:** The server automatically copies JSClient files to the `assets/` directory when starting or deploying. This ensures the latest client files are available through the serverless functions.

9. Configure Twilio Console resources:
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

2. Update your `.env.dev` file with your ngrok domain:
```bash
SERVER_URL=https://server.ngrok.dev
```

3. Start the server for local development:
```bash
pnpm start
```

**Environment Configuration**:
- Local development automatically uses `.env.dev` (configured in `.twilioserverlessrc`)
- The `.twilioserverlessrc` file maps the `dev` environment to `.env.dev`
- Use `--environment dev` flag if needed: `twilio serverless:start --environment dev`
- Keep your development credentials and ngrok URL in `.env.dev`

### Access the Application

- JSClient files are served from the Server's assets directory
- Server functions will be available at your ngrok domain (e.g., https://server.ngrok.dev)
- The `pnpm start` command automatically copies JSClient files before starting the local server

## Notes

- Ensure all environment variables are properly configured in `.env.dev` for development and `.env.prod` for production
- The project uses `.twilioserverlessrc` to automatically select the correct environment file
- The Server component must be deployed to Twilio for production use
- Local development of the Server component requires the Twilio CLI with serverless plugin
- Never commit `.env.dev` or `.env.prod` to version control - only `.env.example` should be tracked

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
- You have your SERVER_URL available (from `.env.dev` for development or `.env.prod` for production)
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

**Issue: Sync errors in non-us1 regions (au1, ie1, etc.)**
- **Symptom**: Errors like `getaddrinfo ENOTFOUND sync.sydney.au1.twilio.com`
- **Cause**: Twilio Sync is only available in the us1 region
- **Solution**: The code has been updated to automatically use us1 for Sync operations regardless of deployment region
- **Affected Files**: `uuiSyncUpdate.js`, `paySyncUpdate.protected.js`, `setupSyncServices.js`
- **No Action Required**: If you have the latest version, Sync will work correctly in any region

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

1. Ensure all environment variables are properly configured in the Server's `.env.prod` file
2. Update SERVER_URL in `.env.prod` to your production domain (not ngrok). Remember to include the https:// prefix.
3. Deploy to Twilio Serverless:
```bash
pnpm deploy
```

**Environment Configuration**:
- Production deployment automatically uses `.env.prod` (configured in `.twilioserverlessrc`)
- The `.twilioserverlessrc` file maps production (default/wildcard) to `.env.prod`
- To explicitly deploy with production environment: `twilio serverless:deploy --production`
- Keep your production credentials in `.env.prod`, never commit this file to git

The deployment process will:
- Use environment variables from `.env.prod`
- Copy JSClient files to the assets directory
- Deploy all serverless functions to Twilio
- Make your application available at your Twilio Runtime domain

**Note:** If you prefer to use the Twilio CLI directly:
```bash
pnpm run copy-assets
twilio serverless:deploy --production
```

### Environment Configuration for Production

Make sure to update these key variables in `.env.prod`:
- `SERVER_URL`: Your production domain (e.g., `https://genesyspay-prod.twil.io`)
- `ACCOUNT_SID` and `AUTH_TOKEN`: Your production Twilio credentials
- `PAY_SYNC_SERVICE_SID`: The Sync service SID from your production setup

### Environment Files

The project uses separate environment files for different stages:
- `.env.dev` - Development environment (local testing with ngrok)
- `.env.prod` - Production environment (deployed to Twilio)
- `.env.example` - Template file (safe to commit to git)

All `.env.*` files except `.env.example` are ignored by git to protect your credentials.

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

## Warm Call Transfer (SIP REFER)

This integration supports warm call transfers initiated from SIP phones using the standard SIP REFER protocol. When an agent presses the transfer button on their SIP phone, the call can be transferred to another agent or phone number while preserving UUI tracking for Genesys integration and payment session continuity.

### Overview

**Warm Transfer** allows an agent to:
1. Put the caller on hold
2. Dial and speak with the transfer target (consultation)
3. Complete the transfer, bridging the caller directly to the target
4. If the target doesn't answer, the caller is automatically reconnected to the agent

This feature uses three specialized functions that extend the base call routing functions with REFER support:

- **`callTransfer.js`** - Handles the transfer request and routes to the destination
- **`callToSIPwithRefer.js`** - Inbound PSTN → SIP handler with transfer capability
- **`callToPSTNwithRefer.js`** - Outbound SIP → PSTN handler with transfer capability

### How It Works

#### Agent Workflow

1. **During an Active Call**
   - Agent is speaking with a caller on their SIP phone (Polycom, Cisco, Yealink, etc.)
   - Agent decides to transfer the call to another agent or department

2. **Initiate Transfer**
   - Agent presses the **transfer button** on their physical SIP phone
   - Phone displays a transfer dialog/interface

3. **Enter Transfer Destination**
   - Agent enters the transfer destination:
     - **SIP Extension**: e.g., `1234` or `agent2@domain.com`
     - **PSTN Number**: e.g., `+15551234567`

4. **Warm Transfer (Optional Consultation)**
   - For warm transfer, agent can speak with transfer target first
   - Agent introduces the caller and situation
   - Agent decides to complete or cancel the transfer

5. **Complete Transfer**
   - Agent completes the transfer on their phone
   - SIP phone sends a **SIP REFER message** to Twilio
   - Twilio processes the transfer automatically

#### Behind the Scenes

1. **SIP REFER Message**
   - SIP phone sends REFER via standard SIP protocol (RFC 3515)
   - No HTTP calls or API integration needed
   - Twilio receives the REFER and extracts the transfer target

2. **Transfer Handler Invocation**
   - Twilio invokes `/pv/callTransfer` webhook
   - Receives: `ReferTransferTarget`, `CallSid`, `From`, `To`, UUI headers

3. **Destination Parsing**
   - Function parses the transfer target:
     - If target contains E.164 number → PSTN transfer
     - If target is SIP extension/user → SIP transfer

4. **UUI Preservation**
   - Extracts UUI from `x-inin-cnv` header
   - Passes UUI to transfer target for tracking
   - Ensures payment sessions follow the call

5. **Transfer Completion**
   - Original caller is bridged to transfer target
   - If target answers: transfer completes
   - If target doesn't answer: caller reconnected to agent

### Configuration

To enable warm transfers, you must configure your Twilio resources to use the REFER-enabled call handlers instead of the standard ones.

#### 1. Inbound PSTN Calls (Twilio Phone Number)

**Use Case**: When customers call in and agents may need to transfer them.

**Configuration Location**: Twilio Console → Phone Numbers → Active Numbers → (Select Number)

**Steps**:
1. Navigate to the **Voice Configuration** section
2. Under "A CALL COMES IN":
   - Set to: **Webhook**
   - URL: `https://your-runtime-domain/pv/callToSIPwithRefer`
   - Method: **POST**
3. Click **Save**

**What This Enables**:
- Inbound PSTN calls are routed to your SIP Domain
- `answerOnBridge: true` keeps caller connected during transfer
- `referUrl` enables the SIP phone to send REFER messages
- When agent transfers, call remains active and UUI is preserved

#### 2. Outbound SIP Calls (SIP Domain)

**Use Case**: When agents make outbound calls and may need to transfer them.

**Configuration Location**: Twilio Console → Phone Numbers → SIP Domains → (Select Domain)

**Steps**:
1. Navigate to the **Voice Configuration** section
2. Under "REQUEST URL":
   - URL: `https://your-runtime-domain/pv/callToPSTNwithRefer`
   - Method: **POST**
3. Click **Save**

**What This Enables**:
- Outbound calls from SIP Domain are routed to PSTN
- `answerOnBridge: true` keeps caller connected during transfer
- `referUrl` enables the SIP phone to send REFER messages
- When agent transfers, call remains active and UUI is preserved

#### 3. No Additional Configuration Needed

- **SIP Domain REFER URL**: Not required (configured in the Dial verb itself)
- **Phone Authentication**: Uses standard SIP authentication
- **Network Access**: Ensure SIP phones can reach Twilio SIP infrastructure

### Transfer Capabilities

#### Supported Transfer Types

**1. SIP to SIP Transfer**
- Agent on SIP extension transfers to another SIP extension
- Example: Extension 1001 transfers to extension 1002
- UUI passed via `User-to-User` SIP header

**2. SIP to PSTN Transfer**
- Agent on SIP phone transfers to external phone number
- Example: Agent transfers to +15551234567
- UUI tracked in Sync Map for payment continuity

**3. PSTN to SIP Transfer**
- Agent on SIP phone (with inbound PSTN caller) transfers to SIP extension
- Example: Customer called in, agent transfers to specialist
- UUI preserved through transfer

**4. PSTN to PSTN Transfer**
- Agent on SIP phone (with inbound PSTN caller) transfers to PSTN number
- Example: Customer called in, agent transfers to external number
- UUI preserved through transfer

#### Transfer Target Format

When entering transfer destination on SIP phone:

**For SIP Extensions**:
```
1234                    # Extension only
agent@domain.com        # Full SIP URI
sip:specialist@domain   # Explicit SIP URI
```

**For PSTN Numbers**:
```
15551234567             # National format (will be converted to +E.164)
+15551234567            # International E.164 format (preferred)
```

### Testing Warm Transfers

#### Prerequisites
- Active call established using `callToSIPwithRefer` or `callToPSTNwithRefer`
- SIP phone with transfer button functionality
- Transfer destination (SIP extension or PSTN number)

#### Test Case 1: SIP Extension Transfer

1. **Setup**:
   - Establish an active call on your SIP phone
   - Have a second SIP extension available to receive transfer

2. **Execute Transfer**:
   - Press transfer button on SIP phone
   - Enter destination extension (e.g., `1234`)
   - (Optional) Speak with target for warm transfer
   - Complete the transfer

3. **Verify**:
   - Check Twilio Function logs for `callTransfer` execution
   - Verify transfer destination parsed correctly as SIP
   - Confirm UUI was passed in status callback
   - Verify original caller is connected to target

#### Test Case 2: PSTN Number Transfer

1. **Setup**:
   - Establish an active call on your SIP phone
   - Have a phone number ready to receive transfer

2. **Execute Transfer**:
   - Press transfer button on SIP phone
   - Enter destination number (e.g., `+15551234567`)
   - (Optional) Speak with target for warm transfer
   - Complete the transfer

3. **Verify**:
   - Check Twilio Function logs for `callTransfer` execution
   - Verify transfer destination parsed correctly as PSTN
   - Confirm UUI was passed in status callback
   - Verify original caller is connected to target

#### Test Case 3: Transfer with Active Payment

1. **Setup**:
   - Establish call and initiate payment capture
   - Start payment session in JSClient
   - Have transfer destination ready

2. **Execute Transfer**:
   - During active payment session, transfer the call
   - Complete the transfer

3. **Verify**:
   - Payment session remains attached to correct CallSid
   - UUI mapping persists in Sync Map
   - Transferred agent can continue payment capture
   - No data loss or session interruption

### Monitoring and Logs

#### Key Log Messages

**callTransfer.js**:
```
callTransfer: Processing REFER for Call SID CAxxxx to target: sip:+15551234567@domain.com
callTransfer: UUI for transfer: CA1234567890abcdef
callTransfer: Type=pstn, Destination=+15551234567, CallerID=+14445556666
callTransfer: Dialing PSTN +15551234567 with UUI CA1234567890abcdef
```

**uuiSyncUpdate.js**:
```
uuiSyncUpdate: Updating UUI Sync Map with UUI: CA1234567890abcdef and PSTN Call SID: CAxxxx
```

#### Viewing Logs

1. **Navigate to Twilio Console**
   - Go to **Monitor** → **Logs** → **Functions**

2. **Filter for Transfer Functions**
   - Search for: `callTransfer`
   - Look for execution timestamps matching your test

3. **Check for Errors**
   - Red error entries indicate failures
   - Common issues: Invalid E.164 format, missing UUI, parse errors

### Troubleshooting

#### Issue: Transfer Button Doesn't Work

**Symptoms**: Pressing transfer on SIP phone has no effect or shows error

**Solutions**:
- Verify you're using `callToSIPwithRefer` or `callToPSTNwithRefer`, not the standard versions
- Check SIP phone supports SIP REFER (most modern phones do)
- Review SIP phone configuration for transfer settings
- Check Twilio error logs for 403 REFER rejection

**Validation**:
```bash
# Check which function is configured
# Twilio Console → Phone Numbers → (Your Number) → Voice Configuration
# Should show: /pv/callToSIPwithRefer (not /pv/callToSIP)
```

#### Issue: Transfer Fails with 403 Error

**Symptoms**: SIP phone shows transfer failed, Twilio logs show 403 error

**Cause**: Call was established without `referUrl` attribute

**Solutions**:
- Ensure using `callToSIPwithRefer` or `callToPSTNwithRefer` handlers
- Redeploy functions if recently updated
- Verify `referUrl: '/pv/callTransfer'` is in the Dial verb
- Restart calls using the updated handlers

**Twilio Support Confirmation**:
> Error: "REFER was attempted on an established <Dial> session without a referUrl attribute specified"

#### Issue: Transfer Succeeds but UUI Lost

**Symptoms**: Transfer completes but payment session can't be found

**Cause**: UUI not passed through transfer

**Solutions**:
- Verify `callTransfer.js` is extracting UUI correctly
- Check Function logs for UUI value
- Confirm `x-inin-cnv` header present in original call
- Verify Sync Map is being updated with transfer CallSid

**Debug Steps**:
1. Check `callTransfer` logs for UUI extraction
2. Verify `uuiSyncUpdate` was called with correct UUI
3. Check Sync Map contains mapping for transfer CallSid
4. Confirm transfer destination received UUI header

#### Issue: Transfer Target Invalid

**Symptoms**: Transfer fails with "busy" response or error

**Cause**: Transfer destination couldn't be parsed

**Solutions**:
- For PSTN: Ensure E.164 format (e.g., `+15551234567`)
- For SIP: Verify extension exists in your SIP Domain
- Check Function logs for parse errors
- Verify SIP phone sending valid `Refer-To` header

**Valid Formats**:
```
# PSTN
sip:+15551234567@domain.com  ✓
sip:15551234567@domain.com   ✓ (will be converted)
sip:555-1234@domain.com      ✗ (invalid characters)

# SIP
sip:1234@domain.com          ✓
sip:agent@domain.com         ✓
sip:invalid user@domain.com  ✗ (spaces not allowed)
```

#### Issue: Warm Transfer Not Working

**Symptoms**: Transfer happens immediately without consultation phase

**Cause**: May depend on SIP phone behavior

**Solutions**:
- Check SIP phone transfer settings (blind vs attended transfer)
- Some phones require specific button sequence for warm transfer
- Verify phone firmware supports attended transfer
- Consult SIP phone documentation for warm transfer procedure

**Note**: The `answerOnBridge: true` setting enables Twilio to keep the caller connected, but the consultation phase is managed by the SIP phone itself before sending the REFER.

### Migration from Standard to REFER-Enabled Handlers

If you're currently using the standard `callToSIP` and `callToPSTN` handlers:

#### Step 1: Deploy New Functions
```bash
pnpm deploy
```

This deploys:
- `callTransfer.js`
- `callToSIPwithRefer.js`
- `callToPSTNwithRefer.js`

#### Step 2: Update Phone Number Configuration

**Before**:
```
Webhook: https://your-domain/pv/callToSIP
```

**After**:
```
Webhook: https://your-domain/pv/callToSIPwithRefer
```

#### Step 3: Update SIP Domain Configuration

**Before**:
```
Request URL: https://your-domain/pv/callToPSTN
```

**After**:
```
Request URL: https://your-domain/pv/callToPSTNwithRefer
```

#### Step 4: Test New Call Flow

1. Make test call using new handlers
2. Attempt transfer from SIP phone
3. Verify transfer completes successfully
4. Check UUI preservation in Sync Map

#### Rollback Plan

If issues occur, simply revert the webhook URLs to the original handlers:
- Change back to `/pv/callToSIP`
- Change back to `/pv/callToPSTN`

The original functions remain unchanged and available.

### Security Considerations

**SIP REFER Security**:
- REFER messages authenticated via SIP credentials
- Only established call legs can send REFER
- Invalid transfer targets are rejected with error

**UUI Protection**:
- UUI transferred via SIP headers (not public HTTP)
- Sync Map access controlled by Twilio credentials
- TTL ensures stale mappings are cleaned up (12 hours)

**Transfer Restrictions**:
- Only E.164 validated numbers allowed for PSTN
- SIP transfers limited to configured domain
- Malformed requests rejected with 'busy' response

### Architecture Notes

**Why Separate Files?**

The REFER-enabled handlers (`callToSIPwithRefer` and `callToPSTNwithRefer`) are separate files to allow:
- **Safe Testing**: Test transfer functionality without affecting production
- **Gradual Migration**: Migrate specific numbers/domains incrementally
- **Easy Rollback**: Revert to standard handlers if needed
- **Clear Separation**: Standard vs transfer-enabled flows are explicit

**Why `answerOnBridge: true`?**

This setting keeps the original caller connected while dialing the transfer target:
- If target answers → transfer completes
- If target doesn't answer → caller reconnected to agent
- Provides failsafe for failed transfers

**Why Use `<Dial>` Instead of `<Refer>`?**

The `callTransfer.js` function uses `<Dial>` verb (not `<Refer>`) because:
- Works for both SIP and PSTN transfer targets
- Full Twilio control and monitoring
- Reliable status callbacks for UUI tracking
- Better error handling and logging
- Consistent with existing call routing patterns


