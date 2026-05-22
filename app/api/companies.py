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

        # Try to find the first company result
        # Glassdoor search results have company cards with ratings
        company_link = soup.find('a', {'data-test': 'employer-overview-link'})

        if not company_link:
            # Try alternative selectors
            company_link = soup.find('a', href=re.compile(r'/Overview/Working-at-'))

        if not company_link:
            return {
                "found": False,
                "error": "Company not found on Glassdoor"
            }

        # Get the company overview URL
        company_url = company_link.get('href', '')
        if company_url.startswith('/'):
            company_url = f"https://www.glassdoor.com{company_url}"

        # Fetch the company overview page
        overview_response = requests.get(company_url, headers=headers, timeout=10)

        if overview_response.status_code != 200:
            return {
                "found": False,
                "error": "Could not fetch company overview page"
            }

        overview_soup = BeautifulSoup(overview_response.text, 'html.parser')

        # Extract rating - Glassdoor shows ratings in various formats
        rating = None
        review_count = None

        # Try to find rating in the page
        # Look for the rating number (e.g., "4.6")
        rating_elem = overview_soup.find('div', {'data-test': 'rating'})
        if not rating_elem:
            rating_elem = overview_soup.find('span', class_=re.compile(r'rating'))

        if rating_elem:
            rating_text = rating_elem.get_text(strip=True)
            # Extract number from text like "4.6★" or "4.6"
            rating_match = re.search(r'(\d+\.?\d*)', rating_text)
            if rating_match:
                rating = float(rating_match.group(1))

        # Try to find review count
        review_elem = overview_soup.find(text=re.compile(r'based on \d+ ratings'))
        if review_elem:
            review_match = re.search(r'(\d+)\s*ratings?', review_elem)
            if review_match:
                review_count = int(review_match.group(1))

        if rating is None:
            # Try alternative method - look in JSON-LD schema
            schema_script = overview_soup.find('script', type='application/ld+json')
            if schema_script:
                import json
                try:
                    schema_data = json.loads(schema_script.string)
                    if 'aggregateRating' in schema_data:
                        rating = float(schema_data['aggregateRating'].get('ratingValue', 0))
                        review_count = int(schema_data['aggregateRating'].get('reviewCount', 0))
                except:
                    pass

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
