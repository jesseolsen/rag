"""API endpoints for company information."""

from fastapi import APIRouter, HTTPException
from typing import Optional
import requests
from bs4 import BeautifulSoup
import re
import urllib.parse

router = APIRouter(prefix="/api/v1/companies", tags=["companies"])


@router.get("/glassdoor-rating")
async def get_glassdoor_rating(company_name: str):
    """Fetch Glassdoor rating for a company.

    Args:
        company_name: Name of the company to look up

    Returns:
        Dict with rating, review_count, and glassdoor_url if found
    """
    try:
        # Try to get company overview page directly using common URL pattern
        # This is more likely to succeed than search
        company_slug = company_name.lower().replace(' ', '-').replace(',', '').replace('.', '')
        overview_url = f"https://www.glassdoor.com/Overview/Working-at-{company_slug}-EI_IE.htm"

        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': 'max-age=0',
        }

        # Try direct overview page first
        response = requests.get(overview_url, headers=headers, timeout=10, allow_redirects=True)

        # If direct URL doesn't work (404/403), try search
        if response.status_code in [403, 404]:
            search_url = f"https://www.glassdoor.com/Search/results.htm?keyword={urllib.parse.quote(company_name)}"
            response = requests.get(search_url, headers=headers, timeout=10, allow_redirects=True)

        if response.status_code != 200:
            return {
                "found": False,
                "error": f"Glassdoor returned status {response.status_code}"
            }

        soup = BeautifulSoup(response.text, 'html.parser')

        # Try multiple methods to find company overview links
        company_url = None

        # Method 1: Look for data-test attribute (newer Glassdoor)
        company_link = soup.find('a', {'data-test': 'employer-overview-link'})
        if company_link:
            company_url = company_link.get('href', '')

        # Method 2: Look for Overview/Working-at URLs
        if not company_url:
            company_link = soup.find('a', href=re.compile(r'/Overview/Working-at-'))
            if company_link:
                company_url = company_link.get('href', '')

        # Method 3: Look for employer name links in search results
        if not company_url:
            # Try to find links with "employer" in the class or data attributes
            for link in soup.find_all('a', href=True):
                href = link.get('href', '')
                if '/Overview/Working-at-' in href or '/Reviews/' in href and '-Reviews-' in href:
                    # Convert Reviews URL to Overview URL if needed
                    if '/Reviews/' in href:
                        # Extract company slug from Reviews URL and convert to Overview
                        match = re.search(r'/Reviews/(.+?)-Reviews-', href)
                        if match:
                            company_slug = match.group(1)
                            company_url = f"/Overview/Working-at-{company_slug}"
                    else:
                        company_url = href
                    break

        # Method 4: Look in JSON-LD structured data
        if not company_url:
            script_tags = soup.find_all('script', type='application/ld+json')
            for script in script_tags:
                try:
                    import json
                    data = json.loads(script.string)
                    if isinstance(data, dict) and 'url' in data:
                        url = data['url']
                        if 'glassdoor.com' in url and ('Overview' in url or 'Working-at' in url):
                            company_url = url
                            break
                except:
                    continue

        if not company_url:
            return {
                "found": False,
                "error": "Company not found in search results"
            }

        # Ensure full URL
        if company_url.startswith('/'):
            company_url = f"https://www.glassdoor.com{company_url}"

        print(f"[GLASSDOOR] Found company URL: {company_url}")

        # Fetch the company overview page
        overview_response = requests.get(company_url, headers=headers, timeout=10, allow_redirects=True)

        if overview_response.status_code != 200:
            return {
                "found": False,
                "error": "Could not fetch company overview page"
            }

        overview_soup = BeautifulSoup(overview_response.text, 'html.parser')

        # Extract rating - Glassdoor shows ratings in various formats
        rating = None
        review_count = None

        # Method 1: Look in JSON-LD schema first (most reliable)
        script_tags = overview_soup.find_all('script', type='application/ld+json')
        for schema_script in script_tags:
            try:
                import json
                schema_data = json.loads(schema_script.string)
                if isinstance(schema_data, dict) and 'aggregateRating' in schema_data:
                    rating = float(schema_data['aggregateRating'].get('ratingValue', 0))
                    review_count = int(schema_data['aggregateRating'].get('reviewCount', 0))
                    if rating > 0:
                        print(f"[GLASSDOOR] Found rating in JSON-LD: {rating}")
                        break
            except:
                continue

        # Method 2: Look for data-test attributes
        if rating is None:
            rating_elem = overview_soup.find('div', {'data-test': 'rating'})
            if not rating_elem:
                rating_elem = overview_soup.find('span', {'data-test': 'rating'})

            if rating_elem:
                rating_text = rating_elem.get_text(strip=True)
                rating_match = re.search(r'(\d+\.?\d*)', rating_text)
                if rating_match:
                    rating = float(rating_match.group(1))
                    print(f"[GLASSDOOR] Found rating in data-test: {rating}")

        # Method 3: Look for rating in common class names
        if rating is None:
            # Try different selectors
            for selector in [
                ('div', re.compile(r'rating|ratingNum|employer-rating')),
                ('span', re.compile(r'rating|ratingNum|employer-rating')),
            ]:
                elem = overview_soup.find(selector[0], class_=selector[1])
                if elem:
                    rating_text = elem.get_text(strip=True)
                    rating_match = re.search(r'(\d+\.?\d*)', rating_text)
                    if rating_match:
                        potential_rating = float(rating_match.group(1))
                        # Glassdoor ratings are 0-5, sanity check
                        if 0 <= potential_rating <= 5:
                            rating = potential_rating
                            print(f"[GLASSDOOR] Found rating in class: {rating}")
                            break

        # Method 4: Search page text for rating patterns
        if rating is None:
            page_text = overview_soup.get_text()
            # Look for patterns like "4.6 out of 5" or "4.6★"
            rating_match = re.search(r'(\d+\.\d+)\s*(?:out of 5|★|stars?)', page_text)
            if rating_match:
                potential_rating = float(rating_match.group(1))
                if 0 <= potential_rating <= 5:
                    rating = potential_rating
                    print(f"[GLASSDOOR] Found rating in text: {rating}")

        # Extract review count
        if review_count is None:
            # Look for "based on X ratings/reviews"
            review_patterns = [
                r'based on ([\d,]+)\s*(?:ratings?|reviews?)',
                r'([\d,]+)\s*(?:ratings?|reviews?)',
                r'reviewCount["\s:]+(\d+)',
            ]
            page_text = overview_soup.get_text()
            for pattern in review_patterns:
                review_match = re.search(pattern, page_text, re.IGNORECASE)
                if review_match:
                    count_str = review_match.group(1).replace(',', '')
                    try:
                        review_count = int(count_str)
                        print(f"[GLASSDOOR] Found review count: {review_count}")
                        break
                    except:
                        continue

        if rating is not None:
            return {
                "found": True,
                "rating": rating,
                "review_count": review_count,
                "glassdoor_url": company_url,
                "company_name": company_name
            }
        else:
            return {
                "found": False,
                "error": "Could not extract rating from page",
                "glassdoor_url": company_url
            }

    except requests.Timeout:
        return {
            "found": False,
            "error": "Request timed out"
        }
    except Exception as e:
        print(f"[GLASSDOOR] Error fetching rating: {e}")
        return {
            "found": False,
            "error": str(e)
        }
