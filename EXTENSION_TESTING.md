# Chrome Extension Testing Guide

## Loading the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `static/extension/` directory

## Testing the Extension

### Setup
1. Set up the database with the new form_responses table:
   ```bash
   # If using Docker
   docker-compose down && docker-compose up -d
   
   # If using local SQLite or PostgreSQL, run alembic
   alembic upgrade head
   ```

2. Start your Resume RAG backend:
   ```bash
   # Using uvicorn directly
   uvicorn app.main:app --reload
   ```

3. Navigate to a Greenhouse job application form:
   ```
   https://job-boards.greenhouse.io/embed/job_app?for=coalition&jr_id=699f309994ef206f184e4fd6&token=4665924005&utm_source=jobright
   ```

### Fill Form
1. Click the extension icon in Chrome toolbar
2. Verify Backend URL is `http://localhost:8000` (or your backend URL)
3. Leave "Resume ID" blank to use latest resume
4. Click "Fill Form" button

### What Gets Filled
✓ Text fields: first name, last name, email, phone
✓ Checkboxes: LinkedIn, demographic consent
✓ Country dropdown: United States
✓ React Select dropdowns:
  - Prior employment: No
  - Work authorization: Yes
  - Visa sponsorship: No
  - Acknowledgement: I acknowledge
  - Gender: Male
  - Race/ethnicity: White or Caucasian
  - Military service: No

### User Modifications
1. After form fills, you can modify any values
2. When you click "Submit application" button:
   - Extension captures all form values
   - Sends them to: `/api/v1/form-response`
   - Values are saved for next time

### Debugging
Open Chrome DevTools (F12) and look at the Console tab for logs prefixed with `[RESUME_RAG]`:
- `Content script loaded` - Extension active
- `Found X combobox inputs` - Dropdown detection
- `✓ Found "Target Value" at arrow N` - Successful dropdown selection
- `Form submission detected` - Form captured on submit
- `Form data saved to backend` - Data persisted successfully

### API Endpoint
When form is submitted, the extension POSTs to:
```
POST /api/v1/form-response
{
  "url": "https://job-boards.greenhouse.io/embed/job_app?...",
  "timestamp": "2026-05-18T19:00:00.000Z",
  "data": {
    "first_name": "Jesse",
    "last_name": "Olsen",
    "email": "mejesseolsen@gmail.com",
    "phone": "(970) 391-1018",
    "country": "United States",
    "question_8433548005": "No",
    "question_8433549005": "Yes",
    "question_8433550005": "No",
    "question_8433551005": "I acknowledge",
    "4014696005": "Male",
    "4014697005": "White or Caucasian",
    "4014698005": "No"
  },
  "source": "extension"
}
```

The endpoint is already implemented in the backend (`app/api/forms.py`) and saves all submitted data to the `form_responses` table with timestamp and source tracking.

## Comparing Playwright vs Extension

| Feature | Playwright | Extension |
|---------|-----------|-----------|
| Initial fill | ✓ Programmatic | ✓ From button click |
| Text fields | ✓ | ✓ |
| Checkboxes | ✓ | ✓ |
| React Select | ✓ Dynamic | ✓ Dynamic |
| User modifications | ✗ (automated only) | ✓ (user can modify) |
| Persist changes | ✗ | ✓ (on submit) |
| Installation | None | Load unpacked |
| Usage | Command line | Browser UI |

Use Playwright for headless automation, use Extension for interactive user workflow!
