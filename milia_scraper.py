"""
Fetches all products from Milia Cosmetics (miliacosmetics.com) via Shopify /products.json API.
No scraping needed — pure JSON API, 250 products/page.
Prices are in AED. SKU is the product code shown in quick view.
Saves to milia_products.json

Run: python3 milia_scraper.py
Fast — completes in ~30 seconds.
"""

import json, re, urllib.request
from pathlib import Path

OUTPUT = Path(__file__).parent / "milia_products.json"
BASE   = "https://miliacosmetics.com/products.json"


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
            r = urllib.request.urlopen(req, timeout=15)
            data = json.loads(r.read())
            items = data.get("products", [])
            if not items:
                break

            new = 0
            for item in items:
                pid = str(item["id"])
                if pid in existing:
                    continue

                # Use first variant for price/SKU (products with colour variants have one per colour)
                variants = item.get("variants", [])
                # Collect all variants as separate products if they have different SKUs/colours
                for v in variants:
                    vid = f"{pid}-{v['id']}"
                    if vid in products:
                        continue

                    images = item.get("images", [])
                    # Use variant-specific image if available, else first product image
                    photo = None
                    if v.get("featured_image") and v["featured_image"].get("src"):
                        photo = v["featured_image"]["src"].split("?")[0]
                    elif images:
                        photo = images[0]["src"].split("?")[0]

                    all_imgs = [img["src"].split("?")[0] for img in images]

                    # Product name: include variant title if meaningful
                    name = item["title"]
                    if v.get("title") and v["title"] not in ("Default Title", ""):
                        name = f"{item['title']} - {v['title']}"

                    products[vid] = {
                        "id":           vid,
                        "product_id":   pid,
                        "name":         name,
                        "brand":        item.get("vendor") or "Milia",
                        "sku":          v.get("sku") or "",
                        "ean":          None,
                        "price":        float(v["price"]) if v.get("price") else None,
                        "currency":     "AED",
                        "photo":        photo,
                        "images":       all_imgs,
                        "description":  strip_html(item.get("body_html", "")),
                        "category":     item.get("product_type") or "",
                        "tags":         item.get("tags", []),
                        "available":    v.get("available", True),
                        "url":          f"https://miliacosmetics.com/products/{item['handle']}",
                        "supplier":     "Milia",
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

    # Summary by category
    cats: dict[str, int] = {}
    brands: dict[str, int] = {}
    for p in result:
        cats[p.get("category") or "Other"] = cats.get(p.get("category") or "Other", 0) + 1
        brands[p.get("brand") or "?"] = brands.get(p.get("brand") or "?", 0) + 1

    print(f"\nTop brands:")
    for b, n in sorted(brands.items(), key=lambda x: -x[1])[:15]:
        print(f"  {b:35s} {n:4d}")
    print(f"\nTop categories:")
    for c, n in sorted(cats.items(), key=lambda x: -x[1])[:15]:
        print(f"  {c:35s} {n:4d}")


if __name__ == "__main__":
    scrape()
