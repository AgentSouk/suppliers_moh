"""
Scrapes Schwarzkopf Professional products from schwarzkopf-professional.com.
Photos: Playwright (images are lazy-loaded, need real browser).
EANs:   Open Beauty Facts /brand/schwarzkopf.json (matched by name).
Saves to schwarzkopf_products.json

Run: python3 schwarzkopf_scraper.py
Resume-safe: skips URLs already scraped.
"""

import asyncio, json, re, urllib.request
from pathlib import Path
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

OUTPUT = Path(__file__).parent / "schwarzkopf_products.json"
BASE   = "https://www.schwarzkopf-professional.com"

# All product category pages to crawl
CATEGORY_PAGES = [
    # Color
    f"{BASE}/us/en/color/igora.html",
    f"{BASE}/us/en/color/blondme-color.html",
    f"{BASE}/us/en/color/chroma-id.html",
    f"{BASE}/us/en/color/goodbye-yellow.html",
    # Care
    f"{BASE}/us/en/care/fibre-clinix.html",
    f"{BASE}/us/en/care/blondme-care.html",
    f"{BASE}/us/en/care/bc-bonacure.html",
    # Styling
    f"{BASE}/us/en/styling/osis.html",
    # Top-level fallbacks
    f"{BASE}/us/en/color.html",
    f"{BASE}/us/en/care.html",
    f"{BASE}/us/en/styling.html",
]

OBF_URL = "https://world.openbeautyfacts.org/brand/schwarzkopf.json"


def fetch_obf_eans() -> dict[str, str]:
    """Fetch EANs from Open Beauty Facts for Schwarzkopf brand. Returns {normalized_name: ean}."""
    eans: dict[str, str] = {}
    page = 1
    print("Fetching EANs from Open Beauty Facts...")
    while True:
        try:
            url = f"{OBF_URL}?page={page}"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            data = json.loads(urllib.request.urlopen(req, timeout=15).read())
            products = data.get("products", [])
            if not products:
                break
            for p in products:
                name = (p.get("product_name") or "").strip()
                code = (p.get("code") or "").strip()
                if name and code and len(code) >= 8:
                    eans[name.lower()] = code
                    # Also index by shorter name variants
                    short = re.sub(r'\s+\d+\s*(ml|g|oz).*$', '', name, flags=re.I).strip().lower()
                    if short != name.lower():
                        eans[short] = code
            print(f"  OBF page {page}: {len(products)} products, {len(eans)} EANs so far")
            if len(products) < 20:
                break
            page += 1
        except Exception as e:
            print(f"  OBF page {page} error: {e}")
            break
    print(f"  Total EANs loaded: {len(eans)}")
    return eans


def match_ean(name: str, eans: dict[str, str]) -> str | None:
    """Try to match a product name to an EAN."""
    key = name.lower().strip()
    if key in eans:
        return eans[key]
    # Try partial match — check if any EAN key is a substring of the product name
    for k, v in eans.items():
        if k and (k in key or key in k):
            return v
    return None


async def scrape_category(page, url: str, seen_urls: set) -> list[dict]:
    """Scrape all product links from a category/listing page."""
    products = []
    try:
        await page.goto(url, wait_until="networkidle", timeout=30000)
        await dismiss_cookies(page)
        await page.wait_for_timeout(2000)

        # Find all product card links
        links = await page.eval_on_selector_all(
            "a[href*='/us/en/']",
            "els => els.map(e => ({href: e.href, text: e.innerText.trim()}))"
        )

        product_links = []
        for l in links:
            href = l.get("href", "")
            # Only follow deep product pages (not category pages)
            if (href and href not in seen_urls
                    and href.count("/") >= 7  # deep enough to be a product
                    and not href.endswith("/color.html")
                    and not href.endswith("/care.html")
                    and not href.endswith("/styling.html")
                    and ".html" in href):
                product_links.append(href)
                seen_urls.add(href)

        print(f"  Found {len(product_links)} product links on {url.split('/us/en/')[-1]}")
        return product_links

    except Exception as e:
        print(f"  Error on {url}: {e}")
        return []


async def dismiss_cookies(page):
    """Click cookie accept button if present."""
    try:
        btn = await page.query_selector("#onetrust-accept-btn-handler, [class*='accept-all'], button:has-text('Accept')")
        if btn:
            await btn.click()
            await page.wait_for_timeout(800)
    except Exception:
        pass


