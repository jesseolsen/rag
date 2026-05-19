// Resume RAG Form Filler
console.log('[RESUME_RAG] Content script loaded');

// Store state globally for access from all handlers
window.RESUME_RAG_LAST_RESULT = null;
window.RESUME_RAG_BACKEND_URL = 'http://localhost:8000';
window.RESUME_RAG_RESUME_ORDER = [];
window.RESUME_RAG_RESUME_DATA = {};
window.RESUME_RAG_BACKEND_URL_STORED = 'http://localhost:8000';
window.RESUME_RAG_FILLED_FIELDS = {}; // Track which fields were filled by extension

// Listen for input changes on file inputs - detect when file picker opens
document.addEventListener('change', async (e) => {
    const fileInput = e.target;
    if (fileInput.type !== 'file') return;

    // If files are already selected, don't override
    if (fileInput.files && fileInput.files.length > 0) {
        console.log('[RESUME_RAG] File already selected, skipping auto-attach');
        return;
    }

    // Get context to determine which file to attach
    const context = getFileInputContext(fileInput);
    console.log('[RESUME_RAG] File input context:', context);

    let resumeFile = null;
    if (/resume|cv|curriculum/.test(context)) {
        resumeFile = window.RESUME_RAG_RESUME_ORDER?.find(r => r.enabled && r.filename.toLowerCase().includes('resume'));
    } else if (/cover|letter|motivation/.test(context)) {
        resumeFile = window.RESUME_RAG_RESUME_ORDER?.find(r => r.enabled && r.filename.toLowerCase().includes('cover'));
    }

    if (resumeFile) {
        console.log('[RESUME_RAG] Auto-attaching file:', resumeFile.filename);
        await attachFileToInput(fileInput, resumeFile.id, resumeFile.filename);
    }
}, true);

// Listen for Attach button clicks to populate file inputs
document.addEventListener('click', async (e) => {
    // Check if clicked element is an "Attach" button
    const button = e.target.closest('button');
    if (!button) return;

    const buttonText = button.textContent?.toLowerCase().trim() || '';
    console.log('[RESUME_RAG] Button clicked:', buttonText);

    if (buttonText !== 'attach') return;

    console.log('[RESUME_RAG] ========== ATTACH BUTTON CLICKED ==========');

    // Find the file input associated with this button
    const fileInput = findFileInputForButton(button);
    if (!fileInput) {
        console.log('[RESUME_RAG] Could not find file input for attach button');
        return;
    }

    console.log('[RESUME_RAG] Found file input:', { id: fileInput.id, name: fileInput.name });

    // Get context to determine which file to attach
    const context = getFileInputContext(fileInput);
    console.log('[RESUME_RAG] File input context:', context);

    let resumeFile = null;

    if (/resume|cv|curriculum/.test(context)) {
        console.log('[RESUME_RAG] Looking for Resume file...');
        resumeFile = window.RESUME_RAG_RESUME_ORDER?.find(r => r.enabled && r.filename.toLowerCase().includes('resume'));
    } else if (/cover|letter|motivation/.test(context)) {
        console.log('[RESUME_RAG] Looking for Cover Letter file...');
        resumeFile = window.RESUME_RAG_RESUME_ORDER?.find(r => r.enabled && r.filename.toLowerCase().includes('cover'));
    }

    console.log('[RESUME_RAG] Available resumes:', window.RESUME_RAG_RESUME_ORDER);
    console.log('[RESUME_RAG] Matched resume:', resumeFile);

    if (!resumeFile) {
        console.log('[RESUME_RAG] No matching resume file found');
        return;
    }

    // Pre-fetch and set the file before opening the dialog
    e.preventDefault();
    e.stopPropagation();
    await attachFileToInput(fileInput, resumeFile.id, resumeFile.filename);
}, true);

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
                const result = await fillForm(request.resumeData, request.resumeOrder, request.backendUrl);
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

            // Save form response
            await fetch(`${backendUrl}/api/v1/form-response`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: window.location.href,
                    timestamp: new Date().toISOString(),
                    data: formData
                })
            });

            // Also save individual field answers for future reuse
            await captureAndSaveFieldAnswers(formData, backendUrl);

            console.log('[RESUME_RAG] ✓ Form data and field answers saved to backend');
        } catch (err) {
            console.log('[RESUME_RAG] Could not save form data:', err.message);
        }
    }
}, true);

