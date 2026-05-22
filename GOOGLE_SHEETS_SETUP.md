# Google Sheets Integration - Setup Complete! 🎉

I've successfully integrated Google Sheets tracking for your job applications. Here's what was implemented:

## What's New

### 1. Automatic Tracking on Form Submission
When you submit a job application form, the extension will automatically:
- Extract the company name from the page
- Add a row to your Google Spreadsheet
- Include a hyperlink in the company name that links to the job application page

### 2. Smart Company Name Detection
The extension uses multiple strategies to find the company name:
- Meta tags (og:site_name)
- Page title analysis
- Form field values
- Domain name as fallback

### 3. Backend API Endpoint
Created `/api/v1/tracking/job-application` that handles:
- Receiving company name and job URL from the extension
- Updating the Google Spreadsheet via Google Sheets API
- Only runs if `GOOGLE_SPREADSHEET` is configured in `.env`

## Files Created/Modified

### New Files:
- `requirements.txt` - Python dependencies including Google Sheets API packages
- `app/services/google_sheets.py` - Google Sheets service with API integration
- `app/api/tracking.py` - API endpoint for job application tracking
- `credentials/README.md` - Detailed setup instructions for Google API
- `GOOGLE_SHEETS_SETUP.md` - This file!

### Modified Files:
- `.env` - Added `GOOGLE_SPREADSHEET` and `GOOGLE_SHEETS_CREDENTIALS_FILE`
- `.gitignore` - Added `credentials/*.json` to prevent committing secrets
- `app/main.py` - Added tracking router
- `static/extension/content.js` - Added company name extraction and tracking calls

## Configuration in .env

```bash
GOOGLE_SPREADSHEET=https://docs.google.com/spreadsheets/d/1gWm8wGRAhY7Cfd92cjJm2STSaV3U8CLqoomqEPoCXjo/edit?gid=653006663#gid=653006663
GOOGLE_SHEETS_CREDENTIALS_FILE=credentials/google-sheets-service-account.json
```

## Next Steps - REQUIRED! ⚠️

The integration is code-complete, but you need to set up Google Cloud credentials:

### Step 1: Create Google Cloud Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the **Google Sheets API**
4. Create a **Service Account** (APIs & Services → Credentials)
5. Download the JSON key file
6. Save it as `credentials/google-sheets-service-account.json`

**Detailed instructions:** See `credentials/README.md`

### Step 2: Share Spreadsheet

1. Open the JSON file and copy the `client_email` (looks like `name@project.iam.gserviceaccount.com`)
2. Open your [Google Spreadsheet](https://docs.google.com/spreadsheets/d/1gWm8wGRAhY7Cfd92cjJm2STSaV3U8CLqoomqEPoCXjo/edit)
3. Click **Share**
4. Add the service account email with **Editor** access

### Step 3: Test the Integration

```bash
# Start the server
source venv/bin/activate
uvicorn app.main:app --reload

# Check tracking status
curl http://localhost:8000/api/v1/tracking/status
```

Expected response when properly configured:
```json
{
  "enabled": true,
  "spreadsheet_configured": true,
  "credentials_configured": true,
  "service_initialized": true,
  "spreadsheet_url": "https://docs.google.com/spreadsheets/d/..."
}
```

### Step 4: Reload Extension

After the server is running with valid credentials:
1. Go to `chrome://extensions/`
2. Find "Resume RAG" extension
3. Click the reload icon
4. Test by filling and submitting a job application form

## How It Works

1. **Form Submission Detected**
   - User clicks Submit/Apply button OR form is submitted
   - Extension's `content.js` intercepts the event

2. **Company Name Extraction**
   - `extractCompanyName()` function analyzes:
     - Page meta tags
     - Document title
     - Form fields
     - URL domain

3. **API Call to Backend**
   - Extension calls `/api/v1/tracking/job-application`
   - Sends: `{ company_name, job_url }`

4. **Google Sheets Update**
   - Backend authenticates with service account
   - Extracts spreadsheet ID and sheet name from URL
   - Appends new row with formula: `=HYPERLINK("job_url", "company_name")`
   - Adds today's date automatically

## Spreadsheet Format

The extension will add rows with these columns:
- **Column A**: Company name (with hyperlink to job page)
- **Column B**: Position (if extracted)
- **Column C**: Date applied (auto-filled)
- **Column D**: Status (empty, for manual tracking)
- **Column E**: Notes (empty, for manual tracking)

## Troubleshooting

### "Google Sheets service not available"
- Run: `curl http://localhost:8000/api/v1/tracking/status`
- Check `credentials_configured: true` and `service_initialized: true`
- Verify JSON file exists at `credentials/google-sheets-service-account.json`

### "Permission denied" when updating spreadsheet
- Make sure the service account email has **Editor** access
- Check that you shared the correct spreadsheet
- Verify the spreadsheet URL in `.env` matches the one you shared

### Tracking not happening
- Check browser console (F12) for `[RESUME_RAG]` messages
- Look for "Tracking job application: ..." log
- If you see "Tracking not enabled", the server either:
  - Doesn't have `GOOGLE_SPREADSHEET` in `.env`, OR
  - Couldn't initialize the Google Sheets service

## Security Notes

- ✅ Credentials file is in `.gitignore` - won't be committed
- ✅ Only the service account can access your spreadsheet
- ✅ No user OAuth flow required (uses service account)
- ⚠️ Keep `google-sheets-service-account.json` secure
- ⚠️ Never share or commit this file

## Optional: Add More Columns

To track additional data, modify `content.js`:

```javascript
const response = await apiRequest(`${backendUrl}/api/v1/tracking/job-application`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        company_name: companyName,
        job_url: jobUrl,
        position: extractedPosition,  // Add this
        notes: 'Applied via extension'  // Add this
    })
});
```

## Status

- ✅ Code implementation complete
- ✅ Dependencies installed
- ✅ API endpoint created
- ✅ Extension updated
- ⏳ **Waiting for:** Google Cloud service account setup
- ⏳ **Waiting for:** Spreadsheet sharing with service account

Once you complete the Google Cloud setup, the integration will be fully operational!
