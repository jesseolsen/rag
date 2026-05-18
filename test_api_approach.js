/**
 * Test Script for Greenhouse Job Board API
 *
 * Copy/paste this into browser console on a Greenhouse job form to test
 * whether the API approach is viable for you.
 *
 * Steps:
 * 1. Navigate to a Greenhouse job form (e.g., coalition.greenhouse.io)
 * 2. Open browser console (F12, then Console tab)
 * 3. Copy entire content of this file into console
 * 4. Run: testGreenhouseAPI()
 */

async function testGreenhouseAPI() {
    console.log('=== Greenhouse Job Board API Test ===\n');

    // Step 1: Detect Greenhouse instance
    console.log('Step 1: Detecting Greenhouse instance...');
    const url = window.location.href;
    let domain = null;
    let jobId = null;

    if (url.includes('job-boards.greenhouse.io')) {
        const params = new URL(url).searchParams;
        const company = params.get('for');
        jobId = params.get('jr_id');
        domain = `${company}.greenhouse.io`;
        console.log(`✓ Detected job-boards subdomain`);
        console.log(`  Company: ${company}`);
        console.log(`  Job ID: ${jobId}`);
    } else if (url.includes('.greenhouse.io')) {
        const match = url.match(/https?:\/\/([^.]+)\.greenhouse\.io/);
        if (match) {
            domain = match[1] + '.greenhouse.io';
            console.log(`✓ Detected company subdomain: ${domain}`);
        }
    }

    if (!domain) {
        console.log('✗ Could not detect Greenhouse instance');
        console.log('  Make sure you\'re on a Greenhouse job form URL');
        return;
    }

    const baseUrl = `https://${domain}/api/v4`;

    // Step 2: Test API accessibility
    console.log('\nStep 2: Testing API accessibility...');
    try {
        const healthUrl = `${baseUrl}/jobs`;
        console.log(`  Fetching: ${healthUrl}`);

        const response = await fetch(healthUrl);
        if (response.ok) {
            console.log(`✓ API is accessible (status ${response.status})`);
        } else {
            console.log(`⚠️  API returned status ${response.status}`);
            if (response.status === 403) {
                console.log('   This is expected - API may require authentication');
            }
        }
    } catch (error) {
        console.log(`✗ CORS Error: ${error.message}`);
        console.log('\n   This means the API is blocked by browser security.');
        console.log('   Solution: Use extension background service worker or backend relay');
    }

    // Step 3: Try to fetch job details with questions
    console.log('\nStep 3: Fetching job details with questions...');
    try {
        let questionsUrl = `${baseUrl}/jobs?questions=true`;
        if (jobId) {
            questionsUrl += `&job_id=${jobId}`;
        }

        console.log(`  Fetching: ${questionsUrl}`);
        const response = await fetch(questionsUrl);

        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();
        console.log('✓ Successfully fetched job questions');
        console.log('  Response structure:');
        console.log(data);

        // Analyze questions
        if (data.jobs && data.jobs.length > 0) {
            const job = data.jobs[0];
            console.log(`\n  Job Title: ${job.title}`);

            if (job.questions) {
                console.log(`  Questions (${job.questions.length}):`);
                job.questions.forEach((q, idx) => {
                    console.log(`    ${idx + 1}. [ID: ${q.id}] ${q.label || q.type}`);
                    if (q.type === 'yesno') {
                        console.log(`       ✓ This is a Yes/No question - API can submit!`);
                    }
                });
            }
        }

    } catch (error) {
        console.log(`✗ Error fetching questions: ${error.message}`);
        console.log('\nThis could mean:');
        console.log('- The API requires authentication');
        console.log('- CORS is blocking the request');
        console.log('- The job structure is different than expected');
    }

    // Step 4: Test application submission format
    console.log('\nStep 4: Testing application submission format...');
    const samplePayload = {
        first_name: 'Test',
        last_name: 'Candidate',
        email: 'test@example.com',
        phone: '(555) 123-4567',
        location: {
            address: 'Test City'
        },
        answers: [
            {
                question_id: 12345,
                answer: 'Yes'
            },
            {
                question_id: 12346,
                answer: 'No'
            }
        ]
    };

    console.log('Sample payload structure:');
    console.log(JSON.stringify(samplePayload, null, 2));

    // Step 5: Summary and next steps
    console.log('\n=== SUMMARY ===\n');

    console.log('If you see ✓ above:');
    console.log('  → The API approach might work for you!');
    console.log('  → Next: Integrate into the extension');
    console.log('  → Result: 2-second form submission, no dropdowns\n');

    console.log('If you see ✗ CORS Error:');
    console.log('  → Use extension background service worker (has CORS privilege)');
    console.log('  → OR: Set up backend relay on your own domain');
    console.log('  → This is solvable but requires backend work\n');

    console.log('If you see ✗ Authentication Error:');
    console.log('  → API may require API key or authentication');
    console.log('  → Contact Greenhouse support for public API access');
    console.log('  → OR: Fall back to Playwright automation\n');

    console.log('To learn more, see:');
    console.log('  → GREENHOUSE_SOLUTIONS.md (full technical details)');
    console.log('  → GREENHOUSE_QUICK_REFERENCE.md (2-minute overview)');
    console.log('  → SETUP_PLAYWRIGHT.md (automation fallback)');
}

// Auto-run if you want
console.log('Run: testGreenhouseAPI()');
console.log('');
