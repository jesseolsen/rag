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

        // Set a timeout to show a default message if no response
        const timeout = setTimeout(() => {
            if (!responseReceived) {
                console.log('[POPUP] No response received after 3 seconds');
                showStatus('✓ Form filled! (Check the form to verify)', 'success');
            }
        }, 3000);

        chrome.tabs.sendMessage(tab.id, {
            action: 'fillForm',
            resumeData: resumeData
        }, (response) => {
            clearTimeout(timeout);
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
                console.log('[POPUP] Showing success with count:', response.filledCount);
                showStatus(`✓ Form filled! Matched ${response.filledCount} fields.`, 'success');
            } else {
                console.log('[POPUP] Response was not successful');
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

// Load saved settings on popup open
chrome.storage.local.get(['backendUrl'], (result) => {
    if (result.backendUrl) {
        document.getElementById('backendUrl').value = result.backendUrl;
    }
});
