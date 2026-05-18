"""
Downloads Madi product images using a live browser session (bypasses SSL/auth issues).
Saves to public/product-images/madi/{sku}.jpg
Updates madi_products.json with local photo paths.

Run: python3 madi_download_images.py
Resume-safe: skips products that already have a local image.
"""

import asyncio, json, base64
from pathlib import Path
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

PRODUCTS_JSON = Path(__file__).parent / "public" / "madi_products.json"
IMG_DIR       = Path(__file__).parent / "public" / "product-images" / "madi"
IMG_DIR.mkdir(parents=True, exist_ok=True)

WEBSTORE = "0ZEJ70000004EhsOAE"
BASE     = f"https://www.madi.com/webruntime/api/services/data/v66.0/commerce/webstores/{WEBSTORE}"


async def download_image(page, url: str, dest: Path) -> bool:
    """Fetch an image URL using the browser's session and save to disk."""
    try:
        result = await page.evaluate(f'''async () => {{
            const r = await fetch("{url}", {{credentials: "include"}});
            if (!r.ok) return null;
            const buf = await r.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let bin = "";
            bytes.forEach(b => bin += String.fromCharCode(b));
            return btoa(bin);
        }}''')
        if not result:
            return False
        img_bytes = base64.b64decode(result)
        dest.write_bytes(img_bytes)
        return True
    except:
        return False


async def main():
    data = json.loads(PRODUCTS_JSON.read_text())
    print(f"Loaded {len(data)} products")

    # Find products needing local images
    to_process = [p for p in data if not p.get("photo", "").startswith("/product-images/")]
    print(f"Need to download: {len(to_process)} images")
    if not to_process:
        print("All images already local!")
        return

    stealth = Stealth()
    async with stealth.use_async(async_playwright()) as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()

        # Get session
        print("Getting session...")
        await page.goto("https://www.madi.com", wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_timeout(2000)

        done = 0
        failed = 0

        for i, prod in enumerate(to_process):
            sku = prod.get("sku") or prod.get("id", f"prod-{i}")
            dest = IMG_DIR / f"{sku}.jpg"

            # Skip if already downloaded
            if dest.exists() and dest.stat().st_size > 1000:
                prod["photo"] = f"/product-images/madi/{sku}.jpg"
                done += 1
                print(f"  [{i+1}/{len(to_process)}] {sku} already exists", end="\r")
                continue

            # Refresh session every 200 products
            if i > 0 and i % 200 == 0:
                await page.goto("https://www.madi.com", wait_until="domcontentloaded", timeout=20000)
                await page.wait_for_timeout(1500)

            # Try sfsites CMS URL first (needs session), then DisplayUrl
            images = prod.get("images", [])
            cms_urls  = [u for u in images if "sfsites/c/cms" in u]
            disp_urls = [u for u in images if "madi-intl.com" in u]

            success = False
            for url in cms_urls + disp_urls:
                if await download_image(page, url, dest):
                    prod["photo"] = f"/product-images/madi/{sku}.jpg"
                    prod["images"] = [f"/product-images/madi/{sku}.jpg"]
                    done += 1
                    success = True
                    break

            if not success:
                failed += 1

            print(f"  [{i+1}/{len(to_process)}] {sku} {'✓' if success else '✗'} | done:{done} failed:{failed}", end="\r")

            # Save checkpoint every 100
            if (i + 1) % 100 == 0:
                PRODUCTS_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False))
                print(f"\n  Checkpoint: {done} downloaded, {failed} failed")

        await browser.close()

    PRODUCTS_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"\n✓ Done: {done} downloaded, {failed} failed")
    print(f"  Images saved to: {IMG_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
