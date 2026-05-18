"""
Scrapes essie.com/nail-polish pages 1-11 to build a full name→photo lookup,
then fills in the missing photos in loreal_products.json only.
Does NOT touch products that already have photos.
"""

import json, asyncio, shutil
from difflib import SequenceMatcher
from pathlib import Path
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

BASE = Path(__file__).parent
PRODUCTS_FILE = BASE / "loreal_products.json"

async def run():
    products = json.loads(PRODUCTS_FILE.read_text())
    missing = [p for p in products if p.get("brand") == "Essie" and not p.get("photo")]
    print(f"Essie products still missing photo: {len(missing)}")
    if not missing:
        print("Nothing to do.")
        return

    # ── scrape pages 1-11 ─────────────────────────────────────────────
    catalog = {}  # name.upper() → photo url

    stealth = Stealth()
    async with stealth.use_async(async_playwright()) as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()

        for pg in range(1, 12):
            url = f"https://www.essie.com/nail-polish?page={pg}" if pg > 1 else "https://www.essie.com/nail-polish"
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=25000)
                await page.wait_for_timeout(2500)

                items = await page.evaluate("""
                    () => {
                        const results = [];
                        document.querySelectorAll('[class*="product"], [class*="tile"], article').forEach(el => {
                            const img = el.querySelector('img');
                            const nameEl = el.querySelector('[class*="name"], [class*="title"], h2, h3, p');
                            if (img && nameEl) {
                                const src = img.src || img.getAttribute('data-src') || '';
                                if (src.includes('essie') && src.includes('media')) {
                                    results.push({ name: nameEl.innerText.trim(), photo: src });
                                }
                            }
                        });
                        return results;
                    }
                """)

                for item in items:
                    if item["name"] and item["photo"]:
                        catalog[item["name"].upper()] = item["photo"]

                print(f"  Page {pg}: {len(items)} products (catalog total: {len(catalog)})")

            except Exception as e:
                print(f"  Page {pg}: ERROR {e}")

        await browser.close()

    print(f"\nCatalog built: {len(catalog)} essie products with photos")

    # ── match missing products ─────────────────────────────────────────
    def best_match(shade: str):
        shade_up = shade.upper()
        best_photo, best_score = "", 0.0
        for name_up, photo in catalog.items():
            words_a = set(shade_up.split())
            words_b = set(name_up.split())
            overlap = len(words_a & words_b) / max(len(words_a), 1)
            ratio = SequenceMatcher(None, shade_up, name_up).ratio()
            score = max(overlap * 0.9, ratio)
            if score > best_score:
                best_score = score
                best_photo = photo
        return best_photo if best_score >= 0.45 else ""

    found = 0
    for p in missing:
        shade = p.get("shade_name") or p.get("name", "")
        photo = best_match(shade)
        if photo:
            p["photo"] = photo
            found += 1
            print(f"  ✓ {shade[:40]}")
        else:
            print(f"  ✗ {shade[:40]}")

    PRODUCTS_FILE.write_text(json.dumps(products, indent=2))
    for dest in [BASE / "public" / "loreal_products.json",
                 BASE / "app" / "api" / "loreal" / "products.json"]:
        shutil.copy(PRODUCTS_FILE, dest)

    print(f"\n✓ Filled {found}/{len(missing)} missing Essie photos.")

asyncio.run(run())
