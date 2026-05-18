"""
Scrapes all Victoria Vynn products from victoriavynn.com/en/products.
Uses top-level category pages with Magento ?p=N pagination.
Extracts JSON-LD: name, sku (catalogue no.), description, image, price, color.
Also pulls multiple gallery images from the page.
Saves to victoriavynn_products.json

Run:  python3 victoriavynn_scraper.py
Resume-safe: skips URLs already in the JSON.
"""

import asyncio, json, re
from pathlib import Path
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

OUTPUT = Path(__file__).parent / "victoriavynn_products.json"
BASE   = "https://victoriavynn.com/en"

# Top-level categories with product counts (sub-categories are subsets)
CATEGORIES = [
    ("gel-polishes",            "Gel Polishes"),
    ("base-coats",              "Base Coats"),
    ("top-coats",               "Top Coats"),
    ("builder-gels",            "Builder Gels"),
    ("liquid-polygels",         "Liquid Polygels"),
    ("polygels",                "Polygels"),
    ("nail-tips",               "Nail Tips"),
    ("nail-art",                "Nail Art"),
    ("liquids-and-preps",       "Liquids & Preps"),
    ("nail-and-skin-care",      "Nail & Skin Care"),
    ("accessories-and-devices", "Accessories & Devices"),
    ("gadgets",                 "Gadgets"),
    ("sets",                    "Sets"),
    ("marketing-materials",     "Marketing Materials"),
]

LISTING_JS = """
() => {
    const links = Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.href)
        .filter(h => h.includes('/en/') && !h.includes('/products') && !h.includes('#') && !h.includes('?'))
        .filter(h => {
            // Must look like a product URL (not a category)
            const path = h.replace('https://victoriavynn.com/en/', '');
            return path.length > 5 && !path.includes('/');
        })
        .filter((v,i,a) => a.indexOf(v) === i);

    const hasNext = !!document.querySelector('a.next, .pages a[title="Next"]');
    const toolbar = document.querySelector('.toolbar-amount')?.innerText?.trim();
    return { links, hasNext, toolbar };
}
"""

DETAIL_JS = """
() => {
    // JSON-LD Product schema
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    let prod = null;
    for (const s of scripts) {
        try {
            const d = JSON.parse(s.textContent);
            const items = d['@graph'] || (Array.isArray(d) ? d : [d]);
            for (const item of items) {
                if (item['@type'] === 'Product') { prod = item; break; }
            }
        } catch {}
        if (prod) break;
    }
    if (!prod) return null;

    // Gallery images (unique, from cache, deduplicated by filename)
    const seen = new Set();
    const imgs = Array.from(document.querySelectorAll('img'))
        .map(i => i.src || '')
        .filter(u => u.includes('catalog/product') && !u.includes('placeholder'))
        .filter(u => {
            const key = u.split('/').pop();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

    // Get high-res version: swap cache hash path for direct media path
    // victoriavynn.com/media/catalog/product/cache/HASH/... → /media/catalog/product/...
    const hires = imgs.map(u => u.replace(/\/cache\/[a-f0-9]+\//, '/'));

    const offer = prod.offers || {};
    return {
        name:        (prod.name || '').trim(),
        sku:         prod.sku || null,
        description: (prod.description || '').trim(),
        color:       prod.color || null,
        brand:       prod.brand?.name || 'Victoria Vynn',
        price:       offer.price ? parseFloat(offer.price) : null,
        currency:    offer.priceCurrency || 'PLN',
        in_stock:    (offer.availability || '').includes('InStock'),
        photo:       hires[0] || imgs[0] || prod.image || null,
        images:      hires.length ? hires : imgs,
    };
}
"""


async def scrape_category_urls(page, slug: str, category: str, existing_urls: set) -> dict[str, str]:
    """Paginate through a category and collect {url: category} for new products."""
    result: dict[str, str] = {}
    pg = 1
    while True:
        url = f"{BASE}/products/{slug}" if pg == 1 else f"{BASE}/products/{slug}?p={pg}"
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(1500)
            data = await page.evaluate(LISTING_JS)
            links = data.get("links", [])
            new = [l for l in links if l not in existing_urls and l not in result]
            for l in new:
                result[l] = category
            print(f"    page {pg}: {len(links)} products, {len(new)} new | {data.get('toolbar','')}")
            if not data.get("hasNext") or not new:
                break
            pg += 1
        except Exception as e:
            print(f"    page {pg} ERROR: {e}")
            break
    return result


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

    all_products: dict[str, dict] = dict(existing)

    stealth = Stealth()
    async with stealth.use_async(async_playwright()) as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()

        # ── Phase 1: collect product URLs ──────────────────────────────
        print("\n=== Phase 1: collecting product URLs ===")
        to_scrape: dict[str, str] = {}  # url → category

        for slug, category in CATEGORIES:
            already = sum(1 for p in all_products.values() if p.get("category") == category)
            if already > 0:
                print(f"  [{category}] already have {already} — skipping")
                continue
            print(f"  [{category}]")
            new_urls = await scrape_category_urls(page, slug, category, set(existing.keys()))
            to_scrape.update(new_urls)
            print(f"  → {len(new_urls)} new URLs found")

        print(f"\nTotal new products to scrape: {len(to_scrape)}")

        # ── Phase 2: scrape each product page ──────────────────────────
        print("\n=== Phase 2: scraping product pages ===")
        for i, (url, category) in enumerate(to_scrape.items()):
            try:
                await page.goto(url, wait_until="networkidle", timeout=40000)
                await page.wait_for_timeout(800)
                detail = await page.evaluate(DETAIL_JS)

                if detail:
                    all_products[url] = {
                        "name":        detail["name"] or url.split("/")[-1].replace("-", " ").title(),
                        "brand":       detail["brand"],
                        "sku":         detail["sku"],
                        "ean":         None,  # not published on site
                        "color":       detail["color"],
                        "price":       detail["price"],
                        "currency":    detail["currency"],
                        "in_stock":    detail["in_stock"],
                        "photo":       detail["photo"],
                        "images":      detail["images"],
                        "description": detail["description"],
                        "category":    category,
                        "sub_category": category,
                        "url":         url,
                        "supplier":    "Victoria Vynn",
                    }
                    status = f"{detail['name'][:50]} | SKU={detail['sku']} | {len(detail['images'])} imgs"
                else:
                    all_products[url] = {
                        "name": url.split("/")[-1].replace("-", " ").title(),
                        "brand": "Victoria Vynn", "sku": None, "ean": None, "color": None,
                        "price": None, "currency": "PLN", "in_stock": None,
                        "photo": None, "images": [], "description": None,
                        "category": category, "sub_category": category,
                        "url": url, "supplier": "Victoria Vynn",
                    }
                    status = "no JSON-LD"

            except Exception as e:
                status = f"ERROR: {e}"

            print(f"  [{i+1}/{len(to_scrape)}] {url.split('/')[-1][:55]} → {status}")

            if (i + 1) % 50 == 0:
                _save(all_products, OUTPUT)
                print(f"  ↳ checkpoint saved ({i+1} done)")

        await browser.close()

    _save(all_products, OUTPUT)
    result = list(all_products.values())
    print(f"\n✓ Saved {len(result)} products to {OUTPUT}")

    cats: dict[str, int] = {}
    for p in result:
        cats[p.get("category", "?")] = cats.get(p.get("category", "?"), 0) + 1
    print("\nBy category:")
    for c, n in sorted(cats.items()):
        print(f"  {c:35s} {n:4d}")


def _save(products: dict, path: Path):
    path.write_text(json.dumps(list(products.values()), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(scrape())
