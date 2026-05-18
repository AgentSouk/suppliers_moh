#!/usr/bin/env python3
"""
Essie.com Scraper
Crawls by colour/collection category, then scrapes each product page.
No barcode — product name (shade) is the identifier.
"""

import asyncio
import json
import re
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

BASE_URL = "https://www.essie.com"
OUTPUT_FILE = "essie_products.json"

# Category pages — (url, category, sub_category)
CATEGORY_PAGES = [
    # Nail Polish — by colour
    (f"{BASE_URL}/nail-polish/nudes",    "Nail Polish", "Nudes"),
    (f"{BASE_URL}/nail-polish/pinks",    "Nail Polish", "Pinks"),
    (f"{BASE_URL}/nail-polish/reds",     "Nail Polish", "Reds"),
    (f"{BASE_URL}/nail-polish/blues",    "Nail Polish", "Blues"),
    (f"{BASE_URL}/nail-polish/greens",   "Nail Polish", "Greens"),
    (f"{BASE_URL}/nail-polish/purples",  "Nail Polish", "Purples"),
    (f"{BASE_URL}/nail-polish/corals",   "Nail Polish", "Corals"),
    (f"{BASE_URL}/nail-polish/grays",    "Nail Polish", "Grays"),
    (f"{BASE_URL}/nail-polish/whites",   "Nail Polish", "Whites"),
    (f"{BASE_URL}/nail-polish/yellows",  "Nail Polish", "Yellows"),
    # Nail Polish — by type/collection
    (f"{BASE_URL}/nail-polish/longwear",    "Nail Polish", "Longwear"),
    (f"{BASE_URL}/nail-polish/quick-dry",   "Nail Polish", "Quick Dry"),
    (f"{BASE_URL}/nail-polish/best-sellers","Nail Polish", "Best Sellers"),
    (f"{BASE_URL}/nail-polish/whats-new",   "Nail Polish", "New Arrivals"),
    # Nail Care
    (f"{BASE_URL}/nail-care/treatment",          "Nail Care", "Nail Treatments"),
    (f"{BASE_URL}/nail-care/base-and-top-coats", "Nail Care", "Base & Top Coats"),
]

PRODUCT_RE = re.compile(r'essie\.com/(nail-polish|nail-care)(/[a-z0-9-]+){2,}$')


async def make_page(browser):
    context = await browser.new_context(
        locale="en-US",
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    )
    return await context.new_page()


async def collect_product_urls(page) -> list[dict]:
    all_items = []
    seen = set()

    for cat_url, category, sub_category in CATEGORY_PAGES:
        print(f"\n📂 {category} > {sub_category}")
        try:
            await page.goto(cat_url, wait_until="domcontentloaded", timeout=60000)
            await page.wait_for_timeout(2000)

            # Scroll to trigger lazy-loaded products
            for _ in range(4):
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await page.wait_for_timeout(1000)

            html = await page.content()
            if "Just a moment" in html:
                print("  ⚠️  Blocked"); continue

            links = await page.eval_on_selector_all(
                "a[href]", "els => [...new Set(els.map(e => e.href))]"
            )

            new = 0
            for link in links:
                clean = link.split("?")[0].split("#")[0].rstrip("/")
                if PRODUCT_RE.search(clean) and clean not in seen and clean != cat_url:
                    seen.add(clean)
                    all_items.append({"url": clean, "category": category, "sub_category": sub_category})
                    new += 1

            print(f"  +{new} products (running total: {len(all_items)})")

        except Exception as e:
            print(f"  ❌ {e}")

    return all_items


async def scrape_product(page, item: dict) -> dict | None:
    url = item["url"]
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(1500)

        html = await page.content()
        if "Just a moment" in html:
            return None

        # Name
        name = None
        for sel in ["h1.product-name", ".pdp-name", ".product-title", "h1"]:
            el = await page.query_selector(sel)
            if el:
                name = (await el.inner_text()).strip().replace("\n", " ")
                if name: break

        # Description
        desc = None
        for sel in [".product-description", "[itemprop='description']", ".pdp-description", ".product-desc", ".description"]:
            el = await page.query_selector(sel)
            if el:
                desc = (await el.inner_text()).strip()
                if desc: break

        # All product images — essie CDN images from HTML source
        cdn_imgs = re.findall(
            r'(https://[^\s"\'<>]+(?:essie)[^\s"\'<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"\'<>]*)?)',
            html
        )
        # Deduplicate and filter out tiny icons/logos
        seen_imgs: set[str] = set()
        photos = []
        for img in cdn_imgs:
            base = img.split("?")[0]
            if base not in seen_imgs and not any(x in img.lower() for x in ["logo", "icon", "badge", "flag", "footer"]):
                seen_imgs.add(base)
                photos.append(img)

        # Also try explicit img selectors
        img_els = await page.query_selector_all(
            ".pdp-image img, .product-image img, [class*='product-media'] img, "
            ".product-gallery img, [class*='carousel'] img"
        )
        for img_el in img_els:
            src = await img_el.get_attribute("src") or await img_el.get_attribute("data-src")
            if src and src.startswith("http"):
                base = src.split("?")[0]
                if base not in seen_imgs:
                    seen_imgs.add(base)
                    photos.append(src)

        # Extract colour from URL path: /nail-polish/enamel/nudes/crystal-ball → nudes
        parts = url.replace(BASE_URL, "").strip("/").split("/")
        # colour_group is the second-to-last segment if product, else sub_category
        colour_group = item["sub_category"]
        if len(parts) >= 3 and parts[0] == "nail-polish":
            colour_group = parts[-2].replace("-", " ").title()

        print(f"  ✅ {(name or '?')[:55]} | {colour_group} | {len(photos)} photos")

        return {
            "name": name,
            "colour_group": colour_group,
            "category": item["category"],
            "sub_category": item["sub_category"],
            "description": desc,
            "photos": photos[:8],          # cap at 8 images
            "photo": photos[0] if photos else None,
            "url": url,
        }

    except Exception as e:
        print(f"  ❌ {url}: {e}")
        return None


def _save(products):
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(products, f, ensure_ascii=False, indent=2)


async def main():
    stealth = Stealth()
    async with stealth.use_async(async_playwright()) as p:
        browser = await p.chromium.launch(headless=True)
        page = await make_page(browser)

        product_items = await collect_product_urls(page)
        print(f"\n💅 Found {len(product_items)} unique products\n")

        if not product_items:
            print("No products found."); return

        products = []
        for i, item in enumerate(product_items, 1):
            print(f"[{i}/{len(product_items)}] {item['url']}")
            product = await scrape_product(page, item)
            if product:
                products.append(product)
            await asyncio.sleep(1.0)
            if i % 20 == 0:
                _save(products)
                print(f"  💾 Saved {len(products)} products")

        await browser.close()

    _save(products)
    print(f"\n✅ Done! {len(products)} products → {OUTPUT_FILE}")
    cats = {}
    for p in products:
        cats[p["sub_category"]] = cats.get(p["sub_category"], 0) + 1
    for k, v in sorted(cats.items()):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    asyncio.run(main())
