#!/bin/bash

# Extract and display the service account email from credentials file

CREDS_FILE="credentials/google-sheets-service-account.json"

if [ ! -f "$CREDS_FILE" ]; then
    echo "❌ Credentials file not found at: $CREDS_FILE"
    echo ""
    echo "Please complete steps 1-5 first to create and download the service account key."
    exit 1
fi

EMAIL=$(python3 -c "import json; print(json.load(open('$CREDS_FILE'))['client_email'])" 2>/dev/null)

if [ -z "$EMAIL" ]; then
    echo "❌ Could not read service account email from JSON file"
    exit 1
fi

echo "=========================================="
echo "Service Account Email:"
echo "=========================================="
echo ""
echo "$EMAIL"
echo ""
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Copy the email above"
echo "2. Open your spreadsheet:"
echo "   https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit"
echo "3. Click SHARE (top right)"
echo "4. Paste the email"
echo "5. Change to EDITOR permission"
echo "6. Uncheck 'Notify people'"
echo "7. Click SHARE"
echo ""

# Try to copy to clipboard
if command -v pbcopy &> /dev/null; then
    echo "$EMAIL" | pbcopy
    echo "✓ Email copied to clipboard!"
elif command -v xclip &> /dev/null; then
    echo "$EMAIL" | xclip -selection clipboard
    echo "✓ Email copied to clipboard!"
else
    echo "(Could not auto-copy to clipboard - copy manually)"
fi

echo ""
