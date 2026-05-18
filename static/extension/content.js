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
        education: (resumeData.education || []).map(e => e.degree || '').join(', ')
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

    // Get all form fields (including those in iframes if possible)
    const getAllInputs = () => {
        let inputs = [];

        // Main page inputs
        inputs = inputs.concat(Array.from(document.querySelectorAll(
            'input[type=text],input:not([type]),textarea,select'
        )));

        // Try to access iframes
        try {
            document.querySelectorAll('iframe').forEach(iframe => {
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (iframeDoc) {
                        inputs = inputs.concat(Array.from(iframeDoc.querySelectorAll(
                            'input[type=text],input:not([type]),textarea,select'
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

    inputs.forEach(field => {
        if (filled.has(field) || !field.offsetHeight) return;

        // Get field context
        const fieldId = (field.id || '').toLowerCase();
        const fieldName = (field.name || '').toLowerCase();
        const placeholder = (field.placeholder || '').toLowerCase();
        const ariaLabel = (field.getAttribute('aria-label') || '').toLowerCase();

        // Get label text
        let label = '';
        document.querySelectorAll('label').forEach(l => {
            if (l.htmlFor === field.id || l.contains(field)) {
                label = l.textContent.toLowerCase();
            }
        });

        // Also check for labels in the same document as field
        try {
            const fieldDoc = field.ownerDocument;
            fieldDoc.querySelectorAll('label').forEach(l => {
                if (l.htmlFor === field.id || l.contains(field)) {
                    label = l.textContent.toLowerCase();
                }
            });
        } catch (e) {}

        // Add contextual text
        label = label || field.parentElement?.textContent?.toLowerCase()?.substring(0, 100) || '';

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

        // Fallback: semantic matching
        if (!value) {
            if (/last.?name|surname/.test(label)) value = data.last_name;
            else if (/first.?name|given/.test(label)) value = data.first_name;
            else if (/email/.test(label)) value = data.email;
            else if (/phone|telephone|mobile|cell/.test(label)) value = data.phone;
            else if (/country/.test(label)) value = data.country;
            else if (/state|province/.test(label)) value = data.state;
            else if (/linkedin/.test(label)) value = data.linkedin;
            else if (/website|portfolio/.test(label)) value = data.website;
            else if (/city|location/.test(label) && !/address/.test(label)) value = data.city;
            else if (/location|address/.test(label)) value = data.location;
            else if (/name/.test(label)) value = data.first_name || data.name;
        }

        // Fill field
        if (value && value.length > 0) {
            field.value = value;
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));

            // Visual feedback
            field.style.backgroundColor = '#ffffcc';
            setTimeout(() => {
                field.style.backgroundColor = '';
            }, 2000);

            filled.add(field);
        }
    });

    return {
        success: true,
        filledCount: filled.size
    };
}
