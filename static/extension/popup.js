// Resume list state: [{id, filename, enabled}]
let resumeOrder = [];

// Drag state
let draggedElement = null;

// Default backend URL
const DEFAULT_BACKEND_URL = 'http://localhost:8000';
let backendUrl = DEFAULT_BACKEND_URL;
const BACKEND_START_COMMAND = 'cd ~/code/jesseolsen/rag && source venv/bin/activate && uvicorn app.main:app --reload';

function getServerErrorHtml(error) {
    // Check if it's a network/connection error
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        return `<h3>⚠️ Backend Offline</h3>
                <p>Start the server:</p>
                <code class="startup-command">${BACKEND_START_COMMAND}</code>
                <p style="margin-top: 8px;">
                    <a id="serverLink" href="${backendUrl}" target="_blank">Check server status →</a>
                </p>`;
    }

    if (error.message.includes('500')) {
        return `<h3>⚠️ Server Error</h3>
                <p>The backend returned an error. Check the server logs.</p>
                <p>You may need to initialize the database:</p>
                <code class="startup-command">cd ~/code/jesseolsen/rag && source venv/bin/activate && python init_db.py</code>`;
    }

    if (error.message.includes('404')) {
        return `<h3>⚠️ Server Misconfigured</h3>
                <p>Backend API endpoint not found. Restart the backend:</p>
                <code class="startup-command">${BACKEND_START_COMMAND}</code>`;
    }

    return `<h3>⚠️ Error</h3>
            <p>${error.message || 'Unknown error'}</p>
            <p><small>Check browser console (F12) for details.</small></p>`;
}

// Load settings and resumes on popup open
document.addEventListener('DOMContentLoaded', async () => {
    backendUrl = await getStoredBackendUrl() || DEFAULT_BACKEND_URL;

    // Check if server is running - only load data if server is available
    const serverAvailable = await checkServerConnection();

    if (serverAvailable) {
        await loadResumes();
        await loadFieldAnswers();
    }
    setupEventListeners();

    // Load company name from current page
    await loadCompanyName();
});

async function getStoredBackendUrl() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['backendUrl'], (result) => {
            resolve(result.backendUrl);
        });
    });
}

function saveBackendUrl(url) {
    chrome.storage.local.set({ backendUrl: url });
}

async function checkServerConnection() {
    const serverError = document.getElementById('serverError');
    const serverLink = document.getElementById('serverLink');
    const uploadStatus = document.getElementById('uploadStatus');

    // Always hide upload status on check (clear any cached state)
    uploadStatus.style.display = 'none';

    try {
        const response = await fetch(`${backendUrl}/health`, { timeout: 3000 });
        if (response.ok) {
            serverError.style.display = 'none';
            return true;
        } else {
            throw new Error('Server returned error');
        }
    } catch (error) {
        serverError.style.display = 'block';
        serverLink.href = backendUrl;
        return false;
    }
}

async function loadCompanyName() {
    // Clear badge at the start - will be set again if company is detected
    updateExtensionBadge(null);

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        console.log('[POPUP] Requesting company name from tab:', tab.id);

        // Use Promise wrapper to properly handle async operations
        const response = await new Promise((resolve) => {
            chrome.tabs.sendMessage(tab.id, {
                action: 'getCompanyName'
            }, { frameId: 0 }, (response) => {
                if (chrome.runtime.lastError) {
                    console.log('[POPUP] Could not get company name:', chrome.runtime.lastError.message);
                    resolve(null);
                    return;
                }
                resolve(response);
            });
        });

        console.log('[POPUP] Company name response:', response);

        if (response && response.success && response.companyName) {
            const companyDisplay = document.getElementById('companyNameDisplay');
            const companyValue = document.getElementById('companyNameValue');
            const statusIndicator = document.getElementById('companyStatusIndicator');

            companyValue.textContent = response.companyName;
            companyDisplay.classList.add('visible');

            console.log('[POPUP] Company name displayed:', response.companyName);
            if (response.jobId) {
                console.log('[POPUP] Job ID detected:', response.jobId);
            }

            // Set badge to checking while we verify status
            updateExtensionBadge('checking');

            // Check company/job status (returns cached rating and duplicate status)
            const statusData = await checkCompanyStatus(
                response.companyName,
                response.jobId,
                statusIndicator
            );

            // Load Glassdoor rating (will use cached if available, otherwise fetch)
            await loadGlassdoorRating(response.companyName, statusData);
        } else {
            console.log('[POPUP] No company name detected');
            updateExtensionBadge(null);
        }
    } catch (error) {
        console.log('[POPUP] Error loading company name:', error);
        updateExtensionBadge(null);
    }
}

