// Global declarations for browser-based Twilio Sync
declare global {
    interface Window {
        Twilio: {
            Sync: {
                Client: new (token: string, options?: TwilioSyncClientOptions) => TwilioSyncClient;
            };
        };
    }
}

interface TwilioSyncClientOptions {
    logLevel?: 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
}

interface TwilioSyncClient {
    map(name: string): Promise<TwilioSyncMap>;
}

interface TwilioSyncMap {
    sid: string;
    on(event: 'itemAdded' | 'itemUpdated', callback: (args: SyncMapEventArgs) => void): void;
}

interface TwilioSyncMapItem {
    key: string;
    data: any;
}

interface PaymentSyncData {
    PaymentCardNumber?: string;
    SecurityCode?: string;
    ExpirationDate?: string;
    Capture?: string;
    PartialResult?: string;
    Required?: string;
}

interface ApiResponse<T = any> {
    success: boolean;
    result: T;
}

interface StartCaptureResponse {
    sid: string;
}

interface SyncMapEventArgs {
    item: TwilioSyncMapItem;
    isLocal: boolean;
    previousItemData?: any;
}

type CaptureType = 'payment-card-number' | 'security-code' | 'expiration-date';

/**
 * PaymentClient class for handling payment capture and management.
 * This class extends EventTarget to allow for event-driven updates.
 * It provides methods to start capturing payment details, reset inputs, and submit or cancel payments.
 * It also manages the interaction with a Sync Map to store and retrieve payment data.
 * 
 * This implementation automatically progresses through the capture steps and the way the class works with which input is next is as follows:
 * There is a user preference array that allows the user to decide the order in which they want to capture payment details: userCaptureOrderArray
 * The response from the server contains a Required field which is a comma-separated list of required fields. The length and content of this array is used to step to the next step.
 * The actual step and thus call is determined by the userCaptureOrderArray
 * 
 * You can also reset a filed by calling the reset function. This simply shifts the field to the front of the userCaptureOrderArray and calls the changeCapture API, adding that step back to the Required array.
 */
class PaymentClient extends EventTarget {
    private userCaptureOrderArray: CaptureType[];
    private userCaptureOrderTemplate: CaptureType[];
    private chargeAmount: number;
    private currency: string;
    private callSid: string | null = null;
    private paymentSid: string | null = null;
    private startedCapturing: boolean = false;
    private canSubmit: boolean = false;
    private syncClient: TwilioSyncClient | null = null;
    private payMap: TwilioSyncMap | null = null;
    private maskedPayData: PaymentSyncData = {};

    // State variables
    private capture: string | null = null;
    private required: string | string[] = [];
    private partialResult: string | null = null;

    // Timeout monitoring
    private syncUpdateTimeout: NodeJS.Timeout | null = null;
    private lastSyncUpdate: number = 0;
    private SYNC_TIMEOUT_MS: number = 15000; // 15 seconds

    constructor(
        userCaptureOrderArray: CaptureType[] = ['payment-card-number', 'security-code', 'expiration-date'],
        chargeAmount: number = 0,
        currency: string = "AUD"
    ) {
        super();
        this.userCaptureOrderArray = userCaptureOrderArray;
        this.chargeAmount = chargeAmount;
        this.currency = currency;
        this.userCaptureOrderTemplate = this.userCaptureOrderArray.slice();
    }

