#!/usr/bin/env python3
"""
Minimal test - just select ONE Yes/No dropdown
"""

import asyncio
from playwright.async_api import async_playwright

async def test():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)  # visible so we can see it
        page = await browser.new_page()

        url = "https://job-boards.greenhouse.io/embed/job_app?for=coalition&jr_id=699f309994ef206f184e4fd6&token=4665924005&utm_source=jobright"

        print("Loading page...")
        await page.goto(url, wait_until='networkidle')
        await page.wait_for_load_state('load')
        await asyncio.sleep(2)

        # Fill text fields
        print("Filling text fields...")
        await page.fill('input[name*="first"]', 'Jesse')
        await page.fill('input[name*="last"]', 'Olsen')

        print("Scrolling down to find first Yes/No dropdown...")
        await page.evaluate("window.scrollBy(0, 2000)")
        await asyncio.sleep(1)

        # Find the "Have you ever worked for Coalition before?" dropdown
        print("Finding dropdown element...")

        # Look for the select dropdown that contains our question
        dropdowns = await page.query_selector_all('[role="combobox"], select')
        print(f"Found {len(dropdowns)} combobox/select elements")

        if len(dropdowns) > 0:
            dropdown = dropdowns[0]
            print(f"First dropdown found. Clicking it...")

            # Click to open
            await dropdown.click()
            await asyncio.sleep(0.5)

            # Press ArrowDown once to get to "No"
            print("Pressing ArrowDown...")
            await page.keyboard.press('ArrowDown')
            await asyncio.sleep(0.3)

            # Press Enter to select
            print("Pressing Enter to select...")
            await page.keyboard.press('Enter')
            await asyncio.sleep(0.5)

            print("✓ Done! Check the browser to see if it selected Yes/No")

        # Keep browser open for inspection
        print("Keeping browser open for 10 seconds...")
        await asyncio.sleep(10)

        await browser.close()

asyncio.run(test())
