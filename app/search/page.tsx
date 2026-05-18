"use client";

import { useState } from "react";
import {
  ArrowLeft, ArrowRight, Search, ShoppingCart,
  ChevronDown, ChevronUp, Plus, Check, Filter,
  ArrowUpDown, LayoutGrid, List, Heart, Sparkles, Tag,
} from "lucide-react";

// ─── Mock data ────────────────────────────────────────────────────────────────
interface Product {
  id: number;
  brand: string;
  title: string;
  price: number;
  accentColor: string;
}

interface Supplier {
  id: string;
  name: string;
  initials: string;
  logo?: string;
  accentColor: string;
  shipsIn: string;
  products: Product[];
}

const SUPPLIERS: Supplier[] = [
  {
    id: "loreal",
    name: "L'Oréal Professionnel",
    initials: "LP",
    logo: "/logos/loreal.svg",
    accentColor: "#2563eb",
    shipsIn: "1–2 days",
    products: [
      { id: 1,  brand: "Kérastase",       title: "Discipline Bain Fluidealiste Shampoo 250ml",       price: 89.00,  accentColor: "#2563eb" },
      { id: 2,  brand: "L'Oréal Pro",     title: "Majirel Funda 60ml Permanent Hair Colour",         price: 28.12,  accentColor: "#1d4ed8" },
      { id: 3,  brand: "Redken",          title: "Color Extend Magnetics Shampoo 300ml",              price: 52.50,  accentColor: "#7c3aed" },
      { id: 4,  brand: "Essie",           title: "Gel Couture Nail Polish Long-Lasting 13.5ml",       price: 35.00,  accentColor: "#be185d" },
      { id: 5,  brand: "Kérastase",       title: "Nutritive Masquintense Thick Hair Mask 200ml",      price: 120.00, accentColor: "#2563eb" },
      { id: 6,  brand: "L'Oréal Pro",     title: "Serie Expert Pure Resource Shampoo 500ml",          price: 44.00,  accentColor: "#1d4ed8" },
      { id: 7,  brand: "Redken",          title: "Extreme Length Primer Leave-In Treatment 150ml",    price: 67.00,  accentColor: "#7c3aed" },
      { id: 8,  brand: "Kérastase",       title: "Elixir Ultime Original Hair Oil 75ml",              price: 148.00, accentColor: "#2563eb" },
    ],
  },
  {
    id: "nazih",
    name: "Nazih Group",
    initials: "NZ",
    logo: "/logos/nazih.png",
    accentColor: "#0ea5e9",
    shipsIn: "2–3 days",
    products: [
      { id: 9,  brand: "Wella",           title: "Color Touch Semi-Permanent Hair Colour 60ml",       price: 18.50,  accentColor: "#0ea5e9" },
      { id: 10, brand: "Schwarzkopf",     title: "Igora Royal Permanent Colour 60ml",                 price: 22.00,  accentColor: "#1a1a1a" },
      { id: 11, brand: "Indola",          title: "Blonde Expert Lightener Powder 450g",               price: 55.00,  accentColor: "#b45309" },
      { id: 12, brand: "Goldwell",        title: "Topchic Permanent Hair Colour 60ml",                price: 24.75,  accentColor: "#d97706" },
      { id: 13, brand: "Wella",           title: "Shinefinity Glaze 60ml Zero Lift Colour",           price: 19.90,  accentColor: "#0ea5e9" },
      { id: 14, brand: "Schwarzkopf",     title: "Chroma ID Bonding Colour Mask 300ml",               price: 48.00,  accentColor: "#1a1a1a" },
    ],
  },
  {
    id: "madi",
    name: "Madi International",
    initials: "MI",
    logo: "/logos/madi.svg",
    accentColor: "#1a1a1a",
    shipsIn: "3–5 days",
    products: [
      { id: 15, brand: "Davines",         title: "MOMO Moisturizing Shampoo 1000ml",                  price: 112.00, accentColor: "#0d9488" },
      { id: 16, brand: "K18",             title: "Leave-In Molecular Repair Hair Mask 5ml",            price: 65.00,  accentColor: "#7c3aed" },
      { id: 17, brand: "OPI",             title: "Nail Lacquer Big Apple Red 15ml",                    price: 38.00,  accentColor: "#dc2626" },
      { id: 18, brand: "Kevin Murphy",    title: "Smooth Again Wash Anti-Frizz Shampoo 250ml",        price: 97.50,  accentColor: "#1a1a1a" },
      { id: 19, brand: "Davines",         title: "SU Aftersun Repairing Superactive 150ml",           price: 84.00,  accentColor: "#0d9488" },
      { id: 20, brand: "K18",             title: "Damage Shield Protective Conditioner 250ml",         price: 88.00,  accentColor: "#7c3aed" },
      { id: 21, brand: "OPI",             title: "GelColor Stay Classic Base Coat 15ml",               price: 42.00,  accentColor: "#dc2626" },
      { id: 22, brand: "Kevin Murphy",    title: "Angel Wash Volumising Shampoo 250ml",               price: 95.00,  accentColor: "#1a1a1a" },
      { id: 23, brand: "Davines",         title: "OI Absolute Beautifying Shampoo 280ml",             price: 78.00,  accentColor: "#0d9488" },
    ],
  },
  {
    id: "skeyndor",
    name: "Skeyndor",
    initials: "SK",
    logo: "/logos/skeyndor.png",
    accentColor: "#7c3aed",
    shipsIn: "2–4 days",
    products: [
      { id: 24, brand: "Skeyndor",        title: "Power Hyaluronic Intensive Moisturising Emulsion",  price: 58.00,  accentColor: "#7c3aed" },
      { id: 25, brand: "Skeyndor",        title: "Global Lift Contour Eye & Lip Cream",               price: 95.00,  accentColor: "#7c3aed" },
      { id: 26, brand: "Skeyndor",        title: "Power Retinol Renovator Night Cream 50ml",          price: 110.00, accentColor: "#7c3aed" },
      { id: 27, brand: "Skeyndor",        title: "Clearist Sebum Rebalancing Essence 30ml",           price: 72.00,  accentColor: "#7c3aed" },
      { id: 28, brand: "Skeyndor",        title: "Aquatherm Calming & Redness Relief Serum 30ml",     price: 86.00,  accentColor: "#7c3aed" },
    ],
  },
];

