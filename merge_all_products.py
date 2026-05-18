"""
Merges all product sources into loreal_products.json:
  1. First Excel (Lushways - 06052026 (4).xlsx)  → L'Oreal Professional + Essie
  2. Second Excel (Lushways order NEW sept 19 (3).xlsx) → Kerastase
  Photos for Essie come from essie_products.json (already scraped from essie.com).
  Photos for L'Oreal / Kerastase come from loreal_products_backup.json if available.
"""

import json, re, openpyxl, shutil
from difflib import SequenceMatcher
from pathlib import Path

BASE = Path(__file__).parent
SCRAPED = BASE / "loreal_products_backup.json"

# ── helpers ───────────────────────────────────────────────────────────────────

def parse_essie_name(raw: str):
    """
    'ESSIE NAIL POLISH 24 IN STITCHE 13.5 ML'
    Read right-to-left: drop size tokens, collect alpha words, stop at number.
    Returns (shade_number, shade_name) or (None, None).
    """
    raw = raw.strip()
    # strip trailing size: digits + ML / ML at end
    cleaned = re.sub(r'\s+\d+\.?\d*\s+ML.*$', '', raw, flags=re.I).strip()
    # now tokenise
    tokens = cleaned.split()
    name_words = []
    shade_num = None
    # walk right to left
    for tok in reversed(tokens):
        if re.fullmatch(r'\d+', tok):
            shade_num = tok
            break
        name_words.insert(0, tok)
    shade_name = ' '.join(name_words).strip()
    return shade_num, shade_name


def best_essie_photo(shade_name: str, essie_scraped: list) -> str:
    """Match shade name from Excel against essie_products.json names, return photo URL."""
    if not shade_name:
        return ""
    shade_up = shade_name.upper()
    best_photo, best_score = "", 0.0
    for e in essie_scraped:
        name_up = e["name"].upper()
        # word overlap score
        sw = set(shade_up.split())
        nw = set(name_up.split())
        overlap = len(sw & nw) / max(len(sw), 1)
        # sequence ratio
        ratio = SequenceMatcher(None, shade_up, name_up).ratio()
        score = max(overlap * 0.9, ratio)
        if score > best_score:
            best_score = score
            best_photo = e.get("photo", "")
    return best_photo if best_score >= 0.5 else ""


# ── load existing scraped data (photo source for L'Oreal / Kerastase) ─────────

# Try to load the original 700-product scrape if it exists as backup
scraped_by_ean: dict = {}
if SCRAPED.exists():
    for p in json.loads(SCRAPED.read_text()):
        if p.get("ean"):
            scraped_by_ean[p["ean"]] = p
    print(f"Loaded {len(scraped_by_ean)} scraped products for photo lookup")
else:
    # Fall back to current loreal_products.json
    current = json.loads((BASE / "loreal_products.json").read_text())
    for p in current:
        if p.get("ean"):
            scraped_by_ean[p["ean"]] = p
    print(f"No backup found — using current JSON ({len(scraped_by_ean)} products) for photos")


# ── parse first Excel: L'Oreal Professional + Essie ──────────────────────────

wb1 = openpyxl.load_workbook(BASE / "Lushways - 06052026 (4).xlsx")
ws1 = wb1.active

lp_products = []
essie_products = []

for i, row in enumerate(ws1.iter_rows(values_only=True)):
    if i < 8:
        continue
    brand_col = str(row[2] or "").strip()
    ean       = str(row[1] or "").strip().split(".")[0]
    aki       = str(row[3] or "").strip()
    name_raw  = str(row[4] or "").strip()
    price     = row[6]

    if not name_raw or name_raw == "Item Description":
        continue

    if brand_col == "LP":
        lp_products.append({"ean": ean, "aki": aki, "name": name_raw, "price": price, "brand_col": brand_col})

    elif brand_col == "Essie":
        shade_num, shade_name = parse_essie_name(name_raw)
        essie_products.append({
            "ean": ean,
            "aki": aki,
            "name": name_raw,
            "shade_number": shade_num,
            "shade_name": shade_name,
            "price": price,
        })

print(f"First Excel → LP: {len(lp_products)}  Essie: {len(essie_products)}")


# ── parse second Excel: Kerastase ─────────────────────────────────────────────

wb2 = openpyxl.load_workbook(BASE / "Lushways order NEW sept 19 (3).xlsx")
ws2 = wb2["Active Range"]

