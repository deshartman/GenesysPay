// Client-side configuration - these would normally come from environment variables
const userCaptureOrderArray = ['payment-card-number', 'security-code', 'expiration-date'];
const chargeAmount = 0;
const currency = "AUD";

// File scoped variables
let callSid = null;
let paymentSid = null;
let startedCapturing = false;
let canSubmit = false;
let syncClient = null;
let payMap = null;
let maskedPayData = {};

/**
 * The payment State defines where in the process of capturing we are. It has three key parameters used to determine state:
 * Capture:string - The type of capture that is currently being performed. This can be one of the following: payment-card-number, security-code, expiration-date
 * Required:string - A comma-separated list of the required fields that need to be captured. This can be one or more of the following: payment-card-number, security-code, expiration-date
 * PartialResult:boolean - A flag indicating whether the capture is complete or not. If this is true, then the capture is complete and the payment can be submitted.
 * 
 */
let captureState = {
    capture: null,
    required: null,
    partialResult: false
}






// This function scans the received maskedPayData and performs a few operations:


// TODO: LAST HERE THIS LOGIC NEEDS TO BE REWORKED TO PROGRESS THROUGH THE CAPTURES TYPES


// 1) Checks if the Required attribute is present
// 2) If the Required attribute is not present and the capture has started, it stops the polling
// 3) When the "required" string length is less than the captureOrder array length, it updates the captureOrder array, removing the first element and calling the next capture API
const progressCapture = async function () {
    console.log("progressCapture maskedPayData: ", JSON.stringify(maskedPayData, null, 4));
    // If there is a required attribute, start capturing
    if (!maskedPayData.Required) {
        console.log("progressCapture maskedPayData.Required is not present");
        console.log("startedCapturing: ", startedCapturing);
        if (startedCapturing) {
            console.log("progressCapture startedCapturing is true and stopping polling");
            canSubmit = true;
        }
    } else {
        // Set the capturing flag
        startedCapturing = true;
        console.log("startedCapturing: ", startedCapturing);

        // Convert Capture Order string to an Array, removing whitespace
        const requiredArray = maskedPayData.Required.split(",").map((item) => item.trim());
        console.log("progressCapture requiredArray: ", requiredArray);

        // console.log("maskedPayData.Required: ", maskedPayData.Required);
        console.log("progressCapture userCaptureOrderArray: ", userCaptureOrderArray);
        console.log(
            "progressCapture requiredArray.length: ",
            requiredArray.length,
            "userCaptureOrderArray.length: ",
            userCaptureOrderArray.length
        );

        if (requiredArray.length < userCaptureOrderArray.length) {
            console.log("progressCapture requiredArray.length < userCaptureOrderArray.length");
            // Remove the first element from the userCaptureOrderArray
            userCaptureOrderArray.shift();
            console.log("progressCapture userCaptureOrderArray: ", userCaptureOrderArray);
            // Call the capture API with the next capture type
            ///////////////////////////////////
            try {
                // Make a POST request to /aap/changeCapture
                const response = await fetch('/aap/changeCapture', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        callSid: callSid,
                        paymentSid: paymentSid,
                        captureType: userCaptureOrderArray[0], // Use the first element of the updated userCaptureOrderArray
                    })
                });
                const responseData = await response.json();
                console.log('responseData:', responseData);

                if (responseData.error) {
                    showError(responseData.error);
                    return;
                }
            } catch (error) {
                console.error('Error:', error);
                showError('Network error occurred');
            }
            //////////////////////////////////
        } else {
            console.log("progressCapture requiredArray.length >= userCaptureOrderArray.length");
        }
    }
};

// Update input values with payment data
function updateInputs() {
    document.getElementById('card').value = maskedPayData.PaymentCardNumber;
    document.getElementById('cvc').value = maskedPayData.SecurityCode;
    document.getElementById('date').value = maskedPayData.ExpirationDate;
}


// Initialize Sync client once
async function initializeSyncClient() {
    try {
        const response = await fetch("/sync/getSyncToken", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identity: callSid
            })
        });
        const jwtToken = await response.json();

        // Create Sync Client and payMap
        syncClient = new Twilio.Sync.Client(jwtToken);
        payMap = await syncClient.map('payMap');
        console.log('Client payMap created');

        // Kick off the capture with the first item
        progressCapture();

        // Add Event Listener for data changes
        payMap.on('itemUpdated', (args) => {
            // console.log(`payMap item ${JSON.stringify(args, null, 4)} was UPDATED`);
            maskedPayData = args.item.data;
            console.log("Updated maskedPayData: ", JSON.stringify(maskedPayData, null, 4));

            progressCapture();
            updateInputs();
        });

    } catch (error) {
        console.error('Error: Could not create SyncClient', error);
    }
}



// Reset input values
function resetCardInput() {
    maskedPayData.PaymentCardNumber = "-------------------"
    // document.getElementById('card').value = "";
    updateInputs();
}
function resetCvcInput() {
    maskedPayData.SecurityCode = "---";
    // document.getElementById('cvc').value = "";
    updateInputs();
}
function resetDateInput() {
    maskedPayData.ExpirationDate = "--/--";
    // document.getElementById('date').value = "";
    updateInputs();
}

async function submit() {
    // This function will be called when the Submit button is clicked
    //Call the /aap/changeStatus API to change the payment status
    const response = await fetch('/aap/changeStatus', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            callSid: callSid,
            paymentSid: paymentSid,
            status: 'complete'
        })
    });

    if (response.ok) {
        const data = await response.json();
        console.log('Payment status changed successfully:', data);
    } else {
        console.error('Error changing payment status:', response.statusText);
    }

}

async function cancel() {
    // This function will be called when the Cancel button is clicked
    //Call the /aap/changeStatus API to change the payment status
    const response = await fetch('/aap/changeStatus', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            callSid: callSid,
            paymentSid: paymentSid,
            status: 'cancel'
        })
    });

    if (response.ok) {
        const data = await response.json();
        console.log('Payment status changed successfully:', data);
    } else {
        console.error('Error changing payment status:', response.statusText);
    }
}

async function startCapture() {
    const inputElement = document.getElementById("callSid");
    if (inputElement && inputElement.value) {
        callSid = inputElement.value;
        console.log('CallSid value from Input screen set to:', callSid);
    } else {
        console.error('No CallSid from Input screen');
    }

    try {
        // Make a POST request to /aap/StartCapture with the callSid as the JSON body
        const response = await fetch('/aap/startCapture', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                callSid: callSid,
                chargeAmount: chargeAmount,
                currency: currency
            })
        });
        const responseData = await response.json();
        console.log('responseData:', responseData);

        if (responseData.error) {
            showError(responseData.error);
            return;
        }

        paymentSid = responseData.sid;
        console.log('paymentSid set to:', paymentSid);

        // Show payment view and hide sign in view
        document.getElementById('signInView').style.display = 'none';
        document.getElementById('paymentView').style.display = 'block';

        // Update display elements
        document.getElementById('callSidDisplay').innerText = callSid;
        document.getElementById('paymentSidDisplay').innerText = paymentSid;

        // Initialize sync client for payment processing
        await initializeSyncClient();

    } catch (error) {
        console.error('Error:', error);
        showError('Network error occurred');
    }
}

function showError(message) {
    document.getElementById('errorText').textContent = message;
    document.getElementById('errorMessage').style.display = 'block';
}

function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}


// Page load
window.onload = function () {
    // Page is ready - sign in view is shown by default
    console.log('Page loaded, ready for sign in');
};