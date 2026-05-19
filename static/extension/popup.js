// Popup script
document.getElementById('fillButton').addEventListener('click', async () => {
    const backendUrl = document.getElementById('backendUrl').value;
    const resumeId = document.getElementById('resumeId').value;
    const status = document.getElementById('status');

    // Save settings
    chrome.storage.local.set({ backendUrl });

    if (!backendUrl) {
        showStatus('Backend URL is required', 'error');
        return;
    }

    status.textContent = 'Fetching resume data...';
    status.className = 'status info';

    try {
        // Get resume data
        const endpoint = resumeId
            ? `${backendUrl}/api/v1/resume/${resumeId}/data`
            : `${backendUrl}/api/v1/resume/latest/data`;

        const response = await fetch(endpoint);
        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.statusText}`);
        }

        const resumeData = await response.json();

        // Send to content script
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        console.log('Sending message to content script...');
        let responseReceived = false;

        // Show processing message but don't set a timeout that would show an early result
        status.textContent = 'Filling in fields...';
        status.className = 'status info';

        chrome.tabs.sendMessage(tab.id, {
            action: 'fillForm',
            resumeData: resumeData,
            backendUrl: backendUrl
        }, (response) => {
            if (responseReceived) {
                console.log('[POPUP] Ignoring duplicate response');
                return;
            }

            responseReceived = true;

            console.log('[POPUP] Got response:', response);
            console.log('[POPUP] Chrome error:', chrome.runtime.lastError);

            if (chrome.runtime.lastError) {
                console.error('[POPUP] Chrome error details:', chrome.runtime.lastError.message);
                showStatus('Error communicating with page. Try refreshing.', 'error');
                return;
            }

            console.log('[POPUP] Response object exists:', !!response);
            console.log('[POPUP] Response.success:', response?.success);
            console.log('[POPUP] Response.filledCount:', response?.filledCount);

            if (response && response.success) {
                const count = response.filledCount || 0;
                console.log('[POPUP] Response details:', JSON.stringify(response));
                console.log('[POPUP] Count extracted:', count);
                console.log('[POPUP] Form fill complete with', count, 'fields');
                // Don't show the response here - wait for the formFillComplete message instead
            } else {
                console.log('[POPUP] Response was not successful:', response);
                showStatus(response?.message || 'Failed to fill form', 'error');
            }
        });

    } catch (error) {
        showStatus(`Error: ${error.message}`, 'error');
    }
});

function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
}

// Listen for form fill completion messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'formFillComplete') {
        console.log('[POPUP] Form fill complete with', request.filledCount, 'fields');
        const status = document.getElementById('status');
        if (status) {
            status.textContent = `Form filled: ${request.filledCount} fields`;
            status.className = 'status success';
        }
    }
});

// Load saved settings on popup open
chrome.storage.local.get(['backendUrl'], (result) => {
    if (result.backendUrl) {
        document.getElementById('backendUrl').value = result.backendUrl;
    }
});