// ─── Placeholder image ────────────────────────────────────────────────────────
function ProductImage({ accentColor, brand }: { accentColor: string; brand: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id={`g-${brand}`} cx="50%" cy="50%" r="60%">
          <stop offset="0%"   stopColor="#ffffff" />
          <stop offset="100%" stopColor="#F3F6FA" />
        </radialGradient>
        <pattern id={`h-${brand}`} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="6" x2="12" y2="6" stroke="#E8ECF2" strokeWidth="0.75" />
        </pattern>
      </defs>
      <rect width="200" height="200" fill={`url(#g-${brand})`} />
      <rect width="200" height="200" fill={`url(#h-${brand})`} opacity="0.6" />
      <circle cx="100" cy="100" r="36" fill={accentColor} opacity="0.12" />
      <circle cx="100" cy="100" r="22" fill={accentColor} opacity="0.22" />
      <circle cx="100" cy="100" r="11" fill={accentColor} opacity="0.55" />
    </svg>
  );
}

// ─── Product card ─────────────────────────────────────────────────────────────
function ProductCard({
  product,
  inCart,
  onAdd,
}: {
  product: Product;
  inCart: boolean;
  onAdd: () => void;
}) {
  const [hearted, setHearted] = useState(false);

  return (
    <div className="group relative rounded-xl border border-line bg-surface hover:border-ink-300 hover:shadow-md hover:-translate-y-px transition-all duration-200 flex flex-col overflow-hidden cursor-pointer">
      {/* Image area */}
      <div className="relative aspect-square overflow-hidden select-none">
        <ProductImage accentColor={product.accentColor} brand={product.brand + product.id} />

        {/* Brand tag */}
        <div className="absolute top-2 left-2 flex items-center gap-1 bg-white/90 backdrop-blur border border-line rounded px-2 py-1">
          <Tag className="w-2.5 h-2.5 text-ink-400" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-600 leading-none">
            {product.brand}
          </span>
        </div>

        {/* Heart */}
        <button
          onClick={(e) => { e.stopPropagation(); setHearted((v) => !v); }}
          className={`absolute top-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center bg-white/90 backdrop-blur border border-line transition-all duration-150 opacity-0 group-hover:opacity-100 hover:border-rose-300 ${hearted ? "!opacity-100" : ""}`}
        >
          <Heart className={`w-3.5 h-3.5 transition-colors ${hearted ? "fill-rose-500 text-rose-500" : "text-ink-400"}`} />
        </button>
      </div>

      {/* Body */}
      <div className="p-3.5 flex flex-col gap-2.5 flex-1">
        <p className="text-[13.5px] font-medium text-ink-700 line-clamp-2 leading-snug min-h-[40px]">
          {product.title}
        </p>

        {/* Foot */}
        <div className="flex items-center justify-between mt-auto">
          <div className="flex items-baseline gap-1">
            <span className="text-[17px] font-bold tracking-tight text-ink-900">
              {product.price.toFixed(2)}
            </span>
            <span className="font-mono text-[11px] text-ink-500">AED</span>
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
              inCart
                ? "bg-green-600 text-white"
                : "bg-ink-900 text-white hover:bg-brand"
            }`}
          >
            {inCart
              ? <Check className="w-4 h-4" />
              : <Plus className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Supplier group ───────────────────────────────────────────────────────────
const VISIBLE_DEFAULT = 7;

function SupplierGroup({
  supplier,
  cart,
  onAdd,
}: {
  supplier: Supplier;
  cart: Set<number>;
  onAdd: (id: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const minPrice = Math.min(...supplier.products.map((p) => p.price));
  const visible = showAll ? supplier.products : supplier.products.slice(0, VISIBLE_DEFAULT);
  const hasMore = supplier.products.length > VISIBLE_DEFAULT;

  return (
    <div className="rounded-2xl border border-line bg-surface hover:shadow-sm transition-shadow duration-200">

      {/* Group header */}
      <div
        className="flex items-center gap-4 p-5 border-b border-line"
        style={{ background: "linear-gradient(to right, #FCFDFE, #ffffff)" }}
      >
        {/* Logo tile */}
        <div className="w-11 h-11 rounded-xl bg-ink-50 border border-line flex items-center justify-center shrink-0 overflow-hidden p-1">
          {supplier.logo ? (
            <img
              src={supplier.logo}
              alt={supplier.name}
              className="max-w-full max-h-full object-contain"
              onError={(e) => {
                const el = e.target as HTMLImageElement;
                el.style.display = "none";
                el.parentElement!.innerHTML = `<span style="font-size:11px;font-weight:700;color:${supplier.accentColor}">${supplier.initials}</span>`;
              }}
            />
          ) : (
            <span style={{ fontSize: 11, fontWeight: 700, color: supplier.accentColor }}>
              {supplier.initials}
            </span>
          )}
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-ink-900">{supplier.name}</span>
            <span className="inline-flex items-center h-[22px] px-1.5 rounded-full bg-brand-50 text-brand-700 text-[11px] font-semibold">
              {supplier.products.length}
            </span>
          </div>
          <p className="text-sm text-ink-500">
            from{" "}
            <span className="font-semibold text-ink-900">{minPrice.toFixed(2)} AED</span>
            {" · "}Ships in {supplier.shipsIn}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button className="h-[34px] px-3 rounded-lg border border-line bg-surface text-sm font-medium text-brand-700 hover:bg-brand-50 transition-colors flex items-center gap-1.5">
            Browse full catalogue
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setCollapsed((v) => !v)}
            className="w-[34px] h-[34px] rounded-lg border border-line bg-surface flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-ink-50 transition-all"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`}
            />
          </button>
        </div>
      </div>

      {/* Product grid */}
      {!collapsed && (
        <div className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3.5">
            {visible.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                inCart={cart.has(p.id)}
                onAdd={() => onAdd(p.id)}
              />
            ))}
          </div>

          {/* Show more strip */}
          {hasMore && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mt-4 w-full flex items-center justify-center gap-2 pt-4 border-t border-dashed border-line text-sm font-medium text-ink-500 hover:text-brand-700 transition-colors"
            >
              {showAll ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  Show less
                </>
              ) : (
                <>
                  Show all {supplier.products.length} products
                  <ChevronDown className="w-4 h-4" />
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Top bar ──────────────────────────────────────────────────────────────────
function TopBar({
  query,
  setQuery,
  cartSize,
  onCartOpen,
}: {
  query: string;
  setQuery: (v: string) => void;
  cartSize: number;
  onCartOpen: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-line">
      <div className="max-w-7xl mx-auto px-8 py-3.5 grid gap-4" style={{ gridTemplateColumns: "auto 1fr auto" }}>

        {/* Left — breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <button className="flex items-center gap-1.5 text-ink-500 hover:text-ink-900 transition-colors font-medium">
            <ArrowLeft className="w-4 h-4" />
            Suppliers
          </button>
          <span className="text-ink-300">/</span>
          <span className="font-semibold text-ink-900">"{query}"</span>
        </div>

        {/* Center — search */}
        <div className="flex items-center justify-center">
          <div className="relative w-full max-w-3xl group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products across all suppliers…"
              className="w-full h-[42px] pl-10 pr-16 rounded-[10px] border border-line bg-surface text-sm text-ink-900 placeholder-ink-400 outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 h-[22px] px-1.5 flex items-center gap-0.5 rounded border border-line bg-ink-50 text-[11px] font-mono text-ink-400 pointer-events-none select-none">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Right — actions */}
        <div className="flex items-center gap-2">
          <button className="w-10 h-10 rounded-[10px] border border-line bg-surface flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-ink-50 transition-all">
            <Sparkles className="w-4 h-4" />
          </button>

          <button
            onClick={onCartOpen}
            className="relative flex items-center gap-2 h-10 px-4 rounded-[10px] bg-brand text-white text-sm font-semibold hover:bg-brand-600 transition-colors"
          >
            <ShoppingCart className="w-4 h-4" />
            Cart
            {cartSize > 0 && (
              <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-white/25 text-white text-[11px] font-bold">
                {cartSize}
              </span>
            )}
          </button>
        </div>

      </div>
    </header>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
type SortKey = "cheapest" | "name";
type ViewKey = "grid" | "list";

export default function SearchPage() {
  const [query, setQuery] = useState("trolley");
  const [cart, setCart] = useState<Set<number>>(new Set());
  const [sort, setSort] = useState<SortKey>("cheapest");
  const [view, setView] = useState<ViewKey>("grid");

  const toggleCart = (id: number) =>
    setCart((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const totalProducts = SUPPLIERS.reduce((n, s) => n + s.products.length, 0);

  // Sort suppliers by their minimum price
  const sortedSuppliers = [...SUPPLIERS].sort((a, b) => {
    if (sort === "cheapest") {
      return Math.min(...a.products.map((p) => p.price)) - Math.min(...b.products.map((p) => p.price));
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="min-h-screen bg-bg">
      <TopBar
        query={query}
        setQuery={setQuery}
        cartSize={cart.size}
        onCartOpen={() => {}}
      />

      {/* Results header */}
      <div className="max-w-7xl mx-auto px-8 pt-7 pb-5">
        <div className="flex items-end justify-between gap-4">
          {/* Left */}
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
              Results for "{query}"
            </h1>
            <p className="text-sm text-ink-500 mt-1">
              <span className="font-semibold text-ink-900">{totalProducts}</span> products across{" "}
              <span className="font-semibold text-ink-900">{SUPPLIERS.length}</span> suppliers
            </p>
          </div>

          {/* Right — chips */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Filter chip */}
            <button className="flex items-center gap-1.5 h-[34px] px-3 rounded-lg border border-line bg-surface text-sm font-medium text-ink-700 hover:bg-ink-50 transition-colors">
              <Filter className="w-3.5 h-3.5" />
              Filter
            </button>

            {/* Sort chips */}
            <button
              onClick={() => setSort("cheapest")}
              className={`flex items-center gap-1.5 h-[34px] px-3 rounded-lg border text-sm font-medium transition-colors ${
                sort === "cheapest"
                  ? "bg-brand-50 text-brand-700 border-brand/30"
                  : "bg-surface border-line text-ink-700 hover:bg-ink-50"
              }`}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              Cheapest first
            </button>

            {/* Divider */}
            <div className="w-px h-5 bg-line-strong" />

            {/* View chips */}
            <button
              onClick={() => setView("grid")}
              className={`w-[34px] h-[34px] rounded-lg border flex items-center justify-center transition-colors ${
                view === "grid"
                  ? "bg-brand-50 text-brand-700 border-brand/30"
                  : "bg-surface border-line text-ink-400 hover:bg-ink-50"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView("list")}
              className={`w-[34px] h-[34px] rounded-lg border flex items-center justify-center transition-colors ${
                view === "list"
                  ? "bg-brand-50 text-brand-700 border-brand/30"
                  : "bg-surface border-line text-ink-400 hover:bg-ink-50"
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Supplier groups */}
      <div className="max-w-7xl mx-auto px-8 pb-16 flex flex-col gap-4">
        {sortedSuppliers.map((supplier) => (
          <SupplierGroup
            key={supplier.id}
            supplier={supplier}
            cart={cart}
            onAdd={toggleCart}
          />
        ))}
      </div>
    </div>
  );
}
