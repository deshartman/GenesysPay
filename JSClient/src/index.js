class PaymentUI {
    constructor() {
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        window.paymentClient.addEventListener('captureStarted', (event) => {
            this.showPaymentView(event.detail.callSid, event.detail.paymentSid);
        });

        window.paymentClient.addEventListener('paymentDataUpdated', (event) => {
            this.updateInputs(event.detail);
            window.paymentClient.progressCapture();
        });

        window.paymentClient.addEventListener('error', (event) => {
            this.showError(event.detail);
        });

        window.paymentClient.addEventListener('paymentSubmitted', (event) => {
            console.log('Payment submitted successfully');
        });

        window.paymentClient.addEventListener('paymentCancelled', (event) => {
            console.log('Payment cancelled successfully');
        });
    }

    showPaymentView(callSid, paymentSid) {
        document.getElementById('signInView').style.display = 'none';
        document.getElementById('paymentView').style.display = 'block';
        document.getElementById('callSidDisplay').innerText = callSid;
        document.getElementById('paymentSidDisplay').innerText = paymentSid;
    }

    updateInputs(paymentData) {
        document.getElementById('card').value = paymentData.PaymentCardNumber || '';
        document.getElementById('cvc').value = paymentData.SecurityCode || '';
        document.getElementById('date').value = paymentData.ExpirationDate || '';
    }

    showError(message) {
        document.getElementById('errorText').textContent = message;
        document.getElementById('errorMessage').style.display = 'block';
    }

    hideError() {
        document.getElementById('errorMessage').style.display = 'none';
    }
}

async function startCapture() {
    const inputElement = document.getElementById("callSid");
    if (inputElement && inputElement.value) {
        const callSid = inputElement.value;
        console.log('CallSid value from Input screen:', callSid);
        await window.paymentClient.startCapture(callSid);
    } else {
        console.error('No CallSid from Input screen');
        window.paymentUI.showError('Please enter a valid Call SID');
    }
}

async function resetCardInput() {
    await window.paymentClient.resetCardInput();
}

async function resetCvcInput() {
    await window.paymentClient.resetCvcInput();
}

async function resetDateInput() {
    await window.paymentClient.resetDateInput();
}

async function submit() {
    await window.paymentClient.submit();
}

async function cancel() {
    await window.paymentClient.cancel();
}

function hideError() {
    window.paymentUI.hideError();
}

window.onload = function () {
    window.paymentUI = new PaymentUI();
    console.log('Page loaded, ready for sign in');
};