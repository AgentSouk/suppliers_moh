"""
Fetches missing product photos from uk.lorealpartnershop.com
by EAN. Reads loreal_products.json, updates entries with no photo,
saves back.
"""

import json, asyncio, re, shutil
from pathlib import Path
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

BASE = Path(__file__).parent
PRODUCTS_FILE = BASE / "loreal_products.json"

async def fetch_photos():
    products = json.loads(PRODUCTS_FILE.read_text())

    # Only process LP / Kerastase products missing photos
    missing = [p for p in products if not p.get("photo") and p.get("brand") not in ("Essie",) and p.get("ean")]
    print(f"Products missing photo: {len(missing)} (of {len(products)} total)")

    if not missing:
        print("Nothing to fetch.")
        return

    stealth = Stealth()
    async with stealth.use_async(async_playwright()) as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
        )
        page = await ctx.new_page()

        # Build a lookup dict for quick update
        by_ean = {p["ean"]: p for p in products if p.get("ean")}

        found = 0
        for idx, product in enumerate(missing):
            ean = product["ean"]
            # L'Oreal partner shop URL by EAN (slug not needed — redirect works)
            url = f"https://uk.lorealpartnershop.com/en/shop-by-category/product/GB{ean}.html"
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=20000)
                await page.wait_for_timeout(1500)

                # Try OG image first (fastest)
                img = await page.evaluate("""
                    () => {
                        const og = document.querySelector('meta[property="og:image"]');
                        if (og) return og.content;
                        const imgs = document.querySelectorAll('img.primary-image, img.product-image, picture img');
                        for (const img of imgs) {
                            if (img.src && img.src.includes('lorealpartnershop')) return img.src;
                        }
                        return null;
                    }
                """)

                if not img:
                    # Fallback: find any demandware image URL
                    content = await page.content()
                    m = re.search(r'(https://uk\.lorealpartnershop\.com/dw/image/[^"\'\\s]+)', content)
                    img = m.group(1) if m else None

                if img:
                    by_ean[ean]["photo"] = img
                    found += 1
                    print(f"  [{idx+1}/{len(missing)}] ✓  {product['name'][:50]}")
                else:
                    print(f"  [{idx+1}/{len(missing)}] ✗  {product['name'][:50]}")

            except Exception as e:
                print(f"  [{idx+1}/{len(missing)}] ERR {ean}: {e}")

            # Save progress every 20 products
            if (idx + 1) % 20 == 0:
                PRODUCTS_FILE.write_text(json.dumps(products, indent=2))
                print(f"  → Progress saved ({found} photos so far)")

        await browser.close()

    PRODUCTS_FILE.write_text(json.dumps(products, indent=2))
    for dest in [BASE / "public" / "loreal_products.json",
                 BASE / "app" / "api" / "loreal" / "products.json"]:
        shutil.copy(PRODUCTS_FILE, dest)

    total_with_photo = sum(1 for p in products if p.get("photo"))
    print(f"\n✓ Done. Fetched {found}/{len(missing)} missing photos.")
    print(f"  Total products with photo: {total_with_photo}/{len(products)}")

asyncio.run(fetch_photos())