kerastase_products = []
for i, row in enumerate(ws2.iter_rows(values_only=True)):
    if i < 6:
        continue
    barcode = str(row[5] or "").strip().split(".")[0]   # col F
    desc    = str(row[7] or "").strip()                  # col H
    price   = row[9]                                     # col J
    sub     = str(row[2] or "").strip()                  # col C = sub-brand
    if barcode and desc and barcode.isdigit():
        kerastase_products.append({
            "ean": barcode,
            "aki": "",
            "name": desc,
            "sub_brand": sub,
            "price": price,
            "brand": "Kerastase",
        })

print(f"Second Excel → Kerastase: {len(kerastase_products)}")


# ── build final product list ──────────────────────────────────────────────────

all_products = []

# 1. L'Oreal Professional
for ex in lp_products:
    scraped = scraped_by_ean.get(ex["ean"], {})
    all_products.append({
        "id":           ex["ean"] or f"lp-{len(all_products)}",
        "name":         ex["name"],
        "brand":        scraped.get("brand") or "L'Oreal Professionnel",
        "product_code": scraped.get("product_code") or f"GB{ex['ean']}",
        "ean":          ex["ean"],
        "aki_code":     ex["aki"],
        "price":        ex["price"],
        "photo":        scraped.get("photo") or "",
        "url":          scraped.get("url") or "",
        "sub_category": scraped.get("sub_category") or "",
        "uom":          "EA",
    })

print(f"LP products added: {len(all_products)}")

# 2. Kerastase
kera_added = 0
for ex in kerastase_products:
    scraped = scraped_by_ean.get(ex["ean"], {})
    all_products.append({
        "id":           ex["ean"] or f"kera-{kera_added}",
        "name":         ex["name"],
        "brand":        "Kerastase",
        "product_code": scraped.get("product_code") or f"GB{ex['ean']}",
        "ean":          ex["ean"],
        "aki_code":     ex["aki"],
        "price":        ex["price"],
        "photo":        scraped.get("photo") or "",
        "url":          scraped.get("url") or "",
        "sub_category": ex.get("sub_brand") or "",
        "uom":          "EA",
    })
    kera_added += 1

print(f"Kerastase products added: {kera_added}")

# 3. Essie — match photos from essie_products.json (already scraped from essie.com)
essie_scraped = json.loads((BASE / "essie_products.json").read_text())
print(f"\nMatching Essie photos from essie_products.json ({len(essie_scraped)} scraped) ...")
essie_added = 0
for idx, ex in enumerate(essie_products):
    photo = best_essie_photo(ex["shade_name"], essie_scraped)
    status = "✓" if photo else "✗"
    print(f"  [{idx+1}/{len(essie_products)}] {status} {ex['shade_number']} {ex['shade_name'][:30]}")

    all_products.append({
        "id":           f"essie-{ex['shade_number']}" if ex["shade_number"] else f"essie-{ex['ean']}",
        "name":         ex["name"],
        "brand":        "Essie",
        "product_code": ex["ean"],
        "ean":          ex["ean"],
        "aki_code":     ex["aki"],
        "shade_number": ex["shade_number"],
        "shade_name":   ex["shade_name"],
        "price":        ex["price"],
        "photo":        photo,
        "url":          "",
        "sub_category": "Nail Polish",
        "uom":          "EA",
    })
    essie_added += 1

print(f"\nEssie products added: {essie_added}")

# ── save ──────────────────────────────────────────────────────────────────────

out = BASE / "loreal_products.json"
out.write_text(json.dumps(all_products, indent=2))

for dest in [BASE / "public" / "loreal_products.json",
             BASE / "app" / "api" / "loreal" / "products.json"]:
    shutil.copy(out, dest)

lp_count = sum(1 for p in all_products if p["brand"] not in ("Kerastase","Essie"))
kera_count = sum(1 for p in all_products if p["brand"] == "Kerastase")
ess_count = sum(1 for p in all_products if p["brand"] == "Essie")
with_photo = sum(1 for p in all_products if p.get("photo"))

print(f"\n✓ Saved {len(all_products)} products")
print(f"  L'Oreal Professional : {lp_count}")
print(f"  Kerastase            : {kera_count}")
print(f"  Essie                : {ess_count}")
print(f"  With photo           : {with_photo}")