    private async callAPI(url: string, body: Record<string, any>): Promise<ApiResponse> {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            const responseData = await response.json();

            if (responseData.error) {
                return { success: false, result: responseData.error };
            }

            return { success: true, result: responseData };
        } catch (error) {
            return { success: false, result: 'Network error occurred' };
        }
    }

    public progressCapture = async (): Promise<void> => {
        const timestamp = new Date().toISOString();

        console.log(`[${timestamp}] --- progressCapture called ---`);

        // Early return: Only proceed if capture has been started
        if (!this.startedCapturing) {
            console.log(`[${timestamp}] ⊘ Capture not started yet, skipping`);
            return;
        }

        // Early return: Wait for sync data if Required is not yet available
        if (!this.capture) {
            console.log(`[${timestamp}] ⊘ Not in capture mode yet, skipping`);
            return;
        }

        let requiredArray: string[];
        if (Array.isArray(this.required)) {
            requiredArray = this.required;
        } else if (this.required) {
            requiredArray = this.required.split(",").map((item) => item.trim());
        } else {
            requiredArray = [];
        }

        console.log(`[${timestamp}] Required fields: [${requiredArray.join(', ')}]`);
        console.log(`[${timestamp}] Capture order: [${this.userCaptureOrderArray.join(', ')}]`);

        const currentCaptureType = this.userCaptureOrderArray[0];
        console.log(`[${timestamp}] Current capture type: ${currentCaptureType}`);

        // Check if current capture type is still required
        if (requiredArray.includes(currentCaptureType)) {
            console.log(`[${timestamp}] ⟳ Still capturing ${currentCaptureType}, no change needed`);
            return;
        }

        console.log(`[${timestamp}] ✓ ${currentCaptureType} completed, progressing to next field`);

        // Early return: Complete capture if no more required fields
        if (requiredArray.length === 0) {
            console.log(`[${timestamp}] ========================================`);
            console.log(`[${timestamp}] ✓✓✓ ALL FIELDS CAPTURED SUCCESSFULLY ✓✓✓`);
            console.log(`[${timestamp}] ========================================`);
            this.canSubmit = true;
            this.dispatchEvent(new CustomEvent('captureComplete', {
                detail: { message: 'All payment fields captured successfully' }
            }));
            return;
        }

        // Progress to next capture type
        this.userCaptureOrderArray.shift();
        console.log(`[${timestamp}] Removed ${currentCaptureType} from capture order`);
        console.log(`[${timestamp}] Remaining capture order: [${this.userCaptureOrderArray.join(', ')}]`);

        // Early return: No more items to capture
        if (this.userCaptureOrderArray.length === 0) {
            console.log(`[${timestamp}] ⊘ No more items in capture order`);
            return;
        }

        const nextCaptureType = this.userCaptureOrderArray[0];
        console.log(`[${timestamp}] → Changing capture to: ${nextCaptureType}`);
        console.log(`[${timestamp}] Calling changeCapture API...`);

        const { success, result } = await this.callAPI('/aap/changeCapture', {
            callSid: this.callSid,
            paymentSid: this.paymentSid,
            captureType: nextCaptureType
        });

        if (!success) {
            console.error(`[${timestamp}] ✗ FAILED: changeCapture API call failed`);
            console.error(`[${timestamp}] Error: ${result}`);
            this.dispatchEvent(new CustomEvent('error', { detail: result }));
        } else {
            console.log(`[${timestamp}] ✓ SUCCESS: changeCapture API call succeeded`);
            console.log(`[${timestamp}] Now capturing: ${nextCaptureType}`);
            this.dispatchEvent(new CustomEvent('captureTypeChanged', {
                detail: { captureType: nextCaptureType }
            }));
        }
    };

    private startSyncTimeoutMonitor(): void {
        this.lastSyncUpdate = Date.now();

        this.syncUpdateTimeout = setInterval(() => {
            const timeSinceLastUpdate = Date.now() - this.lastSyncUpdate;

            if (timeSinceLastUpdate > this.SYNC_TIMEOUT_MS) {
                this.dispatchEvent(new CustomEvent('syncTimeout', {
                    detail: {
                        message: 'No updates received from payment session. Please verify the Call SID is for an active call.',
                        secondsSinceUpdate: Math.floor(timeSinceLastUpdate / 1000)
                    }
                }));

                // Stop monitoring after warning
                this.stopSyncTimeoutMonitor();
            }
        }, 5000); // Check every 5 seconds
    }

    private stopSyncTimeoutMonitor(): void {
        if (this.syncUpdateTimeout) {
            clearInterval(this.syncUpdateTimeout);
            this.syncUpdateTimeout = null;
        }
    }

    private async initializeSyncClient(): Promise<void> {
        const { success, result } = await this.callAPI("/sync/getSyncToken", {
            identity: this.callSid
        });

        if (!success) {
            console.error('Error: Could not create SyncClient', result);
            this.dispatchEvent(new CustomEvent('error', { detail: result }));
            return;
        }

        const jwtToken = result;
        console.log('JWT Token received:', jwtToken);

        this.dispatchEvent(new CustomEvent('syncStatusChanged', { detail: 'connecting' }));

        this.syncClient = new window.Twilio.Sync.Client(jwtToken, { logLevel: 'debug' });
        this.payMap = await this.syncClient.map('payMap');
        console.log(`Client payMap created: ${this.payMap.sid}`);

        this.dispatchEvent(new CustomEvent('syncStatusChanged', { detail: 'connected' }));

        this.payMap.on('itemUpdated', (args: SyncMapEventArgs) => {
            const timestamp = new Date().toISOString();

            console.log(`[${timestamp}] ========================================`);
            console.log(`[${timestamp}] CLIENT: SYNC UPDATE RECEIVED`);
            console.log(`[${timestamp}] ========================================`);

            this.lastSyncUpdate = Date.now(); // Reset timeout

            console.log(`[${timestamp}] Map Item Key: ${args.item.key}`);
            console.log(`[${timestamp}] Is Local Update: ${args.isLocal}`);
            console.log(`[${timestamp}] Full Item Data: ${JSON.stringify(args.item.data, null, 2)}`);

            // Store complete data object
            this.maskedPayData = args.item.data as PaymentSyncData;

            // Extract key state variables for progress logic
            this.capture = this.maskedPayData.Capture || null;
            this.partialResult = this.maskedPayData.PartialResult || null;
            this.required = this.maskedPayData.Required ? this.maskedPayData.Required.split(',').map(s => s.trim()) : [];

            console.log(`[${timestamp}] Extracted State Variables:`);
            console.log(`[${timestamp}] - Capture: ${this.capture}`);
            console.log(`[${timestamp}] - PartialResult: ${this.partialResult}`);
            console.log(`[${timestamp}] - Required: [${this.required.join(', ')}]`);

            // Log masked payment data
            if (this.maskedPayData.PaymentCardNumber) {
                console.log(`[${timestamp}] - PaymentCardNumber: ${this.maskedPayData.PaymentCardNumber}`);
            }
            if (this.maskedPayData.SecurityCode) {
                console.log(`[${timestamp}] - SecurityCode: ${this.maskedPayData.SecurityCode}`);
            }
            if (this.maskedPayData.ExpirationDate) {
                console.log(`[${timestamp}] - ExpirationDate: ${this.maskedPayData.ExpirationDate}`);
            }

            console.log(`[${timestamp}] Dispatching paymentDataUpdated event...`);
            this.dispatchEvent(new CustomEvent('paymentDataUpdated', {
                detail: this.maskedPayData
            }));

            // Check progress after data update - CRITICAL
            console.log(`[${timestamp}] Calling progressCapture to check next step...`);
            this.progressCapture();

            console.log(`[${timestamp}] ========================================`);
            console.log(`[${timestamp}] CLIENT: SYNC UPDATE PROCESSED`);
            console.log(`[${timestamp}] ========================================`);
        });
    }

    public async resetCardInput(): Promise<void> {
        console.log("====================== resetCardInput ======================");
        if (this.userCaptureOrderArray[0] === "payment-card-number") {
            console.log("resetCardInput: payment-card-number is already the first item in userCaptureOrderArray");
        } else {
            console.log("resetCardInput: payment-card-number is not the first item in userCaptureOrderArray, shifting it to the front");
            this.userCaptureOrderArray.unshift('payment-card-number');
        }

        const { success, result } = await this.callAPI('/aap/changeCapture', {
            callSid: this.callSid,
            paymentSid: this.paymentSid,
            captureType: this.userCaptureOrderArray[0]
        });

        if (!success) {
            this.dispatchEvent(new CustomEvent('error', { detail: result }));
            return;
        }
        
        this.dispatchEvent(new CustomEvent('captureTypeChanged', {
            detail: { captureType: this.userCaptureOrderArray[0] }
        }));
    }

    public async resetCvcInput(): Promise<void> {
        console.log("===================== resetCvcInput called =====================");
        if (this.userCaptureOrderArray[0] === "security-code") {
            console.log("resetCvcInput: security-code is already the first item in userCaptureOrderArray");
        } else {
            console.log("resetCvcInput: security-code is not the first item in userCaptureOrderArray, shifting it to the front");
            this.userCaptureOrderArray.unshift('security-code');
        }

        const { success, result } = await this.callAPI('/aap/changeCapture', {
            callSid: this.callSid,
            paymentSid: this.paymentSid,
            captureType: this.userCaptureOrderArray[0]
        });

        if (!success) {
            this.dispatchEvent(new CustomEvent('error', { detail: result }));
            return;
        }
        
        this.dispatchEvent(new CustomEvent('captureTypeChanged', {
            detail: { captureType: this.userCaptureOrderArray[0] }
        }));
    }

    public async resetDateInput(): Promise<void> {
        console.log("===================== resetDateInput called =====================");
        if (this.userCaptureOrderArray[0] === "expiration-date") {
            console.log("resetDateInput: expiration-date is already the first item in userCaptureOrderArray");
        } else {
            console.log("resetDateInput: expiration-date is not the first item in userCaptureOrderArray, shifting it to the front");
            this.userCaptureOrderArray.unshift('expiration-date');
        }

        const { success, result } = await this.callAPI('/aap/changeCapture', {
            callSid: this.callSid,
            paymentSid: this.paymentSid,
            captureType: this.userCaptureOrderArray[0]
        });

        if (!success) {
            this.dispatchEvent(new CustomEvent('error', { detail: result }));
            return;
        }
        
        this.dispatchEvent(new CustomEvent('captureTypeChanged', {
            detail: { captureType: this.userCaptureOrderArray[0] }
        }));
    }

    public async submit(): Promise<void> {
        const { success, result } = await this.callAPI('/aap/changeStatus', {
            callSid: this.callSid,
            paymentSid: this.paymentSid,
            status: 'complete'
        });

        if (success) {
            console.log('Payment status changed successfully:', result);
            this.dispatchEvent(new CustomEvent('paymentSubmitted', { detail: result }));
        } else {
            console.error('Error changing payment status:', result);
            this.dispatchEvent(new CustomEvent('error', { detail: result }));
        }
    }

    public async cancel(): Promise<void> {
        const { success, result } = await this.callAPI('/aap/changeStatus', {
            callSid: this.callSid,
            paymentSid: this.paymentSid,
            status: 'cancel'
        });

        if (success) {
            console.log('Payment status changed successfully:', result);
            this.dispatchEvent(new CustomEvent('paymentCancelled', { detail: result }));
        } else {
            console.error('Error changing payment status:', result);
            this.dispatchEvent(new CustomEvent('error', { detail: result }));
        }
    }

    public async startCapture(inputCallSid: string): Promise<void> {
        const timestamp = new Date().toISOString();

        console.log(`[${timestamp}] ========================================`);
        console.log(`[${timestamp}] CLIENT: START CAPTURE INITIATED`);
        console.log(`[${timestamp}] ========================================`);

        this.callSid = inputCallSid;
        console.log(`[${timestamp}] CallSid: ${this.callSid}`);
        console.log(`[${timestamp}] Charge Amount: ${this.chargeAmount}`);
        console.log(`[${timestamp}] Currency: ${this.currency}`);

        // Reset capture order from template
        this.userCaptureOrderArray = this.userCaptureOrderTemplate.slice();
        console.log(`[${timestamp}] Capture order: ${this.userCaptureOrderArray.join(' → ')}`);

        console.log(`[${timestamp}] Calling startCapture API...`);
        const { success, result } = await this.callAPI('/aap/startCapture', {
            callSid: this.callSid,
            chargeAmount: this.chargeAmount,
            currency: this.currency
        });

        if (!success) {
            console.error(`[${timestamp}] ✗ FAILED: startCapture API call failed`);
            console.error(`[${timestamp}] Error: ${JSON.stringify(result)}`);

            // Parse and enhance error message
            let errorMessage = typeof result === 'string' ? result : 'Failed to start payment capture';

            if (errorMessage.includes('Invalid Call SID')) {
                errorMessage += '\n\nTip: Make sure you copied the complete Call SID (34 characters starting with "CA") and the call is still active.';
            }

            this.dispatchEvent(new CustomEvent('error', { detail: errorMessage }));
            return;
        }

        console.log(`[${timestamp}] ✓ SUCCESS: startCapture API call succeeded`);
        console.log(`[${timestamp}] Response: ${JSON.stringify(result, null, 2)}`);

        this.paymentSid = (result as StartCaptureResponse).sid;
        console.log(`[${timestamp}] PaymentSid: ${this.paymentSid}`);

        this.dispatchEvent(new CustomEvent('captureStarted', {
            detail: {
                callSid: this.callSid,
                paymentSid: this.paymentSid
            }
        }));

        console.log(`[${timestamp}] Initializing Sync client...`);
        await this.initializeSyncClient();
        this.startedCapturing = true;
        console.log(`[${timestamp}] ✓ Sync client initialized, ready for updates`);

        // Automatically start the first capture step
        const firstCaptureType = this.userCaptureOrderArray[0];
        console.log(`[${timestamp}] Starting first capture step: ${firstCaptureType}`);
        console.log(`[${timestamp}] Calling changeCapture API...`);

        const { success: captureSuccess, result: captureResult } = await this.callAPI('/aap/changeCapture', {
            callSid: this.callSid,
            paymentSid: this.paymentSid,
            captureType: firstCaptureType
        });

        if (!captureSuccess) {
            console.error(`[${timestamp}] ✗ FAILED: Initial changeCapture API call failed`);
            console.error(`[${timestamp}] Error: ${captureResult}`);
            this.dispatchEvent(new CustomEvent('error', { detail: captureResult }));
        } else {
            console.log(`[${timestamp}] ✓ SUCCESS: Initial changeCapture API call succeeded`);
            console.log(`[${timestamp}] Now capturing: ${firstCaptureType}`);
            console.log(`[${timestamp}] Waiting for Sync updates from server...`);
            this.dispatchEvent(new CustomEvent('captureTypeChanged', {
                detail: { captureType: firstCaptureType }
            }));
        }

        // Start monitoring for sync updates
        console.log(`[${timestamp}] Starting Sync timeout monitor (${this.SYNC_TIMEOUT_MS}ms)`);
        this.startSyncTimeoutMonitor();

        console.log(`[${timestamp}] ========================================`);
        console.log(`[${timestamp}] CLIENT: START CAPTURE COMPLETE`);
        console.log(`[${timestamp}] ========================================`);
    }
}

// Create global instance
const paymentClient = new PaymentClient();
(window as any).paymentClient = paymentClient;

// Export for module usage
export { PaymentClient };