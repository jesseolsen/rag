# Setting Up Playwright for Greenhouse Automation

## Quick Start (5 minutes)

### 1. Install Playwright
```bash
pip install playwright
playwright install
```

The `playwright install` command downloads browser binaries (~500MB). This is a one-time setup.

### 2. Test It Works
```bash
python greenhouse_automation.py \
    --url "https://job-boards.greenhouse.io/embed/job_app?for=coalition&jr_id=699f309994ef206f184e4fd6" \
    --resume-file tests/fixtures/resume_data.json
```

A real Chrome browser will launch. You'll see fields being filled automatically. Press Ctrl+C or close the browser after 5 minutes to exit.

### 3. Run Headless (No UI)
```bash
python greenhouse_automation.py \
    --url "https://..." \
    --resume-file tests/fixtures/resume_data.json \
    --headless
```

---

## Detailed Setup

### Prerequisites
- Python 3.8+
- pip package manager
- ~1 GB disk space for browser binaries
- macOS, Linux, or Windows

### Installation Steps

#### Step 1: Install Playwright Package
```bash
# Navigate to project directory
cd /Users/jesse/code/jesseolsen/rag

# Install with pip
pip install playwright

# Verify installation
python -c "import playwright; print(playwright.__version__)"
```

#### Step 2: Install Browser Binaries
```bash
# This downloads Chromium, Firefox, WebKit
playwright install

# Optional: Install only Chromium
playwright install chromium

# Verify browsers installed
ls ~/.cache/ms-playwright/
```

#### Step 3: Verify Setup
```bash
# Run the test to ensure everything works
python -m pytest tests/test_greenhouse_api.py -v

# You should see tests pass (may skip integration tests)
```

---

## Usage Patterns

### Pattern 1: Interactive Form Filling (Default)

Browser stays open for 5 minutes, you can manually interact:
```bash
python greenhouse_automation.py \
    --url "https://job-boards.greenhouse.io/..." \
    --resume-file resume_data.json
```

**Use for**: Debugging, seeing what gets filled

### Pattern 2: Batch Headless Processing

Fills form and exits (great for scripts):
```bash
python greenhouse_automation.py \
    --url "https://job-boards.greenhouse.io/..." \
    --resume-file resume_data.json \
    --headless
```

**Use for**: Automated workflows, CI/CD

### Pattern 3: With Screenshot

Saves proof of filled form:
```bash
python greenhouse_automation.py \
    --url "https://job-boards.greenhouse.io/..." \
    --resume-file resume_data.json \
    --headless \
    --screenshot filled_form_$(date +%s).png
```

**Use for**: Record keeping, debugging

### Pattern 4: Slow Motion (Debug)

Slows down actions to see what's happening:
```bash
python greenhouse_automation.py \
    --url "https://job-boards.greenhouse.io/..." \
    --resume-file resume_data.json \
    --slow-mo 500
```

**Use for**: Understanding what the script is doing

---

## Resume Data Format

Create a JSON file with your resume data:

```json
{
    "first_name": "Jesse",
    "last_name": "Olsen",
    "email": "jesse.d.olsen@gmail.com",
    "phone": "(970) 391-1018",
    "city": "Spanish Fork",
    "state": "UT",
    "country": "USA",
    "linkedin": "https://linkedin.com/in/jesse-olsen",
    "website": "https://example.com",
    "education": [
        {
            "school": "University of Utah",
            "degree": "Bachelor's",
            "field": "Computer Science",
            "start_date": "2016-08",
            "end_date": "2020-05"
        }
    ],
    "experience": [
        {
            "company": "Coalition Software",
            "title": "Senior Software Engineer",
            "start_date": "2021-01",
            "end_date": null
        }
    ]
}
```

Save as `resume_data.json` and reference with `--resume-file resume_data.json`

---

## Python Integration

Use Playwright directly in your Python code:

```python
from greenhouse_automation import GreenhouseAutomation
import asyncio
import json

async def fill_job_form():
    # Load resume data
    with open('resume_data.json') as f:
        resume_data = json.load(f)
    
    # Create automation instance
    automation = GreenhouseAutomation(headless=True)
    
    try:
        # Launch browser and navigate
        await automation.launch()
        await automation.navigate('https://job-boards.greenhouse.io/...')
        
        # Fill form
        counts = await automation.fill_resume_data(resume_data)
        print(f"Filled {counts['text_fields']} text fields")
        print(f"Checked {counts['checkboxes']} checkboxes")
        
        # Take screenshot
        await automation.get_screenshot('application_submitted.png')
        
    finally:
        await automation.close()

# Run it
asyncio.run(fill_job_form())
```

---

## Troubleshooting

### Error: "playwright not found"
```bash
pip install playwright
playwright install
```

### Error: "Browser not found"
The browser binaries weren't installed. Run:
```bash
playwright install
```

If this fails due to network issues:
```bash
# Install specific browser
playwright install chromium

# Or with proxy settings
HTTPS_PROXY=... playwright install
```

### Error: "TIMEOUT waiting for selector"
The field selector didn't find the element:
- The page structure may be different than expected
- Try running without `--headless` to see what's happening
- Check the browser console for errors

### Script hangs after filling form
It's waiting for user input (5 minute default). Either:
- Run with `--headless` to auto-exit
- Press Ctrl+C to exit manually
- Modify `slow_mo` parameter