async function checkCompanyStatus(companyName, jobId, statusIndicator) {
    try {
        // Auto-add job to spreadsheet if it doesn't exist
        let url = `${backendUrl}/api/v1/tracking/check-company?company_name=${encodeURIComponent(companyName)}&auto_add=true`;
        if (jobId) {
            url += `&job_id=${encodeURIComponent(jobId)}`;
        }

        const response = await fetch(url);

        if (!response.ok) {
            console.log('[POPUP] Failed to check company status:', response.status);
            statusIndicator.style.display = 'none';
            updateExtensionBadge(null);

            // Show helpful error message
            const serverError = document.getElementById('serverError');
            let errorHtml = '<h3>⚠️ Company Check Failed</h3>';

            if (response.status === 400) {
                try {
                    const errorData = await response.json();
                    errorHtml += `<p><strong>Bad Request:</strong> ${errorData.detail || 'Invalid request parameters'}</p>`;
                    errorHtml += '<p><strong>Fix:</strong></p><ul style="margin: 4px 0; padding-left: 20px; font-size: 12px;">';
                    errorHtml += '<li>Check that Google Sheets URL is set in backend .env</li>';
                    errorHtml += '<li>Verify GOOGLE_SPREADSHEET env variable is valid</li>';
                    errorHtml += '<li>Restart backend: <code>uvicorn app.main:app --reload</code></li>';
                    errorHtml += '</ul>';
                } catch (e) {
                    errorHtml += '<p>Invalid request format</p>';
                }
            } else if (response.status === 500) {
                errorHtml += '<p><strong>Server Error:</strong> Backend encountered an error</p>';
                errorHtml += '<p><strong>Fix:</strong></p><ul style="margin: 4px 0; padding-left: 20px; font-size: 12px;">';
                errorHtml += '<li>Check backend logs for Python errors</li>';
                errorHtml += '<li>Verify Google Sheets credentials file exists</li>';
                errorHtml += '<li>Ensure GOOGLE_SHEETS_CREDENTIALS_FILE path is correct</li>';
                errorHtml += '<li>Check spreadsheet permissions (service account has access)</li>';
                errorHtml += '</ul>';
            } else if (response.status === 404) {
                errorHtml += '<p><strong>Not Found:</strong> API endpoint missing</p>';
                errorHtml += '<p><strong>Fix:</strong> Restart backend with latest code</p>';
            }

            serverError.innerHTML = errorHtml;
            serverError.style.display = 'block';

            return { cachedRating: null, cachedReviewCount: null };
        }

        const data = await response.json();
        console.log('[POPUP] Company/job status:', data);

        if (!data.enabled) {
            // Google Sheets not configured, hide indicator
            statusIndicator.style.display = 'none';
            updateExtensionBadge(null);

            // Show configuration instructions
            const serverError = document.getElementById('serverError');
            serverError.innerHTML = `
                <h3>⚠️ Google Sheets Not Configured</h3>
                <p><strong>Fix:</strong></p>
                <ol style="margin: 4px 0; padding-left: 20px; font-size: 12px; line-height: 1.6;">
                    <li>Set GOOGLE_SPREADSHEET env variable to your spreadsheet URL</li>
                    <li>Set GOOGLE_SHEETS_CREDENTIALS_FILE to your service account JSON path</li>
                    <li>Restart the backend</li>
                </ol>
                <p style="font-size: 11px; margin-top: 6px;">Message: ${data.message || 'Integration not enabled'}</p>
            `;
            serverError.style.display = 'block';

            return { cachedRating: null, cachedReviewCount: null };
        }

        // Clear any previous errors
        const serverError = document.getElementById('serverError');
        serverError.style.display = 'none';

        // Update indicator based on duplicate job status (not just company existence)
        statusIndicator.classList.remove('checking');

        if (data.is_duplicate_job) {
            // This exact job (same job ID) already exists - RED
            statusIndicator.classList.add('applied');
            statusIndicator.title = 'Already applied to this job';
            updateExtensionBadge('applied');
        } else {
            // New job (even if company exists) - GREEN
            statusIndicator.classList.add('new');
            if (data.exists && !data.added) {
                statusIndicator.title = 'Company exists, new job opening';
            } else {
                statusIndicator.title = 'Just added to tracking';
            }
            updateExtensionBadge('new');
        }

        // Return cached Glassdoor data if available
        return {
            cachedRating: data.cached_rating,
            cachedReviewCount: data.cached_review_count
        };
    } catch (error) {
        console.log('[POPUP] Error checking company status:', error);
        // Hide indicator on error
        statusIndicator.style.display = 'none';
        updateExtensionBadge(null);

        // Show network error with fix instructions
        const serverError = document.getElementById('serverError');
        serverError.innerHTML = `
            <h3>⚠️ Connection Error</h3>
            <p><strong>Error:</strong> ${error.message}</p>
            <p><strong>Fix:</strong></p>
            <ul style="margin: 4px 0; padding-left: 20px; font-size: 12px;">
                <li>Check that backend is running at ${backendUrl}</li>
                <li>Start backend: <code>${BACKEND_START_COMMAND}</code></li>
                <li>Check browser console (F12) for details</li>
            </ul>
        `;
        serverError.style.display = 'block';

        return { cachedRating: null, cachedReviewCount: null };
    }
}

