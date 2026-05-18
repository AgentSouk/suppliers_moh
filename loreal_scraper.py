#!/usr/bin/env python3
"""
L'Oreal Partner Shop Scraper
Scrapes all products from uk.lorealpartnershop.com/en/shop-by-category/
Extracts: name, photo, product code (EAN/GB code), brand, price, URL
"""

import asyncio
import json
import re
import os
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

BASE_URL = "https://uk.lorealpartnershop.com"
CATEGORY_URL = f"{BASE_URL}/en/shop-by-category/"
OUTPUT_FILE = "loreal_products.json"

PRODUCT_RE = re.compile(r'GB\d{10,}\.html')
EAN_RE = re.compile(r'EAN\s*[:\-]?\s*(\d{8,14})')
GB_CODE_RE = re.compile(r'(GB\d{10,})')


async def make_page(browser):
    context = await browser.new_context(
        locale="en-GB",
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    )
    return await context.new_page()


async def collect_product_urls(page) -> set[str]:
    """Walk sub-categories and collect all product page URLs."""
    visited_cats = set()
    product_urls = set()

    async def visit_category(url):
        if url in visited_cats:
            return
        visited_cats.add(url)

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=60000)
            await page.wait_for_timeout(1500)

            html = await page.content()
            if "Just a moment" in html:
                print(f"  ⚠️  Cloudflare block on {url}")
                return

            links = await page.eval_on_selector_all(
                "a[href*='/en/shop-by-category/']",
                "els => [...new Set(els.map(e => e.href))]",
            )

            for link in links:
                # Strip query params for dedup key
                clean = link.split("?")[0]
                if PRODUCT_RE.search(clean):
                    product_urls.add(clean)
                elif clean not in visited_cats and clean != url:
                    # Sub-category — schedule for visit
                    await visit_category(clean)

            # Handle ?sz= pagination (load more)
            page_n = 1
            while True:
                paged_url = f"{url.rstrip('/')}/?start={page_n * 24}&sz=24"
                if paged_url in visited_cats:
                    break
                visited_cats.add(paged_url)

                await page.goto(paged_url, wait_until="domcontentloaded", timeout=60000)
                await page.wait_for_timeout(1000)

                more_links = await page.eval_on_selector_all(
                    "a[href*='/en/shop-by-category/']",
                    "els => [...new Set(els.map(e => e.href))]",
                )
                new_products = {
                    l.split("?")[0] for l in more_links if PRODUCT_RE.search(l.split("?")[0])
                }
                before = len(product_urls)
                product_urls.update(new_products)
                if len(product_urls) == before:
                    break
                page_n += 1
                if page_n > 30:
                    break

        except Exception as e:
            print(f"  ❌ Error visiting {url}: {e}")

    print(f"Starting category crawl from {CATEGORY_URL} ...")
    await visit_category(CATEGORY_URL)
    return product_urls


async def scrape_product(page, url: str) -> dict | None:
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(1500)

        html = await page.content()
        if "Just a moment" in html:
            return None

        # Name
        name = None
        for sel in ["h1.product-name", "h1[itemprop='name']", ".product-detail h1", "h1"]:
            el = await page.query_selector(sel)
            if el:
                name = (await el.inner_text()).strip().replace("\n", " ")
                break

        # Brand
        brand = None
        for sel in [".product-brand", "[itemprop='brand']", ".brand-name", ".brand"]:
            el = await page.query_selector(sel)
            if el:
                brand = (await el.inner_text()).strip()
                break

        # EAN
        ean_match = EAN_RE.search(html)
        ean = ean_match.group(1) if ean_match else None

        # GB product code from URL
        code_match = GB_CODE_RE.search(url)
        product_code = code_match.group(1) if code_match else None

        # Fallback: EAN = digits after GB in product code
        if not ean and product_code:
            ean = product_code[2:]  # strip "GB"

        # Image
        photo = None
        for sel in [".primary-image", ".product-image img", "[itemprop='image']", ".carousel img"]:
            el = await page.query_selector(sel)
            if el:
                src = await el.get_attribute("src") or await el.get_attribute("data-src")
                if src:
                    photo = src if src.startswith("http") else BASE_URL + src
                    break

        # Price
        price = None
        for sel in [".price .value", "[itemprop='price']", ".product-price", ".price"]:
            el = await page.query_selector(sel)
            if el:
                price = (await el.inner_text()).strip()
                break

        print(f"  ✅ {(name or '?')[:60]} | EAN: {ean} | Code: {product_code}")
        return {
            "name": name,
            "brand": brand,
            "product_code": product_code,
            "ean": ean,
            "price": price,
            "photo": photo,
            "url": url,
        }

    except Exception as e:
        print(f"  ❌ Error scraping {url}: {e}")
        return None


async def main():
    stealth = Stealth()
    async with stealth.use_async(async_playwright()) as p:
        browser = await p.chromium.launch(headless=True)
        page = await make_page(browser)

        # Step 1: collect all product URLs
        product_urls = await collect_product_urls(page)
        print(f"\n📦 Found {len(product_urls)} unique product URLs\n")

        if not product_urls:
            print("No products found. Exiting.")
            return

        # Step 2: scrape each product
        products = []
        urls_list = sorted(product_urls)

        for i, url in enumerate(urls_list, 1):
            print(f"[{i}/{len(urls_list)}] {url}")
            product = await scrape_product(page, url)
            if product:
                products.append(product)

            await asyncio.sleep(1.2)

            if i % 20 == 0:
                _save(products)
                print(f"  💾 Progress saved: {len(products)} products")

        await browser.close()

    _save(products)
    with_ean = sum(1 for p in products if p.get("ean"))
    with_photo = sum(1 for p in products if p.get("photo"))
    print(f"\n✅ Done! {len(products)} products → {OUTPUT_FILE}")
    print(f"   EAN: {with_ean}/{len(products)} | Photos: {with_photo}/{len(products)}")


def _save(products):
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(products, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    asyncio.run(main())
