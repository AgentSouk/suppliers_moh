"""
Scrapes ALL hair products from nazih.ae/hair.html across every sub-category.
Phase 1 : collect listing data (name, brand, price, photo, url, category, sub_category)
Phase 2 : visit each product page for EAN + SKU
Saves to nazih_all_products.json

Organised into top-level categories:
  Hair Care · Hair Colouring · Hair Styling · Tools & Accessories · Shaving & Grooming
"""

import asyncio, json, re, math
from pathlib import Path
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

OUTPUT = Path(__file__).parent / "nazih_all_products.json"

# ── Category map ──────────────────────────────────────────────────────────────
# (url_slug, top_category, sub_category_label)
CATEGORIES = [
    # Shampoo & Conditioner
    ("hair/shampoo-conditioners/shampoo",              "Hair Care",          "Shampoo"),
    ("hair/shampoo-conditioners/conditioner",          "Hair Care",          "Conditioner"),
    ("hair/shampoo-conditioners/dry-shampoo",          "Hair Care",          "Dry Shampoo"),
    ("hair/shampoo-conditioners/leave-in-conditioner", "Hair Care",          "Leave-In Conditioner"),

    # Hair Treatment
    ("hair/hair-treatment/scalp-hair-treatments",      "Hair Treatment",     "Scalp & Hair Treatments"),
    ("hair/hair-treatment/hair-oils-serums",           "Hair Treatment",     "Hair Oils & Serums"),
    ("hair/hair-treatment/hair-mask",                  "Hair Treatment",     "Hair Mask"),
    ("hair/hair-treatment/hair-thinning-hair-loss",    "Hair Treatment",     "Hair Thinning & Hair Loss"),
    ("hair/hair-treatment/hair-straightening",         "Hair Treatment",     "Hair Straightening"),
    ("hair/hair-treatment/hair-color-care",            "Hair Treatment",     "Hair Color Care"),
    ("hair/hair-treatment/haircare-kits",              "Hair Treatment",     "Haircare Kits"),
    ("hair/hair-treatment/anti-lice",                  "Hair Treatment",     "Anti-Lice"),
    ("hair/hair-treatment/anti-dandruff",              "Hair Treatment",     "Anti-Dandruff"),

    # Hair Styling
    ("hair/hairstyling/hairgel",                       "Hair Styling",       "Hair Gel"),
    ("hair/hairstyling/hairwaxclay",                   "Hair Styling",       "Hair Wax & Clay"),
    ("hair/hairstyling/hairspray",                     "Hair Styling",       "Hair Spray"),
    ("hair/hairstyling/haircream",                     "Hair Styling",       "Hair Cream"),
    ("hair/hairstyling/hairoil",                       "Hair Styling",       "Hair Oil"),
    ("hair/hairstyling/hairpowder",                    "Hair Styling",       "Hair Powder"),
    ("hair/hairstyling/hair-mousse",                   "Hair Styling",       "Hair Mousse & Foam"),
    ("hair/hairstyling/heat-protector-sprays",         "Hair Styling",       "Heat Protector Sprays"),

    # Hair Colourings
    ("hair/haircolourings/temporaryhaircolour",        "Hair Colouring",     "Temporary Hair Colour"),
    ("hair/haircolourings/permanenthaircolour",        "Hair Colouring",     "Permanent Hair Colour"),
    ("hair/haircolourings/hairbleach",                 "Hair Colouring",     "Hair Bleach"),
    ("hair/haircolourings/haircolorreconstructor",     "Hair Colouring",     "Hair Color Reconstructor"),
    ("hair/haircolourings/hairdeveloper",              "Hair Colouring",     "Hair Color Developer"),
    ("hair/haircolourings/instant-color-spray",        "Hair Colouring",     "Instant Color Spray"),
    ("hair/haircolourings/ammonia-free-permanent-hair-colour", "Hair Colouring", "Ammonia Free Permanent Colour"),

    # Combs & Brushes
    ("hair/hairaccessoriesbrushes/paddlebrushes",      "Tools & Accessories","Paddle Brushes"),
    ("hair/hairaccessoriesbrushes/ventbrushes",        "Tools & Accessories","Vent Brushes"),
    ("hair/hairaccessoriesbrushes/combs",              "Tools & Accessories","Combs"),
    ("hair/hairaccessoriesbrushes/round-brushes",      "Tools & Accessories","Round Brushes"),
    ("hair/hairaccessoriesbrushes/brushes",            "Tools & Accessories","Brushes"),

    # Electrical Tools
    ("hair/hairelectricaltools/straighteners",         "Electrical Tools",   "Straighteners"),
    ("hair/hairelectricaltools/curlerswavers",         "Electrical Tools",   "Curlers & Wavers"),
    ("hair/hairelectricaltools/clipperstrimmers",      "Electrical Tools",   "Clippers & Trimmers"),
    ("hair/hairelectricaltools/shavers",               "Electrical Tools",   "Shavers"),
    ("hair/hairelectricaltools/airbrush",              "Electrical Tools",   "Hot Air Brush"),
    ("hair/hairelectricaltools/hair-dryers",           "Electrical Tools",   "Hair Dryers"),
    ("hair/hairelectricaltools/hair-treatment-iron",   "Electrical Tools",   "Hair Treatment Iron"),
    ("hair/hairelectricaltools/hair-curling-iron",     "Electrical Tools",   "Hair Curling Iron"),
    ("hair/hairelectricaltools/new-hot-air-stylers",   "Electrical Tools",   "Hot Air Stylers"),
    ("hair/hairelectricaltools/limited-edition",       "Electrical Tools",   "Limited Edition"),

    # Hair Accessories & Tools
    ("hair/hair-accessories-tools/salonessentials",          "Tools & Accessories","Salon Essentials"),
    ("hair/hair-accessories-tools/dressingstylingacessories","Tools & Accessories","Dressing & Styling Accessories"),
    ("hair/hair-accessories-tools/haircoloringtools",        "Tools & Accessories","Hair Colouring Tools"),
    ("hair/hair-accessories-tools/otherhairaccessoriestools","Tools & Accessories","Other Hair Accessories"),
    ("hair/hair-accessories-tools/hair-extension-remover",  "Tools & Accessories","Hair Extension Remover"),

    # Shaving & Grooming (parent only — sub-pages not listed separately)
    ("hair/shaving-grooming",                          "Shaving & Grooming", "Shaving & Grooming"),

    # Kits & Gift Sets
    ("hair/kits-gift-sets",                            "Hair Care",          "Kits & Gift Sets"),
]

