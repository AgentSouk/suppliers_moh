"""
Searches essie.com for the Essie products missing photos in loreal_products.json.
Only updates those specific entries — does not touch anything else.
"""

import json, re, asyncio, shutil
from pathlib import Path
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

BASE = Path(__file__).parent
PRODUCTS_FILE = BASE / "loreal_products.json"

async def fetch_missing():
    products = json.loads(PRODUCTS_FILE.read_text())

    missing = [p for p in products if p.get("brand") == "Essie" and not p.get("photo")]
    print(f"Essie products missing photo: {len(missing)}")

    stealth = Stealth()
    async with stealth.use_async(async_playwright()) as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()

        found = 0
        for idx, product in enumerate(missing):
            shade = product.get("shade_name") or ""
            # Fall back to stripping size/brand from full name
            if not shade:
                import re as _re
                shade = _re.sub(r'^ESSIE\s+', '', product['name'], flags=_re.I)
                shade = _re.sub(r'\s+\d+\.?\d*\s*ML.*$', '', shade, flags=_re.I).strip()

            search_url = f"https://www.essie.com/search?Searchquery={shade.replace(' ', '+')}"
            try:
                await page.goto(search_url, wait_until="domcontentloaded", timeout=20000)
                await page.wait_for_timeout(2000)

                img = await page.evaluate("""
                    () => {
                        const imgs = document.querySelectorAll('img');
                        for (const img of imgs) {
                            const src = img.src || img.getAttribute('data-src') || '';
                            if (src.includes('essie.com') && src.includes('media') && !src.includes('logo')) {
                                return src;
                            }
                        }
                        return null;
                    }
                """)

                if img:
                    product["photo"] = img
                    found += 1
                    print(f"  [{idx+1}/{len(missing)}] ✓ {shade[:35]} → {img[:60]}")
                else:
                    print(f"  [{idx+1}/{len(missing)}] ✗ {shade[:35]}")

            except Exception as e:
                print(f"  [{idx+1}/{len(missing)}] ERR {shade}: {e}")

            if (idx + 1) % 10 == 0:
                PRODUCTS_FILE.write_text(json.dumps(products, indent=2))
                print(f"  → Saved progress ({found} found so far)")

        await browser.close()

    PRODUCTS_FILE.write_text(json.dumps(products, indent=2))
    for dest in [BASE / "public" / "loreal_products.json",
                 BASE / "app" / "api" / "loreal" / "products.json"]:
        shutil.copy(PRODUCTS_FILE, dest)

    print(f"\n✓ Done. Found {found}/{len(missing)} missing Essie photos.")

asyncio.run(fetch_missing())
