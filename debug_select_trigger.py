#!/usr/bin/env python3
"""
Test different ways to trigger the dropdown
"""

import asyncio
from playwright.async_api import async_playwright

async def test():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()

        url = "https://job-boards.greenhouse.io/embed/job_app?for=coalition&jr_id=699f309994ef206f184e4fd6&token=4665924005&utm_source=jobright"

        print("Loading page...")
        await page.goto(url, wait_until='networkidle')
        await page.wait_for_load_state('load')
        await asyncio.sleep(2)

        print("Scrolling down...")
        await page.evaluate("window.scrollBy(0, 2000)")
        await asyncio.sleep(1)

        print("\nFinding select containers...")
        containers = await page.query_selector_all('.select__input-container, [class*="select__input"]')
        print(f"Found {len(containers)} select input containers")

        if containers:
            container = containers[0]

            print("\nTrying different interaction methods...")

            # Method 1: Click the input container itself
            print("\n1. Trying to click the input container...")
            try:
                await container.click(timeout=1000)
                print("   ✓ Clicked input container")
                await asyncio.sleep(0.5)

                # Check if menu appeared
                menu_visible = await page.evaluate("""
                    () => {
                        const menus = document.querySelectorAll('[class*="menu"], [class*="dropdown"], [role="listbox"]');
                        for (let m of menus) {
                            const style = window.getComputedStyle(m);
                            if (style.display !== 'none' && m.textContent.includes('Yes')) {
                                return true;
                            }
                        }
                        return false;
                    }
                """)
                print(f"   Menu visible: {menu_visible}")

                if menu_visible:
                    print("\n   2. Pressing ArrowDown...")
                    await page.keyboard.press('ArrowDown')
                    await asyncio.sleep(0.2)

                    print("   3. Pressing Enter...")
                    await page.keyboard.press('Enter')
                    await asyncio.sleep(0.5)

                    # Check what value got selected
                    selected = await page.evaluate("""
                        () => {
                            const text = document.querySelector('.select__placeholder, [class*="placeholder"]');
                            return text ? text.textContent : 'unknown';
                        }
                    """)
                    print(f"   Selected value: {selected}")

            except Exception as e:
                print(f"   ✗ Error: {e}")

        print("\nKeeping browser open 10 seconds...")
        await asyncio.sleep(10)
        await browser.close()

asyncio.run(test())