function updateExtensionBadge(status) {
    try {
        if (!status) {
            // Clear badge
            chrome.action.setBadgeText({ text: '' });
            return;
        }

        // Set badge with colored circle
        chrome.action.setBadgeText({ text: '●' });

        if (status === 'new') {
            // Green for not yet applied
            chrome.action.setBadgeBackgroundColor({ color: '#4caf50' });
        } else if (status === 'applied') {
            // Red for already applied
            chrome.action.setBadgeBackgroundColor({ color: '#f44336' });
        } else if (status === 'checking') {
            // Gray for checking
            chrome.action.setBadgeBackgroundColor({ color: '#9e9e9e' });
        }

        console.log('[POPUP] Extension badge updated:', status);
    } catch (error) {
        console.log('[POPUP] Error updating badge:', error);
    }
}

async function loadGlassdoorRating(companyName, statusData) {
    const ratingContainer = document.getElementById('glassdoorRating');

    // Check if we have cached rating from spreadsheet
    if (statusData && statusData.cachedRating) {
        const reviewText = statusData.cachedReviewCount ? ` (${statusData.cachedReviewCount} reviews)` : '';
        ratingContainer.style.display = 'flex';
        ratingContainer.innerHTML = `
            <span>Glassdoor:</span>
            <span style="color: #0caa41; font-weight: 600;">
                <span class="rating-star">★</span> ${statusData.cachedRating.toFixed(1)}${reviewText}
            </span>
            <span style="font-size: 11px; color: #999; margin-left: 4px;">(cached)</span>
        `;
        console.log('[POPUP] Showing cached Glassdoor rating:', statusData.cachedRating);
        return;
    }

    // No cached rating, try to fetch from Glassdoor
    try {
        ratingContainer.style.display = 'flex';
        ratingContainer.innerHTML = '<span class="rating-loading">Loading Glassdoor rating...</span>';

        const response = await fetch(`${backendUrl}/api/v1/companies/glassdoor-rating?company_name=${encodeURIComponent(companyName)}`);

        if (!response.ok) {
            console.log('[POPUP] Failed to fetch Glassdoor rating');
            showGlassdoorSearchLink(companyName, ratingContainer);
            return;
        }

        const data = await response.json();
        console.log('[POPUP] Glassdoor rating:', data);

        if (data.found && data.rating) {
            const reviewText = data.review_count ? ` (${data.review_count} reviews)` : '';
            ratingContainer.innerHTML = `
                <span>Glassdoor:</span>
                <a href="${data.glassdoor_url}" target="_blank" rel="noopener">
                    <span class="rating-star">★</span> ${data.rating.toFixed(1)}${reviewText}
                </a>
            `;
        } else if (data.glassdoor_url) {
            // Show direct link to company page if we found it (even if rating extraction failed)
            ratingContainer.innerHTML = `
                <span>Glassdoor:</span>
                <a href="${data.glassdoor_url}" target="_blank" rel="noopener">
                    View reviews →
                </a>
            `;
        } else {
            // Show search link as last resort
            showGlassdoorSearchLink(companyName, ratingContainer);
        }
    } catch (error) {
        console.log('[POPUP] Error loading Glassdoor rating:', error);
        showGlassdoorSearchLink(companyName, ratingContainer);
    }
}

