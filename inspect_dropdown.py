#!/usr/bin/env python3
"""
Inspect the actual HTML structure of the dropdown
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

        # Get info about the dropdown
        dropdown_info = await page.evaluate('''
            () => {
                // Find the text "Have you ever worked"
                const elements = Array.from(document.querySelectorAll('*'));
                const labelElement = elements.find(el =>
                    el.textContent.includes('Have you ever worked for Coalition before')
                );

                if (!labelElement) {
                    return { error: 'Could not find label' };
                }

                console.log('Found label element:', labelElement.tagName, labelElement.className);

                // Find the closest parent fieldset or container
                let parent = labelElement.parentElement;
                let depth = 0;
                while (parent && depth < 10) {
                    console.log(`Parent ${depth}:`, parent.tagName, parent.className);

                    // Look for the dropdown in this parent
                    const dropdowns = parent.querySelectorAll('input, select, button, div[role="button"], div[class*="select"]');
                    if (dropdowns.length > 0) {
                        console.log(`  Found ${dropdowns.length} interactive elements`);
                        dropdowns.forEach((dd, i) => {
                            console.log(`    ${i}: ${dd.tagName}.${dd.className} text="${dd.textContent.substring(0, 30)}"`);
                        });
                    }

                    parent = parent.parentElement;
                    depth++;
                }

                return { found: true, depth };
            }
        ''')

        print("Dropdown info:")
        print(dropdown_info)

        await browser.close()

asyncio.run(test())