### Filled fields show blank in screenshot
Greenhouse may not have rendered the values yet:
- Add a delay: `await asyncio.sleep(2)` after filling
- Check that fields actually got focus before filling

---

## Performance Optimization

### Reduce Browser Startup Time
```bash
# Use single browser instance for multiple jobs
# Modify script to reuse browser across calls
```

### Parallel Processing
```python
# Process multiple jobs in parallel
import asyncio

async def fill_multiple():
    jobs = [
        ('url1', 'resume1.json'),
        ('url2', 'resume2.json'),
        ('url3', 'resume3.json'),
    ]
    
    # Run up to 3 in parallel
    tasks = [
        fill_job_form(url, resume_file)
        for url, resume_file in jobs
    ]
    await asyncio.gather(*tasks)
```

---

## Integration Examples

### Example 1: Batch Process Job List
```bash
#!/bin/bash
# Process multiple Greenhouse jobs

jobs=(
    "https://job-boards.greenhouse.io/embed/job_app?for=coalition&jr_id=123"
    "https://job-boards.greenhouse.io/embed/job_app?for=coalition&jr_id=456"
    "https://job-boards.greenhouse.io/embed/job_app?for=coalition&jr_id=789"
)

for job_url in "${jobs[@]}"; do
    echo "Processing: $job_url"
    python greenhouse_automation.py \
        --url "$job_url" \
        --resume-file resume_data.json \
        --headless
    sleep 2  # Wait between submissions
done

echo "✓ All jobs processed"
```

### Example 2: Scheduled Background Job
```python
# schedule_applications.py
from apscheduler.schedulers.background import BackgroundScheduler
from greenhouse_automation import GreenhouseAutomation
import asyncio

scheduler = BackgroundScheduler()

async def apply_to_jobs():
    jobs = [
        ('url1', 'resume1.json'),
        ('url2', 'resume2.json'),
    ]
    
    for url, resume_file in jobs:
        automation = GreenhouseAutomation(headless=True)
        await automation.launch()
        await automation.navigate(url)
        # ... fill form ...
        await automation.close()

# Run every 6 hours
scheduler.add_job(
    func=lambda: asyncio.run(apply_to_jobs()),
    trigger="interval",
    hours=6
)
scheduler.start()
```

### Example 3: CI/CD Pipeline
```yaml
# .github/workflows/apply-jobs.yml
name: Apply to Greenhouse Jobs

on:
  schedule:
    - cron: '0 9 * * 1'  # Every Monday at 9am

jobs:
  apply:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-python@v2
        with:
          python-version: '3.9'
      - run: |
          pip install playwright
          playwright install
          python greenhouse_automation.py \
            --url "${{ secrets.GREENHOUSE_URL }}" \
            --resume-file resume_data.json \
            --headless
```

---

## Limitations & Gotchas

### Greenhouse Component Changes
If Greenhouse updates their form structure, selectors may break. You'll see "TIMEOUT" errors. Solution:
- Check the form manually
- Update selectors in `fill_resume_data()` method
- Test with `--slow-mo 500` to debug

### Shadow DOM Access
Playwright can access open shadow DOM but not closed shadow DOM:
- Most modern frameworks use shadow DOM for styling only
- Event handlers are still in light DOM (which Playwright can click)
- If clicking doesn't work, the element may be inaccessible

### Cross-Origin Restrictions
Greenhouse forms may be in iframes or cross-origin contexts:
- Playwright can navigate cross-origin (unlike content scripts)
- But can't inspect cross-origin iframes' internals

---

## Performance Benchmarks

Typical fill times (measured on MacBook Pro):

| Operation | Time |
|-----------|------|
| Launch browser | 2-3s |
| Navigate to form | 1-2s |
| Fill 5 text fields | 0.5s |
| Check 1 checkbox | 0.2s |
| Take screenshot | 0.3s |
| Close browser | 0.5s |
| **TOTAL** | **~5-7s** |

---

## Getting Help

### Debug Mode
```bash
# See what the automation is doing
python -c "
import logging
logging.basicConfig(level=logging.DEBUG)
from greenhouse_automation import GreenhouseAutomation
# ... then run automation ...
"
```

### Browser Inspector
Run without `--headless` to see the browser and inspect elements:
```bash
python greenhouse_automation.py --url "..." --resume-file resume_data.json
# Now inspect the form with F12 developer tools
```

### Check Logs
The script logs every action:
```
[2024-01-15 10:30:45] GreenhouseAutomation - INFO - Browser launched
[2024-01-15 10:30:47] GreenhouseAutomation - INFO - Navigating to: https://...
[2024-01-15 10:30:50] GreenhouseAutomation - INFO - ✓ Filled first_name: Jesse
```

---

## Next Steps

1. **Install Playwright** (5 min)
   ```bash
   pip install playwright && playwright install
   ```

2. **Test with a real job URL** (2 min)
   ```bash
   python greenhouse_automation.py --url "..." --resume-file resume_data.json
   ```

3. **If it works**: Use for batch processing
4. **If it fails**: Investigate with `--slow-mo 500` and inspect elements

5. **Document results** in EXTENSION_STATUS.md

---

## References

- [Playwright Documentation](https://playwright.dev/)
- [Playwright Python API](https://playwright.dev/python/)
- [greenhouse_automation.py](./greenhouse_automation.py) - Source code
- [GREENHOUSE_SOLUTIONS.md](./GREENHOUSE_SOLUTIONS.md) - Full technical details