function showGlassdoorSearchLink(companyName, container) {
    const searchUrl = `https://www.glassdoor.com/Search/results.htm?keyword=${encodeURIComponent(companyName)}`;
    container.innerHTML = `
        <span>Glassdoor:</span>
        <a href="${searchUrl}" target="_blank" rel="noopener">
            Search reviews →
        </a>
    `;
}

async function getStoredResumeOrder() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['resumeOrder'], (result) => {
            resolve(result.resumeOrder || []);
        });
    });
}

function saveResumeOrder(order) {
    chrome.storage.local.set({ resumeOrder: order });
}

async function loadResumes() {
    try {
        // Fetch all resumes from backend
        const response = await fetch(`${backendUrl}/api/v1/resume/`);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

        let backendResumes = await response.json();
        console.log('[POPUP] Loaded resumes from backend:', backendResumes);

        // Deduplicate by filename - keep only latest of each filename
        const seenFilenames = new Set();
        backendResumes = backendResumes.filter(r => {
            if (seenFilenames.has(r.filename)) return false;
            seenFilenames.add(r.filename);
            return true;
        });
        console.log('[POPUP] After dedup:', backendResumes);

        // Load saved order with enabled state
        let savedOrder = await getStoredResumeOrder();
        console.log('[POPUP] Saved order:', savedOrder);

        // Create a map of backend resumes by ID for easy lookup
        const backendMap = new Map(backendResumes.map(r => [r.resume_id, r]));

        // Filter saved order to only include resumes still in backend
        const existingResumes = savedOrder.filter(r => backendMap.has(r.id));

        // Add new resumes from backend that aren't in saved order
        const existingIds = new Set(existingResumes.map(r => r.id));
        const newResumes = backendResumes
            .filter(r => !existingIds.has(r.resume_id))
            .map(r => ({ id: r.resume_id, filename: r.filename, enabled: true }));

        // Combine: new resumes first, then existing ones (preserving order and enabled state)
        resumeOrder = [...newResumes, ...existingResumes];

        console.log('[POPUP] Final resumeOrder:', resumeOrder);
        saveResumeOrder(resumeOrder);

        renderResumeList();
    } catch (error) {
        console.error('[POPUP] Error loading resumes:', error);
        // Show error in the top serverError div (consolidated error display)
        const serverError = document.getElementById('serverError');
        serverError.innerHTML = getServerErrorHtml(error);
        serverError.style.display = 'block';
    }
}

function renderResumeList() {
    const list = document.getElementById('resumeList');
    const noResumes = document.getElementById('noResumes');

    if (resumeOrder.length === 0) {
        list.innerHTML = '';
        noResumes.style.display = 'block';
        adjustPopupWidth();
        return;
    }

    noResumes.style.display = 'none';
    list.innerHTML = resumeOrder.map((resume, index) => {
        const escapedFilename = escapeHtml(resume.filename);
        return `
        <li class="resume-item" draggable="true" data-index="${index}" data-id="${resume.id}">
            <span class="drag-handle">⠿</span>
            <input type="checkbox"
                   class="resume-checkbox"
                   ${resume.enabled ? 'checked' : ''}
                   data-id="${resume.id}">
            <span class="resume-filename">${escapedFilename}</span>
            <button class="delete-resume" title="Remove">×</button>
        </li>
        `;
    }).join('');

    // Attach event listeners (instead of inline handlers)
    list.querySelectorAll('.resume-item').forEach(item => {
        item.addEventListener('dragstart', onDragStart);
        item.addEventListener('dragover', onDragOver);
        item.addEventListener('drop', onDrop);
        item.addEventListener('dragend', onDragEnd);

        // Checkbox change listener
        item.querySelector('.resume-checkbox').addEventListener('change', (e) => {
            toggleResume(e.target.getAttribute('data-id'));
        });

        // Delete button listener
        item.querySelector('.delete-resume').addEventListener('click', (e) => {
            const resumeId = item.getAttribute('data-id');
            deleteResume(resumeId);
        });
    });

    // Adjust popup width based on longest filename
    setTimeout(adjustPopupWidth, 0);
}

function adjustPopupWidth() {
    // Find the longest filename
    const filenames = Array.from(document.querySelectorAll('.resume-filename'))
        .map(el => el.textContent.length);

    if (filenames.length === 0) return;

    const maxFilenameLength = Math.max(...filenames);

    // Approximate character width at 12px font size: ~7px per character
    // Add space for: drag handle (30px) + checkbox (30px) + padding/gaps (60px) + delete button (30px)
    const filenameWidth = maxFilenameLength * 7;
    const requiredWidth = Math.min(900, 30 + 30 + filenameWidth + 60 + 30);

    // Set body width with constraints
    const body = document.body;
    body.style.width = Math.max(400, requiredWidth) + 'px';
}

