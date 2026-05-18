// Background service worker
chrome.runtime.onInstalled.addListener(() => {
    // Set default backend URL
    chrome.storage.local.get(['backendUrl'], (result) => {
        if (!result.backendUrl) {
            chrome.storage.local.set({ backendUrl: 'http://localhost:8000' });
        }
    });
});
