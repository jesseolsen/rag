// Try to fill Greenhouse dropdown components
function tryFillGreenhouseDropdowns(filledCount) {
    // Strategy 1: Look for native select elements in iframes and main document
    const getAllSelects = () => {
        let selects = Array.from(document.querySelectorAll('select'));

        try {
            document.querySelectorAll('iframe').forEach(iframe => {
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (iframeDoc) {
                        selects = selects.concat(Array.from(iframeDoc.querySelectorAll('select')));
                    }
                } catch (e) {}
            });
        } catch (e) {}

        return selects;
    };

    const selects = getAllSelects();
    selects.forEach(select => {
        const label = select.previousElementSibling?.textContent?.toLowerCase() ||
                     select.parentElement?.textContent?.toLowerCase() || '';

        // Handle country selects
        if (/country|nation|authorized/.test(label)) {
            for (const option of select.options) {
                if (/usa|united states|america/i.test(option.textContent)) {
                    select.value = option.value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    break;
                }
            }
        }
    });

    // Strategy 2: Look for Greenhouse-style clickable dropdowns
    const allElements = document.querySelectorAll('[role="button"], [role="combobox"], .gh-dropdown, .select-wrapper');

    allElements.forEach(el => {
        const text = el.textContent?.toLowerCase() || '';

        // Try to find and fill country/state dropdowns with "USA"
        if ((text.includes('country') || text.includes('authorized') ||
             text.includes('select') && !text.includes('please')) &&
            !el.querySelector('input[type=text]')) {

            // This might be a dropdown trigger, try clicking it
            try {
                el.click();

                // After click, wait and try to find "USA" option
                setTimeout(() => {
                    const options = document.querySelectorAll('[role=option], .gh-option, [data-value], li');
                    let foundOption = null;

                    for (const opt of options) {
                        const optText = opt.textContent || '';
                        if (/usa|united states|america/i.test(optText)) {
                            foundOption = opt;
                            break;
                        }
                    }

                    if (foundOption) {
                        foundOption.click();
                    }
                }, 150);
            } catch (e) {
                // Ignore click errors
            }
        }
    });
}

// Content script - runs on every page
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fillForm') {
        const result = fillFormFields(request.resumeData);
        sendResponse(result);
    }
});

