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

    // Method 1: Look for .select-container
    let selectContainers = Array.from(document.querySelectorAll('.select-container'));
    console.log('[RESUME_RAG] Found ' + selectContainers.length + ' .select-container elements');

    // Method 2: If no .select-container, look for elements with "Select..." text
    if (selectContainers.length === 0) {
        console.log('[RESUME_RAG] No .select-container found, searching for "Select..." text');
        const selectTexts = Array.from(document.querySelectorAll('*')).filter(el =>
            el.textContent.trim() === 'Select...' && el.offsetHeight > 0
        );
        console.log('[RESUME_RAG] Found ' + selectTexts.length + ' elements with "Select..." text');

        // Get parent containers for these elements
        selectContainers = selectTexts.map(el => {
            // Walk up to find a clickable parent
            let parent = el.parentElement;
            while (parent && !parent.onclick && parent.getAttribute('role') !== 'button') {
                parent = parent.parentElement;
            }
            return parent || el;
        });

        console.log('[RESUME_RAG] Extracted ' + selectContainers.length + ' container parents');
    }

    selectContainers.forEach((container, idx) => {
        // Get the label for this container
        let labelText = '';

        // Method 1: Check previous sibling
        let prevEl = container.previousElementSibling;
        if (prevEl && prevEl.tagName === 'LABEL') {
            labelText = prevEl.textContent?.toLowerCase() || '';
        }

        // Method 2: Check parent's label
        if (!labelText) {
            const parentLabel = container.parentElement?.querySelector('label');
            if (parentLabel) {
                labelText = parentLabel.textContent?.toLowerCase() || '';
            }
        }

        // Method 3: Check siblings within parent
        if (!labelText) {
            const parent = container.parentElement;
            if (parent) {
                const label = parent.querySelector('label');
                if (label) {
                    labelText = label.textContent?.toLowerCase() || '';
                }
            }
        }

        console.log('[RESUME_RAG] Container[' + idx + ']: "' + labelText.substring(0, 60) + '"');

        // Determine what value to select
        let targetValue = null;

        if (/have you ever worked|worked.*before|prior.*experience/i.test(labelText)) {
            targetValue = 'No';
            console.log('[RESUME_RAG]   -> Prior experience question, select: No');
        } else if (/authorized|legal.*work|right.*work|eligib|work.*country/i.test(labelText)) {
            targetValue = 'Yes';
            console.log('[RESUME_RAG]   -> Work authorization question, select: Yes');
        } else if (/visa|sponsor|require.*employ|h-?1|h-?1?b/i.test(labelText)) {
            targetValue = 'No';
            console.log('[RESUME_RAG]   -> Visa question, select: No');
        } else if (/acknowledge|agree|privacy|processing|data/i.test(labelText)) {
            targetValue = 'Yes';
            console.log('[RESUME_RAG]   -> Acknowledgement question, select: Yes');
        } else if (/country|nation|location/i.test(labelText)) {
            targetValue = 'United States';
            console.log('[RESUME_RAG]   -> Country question, select: United States');
        }

        if (targetValue) {
            const clickable = container.querySelector('[class*="select-shell"], button, [role="button"]');

            if (clickable) {
                console.log('[RESUME_RAG]   Clicking dropdown...');
                clickable.click();

                // Wait for dropdown to open
                setTimeout(() => {
                    const options = document.querySelectorAll('[role="option"], [class*="option"], li');
                    console.log('[RESUME_RAG]   Found ' + options.length + ' options, looking for "' + targetValue + '"');

                    let found = false;
                    for (const opt of options) {
                        const optText = opt.textContent?.trim() || '';

                        // For country, match "United States +1"
                        if (targetValue === 'United States' && /united states\s*\+/i.test(optText)) {
                            console.log('[RESUME_RAG]   Found country option: ' + optText);
                            opt.click();
                            found = true;
                            break;
                        }
                        // For Yes/No, exact match
                        else if (optText === targetValue) {
                            console.log('[RESUME_RAG]   Found option: ' + optText);
                            opt.click();
                            found = true;
                            break;
                        }
                    }

                    if (!found) {
                        console.log('[RESUME_RAG]   Option not found, closing dropdown');
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
        }
    });
}
