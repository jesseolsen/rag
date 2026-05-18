// Job Application Form Filler Bookmarklet
(async function() {
    const BACKEND_URL = 'http://localhost:8000';
    const STORAGE_KEY = 'job_app_resume_id';

    // Get stored resume ID
    let resumeId = localStorage.getItem(STORAGE_KEY);

    if (!resumeId) {
        resumeId = prompt('Enter your resume ID:');
        if (!resumeId) {
            alert('Resume ID is required');
            return;
        }
        localStorage.setItem(STORAGE_KEY, resumeId);
    }

    try {
        // Fetch resume data
        const response = await fetch(`${BACKEND_URL}/api/v1/resume/${resumeId}/data`);
        if (!response.ok) {
            throw new Error(`Failed to fetch resume data: ${response.statusText}`);
        }
        const resumeData = await response.json();

        // Field matchers: patterns to identify form fields
        const fieldMatchers = {
            name: {
                patterns: ['name', 'full.?name', 'first.?name'],
                value: resumeData.name || ''
            },
            email: {
                patterns: ['email', 'e-mail', 'email.?address'],
                value: resumeData.email || ''
            },
            phone: {
                patterns: ['phone', 'telephone', 'mobile', 'contact.?number'],
                value: resumeData.phone || ''
            },
            location: {
                patterns: ['location', 'city', 'address', 'state', 'zip', 'postal'],
                value: resumeData.location || ''
            },
            summary: {
                patterns: ['summary', 'objective', 'about', 'bio', 'professional.?statement'],
                value: resumeData.summary || ''
            },
            skills: {
                patterns: ['skills', 'expertise', 'competencies', 'technical'],
                value: resumeData.skills.join(', ') || ''
            },
            experience: {
                patterns: ['experience', 'work.?history', 'employment', 'background'],
                value: (resumeData.experience.length > 0) ? resumeData.experience.map(e => e.title || '').join('\n') : ''
            },
            education: {
                patterns: ['education', 'degree', 'university', 'college', 'school'],
                value: (resumeData.education.length > 0) ? resumeData.education.map(e => e.degree || '').join(', ') : ''
            }
        };

        // Find and fill form fields
        const filled = new Set();
        const inputs = document.querySelectorAll('input[type="text"], input:not([type]), textarea, select');

        inputs.forEach((field) => {
            const fieldName = (field.name || field.id || field.placeholder || '').toLowerCase();
            const fieldLabel = field.parentElement?.textContent?.toLowerCase() || '';
            const ariaLabel = (field.getAttribute('aria-label') || '').toLowerCase();

            // Try to match field with resume data
            for (const [key, matcher] of Object.entries(fieldMatchers)) {
                for (const pattern of matcher.patterns) {
                    const regex = new RegExp(pattern, 'i');
                    if (regex.test(fieldName) || regex.test(fieldLabel) || regex.test(ariaLabel)) {
                        if (matcher.value && !filled.has(field)) {
                            // Set value based on field type
                            if (field.tagName === 'TEXTAREA') {
                                field.value = matcher.value;
                                field.dispatchEvent(new Event('change', { bubbles: true }));
                            } else if (field.tagName === 'SELECT') {
                                // For selects, try to find matching option
                                const options = Array.from(field.options);
                                const match = options.find(opt =>
                                    matcher.value.toLowerCase().includes(opt.value.toLowerCase()) ||
                                    opt.value.toLowerCase().includes(matcher.value.toLowerCase())
                                );
                                if (match) {
                                    field.value = match.value;
                                }
                            } else {
                                field.value = matcher.value;
                                field.dispatchEvent(new Event('input', { bubbles: true }));
                                field.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                            filled.add(field);
                            field.style.backgroundColor = '#ffffcc';
                            setTimeout(() => {
                                field.style.backgroundColor = '';
                            }, 2000);
                            break;
                        }
                    }
                }
            }
        });

        alert(`✓ Form filled! Matched ${filled.size} fields.\n\nTo use different resume: localStorage.removeItem('job_app_resume_id')`);

    } catch (error) {
        alert(`Error: ${error.message}`);
        // Clear stored ID on error
        localStorage.removeItem(STORAGE_KEY);
    }
})();
