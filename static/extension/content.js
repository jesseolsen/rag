// Simple test - log immediately to see if script loads
console.log('[RESUME_RAG] Content script executing');
window.RESUME_RAG_LOADED = true;

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[RESUME_RAG] Message received:', request);

    if (request.action === 'fillForm') {
        console.log('[RESUME_RAG] Starting fill with:', Object.keys(request.resumeData));

        const result = fillForm(request.resumeData);
        console.log('[RESUME_RAG] Fill result:', result);

        sendResponse(result);
    }
});

function fillForm(resumeData) {
    console.log('[RESUME_RAG] fillForm called');

    let filledCount = 0;

    // Get resume values
    const first = resumeData.first_name || '';
    const last = resumeData.last_name || '';
    const email = resumeData.email || '';
    const phone = resumeData.phone || '';
    const city = resumeData.city || '';
    const linkedin = resumeData.linkedin || '';
    const website = resumeData.website || '';

    console.log('[RESUME_RAG] Resume data:', { first, last, email, phone });

    // Find ALL inputs on the page
    const allInputs = document.querySelectorAll('input, select, textarea');
    console.log('[RESUME_RAG] Total form elements found:', allInputs.length);

    // Process each input
    allInputs.forEach((field, idx) => {
        if (!field.offsetHeight) return; // Skip hidden

        const type = field.type?.toLowerCase() || 'unknown';
        const id = field.id?.toLowerCase() || '';
        const name = field.name?.toLowerCase() || '';
        const placeholder = field.placeholder?.toLowerCase() || '';

        // Get label text
        let label = '';
        if (field.id) {
            const lbl = field.ownerDocument.querySelector(`label[for="${field.id}"]`);
            if (lbl) label = lbl.textContent?.toLowerCase() || '';
        }

        const allText = `${id}|${name}|${placeholder}|${label}`;

        // HANDLE CHECKBOXES
        if (type === 'checkbox') {
            if (/linkedin/.test(allText)) {
                console.log('[RESUME_RAG] Found LinkedIn checkbox');
                field.checked = true;
                field.dispatchEvent(new Event('change', { bubbles: true }));
                filledCount++;
            }
            return;
        }

        // HANDLE TEXT INPUTS
        if (type === 'text' || type === '' || type === 'email' || type === 'tel') {
            let value = null;

            if (/last.?name|lname|surname/i.test(allText)) value = last;
            else if (/first.?name|fname/i.test(allText)) value = first;
            else if (/email/i.test(allText)) value = email;
            else if (/phone|telephone|mobile|cell/i.test(allText)) value = phone;
            else if (/city/i.test(allText) && !/address/i.test(allText)) value = city;
            else if (/linkedin/i.test(allText)) value = linkedin;
            else if (/website|portfolio|url/i.test(allText)) value = website;

            if (value) {
                console.log('[RESUME_RAG] Filling:', allText.substring(0, 30), 'with:', value.substring(0, 20));
                field.value = value;
                field.dispatchEvent(new Event('input', { bubbles: true }));
                field.dispatchEvent(new Event('change', { bubbles: true }));

                // Highlight
                const orig = field.style.backgroundColor;
                field.style.backgroundColor = '#ffffcc';
                setTimeout(() => { field.style.backgroundColor = orig; }, 1500);

                filledCount++;
            }
        }

        // HANDLE SELECT
        if (type === 'select-one' || field.tagName === 'SELECT') {
            if (/country|authorized|work.*in|visa|legal|sponsorship/i.test(allText)) {
                console.log('[RESUME_RAG] Found select for:', allText.substring(0, 40));

                // Find USA option
                for (const opt of field.options || []) {
                    if (/usa|united states|america/i.test(opt.text)) {
                        console.log('[RESUME_RAG] Setting select to:', opt.text);
                        field.value = opt.value;
                        field.dispatchEvent(new Event('change', { bubbles: true }));
                        filledCount++;
                        break;
                    }
                }
            }
        }
    });

    console.log('[RESUME_RAG] Filled count:', filledCount);

    return {
        success: true,
        filledCount: filledCount
    };
}
