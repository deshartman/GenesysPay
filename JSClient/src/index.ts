// Import PaymentClient type from payment.ts
import { PaymentClient } from './payment.js';

// Global declarations for Twilio objects
declare global {
    interface Window {
        paymentClient: PaymentClient;
        paymentUI: PaymentUI;
    }
}

interface PaymentData {
    PaymentCardNumber?: string;
    SecurityCode?: string;
    ExpirationDate?: string;
}

class PaymentUI {
    constructor() {
        this.initializeEventListeners();
    }

    private initializeEventListeners(): void {
        window.paymentClient.addEventListener('captureStarted', (event: Event) => {
            const customEvent = event as CustomEvent;
            this.showPaymentView(customEvent.detail.callSid, customEvent.detail.paymentSid);
        });

        window.paymentClient.addEventListener('paymentDataUpdated', (event: Event) => {
            const customEvent = event as CustomEvent;
            this.updateInputs(customEvent.detail);
            window.paymentClient.progressCapture();
        });

        window.paymentClient.addEventListener('error', (event: Event) => {
            const customEvent = event as CustomEvent;
            this.showError(customEvent.detail);
        });

        window.paymentClient.addEventListener('paymentSubmitted', (event: Event) => {
            console.log('Payment submitted successfully');
        });

        window.paymentClient.addEventListener('paymentCancelled', (event: Event) => {
            console.log('Payment cancelled successfully');
        });
    }

    private showPaymentView(callSid: string, paymentSid: string): void {
        const signInView = document.getElementById('signInView');
        const paymentView = document.getElementById('paymentView');
        const callSidDisplay = document.getElementById('callSidDisplay');
        const paymentSidDisplay = document.getElementById('paymentSidDisplay');

        if (signInView) signInView.style.display = 'none';
        if (paymentView) paymentView.style.display = 'block';
        if (callSidDisplay) callSidDisplay.innerText = callSid;
        if (paymentSidDisplay) paymentSidDisplay.innerText = paymentSid;
    }

    private updateInputs(paymentData: PaymentData): void {
        const cardInput = document.getElementById('card') as HTMLInputElement;
        const cvcInput = document.getElementById('cvc') as HTMLInputElement;
        const dateInput = document.getElementById('date') as HTMLInputElement;

        if (cardInput) cardInput.value = paymentData.PaymentCardNumber || '';
        if (cvcInput) cvcInput.value = paymentData.SecurityCode || '';
        if (dateInput) dateInput.value = paymentData.ExpirationDate || '';
    }

    public showError(message: string): void {
        const errorText = document.getElementById('errorText');
        const errorMessage = document.getElementById('errorMessage');

        if (errorText) errorText.textContent = message;
        if (errorMessage) errorMessage.style.display = 'block';
    }

    public hideError(): void {
        const errorMessage = document.getElementById('errorMessage');
        if (errorMessage) errorMessage.style.display = 'none';
    }
}

async function startCapture(): Promise<void> {
    const inputElement = document.getElementById("callSid") as HTMLInputElement;
    if (inputElement && inputElement.value) {
        const callSid = inputElement.value;
        console.log('CallSid value from Input screen:', callSid);
        await window.paymentClient.startCapture(callSid);
    } else {
        console.error('No CallSid from Input screen');
        window.paymentUI.showError('Please enter a valid Call SID');
    }
}

async function resetCardInput(): Promise<void> {
    await window.paymentClient.resetCardInput();
}

async function resetCvcInput(): Promise<void> {
    await window.paymentClient.resetCvcInput();
}

async function resetDateInput(): Promise<void> {
    await window.paymentClient.resetDateInput();
}

async function submit(): Promise<void> {
    await window.paymentClient.submit();
}

async function cancel(): Promise<void> {
    await window.paymentClient.cancel();
}

function hideError(): void {
    window.paymentUI.hideError();
}

window.onload = function (): void {
    window.paymentUI = new PaymentUI();
    console.log('Page loaded, ready for sign in');
};

// Export functions for global access
(window as any).startCapture = startCapture;
(window as any).resetCardInput = resetCardInput;
(window as any).resetCvcInput = resetCvcInput;
(window as any).resetDateInput = resetDateInput;
(window as any).submit = submit;
(window as any).cancel = cancel;
(window as any).hideError = hideError;