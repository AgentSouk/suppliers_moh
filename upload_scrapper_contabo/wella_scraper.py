"""
Scrapes Wella Professionals product catalogue from wella.com.
- Collects product URLs from all locale sitemaps (en-GB, en-US, de-DE, fr-FR, en-AU)
- Scrapes JSON-LD structured data from each product page (name, image, SKU, description, category)
- Deduplicates by product slug
- Saves to wella_products.json

Run: python3 wella_scraper.py
Resume-safe: skips products already in JSON.
"""

import asyncio, json, re
from pathlib import Path
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

OUTPUT = Path(__file__).parent / "wella_products.json"

# All locale sitemaps — more locales = more product coverage
SITEMAPS = [
    ("en-GB", "https://www.wella.com/professional/sitemaps/sitemap-en-GB.xml"),
    ("en-US", "https://www.wella.com/professional/sitemaps/sitemap-en-US.xml"),
    ("en-AU", "https://www.wella.com/professional/sitemaps/sitemap-en-AU.xml"),
    ("de-DE", "https://www.wella.com/professional/sitemaps/sitemap-de-DE.xml"),
    ("fr-FR", "https://www.wella.com/professional/sitemaps/sitemap-fr-FR.xml"),
    ("it-IT", "https://www.wella.com/professional/sitemaps/sitemap-it-IT.xml"),
    ("es-ES", "https://www.wella.com/professional/sitemaps/sitemap-es-ES.xml"),
]

# Use en-GB as canonical locale for scraping
BASE = "https://www.wella.com/professional/en-GB"

DETAIL_JS = """
() => {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
        try {
            const d = JSON.parse(s.textContent);
            const graph = d['@graph'] || (Array.isArray(d) ? d : [d]);
            for (const item of graph) {
                if (item['@type'] === 'Product') {
                    // Images: array of URLs or single string
                    let images = item.image || [];
                    if (typeof images === 'string') images = [images];
                    // Append optimisation params for high-quality square crop
                    images = images.map(img =>
                        img.includes('bynder.com') ? img + '?io=transform:fill,width:600,height:600' : img
                    );
                    // Additional properties (size, ingredients etc)
                    const props = {};
                    (item.additionalProperty || []).forEach(p => { props[p.name] = p.value; });
                    // Strip HTML from description
                    const div = document.createElement('div');
                    div.innerHTML = item.description || '';
                    const desc = div.innerText.trim();
                    return {
                        name: item.name,
                        sku: item.sku,
                        description: desc,
                        images,
                        brand: item.brand?.name || 'Wella Professionals',
                        category: item.category,
                        size: props['Size'] || props['Größe'] || props['Taille'] || null,
                    };
                }
            }
        } catch {}
    }
    return null;
}
"""


def slug_from_url(url: str) -> str:
    """Extract the product slug (last two path segments) from any locale URL."""
    url = url.rstrip("/")
    parts = url.split("/")
    # Find 'products' in path and take everything after
    try:
        idx = parts.index("products")
        return "/".join(parts[idx+1:])
    except ValueError:
        return parts[-1]


def category_from_slug(slug: str) -> tuple[str, str]:
    """Derive top category and sub-category from product slug."""
    parts = slug.split("/")
    cat_map = {
        "hair-care": "Hair Care", "haarpflege": "Hair Care",
        "hair-styling": "Hair Styling", "haar-styling": "Hair Styling",
        "hair-colour": "Hair Colour", "haarfarbe": "Hair Colour",
        "colour": "Hair Colour", "color": "Hair Colour",
    }
    top = cat_map.get(parts[0].lower(), parts[0].replace("-", " ").title()) if parts else "Other"
    sub = parts[1].replace("-", " ").title() if len(parts) > 1 else ""
    return top, sub


