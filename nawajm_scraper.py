"""
Fetches all products from Nawajm Cosmetics (nawaimcosmetics.ae) via Shopify /products.json API.
No scraping needed — pure JSON API, 250 products/page.
Prices are in AED.
Saves to nawajm_products.json

Run: python3 nawajm_scraper.py
"""

import json, re, urllib.request
from pathlib import Path

OUTPUT = Path(__file__).parent / "nawajm_products.json"
BASE   = "https://nawaimcosmetics.ae/products.json"


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
            req = urllib.request.Request(url, headers={
                "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept":          "application/json, text/plain, */*",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer":         "https://nawaimcosmetics.ae/",
            })
            r = urllib.request.urlopen(req, timeout=15)
            data = json.loads(r.read())
            items = data.get("products", [])
            if not items:
                break

            new = 0
            for item in items:
                pid = str(item["id"])

                variants = item.get("variants", [])
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

                    products[vid] = {
                        "id":           vid,
                        "product_id":   pid,
                        "name":         name,
                        "brand":        item.get("vendor") or "Nawajm",
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
                        "url":          f"https://nawaimcosmetics.ae/products/{item['handle']}",
                        "supplier":     "Nawajm",
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

    print(f"\nTop brands:")
    for b, n in sorted(brands.items(), key=lambda x: -x[1])[:15]:
        print(f"  {b:35s} {n:4d}")
    print(f"\nTop categories:")
    for c, n in sorted(cats.items(), key=lambda x: -x[1])[:15]:
        print(f"  {c:35s} {n:4d}")


if __name__ == "__main__":
    scrape()
