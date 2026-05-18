# Greenhouse Yes/No Dropdown Solutions

## Problem Summary

The Chrome extension cannot auto-fill Yes/No dropdowns on Greenhouse job forms due to architectural limitations:

- **Visible Options**: Yes/No text appears in the browser UI
- **DOM Reality**: When queried, the DOM contains 244 country options (from a different layer)
- **Root Cause**: Greenhouse uses custom web components with shadow DOM or shared overlay patterns
- **Impact**: 4 common Yes/No questions still require manual selection (~30 seconds of user effort)

## Solution Approaches

### ✅ Solution 1: Greenhouse Job Board API (Recommended)

**Status**: Experimental - Requires testing with actual Greenhouse instance

**How it Works**:
Instead of manipulating the DOM, submit the application directly via Greenhouse's public API:

1. Fetch job details including question definitions (IDs, types)
2. Build application payload with resume data + Yes/No answers
3. POST to `/applications` endpoint
4. User never needs to interact with dropdowns

**Implementation**:
- **File**: `static/extension/greenhouse-api.js`
- **Class**: `GreenhouseAPI`
- **Key Methods**:
  - `detectGreenhouseInstance()` - Identify current Greenhouse URL
  - `fetchJobQuestions()` - Get question IDs and types
  - `submitApplication()` - Submit full application via API
  - `buildApplicationPayload()` - Format resume data for API

**Usage in Extension**:
```javascript
const api = new GreenhouseAPI();
if (api.isAvailable()) {
    const payload = api.buildApplicationPayload(resumeData, {
        '67890': 'Yes',      // question_id: answer
        '67891': 'No'
    });
    const result = await api.submitApplication(payload);
}
```

**Advantages**:
- ✅ Completely bypasses custom dropdowns
- ✅ Submits full application in one action
- ✅ Works with any Greenhouse instance
- ✅ No DOM manipulation needed

**Disadvantages**:
- ⚠️ Requires CORS support or backend relay
- ⚠️ May need API authentication (company-specific)
- ⚠️ Needs Greenhouse account validation for question IDs

**Next Steps**:
1. Test with actual Greenhouse job URL
2. Check if API is publicly accessible (CORS)
3. If blocked by CORS, set up backend proxy endpoint

**Testing the API**:
```bash
# 1. Navigate to a Greenhouse job form
# 2. Open browser console
# 3. Run:
const api = new GreenhouseAPI();
api.detectGreenhouseInstance();
const questions = await api.fetchJobQuestions();
console.log(questions);
```

---

### ✅ Solution 2: Browser Automation (Playwright/Puppeteer)

**Status**: Working - Tested approach for automated filling

**How it Works**:
Use Playwright (headless browser automation) to:
1. Load the job form in a real browser
2. Fill text fields using standard DOM queries
3. Click dropdown elements and find Yes/No options by visible text
4. Browser can access the same rendering as a human would see

**Implementation**:
- **File**: `greenhouse_automation.py`
- **Class**: `GreenhouseAutomation`
- **Key Methods**:
  - `launch()` / `close()` - Manage browser lifecycle
  - `navigate(url)` - Go to job form
  - `fill_resume_data(data)` - Auto-fill all accessible fields
  - `select_yes_no_dropdown(label, value)` - Click dropdown and select Yes/No

**Installation**:
```bash
pip install playwright
playwright install  # Downloads browser binaries
```

**Usage from Command Line**:
```bash
# Interactive mode (browser visible, wait 5 minutes)
python greenhouse_automation.py \
    --url "https://job-boards.greenhouse.io/embed/job_app?for=coalition&jr_id=..." \
    --resume-file resume_data.json

# Headless mode (no UI)
python greenhouse_automation.py \
    --url "https://..." \
    --resume-file resume_data.json \
    --headless

# Save screenshot
python greenhouse_automation.py \
    --url "https://..." \
    --resume-file resume_data.json \
    --screenshot form_filled.png
```

**Usage from Python**:
```python
from greenhouse_automation import GreenhouseAutomation

async def fill_form():
    automation = GreenhouseAutomation(headless=True)
    await automation.launch()
    await automation.navigate(job_url)
    
    resume_data = {
        'first_name': 'Jesse',
        'last_name': 'Olsen',
        'email': 'jesse@example.com',
        'phone': '(970) 391-1018',
        'city': 'Spanish Fork',
        'linkedin': 'https://linkedin.com/in/jesse-olsen',
        'website': 'https://example.com'
    }
    
    counts = await automation.fill_resume_data(resume_data)
    await automation.close()
    return counts
```