async def collect_product_urls(page) -> dict[str, str]:
    """Returns {slug: canonical_en_GB_url} from all sitemaps."""
    slugs: dict[str, str] = {}

    for locale, sitemap_url in SITEMAPS:
        try:
            await page.goto(sitemap_url, wait_until="domcontentloaded", timeout=20000)
            content = await page.content()
            urls = re.findall(r'<loc>(.*?)</loc>', content)
            prod_urls = [
                u for u in urls
                if "/products/" in u
                and "/blog/" not in u
                and "/collections/" not in u
            ]
            new = 0
            for url in prod_urls:
                slug = slug_from_url(url)
                if slug and slug not in slugs:
                    # Build canonical en-GB URL
                    slugs[slug] = f"{BASE}/products/{slug}"
                    new += 1
            print(f"  {locale}: {len(prod_urls)} product URLs, {new} new slugs")
        except Exception as e:
            print(f"  {locale}: ERROR {e}")

    return slugs


async def scrape():
    # Load existing products for resume
    existing: dict[str, dict] = {}
    if OUTPUT.exists():
        try:
            data = json.loads(OUTPUT.read_text())
            for p in data:
                if p.get("slug"):
                    existing[p["slug"]] = p
            print(f"Loaded {len(existing)} existing products from {OUTPUT.name}")
        except Exception:
            pass

    stealth = Stealth()
    async with stealth.use_async(async_playwright()) as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()

        # ── Phase 1: collect all product URLs ──────────────────────────
        print("\n=== Phase 1: Collecting product URLs from sitemaps ===")
        slug_map = await collect_product_urls(page)
        print(f"\nTotal unique product slugs: {len(slug_map)}")

        # ── Phase 2: scrape each product page ──────────────────────────
        to_scrape = {s: u for s, u in slug_map.items() if s not in existing}
        print(f"\n=== Phase 2: Scraping {len(to_scrape)}/{len(slug_map)} product pages ===")

        products = dict(existing)  # start with existing

        for i, (slug, url) in enumerate(to_scrape.items()):
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                await page.wait_for_timeout(1000)
                detail = await page.evaluate(DETAIL_JS)

                if detail:
                    top_cat, sub_cat = category_from_slug(slug)
                    products[slug] = {
                        "slug":         slug,
                        "name":         detail["name"] or slug.split("/")[-1].replace("-", " ").title(),
                        "brand":        detail["brand"] or "Wella Professionals",
                        "sku":          detail["sku"],
                        "description":  detail["description"],
                        "photo":        detail["images"][0] if detail["images"] else None,
                        "images":       detail["images"],
                        "category":     detail["category"] or top_cat,
                        "sub_category": sub_cat,
                        "size":         detail["size"],
                        "url":          url,
                        "ean":          None,   # not on consumer site
                        "price":        None,   # not on consumer site
                        "supplier":     "Wella",
                    }
                    status = f"{detail['name']} | SKU={detail['sku']} | {len(detail['images'])} imgs"
                else:
                    # No JSON-LD — still record the URL so we don't re-scrape
                    top_cat, sub_cat = category_from_slug(slug)
                    products[slug] = {
                        "slug": slug, "name": slug.split("/")[-1].replace("-"," ").title(),
                        "brand": "Wella Professionals", "sku": None, "description": None,
                        "photo": None, "images": [], "category": top_cat,
                        "sub_category": sub_cat, "size": None, "url": url,
                        "ean": None, "price": None, "supplier": "Wella",
                    }
                    status = "no JSON-LD"

            except Exception as e:
                status = f"ERROR: {e}"

            print(f"  [{i+1}/{len(to_scrape)}] {slug[-60:]} → {status}")

            # Checkpoint every 50
            if (i + 1) % 50 == 0:
                _save(products, OUTPUT)
                print(f"  ↳ checkpoint saved ({i+1} done)")

        await browser.close()

    _save(products, OUTPUT)
    result = list(products.values())
    print(f"\n✓ Saved {len(result)} products to {OUTPUT}")

    cats: dict[str, int] = {}
    for p in result:
        cats[p.get("category","Other")] = cats.get(p.get("category","Other"), 0) + 1
    print("\nBy category:")
    for c, n in sorted(cats.items()):
        print(f"  {c:30s} {n:4d}")


def _save(products: dict, path: Path):
    path.write_text(json.dumps(list(products.values()), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(scrape())
