// Resume RAG Form Filler
console.log('[RESUME_RAG] Content script loaded');

// Store last result globally for access from popup
window.RESUME_RAG_LAST_RESULT = null;
window.RESUME_RAG_BACKEND_URL = 'http://localhost:8000';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[RESUME_RAG] Message received:', request.action, 'from:', sender.url);

    if (request.action === 'fillForm') {
        // Store backend URL for use in form submission
        if (request.backendUrl) {
            window.RESUME_RAG_BACKEND_URL = request.backendUrl;
            console.log('[RESUME_RAG] Backend URL set to:', request.backendUrl);
        }

        const result = fillForm(request.resumeData);
        window.RESUME_RAG_LAST_RESULT = result;
        console.log('[RESUME_RAG] Final result:', result);
        console.log('[RESUME_RAG] Stored result globally');

        // Send response synchronously
        try {
            sendResponse(result);
            console.log('[RESUME_RAG] Response sent');
        } catch (e) {
            console.log('[RESUME_RAG] Error sending response:', e);
        }
    }
});

// Hook into form submissions to capture final values
document.addEventListener('submit', async (e) => {
    const form = e.target;
    console.log('[RESUME_RAG] Form submission detected:', form);

    // Capture form values and send to backend
    const formData = captureFormData();
    if (formData && Object.keys(formData).length > 0) {
        console.log('[RESUME_RAG] Capturing form data on submit:', formData);
        try {
            const backendUrl = window.RESUME_RAG_BACKEND_URL || 'http://localhost:8000';
            const response = await fetch(`${backendUrl}/api/v1/form-response`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: window.location.href,
                    timestamp: new Date().toISOString(),
                    data: formData
                })
            });
            if (response.ok) {
                console.log('[RESUME_RAG] ✓ Form data saved to backend');
            }
        } catch (err) {
            console.log('[RESUME_RAG] Could not save form data:', err.message);
        }
    }
}, true);

function fillForm(resumeData) {
    console.log('[RESUME_RAG] Starting form fill');

    const data = {
        first: resumeData.first_name || '',
        last: resumeData.last_name || '',
        email: resumeData.email || '',
        phone: resumeData.phone || '',
        city: resumeData.city || '',
        linkedin: resumeData.linkedin || '',
        website: resumeData.website || ''
    };

    let filledCount = 0;

    // Get all input elements from main page AND iframes
    const getAllInputs = () => {
        let inputs = [];

        // Main page inputs
        inputs = inputs.concat(Array.from(document.querySelectorAll('input, select, textarea')));

        // Inputs from iframes
        try {
            document.querySelectorAll('iframe').forEach(iframe => {
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (iframeDoc) {
                        inputs = inputs.concat(Array.from(iframeDoc.querySelectorAll('input, select, textarea')));
                    }
                } catch (e) {
                    // Cross-origin iframe
                }
            });
        } catch (e) {}

        return inputs;
    };

    const inputs = getAllInputs();
    console.log('[RESUME_RAG] Total form elements:', inputs.length);

    // Process each input
    inputs.forEach((field) => {
        if (!field.offsetHeight) return; // Skip hidden fields

        const type = field.type?.toLowerCase() || '';
        const id = field.id?.toLowerCase() || '';
        const name = field.name?.toLowerCase() || '';
        const placeholder = field.placeholder?.toLowerCase() || '';

        // Get label
        let label = '';
        try {
            const doc = field.ownerDocument;
            if (field.id) {
                const lbl = doc.querySelector(`label[for="${field.id}"]`);
                if (lbl) label = lbl.textContent?.toLowerCase() || '';
            }
        } catch (e) {}

        const context = `${id}|${name}|${placeholder}|${label}`;

        // CHECKBOXES
        if (type === 'checkbox') {
            if (/linkedin/.test(context)) {
                console.log('[RESUME_RAG] Checking LinkedIn checkbox');
                field.checked = true;
                field.dispatchEvent(new Event('change', { bubbles: true }));
                field.dispatchEvent(new Event('click', { bubbles: true }));
                filledCount++;
            }
            return;
        }

        // NATIVE SELECTS
        if (type === 'select-one' || field.tagName === 'SELECT') {
            console.log('[RESUME_RAG] Found native SELECT - name:', name);

            // Check if this looks like a country/work authorization field
            const isRelevant = /country|authorized|legal|visa|sponsorship|work.*in|require/i.test(context);

            if (isRelevant) {
                console.log('[RESUME_RAG] Processing country select:', name);

                for (const opt of field.options || []) {
                    if (/^usa$|^us$|united states|america/i.test(opt.text.trim())) {
                        console.log('[RESUME_RAG] Setting to:', opt.text);
                        field.value = opt.value;
                        field.dispatchEvent(new Event('change', { bubbles: true }));
                        filledCount++;
                        break;
                    }
                }
            }
            return;
        }

        // TEXT INPUTS
        if (type === 'text' || type === '' || type === 'email' || type === 'tel' || field.tagName === 'TEXTAREA') {
            let value = null;

            if (/last.?name|lname|surname/i.test(context)) {
                value = data.last;
            } else if (/first.?name|fname/i.test(context)) {
                value = data.first;
            } else if (/^email/i.test(context)) {
                value = data.email;
            } else if (/phone|telephone|mobile|cell/i.test(context)) {
                value = data.phone;
            } else if (/^city|location_city/i.test(context) && !/address|zip|postal/i.test(context)) {
                value = data.city;
            } else if (/linkedin/i.test(context)) {
                value = data.linkedin;
            } else if (/website|portfolio|url/i.test(context)) {
                value = data.website;
            }

            if (value) {
                try {
                    field.value = value;
                    field.dispatchEvent(new Event('input', { bubbles: true }));
                    field.dispatchEvent(new Event('change', { bubbles: true }));
                    field.dispatchEvent(new Event('blur', { bubbles: true }));

                    // Yellow highlight
                    const oldBg = field.style.backgroundColor;
                    field.style.backgroundColor = '#ffffcc';
                    setTimeout(() => {
                        field.style.backgroundColor = oldBg;
                    }, 1500);

                    filledCount++;
                    console.log('[RESUME_RAG] Filled:', name || id, 'with:', value.substring(0, 30));
                } catch (e) {
                    console.log('[RESUME_RAG] Error filling field:', e);
                }
            }
        }
    });

    // Handle Greenhouse custom dropdowns (asynchronously)
    console.log('[RESUME_RAG] Processing custom dropdown components');
    handleDropdowns().then(() => {
        console.log('[RESUME_RAG] Total filled:', filledCount);
        console.log('%cFORM FILLED: ' + filledCount + ' fields', 'font-size: 16px; color: green; font-weight: bold;');
    });

    return { success: true, filledCount };
}

