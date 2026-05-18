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

        chrome.tabs.sendMessage(tab.id, {
            action: 'fillForm',
            resumeData: resumeData
        }, (response) => {
            if (chrome.runtime.lastError) {
                showStatus('Error communicating with page. Try refreshing.', 'error');
                return;
            }
            if (response?.success) {
                showStatus(`✓ Form filled! Matched ${response.filledCount} fields.`, 'success');
            } else {
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
