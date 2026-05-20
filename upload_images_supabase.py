"""
Uploads all supplier product images to Supabase Storage.
Creates TWO versions per product:
  - Full:  max 900px wide/tall, JPEG q85  → photo field (main display, PDF)
  - Thumb: 300x300 cover crop, JPEG q75   → photo_sm field (cards, cart)

Updates each supplier's JSON file with the new Supabase URLs.
Resume-safe: skips products where photo_sm already points to Supabase.

Run: python3 upload_images_supabase.py
Run a single supplier: python3 upload_images_supabase.py loreal
"""

import io, json, re, sys, time, urllib.request
from pathlib import Path
from PIL import Image
import requests

# ── Config ────────────────────────────────────────────────────────────────────
SUPABASE_URL = "https://cbyayivatpuyflzsaysv.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNieWF5aXZhdHB1eWZsenNheXN2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODc1NDQ3MiwiZXhwIjoyMDk0MzMwNDcyfQ.nZYVYObW7AVJDYF6LuGQhP5-1AeGmX9BcYWQ-ZNdF_M"
BUCKET       = "product-images"
PUBLIC_BASE  = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}"
STORAGE_API  = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}"

FULL_MAX   = 900   # px — max dimension for full image
THUMB_SIZE = 300   # px — square thumbnail
FULL_Q     = 85    # JPEG quality for full
THUMB_Q    = 75    # JPEG quality for thumb

PUBLIC  = Path(__file__).parent / "public"
HEADERS = {
    "Authorization": f"Bearer {SERVICE_KEY}",
    "apikey": SERVICE_KEY,
}
DOWNLOAD_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
}

