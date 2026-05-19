# Resume RAG Chrome Extension

A Chrome extension that automatically fills job application forms with your resume data.

## Quick Start

### TL;DR

1. Start the backend: `uvicorn app.main:app --reload`
2. Load the extension in Chrome: `chrome://extensions/` → Load unpacked → select `static/extension/`
3. Open the extension popup on any Greenhouse form and click **Fill Form**

### Installation

1. **Start the Backend Server**

```bash
uvicorn app.main:app --reload
```

The server will be available at `http://localhost:8000`.

2. **Load the Extension in Chrome**

- Open Chrome and go to `chrome://extensions/`
- Enable **Developer mode** (top right toggle)
- Click **Load unpacked**
- Navigate to `static/extension/` and select it
- The extension icon should appear in your toolbar

3. **Upload Your Resume**

- Click the extension icon in your toolbar
- Click **+ Upload** in the popup
- Select your resume PDF or text file
- It will be processed and appear in the resume list

## Usage

### Fill a Greenhouse Form

1. Navigate to a Greenhouse job application form
2. Click the extension icon
3. Review your resume list (select which ones to use)
4. Click **Fill Form**
5. The form will be filled with your resume data

### What Gets Filled

✅ **Automatic:**
- First Name, Last Name, Email, Phone
- Location (City)
- LinkedIn checkbox
- Yes/No dropdowns
- Acknowledgement checkbox
- File inputs (Resume/CV, Cover Letter)

### Resume Management

- **Upload**: Click **+ Upload** to add new resumes
- **Reorder**: Drag resume names to change priority
- **Enable/Disable**: Check/uncheck to control which resumes are used
- **Delete**: Click **×** to remove from list (doesn't delete from backend)

The first enabled resume is always used for form filling.

## Features

- ✅ **Auto-fills text fields** (name, email, phone, location, etc.)
- ✅ **Works across iframes** (when possible)
- ✅ **Smart field matching** (recognizes common field patterns)
- ✅ **Uses latest resume** (no need to manually enter resume ID)
- ✅ **Configurable backend** (change server URL in popup)
- ✅ **Visual feedback** (highlights filled fields)
- ✅ **Multiple resume management** with drag-to-reorder
- ✅ **Resume persistence** and enable/disable
- ✅ **Server health checking** and error messages

## Limitations

- ❌ **Custom web components** (some Greenhouse dropdowns can't be filled)
- ❌ **Shadow DOM** (inaccessible from content scripts)
- ❌ **Cross-origin iframes** (security restriction)

## Architecture

- **manifest.json** - Extension metadata and permissions
- **popup.html/js** - UI for resume management and form fill coordination
- **content.js** - Script that runs on job application pages
- **background.js** - Service worker for background tasks

## Testing

### Manual Testing

1. **Setup**
   - Start backend: `uvicorn app.main:app --reload`
   - Load extension in Chrome
   - Verify you have a resume uploaded

2. **Test Steps**
   - Navigate to a Greenhouse job form (e.g., https://job-boards.greenhouse.io/embed/job_app?for=coalition)
   - Click the Resume RAG extension icon
   - Verify backend URL is `http://localhost:8000`
   - Click **"Fill Form"**

3. **Verify these fields get filled**
   - First Name: From your resume
   - Last Name: From your resume
   - Email: From your resume
   - Phone: From your resume
   - City: From your resume
   - Country: USA (selected, not text)
   - How did you hear about us?: LinkedIn (checkbox checked)

### Debugging

Open Chrome DevTools (F12) and look at the Console tab for logs prefixed with `[RESUME_RAG]`:
- `Content script loaded` - Extension active
- `Found X combobox inputs` - Dropdown detection
- `✓ Found "Target Value" at arrow N` - Successful dropdown selection
- `Form submission detected` - Form captured on submit
- `Form data saved to backend` - Data persisted successfully

## Troubleshooting

### Server Not Running?

The extension shows a helpful error message if the backend is unreachable. Make sure to start the server:

```bash
uvicorn app.main:app --reload
```

### Form Not Filling?

1. Check the browser console for logs starting with `[RESUME_RAG]`
2. Verify the server is running (`http://localhost:8000/health`)
3. Ensure your resume has been uploaded and processed
4. Try refreshing the page and clicking **Fill Form** again

### Extension not filling fields
1. Check that your Resume RAG server is running (`http://localhost:8000`)
2. Verify the backend URL in the extension popup
3. Check Chrome console for errors (right-click → Inspect → Console tab)
4. Try refreshing the page

### "Failed to fetch" error
- Make sure your Resume RAG backend is accessible
- Check firewall/CORS settings
- Verify the backend URL is correct

### Some fields won't fill
- This is expected for Greenhouse custom dropdowns
- You'll need to fill those manually
- Text fields should fill automatically

## Development

To make changes:
1. Edit the extension files in `static/extension/`
2. Go to `chrome://extensions/`
3. Click the refresh icon on the Resume RAG extension
4. Test on a job application page

### Making Changes

- **Backend changes**: Restart `uvicorn` (hot reload enabled)
- **Extension changes**: Click refresh button on extension card in `chrome://extensions/`
- **Content script changes**: Hard refresh the job form page (Cmd+Shift+R)
