# B2B Beauty Portal — Scrapers

Weekly re-scrape instructions for all suppliers. Output JSONs go to `public/` in the Next.js app.

---

## Quick Reference

| Scraper | Supplier | Method | Resume-safe | Time |
|---|---|---|---|---|
| `homepage_images_scraper.py` | **All suppliers** — homepage background images | Mixed (Shopify API + HTML + Playwright) | ✅ | ~5 min |
| `awarid_scraper.py` | Awarid | Shopify JSON API | ✅ | ~2 min |
| `albasel_scraper.py` | Al Basel Cosmetics | Sitemap + page JSON-LD | ✅ | ~12 min |
| `milia_scraper.py` | Milia Cosmetics | Shopify JSON API | ✅ | ~30 sec |
| `nawajm_scraper.py` | Nawajm Cosmetics | Shopify JSON API | ✅ | ~1 min |
| `nazih_full_scraper.py` | Nazih Group | Playwright + stealth | ✅ | ~30 min |
| `wella_scraper.py` | Wella Professionals | Playwright + stealth | ✅ | ~20 min |
| `loreal_scraper.py` | L'Oréal Partner Shop | Playwright + stealth | ✅ | ~45 min |
| `victoriavynn_scraper.py` | Victoria Vynn | Playwright + stealth | ✅ | ~20 min |
| `skeyndor_scraper.py` | Skeyndor | Playwright + stealth | ✅ | ~10 min |
| `madi_scraper.py` | Madi International | Playwright + stealth (Salesforce) | ✅ | ~60 min |

---

## Server Requirements

```bash
pip install playwright playwright-stealth
playwright install chromium
```

Python 3.10+ required. No other dependencies for the pure-urllib scrapers.

---

## Group 1 — Simple (no browser needed)

These use pure Python `urllib` — fast, no Playwright, run anywhere.

---

### `awarid_scraper.py` — Awarid (ae.awarid.com)

```bash
python3 awarid_scraper.py
cp awarid_products.json /var/www/portal/public/
```

**How it works:** Calls Shopify `/collections/all/products.json?limit=250&page=N` — paginated until empty page. One JSON entry per variant.

**Output:** `awarid_products.json` (~2,568 products)

**Fields:** id, name, brand (vendor), sku, price (AED), photo, images, category, available, url

**Hurdles faced:**
- `/products.json` only returned 10 items — switched to `/collections/all/products.json` which returned the full catalogue.
- Some products have many variants (shades) — each variant gets its own entry so staff can order by exact variant.

**Notes:** No auth needed. Category is normalised from `product_type` field via keyword mapping. Safe to run weekly.

---

### `albasel_scraper.py` — Al Basel Cosmetics (albaselco.com)

```bash
python3 albasel_scraper.py
cp albasel_products.json /var/www/portal/public/
```

**How it works:**
1. Fetches all product URLs from `https://albaselco.com/sitemap_products_1.xml`
2. For each URL, fetches the HTML page and extracts the Product JSON-LD block (`<script type="application/ld+json">`)
3. Brand extracted via HTML regex — JSON-LD brand is always "Al Basel Cosmetics" (useless), real brand is in a vendor label in the page HTML

**Output:** `albasel_products.json` (~1,624–2,017 products depending on stock)

**Fields:** id, name, brand, sku, price (AED), photo, images, description, category, available, url

**Hurdles faced:**
- NOT standard Shopify — `/products.json`, `/collections.json`, `/collections/all/products.json` all return 404. Required sitemap-based URL discovery.
- The JSON-LD `brand` field always says "Al Basel Cosmetics" regardless of actual brand — had to regex the raw HTML for the vendor label instead.
- DNS on albaselco.com is flaky — the server goes unreachable mid-run. Scraper is resume-safe (keyed by URL) so just re-run and it picks up where it left off.
- First full run had ~300 products missing due to DNS dropout. Second run patched all brands and recovered missed products.
- Brand regex that works: `r'(?:Vendor|Brand|Manufacturer)[:\s]*</[^>]+>\s*<[^>]+>([^<]{2,40})</'`

**SKIP rule:** L'Oréal, Kérastase, and Essie products are filtered out — we have these direct from the L'Oréal supplier. Filter checks both the brand field and the product name.

**Notes:** 0.3s delay between requests to avoid rate limiting. ~2,017 URLs total, takes ~12 min on a good connection.

---

### `milia_scraper.py` — Milia Cosmetics (miliacosmetics.com)

```bash
python3 milia_scraper.py
cp milia_products.json /var/www/portal/public/
```

**How it works:** Standard Shopify `/products.json?limit=250&page=N` API. One entry per variant.

**Output:** `milia_products.json` (~5,261 products)

