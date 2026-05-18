"""
Scrapes Al Basel Cosmetics (albaselco.com) — custom Shopify-based platform.
Product URLs from sitemap_products_1.xml, data from JSON-LD on each product page.
Skips L'Oréal, Kérastase, and Essie (covered by the direct L'Oréal supplier).
Saves to albasel_products.json

Run: python3 albasel_scraper.py
Resume-safe: skips URLs already scraped.
"""

import json, re, time, urllib.request
from pathlib import Path
from html import unescape

OUTPUT  = Path(__file__).parent / "albasel_products.json"
BASE    = "https://albaselco.com"
SITEMAP = f"{BASE}/sitemap_products_1.xml"

# Brands to skip — handled by the direct L'Oréal supplier
SKIP_BRANDS = {"loreal", "l'oreal", "l'oreal professionnel", "loreal professionnel",
               "kerastase", "kérastase", "kérastase", "essie"}

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

CATEGORY_MAP = [
    (["color", "colour", "dye", "tint", "bleach", "lightener", "oxid", "highlight"], "Hair Colouring"),
    (["shampoo", "conditioner", "wash"],                                              "Hair Care"),
    (["mask", "treatment", "protein", "keratin", "serum", "oil", "argan", "repair"], "Hair Treatment"),
    (["styling", "gel", "wax", "pomade", "spray", "mousse", "cream", "paste"],       "Hair Styling"),
    (["nail", "manicure", "pedicure", "cuticle"],                                     "Nail Care"),
    (["clipper", "trimmer", "shaver", "razor", "blade", "shaving", "beard"],          "Shaving & Grooming"),
    (["brush", "comb", "scissor", "clip", "roller", "cape", "foil",
      "tool", "accessor", "bag", "apron", "mirror", "bowl", "spatula"],              "Tools & Accessories"),
    (["dryer", "straighten", "curling", "iron", "waver", "steamer",
      "electric", "device", "uv", "led", "lamp", "machine"],                         "Electrical Tools"),
    (["face", "skin", "moistur", "sunscreen", "cleanser", "toner",
      "exfoliat", "peeling", "eye cream"],                                            "Skin Care"),
    (["body", "lotion", "scrub", "soap", "shower", "bath", "wax",
      "depilat", "massage oil", "callus"],                                            "Body Care"),
    (["chair", "bed", "trolley", "furniture", "stool", "unit", "sofa",
      "reception", "salon station", "pedicure station"],                              "Furniture & Equipment"),
    (["lash", "brow", "eyebrow", "eyelash"],                                          "Lash & Brow"),
    (["makeup", "foundation", "lipstick", "mascara", "concealer",
      "blush", "eyeshadow", "perfume", "fragrance"],                                  "Makeup & Beauty"),
    (["towel", "disposable", "single", "glove", "cotton", "steriliz"],               "Disposables & Hygiene"),
]

def normalise_category(name: str, desc: str) -> str:
    text = (name + " " + desc).lower()
    for kws, cat in CATEGORY_MAP:
        if any(k in text for k in kws):
            return cat
    return "Other"

def strip_html(html: str) -> str:
    if not html:
        return ""
    text = re.sub(r'<[^>]+>', ' ', html)
    text = unescape(text)
    return re.sub(r'\s+', ' ', text).strip()

def fetch_product_urls() -> list[str]:
    req = urllib.request.Request(SITEMAP, headers=HEADERS)
    xml = urllib.request.urlopen(req, timeout=15).read().decode()
    urls = re.findall(r'<loc>(https://albaselco\.com/products/[^<]+)</loc>', xml)
    print(f"Sitemap: {len(urls)} product URLs")
    return urls

