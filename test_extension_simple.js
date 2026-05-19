/**
 * Simple Chrome Extension E2E Test
 * Uses browser console to interact with extension
 */

const { chromium } = require('playwright');
const path = require('path');

const EXTENSION_PATH = path.resolve(__dirname, 'static/extension');
const GREENHOUSE_URL = 'https://job-boards.greenhouse.io/embed/job_app?for=coalition&jr_id=699f309994ef206f184e4fd6&token=4665924005&utm_source=jobright';
const BACKEND_URL = 'http://localhost:8000';

async function runTest() {
    console.log('🚀 Starting Chrome Extension E2E Test\n');

    let context, page;

    try {
        // Check backend
        console.log('📡 Checking backend...');
        const health = await fetch(`${BACKEND_URL}/health`);
        if (!health.ok) throw new Error('Backend not running');
        console.log('✓ Backend OK\n');

        // Launch browser with extension
        console.log('🌐 Launching Chrome with extension...');
        context = await chromium.launchPersistentContext('', {
            headless: false,
            args: [
                `--disable-extensions-except=${EXTENSION_PATH}`,
                `--load-extension=${EXTENSION_PATH}`,
                '--no-sandbox',
            ],
        });
        console.log('✓ Chrome launched\n');

        page = await context.newPage();

        // Navigate to form
        console.log('📋 Navigating to Greenhouse form...');
        await page.goto(GREENHOUSE_URL, { waitUntil: 'networkidle', timeout: 30000 });
        console.log('✓ Form loaded\n');

        // Wait a bit for extension to inject
        await page.waitForTimeout(2000);

        // Check if extension content script loaded
        console.log('🔌 Checking if extension content script loaded...');
        const contentScriptLoaded = await page.evaluate(() => {
            return typeof chrome !== 'undefined' && typeof chrome.runtime !== 'undefined';
        });

        if (!contentScriptLoaded) {
            console.log('⚠️  Extension APIs not available in page context');
            console.log('   This is expected - content scripts run in isolated context');
            console.log('   Trying alternative approach...\n');
        } else {
            console.log('✓ Extension APIs available\n');
        }

        // Inject our test into the page to interact with content script
        console.log('📝 Injecting test script to trigger form fill...');
        
        const result = await page.evaluate(() => {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout')), 20000);
                
                try {
                    // The content script should be listening
                    window.postMessage({
                        action: 'fillForm',
                        resumeData: {
                            first_name: 'Jesse',
                            last_name: 'Olsen',
                            email: 'mejesseolsen@gmail.com',
                            phone: '(970) 391-1018',
                            country: 'United States',
                            linkedin: '',
                            website: ''
                        },
                        backendUrl: BACKEND_URL
                    }, '*');
                    
                    // Listen for response from content script
                    const handler = (event) => {
                        if (event.data && event.data.__RESUME_RAG_RESPONSE__) {
                            clearTimeout(timeout);
                            window.removeEventListener('message', handler);
                            resolve(event.data.response);
                        }
                    };
                    
                    window.addEventListener('message', handler);
                } catch (e) {
                    clearTimeout(timeout);
                    reject(e);
                }
            });
        }).catch(e => {
            console.log('⚠️  Alternative method also failed:', e.message);
            console.log('   Proceeding with manual check...\n');
            return null;
        });

        if (result) {
            console.log('✓ Got response:', result, '\n');
        }

        // Wait for form to populate
        console.log('⏳ Waiting for form to populate (10s)...');
        await page.waitForTimeout(10000);

        // Check values
        console.log('\n📋 Checking form values...\n');

        const firstName = await page.inputValue('input#first_name').catch(() => '');
        const lastName = await page.inputValue('input#last_name').catch(() => '');
        const email = await page.inputValue('input#email').catch(() => '');
        const phone = await page.inputValue('input#phone').catch(() => '');

        console.log('Text Fields:');
        console.log(`  First Name: ${firstName ? '✓ ' + firstName : '❌ empty'}`);
        console.log(`  Last Name: ${lastName ? '✓ ' + lastName : '❌ empty'}`);
        console.log(`  Email: ${email ? '✓ ' + email : '❌ empty'}`);
        console.log(`  Phone: ${phone ? '✓ ' + phone : '❌ empty'}\n`);

        // Check dropdowns
        console.log('Dropdowns:');
        const dropdowns = [
            ['question_8433548005', 'Prior Employment'],
            ['question_8433549005', 'Work Authorization'],
            ['question_8433550005', 'Visa Sponsorship'],
            ['question_8433551005', 'Acknowledgement'],
            ['4014696005', 'Gender'],
            ['4014697005', 'Race/Ethnicity'],
            ['4014698005', 'Military'],
        ];

        for (const [id, name] of dropdowns) {
            const value = await page.evaluate((fieldId) => {
                const input = document.querySelector(`input#${fieldId}`);
                if (!input) return 'NOT_FOUND';
                const container = input.closest('[class*="select"]');
                const span = container?.querySelector('.select__single-value');
                return span?.textContent?.trim() || 'EMPTY';
            }, id);

            const icon = value === 'EMPTY' ? '❌' : value === 'NOT_FOUND' ? '⚠' : '✓';
            console.log(`  ${icon} ${name}: ${value}`);
        }

        // Screenshot
        console.log('\n📸 Taking screenshot...');
        await page.screenshot({ path: 'extension_test_result.png' });
        console.log('✓ Saved: extension_test_result.png\n');

        console.log('✅ Test complete!\n');
        console.log('📌 Summary:');
        console.log(`  Text fields: ${firstName && lastName ? 'FILLED' : 'INCOMPLETE'}`);
        console.log(`  Check screenshot for dropdown values`);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    } finally {
        if (context) {
            console.log('\n🔒 Closing browser...');
            await context.close();
        }
    }
}

runTest();
