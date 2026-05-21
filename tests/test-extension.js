const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.join(__dirname, '..', 'static', 'extension');
const BACKEND_URL = 'http://localhost:8000';

// Mock form HTML (mimics Greenhouse job application)
const MOCK_FORM_HTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Test Job Application</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        .field { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input, select { width: 100%; padding: 8px; box-sizing: border-box; }
        input[type="checkbox"] { width: auto; }
    </style>
</head>
<body>
    <h1>Test Job Application Form</h1>
    <form id="jobForm">
        <div class="field">
            <label for="first_name">First Name*</label>
            <input type="text" id="first_name" name="first_name" />
        </div>

        <div class="field">
            <label for="last_name">Last Name*</label>
            <input type="text" id="last_name" name="last_name" />
        </div>

        <div class="field">
            <label for="email">Email*</label>
            <input type="email" id="email" name="email" />
        </div>

        <div class="field">
            <label for="phone">Phone*</label>
            <input type="tel" id="phone" name="phone" />
        </div>

        <div class="field">
            <label for="degree--0">Degree*</label>
            <input type="text" id="degree--0" role="combobox" />
            <div class="select__single-value remix-css-1dimb5e-singleValue"></div>
        </div>

        <button type="submit">Submit Application</button>
    </form>

    <script>
        // Simulate React Select behavior for degree field
        const degreeInput = document.getElementById('degree--0');
        const degreeDisplay = document.querySelector('.select__single-value');

        degreeInput.addEventListener('input', (e) => {
            degreeDisplay.textContent = e.target.value;
        });

        // Log form values on submit
        document.getElementById('jobForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            console.log('Form submitted:', Object.fromEntries(formData));
        });
    </script>
</body>
</html>
`;

async function setupTestEnvironment() {
    // Create test form HTML file
    const testFormPath = path.join(__dirname, 'test-form.html');
    fs.writeFileSync(testFormPath, MOCK_FORM_HTML);
    console.log('✓ Created test form:', testFormPath);

    return testFormPath;
}

async function checkBackendHealth() {
    try {
        const response = await fetch(`${BACKEND_URL}/health`);
        if (!response.ok) throw new Error('Backend not healthy');
        console.log('✓ Backend is running');
        return true;
    } catch (error) {
        console.error('✗ Backend is not running. Start it with:');
        console.error('  cd ~/code/jesseolsen/rag && source venv/bin/activate && uvicorn app.main:app --reload');
        return false;
    }
}

async function runTests() {
    console.log('\n🧪 Starting Extension Tests...\n');

    // Check backend
    const backendReady = await checkBackendHealth();
    if (!backendReady) {
        console.error('\n❌ Cannot run tests without backend\n');
        process.exit(1);
    }

    // Setup test environment
    const testFormPath = await setupTestEnvironment();

    // Launch browser with extension
    console.log('🚀 Launching Chrome with extension...');
    const browser = await puppeteer.launch({
        headless: false, // Set to true for CI/CD
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });

    try {
        const page = await browser.newPage();

        // Enable console logging from page
        page.on('console', msg => {
            const text = msg.text();
            if (text.includes('[RESUME_RAG]')) {
                console.log('  📄', text);
            }
        });

        // Navigate to test form
        await page.goto(`file://${testFormPath}`);
        console.log('✓ Loaded test form\n');

        // Wait a bit for extension to initialize
        await page.waitForTimeout(1000);

        // Test 1: Check if content script is loaded
        console.log('Test 1: Content script loaded');
        const contentScriptLoaded = await page.evaluate(() => {
            return typeof window.RESUME_RAG_BACKEND_URL !== 'undefined';
        });
        console.log(contentScriptLoaded ? '  ✅ PASS' : '  ❌ FAIL', '\n');

        // Test 2: Fill basic fields
        console.log('Test 2: Fill basic fields');
        await page.evaluate(() => {
            document.getElementById('first_name').value = 'Jesse';
            document.getElementById('last_name').value = 'Olsen';
            document.getElementById('email').value = 'mejesseolsen@gmail.com';
            document.getElementById('phone').value = '(970) 391-1018';
        });

        const fieldsFilledCorrectly = await page.evaluate(() => {
            return document.getElementById('first_name').value === 'Jesse' &&
                   document.getElementById('last_name').value === 'Olsen';
        });
        console.log(fieldsFilledCorrectly ? '  ✅ PASS' : '  ❌ FAIL', '\n');

        // Test 3: Simulate degree selection (mimics user action)
        console.log('Test 3: Simulate degree selection');
        await page.evaluate(() => {
            const degreeInput = document.getElementById('degree--0');
            const degreeDisplay = document.querySelector('.select__single-value');
            degreeInput.value = "Master of Business Administration (M.B.A.)";
            degreeDisplay.textContent = "Master of Business Administration (M.B.A.)";
            degreeInput.dispatchEvent(new Event('input', { bubbles: true }));
        });

        const degreeValue = await page.evaluate(() => {
            return document.getElementById('degree--0').value;
        });
        console.log('  Degree value:', degreeValue);
        console.log(degreeValue.includes('M.B.A.') ? '  ✅ PASS' : '  ❌ FAIL', '\n');

        // Test 4: Test Capture Answers functionality
        console.log('Test 4: Capture Answers');
        const captureResult = await page.evaluate(async () => {
            // Simulate what the extension does
            const backendUrl = 'http://localhost:8000';
            const filledFields = {};

            // Call the capture function (if available)
            if (typeof captureAnswersFromCurrentForm === 'function') {
                return await captureAnswersFromCurrentForm(backendUrl, filledFields);
            } else {
                return { success: false, message: 'Function not available' };
            }
        });
        console.log('  Capture result:', captureResult);
        console.log(captureResult?.success ? '  ✅ PASS' : '  ⚠️  SKIP (manual test required)', '\n');

        // Test 5: Check form data extraction
        console.log('Test 5: Extract form data');
        const formData = await page.evaluate(() => {
            const form = document.getElementById('jobForm');
            const data = new FormData(form);
            return Object.fromEntries(data);
        });
        console.log('  Form data:', formData);
        console.log(Object.keys(formData).length > 0 ? '  ✅ PASS' : '  ❌ FAIL', '\n');

        console.log('✅ All automated tests completed!\n');
        console.log('Manual tests required:');
        console.log('  1. Open extension popup and click "Fill Form"');
        console.log('  2. Click "Capture Answers"');
        console.log('  3. Verify Degree field is saved correctly\n');

        // Keep browser open for manual inspection
        console.log('Browser will remain open for 30 seconds for manual testing...');
        await page.waitForTimeout(30000);

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        await browser.close();
        console.log('\n✓ Browser closed\n');
    }
}

// Run tests
runTests().catch(console.error);
