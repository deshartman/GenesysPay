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

3. Create a `.env` file based on `.env copy`:
```bash
cp '.env copy' .env
```

4. Configure the following environment variables in `.env`:
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

5. Set up the Sync service (one-time setup):
```bash
# 1. Uncomment PAY_SYNC_SERVICE_NAME in .env and set a unique name
# 2. Run the setup endpoint:
curl -X POST https://<your-runtime-domain>/sync/setupSyncServices
# 3. Copy the returned service SID to PAY_SYNC_SERVICE_SID in .env
```

6. Deploy the serverless functions:
```bash
pnpm deploy
```

## JSClient

A lightweight HTML/JavaScript client for handling payment processing UI.

### Setup

1. Navigate to the JSClient directory:
```bash
cd JSClient
```

2. Install dependencies:
```bash
pnpm install
```

3. Start the development server:
```bash
pnpm dev
```

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

## Development Workflow

1. Start both components:
```bash
# Terminal 1 - Server
cd Server && twilio serverless:start

# Terminal 2 - JSClient
cd JSClient && pnpm dev
```

2. Access the application:
- JSClient: http://localhost:1234 (or the port shown in terminal)
- Server functions will be available at your Twilio Runtime domain

## Notes

- Ensure all environment variables are properly configured in the Server's `.env` file
- The Server component must be deployed to Twilio for production use
- Local development of the Server component requires the Twilio CLI with serverless plugin
