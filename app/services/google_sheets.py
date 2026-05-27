"""Google Sheets integration service for tracking job applications."""

import os
import re
from typing import Optional
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.config import settings


# Common corporate suffixes that should be ignored when comparing company names.
# Order matters: longer/multi-word forms first so "limited liability company" is
# stripped before "company".
_COMPANY_SUFFIX_RE = re.compile(
    r'\b(?:incorporated|corporation|company|limited|holdings?|group|'
    r'inc|llc|ltd|corp|co|plc|gmbh|ag|sa|nv|bv|kk|pty)\b\.?',
    re.IGNORECASE,
)


def normalize_company_name(name: str) -> str:
    """Normalize a company name for fuzzy matching.

    Strips case, whitespace, punctuation, AND common corporate suffixes so that
    'DynPro' and 'DynPro Inc.' compare equal. Use everywhere we match company
    names across rows.
    """
    if not name:
        return ''
    s = name.lower().strip()
    # Strip suffixes repeatedly in case there are multiple (e.g. "Foo Holdings Inc")
    prev = None
    while prev != s:
        prev = s
        s = _COMPANY_SUFFIX_RE.sub('', s).strip(' .,;:-')
    return re.sub(r'[^a-z0-9]', '', s)


def _extract_hyperlink_text(cell_value: str) -> str:
    """Extract the display text from a =HYPERLINK("url", "text") formula, or
    return the cell value unchanged if it isn't a hyperlink formula."""
    if isinstance(cell_value, str) and cell_value.startswith('=HYPERLINK'):
        m = re.search(r'"([^"]*)"[^"]*$', cell_value)
        return m.group(1) if m else ''
    return cell_value or ''


def _extract_hyperlink_url(cell_value: str) -> str:
    """Extract the URL from a =HYPERLINK("url", "text") formula, or return ''."""
    if isinstance(cell_value, str) and cell_value.startswith('=HYPERLINK'):
        m = re.search(r'=HYPERLINK\("([^"]*)"', cell_value)
        return m.group(1) if m else ''
    return ''


