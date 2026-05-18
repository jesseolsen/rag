#!/usr/bin/env python3
"""
Inspect what the dropdown looks like when open
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

        print("Finding first Select... button...")
        select_buttons = await page.query_selector_all('text="Select..."')
        print(f"Found {len(select_buttons)} Select... buttons")

        if select_buttons:
            button = select_buttons[0]

            print("\n1. Before click - button HTML:")
            button_html = await button.evaluate("el => el.outerHTML")
            print(button_html[:200])

            print("\n2. Clicking button with JS...")
            await button.evaluate("el => el.click()")
            await asyncio.sleep(0.5)

            print("\n3. After click - button HTML:")
            button_html = await button.evaluate("el => el.outerHTML")
            print(button_html[:200])

            print("\n4. Looking for menu/options in page...")
            page_html = await page.evaluate("""
                () => {
                    // Look for visible dropdowns
                    const menus = document.querySelectorAll('[role="menu"], [role="listbox"], [class*="menu"], [class*="dropdown"], [class*="options"]');
                    console.log(`Found ${menus.length} potential menu elements`);

                    let result = [];
                    menus.forEach((m, i) => {
                        const style = window.getComputedStyle(m);
                        const visible = style.display !== 'none' && style.visibility !== 'hidden';
                        const text = m.textContent.substring(0, 100);
                        result.push(`${i}: ${m.tagName}.${m.className.substring(0, 30)} visible=${visible} text="${text}"`);
                    });

                    return result.join('\\n');
                }
            """)
            print(page_html)

            print("\n5. Looking for Yes/No text...")
            yes_no = await page.evaluate("""
                () => {
                    const elements = document.querySelectorAll('*');
                    let result = [];
                    elements.forEach(el => {
                        if ((el.textContent === 'Yes' || el.textContent === 'No') && el.offsetParent !== null) {
                            result.push(`${el.tagName}.${el.className.substring(0, 30)} text="${el.textContent}"`);
                        }
                    });
                    return result.join('\\n');
                }
            """)
            print(yes_no if yes_no else "No Yes/No text found")

        print("\nKeeping browser open for 10 seconds...")
        await asyncio.sleep(10)

        await browser.close()

asyncio.run(test())
