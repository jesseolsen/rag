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

    if (request.action === 'getCompanyName') {
        console.log('[RESUME_RAG] Company name requested');
        const companyName = extractCompanyName();
        const jobId = extractJobId();
        const jobTitle = extractJobTitle();
        sendResponse({
            success: true,
            companyName: companyName || null,
            jobId: jobId || null,
            jobTitle: jobTitle || null
        });
        return true;
    }
});

// Helper function to extract job title from page
function extractJobTitle() {
    console.log('[RESUME_RAG] Extracting job title from:', window.location.href);
    const hostname = window.location.hostname;

    // Robert Half page titles: "Job Title Job in City, ST | Robert Half"
    if (hostname.includes('roberthalf.com')) {
        const rhMatch = document.title.match(/^(.+?)\s+Job\s+in\s+.+?\s*\|/i);
        if (rhMatch) {
            console.log('[RESUME_RAG] ✓ Job title from Robert Half page title:', rhMatch[1].trim());
            return rhMatch[1].trim();
        }
    }

    // Look for common patterns in headings
    const headings = document.querySelectorAll('h1, h2, h3');
    console.log('[RESUME_RAG] Found', headings.length, 'headings to check');

    for (const heading of headings) {
        const text = heading.textContent?.trim();
        if (text && text.length > 5 && text.length < 150) {
            console.log('[RESUME_RAG] Checking heading:', text.substring(0, 50));
            // Check if it looks like a job title (contains job-related words)
            const jobKeywords = /engineer|developer|designer|manager|analyst|specialist|coordinator|director|lead|senior|junior|architect|scientist|administrator|consultant|ai|software|data|product/i;
            if (jobKeywords.test(text)) {
                // Make sure it's not the company name or other metadata
                if (!/glassdoor|linkedin|indeed|apply now|careers|jobs|welcome|notifications|do not sell|personal data|privacy|cookie|terms of/i.test(text)) {
                    console.log('[RESUME_RAG] ✓ Job title from heading:', text);
                    return text;
                } else {
                    console.log('[RESUME_RAG] Rejected (matches exclusion):', text.substring(0, 50));
                }
            }
        }
    }

    // Try page title
    const title = document.title;
    console.log('[RESUME_RAG] Page title:', title);
    if (title) {
        // Extract job title from patterns like "Job Title - Company" or "Job Title | Company"
        const parts = title.split(/[\|\-–—]/);
        if (parts.length > 1) {
            const jobKeywords = /engineer|developer|designer|manager|analyst|specialist|coordinator|director|lead|senior|junior|architect|scientist|administrator|consultant|ai|software|data|product/i;

            // Check first part (usually job title)
            const firstPart = parts[0].trim();
            console.log('[RESUME_RAG] Checking page title first part:', firstPart);
            if (jobKeywords.test(firstPart) && firstPart.length > 5 && firstPart.length < 150) {
                console.log('[RESUME_RAG] ✓ Job title from page title:', firstPart);
                return firstPart;
            }
        }
    }

    console.log('[RESUME_RAG] ⚠️ No job title found');
    return null;
}

