#!/bin/bash

# Google Sheets API Setup Helper Script
# This script guides you through the Google Cloud setup process

set -e

echo "=========================================="
echo "Google Sheets API Setup Assistant"
echo "=========================================="
echo ""
echo "This script will help you set up Google Sheets integration."
echo "You'll need to complete some steps in your browser."
echo ""

# Check if credentials file already exists
CREDS_FILE="credentials/google-sheets-service-account.json"

if [ -f "$CREDS_FILE" ]; then
    echo "⚠️  Credentials file already exists at: $CREDS_FILE"
    read -p "Do you want to replace it? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled. Using existing credentials."
        exit 0
    fi
    rm "$CREDS_FILE"
fi

echo "📋 STEP 1: Create/Select Google Cloud Project"
echo "=============================================="
echo ""
echo "1. Open: https://console.cloud.google.com/projectcreate"
echo "2. Create a new project (or select existing)"
echo "3. Name it something like: 'Resume RAG Sheets'"
echo "4. Click CREATE"
echo ""
read -p "Press ENTER when you've created/selected a project..."

echo ""
echo "📋 STEP 2: Enable Google Sheets API"
echo "===================================="
echo ""
echo "1. Open: https://console.cloud.google.com/apis/library/sheets.googleapis.com"
echo "2. Make sure your project is selected (top left dropdown)"
echo "3. Click ENABLE"
echo "4. Wait for it to finish enabling"
echo ""
read -p "Press ENTER when API is enabled..."

echo ""
echo "📋 STEP 3: Create Service Account"
echo "=================================="
echo ""
echo "1. Open: https://console.cloud.google.com/iam-admin/serviceaccounts/create"
echo "2. Service account name: 'resume-rag-sheets'"
echo "3. Service account ID: (auto-filled, keep it)"
echo "4. Description: 'Service account for Resume RAG job tracking'"
echo "5. Click CREATE AND CONTINUE"
echo "6. Skip 'Grant this service account access' (click CONTINUE)"
echo "7. Skip 'Grant users access' (click DONE)"
echo ""
read -p "Press ENTER when service account is created..."

echo ""
echo "📋 STEP 4: Create and Download Service Account Key"
echo "=================================================="
echo ""
echo "1. You should now see your service accounts list"
echo "2. Click on the service account you just created (resume-rag-sheets)"
echo "3. Go to the KEYS tab"
echo "4. Click ADD KEY → Create new key"
echo "5. Select JSON format"
echo "6. Click CREATE"
echo "7. The JSON file will download automatically"
echo ""
read -p "Press ENTER when JSON file is downloaded..."

echo ""
echo "📋 STEP 5: Move JSON File to Credentials Directory"
echo "=================================================="
echo ""
echo "The downloaded file is probably in your Downloads folder."
echo "We need to move it to: $CREDS_FILE"
echo ""

# Try to find the downloaded file
DOWNLOADS_DIR="$HOME/Downloads"
LATEST_JSON=$(find "$DOWNLOADS_DIR" -name "*.json" -type f -mmin -5 | head -n 1)

if [ -n "$LATEST_JSON" ]; then
    echo "Found recently downloaded JSON file: $LATEST_JSON"
    read -p "Is this the service account key file? (Y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
        mkdir -p credentials
        cp "$LATEST_JSON" "$CREDS_FILE"
        echo "✓ Copied to $CREDS_FILE"
    else
        echo ""
        echo "Please manually copy the JSON file:"
        echo "  cp /path/to/your-service-account-key.json $CREDS_FILE"
        echo ""
        read -p "Press ENTER when you've copied the file..."
    fi
else
    echo "Could not auto-detect the JSON file."
    echo ""
    echo "Please manually copy it:"
    echo "  cp ~/Downloads/your-project-*.json $CREDS_FILE"
    echo ""
    read -p "Press ENTER when you've copied the file..."
fi

# Verify the file exists and is valid JSON
if [ ! -f "$CREDS_FILE" ]; then
    echo "❌ Error: Credentials file not found at $CREDS_FILE"
    echo "Please copy it manually and run this script again."
    exit 1
fi

