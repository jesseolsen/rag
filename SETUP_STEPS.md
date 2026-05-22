# Google Sheets Setup - Follow These Steps

## 🎯 What You Need To Do

Complete these 6 steps (takes about 7 minutes total):

---

## ✅ Step 1: Create Google Cloud Project (2 min)

**Click here:** https://console.cloud.google.com/projectcreate

1. **Project name**: `Resume RAG Sheets`
2. Click **CREATE**
3. Wait for the notification "Project created"

---

## ✅ Step 2: Enable Google Sheets API (1 min)

**Click here:** https://console.cloud.google.com/apis/library/sheets.googleapis.com

1. Make sure **Resume RAG Sheets** is selected (top-left dropdown)
2. Click **ENABLE**
3. Wait for "API enabled" message

---

## ✅ Step 3: Create Service Account (2 min)

**Click here:** https://console.cloud.google.com/iam-admin/serviceaccounts/create

1. **Service account name**: `resume-rag-sheets`
2. **Service account ID**: (auto-filled, leave it)
3. Click **CREATE AND CONTINUE**
4. Click **CONTINUE** (skip optional grants)
5. Click **DONE**

---

## ✅ Step 4: Download Service Account Key (1 min)

You should now see your service accounts list.

1. Click on **resume-rag-sheets**
2. Click the **KEYS** tab
3. Click **ADD KEY** → **Create new key**
4. Choose **JSON** format
5. Click **CREATE**

📥 A JSON file will download automatically (probably to ~/Downloads/)

---

## ✅ Step 5: Move the JSON File to Credentials Directory

In your terminal, run:

```bash
# Find the downloaded file (it has a long name like resume-rag-sheets-abc123.json)
ls -lt ~/Downloads/*.json | head -5

# Copy it to the credentials directory (adjust the filename):
cp ~/Downloads/resume-rag-sheets-*.json credentials/google-sheets-service-account.json

# Verify it was copied:
ls -lh credentials/google-sheets-service-account.json
```

If you see the file size (should be a few KB), you're good! ✅

---

## ✅ Step 6: Share Your Spreadsheet with the Service Account

### 6a. Get the service account email:

```bash
./get_service_account_email.sh
```

This will display the email and copy it to your clipboard.

### 6b. Share the spreadsheet:

1. **Open your spreadsheet:** https://docs.google.com/spreadsheets/d/1gWm8wGRAhY7Cfd92cjJm2STSaV3U8CLqoomqEPoCXjo/edit

2. Click **SHARE** button (top right)

3. Paste the service account email (from step 6a)

4. Change permission dropdown to **Editor**

5. **Uncheck** "Notify people" (service accounts don't get emails)

6. Click **SHARE**

---

## 🧪 Test the Integration

### Start the server:
```bash
source venv/bin/activate
uvicorn app.main:app --reload
```

### In a new terminal, run the test:
```bash
./test_google_sheets.sh
```

You should see:
```
✅✅✅ SUCCESS! ✅✅✅

Google Sheets integration is fully operational!
```

---

## 🚀 Use It!

1. **Reload Chrome Extension:**
   - Go to `chrome://extensions/`
   - Find "Resume RAG"
   - Click the reload icon 🔄

2. **Fill a Job Application:**
   - Navigate to any job application page
   - Click the extension
   - Click "Fill Form"
   - Submit the application

3. **Check Your Spreadsheet:**
   - Open: https://docs.google.com/spreadsheets/d/1gWm8wGRAhY7Cfd92cjJm2STSaV3U8CLqoomqEPoCXjo/edit
   - You should see a new row with:
     - Company name (clickable, links to the job page)
     - Date applied (today's date)

---

## 🆘 Troubleshooting

If the test fails, check:

1. **Credentials file exists:**
   ```bash
   ls -lh credentials/google-sheets-service-account.json
   ```

2. **File is valid JSON:**
   ```bash
   python3 -c "import json; json.load(open('credentials/google-sheets-service-account.json'))"
   ```

3. **Spreadsheet is shared with service account:**
   - Open the spreadsheet
   - Click Share
   - Check if the service account email is in the list with Editor access

4. **Server logs:**
   - Look for any error messages when the server starts
   - Search for `[GOOGLE_SHEETS]` in the output

---

## 📝 Summary

After completing these steps:
- ✅ Service account created
- ✅ Credentials downloaded and in place
- ✅ Spreadsheet shared with service account
- ✅ Integration tested and working

Every time you submit a job application, it will automatically be tracked in your spreadsheet! 🎉
