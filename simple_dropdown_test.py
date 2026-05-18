#!/usr/bin/env python3
"""
Simple approach: Find "Select..." button, click it, use arrow keys
"""

import asyncio
from playwright.async_api import async_playwright

async def test():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)  # visible
        page = await browser.new_page()

        url = "https://job-boards.greenhouse.io/embed/job_app?for=coalition&jr_id=699f309994ef206f184e4fd6&token=4665924005&utm_source=jobright"

        print("1. Loading page...")
        await page.goto(url, wait_until='networkidle')
        await page.wait_for_load_state('load')
        await asyncio.sleep(2)

        print("2. Scrolling to dropdowns...")
        await page.evaluate("window.scrollBy(0, 2500)")
        await asyncio.sleep(1)

        print("3. Finding the first Select... button...")
        # Wait for a Select... button to be visible
        try:
            # Find the first visible "Select..." element
            select_button = await page.wait_for_selector('text="Select..."', timeout=5000)
            print("   ✓ Found Select... button")

            print("4. Clicking the Select... button...")
            await select_button.click()
            await asyncio.sleep(0.5)

            print("5. Pressing ArrowDown to select 'No'...")
            await page.keyboard.press('ArrowDown')
            await asyncio.sleep(0.3)

            print("6. Pressing Enter to confirm...")
            await page.keyboard.press('Enter')
            await asyncio.sleep(0.5)

            print("✓ SUCCESS! Check the dropdown - it should show 'No' selected")

        except Exception as e:
            print(f"✗ Error: {e}")

        print("\n7. Keeping browser open for 10 seconds to inspect...")
        await asyncio.sleep(10)

        await browser.close()

asyncio.run(test())
