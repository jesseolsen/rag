# Job Application Form Filler Bookmarklet

## Overview

The bookmarklet is a simple JavaScript snippet that you save in your browser's bookmarks. When you click it on any job application page, it automatically detects and fills form fields with your resume data.

## How It Works

1. **Extract Resume Data**: The bookmarklet fetches your resume from the RAG backend, which parses it to extract:
   - Name, email, phone, location
   - Professional summary
   - Skills list
   - Work experience
   - Education
   - Projects

2. **Intelligent Field Matching**: It scans the page for form fields and matches them using pattern recognition:
   - Matches field names (e.g., `name="email"`)
   - Matches field IDs (e.g., `id="full_name"`)
   - Matches field labels (e.g., `<label>Email Address</label>`)
   - Matches ARIA labels (accessibility attributes)

3. **Auto-Fill**: For each matched field:
   - Text inputs get the corresponding value
   - Textareas get multi-line content (experience, summary, etc.)
   - Select dropdowns get option matching
   - Filled fields highlight in yellow briefly

## Installation

### Option 1: Copy-Paste (Easiest)

1. Upload your resume in the app's "Upload Resume" tab
2. Go to the "Form Filler" tab
3. Copy the entire JavaScript code shown
4. Create a new bookmark in your browser:
   - Chrome: `Ctrl+D` (Windows) or `Cmd+D` (Mac)
   - Firefox: `Ctrl+D` (Windows) or `Cmd+D` (Mac)
5. Name it something like "📋 Fill Job Form"
6. Paste the entire code into the URL field
7. Save

### Option 2: Drag-to-Bookmarks (If Your Browser Supports It)

1. Upload your resume
2. Go to the "Form Filler" tab
3. Drag the "📋 Fill Job Form" button to your bookmarks bar

## Usage

1. Navigate to a job application page
2. Click your "Fill Job Form" bookmarklet
3. On first use, you'll be prompted to enter your resume ID (shows in the Form Filler tab)
4. The bookmarklet will:
   - Fetch your resume data
   - Scan the page for form fields
   - Fill in matching fields
   - Show you how many fields were matched

## Switching Resumes

To use a different resume:

1. Open your browser's developer console (`F12`)
2. Run: `localStorage.removeItem('job_app_resume_id')`
3. Next time you use the bookmarklet, it will ask for the new resume ID

Or simply upload a new resume and copy its ID from the Form Filler tab.

## Limitations

- **Cross-Origin Restrictions**: The bookmarklet only works when your RAG backend is running on `localhost:8000`. For production, you'd need to update the `BACKEND_URL` in the bookmarklet.
- **Complex Forms**: Some job sites use:
  - iframes (sandboxed, not accessible)
  - Shadow DOM (modern web components)
  - Complex JavaScript frameworks that replace the DOM
  - These won't be fillable via bookmarklet
- **Field Matching**: The pattern matching is best-effort. Some oddly-named fields might not match.

## Advanced: Customization

The bookmarklet source is in `static/form-filler.js`. You can modify:

- **Field patterns**: Add more regex patterns in the `fieldMatchers` object
- **Backend URL**: Change `BACKEND_URL` to point to a different server
- **Matching strategy**: Modify how fields are identified and matched
- **Visual feedback**: Change the highlight color from `#ffffcc` (yellow)

## Testing

A test form is available at `http://localhost:8000/static/test-form.html` for testing the bookmarklet without visiting external job sites.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Resume not found" | Make sure you've uploaded a resume and it shows as "ready" |
| "Failed to fetch resume data" | Check that the backend is running on `localhost:8000` |
| Very few fields filled | The job site likely uses a custom framework. Try manual entry. |
| "Resume ID is required" | Copy your resume ID from the Form Filler tab |
| Fields not saving after fill | Some job sites have custom change handlers. Manual entry might be needed. |

## Future Improvements

- Support for radio buttons and checkboxes
- AI-powered field matching (using Claude API)
- Cover letter auto-fill
- Chrome extension version with cross-domain support
- Support for custom backend servers
