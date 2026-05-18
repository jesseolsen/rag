// Content script - runs on every page
console.log('[EXTENSION] Content script loaded on:', window.location.href);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[EXTENSION] Received message:', request.action);
    if (request.action === 'fillForm') {
        console.log('fillForm action received');
        const result = fillFormFields(request.resumeData);
        console.log('Sending response:', result);
        sendResponse(result);
    }
    return true; // Keep channel open for async responses
});

function fillFormFields(resumeData) {
    console.log('Starting form fill...');

    const data = {
        first_name: resumeData.first_name || '',
        last_name: resumeData.last_name || '',
        name: resumeData.name || '',
        email: resumeData.email || '',
        phone: resumeData.phone || '',
        city: resumeData.city || '',
        state: resumeData.state || '',
        country: 'USA',
        location: resumeData.location || '',
        linkedin: resumeData.linkedin || '',
        website: resumeData.website || '',
        summary: resumeData.summary || '',
        skills: (resumeData.skills || []).join(', '),
        experience: (resumeData.experience || []).map(e => e.title || '').join('\n'),
        education: (resumeData.education || []).map(e => e.degree || '').join(', ')
    };

    let filledCount = 0;

    // Get all inputs
    const getInputs = () => {
        let inputs = Array.from(document.querySelectorAll(
            'input[type="text"], input:not([type]), textarea, select, input[type="checkbox"], input[type="radio"]'
        ));

        // Try to get inputs from iframes
        try {
            document.querySelectorAll('iframe').forEach(iframe => {
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (iframeDoc) {
                        inputs = inputs.concat(Array.from(iframeDoc.querySelectorAll(
                            'input[type="text"], input:not([type]), textarea, select, input[type="checkbox"], input[type="radio"]'
                        )));
                    }
                } catch (e) {}
            });
        } catch (e) {}

        return inputs;
    };

    const inputs = getInputs();
    console.log('Found inputs:', inputs.length);

    // Debug: log what inputs we found
    inputs.forEach((f, i) => {
        const type = f.type || 'unknown';
        const id = f.id || 'no-id';
        console.log(`  [${i}] type=${type} id=${id}`);
    });

    // Process each input
    inputs.forEach(field => {
        if (!field.offsetHeight) return; // Skip hidden fields

        const fieldType = field.type?.toLowerCase() || '';
        const fieldId = field.id?.toLowerCase() || '';
        const fieldName = field.name?.toLowerCase() || '';
        const placeholder = field.placeholder?.toLowerCase() || '';

        // Get label context
        let labelText = '';
        if (field.id) {
            const lbl = field.ownerDocument.querySelectorAll(`label[for="${field.id}"]`);
            if (lbl.length > 0) labelText = lbl[0].textContent.toLowerCase();
        }
        if (!labelText && field.parentElement) {
            labelText = field.parentElement.textContent?.toLowerCase() || '';
        }

        const context = `${fieldId} ${fieldName} ${placeholder} ${labelText}`;

        // CHECKBOXES: Look for LinkedIn
        if (fieldType === 'checkbox') {
            if (/linkedin/i.test(labelText) || /linkedin/i.test(field.parentElement?.textContent || '')) {
                console.log('Found LinkedIn checkbox, checking it');
                field.checked = true;
                field.dispatchEvent(new Event('change', { bubbles: true }));
                field.dispatchEvent(new Event('click', { bubbles: true }));
                filledCount++;
            }
            return;
        }

        // Skip radio buttons
        if (fieldType === 'radio') return;

        // TEXT FIELDS: Match patterns
        let value = null;

        if (/last.?name|lname|surname/i.test(context)) {
            value = data.last_name;
        } else if (/first.?name|fname/i.test(context)) {
            value = data.first_name;
        } else if (/^name$|full.?name/i.test(context)) {
            value = data.name;
        } else if (/email/i.test(context)) {
            value = data.email;
        } else if (/phone|telephone|mobile|cell|contact/i.test(context)) {
            value = data.phone;
        } else if (/^city/i.test(context) && !/address/i.test(context)) {
            value = data.city;
        } else if (/state|province/i.test(context)) {
            value = data.state;
        } else if (/country/i.test(context)) {
            value = data.country;
        } else if (/location|address/i.test(context)) {
            value = data.location;
        } else if (/linkedin/i.test(context)) {
            value = data.linkedin;
        } else if (/website|portfolio|url/i.test(context)) {
            value = data.website;
        }

        // Fill the field
        if (value && value.length > 0) {
            field.value = value;
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
            field.dispatchEvent(new Event('blur', { bubbles: true }));

            // Highlight field
            field.style.backgroundColor = '#ffffcc';
            setTimeout(() => { field.style.backgroundColor = ''; }, 2000);

            filledCount++;
            console.log('Filled field with:', value.substring(0, 40));
        }
    });

    // Handle SELECT dropdowns (for country/authorization)
    let selectsMain = Array.from(document.querySelectorAll('select'));
    let selectsFromIframes = [];

    try {
        document.querySelectorAll('iframe').forEach(iframe => {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (iframeDoc) {
                    selectsFromIframes = selectsFromIframes.concat(Array.from(iframeDoc.querySelectorAll('select')));
                }
            } catch (e) {}
        });
    } catch (e) {}

    const selects = selectsMain.concat(selectsFromIframes);
    console.log('Found selects - main:', selectsMain.length, 'iframes:', selectsFromIframes.length);

    selects.forEach((select, idx) => {
        let selectLabel = '';

        // Try to get label from associated label element
        try {
            if (select.id) {
                const doc = select.ownerDocument;
                const lbl = doc.querySelector(`label[for="${select.id}"]`);
                if (lbl) selectLabel = lbl.textContent.toLowerCase();
            }
        } catch (e) {}

        // Try parent element
        if (!selectLabel && select.parentElement) {
            selectLabel = select.parentElement.textContent?.toLowerCase() || '';
        }

        console.log(`Select[${idx}]: label="${selectLabel.substring(0, 50)}" options=${select.options.length}`);

        // Check if it's a country/work authorization select
        const matchCountry = /country|authorized|work.*in|legal.*work|visa|sponsorship|requirement/i.test(selectLabel);
        if (matchCountry) {
            console.log('  -> Found country/auth select!');

            // Find and select USA option
            let found = false;
            for (let i = 0; i < select.options.length; i++) {
                const opt = select.options[i];
                console.log(`     Option[${i}]: "${opt.text}" (value="${opt.value}")`);
                if (/usa|united states|america|^us$/i.test(opt.text)) {
                    console.log(`  -> Selecting USA option: "${opt.text}"`);
                    select.value = opt.value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    select.dispatchEvent(new Event('click', { bubbles: true }));
                    filledCount++;
                    found = true;
                    break;
                }
            }
            if (!found) {
                console.log('  -> No USA option found');
            }
        }
    });

    console.log('Final filled count:', filledCount);
    return { success: true, filledCount: filledCount };
}