function fillFormFields(resumeData) {
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
        education: (resumeData.education || []).map(e => e.degree || '').join(', '),
        hear_about_us: 'LinkedIn'
    };

    const patterns = [
        ['last.?name|lname|surname|family.?name', 'last_name'],
        ['first.?name|fname|given.?name', 'first_name'],
        ['^name$|full.?name', 'name'],
        ['email|e-mail|email.?address', 'email'],
        ['phone|telephone|mobile|cell|contact.?number', 'phone'],
        ['city|location.?city|birthplace', 'city'],
        ['state|province|region|state.?province', 'state'],
        ['country|nation|nationality', 'country'],
        ['location|address|full.?address', 'location'],
        ['linkedin|linkedin.?profile|linkedin.?url', 'linkedin'],
        ['website|portfolio|url|personal.?website', 'website'],
        ['summary|objective|about|bio|professional.?statement', 'summary'],
        ['skills|expertise|competencies|technical', 'skills'],
        ['experience|work.?history|employment|background', 'experience'],
        ['education|degree|university|college|school', 'education']
    ];

    const filled = new Set();
    let filledCount = 0;

    // Get all form fields (including those in iframes if possible)
    const getAllInputs = () => {
        let inputs = [];

        // Main page inputs (text, textareas, selects, checkboxes, radios)
        inputs = inputs.concat(Array.from(document.querySelectorAll(
            'input[type=text],input:not([type]),textarea,select,input[type=checkbox],input[type=radio]'
        )));

        // Try to access iframes
        try {
            document.querySelectorAll('iframe').forEach(iframe => {
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (iframeDoc) {
                        inputs = inputs.concat(Array.from(iframeDoc.querySelectorAll(
                            'input[type=text],input:not([type]),textarea,select,input[type=checkbox],input[type=radio]'
                        )));
                    }
                } catch (e) {
                    // Cross-origin iframe, skip
                }
            });
        } catch (e) {
            // Ignore iframe access errors
        }

        return inputs;
    };

    const inputs = getAllInputs();

    // Handle checkboxes for "How did you hear about us?" - check in iframes too
    const getCheckboxes = () => {
        let checkboxes = Array.from(document.querySelectorAll('input[type=checkbox]'));

        try {
            document.querySelectorAll('iframe').forEach(iframe => {
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (iframeDoc) {
                        checkboxes = checkboxes.concat(Array.from(iframeDoc.querySelectorAll('input[type=checkbox]')));
                    }
                } catch (e) {}
            });
        } catch (e) {}

        return checkboxes;
    };

    const checkboxes = getCheckboxes();
    checkboxes.forEach(checkbox => {
        const label = checkbox.parentElement?.textContent?.toLowerCase() || '';
        const parentLabel = checkbox.parentElement?.parentElement?.textContent?.toLowerCase() || '';
        const combinedLabel = `${label} ${parentLabel}`;

        if (/linkedin/.test(combinedLabel)) {
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            checkbox.dispatchEvent(new Event('click', { bubbles: true }));
            checkbox.style.backgroundColor = '#ffffcc';
            setTimeout(() => checkbox.style.backgroundColor = '', 2000);
            filledCount++;
        }
    });

    // Try to handle Greenhouse dropdown components
    tryFillGreenhouseDropdowns(filledCount);

    inputs.forEach(field => {
        if (filled.has(field) || !field.offsetHeight) return;

        // Get field context
        const fieldId = (field.id || '').toLowerCase();
        const fieldName = (field.name || '').toLowerCase();
        const placeholder = (field.placeholder || '').toLowerCase();
        const ariaLabel = (field.getAttribute('aria-label') || '').toLowerCase();

        // Get label text - check multiple sources
        let label = '';

        // Check for associated label
        if (field.id) {
            const labels = field.ownerDocument.querySelectorAll(`label[for="${field.id}"]`);
            if (labels.length > 0) {
                label = labels[0].textContent.toLowerCase();
            }
        }

        // Check parent element and siblings
        if (!label) {
            let parent = field.parentElement;
            while (parent && !label && parent !== field.ownerDocument.body) {
                const text = parent.textContent?.toLowerCase() || '';
                if (text.length < 200) {
                    label = text;
                    break;
                }
                parent = parent.parentElement;
            }
        }

        // Check for label containing the field
        if (!label) {
            const fieldDoc = field.ownerDocument;
            const labels = fieldDoc.querySelectorAll('label');
            for (const l of labels) {
                if (l.contains(field)) {
                    label = l.textContent.toLowerCase();
                    break;
                }
            }
        }

        // Match against patterns
        let value = null;

        for (const [pattern, key] of patterns) {
            const regexes = pattern.split('|').map(p => new RegExp(p, 'i'));
            const matches = regexes.some(r =>
                r.test(fieldId) ||
                r.test(fieldName) ||
                r.test(placeholder) ||
                r.test(ariaLabel) ||
                r.test(label)
            );

            if (matches) {
                value = data[key];
                break;
            }
        }

        // Fallback: semantic matching (more aggressive)
        if (!value) {
            const combinedContext = `${fieldId} ${fieldName} ${placeholder} ${ariaLabel} ${label}`;
            if (/last.?name|surname|lname/.test(combinedContext)) value = data.last_name;
            else if (/first.?name|fname|given/.test(combinedContext)) value = data.first_name;
            else if (/email|e-mail/.test(combinedContext)) value = data.email;
            else if (/phone|telephone|mobile|cell|contact/.test(combinedContext)) value = data.phone;
            else if (/country|nation|nationality/.test(combinedContext)) value = data.country;
            else if (/state|province|region/.test(combinedContext)) value = data.state;
            else if (/linkedin/.test(combinedContext)) value = data.linkedin;
            else if (/website|portfolio|url/.test(combinedContext)) value = data.website;
            else if (/city|town|municipality/.test(combinedContext) && !/address|zip|postal/.test(combinedContext)) value = data.city;
            else if (/location|address|street/.test(combinedContext)) value = data.location;
            else if (/^name$|full.?name|fullname/.test(combinedContext)) value = data.first_name || data.name;
        }

        // Fill field
        if (value && value.length > 0) {
            field.value = value;
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
            field.dispatchEvent(new Event('blur', { bubbles: true }));

            // Visual feedback
            field.style.backgroundColor = '#ffffcc';
            setTimeout(() => {
                field.style.backgroundColor = '';
            }, 2000);

            filled.add(field);
            filledCount++;
        }
    });

    return {
        success: true,
        filledCount: filled.size + filledCount
    };
}
