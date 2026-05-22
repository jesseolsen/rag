"""Google Sheets integration service for tracking job applications."""

import os
import re
from typing import Optional
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


class GoogleSheetsService:
    """Service for interacting with Google Sheets API."""

    def __init__(self, credentials_file: Optional[str] = None):
        """Initialize Google Sheets service.

        Args:
            credentials_file: Path to service account JSON credentials file.
                            If None, will look for GOOGLE_SHEETS_CREDENTIALS_FILE env var.
        """
        self.credentials_file = credentials_file or os.getenv('GOOGLE_SHEETS_CREDENTIALS_FILE')
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
