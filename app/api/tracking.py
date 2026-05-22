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
    if request.position:
        additional_data['position'] = request.position
    if request.date_applied:
        additional_data['date'] = request.date_applied
    else:
        # Auto-add today's date
        additional_data['date'] = datetime.now().strftime('%Y-%m-%d')

    if request.notes:
        additional_data['notes'] = request.notes

    # Add to spreadsheet
    success = sheets_service.add_job_application(
        spreadsheet_url=spreadsheet_url,
        company_name=request.company_name,
        job_url=request.job_url,
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
async def check_company_exists(company_name: str, auto_add: bool = False):
    """Check if a company already exists in the tracking spreadsheet.

    Args:
        company_name: Name of the company to check
        auto_add: If True and company doesn't exist, add it to the spreadsheet

    Returns:
        Dict with exists (bool), cached Glassdoor data if available, and enabled flag
    """
    # Check if Google Sheets integration is enabled
    spreadsheet_url = settings.google_spreadsheet
    if not spreadsheet_url:
        return {
            "enabled": False,
            "exists": False,
            "message": "Google Sheets integration not configured"
        }

    # Get sheets service
    sheets_service = get_sheets_service()
    if not sheets_service:
        return {
            "enabled": False,
            "exists": False,
            "message": "Google Sheets service not available"
        }

    # Get company data (includes cached Glassdoor rating if available)
    company_data = sheets_service.get_company_data(
        spreadsheet_url=spreadsheet_url,
        company_name=company_name
    )

    if company_data:
        # Company exists, return cached data
        return {
            "enabled": True,
            "exists": True,
            "company_name": company_name,
            "cached_rating": company_data.get('rating'),
            "cached_review_count": company_data.get('review_count')
        }
    elif auto_add:
        # Company doesn't exist, add it to spreadsheet
        success = sheets_service.add_job_application(
            spreadsheet_url=spreadsheet_url,
            company_name=company_name,
            job_url="",  # Will be filled when they actually apply
            additional_data={}
        )
        return {
            "enabled": True,
            "exists": False,
            "added": success,
            "company_name": company_name
        }
    else:
        # Company doesn't exist and not auto-adding
        return {
            "enabled": True,
            "exists": False,
            "company_name": company_name
        }



class GlassdoorUpdateRequest(BaseModel):
    """Request to update spreadsheet with Glassdoor data."""
    companyName: str
    rating: float
    reviewCount: Optional[int] = None
    glassdoorUrl: Optional[str] = None


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
        glassdoor_url=request.glassdoorUrl
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
