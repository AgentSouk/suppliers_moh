#!/usr/bin/env python3
"""
Homepage background image scraper.

Fetches editorial/hero images from each active supplier website,
downloads them to public/images/supplier-bg/ and writes a JSON
manifest at public/supplier-backgrounds.json.

The /suppliers page reads the manifest and picks a random image
on each page load.

Run:   python3 homepage_images_scraper.py
Cron:  0 3 * * 1   (every Monday at 03:00)

Requires:
    pip install playwright playwright-stealth Pillow requests
    playwright install chromium
"""

import asyncio
import json
import os
import re
import time
import urllib.request
import urllib.error
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────

ROOT        = Path(__file__).parent.parent          # repo root
OUT_DIR     = ROOT / "public" / "images" / "supplier-bg"
MANIFEST    = ROOT / "public" / "supplier-backgrounds.json"

IMAGES_PER_SUPPLIER = 6    # max images to keep per supplier

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# ── Supplier config ───────────────────────────────────────────────────────────

# type:
#   "shopify"    → uses /collections.json + /products.json featured images
#   "html"       → plain HTTP fetch, regex large images from srcset / og:image
#   "playwright" → headless Chromium, grabs hero/banner img src

SUPPLIERS: dict[str, dict] = {
    "awarid": {
        "type":  "shopify",
        "store": "https://ae.awarid.com",
        "label": "Awarid",
    },
    "milia": {
        "type":  "shopify",
        "store": "https://miliacosmetics.com",
        "label": "Milia Cosmetics",
    },
    "nawajm": {
        "type":  "shopify",
        "store": "https://nawaimcosmetics.ae",
        "label": "Nawaim Cosmetics",
    },
    "albasel": {
        "type":  "shopify",
        "store": "https://albaselco.com",
        "label": "Al Basel Cosmetics",
    },
    "nazih": {
        "type":  "playwright",
        "url":   "https://www.nazih.ae",
        "label": "Nazih Group",
    },
    "victoriavynn": {
        "type":  "playwright",
        "url":   "https://victoriavynn.com",
        "label": "Victoria Vynn",
    },
    "loreal": {
        "type":  "playwright",
        "url":   "https://www.lorealprofessionnel.com",
        "label": "L'Oréal Professionnel",
    },
    "madi": {
        "type":  "playwright",
        "url":   "https://madi.com",
        "label": "Madi International",
    },
    "essie": {
        "type":  "playwright",
        "url":   "https://www.essie.com",
        "label": "Essie",
    },
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def fetch(url: str, timeout: int = 20) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except Exception as e:
        print(f"    [fetch error] {url}: {e}")
        return None


def download_image(url: str, dest: Path) -> bool:
    """Download image URL → dest file. Returns True on success."""
    if dest.exists() and dest.stat().st_size > 10_000:
        return True  # already have it
    data = fetch(url, timeout=30)
    if not data or len(data) < 5_000:
        return False
    # Quick sanity: must start with known image magic bytes
    magic = data[:4]
    if not (
        magic[:3] == b"\xff\xd8\xff"          # JPEG
        or magic[:4] == b"\x89PNG"            # PNG
        or magic[:4] == b"RIFF"               # WebP (RIFF header)
        or magic[:4] == b"\x00\x00\x00\x18"  # MP4 / some WebP
        or data[:6] in (b"GIF87a", b"GIF89a") # GIF
    ):
        # Still save — many CDNs return non-standard magic
        pass
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    print(f"    ✓ saved {dest.name}  ({len(data)//1024} KB)")
    return True


def largest_cdn_url(raw: str) -> str:
    """
    Given a Shopify CDN URL like:
        https://cdn.shopify.com/s/files/1/0001/2345/files/banner.jpg?v=1234
    Return the URL with width stripped (Shopify will serve original res).
    Also strip ?width= parameters.
    """
    # Remove Shopify image-size suffix like _480x, _1024x640, etc.
    url = re.sub(r'_\d+x(\d+)?(\.\w+)', r'\2', raw)
    # Remove width query params
    url = re.sub(r'[?&]width=\d+', '', url).rstrip('?&')
    return url


def extract_og_image(html: str) -> str | None:
    m = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', html)
    if m:
        return m.group(1)
    m = re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']', html)
    return m.group(1) if m else None


