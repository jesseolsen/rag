#!/usr/bin/env python3
"""
Inspect the full structure of the select container
"""

import asyncio
from playwright.async_api import async_playwright

async def test():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        url = "https://job-boards.greenhouse.io/embed/job_app?for=coalition&jr_id=699f309994ef206f184e4fd6&token=4665924005&utm_source=jobright"

        print("Loading page...")
        await page.goto(url, wait_until='networkidle')
        await page.wait_for_load_state('load')
        await asyncio.sleep(2)

        print("Scrolling down...")
        await page.evaluate("window.scrollBy(0, 2000)")
        await asyncio.sleep(1)

        # Get the full HTML structure of the first select
        html = await page.evaluate("""
            () => {
                const container = document.querySelector('.select__input-container');
                if (!container) return 'NOT FOUND';

                return container.outerHTML;
            }
        """)

        print("Select container HTML:")
        print(html[:2000])

        await browser.close()

asyncio.run(test())
