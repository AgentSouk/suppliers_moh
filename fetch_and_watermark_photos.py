"""
For every product in loreal_products.json with no photo:
  1. Searches DuckDuckGo images for the product name
  2. Downloads the first result
  3. Adds a subtle watermark
  4. Uploads to Supabase storage (bucket: product-images)
  5. Updates the product's photo URL in loreal_products.json + public copies
"""

import json, re, time, io, shutil, requests, os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from supabase import create_client
from ddgs import DDGS

BASE = Path(__file__).parent
PRODUCTS_FILE = BASE / "loreal_products.json"

SUPABASE_URL = "https://cbyayivatpuyflzsaysv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNieWF5aXZhdHB1eWZsenNheXN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NTQ0NzIsImV4cCI6MjA5NDMzMDQ3Mn0.dDixOWzqHUakWe7wEK2sk0VKCQmgyW03ojNRh_g_rgo"
BUCKET = "product-images"

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
}

GOOD_DOMAINS = (
    "ounass.ae",
    "loreal", "kerastase", "redken", "essie", "lookfantastic",
    "beauty", "sephora", "feelunique", "boots", "superdrug", "amazon",
    "notino", "parfumdreams", "strawberrynet", "fragrancenet", "ulta",
)

SKIP_KEYWORDS = (
    "majirel", "inoa", "dia color", "dia light", "dia richesse", "dia activateur",
    "luocolor", "oxydant", "efassor", "blonde studio", "blond studio", "oildev",
    "developer", "activateur", "activator", "oreor", "maji", "luo ",
    "color ", "colour ", "coloring", "colouring", "toner", "toning",
    "hair touch up", "root cover",
)

ABBREV = {
    r'\bSE\s+ARM\b': 'absolut repair',
    r'\bSE\s+VIT\b': 'vitamino color',
    r'\bSE\s+SPEC\b': 'serie expert',
    r'\bSE\b': 'serie expert',
    r'\bLOREAL\s+PRO\b': 'loreal professionnel',
    r'\bLP\b': 'loreal professionnel',
    r'\bCSR\b': '',
    r'\bBL?\s*STUDIO\b': 'blond studio',
}

def clean_query(name: str) -> str:
    """Translate abbreviations, strip sizes/codes for clean search."""
    q = name
    for pat, repl in ABBREV.items():
        q = re.sub(pat, repl, q, flags=re.I)
    q = re.sub(r'\s+\d+\.?\d*\s*(ML|GMS|GM|L)\b.*$', '', q, flags=re.I)
    q = re.sub(r'\b(V[A-Z0-9]{2,}|BA|SPE\d*|VE\d+|CB|VI\d+|R\d+)\b', '', q, flags=re.I)
    q = re.sub(r'\s+', ' ', q).strip()
    if 'kerastase' in q.lower():
        q += ' hair care'
    return q


OUNASS_BASE = "https://ounass-ae.atgcdn.ae/pub/media/catalog/product"

def ounass_search_image(query: str) -> str | None:
    """Search Ounass.ae API for product image — highest quality source."""
    clean = clean_query(query)
    try:
        r = requests.get(
            f"https://www.ounass.ae/api/search?q={requests.utils.quote(clean)}&page=1",
            headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
            timeout=12,
        )
        hits = r.json().get("hits", [])
        if not hits:
            return None
        img_path = hits[0].get("image", "")
        if img_path:
            # Strip any double-path artifacts
            img_path = img_path.split("ounass-ae.atgcdn.ae/")[-1]
            img_path = re.sub(r'^pub/media/catalog/product/', '', img_path)
            return f"{OUNASS_BASE}/{img_path}"
        return None
    except Exception as e:
        print(f"    Ounass error: {e}")
        return None


def ddg_search_image(query: str) -> str | None:
    """Fallback: search DuckDuckGo images, prefer beauty sites."""
    clean = clean_query(query)
    try:
        time.sleep(3)
        with DDGS() as ddgs:
            results = list(ddgs.images(clean, max_results=10))
        for r in results:
            url = r.get("image", "")
            if url and any(d in url.lower() for d in GOOD_DOMAINS):
                return url
        for r in results:
            url = r.get("image", "")
            if url and url.startswith("http"):
                return url
        return None
    except Exception as e:
        print(f"    DDG error: {e}")
        return None


def ddg_search_image(query: str) -> str | None:
    """Search DuckDuckGo images using the official library."""
    clean = clean_query(query)
    try:
        time.sleep(3)
        with DDGS() as ddgs:
            results = list(ddgs.images(clean, max_results=3))
        for r in results:
            url = r.get("image", "")
            if url and url.startswith("http"):
                return url
        return None
    except Exception as e:
        print(f"    DDG error: {e}")
        return None