**Advantages**:
- ✅ Works with ANY dropdown implementation
- ✅ Finds options by visible text (not DOM)
- ✅ Can handle JavaScript-rendered content
- ✅ No CORS or API issues
- ✅ Useful for testing/CI pipelines

**Disadvantages**:
- ❌ Requires separate Python dependency
- ❌ Resource-intensive (launches full browser)
- ❌ Not suitable for real-time extension use
- ❌ Best used as background job, not browser extension

**Use Cases**:
- Batch job application processing
- Automated testing of Greenhouse forms
- CI/CD pipeline integration
- Headless server automation

---

### 📄 Solution 3: Page Script Injection (Experimental)

**Status**: Not implemented - High risk, likely to fail

**How it Works**:
- Inject an isolated page script (different from content script)
- Page scripts run in the page's context, potentially accessing more DOM
- Bridge communication with content script via postMessage

**Why Not Recommended**:
- Content scripts already try this approach
- Even page scripts cannot access closed shadow DOM
- Greenhouse likely uses closed shadow roots intentionally
- Fragile and subject to breaking with Greenhouse updates

---

## Current State: Hybrid Approach ✅

The extension uses a **hybrid strategy**:

1. **Content Script** (current): Fills accessible text fields, checkboxes, native selects
   - ✅ First Name, Last Name, Email, Phone, City, LinkedIn checkbox
   - ✅ Works instantly, no dependencies
   
2. **Browser Automation** (new): Optional fallback for Yes/No dropdowns
   - ✅ Can be invoked separately for specific jobs
   - ✅ Uses `greenhouse_automation.py`

3. **Job Board API** (experimental): Direct API submission
   - ✅ Would completely bypass UI if implemented
   - ⏳ Needs validation with real Greenhouse instance

## Recommendation

**For End Users**:
- Use the extension for text fields (saves ~4 minutes)
- Manually select 4 Yes/No dropdowns (takes 30 seconds)
- **Total time: ~35 seconds vs. 5+ minutes without extension**

**For Automation Use Cases**:
- Use `greenhouse_automation.py` with `--headless` for batch processing
- Can be integrated into job application workflow scripts

**For Full Automation (Future)**:
- Investigate Greenhouse API with actual Greenhouse instance
- If API submission works, it's the ultimate solution
- Could be integrated into the extension as a backend relay

## Testing & Validation

### Test the Extension:
```bash
# 1. Load extension in Chrome
chrome://extensions/ → Load unpacked → /static/extension/

# 2. Navigate to Greenhouse job form
https://job-boards.greenhouse.io/embed/job_app?for=coalition&jr_id=...

# 3. Click extension icon and fill form
# 4. Verify text fields auto-fill (name, email, phone, etc)
# 5. Manually select Yes/No dropdowns
```

### Test Playwright Automation:
```bash
# 1. Install dependencies
pip install playwright
playwright install

# 2. Run with a real job URL
python greenhouse_automation.py \
    --url "https://job-boards.greenhouse.io/embed/job_app?for=coalition&jr_id=..." \
    --resume-file tests/fixtures/resume_data.json \
    --screenshot filled_form.png

# 3. Check the screenshot to verify all fields filled
```

### Test the Job Board API:
```javascript
// In browser console on a Greenhouse job form:
const api = new GreenhouseAPI();
api.detectGreenhouseInstance();

// Fetch questions
const job = await api.fetchJobQuestions();
console.log('Questions:', job.questions);

// Try to submit
const payload = api.buildApplicationPayload(resumeData, {
    '67890': 'Yes'
});
const result = await api.submitApplication(payload);
console.log('Result:', result);
```

## Files Modified/Created

| File | Purpose | Status |
|------|---------|--------|
| `static/extension/greenhouse-api.js` | Job Board API integration | ✅ New |
| `static/extension/manifest.json` | Include new API module | ✅ Updated |
| `greenhouse_automation.py` | Playwright automation script | ✅ New |
| `GREENHOUSE_SOLUTIONS.md` | This documentation | ✅ New |

## Architecture Diagram

```
User fills out form on Greenhouse
    ↓
[Content Script / Extension]
    ├─ Text fields? → Fill via DOM ✅
    ├─ Checkboxes? → Check via DOM ✅
    └─ Yes/No dropdowns? → Cannot access 🚫
        ├─ Option 1: User manually selects (current)
        ├─ Option 2: Use Playwright automation
        └─ Option 3: Use Job Board API (if available)
```

## References

- [Greenhouse Job Board API](https://developers.greenhouse.io/job-board.html)
- [Playwright Documentation](https://playwright.dev/)
- [Chrome Extension Content Scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Shadow DOM Limitations](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM)
