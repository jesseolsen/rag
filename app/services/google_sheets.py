"""Google Sheets integration service for tracking job applications."""

import os
import re
from typing import Optional
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.config import settings


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
        rating: float,
        review_count: Optional[int] = None,
        glassdoor_url: Optional[str] = None,
        recommend_pct: Optional[int] = None,
        ceo_pct: Optional[int] = None,
        median_pay: Optional[str] = None
    ) -> bool:
        """Update a company's row with Glassdoor rating data.

        Column structure:
        A=Company, B=GD Rating (2025), C=Glassdoor Stars (5),
        D=Recommend to friend %, E=GD/CEO %, F=Median Total Pay

        Args:
            spreadsheet_url: The Google Sheets URL
            company_name: Name of the company to update
            rating: Glassdoor rating (0-5)
            review_count: Number of reviews (optional)
            glassdoor_url: URL to the Glassdoor page (optional)
            recommend_pct: Recommend to friend percentage (optional)
            ceo_pct: CEO approval percentage (optional)
            median_pay: Median total pay (optional)

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
            # Read all values to find the company row
            result = self.service.spreadsheets().values().get(
                spreadsheetId=spreadsheet_id,
                range=f'{sheet_name}!A:Z'
            ).execute()

            values = result.get('values', [])
            if not values:
                print("[GOOGLE_SHEETS] No data in spreadsheet")
                return False

            # Find the row with matching company name (fuzzy matching)
            # Normalize company name: lowercase, remove spaces, remove punctuation
            def normalize_company_name(name):
                return re.sub(r'[^a-z0-9]', '', name.lower().strip())

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
            # E=GD/CEO %, F=Median Total Pay, G=Job Title, H=Job ID, I=Applied Date, ...

            # Get the current row to preserve existing data
            current_row = values[row_index]

            # Ensure row has enough columns (at least through column F)
            while len(current_row) < 6:
                current_row.append('')

            # Update Glassdoor star rating in column C (index 2)
            current_row[2] = rating  # Column C: Glassdoor Stars (5)

            # Update Recommend to friend % in column D (index 3)
            if recommend_pct is not None:
                current_row[3] = f"{recommend_pct}%"  # Column D: Recommend to friend %

            # Update CEO approval % in column E (index 4)
            if ceo_pct is not None:
                current_row[4] = f"{ceo_pct}%"  # Column E: GD/CEO %

            # Update Median total pay in column F (index 5)
            if median_pay is not None:
                current_row[5] = median_pay  # Column F: Median Total Pay

            # Update the row
            row_number = row_index + 1
            update_range = f'{sheet_name}!A{row_number}:F{row_number}'

            body = {
                'values': [current_row[:6]]  # Update first 6 columns
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
        D=Recommend to friend %, E=GD/CEO %, F=Median Total Pay

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
            # Normalize company name for fuzzy matching
            def normalize_company_name(name):
                return re.sub(r'[^a-z0-9]', '', name.lower().strip())

            company_name_normalized = normalize_company_name(company_name)

            # Read all values from columns A-F
            result = self.service.spreadsheets().values().get(
                spreadsheetId=spreadsheet_id,
                range=f'{sheet_name}!A:F'
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

                        # Column E (index 4): CEO %
                        if len(row) > 4 and row[4]:
                            try:
                                val = str(row[4]).replace('%', '').strip()
                                glassdoor_data['ceo_pct'] = val
                            except (ValueError, TypeError):
                                pass

                        # Column F (index 5): Median Total Pay
                        if len(row) > 5 and row[5]:
                            glassdoor_data['median_pay'] = str(row[5]).strip()

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
            # Normalize company name for fuzzy matching
            def normalize_company_name(name):
                return re.sub(r'[^a-z0-9]', '', name.lower().strip())

            company_name_normalized = normalize_company_name(company_name)

            # Read all values from columns A-H (company, ratings, job info, job ID)
            result = self.service.spreadsheets().values().get(
                spreadsheetId=spreadsheet_id,
                range=f'{sheet_name}!A:H'
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

                        # Check if this is a duplicate job (same job ID in column H)
                        if job_id and len(row) > 7 and row[7]:
                            existing_job_id = str(row[7]).strip()
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
        """Add a job application entry to the spreadsheet.

        This implementation:
        - Inserts rows alphabetically by company name
        - Copies Glassdoor data from existing company rows if available
        - Stores job title in column G and job ID in column H

        Column structure:
        A=Company (with hyperlink to job), B=GD Rating (2025), C=Glassdoor Stars (5),
        D=Recommend to friend %, E=GD/CEO %, F=Median Total Pay,
        G=Job Title/Link, H=Job Req ID, I=Applied Date, ...

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

        # Get existing Glassdoor data for this company (to copy to new row)
        glassdoor_data = self.get_company_glassdoor_data(spreadsheet_url, company_name)

        # Find alphabetical insert position
        insert_row = self.find_alphabetical_insert_position(spreadsheet_id, sheet_name, company_name)

        # Build row data according to column structure
        # Column A: Company name with hyperlink to job URL
        hyperlink_formula = f'=HYPERLINK("{job_url}", "{company_name}")'

        row_data = [
            hyperlink_formula,  # A: Company (with job link)
            '',                  # B: GD Rating (2025) - leave empty for now
            glassdoor_data.get('rating', '') if glassdoor_data else '',  # C: Glassdoor Stars (5)
            glassdoor_data.get('recommend_pct', '') if glassdoor_data else '',  # D: Recommend %
            glassdoor_data.get('ceo_pct', '') if glassdoor_data else '',  # E: CEO %
            glassdoor_data.get('median_pay', '') if glassdoor_data else '',  # F: Median Pay
            job_title or '',     # G: Job Title/Link
            job_id or '',        # H: Job Req ID
        ]

        # Add additional data (like applied date)
        if additional_data:
            if 'date' in additional_data:
                row_data.append(additional_data['date'])  # I: Applied Date

        try:
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
            update_range = f'{sheet_name}!A{insert_row}:I{insert_row}'
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
