# Complete Job Application Automation Solutions

You now have **two complementary approaches** for automating job applications with the Resume RAG system:

## 1. Playwright Automation (Headless)

**Best for:** Bulk applications, unattended scripts, CI/CD integration

### How it works
```bash
python greenhouse_automation.py \
    --url "https://job-boards.greenhouse.io/embed/job_app?..." \
    --backend-url http://localhost:8000 \
    --headless
```

### What it does
- ✓ Fills all form fields programmatically
- ✓ Dynamically selects React Select dropdowns
- ✓ No user interaction needed
- ✓ Runs in headless browser mode (no UI)
- ✓ Reads resume data from backend API

### Key features
- **Dynamic dropdown selection**: Reads visible focused option text to find target values
- **Reliable element interaction**: Uses JavaScript click() for non-blocking interactions
- **ARIA-based form state tracking**: Detects when dropdowns are open/closed
- **Screenshot debugging**: Can save form state for manual verification

### Typical workflow
1. Backend server running with resume data
2. User runs Playwright script with form URL
3. Script fills entire form and validates selections
4. Script closes without submitting (user can review/submit manually)

---

## 2. Chrome Extension (Interactive)

**Best for:** Real user workflows, allowing modifications, saving user preferences

### How it works
1. Install extension: `chrome://extensions` → Load unpacked → select `static/extension/`
2. Navigate to job application form
3. Click extension icon → Click "Fill Form"
4. User can modify values before submitting
5. Click "Submit application" → extension captures and saves response

### What it does
- ✓ Fills all form fields from resume data
- ✓ Dynamically selects React Select dropdowns
- ✓ Allows user to modify values before submit
- ✓ Intercepts form submission
- ✓ Automatically saves submitted form data to backend
- ✓ Makes form data available for future applications

### Key features
- **Interactive workflow**: User can review and modify before submission
- **Automatic capture**: Intercepts submit event and saves all values
- **Form data persistence**: Submitted data stored in database for pattern learning
- **Backend-aware**: Reads resume from configurable backend URL
- **Real-time feedback**: Shows success/error status in popup

### Typical workflow
1. Extension installed and backend running
2. User navigates to job application
3. Clicks "Fill Form" — extension populates all fields
4. User reviews and modifies as needed
5. User clicks "Submit application" — extension captures data and saves to backend

---

## Technical Implementation

### Dropdown Selection (Both approaches)

Both Playwright and the Chrome extension use the same **dynamic dropdown selection algorithm**:

```
1. Find all React Select inputs (input[role="combobox"])
2. For each dropdown:
   a. Click to open dropdown menu
   b. Loop through arrow key presses (up to 20 times)
   c. After each press, read div.select__option--is-focused text
   d. When target value text is found, press Enter to select
   e. Wait for dropdown to close
3. Continue to next dropdown
```

This approach is **timing-independent** and works regardless of:
- Number of options in dropdown
- Option ordering
- System performance variations
- Custom styling or animation delays

### Form Submission Capture (Extension only)

The extension hooks into the form's submit event:

```javascript
document.addEventListener('submit', async (e) => {
    const formData = captureFormData();
    // POST to /api/v1/form-response with all form values
});
```

This allows the backend to learn from user submissions and:
- Build patterns of common form responses
- Pre-fill similar forms with previous answers
- Track application history

---

## Data Flow Comparison

### Playwright Approach
```
Database (Resume Data)
    ↓
Frontend (optional browser)
    ↓
Playwright Script
    ↓
Greenhouse Form (filled but not submitted)
    ↓
User reviews/submits manually
```

### Chrome Extension Approach
```
Database (Resume Data)
    ↓
Chrome Extension (popup)
    ↓
Greenhouse Form (filled + user modifications)
    ↓
Extension intercepts submit
    ↓
Form Response → Saved to Database
```

---

## API Endpoints Used

### Resume Data (both)
```
GET /api/v1/resume/latest/data
GET /api/v1/resume/{resume_id}/data
```

Response includes: name, email, phone, country, LinkedIn, website, etc.

### Form Submission Capture (extension only)
```
POST /api/v1/form-response
{
    "url": "https://job-boards.greenhouse.io/embed/job_app?...",
    "timestamp": "2026-05-18T19:00:00.000Z",
    "data": { all form field values },
    "source": "extension"
}
```

