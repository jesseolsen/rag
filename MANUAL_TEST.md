# Manual Chrome Extension Testing

Since Playwright's extension loading is complex, here's how to manually test:

## Setup

1. **Reload the extension** in Chrome:
   ```
   chrome://extensions/ → Find "Resume RAG Form Filler" → Click Reload
   ```

2. **Start the backend** (if not already running):
   ```bash
   uvicorn app.main:app --reload
   ```

## Test Steps

1. **Open Greenhouse Form**:
   ```
   https://job-boards.greenhouse.io/embed/job_app?for=coalition&jr_id=699f309994ef206f184e4fd6&token=4665924005&utm_source=jobright
   ```

2. **Open Chrome DevTools** (F12) and go to Console tab

3. **Click extension icon** in toolbar → Click "Fill Form"

4. **Watch the console** for `[RESUME_RAG]` logs:
   - Should see "Content script loaded"
   - Should see text fields being filled
   - Should see dropdown processing starting
   - Should see each dropdown being found and selected

5. **Check the form** after ~15 seconds:
   - Text fields should be filled (Jesse Olsen, email, phone)
   - All dropdowns should show selected values (not "Select...")
   - LinkedIn checkbox should be checked

## Expected Console Output

```
[RESUME_RAG] Content script loaded
[RESUME_RAG] Filled: first_name with: Jesse
[RESUME_RAG] Filled: last_name with: Olsen
[RESUME_RAG] Filled: email with: mejesseolsen@gmail.com
[RESUME_RAG] Filled: phone with: (970) 391-1018
[RESUME_RAG] Checked LinkedIn checkbox
[RESUME_RAG] Checked Demographic Data Consent checkbox
[RESUME_RAG] Processing custom dropdown components
[RESUME_RAG] Found 10 combobox inputs
[RESUME_RAG] Configured dropdowns: 7
[RESUME_RAG] Dropdown: question_8433548005 -> No
[RESUME_RAG]   ✓ Found "No" at arrow 1
[RESUME_RAG] Dropdown: question_8433549005 -> Yes
[RESUME_RAG]   ✓ Found "Yes" at arrow 0
... (more dropdown logs)
[RESUME_RAG] Dropdown processing complete. Processed: 7
[RESUME_RAG] Final result: {"success":true,"filledCount":7}
```

## Troubleshooting

**If you see "Failed to fill form"**:
- Check browser console for errors
- Check backend is running: `curl http://localhost:8000/health`
- Reload extension and try again
- Check `/api/v1/resume/latest/data` exists in backend

**If extension icon doesn't appear**:
- Go to `chrome://extensions/`
- Make sure "Resume RAG Form Filler" is enabled
- Click reload button
- Restart Chrome

**If dropdowns show "Select..."**:
- This means they weren't filled
- Check console logs for errors
- Verify backend URL is correct in extension popup
- Check `/AUTOMATION_SOLUTIONS.md` for dropdown troubleshooting

## Next Steps

Once this is working manually:
1. We can improve the Playwright test setup
2. Or create a simpler automated testing approach
3. Document what worked and what didn't
