#!/usr/bin/env node

/**
 * Focused test for the Degree field issue
 * Tests that degree selection is captured and filled correctly
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.join(__dirname, '..', 'static', 'extension');
const BACKEND_URL = 'http://localhost:8000';

// Realistic Greenhouse-style form with React Select for Degree
const DEGREE_TEST_FORM = `
<!DOCTYPE html>
<html>
<head>
    <title>Degree Field Test</title>
    <style>
        body { font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px; }
        .field { margin: 20px 0; }
        label { display: block; font-weight: bold; margin-bottom: 5px; }
        input { width: 100%; padding: 8px; box-sizing: border-box; }
        .select__single-value { padding: 5px; background: #f0f0f0; margin-top: 5px; }
    </style>
</head>
<body>
    <h1>Education Section - Degree Field Test</h1>

    <div class="field">
        <label for="degree--0">Degree*</label>
        <input type="text" id="degree--0" role="combobox" aria-autocomplete="list" />
        <div class="select__single-value remix-css-1dimb5e-singleValue" id="degree-display"></div>
    </div>

    <div style="margin-top: 30px; padding: 20px; background: #e8f5e9;">
        <h3>Test Scenario:</h3>
        <ol>
            <li>Select "Master of Business Administration (M.B.A.)" in the Degree field</li>
            <li>Click "Capture Answers" in extension popup</li>
            <li>Verify saved answer appears in popup</li>
            <li>Clear the field</li>
            <li>Click "Fill Form" in extension popup</li>
            <li>Verify Degree field is filled with saved value</li>
        </ol>
    </div>

    <script>
        const degreeInput = document.getElementById('degree--0');
        const degreeDisplay = document.getElementById('degree-display');

        // Simulate React Select behavior
        const degreeOptions = [
            "High School Diploma",
            "Associate's Degree",
            "Bachelor's Degree",
            "Master's Degree",
            "Master of Business Administration (M.B.A.)",
            "Doctorate (Ph.D.)",
            "Professional Degree (M.D., J.D., etc.)"
        ];

        // Auto-select MBA for testing
        setTimeout(() => {
            const mbaValue = "Master of Business Administration (M.B.A.)";
            degreeInput.value = mbaValue;
            degreeDisplay.textContent = mbaValue;
            degreeInput.dispatchEvent(new Event('input', { bubbles: true }));
            degreeInput.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('[TEST] Auto-selected:', mbaValue);
        }, 1000);

        degreeInput.addEventListener('input', (e) => {
            degreeDisplay.textContent = e.target.value;
        });

        // Log when extension captures
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            if (args[0].includes('field-answers')) {
                console.log('[TEST] Extension making API call:', args[0]);
            }
            return originalFetch.apply(this, args);
        };
    </script>
</body>
</html>
`;

async function runDegreeTest() {
    console.log('\n🎓 Testing Degree Field Capture & Fill\n');

    // Create test form
    const testFormPath = path.join(__dirname, 'test-degree-form.html');
    fs.writeFileSync(testFormPath, DEGREE_TEST_FORM);
    console.log('✓ Created test form');

    // Launch browser
    console.log('🚀 Launching Chrome...\n');
    const browser = await puppeteer.launch({
        headless: false,
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`
        ],
        defaultViewport: { width: 1200, height: 800 }
    });

    try {
        const page = await browser.newPage();

        // Log console messages
        page.on('console', msg => {
            const text = msg.text();
            if (text.includes('[RESUME_RAG]') || text.includes('[TEST]')) {
                console.log('  ', text);
            }
        });

        // Navigate to test form
        await page.goto(`file://${testFormPath}`);
        console.log('✓ Loaded test form\n');

        // Wait for extension to initialize
        await page.waitForTimeout(2000);

        // Check if degree is auto-selected
        const degreeValue = await page.evaluate(() => {
            return document.getElementById('degree--0').value;
        });
        console.log('📝 Current degree value:', degreeValue);
        console.log(degreeValue.includes('M.B.A.') ? '  ✅ Degree auto-selected' : '  ⚠️  Degree not selected');

        console.log('\n📋 Next steps:');
        console.log('  1. Open extension popup (click extension icon)');
        console.log('  2. Click "Capture Answers"');
        console.log('  3. Verify "Degree*" appears in saved answers');
        console.log('  4. Clear the degree field');
        console.log('  5. Click "Fill Form"');
        console.log('  6. Verify degree field is filled correctly\n');

        console.log('⏱️  Browser will stay open for 2 minutes for manual testing...\n');
        await page.waitForTimeout(120000);

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await browser.close();
        console.log('\n✓ Test complete\n');
    }
}

runDegreeTest().catch(console.error);