async def scrape_product(page, url: str) -> dict | None:
    """Scrape a single product page for name, image, description, category."""
    try:
        await page.goto(url, wait_until="networkidle", timeout=25000)
        await dismiss_cookies(page)
        await page.wait_for_timeout(2000)

        # Extract product data
        data = await page.evaluate("""() => {
            const name = (
                document.querySelector('h1') ||
                document.querySelector('.product-title') ||
                document.querySelector('[class*="headline"]')
            )?.innerText?.trim() || '';

            // Find best image — exclude cookielaw and data URIs, prefer schwarzkopf CDN
            const imgs = Array.from(document.querySelectorAll('img[src]'))
                .map(i => i.src)
                .filter(s => s && !s.startsWith('data:') && !s.includes('cookielaw') && !s.includes('cookie')
                    && (s.includes('schwarzkopf') || s.includes('cdn') || s.includes('media') || s.includes('product')));
            const photo = imgs[0] || null;

            const desc = (
                document.querySelector('[class*="description"] p') ||
                document.querySelector('[class*="intro"] p') ||
                document.querySelector('main p')
            )?.innerText?.trim() || '';

            // Category from breadcrumb
            const crumbs = Array.from(document.querySelectorAll('[class*="breadcrumb"] a, nav[aria-label*="bread"] a'))
                .map(a => a.innerText.trim()).filter(Boolean);

            return { name, photo, desc, crumbs };
        }""")

        if not data.get("name"):
            return None

        # Derive category from URL or breadcrumb
        parts = url.replace(BASE, "").split("/")
        category = parts[4].replace("-", " ").title() if len(parts) > 4 else ""
        sub_category = parts[5].replace("-", " ").title() if len(parts) > 5 else ""

        return {
            "name":         data["name"],
            "photo":        data.get("photo"),
            "description":  data.get("desc"),
            "category":     category,
            "sub_category": sub_category,
            "url":          url,
        }

    except Exception as e:
        print(f"    Error scraping {url}: {e}")
        return None


async def scrape():
    # Load existing
    existing: dict[str, dict] = {}
    if OUTPUT.exists():
        try:
            for p in json.loads(OUTPUT.read_text()):
                if p.get("url"):
                    existing[p["url"]] = p
            print(f"Loaded {len(existing)} existing products")
        except Exception:
            pass

    # Fetch EANs from Open Beauty Facts
    eans = fetch_obf_eans()

    all_products: dict[str, dict] = dict(existing)
    seen_urls = set(existing.keys())

    stealth = Stealth()
    async with stealth.use_async(async_playwright()) as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()

        # Phase 1: collect all product URLs from category pages
        print("\n=== Phase 1: collecting product URLs ===")
        all_product_urls: list[str] = []
        for cat_url in CATEGORY_PAGES:
            links = await scrape_category(page, cat_url, seen_urls)
            all_product_urls.extend(links)

        print(f"\nTotal new product URLs: {len(all_product_urls)}")

        # Phase 2: scrape each product page
        print("\n=== Phase 2: scraping product pages ===")
        saved = 0
        for i, url in enumerate(all_product_urls):
            prod = await scrape_product(page, url)
            if prod:
                # Match EAN
                prod["ean"] = match_ean(prod["name"], eans)
                prod["sku"] = None
                prod["brand"] = "Schwarzkopf Professional"
                prod["price"] = None
                prod["currency"] = "AED"
                prod["supplier"] = "Schwarzkopf"
                prod["id"] = re.sub(r'[^a-z0-9]+', '-', url.lower()).strip('-')[-200:]
                all_products[url] = prod
                saved += 1

            if (i + 1) % 20 == 0:
                _save(all_products)
                print(f"  [{i+1}/{len(all_product_urls)}] saved: {saved}")
            else:
                print(f"  [{i+1}/{len(all_product_urls)}] {prod['name'] if prod else 'skip'}", end="\r")

            await asyncio.sleep(0.5)

        await browser.close()

    _save(all_products)
    result = list(all_products.values())
    print(f"\n✓ Saved {len(result)} products to {OUTPUT}")

    has_ean = sum(1 for p in result if p.get("ean"))
    has_photo = sum(1 for p in result if p.get("photo"))
    print(f"  Has EAN: {has_ean}/{len(result)}")
    print(f"  Has photo: {has_photo}/{len(result)}")

    cats: dict[str, int] = {}
    for p in result:
        cats[p.get("category") or "Other"] = cats.get(p.get("category") or "Other", 0) + 1
    print("\nBy category:")
    for c, n in sorted(cats.items(), key=lambda x: -x[1]):
        print(f"  {c:35s} {n:4d}")


def _save(products: dict):
    OUTPUT.write_text(json.dumps(list(products.values()), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(scrape())