async function handleDropdowns() {
    console.log('[RESUME_RAG] Processing Greenhouse React Select dropdowns');

    // Find all combobox inputs (React Select controls)
    const inputs = document.querySelectorAll('input[role="combobox"]');
    console.log('[RESUME_RAG] Found ' + inputs.length + ' combobox inputs');

    const dropdownConfig = {};

    // Map field IDs to target values
    inputs.forEach(input => {
        const fieldId = input.id || '';
        let targetValue = null;

        if (fieldId.includes('question_8433548005')) {
            targetValue = 'No';
        } else if (fieldId.includes('question_8433549005')) {
            targetValue = 'Yes';
        } else if (fieldId.includes('question_8433550005')) {
            targetValue = 'No';
        } else if (fieldId.includes('question_8433551005')) {
            targetValue = 'acknowledge';
        } else if (fieldId === '4014696005') {
            targetValue = 'Male';
        } else if (fieldId === '4014697005') {
            targetValue = 'White';
        } else if (fieldId === '4014698005') {
            targetValue = 'No';
        }

        if (targetValue) {
            dropdownConfig[fieldId] = targetValue;
        }
    });

    console.log('[RESUME_RAG] Configured dropdowns:', Object.keys(dropdownConfig).length);

    // Process each dropdown sequentially
    for (const [fieldId, targetValue] of Object.entries(dropdownConfig)) {
        const input = document.querySelector(`input#${CSS.escape(fieldId)}`);
        if (!input) continue;

        console.log('[RESUME_RAG] Dropdown: ' + fieldId + ' -> ' + targetValue);

        // Click to open
        input.click();
        await sleep(500);

        // Navigate to target using arrow keys and detect focused option
        let found = false;
        for (let arrowCount = 0; arrowCount < 20; arrowCount++) {
            if (arrowCount > 0) {
                simulateKeyPress('ArrowDown', input);
                await sleep(80);
            }

            // Check focused option text
            const focusedOption = document.querySelector('div.select__option--is-focused');
            if (focusedOption) {
                const focusedText = focusedOption.textContent?.trim() || '';
                if (targetValue.toLowerCase().includes(focusedText.toLowerCase()) ||
                    focusedText.toLowerCase().includes(targetValue.toLowerCase())) {
                    console.log('[RESUME_RAG]   ✓ Found "' + targetValue + '" at arrow ' + arrowCount);
                    found = true;
                    break;
                }
            }
        }

        if (!found) {
            console.log('[RESUME_RAG]   ⚠ Did not find "' + targetValue + '" after 20 tries');
        }

        // Press Enter to select
        simulateKeyPress('Enter', input);
        await sleep(400);
    }

    console.log('[RESUME_RAG] Dropdown processing complete');
}

function simulateKeyPress(key, target) {
    const keyEvent = new KeyboardEvent('keydown', {
        key: key,
        code: key,
        bubbles: true,
        cancelable: true
    });
    target.dispatchEvent(keyEvent);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function captureFormData() {
    const data = {};

    // Capture all text inputs
    document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], textarea').forEach(field => {
        if (field.id && field.value) {
            data[field.id] = field.value;
        }
    });

    // Capture all selects and comboboxes
    document.querySelectorAll('input[role="combobox"], select').forEach(field => {
        if (field.id) {
            const value = field.value || '';
            if (value) {
                data[field.id] = value;
            } else {
                // For React Select, try to read the visible value
                const container = field.closest('[class*="select"]');
                const valueSpan = container?.querySelector('.select__single-value');
                if (valueSpan && valueSpan.textContent?.trim()) {
                    data[field.id] = valueSpan.textContent.trim();
                }
            }
        }
    });

    // Capture checked checkboxes
    document.querySelectorAll('input[type="checkbox"]:checked').forEach(field => {
        if (field.id) {
            data[field.id] = true;
        }
    });

    return data;
}
