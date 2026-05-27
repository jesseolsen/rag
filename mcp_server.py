#!/usr/bin/env python3
"""MCP server for job application tracking."""

import asyncio
import subprocess
import uuid
from datetime import datetime
from pathlib import Path

# load_dotenv must run before any app.* import (Settings() instantiates at import time)
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

import mcp.types as types
from mcp.server import Server
from mcp.server.stdio import stdio_server

from app.services.google_sheets import GoogleSheetsService, normalize_company_name
from app.config import settings

server = Server("job-tracker")
_sheets: GoogleSheetsService | None = None


def _get_sheets() -> GoogleSheetsService:
    global _sheets
    if _sheets is None:
        _sheets = GoogleSheetsService()
    return _sheets


def _spreadsheet_url() -> str:
    return settings.google_spreadsheet or ""


def _sheets_ok() -> bool:
    s = _get_sheets()
    return bool(s.service and _spreadsheet_url())


@server.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="list_applications",
            description="List job applications from the tracking spreadsheet with company links, job title links, Glassdoor ratings, and dates.",
            inputSchema={
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["active", "rejected", "all"],
                        "description": "'active' = not yet rejected, 'rejected' = has rejection date, 'all' = everything.",
                        "default": "active",
                    }
                },
            },
        ),
        types.Tool(
            name="apply_for_job",
            description=(
                "Open a job application URL in Chrome. "
                "The Chrome extension auto-fills the form on supported boards "
                "(Greenhouse, Lever, LinkedIn, Workday, Dice, Robert Half, etc.)."
            ),
            inputSchema={
                "type": "object",
                "properties": {"url": {"type": "string", "description": "Job application URL"}},
                "required": ["url"],
            },
        ),
        types.Tool(
            name="upload_resume",
            description="Upload a resume PDF or TXT file from the local filesystem.",
            inputSchema={
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Absolute path to the resume file (PDF or TXT)",
                    }
                },
                "required": ["file_path"],
            },
        ),
        types.Tool(
            name="list_resumes",
            description="List all uploaded resumes with their processing status and upload date.",
            inputSchema={"type": "object", "properties": {}},
        ),
        types.Tool(
            name="mark_rejected",
            description="Mark a job application as rejected in the tracking spreadsheet.",
            inputSchema={
                "type": "object",
                "properties": {
                    "company_name": {"type": "string"},
                    "job_title": {
                        "type": "string",
                        "description": "Disambiguates when applied multiple times to the same company (optional)",
                    },
                    "rejection_date": {
                        "type": "string",
                        "description": "Date as YYYY-MM-DD; defaults to today (optional)",
                    },
                },
                "required": ["company_name"],
            },
        ),
        types.Tool(
            name="get_stats",
            description="Get total, active, and rejected application counts.",
            inputSchema={"type": "object", "properties": {}},
        ),
        types.Tool(
            name="check_company",
            description="Check whether you have already applied to a company.",
            inputSchema={
                "type": "object",
                "properties": {
                    "company_name": {"type": "string"},
                    "job_id": {
                        "type": "string",
                        "description": "Job requisition ID to check for exact duplicate (optional)",
                    },
                },
                "required": ["company_name"],
            },
        ),
        types.Tool(
            name="add_application",
            description="Manually add a job to the tracking spreadsheet without applying (e.g. jobs applied via email).",
            inputSchema={
                "type": "object",
                "properties": {
                    "company_name": {"type": "string"},
                    "job_url": {"type": "string", "description": "URL of the job posting"},
                    "job_title": {"type": "string", "description": "Job title (optional)"},
                    "job_id": {"type": "string", "description": "Requisition ID (optional)"},
                },
                "required": ["company_name", "job_url"],
            },
        ),
        types.Tool(
            name="generate_cover_letter",
            description=(
                "Generate a tailored cover letter using your resume and the job description. "
                "Requires the FastAPI server to be running (uvicorn app.main:app)."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "job_description": {"type": "string"},
                    "company": {"type": "string"},
                    "job_title": {"type": "string"},
                },
                "required": ["job_description", "company", "job_title"],
            },
        ),
        types.Tool(
            name="search_saved_answers",
            description="Search your saved form field answers for a matching response to a job application question.",
            inputSchema={
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "The job application question to find an answer for",
                    }
                },
                "required": ["question"],
            },
        ),
        types.Tool(
            name="get_glassdoor_info",
            description="Get Glassdoor rating, CEO approval %, and other company info. Checks spreadsheet cache first, then scrapes Glassdoor.",
            inputSchema={
                "type": "object",
                "properties": {"company_name": {"type": "string"}},
                "required": ["company_name"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    try:
        result = await _dispatch(name, arguments)
    except Exception as e:
        result = f"Error: {e}"
    return [types.TextContent(type="text", text=str(result))]


async def _dispatch(name: str, args: dict) -> str:
    if name == "list_applications":
        return await _list_applications(args.get("status", "active"))
    if name == "apply_for_job":
        return _apply_for_job(args["url"])
    if name == "upload_resume":
        return await _upload_resume(args["file_path"])
    if name == "list_resumes":
        return await _list_resumes()
    if name == "mark_rejected":
        return _mark_rejected(args["company_name"], args.get("job_title"), args.get("rejection_date"))
    if name == "get_stats":
        return _get_stats()
    if name == "check_company":
        return _check_company(args["company_name"], args.get("job_id"))
    if name == "add_application":
        return _add_application(
            args["company_name"], args["job_url"], args.get("job_title"), args.get("job_id")
        )
    if name == "generate_cover_letter":
        return await _generate_cover_letter(
            args["job_description"], args["company"], args["job_title"]
        )
    if name == "search_saved_answers":
        return await _search_saved_answers(args["question"])
    if name == "get_glassdoor_info":
        return await _get_glassdoor_info(args["company_name"])
    return f"Unknown tool: {name}"


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------

async def _list_applications(status: str) -> str:
    if not _sheets_ok():
        return "Google Sheets not configured. Set GOOGLE_SPREADSHEET and GOOGLE_SHEETS_CREDENTIALS_FILE in .env."
    apps = _get_sheets().get_all_applications(_spreadsheet_url(), status)
    if not apps:
        label = status if status != "all" else "any"
        return f"No {label} applications found."

    lines = [f"## {status.capitalize()} Applications ({len(apps)})\n"]
    lines.append("| Company | Job Title | Applied | GD★ | CEO% | Rejected |")
    lines.append("|---------|-----------|---------|-----|------|----------|")
    for a in apps:
        company = f"[{a['company']}]({a['company_url']})" if a["company_url"] else a["company"]
        if a["job_title"] and a["job_url"]:
            job = f"[{a['job_title']}]({a['job_url']})"
        else:
            job = a["job_title"] or "—"
        lines.append(
            f"| {company} | {job} | {a['applied_date'] or '—'} "
            f"| {a['glassdoor_stars'] or '—'} | {a['ceo_pct'] or '—'} "
            f"| {a['rejection_date'] or '—'} |"
        )
    return "\n".join(lines)


def _apply_for_job(url: str) -> str:
    try:
        subprocess.Popen(["open", "-a", "Google Chrome", url])
        return (
            f"Opening {url} in Chrome. "
            "The extension will auto-fill the form on supported job boards."
        )
    except Exception as e:
        return f"Failed to open Chrome: {e}\nOpen manually: {url}"


async def _upload_resume(file_path: str) -> str:
    path = Path(file_path)
    if not path.exists():
        return f"File not found: {file_path}"
    if path.suffix.lower() not in (".pdf", ".txt"):
        return f"Only PDF and TXT files are supported (got {path.suffix})."

    content = path.read_bytes()

    try:
        from app.services.resume_processor import extract_text_from_pdf
    except ImportError as e:
        return (
            f"Resume processing unavailable (missing dependency: {e}). "
            "Use the FastAPI server endpoint /api/v1/resume/upload instead."
        )

    from sqlalchemy import select
    from app.models.database import Resume, ResumeStatus
    from app.db import AsyncSessionLocal
    from app.api.resume import process_resume_background

    if path.suffix.lower() == ".pdf":
        text_content, metadata = extract_text_from_pdf(content)
    else:
        text_content = content.decode("utf-8")
        metadata = {}

    resume_id = str(uuid.uuid4())

    async with AsyncSessionLocal() as db:
        resume = Resume(
            id=resume_id,
            filename=path.name,
            content_type="application/pdf" if path.suffix.lower() == ".pdf" else "text/plain",
            file_content=content,
            status=ResumeStatus.PENDING,
            resume_metadata=metadata,
        )
        db.add(resume)
        await db.commit()

    asyncio.create_task(process_resume_background(uuid.UUID(resume_id), text_content))

    return (
        f"Resume '{path.name}' uploaded (ID: {resume_id[:8]}…). "
        "Embedding generation started in background — use list_resumes to check when status is READY."
    )


async def _list_resumes() -> str:
    from sqlalchemy import select
    from app.models.database import Resume
    from app.db import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Resume).order_by(Resume.uploaded_at.desc()))
        resumes = result.scalars().all()

    if not resumes:
        return "No resumes uploaded yet. Use upload_resume to add one."

    lines = ["## Uploaded Resumes\n"]
    lines.append("| Filename | Status | Uploaded | ID |")
    lines.append("|----------|--------|----------|----|")
    for r in resumes:
        uploaded = r.uploaded_at.strftime("%Y-%m-%d") if r.uploaded_at else "—"
        lines.append(f"| {r.filename} | {r.status} | {uploaded} | {r.id[:8]}… |")
    return "\n".join(lines)


def _mark_rejected(
    company_name: str, job_title: str | None, rejection_date: str | None
) -> str:
    if not _sheets_ok():
        return "Google Sheets not configured."
    result = _get_sheets().mark_job_as_rejected(
        _spreadsheet_url(), company_name, job_title, rejection_date
    )
    if result.get("success"):
        title = result.get("matched_job_title") or job_title or company_name
        date = result.get("rejection_date", datetime.now().strftime("%Y-%m-%d"))
        return f"Marked '{title}' at {company_name} as rejected on {date} (row {result.get('row')})."
    return f"Failed: {result.get('message', 'unknown error')}"


def _get_stats() -> str:
    if not _sheets_ok():
        return "Google Sheets not configured."
    apps = _get_sheets().get_all_applications(_spreadsheet_url(), "all")
    total = len(apps)
    rejected = sum(1 for a in apps if a["rejection_date"])
    active = total - rejected
    companies = len({a["company"] for a in apps if a["company"]})
    return (
        f"**Job Application Stats**\n\n"
        f"Total: {total} | Active: {active} | Rejected: {rejected}\n"
        f"Unique companies: {companies}"
    )


def _check_company(company_name: str, job_id: str | None) -> str:
    if not _sheets_ok():
        return "Google Sheets not configured."
    exists, is_dup, cached_rating, cached_reviews = _get_sheets().check_job_exists(
        _spreadsheet_url(), company_name, job_id
    )
    if not exists:
        return f"No applications found for '{company_name}'."
    parts = [f"You have applied to {company_name}."]
    if is_dup:
        parts.append(f"This specific job (ID: {job_id}) is already tracked.")
    if cached_rating:
        reviews = f" ({cached_reviews} reviews)" if cached_reviews else ""
        parts.append(f"Glassdoor: {cached_rating}★{reviews}")
    return " ".join(parts)


def _add_application(
    company_name: str, job_url: str, job_title: str | None, job_id: str | None
) -> str:
    if not _sheets_ok():
        return "Google Sheets not configured."
    success = _get_sheets().add_job_application(
        _spreadsheet_url(),
        company_name,
        job_url,
        job_title=job_title,
        job_id=job_id,
        additional_data={"date": datetime.now().strftime("%Y-%m-%d")},
    )
    if success:
        title_part = f" — {job_title}" if job_title else ""
        return f"Added {company_name}{title_part} to the tracking spreadsheet."
    return "Failed to add application. Check spreadsheet URL and credentials."


async def _generate_cover_letter(job_description: str, company: str, job_title: str) -> str:
    import httpx

    base_url = f"http://localhost:{settings.app_port}"
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{base_url}/api/v1/generate/cover-letter",
                json={
                    "job_title": job_title,
                    "company": company,
                    "job_description": job_description,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("cover_letter", str(data))
    except Exception as e:
        return (
            f"Could not reach the FastAPI server at {base_url}: {e}\n\n"
            "To generate cover letters, start the server:\n"
            "  venv/bin/uvicorn app.main:app --reload"
        )


async def _search_saved_answers(question: str) -> str:
    from sqlalchemy import select
    from app.models.database import FormFieldAnswer
    from app.db import AsyncSessionLocal
    from app.api.field_answers import extract_keywords, fuzzy_match_keywords

    keywords = extract_keywords(question)

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(FormFieldAnswer))
        answers = result.scalars().all()

    if not answers:
        return "No saved answers yet. Answers are captured automatically as you fill forms with the Chrome extension."

    scored = [
        (fuzzy_match_keywords(keywords, a.question_keywords, min_matches=1), a)
        for a in answers
    ]
    top = sorted([(s, a) for s, a in scored if s > 0], key=lambda x: -x[0])[:5]

    if not top:
        return f"No saved answers matched '{question}'. Try different keywords."

    lines = [f"## Saved Answers for: \"{question}\"\n"]
    for i, (score, a) in enumerate(top, 1):
        lines.append(f"**{i}. Q:** {a.question_text}")
        lines.append(f"**A:** {a.answer_text}")
        lines.append(f"*(relevance: {score:.2f}, used {a.use_count}×)*\n")
    return "\n".join(lines)


async def _get_glassdoor_info(company_name: str) -> str:
    # Check spreadsheet cache first (fast, no network request)
    if _sheets_ok():
        apps = _get_sheets().get_all_applications(_spreadsheet_url(), "all")
        norm = normalize_company_name(company_name)
        for a in apps:
            if normalize_company_name(a["company"]) == norm and a["glassdoor_stars"]:
                parts = [f"**{a['company']}** (spreadsheet cache)"]
                parts.append(f"Rating: {a['glassdoor_stars']}★")
                if a["recommend_pct"]:
                    parts.append(f"Recommend: {a['recommend_pct']}%")
                if a["ceo_pct"]:
                    parts.append(f"CEO approval: {a['ceo_pct']}%")
                if a["employee_count"]:
                    parts.append(f"Employees: {a['employee_count']}")
                if a["median_pay"]:
                    parts.append(f"Median pay: {a['median_pay']}")
                return "\n".join(parts)

    # Fall back to live Glassdoor scrape
    try:
        from app.api.companies import get_glassdoor_rating
        data = await get_glassdoor_rating(company_name)
    except Exception as e:
        return f"Glassdoor lookup failed: {e}"

    if not data.get("found") and not data.get("glassdoor_url"):
        return f"'{company_name}' not found on Glassdoor."

    parts = [f"**{company_name}**"]
    if data.get("rating"):
        parts.append(f"Rating: {data['rating']}★")
    if data.get("review_count"):
        parts.append(f"Reviews: {data['review_count']}")
    if data.get("glassdoor_url"):
        parts.append(f"[View on Glassdoor]({data['glassdoor_url']})")
    if not data.get("found"):
        parts.append(f"Note: {data.get('error', 'could not extract full details')}")
    return "\n".join(parts)


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
