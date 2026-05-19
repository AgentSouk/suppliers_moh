"use client";

import { useState, useEffect, useCallback, useRef, use, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Search, Plus, Minus, Trash2, FileText, FileSpreadsheet,
  Download, Share2, Copy, Check, X, Clock, Tag, MoreHorizontal,
  ChevronDown, Loader2, Send, Sparkles, User,
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
        <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">?</div>
      )}
    </div>
  );
}

function SaveIndicator({ state }: { state: "idle" | "saving" | "saved" }) {
  if (state === "idle") return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full transition-all ${state === "saving" ? "bg-amber-50 text-amber-600" : "bg-green-50 text-green-600"}`}>
      {state === "saving" ? <><Loader2 size={10} className="animate-spin" />Saving…</> : <><Check size={10} />Saved</>}
    </span>
  );
}

// ── PDF generation per supplier ───────────────────────────────────────────────
const PREFIXES: Record<string, string> = {
  loreal: "LOP", nazih: "NZH", wella: "WEL", madi: "MDI",
  victoriavynn: "VVN", skeyndor: "SKY", milia: "MLI", awarid: "AWR",
};

async function generatePDFs(items: SharedCartItem[], location: string) {
  const bySupplier = new Map<string, SharedCartItem[]>();
  for (const item of items) {
    if (!bySupplier.has(item.supplier)) bySupplier.set(item.supplier, []);
    bySupplier.get(item.supplier)!.push(item);
  }
  for (const [sid, sItems] of bySupplier.entries()) {
    await generatePO({
      cart: sItems.map((i) => ({ quantity: i.qty, foc: 0, product: i.product })),
      supplierName: sItems[0].supplierLabel,
      supplierPrefix: PREFIXES[sid] || sid.toUpperCase().slice(0, 3),
      location,
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
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allProductsRef = useRef<any[] | null>(null);

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

  // ── Auto-save on item changes ───────────────────────────────────────────────
  const triggerSave = useCallback((nextItems: SharedCartItem[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = setTimeout(async () => {
      try {
        await updateSharedCart(id, nextItems);
        setSaveState("saved");
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
        <header className="flex items-center gap-3 px-4 py-3.5 border-b border-[#ECEFF3] sticky top-0 bg-white z-20">
          <button onClick={() => router.push("/suppliers")}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-500 transition-colors shrink-0">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Shared Cart · {id}</div>
            <div className="text-[15px] font-semibold text-slate-900 truncate">{record?.location || "—"}</div>
          </div>
          <SaveIndicator state={saveState} />
          <button className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
            <MoreHorizontal size={20} />
          </button>
        </header>

        {/* Meta card */}
        <div className="mx-4 mt-3 mb-1 bg-[#F8FAFC] rounded-xl border border-[#ECEFF3] px-4 py-3 flex items-center gap-3">
          <div className="flex -space-x-2 shrink-0">
            {["?", "?"].map((_, i) => (
              <div key={i} className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center bg-slate-200 text-slate-500"
                style={{ zIndex: 2 - i }}>
                <User size={14} />
              </div>
            ))}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 text-[12px] text-slate-600 flex-wrap">
              <b className="text-slate-900 font-semibold">{record?.location || "Shared"}</b>
              <span className="text-slate-400">·</span>
              <Clock size={11} className="text-slate-400" />
              <span className="text-slate-400">{createdAt}</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">{items.length} products · {totalQty} units</div>
          </div>
          <button onClick={copy}
            className="flex items-center gap-1.5 bg-white border border-[#ECEFF3] rounded-full px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm shrink-0">
            {copied ? <><Check size={13} className="text-green-500" />Copied</> : <><Share2 size={13} />Share</>}
          </button>
        </div>

        {/* Search to add */}
        <div className="px-4 py-2 relative">
          <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 bg-white transition-all ${searchFocused ? "border-[#0091FF] shadow-[0_0_0_3px_rgba(0,145,255,0.1)]" : "border-[#ECEFF3]"}`}>
            {searchLoading ? <Loader2 size={16} className="text-[#0091FF] animate-spin shrink-0" /> : <Search size={16} className="text-slate-400 shrink-0" />}
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)} onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              placeholder="Search to add products…"
              className="flex-1 bg-transparent outline-none text-[13.5px] text-slate-900 placeholder-slate-400" />
            {searchQuery && <button onClick={() => setSearchQuery("")} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>}
          </div>

          {searchFocused && (searchResults.length > 0 || searchQuery) && (
            <div className="absolute left-4 right-4 top-full mt-1 bg-white rounded-xl border border-[#ECEFF3] shadow-lg z-30 overflow-hidden max-h-[60vh] overflow-y-auto">
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
                  <Thumb photo={r.product.photo} photo_sm={r.product.photo_sm} size={40} />
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
                  <div className="inline-flex h-[30px] items-center rounded-lg border border-[#ECEFF3] bg-[#F8FAFC] p-0.5 shrink-0">
                    <button onClick={() => item.qty <= 1 ? removeItem(item.uid, item.supplier) : updateQty(item.uid, item.supplier, -1)}
                      className="grid h-[22px] w-[22px] place-items-center rounded-md text-slate-500 hover:bg-white hover:shadow-sm transition-colors">
                      {item.qty <= 1 ? <Trash2 size={11} className="text-red-400" /> : <Minus size={12} />}
                    </button>
                    <input type="text" inputMode="numeric" value={item.qty}
                      onChange={(e) => setQty(item.uid, item.supplier, parseInt(e.target.value.replace(/\D/g, "")) || 1)}
                      className="min-w-[28px] text-center text-[13px] font-semibold tabular-nums text-slate-900 bg-transparent outline-none" />
                    <button onClick={() => updateQty(item.uid, item.supplier, 1)}
                      className="grid h-[22px] w-[22px] place-items-center rounded-md text-slate-500 hover:bg-white hover:shadow-sm transition-colors">
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Mobile footer */}
        {items.length > 0 && (
          <footer className="sticky bottom-0 bg-white border-t border-[#ECEFF3] px-4 pt-4 pb-5 lg:hidden">
            <FooterContent items={filtered} subtotal={filtered.reduce((s,i)=>s+(i.product.price||0)*i.qty,0)} vat={filtered.reduce((s,i)=>s+(i.product.price||0)*i.qty,0)*0.05} total={filtered.reduce((s,i)=>s+(i.product.price||0)*i.qty,0)*1.05} totalQty={filtered.reduce((s,i)=>s+i.qty,0)}
              shareUrl={localUrl} cartId={id} onPDF={() => generatePDFs(filtered, record?.location || "")}
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
                shareUrl={localUrl} cartId={id} onPDF={() => generatePDFs(filtered, record?.location || "")}
                onExcel={() => generateExcel(filtered, record?.location || "", id)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Footer/sidebar content ────────────────────────────────────────────────────
function FooterContent({ items, subtotal, vat, total, totalQty, shareUrl, cartId, onPDF, onExcel }: {
  items: SharedCartItem[]; subtotal: number; vat: number; total: number; totalQty: number;
  shareUrl: string; cartId: string; onPDF: () => void; onExcel: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const uniqueSuppliers = new Set(items.map((i) => i.supplier)).size;
  const multiSupplier = uniqueSuppliers > 1;

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid gap-1.5 text-[13px] text-slate-500">
        <div className="flex items-center justify-between">
          <dt>Subtotal · {totalQty} unit{totalQty !== 1 ? "s" : ""}</dt>
          <dd className="font-semibold tabular-nums text-slate-900">{subtotal.toFixed(2)} AED</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt>VAT (5%)</dt>
          <dd className="font-semibold tabular-nums text-slate-900">{vat.toFixed(2)} AED</dd>
        </div>
        <div className="flex items-baseline justify-between pt-2.5 mt-1 border-t border-dashed border-[#ECEFF3]">
          <dt className="text-[14px] font-semibold text-slate-900">Total</dt>
          <dd className="text-[22px] font-bold tracking-tight tabular-nums text-slate-900">
            {total.toFixed(2)}<span className="ml-1 font-mono text-[11px] font-normal text-slate-500">AED</span>
          </dd>
        </div>
      </dl>

      {/* PDF button — disabled when multiple suppliers */}
      {multiSupplier ? (
        <div className="w-full rounded-xl border border-dashed border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2">
          <span className="text-amber-500 text-[13px] shrink-0 mt-px">⚠</span>
          <p className="text-[11.5px] text-amber-700 leading-snug">
            Select a single supplier tab above to enable PDF &amp; Excel download.
          </p>
        </div>
      ) : (
        <button onClick={onPDF}
          className="w-full h-12 flex items-center justify-center gap-2 rounded-xl bg-[#0091FF] text-white text-[15px] font-semibold shadow-[0_1px_0_rgba(0,107,194,0.5),0_4px_12px_-2px_rgba(0,145,255,0.35)] hover:bg-[#0080E5] transition-colors">
          <Download size={18} />Download PO PDF
        </button>
      )}

      <div className="flex items-center gap-1.5 rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] py-1.5 pl-3 pr-1.5">
        <span className="flex-1 min-w-0 truncate font-mono text-[11px] text-slate-400"
          style={{ direction: "rtl", textAlign: "left" }} title={shareUrl}>{"⁦" + shareUrl + "⁩"}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={copy} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-white hover:text-slate-700 transition-colors">
            {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
          </button>
          <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareUrl)}`, "_blank")}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-[#25D366] px-2 text-[11px] font-semibold text-white hover:bg-[#1FBB58] transition-colors">
            <Send size={11} />WA
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={multiSupplier ? undefined : onExcel}
          disabled={multiSupplier}
          title={multiSupplier ? "Filter to one supplier first" : undefined}
          className={`inline-flex h-[38px] items-center justify-center gap-1.5 rounded-[9px] border text-[12.5px] font-medium transition-colors ${multiSupplier ? "border-[#E2E8F0] text-slate-300 cursor-not-allowed" : "border-[#E2E8F0] text-slate-700 hover:bg-slate-50"}`}>
          <FileSpreadsheet size={13} className={multiSupplier ? "text-slate-300" : "text-slate-400"} />Excel
        </button>
        <button
          onClick={multiSupplier ? undefined : onPDF}
          disabled={multiSupplier}
          title={multiSupplier ? "Filter to one supplier first" : undefined}
          className={`inline-flex h-[38px] items-center justify-center gap-1.5 rounded-[9px] border text-[12.5px] font-medium transition-colors ${multiSupplier ? "border-[#E2E8F0] text-slate-300 cursor-not-allowed" : "border-[#E2E8F0] text-slate-700 hover:bg-slate-50"}`}>
          <FileText size={13} className={multiSupplier ? "text-slate-300" : "text-slate-400"} />PDF
        </button>
      </div>

      <p className="text-[10.5px] text-slate-400 text-center">Anyone with the link can edit · prices are gross from supplier</p>
    </div>
  );
}
