# Resume RAG Chrome Extension

A Chrome extension that automatically fills job application forms with your resume data.

## Installation

### Development Mode

1. **Download/extract the extension**
   - The extension is in `/static/extension/` folder

2. **Open Chrome Extensions page**
   - Go to: `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)

3. **Load the extension**
   - Click "Load unpacked"
   - Select the `/static/extension/` folder
   - The extension should appear in your Chrome toolbar

4. **Configure the backend URL**
   - Click the extension icon in your toolbar
   - Enter your backend URL (default: `http://localhost:8000`)
   - Make sure your Resume RAG server is running

## Usage

1. **Navigate to a job application form** (LinkedIn, Greenhouse, etc.)

2. **Click the extension icon** in your Chrome toolbar

3. **Click "Fill Form"**
   - The extension will fetch your latest resume data
   - It will fill all accessible text fields
   - Fields will highlight in yellow as they're filled

4. **Manually fill any remaining fields**
   - Some dropdown/custom fields can't be auto-filled (Greenhouse limitation)
   - These usually take ~30 seconds to fill manually

## Features

- ✅ **Auto-fills text fields** (name, email, phone, location, etc.)
- ✅ **Works across iframes** (when possible)
- ✅ **Smart field matching** (recognizes common field patterns)
- ✅ **Uses latest resume** (no need to manually enter resume ID)
- ✅ **Configurable backend** (change server URL in popup)
- ✅ **Visual feedback** (highlights filled fields)

## Limitations

- ❌ **Custom web components** (Greenhouse dropdowns can't be filled)
- ❌ **Shadow DOM** (inaccessible from content scripts)
- ❌ **Cross-origin iframes** (security restriction)
- ❌ **Checkboxes** (not yet supported)

## Architecture

- **manifest.json** - Extension metadata and permissions
- **popup.html/js** - UI for entering resume ID and backend URL
- **content.js** - Script that runs on job application pages
- **background.js** - Service worker for background tasks

## Troubleshooting

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
1. Edit the extension files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the Resume RAG extension
4. Test on a job application page

## Future Improvements

- [ ] Support for checkboxes
- [ ] Better shadow DOM penetration
- [ ] Custom field mapping UI
- [ ] Keyboard shortcut to fill (Ctrl+Shift+F)
- [ ] History of filled forms
- [ ] Multiple resume support with UI selector
