"""
Greenhouse Form Automation using Playwright
Fallback approach: use browser automation to fill Yes/No dropdowns that content scripts can't access

Usage:
    python greenhouse_automation.py \
        --url "https://job-boards.greenhouse.io/embed/job_app?for=coalition&jr_id=..." \
        --resume-data '{"first_name": "Jesse", ...}' \
        --headless
"""

import asyncio
import json
import argparse
import logging
from typing import Dict, Any, Optional
from pathlib import Path
from datetime import datetime

try:
    from playwright.async_api import async_playwright, Page, Browser
except ImportError:
    print("ERROR: Playwright not installed. Install with: pip install playwright")
    print("Then run: playwright install")
    exit(1)

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('GreenhouseAutomation')


class GreenhouseAutomation:
    """Automate Greenhouse job application form filling using Playwright"""

    def __init__(self, headless: bool = False, slow_mo: int = 100):
        """
        Initialize automation driver

        Args:
            headless: Run browser in headless mode (no UI)
            slow_mo: Slow down actions by N milliseconds (useful for debugging)
        """
        self.headless = headless
        self.slow_mo = slow_mo
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None

    async def launch(self) -> None:
        """Launch browser instance"""
        playwright = await async_playwright().start()
        self.browser = await playwright.chromium.launch(
            headless=self.headless,
            slow_mo=self.slow_mo if not self.headless else 0
        )
        self.page = await self.browser.new_page()
        logger.info("Browser launched")

    async def close(self) -> None:
        """Close browser instance"""
        if self.page:
            await self.page.close()
        if self.browser:
            await self.browser.close()
        logger.info("Browser closed")

    async def navigate(self, url: str) -> None:
        """Navigate to Greenhouse job form"""
        if not self.page:
            raise RuntimeError("Browser not launched")

        logger.info(f"Navigating to: {url}")
        await self.page.goto(url, wait_until='networkidle')
        await self.page.wait_for_load_state('load')
        await asyncio.sleep(1)  # Extra wait for custom components

    async def fill_text_field(self, selector: str, value: str) -> bool:
        """Fill a text input field"""
        if not self.page:
            return False

        try:
            # Wait for field to be visible
            await self.page.wait_for_selector(selector, timeout=5000)
            await self.page.fill(selector, value)
            logger.info(f"✓ Filled field with: {value}")
            return True
        except Exception as e:
            logger.debug(f"✗ Could not fill field {selector}: {e}")
            return False

    async def check_checkbox(self, selector: str) -> bool:
        """Check a checkbox"""
        if not self.page:
            return False

        try:
            await self.page.check(selector, timeout=5000)
            logger.info(f"✓ Checked checkbox")
            return True
        except Exception as e:
            logger.debug(f"✗ Could not check checkbox {selector}: {e}")
            return False

    async def select_dropdown_by_text(self, dropdown_selector: str, option_text: str) -> bool:
        """
        Select a dropdown option by visible text
        This is the key function - it works with Greenhouse's custom dropdowns
        """
        if not self.page:
            return False

        try:
            # Click the dropdown to open it
            await self.page.click(dropdown_selector, timeout=5000)
            await asyncio.sleep(0.5)  # Wait for dropdown to open

            # Find and click the option by text
            # Playwright can find elements by visible text
            option_selector = f"text={option_text}"
            await self.page.click(option_selector, timeout=5000)
            logger.info(f"✓ Selected dropdown option: {option_text}")
            return True

        except Exception as e:
            logger.debug(f"✗ Could not select dropdown {dropdown_selector}: {e}")
            return False

    async def select_yes_no_dropdown(self, label_text: str, value: str) -> bool:
        """
        Find and select a Yes/No dropdown by its label
        This uses Playwright's ability to find elements by visible text
        """
        if not self.page:
            return False

        try:
            # Find label containing the text
            label_xpath = f"//label[contains(text(), '{label_text}')]"
            label_element = await self.page.query_selector(label_xpath)

            if not label_element:
                logger.debug(f"✗ Could not find label: {label_text}")
                return False

            # Find parent container
            parent = await label_element.evaluate_handle('el => el.closest("[role=listbox], [role=combobox], .select-container, [class*=select]")')

            if not parent:
                logger.debug("✗ Could not find dropdown container")
                return False

            # Click the dropdown
            await parent.click()
            await asyncio.sleep(0.5)

            # Click the option
            option_xpath = f"//*[text()='{value}']"
            await self.page.click(option_xpath, timeout=5000)
            logger.info(f"✓ Selected '{value}' for: {label_text}")
            return True

        except Exception as e:
            logger.debug(f"✗ Could not select Yes/No dropdown: {e}")
            return False

    async def fill_resume_data(self, resume_data: Dict[str, Any]) -> Dict[str, int]:
        """
        Fill form with resume data
        Returns count of successfully filled fields

        Args:
            resume_data: Dictionary with fields like first_name, last_name, etc.

        Returns:
            Dict with counts: {'text_fields': N, 'checkboxes': N, 'dropdowns': N}
        """
        if not self.page:
            return {}

        counts = {'text_fields': 0, 'checkboxes': 0, 'dropdowns': 0}

        # Get all inputs from main page and iframes
        inputs = []

        # Main page inputs
        main_inputs = await self.page.query_selector_all('input, select, textarea')
        inputs.extend(main_inputs)
        logger.info(f"Found {len(main_inputs)} form elements on main page")

        # Try to find inputs in iframes
        iframes = await self.page.query_selector_all('iframe')
        logger.info(f"Found {len(iframes)} iframes")

        for idx, iframe in enumerate(iframes):
            try:
                # Get frame from iframe element
                frame = await iframe.content_frame()
                if frame:
                    iframe_inputs = await frame.query_selector_all('input, select, textarea')
                    inputs.extend(iframe_inputs)
                    logger.info(f"  Iframe {idx}: Found {len(iframe_inputs)} form elements")
            except Exception as e:
                logger.debug(f"  Iframe {idx}: Could not access - {e}")

        logger.info(f"Total form elements: {len(inputs)}")

        # First pass: Fill text fields and checkboxes
        for field in inputs:
            try:
                field_type = await field.get_attribute('type')
                field_id = await field.get_attribute('id') or ''
                field_name = await field.get_attribute('name') or ''
                placeholder = await field.get_attribute('placeholder') or ''

                context = f"{field_id}|{field_name}|{placeholder}".lower()
            except:
                continue

            # TEXT FIELDS
            if field_type in ['text', 'email', 'tel', None]:
                value = None

                if 'first' in context and 'name' in context:
                    value = resume_data.get('first_name')
                elif 'last' in context and 'name' in context:
                    value = resume_data.get('last_name')
                elif 'email' in context:
                    value = resume_data.get('email')
                elif 'phone' in context or 'tel' in context:
                    value = resume_data.get('phone')
                elif 'city' in context:
                    value = resume_data.get('city')
                elif 'linkedin' in context:
                    value = resume_data.get('linkedin')
                elif 'website' in context or 'portfolio' in context:
                    value = resume_data.get('website')

                if value:
                    try:
                        await field.fill(value)
                        counts['text_fields'] += 1
                        logger.info(f"✓ Filled {field_name}: {value[:30]}")
                    except Exception as e:
                        logger.debug(f"✗ Error filling field: {e}")

            # CHECKBOXES
            elif field_type == 'checkbox':
                if 'linkedin' in context:
                    try:
                        await field.check()
                        counts['checkboxes'] += 1
                        logger.info("✓ Checked LinkedIn checkbox")
                    except Exception as e:
                        logger.debug(f"✗ Error checking checkbox: {e}")

        # Second pass: Handle dropdown selects using simple click + keyboard
        logger.info("\nHandling dropdown questions...")

        # Find all Select... buttons and process them one by one
        try:
            # Get all Select... text elements (these are the dropdown triggers)
            select_buttons = await self.page.query_selector_all('text="Select..."')
            logger.info(f"Found {len(select_buttons)} 'Select...' buttons")

            for i, button in enumerate(select_buttons[:4]):  # Limit to first 4 (the Yes/No ones)
                try:
                    logger.info(f"Dropdown {i + 1}: Processing...")

                    # Scroll this button into view
                    await button.scroll_into_view_if_needed()
                    await asyncio.sleep(0.3)

                    # Click the button
                    logger.info(f"  Clicking Select...")
                    await button.click()
                    await asyncio.sleep(0.5)

                    # Press ArrowDown to highlight first option
                    logger.info(f"  Pressing ArrowDown...")
                    await self.page.keyboard.press('ArrowDown')
                    await asyncio.sleep(0.3)

                    # Press Enter to select
                    logger.info(f"  Pressing Enter...")
                    await self.page.keyboard.press('Enter')
                    await asyncio.sleep(0.5)

                    counts['dropdowns'] += 1
                    logger.info(f"  ✓ Dropdown {i + 1} selected")

                except Exception as e:
                    logger.debug(f"Dropdown {i + 1} error: {e}")
                    continue

            logger.info(f"Completed {counts['dropdowns']} dropdowns")

        except Exception as e:
            logger.debug(f"Dropdown processing error: {e}")

        return counts

    async def get_screenshot(self, filename: str = None) -> str:
        """Take screenshot for debugging"""
        if not self.page:
            return ""

        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"screenshot_{timestamp}.png"

        await self.page.screenshot(path=filename)
        logger.info(f"Screenshot saved: {filename}")
        return filename


