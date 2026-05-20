"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveSharedCart, type SharedCartItem } from "@/lib/sharedCart";
import { createClient } from "@supabase/supabase-js";
import {
  ShoppingCart, ArrowRight, MapPin, X, Trash2,
  Clock, User, ExternalLink,
} from "lucide-react";
import GlobalSearchPanel from "@/components/GlobalSearchPanel";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SUPPLIERS = [
  { id: "loreal",       name: "L'Oréal Professionnel", subtitle: "Hair care · Colour · Styling",                  logo: "/logos/loreal.svg",        href: "/catalog/loreal",       brands: ["Kérastase","L'Oréal Pro","Redken","Essie"],           accent: "#2563eb", initials: "LP" },
  { id: "nazih",        name: "Nazih Group",            subtitle: "Professional beauty products",                  logo: "/logos/nazih.png",         href: "/catalog/nazih",        brands: ["Wella","Schwarzkopf","Indola","Goldwell"],            accent: "#0ea5e9", initials: "NZ" },
  { id: "madi",         name: "Madi International",     subtitle: "Multi-brand professional beauty",               logo: "/logos/madi.svg",          href: "/catalog/madi",         brands: ["Davines","K18","Goldwell","OPI","Kevin Murphy"],      accent: "#1a1a1a", initials: "MI" },
  { id: "victoriavynn", name: "Victoria Vynn",          subtitle: "Gel polish · Nail art · Accessories",           logo: "",                         href: "/catalog/victoriavynn", brands: ["Gel Polishes","Builder Gels","Base Coats","Top Coats"],accent: "#be185d", initials: "VV" },
  { id: "milia",        name: "Milia Cosmetics",        subtitle: "Multi-brand beauty · Nail · Hair · Tools",      logo: "/logos/milia.png",         href: "/catalog/milia",        brands: ["Thuya","Eurostil","Henbor","Kativa"],                 accent: "#0d9488", initials: "ML" },
  { id: "awarid",       name: "Awarid",                 subtitle: "Multi-brand beauty · Hair · Nails · Equipment", logo: "",                         href: "/catalog/awarid",       brands: ["Globalstar","Morfose","Black Professional","Framesi"], accent: "#b45309", initials: "AW" },
  { id: "albasel",      name: "Al Basel Cosmetics",     subtitle: "Multi-brand beauty · Hair · Nails · Skin",      logo: "/logos/albasel.svg",       href: "/catalog/albasel",      brands: ["Maybelline","Morfose","Globalstar","BaByliss"],       accent: "#b8860b", initials: "AB" },
  { id: "nawajm",       name: "Nawajm Cosmetics",       subtitle: "Multi-brand beauty · Hair · Grooming · Tools",  logo: "/logos/nawajm.png",        href: "/catalog/nawajm",       brands: ["3Deluxe","Helios","Nishman","Bulbo"],                 accent: "#d97706", initials: "NW" },
];

function readCart(sid: string): any[] {
  try { return JSON.parse(localStorage.getItem(`${sid}_cart`) || "[]"); } catch { return []; }
}
function writeCart(sid: string, items: any[]) {
  try { localStorage.setItem(`${sid}_cart`, JSON.stringify(items)); } catch {}
}
function readTimestamp(sid: string): string | null {
  try { return localStorage.getItem(`${sid}_cart_ts`) || null; } catch { return null; }
}

// ── Carts overview drawer ────────────────────────────────────────────────────
// ── Carts overview drawer ────────────────────────────────────────────────────
interface CartRow {
  sid: string; name: string; accent: string; logo: string; initials: string;
  qty: number; amount: number; timestamp: string | null; items: any[];
}