# Extract the service account email from the JSON
SERVICE_ACCOUNT_EMAIL=$(python3 -c "import json; print(json.load(open('$CREDS_FILE'))['client_email'])" 2>/dev/null || echo "")

if [ -z "$SERVICE_ACCOUNT_EMAIL" ]; then
    echo "❌ Error: Could not read service account email from JSON file"
    echo "The file might be invalid or corrupted."
    exit 1
fi

echo ""
echo "✓ Credentials file is valid!"
echo "✓ Service account email: $SERVICE_ACCOUNT_EMAIL"
echo ""

echo "📋 STEP 6: Share Spreadsheet with Service Account"
echo "=================================================="
echo ""
echo "Now you need to give the service account access to your spreadsheet."
echo ""
echo "1. Copy this email address:"
echo ""
echo "   $SERVICE_ACCOUNT_EMAIL"
echo ""
echo "2. Open your spreadsheet:"
echo "   https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit"
echo ""
echo "3. Click the SHARE button (top right)"
echo "4. Paste the service account email"
echo "5. Change permission to EDITOR"
echo "6. Uncheck 'Notify people' (service accounts don't get emails)"
echo "7. Click SHARE"
echo ""

# Copy email to clipboard if possible
if command -v pbcopy &> /dev/null; then
    echo "$SERVICE_ACCOUNT_EMAIL" | pbcopy
    echo "✓ Service account email copied to clipboard!"
    echo ""
elif command -v xclip &> /dev/null; then
    echo "$SERVICE_ACCOUNT_EMAIL" | xclip -selection clipboard
    echo "✓ Service account email copied to clipboard!"
    echo ""
fi

read -p "Press ENTER when you've shared the spreadsheet..."

echo ""
echo "📋 STEP 7: Test the Integration"
echo "================================"
echo ""
echo "Starting the server to test the integration..."
echo ""

# Check if server is already running
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "✓ Server is already running"
else
    echo "Starting server in background..."
    source venv/bin/activate
    uvicorn app.main:app --reload > /tmp/resume-rag-server.log 2>&1 &
    SERVER_PID=$!
    echo "Server started (PID: $SERVER_PID)"

    # Wait for server to start
    echo "Waiting for server to start..."
    for i in {1..30}; do
        if curl -s http://localhost:8000/health > /dev/null 2>&1; then
            echo "✓ Server is ready"
            break
        fi
        sleep 1
        echo -n "."
    done
    echo ""
fi

echo ""
echo "Testing tracking status..."
echo ""

# Test the tracking endpoint
RESPONSE=$(curl -s http://localhost:8000/api/v1/tracking/status)
echo "Response:"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"

echo ""
echo "Checking configuration..."

ENABLED=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('enabled', False))" 2>/dev/null || echo "false")
SERVICE_INIT=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('service_initialized', False))" 2>/dev/null || echo "false")

if [ "$ENABLED" = "True" ] && [ "$SERVICE_INIT" = "True" ]; then
    echo ""
    echo "✅✅✅ SUCCESS! Google Sheets integration is enabled! ✅✅✅"
    echo ""
    echo "🎉 Setup Complete!"
    echo ""
    echo "What happens now:"
    echo "  1. When you submit a job application form, the extension will:"
    echo "     - Extract the company name from the page"
    echo "     - Add a row to your spreadsheet with a hyperlinked company name"
    echo "     - Track the date applied automatically"
    echo ""
    echo "  2. Check your spreadsheet after submitting an application:"
    echo "     https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit"
    echo ""
    echo "Next steps:"
    echo "  1. Reload the Chrome extension (chrome://extensions/)"
    echo "  2. Fill and submit a job application form"
    echo "  3. Check your spreadsheet to see the tracked application!"
    echo ""
elif [ "$ENABLED" = "False" ]; then
    echo ""
    echo "⚠️  Integration is not fully enabled"
    echo ""
    echo "Troubleshooting:"
    echo "  - Service initialized: $SERVICE_INIT"
    echo "  - Credentials file: $CREDS_FILE"
    echo ""
    echo "Check server logs for errors:"
    echo "  tail -f /tmp/resume-rag-server.log"
    echo ""
fi

echo ""
echo "=========================================="
echo "Setup script complete!"
echo "=========================================="
