"""
Scrapes all products from Madi International (madi.com) — Salesforce B2B Commerce Cloud.

Strategy:
1. Paginate through all products via the search API (20/page, ~8250 total)
2. Batch-fetch full product details (name, brand, EAN barcode, SKU/item code,
   image, category, description) from the products?ids= API
3. Save to madi_products.json

All data comes from product fields:
  PRO_Brand__c      → brand
  PRO_Barcode__c    → EAN barcode
  StockKeepingUnit  → Madi item code
  PRO_Item_Category__c / PRO_Family__c → category
  DisplayUrl        → high-res image

Run:  python3 madi_scraper.py
Resume-safe: skips product IDs already in the JSON.
"""

import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

OUTPUT   = Path(__file__).parent / "madi_products.json"
WEBSTORE = "0ZEJ70000004EhsOAE"
# Top-level category — used for initial brand/facet discovery only
CATEGORY = "0ZGJ700000001ODOAY"

# Sub-categories with manageable product counts (all under ~3500)
SUB_CATEGORIES = [
    ("0ZG8d000000cNruGAE", "Hair"),
    ("0ZG8d000000cNuPGAU", "Nails"),
    ("0ZG8d000000cNtHGAU", "Skin"),
    ("0ZGJ700000000HsOAI", "Eyes"),
    ("0ZG8d000000cNrCGAU", "Furniture and Equipment"),
    ("0ZG8d000000cNtCGAU", "Tools and Accessories"),
    ("0ZG8d000000cNsnGAE", "Electrical Appliances"),
    ("0ZG8d000000cNs9GAE", "Spare Parts"),
    ("0ZG8d000000cNv3GAE", "POSM"),
    ("0ZG8d000000cO4UGAU", "Samples"),
    ("0ZGJ700000001OiOAI", "Perfume"),
    ("0ZGJ70000000256OAA", "Clearance"),
]
BASE     = f"https://www.madi.com/webruntime/api/services/data/v66.0/commerce/webstores/{WEBSTORE}"
IMG_BASE = "https://www.madi.com"


def make_image_url(path: str) -> str | None:
    if not path:
        return None
    if path.startswith("http"):
        return path
    # Correct Salesforce CMS path: /sfsites/c/cms/delivery/media/...
    path = path.replace("/cms/delivery/media/", "/sfsites/c/cms/delivery/media/")
    return IMG_BASE + path


async def refresh_session(page):
    """Re-navigate to homepage to get a fresh session."""
    await page.goto("https://www.madi.com", wait_until="domcontentloaded", timeout=30000)
    await page.wait_for_timeout(2000)


