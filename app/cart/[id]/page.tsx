"use client";

import { useState, useEffect, useCallback, useRef, use, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Search, Plus, Minus, Trash2, FileText,
  Share2, Copy, Check, X, Clock, Tag, MoreHorizontal,
  Loader2, Send, Sparkles, User,
} from "lucide-react";
import * as XLSX from "xlsx";
import { generatePO } from "@/lib/generatePO";
import {
  loadSharedCart, updateSharedCart,
  type SharedCartItem, type SharedCartRecord,
} from "@/lib/sharedCart";

// ── Supplier JSON sources for search-to-add ───────────────────────────────────
const ALL_SOURCES = [
  { sid: "loreal",       file: "/loreal_products.json",      label: "L'Oréal Professionnel", idFields: ["ean","id","aki_code"] },
  { sid: "nazih",        file: "/nazih_all_products.json",   label: "Nazih Group",            idFields: ["sku","ean"] },
  { sid: "wella",        file: "/wella_products.json",       label: "Wella Professionals",    idFields: ["sku","slug"] },
  { sid: "madi",         file: "/madi_products.json",        label: "Madi International",     idFields: ["sku","ean","id"] },
  { sid: "victoriavynn", file: "/victoriavynn_products.json",label: "Victoria Vynn",          idFields: ["sku"] },
  { sid: "skeyndor",     file: "/skeyndor_products.json",    label: "Skeyndor",               idFields: ["ean","sku"] },
  { sid: "milia",        file: "/milia_products.json",       label: "Milia Cosmetics",        idFields: ["sku"] },
  { sid: "awarid",       file: "/awarid_products.json",      label: "Awarid",                 idFields: ["sku"] },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function Thumb({ photo, photo_sm, size = 44 }: { photo?: string | null; photo_sm?: string | null; size?: number }) {
  const src = photo_sm || photo;
  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.2), overflow: "hidden", border: "1px solid #ECEFF3", flexShrink: 0, background: "radial-gradient(120% 80% at 50% 30%, #fff 0%, #F1F5F9 100%)" }}>
      {src ? (
        <img src={src} alt="" className="w-full h-full object-cover"
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            if (photo && img.src !== photo) { img.src = photo; } else { img.style.display = "none"; }
          }} />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div style={{ width: size * 0.4, height: size * 0.4, opacity: 0.25 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-400 w-full h-full">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

function SaveIndicator({ state, lastSaved }: { state: "idle" | "saving" | "saved"; lastSaved: Date | null }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
        <Loader2 size={10} className="animate-spin" />Saving…
      </span>
    );
  }
  if (state === "saved" || lastSaved) {
    const ts = lastSaved
      ? lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-600 whitespace-nowrap">
        <Check size={10} />
        {`Saved ${ts}`}
      </span>
    );
  }
  return null;
}

// ── PDF generation per supplier ───────────────────────────────────────────────
const PREFIXES: Record<string, string> = {
  loreal: "LOP", nazih: "NZH", wella: "WEL", madi: "MDI",
  victoriavynn: "VVN", skeyndor: "SKY", milia: "MLI", awarid: "AWR",
};

async function generatePDFs(
  items: SharedCartItem[],
  location: string,
  onProgress?: (pct: number) => void,
) {
  const bySupplier = new Map<string, SharedCartItem[]>();
  for (const item of items) {
    if (!bySupplier.has(item.supplier)) bySupplier.set(item.supplier, []);
    bySupplier.get(item.supplier)!.push(item);
  }
  const total = items.length;
  let done = 0;
  for (const [sid, sItems] of bySupplier.entries()) {
    await generatePO({
      cart: sItems.map((i) => ({ quantity: i.qty, foc: 0, product: i.product })),
      supplierName: sItems[0].supplierLabel,
      supplierPrefix: PREFIXES[sid] || sid.toUpperCase().slice(0, 3),
      location,
      onProgress: () => { done++; onProgress?.(Math.round((done / total) * 100)); },
    });
  }
}

