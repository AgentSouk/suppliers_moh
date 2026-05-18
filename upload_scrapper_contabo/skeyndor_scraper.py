"""
Scrapes all Skeyndor product lines from skeyndor.com/en/line/{slug}/
Extracts product data from JSON-LD on each product page.
SKU field = EAN barcode (13-digit GS1).
Saves to skeyndor_products.json

Run:  python3 skeyndor_scraper.py
Resume-safe: skips URLs already in the JSON.
"""

import asyncio, json, re
from pathlib import Path
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

OUTPUT = Path(__file__).parent / "skeyndor_products.json"
BASE   = "https://skeyndor.com/en"

# (line_slug, display_category)
LINES = [
    ("power-hyaluronic",    "Power Hyaluronic"),
    ("megan",               "Megan"),
    ("probiome-peel",       "Probiome Peel"),
    ("power-c",             "Power C+"),
    ("corrective",          "Corrective"),
    ("expert-cleanse-pro",  "Expert Cleanse Pro"),
    ("power-oxygen",        "Power Oxygen"),
    ("eternal",             "Eternal"),
    ("aquatherm",           "Aquatherm"),
    ("power-retinol",       "Power Retinol"),
    ("global-lift",         "Global Lift"),
    ("clearist",            "Clearist"),
    ("uniqcure",            "Uniqcure"),
    ("timeless-prodigy",    "Timeless Prodigy"),
    ("age-photo-defense",   "Age Photo Defense"),
    ("essential",           "Essential"),
    ("slim-drone",          "Slim Drone"),
    ("skin-care-makeup",    "Skincare Makeup"),
    ("spa-senses",          "Spa Senses"),
]

DETAIL_JS = """
() => {
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const s of scripts) {
        try {
            const d = JSON.parse(s.textContent);
            const graph = d['@graph'] || (Array.isArray(d) ? d : [d]);
            for (const item of graph) {
                if (item['@type'] === 'Product') {
                    const images = (item.image || []).map(i =>
                        typeof i === 'string' ? i : (i.url || '')
                    ).filter(Boolean);
                    const offer = item.offers || {};
                    const desc = (item.description || '').trim();
                    // Full description from page body
                    const bodyDesc = document.querySelector(
                        '.woocommerce-product-details__short-description, .product_description, [itemprop="description"]'
                    );
                    return {
                        name:        item.name,
                        ean:         item.sku,   // Skeyndor uses SKU field for EAN barcode
                        description: bodyDesc ? bodyDesc.innerText.trim() : desc,
                        images,
                        photo:       images[0] || null,
                        price:       offer.price ? parseFloat(offer.price) : null,
                        currency:    offer.priceCurrency || 'EUR',
                        category:    item.category || null,
                        inStock:     (offer.availability || '').includes('InStock'),
                    };
                }
            }
        } catch {}
    }
    return null;
}
"""


async def get_line_products(page, slug: str) -> list[str]:
    """Return all product URLs from a line category page (handles multiple pages)."""
    urls: list[str] = []
    pg = 1
    while True:
        url = f"{BASE}/line/{slug}/" if pg == 1 else f"{BASE}/line/{slug}/page/{pg}/"
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(1500)
            links = await page.evaluate("""
                () => Array.from(document.querySelectorAll('a[href]'))
                    .map(a => a.href)
                    .filter(h => h.includes('/product/'))
                    .filter((v,i,a) => a.indexOf(v) === i)
            """)
            if not links:
                break
            new = [l for l in links if l not in urls]
            urls.extend(new)
            # Check if there's a next page
            has_next = await page.evaluate("""
                () => !!document.querySelector('a.next, .next.page-numbers')
            """)
            if not has_next:
                break
            pg += 1
        except Exception as e:
            print(f"    page {pg} error: {e}")
            break
    return urls


async def scrape():
    # Load existing for resume
    existing: dict[str, dict] = {}
    if OUTPUT.exists():
        try:
            for p in json.loads(OUTPUT.read_text()):
                if p.get("url"):
                    existing[p["url"]] = p
            print(f"Loaded {len(existing)} existing products from {OUTPUT.name}")
        except Exception:
            pass

    all_products: dict[str, dict] = dict(existing)

    stealth = Stealth()
    async with stealth.use_async(async_playwright()) as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()

        # ── Phase 1: collect all product URLs ──────────────────────────
        print("\n=== Phase 1: collecting product URLs ===")
        line_map: dict[str, tuple[str, str]] = {}  # url → (category, line_slug)

        for slug, category in LINES:
            # Skip if we already have products for this category
            already = sum(1 for p in all_products.values() if p.get("category") == category)
            if already > 0:
                print(f"  [{category}] already have {already} products — skipping")
                continue

            prod_urls = await get_line_products(page, slug)
            print(f"  [{category}] {len(prod_urls)} products found")
            for u in prod_urls:
                if u not in line_map:
                    line_map[u] = (category, slug)

        to_scrape = {u: v for u, v in line_map.items() if u not in existing}
        print(f"\nNew products to scrape: {len(to_scrape)}")

        # ── Phase 2: scrape each product page ──────────────────────────
        print("\n=== Phase 2: scraping product pages ===")
        for i, (url, (category, slug)) in enumerate(to_scrape.items()):
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                await page.wait_for_timeout(1000)
                detail = await page.evaluate(DETAIL_JS)

                if detail:
                    all_products[url] = {
                        "name":        detail["name"],
                        "brand":       "Skeyndor",
                        "ean":         detail["ean"],
                        "sku":         detail["ean"],   # same value, EAN is the barcode
                        "price":       detail["price"],
                        "currency":    detail["currency"],
                        "photo":       detail["photo"],
                        "images":      detail["images"],
                        "description": detail["description"],
                        "category":    category,
                        "sub_category": detail["category"] or category,
                        "in_stock":    detail["inStock"],
                        "url":         url,
                        "supplier":    "Skeyndor",
                    }
                    status = f"{detail['name'][:50]} | EAN={detail['ean']} | {len(detail['images'])} imgs | {detail['price']} EUR"
                else:
                    all_products[url] = {
                        "name": url.split("/product/")[-1].strip("/").replace("-", " ").title(),
                        "brand": "Skeyndor", "ean": None, "sku": None, "price": None,
                        "currency": "EUR", "photo": None, "images": [], "description": None,
                        "category": category, "sub_category": category, "in_stock": None,
                        "url": url, "supplier": "Skeyndor",
                    }
                    status = "no JSON-LD"

            except Exception as e:
                status = f"ERROR: {e}"

            print(f"  [{i+1}/{len(to_scrape)}] {url.split('/product/')[-1].strip('/')[:50]} → {status}")

            if (i + 1) % 30 == 0:
                _save(all_products, OUTPUT)
                print(f"  ↳ checkpoint saved ({i+1} done)")

        await browser.close()

    _save(all_products, OUTPUT)
    result = list(all_products.values())
    print(f"\n✓ Saved {len(result)} products to {OUTPUT}")

    cats: dict[str, int] = {}
    for p in result:
        cats[p.get("category", "Other")] = cats.get(p.get("category", "Other"), 0) + 1
    print("\nBy category:")
    for c, n in sorted(cats.items()):
        print(f"  {c:30s} {n:4d}")


def _save(products: dict, path: Path):
    path.write_text(json.dumps(list(products.values()), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(scrape())