async def main():
    """CLI entry point"""
    parser = argparse.ArgumentParser(
        description='Automate Greenhouse job application form filling'
    )
    parser.add_argument('--url', required=True, help='Greenhouse job form URL')
    parser.add_argument('--resume-data', help='JSON string with resume data')
    parser.add_argument('--resume-file', help='Path to JSON file with resume data')
    parser.add_argument('--backend-url', default='http://localhost:8000', help='Backend API URL')
    parser.add_argument('--resume-id', help='Resume ID from backend (uses latest if not specified)')
    parser.add_argument('--headless', action='store_true', help='Run in headless mode')
    parser.add_argument('--slow-mo', type=int, default=100, help='Slow down by N ms')
    parser.add_argument('--screenshot', help='Save screenshot to file')

    args = parser.parse_args()

    # Load resume data - prefer backend API
    resume_data = {}
    if args.backend_url:
        try:
            import requests
            endpoint = f"{args.backend_url}/api/v1/resume/{args.resume_id}/data" if args.resume_id else f"{args.backend_url}/api/v1/resume/latest/data"
            logger.info(f"Fetching resume from: {endpoint}")
            response = requests.get(endpoint, timeout=10)
            if response.ok:
                resume_data = response.json()
                logger.info("✓ Loaded resume from backend")
            else:
                logger.warning(f"Backend returned {response.status_code}, falling back to file")
        except Exception as e:
            logger.warning(f"Could not fetch from backend: {e}, falling back to file")

    # Fallback to file if backend didn't work
    if not resume_data:
        if args.resume_data:
            resume_data = json.loads(args.resume_data)
        elif args.resume_file:
            with open(args.resume_file) as f:
                resume_data = json.load(f)
        else:
            logger.error("No resume data provided. Use --backend-url, --resume-data, or --resume-file")
            exit(1)

    # Run automation
    automation = GreenhouseAutomation(headless=args.headless, slow_mo=args.slow_mo)
    try:
        await automation.launch()
        await automation.navigate(args.url)

        # Fill form
        if resume_data:
            counts = await automation.fill_resume_data(resume_data)
            logger.info(f"✓ Form filled: {counts}")

        # Take screenshot
        if args.screenshot:
            await automation.get_screenshot(args.screenshot)
        else:
            await automation.get_screenshot()

        # Keep browser open for manual interaction if not headless
        if not args.headless:
            logger.info("Browser open for manual interaction. Close to exit.")
            await asyncio.sleep(300)  # Wait 5 minutes

    except Exception as e:
        logger.error(f"Automation failed: {e}")
    finally:
        await automation.close()


if __name__ == '__main__':
    asyncio.run(main())