function onDragStart(e) {
    draggedElement = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (this !== draggedElement) {
        const allItems = Array.from(document.querySelectorAll('.resume-item'));
        const draggedIndex = allItems.indexOf(draggedElement);
        const targetIndex = allItems.indexOf(this);

        if (draggedIndex < targetIndex) {
            this.parentNode.insertBefore(draggedElement, this.nextSibling);
        } else {
            this.parentNode.insertBefore(draggedElement, this);
        }
    }
}

function onDrop(e) {
    e.preventDefault();
    updateResumeOrderFromDOM();
}

function onDragEnd(e) {
    this.classList.remove('dragging');
}

function updateResumeOrderFromDOM() {
    const items = document.querySelectorAll('.resume-item');
    const newOrder = Array.from(items).map(item => {
        const id = item.getAttribute('data-id');
        const checkbox = item.querySelector('.resume-checkbox');
        const resume = resumeOrder.find(r => r.id === id);
        return { ...resume, enabled: checkbox.checked };
    });

    resumeOrder = newOrder;
    saveResumeOrder(resumeOrder);
}

function toggleResume(resumeId) {
    const resume = resumeOrder.find(r => r.id === resumeId);
    if (resume) {
        resume.enabled = !resume.enabled;
        saveResumeOrder(resumeOrder);
    }
}

function deleteResume(resumeId) {
    resumeOrder = resumeOrder.filter(r => r.id !== resumeId);
    saveResumeOrder(resumeOrder);
    renderResumeList();
}

function setupEventListeners() {
    document.getElementById('resumeUpload').addEventListener('change', handleResumeUpload);
    document.getElementById('fillButton').addEventListener('click', fillForm);
    document.getElementById('captureButton').addEventListener('click', captureAnswers);
    setupTabSwitching();
}

async function handleResumeUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const uploadStatus = document.getElementById('uploadStatus');

    uploadStatus.textContent = 'Uploading...';
    uploadStatus.className = 'upload-status uploading';
    uploadStatus.style.display = 'block';

    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${backendUrl}/api/v1/resume/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        const uploaded = await response.json();

        // Prepend new resume to the list
        resumeOrder.unshift({
            id: uploaded.resume_id,
            filename: uploaded.filename,
            enabled: true
        });
        saveResumeOrder(resumeOrder);
        renderResumeList();

        uploadStatus.textContent = 'Uploaded!';
        uploadStatus.className = 'upload-status success';
        setTimeout(() => {
            uploadStatus.style.display = 'none';
        }, 2000);
    } catch (error) {
        console.error('[POPUP] Upload error:', error);
        uploadStatus.style.display = 'none';

        // Show detailed upload error with fix instructions
        const serverError = document.getElementById('serverError');
        let errorHtml = '<h3>⚠️ Resume Upload Failed</h3>';
        errorHtml += `<p><strong>Error:</strong> ${error.message}</p>`;
        errorHtml += '<p><strong>Fix:</strong></p><ul style="margin: 4px 0; padding-left: 20px; font-size: 12px;">';

        if (error.message.includes('Failed to fetch')) {
            errorHtml += '<li>Backend is not running - start it:</li>';
            errorHtml += `<li><code>${BACKEND_START_COMMAND}</code></li>`;
        } else if (error.message.includes('500')) {
            errorHtml += '<li>Backend error processing file</li>';
            errorHtml += '<li>Check file is valid PDF or TXT (not corrupted)</li>';
            errorHtml += '<li>Check backend console for Python errors</li>';
            errorHtml += '<li>Ensure database is initialized: <code>python init_db.py</code></li>';
        } else if (error.message.includes('413')) {
            errorHtml += '<li>File is too large (max size exceeded)</li>';
            errorHtml += '<li>Try compressing the PDF or use a smaller file</li>';
        } else {
            errorHtml += '<li>Check file is valid PDF or TXT format</li>';
            errorHtml += '<li>Ensure backend is running</li>';
            errorHtml += '<li>Check browser console (F12) for details</li>';
        }

        errorHtml += '</ul>';
        serverError.innerHTML = errorHtml;
        serverError.style.display = 'block';
    }

    // Reset file input
    e.target.value = '';
}

