// Background service worker
chrome.runtime.onInstalled.addListener(() => {
    // Set default backend URL
    chrome.storage.local.get(['backendUrl'], (result) => {
        if (!result.backendUrl) {
            chrome.storage.local.set({ backendUrl: 'http://localhost:8000' });
        }
    });
});

// Proxy API requests from content scripts to avoid CORS issues with localhost
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'apiRequest') {
        (async () => {
            try {
                const fetchOptions = {
                    method: request.method || 'GET',
                    headers: request.headers || {}
                };
                if (request.body) {
                    fetchOptions.body = request.body;
                }
                const response = await fetch(request.url, fetchOptions);
                const contentType = response.headers.get('content-type');
                let data;
                if (contentType && contentType.includes('application/json')) {
                    data = await response.json();
                } else {
                    // For binary data (like PDF files), convert to base64
                    const buffer = await response.arrayBuffer();
                    const bytes = new Uint8Array(buffer);

                    // Convert to base64 in chunks to avoid stack overflow on large files
                    let binary = '';
                    const chunkSize = 8192; // Process 8KB at a time
                    for (let i = 0; i < bytes.length; i += chunkSize) {
                        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
                        binary += String.fromCharCode.apply(null, chunk);
                    }

                    data = {
                        _binary: true,
                        base64: btoa(binary),
                        contentType: contentType
                    };
                }
                sendResponse({ ok: response.ok, status: response.status, data });
            } catch (error) {
                sendResponse({ ok: false, error: error.message });
            }
        })();
        return true; // Keep channel open for async response
    }
});
