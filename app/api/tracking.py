"""API endpoints for tracking job applications."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import os
from datetime import datetime

from app.services.google_sheets import get_sheets_service
from app.config import settings


router = APIRouter(prefix="/api/v1/tracking", tags=["tracking"])


class JobApplicationRequest(BaseModel):
    """Request to track a job application."""
    company_name: str
    job_url: str
    job_title: Optional[str] = None
    job_id: Optional[str] = None
    position: Optional[str] = None
    date_applied: Optional[str] = None
    notes: Optional[str] = None


class JobApplicationResponse(BaseModel):
    """Response after tracking a job application."""
    success: bool
    message: str
    company_name: str
    job_url: str


@router.post("/job-application", response_model=JobApplicationResponse)
async def track_job_application(request: JobApplicationRequest):
    """Track a job application by adding it to Google Sheets.

    This endpoint is called when a job application form is submitted.
    It adds a row to the configured Google Spreadsheet with the company name
    and a link to the job application page.

    Requires:
        - GOOGLE_SPREADSHEET env variable with the spreadsheet URL
        - GOOGLE_SHEETS_CREDENTIALS_FILE env variable with path to service account JSON
    """
    # Check if Google Sheets integration is enabled
    spreadsheet_url = settings.google_spreadsheet
    if not spreadsheet_url:
        return JobApplicationResponse(
            success=False,
            message="Google Sheets integration not configured (GOOGLE_SPREADSHEET env var not set)",
            company_name=request.company_name,
            job_url=request.job_url
        )

    # Get sheets service
    sheets_service = get_sheets_service()
    if not sheets_service:
        return JobApplicationResponse(
            success=False,
            message="Google Sheets service not available. Check GOOGLE_SHEETS_CREDENTIALS_FILE.",
            company_name=request.company_name,
            job_url=request.job_url
        )

    # Build additional data
    additional_data = {}
    if request.date_applied:
        additional_data['date'] = request.date_applied
    else:
        # Auto-add today's date
        additional_data['date'] = datetime.now().strftime('%Y-%m-%d')

    if request.notes:
        additional_data['notes'] = request.notes

    # Add to spreadsheet with job title and job ID
    success = sheets_service.add_job_application(
        spreadsheet_url=spreadsheet_url,
        company_name=request.company_name,
        job_url=request.job_url,
        job_title=request.job_title or request.position,  # Use job_title, fallback to position
        job_id=request.job_id,
        additional_data=additional_data
    )

    if success:
        return JobApplicationResponse(
            success=True,
            message=f"Successfully tracked application to {request.company_name}",
            company_name=request.company_name,
            job_url=request.job_url
        )
    else:
        return JobApplicationResponse(
            success=False,
            message="Failed to add to Google Sheets. Check server logs.",
            company_name=request.company_name,
            job_url=request.job_url
        )


@router.get("/status")
async def get_tracking_status():
    """Get the status of Google Sheets tracking integration."""
    spreadsheet_url = settings.google_spreadsheet
    credentials_file = settings.google_sheets_credentials_file

    sheets_service = get_sheets_service()

    return {
        "enabled": bool(spreadsheet_url and sheets_service),
        "spreadsheet_configured": bool(spreadsheet_url),
        "credentials_configured": bool(credentials_file and os.path.exists(credentials_file or '')),
        "service_initialized": bool(sheets_service),
        "spreadsheet_url": spreadsheet_url if spreadsheet_url else None
    }


@router.get("/check-company")
async def check_company_exists(
    company_name: str,
    job_id: Optional[str] = None,
    job_title: Optional[str] = None,
    job_url: Optional[str] = None,
    auto_add: bool = False
):
    """Check if a company/job already exists in the tracking spreadsheet.

    Args:
        company_name: Name of the company to check
        job_id: Optional job ID to check for duplicate jobs
        auto_add: If True and job doesn't exist, add it to the spreadsheet

    Returns:
        Dict with:
        - exists (bool): Whether company exists
        - is_duplicate_job (bool): Whether this specific job ID already exists
        - cached Glassdoor data if available
        - enabled flag
    """
    # Check if Google Sheets integration is enabled
    spreadsheet_url = settings.google_spreadsheet
    if not spreadsheet_url:
        return {
            "enabled": False,
            "exists": False,
            "is_duplicate_job": False,
            "message": "Google Sheets integration not configured"
        }

    # Get sheets service
    sheets_service = get_sheets_service()
    if not sheets_service:
        return {
            "enabled": False,
            "exists": False,
            "is_duplicate_job": False,
            "message": "Google Sheets service not available"
        }

    # Check if job exists (checks both company and job ID)
    job_check = sheets_service.check_job_exists(
        spreadsheet_url=spreadsheet_url,
        company_name=company_name,
        job_id=job_id
    )

    if job_check['is_duplicate_job']:
        # This exact job already exists (same company + job ID)
        return {
            "enabled": True,
            "exists": True,
            "is_duplicate_job": True,
            "company_name": company_name,
            "job_id": job_id,
            "cached_rating": job_check.get('cached_rating'),
            "cached_review_count": job_check.get('cached_review_count')
        }
    elif job_check['exists']:
        # Company exists but this is a new job
        if auto_add:
            # Add the new job (will copy Glassdoor data from existing company row)
            # NOTE: Applied date is left empty - will be filled when user actually applies
            success = sheets_service.add_job_application(
                spreadsheet_url=spreadsheet_url,
                company_name=company_name,
                job_url=job_url or "",
                job_title=job_title,
                job_id=job_id,
                additional_data={}
            )
            return {
                "enabled": True,
                "exists": True,
                "is_duplicate_job": False,
                "added": success,
                "company_name": company_name,
                "job_id": job_id,
                "cached_rating": job_check.get('cached_rating'),
                "cached_review_count": job_check.get('cached_review_count')
            }
        else:
            return {
                "enabled": True,
                "exists": True,
                "is_duplicate_job": False,
                "company_name": company_name,
                "job_id": job_id,
                "cached_rating": job_check.get('cached_rating'),
                "cached_review_count": job_check.get('cached_review_count')
            }
    else:
        # Company doesn't exist at all
        if auto_add:
            # Add the company with this job
            # NOTE: Applied date is left empty - will be filled when user actually applies
            success = sheets_service.add_job_application(
                spreadsheet_url=spreadsheet_url,
                company_name=company_name,
                job_url=job_url or "",
                job_title=job_title,
                job_id=job_id,
                additional_data={}
            )
            return {
                "enabled": True,
                "exists": False,
                "is_duplicate_job": False,
                "added": success,
                "company_name": company_name,
                "job_id": job_id
            }
        else:
            return {
                "enabled": True,
                "exists": False,
                "is_duplicate_job": False,
                "company_name": company_name,
                "job_id": job_id
            }



class GlassdoorUpdateRequest(BaseModel):
    """Request to update spreadsheet with Glassdoor data."""
    companyName: str
    rating: Optional[float] = None
    reviewCount: Optional[int] = None
    glassdoorUrl: Optional[str] = None
    recommendPct: Optional[int] = None
    ceoPct: Optional[int] = None
    medianPay: Optional[str] = None
    employeeCount: Optional[str] = None


@router.post("/update-glassdoor")
async def update_glassdoor_data(request: GlassdoorUpdateRequest):
    """Update spreadsheet with Glassdoor rating data.

    This endpoint is called when the extension detects the user is viewing
    a company's Glassdoor page. It updates the corresponding row in the
    spreadsheet with the rating and review count.

    Args:
        request: Glassdoor data including company name, rating, review count

    Returns:
        Dict with updated (bool) and details about what was updated
    """
    # Check if Google Sheets integration is enabled
    spreadsheet_url = settings.google_spreadsheet
    if not spreadsheet_url:
        return {
            "updated": False,
            "message": "Google Sheets integration not configured"
        }

    # Get sheets service
    sheets_service = get_sheets_service()
    if not sheets_service:
        return {
            "updated": False,
            "message": "Google Sheets service not available"
        }

    # Update the spreadsheet with Glassdoor data
    success = sheets_service.update_glassdoor_data(
        spreadsheet_url=spreadsheet_url,
        company_name=request.companyName,
        rating=request.rating,
        review_count=request.reviewCount,
        glassdoor_url=request.glassdoorUrl,
        recommend_pct=request.recommendPct,
        ceo_pct=request.ceoPct,
        median_pay=request.medianPay,
        employee_count=request.employeeCount
    )

    if success:
        return {
            "updated": True,
            "message": f"Updated {request.companyName} with rating {request.rating}",
            "company_name": request.companyName,
            "rating": request.rating,
            "review_count": request.reviewCount
        }
    else:
        return {
            "updated": False,
            "message": f"Company {request.companyName} not found in spreadsheet or update failed"
        }


class RejectionRequest(BaseModel):
    """Request to mark a job application as rejected."""
    companyName: str
    jobTitle: Optional[str] = None
    rejectionDate: Optional[str] = None  # YYYY-MM-DD; defaults to today


@router.post("/mark-rejected")
async def mark_job_rejected(request: RejectionRequest):
    """Mark a job application as rejected by writing into the Rejection Date column.

    Called by the extension when it detects a rejection email in Gmail.
    Matches by company + (optional) job title and falls back to the most-recent
    applied row without a rejection date.
    """
    spreadsheet_url = settings.google_spreadsheet
    if not spreadsheet_url:
        return {"updated": False, "message": "Google Sheets integration not configured"}

    sheets_service = get_sheets_service()
    if not sheets_service:
        return {"updated": False, "message": "Google Sheets service not available"}

    result = sheets_service.mark_job_as_rejected(
        spreadsheet_url=spreadsheet_url,
        company_name=request.companyName,
        job_title=request.jobTitle,
        rejection_date=request.rejectionDate,
    )

    return {
        "updated": result.get('success', False),
        "message": result.get('message', ''),
        "company_name": request.companyName,
        "job_title": result.get('matched_job_title'),
        "rejection_date": result.get('rejection_date'),
        "row": result.get('row'),
    }


class ConsolidateRequest(BaseModel):
    """Request to consolidate duplicate rows for a company."""
    companyName: str


@router.post("/consolidate-company")
async def consolidate_company(request: ConsolidateRequest):
    """Merge all rows for the given company into a single best row.

    The match is fuzzy and suffix-insensitive (so 'DynPro' and 'DynPro Inc.'
    are merged). The keeper row is the one with the most non-empty cells; the
    others are deleted. Destructive — deletes rows from the spreadsheet.
    """
    spreadsheet_url = settings.google_spreadsheet
    if not spreadsheet_url:
        return {"success": False, "message": "Google Sheets integration not configured"}

    sheets_service = get_sheets_service()
    if not sheets_service:
        return {"success": False, "message": "Google Sheets service not available"}

    result = sheets_service.consolidate_company_rows(
        spreadsheet_url=spreadsheet_url,
        company_name=request.companyName,
    )
    return result