function generateExcel(items: SharedCartItem[], location: string, cartId: string) {
  const rows = items.map((i) => ({
    Supplier: i.supplierLabel,
    Brand: i.product.brand || "",
    Product: i.product.name || "",
    "EAN / SKU": i.product.ean || i.product.sku || i.uid,
    Qty: i.qty,
    "Unit Price": i.product.price ?? "",
    Total: i.product.price ? (i.product.price * i.qty).toFixed(2) : "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Order");
  XLSX.writeFile(wb, `cart-${cartId}.xlsx`);
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SharedCartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [record, setRecord] = useState<SharedCartRecord | null>(null);
  const [items, setItems] = useState<SharedCartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dropdownTop, setDropdownTop] = useState(0);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allProductsRef = useRef<any[] | null>(null);

  const updateDropdownPos = useCallback(() => {
    if (searchBoxRef.current) {
      const rect = searchBoxRef.current.getBoundingClientRect();
      setDropdownTop(rect.bottom + 4);
    }
  }, []);

  useEffect(() => {
    if (!searchFocused) return;
    window.addEventListener("scroll", updateDropdownPos, true);
    window.visualViewport?.addEventListener("resize", updateDropdownPos);
    window.visualViewport?.addEventListener("scroll", updateDropdownPos);
    return () => {
      window.removeEventListener("scroll", updateDropdownPos, true);
      window.visualViewport?.removeEventListener("resize", updateDropdownPos);
      window.visualViewport?.removeEventListener("scroll", updateDropdownPos);
    };
  }, [searchFocused, updateDropdownPos]);

  const shareUrl = typeof window !== "undefined"
    ? `https://nxcut.com/cart/${id}`
    : `https://nxcut.com/cart/${id}`;
  const localUrl = typeof window !== "undefined"
    ? window.location.href
    : `/cart/${id}`;

  // ── Load cart from Supabase ─────────────────────────────────────────────────
  useEffect(() => {
    loadSharedCart(id).then(async (rec) => {
      if (!rec) { setNotFound(true); setLoading(false); return; }
      setRecord(rec);

      const rawItems: SharedCartItem[] = rec.items || [];

      // Backfill photo_sm for items that were saved before the field existed
      const needsEnrich = rawItems.some((i) => !i.product.photo_sm);
      if (needsEnrich) {
        const supplierIds = [...new Set(rawItems.filter((i) => !i.product.photo_sm).map((i) => i.supplier))];
        const jsonBySupplier: Record<string, any[]> = {};
        await Promise.all(
          supplierIds.map(async (sid) => {
            const src = ALL_SOURCES.find((s) => s.sid === sid);
            if (!src) return;
            try {
              const res = await fetch(src.file);
              jsonBySupplier[sid] = await res.json();
            } catch {}
          })
        );

        const enriched = rawItems.map((item) => {
          if (item.product.photo_sm) return item;
          const rows = jsonBySupplier[item.supplier];
          if (!rows) return item;
          const src = ALL_SOURCES.find((s) => s.sid === item.supplier);
          const match = rows.find((row) =>
            src?.idFields.some((f) => row[f] && row[f] === (item.product as any)[f])
          );
          if (!match?.photo_sm) return item;
          return { ...item, product: { ...item.product, photo_sm: match.photo_sm } };
        });
        setItems(enriched);
      } else {
        setItems(rawItems);
      }

      setLoading(false);
    });
  }, [id]);

  const triggerSave = useCallback((nextItems: SharedCartItem[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = setTimeout(async () => {
      try {
        await updateSharedCart(id, nextItems);
        setSaveState("saved");
        setLastSaved(new Date());
        saveTimer.current = setTimeout(() => setSaveState("idle"), 1800);
      } catch { setSaveState("idle"); }
    }, 600);
  }, [id]);

  // ── Mutations ───────────────────────────────────────────────────────────────
  const updateQty = useCallback((uid: string, supplier: string, delta: number) => {
    setItems((prev) => {
      const next = prev.map((i) =>
        i.uid === uid && i.supplier === supplier ? { ...i, qty: Math.max(1, i.qty + delta) } : i
      );
      triggerSave(next);
      return next;
    });
  }, [triggerSave]);

  const setQty = useCallback((uid: string, supplier: string, val: number) => {
    setItems((prev) => {
      const next = prev.map((i) =>
        i.uid === uid && i.supplier === supplier ? { ...i, qty: Math.max(1, Math.min(999, val || 1)) } : i
      );
      triggerSave(next);
      return next;
    });
  }, [triggerSave]);

  const removeItem = useCallback((uid: string, supplier: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => !(i.uid === uid && i.supplier === supplier));
      triggerSave(next);
      return next;
    });
  }, [triggerSave]);

  // ── Search to add products ──────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (allProductsRef.current) return allProductsRef.current;
    const all: any[] = [];
    await Promise.all(ALL_SOURCES.map(async ({ sid, file, label, idFields }) => {
      try {
        const data: any[] = await fetch(file).then((r) => r.json());
        data.forEach((p) => {
          const uid = String(p[idFields[0]] || p[idFields[1]] || "");
          if (uid) all.push({ uid, product: p, supplier: sid, supplierLabel: label });
        });
      } catch {}
    }));
    allProductsRef.current = all;
    return all;
  }, []);

  // Pre-warm search index in the background once the cart is loaded
  useEffect(() => { if (!loading) loadAll(); }, [loading, loadAll]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      const all = await loadAll();
      const q = searchQuery.toLowerCase();
      setSearchResults(
        all.filter((p) =>
          (p.product.name || "").toLowerCase().includes(q) ||
          (p.product.brand || "").toLowerCase().includes(q) ||
          String(p.product.ean || "").includes(q) ||
          String(p.product.sku || "").includes(q)
        ).slice(0, 40)
      );
      setSearchLoading(false);
    }, 300);
  }, [searchQuery, loadAll]);

  const addProduct = useCallback((r: any) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.uid === r.uid && i.supplier === r.supplier);
      const next: SharedCartItem[] = existing
        ? prev.map((i) => i.uid === r.uid && i.supplier === r.supplier ? { ...i, qty: i.qty + 1 } : i)
        : [...prev, {
            uid: r.uid, qty: 1, supplier: r.supplier, supplierLabel: r.supplierLabel,
            product: { name: r.product.name, brand: r.product.brand, price: r.product.price,
              photo: r.product.photo, ean: r.product.ean, sku: r.product.sku,
              aki_code: r.product.aki_code, sub_category: r.product.sub_category, uom: r.product.uom },
          }];
      triggerSave(next);
      return next;
    });
    setSearchQuery(""); setSearchFocused(false);
  }, [triggerSave]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const suppliers = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((i) => map.set(i.supplierLabel, (map.get(i.supplierLabel) || 0) + 1));
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [items]);

  const filtered = activeTab === "all" ? items : items.filter((i) => i.supplierLabel === activeTab);
  const subtotal  = items.reduce((s, i) => s + (i.product.price || 0) * i.qty, 0);
  const vat       = subtotal * 0.05;
  const total     = subtotal + vat;
  const totalQty  = items.reduce((s, i) => s + i.qty, 0);

  const copy = async () => {
    await navigator.clipboard.writeText(localUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  // ── States ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#F6F8FB] flex items-center justify-center gap-3">
      <Loader2 className="w-5 h-5 animate-spin text-[#0091FF]" />
      <span className="text-sm text-slate-500">Loading cart…</span>
    </div>
  );

  if (notFound) return (
    <div className="min-h-screen bg-[#F6F8FB] flex flex-col items-center justify-center gap-4 text-slate-500 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
        <X size={28} className="text-slate-400" />
      </div>
      <p className="text-[15px] font-semibold text-slate-700">Cart not found</p>
      <p className="text-[13px]">This link may have expired or been deleted.</p>
      <button onClick={() => router.push("/suppliers")}
        className="mt-2 h-9 px-4 rounded-xl bg-[#0091FF] text-white text-sm font-semibold hover:bg-[#0080E5] transition-colors">
        Go to Suppliers
      </button>
    </div>
  );

  const createdAt = record ? new Date(record.created_at).toLocaleString() : "";

  return (
    <div className="min-h-screen bg-[#F6F8FB] flex flex-col lg:flex-row lg:items-start lg:justify-center lg:gap-6 lg:p-8 lg:pt-10">

      {/* ═══ MAIN PANEL ═══ */}
      <div className="w-full lg:max-w-[520px] bg-white lg:rounded-2xl lg:shadow-sm lg:border lg:border-[#ECEFF3] flex flex-col" style={{ minHeight: "100dvh" }}>

        {/* Header */}
        <header className="flex items-center gap-2.5 px-4 py-3 border-b border-[#ECEFF3] sticky top-0 bg-white z-20">
          <button onClick={() => router.push("/suppliers")}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-500 transition-colors shrink-0">
            <ArrowLeft size={20} />
          </button>
          <div className="flex -space-x-1.5 shrink-0">
            {[0, 1].map((i) => (
              <div key={i} className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center bg-slate-200 text-slate-500"
                style={{ zIndex: 2 - i }}>
                <User size={12} />
              </div>
            ))}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-slate-900 truncate leading-tight">{record?.location || "—"}</div>
            <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
              <span className="font-semibold uppercase tracking-wide">Cart · {id}</span>
              <span>·</span>
              <Clock size={9} className="shrink-0" />
              <span className="truncate">{createdAt}</span>
            </div>
          </div>
          <SaveIndicator state={saveState} lastSaved={lastSaved} />
          <button onClick={copy}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors shrink-0">
            {copied ? <Check size={18} className="text-green-500" /> : <Share2 size={18} className="text-slate-500" />}
          </button>
        </header>

        {/* Search to add */}
        <div className="px-4 py-2">
          <div ref={searchBoxRef} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 bg-white transition-all ${searchFocused ? "border-[#0091FF] shadow-[0_0_0_3px_rgba(0,145,255,0.1)]" : "border-[#ECEFF3]"}`}>
            {searchLoading ? <Loader2 size={16} className="text-[#0091FF] animate-spin shrink-0" /> : <Search size={16} className="text-slate-400 shrink-0" />}
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => { updateDropdownPos(); setSearchFocused(true); }}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              placeholder="Search to add products…"
              style={{ fontSize: '16px' }}
              className="flex-1 bg-transparent outline-none text-slate-900 placeholder-slate-400" />
            {searchQuery && <button onClick={() => setSearchQuery("")} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>}
          </div>

          {searchFocused && (searchResults.length > 0 || searchQuery) && (
            <div className="fixed left-4 right-4 bg-white rounded-xl border border-[#ECEFF3] shadow-lg z-50 overflow-hidden overflow-y-auto"
              style={{ top: dropdownTop, maxHeight: `calc(100dvh - ${dropdownTop}px - 12px)` }}>
              {searchResults.length > 0 && (
                <div className="px-3 py-2 border-b border-[#ECEFF3] flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                  <Sparkles size={11} />Suggestions
                </div>
              )}
              {searchResults.length === 0 && searchQuery && !searchLoading && (
                <div className="px-4 py-3 text-[13px] text-slate-400">No results for "{searchQuery}"</div>
              )}
              {searchResults.map((r) => (
                <button key={`${r.supplier}-${r.uid}`} onClick={() => addProduct(r)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#F8FAFC] transition-colors text-left">
                  <Thumb photo_sm={r.product.photo_sm} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-slate-900 line-clamp-1">{r.product.name}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{r.supplierLabel}{r.product.price ? ` · ${r.product.price} AED` : ""}</div>
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-[#0091FF] flex items-center justify-center text-white shrink-0">
                    <Plus size={14} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Supplier tabs */}
        {suppliers.length > 1 && (
          <div className="px-4 pb-1">
            <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {[{ name: "all", count: items.length }, ...suppliers.map(s => ({ name: s.name, count: s.count }))].map(({ name, count }) => (
                <button key={name} onClick={() => setActiveTab(name)}
                  className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold whitespace-nowrap transition-colors shrink-0 ${activeTab === name ? "bg-[#0091FF] text-white" : "bg-[#F1F5F9] text-slate-600 hover:bg-[#E2E8F0]"}`}>
                  {name === "all" ? "All" : name}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === name ? "bg-white/20 text-white" : "bg-white text-slate-500"}`}>{count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Items */}
        <div className="flex-1 px-4 pb-2 flex flex-col gap-2 mt-2">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Search size={32} className="mb-3 opacity-20" />
              <p className="text-[14px] font-medium text-slate-600 mb-1">Cart is empty</p>
              <p className="text-[13px]">Search above to add products</p>
            </div>
          )}

          {filtered.map((item) => (
            <div key={`${item.supplier}-${item.uid}`}
              className="flex items-start gap-3 bg-white rounded-xl border border-[#ECEFF3] px-3 py-3 hover:border-[#DEE3EA] transition-colors">
              <Thumb photo={item.product.photo} photo_sm={item.product.photo_sm} size={44} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[13px] font-medium text-slate-900 leading-snug">{item.product.name}</div>
                  {item.product.price != null && (
                    <span className="shrink-0 text-[14px] font-bold tabular-nums text-slate-900 whitespace-nowrap">
                      {(item.product.price * item.qty).toFixed(2)}
                      <span className="font-mono text-[9px] font-normal text-slate-400 ml-0.5">AED</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 mt-1.5">
                  <div className="flex items-center gap-1 text-[11px] text-slate-400 min-w-0 overflow-hidden">
                    <Tag size={9} className="shrink-0" /><span className="truncate">{item.supplierLabel}</span>
                    {item.product.price && <><span className="text-slate-300 shrink-0">·</span><span className="shrink-0">{item.product.price} AED</span></>}
                  </div>
                  <div className="inline-flex h-[24px] sm:h-[30px] items-center rounded-lg border border-[#ECEFF3] bg-[#F8FAFC] p-0.5 shrink-0">
                    <button onClick={() => item.qty <= 1 ? removeItem(item.uid, item.supplier) : updateQty(item.uid, item.supplier, -1)}
                      className="grid h-[16px] w-[16px] sm:h-[22px] sm:w-[22px] place-items-center rounded text-slate-500 hover:bg-white hover:shadow-sm transition-colors">
                      {item.qty <= 1 ? <Trash2 size={10} className="text-red-400" /> : <Minus size={10} />}
                    </button>
                    <input type="text" inputMode="numeric" value={item.qty}
                      onChange={(e) => setQty(item.uid, item.supplier, parseInt(e.target.value.replace(/\D/g, "")) || 1)}
                      className="w-[20px] sm:min-w-[28px] text-center text-[11px] sm:text-[13px] font-semibold tabular-nums text-slate-900 bg-transparent outline-none" />
                    <button onClick={() => updateQty(item.uid, item.supplier, 1)}
                      className="grid h-[16px] w-[16px] sm:h-[22px] sm:w-[22px] place-items-center rounded text-slate-500 hover:bg-white hover:shadow-sm transition-colors">
                      <Plus size={10} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Mobile footer */}
        {items.length > 0 && !searchFocused && (
          <footer className="sticky bottom-0 bg-white border-t border-[#ECEFF3] px-4 pt-3 pb-4 lg:hidden">
            <FooterContent items={filtered} subtotal={filtered.reduce((s,i)=>s+(i.product.price||0)*i.qty,0)} vat={filtered.reduce((s,i)=>s+(i.product.price||0)*i.qty,0)*0.05} total={filtered.reduce((s,i)=>s+(i.product.price||0)*i.qty,0)*1.05} totalQty={filtered.reduce((s,i)=>s+i.qty,0)}
              shareUrl={localUrl} cartId={id} onPDF={(onProgress) => generatePDFs(filtered, record?.location || "", onProgress)}
              onExcel={() => generateExcel(filtered, record?.location || "", id)} />
          </footer>
        )}
      </div>

      {/* ═══ DESKTOP SIDEBAR ═══ */}
      {items.length > 0 && (
        <div className="hidden lg:block lg:w-[320px] lg:sticky lg:top-10">
          <div className="bg-white rounded-2xl border border-[#ECEFF3] shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#ECEFF3] bg-gradient-to-b from-[#FCFDFE] to-white">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Order Summary</div>
            </div>
            <div className="px-5 py-4">
              <FooterContent items={filtered} subtotal={filtered.reduce((s,i)=>s+(i.product.price||0)*i.qty,0)} vat={filtered.reduce((s,i)=>s+(i.product.price||0)*i.qty,0)*0.05} total={filtered.reduce((s,i)=>s+(i.product.price||0)*i.qty,0)*1.05} totalQty={filtered.reduce((s,i)=>s+i.qty,0)}
                shareUrl={localUrl} cartId={id} onPDF={(onProgress) => generatePDFs(filtered, record?.location || "", onProgress)}
                onExcel={() => generateExcel(filtered, record?.location || "", id)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Circular progress ring ────────────────────────────────────────────────────
function CircleProgress({ pct }: { pct: number }) {
  const r = 9;
  const circ = 2 * Math.PI * r;
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" className="shrink-0">
      <circle cx="13" cy="13" r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" />
      <circle cx="13" cy="13" r={r} fill="none" stroke="white" strokeWidth="2.5"
        strokeDasharray={circ}
        strokeDashoffset={circ - (pct / 100) * circ}
        strokeLinecap="round"
        transform="rotate(-90 13 13)"
        style={{ transition: "stroke-dashoffset 0.25s ease" }} />
      <text x="13" y="16.5" textAnchor="middle" fill="white" fontSize="6.5" fontWeight="700">{pct}%</text>
    </svg>
  );
}

// ── Footer/sidebar content ────────────────────────────────────────────────────
function FooterContent({ items, subtotal, vat, total, totalQty, shareUrl, cartId, onPDF, onExcel }: {
  items: SharedCartItem[]; subtotal: number; vat: number; total: number; totalQty: number;
  shareUrl: string; cartId: string; onPDF: (onProgress: (pct: number) => void) => Promise<void> | void; onExcel: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [pdfPct, setPdfPct] = useState<number | null>(null);
  const pdfGenerating = pdfPct !== null;

  const handlePDF = async () => {
    setPdfPct(0);
    try { await onPDF((pct) => setPdfPct(pct)); } finally { setPdfPct(null); }
  };
  const copy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const uniqueSuppliers = new Set(items.map((i) => i.supplier)).size;
  const multiSupplier = uniqueSuppliers > 1;

  return (
    <div className="flex flex-col gap-1.5">

      {/* Total + incl. VAT */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[13px] font-semibold text-slate-900">Total</div>
          <div className="text-[11px] text-slate-400 tabular-nums">incl. VAT {vat.toFixed(2)} AED</div>
        </div>
        <div className="text-[20px] font-bold tracking-tight tabular-nums text-slate-900 leading-tight">
          {total.toFixed(2)}<span className="ml-1 font-mono text-[11px] font-normal text-slate-500">AED</span>
        </div>
      </div>

      {/* Multi-supplier warning */}
      {multiSupplier && (
        <p className="text-[11px] text-amber-600 flex items-center gap-1">
          <span>⚠</span> Select a single supplier tab to enable PDF &amp; download.
        </p>
      )}

      {/* [Copy][WA] | [PDF] */}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="flex gap-1">
          <button onClick={copy}
            className="flex-1 inline-flex h-[32px] items-center justify-center gap-1 rounded-[9px] border border-[#E2E8F0] text-[12px] font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} className="text-slate-400" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareUrl)}`, "_blank")}
            className="flex-1 inline-flex h-[32px] items-center justify-center gap-1 rounded-[9px] bg-[#25D366] text-[12px] font-semibold text-white hover:bg-[#1FBB58] transition-colors">
            <Send size={11} />WA
          </button>
        </div>
        <button
          onClick={multiSupplier || pdfGenerating ? undefined : handlePDF}
          disabled={multiSupplier || pdfGenerating}
          title={multiSupplier ? "Filter to one supplier first" : undefined}
          className={`inline-flex h-[32px] items-center justify-center gap-1.5 rounded-[9px] text-[12.5px] font-semibold transition-colors ${
            multiSupplier
              ? "border border-[#E2E8F0] text-slate-300 cursor-not-allowed"
              : pdfGenerating
              ? "bg-[#0091FF] text-white cursor-wait px-2"
              : "bg-[#0091FF] text-white shadow-[0_1px_0_rgba(0,107,194,0.5)] hover:bg-[#0080E5]"
          }`}>
          {pdfGenerating
            ? <><CircleProgress pct={pdfPct ?? 0} /><span className="text-[11px]">Generating…</span></>
            : <><FileText size={13} className={multiSupplier ? "text-slate-300" : "text-white"} />PDF</>}
        </button>
      </div>

      <p className="text-[10px] text-slate-400 text-center leading-tight">Anyone with the link can edit · prices are gross from supplier</p>
    </div>
  );
}