async function fillForm() {
    const status = document.getElementById('status');

    // Find first enabled resume
    const enabledResumes = resumeOrder.filter(r => r.enabled);
    if (enabledResumes.length === 0) {
        showStatus('No enabled resumes. Upload or enable a resume.', 'error');
        return;
    }

    const selectedResume = enabledResumes[0];

    status.textContent = 'Fetching resume data...';
    status.className = 'status info';

    try {
        // Get resume data
        const response = await fetch(`${backendUrl}/api/v1/resume/${selectedResume.id}/data`);
        if (!response.ok) {
            const serverError = document.getElementById('serverError');
            let errorHtml = '<h3>⚠️ Failed to Load Resume</h3>';

            if (response.status === 400) {
                errorHtml += '<p><strong>Bad Request:</strong> Invalid resume ID or corrupted data</p>';
                errorHtml += '<p><strong>Fix:</strong></p><ul style="margin: 4px 0; padding-left: 20px; font-size: 12px;">';
                errorHtml += `<li>Resume ID: <code>${selectedResume.id}</code></li>`;
                errorHtml += '<li>Try deleting and re-uploading the resume</li>';
                errorHtml += '<li>Check backend logs for parsing errors</li>';
                errorHtml += '<li>Ensure resume file is valid PDF or TXT</li>';
                errorHtml += '</ul>';
            } else if (response.status === 404) {
                errorHtml += '<p><strong>Not Found:</strong> Resume not found in database</p>';
                errorHtml += '<p><strong>Fix:</strong></p><ul style="margin: 4px 0; padding-left: 20px; font-size: 12px;">';
                errorHtml += '<li>Delete this resume from the list (× button)</li>';
                errorHtml += '<li>Re-upload your resume</li>';
                errorHtml += '</ul>';
            } else if (response.status === 500) {
                errorHtml += '<p><strong>Server Error:</strong> Backend failed to process resume</p>';
                errorHtml += '<p><strong>Fix:</strong></p><ul style="margin: 4px 0; padding-left: 20px; font-size: 12px;">';
                errorHtml += '<li>Check backend console for Python errors</li>';
                errorHtml += '<li>Ensure database is initialized: <code>python init_db.py</code></li>';
                errorHtml += '<li>Restart backend: <code>uvicorn app.main:app --reload</code></li>';
                errorHtml += '</ul>';
            } else {
                errorHtml += `<p><strong>HTTP ${response.status}:</strong> ${response.statusText}</p>`;
                errorHtml += '<p><strong>Fix:</strong> Check backend logs and restart server</p>';
            }

            serverError.innerHTML = errorHtml;
            serverError.style.display = 'block';
            status.style.display = 'none';
            return;
        }

        const resumeData = await response.json();

        // Clear any previous errors
        const serverError = document.getElementById('serverError');
        serverError.style.display = 'none';

        // Send to content script
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        console.log('Sending message to content script...');
        let responseReceived = false;

        status.textContent = 'Filling in fields...';
        status.className = 'status info';

        // Send the message to the main frame only (frameId: 0)
        chrome.tabs.sendMessage(tab.id, {
            action: 'fillForm',
            resumeData: resumeData,
            resumeOrder: resumeOrder,
            backendUrl: backendUrl
        }, { frameId: 0 }, (response) => {
            if (responseReceived) {
                console.log('[POPUP] Ignoring duplicate response');
                return;
            }

            responseReceived = true;

            console.log('[POPUP] Got response:', response);
            console.log('[POPUP] Chrome error:', chrome.runtime.lastError);

            if (chrome.runtime.lastError) {
                console.error('[POPUP] Chrome error details:', chrome.runtime.lastError.message);
                if (chrome.runtime.lastError.message.includes('Receiving end does not exist')) {
                    showStatus('Refresh the page first, then try again.', 'error');
                } else {
                    showStatus('Error communicating with page. Try refreshing.', 'error');
                }
                return;
            }

            if (response && response.success) {
                console.log('[POPUP] Form fill complete');
            } else {
                console.log('[POPUP] Response was not successful:', response);
                showStatus(response?.message || 'Failed to fill form', 'error');
            }
        });
    } catch (error) {
        console.error('[POPUP] Fill form error:', error);

        // Show detailed error with fix instructions
        const serverError = document.getElementById('serverError');
        serverError.innerHTML = `
            <h3>⚠️ Form Fill Failed</h3>
            <p><strong>Error:</strong> ${error.message}</p>
            <p><strong>Fix:</strong></p>
            <ul style="margin: 4px 0; padding-left: 20px; font-size: 12px;">
                <li>Ensure backend is running at ${backendUrl}</li>
                <li>Check resume data is valid (try re-uploading)</li>
                <li>Refresh the job application page</li>
                <li>Check browser console (F12) for details</li>
            </ul>
        `;
        serverError.style.display = 'block';
        status.style.display = 'none';
    }
}

