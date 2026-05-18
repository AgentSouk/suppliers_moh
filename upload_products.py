"""
Uploads loreal_products.json and nazih_all_products.json to Supabase.
Uses service role key for write access (bypasses RLS).
Run:  python3 upload_products.py
"""

import json, os, re, sys
from pathlib import Path
from supabase import create_client

# ── Config ────────────────────────────────────────────────────────────────────
SUPABASE_URL = "https://cbyayivatpuyflzsaysv.supabase.co"

# Paste your service_role key here (Settings → API → service_role in Supabase dashboard)
# Never commit this key — it bypasses all RLS.
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SERVICE_KEY:
    print("ERROR: Set SUPABASE_SERVICE_KEY env var to your service_role key.")
    print("  export SUPABASE_SERVICE_KEY='eyJ...'")
    print("  python3 upload_products.py")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SERVICE_KEY)

LOREAL_JSON = Path(__file__).parent / "public" / "loreal_products.json"
NAZIH_JSON  = Path(__file__).parent / "public" / "nazih_all_products.json"

BATCH = 200  # rows per upsert call


def slugify(url: str, idx: int) -> str:
    """Derive a stable ID from a product URL."""
    s = re.sub(r'https?://[^/]+/', '', url.strip().rstrip('/'))
    s = re.sub(r'[^a-z0-9-]', '-', s.lower())
    s = re.sub(r'-+', '-', s).strip('-')
    return s or f"product-{idx}"


def upload_loreal():
    print("\n── L'Oréal products ──────────────────────────────────────────")
    data = json.loads(LOREAL_JSON.read_text())
    rows = []
    for i, p in enumerate(data):
        row_id = str(p.get("id") or p.get("ean") or slugify(p.get("url",""), i))
        rows.append({
            "id":           row_id,
            "name":         (p.get("name") or "")[:500],
            "brand":        p.get("brand"),
            "product_code": p.get("product_code"),
            "ean":          p.get("ean"),
            "aki_code":     p.get("aki_code"),
            "price":        p.get("price"),
            "photo":        p.get("photo"),
            "url":          p.get("url"),
            "sub_category": p.get("sub_category"),
            "uom":          p.get("uom") or "EA",
        })

    total = len(rows)
    uploaded = 0
    for start in range(0, total, BATCH):
        batch = rows[start:start + BATCH]
        result = supabase.table("loreal_products").upsert(batch, on_conflict="id").execute()
        uploaded += len(batch)
        print(f"  {uploaded}/{total} uploaded", end="\r")

    print(f"\n✓ {total} L'Oréal products uploaded to loreal_products")


def upload_nazih():
    print("\n── Nazih products ────────────────────────────────────────────")
    data = json.loads(NAZIH_JSON.read_text())
    rows = []
    for i, p in enumerate(data):
        row_id = slugify(p.get("url",""), i)
        rows.append({
            "id":           row_id,
            "name":         (p.get("name") or "")[:500],
            "brand":        p.get("brand"),
            "ean":          p.get("ean"),
            "sku":          p.get("sku"),
            "price":        p.get("price"),
            "photo":        p.get("photo"),
            "url":          p.get("url"),
            "category":     p.get("category"),
            "sub_category": p.get("sub_category"),
        })

    # Deduplicate by id (same product may appear in multiple categories)
    seen = {}
    for r in rows:
        seen[r["id"]] = r
    rows = list(seen.values())

    total = len(rows)
    uploaded = 0
    for start in range(0, total, BATCH):
        batch = rows[start:start + BATCH]
        result = supabase.table("nazih_products").upsert(batch, on_conflict="id").execute()
        uploaded += len(batch)
        print(f"  {uploaded}/{total} uploaded", end="\r")

    print(f"\n✓ {total} Nazih products uploaded to nazih_products")

    # Summary by category
    cats = {}
    for r in rows:
        cats[r["category"] or "Unknown"] = cats.get(r["category"] or "Unknown", 0) + 1
    print("\n  By category:")
    for cat, count in sorted(cats.items()):
        print(f"    {cat:35s} {count:4d}")


