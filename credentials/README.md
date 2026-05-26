# Google Sheets API Setup

This directory contains the Google Sheets API service account credentials needed for tracking job applications.

## Setup Instructions

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project ID

### 2. Enable Google Sheets API

1. In the Cloud Console, go to **APIs & Services** → **Library**
2. Search for "Google Sheets API"
3. Click **Enable**

### 3. Create a Service Account

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **Service Account**
3. Enter a name (e.g., "resume-rag-sheets")
4. Click **Create and Continue**
5. Skip the optional role assignment (click **Continue** then **Done**)

### 4. Create and Download Service Account Key

1. Click on the service account you just created
2. Go to the **Keys** tab
3. Click **Add Key** → **Create new key**
4. Choose **JSON** format
5. Click **Create** - this will download the JSON key file
6. Rename the downloaded file to `google-sheets-service-account.json`
7. Move it to this `credentials/` directory

### 5. Share Spreadsheet with Service Account

1. Open the downloaded JSON file and find the `client_email` field
   - It will look like: `resume-rag-sheets@your-project.iam.gserviceaccount.com`
2. Open your Google Spreadsheet
3. Click **Share** button
4. Add the service account email as an editor
5. Click **Send**

### 6. Verify Configuration

The `.env` file should have:
```
GOOGLE_SPREADSHEET=https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit...
GOOGLE_SHEETS_CREDENTIALS_FILE=credentials/google-sheets-service-account.json
```

### 7. Test the Integration

Start the server and check the tracking status:
```bash
curl http://localhost:8000/api/v1/tracking/status
```

Should return:
```json
{
  "enabled": true,
  "spreadsheet_configured": true,
  "credentials_configured": true,
  "service_initialized": true,
  "spreadsheet_url": "https://..."
}
```

## Security Notes

- **Never commit the JSON credentials file to git**
- The `.gitignore` file should exclude `credentials/*.json`
- Keep this file secure as it provides access to modify your spreadsheet
- You can revoke access by deleting the service account key in Google Cloud Console

## Troubleshooting

### "Service not initialized"
- Check that the JSON file exists at the path specified in `.env`
- Verify the JSON file is valid (open it to check it's not corrupted)
- Make sure the service account email has edit access to the spreadsheet

### "Permission denied" errors
- Ensure the spreadsheet is shared with the service account email
- The service account needs "Editor" permissions, not just "Viewer"

### "Spreadsheet not found"
- Verify the `GOOGLE_SPREADSHEET` URL in `.env` is correct
- Make sure the spreadsheet ID is correctly extracted from the URL
