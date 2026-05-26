# Google Sheets Setup - Quick Reference

Run the interactive setup script:
```bash
./setup_google_sheets.sh
```

Or follow these direct links:

## Step-by-Step Links

### 1. Create Project (2 minutes)
🔗 https://console.cloud.google.com/projectcreate
- Name: "Resume RAG Sheets"
- Click CREATE

### 2. Enable Google Sheets API (1 minute)
🔗 https://console.cloud.google.com/apis/library/sheets.googleapis.com
- Click ENABLE

### 3. Create Service Account (2 minutes)
🔗 https://console.cloud.google.com/iam-admin/serviceaccounts/create
- Name: "resume-rag-sheets"
- Click CREATE AND CONTINUE → CONTINUE → DONE

### 4. Download Key (1 minute)
🔗 https://console.cloud.google.com/iam-admin/serviceaccounts
- Click on "resume-rag-sheets"
- Go to KEYS tab
- ADD KEY → Create new key → JSON → CREATE
- Save file as: `credentials/google-sheets-service-account.json`

### 5. Share Spreadsheet (1 minute)
🔗 https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit

1. Open the JSON file you just downloaded
2. Find `"client_email"` - it looks like: `resume-rag-sheets@your-project.iam.gserviceaccount.com`
3. Copy that email
4. In the spreadsheet, click SHARE
5. Paste the email
6. Set to EDITOR
7. Uncheck "Notify people"
8. Click SHARE

### 6. Test It
```bash
curl http://localhost:8000/api/v1/tracking/status
```

Should show: `"enabled": true`

---

**Total time: ~7 minutes**