def extract_large_srcset_images(html: str, min_width: int = 800) -> list[str]:
    """
    Find all srcset entries with a declared width ≥ min_width.
    Returns list of URLs, deduped, largest-first.
    """
    pairs: list[tuple[int, str]] = []
    for srcset in re.findall(r'srcset=["\']([^"\']+)["\']', html):
        for entry in srcset.split(","):
            entry = entry.strip()
            parts = entry.split()
            if len(parts) >= 2 and parts[1].endswith("w"):
                try:
                    w = int(parts[1][:-1])
                    if w >= min_width:
                        pairs.append((w, parts[0]))
                except ValueError:
                    pass
    # Dedup by URL, keep largest width
    seen: dict[str, int] = {}
    for w, url in pairs:
        if url not in seen or w > seen[url]:
            seen[url] = w
    return [u for u, _ in sorted(seen.items(), key=lambda x: x[1], reverse=True)]


# ── Shopify scraper ───────────────────────────────────────────────────────────

def scrape_shopify(sid: str, cfg: dict) -> list[str]:
    """
    Pull editorial images from a Shopify store:
    1. Collection featured images (large, editorial)
    2. First product image from the /products.json listing
       — sorted by image count desc so hero-product images come first.
    """
    store = cfg["store"].rstrip("/")
    found: list[str] = []

    # ── Collections featured images ──────────────────────────────────────────
    coll_url = f"{store}/collections.json?limit=15"
    raw = fetch(coll_url)
    if raw:
        try:
            data = json.loads(raw)
            for c in data.get("custom_collections", []) + data.get("smart_collections", []):
                img = c.get("image", {})
                src = img.get("src") if img else None
                if src:
                    found.append(largest_cdn_url(src))
        except Exception as e:
            print(f"    [collections parse error] {e}")

    # ── Homepage HTML — og:image + large srcset ──────────────────────────────
    raw_html = fetch(store)
    if raw_html:
        html = raw_html.decode("utf-8", errors="ignore")
        og = extract_og_image(html)
        if og:
            found.insert(0, og)
        found.extend(extract_large_srcset_images(html, min_width=1000))

    # ── Product listing — pick products with the most images ─────────────────
    products_url = f"{store}/products.json?limit=50&sort_by=best-selling"
    raw = fetch(products_url)
    if raw:
        try:
            items = json.loads(raw).get("products", [])
            items.sort(key=lambda p: len(p.get("images", [])), reverse=True)
            for item in items[:10]:
                for img in item.get("images", [])[:2]:
                    src = img.get("src")
                    if src:
                        found.append(largest_cdn_url(src))
        except Exception as e:
            print(f"    [products parse error] {e}")

    return list(dict.fromkeys(found))  # dedup preserving order


# ── HTML scraper (plain HTTP) ─────────────────────────────────────────────────

def scrape_html(sid: str, cfg: dict) -> list[str]:
    url  = cfg["url"]
    raw  = fetch(url)
    if not raw:
        return []
    html = raw.decode("utf-8", errors="ignore")
    found: list[str] = []

    og = extract_og_image(html)
    if og:
        found.append(og)
    found.extend(extract_large_srcset_images(html, min_width=900))

    # Absolute-ify relative URLs
    from urllib.parse import urljoin
    found = [urljoin(url, u) for u in found]
    return list(dict.fromkeys(found))


# ── Playwright scraper ────────────────────────────────────────────────────────