**Fields:** id, name, brand, sku, price (AED), photo, images, description, category, tags

**Hurdles faced:**
- None significant. Shopify API worked cleanly.
- Large variant counts on some products (nail colours) inflate the product count considerably.

**Notes:** Fastest scraper — finishes in ~30 seconds. Safe to run weekly.

---

### `nawajm_scraper.py` — Nawajm Cosmetics (nawaimcosmetics.ae)

```bash
python3 nawajm_scraper.py
cp nawajm_products.json /var/www/portal/public/
```

**How it works:** Standard Shopify `/products.json?limit=250&page=N` API.

**Output:** `nawajm_products.json`

**Fields:** id, name, brand, sku, price (AED), photo, images, description, category

**Hurdles faced:**
- Catalog page not yet built in the portal — scraper is ready but the frontend page still needs to be created.

**Notes:** No auth needed. Fast (~1 min).

---

## Group 2 — Playwright (browser automation needed)

These sites have Cloudflare or login walls. Requires `playwright` + `playwright-stealth`.

---

### `nazih_full_scraper.py` — Nazih Group (nazih.ae)

```bash
python3 nazih_full_scraper.py
cp nazih_all_products.json /var/www/portal/public/
```

**How it works:**
1. Iterates through 56 pre-mapped sub-category URLs under `nazih.ae/hair/`
2. Phase 1: scrapes listing pages for name, brand, price, photo, url, category, sub_category
3. Phase 2: visits each product page for EAN barcode + SKU

**Output:** `nazih_all_products.json` (~2,508 products)

**Fields:** id, name, brand, sku, ean, price (AED), photo, category, sub_category, url

**Hurdles faced:**
- Cloudflare protection — required `playwright-stealth` to bypass bot detection.
- Two-phase scraping needed: listing pages don't have EAN/SKU, only product pages do.
- Sub-categories must be manually mapped — no sitemap or API available.
- Pagination varies per category — had to detect end-of-results rather than use a fixed page count.

**Notes:** Stealth mode is required or you get blocked immediately. Takes ~30 min for full run.

---

### `wella_scraper.py` — Wella Professionals (wella.com)

```bash
python3 wella_scraper.py
cp wella_products.json /var/www/portal/public/
```

**How it works:** Fetches product URLs from multiple locale sitemaps (en-GB, en-US, de-DE, fr-FR, en-AU, it-IT, es-ES), deduplicates by product slug, then visits each product page to extract JSON-LD structured data.

**Output:** `wella_products.json` (~226 products)

**Fields:** name, sku, photo, description, category, url

**Hurdles faced:**
- Cloudflare protection — requires Playwright stealth.
- Multiple locale sitemaps have overlapping products — needed deduplication by URL slug to avoid duplicates.
- No price on the product pages (trade pricing, login required).

**Notes:** Uses en-GB locale for canonical scraping. Safe to run weekly.

---

### `loreal_scraper.py` — L'Oréal Partner Shop (uk.lorealpartnershop.com)

```bash
python3 loreal_scraper.py
cp loreal_products.json /var/www/portal/public/
```

**How it works:** Navigates the shop-by-category pages, collects product URLs (identified by GB code pattern `GB\d{10+}.html`), then visits each product page to extract name, photo, EAN, brand, price.

**Output:** `loreal_products.json` (~832 products)

**Fields:** id, name, brand, sku (GB code), ean, price (GBP), photo, url

**Hurdles faced:**
- Requires a valid L'Oréal Partner Shop account — the site is login-gated. Must be logged in via Playwright session before scraping.
- Cloudflare and bot protection — stealth mode required.
- EAN extracted via regex from product page text (not structured data).
- Prices are in GBP (not AED) — conversion needed separately if price display is required.

**Notes:** This is the most sensitive scraper — if the account session expires, it will fail silently. Check logged-in state before running. ~832 products across Kérastase, L'Oréal Professionnel, Redken, Essie.

---

### `victoriavynn_scraper.py` — Victoria Vynn (victoriavynn.com)

```bash
python3 victoriavynn_scraper.py
cp victoriavynn_products.json /var/www/portal/public/
```

**How it works:** Iterates pre-mapped category pages on the Magento-based site, paginates with `?p=N`, and extracts JSON-LD from each product page.

**Output:** `victoriavynn_products.json`

**Fields:** name, sku, price, photo, images (gallery), description, color, category, url

**Hurdles faced:**
- Magento pagination — uses `?p=N` not standard `?page=N`.
- Gallery images are not in JSON-LD, had to extract from page HTML separately.
- Some colour variant products needed deduplication by SKU.

**Notes:** Resume-safe by URL. Takes ~20 min.

