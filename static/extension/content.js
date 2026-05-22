// Resume RAG Form Filler
console.log('[RESUME_RAG] Content script loaded');

// Store state globally for access from all handlers
window.RESUME_RAG_LAST_RESULT = null;
window.RESUME_RAG_BACKEND_URL = 'http://localhost:8000';
window.RESUME_RAG_RESUME_ORDER = [];
window.RESUME_RAG_RESUME_DATA = {};
window.RESUME_RAG_BACKEND_URL_STORED = 'http://localhost:8000';
window.RESUME_RAG_FILLED_FIELDS = {}; // Track which fields were filled by extension
window.RESUME_RAG_EXTENSION_ACTIVE = false; // Only true when user explicitly uses extension on this page

// Helper function to make API requests through background script (avoids CORS issues with localhost)
async function apiRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: 'apiRequest',
            url: url,
            method: options.method || 'GET',
            headers: options.headers || {},
            body: options.body
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else if (!response) {
                reject(new Error('No response from background script'));
            } else if (response.error) {
                reject(new Error(response.error));
            } else {
                // Return a fetch-like response object
                resolve({
                    ok: response.ok,
                    status: response.status,
                    json: async () => response.data,
                    arrayBuffer: async () => {
                        if (response.data && response.data._binary) {
                            const binaryStr = atob(response.data.base64);
                            const bytes = new Uint8Array(binaryStr.length);
                            for (let i = 0; i < binaryStr.length; i++) {
                                bytes[i] = binaryStr.charCodeAt(i);
                            }
                            return bytes.buffer;
                        }
                        return response.data;
                    },
                    blob: async () => {
                        if (response.data && response.data._binary) {
                            const binaryStr = atob(response.data.base64);
                            const bytes = new Uint8Array(binaryStr.length);
                            for (let i = 0; i < binaryStr.length; i++) {
                                bytes[i] = binaryStr.charCodeAt(i);
                            }
                            return new Blob([bytes], { type: response.data.contentType || 'application/octet-stream' });
                        }
                        return new Blob([JSON.stringify(response.data)], { type: 'application/json' });
                    }
                });
            }
        });
    });
}

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

    if (request.action === 'captureAnswers') {
        console.log('[RESUME_RAG] Capture answers requested');
        // Mark extension as active when user manually captures answers
        window.RESUME_RAG_EXTENSION_ACTIVE = true;

        captureAnswersFromCurrentForm(request.backendUrl, window.RESUME_RAG_FILLED_FIELDS).then((result) => {
            sendResponse(result);
        }).catch((error) => {
            console.log('[RESUME_RAG] Error capturing answers:', error.message);
            sendResponse({ success: false, error: error.message });
        });
        return true; // Keep channel open for async response
    }
});

// Helper function to extract company name from page
function extractCompanyName() {
    // Try multiple strategies to find company name

    // 1. Meta tags
    const ogSiteName = document.querySelector('meta[property="og:site_name"]')?.content;
    if (ogSiteName && ogSiteName.length > 2 && ogSiteName.length < 100) {
        return ogSiteName;
    }

    // 2. Page title - extract company name from patterns like "Company Name - Job Title"
    const title = document.title;
    if (title) {
        // Try splitting on common separators
        const parts = title.split(/[\|\-–—]/);
        if (parts.length > 1) {
            // Usually company name is at the end or beginning
            const lastPart = parts[parts.length - 1].trim();
            const firstPart = parts[0].trim();

            // Prefer the part that doesn't contain common job-related words
            if (!/job|career|application|apply|hiring|position/i.test(lastPart) && lastPart.length < 50) {
                return lastPart;
            }
            if (!/job|career|application|apply|hiring|position/i.test(firstPart) && firstPart.length < 50) {
                return firstPart;
            }
        }
    }

    // 3. Look for company name in form fields or labels
    const companyInputs = document.querySelectorAll('input[name*="company"], input[id*="company"]');
    for (const input of companyInputs) {
        if (input.value && input.value.length > 2) {
            return input.value.trim();
        }
    }

    // 4. Check hostname as fallback
    const hostname = window.location.hostname;
    const domain = hostname.replace(/^(www\.|jobs\.|careers\.)/, '');
    const companyFromDomain = domain.split('.')[0];

    // Capitalize first letter
    return companyFromDomain.charAt(0).toUpperCase() + companyFromDomain.slice(1);
}

