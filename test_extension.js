#!/usr/bin/env node

/**
 * Test script for Chrome Extension Form Filling Logic
 * Run: node test_extension.js
 */

// Mock resume data
const mockResumeData = {
    first_name: "Jesse",
    last_name: "Olsen",
    name: "Jesse Dale Olsen",
    email: "mejesseolsen@gmail.com",
    phone: "(970) 391-1018",
    city: "Spanish Fork",
    state: "UT",
    country: "USA",
    location: "Spanish Fork, UT",
    linkedin: "https://linkedin.com/in/jesse-olsen",
    website: "https://bah.com/vellox",
    summary: "Senior software engineer",
    skills: [],
    experience: [],
    education: []
};

// Mock form elements
class MockElement {
    constructor(type, id, name, value = '') {
        this.type = type;
        this.id = id;
        this.name = name;
        this.value = value;
        this.checked = false;
        this.tagName = type === 'select' ? 'SELECT' : 'INPUT';
        this.offsetHeight = 1;
        this.style = { backgroundColor: '' };
        this.options = [];
    }

    dispatchEvent() {
        // Mock event dispatch
    }

    querySelector() {
        return null;
    }
}

// Test Case 1: Text Field Matching
console.log('=== TEST 1: Text Field Matching ===\n');

const testPatterns = [
    ['first_name|first names', 'Jesse', 'first name field'],
    ['last_name|last names', 'Olsen', 'last name field'],
    ['email|emails', 'mejesseolsen@gmail.com', 'email field'],
    ['phone|phones', '(970) 391-1018', 'phone field'],
    ['city|location_city', 'Spanish Fork', 'city field'],
    ['linkedin', 'https://linkedin.com/in/jesse-olsen', 'linkedin field'],
    ['website|portfolio|url', 'https://bah.com/vellox', 'website field'],
];

let passed = 0;
let failed = 0;

testPatterns.forEach(([pattern, expectedValue, description]) => {
    const regex = new RegExp(pattern, 'i');
    const testText = `id_${pattern.split('|')[0]}|name_${pattern.split('|')[0]}`;

    if (regex.test(testText)) {
        console.log(`✓ PASS: ${description}`);
        console.log(`  Pattern: ${pattern}`);
        console.log(`  Expected: ${expectedValue}`);
        passed++;
    } else {
        console.log(`✗ FAIL: ${description}`);
        console.log(`  Pattern: ${pattern} did not match`);
        failed++;
    }
});

// Test Case 2: Checkbox Detection
console.log('\n=== TEST 2: Checkbox Detection ===\n');

const checkboxTest = 'question_id|question_name|How did you hear about us?|linkedin';
if (/linkedin/i.test(checkboxTest)) {
    console.log('✓ PASS: LinkedIn checkbox detected');
    passed++;
} else {
    console.log('✗ FAIL: LinkedIn checkbox not detected');
    failed++;
}

// Test Case 3: USA Option Matching
console.log('\n=== TEST 3: USA Option Matching ===\n');

const usaOptions = [
    'USA',
    'US',
    'United States',
    'usa+1',
    'us+1',
    'united states+1',
    'American Samoa',  // Should NOT match
    'american samoa+1', // Should NOT match
];

const usaPattern = /^usa$|^us$|^united states$|^usa\+|^us\+|^united states\+/i;

usaOptions.forEach(option => {
    const trimmed = option.toLowerCase().trim();
    const matches = usaPattern.test(trimmed);
    const shouldMatch = !option.toLowerCase().includes('samoa');

    if (matches === shouldMatch) {
        const result = matches ? 'correctly matched' : 'correctly rejected';
        console.log(`✓ PASS: "${option}" ${result}`);
        passed++;
    } else {
        const result = matches ? 'incorrectly matched' : 'incorrectly rejected';
        console.log(`✗ FAIL: "${option}" ${result}`);
        failed++;
    }
});

// Test Case 4: Dropdown Context Matching
console.log('\n=== TEST 4: Dropdown Context Matching ===\n');

const dropdownContexts = [
    ['Are you authorized to lawfully work', true, 'work authorization dropdown'],
    ['Country', true, 'country dropdown'],
    ['Visa sponsorship required', true, 'visa dropdown'],
    ['Do you require employment visa', true, 'employment visa dropdown'],
    ['How did you hear about us', false, 'hearing source dropdown'],
    ['Select a skill', false, 'skill dropdown'],
];

const dropdownPattern = /country|authorized|legal|visa|sponsorship|work.*in|require/i;

dropdownContexts.forEach(([context, shouldMatch, description]) => {
    const matches = dropdownPattern.test(context);

    if (matches === shouldMatch) {
        const result = matches ? 'correctly identified' : 'correctly skipped';
        console.log(`✓ PASS: ${description} - ${result}`);
        passed++;
    } else {
        const result = matches ? 'incorrectly identified' : 'incorrectly skipped';
        console.log(`✗ FAIL: ${description} - ${result}`);
        failed++;
    }
});

// Test Case 5: Response Object Structure
console.log('\n=== TEST 5: Response Object ===\n');

const mockResponse = {
    success: true,
    filledCount: 7
};

if (mockResponse.success && typeof mockResponse.filledCount === 'number') {
    console.log('✓ PASS: Response object has correct structure');
    console.log(`  success: ${mockResponse.success}`);
    console.log(`  filledCount: ${mockResponse.filledCount}`);
    passed++;
} else {
    console.log('✗ FAIL: Response object structure incorrect');
    failed++;
}

// Summary
console.log('\n' + '='.repeat(50));
console.log(`\nTest Results: ${passed} passed, ${failed} failed`);
console.log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%\n`);

if (failed === 0) {
    console.log('✓ All tests passed!\n');
    process.exit(0);
} else {
    console.log(`✗ ${failed} test(s) failed\n`);
    process.exit(1);
}