---

### `skeyndor_scraper.py` — Skeyndor (skeyndor.com)

```bash
python3 skeyndor_scraper.py
cp skeyndor_products.json /var/www/portal/public/
```

**How it works:** Iterates pre-mapped product line URLs under `skeyndor.com/en/line/{slug}/`, collects product URLs, then extracts JSON-LD from each product page. SKU field is the EAN barcode (13-digit GS1).

**Output:** `skeyndor_products.json`

**Fields:** name, sku (EAN), photo, description, category (product line), url

**Hurdles faced:**
- Cloudflare protection — stealth mode required.
- Product lines must be manually mapped — no sitemap API.
- No price on product pages (professional pricing only via distributors).

**Notes:** Resume-safe by URL. Takes ~10 min.

---

### `madi_scraper.py` — Madi International (madi.com — Salesforce B2B)

```bash
python3 madi_scraper.py
cp madi_products.json /var/www/portal/public/
# Images (run separately after scraper):
python3 madi_download_images.py
```

**How it works:**
1. Paginates through all products via the Salesforce B2B Commerce Cloud search API (20/page)
2. Batch-fetches full product details from the products?ids= endpoint
3. Uses webstore ID: `0ZEJ70000004EhsOAE`

**Output:** `madi_products.json` (~6,656 products) + `public/product-images/madi/{sku}.jpg`

**Fields:** id, name, brand, sku, ean, photo (local path), images, category, sub_category, sub_family, color_code, color_name

**Hurdles faced:**
- Salesforce B2B Commerce Cloud — completely non-standard API, no public documentation.
- Requires an active authenticated browser session — must be logged in to madi.com in Playwright before the API accepts requests.
- Product images are served from Salesforce CMS and are gated behind the same session — cannot be hotlinked. All images must be downloaded locally via `madi_download_images.py`.
- The webstore ID is embedded in API URLs — if Madi migrates their Salesforce instance this will change.
- No price returned by API for non-logged-in sessions — price field is null for all products.

**Notes:** Most complex scraper. Images (~6,656 files) must be downloaded separately and stored in `public/product-images/madi/`. Takes ~60 min for full run + image download. If session expires mid-run, restart Playwright with a fresh login.

---

## Not Yet Active

| Script | Status |
|---|---|
| `essie_scraper.py` | One-off — Essie is included in the L'Oréal supplier data |
| `schwarzkopf_scraper.py` | Never integrated into portal — scraper exists but no catalog page |
| `nazih_scraper.py` | Old version replaced by `nazih_full_scraper.py` |

---

## Homepage Background Image Scraper

**`homepage_images_scraper.py`** — fetches editorial/hero images from every active
supplier website and saves them for use as rotating full-page backgrounds on
`/suppliers`.

```bash
pip install playwright playwright-stealth requests Pillow
playwright install chromium

python3 homepage_images_scraper.py
```

**Output:**
- `public/images/supplier-bg/{supplier}_{n}.jpg` — up to 6 images per supplier
- `public/supplier-backgrounds.json` — manifest read by the `/suppliers` page

**How it works per supplier type:**

| Type | Suppliers | Method |
|---|---|---|
| Shopify API | awarid, milia, nawajm, albasel | `/collections.json` featured images + homepage srcset |
| Plain HTML | — | HTTP fetch → og:image + large srcset |
| Playwright | loreal, nazih, victoriavynn, madi, essie | Headless Chromium, grabs rendered `<img>` + CSS backgrounds |

**Cron (weekly, Monday 03:00):**
```
0 3 * * 1  cd /path/to/repo && python3 upload_scrapper_contabo/homepage_images_scraper.py
```

After running, commit the updated images and manifest:
```bash
git add public/images/supplier-bg/ public/supplier-backgrounds.json
git commit -m "chore: refresh supplier background images"
git push
```

---

## After Every Re-scrape

1. Copy output JSON to the Next.js `public/` folder
2. Restart or redeploy the Next.js app if running in production
3. No database update needed — app reads JSON directly from `public/`

```bash
# Example — copy all at once
cp awarid_products.json milia_products.json nazih_all_products.json albasel_products.json /var/www/portal/public/
```

---

## Category Normalisation

All scrapers map raw product types into the same 15 clean categories used across the portal:

```
Hair Care · Hair Colouring · Hair Styling · Hair Treatment
Nail Care · Skin Care · Body Care · Shaving & Grooming
Tools & Accessories · Electrical Tools · Furniture & Equipment
Lash & Brow · Makeup & Beauty · Disposables & Hygiene · Other
```

Mapping is done via a `CATEGORY_MAP` list of `(keywords, category)` pairs checked against the product name, type, and description.
