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
        
        if (!this.maskedPayData.Required) {
            console.log("progressCapture maskedPayData.Required is not present");
            console.log("startedCapturing: ", this.startedCapturing);
            if (this.startedCapturing) {
                console.log("progressCapture startedCapturing is true and stopping polling");
                this.canSubmit = true;
            }
        } else {
            this.startedCapturing = true;
            console.log("startedCapturing: ", this.startedCapturing);

            const requiredArray = this.maskedPayData.Required.split(",").map((item) => item.trim());
            console.log("progressCapture requiredArray: ", requiredArray);
            console.log("progressCapture userCaptureOrderArray: ", this.userCaptureOrderArray);

            if (requiredArray.length < this.userCaptureOrderArray.length) {
                console.log("progressCapture requiredArray.length < userCaptureOrderArray.length");
                this.userCaptureOrderArray.shift();
                console.log("progressCapture userCaptureOrderArray: ", this.userCaptureOrderArray);
                
                const { success, result } = await this.callAPI('/aap/changeCapture', {
                    callSid: this.callSid,
                    paymentSid: this.paymentSid,
                    captureType: this.userCaptureOrderArray[0]
                });

                if (!success) {
                    this.dispatchEvent(new CustomEvent('error', { detail: result }));
                    return;
                }
            } else {
                console.log("progressCapture requiredArray.length >= userCaptureOrderArray.length");
            }
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
        const { success, result } = await this.callAPI('/aap/changeCapture', {
            callSid: this.callSid,
            paymentSid: this.paymentSid,
            captureType: 'payment-card-number'
        });

        if (!success) {
            this.dispatchEvent(new CustomEvent('error', { detail: result }));
            return;
        }
    }

    async resetCvcInput() {
        console.log("===================== resetCvcInput called =====================");
        const { success, result } = await this.callAPI('/aap/changeCapture', {
            callSid: this.callSid,
            paymentSid: this.paymentSid,
            captureType: 'security-code'
        });

        if (!success) {
            this.dispatchEvent(new CustomEvent('error', { detail: result }));
            return;
        }
    }

    async resetDateInput() {
        console.log("===================== resetDateInput called =====================");
        const { success, result } = await this.callAPI('/aap/changeCapture', {
            callSid: this.callSid,
            paymentSid: this.paymentSid,
            captureType: 'expiration-date'
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
        this.progressCapture();
    }
}

window.paymentClient = new PaymentClient();