async function captureAndSaveFieldAnswers(formData, backendUrl) {
    // Extract question fields (often contain : or ? in the data or have question patterns)
    const textareas = document.querySelectorAll('textarea');

    for (const textarea of textareas) {
        // Get the question label from the form element
        const label = textarea.closest('label') || textarea.parentElement;
        const questionText = label?.textContent || textarea.placeholder || '';

        if (questionText && formData[textarea.id]) {
            // Only save if it's not empty and looks like a question
            if ((questionText.includes('?') || questionText.includes(':')) && formData[textarea.id].trim()) {
                try {
                    await fetch(`${backendUrl}/api/v1/field-answers/`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            question_text: questionText.trim(),
                            answer_text: formData[textarea.id],
                            field_type: 'textarea'
                        })
                    });
                    console.log('[RESUME_RAG] Saved field answer for question:', questionText.substring(0, 50));
                } catch (err) {
                    console.log('[RESUME_RAG] Could not save field answer:', err.message);
                }
            }
        }
    }
}

async function fillForm(resumeData, resumeOrder, backendUrl) {
    console.log('[RESUME_RAG] Starting form fill');
    console.log('[RESUME_RAG] Resume loaded:', resumeData.filename);

    // Store resume order and backend URL globally for Attach button handler
    window.RESUME_RAG_RESUME_ORDER = resumeOrder || [];
    window.RESUME_RAG_BACKEND_URL_STORED = backendUrl || 'http://localhost:8000';

    const data = {
        first: resumeData.first_name || '',
        last: resumeData.last_name || '',
        email: resumeData.email || '',
        phone: resumeData.phone || '',
        city: resumeData.city || '',
        linkedin: resumeData.linkedin || '',
        website: resumeData.website || ''
    };

    console.log('[RESUME_RAG] Prepared form data for filling');
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
            } else if (/acknowledge|agree|privacy|policy|data.?processing|checking|consent/i.test(context)) {
                field.checked = true;
                field.dispatchEvent(new Event('change', { bubbles: true }));
                field.dispatchEvent(new Event('click', { bubbles: true }));
                filledCount++;
                console.log('[RESUME_RAG] ✓ Checked Consent/Acknowledgement');
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

            // Skip combobox inputs - they are controlled by React Select and handled separately
            if (field.getAttribute('role') === 'combobox') {
                console.log('[RESUME_RAG] Skipping combobox input:', id);
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
                    // Track which field was filled and what value was filled
                    window.RESUME_RAG_FILLED_FIELDS[id || name] = value;
                    console.log('[RESUME_RAG] Filled:', name || id, '| count now:', filledCount);
                } catch (e) {
                    console.log('[RESUME_RAG] Error filling field:', e);
                }
            }
        }
    });

    // Handle Greenhouse custom dropdowns (asynchronously)
    console.log('[RESUME_RAG] Processing custom dropdown components');

    // First, try to pre-fill textareas with saved field answers
    filledCount += await preFillTextareasFromSavedAnswers(backendUrl);

    // Return promise that completes after dropdowns are processed
    return handleDropdowns(data, backendUrl).then((dropdownCount) => {
        let totalFilled = filledCount + dropdownCount;

        // Handle file inputs (if resumeOrder is provided)
        if (resumeOrder && resumeOrder.length > 0) {
            totalFilled += handleFileInputs(resumeOrder, backendUrl);
        }

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

async function preFillTextareasFromSavedAnswers(backendUrl) {
    console.log('[RESUME_RAG] Checking for saved field answers to pre-fill');
    let filledCount = 0;

    try {
        const textareas = document.querySelectorAll('textarea');
        if (textareas.length === 0) {
            return 0;
        }

        // Get all saved field answers from backend
        const response = await fetch(`${backendUrl}/api/v1/field-answers/`);
        if (!response.ok) {
            console.log('[RESUME_RAG] Could not fetch saved field answers');
            return 0;
        }

        const data = await response.json();
        const savedAnswers = data.answers || [];
        console.log('[RESUME_RAG] Found', savedAnswers.length, 'saved field answers');

        // Try to match each textarea with a saved answer
        for (const textarea of textareas) {
            // Get the question text from the form
            const label = textarea.closest('label') || textarea.parentElement;
            const questionText = label?.textContent || textarea.placeholder || '';

            if (!questionText || questionText.length < 5) {
                continue; // Skip if we can't find a meaningful question
            }

            console.log('[RESUME_RAG] Looking for answer to:', questionText.substring(0, 50));

            // Use the backend search endpoint to find matching answers
            try {
                const searchResponse = await fetch(
                    `${backendUrl}/api/v1/field-answers/search/by-question?question_text=${encodeURIComponent(questionText)}`
                );

                if (searchResponse.ok) {
                    const searchData = await searchResponse.json();
                    const matches = searchData.matches || [];

                    if (matches.length > 0) {
                        // Use the best match (highest score)
                        const bestMatch = matches[0];
                        console.log('[RESUME_RAG] Found matching answer with score', bestMatch.score);

                        // Fill the textarea
                        textarea.value = bestMatch.answer_text;
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                        textarea.dispatchEvent(new Event('change', { bubbles: true }));
                        filledCount++;

                        // Visual feedback
                        textarea.style.backgroundColor = '#ffffcc';
                        setTimeout(() => {
                            textarea.style.backgroundColor = '';
                        }, 1500);
                    }
                }
            } catch (err) {
                console.log('[RESUME_RAG] Error searching for field answer:', err.message);
            }
        }

        console.log('[RESUME_RAG] Pre-filled', filledCount, 'textareas from saved answers');

        // Now try to pre-fill native select dropdowns
        const selectElements = document.querySelectorAll('select');
        console.log('[RESUME_RAG] Found', selectElements.length, 'select dropdowns to potentially pre-fill');

        for (const select of selectElements) {
            // Get the question text
            let questionText = '';
            const label = select.closest('label') || select.parentElement;
            questionText = label?.textContent || select.title || '';

            if (!questionText || questionText.length < 5) {
                continue;
            }

            console.log('[RESUME_RAG] Searching for answer to select:', questionText.substring(0, 50));

            try {
                const searchResponse = await fetch(
                    `${backendUrl}/api/v1/field-answers/search/by-question?question_text=${encodeURIComponent(questionText)}`
                );

                if (searchResponse.ok) {
                    const searchData = await searchResponse.json();
                    const matches = searchData.matches || [];

                    if (matches.length > 0) {
                        const bestMatch = matches[0];
                        console.log('[RESUME_RAG] Found select answer:', bestMatch.answer_text, 'score:', bestMatch.score);

                        // Try to find and select the matching option
                        for (const option of select.options || []) {
                            if (option.text.trim() === bestMatch.answer_text.trim()) {
                                select.value = option.value;
                                select.dispatchEvent(new Event('change', { bubbles: true }));
                                filledCount++;
                                console.log('[RESUME_RAG] ✓ Pre-filled select with:', bestMatch.answer_text);
                                break;
                            }
                        }
                    }
                }
            } catch (err) {
                console.log('[RESUME_RAG] Error searching for select answer:', err.message);
            }
        }

        // Try to pre-fill Yes/No div elements (custom components)
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        const yesNoElements = new Set();
        let node;
        while (node = walker.nextNode()) {
            if ((node.textContent.trim() === 'Yes' || node.textContent.trim() === 'No') && node.parentElement) {
                yesNoElements.add(node.parentElement);
            }
        }
        console.log('[RESUME_RAG] Found', yesNoElements.size, 'Yes/No div elements to potentially pre-fill');

        for (const elem of yesNoElements) {
            // Get question text from surrounding elements
            let questionText = '';
            let current = elem.parentElement;
            let depth = 0;

            // First, try siblings
            let sibling = elem.previousElementSibling;
            while (sibling && !questionText && depth < 5) {
                const text = sibling.textContent?.substring(0, 300) || '';
                if (text.includes('?')) {
                    questionText = text.trim();
                    break;
                }
                sibling = sibling.previousElementSibling;
                depth++;
            }

            // If no sibling, traverse up parent tree
            depth = 0;
            current = elem.parentElement;
            while (current && !questionText && depth < 10) {
                const allText = current.textContent?.substring(0, 400) || '';
                if (allText.includes('?')) {
                    questionText = allText.trim();
                    break;
                }
                current = current.parentElement;
                depth++;
            }

            if (!questionText || questionText.length < 5) {
                continue;
            }

            console.log('[RESUME_RAG] Searching for pre-fill answer to Yes/No:', questionText.substring(0, 50));

            try {
                const searchResponse = await fetch(
                    `${backendUrl}/api/v1/field-answers/search/by-question?question_text=${encodeURIComponent(questionText)}`
                );

                if (searchResponse.ok) {
                    const searchData = await searchResponse.json();
                    const matches = searchData.matches || [];

                    if (matches.length > 0) {
                        const bestMatch = matches[0];
                        const answerValue = bestMatch.answer_text.trim();

                        // Find and click the appropriate Yes or No button
                        let targetButton = null;
                        const buttons = elem.querySelectorAll('button, [role="button"], div[role="button"]');

                        for (const btn of buttons) {
                            const btnText = btn.textContent?.trim() || '';
                            if ((answerValue.toLowerCase() === 'yes' && btnText.toLowerCase() === 'yes') ||
                                (answerValue.toLowerCase() === 'no' && btnText.toLowerCase() === 'no')) {
                                targetButton = btn;
                                break;
                            }
                        }

                        if (targetButton) {
                            console.log('[RESUME_RAG] Clicking Yes/No button:', answerValue);
                            targetButton.click();
                            filledCount++;

                            // Dispatch events to notify the form
                            targetButton.dispatchEvent(new Event('click', { bubbles: true }));
                            targetButton.dispatchEvent(new Event('change', { bubbles: true }));
                        } else {
                            console.log('[RESUME_RAG] Could not find Yes/No button for:', answerValue);
                        }
                    }
                }
            } catch (err) {
                console.log('[RESUME_RAG] Error searching for Yes/No pre-fill:', err.message);
            }
        }

        console.log('[RESUME_RAG] Pre-filled', filledCount, 'fields total (textareas + selects)');
    } catch (err) {
        console.log('[RESUME_RAG] Error in preFillTextareasFromSavedAnswers:', err.message);
    }

    return filledCount;
}

async function handleDropdowns(data, backendUrl) {
    console.log('[RESUME_RAG] Processing dropdowns');
    console.log('[RESUME_RAG] Backend URL for dropdown filling:', backendUrl);

    let processedCount = 0;

    // Wait for location field to appear in DOM (form loads asynchronously)
    let locationInput = document.querySelector('input#candidate-location');
    if (!locationInput) {
        console.log('[RESUME_RAG] Waiting for location field to load...');
        for (let i = 0; i < 30; i++) {
            await sleep(100);
            locationInput = document.querySelector('input#candidate-location');
            if (locationInput) {
                console.log('[RESUME_RAG] Location field found after', i * 100, 'ms');
                break;
            }
        }
    }

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
    if (locationInput && data.city) {
        console.log('[RESUME_RAG] Processing location dropdown');
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

        // Type the city from resume data
        const locationText = data.city;
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

        console.log('[RESUME_RAG] Typed location:', locationText, ', waiting for dropdown to render...');
        await sleep(1000);

        // Press Enter to select the location
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

        console.log('[RESUME_RAG] Pressed ENTER, now pressing TAB to commit selection...');
        await sleep(150);

        // Press TAB to move focus and commit the selection
        const tabEvent = new KeyboardEvent('keydown', {
            key: 'Tab',
            code: 'Tab',
            bubbles: true,
            cancelable: true
        });
        locationInput.dispatchEvent(tabEvent);

        const tabEventUp = new KeyboardEvent('keyup', {
            key: 'Tab',
            code: 'Tab',
            bubbles: true,
            cancelable: true
        });
        locationInput.dispatchEvent(tabEventUp);

        console.log('[RESUME_RAG] ✓ Location dropdown processed');
        await sleep(150);
        processedCount++;
    }

    // Find all React Select combobox inputs
    const inputs = document.querySelectorAll('input[role="combobox"]');
    console.log('[RESUME_RAG] Found ' + inputs.length + ' combobox inputs');

    const dropdownConfig = {};

    // Dynamically build config by finding saved answers for each combobox
    for (const input of inputs) {
        const fieldId = input.id || '';

        // Skip country and phone inputs - already handled above
        if (fieldId === 'country' || fieldId.includes('iti')) {
            continue;
        }

        // Try to find the question text associated with this input
        let questionText = '';
        let parent = input.closest('label') || input.closest('[role="group"]') || input.parentElement;

        if (parent) {
            const labelElement = parent.querySelector('label');
            if (labelElement) {
                questionText = labelElement.textContent?.trim() || '';
            }
        }

        if (!questionText) {
            // Try to find question in parent containers
            let current = input.parentElement;
            let depth = 0;
            while (current && !questionText && depth < 10) {
                const allText = current.textContent?.substring(0, 200) || '';
                if (allText.includes('?')) {
                    questionText = allText.trim();
                    break;
                }
                current = current.parentElement;
                depth++;
            }
        }

        if (questionText && questionText.length > 5) {
            // Search for a matching saved answer
            try {
                const searchResponse = await fetch(
                    `${backendUrl}/api/v1/field-answers/search/by-question?question_text=${encodeURIComponent(questionText)}`
                );

                if (searchResponse.ok) {
                    const searchData = await searchResponse.json();
                    const matches = searchData.matches || [];

                    if (matches.length > 0) {
                        const bestMatch = matches[0];
                        console.log('[RESUME_RAG] Found saved answer for combobox ' + fieldId + ': ' + bestMatch.answer_text);
                        dropdownConfig[fieldId] = bestMatch.answer_text;
                    }
                }
            } catch (err) {
                console.log('[RESUME_RAG] Error searching for combobox answer:', err.message);
            }
        }
    }

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

        // Track that this dropdown was filled
        window.RESUME_RAG_FILLED_FIELDS[fieldId] = targetValue;
        console.log('[RESUME_RAG] Tracked dropdown:', fieldId, '=', targetValue);

        processedCount++;
    }

    console.log('[RESUME_RAG] Dropdown processing complete. Processed: ' + processedCount);
    return processedCount;
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

function handleFileInputs(resumeOrder, backendUrl) {
    let fileCount = 0;

    // Find enabled resumes
    const enabledResumes = resumeOrder.filter(r => r.enabled);
    if (enabledResumes.length === 0) return 0;

    // Find resumes with matching filenames
    const resumeFile = enabledResumes.find(r => r.filename.toLowerCase().includes('resume'));
    const coverFile = enabledResumes.find(r => r.filename.toLowerCase().includes('cover'));

    // Process file inputs
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach(input => {
        if (!input.offsetHeight) return; // Skip hidden

        // Get label context
        let label = '';
        try {
            if (input.id) {
                const lbl = document.querySelector(`label[for="${input.id}"]`);
                if (lbl) label = lbl.textContent?.toLowerCase() || '';
            }
        } catch (e) {}

        const context = `${input.id?.toLowerCase() || ''}|${input.name?.toLowerCase() || ''}|${label}`;

        // Match Resume/CV field
        if (/resume|cv|curriculum/.test(context) && resumeFile) {
            fetchAndSetFile(input, resumeFile.id, backendUrl);
            fileCount++;
        }
        // Match Cover Letter field
        else if (/cover|letter|motivation/.test(context) && coverFile) {
            fetchAndSetFile(input, coverFile.id, backendUrl);
            fileCount++;
        }
    });

    return fileCount;
}

async function fetchAndSetFile(fileInput, resumeId, backendUrl) {
    try {
        console.log('[RESUME_RAG] fetchAndSetFile called:', { resumeId, backendUrl });
        const response = await fetch(`${backendUrl}/api/v1/resume/${resumeId}/file`);
        if (!response.ok) {
            console.log('[RESUME_RAG] Failed to fetch resume file:', response.status);
            return;
        }

        const blob = await response.blob();
        console.log('[RESUME_RAG] Got blob:', blob.size, 'bytes, type:', blob.type);

        const resume = window.RESUME_RAG_RESUME_ORDER.find(r => r.id === resumeId);
        if (!resume) {
            console.log('[RESUME_RAG] Resume not found in window.RESUME_RAG_RESUME_ORDER');
            return;
        }

        // Create a File from the blob
        const file = new File([blob], resume.filename, { type: blob.type });
        console.log('[RESUME_RAG] Created File object:', file.name, file.size, 'bytes');

        // Use DataTransfer to set the file
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;

        // Dispatch change event
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        fileInput.dispatchEvent(new Event('input', { bubbles: true }));
        console.log('[RESUME_RAG] ✓ Set file input:', resume.filename);
    } catch (error) {
        console.log('[RESUME_RAG] Error setting file:', error.message, error.stack);
    }
}

function findFileInputForButton(button) {
    // Look for file input in the same container/section
    let container = button.closest('fieldset') || button.closest('section') || button.closest('div[class*="field"]') || button.closest('form');
    if (container) {
        return container.querySelector('input[type="file"]');
    }
    // Fallback: search upward for nearby file input
    let current = button;
    for (let i = 0; i < 5; i++) {
        current = current.parentElement;
        if (!current) break;
        const input = current.querySelector('input[type="file"]');
        if (input) return input;
    }
    return null;
}

function getFileInputContext(fileInput) {
    // Get context from labels and parent elements
    let context = '';

    // Look for label in parent container
    let container = fileInput.closest('fieldset') || fileInput.closest('section') || fileInput.closest('div[class*="field"]');
    if (container) {
        const label = container.querySelector('label');
        if (label) context = label.textContent?.toLowerCase() || '';
    }

    // Also check nearby text/labels
    let parent = fileInput.parentElement;
    while (parent && parent !== document.body) {
        const text = parent.textContent?.toLowerCase() || '';
        if (text.includes('resume') || text.includes('cover') || text.includes('cv')) {
            context += ' ' + text;
            break;
        }
        parent = parent.parentElement;
    }

    return context;
}


async function attachFileToInput(fileInput, resumeId, filename) {
    try {
        const backendUrl = window.RESUME_RAG_BACKEND_URL_STORED;
        console.log('[RESUME_RAG] attachFileToInput called:', { resumeId, filename, backendUrl });

        const response = await fetch(`${backendUrl}/api/v1/resume/${resumeId}/file`);
        if (!response.ok) {
            console.log('[RESUME_RAG] Failed to fetch file for attach:', response.status);
            return;
        }

        const blob = await response.blob();
        console.log('[RESUME_RAG] Got file blob:', blob.size, 'bytes');

        const file = new File([blob], filename, { type: blob.type });

        // Use DataTransfer to set the file
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;

        // Dispatch change and input events
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        fileInput.dispatchEvent(new Event('input', { bubbles: true }));
        console.log('[RESUME_RAG] ✓ Attached file via button:', filename);
    } catch (error) {
        console.log('[RESUME_RAG] Error attaching file:', error.message, error.stack);
    }
}

// Listen for capture answers request from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'captureAnswers') {
        console.log('[RESUME_RAG] Capture answers requested');
        captureAnswersFromCurrentForm(request.backendUrl, window.RESUME_RAG_FILLED_FIELDS).then((result) => {
            sendResponse(result);
        }).catch((error) => {
            console.log('[RESUME_RAG] Error capturing answers:', error.message);
            sendResponse({ success: false, error: error.message });
        });
        return true; // Keep channel open for async response
    }
});

