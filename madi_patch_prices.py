"""
Patch script — fetches prices ONLY for Madi products where price=None.
Uses the same POST /pricing/products API as madi_fetch_prices.py.
Does NOT touch madi_scraper.py or madi_fetch_prices.py.
Reads/writes public/madi_products.json in-place.

Run: python3 madi_patch_prices.py
"""

import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

PUBLIC_FILE = Path(__file__).parent / "public" / "madi_products.json"
WEBSTORE = "0ZEJ70000004EhsOAE"
BASE = f"https://www.madi.com/webruntime/api/services/data/v66.0/commerce/webstores/{WEBSTORE}"
BATCH = 50


async def main():
    data = json.loads(PUBLIC_FILE.read_text())
    no_price = [p for p in data if p.get("price") is None and p.get("id")]
    print(f"Total products: {len(data)} | No price: {len(no_price)}")

    if not no_price:
        print("Nothing to patch.")
        return

    id_to_idx = {p["id"]: i for i, p in enumerate(data)}
    ids = [p["id"] for p in no_price]

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()

        print("Initialising session...")
        await page.goto("https://www.madi.com", wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(2000)

        updated = 0
        for start in range(0, len(ids), BATCH):
            batch = ids[start:start + BATCH]
            for attempt in range(3):
                try:
                    result = await page.evaluate('''async (ids) => {
                        const r = await fetch("''' + BASE + '''/pricing/products", {
                            method: "POST",
                            headers: {"Accept": "application/json", "Content-Type": "application/json"},
                            body: JSON.stringify({pricingLineItems: ids.map(id => ({productId: id}))})
                        });
                        return await r.json();
                    }''', batch)

                    for item in (result.get("pricingLineItemResults", []) if isinstance(result, dict) else []):
                        pid = item.get("productId")
                        list_price = item.get("listPrice")
                        if pid and list_price is not None:
                            try:
                                price = float(list_price)
                                if price > 0 and pid in id_to_idx:
                                    data[id_to_idx[pid]]["price"] = price
                                    data[id_to_idx[pid]]["price_aed"] = price
                                    updated += 1
                            except (ValueError, TypeError):
                                pass
                    break
                except Exception as e:
                    await asyncio.sleep(3 + attempt * 2)

            done = min(start + BATCH, len(ids))
            print(f"  {done}/{len(ids)} | newly priced: {updated}", end="\r")
            await asyncio.sleep(0.3)

        await browser.close()

    print(f"\n\nDone — {updated}/{len(ids)} patched with prices.")
    still_none = len([p for p in data if p.get("price") is None])
    print(f"Still no price: {still_none} (likely genuine price-on-request)")

    PUBLIC_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"Saved to {PUBLIC_FILE}")


asyncio.run(main())
