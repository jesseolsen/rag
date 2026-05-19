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

        // Handle async fillForm and send response when done
        (async () => {
            try {
                const result = await fillForm(request.resumeData);
                console.log('[RESUME_RAG] fillForm completed with result:', JSON.stringify(result));
                console.log('[RESUME_RAG] Sending response:', result);
                sendResponse(result);
            } catch (error) {
                console.log('[RESUME_RAG] fillForm error:', error.message);
                sendResponse({ success: false, message: error.message });
            }
        })();

        // Return true to keep the channel open for async response
        return true;
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

async function fillForm(resumeData) {
    console.log('[RESUME_RAG] Starting form fill');
    console.log('[RESUME_RAG] resumeData received:', JSON.stringify(resumeData));

    const data = {
        first: resumeData.first_name || '',
        last: resumeData.last_name || '',
        email: resumeData.email || '',
        phone: resumeData.phone || '',
        city: resumeData.city || '',
        linkedin: resumeData.linkedin || '',
        website: resumeData.website || ''
    };

    console.log('[RESUME_RAG] Data object created:', JSON.stringify(data));
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
            console.log('[RESUME_RAG] Found checkbox - context:', context, '| label:', label);
            if (/linkedin/.test(context)) {
                field.checked = true;
                field.dispatchEvent(new Event('change', { bubbles: true }));
                field.dispatchEvent(new Event('click', { bubbles: true }));
                filledCount++;
                console.log('[RESUME_RAG] ✓ Checked LinkedIn');
            } else if (/acknowledge|agree|privacy|policy|data.?processing/i.test(context)) {
                field.checked = true;
                field.dispatchEvent(new Event('change', { bubbles: true }));
                field.dispatchEvent(new Event('click', { bubbles: true }));
                filledCount++;
                console.log('[RESUME_RAG] ✓ Checked Acknowledgement');
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
            // Skip location field - it's handled as a dropdown in handleDropdowns()
            if (id === 'candidate-location') {
                return;
            }

            let value = null;

            if (/last.?name|lname|surname/i.test(context)) {
                value = data.last;
            } else if (/first.?name|fname/i.test(context)) {
                value = data.first;
            } else if (/^email/i.test(context)) {
                value = data.email;
            } else if (/phone|telephone|mobile|cell/i.test(context)) {
                value = data.phone;
            } else if (/city|location|location.?city/i.test(context) && !/address|zip|postal|country/i.test(context)) {
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
                    console.log('[RESUME_RAG] Filled:', name || id, 'with:', value.substring(0, 30), '| count now:', filledCount);
                } catch (e) {
                    console.log('[RESUME_RAG] Error filling field:', e);
                }
            }
        }
    });

    // Handle Greenhouse custom dropdowns (asynchronously)
    console.log('[RESUME_RAG] Processing custom dropdown components');

    // Return promise that completes after dropdowns are processed
    return handleDropdowns().then((dropdownCount) => {
        const totalFilled = filledCount + dropdownCount;
        console.log('[RESUME_RAG] Total filled:', totalFilled);
        console.log('%cFORM FILLED: ' + totalFilled + ' fields', 'font-size: 16px; color: green; font-weight: bold;');

        // Send message to popup to update status with final count (only if we actually filled something)
        if (totalFilled > 0) {
            try {
                chrome.runtime.sendMessage({
                    action: 'formFillComplete',
                    filledCount: totalFilled
                });
            } catch (e) {
                console.log('[RESUME_RAG] Could not send formFillComplete message:', e.message);
            }
        }

        return { success: true, filledCount: totalFilled };
    });
}