function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
}

// Listen for form fill completion messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'formFillComplete') {
        console.log('[POPUP] Form fill complete with', request.filledCount, 'fields');
        const status = document.getElementById('status');
        if (status) {
            status.textContent = `Form filled: ${request.filledCount} fields`;
            status.className = 'status success';
        }
    }
});

async function loadFieldAnswers() {
    try {
        const response = await fetch(`${backendUrl}/api/v1/field-answers/`);
        if (!response.ok) {
            console.log('[POPUP] Could not fetch field answers');
            return;
        }

        const data = await response.json();
        const answers = data.answers || [];

        renderFieldAnswers(answers);
    } catch (error) {
        console.error('[POPUP] Error loading field answers:', error);
    }
}

function renderFieldAnswers(answers, newAnswerIds = []) {
    const list = document.getElementById('fieldAnswersList');
    const noAnswers = document.getElementById('noAnswers');

    if (answers.length === 0) {
        list.innerHTML = '';
        noAnswers.style.display = 'block';
        return;
    }

    noAnswers.style.display = 'none';
    list.innerHTML = answers.map((answer) => {
        const escapedQuestion = escapeHtml(answer.question_text);
        const escapedAnswer = escapeHtml(answer.answer_text);
        const isNew = newAnswerIds.includes(answer.id);
        const newClass = isNew ? 'newly-added' : '';
        return `
        <li class="field-answer-item ${newClass}" data-answer-id="${answer.id}" data-editing="false">
            <div class="field-answer-question" title="${escapedQuestion}">
                ${escapedQuestion}
            </div>
            <div class="field-answer-value">
                <div class="field-answer-text" data-value="${escapedAnswer}">${escapedAnswer}</div>
            </div>
            <div class="field-answer-actions">
                <button class="field-answer-btn delete" title="Delete">×</button>
            </div>
        </li>
        `;
    }).join('');

    // Attach event listeners
    list.querySelectorAll('.field-answer-item').forEach(item => {
        const answerId = item.getAttribute('data-answer-id');
        const answerText = item.querySelector('.field-answer-text');
        const deleteBtn = item.querySelector('.delete');

        // Click on answer text to edit
        answerText.addEventListener('click', () => {
            startEditingAnswer(item, answerId);
        });

        // Delete button
        deleteBtn.addEventListener('click', () => {
            deleteFieldAnswer(answerId, list);
        });
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function startEditingAnswer(item, answerId) {
    // Prevent double-editing
    if (item.getAttribute('data-editing') === 'true') return;
    item.setAttribute('data-editing', 'true');

    const valueContainer = item.querySelector('.field-answer-value');
    const answerTextDiv = item.querySelector('.field-answer-text');
    const originalValue = answerTextDiv.getAttribute('data-value');
    const actionsDiv = item.querySelector('.field-answer-actions');

    // Replace text with input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'field-answer-input';
    input.value = originalValue;

    answerTextDiv.replaceWith(input);

    // Add check button to actions
    const checkBtn = document.createElement('button');
    checkBtn.className = 'field-answer-btn check';
    checkBtn.innerHTML = '✓';
    checkBtn.title = 'Save';
    actionsDiv.insertBefore(checkBtn, actionsDiv.firstChild);

    // Focus input
    input.focus();
    input.select();

    // Save on check button
    checkBtn.addEventListener('click', async () => {
        await saveEdit(item, answerId, input.value);
    });

    // Save on Enter key
    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            await saveEdit(item, answerId, input.value);
        } else if (e.key === 'Escape') {
            cancelEdit(item, originalValue);
        }
    });

    // Cancel on blur after a short delay (to allow check button click)
    input.addEventListener('blur', () => {
        setTimeout(() => {
            if (item.getAttribute('data-editing') === 'true') {
                cancelEdit(item, originalValue);
            }
        }, 150);
    });
}