def upload_wella():
    wella_json = Path(__file__).parent / "public" / "wella_products.json"
    if not wella_json.exists():
        print("\n── Wella: wella_products.json not found, skipping")
        return
    print("\n── Wella products ────────────────────────────────────────────")
    data = json.loads(wella_json.read_text())
    rows = []
    for i, p in enumerate(data):
        row_id = p.get("slug") or slugify(p.get("url", ""), i)
        rows.append({
            "id":           row_id,
            "slug":         p.get("slug"),
            "name":         (p.get("name") or "")[:500],
            "brand":        p.get("brand") or "Wella Professionals",
            "sku":          p.get("sku"),
            "ean":          p.get("ean"),
            "price":        p.get("price"),
            "photo":        p.get("photo"),
            "images":       json.dumps(p.get("images") or []),
            "description":  p.get("description"),
            "category":     p.get("category"),
            "sub_category": p.get("sub_category"),
            "size":         p.get("size"),
            "url":          p.get("url"),
        })

    total = len(rows)
    uploaded = 0
    for start in range(0, total, BATCH):
        batch = rows[start:start + BATCH]
        supabase.table("wella_products").upsert(batch, on_conflict="id").execute()
        uploaded += len(batch)
        print(f"  {uploaded}/{total} uploaded", end="\r")

    print(f"\n✓ {total} Wella products uploaded to wella_products")
    cats = {}
    for r in rows:
        cats[r["category"] or "Unknown"] = cats.get(r["category"] or "Unknown", 0) + 1
    print("\n  By category:")
    for cat, count in sorted(cats.items()):
        print(f"    {cat:35s} {count:4d}")


def upload_milia():
    milia_json = Path(__file__).parent / "public" / "milia_products.json"
    if not milia_json.exists():
        print("\n── Milia: milia_products.json not found, skipping")
        return
    print("\n── Milia Cosmetics products ───────────────────────────────────")
    data = json.loads(milia_json.read_text())
    rows = []
    for i, p in enumerate(data):
        row_id = str(p.get("id") or slugify(p.get("url", ""), i))
        rows.append({
            "id":           row_id[:255],
            "product_id":   str(p.get("product_id") or ""),
            "name":         (p.get("name") or "")[:500],
            "brand":        p.get("brand") or "Milia",
            "sku":          p.get("sku"),
            "ean":          p.get("ean"),
            "price":        p.get("price"),
            "currency":     p.get("currency") or "AED",
            "photo":        p.get("photo"),
            "images":       json.dumps(p.get("images") or []),
            "description":  p.get("description"),
            "category":     p.get("category"),
            "tags":         json.dumps(p.get("tags") or []),
            "available":    p.get("available", True),
            "url":          p.get("url"),
        })

    total = len(rows)
    uploaded = 0
    for start in range(0, total, BATCH):
        batch = rows[start:start + BATCH]
        supabase.table("milia_products").upsert(batch, on_conflict="id").execute()
        uploaded += len(batch)
        print(f"  {uploaded}/{total} uploaded", end="\r")

    print(f"\n✓ {total} Milia products uploaded to milia_products")
    brands: dict = {}
    for r in rows:
        brands[r["brand"] or "Unknown"] = brands.get(r["brand"] or "Unknown", 0) + 1
    print("\n  Top brands:")
    for b, count in sorted(brands.items(), key=lambda x: -x[1])[:10]:
        print(f"    {b:35s} {count:4d}")


def upload_madi():
    madi_json = Path(__file__).parent / "public" / "madi_products.json"
    if not madi_json.exists():
        print("\n── Madi: madi_products.json not found, skipping")
        return
    print("\n── Madi International products ────────────────────────────────")
    data = json.loads(madi_json.read_text())
    rows = []
    for i, p in enumerate(data):
        row_id = str(p.get("id") or slugify(p.get("url", ""), i))
        rows.append({
            "id":           row_id[:255],
            "name":         (p.get("name") or "")[:500],
            "brand":        p.get("brand") or "Madi",
            "sku":          p.get("sku"),
            "ean":          p.get("ean"),
            "price":        p.get("price"),
            "photo":        p.get("photo"),
            "images":       json.dumps(p.get("images") or []),
            "description":  p.get("description"),
            "category":     p.get("category"),
            "sub_category": p.get("sub_category"),
            "sub_family":   p.get("sub_family"),
            "color_code":   p.get("color_code"),
            "color_name":   p.get("color_name"),
            "url":          p.get("url"),
        })

    total = len(rows)
    uploaded = 0
    for start in range(0, total, BATCH):
        batch = rows[start:start + BATCH]
        supabase.table("madi_products").upsert(batch, on_conflict="id").execute()
        uploaded += len(batch)
        print(f"  {uploaded}/{total} uploaded", end="\r")

    print(f"\n✓ {total} Madi products uploaded to madi_products")
    brands: dict = {}
    for r in rows:
        brands[r["brand"] or "Unknown"] = brands.get(r["brand"] or "Unknown", 0) + 1
    print("\n  Top brands:")
    for b, count in sorted(brands.items(), key=lambda x: -x[1])[:10]:
        print(f"    {b:35s} {count:4d}")


if __name__ == "__main__":
    upload_loreal()
    upload_nazih()
    upload_wella()
    upload_milia()
    upload_madi()
    print("\n✓ Done.")