async function handleDropdowns() {
    console.log('[RESUME_RAG] Processing dropdowns');

    let processedCount = 0;

    // Handle country dropdown first (special case - international phone input)
    const countryInput = document.querySelector('input#country');
    if (countryInput) {
        countryInput.focus();
        await sleep(100);

        // Press DOWN to open the dropdown
        const downEvent = new KeyboardEvent('keydown', {
            key: 'ArrowDown',
            code: 'ArrowDown',
            bubbles: true,
            cancelable: true
        });
        countryInput.dispatchEvent(downEvent);
        await sleep(200);

        // Type "United" character by character to filter to United States
        console.log('[RESUME_RAG]   Typing "United" character by character');
        const countryText = 'United';
        for (const char of countryText) {
            countryInput.value += char;

            const keydownEvent = new KeyboardEvent('keydown', {
                key: char,
                bubbles: true,
                cancelable: true
            });
            countryInput.dispatchEvent(keydownEvent);

            const inputEvent = new Event('input', { bubbles: true });
            countryInput.dispatchEvent(inputEvent);

            const keyupEvent = new KeyboardEvent('keyup', {
                key: char,
                bubbles: true,
                cancelable: true
            });
            countryInput.dispatchEvent(keyupEvent);

            await sleep(30);
        }

        await sleep(200);

        // Press Enter to select United States
        const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            bubbles: true,
            cancelable: true
        });
        countryInput.dispatchEvent(enterEvent);
        await sleep(150);
        processedCount++;
    }

    // Handle location (city) dropdown
    const locationInput = document.querySelector('input#candidate-location');
    if (locationInput) {
        locationInput.focus();
        await sleep(100);

        // Clear any existing value first
        locationInput.value = '';
        locationInput.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(100);

        // Press DOWN to open the dropdown
        const downEvent = new KeyboardEvent('keydown', {
            key: 'ArrowDown',
            code: 'ArrowDown',
            bubbles: true,
            cancelable: true
        });
        locationInput.dispatchEvent(downEvent);
        await sleep(200);

        // Type "Spanish Fork" to filter to Spanish Fork, Utah
        const locationText = 'Spanish Fork';
        for (const char of locationText) {
            locationInput.value += char;

            const keydownEvent = new KeyboardEvent('keydown', {
                key: char,
                bubbles: true,
                cancelable: true
            });
            locationInput.dispatchEvent(keydownEvent);

            const inputEvent = new Event('input', { bubbles: true });
            locationInput.dispatchEvent(inputEvent);

            const keyupEvent = new KeyboardEvent('keyup', {
                key: char,
                bubbles: true,
                cancelable: true
            });
            locationInput.dispatchEvent(keyupEvent);

            await sleep(30);
        }

        await sleep(150);

        // Press Enter to select Spanish Fork
        const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            bubbles: true,
            cancelable: true
        });
        locationInput.dispatchEvent(enterEvent);

        const enterEventUp = new KeyboardEvent('keyup', {
            key: 'Enter',
            code: 'Enter',
            bubbles: true,
            cancelable: true
        });
        locationInput.dispatchEvent(enterEventUp);

        await sleep(150);
        processedCount++;
    }

    // Find all React Select combobox inputs
    const inputs = document.querySelectorAll('input[role="combobox"]');
    console.log('[RESUME_RAG] Found ' + inputs.length + ' combobox inputs');

    const dropdownConfig = {};

    // Map field IDs to target values
    inputs.forEach(input => {
        const fieldId = input.id || '';
        let targetValue = null;

        // Skip country and phone inputs - already handled above
        if (fieldId === 'country' || fieldId.includes('iti')) {
            return;
        }

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

    console.log('[RESUME_RAG] Configured React Select dropdowns:', Object.keys(dropdownConfig).length);

    // Process each React Select dropdown sequentially
    for (const [fieldId, targetValue] of Object.entries(dropdownConfig)) {
        const input = document.querySelector(`input#${CSS.escape(fieldId)}`);
        if (!input) continue;

        console.log('[RESUME_RAG] Dropdown: ' + fieldId + ' -> ' + targetValue);

        // Focus the input
        input.focus();
        await sleep(100);

        // Press DOWN to open the dropdown
        const downEvent = new KeyboardEvent('keydown', {
            key: 'ArrowDown',
            code: 'ArrowDown',
            bubbles: true,
            cancelable: true
        });
        input.dispatchEvent(downEvent);
        await sleep(150);

        // Type the target value character by character to filter
        for (const char of targetValue) {
            input.value += char;

            const keydownEvent = new KeyboardEvent('keydown', {
                key: char,
                bubbles: true,
                cancelable: true
            });
            input.dispatchEvent(keydownEvent);

            const inputEvent = new Event('input', { bubbles: true });
            input.dispatchEvent(inputEvent);

            const keyupEvent = new KeyboardEvent('keyup', {
                key: char,
                bubbles: true,
                cancelable: true
            });
            input.dispatchEvent(keyupEvent);

            await sleep(30);
        }

        await sleep(150);

        // Press Enter to select the first/only matching option
        const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            bubbles: true,
            cancelable: true
        });
        input.dispatchEvent(enterEvent);

        const enterEventUp = new KeyboardEvent('keyup', {
            key: 'Enter',
            code: 'Enter',
            bubbles: true,
            cancelable: true
        });
        input.dispatchEvent(enterEventUp);

        await sleep(150);
        processedCount++;
    }

    console.log('[RESUME_RAG] Dropdown processing complete. Processed: ' + processedCount);
    return processedCount;
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