class GoogleSheetsService:
    """Service for interacting with Google Sheets API."""

    def __init__(self, credentials_file: Optional[str] = None):
        """Initialize Google Sheets service.

        Args:
            credentials_file: Path to service account JSON credentials file.
                            If None, will look for credentials from settings.
        """
        self.credentials_file = credentials_file or settings.google_sheets_credentials_file
        self.service = None

        if self.credentials_file and os.path.exists(self.credentials_file):
            self._initialize_service()

    def _initialize_service(self):
        """Initialize Google Sheets API service with credentials."""
        try:
            SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
            credentials = service_account.Credentials.from_service_account_file(
                self.credentials_file, scopes=SCOPES
            )
            self.service = build('sheets', 'v4', credentials=credentials)
        except Exception as e:
            print(f"[GOOGLE_SHEETS] Failed to initialize service: {e}")
            self.service = None

    def extract_spreadsheet_id(self, url: str) -> Optional[str]:
        """Extract spreadsheet ID from Google Sheets URL.

        Args:
            url: Google Sheets URL

        Returns:
            Spreadsheet ID or None if not found
        """
        # Pattern: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/...
        match = re.search(r'/spreadsheets/d/([a-zA-Z0-9-_]+)', url)
        if match:
            return match.group(1)
        return None

    def extract_gid(self, url: str) -> Optional[str]:
        """Extract gid (sheet ID) from Google Sheets URL.

        Args:
            url: Google Sheets URL

        Returns:
            Sheet gid or None if not found
        """
        # Pattern: gid=123456
        match = re.search(r'gid=(\d+)', url)
        if match:
            return match.group(1)
        return None

    def get_sheet_name_from_gid(self, spreadsheet_id: str, gid: str) -> Optional[str]:
        """Get sheet name from gid.

        Args:
            spreadsheet_id: The spreadsheet ID
            gid: The sheet gid

        Returns:
            Sheet name or None if not found
        """
        if not self.service:
            return None

        try:
            spreadsheet = self.service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
            sheets = spreadsheet.get('sheets', [])

            for sheet in sheets:
                if str(sheet['properties']['sheetId']) == str(gid):
                    return sheet['properties']['title']

            # If no gid match, return first sheet
            if sheets:
                return sheets[0]['properties']['title']
        except HttpError as e:
            print(f"[GOOGLE_SHEETS] Error getting sheet name: {e}")

        return None

    def get_company_data(
        self,
        spreadsheet_url: str,
        company_name: str
    ) -> Optional[dict]:
        """Get company data from spreadsheet including Glassdoor rating.

        Args:
            spreadsheet_url: The Google Sheets URL
            company_name: Name of the company to search for

        Returns:
            Dict with company data (rating, review_count) or None if not found
        """
        if not self.service:
            print("[GOOGLE_SHEETS] Service not initialized. Check credentials file.")
            return None

        spreadsheet_id = self.extract_spreadsheet_id(spreadsheet_url)
        if not spreadsheet_id:
            print(f"[GOOGLE_SHEETS] Could not extract spreadsheet ID from URL: {spreadsheet_url}")
            return None

        # Get sheet name from gid or use first sheet
        gid = self.extract_gid(spreadsheet_url)
        sheet_name = self.get_sheet_name_from_gid(spreadsheet_id, gid) if gid else None

        if not sheet_name:
            # Default to first sheet
            try:
                spreadsheet = self.service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
                sheets = spreadsheet.get('sheets', [])
                if sheets:
                    sheet_name = sheets[0]['properties']['title']
                else:
                    print("[GOOGLE_SHEETS] No sheets found in spreadsheet")
                    return None
            except HttpError as e:
                print(f"[GOOGLE_SHEETS] Error getting spreadsheet info: {e}")
                return None

        try:
            # Read all values from columns A-G
            result = self.service.spreadsheets().values().get(
                spreadsheetId=spreadsheet_id,
                range=f'{sheet_name}!A:G'
            ).execute()

            values = result.get('values', [])

            # Search for company name in the first column
            company_name_lower = company_name.lower().strip()

            for row in values:
                if not row:
                    continue

                cell_value = row[0] if len(row) > 0 else ''

                # Extract text from HYPERLINK formula if present
                company_text = None
                if isinstance(cell_value, str):
                    if cell_value.startswith('=HYPERLINK'):
                        match = re.search(r'"([^"]*)"[^"]*$', cell_value)
                        if match:
                            company_text = match.group(1)
                    else:
                        company_text = cell_value

                    if company_text and company_text.lower().strip() == company_name_lower:
                        # Found the company! Extract Glassdoor data if present
                        rating = None
                        review_count = None

                        # Column C (index 2) = Glassdoor Stars (5)
                        if len(row) > 2 and row[2]:
                            try:
                                rating = float(row[2])
                            except (ValueError, TypeError):
                                pass

                        # Review count not stored in spreadsheet currently
                        # Could be extracted from Glassdoor page if needed

                        return {
                            'exists': True,
                            'rating': rating,
                            'review_count': review_count
                        }

            return None

        except HttpError as e:
            print(f"[GOOGLE_SHEETS] Error reading spreadsheet: {e}")
            return None

    def check_company_exists(
        self,
        spreadsheet_url: str,
        company_name: str
    ) -> bool:
        """Check if a company name exists in the first column of the spreadsheet.

        Args:
            spreadsheet_url: The Google Sheets URL
            company_name: Name of the company to search for

        Returns:
            True if company exists, False otherwise
        """
        if not self.service:
            print("[GOOGLE_SHEETS] Service not initialized. Check credentials file.")
            return False

        spreadsheet_id = self.extract_spreadsheet_id(spreadsheet_url)
        if not spreadsheet_id:
            print(f"[GOOGLE_SHEETS] Could not extract spreadsheet ID from URL: {spreadsheet_url}")
            return False

        # Get sheet name from gid or use first sheet
        gid = self.extract_gid(spreadsheet_url)
        sheet_name = self.get_sheet_name_from_gid(spreadsheet_id, gid) if gid else None

        if not sheet_name:
            # Default to first sheet
            try:
                spreadsheet = self.service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
                sheets = spreadsheet.get('sheets', [])
                if sheets:
                    sheet_name = sheets[0]['properties']['title']
                else:
                    print("[GOOGLE_SHEETS] No sheets found in spreadsheet")
                    return False
            except HttpError as e:
                print(f"[GOOGLE_SHEETS] Error getting spreadsheet info: {e}")
                return False

        try:
            # Read all values from column A (first column)
            result = self.service.spreadsheets().values().get(
                spreadsheetId=spreadsheet_id,
                range=f'{sheet_name}!A:A'
            ).execute()

            values = result.get('values', [])

            # Search for company name in the first column
            # The first column contains HYPERLINK formulas, so we need to check the display text
            company_name_lower = company_name.lower().strip()

            for row in values:
                if row:  # Skip empty rows
                    cell_value = row[0]
                    # Extract text from HYPERLINK formula if present
                    # Format: =HYPERLINK("url", "Company Name")
                    if isinstance(cell_value, str):
                        if cell_value.startswith('=HYPERLINK'):
                            # Extract the display text from the formula
                            match = re.search(r'"([^"]*)"[^"]*$', cell_value)
                            if match:
                                display_text = match.group(1)
                                if display_text.lower().strip() == company_name_lower:
                                    return True
                        else:
                            # Plain text comparison
                            if cell_value.lower().strip() == company_name_lower:
                                return True

            return False

        except HttpError as e:
            print(f"[GOOGLE_SHEETS] Error reading spreadsheet: {e}")
            return False

    def update_glassdoor_data(
        self,
        spreadsheet_url: str,
        company_name: str,
        rating: Optional[float] = None,
        review_count: Optional[int] = None,
        glassdoor_url: Optional[str] = None,
        recommend_pct: Optional[int] = None,
        ceo_pct: Optional[int] = None,
        median_pay: Optional[str] = None,
        employee_count: Optional[str] = None
    ) -> bool:
        """Update a company's row with Glassdoor rating data.

        Column structure:
        A=Company, B=GD Rating (2025), C=Glassdoor Stars (5),
        D=Recommend to friend %, E=Employee Count, F=GD/CEO %, G=Median Total Pay

        Args:
            spreadsheet_url: The Google Sheets URL
            company_name: Name of the company to update
            rating: Glassdoor rating (0-5)
            review_count: Number of reviews (optional)
            glassdoor_url: URL to the Glassdoor page (optional)
            recommend_pct: Recommend to friend percentage (optional)
            ceo_pct: CEO approval percentage (optional)
            median_pay: Median total pay (optional)
            employee_count: Employee count or range (optional)

        Returns:
            True if successful, False otherwise
        """
        if not self.service:
            print("[GOOGLE_SHEETS] Service not initialized. Check credentials file.")
            return False

        spreadsheet_id = self.extract_spreadsheet_id(spreadsheet_url)
        if not spreadsheet_id:
            print(f"[GOOGLE_SHEETS] Could not extract spreadsheet ID from URL: {spreadsheet_url}")
            return False

        # Get sheet name
        gid = self.extract_gid(spreadsheet_url)
        sheet_name = self.get_sheet_name_from_gid(spreadsheet_id, gid) if gid else None

        if not sheet_name:
            try:
                spreadsheet = self.service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
                sheets = spreadsheet.get('sheets', [])
                if sheets:
                    sheet_name = sheets[0]['properties']['title']
                else:
                    print("[GOOGLE_SHEETS] No sheets found in spreadsheet")
                    return False
            except HttpError as e:
                print(f"[GOOGLE_SHEETS] Error getting spreadsheet info: {e}")
                return False

        try:
            # FORMULA rendering preserves existing =HYPERLINK(...) formulas in C-G
            # so a salary-only update doesn't clobber the overview-page hyperlinks
            result = self.service.spreadsheets().values().get(
                spreadsheetId=spreadsheet_id,
                range=f'{sheet_name}!A:Z',
                valueRenderOption='FORMULA'
            ).execute()

            values = result.get('values', [])
            if not values:
                print("[GOOGLE_SHEETS] No data in spreadsheet")
                return False

            company_name_normalized = normalize_company_name(company_name)
            row_index = None

            for i, row in enumerate(values):
                if not row:
                    continue

                # Check first column for company name
                cell_value = row[0] if len(row) > 0 else ''

                # Extract text from HYPERLINK formula if present
                if isinstance(cell_value, str):
                    if cell_value.startswith('=HYPERLINK'):
                        match = re.search(r'"([^"]*)"[^"]*$', cell_value)
                        if match:
                            display_text = match.group(1)
                            if normalize_company_name(display_text) == company_name_normalized:
                                row_index = i
                                break
                    else:
                        if normalize_company_name(cell_value) == company_name_normalized:
                            row_index = i
                            break

            if row_index is None:
                print(f"[GOOGLE_SHEETS] Company '{company_name}' not found in spreadsheet")
                return False

            # Column structure:
            # A=Company, B=GD Rating (2025), C=Glassdoor Stars (5), D=Recommend to friend %,
            # E=Employee Count, F=GD/CEO %, G=Median Total Pay, H=Job Title, I=Job ID, J=Applied Date, ...

            # Get the current row to preserve existing data
            current_row = values[row_index]

            # Ensure row has enough columns (at least through column G)
            while len(current_row) < 7:
                current_row.append('')

            # Wrap a value in a HYPERLINK formula when a Glassdoor URL is available
            def _gd_link(value):
                if glassdoor_url:
                    safe_url = glassdoor_url.replace('"', '%22')
                    return f'=HYPERLINK("{safe_url}", "{value}")'
                return value

            # Update Glassdoor star rating in column C (index 2) — only when provided
            if rating is not None:
                current_row[2] = _gd_link(rating)  # Column C: Glassdoor Stars (5)

            # Update Recommend to friend % in column D (index 3)
            if recommend_pct is not None:
                current_row[3] = _gd_link(f"{recommend_pct}%")  # Column D: Recommend to friend %

            # Update Employee Count in column E (index 4)
            if employee_count is not None:
                current_row[4] = _gd_link(employee_count)  # Column E: Employee Count

            # Update CEO approval % in column F (index 5)
            if ceo_pct is not None:
                current_row[5] = _gd_link(f"{ceo_pct}%")  # Column F: GD/CEO %

            # Update Median total pay in column G (index 6)
            if median_pay is not None:
                current_row[6] = _gd_link(median_pay)  # Column G: Median Total Pay

            # Update the row
            row_number = row_index + 1
            update_range = f'{sheet_name}!A{row_number}:G{row_number}'

            body = {
                'values': [current_row[:7]]  # Update first 7 columns
            }

            self.service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range=update_range,
                valueInputOption='USER_ENTERED',
                body=body
            ).execute()

            stats_updated = [f"{rating} stars"]
            if recommend_pct is not None:
                stats_updated.append(f"{recommend_pct}% recommend")
            if employee_count is not None:
                stats_updated.append(f"{employee_count} employees")
            if ceo_pct is not None:
                stats_updated.append(f"{ceo_pct}% CEO approval")
            if median_pay is not None:
                stats_updated.append(f"{median_pay} median pay")

            print(f"[GOOGLE_SHEETS] ✓ Updated Glassdoor data for {company_name}: {', '.join(stats_updated)}")
            return True

        except HttpError as e:
            print(f"[GOOGLE_SHEETS] Error updating Glassdoor data: {e}")
            return False

    def get_company_glassdoor_data(
        self,
        spreadsheet_url: str,
        company_name: str
    ) -> Optional[dict]:
        """Get Glassdoor data for a company from any existing row.

        Column structure:
        A=Company, B=GD Rating (2025), C=Glassdoor Stars (5),
        D=Recommend to friend %, E=Employee Count, F=GD/CEO %, G=Median Total Pay

        Args:
            spreadsheet_url: The Google Sheets URL
            company_name: Name of the company

        Returns:
            Dict with Glassdoor data if found, None otherwise
        """
        if not self.service:
            return None

        spreadsheet_id = self.extract_spreadsheet_id(spreadsheet_url)
        if not spreadsheet_id:
            return None

        # Get sheet name
        gid = self.extract_gid(spreadsheet_url)
        sheet_name = self.get_sheet_name_from_gid(spreadsheet_id, gid) if gid else None

        if not sheet_name:
            try:
                spreadsheet = self.service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
                sheets = spreadsheet.get('sheets', [])
                if sheets:
                    sheet_name = sheets[0]['properties']['title']
                else:
                    return None
            except HttpError as e:
                print(f"[GOOGLE_SHEETS] Error getting spreadsheet info: {e}")
                return None

        try:
            company_name_normalized = normalize_company_name(company_name)

            # Read all values from columns A-G
            result = self.service.spreadsheets().values().get(
                spreadsheetId=spreadsheet_id,
                range=f'{sheet_name}!A:G'
            ).execute()

            values = result.get('values', [])

            for row in values:
                if not row:
                    continue

                # Check column A for company name
                cell_value = row[0] if len(row) > 0 else ''
                company_text = None
                if isinstance(cell_value, str):
                    if cell_value.startswith('=HYPERLINK'):
                        match = re.search(r'"([^"]*)"[^"]*$', cell_value)
                        if match:
                            company_text = match.group(1)
                    else:
                        company_text = cell_value

                    if company_text and normalize_company_name(company_text) == company_name_normalized:
                        # Found the company! Extract all Glassdoor data
                        glassdoor_data = {}

                        # Column C (index 2): Glassdoor Stars (5)
                        if len(row) > 2 and row[2]:
                            try:
                                glassdoor_data['rating'] = float(row[2])
                            except (ValueError, TypeError):
                                pass

                        # Column D (index 3): Recommend to friend %
                        if len(row) > 3 and row[3]:
                            try:
                                # Handle both "75%" and "75" formats
                                val = str(row[3]).replace('%', '').strip()
                                glassdoor_data['recommend_pct'] = val
                            except (ValueError, TypeError):
                                pass

                        # Column E (index 4): Employee Count
                        if len(row) > 4 and row[4]:
                            glassdoor_data['employee_count'] = str(row[4]).strip()

                        # Column F (index 5): CEO %
                        if len(row) > 5 and row[5]:
                            try:
                                val = str(row[5]).replace('%', '').strip()
                                glassdoor_data['ceo_pct'] = val
                            except (ValueError, TypeError):
                                pass

                        # Column G (index 6): Median Total Pay
                        if len(row) > 6 and row[6]:
                            glassdoor_data['median_pay'] = str(row[6]).strip()

                        # Only return if we found at least the rating
                        if glassdoor_data.get('rating'):
                            return glassdoor_data

            return None

        except HttpError as e:
            print(f"[GOOGLE_SHEETS] Error reading spreadsheet: {e}")
            return None

    def find_alphabetical_insert_position(
        self,
        spreadsheet_id: str,
        sheet_name: str,
        company_name: str
    ) -> int:
        """Find the row index where a company should be inserted alphabetically.

        Args:
            spreadsheet_id: The spreadsheet ID
            sheet_name: Name of the sheet
            company_name: Company name to insert

        Returns:
            Row index (1-based) where the company should be inserted
        """
        try:
            # Read all company names
            result = self.service.spreadsheets().values().get(
                spreadsheetId=spreadsheet_id,
                range=f'{sheet_name}!A:A'
            ).execute()

            values = result.get('values', [])
            company_name_lower = company_name.lower().strip()

            # Skip header row, start from row 2
            for i, row in enumerate(values[1:], start=2):
                if not row or not row[0]:
                    continue

                cell_value = row[0]
                # Extract company name from HYPERLINK if present
                if isinstance(cell_value, str):
                    if cell_value.startswith('=HYPERLINK'):
                        match = re.search(r'"([^"]*)"[^"]*$', cell_value)
                        if match:
                            existing_company = match.group(1)
                        else:
                            existing_company = cell_value
                    else:
                        existing_company = cell_value

                    # Compare alphabetically
                    if existing_company.lower().strip() > company_name_lower:
                        return i  # Insert before this row

            # If we get here, insert at the end
            return len(values) + 1

        except HttpError as e:
            print(f"[GOOGLE_SHEETS] Error finding insert position: {e}")
            return 2  # Default to row 2 (after header)

    def check_job_exists(
        self,
        spreadsheet_url: str,
        company_name: str,
        job_id: Optional[str] = None
    ) -> dict:
        """Check if a job already exists in the spreadsheet.

        Args:
            spreadsheet_url: The Google Sheets URL
            company_name: Name of the company
            job_id: Optional job ID to check for duplicates

        Returns:
            Dict with exists (bool), is_duplicate_job (bool), and cached Glassdoor data
        """
        if not self.service:
            return {'exists': False, 'is_duplicate_job': False}

        spreadsheet_id = self.extract_spreadsheet_id(spreadsheet_url)
        if not spreadsheet_id:
            return {'exists': False, 'is_duplicate_job': False}

        # Get sheet name
        gid = self.extract_gid(spreadsheet_url)
        sheet_name = self.get_sheet_name_from_gid(spreadsheet_id, gid) if gid else None

        if not sheet_name:
            try:
                spreadsheet = self.service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
                sheets = spreadsheet.get('sheets', [])
                if sheets:
                    sheet_name = sheets[0]['properties']['title']
                else:
                    return {'exists': False, 'is_duplicate_job': False}
            except HttpError as e:
                print(f"[GOOGLE_SHEETS] Error getting spreadsheet info: {e}")
                return {'exists': False, 'is_duplicate_job': False}

        try:
            company_name_normalized = normalize_company_name(company_name)

            # Read all values from columns A-I (company, ratings, job info, job ID)
            result = self.service.spreadsheets().values().get(
                spreadsheetId=spreadsheet_id,
                range=f'{sheet_name}!A:I'
            ).execute()

            values = result.get('values', [])

            company_exists = False
            is_duplicate_job = False
            cached_rating = None
            cached_review_count = None

            for row in values:
                if not row:
                    continue

                # Extract company name from column A
                cell_value = row[0] if len(row) > 0 else ''
                company_text = None
                if isinstance(cell_value, str):
                    if cell_value.startswith('=HYPERLINK'):
                        match = re.search(r'"([^"]*)"[^"]*$', cell_value)
                        if match:
                            company_text = match.group(1)
                    else:
                        company_text = cell_value

                    if company_text and normalize_company_name(company_text) == company_name_normalized:
                        company_exists = True

                        # Extract cached Glassdoor rating (column C, index 2)
                        if not cached_rating and len(row) > 2 and row[2]:
                            try:
                                cached_rating = float(row[2])
                            except (ValueError, TypeError):
                                pass

                        # Check if this is a duplicate job (same job ID in column I)
                        if job_id and len(row) > 8 and row[8]:
                            existing_job_id = str(row[8]).strip()
                            if existing_job_id == str(job_id).strip():
                                is_duplicate_job = True
                                break

            return {
                'exists': company_exists,
                'is_duplicate_job': is_duplicate_job,
                'cached_rating': cached_rating,
                'cached_review_count': cached_review_count
            }

        except HttpError as e:
            print(f"[GOOGLE_SHEETS] Error reading spreadsheet: {e}")
            return {'exists': False, 'is_duplicate_job': False}

    def add_job_application(
        self,
        spreadsheet_url: str,
        company_name: str,
        job_url: str,
        job_title: Optional[str] = None,
        job_id: Optional[str] = None,
        additional_data: Optional[dict] = None
    ) -> bool:
        """Add or update a job application entry in the spreadsheet.

        This implementation:
        - If job_id exists for this company: UPDATES that row (no duplicate)
        - If new job: Inserts row alphabetically by company name
        - Copies Glassdoor data from existing company rows if available
        - Stores job title with hyperlink in column H and job ID in column I

        Column structure:
        A=Company, B=GD Rating (2025), C=Glassdoor Stars (5),
        D=Recommend to friend %, E=Employee Count, F=CEO %, G=Median Pay,
        H=Job Title/Link, I=Job Req ID, J=Applied Date, ...

        Args:
            spreadsheet_url: The Google Sheets URL
            company_name: Name of the company
            job_url: URL of the job application page
            job_title: Optional job title
            job_id: Optional job ID/requisition number
            additional_data: Optional additional columns (e.g., date, status, notes)

        Returns:
            True if successful, False otherwise
        """
        if not self.service:
            print("[GOOGLE_SHEETS] Service not initialized. Check credentials file.")
            return False

        spreadsheet_id = self.extract_spreadsheet_id(spreadsheet_url)
        if not spreadsheet_id:
            print(f"[GOOGLE_SHEETS] Could not extract spreadsheet ID from URL: {spreadsheet_url}")
            return False

        # Get sheet name from gid or use first sheet
        gid = self.extract_gid(spreadsheet_url)
        sheet_name = self.get_sheet_name_from_gid(spreadsheet_id, gid) if gid else None

        if not sheet_name:
            # Default to first sheet
            try:
                spreadsheet = self.service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
                sheets = spreadsheet.get('sheets', [])
                if sheets:
                    sheet_name = sheets[0]['properties']['title']
                else:
                    print("[GOOGLE_SHEETS] No sheets found in spreadsheet")
                    return False
            except HttpError as e:
                print(f"[GOOGLE_SHEETS] Error getting spreadsheet info: {e}")
                return False

        # Check if this exact job already exists (same company + job_id)
        existing_job = self.check_job_exists(spreadsheet_url, company_name, job_id)

        if existing_job.get('is_duplicate_job') and job_id:
            # Job already exists - UPDATE the existing row instead of creating duplicate
            print(f"[GOOGLE_SHEETS] Job already exists for {company_name} (ID: {job_id}), updating existing row")
            return self._update_existing_job_row(
                spreadsheet_id=spreadsheet_id,
                sheet_name=sheet_name,
                company_name=company_name,
                job_id=job_id,
                job_url=job_url,
                job_title=job_title,
                additional_data=additional_data
            )

        # Refuse to create a placeholder row when the company already exists but
        # we have no job_id to dedup on. Otherwise every revisit to a company
        # page without a stable job_id would spawn a new "Job Link" row.
        if existing_job.get('exists') and not job_id:
            print(f"[GOOGLE_SHEETS] Company {company_name} already exists and no job_id provided — skipping placeholder add")
            return True

        # Get existing Glassdoor data for this company (to copy to new row)
        glassdoor_data = self.get_company_glassdoor_data(spreadsheet_url, company_name)

        # Find alphabetical insert position
        insert_row = self.find_alphabetical_insert_position(spreadsheet_id, sheet_name, company_name)

        # Build row data according to column structure
        # Column A: Company name
        row_data = [
            company_name,  # A: Company name only
            '',            # B: GD Rating (2025) - leave empty for now
            glassdoor_data.get('rating', '') if glassdoor_data else '',  # C: Glassdoor Stars (5)
            glassdoor_data.get('recommend_pct', '') if glassdoor_data else '',  # D: Recommend %
            glassdoor_data.get('employee_count', '') if glassdoor_data else '',  # E: Employee Count
            glassdoor_data.get('ceo_pct', '') if glassdoor_data else '',  # F: CEO %
            glassdoor_data.get('median_pay', '') if glassdoor_data else '',  # G: Median Pay
        ]

        # Column H: Job Title with hyperlink to job URL
        if job_title and job_url:
            job_title_formula = f'=HYPERLINK("{job_url}", "{job_title}")'
            row_data.append(job_title_formula)
        elif job_url:
            job_title_formula = f'=HYPERLINK("{job_url}", "Job Link")'
            row_data.append(job_title_formula)
        else:
            row_data.append(job_title or '')

        # Column I: Job Req ID
        row_data.append(job_id or '')

        # Column J: Applied Date
        if additional_data and 'date' in additional_data:
            row_data.append(additional_data['date'])
        else:
            row_data.append('')  # Leave empty if no date provided

        try:
            # FINAL SAFETY CHECK: Check one more time right before inserting to prevent race conditions
            # This catches cases where multiple requests checked simultaneously before any inserted
            if job_id:
                final_check = self.check_job_exists(spreadsheet_url, company_name, job_id)
                if final_check.get('is_duplicate_job'):
                    print(f"[GOOGLE_SHEETS] RACE CONDITION DETECTED: Job {job_id} was just added by another request, updating instead")
                    return self._update_existing_job_row(
                        spreadsheet_id=spreadsheet_id,
                        sheet_name=sheet_name,
                        company_name=company_name,
                        job_id=job_id,
                        job_url=job_url,
                        job_title=job_title,
                        additional_data=additional_data
                    )

            # Insert row at the alphabetical position
            # First, insert a blank row
            request = {
                'insertDimension': {
                    'range': {
                        'sheetId': self._get_sheet_id(spreadsheet_id, sheet_name),
                        'dimension': 'ROWS',
                        'startIndex': insert_row - 1,
                        'endIndex': insert_row
                    },
                    'inheritFromBefore': False
                }
            }

            self.service.spreadsheets().batchUpdate(
                spreadsheetId=spreadsheet_id,
                body={'requests': [request]}
            ).execute()

            # Now update the inserted row with our data
            update_range = f'{sheet_name}!A{insert_row}:J{insert_row}'  # A through J (10 columns)
            body = {
                'values': [row_data]
            }

            self.service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range=update_range,
                valueInputOption='USER_ENTERED',
                body=body
            ).execute()

            print(f"[GOOGLE_SHEETS] ✓ Added job application at row {insert_row}: {company_name} - {job_title or job_url}")
            if glassdoor_data:
                print(f"[GOOGLE_SHEETS] ✓ Copied Glassdoor data: {glassdoor_data.get('rating')} stars")
            return True

        except HttpError as e:
            print(f"[GOOGLE_SHEETS] Error inserting row: {e}")
            return False

    def _update_existing_job_row(
        self,
        spreadsheet_id: str,
        sheet_name: str,
        company_name: str,
        job_id: str,
        job_url: str,
        job_title: Optional[str] = None,
        additional_data: Optional[dict] = None
    ) -> bool:
        """Update an existing job row with job title link and applied date.

        Args:
            spreadsheet_id: The spreadsheet ID
            sheet_name: Name of the sheet
            company_name: Company name
            job_id: Job ID to find
            job_url: URL to the job
            job_title: Job title
            additional_data: Additional data like applied date

        Returns:
            True if successful, False otherwise
        """
        try:
            company_name_normalized = normalize_company_name(company_name)

            # Read all values to find the matching row
            result = self.service.spreadsheets().values().get(
                spreadsheetId=spreadsheet_id,
                range=f'{sheet_name}!A:J'
            ).execute()

            values = result.get('values', [])
            row_index = None

            # Find the row with matching company name AND job ID
            for i, row in enumerate(values):
                if len(row) < 2:
                    continue

                # Check company name (column A)
                cell_value = row[0] if len(row) > 0 else ''
                company_text = None
                if isinstance(cell_value, str):
                    if cell_value.startswith('=HYPERLINK'):
                        match = re.search(r'"([^"]*)"[^"]*$', cell_value)
                        if match:
                            company_text = match.group(1)
                    else:
                        company_text = cell_value

                    if company_text and normalize_company_name(company_text) == company_name_normalized:
                        # Check if job ID matches (column I, index 8)
                        if len(row) > 8 and str(row[8]).strip() == str(job_id).strip():
                            row_index = i
                            break

            if row_index is None:
                print(f"[GOOGLE_SHEETS] Could not find existing job row for {company_name} with job ID {job_id}")
                return False

            # Get the current row data
            current_row = values[row_index]
            while len(current_row) < 10:
                current_row.append('')

            # Update column H: Job Title with hyperlink
            if job_title and job_url:
                current_row[7] = f'=HYPERLINK("{job_url}", "{job_title}")'
            elif job_url:
                current_row[7] = f'=HYPERLINK("{job_url}", "Job Link")'

            # Update column J: Applied Date
            if additional_data and 'date' in additional_data:
                current_row[9] = additional_data['date']

            # Update the row
            row_number = row_index + 1
            update_range = f'{sheet_name}!A{row_number}:J{row_number}'
            body = {
                'values': [current_row[:10]]
            }

            self.service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range=update_range,
                valueInputOption='USER_ENTERED',
                body=body
            ).execute()

            print(f"[GOOGLE_SHEETS] ✓ Updated existing job for {company_name}: {job_title or 'Job Link'}")
            return True

        except HttpError as e:
            print(f"[GOOGLE_SHEETS] Error updating existing job row: {e}")
            return False

    def mark_job_as_rejected(
        self,
        spreadsheet_url: str,
        company_name: str,
        job_title: Optional[str] = None,
        rejection_date: Optional[str] = None
    ) -> dict:
        """Write a rejection date into column K for the matching company/job row.

        Match strategy:
        1. If job_title is provided, prefer the row whose column H (Job Title/Link)
           contains the title (fuzzy, normalized).
        2. Otherwise, or if no title match, pick the row with the most recent
           Applied Date (column J) that does NOT already have a Rejection Date.
        3. If still no candidate, fall back to the most recent applied row even
           if column K is already set (this overwrites).

        Args:
            spreadsheet_url: The Google Sheets URL
            company_name: Company name to match in column A
            job_title: Optional job title to disambiguate among multiple rows
            rejection_date: Date string (YYYY-MM-DD). Defaults to today.

        Returns:
            Dict with success (bool), row (int), matched_job_title (str|None),
            and message (str).
        """
        from datetime import datetime as _dt

        if not self.service:
            return {'success': False, 'message': 'Sheets service not initialized'}

        spreadsheet_id = self.extract_spreadsheet_id(spreadsheet_url)
        if not spreadsheet_id:
            return {'success': False, 'message': 'Could not parse spreadsheet URL'}

        gid = self.extract_gid(spreadsheet_url)
        sheet_name = self.get_sheet_name_from_gid(spreadsheet_id, gid) if gid else None
        if not sheet_name:
            try:
                spreadsheet = self.service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
                sheets = spreadsheet.get('sheets', [])
                if not sheets:
                    return {'success': False, 'message': 'No sheets in spreadsheet'}
                sheet_name = sheets[0]['properties']['title']
            except HttpError as e:
                return {'success': False, 'message': f'Error getting sheet info: {e}'}

        if not rejection_date:
            rejection_date = _dt.now().strftime('%Y-%m-%d')

        def normalize_title(s):
            return re.sub(r'[^a-z0-9]', '', (s or '').lower().strip())

        company_norm = normalize_company_name(company_name)
        title_norm = normalize_title(job_title) if job_title else None

        try:
            result = self.service.spreadsheets().values().get(
                spreadsheetId=spreadsheet_id,
                range=f'{sheet_name}!A:K'
            ).execute()
            values = result.get('values', [])

            # Collect all rows matching the company
            candidates = []  # list of dicts
            for i, row in enumerate(values):
                if not row:
                    continue
                cell_value = row[0] if len(row) > 0 else ''
                if not isinstance(cell_value, str):
                    continue
                if cell_value.startswith('=HYPERLINK'):
                    m = re.search(r'"([^"]*)"[^"]*$', cell_value)
                    company_text = m.group(1) if m else ''
                else:
                    company_text = cell_value
                if normalize_company_name(company_text) != company_norm:
                    continue

                # Extract job title display text from column H (index 7)
                title_cell = row[7] if len(row) > 7 else ''
                if isinstance(title_cell, str) and title_cell.startswith('=HYPERLINK'):
                    m = re.search(r'"([^"]*)"[^"]*$', title_cell)
                    title_text = m.group(1) if m else ''
                else:
                    title_text = title_cell or ''

                job_id_val = str(row[8]).strip() if len(row) > 8 and row[8] else ''
                applied = str(row[9]).strip() if len(row) > 9 and row[9] else ''
                rejected = str(row[10]).strip() if len(row) > 10 and row[10] else ''

                candidates.append({
                    'index': i,
                    'title': str(title_text).strip(),
                    'job_id': job_id_val,
                    'applied': applied,
                    'has_rejection': bool(rejected),
                })

            if not candidates:
                return {'success': False, 'message': f"Company '{company_name}' not found in spreadsheet"}

            def applied_date(c):
                try:
                    return _dt.strptime(c['applied'], '%Y-%m-%d')
                except (ValueError, TypeError):
                    return _dt.min

            # 1) Title match (if title provided) — strongest signal
            chosen = None
            if title_norm:
                title_matches = []
                for cand in candidates:
                    cand_title_norm = normalize_title(cand['title'])
                    if not cand_title_norm:
                        continue
                    if cand_title_norm == title_norm or title_norm in cand_title_norm or cand_title_norm in title_norm:
                        title_matches.append(cand)
                if title_matches:
                    # Prefer no rejection date, then most recent applied
                    title_matches.sort(key=lambda c: (c['has_rejection'], -applied_date(c).toordinal() if applied_date(c) != _dt.min else 0))
                    chosen = title_matches[0]

            # 2) Score-based fallback: prefer rows with real job data over placeholder rows
            if chosen is None:
                def row_score(c):
                    score = 0
                    # Real job title (not the auto-generated "Job Link" placeholder)
                    if c['title'] and c['title'].lower() != 'job link':
                        score += 4
                    # Populated job ID
                    if c['job_id']:
                        score += 2
                    # Not already rejected
                    if not c['has_rejection']:
                        score += 1
                    return score
                # Highest score wins; tiebreak on most recent applied date
                candidates.sort(key=lambda c: (-row_score(c), -(applied_date(c).toordinal() if applied_date(c) != _dt.min else 0)))
                chosen = candidates[0]

            row_index = chosen['index']
            matched_title = chosen['title']
            row_number = row_index + 1
            update_range = f'{sheet_name}!K{row_number}'
            self.service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range=update_range,
                valueInputOption='USER_ENTERED',
                body={'values': [[rejection_date]]}
            ).execute()

            print(f"[GOOGLE_SHEETS] ✓ Marked rejected: {company_name} (row {row_number}, title='{matched_title}', date={rejection_date})")
            return {
                'success': True,
                'row': row_number,
                'matched_job_title': matched_title or None,
                'rejection_date': rejection_date,
                'message': f'Marked {company_name} as rejected on {rejection_date}'
            }

        except HttpError as e:
            print(f"[GOOGLE_SHEETS] Error marking rejected: {e}")
            return {'success': False, 'message': f'Sheets API error: {e}'}

    def consolidate_company_rows(
        self,
        spreadsheet_url: str,
        company_name: str,
    ) -> dict:
        """Merge all rows matching the given company into a single best row.

        Strategy:
        - Find all rows whose normalized company name matches.
        - Build a merged row by picking the best value per column:
            * Column A (Company): the longest variant (so 'DynPro Inc.' wins over 'DynPro')
            * Column H (Job Title/Link): prefer a real title hyperlink over the
              'Job Link' placeholder
            * Other columns: first non-empty value across all matching rows
        - Pick the row with the most non-empty cells as the keeper (ties: lowest index)
        - Write merged values into the keeper row, then delete the others
          (highest row index first so indices stay valid).

        Args:
            spreadsheet_url: The Google Sheets URL
            company_name: Company name to match (suffix-stripped, fuzzy)

        Returns:
            Dict with success, rows_merged, keeper_row, deleted_rows, message.
        """
        if not self.service:
            return {'success': False, 'message': 'Sheets service not initialized'}

        spreadsheet_id = self.extract_spreadsheet_id(spreadsheet_url)
        if not spreadsheet_id:
            return {'success': False, 'message': 'Could not parse spreadsheet URL'}

        gid = self.extract_gid(spreadsheet_url)
        sheet_name = self.get_sheet_name_from_gid(spreadsheet_id, gid) if gid else None
        if not sheet_name:
            try:
                spreadsheet = self.service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
                sheets = spreadsheet.get('sheets', [])
                if not sheets:
                    return {'success': False, 'message': 'No sheets in spreadsheet'}
                sheet_name = sheets[0]['properties']['title']
            except HttpError as e:
                return {'success': False, 'message': f'Error getting sheet info: {e}'}

        company_norm = normalize_company_name(company_name)

        try:
            # Read all rows — use Z as a wide upper bound to capture user columns
            # beyond K. valueRenderOption=FORMULA preserves =HYPERLINK formulas.
            result = self.service.spreadsheets().values().get(
                spreadsheetId=spreadsheet_id,
                range=f'{sheet_name}!A:Z',
                valueRenderOption='FORMULA',
            ).execute()
            values = result.get('values', [])

            matches = []  # list of (row_index_0based, full_row_list)
            for i, row in enumerate(values):
                if not row:
                    continue
                cell_value = row[0] if len(row) > 0 else ''
                if not isinstance(cell_value, str):
                    continue
                company_text = _extract_hyperlink_text(cell_value)
                if normalize_company_name(company_text) == company_norm and company_norm:
                    matches.append((i, list(row)))

            if len(matches) < 2:
                return {
                    'success': True,
                    'rows_merged': len(matches),
                    'keeper_row': matches[0][0] + 1 if matches else None,
                    'deleted_rows': [],
                    'message': f'Found {len(matches)} row(s) for {company_name} — nothing to merge'
                }

            # Determine column count (max width across matched rows)
            n_cols = max(len(r) for _, r in matches)
            # Pad rows to uniform width
            for _, r in matches:
                while len(r) < n_cols:
                    r.append('')

            def is_empty(v):
                return v is None or (isinstance(v, str) and v.strip() == '')

            def is_placeholder_title(v):
                # Column H placeholder: =HYPERLINK("...", "Job Link") or literal "Job Link"
                if isinstance(v, str):
                    text = _extract_hyperlink_text(v)
                    return text.strip().lower() == 'job link'
                return False

            # Build merged row
            merged = [''] * n_cols
            for col in range(n_cols):
                col_values = [r[col] for _, r in matches if col < len(r)]
                non_empty = [v for v in col_values if not is_empty(v)]
                if not non_empty:
                    continue
                if col == 0:
                    # Company: pick longest (preserves "Inc." etc.)
                    display_texts = [(_extract_hyperlink_text(v), v) for v in non_empty]
                    merged[col] = max(display_texts, key=lambda t: len(t[0]))[1]
                elif col == 7:
                    # Job Title/Link: prefer non-placeholder
                    real = [v for v in non_empty if not is_placeholder_title(v)]
                    merged[col] = real[0] if real else non_empty[0]
                else:
                    merged[col] = non_empty[0]

            # Pick keeper: row with most non-empty cells (ties → lowest index)
            def non_empty_count(r):
                return sum(1 for v in r if not is_empty(v))
            keeper_idx, _keeper_row = max(matches, key=lambda m: (non_empty_count(m[1]), -m[0]))

            # Convert column count to range end letter (handles up to Z)
            def col_letter(n):
                # 1 -> A, 26 -> Z
                return chr(ord('A') + n - 1)
            end_col_letter = col_letter(n_cols)

            keeper_row_number = keeper_idx + 1
            update_range = f'{sheet_name}!A{keeper_row_number}:{end_col_letter}{keeper_row_number}'
            self.service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range=update_range,
                valueInputOption='USER_ENTERED',
                body={'values': [merged]},
            ).execute()

            # Delete the other rows, highest index first to keep indices stable.
            to_delete = sorted([i for i, _ in matches if i != keeper_idx], reverse=True)
            sheet_id = self._get_sheet_id(spreadsheet_id, sheet_name)
            delete_requests = []
            for i in to_delete:
                delete_requests.append({
                    'deleteDimension': {
                        'range': {
                            'sheetId': sheet_id,
                            'dimension': 'ROWS',
                            'startIndex': i,
                            'endIndex': i + 1,
                        }
                    }
                })
            if delete_requests:
                self.service.spreadsheets().batchUpdate(
                    spreadsheetId=spreadsheet_id,
                    body={'requests': delete_requests},
                ).execute()

            print(f"[GOOGLE_SHEETS] ✓ Consolidated {len(matches)} rows for {company_name} into row {keeper_row_number}; deleted rows {[i+1 for i in to_delete]}")
            return {
                'success': True,
                'rows_merged': len(matches),
                'keeper_row': keeper_row_number,
                'deleted_rows': [i + 1 for i in to_delete],
                'message': f'Merged {len(matches)} rows into row {keeper_row_number}',
            }

        except HttpError as e:
            print(f"[GOOGLE_SHEETS] Error consolidating: {e}")
            return {'success': False, 'message': f'Sheets API error: {e}'}

    def get_all_applications(
        self,
        spreadsheet_url: str,
        status: str = "active"
    ) -> list:
        """Read all job application rows from the spreadsheet.

        Args:
            spreadsheet_url: The Google Sheets URL
            status: "active" (no rejection date), "rejected" (has rejection date), or "all"

        Returns:
            List of dicts with keys: company, company_url, job_title, job_url,
            job_id, applied_date, rejection_date, glassdoor_stars, recommend_pct,
            employee_count, ceo_pct, median_pay
        """
        if not self.service:
            return []

        spreadsheet_id = self.extract_spreadsheet_id(spreadsheet_url)
        if not spreadsheet_id:
            return []

        gid = self.extract_gid(spreadsheet_url)
        sheet_name = self.get_sheet_name_from_gid(spreadsheet_id, gid) if gid else None
        if not sheet_name:
            try:
                spreadsheet = self.service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
                sheets = spreadsheet.get('sheets', [])
                if not sheets:
                    return []
                sheet_name = sheets[0]['properties']['title']
            except HttpError:
                return []

        try:
            result = self.service.spreadsheets().values().get(
                spreadsheetId=spreadsheet_id,
                range=f'{sheet_name}!A:K',
                valueRenderOption='FORMULA',
            ).execute()
            values = result.get('values', [])
        except HttpError:
            return []

        applications = []
        for i, row in enumerate(values):
            if i == 0:
                # Skip header row (col A is "Company" plain text, not a HYPERLINK)
                col_a = row[0] if row else ''
                if isinstance(col_a, str) and not col_a.startswith('=HYPERLINK'):
                    continue

            if not row:
                continue

            col_a = row[0] if len(row) > 0 else ''
            company = _extract_hyperlink_text(col_a)
            company_url = _extract_hyperlink_url(col_a)
            if not company:
                continue

            col_h = row[7] if len(row) > 7 else ''
            job_title = _extract_hyperlink_text(col_h)
            job_url = _extract_hyperlink_url(col_h)

            rejection_date = str(row[10] if len(row) > 10 else '').strip()

            if status == "active" and rejection_date:
                continue
            if status == "rejected" and not rejection_date:
                continue

            applications.append({
                'company': company,
                'company_url': company_url,
                'job_title': job_title,
                'job_url': job_url,
                'job_id': str(row[8] if len(row) > 8 else '').strip(),
                'applied_date': str(row[9] if len(row) > 9 else '').strip(),
                'rejection_date': rejection_date,
                'glassdoor_stars': _extract_hyperlink_text(row[2] if len(row) > 2 else ''),
                'recommend_pct': str(row[3] if len(row) > 3 else '').strip(),
                'employee_count': str(row[4] if len(row) > 4 else '').strip(),
                'ceo_pct': str(row[5] if len(row) > 5 else '').strip(),
                'median_pay': str(row[6] if len(row) > 6 else '').strip(),
            })

        return applications

    def _get_sheet_id(self, spreadsheet_id: str, sheet_name: str) -> int:
        """Get the sheet ID (gid) from sheet name.

        Args:
            spreadsheet_id: The spreadsheet ID
            sheet_name: Name of the sheet

        Returns:
            Sheet ID (integer gid)
        """
        try:
            spreadsheet = self.service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
            sheets = spreadsheet.get('sheets', [])
            for sheet in sheets:
                if sheet['properties']['title'] == sheet_name:
                    return sheet['properties']['sheetId']
            return 0
        except HttpError as e:
            print(f"[GOOGLE_SHEETS] Error getting sheet ID: {e}")
            return 0


# Global service instance
_sheets_service: Optional[GoogleSheetsService] = None


def get_sheets_service() -> Optional[GoogleSheetsService]:
    """Get or create the global Google Sheets service instance."""
    global _sheets_service

    if _sheets_service is None:
        _sheets_service = GoogleSheetsService()

    return _sheets_service if _sheets_service.service else None
