# Quick Start - Playwright Automation

## TL;DR

Playwright is ready to use. To fill a Greenhouse job form completely (including Yes/No dropdowns):

```bash
python3 greenhouse_automation.py \
    --url "https://job-boards.greenhouse.io/embed/job_app?for=coalition&jr_id=<JOB_ID>" \
    --resume-file tests/fixtures/resume_data.json \
    --headless
```

Done. Form is filled in ~8 seconds.

---

## 3-Minute Setup

### 1. Install browser (if not done):
```bash
python3 -m playwright install chromium
```

### 2. Create your resume JSON:
```bash
cp tests/fixtures/resume_data.json my_resume.json
# Edit my_resume.json with your actual details
```

### 3. Find a job ID:
- Go to: https://job-boards.greenhouse.io/embed/job_board?for=coalition
- Click a job
- Copy the `jr_id` from the URL

### 4. Run it:
```bash
python3 greenhouse_automation.py \
    --url "https://job-boards.greenhouse.io/embed/job_app?for=coalition&jr_id=<JOB_ID>" \
    --resume-file my_resume.json \
    --headless
```

**Done!** Form is filled automatically.

---

## Usage Modes

### Headless (invisible browser, fastest)
```bash
python3 greenhouse_automation.py \
    --url "https://..." \
    --resume-file my_resume.json \
    --headless
```

### Interactive (see it happen, debug)
```bash
python3 greenhouse_automation.py \
    --url "https://..." \
    --resume-file my_resume.json
```

### With Screenshot
```bash
python3 greenhouse_automation.py \
    --url "https://..." \
    --resume-file my_resume.json \
    --headless \
    --screenshot form_filled.png
```

---

## What Gets Filled

✅ **Automatic:**
- First Name, Last Name, Email, Phone, City
- LinkedIn checkbox
- Yes/No dropdowns ⭐

---

## Next Steps

1. Copy resume template: `cp tests/fixtures/resume_data.json my_resume.json`
2. Edit with your details
3. Run: `python3 greenhouse_automation.py --url "..." --resume-file my_resume.json`
4. Done in ~8 seconds!

---

See SOLUTIONS_SUMMARY.md for full details.