// Helper function to extract job ID from URL or page
function extractJobId() {
    const url = window.location.href;
    const pathname = window.location.pathname;
    const hostname = window.location.hostname;

    console.log('[RESUME_RAG] Extracting job ID from:', url);

    // Try URL patterns for different job boards
    let jobId = null;

    // 1. Greenhouse: job-boards.greenhouse.io/company/jobs/12345678
    if (hostname.includes('greenhouse.io')) {
        const match = pathname.match(/\/jobs\/(\d+)/);
        if (match) {
            jobId = match[1];
            console.log('[RESUME_RAG] Job ID from Greenhouse URL:', jobId);
            return jobId;
        }
    }

    // 2. Lever: jobs.lever.co/company/job-slug/apply
    if (hostname.includes('lever.co')) {
        const match = pathname.match(/\/([^\/]+)\/apply/);
        if (match) {
            jobId = match[1]; // Use the job slug as ID
            console.log('[RESUME_RAG] Job ID from Lever URL:', jobId);
            return jobId;
        }
    }

    // 3. LinkedIn: linkedin.com/jobs/view/12345678
    if (hostname.includes('linkedin.com')) {
        const match = url.match(/\/jobs\/view\/(\d+)/);
        if (match) {
            jobId = match[1];
            console.log('[RESUME_RAG] Job ID from LinkedIn URL:', jobId);
            return jobId;
        }
    }

    // 4. Glassdoor: glassdoor.com/job-listing/...?jl=12345678
    if (hostname.includes('glassdoor.com')) {
        const match = url.match(/[?&]jl=(\d+)/);
        if (match) {
            jobId = match[1];
            console.log('[RESUME_RAG] Job ID from Glassdoor URL:', jobId);
            return jobId;
        }
    }

    // 5. Dice: dice.com/jobs/detail/...?jobid=12345
    if (hostname.includes('dice.com')) {
        const match = url.match(/[?&]jobid=([^&]+)/i);
        if (match) {
            jobId = match[1];
            console.log('[RESUME_RAG] Job ID from Dice URL:', jobId);
            return jobId;
        }
    }

    // 6. JobRight.ai: jobright.ai/job/12345 or various patterns
    if (hostname.includes('jobright.ai')) {
        const match = url.match(/\/job\/([^\/\?]+)/);
        if (match) {
            jobId = match[1];
            console.log('[RESUME_RAG] Job ID from JobRight URL:', jobId);
            return jobId;
        }
    }

    // 7. Robert Half: roberthalf.com/us/en/job/{city}/{title-slug}/{job-id}
    if (hostname.includes('roberthalf.com')) {
        const match = pathname.match(/\/job\/[^\/]+\/[^\/]+\/([^\/\?]+)/);
        if (match) {
            jobId = match[1];
            console.log('[RESUME_RAG] Job ID from Robert Half URL:', jobId);
            return jobId;
        }
    }

    // 6b. Check for jr_id parameter (used by many job boards)
    const jrIdMatch = url.match(/[?&]jr_id=([^&]+)/);
    if (jrIdMatch) {
        jobId = jrIdMatch[1];
        console.log('[RESUME_RAG] Job ID from jr_id parameter:', jobId);
        return jobId;
    }

    // 7. Generic: Look for common ID patterns in URL
    // Match patterns like: /12345678, ?id=12345, ?jobId=abc123, etc.
    const genericMatch = url.match(/(?:\/|[?&](?:job)?[_-]?id[=\/])([a-zA-Z0-9-_]+)/i);
    if (genericMatch && genericMatch[1].length >= 6) {
        jobId = genericMatch[1];
        console.log('[RESUME_RAG] Job ID from generic URL pattern:', jobId);
        return jobId;
    }

    // 8. Fallback: Extract from page content
    // Look for "Job ID", "Req ID", "Requisition", etc.
    const pageText = document.body.textContent || '';
    const contentPatterns = [
        /(?:Job|Req|Requisition)\s*(?:ID|#|Number)[\s:]*([A-Z0-9-_]+)/i,
        /(?:Reference|Ref)\s*(?:ID|#|Number)[\s:]*([A-Z0-9-_]+)/i,
        /JOB\s*ID[\s:]*([A-Z0-9-_]+)/i
    ];

    for (const pattern of contentPatterns) {
        const match = pageText.match(pattern);
        if (match && match[1].length >= 4) {
            jobId = match[1];
            console.log('[RESUME_RAG] Job ID from page content:', jobId);
            return jobId;
        }
    }

    console.log('[RESUME_RAG] No job ID found');
    return null;
}

// Helper function to extract company name from page
function extractCompanyName() {
    // Try multiple strategies to find company name
    console.log('[RESUME_RAG] Extracting company name from:', window.location.href);

    // 1. Check URL path for company name (e.g., careers-page.com/COMPANY/job/...)
    const url = window.location.href;
    const pathname = window.location.pathname;
    const hostname = window.location.hostname;

    // Special handling for LinkedIn job pages
    if (hostname.includes('linkedin.com') && pathname.includes('/jobs/view/')) {
        console.log('[RESUME_RAG] Extracting from LinkedIn job page');

        // Method 1: Look for company name in job-details-jobs-unified-top-card (main job card)
        const topCard = document.querySelector('.job-details-jobs-unified-top-card__company-name');
        if (topCard) {
            const text = topCard.textContent?.trim();
            if (text && text.length > 1) {
                console.log('[RESUME_RAG] Company from LinkedIn top card:', text);
                return text;
            }
        }

        // Method 2: Company name link near job title
        const companyLinks = document.querySelectorAll('a[href*="/company/"]');
        console.log('[RESUME_RAG] Found', companyLinks.length, 'company links');
        for (const link of companyLinks) {
            const text = link.textContent?.trim();
            console.log('[RESUME_RAG] Checking company link:', text);
            // Strict filtering: reject UI elements, numbers, and common text
            if (text && text.length > 2 && text.length < 50 &&
                !/^\d+/.test(text) &&  // Reject if starts with number
                !/notification|message|home|jobs|network|search|sign|apply|save|easy|promoted|reviewing|applicant/i.test(text)) {
                console.log('[RESUME_RAG] ✓ Company from LinkedIn company link:', text);
                return text;
            }
        }

        // Method 3: Look for the company logo image alt text
        const companyLogo = document.querySelector('img[alt*="logo"], img[alt*="Logo"]');
        if (companyLogo) {
            const altText = companyLogo.alt;
            // Extract company name from "CompanyName logo"
            const match = altText.match(/^(.+?)\s+[Ll]ogo$/);
            if (match) {
                console.log('[RESUME_RAG] Company from LinkedIn logo alt:', match[1]);
                return match[1];
            }
        }

        console.log('[RESUME_RAG] LinkedIn-specific extraction failed, falling back to generic');
    }

    // Special handling for Greenhouse embed URLs - extract from 'for' parameter
    if (hostname.includes('greenhouse.io') && url.includes('/embed/')) {
        const forMatch = url.match(/[?&]for=([^&]+)/);
        if (forMatch) {
            const companySlug = forMatch[1];
            // Convert slug to proper name: "smartsheet" -> "Smartsheet"
            const companyName = companySlug
                .split(/[-_]/)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            console.log('[RESUME_RAG] Company from Greenhouse embed URL:', companyName);
            return companyName;
        }
    }

    // Robert Half: client company is confidential — track under "Robert Half"
    // Only trigger on actual job listing pages (/job/ in path), not homepage/search
    if (hostname.includes('roberthalf.com')) {
        if (pathname.includes('/job/')) {
            console.log('[RESUME_RAG] Robert Half job listing — using "Robert Half" as company');
            return 'Robert Half';
        }
        return null;
    }

    // Special handling for Glassdoor pages - extract from URL or page title
    if (hostname.includes('glassdoor.com')) {
        // Salary page: /Salary/Company-Job-Salaries-EXXXX_D_KOstart,end.htm
        // KO offset reliably marks where the job title starts in the slug
        const salaryMatch = url.match(/\/Salary\/(.+?)-Salaries-E\d+(?:[^K]*KO(\d+),)/i);
        if (salaryMatch) {
            const fullSlug = salaryMatch[1];
            const koStart = parseInt(salaryMatch[2]);
            if (koStart > 0) {
                const companySlug = fullSlug.substring(0, koStart - 1);
                const companyName = companySlug.replace(/-/g, ' ');
                console.log('[RESUME_RAG] Company from Glassdoor salary URL:', companyName);
                return companyName;
            }
        }

        // Extract from URL pattern: /Working-at-Mutt-Data-EI_IE4910049
        const urlMatch = url.match(/Working-at-(.+?)-EI_/);
        if (urlMatch) {
            const companyName = urlMatch[1].replace(/-/g, ' ');
            console.log('[RESUME_RAG] Company from Glassdoor URL:', companyName);
            return companyName;
        }
        // Extract from page title: "Mutt Data Reviews | Glassdoor"
        const titleMatch = document.title.match(/^([^|]+)/);
        if (titleMatch) {
            let companyName = titleMatch[1].trim();
            // Remove common suffixes
            companyName = companyName.replace(/\s+(Reviews?|Overview|Salaries|Jobs|Interviews)\s*$/i, '').trim();
            if (companyName && companyName.toLowerCase() !== 'glassdoor') {
                console.log('[RESUME_RAG] Company from Glassdoor title:', companyName);
                return companyName;
            }
        }
    }

    // Pattern 1: /company-name/job or /company-name/apply (standard)
    let pathMatch = pathname.match(/^\/([^\/]+)\/(jobs?|apply|careers|positions?)/i);

    // Pattern 2: Lever jobs - jobs.lever.co/company-name/job-id/apply
    if (!pathMatch && hostname.includes('lever.co')) {
        pathMatch = pathname.match(/^\/([^\/]+)\//);
    }

    // Pattern 3: Generic /company-name/... on job boards
    if (!pathMatch && (hostname.includes('jobs.') || hostname.includes('careers.'))) {
        pathMatch = pathname.match(/^\/([^\/]+)\//);
    }

    console.log('[RESUME_RAG] Path match result:', pathMatch);
    if (pathMatch && pathMatch[1]) {
        const companySlug = pathMatch[1];
        // Convert slug to proper name: "elsa-corp" -> "Elsa Corp"
        const companyName = companySlug
            .split(/[-_]/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        if (companyName.length > 2 && !/www|com|org|net|io|job|apply|search/i.test(companyName)) {
            console.log('[RESUME_RAG] Company from URL path:', companyName);
            return companyName;
        }
    }

    // 2. Look for "About [Company]" sections (common on job boards)
    const aboutHeadings = document.querySelectorAll('h1, h2, h3, h4, div, span, strong');
    for (const elem of aboutHeadings) {
        const text = elem.textContent?.trim();
        if (text && text.length > 5 && text.length < 100) {
            // Match patterns like "About Planet DDS", "About [Company Name]"
            const aboutMatch = text.match(/^About\s+(.+?)$/i);
            if (aboutMatch) {
                const companyName = aboutMatch[1].trim();
                // Make sure it's not generic text
                if (!/company|us|our team|this|the|job|position/i.test(companyName)) {
                    console.log('[RESUME_RAG] Company from About section:', companyName);
                    return companyName;
                }
            }
        }
    }

    // 3. Meta tags (but avoid platform providers like "Manatal", "Greenhouse", etc.)
    const ogSiteName = document.querySelector('meta[property="og:site_name"]')?.content;
    if (ogSiteName && ogSiteName.length > 2 && ogSiteName.length < 100) {
        // Skip if it's a known job platform provider
        if (!/manatal|greenhouse|lever|workday|taleo|jobvite|icims|smartrecruiters|primepay/i.test(ogSiteName)) {
            return ogSiteName;
        }
    }

    // 3. Look for company name in main page heading (h1, h2)
    const headings = document.querySelectorAll('h1, h2');
    for (const heading of headings) {
        const text = heading.textContent?.trim();
        if (text && text.length > 2 && text.length < 100) {
            // CRITICAL: Immediately reject text starting with numbers (like "0 notifications")
            if (/^\d/.test(text)) {
                console.log('[RESUME_RAG] Skipping heading starting with number:', text);
                continue;
            }

            // Skip if it contains job-related words, job titles, UI text, or is too generic
            const skipPattern = /job|career|application|apply|hiring|position|welcome|openings|engineer|developer|designer|manager|analyst|specialist|coordinator|director|lead|senior|junior|intern|consultant|architect|scientist|technician|administrator|assistant|associate|officer|representative|agent|executive|notification|message|alert|update|home|search/i;

            if (!skipPattern.test(text)) {
                // Clean up the text (remove extra commas, spaces, etc.)
                const cleaned = text.replace(/,\s*$/, '').trim();
                if (cleaned && !/^(the|a|an)\s/i.test(cleaned)) {
                    console.log('[RESUME_RAG] Company from heading:', cleaned);
                    return cleaned;
                }
            }
        }
    }

    // 4. Page title - extract company name from patterns like "Company Name - Job Title"
    const title = document.title;
    if (title) {
        // Try splitting on common separators
        const parts = title.split(/[\|\-–—]/);
        if (parts.length > 1) {
            const jobTitlePattern = /job|career|application|apply|hiring|position|engineer|developer|designer|manager|analyst|specialist/i;

            // Usually company name is at the end or beginning
            const lastPart = parts[parts.length - 1].trim();
            const firstPart = parts[0].trim();

            // Prefer the part that doesn't contain common job-related words or job titles
            if (!jobTitlePattern.test(lastPart) && lastPart.length > 2 && lastPart.length < 50) {
                console.log('[RESUME_RAG] Company from page title (last):', lastPart);
                return lastPart;
            }
            if (!jobTitlePattern.test(firstPart) && firstPart.length > 2 && firstPart.length < 50) {
                console.log('[RESUME_RAG] Company from page title (first):', firstPart);
                return firstPart;
            }
        }
    }

    // 5. Look for company name in form fields or labels
    const companyInputs = document.querySelectorAll('input[name*="company"], input[id*="company"]');
    for (const input of companyInputs) {
        if (input.value && input.value.length > 2) {
            return input.value.trim();
        }
    }

    // 6. Check hostname as fallback (hostname already declared at top of function)
    // Skip hostname extraction for job board platforms
    if (/recruit\.com|jobvite\.com|icims\.com|taleo\.net|workday\.com|greenhouse\.io|lever\.co/i.test(hostname)) {
        console.log('[RESUME_RAG] ⚠️ Could not extract company name from job board page');
        return null;
    }

    const domain = hostname.replace(/^(www\.|jobs\.|careers\.)/, '');
    const companyFromDomain = domain.split('.')[0];

    // Reject if it looks like a subdomain with weird formatting (multiple hyphens, "llc", etc.)
    if (/-.*-/.test(companyFromDomain) || /buyer|seller|llc|inc|corp/i.test(companyFromDomain)) {
        console.log('[RESUME_RAG] ⚠️ Rejected suspicious domain-based company name:', companyFromDomain);
        return null;
    }

    // Capitalize first letter
    const result = companyFromDomain.charAt(0).toUpperCase() + companyFromDomain.slice(1);
    console.log('[RESUME_RAG] Company from hostname fallback:', result);
    return result;
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
        console.log('[RESUME_RAG] Resume order for file uploads:', resumeOrder?.length || 0, 'items');
        if (resumeOrder && resumeOrder.length > 0) {
            const fileCount = await handleFileInputs(resumeOrder, backendUrl);
            totalFilled += fileCount;
        } else {
            console.log('[RESUME_RAG] ⚠️ No resumeOrder provided, skipping file uploads');
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

                        // Skip if field already has user-entered content
                        if (textarea.value && textarea.value.trim().length > 0) {
                            console.log('[RESUME_RAG] Skipping already-filled field');
                            continue;
                        }

                        // Validate answer is appropriate for question type
                        const answerText = bestMatch.answer_text.toLowerCase().trim();
                        const questionLower = questionText.toLowerCase();

                        // Check for incompatible question/answer pairs
                        let isIncompatible = false;

                        // Transgender/gender identity questions should only get Yes/No answers
                        if (questionLower.includes('transgender') || questionLower.includes('gender identity')) {
                            const validAnswers = ['yes', 'no', 'prefer not', 'decline'];
                            if (!validAnswers.some(valid => answerText.includes(valid))) {
                                console.log('[RESUME_RAG] Skipping incompatible answer for transgender question:', answerText);
                                isIncompatible = true;
                            }
                        }

                        // Race/ethnicity questions should not get Yes/No answers
                        if ((questionLower.includes('race') || questionLower.includes('ethnicity')) &&
                            (answerText === 'yes' || answerText === 'no')) {
                            console.log('[RESUME_RAG] Skipping incompatible Yes/No answer for race question');
                            isIncompatible = true;
                        }

                        if (isIncompatible) {
                            continue;
                        }

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

                        // Skip if field already has a user-selected value (not the default/placeholder option)
                        if (select.selectedIndex > 0 && select.value && select.value.trim().length > 0) {
                            console.log('[RESUME_RAG] Skipping already-selected dropdown');
                            continue;
                        }

                        // Validate answer is appropriate for question type
                        const answerText = bestMatch.answer_text.toLowerCase().trim();
                        const questionLower = questionText.toLowerCase();

                        // Check for incompatible question/answer pairs
                        let isIncompatible = false;

                        // Transgender/gender identity questions should only get Yes/No answers
                        if (questionLower.includes('transgender') || questionLower.includes('gender identity')) {
                            const validAnswers = ['yes', 'no', 'prefer not', 'decline'];
                            if (!validAnswers.some(valid => answerText.includes(valid))) {
                                console.log('[RESUME_RAG] Skipping incompatible answer for transgender question:', answerText);
                                isIncompatible = true;
                            }
                        }

                        // Race/ethnicity questions should not get Yes/No answers
                        if ((questionLower.includes('race') || questionLower.includes('ethnicity')) &&
                            (answerText === 'yes' || answerText === 'no')) {
                            console.log('[RESUME_RAG] Skipping incompatible Yes/No answer for race question');
                            isIncompatible = true;
                        }

                        if (isIncompatible) {
                            continue;
                        }

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

                        // Validate answer is appropriate for question type
                        const answerLower = answerValue.toLowerCase();
                        const questionLower = questionText.toLowerCase();

                        // Validate this is actually a Yes/No type answer
                        const isYesNoAnswer = answerLower === 'yes' || answerLower === 'no' ||
                                            answerLower.includes('prefer not') || answerLower.includes('decline');

                        if (!isYesNoAnswer) {
                            console.log('[RESUME_RAG] Skipping non-Yes/No answer for Yes/No question:', answerValue);
                            continue;
                        }

                        // Additional validation: race/ethnicity answers should not be used for Yes/No questions
                        const raceAnswers = ['white', 'black', 'asian', 'hispanic', 'latino', 'native american', 'pacific islander'];
                        if (raceAnswers.some(race => answerLower.includes(race))) {
                            console.log('[RESUME_RAG] Skipping race answer for Yes/No question:', answerValue);
                            continue;
                        }

                        // Find and click the appropriate Yes or No button
                        let targetButton = null;
                        const buttons = elem.querySelectorAll('button, [role="button"], div[role="button"]');

                        // Check if any button is already selected/active
                        let alreadySelected = false;
                        for (const btn of buttons) {
                            if (btn.classList.contains('selected') ||
                                btn.classList.contains('active') ||
                                btn.getAttribute('aria-pressed') === 'true' ||
                                btn.getAttribute('data-selected') === 'true') {
                                alreadySelected = true;
                                break;
                            }
                        }

                        if (alreadySelected) {
                            console.log('[RESUME_RAG] Skipping already-selected Yes/No field');
                            continue;
                        }

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
    let inputs = Array.from(document.querySelectorAll('input[role="combobox"]'));
    if (inputs.length === 0) {
        console.log('[RESUME_RAG] Waiting for form fields to load...');
        for (let i = 0; i < 30; i++) {
            await sleep(100);
            inputs = Array.from(document.querySelectorAll('input[role="combobox"]'));
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

        // Skip if field already has user-entered content
        if (input.value && input.value.trim().length > 0) {
            console.log('[RESUME_RAG] Skipping already-filled combobox:', fieldId);
            continue;
        }

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
    console.log('[RESUME_RAG] handleFileInputs called with', resumeOrder.length, 'resumes');
    let fileCount = 0;

    // Find enabled resumes
    const enabledResumes = resumeOrder.filter(r => r.enabled);
    console.log('[RESUME_RAG] Found', enabledResumes.length, 'enabled resumes');
    if (enabledResumes.length === 0) return 0;

    // Find resumes with matching filenames
    const resumeFile = enabledResumes.find(r => r.filename.toLowerCase().includes('resume'));
    const coverFile = enabledResumes.find(r => r.filename.toLowerCase().includes('cover'));
    console.log('[RESUME_RAG] Resume file:', resumeFile?.filename, 'Cover file:', coverFile?.filename);

    // Process file inputs
    const fileInputs = document.querySelectorAll('input[type="file"]');
    console.log('[RESUME_RAG] Found', fileInputs.length, 'file input elements');
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

            // Method 5: look for ANY text in the immediate parent container that might indicate purpose
            if (!label || label === 'choose file' || label === 'browse') {
                let parent = input.parentElement;
                let attempts = 0;
                while (parent && attempts < 3) {
                    const text = parent.textContent?.toLowerCase() || '';
                    // Look for "resume" or "cv" in the parent text
                    if (/resume|cv|curriculum/i.test(text)) {
                        label = text.substring(0, 200); // Take first 200 chars to avoid huge strings
                        break;
                    }
                    parent = parent.parentElement;
                    attempts++;
                }
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
        while (current && !questionText && depth < 5) {
            // Look for a label element first
            const label = current.querySelector('label');
            if (label && label.textContent?.includes('?')) {
                questionText = label.textContent.trim();
                break;
            }

            // Otherwise check immediate children for question text (not ALL descendants)
            for (const child of current.children || []) {
                if (child === elem || child.contains(elem)) continue; // Skip the Yes/No element itself
                const text = child.textContent?.trim() || '';
                if (text.includes('?') && text.length < 200) {
                    questionText = text;
                    break;
                }
            }

            if (questionText) break;
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

// ============================================================================
// GLASSDOOR AUTO-UPDATE FEATURE
// ============================================================================

// Extract pay range from a Glassdoor salary page and return data for column G
function detectGlassdoorSalaryPage(url) {
    // Extract company name using the KO offset (marks where job title starts in the slug)
    let companyName = null;
    const koMatch = url.match(/\/Salary\/(.+?)-Salaries-E\d+(?:[^K]*KO(\d+),)/i);
    if (koMatch) {
        const fullSlug = koMatch[1];
        const koStart = parseInt(koMatch[2]);
        if (koStart > 0) {
            companyName = fullSlug.substring(0, koStart - 1).replace(/-/g, ' ');
        }
    }
    // Fallback: page title "Job Title Salaries at Company | Glassdoor"
    if (!companyName) {
        const titleMatch = document.title.match(/\bSalaries?\s+at\s+(.+?)(?:\s*[|–—-]|$)/i);
        if (titleMatch) companyName = titleMatch[1].trim();
    }

    if (!companyName || companyName.toLowerCase() === 'glassdoor') {
        console.log('[RESUME_RAG] Could not extract company name from Glassdoor salary page');
        return null;
    }
    console.log('[RESUME_RAG] Glassdoor salary page for:', companyName);

    const pageText = document.body.textContent;
    let payRange = null;

    // Range with en/em dash: "$74K – $147K"
    const dashRangeMatch = pageText.match(/\$([\d,]+[KkMm]?)\s*[–—]\s*\$([\d,]+[KkMm]?)/);
    if (dashRangeMatch) {
        payRange = `$${dashRangeMatch[1].toUpperCase()}-$${dashRangeMatch[2].toUpperCase()}`;
    }
    // Range with hyphen and spaces: "$74K - $147K"
    if (!payRange) {
        const hyphenRangeMatch = pageText.match(/\$([\d,]+[KkMm]?)\s+-\s+\$([\d,]+[KkMm]?)/);
        if (hyphenRangeMatch) {
            payRange = `$${hyphenRangeMatch[1].toUpperCase()}-$${hyphenRangeMatch[2].toUpperCase()}`;
        }
    }
    // Single value fallback: "$108K/yr"
    if (!payRange) {
        const singleMatch = pageText.match(/\$([\d,]+[KkMm]+)\s*\/\s*yr/i);
        if (singleMatch) payRange = `$${singleMatch[1].toUpperCase()}`;
    }

    if (!payRange) {
        console.log('[RESUME_RAG] Could not extract pay range from Glassdoor salary page');
        return null;
    }
    console.log('[RESUME_RAG] Extracted pay range:', payRange, 'for', companyName);

    return {
        companyName: companyName,
        glassdoorUrl: url,
        medianPay: payRange
        // No rating — salary pages don't show the overall company rating
    };
}

// Detect if we're on a Glassdoor company overview page and extract rating
function detectGlassdoorPage() {
    const url = window.location.href;
    const hostname = window.location.hostname;

    // Check if we're on Glassdoor
    if (!hostname.includes('glassdoor.com')) {
        return null;
    }

    // ONLY allow Overview, Reviews, or Salary pages
    const isOverviewPage = url.includes('/Overview/Working-at-') || url.includes('/Reviews/');
    const isSalaryPage = url.includes('/Salary/') && url.includes('-Salaries-');

    if (isSalaryPage) {
        return detectGlassdoorSalaryPage(url);
    }

    if (!isOverviewPage) {
        console.log('[RESUME_RAG] Skipping Glassdoor page - not a company overview/reviews/salary page');
        return null;
    }

    console.log('[RESUME_RAG] Detected Glassdoor company page');

    // Extract company name from the page
    let companyName = null;

    // Method 1: From page title
    const titleMatch = document.title.match(/(.+?)\s+(?:Overview|Reviews)/i);
    if (titleMatch) {
        companyName = titleMatch[1].trim();
    }

    // Method 2: From h1 heading
    if (!companyName) {
        const h1 = document.querySelector('h1');
        if (h1) {
            companyName = h1.textContent.trim();
        }
    }

    // Method 3: From URL
    if (!companyName) {
        const urlMatch = url.match(/Working-at-(.+?)-EI_/);
        if (urlMatch) {
            companyName = urlMatch[1].replace(/-/g, ' ');
        }
    }

    // Don't track Glassdoor itself as a company
    if (!companyName || companyName.toLowerCase() === 'glassdoor') {
        console.log('[RESUME_RAG] Skipping Glassdoor page (not a company to track)');
        return null;
    }

    // Extract rating and review count from company overview/reviews page
    let rating = null;
    let reviewCount = null;

    // Method 1: Look for JSON-LD structured data
    const scriptTags = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scriptTags) {
        try {
            const data = JSON.parse(script.textContent);
            if (data.aggregateRating) {
                rating = parseFloat(data.aggregateRating.ratingValue);
                reviewCount = parseInt(data.aggregateRating.reviewCount);
                console.log('[RESUME_RAG] Found rating in JSON-LD:', rating, reviewCount);
                break;
            }
        } catch (e) {
            // Continue to next script tag
        }
    }

    // Method 2: Look for rating in visible elements
    if (!rating) {
        // Try data-test attribute
        let ratingElem = document.querySelector('[data-test="rating"]');
        if (ratingElem) {
            const ratingText = ratingElem.textContent.trim();
            const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
            if (ratingMatch) {
                rating = parseFloat(ratingMatch[1]);
                console.log('[RESUME_RAG] Found rating in data-test:', rating);
            }
        }
    }

    // Method 3: Search page text for rating
    if (!rating) {
        const pageText = document.body.textContent;
        const ratingMatch = pageText.match(/(\d+\.\d+)\s*(?:out of 5|★)/);
        if (ratingMatch) {
            rating = parseFloat(ratingMatch[1]);
            console.log('[RESUME_RAG] Found rating in page text:', rating);
        }
    }

    // Extract review count if not found yet
    if (!reviewCount) {
        const pageText = document.body.textContent;
        const reviewMatch = pageText.match(/([\d,]+)\s*(?:reviews?|ratings?)/i);
        if (reviewMatch) {
            reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''));
            console.log('[RESUME_RAG] Found review count:', reviewCount);
        }
    }

    // Extract additional Glassdoor stats (only on overview pages, not search)
    let recommendPct = null;
    let ceoPct = null;
    let medianPay = null;
    let employeeCount = null;

    if (isOverviewPage) {
        const pageText = document.body.textContent;
        console.log('[RESUME_RAG] Extracting additional Glassdoor stats from overview page');

        // Method 1: Extract "Recommend to a friend" percentage
        // Look for patterns like "72% would recommend to a friend"
        const recommendPatterns = [
            /(\d+)%\s+would\s+recommend/i,
            /(\d+)%\s+recommend/i,
            /recommend(?:ation)?\s*[:\-]?\s*(\d+)%/i,
            /would\s+recommend\s+to\s+a\s+friend\s*[:\-]?\s*(\d+)%/i
        ];
        for (const pattern of recommendPatterns) {
            const match = pageText.match(pattern);
            if (match) {
                recommendPct = parseInt(match[1]);
                console.log('[RESUME_RAG] Found recommend %:', recommendPct);
                break;
            }
        }

        // Method 2: Extract CEO approval percentage
        // Look for patterns like "85% Approve of CEO" or "Approval of CEO"
        const ceoPatterns = [
            /(\d+)%\s+approve\s+of\s+(?:ceo|CEO)/i,
            /approve\s+of\s+(?:ceo|CEO)\s*[:\-]?\s*(\d+)%/i,
            /(?:ceo|CEO)\s+approval\s*[:\-]?\s*(\d+)%/i,
            /(\d+)%\s+(?:ceo|CEO)/i
        ];
        for (const pattern of ceoPatterns) {
            const match = pageText.match(pattern);
            if (match) {
                ceoPct = parseInt(match[1]);
                console.log('[RESUME_RAG] Found CEO approval %:', ceoPct);
                break;
            }
        }

        // Method 3: Extract median total pay
        // Look for patterns like "$120K" or "$120,000" near "salary" or "pay" keywords
        const payPatterns = [
            /\$\s*([\d,]+[KkMm]?)\s+median/i,
            /median\s+total\s+pay\s*[:\-]?\s*\$?\s*([\d,]+[KkMm]?)/i,
            /total\s+pay\s*[:\-]?\s*\$?\s*([\d,]+[KkMm]?)/i,
            /median\s+base\s+salary\s*[:\-]?\s*\$?\s*([\d,]+[KkMm]?)/i
        ];
        for (const pattern of payPatterns) {
            const match = pageText.match(pattern);
            if (match) {
                medianPay = match[1];
                // Normalize format: add $ if missing, keep K/M suffix
                if (!medianPay.startsWith('$')) {
                    medianPay = '$' + medianPay;
                }
                console.log('[RESUME_RAG] Found median pay:', medianPay);
                break;
            }
        }

        // Method 4: Extract employee count
        // Look for patterns like "51-200 employees" or "10,000+ employees" or "Size 1001 to 5000 Employees"
        const employeePatterns = [
            /([\d,]+)\s*(?:to|[-–])\s*([\d,]+)\s*(?:employees?|Employees?)/i,
            /([\d,]+)\+?\s*(?:employees?|Employees?)/i,
            /Size[\s:]*(\d+)\s*to\s*(\d+)/i,
            /(\d+)\s*[-–]\s*(\d+)\s*employees?/i
        ];
        for (const pattern of employeePatterns) {
            const match = pageText.match(pattern);
            if (match) {
                if (match[2]) {
                    // Range format (e.g., "51-200" or "1 to 50")
                    employeeCount = `${match[1]}-${match[2]}`;
                } else {
                    // Single number or "10,000+" format
                    employeeCount = match[1];
                    if (pageText.includes(match[1] + '+')) {
                        employeeCount += '+';
                    }
                }
                console.log('[RESUME_RAG] Found employee count:', employeeCount);
                break;
            }
        }

        // Method 5: Try to find stats in structured elements
        // Look for common Glassdoor class names and data attributes
        if (!recommendPct || !ceoPct || !medianPay || !employeeCount) {
            const statElements = document.querySelectorAll('[data-test*="rating"], [class*="Rating"], [class*="stat"], [class*="employer"]');
            for (const elem of statElements) {
                const text = elem.textContent || '';

                if (!recommendPct && /recommend/i.test(text)) {
                    const match = text.match(/(\d+)%/);
                    if (match) {
                        recommendPct = parseInt(match[1]);
                        console.log('[RESUME_RAG] Found recommend % in element:', recommendPct);
                    }
                }

                if (!ceoPct && /ceo/i.test(text)) {
                    const match = text.match(/(\d+)%/);
                    if (match) {
                        ceoPct = parseInt(match[1]);
                        console.log('[RESUME_RAG] Found CEO % in element:', ceoPct);
                    }
                }

                if (!medianPay && /pay|salary/i.test(text)) {
                    const match = text.match(/\$?([\d,]+[KkMm]?)/);
                    if (match) {
                        medianPay = match[1];
                        if (!medianPay.startsWith('$')) {
                            medianPay = '$' + medianPay;
                        }
                        console.log('[RESUME_RAG] Found median pay in element:', medianPay);
                    }
                }

                if (!employeeCount && /employee|size/i.test(text)) {
                    const match = text.match(/([\d,]+)\s*(?:to|[-–])\s*([\d,]+)|(\d+)\+?\s*employees?/i);
                    if (match) {
                        if (match[1] && match[2]) {
                            employeeCount = `${match[1]}-${match[2]}`;
                        } else if (match[3]) {
                            employeeCount = match[3];
                            if (text.includes('+')) employeeCount += '+';
                        }
                        console.log('[RESUME_RAG] Found employee count in element:', employeeCount);
                    }
                }
            }
        }
    }

    if (!rating) {
        console.log('[RESUME_RAG] Could not extract rating from Glassdoor page');
        return null;
    }

    const glassdoorData = {
        companyName: companyName,
        rating: rating,
        reviewCount: reviewCount,
        glassdoorUrl: url
    };

    // Add optional fields if found
    if (recommendPct !== null) {
        glassdoorData.recommendPct = recommendPct;
    }
    if (ceoPct !== null) {
        glassdoorData.ceoPct = ceoPct;
    }
    if (medianPay !== null) {
        glassdoorData.medianPay = medianPay;
    }
    if (employeeCount !== null) {
        glassdoorData.employeeCount = employeeCount;
    }

    // Log what we found
    console.log('[RESUME_RAG] Glassdoor data extracted:', {
        company: companyName,
        rating: rating,
        reviewCount: reviewCount,
        recommendPct: recommendPct,
        ceoPct: ceoPct,
        medianPay: medianPay,
        employeeCount: employeeCount
    });

    return glassdoorData;
}

// Send Glassdoor data to backend to update spreadsheet
async function updateSpreadsheetWithGlassdoor(glassdoorData) {
    try {
        console.log('[RESUME_RAG] Sending Glassdoor data to backend:', glassdoorData);

        const response = await apiRequest(
            `${window.RESUME_RAG_BACKEND_URL}/api/v1/tracking/update-glassdoor`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(glassdoorData)
            }
        );

        const result = await response.json();
        console.log('[RESUME_RAG] Glassdoor update result:', result);

        if (result.updated) {
            // Show a subtle notification
            showGlassdoorUpdateNotification(glassdoorData);
        }

        return result;
    } catch (error) {
        console.log('[RESUME_RAG] Error updating spreadsheet with Glassdoor data:', error);
        return { updated: false, error: error.message };
    }
}

// Show a subtle notification when Glassdoor data is captured
function showGlassdoorUpdateNotification(glassdoorData) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4caf50;
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        animation: slideIn 0.3s ease-out;
        max-width: 350px;
    `;

    // Build stats summary
    const stats = [`★ ${glassdoorData.rating}`];
    if (glassdoorData.recommendPct) {
        stats.push(`${glassdoorData.recommendPct}% recommend`);
    }
    if (glassdoorData.employeeCount) {
        stats.push(`${glassdoorData.employeeCount} employees`);
    }
    if (glassdoorData.ceoPct) {
        stats.push(`${glassdoorData.ceoPct}% CEO`);
    }
    if (glassdoorData.medianPay) {
        stats.push(`${glassdoorData.medianPay} pay`);
    }

    notification.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 4px;">✓ Updated: ${glassdoorData.companyName}</div>
        <div style="font-size: 12px; opacity: 0.9;">${stats.join(' • ')}</div>
    `;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(400px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(400px); opacity: 0; }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notification);

    // Remove after 4 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// Check for Glassdoor data on page load and after dynamic content loads
let glassdoorCheckTimer = null;
let glassdoorDataSent = false;

function checkAndUpdateGlassdoor() {
    if (glassdoorDataSent) return;

    const glassdoorData = detectGlassdoorPage();
    if (glassdoorData) {
        glassdoorDataSent = true;
        updateSpreadsheetWithGlassdoor(glassdoorData);
    }
}

// Run check after page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(checkAndUpdateGlassdoor, 3000); // Wait for dynamic content
    });
} else {
    setTimeout(checkAndUpdateGlassdoor, 3000);
}

// Also check again after a longer delay for very slow loading pages
setTimeout(checkAndUpdateGlassdoor, 5000);

// Also check when page content changes (for SPAs)
const glassdoorObserver = new MutationObserver(() => {
    if (glassdoorCheckTimer) clearTimeout(glassdoorCheckTimer);
    glassdoorCheckTimer = setTimeout(checkAndUpdateGlassdoor, 1000);
});

if (window.location.hostname.includes('glassdoor.com')) {
    glassdoorObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// ============================================================================
// APPLY BUTTON DETECTION - Track when user submits application
// ============================================================================

let applicationSubmitted = false;

function detectApplyButtonClick(event) {
    // Prevent duplicate submissions
    if (applicationSubmitted) {
        console.log('[RESUME_RAG] Application already submitted, ignoring');
        return;
    }

    const target = event.target;
    const buttonText = target.textContent?.toLowerCase() || '';
    const buttonType = target.type?.toLowerCase() || '';
    const buttonRole = target.getAttribute('role') || '';

    // Check if this looks like an Apply/Submit button
    const isApplyButton =
        /apply|submit|send\s*application|continue\s*to|finish|complete/i.test(buttonText) &&
        !(/save|cancel|back|previous|edit|delete/i.test(buttonText));

    const isSubmitButton = buttonType === 'submit';

    if (isApplyButton || isSubmitButton) {
        console.log('[RESUME_RAG] Apply/Submit button clicked:', buttonText);

        // Get company and job info
        const companyName = extractCompanyName();
        const jobId = extractJobId();
        const jobTitle = extractJobTitle();
        const jobUrl = window.location.href;

        if (companyName) {
            console.log('[RESUME_RAG] Recording application submission for:', companyName);
            applicationSubmitted = true;

            // Send to backend to update Applied Date
            chrome.storage.sync.get('backendUrl', async (result) => {
                const backendUrl = result.backendUrl || 'http://localhost:8000';

                try {
                    const response = await fetch(`${backendUrl}/api/v1/tracking/job-application`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            company_name: companyName,
                            job_url: jobUrl,
                            job_title: jobTitle,
                            job_id: jobId,
                            date_applied: new Date().toISOString().split('T')[0] // YYYY-MM-DD
                        })
                    });

                    if (response.ok) {
                        const data = await response.json();
                        console.log('[RESUME_RAG] ✓ Application recorded:', data.message);

                        // Show notification
                        chrome.runtime.sendMessage({
                            type: 'APPLICATION_SUBMITTED',
                            company: companyName,
                            jobTitle: jobTitle
                        });
                    } else {
                        console.log('[RESUME_RAG] Failed to record application:', response.status);
                    }
                } catch (error) {
                    console.log('[RESUME_RAG] Error recording application:', error);
                }
            });
        }
    }
}

// Listen for clicks on all buttons and form submissions
document.addEventListener('click', detectApplyButtonClick, true);

// Also listen for form submissions
document.addEventListener('submit', (event) => {
    console.log('[RESUME_RAG] Form submitted');
    // Trigger the same logic as clicking Apply
    detectApplyButtonClick({ target: event.target });
}, true);

console.log('[RESUME_RAG] Apply button detection active');

// ============================================================================
// REJECTION DETECTION (provider-agnostic)
// ============================================================================
// Scans visible page text for rejection language. When matched, extracts
// company + job title from the surrounding text and POSTs to
// /api/v1/tracking/mark-rejected. The spreadsheet is the filter: if the
// extracted company isn't there, the backend returns updated:false and nothing
// happens. Works on any email provider, web client, or even a forwarded email
// viewed inline anywhere.

const REJECTION_PATTERNS = [
    /decided\s+to\s+(?:move|go|proceed|pursue)\s+(?:ahead|forward)?\s*(?:with)?\s*other\s+(?:candidates|applicants)/i,
    /(?:moving|going)\s+(?:ahead|forward)\s+with\s+other\s+(?:candidates|applicants)/i,
    /we\s+(?:will\s+not|won['’]t|are\s+unable\s+to)\s+(?:be\s+)?(?:moving\s+forward|progressing|advancing)/i,
    /your\s+application\s+(?:has\s+been|was)\s+(?:not\s+successful|unsuccessful|declined)/i,
    /not\s+(?:be\s+)?(?:moving\s+forward|progressing)\s+with\s+your\s+(?:application|candidacy)/i,
    /we\s+(?:have\s+)?(?:decided|chosen)\s+not\s+to\s+(?:move\s+forward|proceed)/i,
    /regret\s+to\s+inform\s+you/i,
    /pursue\s+(?:other|another)\s+candidate/i,
    /(?:better|stronger)\s+match\s+for\s+(?:the|this)\s+(?:role|position)/i,
];

const processedRejectionContent = new Set();
let rejectionScanTimer = null;

function extractCompanyFromText(pageText) {
    const candidates = [];

    // "application to/at/for/with <Company>"
    const appMatch = pageText.match(/application\s+(?:to|at|for|with)\s+([A-Z][\w&.,'\- ]{1,60}?)(?:\s*[.\n,!?]|\s+(?:has|was|is|for)\b)/);
    if (appMatch) candidates.push(appMatch[1].trim());

    // "interest in [the X at] Y"
    const interestMatch = pageText.match(/interest\s+in\s+(?:the\s+[^.\n]+?\s+at\s+)?([A-Z][\w&.,'\- ]{1,60}?)[\s.\n,]/);
    if (interestMatch) candidates.push(interestMatch[1].trim());

    // "the X at <Company>" (job-title + company pattern)
    const atMatch = pageText.match(/\bat\s+([A-Z][\w&.,'\- ]{1,60}?)(?:\s*[.\n,]|\s+(?:is|are|we|team)\b)/);
    if (atMatch) candidates.push(atMatch[1].trim());

    // "from the <Company> team"
    const fromMatch = pageText.match(/from\s+(?:the\s+)?([A-Z][\w&.,'\- ]{1,60}?)\s+(?:team|recruiting|talent|hr)/i);
    if (fromMatch) candidates.push(fromMatch[1].trim());

    // "Thank you for your interest in <Company>"
    const thanksMatch = pageText.match(/thank\s+you\s+for\s+(?:your\s+)?(?:interest|applying|application)\s+(?:in|to|at|with)\s+([A-Z][\w&.,'\- ]{1,60}?)[\s.\n,]/i);
    if (thanksMatch) candidates.push(thanksMatch[1].trim());

    for (const c of candidates) {
        const cleaned = c
            .replace(/\s*(corporate\s+careers?|careers?|recruiting|talent\s+team|hr|team)\s*$/i, '')
            .replace(/,?\s*(inc\.?|llc|ltd\.?|corp\.?)\s*$/i, '')
            .trim();
        if (cleaned && cleaned.length >= 2) return cleaned;
    }
    return null;
}

function extractJobTitleFromText(pageText) {
    const patterns = [
        /(?:for|in)\s+the\s+([A-Z][\w\- ,/&]{2,80}?)\s+(?:position|role|opportunity|opening)/,
        /(?:for|in)\s+the\s+([A-Z][\w\- ,/&]{2,80}?)\s+at\s+[A-Z]/,
        /interest\s+in\s+the\s+([A-Z][\w\- ,/&]{2,80}?)\s+at\s+/i,
        /application\s+(?:to|for)\s+the\s+([A-Z][\w\- ,/&]{2,80}?)\s+(?:position|role|at)/i,
        /applied\s+for\s+(?:the\s+)?([A-Z][\w\- ,/&]{2,80}?)\s+(?:position|role|at)/i,
    ];
    for (const p of patterns) {
        const m = pageText.match(p);
        if (m) return m[1].trim();
    }
    return null;
}

async function sendRejectionToBackend(companyName, jobTitle) {
    try {
        const payload = { companyName: companyName };
        if (jobTitle) payload.jobTitle = jobTitle;

        console.log('[RESUME_RAG] Sending rejection to backend:', payload);
        const response = await apiRequest(
            `${window.RESUME_RAG_BACKEND_URL}/api/v1/tracking/mark-rejected`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }
        );
        const result = await response.json();
        console.log('[RESUME_RAG] Rejection update result:', result);
        if (result.updated) {
            showRejectionNotification(companyName, result.job_title || jobTitle, result.rejection_date);
        }
        return result;
    } catch (err) {
        console.log('[RESUME_RAG] Error sending rejection:', err.message);
        return { updated: false, error: err.message };
    }
}

function showRejectionNotification(companyName, jobTitle, date) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #b71c1c;
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        animation: slideIn 0.3s ease-out;
        max-width: 360px;
    `;
    notification.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 4px;">✗ Rejection recorded: ${companyName}</div>
        <div style="font-size: 12px; opacity: 0.9;">${jobTitle ? jobTitle + ' • ' : ''}${date || 'today'}</div>
    `;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

function scanPageForRejection() {
    if (!document.body) return;
    const pageText = document.body.innerText || '';
    if (!pageText || pageText.length < 50) return;

    // Find the first matching rejection pattern
    let matchedPattern = null;
    for (const p of REJECTION_PATTERNS) {
        if (p.test(pageText)) { matchedPattern = p; break; }
    }
    if (!matchedPattern) return;

    // Dedupe per URL + first 200 chars of visible text
    const dedupeKey = window.location.href + '::' + pageText.slice(0, 200);
    if (processedRejectionContent.has(dedupeKey)) return;
    processedRejectionContent.add(dedupeKey);

    const company = extractCompanyFromText(pageText);
    if (!company) {
        console.log('[RESUME_RAG] Rejection language matched but could not extract company');
        return;
    }
    const jobTitle = extractJobTitleFromText(pageText);
    console.log('[RESUME_RAG] Rejection detected:', { company, jobTitle });
    sendRejectionToBackend(company, jobTitle);
}

const rejectionObserver = new MutationObserver(() => {
    if (rejectionScanTimer) clearTimeout(rejectionScanTimer);
    rejectionScanTimer = setTimeout(scanPageForRejection, 1000);
});

function startRejectionScanning() {
    rejectionObserver.observe(document.body, { childList: true, subtree: true });
    setTimeout(scanPageForRejection, 1500);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startRejectionScanning);
} else {
    startRejectionScanning();
}
console.log('[RESUME_RAG] Rejection detection active');
