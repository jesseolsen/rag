# Extension Testing

## Quick Start

### 1. Watch for changes during development
```bash
npm run watch
```
This monitors extension files and reminds you to reload when changes are detected.

### 2. Run automated tests
```bash
npm test
```
This launches Chrome with the extension and runs automated tests.

## Test Files

- **test-extension.js** - Automated Puppeteer tests
- **watch-extension.js** - File watcher for development
- **test-form.html** - Mock job application form (auto-generated)

## Manual Testing Workflow

1. Start the backend:
   ```bash
   cd ~/code/rag
   source venv/bin/activate
   uvicorn app.main:app --reload
   ```

2. Start file watcher (optional):
   ```bash
   npm run watch
   ```

3. Open Chrome extension:
   - Go to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `static/extension` directory

4. Test on real job sites:
   - Greenhouse: https://job-boards.greenhouse.io/...
   - Lever: https://jobs.lever.co/...
   - BambooHR: https://...bamboohr.com/...

5. After code changes:
   - Go to `chrome://extensions`
   - Click reload icon for "Resume RAG Form Filler"
   - Refresh the job application page
   - Test "Fill Form" and "Capture Answers"

## Automated Test Coverage

- ✅ Content script loading
- ✅ Basic field filling
- ✅ Form data extraction
- ✅ Degree field simulation
- ⚠️  Extension popup (requires manual test)
- ⚠️  API integration (requires backend)

## Debugging Tips

### View extension console logs
1. Go to `chrome://extensions`
2. Click "Inspect views: service worker" for background logs
3. Open DevTools on the job page for content script logs
4. Right-click extension icon → "Inspect popup" for popup logs

### Common Issues

**"Receiving end does not exist"**
- Reload the extension at `chrome://extensions`
- Refresh the job application page

**CORS errors**
- Make sure backend is running
- Check that background.js is proxying API requests

**Form not filling**
- Check console for `[RESUME_RAG]` logs
- Verify saved answers exist in popup
- Confirm field selectors match the page structure
