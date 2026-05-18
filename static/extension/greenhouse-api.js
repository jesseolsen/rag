// Greenhouse Job Board API Integration
// Experimental module to fill forms via API instead of DOM manipulation
// Reference: https://developers.greenhouse.io/job-board.html

/**
 * GreenhouseAPI - Direct API submission for Greenhouse job applications
 * This bypasses the custom dropdown limitation by submitting directly to Greenhouse's API
 */
class GreenhouseAPI {
    constructor() {
        this.baseUrl = null; // Will be extracted from window.location
        this.jobId = null;
        this.boardToken = null;
    }

    /**
     * Detect Greenhouse instance from current URL
     * Examples:
     * - https://job-boards.greenhouse.io/embed/job_app?for=coalition&jr_id=699f309994ef206f184e4fd6
     * - https://coalition.greenhouse.io/jobs/...
     */
    detectGreenhouseInstance() {
        const url = window.location.href;
        let domain = null;

        // Check if it's a job-boards subdomain
        if (url.includes('job-boards.greenhouse.io')) {
            const params = new URL(url).searchParams;
            const company = params.get('for'); // e.g., 'coalition'
            this.boardToken = params.get('token');
            this.jobId = params.get('jr_id');
            domain = `${company}.greenhouse.io`;
        }
        // Check if it's a company.greenhouse.io domain
        else if (url.includes('.greenhouse.io')) {
            const match = url.match(/https?:\/\/([^.]+)\.greenhouse\.io/);
            if (match) {
                domain = match[1] + '.greenhouse.io';
            }
        }

        if (domain) {
            this.baseUrl = `https://${domain}/api/v4`;
            console.log('[GREENHOUSE_API] Detected instance:', domain);
            return true;
        }

        console.log('[GREENHOUSE_API] Could not detect Greenhouse instance');
        return false;
    }

    /**
     * Fetch job details including question definitions
     * This gives us the question IDs needed for submission
     */
    async fetchJobQuestions() {
        if (!this.baseUrl || !this.jobId) {
            console.log('[GREENHOUSE_API] Missing baseUrl or jobId');
            return null;
        }

        try {
            const url = `${this.baseUrl}/jobs?job_id=${this.jobId}&questions=true`;
            console.log('[GREENHOUSE_API] Fetching questions from:', url);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                console.log('[GREENHOUSE_API] Failed to fetch:', response.status);
                return null;
            }

            const data = await response.json();
            console.log('[GREENHOUSE_API] Job questions:', data);
            return data;
        } catch (error) {
            console.log('[GREENHOUSE_API] Error fetching questions:', error);
            return null;
        }
    }

    /**
     * Submit application directly via API
     * This is the key function - if it works, we bypass DOM interaction entirely
     */
    async submitApplication(applicationData) {
        if (!this.baseUrl) {
            console.log('[GREENHOUSE_API] No Greenhouse instance detected');
            return { success: false, error: 'Could not detect Greenhouse instance' };
        }

        try {
            const url = `${this.baseUrl}/applications`;
            console.log('[GREENHOUSE_API] Submitting to:', url);
            console.log('[GREENHOUSE_API] Application data:', applicationData);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(applicationData)
            });

            const data = await response.json();

            if (!response.ok) {
                console.log('[GREENHOUSE_API] Submission failed:', response.status, data);
                return { success: false, error: data?.message || 'Submission failed' };
            }

            console.log('[GREENHOUSE_API] ✓ Application submitted successfully');
            return { success: true, data };
        } catch (error) {
            console.log('[GREENHOUSE_API] Error submitting:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Map resume data to Greenhouse application format
     */
    buildApplicationPayload(resumeData, answers = {}) {
        const payload = {
            first_name: resumeData.first_name || '',
            last_name: resumeData.last_name || '',
            email: resumeData.email || '',
            phone: resumeData.phone || '',
            location: {
                address: resumeData.city || ''
            },
            answers: []
        };

        // Add education if available
        if (resumeData.education && resumeData.education.length > 0) {
            payload.educations = resumeData.education.map(edu => ({
                school_name: edu.school || '',
                degree: edu.degree || '',
                discipline: edu.field || '',
                start_date: edu.start_date || '',
                end_date: edu.end_date || ''
            }));
        }

        // Add employment if available
        if (resumeData.experience && resumeData.experience.length > 0) {
            payload.employments = resumeData.experience.map(exp => ({
                company_name: exp.company || '',
                title: exp.title || '',
                start_date: exp.start_date || '',
                end_date: exp.end_date || '',
                current: !exp.end_date
            }));
        }

        // Add custom field answers
        if (answers && Object.keys(answers).length > 0) {
            payload.answers = Object.entries(answers).map(([questionId, answer]) => ({
                question_id: parseInt(questionId),
                answer: answer
            }));
        }

        // Add URLs
        if (resumeData.linkedin) {
            payload.answers.push({
                question_id: null, // Would need to find the actual ID
                answer: resumeData.linkedin
            });
        }

        return payload;
    }

    /**
     * Check if API submission is available for current page
     */
    isAvailable() {
        return this.detectGreenhouseInstance();
    }
}

// Export for use in content script
if (typeof window !== 'undefined') {
    window.GreenhouseAPI = GreenhouseAPI;
}
