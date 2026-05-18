// Resume RAG Form Filler
console.log('[RESUME_RAG] Content script loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[RESUME_RAG] Message received:', request.action);

    if (request.action === 'fillForm') {
        const result = fillForm(request.resumeData);
        console.log('[RESUME_RAG] Final result:', result);
        sendResponse(result);
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

    // Handle Greenhouse custom dropdown components
    console.log('[RESUME_RAG] Processing custom dropdowns');
    handleCustomDropdowns();

    console.log('[RESUME_RAG] Total filled:', filledCount);
    return { success: true, filledCount };
}

function handleCustomDropdowns() {
    console.log('[RESUME_RAG] Looking for custom dropdown containers');

    // Find all select containers (the parent divs of custom selects)
    const selectContainers = document.querySelectorAll('.select-container, [class*="select-shell"]');
    console.log('[RESUME_RAG] Found custom select containers:', selectContainers.length);

    selectContainers.forEach((container, idx) => {
        // Get the label/context for this dropdown
        let context = '';

        // Look for associated label
        const label = container.previousElementSibling;
        if (label && label.tagName === 'LABEL') {
            context = label.textContent?.toLowerCase() || '';
        }

        // Or check parent for label
        if (!context && container.parentElement) {
            const parentLabel = container.parentElement.querySelector('label');
            if (parentLabel) {
                context = parentLabel.textContent?.toLowerCase() || '';
            }
        }

        // Check if this is a country/authorization dropdown
        if (/country|authorized|legal|visa|sponsorship|work.*in|require/i.test(context)) {
            console.log('[RESUME_RAG] Custom dropdown[' + idx + '] context:', context.substring(0, 50));

            // Find the clickable element (usually the select-shell div)
            const clickable = container.querySelector('[class*="select-shell"], select, button, [role="button"]');

            if (clickable) {
                console.log('[RESUME_RAG] Clicking dropdown[' + idx + ']');
                clickable.click();

                // After a short delay, find and click the USA option
                setTimeout(() => {
                    // Look for dropdown options that appeared
                    const options = document.querySelectorAll('[role="option"], [class*="option"], .gh-select-option, li');
                    let found = false;

                    for (const opt of options) {
                        const optText = opt.textContent?.toLowerCase() || '';
                        if (/^usa$|^us$|united states|america/i.test(optText)) {
                            console.log('[RESUME_RAG] Found USA option, clicking:', optText);
                            opt.click();
                            found = true;
                            break;
                        }
                    }

                    if (!found) {
                        console.log('[RESUME_RAG] USA option not found in dropdown');
                        // Try to close the dropdown by pressing Escape
                        const escapeEvent = new KeyboardEvent('keydown', {
                            key: 'Escape',
                            code: 'Escape',
                            keyCode: 27,
                            which: 27,
                            bubbles: true
                        });
                        clickable.dispatchEvent(escapeEvent);
                    }
                }, 200);
            }
        }
    });
}