async function saveEdit(item, answerId, newValue) {
    const newAnswerText = newValue.trim();
    if (!newAnswerText) {
        alert('Answer cannot be empty');
        return;
    }

    try {
        // Get the answer details first
        const getResponse = await fetch(`${backendUrl}/api/v1/field-answers/${answerId}`);
        if (!getResponse.ok) throw new Error('Failed to fetch answer');
        const answer = await getResponse.json();

        // Update the answer
        const response = await fetch(`${backendUrl}/api/v1/field-answers/${answerId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question_text: answer.question_text,
                answer_text: newAnswerText,
                field_type: answer.field_type
            })
        });

        if (!response.ok) throw new Error('Failed to update answer');

        // Reload answers to reflect changes
        await loadFieldAnswers();
    } catch (error) {
        console.error('Error updating answer:', error);
        alert('Failed to update answer');
        cancelEdit(item, newValue);
    }
}

function cancelEdit(item, originalValue) {
    item.setAttribute('data-editing', 'false');

    const valueContainer = item.querySelector('.field-answer-value');
    const input = item.querySelector('.field-answer-input');
    const actionsDiv = item.querySelector('.field-answer-actions');
    const checkBtn = actionsDiv.querySelector('.check');

    // Remove check button
    if (checkBtn) {
        checkBtn.remove();
    }

    // Replace input with text
    if (input) {
        const textDiv = document.createElement('div');
        textDiv.className = 'field-answer-text';
        textDiv.setAttribute('data-value', originalValue);
        textDiv.textContent = originalValue;

        // Re-attach click listener
        textDiv.addEventListener('click', () => {
            startEditingAnswer(item, item.getAttribute('data-answer-id'));
        });

        input.replaceWith(textDiv);
    }
}

async function deleteFieldAnswer(answerId, list) {
    if (!confirm('Are you sure you want to delete this answer?')) {
        return;
    }

    try {
        const response = await fetch(`${backendUrl}/api/v1/field-answers/${answerId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete answer');

        // Reload answers to reflect deletion
        await loadFieldAnswers();
    } catch (error) {
        console.error('Error deleting answer:', error);
        alert('Failed to delete answer');
    }
}

function setupTabSwitching() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.getAttribute('data-tab');

            // Hide all tabs
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });

            // Remove active state from all buttons
            tabButtons.forEach(b => b.classList.remove('active'));

            // Show selected tab and mark button as active
            document.getElementById(`${tabName}-tab`).classList.add('active');
            btn.classList.add('active');
        });
    });
}

async function captureAnswers() {
    const status = document.getElementById('status');
    const captureButton = document.getElementById('captureButton');

    try {
        status.textContent = 'Scanning form for new answers...';
        status.className = 'status info';
        captureButton.disabled = true;

        // Get current answer IDs before capture
        const beforeResponse = await fetch(`${backendUrl}/api/v1/field-answers/`);
        const beforeData = await beforeResponse.json();
        const beforeIds = new Set((beforeData.answers || []).map(a => a.id));

        // Get the active tab to find the form page
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Send request to content script to capture answers (main frame only)
        chrome.tabs.sendMessage(tab.id, {
            action: 'captureAnswers',
            backendUrl: backendUrl,
            filledFields: {}  // Content script already has this in window.RESUME_RAG_FILLED_FIELDS
        }, { frameId: 0 }, async (response) => {
            captureButton.disabled = false;

            if (chrome.runtime.lastError) {
                console.error('[POPUP] Chrome error:', chrome.runtime.lastError);
                status.textContent = 'Extension not available on this page. Try refreshing.';
                status.className = 'status error';
                return;
            }

            if (response && response.success) {
                status.textContent = response.message;
                status.className = 'status success';

                // Get answer IDs after capture to find new ones
                const afterResponse = await fetch(`${backendUrl}/api/v1/field-answers/`);
                const afterData = await afterResponse.json();
                const allAnswers = afterData.answers || [];

                // Find newly added answers
                const newAnswerIds = allAnswers
                    .filter(a => !beforeIds.has(a.id))
                    .map(a => a.id);

                console.log('[POPUP] New answer IDs:', newAnswerIds);

                // Reload the saved answers list with highlighting
                renderFieldAnswers(allAnswers, newAnswerIds);

                // Switch to answers tab to show what was captured
                const answersTab = document.querySelector('[data-tab="answers"]');
                if (answersTab) {
                    answersTab.click();
                }
            } else {
                status.textContent = response?.error || 'Failed to capture answers';
                status.className = 'status error';
            }
        });
    } catch (error) {
        captureButton.disabled = false;
        status.textContent = `Error: ${error.message}`;
        status.className = 'status error';
        console.error('[POPUP] Capture error:', error);
    }
}
