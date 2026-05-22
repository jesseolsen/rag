#!/bin/bash

# Test Google Sheets integration

echo "=========================================="
echo "Testing Google Sheets Integration"
echo "=========================================="
echo ""

# Check if credentials file exists
CREDS_FILE="credentials/google-sheets-service-account.json"

if [ ! -f "$CREDS_FILE" ]; then
    echo "❌ Credentials file not found"
    echo ""
    echo "Expected location: $CREDS_FILE"
    echo ""
    echo "Please complete the setup steps first:"
    echo "  1. Create Google Cloud service account"
    echo "  2. Download JSON key"
    echo "  3. Move to: $CREDS_FILE"
    echo ""
    echo "See QUICK_SETUP.md for instructions"
    exit 1
fi

echo "✓ Credentials file found"

# Validate JSON
if python3 -c "import json; json.load(open('$CREDS_FILE'))" 2>/dev/null; then
    echo "✓ Credentials file is valid JSON"
else
    echo "❌ Credentials file is not valid JSON"
    exit 1
fi

# Extract service account email
EMAIL=$(python3 -c "import json; print(json.load(open('$CREDS_FILE'))['client_email'])" 2>/dev/null)
if [ -n "$EMAIL" ]; then
    echo "✓ Service account email: $EMAIL"
else
    echo "❌ Could not extract service account email"
    exit 1
fi

echo ""
echo "Checking server..."

# Check if server is running
if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "❌ Server is not running"
    echo ""
    echo "Start the server with:"
    echo "  source venv/bin/activate"
    echo "  uvicorn app.main:app --reload"
    echo ""
    exit 1
fi

echo "✓ Server is running"
echo ""

# Test tracking status
echo "Testing tracking endpoint..."
RESPONSE=$(curl -s http://localhost:8000/api/v1/tracking/status)

echo "Response:"
echo "$RESPONSE" | python3 -m json.tool

echo ""
echo "Configuration check:"

ENABLED=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('enabled', False))")
SPREADSHEET_CONF=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('spreadsheet_configured', False))")
CREDS_CONF=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('credentials_configured', False))")
SERVICE_INIT=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('service_initialized', False))")

echo "  Enabled: $ENABLED"
echo "  Spreadsheet configured: $SPREADSHEET_CONF"
echo "  Credentials configured: $CREDS_CONF"
echo "  Service initialized: $SERVICE_INIT"

echo ""

if [ "$ENABLED" = "True" ] && [ "$SERVICE_INIT" = "True" ]; then
    echo "✅✅✅ SUCCESS! ✅✅✅"
    echo ""
    echo "Google Sheets integration is fully operational!"
    echo ""
    echo "What to do next:"
    echo "  1. Reload your Chrome extension (chrome://extensions/)"
    echo "  2. Navigate to a job application page"
    echo "  3. Fill out and submit the form"
    echo "  4. Check your spreadsheet:"
    echo "     https://docs.google.com/spreadsheets/d/1gWm8wGRAhY7Cfd92cjJm2STSaV3U8CLqoomqEPoCXjo/edit"
    echo ""
    echo "You should see a new row with the company name (hyperlinked) and today's date!"
    echo ""
elif [ "$SERVICE_INIT" = "False" ]; then
    echo "⚠️  Service is not initialized"
    echo ""
    echo "Possible issues:"
    echo "  1. Credentials file might be invalid"
    echo "  2. Google Sheets API not enabled in your project"
    echo "  3. Service account doesn't have proper permissions"
    echo ""
    echo "Check server logs for detailed error messages:"
    echo "  uvicorn app.main:app --reload"
    echo ""
elif [ "$SPREADSHEET_CONF" = "False" ]; then
    echo "⚠️  Spreadsheet not configured"
    echo ""
    echo "Make sure GOOGLE_SPREADSHEET is set in .env file"
    echo ""
else
    echo "⚠️  Integration is not fully enabled"
    echo ""
    echo "Check the configuration values above and fix any that are False"
    echo ""
fi

echo "=========================================="
