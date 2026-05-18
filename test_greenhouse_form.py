#!/usr/bin/env python3
"""
Test Greenhouse form filling with Playwright
Handles iframes and dynamic form elements
"""

import asyncio
import json
import logging
from playwright.async_api import async_playwright

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def test_greenhouse_form():
    """Test filling Greenhouse job form"""

    # Load resume data
    with open('tests/fixtures/resume_data.json') as f:
        resume_data = json.load(f)

    logger.info("Starting Greenhouse form test")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, slow_mo=100)
        page = await browser.new_page()

        # Test with a real Coalition job form
        # If the job doesn't exist, try: https://job-boards.greenhouse.io/embed/job_board?for=coalition
        # to find current job IDs
        job_url = "https://job-boards.greenhouse.io/embed/job_app?for=coalition&jr_id=699f309994ef206f184e4fd6"

        logger.info(f"Loading: {job_url}")
        try:
            await page.goto(job_url, wait_until='networkidle', timeout=30000)
        except Exception as e:
            logger.error(f"Failed to load page: {e}")
            await browser.close()
            return

        # Wait a bit for JavaScript to render
        await page.wait_for_load_state('load')
        await asyncio.sleep(2)

        # Log what we found
        logger.info("Checking page structure...")

        # Check for iframes
        iframes = await page.query_selector_all('iframe')
        logger.info(f"Found {len(iframes)} iframes")

        # Look for form elements
        form_inputs = await page.query_selector_all('input, select, textarea')
        logger.info(f"Found {len(form_inputs)} form elements on main page")

        # Check each iframe
        for i, iframe in enumerate(iframes):
            try:
                frame = await iframe.content_frame()
                if frame:
                    iframe_inputs = await frame.query_selector_all('input, select, textarea')
                    logger.info(f"  Iframe {i}: {len(iframe_inputs)} form elements")

                    # Try to fill fields in iframe
                    for field in iframe_inputs:
                        try:
                            field_type = await field.get_attribute('type')
                            field_id = await field.get_attribute('id')
                            field_name = await field.get_attribute('name')
                            placeholder = await field.get_attribute('placeholder')

                            context = f"{field_id}|{field_name}|{placeholder}".lower()

                            # Match and fill
                            if 'first' in context and 'name' in context:
                                await field.fill(resume_data['first_name'])
                                logger.info(f"    ✓ Filled first name")
                            elif 'last' in context and 'name' in context:
                                await field.fill(resume_data['last_name'])
                                logger.info(f"    ✓ Filled last name")
                            elif 'email' in context:
                                await field.fill(resume_data['email'])
                                logger.info(f"    ✓ Filled email")
                            elif 'phone' in context or 'tel' in context:
                                await field.fill(resume_data['phone'])
                                logger.info(f"    ✓ Filled phone")
                            elif 'city' in context:
                                await field.fill(resume_data['city'])
                                logger.info(f"    ✓ Filled city")
                        except Exception as e:
                            logger.debug(f"    Could not fill field: {e}")

            except Exception as e:
                logger.debug(f"  Iframe {i}: Could not access - {e}")

        # Look for dropdowns/buttons by visible text
        logger.info("\nLooking for Yes/No dropdown buttons...")

        # Try to find all visible buttons/elements
        all_elements = await page.query_selector_all('button, div[role="button"], div[class*="button"]')
        logger.info(f"Found {len(all_elements)} button-like elements")

        # Try to find elements with "Yes" or "No" text
        try:
            yes_buttons = await page.query_selector_all('text=Yes')
            no_buttons = await page.query_selector_all('text=No')
            logger.info(f"Found {len(yes_buttons)} 'Yes' elements and {len(no_buttons)} 'No' elements")
        except:
            pass

        # Keep browser open for manual inspection (non-headless)
        logger.info("\nBrowser will stay open for 30 seconds for inspection...")
        logger.info("You can manually inspect the form structure")
        logger.info("Check the Elements tab in DevTools to see how the form is structured")

        await asyncio.sleep(30)
        await browser.close()
        logger.info("Done!")


if __name__ == '__main__':
    asyncio.run(test_greenhouse_form())
