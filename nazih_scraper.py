"""
Scrapes hair colour products from nazih.ae (paginated, 16/page → ~45 pages).
Phase 1: collect listing data (name, brand, price, photo, url).
Phase 2: visit each product page to extract EAN (barcode) and SKU.
Saves to nazih_products.json
"""

import asyncio, json, re, math
from pathlib import Path
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

BASE_URL = "https://nazih.ae/hair/haircolourings/permanenthaircolour.html"
OUTPUT = Path(__file__).parent / "nazih_products.json"

DETAIL_JS = """
() => {
    // SKU: class "dynamic-configproduct-sku"
    const skuEl = document.querySelector('.dynamic-configproduct-sku');
    const sku = skuEl ? skuEl.innerText.trim() : null;

    // EAN: sibling .value next to .type that contains "EAN"
    let ean = null;
    document.querySelectorAll('.type').forEach(el => {
        if (/EAN/i.test(el.innerText)) {
            const val = el.parentElement?.querySelector('.value');
            if (val) ean = val.innerText.trim();
        }
    });
    // fallback: itemprop gtin13/gtin
    if (!ean) {
        const g = document.querySelector('[itemprop="gtin13"],[itemprop="gtin"]');
        if (g) ean = (g.getAttribute('content') || g.innerText).trim();
    }
    // fallback: ld+json structured data (gtin13, gtin14, gtin8, gtin)
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

async def scrape():
    products = {}

    stealth = Stealth()
    async with stealth.use_async(async_playwright()) as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()

        # ── Phase 1: collect listing pages ──────────────────────────────
        await page.goto(BASE_URL, wait_until="domcontentloaded", timeout=45000)
        await page.wait_for_timeout(2000)

        total_text = await page.evaluate("""
            () => {
                const el = document.querySelector('.toolbar-amount');
                return el ? el.innerText : '';
            }
        """)
        total_match = re.search(r'(\d+)\s+Products?', total_text, re.I)
        total = int(total_match.group(1)) if total_match else 707
        per_page = 16
        total_pages = math.ceil(total / per_page)
        print(f"Total: {total} products across {total_pages} pages")

        for pg in range(1, total_pages + 1):
            url = BASE_URL if pg == 1 else f"{BASE_URL}?p={pg}"
            print(f"Page {pg}/{total_pages}", end=" ... ", flush=True)

            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=45000)
                await page.wait_for_timeout(1800)

                items = await page.evaluate("""
                    () => {
                        const results = [];
                        document.querySelectorAll('.product-item').forEach(el => {
                            const nameLinks = el.querySelectorAll('a[class*="product-item-link"]');
                            const nameEl = nameLinks[1] || nameLinks[0];
                            const priceEl = el.querySelector('[data-price-type="finalPrice"] .price, .price-wrapper .price, .price');
                            const imgEl   = el.querySelector('img.product-image-photo, img.notlazy, img');
                            const linkEl  = el.querySelector('a[href*=".html"]');

                            const name = nameEl ? nameEl.innerText.trim() : '';
                            if (!name || name.length < 3) return;

                            const brand = nameLinks[0] ? nameLinks[0].innerText.trim() : '';

                            let photo = '';
                            if (imgEl) {
                                photo = imgEl.src || imgEl.getAttribute('data-src') || imgEl.getAttribute('data-lazy') || '';
                                if (photo.includes('placeholder') || photo.includes('data:image')) {
                                    photo = imgEl.getAttribute('data-src') || imgEl.getAttribute('data-lazy') || '';
                                }
                            }

                            const url = linkEl ? linkEl.href : '';
                            results.push({ name, brand, price: priceEl ? priceEl.innerText.replace('AED','').replace(',','').trim() : null, photo, url });
                        });
                        return results;
                    }
                """)

                new = 0
                for item in items:
                    key = item['url'].strip() or item['name'].strip().lower()
                    if key and key not in products:
                        products[key] = {
                            "name": item['name'],
                            "brand": item.get('brand') or extract_brand(item['name']),
                            "price": parse_price(item['price']),
                            "photo": item['photo'],
                            "url": item['url'],
                            "sku": None,
                            "ean": None,
                            "supplier": "Nazih",
                        }
                        new += 1
                print(f"{len(items)} found, {new} new (total: {len(products)})")

            except Exception as e:
                print(f"ERROR: {e}")

        # ── Phase 2: visit each product page for EAN + SKU ──────────────
        # Seed from existing JSON so we can resume mid-run
        if OUTPUT.exists():
            try:
                existing = {p['url']: p for p in json.loads(OUTPUT.read_text()) if p.get('url')}
                for key, prod in products.items():
                    if prod['url'] in existing:
                        prev = existing[prod['url']]
                        prod['sku'] = prod['sku'] or prev.get('sku')
                        prod['ean'] = prod['ean'] or prev.get('ean')
            except Exception:
                pass

        all_products = list(products.values())
        need_detail = [p for p in all_products if p['url'] and not (p.get('sku') and p.get('ean'))]
        print(f"\nPhase 2: fetching EAN + SKU from {len(need_detail)}/{len(all_products)} product pages (skipping already-done)...")

        for i, prod in enumerate(need_detail):
            try:
                await page.goto(prod['url'], wait_until="domcontentloaded", timeout=45000)
                await page.wait_for_timeout(1200)
                detail = await page.evaluate(DETAIL_JS)
                prod['sku'] = detail.get('sku') or prod.get('sku')
                prod['ean'] = detail.get('ean') or prod.get('ean')
                status = f"SKU={prod['sku']} EAN={prod['ean']}"
            except Exception as e:
                status = f"ERROR: {e}"
            print(f"  [{i+1}/{len(need_detail)}] {prod['name'][:50]} → {status}")
            # Save checkpoint every 50 products
            if (i + 1) % 50 == 0:
                OUTPUT.write_text(json.dumps(all_products, indent=2, ensure_ascii=False))
                print(f"  ↳ checkpoint saved ({i+1} done)")

        await browser.close()

    OUTPUT.write_text(json.dumps(all_products, indent=2, ensure_ascii=False))
    print(f"\n✓ Saved {len(all_products)} products to {OUTPUT}")


def extract_brand(name: str) -> str:
    name_lower = name.lower()
    for b in ["l'oreal","loreal","wella","schwarzkopf","indola","joico","redken",
              "matrix","kerastase","goldwell","igora","koleston","inoa","majirel",
              "color touch","garnier","revlon","fanola","bigen","perm"]:
        if b in name_lower:
            return b.title()
    return name.split()[0].title() if name else "Unknown"


def parse_price(price_str) -> float | None:
    if not price_str:
        return None
    try:
        return float(re.sub(r'[^\d.]', '', str(price_str)))
    except ValueError:
        return None


if __name__ == "__main__":
    asyncio.run(scrape())