LISTING_JS = """
() => {
    const results = [];
    document.querySelectorAll('.product-item').forEach(el => {
        const nameLinks = el.querySelectorAll('a[class*="product-item-link"]');
        const nameEl  = nameLinks[1] || nameLinks[0];
        const priceEl = el.querySelector('[data-price-type="finalPrice"] .price, .price-wrapper .price, .price');
        const imgEl   = el.querySelector('img.product-image-photo, img.notlazy, img');
        const linkEl  = el.querySelector('a[href]');

        const name = nameEl ? nameEl.innerText.trim() : '';
        if (!name || name.length < 3) return;

        const brand = nameLinks[0] ? nameLinks[0].innerText.trim() : '';

        let photo = '';
        if (imgEl) {
            photo = imgEl.src || imgEl.getAttribute('data-src') || imgEl.getAttribute('data-lazy') || '';
            if (photo.includes('placeholder') || photo.includes('data:image'))
                photo = imgEl.getAttribute('data-src') || imgEl.getAttribute('data-lazy') || '';
        }

        const url  = linkEl ? linkEl.href : '';
        const rawPrice = priceEl ? priceEl.innerText.replace(/AED/gi,'').replace(/,/g,'').trim() : null;

        results.push({ name, brand, rawPrice, photo, url });
    });
    return results;
}
"""

DETAIL_JS = """
() => {
    const skuEl = document.querySelector('.dynamic-configproduct-sku');
    const sku = skuEl ? skuEl.innerText.trim() : null;

    let ean = null;
    // 1. .type / .value DOM pair
    document.querySelectorAll('.type').forEach(el => {
        if (/EAN/i.test(el.innerText)) {
            const val = el.parentElement?.querySelector('.value');
            if (val) ean = val.innerText.trim();
        }
    });
    // 2. itemprop
    if (!ean) {
        const g = document.querySelector('[itemprop="gtin13"],[itemprop="gtin"]');
        if (g) ean = (g.getAttribute('content') || g.innerText).trim();
    }
    // 3. ld+json structured data
    if (!ean) {
        document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
            try {
                const d = JSON.parse(s.textContent);
                const val = d.gtin13 || d.gtin14 || d.gtin || d.gtin8;
                if (val && !ean) ean = String(val).trim();
            } catch {}
        });
    }
    return { sku, ean };
}
"""

TOOLBAR_JS = """
() => {
    const el = document.querySelector('.toolbar-amount');
    return el ? el.innerText : '';
}
"""

def parse_price(raw) -> float | None:
    if not raw: return None
    try:
        cleaned = re.sub(r'[^\d.]', '', str(raw))
        return float(cleaned) if cleaned else None
    except ValueError:
        return None

def extract_brand(name: str) -> str:
    name_lower = name.lower()
    for b in ["l'oreal","loreal","wella","schwarzkopf","indola","joico","redken",
              "matrix","kerastase","goldwell","igora","koleston","inoa","majirel",
              "color touch","garnier","revlon","fanola","bigen","wahl","ghd",
              "babyliss","remington","philips","braun","conair","parlux","dyson",
              "paul mitchell","alter ego","macadamia","enercos","framesi"]:
        if b in name_lower:
            return b.title()
    return name.split()[0].title() if name else "Unknown"


