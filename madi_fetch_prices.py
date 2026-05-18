"""
Fetches list prices for all Madi products via Salesforce B2B pricing API (no login needed).
POST /pricing/products returns listPrice even as guest.

Run: python3 madi_fetch_prices.py
Updates price field in madi_products.json in-place.
"""

import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

PRODUCTS_FILE = Path(__file__).parent / "madi_products.json"
WEBSTORE = "0ZEJ70000004EhsOAE"
BASE = f"https://www.madi.com/webruntime/api/services/data/v66.0/commerce/webstores/{WEBSTORE}"
BATCH = 50  # pricing API handles up to 50 at a time


async def fetch_prices():
    data = json.loads(PRODUCTS_FILE.read_text())
    products = {p["id"]: p for p in data}
    all_ids = list(products.keys())
    print(f"Loaded {len(all_ids)} products")

    priced = sum(1 for p in products.values() if p.get("price") is not None)
    print(f"Already have prices: {priced}")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()

        print("Initialising session...")
        await page.goto("https://www.madi.com", wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(2000)

        updated = 0
        failed = 0

        for start in range(0, len(all_ids), BATCH):
            batch_ids = all_ids[start:start + BATCH]

            # Refresh session every 500 products
            if start > 0 and start % 500 == 0:
                await page.goto("https://www.madi.com", wait_until="domcontentloaded", timeout=30000)
                await page.wait_for_timeout(1500)

            for attempt in range(3):
                try:
                    result = await page.evaluate('''async (ids) => {
                        const r = await fetch("''' + BASE + '''/pricing/products", {
                            method: "POST",
                            headers: {"Accept": "application/json", "Content-Type": "application/json"},
                            body: JSON.stringify({pricingLineItems: ids.map(id => ({productId: id}))})
                        });
                        return await r.json();
                    }''', batch_ids)

                    for item in (result.get("pricingLineItemResults", []) if isinstance(result, dict) else []):
                        pid = item.get("productId")
                        list_price = item.get("listPrice")
                        if pid and list_price is not None:
                            try:
                                price = float(list_price)
                                if price > 0:
                                    products[pid]["price"] = price
                                    updated += 1
                            except (ValueError, TypeError):
                                pass
                        elif pid:
                            failed += 1
                    break

                except Exception as e:
                    await asyncio.sleep(3 + attempt * 2)

            done = min(start + BATCH, len(all_ids))
            print(f"  {done}/{len(all_ids)} | priced: {updated} | no price: {failed}", end="\r")
            await asyncio.sleep(0.3)

        await browser.close()

    print(f"\n\nDone — {updated} products priced, {failed} with no price")

    # Save
    PRODUCTS_FILE.write_text(json.dumps(list(products.values()), indent=2, ensure_ascii=False))
    public = Path(__file__).parent / "public" / "madi_products.json"
    public.write_text(PRODUCTS_FILE.read_text())
    print(f"Saved to {PRODUCTS_FILE} and {public}")

    # Price distribution
    prices = [p["price"] for p in products.values() if p.get("price")]
    if prices:
        prices.sort()
        print(f"\nPrice range: {min(prices):.2f} – {max(prices):.2f} AED")
        print(f"Median: {prices[len(prices)//2]:.2f} AED")


if __name__ == "__main__":
    asyncio.run(fetch_prices())
