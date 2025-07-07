// Global declarations for browser-based Twilio Sync
declare global {
    interface Window {
        Twilio: {
            Sync: {
                Client: new (token: string) => TwilioSyncClient;
            };
        };
    }
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
        // Early return: Only proceed if capture has been started
        if (!this.startedCapturing) {
            console.log("capture not started yet, skipping");
            return;
        }

        // Early return: Wait for sync data if Required is not yet available
        if (!this.capture) {
            console.log("not in capture mode, skipping");
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

        console.log("requiredArray: ", requiredArray);
        console.log("userCaptureOrderArray: ", this.userCaptureOrderArray);

        const currentCaptureType = this.userCaptureOrderArray[0];
        console.log("currentCaptureType: ", currentCaptureType);

        // Check if current capture type is still required
        if (requiredArray.includes(currentCaptureType)) {
            console.log(`continuing to capture ${currentCaptureType}`);
            return;
        }

        console.log(`${currentCaptureType} no longer required, progressing`);

        // Early return: Complete capture if no more required fields
        if (requiredArray.length === 0) {
            console.log("all fields captured, stopping capture");
            this.canSubmit = true;
            this.dispatchEvent(new CustomEvent('captureComplete', {
                detail: { message: 'All payment fields captured successfully' }
            }));
            return;
        }

        // Progress to next capture type
        this.userCaptureOrderArray.shift();
        console.log("userCaptureOrderArray after shift: ", this.userCaptureOrderArray);

        // Early return: No more items to capture
        if (this.userCaptureOrderArray.length === 0) {
            console.log("no more items in capture order");
            return;
        }

        console.log(`Calling API to change capture to: ${this.userCaptureOrderArray[0]}`);
        const { success, result } = await this.callAPI('/aap/changeCapture', {
            callSid: this.callSid,
            paymentSid: this.paymentSid,
            captureType: this.userCaptureOrderArray[0]
        });

        if (!success) {
            console.log("API call failed:", result);
            this.dispatchEvent(new CustomEvent('error', { detail: result }));
        } else {
            console.log("API call successful, waiting for sync update...");
        }
    };

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

        this.syncClient = new window.Twilio.Sync.Client(jwtToken);
        this.payMap = await this.syncClient.map('payMap');
        console.log(`Client payMap created: ${this.payMap.sid}`);

        this.payMap.on('itemUpdated', (args: SyncMapEventArgs) => {
            console.log("Item updated in payMap:", args.item.key);
            console.log("Updated item data:", args.item.data);

            // Store complete data object
            this.maskedPayData = args.item.data as PaymentSyncData;

            // Extract key state variables for progress logic
            this.capture = this.maskedPayData.Capture || null;
            this.partialResult = this.maskedPayData.PartialResult || null;
            this.required = this.maskedPayData.Required ? this.maskedPayData.Required.split(',').map(s => s.trim()) : [];

            console.log("Required: ", this.required);
            console.log("PartialResult: ", this.partialResult);
            console.log("Capture: ", this.capture);

            this.dispatchEvent(new CustomEvent('paymentDataUpdated', {
                detail: this.maskedPayData
            }));

            // Check progress after data update - CRITICAL
            console.log("Calling progressCapture after sync update");
            this.progressCapture();
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
        this.callSid = inputCallSid;
        console.log('CallSid value set to:', this.callSid);

        // Reset capture order from template
        this.userCaptureOrderArray = this.userCaptureOrderTemplate.slice();
        console.log('Reset capture order to:', this.userCaptureOrderArray);

        const { success, result } = await this.callAPI('/aap/startCapture', {
            callSid: this.callSid,
            chargeAmount: this.chargeAmount,
            currency: this.currency
        });

        if (!success) {
            this.dispatchEvent(new CustomEvent('error', { detail: result }));
            return;
        }

        console.log('responseData:', result);
        this.paymentSid = (result as StartCaptureResponse).sid;
        console.log('paymentSid set to:', this.paymentSid);
        console.log('Payment started, paymentSid:', this.paymentSid);

        this.dispatchEvent(new CustomEvent('captureStarted', {
            detail: {
                callSid: this.callSid,
                paymentSid: this.paymentSid
            }
        }));

        await this.initializeSyncClient();
        this.startedCapturing = true;
        console.log('Capture started, waiting for sync updates...');

        // Automatically start the first capture step
        console.log('Starting first capture step:', this.userCaptureOrderArray[0]);
        const { success: captureSuccess, result: captureResult } = await this.callAPI('/aap/changeCapture', {
            callSid: this.callSid,
            paymentSid: this.paymentSid,
            captureType: this.userCaptureOrderArray[0]
        });

        if (!captureSuccess) {
            console.log('Initial capture API call failed:', captureResult);
            this.dispatchEvent(new CustomEvent('error', { detail: captureResult }));
        } else {
            console.log('Initial capture API call successful, waiting for sync update...');
        }
    }
}

// Create global instance
const paymentClient = new PaymentClient();
(window as any).paymentClient = paymentClient;

// Export for module usage
export { PaymentClient };