async def scrape_category(page, slug: str, top_cat: str, sub_cat: str, products: dict):
    base_url = f"https://nazih.ae/{slug}.html"
    new_total = 0

    # Skip if we already have products for this sub-category
    already = sum(1 for p in products.values() if p.get("sub_category") == sub_cat)
    if already > 0:
        print(f"  → already have {already} products, skipping listing phase")
        return

    # Get page count from first page
    try:
        await page.goto(base_url, wait_until="domcontentloaded", timeout=45000)
        await page.wait_for_timeout(1500)
        total_text = await page.evaluate(TOOLBAR_JS)
        m = re.search(r'(\d+)\s+(?:Products?|Items?)', total_text, re.I)
        total = int(m.group(1)) if m else 0
        if total == 0:
            # Try to find products anyway (some pages don't show count)
            items = await page.evaluate(LISTING_JS)
            if not items:
                print(f"  → 0 products, skipping")
                return
            total = len(items)  # at least one page
        per_page = 16
        total_pages = math.ceil(total / per_page)
        print(f"  {total} products across {total_pages} pages")
    except Exception as e:
        print(f"  ERROR loading {base_url}: {e}")
        return

    for pg in range(1, total_pages + 1):
        url = base_url if pg == 1 else f"{base_url}?p={pg}"
        try:
            if pg > 1:
                await page.goto(url, wait_until="domcontentloaded", timeout=45000)
                await page.wait_for_timeout(1500)
            items = await page.evaluate(LISTING_JS)
            for item in items:
                key = item['url'].strip() or item['name'].strip().lower()
                if not key: continue
                if key not in products:
                    products[key] = {
                        "name": item['name'],
                        "brand": item.get('brand') or extract_brand(item['name']),
                        "price": parse_price(item['rawPrice']),
                        "photo": item['photo'],
                        "url": item['url'],
                        "sku": None,
                        "ean": None,
                        "category": top_cat,
                        "sub_category": sub_cat,
                        "supplier": "Nazih",
                    }
                    new_total += 1
        except Exception as e:
            print(f"    page {pg} ERROR: {e}")

    print(f"  +{new_total} new products (running total: {len(products)})")


async def scrape():
    products: dict = {}

    # Seed from existing output so we can resume
    if OUTPUT.exists():
        try:
            existing = json.loads(OUTPUT.read_text())
            for p in existing:
                key = p.get('url', '').strip() or p.get('name', '').strip().lower()
                if key:
                    products[key] = p
            print(f"Loaded {len(products)} existing products from {OUTPUT.name}")
        except Exception:
            pass

    stealth = Stealth()
    async with stealth.use_async(async_playwright()) as pw:
        browser = await pw.chromium.launch(headless=True)
        page   = await browser.new_page()

        # ── Phase 1: listing pages ───────────────────────────────────────
        print(f"\n{'='*60}")
        print("PHASE 1 — Scraping category listing pages")
        print(f"{'='*60}")
        for slug, top_cat, sub_cat in CATEGORIES:
            print(f"\n[{top_cat}] {sub_cat}  →  /{slug}")
            await scrape_category(page, slug, top_cat, sub_cat, products)

        # ── Phase 2: product detail pages for EAN + SKU ─────────────────
        need = [p for p in products.values() if p['url'] and not (p.get('sku') and p.get('ean'))]
        print(f"\n{'='*60}")
        print(f"PHASE 2 — EAN + SKU from {len(need)}/{len(products)} product pages")
        print(f"{'='*60}")

        all_products = list(products.values())
        for i, prod in enumerate(need):
            try:
                await page.goto(prod['url'], wait_until="domcontentloaded", timeout=45000)
                await page.wait_for_timeout(1000)
                detail = await page.evaluate(DETAIL_JS)
                prod['sku'] = detail.get('sku') or prod.get('sku')
                prod['ean'] = detail.get('ean') or prod.get('ean')
                status = f"SKU={prod['sku']}  EAN={prod['ean']}"
            except Exception as e:
                status = f"ERROR: {e}"
            print(f"  [{i+1}/{len(need)}] {prod['name'][:55]} → {status}")

            # Checkpoint every 100
            if (i + 1) % 100 == 0:
                OUTPUT.write_text(json.dumps(all_products, indent=2, ensure_ascii=False))
                print(f"  ↳ checkpoint saved ({i+1} done)")

        await browser.close()

    OUTPUT.write_text(json.dumps(all_products, indent=2, ensure_ascii=False))
    print(f"\n✓ Saved {len(all_products)} products to {OUTPUT}")
    summary = {}
    for p in all_products:
        summary[p['category']] = summary.get(p['category'], 0) + 1
    print("\nProducts by category:")
    for cat, count in sorted(summary.items()):
        print(f"  {cat:30s} {count:4d}")


if __name__ == "__main__":
    asyncio.run(scrape())