---

## Database Schema

### Resumes Table
- Stores uploaded resumes with extracted data
- Used by both approaches to fill forms

### Resume Chunks Table
- Vectorized resume sections for semantic search
- Used for generating context-aware cover letters

### Form Responses Table (NEW)
- Stores all submitted form data from extension
- Enables:
  - Application history tracking
  - User preference learning
  - Pattern recognition for common fields
  - Future pre-filling improvements

```sql
CREATE TABLE form_responses (
    id VARCHAR(36) PRIMARY KEY,
    url TEXT NOT NULL,
    form_data JSON NOT NULL,
    submitted_at DATETIME DEFAULT NOW(),
    source VARCHAR(50) DEFAULT 'extension'
);
```

---

## Usage Examples

### Example 1: Bulk Automate 10 Applications
```bash
for url in $(cat job_urls.txt); do
    python greenhouse_automation.py \
        --url "$url" \
        --backend-url http://localhost:8000 \
        --headless
    sleep 2
done
```

### Example 2: Interactive User Experience
1. User installs extension
2. User visits 5 different job boards
3. Extension fills all 5 with one click each
4. User modifies as needed
5. Extension tracks all 5 submissions
6. Next job application is pre-filled with learned preferences

---

## Comparing Both Approaches

| Feature | Playwright | Extension |
|---------|-----------|-----------|
| **Installation** | None (Python script) | Load unpacked in Chrome |
| **Backend required** | Yes (for resume data) | Yes (for resume data) |
| **Automation** | Fully automated | Semi-automated (user review) |
| **Text fields** | ✓ | ✓ |
| **Checkboxes** | ✓ | ✓ |
| **React Select dropdowns** | ✓ Dynamic | ✓ Dynamic |
| **User modifications** | ✗ | ✓ |
| **Form submission** | Manual (user clicks submit) | Automatic capture |
| **Save to database** | ✗ | ✓ |
| **Screenshot debug** | ✓ | ✗ |
| **Headless capable** | ✓ | ✗ |
| **Bulk processing** | ✓ | ✗ |

---

## Greenhouse Form Fields Supported

### Always Filled
- ✓ First Name
- ✓ Last Name  
- ✓ Email
- ✓ Phone
- ✓ Country (United States)

### Conditionally Filled
- ✓ LinkedIn checkbox
- ✓ Demographic consent checkbox

### React Select Dropdowns (7 fields)
- ✓ Prior employment: No
- ✓ Work authorization: Yes
- ✓ Visa sponsorship: No
- ✓ Acknowledgement: I acknowledge
- ✓ Gender: Male
- ✓ Race/ethnicity: White or Caucasian
- ✓ Military service: No

---

## Next Steps

1. **Test Playwright**: `python greenhouse_automation.py --url "..." --headless`
2. **Test Extension**: Load at `chrome://extensions/`, click "Fill Form"
3. **Monitor database**: Check `form_responses` table after extension submissions
4. **Iterate**: Use captured form data to refine selection logic
5. **Scale**: Use Playwright for bulk automation, Extension for user interactions

---

## Troubleshooting

### Playwright issues
- Check browser launches: `--headless` to see UI if debugging
- Review screenshots saved with `--screenshot`
- Check backend connectivity: `curl http://localhost:8000/health`
- See logs for dropdown selection progress

### Extension issues
- Check Chrome DevTools Console (F12) for `[RESUME_RAG]` logs
- Verify backend URL in extension popup (default: `http://localhost:8000`)
- Check that form_responses table exists (run `alembic upgrade head`)
- Reload extension after making changes

---

## Architecture Decisions

### Why dynamic dropdown selection?
- Hardcoded arrow counts broke when Greenhouse changed option ordering
- ARIA announcements weren't reliably accessible from content scripts
- Reading visible focused option text is simple and reliable
- Works in both Playwright and browser context

### Why separate extension and Playwright?
- Playwright for unattended automation and bulk processing
- Extension for interactive workflows where user approval matters
- Different use cases: self-service vs programmatic
- Both use same dropdown logic for consistency

### Why capture form submissions?
- Build patterns from actual user submissions
- Enable smart pre-filling based on learned preferences
- Track application history and outcomes
- Improve over time as we see what users actually submit vs auto-fill