async def scrape_playwright_one(browser, sid: str, cfg: dict) -> list[str]:
    from playwright_stealth import Stealth

    url   = cfg["url"]
    found: list[str] = []

    try:
        context = await browser.new_context(
            locale="en-GB",
            user_agent=UA,
            viewport={"width": 1440, "height": 900},
        )
        page = await context.new_page()
        await Stealth().apply_stealth(page)
        await page.goto(url, timeout=30_000, wait_until="domcontentloaded")
        await page.wait_for_timeout(2_500)

        # og:image meta
        og = await page.evaluate("""
            () => {
                const m = document.querySelector('meta[property="og:image"]');
                return m ? m.content : null;
            }
        """)
        if og:
            found.append(og)

        # Large <img> elements — width ≥ 600 in rendered layout
        imgs = await page.evaluate("""
            () => Array.from(document.images)
                .filter(img => img.naturalWidth >= 600 && img.src && !img.src.startsWith('data:'))
                .sort((a,b) => b.naturalWidth - a.naturalWidth)
                .slice(0, 12)
                .map(img => img.currentSrc || img.src)
        """)
        found.extend(imgs)

        # Srcset candidates from page HTML
        html = await page.content()
        found.extend(extract_large_srcset_images(html, min_width=900))

        # CSS background images (hero sections)
        bg_imgs = await page.evaluate("""
            () => {
                const results = [];
                const selectors = [
                    '[class*="hero"]', '[class*="banner"]', '[class*="cover"]',
                    '[class*="slider"]', '[class*="carousel"]', 'section',
                    'header', '[class*="background"]',
                ];
                for (const sel of selectors) {
                    for (const el of document.querySelectorAll(sel)) {
                        const bg = window.getComputedStyle(el).backgroundImage;
                        const m = bg.match(/url\\(["']?([^"')]+)["']?\\)/);
                        if (m && m[1] && !m[1].startsWith('data:')) {
                            results.push(m[1]);
                        }
                    }
                }
                return [...new Set(results)];
            }
        """)
        found.extend(bg_imgs)

        await context.close()
    except Exception as e:
        print(f"    [playwright error] {sid}: {e}")

    from urllib.parse import urljoin
    resolved = [urljoin(url, u) for u in found]
    return list(dict.fromkeys(resolved))


async def scrape_all_playwright(to_scrape: dict[str, dict]) -> dict[str, list[str]]:
    if not to_scrape:
        return {}
    from playwright.async_api import async_playwright
    results: dict[str, list[str]] = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for sid, cfg in to_scrape.items():
            print(f"  [{sid}] playwright …")
            urls = await scrape_playwright_one(browser, sid, cfg)
            results[sid] = urls
            time.sleep(1)
        await browser.close()
    return results


# ── Download & manifest ───────────────────────────────────────────────────────

def download_supplier_images(sid: str, urls: list[str]) -> list[str]:
    """
    Download up to IMAGES_PER_SUPPLIER images for a supplier.
    Returns list of public paths like /images/supplier-bg/awarid_0.jpg
    """
    saved: list[str] = []
    idx = 0
    for url in urls:
        if len(saved) >= IMAGES_PER_SUPPLIER:
            break
        # Derive extension
        ext = "jpg"
        m = re.search(r'\.(jpg|jpeg|png|webp)(\?|$)', url, re.IGNORECASE)
        if m:
            ext = m.group(1).lower().replace("jpeg", "jpg")
        dest = OUT_DIR / f"{sid}_{idx}.{ext}"
        if download_image(url, dest):
            saved.append(f"/images/supplier-bg/{dest.name}")
            idx += 1

    return saved


# ── Main ──────────────────────────────────────────────────────────────────────

async def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, list[str]] = {}

    # Load existing manifest so we can merge / skip unchanged
    if MANIFEST.exists():
        try:
            manifest = json.loads(MANIFEST.read_text())
        except Exception:
            pass

    playwright_batch: dict[str, dict] = {}

    for sid, cfg in SUPPLIERS.items():
        print(f"\n── {cfg['label']} ({sid}) ──")
        kind = cfg["type"]

        if kind == "shopify":
            raw_urls = scrape_shopify(sid, cfg)
        elif kind == "html":
            raw_urls = scrape_html(sid, cfg)
        elif kind == "playwright":
            playwright_batch[sid] = cfg
            continue
        else:
            raw_urls = []

        print(f"    found {len(raw_urls)} candidate URLs")
        saved = download_supplier_images(sid, raw_urls)
        if saved:
            manifest[sid] = saved
            print(f"    → {len(saved)} images saved for {sid}")
        else:
            print(f"    ⚠ no images saved for {sid} (keeping existing if any)")

    # Playwright batch
    if playwright_batch:
        print(f"\n── Playwright batch: {list(playwright_batch.keys())} ──")
        pw_results = await scrape_all_playwright(playwright_batch)
        for sid, raw_urls in pw_results.items():
            print(f"    [{sid}] found {len(raw_urls)} candidate URLs")
            saved = download_supplier_images(sid, raw_urls)
            if saved:
                manifest[sid] = saved
                print(f"    → {len(saved)} images saved for {sid}")
            else:
                print(f"    ⚠ no images saved for {sid}")

    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f"\n✅  Manifest written → {MANIFEST}")
    total = sum(len(v) for v in manifest.values())
    print(f"   {len(manifest)} suppliers · {total} images total")


if __name__ == "__main__":
    asyncio.run(main())
