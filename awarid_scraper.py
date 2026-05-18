"""
Fetches all products from Awarid (ae.awarid.com) via Shopify /collections/all/products.json API.
Pure urllib — no Playwright needed. Prices in AED.
Saves to awarid_products.json

Run: python3 awarid_scraper.py
"""

import json, re, urllib.request
from pathlib import Path

OUTPUT = Path(__file__).parent / "awarid_products.json"
BASE   = "https://ae.awarid.com/collections/all/products.json"
STORE  = "https://ae.awarid.com"

CATEGORY_MAP = [
    # (keywords in raw product_type, normalised category)
    (["color", "colour", "dye", "tint", "bleach", "lightener", "oxid"], "Hair Colouring"),
    (["shampoo", "conditioner", "wash", "rinse"],                        "Hair Care"),
    (["mask", "treatment", "protein", "keratin", "serum", "oil", "argan"], "Hair Treatment"),
    (["styling", "gel", "wax", "pomade", "spray", "mousse", "cream", "paste", "fiber"], "Hair Styling"),
    (["nail", "manicure", "pedicure", "cuticle"],                        "Nail Care"),
    (["clipper", "trimmer", "shaver", "razor", "blade", "shav"],         "Shaving & Grooming"),
    (["brush", "comb", "scissor", "clip", "roller", "cape", "foil",
      "tool", "accessor", "bag", "case", "apron", "mirror", "bowl"],    "Tools & Accessories"),
    (["dryer", "straighten", "curling", "iron", "waver", "steamer",
      "electronic", "electric", "device", "clipper", "machine",
      "uv", "led", "lamp"],                                              "Electrical Tools"),
    (["face", "skin", "serum", "moistur", "sunscreen", "cleanser",
      "toner", "exfoliat", "peeling", "eye cream", "lip"],              "Skin Care"),
    (["body", "lotion", "scrub", "soap", "shower", "bath", "wax",
      "depilat", "massage oil"],                                         "Body Care"),
    (["chair", "bed", "trolley", "furniture", "stool", "unit", "wash"], "Furniture & Equipment"),
    (["lash", "brow", "eyebrow", "eyelash"],                            "Lash & Brow"),
    (["makeup", "foundation", "lipstick", "mascara", "concealer",
      "blush", "contour", "highlighter", "eyeshadow"],                  "Makeup & Beauty"),
    (["towel", "disposable", "single", "glove", "cotton", "steriliz"],  "Disposables & Hygiene"),
]

def normalise_category(raw: str, name: str, tags: list) -> str:
    text = (raw + " " + name + " " + " ".join(tags)).lower()
    for kws, cat in CATEGORY_MAP:
        if any(k in text for k in kws):
            return cat
    return "Other"


def strip_html(html: str) -> str:
    if not html:
        return ""
    return re.sub(r'<[^>]+>', '', html).strip()


def scrape():
    existing: dict[str, dict] = {}
    if OUTPUT.exists():
        try:
            for p in json.loads(OUTPUT.read_text()):
                if p.get("id"):
                    existing[str(p["id"])] = p
            print(f"Loaded {len(existing)} existing products")
        except Exception:
            pass

    products: dict[str, dict] = dict(existing)
    page = 1

    while True:
        url = f"{BASE}?limit=250&page={page}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            r = urllib.request.urlopen(req, timeout=20)
            data = json.loads(r.read())
            items = data.get("products", [])
            if not items:
                break

            new = 0
            for item in items:
                pid = str(item["id"])
                variants = item.get("variants", [])
                tags = item.get("tags", [])
                raw_cat = item.get("product_type") or ""

                for v in variants:
                    vid = f"{pid}-{v['id']}"
                    if vid in products:
                        continue

                    images = item.get("images", [])
                    photo = None
                    if v.get("featured_image") and v["featured_image"].get("src"):
                        photo = v["featured_image"]["src"].split("?")[0]
                    elif images:
                        photo = images[0]["src"].split("?")[0]

                    all_imgs = [img["src"].split("?")[0] for img in images]

                    name = item["title"]
                    if v.get("title") and v["title"] not in ("Default Title", ""):
                        name = f"{item['title']} - {v['title']}"

                    category = normalise_category(raw_cat, name, tags)

                    products[vid] = {
                        "id":           vid,
                        "product_id":   pid,
                        "name":         name,
                        "brand":        (item.get("vendor") or "Awarid").strip(),
                        "sku":          v.get("sku") or "",
                        "ean":          None,
                        "price":        float(v["price"]) if v.get("price") else None,
                        "currency":     "AED",
                        "photo":        photo,
                        "images":       all_imgs,
                        "description":  strip_html(item.get("body_html", "")),
                        "category":     category,
                        "raw_category": raw_cat,
                        "tags":         tags,
                        "available":    v.get("available", True),
                        "url":          f"{STORE}/products/{item['handle']}",
                        "supplier":     "Awarid",
                    }
                    new += 1

            print(f"Page {page}: {len(items)} products, {new} new (total: {len(products)})")
            if len(items) < 250:
                break
            page += 1

        except Exception as e:
            print(f"Page {page} error: {e}")
            break

    result = list(products.values())
    OUTPUT.write_text(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"\n✓ Saved {len(result)} products to {OUTPUT}")

    cats: dict[str, int] = {}
    brands: dict[str, int] = {}
    for p in result:
        cats[p.get("category") or "Other"] = cats.get(p.get("category") or "Other", 0) + 1
        brands[p.get("brand") or "?"] = brands.get(p.get("brand") or "?", 0) + 1

    print(f"\nBy category:")
    for c, n in sorted(cats.items(), key=lambda x: -x[1]):
        print(f"  {c:40s} {n:4d}")
    print(f"\nTop brands:")
    for b, n in sorted(brands.items(), key=lambda x: -x[1])[:20]:
        print(f"  {b:40s} {n:4d}")


if __name__ == "__main__":
    scrape()