def add_watermark(img_bytes: bytes, text: str = "Re-Check photo") -> bytes:
    """Add a subtle diagonal watermark to the image."""
    img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
    w, h = img.size

    # Create transparent overlay
    overlay = Image.new("RGBA", img.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)

    font_size = max(20, min(w, h) // 12)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
    except Exception:
        font = ImageFont.load_default()

    # Get text size and place diagonally in centre
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (w - tw) // 2
    y = (h - th) // 2

    # Shadow
    draw.text((x + 2, y + 2), text, font=font, fill=(0, 0, 0, 40))
    # Main text
    draw.text((x, y), text, font=font, fill=(255, 255, 255, 80))

    watermarked = Image.alpha_composite(img, overlay).convert("RGB")
    out = io.BytesIO()
    watermarked.save(out, format="JPEG", quality=88)
    return out.getvalue()


IMG_DIR = BASE / "public" / "product-images"
IMG_DIR.mkdir(exist_ok=True)

def save_image(img_bytes: bytes, filename: str) -> str:
    """Save image to public/product-images/ and return the URL path."""
    dest = IMG_DIR / filename
    dest.write_bytes(img_bytes)
    return f"/product-images/{filename}"


def main():
    products = json.loads(PRODUCTS_FILE.read_text())
    missing = [p for p in products if not p.get("photo")
               and not any(kw in p.get("name","").lower() for kw in SKIP_KEYWORDS)]
    print(f"Products missing photo (skipping colour lines): {len(missing)}")

    # Ensure bucket exists
    try:
        supabase.storage.create_bucket(BUCKET, options={"public": True})
        print(f"Created bucket '{BUCKET}'")
    except Exception:
        print(f"Bucket '{BUCKET}' already exists — OK")

    updated = 0
    for idx, product in enumerate(missing):
        name = product["name"]
        pid = product.get("id", product.get("ean", str(idx)))
        safe_id = re.sub(r"[^a-zA-Z0-9_-]", "_", str(pid))
        filename = f"{safe_id}.jpg"

        print(f"\n[{idx+1}/{len(missing)}] {name[:60]}")

        # 1. Search — Ounass only
        img_url = ounass_search_image(name)
        if not img_url:
            print("    ✗ Not found on Ounass — skipping")
            continue
        print(f"    Ounass: {img_url[:70]}")

        # 2. Download — skip known blocked domains, try up to 3 results
        BLOCKED = ("fbsbx.com", "facebook.com", "fb.com", "instagram.com")
        img_bytes = None
        for result in ([img_url] if img_url else []):
            if any(b in result for b in BLOCKED):
                print(f"    ⚠ Skipping blocked domain: {result[:60]}")
                # Try next DDG result
                try:
                    clean = clean_query(name)
                    time.sleep(2)
                    with DDGS() as ddgs:
                        extras = list(ddgs.images(clean, max_results=5))
                    for ex in extras:
                        url2 = ex.get("image","")
                        if url2 and not any(b in url2 for b in BLOCKED):
                            result = url2
                            break
                except Exception:
                    pass
            try:
                resp = requests.get(result, headers={**HEADERS, "Referer": "https://www.google.com/"}, timeout=15)
                if resp.ok and "image" in resp.headers.get("content-type", ""):
                    img_bytes = resp.content
                    break
            except Exception as e:
                print(f"    ✗ Download error: {e}")
        if not img_bytes:
            print("    ✗ Download failed")
            continue

        # 3. Watermark
        try:
            img_bytes = add_watermark(img_bytes)
            print("    ✓ Watermark added")
        except Exception as e:
            print(f"    ⚠ Watermark failed ({e}), using original")

        # 4. Save locally
        public_url = save_image(img_bytes, filename)
        print(f"    ✓ Saved: {public_url}")

        # 5. Update product
        product["photo"] = public_url
        updated += 1

        # Save progress every 10
        if updated % 10 == 0:
            PRODUCTS_FILE.write_text(json.dumps(products, indent=2))
            print(f"  → Progress saved ({updated} done)")

        time.sleep(0.5)

    PRODUCTS_FILE.write_text(json.dumps(products, indent=2))
    for dest in [BASE / "public" / "loreal_products.json",
                 BASE / "app" / "api" / "loreal" / "products.json"]:
        shutil.copy(PRODUCTS_FILE, dest)

    print(f"\n✓ Done. Updated {updated}/{len(missing)} products with watermarked photos.")


if __name__ == "__main__":
    main()