// Helper function to track job application in Google Sheets
async function trackJobApplication(backendUrl) {
    try {
        const companyName = extractCompanyName();
        const jobUrl = window.location.href;

        console.log('[RESUME_RAG] Tracking job application:', companyName, 'at', jobUrl);

        const response = await apiRequest(`${backendUrl}/api/v1/tracking/job-application`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                company_name: companyName,
                job_url: jobUrl
            })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                console.log('[RESUME_RAG] ✓ Tracked application to:', companyName);
            } else {
                console.log('[RESUME_RAG] Tracking not enabled:', data.message);
            }
        }
    } catch (err) {
        console.log('[RESUME_RAG] Error tracking job application:', err.message);
    }
}

// Auto-capture answers on form submission
document.addEventListener('submit', async (e) => {
    // Only auto-capture if user has explicitly used the extension on this page
    if (!window.RESUME_RAG_EXTENSION_ACTIVE) {
        console.log('[RESUME_RAG] Form submission detected but extension not active - skipping auto-capture');
        return;
    }

    console.log('[RESUME_RAG] Form submission detected - auto-capturing answers');
    const backendUrl = window.RESUME_RAG_BACKEND_URL || 'http://localhost:8000';

    try {
        const result = await captureAnswersFromCurrentForm(backendUrl, window.RESUME_RAG_FILLED_FIELDS);
        console.log('[RESUME_RAG] ✓ Auto-captured on submit:', result.capturedCount, 'answers');

        // Track job application in Google Sheets
        await trackJobApplication(backendUrl);
    } catch (err) {
        console.log('[RESUME_RAG] Error auto-capturing on submit:', err.message);
    }
}, true);

// Auto-capture on Continue/Next/Save button clicks
document.addEventListener('click', async (e) => {
    const button = e.target.closest('button, input[type="submit"], input[type="button"], a[role="button"]');
    if (!button) return;

    const buttonText = (button.textContent || button.value || button.getAttribute('aria-label') || '').toLowerCase();

    // Check if this is a submit/continue/next/save button
    if (/submit|continue|next|save|proceed|apply|send/i.test(buttonText)) {
        // Only auto-capture if user has explicitly used the extension on this page
        if (!window.RESUME_RAG_EXTENSION_ACTIVE) {
            console.log('[RESUME_RAG] Navigation button clicked but extension not active - skipping auto-capture');
            return;
        }

        console.log('[RESUME_RAG] Navigation button clicked:', buttonText, '- auto-capturing answers');
        const backendUrl = window.RESUME_RAG_BACKEND_URL || 'http://localhost:8000';

        try {
            const result = await captureAnswersFromCurrentForm(backendUrl, window.RESUME_RAG_FILLED_FIELDS);
            console.log('[RESUME_RAG] ✓ Auto-captured on button click:', result.capturedCount, 'answers');

            // Track job application in Google Sheets (only on submit/apply buttons, not continue)
            if (/submit|apply|send/i.test(buttonText)) {
                await trackJobApplication(backendUrl);
            }
        } catch (err) {
            console.log('[RESUME_RAG] Error auto-capturing on click:', err.message);
        }
    }
}, true);

