"use client";

import { useState, useEffect, useCallback, Suspense, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { useSearchParams, useRouter } from "next/navigation";
import { saveSharedCart, type SharedCartItem } from "@/lib/sharedCart";
import {
  Search, ArrowLeft, ShoppingCart, Plus, Check, Minus, Trash2,
  ArrowRight, X, Loader2, ChevronDown, ChevronUp,
  Filter, ArrowUpDown, LayoutGrid, List, Sparkles, Tag, Heart,
  History, Copy, Send, FileText, FileSpreadsheet,
} from "lucide-react";
import ImageZoom from "@/components/ui/ImageZoom";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Supplier config ───────────────────────────────────────────────────────────
const SUPPLIERS: Record<string, {
  label: string; accent: string; href: string; logo: string; initials: string;
  jsonFile: string; normalizeId: (p: any, i: number) => string;
}> = {
  loreal:       { label: "L'Oréal Professionnel", accent: "#2563eb", href: "/catalog/loreal",       logo: "/logos/loreal.svg",                                                                                                                                                                            initials: "LP", jsonFile: "/loreal_products.json",      normalizeId: (p, i) => p.id || `lor-${i}` },
  nazih:        { label: "Nazih Group",            accent: "#0ea5e9", href: "/catalog/nazih",        logo: "https://nazih.ae/media/logo/stores/1/Nazih-Group-Logo.png",                                                                                                                                         initials: "NZ", jsonFile: "/nazih_all_products.json",    normalizeId: (p, i) => p.id || p.url || `naz-${i}` },
  madi:         { label: "Madi International",     accent: "#1a1a1a", href: "/catalog/madi",         logo: "/logos/madi.svg",                                                                                                                                                                                   initials: "MI", jsonFile: "/madi_products.json",         normalizeId: (p, i) => p.id || p.sku || `mdi-${i}` },
  victoriavynn: { label: "Victoria Vynn",          accent: "#be185d", href: "/catalog/victoriavynn", logo: "/logos/victoriavynn.webp",                                                                                                                                                                           initials: "VV", jsonFile: "/victoriavynn_products.json", normalizeId: (p, i) => p.id || p.sku || p.url || `vv-${i}` },
  milia:        { label: "Milia Cosmetics",        accent: "#0d9488", href: "/catalog/milia",        logo: "https://miliacosmetics.com/cdn/shop/files/MILLIA-LOGO--no_background_a9192dbb-2e70-46dc-b7bd-83756031e268.png?v=1774424377",                                                                       initials: "ML", jsonFile: "/milia_products.json",        normalizeId: (p, i) => p.sku || p.id || `mil-${i}` },
  awarid:       { label: "Awarid",                 accent: "#b45309", href: "/catalog/awarid",       logo: "https://images.builderservices.io/s/cdn/v1.0/i/m?url=https%3A%2F%2Fstorage.googleapis.com%2Fproduction-ipage-v1-0-8%2F968%2F1750968%2Fbl0k7R84%2F230092d8575940ab9c6eba6d56289de5&methods=resize%2C500%2C5000", initials: "AW", jsonFile: "/awarid_products.json",       normalizeId: (p, i) => p.sku || p.id || `awr-${i}` },
  albasel:      { label: "Al Basel Cosmetics",     accent: "#b8860b", href: "/catalog/albasel",      logo: "/logos/albasel.svg",                                                                                                                                                                                initials: "AB", jsonFile: "/albasel_products.json",      normalizeId: (p, i) => p.id || p.sku || `ab-${i}` },
  nawajm:       { label: "Nawaim Cosmetics",       accent: "#d97706", href: "/catalog/nawajm",       logo: "https://nawaimcosmetics.ae/cdn/shop/files/Logo_Black.png?v=1733657769&width=180",                                                                                                                  initials: "NW", jsonFile: "/nawajm_products.json",       normalizeId: (p, i) => p.id || p.sku || `nwm-${i}` },
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface Product {
  id: string; name: string; brand: string | null; price: number | null;
  photo: string | null; category: string | null; supplier: string; raw: any;
}

interface SessionCartItem {
  id: string; product: Product; quantity: number;
}

type SessionCart = Record<string, SessionCartItem[]>;

function normalize(raw: any, sid: string, i: number): Product {
  return {
    id: SUPPLIERS[sid].normalizeId(raw, i),
    name: raw.name || "",
    brand: raw.brand || null,
    price: typeof raw.price === "number" ? raw.price : null,
    photo: raw.photo || null,
    category: raw.category || raw.sub_category || null,
    supplier: sid,
    raw: { ...raw, id: SUPPLIERS[sid].normalizeId(raw, i) },
  };
}

// ── Persist session cart ──────────────────────────────────────────────────────
function persistCart(supplier: string, items: SessionCartItem[]) {
  const payload = items.map((i) => ({ id: i.id, product: i.product.raw, quantity: i.quantity, foc: 0 }));
  let existing: any[] = [];
  try { existing = JSON.parse(localStorage.getItem(`${supplier}_cart`) || "[]"); } catch {}
  const merged = [...existing];
  for (const item of payload) {
    const idx = merged.findIndex((c) => c.product?.id === item.product?.id);
    if (idx >= 0) merged[idx] = { ...merged[idx], quantity: item.quantity };
    else merged.push(item);
  }
  try { localStorage.setItem(`${supplier}_cart`, JSON.stringify(merged)); } catch {}
  try {
    const loc = localStorage.getItem("salon_location");
    if (loc) {
      supabase.from("loreal_saved_carts").upsert(
        { location: `${loc}::${supplier}`, cart_data: merged, updated_at: new Date().toISOString() },
        { onConflict: "location" }
      ).then(() => {});
    }
  } catch {}
}

// ── Product card ──────────────────────────────────────────────────────────────
function ProductCard({
  p, cfg, added, cartItem, onAdd, onQty,
}: {
  p: Product;
  cfg: typeof SUPPLIERS[string];
  added: boolean;
  cartItem: SessionCartItem | undefined;
  onAdd: () => void;
  onQty: (qty: number) => void;
}) {
  const [hearted, setHearted] = useState(false);

  return (
    <div className={`group relative rounded-xl border bg-surface hover:border-ink-300 hover:shadow-md hover:-translate-y-px transition-all duration-200 flex flex-col overflow-hidden ${added ? "border-brand/40 ring-1 ring-brand/10" : "border-line"}`}>

      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-ink-50">
        {(p.raw.photo_sm || p.photo) ? (
          <ImageZoom src={p.raw.photo_sm ?? p.photo ?? undefined} zoomSrc={p.raw.photo_sm ? (p.photo ?? undefined) : undefined} alt={p.name} imgClassName="w-full h-full object-cover" zoomSize={260} zoomScale={2.5} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ink-300 text-2xl select-none">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" width="36" height="36" opacity={0.25}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          </div>
        )}

        {/* Brand tag */}
        {p.brand && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-surface/90 backdrop-blur border border-line rounded px-1.5 py-0.5">
            <Tag className="w-2.5 h-2.5 text-ink-400" />
            <span className="font-mono text-[9px] uppercase tracking-wider text-ink-600 leading-none truncate max-w-[64px]">
              {p.brand}
            </span>
          </div>
        )}

        {/* Heart */}
        <button
          onClick={(e) => { e.stopPropagation(); setHearted((v) => !v); }}
          className={`absolute top-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center bg-surface/90 backdrop-blur border border-line transition-all duration-150 opacity-0 group-hover:opacity-100 hover:border-rose-200 ${hearted ? "!opacity-100" : ""}`}
        >
          <Heart className={`w-3.5 h-3.5 transition-colors ${hearted ? "fill-rose-500 text-rose-500" : "text-ink-400"}`} />
        </button>
      </div>

      {/* Body */}
      <div className="p-2.5 flex flex-col gap-2 flex-1">
        <p className="text-[12px] font-medium text-ink-700 line-clamp-2 leading-snug flex-1 min-h-[32px]">
          {p.name}
        </p>

        <div className="flex items-center justify-between pt-1.5 border-t border-line">
          {p.price !== null ? (
            <div className="flex items-baseline gap-1">
              <span className="text-[15px] font-bold tracking-tight text-ink-900">{p.price}</span>
              <span className="font-mono text-[10px] text-ink-500">AED</span>
            </div>
          ) : (
            <span className="text-xs text-ink-300">—</span>
          )}

          {added && cartItem ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onQty(cartItem.quantity - 1)}
                className="w-6 h-6 rounded border border-line flex items-center justify-center hover:bg-ink-50"
              >
                <Minus className="w-2.5 h-2.5 text-ink-500" />
              </button>
              <span className="text-xs font-bold w-4 text-center text-ink-900">{cartItem.quantity}</span>
              <button
                onClick={onAdd}
                className="w-6 h-6 rounded flex items-center justify-center bg-brand text-white hover:bg-brand-600"
              >
                <Plus className="w-2.5 h-2.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onAdd}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 ${added ? "bg-green-600 text-white" : "bg-ink-900 text-white hover:bg-brand"}`}
            >
              {added ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Cart panel ────────────────────────────────────────────────────────────────
function CartPanel({
  open, onClose, sessionCart, onQty, onRemove,
}: {
  open: boolean; onClose: () => void; sessionCart: SessionCart;
  onQty: (sid: string, productId: string, qty: number) => void;
  onRemove: (sid: string, productId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const router = useRouter();
  const supplierEntries = Object.entries(sessionCart).filter(([, items]) => items.length > 0);
  const totalQty  = supplierEntries.reduce((n, [, items]) => n + items.reduce((s, i) => s + i.quantity, 0), 0);
  const subtotal  = supplierEntries.reduce((n, [, items]) => n + items.reduce((s, i) => s + (i.product.price || 0) * i.quantity, 0), 0);
  const vat       = subtotal * 0.05;
  const total     = subtotal + vat;
  const location  = typeof window !== "undefined" ? (localStorage.getItem("salon_location") || "salon") : "salon";

  const handleShare = async () => {
    if (sharing || !supplierEntries.length) return;
    setSharing(true);
    try {
      const items: SharedCartItem[] = supplierEntries.flatMap(([sid, cartItems]) =>
        cartItems.map((i) => ({
          uid: i.product.raw?.ean || i.product.raw?.sku || i.product.raw?.id || i.id,
          qty: i.quantity,
          supplier: sid,
          supplierLabel: SUPPLIERS[sid]?.label || sid,
          product: {
            name: i.product.name, brand: i.product.raw?.brand, price: i.product.price,
            photo: i.product.photo, photo_sm: i.product.raw?.photo_sm, ean: i.product.raw?.ean, sku: i.product.raw?.sku,
            aki_code: i.product.raw?.aki_code, sub_category: i.product.raw?.sub_category,
            uom: i.product.raw?.uom,
          },
        }))
      );
      const id = await saveSharedCart(items, location);
      const url = `${window.location.origin}/cart/${id}`;
      await navigator.clipboard.writeText(url);
      onClose();
      router.push(`/cart/${id}`);
    } catch (e) {
      console.error(e);
    } finally {
      setSharing(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />

      <aside
        aria-label="Cart"
        className="relative grid h-screen max-h-screen w-full max-w-[440px] grid-rows-[auto_1fr_auto] border-l border-slate-200 bg-white shadow-2xl"
      >
        {/* ── Header ── */}
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2.5 overflow-hidden border-b border-slate-200 bg-gradient-to-b from-slate-50/60 to-white px-5 py-4">
          <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-sky-50 text-sky-500">
            <ShoppingCart size={18} />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <h2 className="text-[16px] font-semibold tracking-tight text-slate-900">Cart</h2>
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-sky-500 px-1.5 text-[11.5px] font-semibold tabular-nums text-white">
                {totalQty}
              </span>
            </div>
            <div className="truncate text-[13px] text-slate-500">
              {supplierEntries.length > 0
                ? <><b className="font-semibold text-slate-900">{supplierEntries.length}</b> supplier{supplierEntries.length !== 1 ? "s" : ""} · Salon B2B</>
                : "Salon B2B"}
            </div>
          </div>
          <button
            type="button"
            className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-[13px] font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <History size={14} />
            History
          </button>
          <button
            type="button"
            onClick={onClose}
            className="grid h-[34px] w-[34px] place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <X size={18} />
          </button>
        </header>

        {/* ── Items ── */}
        <div className="flex flex-col gap-2.5 overflow-y-auto p-4" style={{ scrollbarWidth: "thin" }}>
          {supplierEntries.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center gap-3.5 px-6 py-12 text-center text-slate-500">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-sky-50 text-sky-500">
                <ShoppingCart size={28} />
              </div>
              <h3 className="text-[16px] font-semibold text-slate-900">Your cart is empty</h3>
              <p className="max-w-[280px] text-[13.5px]">Add products from the search results and they'll show up here.</p>
              <button type="button" onClick={onClose}
                className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-[13px] font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50">
                Browse results
                <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            supplierEntries.map(([sid, items]) => {
              const cfg = SUPPLIERS[sid];
              const isOpen = !collapsed[sid];
              const groupSubtotal = items.reduce((s, i) => s + (i.product.price || 0) * i.quantity, 0);

              return (
                <div key={sid}>
                  {/* Supplier divider */}
                  <button
                    onClick={() => setCollapsed((p) => ({ ...p, [sid]: !p[sid] }))}
                    className="w-full flex items-center justify-between mb-2 group"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center p-0.5 shrink-0">
                        <img src={cfg.logo} alt="" className="max-w-full max-h-full object-contain"
                          onError={(e) => { const el = e.target as HTMLImageElement; el.style.display = "none"; el.parentElement!.innerHTML = `<span style="font-size:8px;font-weight:700;color:${cfg.accent}">${cfg.initials}</span>`; }} />
                      </div>
                      <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-sky-700">{cfg.label}</span>
                      <span className="text-[10px] font-semibold text-slate-400 tabular-nums">
                        {groupSubtotal > 0 ? `${groupSubtotal.toFixed(2)} AED` : ""}
                      </span>
                    </div>
                    <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                  </button>

                  {isOpen && (
                    <div className="flex flex-col gap-2 mb-3">
                      {items.map((item) => (
                        <div key={item.id}
                          className="grid min-w-0 grid-cols-[56px_minmax(0,1fr)_auto] gap-3.5 rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-slate-300">

                          {/* Thumb */}
                          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-slate-200 bg-gradient-to-br from-white to-slate-100">
                            {(item.product.raw?.photo_sm || item.product.photo) ? (
                              <img src={item.product.raw?.photo_sm ?? item.product.photo ?? undefined} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" width="24" height="24" opacity={0.25}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex min-w-0 flex-col gap-1.5">
                            {item.product.brand && (
                              <div className="font-mono text-[10.5px] font-medium uppercase tracking-wider text-sky-700">
                                {item.product.brand}
                              </div>
                            )}
                            <div className="line-clamp-2 text-[13.5px] font-medium leading-snug text-slate-900">
                              {item.product.name}
                            </div>
                            {/* Qty stepper */}
                            <div className="mt-1 flex items-center">
                              <div role="group" aria-label="Quantity"
                                className="inline-flex h-[30px] items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                                <button type="button" aria-label="Decrease"
                                  disabled={item.quantity <= 1}
                                  onClick={() => onQty(sid, item.product.id, item.quantity - 1)}
                                  className="grid h-[26px] w-[26px] place-items-center rounded-md text-slate-600 transition-colors hover:bg-white hover:text-slate-900 hover:shadow-sm disabled:cursor-not-allowed disabled:text-slate-300">
                                  <Minus size={14} />
                                </button>
                                <span className="min-w-[28px] text-center text-[13px] font-semibold tabular-nums text-slate-900">
                                  {item.quantity}
                                </span>
                                <button type="button" aria-label="Increase"
                                  onClick={() => onQty(sid, item.product.id, item.quantity + 1)}
                                  className="grid h-[26px] w-[26px] place-items-center rounded-md text-slate-600 transition-colors hover:bg-white hover:text-slate-900 hover:shadow-sm">
                                  <Plus size={14} />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Price + remove */}
                          <div className="flex flex-col items-end justify-between gap-2">
                            <button type="button" aria-label="Remove"
                              onClick={() => onRemove(sid, item.product.id)}
                              className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600">
                              <Trash2 size={15} />
                            </button>
                            {item.product.price !== null && (
                              <span className="inline-flex items-baseline gap-1">
                                <span className="text-[15px] font-bold tabular-nums tracking-tight text-slate-900">
                                  {(item.product.price * item.quantity).toFixed(2)}
                                </span>
                                <span className="font-mono text-[10.5px] font-medium text-slate-500">AED</span>
                              </span>
                            )}
                          </div>
                        </div>
                      ))}

                      {/* Go to supplier */}
                      <a href={cfg.href} onClick={onClose}
                        className="inline-flex h-[34px] items-center justify-between w-full px-3 rounded-lg border border-slate-200 text-[13px] font-medium transition-colors hover:border-slate-300 hover:bg-slate-50 text-slate-700">
                        Open {cfg.label} catalogue
                        <ArrowRight size={14} />
                      </a>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ── Footer ── */}
        {supplierEntries.length > 0 && (
          <footer className="flex min-w-0 flex-col gap-3 overflow-hidden border-t border-slate-200 bg-white px-4 py-4">
            {/* Totals */}
            <dl className="grid gap-1.5 text-[13px] text-slate-500">
              <div className="flex items-center justify-between">
                <dt>Subtotal · {totalQty} item{totalQty !== 1 ? "s" : ""}</dt>
                <dd className="font-semibold tabular-nums text-slate-900">{subtotal.toFixed(2)} AED</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt>VAT (5%)</dt>
                <dd className="font-semibold tabular-nums text-slate-900">{vat.toFixed(2)} AED</dd>
              </div>
              <div className="mt-1 flex items-baseline justify-between border-t border-dashed border-slate-200 pt-2.5">
                <dt className="text-[14px] font-semibold text-slate-900">Total</dt>
                <dd className="text-[22px] font-bold tracking-tight tabular-nums text-slate-900">
                  {total.toFixed(2)}
                  <span className="ml-1 font-mono text-[11px] font-medium text-slate-500">AED</span>
                </dd>
              </div>
            </dl>

            {/* Primary CTA */}
            <button type="button" onClick={handleShare} disabled={sharing}
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-sky-500 text-[15px] font-semibold text-white shadow-[0_1px_0_rgba(0,107,194,0.5),0_4px_12px_-2px_rgba(0,145,255,0.35)] transition-colors hover:bg-sky-600 active:translate-y-px disabled:opacity-70 disabled:cursor-wait">
              {sharing ? <Loader2 size={18} className="animate-spin" /> : <ShoppingCart size={18} />}
              {sharing ? "Creating link…" : "Share with my team"}
              {!sharing && <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />}
            </button>

            {/* Share URL row */}
            <p className="text-[11px] text-slate-400 text-center">
              Creates a shareable link · anyone with it can view &amp; edit
            </p>

            {/* Secondary actions */}
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { icon: <FileText size={14} />, label: "PDF" },
                { icon: <FileSpreadsheet size={14} />, label: "Excel" },
                { icon: <Trash2 size={14} />, label: "Clear", danger: true,
                  onClick: () => { if (confirm("Clear all items?")) { /* parent clears via onRemove */ } } },
              ].map(({ icon, label, danger, onClick }) => (
                <button key={label} type="button" onClick={onClick}
                  className={`inline-flex h-[38px] items-center justify-center gap-1.5 rounded-[9px] border border-slate-200 text-[12.5px] font-medium transition-colors ${danger ? "hover:border-red-200 hover:bg-red-50 hover:text-red-600 text-slate-700 [&_svg]:text-slate-500 [&:hover_svg]:text-red-600" : "hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 text-slate-700 [&_svg]:text-slate-500"}`}>
                  {icon}{label}
                </button>
              ))}
            </div>
          </footer>
        )}
      </aside>
    </div>
  );
}

// ── Supplier group card ───────────────────────────────────────────────────────
const VISIBLE_DEFAULT = 7;

function SupplierGroup({
  sid, products, cfg, sessionCart, onAdd, onQty,
}: {
  sid: string; products: Product[]; cfg: typeof SUPPLIERS[string];
  sessionCart: SessionCart;
  onAdd: (p: Product) => void;
  onQty: (sid: string, productId: string, qty: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const priced = products.filter((p) => p.price !== null);
  const lowestPrice = priced.length > 0 ? Math.min(...priced.map((p) => p.price!)) : null;
  const supplierCartCount = (sessionCart[sid] || []).length;
  const visible = showAll ? products : products.slice(0, VISIBLE_DEFAULT);
  const hasMore = products.length > VISIBLE_DEFAULT;
  const isAdded = (p: Product) => (sessionCart[p.supplier] || []).some((i) => i.product.id === p.id);

  return (
    <div className="rounded-2xl border border-line bg-surface hover:shadow-sm transition-shadow duration-200">

      {/* Group header */}
      <div className="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:p-5 border-b border-line"
        style={{ background: "linear-gradient(to right, #FCFDFE, #ffffff)" }}>

        {/* Logo tile */}
        <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-ink-50 border border-line flex items-center justify-center shrink-0 overflow-hidden p-1">
          <img src={cfg.logo} alt={cfg.label}
            className="max-w-full max-h-full object-contain"
            onError={(e) => {
              const el = e.target as HTMLImageElement;
              el.style.display = "none";
              el.parentElement!.innerHTML = `<span style="font-size:11px;font-weight:700;color:${cfg.accent}">${cfg.initials}</span>`;
            }} />
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-ink-900 truncate">{cfg.label}</span>
            <span className="inline-flex items-center h-[20px] px-1.5 rounded-full bg-brand-50 text-brand-700 text-[11px] font-semibold shrink-0">
              {products.length}
            </span>
            {supplierCartCount > 0 && (
              <span className="inline-flex items-center gap-1 h-[20px] px-2 rounded-full text-[11px] font-semibold text-white shrink-0" style={{ background: cfg.accent }}>
                <ShoppingCart className="w-2.5 h-2.5" />
                {supplierCartCount}
              </span>
            )}
          </div>
          {lowestPrice !== null && (
            <p className="text-xs sm:text-sm text-ink-500 mt-0.5">
              from <span className="font-semibold text-ink-900">{lowestPrice} AED</span>
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <a href={cfg.href}
            className="hidden sm:flex h-[34px] px-3 rounded-lg border border-line bg-surface text-sm font-medium text-brand-700 hover:bg-brand-50 transition-colors items-center gap-1.5">
            Browse full catalogue
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
          <a href={cfg.href}
            className="flex sm:hidden w-8 h-8 rounded-lg border border-line bg-surface items-center justify-center text-brand-700 hover:bg-brand-50 transition-colors">
            <ArrowRight className="w-4 h-4" />
          </a>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="w-8 h-8 sm:w-[34px] sm:h-[34px] rounded-lg border border-line bg-surface flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-ink-50 transition-all"
          >
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`} />
          </button>
        </div>
      </div>

      {/* Product grid */}
      {!collapsed && (
        <div className="p-5">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-2">
            {visible.map((p) => {
              const cartItem = (sessionCart[p.supplier] || []).find((i) => i.product.id === p.id);
              return (
                <ProductCard
                  key={p.id}
                  p={p}
                  cfg={cfg}
                  added={isAdded(p)}
                  cartItem={cartItem}
                  onAdd={() => onAdd(p)}
                  onQty={(qty) => onQty(sid, p.id, qty)}
                />
              );
            })}
          </div>

          {/* Show more strip */}
          {hasMore && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mt-4 w-full flex items-center justify-center gap-2 pt-4 border-t border-dashed border-line text-sm font-medium text-ink-400 hover:text-brand-700 transition-colors"
            >
              {showAll ? (
                <><ChevronUp className="w-4 h-4" />Show less</>
              ) : (
                <>Show all {products.length} products <ChevronDown className="w-4 h-4" /></>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Search results (inner — needs useSearchParams) ────────────────────────────
function SearchResults() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get("q") || "";

  const [inputVal, setInputVal] = useState(query);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Record<string, Product[]>>({});
  const [sessionCart, setSessionCart] = useState<SessionCart>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [sort, setSort] = useState<"cheapest" | "name">("cheapest");
  const [view, setView] = useState<"grid" | "list">("grid");

  const totalCartItems = Object.values(sessionCart).reduce((n, items) => n + items.length, 0);

  // Load + search
  useEffect(() => {
    if (!query.trim()) return;
    setLoading(true);
    const q = query.toLowerCase();
    Promise.all(
      Object.entries(SUPPLIERS).map(async ([sid, cfg]) => {
        try {
          const res = await fetch(cfg.jsonFile);
          const data: any[] = await res.json();
          const supplierMatch = cfg.label.toLowerCase().includes(q) || sid.toLowerCase().includes(q);
          return data
            .map((p, i) => normalize(p, sid, i))
            .filter((p) =>
              supplierMatch ||
              p.name.toLowerCase().includes(q) ||
              (p.brand && p.brand.toLowerCase().includes(q)) ||
              (p.category && p.category.toLowerCase().includes(q))
            );
        } catch { return []; }
      })
    ).then((arrays) => {
      const grouped: Record<string, Product[]> = {};
      arrays.forEach((arr) =>
        arr.forEach((p) => {
          if (!grouped[p.supplier]) grouped[p.supplier] = [];
          grouped[p.supplier].push(p);
        })
      );
      Object.keys(grouped).forEach((sid) => {
        grouped[sid].sort((a, b) => {
          if (a.price === null && b.price === null) return 0;
          if (a.price === null) return 1;
          if (b.price === null) return -1;
          return a.price - b.price;
        });
      });
      setResults(grouped);
      setLoading(false);
    });
  }, [query]);

  const handleAdd = useCallback((p: Product) => {
    setSessionCart((prev) => {
      const supplierItems = prev[p.supplier] || [];
      const existing = supplierItems.find((i) => i.product.id === p.id);
      const updated = existing
        ? supplierItems.map((i) => i.product.id === p.id ? { ...i, quantity: i.quantity + 1 } : i)
        : [...supplierItems, { id: p.id, product: p, quantity: 1 }];
      const next = { ...prev, [p.supplier]: updated };
      persistCart(p.supplier, next[p.supplier]);
      return next;
    });
  }, []);

  const handleQty = useCallback((sid: string, productId: string, qty: number) => {
    if (qty < 1) return;
    setSessionCart((prev) => {
      const updated = (prev[sid] || []).map((i) => i.product.id === productId ? { ...i, quantity: qty } : i);
      const next = { ...prev, [sid]: updated };
      persistCart(sid, next[sid]);
      return next;
    });
  }, []);

  const handleRemove = useCallback((sid: string, productId: string) => {
    setSessionCart((prev) => {
      const updated = (prev[sid] || []).filter((i) => i.product.id !== productId);
      const next = { ...prev, [sid]: updated };
      persistCart(sid, next[sid]);
      return next;
    });
  }, []);

  const supplierEntries = Object.entries(results).sort(([, a], [, b]) => {
    if (sort === "cheapest") {
      const minA = Math.min(...a.filter((p) => p.price !== null).map((p) => p.price!));
      const minB = Math.min(...b.filter((p) => p.price !== null).map((p) => p.price!));
      return (isFinite(minA) ? minA : Infinity) - (isFinite(minB) ? minB : Infinity);
    }
    return SUPPLIERS[a[0]?.supplier]?.label.localeCompare(SUPPLIERS[b[0]?.supplier]?.label) || 0;
  });
  const totalResults = supplierEntries.reduce((n, [, arr]) => n + arr.length, 0);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = inputVal.trim();
    if (q) router.push(`/suppliers/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="min-h-screen bg-bg">

      {/* ── Sticky top bar ── */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-line">
        {/* Desktop row */}
        <div className="hidden sm:grid max-w-7xl mx-auto px-8 py-3.5 gap-4 items-center"
          style={{ gridTemplateColumns: "auto 1fr auto" }}>

          {/* Left — breadcrumb */}
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => router.push("/suppliers")}
              className="flex items-center gap-1.5 text-ink-500 hover:text-ink-900 transition-colors font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Suppliers
            </button>
            <span className="text-ink-300">/</span>
            <span className="font-semibold text-ink-900 truncate max-w-[200px]">"{query}"</span>
          </div>

          {/* Center — search */}
          <div className="flex justify-center">
            <form onSubmit={handleSearch} className="relative w-full max-w-3xl">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
              <input
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="Search products across all suppliers…"
                className="w-full h-[42px] pl-10 pr-16 rounded-[10px] border border-line bg-surface text-sm text-ink-900 placeholder-ink-400 outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all"
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 h-[22px] px-1.5 flex items-center rounded border border-line bg-ink-50 text-[11px] font-mono text-ink-400 pointer-events-none select-none">
                ⌘K
              </kbd>
            </form>
          </div>

          {/* Right — actions */}
          <div className="flex items-center gap-2">
            <button className="w-10 h-10 rounded-[10px] border border-line bg-surface flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-ink-50 transition-all">
              <Sparkles className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCartOpen(true)}
              className="relative flex items-center gap-2 h-10 px-4 rounded-[10px] bg-brand text-white text-sm font-semibold hover:bg-brand-600 transition-colors"
            >
              <ShoppingCart className="w-4 h-4" />
              Cart
              {totalCartItems > 0 && (
                <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-white/25 text-white text-[11px] font-bold">
                  {totalCartItems}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mobile row */}
        <div className="flex sm:hidden items-center gap-2 px-3 py-2.5">
          <button
            onClick={() => router.push("/suppliers")}
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-ink-500 hover:text-ink-900 hover:bg-ink-50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <form onSubmit={handleSearch} className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
            <input
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="Search all suppliers…"
              className="w-full h-[38px] pl-9 pr-3 rounded-[10px] border border-line bg-surface text-sm text-ink-900 placeholder-ink-400 outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all"
            />
          </form>
          <button
            onClick={() => setCartOpen(true)}
            className="relative shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-brand text-white hover:bg-brand-600 transition-colors"
          >
            <ShoppingCart className="w-4 h-4" />
            {totalCartItems > 0 && (
              <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-white text-brand text-[10px] font-bold">
                {totalCartItems}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ── Results header ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 pt-5 sm:pt-7 pb-5">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
              Results for "{query}"
            </h1>
            {!loading && totalResults > 0 && (
              <p className="text-sm text-ink-500 mt-1">
                <span className="font-semibold text-ink-900">{totalResults}</span> products across{" "}
                <span className="font-semibold text-ink-900">{supplierEntries.length}</span> supplier{supplierEntries.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>

          {/* Chips */}
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 h-[34px] px-3 rounded-lg border border-line bg-surface text-sm font-medium text-ink-700 hover:bg-ink-50 transition-colors">
              <Filter className="w-3.5 h-3.5" />Filter
            </button>
            <button
              onClick={() => setSort(sort === "cheapest" ? "name" : "cheapest")}
              className={`flex items-center gap-1.5 h-[34px] px-3 rounded-lg border text-sm font-medium transition-colors ${sort === "cheapest" ? "bg-brand-50 text-brand-700 border-brand/30" : "bg-surface border-line text-ink-700 hover:bg-ink-50"}`}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />Cheapest first
            </button>
            <div className="w-px h-5 bg-line-strong" />
            <button onClick={() => setView("grid")}
              className={`w-[34px] h-[34px] rounded-lg border flex items-center justify-center transition-colors ${view === "grid" ? "bg-brand-50 text-brand-700 border-brand/30" : "bg-surface border-line text-ink-400 hover:bg-ink-50"}`}>
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button onClick={() => setView("list")}
              className={`w-[34px] h-[34px] rounded-lg border flex items-center justify-center transition-colors ${view === "list" ? "bg-brand-50 text-brand-700 border-brand/30" : "bg-surface border-line text-ink-400 hover:bg-ink-50"}`}>
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 pb-16">
        {loading && (
          <div className="flex items-center justify-center py-24 gap-3 text-brand">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm text-ink-500">Searching across all suppliers…</span>
          </div>
        )}

        {!loading && totalResults === 0 && query && (
          <div className="flex flex-col items-center justify-center py-24 text-ink-400">
            <Search className="w-10 h-10 mb-3 opacity-20" />
            <p className="text-base font-semibold text-ink-700 mb-1">No results for "{query}"</p>
            <p className="text-sm text-ink-500">Try a different keyword — brand name, category, or product name</p>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {supplierEntries.map(([sid, products]) => (
            <SupplierGroup
              key={sid}
              sid={sid}
              products={products}
              cfg={SUPPLIERS[sid]}
              sessionCart={sessionCart}
              onAdd={handleAdd}
              onQty={handleQty}
            />
          ))}
        </div>
      </main>

      <CartPanel
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        sessionCart={sessionCart}
        onQty={handleQty}
        onRemove={handleRemove}
      />
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchResults />
    </Suspense>
  );
}