def scrape_product(url: str) -> dict | None:
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        html = urllib.request.urlopen(req, timeout=15).read().decode()

        # Find Product JSON-LD block
        blocks = re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', html, re.DOTALL)
        product_ld = None
        for b in blocks:
            b_clean = re.sub(r'[\x00-\x1f\x7f]', ' ', b.strip())
            try:
                d = json.loads(b_clean)
                if d.get('@type') == 'Product':
                    product_ld = d
                    break
            except Exception:
                # Manual extraction fallback
                if '"sku"' in b:
                    product_ld = {
                        'name':    (re.search(r'"name"\s*:\s*"([^"]+)"', b) or [None,None])[1],
                        'sku':     (re.search(r'"sku"\s*:\s*"([^"]+)"', b)  or [None,None])[1],
                        'image':   [(re.search(r'"image"\s*:\s*\["([^"]+)"', b) or [None,None])[1]],
                        'description': strip_html((re.search(r'"description"\s*:\s*"([^"]+)"', b) or [None,None])[1] or ''),
                        'offers':  {
                            'price':        (re.search(r'"price"\s*:\s*"?([0-9.]+)"?', b) or [None,None])[1],
                            'priceCurrency': 'AED',
                            'availability': 'InStock',
                        },
                    }
                    break

        if not product_ld:
            return None

        name = product_ld.get('name', '')
        if not name:
            return None

        # Extract brand from HTML (JSON-LD brand is always "Al Basel Cosmetics")
        brand = ""
        # Pattern 1: <label>Vendor</label> <span>BrandName</span> style
        m = re.search(r'(?:Vendor|Brand|Manufacturer)[:\s]*</[^>]+>\s*<[^>]+>([^<]{2,40})</', html, re.I)
        if m:
            brand = m.group(1).strip()
        # Pattern 2: <dt>Brand</dt><dd>BrandName</dd>
        if not brand:
            m = re.search(r'<dt[^>]*>[^<]*(?:vendor|brand)[^<]*</dt>\s*<dd[^>]*>([^<]{2,40})</dd>', html, re.I)
            if m:
                brand = m.group(1).strip()
        # Pattern 3: data-brand attribute
        if not brand:
            m = re.search(r'data-brand="([^"]{2,40})"', html)
            if m:
                brand = m.group(1).strip()
        # Pattern 4: <a> link inside vendor/brand label
        if not brand:
            m = re.search(r'(?:Brand|brand)[:\s]*<[^>]*>\s*<a[^>]*>([^<]{2,40})</a>', html)
            if m:
                brand = m.group(1).strip()
        # Skip generic store name
        if brand.lower() in ("al basel cosmetics", "albasel", "al-basel"):
            brand = ""

        # Skip L'Oréal / Kérastase / Essie
        brand_lower = brand.lower()
        name_lower = name.lower()
        for skip in SKIP_BRANDS:
            if skip in brand_lower or skip in name_lower:
                return None

        # Images
        images_raw = product_ld.get('image', [])
        if isinstance(images_raw, str):
            images_raw = [images_raw]
        images = [i.split('?')[0] for i in images_raw if i]

        # Extra images from HTML uploads
        extra = re.findall(r'https://albaselco\.com/uploads/[^\s"\']+\.(?:jpg|jpeg|png|webp)', html)
        for e in extra:
            e_clean = e.split('?')[0]
            if e_clean not in images:
                images.append(e_clean)

        photo = images[0] if images else None

        # Price
        offers = product_ld.get('offers', {})
        price_raw = offers.get('price') if isinstance(offers, dict) else None
        try:
            price = float(price_raw) if price_raw else None
        except (ValueError, TypeError):
            price = None

        # SKU
        sku = product_ld.get('sku') or ''

        # Description
        desc = strip_html(product_ld.get('description', ''))

        # Category from URL slug + name + desc
        slug = url.split('/products/')[-1]
        category = normalise_category(name + ' ' + slug, desc)

        # Availability
        avail_str = (offers.get('availability', '') if isinstance(offers, dict) else '')
        available = 'OutOfStock' not in avail_str

        slug_id = re.sub(r'[^a-z0-9]+', '-', url.lower()).strip('-')[-200:]

        return {
            'id':          slug_id,
            'name':        name,
            'brand':       brand,
            'sku':         sku,
            'ean':         None,
            'price':       price,
            'currency':    'AED',
            'photo':       photo,
            'images':      images,
            'description': desc,
            'category':    category,
            'tags':        [],
            'available':   available,
            'url':         url,
            'supplier':    'AlBasel',
        }

    except Exception as e:
        print(f"    Error on {url}: {e}")
        return None


def scrape():
    existing: dict[str, dict] = {}
    if OUTPUT.exists():
        try:
            for p in json.loads(OUTPUT.read_text()):
                if p.get('url'):
                    existing[p['url']] = p
            print(f"Loaded {len(existing)} existing products")
        except Exception:
            pass

    all_products: dict[str, dict] = dict(existing)
    urls = fetch_product_urls()

    # Also re-scrape existing products with empty brand so we can patch them
    no_brand_urls = [p['url'] for p in existing.values() if not p.get('brand') and p.get('url')]
    new_urls = [u for u in urls if u not in existing]
    patch_urls = [u for u in no_brand_urls if u in existing]
    print(f"New to scrape: {len(new_urls)}, brand-patch needed: {len(patch_urls)}")
    to_scrape = new_urls + patch_urls

    saved = skipped = 0
    for i, url in enumerate(to_scrape):
        prod = scrape_product(url)
        if prod:
            # If patching an existing entry, only update brand (keep other fields)
            if url in existing and url not in [u for u in urls if u not in existing]:
                if prod.get('brand'):
                    existing[url]['brand'] = prod['brand']
                    all_products[url] = existing[url]
            else:
                all_products[url] = prod
            saved += 1
        else:
            skipped += 1

        if (i + 1) % 20 == 0:
            OUTPUT.write_text(json.dumps(list(all_products.values()), indent=2, ensure_ascii=False))
            print(f"  [{i+1}/{len(to_scrape)}] saved/patched: {saved}, skipped/error: {skipped}")
        else:
            label = prod['name'] if prod else 'skip'
            print(f"  [{i+1}/{len(to_scrape)}] {label[:60]}", end='\r')

        time.sleep(0.3)

    OUTPUT.write_text(json.dumps(list(all_products.values()), indent=2, ensure_ascii=False))
    result = list(all_products.values())
    print(f"\n✓ Saved {len(result)} products to {OUTPUT}")
    print(f"  Skipped (L'Oréal/Kérastase/Essie or error): {skipped}")

    cats: dict[str, int] = {}
    brands: dict[str, int] = {}
    no_brand = 0
    for p in result:
        cats[p.get('category') or 'Other'] = cats.get(p.get('category') or 'Other', 0) + 1
        b = p.get('brand') or ''
        brands[b or '?'] = brands.get(b or '?', 0) + 1
        if not b:
            no_brand += 1

    print(f"\nBy category:")
    for c, n in sorted(cats.items(), key=lambda x: -x[1]):
        print(f"  {c:40s} {n:4d}")
    print(f"\nTop brands (no_brand={no_brand}):")
    for b, n in sorted(brands.items(), key=lambda x: -x[1])[:20]:
        print(f"  {b:40s} {n:4d}")


if __name__ == '__main__':
    scrape()