async function fillForm(resumeData, resumeOrder, backendUrl) {
    console.log('[RESUME_RAG] Starting form fill');
    console.log('[RESUME_RAG] Resume loaded:', resumeData.filename);

    // Mark extension as active on this page (enables auto-capture on submit)
    window.RESUME_RAG_EXTENSION_ACTIVE = true;

    // Store resume order and backend URL globally for Attach button handler
    window.RESUME_RAG_RESUME_ORDER = resumeOrder || [];
    window.RESUME_RAG_BACKEND_URL_STORED = backendUrl || 'http://localhost:8000';
    // Store full resume data globally for field inference (e.g., country from state)
    window.RESUME_RAG_RESUME_DATA = resumeData;

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

        // DATE INPUTS (type="date")
        if (type === 'date') {
            // HTML5 date inputs require YYYY-MM-DD format
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            const dateValue = `${yyyy}-${mm}-${dd}`;

            try {
                field.value = dateValue;
                field.dispatchEvent(new Event('input', { bubbles: true }));
                field.dispatchEvent(new Event('change', { bubbles: true }));
                field.dispatchEvent(new Event('blur', { bubbles: true }));

                const oldBg = field.style.backgroundColor;
                field.style.backgroundColor = '#ffffcc';
                setTimeout(() => {
                    field.style.backgroundColor = oldBg;
                }, 1500);

                filledCount++;
                window.RESUME_RAG_FILLED_FIELDS[id || name] = dateValue;
                console.log('[RESUME_RAG] Filled date field:', name || id, '=', dateValue);
            } catch (e) {
                console.log('[RESUME_RAG] Error filling date field:', e);
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

            // Check for date fields (text inputs with date labels/placeholders)
            if (/^date$|start.?date|end.?date|application.?date/i.test(context) || /mm\/dd\/yyyy|mm-dd-yyyy/i.test(placeholder)) {
                const today = new Date();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                const yyyy = today.getFullYear();
                value = `${mm}/${dd}/${yyyy}`;
            } else if (/full.?name|name/i.test(context) && !/first|last|middle|company|business/i.test(context)) {
                // Combined full name field (e.g., "Full Name" or "Name")
                value = `${data.first} ${data.last}`.trim();
            } else if (/last.?name|lname|surname/i.test(context)) {
                value = data.last;
            } else if (/first.?name|fname/i.test(context)) {
                value = data.first;
            } else if (/email/i.test(context)) {
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

    // Return promise that completes after dropdowns and files are processed
    return handleDropdowns(data, backendUrl).then(async (dropdownCount) => {
        let totalFilled = filledCount + dropdownCount;

        // Handle file inputs (if resumeOrder is provided)
        if (resumeOrder && resumeOrder.length > 0) {
            const fileCount = await handleFileInputs(resumeOrder, backendUrl);
            totalFilled += fileCount;
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
        const response = await apiRequest(`${backendUrl}/api/v1/field-answers/`);
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
                const searchResponse = await apiRequest(
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
                const searchResponse = await apiRequest(
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
                const searchResponse = await apiRequest(
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

    // Wait for comboboxes to appear in DOM (form may load asynchronously)
    let inputs = document.querySelectorAll('input[role="combobox"]');
    if (inputs.length === 0) {
        console.log('[RESUME_RAG] Waiting for form fields to load...');
        for (let i = 0; i < 30; i++) {
            await sleep(100);
            inputs = document.querySelectorAll('input[role="combobox"]');
            if (inputs.length > 0) {
                console.log('[RESUME_RAG] Form fields found after', i * 100, 'ms');
                break;
            }
        }
    }

    console.log('[RESUME_RAG] Found ' + inputs.length + ' combobox inputs');

    const dropdownConfig = {};

    // Dynamically build config for each combobox from resume data or saved answers
    for (const input of inputs) {
        const fieldId = input.id || input.name || `combobox-${inputs.indexOf(input)}`;

        // Skip phone country code inputs (international tel input library)
        if (fieldId.includes('iti-') || fieldId.includes('search-input')) {
            continue;
        }

        // Try to find the question text associated with this input (same logic as capture)
        let questionText = '';

        // First try: look for a label element associated with this input
        const labelFor = document.querySelector(`label[for="${fieldId}"]`);
        if (labelFor) {
            questionText = labelFor.textContent?.trim() || '';
        }

        // Second try: find label in parent container
        if (!questionText) {
            let parent = input.closest('div[class*="field"]') || input.closest('div[class*="select"]') || input.closest('fieldset');
            if (parent) {
                const labelElement = parent.querySelector('label');
                if (labelElement) {
                    questionText = labelElement.textContent?.trim() || '';
                }
            }
        }

        // Third try: traverse up to find any label
        if (!questionText) {
            let current = input.parentElement;
            let depth = 0;
            while (current && !questionText && current.tagName !== 'BODY' && depth < 10) {
                const labelElement = current.querySelector('label');
                if (labelElement) {
                    questionText = labelElement.textContent?.trim() || '';
                    break;
                }
                current = current.parentElement;
                depth++;
            }
        }

        console.log('[RESUME_RAG] Combobox field:', fieldId, 'question:', questionText?.substring(0, 50));

        let valueToFill = null;
        let valueSource = null;

        // First, search saved answers (user's specific answers take priority)
        if (questionText && questionText.length > 5) {
            try {
                console.log('[RESUME_RAG] Searching saved answers for:', questionText);
                const searchResponse = await apiRequest(
                    `${backendUrl}/api/v1/field-answers/search/by-question?question_text=${encodeURIComponent(questionText)}`
                );

                if (searchResponse.ok) {
                    const searchData = await searchResponse.json();
                    const matches = searchData.matches || [];
                    console.log('[RESUME_RAG] Search returned', matches.length, 'matches for', questionText.substring(0, 30));

                    if (matches.length > 0) {
                        const bestMatch = matches[0];
                        valueToFill = bestMatch.answer_text;
                        valueSource = 'saved';
                        console.log('[RESUME_RAG] Found saved answer:', valueToFill, '(score: ' + bestMatch.score + ')');
                    } else {
                        console.log('[RESUME_RAG] No saved matches, checking resume data');
                    }
                } else {
                    console.log('[RESUME_RAG] Search request failed:', searchResponse.status);
                }
            } catch (err) {
                console.log('[RESUME_RAG] Error searching for answer:', err.message);
            }
        }

        // If no saved answer found, try resume data as fallback
        if (!valueToFill && questionText) {
            const lowerQuestion = questionText.toLowerCase();

            // Check for city/location fields
            if (/location|city|where.*live|where.*located|where.*work/i.test(lowerQuestion) && data.city) {
                valueToFill = data.city;
                valueSource = 'resume';
                console.log('[RESUME_RAG] Using resume city as fallback:', valueToFill);
            }
            // Check for country fields - infer from state if US
            else if (/country|nation/i.test(lowerQuestion)) {
                // If resume has US state (2-letter code), infer United States
                // Get state from window.RESUME_RAG_RESUME_DATA if available
                const state = window.RESUME_RAG_RESUME_DATA?.state;
                if (state && /^[A-Z]{2}$/.test(state)) {
                    valueToFill = 'United States';
                    valueSource = 'inferred';
                    console.log('[RESUME_RAG] Inferred country from state:', state, '→ United States');
                }
            }
        }

        if (!valueToFill && questionText && questionText.length <= 5) {
            console.log('[RESUME_RAG] Skipping - question text too short');
        }

        // Add to config if we found a value
        if (valueToFill) {
            dropdownConfig[fieldId] = { value: valueToFill, source: valueSource };
        }
    }

    console.log('[RESUME_RAG] Configured React Select dropdowns:', Object.keys(dropdownConfig).length);

    // Process each React Select dropdown sequentially
    for (const [fieldId, config] of Object.entries(dropdownConfig)) {
        const input = document.querySelector(`input#${CSS.escape(fieldId)}`);
        if (!input) continue;

        const targetValue = config.value;
        const source = config.source;

        console.log('[RESUME_RAG] Dropdown: ' + fieldId + ' -> ' + targetValue + ' (from ' + source + ')');

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

        await sleep(200);

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

        console.log('[RESUME_RAG] Pressed ENTER for ' + fieldId + ', now pressing TAB to commit...');
        await sleep(150);

        // Press Tab to commit the selection
        const tabEvent = new KeyboardEvent('keydown', {
            key: 'Tab',
            code: 'Tab',
            bubbles: true,
            cancelable: true
        });
        input.dispatchEvent(tabEvent);

        const tabEventUp = new KeyboardEvent('keyup', {
            key: 'Tab',
            code: 'Tab',
            bubbles: true,
            cancelable: true
        });
        input.dispatchEvent(tabEventUp);

        await sleep(150);

        // Track that this dropdown was filled
        window.RESUME_RAG_FILLED_FIELDS[fieldId] = targetValue;
        console.log('[RESUME_RAG] ✓ Completed dropdown:', fieldId, '=', targetValue);

        processedCount++;
    }

    console.log('[RESUME_RAG] Dropdown processing complete. Processed: ' + processedCount);
    return processedCount;
}


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function handleFileInputs(resumeOrder, backendUrl) {
    let fileCount = 0;

    // Find enabled resumes
    const enabledResumes = resumeOrder.filter(r => r.enabled);
    if (enabledResumes.length === 0) return 0;

    // Find resumes with matching filenames
    const resumeFile = enabledResumes.find(r => r.filename.toLowerCase().includes('resume'));
    const coverFile = enabledResumes.find(r => r.filename.toLowerCase().includes('cover'));

    // Process file inputs
    const fileInputs = document.querySelectorAll('input[type="file"]');
    const attachmentPromises = [];

    fileInputs.forEach(input => {
        if (!input.offsetHeight) return; // Skip hidden

        // Get label context - try multiple methods
        let label = '';
        try {
            // Method 1: label[for="id"]
            if (input.id) {
                const lbl = document.querySelector(`label[for="${input.id}"]`);
                if (lbl) label = lbl.textContent?.toLowerCase() || '';
            }

            // Method 2: input is inside a label
            if (!label) {
                const parentLabel = input.closest('label');
                if (parentLabel) label = parentLabel.textContent?.toLowerCase() || '';
            }

            // Method 3: look for label in parent container
            if (!label) {
                const container = input.closest('div, fieldset, section');
                if (container) {
                    const nearbyLabel = container.querySelector('label');
                    if (nearbyLabel) label = nearbyLabel.textContent?.toLowerCase() || '';
                }
            }

            // Method 4: check aria-label or title
            if (!label) {
                label = (input.getAttribute('aria-label') || input.getAttribute('title') || '').toLowerCase();
            }
        } catch (e) {}

        const context = `${input.id?.toLowerCase() || ''}|${input.name?.toLowerCase() || ''}|${label}`;
        console.log('[RESUME_RAG] File input context:', context);

        // Match Resume/CV field
        if (/resume|cv|curriculum/.test(context) && resumeFile) {
            console.log('[RESUME_RAG] Attaching resume to:', input.id || input.name);
            attachmentPromises.push(fetchAndSetFile(input, resumeFile.id, backendUrl));
            fileCount++;
        }
        // Match Cover Letter field
        else if (/cover|letter|motivation/.test(context) && coverFile) {
            console.log('[RESUME_RAG] Attaching cover letter to:', input.id || input.name);
            attachmentPromises.push(fetchAndSetFile(input, coverFile.id, backendUrl));
            fileCount++;
        }
    });

    // Wait for all file attachments to complete
    if (attachmentPromises.length > 0) {
        const results = await Promise.allSettled(attachmentPromises);
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        if (failed > 0) {
            console.log(`[RESUME_RAG] ⚠️ File attachments: ${successful} succeeded, ${failed} failed`);
            results.forEach((result, i) => {
                if (result.status === 'rejected') {
                    console.log(`[RESUME_RAG] File attachment ${i} failed:`, result.reason);
                }
            });
        } else {
            console.log(`[RESUME_RAG] ✓ All ${successful} file attachment(s) completed successfully`);
        }
    }

    return fileCount;
}

async function fetchAndSetFile(fileInput, resumeId, backendUrl) {
    try {
        console.log('[RESUME_RAG] fetchAndSetFile called:', { resumeId, backendUrl });
        const response = await apiRequest(`${backendUrl}/api/v1/resume/${resumeId}/file`);
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

        const response = await apiRequest(`${backendUrl}/api/v1/resume/${resumeId}/file`);
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
                const response = await apiRequest(`${backendUrl}/api/v1/field-answers/`, {
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
                const response = await apiRequest(`${backendUrl}/api/v1/field-answers/`, {
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
                const response = await apiRequest(`${backendUrl}/api/v1/field-answers/`, {
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
                const response = await apiRequest(`${backendUrl}/api/v1/field-answers/`, {
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

    // Capture React Select dropdown answers (Degree, School, Yes/No questions, etc.)
    const comboboxInputs = document.querySelectorAll('[role="combobox"]');
    console.log('[RESUME_RAG] Found', comboboxInputs.length, 'combobox elements');
    for (const input of comboboxInputs) {
        const fieldId = input.id || input.name || '';

        // React Select stores visible value in a sibling div, not in input.value
        let currentValue = input.value?.trim() || '';

        // Look for the selected value in React Select's display elements
        if (!currentValue) {
            // Try multiple container levels
            let container = input.parentElement;
            for (let i = 0; i < 5 && container && !currentValue; i++) {
                // Try various React Select value selectors
                const valueElement = container.querySelector('[class*="singleValue"]') ||
                                    container.querySelector('[class*="single-value"]') ||
                                    container.querySelector('[class*="SingleValue"]') ||
                                    container.querySelector('[class*="SelectValue"]') ||
                                    container.querySelector('[class*="select__value"]') ||
                                    container.querySelector('[class*="-value-container"] > div:not([class*="placeholder"])') ||
                                    container.querySelector('div[class*="value"]:not([class*="container"])');
                if (valueElement && valueElement.textContent?.trim() && valueElement.textContent?.trim() !== 'Select...') {
                    currentValue = valueElement.textContent?.trim() || '';
                    console.log('[RESUME_RAG] Found value element:', valueElement.className, 'text:', currentValue);
                    break;
                }
                container = container.parentElement;
            }
        }

        // Also check for aria-label or title attributes
        if (!currentValue) {
            currentValue = input.getAttribute('aria-label') || input.getAttribute('title') || '';
        }

        // Greenhouse specific: look for the selected value chip with × button
        if (!currentValue) {
            let container = input.parentElement;
            for (let i = 0; i < 5 && container && !currentValue; i++) {
                // Find any element with × (close button) - the text before it is the value
                const chips = container.querySelectorAll('div');
                for (const chip of chips) {
                    const text = chip.textContent?.trim() || '';
                    // If has × and some actual text before it
                    if (text.includes('×') && text.length > 2) {
                        currentValue = text.replace('×', '').trim();
                        console.log('[RESUME_RAG] Found chip value:', currentValue);
                        break;
                    }
                }
                container = container.parentElement;
            }
        }

        console.log('[RESUME_RAG] Combobox:', { id: fieldId, value: currentValue });

        if (!currentValue || currentValue === 'Select...') continue;

        // Get question text from surrounding elements
        let questionText = '';

        // First try: look for a label element associated with this input
        const labelFor = document.querySelector(`label[for="${input.id}"]`);
        if (labelFor) {
            questionText = labelFor.textContent?.trim() || '';
        }

        // Second try: find label in parent container
        if (!questionText) {
            let parent = input.closest('div[class*="field"]') || input.closest('div[class*="select"]') || input.closest('fieldset');
            if (parent) {
                const labelElement = parent.querySelector('label');
                if (labelElement) {
                    questionText = labelElement.textContent?.trim() || '';
                }
            }
        }

        // Third try: traverse up to find any label
        if (!questionText) {
            let current = input.parentElement;
            let depth = 0;
            while (current && !questionText && current.tagName !== 'BODY' && depth < 10) {
                const labelElement = current.querySelector('label');
                if (labelElement) {
                    questionText = labelElement.textContent?.trim() || '';
                    break;
                }
                current = current.parentElement;
                depth++;
            }
        }

        console.log('[RESUME_RAG] Combobox question text:', questionText?.substring(0, 50));

        if (!questionText || questionText.length < 3) continue;

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
                const response = await apiRequest(`${backendUrl}/api/v1/field-answers/`, {
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

    // Capture text input values (for autocomplete fields like School, Degree, etc.)
    const textInputs = document.querySelectorAll('input[type="text"]:not([role="combobox"])');
    console.log('[RESUME_RAG] Found', textInputs.length, 'text input elements');
    for (const input of textInputs) {
        const fieldId = input.id || input.name;
        const currentValue = input.value?.trim() || '';

        if (!currentValue || currentValue.length < 2) continue;

        // Skip common non-answer fields
        if (input.type === 'search' || input.autocomplete === 'off') continue;

        // Get question text from label or surrounding elements
        let questionText = '';
        const label = document.querySelector(`label[for="${input.id}"]`);
        if (label) {
            questionText = label.textContent?.trim() || '';
        }

        if (!questionText) {
            let parent = input.closest('div[class*="field"]') || input.closest('div[class*="form"]') || input.closest('fieldset');
            if (parent) {
                const labelElement = parent.querySelector('label');
                if (labelElement) {
                    questionText = labelElement.textContent?.trim() || '';
                }
            }
        }

        if (!questionText || questionText.length < 3) {
            console.log('[RESUME_RAG] Skipping text input without question text, id:', fieldId);
            continue;
        }

        const wasFilledByExtension = filledFields && filledFields[fieldId];
        let shouldCapture = false;

        if (!wasFilledByExtension) {
            shouldCapture = true;
            console.log('[RESUME_RAG] Capturing new text input field:', questionText.substring(0, 50));
        } else {
            const originalValue = filledFields[fieldId];
            if (originalValue !== currentValue) {
                shouldCapture = true;
                console.log('[RESUME_RAG] Capturing modified text input field:', questionText.substring(0, 50));
            }
        }

        if (shouldCapture) {
            const answerKey = `${questionText}||${currentValue}`;
            if (savedAnswers.has(answerKey)) {
                console.log('[RESUME_RAG] Skipping duplicate text input answer for:', questionText.substring(0, 50));
                continue;
            }
            savedAnswers.add(answerKey);

            try {
                const response = await apiRequest(`${backendUrl}/api/v1/field-answers/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        question_text: questionText,
                        answer_text: currentValue,
                        field_type: 'text'
                    })
                });
                if (response.ok) {
                    capturedCount++;
                    console.log('[RESUME_RAG] ✓ Saved text input answer for:', questionText.substring(0, 50), 'value:', currentValue);
                }
            } catch (error) {
                console.log('[RESUME_RAG] Error saving text input answer:', error.message);
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
