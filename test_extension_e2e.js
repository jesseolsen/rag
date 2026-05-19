/**
 * End-to-end test for Chrome Extension
 * Tests the full workflow: navigate → fill form → verify values
 * 
 * Usage:
 *   npx playwright test test_extension_e2e.js
 *   OR
 *   node test_extension_e2e.js
 */

const { chromium } = require('playwright');
const path = require('path');

const EXTENSION_PATH = path.resolve(__dirname, 'static/extension');
const GREENHOUSE_URL = 'https://job-boards.greenhouse.io/embed/job_app?for=coalition&jr_id=699f309994ef206f184e4fd6&token=4665924005&utm_source=jobright';
const BACKEND_URL = 'http://localhost:8000';

async function runTest() {
    console.log('🚀 Starting Chrome Extension E2E Test\n');

    // Launch browser with extension
    const context = await chromium.launchPersistentContext('', {
        headless: false,
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
        ],
    });

    const page = await context.newPage();

    try {
        // Step 1: Check if backend is running
        console.log('📡 Checking backend connection...');
        try {
            const healthCheck = await fetch(`${BACKEND_URL}/health`);
            if (!healthCheck.ok) throw new Error('Backend not healthy');
            console.log('✓ Backend is running\n');
        } catch (e) {
            console.error('✗ Backend not running. Start with: uvicorn app.main:app --reload');
            process.exit(1);
        }

        // Step 2: Navigate to Greenhouse form
        console.log('🌐 Navigating to Greenhouse form...');
        await page.goto(GREENHOUSE_URL, { waitUntil: 'networkidle' });
        console.log('✓ Form loaded\n');

        // Step 3: Get extension popup
        console.log('🔌 Finding extension popup...');
        let popupPage;
        const context_pages = context.pages();
        
        // Look for extension popup (it opens automatically or we need to click extension icon)
        await page.evaluate(() => {
            // Click extension icon (approximate location)
            // This is tricky - the extension popup should open automatically
        });

        // Wait for popup to appear
        await page.waitForTimeout(1000);
        
        const pages = context.pages();
        popupPage = pages.find(p => p.url().includes('popup.html'));
        
        if (!popupPage) {
            console.log('⚠ Extension popup not found automatically');
            console.log('  Trying to click extension icon...');
            
            // Try clicking the extension icon in the toolbar
            // This varies by Chrome version, so we'll try a workaround
            const allPages = context.pages();
            console.log(`  Available pages: ${allPages.length}`);
            allPages.forEach((p, i) => console.log(`    ${i}: ${p.url()}`));
            
            // For now, just continue with the main page and test via content script
            popupPage = null;
        } else {
            console.log('✓ Extension popup found\n');
        }

        // Step 4: Trigger form fill (via popup or direct message)
        console.log('📝 Filling form via extension...\n');

        if (popupPage) {
            // Fill in the backend URL
            await popupPage.fill('#backendUrl', BACKEND_URL);
            
            // Click Fill Form button
            await popupPage.click('#fillButton');
            
            // Wait for status message
            await popupPage.waitForSelector('#status', { timeout: 15000 });
            const status = await popupPage.textContent('#status');
            console.log(`Status: ${status}\n`);
            
            if (status.includes('Error') || status.includes('Failed')) {
                throw new Error(`Form fill failed: ${status}`);
            }
        } else {
            console.log('⚠ Using direct injection method (popup not available)\n');
            
            // Inject a script to call the content script directly
            const result = await page.evaluate(async () => {
                return new Promise((resolve) => {
                    // Send message to content script
                    chrome.runtime.sendMessage({
                        action: 'fillForm',
                        resumeData: {
                            first_name: 'TestUser',
                            last_name: 'Automation',
                            email: 'test@example.com',
                            phone: '(555) 555-5555',
                            country: 'United States',
                            linkedin: '',
                            website: ''
                        },
                        backendUrl: 'http://localhost:8000'
                    }, (response) => {
                        resolve(response);
                    });
                });
            });
            
            console.log('Content script response:', result, '\n');
        }

        // Step 5: Wait for form to be populated
        console.log('⏳ Waiting for form to populate (10s)...');
        await page.waitForTimeout(10000);

        // Step 6: Verify text fields
        console.log('\n✓ Form should now be filled. Checking values...\n');

        const firstName = await page.inputValue('input#first_name').catch(() => '');
        const lastName = await page.inputValue('input#last_name').catch(() => '');
        const email = await page.inputValue('input#email').catch(() => '');
        const phone = await page.inputValue('input#phone').catch(() => '');

        console.log('📋 Text Fields:');
        console.log(`  First Name: ${firstName || '❌ (empty)'}`);
        console.log(`  Last Name: ${lastName || '❌ (empty)'}`);
        console.log(`  Email: ${email || '❌ (empty)'}`);
        console.log(`  Phone: ${phone || '❌ (empty)'}\n`);

        // Step 7: Check dropdowns
        console.log('🔽 React Select Dropdowns:');
        
        const dropdownIds = [
            { id: 'question_8433548005', name: 'Prior Employment', expected: 'No' },
            { id: 'question_8433549005', name: 'Work Authorization', expected: 'Yes' },
            { id: 'question_8433550005', name: 'Visa Sponsorship', expected: 'No' },
            { id: 'question_8433551005', name: 'Acknowledgement', expected: 'acknowledge' },
            { id: '4014696005', name: 'Gender', expected: 'Male' },
            { id: '4014697005', name: 'Race/Ethnicity', expected: 'White' },
            { id: '4014698005', name: 'Military', expected: 'No' }
        ];

        for (const dropdown of dropdownIds) {
            const value = await page.evaluate((id) => {
                const input = document.querySelector(`input#${id}`);
                if (!input) return 'NOT_FOUND';
                
                const container = input.closest('[class*="select"]');
                const span = container?.querySelector('.select__single-value');
                return span?.textContent?.trim() || 'EMPTY';
            }, dropdown.id);

            const status = value === 'EMPTY' ? '❌' : value === 'NOT_FOUND' ? '⚠' : '✓';
            console.log(`  ${status} ${dropdown.name}: ${value}`);
        }

        // Step 8: Check checkboxes
        console.log('\n☑️  Checkboxes:');
        
        const linkedinChecked = await page.isChecked('input#question_8433547005\\[\\]_21312271005').catch(() => false);
        console.log(`  ${linkedinChecked ? '✓' : '❌'} LinkedIn`);

        // Step 9: Console logs from extension
        console.log('\n📊 Extension Console Output:');
        page.on('console', msg => {
            if (msg.text().includes('[RESUME_RAG]')) {
                console.log(`  ${msg.text()}`);
            }
        });

        // Step 10: Take screenshot
        console.log('\n📸 Taking screenshot...');
        await page.screenshot({ path: 'extension_test_result.png' });
        console.log('✓ Screenshot saved: extension_test_result.png\n');

        console.log('✅ Test Complete!\n');
        console.log('📌 Summary:');
        console.log(`  - Text fields: ${firstName && lastName && email ? 'FILLED' : 'INCOMPLETE'}`);
        console.log(`  - Dropdowns: Check screenshot for selected values`);
        console.log(`  - Screenshot: extension_test_result.png`);

    } catch (error) {
        console.error('\n❌ Test Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await context.close();
    }
}

// Run test
runTest().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
