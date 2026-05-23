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
        glassdoor_url: Optional[str] = None
    ) -> bool:
        """Update a company's row with Glassdoor rating data.

        Args:
            spreadsheet_url: The Google Sheets URL
            company_name: Name of the company to update
            rating: Glassdoor rating (0-5)
            review_count: Number of reviews (optional)
            glassdoor_url: URL to the Glassdoor page (optional)

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

            # Find the row with matching company name
            company_name_lower = company_name.lower().strip()
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
                            if display_text.lower().strip() == company_name_lower:
                                row_index = i
                                break
                    else:
                        if cell_value.lower().strip() == company_name_lower:
                            row_index = i
                            break

            if row_index is None:
                print(f"[GOOGLE_SHEETS] Company '{company_name}' not found in spreadsheet")
                return False

            # Column structure based on user's spreadsheet:
            # A=Company, B=GD Rating (2025), C=Glassdoor Stars (5), D=Recommend to friend %,
            # E=GD/CEO %, F=Median Total Pay, G=Applied Date, ...

            # Get the current row to preserve existing data
            current_row = values[row_index]

            # Ensure row has enough columns (at least through column E)
            while len(current_row) < 5:
                current_row.append('')

            # Update Glassdoor star rating in column C (index 2)
            current_row[2] = rating  # Column C: Glassdoor Stars (5)

            # Note: Review count and other stats (recommend %, CEO %, median pay)
            # would need to be extracted separately and put in columns D, E, F

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

            print(f"[GOOGLE_SHEETS] ✓ Updated Glassdoor data for {company_name}: {rating} stars ({review_count} reviews)")
            return True

        except HttpError as e:
            print(f"[GOOGLE_SHEETS] Error updating Glassdoor data: {e}")
            return False

    def add_job_application(
        self,
        spreadsheet_url: str,
        company_name: str,
        job_url: str,
        additional_data: Optional[dict] = None
    ) -> bool:
        """Add a job application entry to the spreadsheet.

        Args:
            spreadsheet_url: The Google Sheets URL
            company_name: Name of the company
            job_url: URL of the job application page
            additional_data: Optional additional columns (e.g., position, date, etc.)

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

        # Build row data
        # First column: Company name with hyperlink formula
        # Format: =HYPERLINK("url", "text")
        hyperlink_formula = f'=HYPERLINK("{job_url}", "{company_name}")'

        row_data = [hyperlink_formula]

        # Add additional data if provided
        if additional_data:
            # Add columns in a specific order if they exist
            for key in ['position', 'date', 'status', 'notes']:
                if key in additional_data:
                    row_data.append(additional_data[key])

        try:
            # Append row to the end of the sheet
            body = {
                'values': [row_data]
            }

            result = self.service.spreadsheets().values().append(
                spreadsheetId=spreadsheet_id,
                range=f'{sheet_name}!A:A',  # Append to column A onwards
                valueInputOption='USER_ENTERED',  # This allows formulas to be interpreted
                insertDataOption='INSERT_ROWS',
                body=body
            ).execute()

            print(f"[GOOGLE_SHEETS] ✓ Added job application: {company_name} - {job_url}")
            print(f"[GOOGLE_SHEETS] Updated range: {result.get('updates', {}).get('updatedRange', 'unknown')}")
            return True

        except HttpError as e:
            print(f"[GOOGLE_SHEETS] Error appending row: {e}")
            return False


# Global service instance
_sheets_service: Optional[GoogleSheetsService] = None


def get_sheets_service() -> Optional[GoogleSheetsService]:
    """Get or create the global Google Sheets service instance."""
    global _sheets_service

    if _sheets_service is None:
        _sheets_service = GoogleSheetsService()

    return _sheets_service if _sheets_service.service else None
