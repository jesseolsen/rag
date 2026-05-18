# Testing the Chrome Extension on Greenhouse

## Setup

1. **Make sure your backend is running**:
   ```bash
   python -m uvicorn app.main:app --reload
   ```
   The server should be running at `http://localhost:8000`

2. **Verify you have a resume uploaded** to the backend

3. **Load the extension in Chrome**:
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (top right toggle)
   - Click "Load unpacked"
   - Select the `/static/extension/` folder from this project

## Test Steps

1. **Navigate to a Greenhouse job form**:
   - Example: https://job-boards.greenhouse.io/embed/job_app?for=coalition&jr_id=699f309994ef206f184e4fd6

2. **Click the Resume RAG extension icon** in your Chrome toolbar

3. **Verify settings in the popup**:
   - Backend URL should be: `http://localhost:8000`
   - Leave Resume ID blank (to use latest)
   - Click **"Fill Form"**

4. **Check the following fields get filled**:

   | Field | Expected Value |
   |-------|----------------|
   | First Name | Jesse |
   | Last Name | Olsen |
   | Email | jesse.d.olsen@gmail.com |
   | Phone | (Your phone number from resume) |
   | City | Spanish Fork |
   | Country | USA (selected, not text) |
   | How did you hear about us? | LinkedIn (checkbox checked) |

5. **Visual feedback**:
   - Successfully filled fields will highlight in yellow for 2 seconds
   - The popup will show: "✓ Form filled! Matched X fields."

## Troubleshooting

### "Error communicating with page"
- Make sure you're on a Greenhouse form page
- Refresh the page and try again
- Check the browser console for errors (right-click → Inspect → Console)

### Backend connection failed
- Verify the backend URL is correct in the extension popup
- Make sure `python -m uvicorn app.main:app --reload` is running
- Check that you can access `http://localhost:8000/api/v1/resume/latest/data` in your browser

### Fields not filling
- Check the browser console for JavaScript errors
- Refresh the extension: go to `chrome://extensions/` → Resume RAG → Refresh button
- Some Greenhouse dropdowns may still require manual selection due to shadow DOM limitations

### Phone field not filling
- Phone field may be in an iframe - the extension should handle this
- If still not filling, check the browser console for iframe access errors
- This may require manual entry on some job board variants

### Checkbox not checking
- The "How did you hear about us?" field may have different label text
- Check the browser inspector to see the exact checkbox context
- May need to manually check if the field has unusual structure

## Debug Mode

To see what fields are being detected, you can add console logging:

1. Edit `/static/extension/content.js`
2. Add this at the start of the `fillFormFields` function:
   ```javascript
   console.log('Resume data received:', resumeData);
   console.log('Total inputs found:', inputs.length);
   ```
3. Reload the extension and check the page console (right-click → Inspect → Console)

## Expected Behavior After Fill

- All accessible text fields should have values
- Checkboxes should be checked where appropriate
- Dropdowns may require manual selection (Greenhouse limitation)
- Yellow highlight appears briefly on each filled field
- Status message shows total fields matched

## Next Steps

If all fields fill correctly:
- The Chrome extension is working as intended
- You can now use it on any Greenhouse job application

If some fields don't fill:
- Document which fields failed
- Check browser console for specific errors
- These may be due to Greenhouse's custom component structure