function CartsOverviewDrawer({
  onClose, location, onCartCountChange,
}: {
  onClose: () => void; location: string;
  onCartCountChange: (sid: string, count: number) => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<CartRow[]>([]);

  const load = () => {
    const loaded: CartRow[] = [];
    for (const s of SUPPLIERS) {
      const items = readCart(s.id);
      if (!items.length) continue;
      const qty    = items.reduce((n: number, i: any) => n + (i.quantity || 1), 0);
      const amount = items.reduce((n: number, i: any) => n + (i.product?.price || 0) * (i.quantity || 1), 0);
      loaded.push({ sid: s.id, name: s.name, accent: s.accent, logo: s.logo, initials: s.initials, qty, amount, timestamp: readTimestamp(s.id), items });
    }
    setRows(loaded);
  };

  useEffect(() => { load(); }, []);

  const handleView = (row: CartRow) => {
    // Go to the supplier's own catalog page — cart is already in localStorage
    const sup = SUPPLIERS.find((s) => s.id === row.sid);
    onClose();
    router.push(sup?.href || "/suppliers");
  };

  const handleShare = async (row: CartRow) => {
    const items: SharedCartItem[] = row.items.map((i: any) => ({
      uid: i.product?.ean || i.product?.sku || i.product?.id || i.id,
      qty: i.quantity || 1,
      supplier: row.sid,
      supplierLabel: row.name,
      product: {
        name: i.product?.name || "", brand: i.product?.brand || null,
        price: i.product?.price ?? null, photo: i.product?.photo || null,
        ean: i.product?.ean || null, sku: i.product?.sku || null,
        aki_code: i.product?.aki_code || null, sub_category: i.product?.sub_category || null,
        uom: i.product?.uom || null,
      },
    }));
    try {
      const id = await saveSharedCart(items, location || "salon");
      onClose();
      router.push(`/cart/${id}`);
    } catch (e) {
      alert("Could not create share link — make sure the shared_carts table exists in Supabase.");
    }
  };

  const handleDelete = (sid: string) => {
    if (!confirm(`Clear the ${SUPPLIERS.find(s => s.id === sid)?.name} cart?`)) return;
    writeCart(sid, []);
    onCartCountChange(sid, 0);
    load();
  };

  const totalQty    = rows.reduce((n, r) => n + r.qty, 0);
  const subtotal    = rows.reduce((n, r) => n + r.amount, 0);
  const vat         = subtotal * 0.05;
  const total       = subtotal + vat;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />

      <aside
        aria-label="Active Carts"
        className="relative grid h-screen max-h-screen w-full max-w-[440px] grid-rows-[auto_1fr_auto] border-l border-slate-200 bg-white shadow-2xl"
      >
        {/* ── Header ── */}
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 overflow-hidden border-b border-slate-200 bg-gradient-to-b from-slate-50/60 to-white px-5 py-4">
          <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-sky-50 text-sky-500">
            <ShoppingCart size={18} />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <h2 className="text-[16px] font-semibold tracking-tight text-slate-900">Active Carts</h2>
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-sky-500 px-1.5 text-[11.5px] font-semibold tabular-nums text-white">
                {rows.length}
              </span>
            </div>
            <div className="truncate text-[13px] text-slate-500">
              {totalQty} item{totalQty !== 1 ? "s" : ""} across{" "}
              <b className="font-semibold text-slate-900">{rows.length} supplier{rows.length !== 1 ? "s" : ""}</b>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="grid h-[34px] w-[34px] place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">
            <X size={18} />
          </button>
        </header>

        {/* ── Rows ── */}
        <div className="flex flex-col gap-2.5 overflow-y-auto p-4" style={{ scrollbarWidth: "thin" }}>
          {rows.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3.5 px-6 py-12 text-center text-slate-500">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-sky-50 text-sky-500">
                <ShoppingCart size={28} />
              </div>
              <h3 className="text-[16px] font-semibold text-slate-900">No active carts</h3>
              <p className="max-w-[260px] text-[13.5px]">
                Add products from any supplier catalogue — they'll show up here.
              </p>
            </div>
          )}

          {rows.map((row) => (
            <div key={row.sid}
              className="grid min-w-0 grid-cols-[56px_minmax(0,1fr)_auto] gap-3.5 rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-slate-300">

              {/* Thumb — supplier logo */}
              <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-slate-200 bg-gradient-to-br from-white to-slate-100 p-2">
                {row.logo ? (
                  <img src={row.logo} alt="" className="max-w-full max-h-full object-contain mix-blend-multiply"
                    onError={(e) => {
                      const el = e.target as HTMLImageElement;
                      el.style.display = "none";
                      el.parentElement!.innerHTML = `<span style="font-size:11px;font-weight:700;color:${row.accent}">${row.initials}</span>`;
                    }} />
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 700, color: row.accent }}>{row.initials}</span>
                )}
              </div>

              {/* Info */}
              <div className="flex min-w-0 flex-col gap-1.5">
                {/* Supplier name + qty badge */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-sky-700">{row.name}</span>
                  <span className="inline-flex h-[18px] items-center px-1.5 rounded-full text-[10px] font-bold text-white"
                    style={{ background: row.accent }}>
                    {row.qty} item{row.qty !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Timestamp */}
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Clock size={10} />
                  <span>{row.timestamp ?? <span className="italic">No timestamp</span>}</span>
                </div>

                {/* Amount + team member */}
                <div className="flex items-center gap-3 text-[11px]">
                  {row.amount > 0 && (
                    <span className="font-bold tabular-nums text-slate-900">
                      {row.amount.toFixed(2)}{" "}
                      <span className="font-mono text-[9.5px] font-normal text-slate-400">AED</span>
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-slate-300 italic">
                    <User size={10} />— wire up later
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col items-end justify-between gap-1.5">
                <button type="button" onClick={() => handleDelete(row.sid)}
                  className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600">
                  <Trash2 size={15} />
                </button>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => handleView(row)}
                    className="inline-flex h-[28px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[11.5px] font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50">
                    <ExternalLink size={11} />
                    Open
                  </button>
                  <button type="button" onClick={() => handleShare(row)}
                    className="inline-flex h-[28px] items-center gap-1 rounded-lg bg-[#0091FF] px-2 text-[11.5px] font-semibold text-white transition-colors hover:bg-[#0080E5]">
                    Share
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        {rows.length > 0 && (
          <footer className="flex min-w-0 flex-col gap-3 overflow-hidden border-t border-slate-200 bg-white px-4 py-4">
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
          </footer>
        )}
      </aside>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function SuppliersPage() {
  const router = useRouter();
  const [cartCounts, setCartCounts] = useState<Record<string, number>>({});
  const [location, setLocation] = useState("");
  const [mounted, setMounted] = useState(false);
  const [cartsOpen, setCartsOpen] = useState(false);

  const openSupplierCart = async (sid: string) => {
    const cart = readCart(sid);
    if (!cart.length) return;
    const sup = SUPPLIERS.find((s) => s.id === sid);
    const items: SharedCartItem[] = cart.map((i: any) => ({
      uid: i.product?.ean || i.product?.sku || i.product?.id || i.id,
      qty: i.quantity || 1,
      supplier: sid,
      supplierLabel: sup?.name || sid,
      product: {
        name: i.product?.name || "", brand: i.product?.brand || null,
        price: i.product?.price ?? null, photo: i.product?.photo || null,
        ean: i.product?.ean || null, sku: i.product?.sku || null,
        aki_code: i.product?.aki_code || null, sub_category: i.product?.sub_category || null,
        uom: i.product?.uom || null,
      },
    }));
    try {
      const id = await saveSharedCart(items, location || "salon");
      router.push(`/cart/${id}`);
    } catch {
      router.push(`/cart/${encodeURIComponent(location || "salon")}/${cart.map((i: any) => `${i.product?.ean || i.product?.sku || i.id}_${i.quantity || 1}`).join("-")}`);
    }
  };

  useEffect(() => {
    setMounted(true);
    setLocation(localStorage.getItem("salon_location") || "");
    const counts: Record<string, number> = {};
    SUPPLIERS.forEach((s) => {
      const cart = readCart(s.id);
      if (cart.length > 0) counts[s.id] = cart.length;
    });
    setCartCounts(counts);
  }, []);

  useEffect(() => {
    if (!location) return;
    SUPPLIERS.forEach(async (s) => {
      const { data } = await supabase.from("loreal_saved_carts").select("cart_data")
        .eq("location", `${location}::${s.id}`).maybeSingle();
      if (data?.cart_data) setCartCounts(p => ({ ...p, [s.id]: (data.cart_data as any[]).length }));
    });
  }, [location]);

  const handleLocation = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocation(e.target.value);
    localStorage.setItem("salon_location", e.target.value);
  };

  const totalCartItems = Object.values(cartCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(135deg, #eef4ff 0%, #f8faff 100%)" }}>

      {/* Header */}
      <header className="bg-white/70 backdrop-blur border-b border-blue-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">O</span>
          </div>
          <span className="font-semibold text-gray-800 text-sm">Order Portal</span>
        </div>
        <div className="flex items-center gap-2">
          {mounted && totalCartItems > 0 && (
            <button
              onClick={() => setCartsOpen(true)}
              className="flex items-center gap-1.5 bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm hover:bg-red-600 transition-colors"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              {totalCartItems} in carts
            </button>
          )}
          <div className="flex items-center gap-2 bg-white border border-blue-100 rounded-lg px-3 py-2">
            <MapPin className="w-3.5 h-3.5 text-blue-400" />
            <input
              value={location}
              onChange={handleLocation}
              placeholder="Salon / Location"
              className="bg-transparent outline-none text-sm text-gray-700 placeholder-gray-300 w-40"
            />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-light text-gray-800 mb-3">Choose your supplier</h1>
          <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
            <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-600 text-xs font-semibold px-2.5 py-1 rounded-full mb-2">Beta</span>
            <br />
            Create Order PDFs and share with suppliers &amp; your team.
            <br />
            <span className="text-gray-400 text-xs">Includes photos &amp; supplier barcodes.</span>
          </p>
        </div>

        <div className="w-full max-w-2xl mb-10">
          <GlobalSearchPanel />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
          {SUPPLIERS.map((s) => (
            <div key={s.id} className="relative">
              <button
                onClick={() => {
                  if (location) localStorage.setItem("active_supplier", s.id);
                  router.push(s.href);
                }}
                className="w-full group relative bg-white rounded-2xl border border-blue-100 shadow-sm hover:shadow-lg hover:border-blue-300 transition-all duration-300 p-7 text-left hover:-translate-y-0.5"
              >
                <div className="h-10 mb-6 flex items-center">
                  {s.logo ? (
                    <img src={s.logo} alt={s.name}
                      className="max-h-full max-w-[130px] object-contain opacity-70 group-hover:opacity-100 transition-opacity mix-blend-multiply"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                        (e.target as HTMLImageElement).parentElement!.innerHTML =
                          `<span style="font-size:1.5rem;font-weight:600;color:${s.accent}">${s.initials}</span>`;
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: "1.5rem", fontWeight: 600, color: s.accent }}>{s.initials}</span>
                  )}
                </div>
                <h2 className="text-lg font-semibold text-gray-800 mb-1">{s.name}</h2>
                <p className="text-xs text-gray-400 mb-5">{s.subtitle}</p>
                <div className="flex flex-wrap gap-1.5 mb-6">
                  {s.brands.map(b => (
                    <span key={b} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-500 border border-blue-100">{b}</span>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  Open catalogue <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </button>

              {/* Cart badge */}
              {mounted && cartCounts[s.id] > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setCartsOpen(true); }}
                  className="absolute bottom-5 right-5 flex items-center gap-1 text-white text-[11px] font-bold pl-2 pr-2.5 py-1 rounded-full shadow-md ring-2 ring-white transition-transform hover:scale-105"
                  style={{ background: "#ef4444" }}
                >
                  <ShoppingCart className="w-3 h-3" />
                  {cartCounts[s.id]}
                </button>
              )}
            </div>
          ))}
        </div>

        {!location && mounted && (
          <p className="mt-8 text-xs text-blue-400/70 text-center">
            Enter your salon name to sync your cart across devices
          </p>
        )}
      </main>

      <footer className="px-6 py-4 text-center border-t border-blue-50">
        <p className="text-[10px] tracking-widest uppercase text-gray-300">Professional Beauty · Order Management</p>
      </footer>

      {cartsOpen && (
        <CartsOverviewDrawer
          onClose={() => setCartsOpen(false)}
          location={location}
          onCartCountChange={(sid, count) => setCartCounts(p => ({ ...p, [sid]: count }))}
        />
      )}
    </div>
  );
}
