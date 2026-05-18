// Resume RAG Form Filler
console.log('[RESUME_RAG] Content script loaded');

// Store last result globally for access from popup
window.RESUME_RAG_LAST_RESULT = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[RESUME_RAG] Message received:', request.action, 'from:', sender.url);

    if (request.action === 'fillForm') {
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

    // Handle Greenhouse custom Yes/No dropdown components
    console.log('[RESUME_RAG] Processing custom Yes/No dropdowns');
    handleYesNoDropdowns();

    console.log('[RESUME_RAG] Total filled:', filledCount);
    console.log('%cFORM FILLED: ' + filledCount + ' fields', 'font-size: 16px; color: green; font-weight: bold;');
    return { success: true, filledCount };
}

function handleYesNoDropdowns() {
    console.log('[RESUME_RAG] Looking for Yes/No dropdowns');

    // Find all LABEL elements that contain Yes/No question text
    const labels = Array.from(document.querySelectorAll('label'));
    console.log('[RESUME_RAG] Found ' + labels.length + ' labels');

    labels.forEach((label, idx) => {
        const labelText = label.textContent?.toLowerCase() || '';

        // Check if this label is for a Yes/No question
        let targetValue = null;

        if (/have you ever worked|worked.*before|prior.*experience/i.test(labelText)) {
            targetValue = 'No';
            console.log('[RESUME_RAG] Label[' + idx + ']: Prior experience question -> will select: No');
        } else if (/authorized|legal.*work|right.*work|eligib/i.test(labelText)) {
            targetValue = 'Yes';
            console.log('[RESUME_RAG] Label[' + idx + ']: Work authorization question -> will select: Yes');
        } else if (/visa|sponsor|require.*employ|h-?1|h-?1?b/i.test(labelText)) {
            targetValue = 'No';
            console.log('[RESUME_RAG] Label[' + idx + ']: Visa question -> will select: No');
        } else if (/acknowledge|agree|privacy|processing|data/i.test(labelText)) {
            targetValue = 'Yes';
            console.log('[RESUME_RAG] Label[' + idx + ']: Acknowledgement question -> will select: Yes');
        }

        if (targetValue) {
            // Find the next select-container after this label
            let nextContainer = label.nextElementSibling;

            // If the label doesn't directly have a sibling container, search the parent
            if (!nextContainer || !nextContainer.classList.contains('select-container')) {
                const parent = label.closest('[class*="field"], .form-group, .form-field, div');
                if (parent) {
                    nextContainer = parent.querySelector('.select-container, [class*="select-shell"]');
                }
            }

            if (nextContainer) {
                console.log('[RESUME_RAG] Found container for question, clicking...');
                const clickable = nextContainer.querySelector('[class*="select-shell"], button, [role="button"]');

                if (clickable) {
                    clickable.click();
                    console.log('[RESUME_RAG] Clicked, waiting for options...');

                    // Wait for dropdown to open and find the option
                    setTimeout(() => {
                        const options = document.querySelectorAll('[role="option"], [class*="option"], li');
                        console.log('[RESUME_RAG] Found ' + options.length + ' potential options');

                        let found = false;
                        for (const opt of options) {
                            const optText = opt.textContent?.trim() || '';
                            if (optText === targetValue) {
                                console.log('[RESUME_RAG] Found "' + targetValue + '", clicking it');
                                opt.click();
                                found = true;
                                break;
                            }
                        }

                        if (!found) {
                            console.log('[RESUME_RAG] "' + targetValue + '" not found, closing dropdown');
                            const esc = new KeyboardEvent('keydown', {
                                key: 'Escape',
                                code: 'Escape',
                                keyCode: 27,
                                bubbles: true
                            });
                            clickable.dispatchEvent(esc);
                        }
                    }, 250);
                }
            } else {
                console.log('[RESUME_RAG] No container found after label');
            }
        }
    });
}