async function captureAnswersFromCurrentForm(backendUrl, filledFields) {
    console.log('[RESUME_RAG] Capturing answers from current form');
    console.log('[RESUME_RAG] Filled fields:', filledFields);

    let capturedCount = 0;
    const savedAnswers = new Set(); // Track what we've saved to avoid duplicates

    // Capture textarea answers
    const textareas = document.querySelectorAll('textarea');
    for (const textarea of textareas) {
        const fieldId = textarea.id;
        const currentValue = textarea.value.trim();

        if (!currentValue) continue;

        const label = textarea.closest('label') || textarea.parentElement;
        const questionText = (label?.textContent || textarea.placeholder || '').trim();

        if (!questionText || questionText.length < 5) continue;

        const wasFilledByExtension = filledFields && filledFields[fieldId];
        let shouldCapture = false;

        if (!wasFilledByExtension) {
            shouldCapture = true;
            console.log('[RESUME_RAG] Capturing new field (not filled by extension):', questionText.substring(0, 50));
        } else {
            const originalValue = filledFields[fieldId];
            if (originalValue !== currentValue) {
                shouldCapture = true;
                console.log('[RESUME_RAG] Capturing modified field:', questionText.substring(0, 50));
            }
        }

        if (shouldCapture) {
            // Check for duplicates within this session
            const answerKey = `${questionText}||${currentValue}`;
            if (savedAnswers.has(answerKey)) {
                console.log('[RESUME_RAG] Skipping duplicate answer for:', questionText.substring(0, 50));
                continue;
            }
            savedAnswers.add(answerKey);

            try {
                const response = await fetch(`${backendUrl}/api/v1/field-answers/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        question_text: questionText,
                        answer_text: currentValue,
                        field_type: 'textarea'
                    })
                });
                if (response.ok) {
                    capturedCount++;
                    console.log('[RESUME_RAG] ✓ Saved answer for:', questionText.substring(0, 50));
                }
            } catch (error) {
                console.log('[RESUME_RAG] Error saving textarea answer:', error.message);
            }
        }
    }

    // Capture custom Yes/No div elements
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    const yesNoElements = new Set();
    let node;
    while (node = walker.nextNode()) {
        if ((node.textContent.trim() === 'Yes' || node.textContent.trim() === 'No') && node.parentElement) {
            yesNoElements.add(node.parentElement);
        }
    }
    console.log('[RESUME_RAG] Found', yesNoElements.size, 'elements containing Yes/No text');

    for (const elem of yesNoElements) {
        const currentValue = elem.textContent?.trim() || '';
        console.log('[RESUME_RAG] Yes/No element:', {
            tag: elem.tagName,
            type: elem.type,
            value: elem.value,
            checked: elem.checked,
            text: currentValue
        });

        if (!currentValue || !/(Yes|No)/i.test(currentValue)) continue;

        const fieldId = elem.id || elem.name || `yesno_${Math.random()}`;

        // Get question text from surrounding elements
        let questionText = '';
        let current = elem.parentElement;
        let depth = 0;

        // First, try siblings (usually the question is right before the Yes/No div)
        let sibling = elem.previousElementSibling;
        while (sibling && !questionText && depth < 5) {
            const text = sibling.textContent?.substring(0, 300) || '';
            if (text.includes('?')) {
                questionText = text.trim();
                break;
            }
            sibling = sibling.previousElementSibling;
            depth++;
        }

        // If no sibling has question, traverse up to find question text in parent containers
        depth = 0;
        current = elem.parentElement;
        while (current && !questionText && depth < 10) {
            const allText = current.textContent?.substring(0, 400) || '';
            if (allText.includes('?')) {
                questionText = allText.trim();
                break;
            }
            current = current.parentElement;
            depth++;
        }

        if (!questionText || questionText.length < 5) {
            console.log('[RESUME_RAG] Could not find question text for Yes/No element');
            continue;
        }

        const wasFilledByExtension = filledFields && filledFields[fieldId];
        let shouldCapture = false;

        if (!wasFilledByExtension) {
            shouldCapture = true;
            console.log('[RESUME_RAG] Capturing new Yes/No field (not filled by extension):', questionText.substring(0, 50));
        } else {
            const originalValue = filledFields[fieldId];
            if (originalValue !== currentValue) {
                shouldCapture = true;
                console.log('[RESUME_RAG] Capturing modified Yes/No field:', questionText.substring(0, 50));
            }
        }

        if (shouldCapture) {
            // Check for duplicates
            const answerKey = `${questionText}||${currentValue}`;
            if (savedAnswers.has(answerKey)) {
                console.log('[RESUME_RAG] Skipping duplicate Yes/No answer for:', questionText.substring(0, 50));
                continue;
            }
            savedAnswers.add(answerKey);

            try {
                const response = await fetch(`${backendUrl}/api/v1/field-answers/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        question_text: questionText,
                        answer_text: currentValue,
                        field_type: 'yes_no'
                    })
                });
                if (response.ok) {
                    capturedCount++;
                    console.log('[RESUME_RAG] ✓ Saved Yes/No answer for:', questionText.substring(0, 50));
                }
            } catch (error) {
                console.log('[RESUME_RAG] Error saving Yes/No answer:', error.message);
            }
        }
    }

    // Capture native select dropdown answers
    const selectElements = document.querySelectorAll('select');
    console.log('[RESUME_RAG] Found', selectElements.length, 'select elements');
    for (const select of selectElements) {
        const fieldId = select.id || select.name;
        const currentValue = select.value?.trim() || '';
        const selectedOption = select.options?.[select.selectedIndex];
        const selectedText = selectedOption?.text?.trim() || '';
        const allOptions = Array.from(select.options || []).map(opt => ({ text: opt.text, value: opt.value }));

        console.log('[RESUME_RAG] Select element - id:', fieldId, 'value:', currentValue, 'text:', selectedText, 'selectedIndex:', select.selectedIndex, 'allOptions:', allOptions);

        // Use selectedText if available (more reliable than value)
        const valueToCapture = selectedText || currentValue || '';

        if (!valueToCapture || valueToCapture === 'Select...' || select.selectedIndex === 0) {
            console.log('[RESUME_RAG] Skipping empty select element (value:', valueToCapture, ')');
            continue;
        }

        // Get question text
        let questionText = '';
        let parent = select.closest('label') || select.closest('fieldset') || select.closest('div[class*="field"]');

        if (parent) {
            const labelElement = parent.querySelector('label');
            if (labelElement) {
                questionText = labelElement.textContent?.trim() || '';
            }
        }

        if (!questionText) {
            let current = select.parentElement;
            while (current && !questionText && current.tagName !== 'BODY') {
                const allText = current.textContent?.substring(0, 200) || '';
                if (allText.includes('?') || allText.includes(':')) {
                    questionText = allText.trim();
                    break;
                }
                current = current.parentElement;
            }
        }

        if (!questionText || questionText.length < 5) continue;

        const wasFilledByExtension = filledFields && filledFields[fieldId];
        let shouldCapture = false;

        if (!wasFilledByExtension) {
            shouldCapture = true;
            console.log('[RESUME_RAG] Capturing new select field (not filled by extension):', questionText.substring(0, 50));
        } else {
            const originalValue = filledFields[fieldId];
            if (originalValue !== currentValue) {
                shouldCapture = true;
                console.log('[RESUME_RAG] Capturing modified select field:', questionText.substring(0, 50));
            }
        }

        if (shouldCapture) {
            // Check for duplicates
            const answerKey = `${questionText}||${valueToCapture}`;
            if (savedAnswers.has(answerKey)) {
                console.log('[RESUME_RAG] Skipping duplicate select answer for:', questionText.substring(0, 50));
                continue;
            }
            savedAnswers.add(answerKey);

            try {
                const response = await fetch(`${backendUrl}/api/v1/field-answers/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        question_text: questionText,
                        answer_text: valueToCapture,
                        field_type: 'select'
                    })
                });
                if (response.ok) {
                    capturedCount++;
                    console.log('[RESUME_RAG] ✓ Saved select answer for:', questionText.substring(0, 50), 'value:', valueToCapture);
                }
            } catch (error) {
                console.log('[RESUME_RAG] Error saving select answer:', error.message);
            }
        }
    }

    // Capture radio button and checkbox selections
    const radioAndCheckboxes = document.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked');
    console.log('[RESUME_RAG] Found', radioAndCheckboxes.length, 'checked radio/checkbox elements');
    for (const elem of radioAndCheckboxes) {
        const fieldId = elem.id || elem.name || '';
        const currentValue = elem.value?.trim() || 'checked';

        // Get question text from label or surrounding elements
        let questionText = '';
        const label = document.querySelector(`label[for="${elem.id}"]`);
        if (label) {
            questionText = label.textContent?.trim() || '';
        }

        if (!questionText) {
            let parent = elem.closest('fieldset') || elem.closest('div[class*="field"]') || elem.closest('form');
            if (parent) {
                const allText = parent.textContent?.substring(0, 200) || '';
                if (allText.includes('?') || allText.includes(':')) {
                    questionText = allText.trim();
                }
            }
        }

        if (!questionText || questionText.length < 5) continue;

        const wasFilledByExtension = filledFields && filledFields[fieldId];
        let shouldCapture = false;

        if (!wasFilledByExtension) {
            shouldCapture = true;
            console.log('[RESUME_RAG] Capturing new radio/checkbox field:', questionText.substring(0, 50));
        } else {
            const originalValue = filledFields[fieldId];
            if (originalValue !== currentValue) {
                shouldCapture = true;
                console.log('[RESUME_RAG] Capturing modified radio/checkbox field:', questionText.substring(0, 50));
            }
        }

        if (shouldCapture) {
            // Check for duplicates
            const answerKey = `${questionText}||${currentValue}`;
            if (savedAnswers.has(answerKey)) {
                console.log('[RESUME_RAG] Skipping duplicate radio/checkbox answer for:', questionText.substring(0, 50));
                continue;
            }
            savedAnswers.add(answerKey);

            try {
                const response = await fetch(`${backendUrl}/api/v1/field-answers/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        question_text: questionText,
                        answer_text: currentValue,
                        field_type: 'radio'
                    })
                });
                if (response.ok) {
                    capturedCount++;
                    console.log('[RESUME_RAG] ✓ Saved radio/checkbox answer for:', questionText.substring(0, 50));
                }
            } catch (error) {
                console.log('[RESUME_RAG] Error saving radio/checkbox answer:', error.message);
            }
        }
    }

    // Capture React Select dropdown answers (Yes/No questions)
    const comboboxInputs = document.querySelectorAll('[role="combobox"]');
    for (const input of comboboxInputs) {
        const fieldId = input.id;
        const currentValue = input.value?.trim() || '';

        if (!currentValue || currentValue === 'Select...') continue;

        // Get question text from surrounding elements
        let questionText = '';
        let parent = input.closest('label') || input.closest('fieldset') || input.closest('div[class*="field"]');

        if (parent) {
            const labelElement = parent.querySelector('label');
            if (labelElement) {
                questionText = labelElement.textContent?.trim() || '';
            }
        }

        if (!questionText) {
            // Try to find label by traversing up the DOM
            let current = input.parentElement;
            while (current && !questionText && current.tagName !== 'BODY') {
                const allText = current.textContent?.substring(0, 200) || '';
                if (allText.includes('?') || allText.includes(':')) {
                    questionText = allText.trim();
                    break;
                }
                current = current.parentElement;
            }
        }

        if (!questionText || questionText.length < 5) continue;

        // Check if this field was filled by extension
        const wasFilledByExtension = filledFields && filledFields[fieldId];
        let shouldCapture = false;

        if (!wasFilledByExtension) {
            shouldCapture = true;
            console.log('[RESUME_RAG] Capturing new dropdown field (not filled by extension):', questionText.substring(0, 50));
        } else {
            const originalValue = filledFields[fieldId];
            if (originalValue !== currentValue) {
                shouldCapture = true;
                console.log('[RESUME_RAG] Capturing modified dropdown field:', questionText.substring(0, 50));
            }
        }

        if (shouldCapture) {
            // Check for duplicates
            const answerKey = `${questionText}||${currentValue}`;
            if (savedAnswers.has(answerKey)) {
                console.log('[RESUME_RAG] Skipping duplicate dropdown answer for:', questionText.substring(0, 50));
                continue;
            }
            savedAnswers.add(answerKey);

            try {
                const response = await fetch(`${backendUrl}/api/v1/field-answers/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        question_text: questionText,
                        answer_text: currentValue,
                        field_type: 'dropdown'
                    })
                });
                if (response.ok) {
                    capturedCount++;
                    console.log('[RESUME_RAG] ✓ Saved dropdown answer for:', questionText.substring(0, 50));
                }
            } catch (error) {
                console.log('[RESUME_RAG] Error saving dropdown answer:', error.message);
            }
        }
    }

    console.log('[RESUME_RAG] Captured', capturedCount, 'new/modified answers');
    return {
        success: true,
        capturedCount: capturedCount,
        message: `Captured ${capturedCount} new or modified answer${capturedCount !== 1 ? 's' : ''}`
    };
}