async def fetch_all_product_ids(page, existing_ids: set) -> list[str]:
    """Page through search API and return all NEW product IDs not already scraped."""
    seen_ids: set[str] = set()        # deduplicate across pages
    all_ids: list[str] = []
    total = None
    consecutive_failures = 0

    # Get total first
    try:
        r = await page.evaluate(f'''async () => {{
            const r = await fetch("{BASE}/search/products?categoryId={CATEGORY}&page=0&fields=Name&includeQuantityRule=false&skipDecoration=true&language=en-US&asGuest=true&htmlEncode=false");
            return await r.json();
        }}''')
        if isinstance(r, dict):
            total = r.get("productsPage", {}).get("total", 8250)
    except:
        total = 8250

    total_pages = (total // 20) + 1
    print(f"  Total products: {total} (~{total_pages} pages)")

    for pg in range(total_pages):
        # Refresh session every 100 pages
        if pg > 0 and pg % 100 == 0:
            print(f"\n  Refreshing session at page {pg+1}...")
            await refresh_session(page)

        url = (f"{BASE}/search/products?categoryId={CATEGORY}"
               f"&page={pg}&fields=Name&includeQuantityRule=false"
               f"&skipDecoration=true&language=en-US&asGuest=true&htmlEncode=false")

        success = False
        for attempt in range(4):
            try:
                result = await page.evaluate(f'''async () => {{
                    const r = await fetch("{url}", {{"headers": {{"Accept": "application/json"}}}});
                    return await r.json();
                }}''')

                if isinstance(result, list):
                    # Error response — refresh session and wait longer
                    await refresh_session(page)
                    await asyncio.sleep(5 + attempt * 3)
                    continue

                prods = result.get("productsPage", {}).get("products", [])
                for p in prods:
                    pid = p.get("id")
                    if pid and pid not in seen_ids and pid not in existing_ids:
                        seen_ids.add(pid)
                        all_ids.append(pid)

                consecutive_failures = 0
                success = True
                break

            except Exception as e:
                await asyncio.sleep(3)

        if not success:
            consecutive_failures += 1
            print(f"\n  Page {pg+1} failed ({consecutive_failures}) — waiting 10s...")
            await asyncio.sleep(10)
            if consecutive_failures >= 20:
                print("  20 consecutive failures — stopping pagination")
                break
        else:
            consecutive_failures = 0  # reset on success

        print(f"  Page {pg+1}/{total_pages} | new IDs: {len(all_ids)}", end="\r")
        await asyncio.sleep(0.8)  # slower to avoid throttling

    print(f"\n  Done: {len(all_ids)} new product IDs to scrape")
    return all_ids


def parse_product(prod: dict) -> dict | None:
    if not isinstance(prod, dict) or not prod.get("success") or not prod.get("name"):
        return None
    fields = prod.get("fields", {})
    display_url = fields.get("DisplayUrl")
    cms_imgs = [
        make_image_url(mi.get("url", ""))
        for mg in prod.get("mediaGroups", [])
        for mi in mg.get("mediaItems", [])
        if mi.get("url")
    ]
    photo = display_url if display_url else (cms_imgs[0] if cms_imgs else None)
    images = ([display_url] if display_url else []) + cms_imgs
    images = list(dict.fromkeys(filter(None, images)))
    return {
        "id":           prod["id"],
        "name":         prod["name"],
        "brand":        fields.get("PRO_Brand__c") or "",
        "sku":          fields.get("StockKeepingUnit") or prod.get("sku"),
        "ean":          fields.get("PRO_Barcode__c"),
        "price":        None,
        "photo":        photo,
        "images":       images,
        "description":  fields.get("Description") or fields.get("Feature_Description__c"),
        "category":     fields.get("PRO_Item_Category__c"),
        "sub_category": fields.get("PRO_Family__c"),
        "sub_family":   fields.get("PRO_Sub_Family__c"),
        "color_code":   fields.get("Color_Code__c"),
        "color_name":   fields.get("Color_Name__c"),
        "url":          f"https://www.madi.com/product/detail/{prod['id']}",
        "supplier":     "Madi",
    }


async def _paginate_category(page, cat_id: str, skip_ids: set) -> list[str]:
    """Paginate a single category and return new product IDs."""
    ids: list[str] = []
    seen: set[str] = set()
    total = None
    consecutive_failures = 0

    # Get total for this category
    try:
        r = await page.evaluate(f'''async () => {{
            const r = await fetch("{BASE}/search/products?categoryId={cat_id}&page=0&fields=Name&includeQuantityRule=false&skipDecoration=true&language=en-US&asGuest=true&htmlEncode=false");
            return await r.json();
        }}''')
        if isinstance(r, dict):
            total = r.get("productsPage", {}).get("total", 0)
            prods = r.get("productsPage", {}).get("products", [])
            for p in prods:
                pid = p.get("id")
                if pid and pid not in skip_ids and pid not in seen:
                    seen.add(pid); ids.append(pid)
    except:
        total = 0

    if not total:
        return ids

    total_pages = (total // 20) + 1
    print(f"    {total} products, {total_pages} pages", end=" ")

    for pg in range(1, total_pages):
        if pg % 100 == 0:
            await refresh_session(page)

        url = (f"{BASE}/search/products?categoryId={cat_id}"
               f"&page={pg}&fields=Name&includeQuantityRule=false"
               f"&skipDecoration=true&language=en-US&asGuest=true&htmlEncode=false")

        success = False
        for attempt in range(4):
            try:
                result = await page.evaluate(f'''async () => {{
                    const r = await fetch("{url}");
                    return await r.json();
                }}''')
                if isinstance(result, list):
                    await refresh_session(page)
                    await asyncio.sleep(5 + attempt * 3)
                    continue
                prods = result.get("productsPage", {}).get("products", [])
                for p in prods:
                    pid = p.get("id")
                    if pid and pid not in skip_ids and pid not in seen:
                        seen.add(pid); ids.append(pid)
                consecutive_failures = 0
                success = True
                break
            except:
                await asyncio.sleep(3)

        if not success:
            consecutive_failures += 1
            await asyncio.sleep(10)
            if consecutive_failures >= 15:
                break

        await asyncio.sleep(0.5)

    return ids


async def fetch_product_details(page, product_ids: list[str], all_products: dict, output: Path) -> int:
    """Batch-fetch product details. Refreshes session every 50 products."""
    batch_size = 10
    saved = 0
    consecutive_failures = 0

    for start in range(0, len(product_ids), batch_size):
        # Refresh session every 50 products (before session expires)
        if start % 50 == 0:
            await refresh_session(page)

        batch = product_ids[start:start + batch_size]
        ids_param = "%2C".join(batch)
        url = f"{BASE}/products?ids={ids_param}&language=en-US&asGuest=true&htmlEncode=false"

        success = False
        for attempt in range(4):
            try:
                data = await page.evaluate(f'''async () => {{
                    const r = await fetch("{url}", {{"headers": {{"Accept": "application/json"}}}});
                    return await r.json();
                }}''')

                if isinstance(data, list):
                    # Error — refresh session and retry
                    await refresh_session(page)
                    await asyncio.sleep(2)
                    continue

                for prod in data.get("products", []):
                    parsed = parse_product(prod)
                    if parsed:
                        all_products[parsed["id"]] = parsed
                        saved += 1

                consecutive_failures = 0
                success = True
                break

            except Exception as e:
                await asyncio.sleep(2)

        if not success:
            consecutive_failures += 1

        await asyncio.sleep(0.3)
        done = min(start + batch_size, len(product_ids))
        print(f"  Details: {done}/{len(product_ids)} | saved: {saved}", end="\r")

        # Checkpoint every 500
        if done % 500 == 0:
            _save(all_products, output)

    print()
    return saved


async def scrape():
    # Load existing
    existing: dict[str, dict] = {}
    if OUTPUT.exists():
        try:
            for p in json.loads(OUTPUT.read_text()):
                if p.get("id"):
                    existing[p["id"]] = p
            print(f"Loaded {len(existing)} existing products")
        except Exception:
            pass

    all_products: dict[str, dict] = dict(existing)

    stealth = Stealth()
    async with stealth.use_async(async_playwright()) as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()

        # Load site to get session cookies
        print("Initialising session...")
        await page.goto("https://www.madi.com", wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(2000)

        # ── Phase 1: collect IDs per sub-category (avoids 250-page throttle) ──
        print("\n=== Phase 1: collecting product IDs by category ===")
        all_new_ids: list[str] = []
        existing_ids = set(existing.keys())

        for cat_id, cat_name in SUB_CATEGORIES:
            print(f"\n  [{cat_name}]")
            # Inline paginate for this category
            cat_ids = await _paginate_category(page, cat_id, existing_ids | set(all_new_ids))
            all_new_ids.extend(cat_ids)
            print(f"  {len(cat_ids)} new IDs | running total: {len(all_new_ids)}")

            # Refresh session between categories
            await refresh_session(page)

        if not all_new_ids:
            print("No new products to scrape.")
        else:
            # ── Phase 2: fetch product details ──────────────────────────
            print(f"\n=== Phase 2: fetching details for {len(all_new_ids)} products ===")
            saved = await fetch_product_details(page, all_new_ids, all_products, OUTPUT)
            print(f"Saved {saved} new products")

        await browser.close()

    _save(all_products, OUTPUT)
    result = list(all_products.values())
    print(f"\n✓ Saved {len(result)} products to {OUTPUT}")

    # Summary
    brands: dict[str, int] = {}
    has_ean = sum(1 for p in result if p.get("ean"))
    for p in result:
        b = p.get("brand") or "Unknown"
        brands[b] = brands.get(b, 0) + 1
    print(f"Has EAN barcode: {has_ean}/{len(result)}")
    print("\nBy brand:")
    for b, n in sorted(brands.items(), key=lambda x: -x[1]):
        print(f"  {b:35s} {n:4d}")


def _save(products: dict, path: Path):
    path.write_text(json.dumps(list(products.values()), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(scrape())
