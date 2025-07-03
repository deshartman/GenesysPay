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
    constructor() {
        super();
        this.userCaptureOrderArray = ['payment-card-number', 'security-code', 'expiration-date'];
        this.chargeAmount = 0;
        this.currency = "AUD";

        this.callSid = null;
        this.paymentSid = null;
        this.startedCapturing = false;
        this.canSubmit = false;
        this.syncClient = null;
        this.payMap = null;
        this.maskedPayData = {};
    }

    async callAPI(url, body) {
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

    progressCapture = async () => {
        console.log("progressCapture maskedPayData: ", JSON.stringify(this.maskedPayData, null, 4));

        // Early return: Only proceed if capture has been started
        if (!this.startedCapturing) {
            console.log("progressCapture: capture not started yet, skipping");
            return;
        }

        // Early return: Complete capture if no required fields
        if (!this.maskedPayData.Required) {
            console.log("progressCapture maskedPayData.Required is not present");
            console.log("progressCapture: all fields captured, stopping capture");
            this.canSubmit = true;
            this.dispatchEvent(new CustomEvent('captureComplete', { 
                detail: { message: 'All payment fields captured successfully' }
            }));
            return;
        }

        const requiredArray = this.maskedPayData.Required.split(",").map((item) => item.trim());
        console.log("progressCapture requiredArray: ", requiredArray);
        console.log("progressCapture userCaptureOrderArray: ", this.userCaptureOrderArray);

        const currentCaptureType = this.userCaptureOrderArray[0];
        
        // Early return: Continue current capture if still required
        if (!currentCaptureType || requiredArray.includes(currentCaptureType)) {
            console.log(`progressCapture: continuing to capture ${currentCaptureType}`);
            return;
        }

        console.log(`progressCapture: ${currentCaptureType} no longer required, progressing`);
        
        // Early return: Complete capture if no more required fields
        if (requiredArray.length === 0) {
            console.log("progressCapture: no more required fields, completing capture");
            this.canSubmit = true;
            this.dispatchEvent(new CustomEvent('captureComplete', { 
                detail: { message: 'All payment fields captured successfully' }
            }));
            return;
        }

        // Progress to next capture type
        this.userCaptureOrderArray.shift();
        console.log("progressCapture userCaptureOrderArray after shift: ", this.userCaptureOrderArray);
        
        // Early return: No more items to capture
        if (this.userCaptureOrderArray.length === 0) {
            console.log("progressCapture: no more items in capture order");
            return;
        }

        const { success, result } = await this.callAPI('/aap/changeCapture', {
            callSid: this.callSid,
            paymentSid: this.paymentSid,
            captureType: this.userCaptureOrderArray[0]
        });

        if (!success) {
            this.dispatchEvent(new CustomEvent('error', { detail: result }));
        }
    };






    async initializeSyncClient() {
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

        this.syncClient = new Twilio.Sync.Client(jwtToken);
        this.payMap = await this.syncClient.map('payMap');
        console.log('Client payMap created');

        this.payMap.on('itemUpdated', (args) => {
            this.maskedPayData = args.item.data;

            console.log("PaymentCardNumber: ", this.maskedPayData.PaymentCardNumber);
            console.log("SecurityCode: ", this.maskedPayData.SecurityCode);
            console.log("ExpirationDate: ", this.maskedPayData.ExpirationDate);
            console.log("Required: ", this.maskedPayData.Required);
            console.log("PartialResult: ", this.maskedPayData.PartialResult);
            console.log("Capture: ", this.maskedPayData.Capture);

            this.dispatchEvent(new CustomEvent('paymentDataUpdated', {
                detail: this.maskedPayData
            }));
        });
    }

    async resetCardInput() {
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

    async resetCvcInput() {
        console.log("===================== resetCvcInput called =====================");
        if (this.userCaptureOrderArray[0] === "security-code") {
            console.log("resetCvcInput: security-code is already the first item in userCaptureOrderArray");
        }
        else {
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

    async resetDateInput() {
        console.log("===================== resetDateInput called =====================");
        if (this.userCaptureOrderArray[0] === "expiration-date") {
            console.log("resetDateInput: expiration-date is already the first item in userCaptureOrderArray");
        }
        else {
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

    async submit() {
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

    async cancel() {
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

    async startCapture(inputCallSid) {
        this.callSid = inputCallSid;
        console.log('CallSid value set to:', this.callSid);

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
        this.paymentSid = result.sid;
        console.log('paymentSid set to:', this.paymentSid);

        this.dispatchEvent(new CustomEvent('captureStarted', {
            detail: {
                callSid: this.callSid,
                paymentSid: this.paymentSid
            }
        }));

        await this.initializeSyncClient();
        this.startedCapturing = true;
        this.progressCapture();
    }
}

window.paymentClient = new PaymentClient();