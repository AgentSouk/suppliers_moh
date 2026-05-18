#!/usr/bin/env python3
"""
Patch script: fills in brand (and price) for products where brand is null.
Reads loreal_products.json, scrapes only missing fields, saves back.
"""

import asyncio
import json
import re
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

INPUT_FILE = "loreal_products.json"
JSONLD_BRAND_RE = re.compile(r'"brand"\s*:\s*"([^"]+)"')
PRICE_RE = re.compile(r'"price"\s*:\s*"?([0-9.]+)"?')


async def fill_missing(page, product: dict) -> bool:
    """Returns True if anything was updated."""
    if product.get("brand") and product.get("price"):
        return False

    try:
        await page.goto(product["url"], wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(1200)
        html = await page.content()

        if "Just a moment" in html:
            print(f"  ⚠️  Blocked: {product['url']}")
            return False

        updated = False

        if not product.get("brand"):
            m = JSONLD_BRAND_RE.search(html)
            if m:
                product["brand"] = m.group(1)
                updated = True

        if not product.get("price"):
            for sel in [".price .value", "[itemprop='price']", ".product-price", ".price"]:
                el = await page.query_selector(sel)
                if el:
                    product["price"] = (await el.inner_text()).strip()
                    updated = True
                    break

        return updated

    except Exception as e:
        print(f"  ❌ {product['url']}: {e}")
        return False


async def main():
    with open(INPUT_FILE, encoding="utf-8") as f:
        products = json.load(f)

    missing = [p for p in products if not p.get("brand") or not p.get("price")]
    print(f"Products missing brand or price: {len(missing)} / {len(products)}")

    if not missing:
        print("Nothing to do.")
        return

    stealth = Stealth()
    async with stealth.use_async(async_playwright()) as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(locale="en-GB")
        page = await context.new_page()

        updated_count = 0
        for i, product in enumerate(missing, 1):
            print(f"[{i}/{len(missing)}] {product.get('name', product['url'])[:60]}")
            changed = await fill_missing(page, product)
            if changed:
                updated_count += 1
                print(f"  → brand: {product.get('brand')} | price: {product.get('price')}")

            if i % 20 == 0:
                with open(INPUT_FILE, "w", encoding="utf-8") as f:
                    json.dump(products, f, ensure_ascii=False, indent=2)
                print(f"  💾 Saved ({updated_count} updated so far)")

            await asyncio.sleep(1.2)

        await browser.close()

    with open(INPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(products, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Done! Updated {updated_count} products → {INPUT_FILE}")


if __name__ == "__main__":
    asyncio.run(main())