SUPPLIERS = {
    "loreal":       "loreal_products.json",
    "nazih":        "nazih_all_products.json",
    "wella":        "wella_products.json",
    "madi":         "madi_products.json",
    "milia":        "milia_products.json",
    "awarid":       "awarid_products.json",
    "albasel":      "albasel_products.json",
    "victoriavynn": "victoriavynn_products.json",
    "skeyndor":     "skeyndor_products.json",
    "nawajm":       "nawajm_products.json",
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def safe_id(product_id: str) -> str:
    """Turn product id into a safe filename (no slashes, spaces, etc.)"""
    return re.sub(r'[^a-zA-Z0-9_\-]', '_', str(product_id))[:120]


def download_image(src: str, supplier: str) -> bytes | None:
    """Download image from URL or read from local path."""
    if not src:
        return None

    # Local file (Madi images)
    if src.startswith("/"):
        local_path = PUBLIC / src.lstrip("/")
        if local_path.exists():
            return local_path.read_bytes()
        return None

    # Remote URL — encode spaces in path (keep query string intact)
    try:
        from urllib.parse import quote, urlsplit, urlunsplit
        parts = urlsplit(src)
        safe_path = quote(parts.path, safe="/:@!$&'()*+,;=")
        src = urlunsplit((parts.scheme, parts.netloc, safe_path, parts.query, parts.fragment))
        req = urllib.request.Request(src, headers=DOWNLOAD_HEADERS)
        data = urllib.request.urlopen(req, timeout=20).read()
        return data if len(data) > 500 else None
    except Exception as e:
        print(f"    ↳ download failed: {e}")
        return None


def process_image(raw: bytes) -> tuple[bytes, bytes] | None:
    """
    Returns (full_bytes, thumb_bytes) or None on failure.
    Full: resize to max FULL_MAX px (keep aspect), JPEG.
    Thumb: cover-crop to THUMB_SIZE square, JPEG.
    """
    try:
        img = Image.open(io.BytesIO(raw)).convert("RGB")

        # ── Full ──────────────────────────────────────────────────────────────
        w, h = img.size
        if w > FULL_MAX or h > FULL_MAX:
            ratio = FULL_MAX / max(w, h)
            img_full = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
        else:
            img_full = img

        buf_full = io.BytesIO()
        img_full.save(buf_full, format="JPEG", quality=FULL_Q, optimize=True)

        # ── Thumb (cover crop to square) ──────────────────────────────────────
        w, h = img.size
        short = min(w, h)
        left  = (w - short) // 2
        top   = (h - short) // 2
        img_thumb = img.crop((left, top, left + short, top + short))
        img_thumb = img_thumb.resize((THUMB_SIZE, THUMB_SIZE), Image.LANCZOS)

        buf_thumb = io.BytesIO()
        img_thumb.save(buf_thumb, format="JPEG", quality=THUMB_Q, optimize=True)

        return buf_full.getvalue(), buf_thumb.getvalue()

    except Exception as e:
        print(f"    ↳ process failed: {e}")
        return None


def upload_to_supabase(path: str, data: bytes, content_type: str = "image/jpeg") -> str | None:
    """
    Upload bytes to Supabase Storage. Returns public URL or None.
    Uses upsert so re-uploads overwrite.
    """
    url = f"{STORAGE_API}/{path}"
    try:
        resp = requests.post(
            url,
            headers={**HEADERS, "Content-Type": content_type, "x-upsert": "true"},
            data=data,
            timeout=30,
        )
        if resp.status_code in (200, 201):
            return f"{PUBLIC_BASE}/{path}"
        else:
            print(f"    ↳ upload error {resp.status_code}: {resp.text[:120]}")
            return None
    except Exception as e:
        print(f"    ↳ upload exception: {e}")
        return None


# ── Main ──────────────────────────────────────────────────────────────────────

def process_supplier(sid: str, fname: str):
    json_path = PUBLIC / fname
    if not json_path.exists():
        print(f"[{sid}] JSON not found, skipping")
        return

    products = json.loads(json_path.read_text())
    total = len(products)
    need_upload = [p for p in products if p.get("photo") and "supabase" not in (p.get("photo_sm") or "")]
    already_done = total - len(need_upload)

    print(f"\n{'='*60}")
    print(f"[{sid}] {total} products — {already_done} already done, {len(need_upload)} to upload")

    uploaded = skipped = errors = 0

    for i, product in enumerate(need_upload):
        pid   = safe_id(product.get("id") or product.get("sku") or f"{sid}_{i}")
        src   = product.get("photo") or ""
        label = product.get("name", "")[:50]

        print(f"  [{i+1}/{len(need_upload)}] {label}", end="\r")

        # Download
        raw = download_image(src, sid)
        if not raw:
            skipped += 1
            continue

        # Process
        result = process_image(raw)
        if not result:
            errors += 1
            continue
        full_bytes, thumb_bytes = result

        # Upload thumb only — photo stays as original supplier URL
        thumb_url = upload_to_supabase(f"{sid}/{pid}_sm.jpg", thumb_bytes)

        if thumb_url:
            product["photo_sm"] = thumb_url
            uploaded += 1
        else:
            errors += 1

        # Save every 25 uploads
        if (uploaded + errors) % 25 == 0:
            json_path.write_text(json.dumps(products, indent=2, ensure_ascii=False))
            print(f"  [{i+1}/{len(need_upload)}] ✓{uploaded} skip:{skipped} err:{errors}      ")

        time.sleep(0.05)  # gentle rate limit

    # Final save
    json_path.write_text(json.dumps(products, indent=2, ensure_ascii=False))
    print(f"\n[{sid}] Done — uploaded:{uploaded} skipped:{skipped} errors:{errors}")


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else None

    if target:
        if target not in SUPPLIERS:
            print(f"Unknown supplier '{target}'. Options: {', '.join(SUPPLIERS)}")
            sys.exit(1)
        process_supplier(target, SUPPLIERS[target])
    else:
        for sid, fname in SUPPLIERS.items():
            process_supplier(sid, fname)

    print("\n✓ All done. JSON files updated with Supabase URLs.")
    print("  photo     → full size (max 900px)")
    print("  photo_sm  → 300×300 thumb")


if __name__ == "__main__":
    main()
