"use client";
import { useGlobalCart } from "@/components/ui/GlobalCartContext";
import ShareCartButton from "@/components/ui/ShareCartButton";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Download,
  FileText,
  FileSpreadsheet,
  Package,
  ChevronDown,
  ChevronUp,
  X,
  Printer,
  Check,
  Loader2,
  Barcode,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import ImageZoom from "@/components/ui/ImageZoom";
import { generatePO } from "@/lib/generatePO";
import * as XLSX from "xlsx";
import { useCart } from "@/lib/useCart";

// ─── Supabase Client ───────────────────────────────────────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Types ────────────────────────────────────────────────────────
interface Product {
  id: string;
  name: string;
  brand: string | null;
  product_code: string;
  ean: string;
  price: number | null;
  photo: string; photo_sm?: string | null;
  url: string;
  category_id?: string | null;
  sub_category?: string | null;
  aki_code?: string | null;
  uom?: string;
}

interface CartItem {
  id: string;
  quantity: number;
  foc: number;
  product: Product; // matches useCart's CartItem.product: any
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

// ─── Color Palette (matches your CRM screenshot) ────────────────────
const colors = {
  primary: "#2563eb",      // Blue buttons
  primaryHover: "#1d4ed8",
  sidebarBg: "#ffffff",
  sidebarText: "#6b7280",
  sidebarActive: "#eff6ff",
  sidebarActiveText: "#2563eb",
  contentBg: "linear-gradient(135deg, #eef4ff 0%, #f8faff 100%)",
  cardBg: "#ffffff",
  border: "#e5e7eb",
  text: "#111827",
  textMuted: "#6b7280",
  success: "#10b981",
  danger: "#ef4444",
};

// ─── Categories per brand ─────────────────────────────────────────
const BRAND_CATEGORIES: Record<string, Category[]> = {
  "Kerastase": [
    { id: "nutritive", name: "Nutritive", slug: "nutritive" },
    { id: "resistance", name: "Resistance", slug: "resistance" },
    { id: "discipline", name: "Discipline", slug: "discipline" },
    { id: "genesis", name: "Genesis", slug: "genesis" },
    { id: "blond-absolu", name: "Blond Absolu", slug: "blond-absolu" },
    { id: "chronologiste", name: "Chronologiste", slug: "chronologiste" },
    { id: "densifique", name: "Densifique", slug: "densifique" },
    { id: "elixir-ultime", name: "Elixir Ultime", slug: "elixir-ultime" },
    { id: "curl-expression", name: "Curl Expression", slug: "curl-expression" },
    { id: "gloss-absolu", name: "Gloss Absolu", slug: "gloss-absolu" },
  ],
  "L'Oreal Professionnel": [
    { id: "color-technique", name: "Colour / Chemical", slug: "color-technique" },
    { id: "blond-studio", name: "Blond Studio", slug: "blond-studio" },
    { id: "absolut-repair", name: "Absolut Repair / Série Expert", slug: "absolut-repair" },
    { id: "dia-color", name: "Dia Color", slug: "dia-color" },
    { id: "dia-light", name: "Dia Light", slug: "dia-light" },
    { id: "vitamino-color", name: "Vitamino Color", slug: "vitamino-color" },
    { id: "pro-longer", name: "Pro Longer", slug: "pro-longer" },
    { id: "inforcer", name: "Inforcer", slug: "inforcer" },
    { id: "metal-detox", name: "Metal Detox", slug: "metal-detox" },
    { id: "mythic-oil", name: "Mythic Oil", slug: "mythic-oil" },
    { id: "steampod", name: "Steampod", slug: "steampod" },
    { id: "styling", name: "Styling / Tecni.Art", slug: "styling" },
  ],
  "Redken": [
    { id: "acidic-bonding", name: "Acidic Bonding", slug: "acidic-bonding" },
    { id: "all-soft", name: "All Soft", slug: "all-soft" },
    { id: "color-extend", name: "Color Extend", slug: "color-extend" },
    { id: "extreme", name: "Extreme", slug: "extreme" },
    { id: "frizz-dismiss", name: "Frizz Dismiss", slug: "frizz-dismiss" },
  ],
  "Essie": [
    { id: "Nail Polish", name: "Nail Polish", slug: "Nail Polish" },
    { id: "Gel Couture", name: "Gel Couture", slug: "Gel Couture" },
    { id: "Expressie", name: "Expressie", slug: "Expressie" },
    { id: "Base & Top Coats", name: "Base & Top Coats", slug: "Base & Top Coats" },
    { id: "Top Coats", name: "Top Coats", slug: "Top Coats" },
    { id: "Nail Care", name: "Nail Care", slug: "Nail Care" },
  ],
};

const DEFAULT_CATEGORIES: Category[] = Object.values(BRAND_CATEGORIES).flat();

// ─── Helper: Detect category from product name ────────────────────
function detectCategory(name: string): string {
  const lower = name.toLowerCase();
  // Kerastase
  if (lower.includes("nutritive") || lower.includes("bain satin") || lower.includes("8hr magic")) return "nutritive";
  if (lower.includes("resistance") || lower.includes("therapiste")) return "resistance";
  if (lower.includes("discipline")) return "discipline";
  if (lower.includes("genesis")) return "genesis";
  if (lower.includes("blond absolu") || lower.includes("blond bain")) return "blond-absolu";
  if (lower.includes("chronologiste")) return "chronologiste";
  if (lower.includes("densifique")) return "densifique";
  if (lower.includes("elixir ultime")) return "elixir-ultime";
  if (lower.includes("curl expression")) return "curl-expression";
  if (lower.includes("gloss absolu")) return "gloss-absolu";
  // L'Oreal Professionnel — colour / chemical
  if (lower.includes("majirel") || lower.includes("maji ") || lower.includes("maji booster") || lower.includes("majiblond")) return "color-technique";
  if (lower.includes("inoa")) return "color-technique";
  if (lower.includes("dia color") || lower.includes("dia activateur") || lower.includes("dia activator") || lower.includes("luocolor") || lower.includes("luo color") || lower.includes("oreor")) return "color-technique";
  if (lower.includes("oxydant") || lower.includes("developer") || lower.includes("activateur") || lower.includes("efassor")) return "color-technique";
  if (lower.includes("blond studio") || lower.includes("blonde studio") || lower.includes("blondifier") || lower.includes("blond toning")) return "blond-studio";
  if (lower.includes("dia light") || lower.includes("dialight")) return "dia-light";
  // L'Oreal Professionnel — care
  if (lower.includes("absolut repair") || lower.includes("se arm") || lower.includes("abs rep") || lower.includes("serie expert arm")) return "absolut-repair";
  if (lower.includes("vitamino")) return "vitamino-color";
  if (lower.includes("pro longer") || lower.includes("prolonquer")) return "pro-longer";
  if (lower.includes("inforcer")) return "inforcer";
  if (lower.includes("metal detox") || lower.includes("metal d")) return "metal-detox";
  if (lower.includes("mythic oil")) return "mythic-oil";
  if (lower.includes("steampod")) return "steampod";
  if (lower.includes("x-tenso") || lower.includes("xtenso")) return "styling";
  if (lower.includes("tecni") || lower.includes("elnett") || lower.includes("infinium") || lower.includes("hairspray")) return "styling";
  if (lower.includes("serie expert") || lower.includes("serie exp") || lower.includes(" se ") || lower.includes("hair spa")) return "absolut-repair";
  // Redken
  if (lower.includes("acidic bonding")) return "acidic-bonding";
  if (lower.includes("all soft")) return "all-soft";
  if (lower.includes("color extend")) return "color-extend";
  if (lower.includes("extreme")) return "extreme";
  if (lower.includes("frizz dismiss")) return "frizz-dismiss";
  return "uncategorized";
}

// ─── Helper: Generate AKI Code from product code ──────────────────
function generateAKICode(productCode: string): string {
  // Extract the GB prefix and numeric part
  const clean = productCode.replace(/^GB/, "");
  return `LOP-${clean.slice(-5)}-0`;
}

// ─── Helper: Extract sub-category ─────────────────────────────────
function extractSubCategory(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("shampoo")) return "Shampoo";
  if (lower.includes("conditioner")) return "Conditioner";
  if (lower.includes("mask") || lower.includes("masque")) return "Mask";
  if (lower.includes("serum")) return "Serum";
  if (lower.includes("oil")) return "Oil";
  if (lower.includes("spray")) return "Spray";
  if (lower.includes("mousse")) return "Mousse";
  if (lower.includes("cream")) return "Cream";
  if (lower.includes("gel")) return "Gel";
  if (lower.includes("powder")) return "Powder";
  if (lower.includes("developer") || lower.includes("oxydant")) return "Developer";
  if (lower.includes("color") || lower.includes("light")) return "Color";
  return "Other";
}

// ─── Main Component ───────────────────────────────────────────────

function SearchImagePlaceholder({ name, hidden }: { name: string; hidden: boolean }) {
  if (hidden) return null;
  return (
    <a
      href={`https://www.google.com/search?udm=2&q=${encodeURIComponent(name)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-gray-50 to-gray-100 hover:from-blue-50 hover:to-blue-100 transition-colors group"
    >
      <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center group-hover:shadow-md transition-shadow">
        <Search className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
      </div>
      <span className="text-xs text-gray-400 group-hover:text-blue-500 font-medium">Search image</span>
    </a>
  );
}

export default function LorealCatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const { cart: _cart, setCart: _setCart, location, setLocation, orderHistory, cartTotals, removeFromCart, updateQuantity, updateFOC, clearCart, saveToHistory, clearHistory } = useCart("loreal");
  const { addItem: addToGlobalCart } = useGlobalCart();
  const cart = _cart as CartItem[];
  const setCart = _setCart as React.Dispatch<React.SetStateAction<CartItem[]>>;
  const [categories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [updateMode, setUpdateMode] = useState(false);
  const [hoveredProduct, setHoveredProduct] = useState<Product | null>(null);
  const [pasteConfirm, setPasteConfirm] = useState<{ product: Product; base64: string } | null>(null);
  const [quoteModal, setQuoteModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [quoteText, setQuoteText] = useState("");
  const [quoteResult, setQuoteResult] = useState<{ matched: number; unmatched: string[] } | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // ─── Load Products from JSON (in real app, fetch from Supabase) ─
  useEffect(() => {
    async function loadProducts() {
      try {
        // In production, fetch from Supabase:
        // const { data, error } = await supabase.from("loreal_products").select("*");
        // For now, we'll simulate by importing the JSON
        const res = await fetch("/loreal_products.json");
        const data = await res.json();

        const mapped: Product[] = data.map((item: any, idx: number) => ({
          id: item.id || item.ean || String(idx),
          name: item.name,
          brand: item.brand || "L'Oreal Professionnel",
          product_code: item.product_code || item.ean || "",
          ean: item.ean || "",
          price: item.price || null,
          photo: item.photo || "",
          url: item.url || "",
          sub_category: item.sub_category || "",
          aki_code: item.aki_code || "",
          uom: item.uom || "EA",
        })).filter((p: Product) => p.photo || p.photo_sm);

        setProducts(mapped);
      } catch (err) {
        console.error("Failed to load products:", err);
      } finally {
        setLoading(false);
      }
    }
    loadProducts();
  }, []);


  // ─── Update Mode: Ctrl+V paste onto hovered product ─────────────
  useEffect(() => {
    if (!updateMode) return;
    const handlePaste = (e: ClipboardEvent) => {
      if (!hoveredProduct || hoveredProduct.photo) return;
      const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith("image/"));
      if (!item) return;
      const file = item.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        setPasteConfirm({ product: hoveredProduct, base64: reader.result as string });
      };
      reader.readAsDataURL(file);
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [updateMode, hoveredProduct]);

  // ─── Local Cart (testing mode — no auth required) ───────────────
  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) {
        return prev.map((c) =>
          c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { id: product.id, quantity: 1, foc: 0, product }];
    });
    addToGlobalCart({
      uid: product.ean || product.aki_code || product.id || String(Date.now()),
      supplier: "loreal",
      supplierLabel: "L'Oréal Professionnel",
      product: {
        name: product.name || "",
        brand: product.brand ?? null,
        price: product.price ?? null,
        photo: product.photo ?? null,
        ean: product.ean ?? null,
        sku: product.product_code ?? null,
        aki_code: product.aki_code ?? null,
        sub_category: product.sub_category ?? null,
        uom: product.uom ?? null,
      },
    });
  };


  const importQuote = () => {
    const byKey: Record<string, Product> = {};
    products.forEach((p) => {
      if (p.ean) byKey[p.ean.trim()] = p;
      if (p.product_code) byKey[p.product_code.trim()] = p;
      if (p.aki_code) byKey[p.aki_code.trim()] = p;
    });

    const unmatched: string[] = [];
    let matched = 0;

    const lines = quoteText.split("\n").map((l) => l.trim()).filter(Boolean);
    lines.forEach((line) => {
      const parts = line.split(/\t|,|;|\s+/).map((s) => s.trim()).filter(Boolean);
      if (parts.length < 2) return;
      const barcode = parts[0];
      const qty = parseInt(parts[parts.length - 1], 10);
      if (!barcode || isNaN(qty) || qty < 1) return;

      const product = byKey[barcode];
      if (!product) {
        unmatched.push(`${parts[0]} (qty ${qty})`);
        return;
      }

      setCart((prev) => {
        const existing = prev.find((c) => c.product.id === product.id);
        if (existing) {
          return prev.map((c) => c.product.id === product.id ? { ...c, quantity: c.quantity + qty } : c);
        }
        return [...prev, { id: product.id, quantity: qty, foc: 0, product }];
      });
      matched++;
    });

    setQuoteResult({ matched, unmatched });
    setQuoteText("");
  };

  const confirmPaste = async () => {
    if (!pasteConfirm) return;
    const { product, base64 } = pasteConfirm;
    setPasteConfirm(null);
    try {
      const res = await fetch("/api/save-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, productId: product.id }),
      });
      const { url } = await res.json();
      if (url) {
        setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, photo: url } : p));
      }
    } catch { /* silent */ }
  };

  // ─── Login ────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setSaving(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
      if (error) { setLoginError(error.message); return; }
      setShowLoginModal(false);
      setLoginEmail("");
      setLoginPassword("");
    } catch {
      setLoginError("Login failed");
    } finally {
      setSaving(false);
    }
  };

  // ─── Filter Products ──────────────────────────────────────────────
  const KNOWN_BRANDS = ["Kerastase", "L'Oreal Professionnel", "Redken", "Essie"];

  const availableBrands = useMemo(() => {
    const brands = [...new Set(products.map((p) => p.brand).filter(Boolean))] as string[];
    return brands.filter((b) => KNOWN_BRANDS.includes(b)).sort();
  }, [products]);

  const visibleCategories = useMemo(() => {
    if (!selectedBrand) return [];
    return BRAND_CATEGORIES[selectedBrand] || [];
  }, [selectedBrand]);

  const filteredProducts = useMemo(() => {
    let filtered = products;

    if (selectedBrand) {
      filtered = filtered.filter((p) => p.brand === selectedBrand);
    }

    if (updateMode) {
      filtered = filtered.filter((p) => !p.photo);
    }

    if (selectedCategory) {
      filtered = filtered.filter((p) =>
        p.brand === "Essie"
          ? (p.sub_category || "") === selectedCategory
          : detectCategory(p.name) === selectedCategory
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.ean && p.ean.includes(q)) ||
          p.product_code.toLowerCase().includes(q) ||
          (p.aki_code && p.aki_code.toLowerCase().includes(q))
      );
    }

    return filtered;
  }, [products, searchQuery, selectedCategory, selectedBrand, updateMode]);


  // ─── Generate Order Number ──────────────────────────────────────
  const generateOrderNumber = () => {
    const date = new Date();
    const prefix = "LOP";
    const suffix = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}-${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}`;
    return `${prefix}-${suffix}`;
  };

  // Shade products get palette treatment
  const COLOUR_KW = ["majirel","dia color","dia light","dia richesse","dia richesse","luocolor","luo color","inoa","loreal pro inoa","loreal professional inoa"];
  const isColour = (name: string) => COLOUR_KW.some((k) => name.toLowerCase().includes(k));

  // Extract shade number e.g. "7.11" or "4.0" from product name
  const extractShade = (name: string): string => {
    const m = name.match(/\b(\d{1,2}(?:\.\d{1,3})?)\b/g);
    if (!m) return "";
    // skip sizes like 50, 60, 90, 100, 150, 200, 300, 500, 1000, 1500
    const sizes = new Set(["50","60","90","100","150","200","300","500","1000","1500"]);
    return m.find((n) => !sizes.has(n)) || "";
  };

  // ─── Fetch image → circular base64 via canvas ────────────────────
  const fetchCircleImage = async (photoUrl: string): Promise<string | null> => {
    try {
      const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(photoUrl)}`;
      const resp = await fetch(proxyUrl);
      if (!resp.ok) return null;
      const blob = await resp.blob();
      return new Promise((resolve) => {
        const img = new window.Image();
        img.onload = () => {
          const size = Math.min(img.width, img.height);
          const canvas = document.createElement("canvas");
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext("2d")!;
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
          ctx.clip();
          const ox = (img.width - size) / 2;
          const oy = (img.height - size) / 2;
          ctx.drawImage(img, ox, oy, size, size, 0, 0, size, size);
          resolve(canvas.toDataURL("image/jpeg", 0.88));
        };
        img.onerror = () => resolve(null);
        img.src = URL.createObjectURL(blob);
      });
    } catch { return null; }
  };

  // ─── Generate PO PDF ─────────────────────────────────────────────
  const generatePDF = async () => {
    const orderNum = await generatePO({
      cart,
      supplierName: "L'Oréal Professionnel",
      supplierPrefix: "LOP",
      location,
      isColourProduct: (name) =>
        ["majirel","dia color","dia light","dia richesse","luocolor","luo color","inoa"]
          .some((k) => name.toLowerCase().includes(k)),
    });
    setOrderNumber(orderNum);
    saveToHistory(orderNum, cartTotals.totalValue);
  };

  // ─── Generate Excel ─────────────────────────────────────────────
  const generateExcel = () => {
    const orderNum = orderNumber || generateOrderNumber();
    if (!orderNumber) setOrderNumber(orderNum);
    const rows = cart.map((item) => ({
      Barcode: item.product.ean || item.product.aki_code || "",
      "AKI Code": item.product.aki_code || "",
      Product: item.product.name,
      Category: item.product.sub_category || "",
      Brand: item.product.brand || "",
      Qty: item.quantity,
      FOC: item.foc,
      UOM: item.product.uom || "EA",
      Price: item.product.price ? item.product.price.toFixed(2) : "",
      Total: item.product.price ? (item.product.price * item.quantity).toFixed(2) : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Order");
    XLSX.writeFile(wb, `PO-${orderNum}.xlsx`);
  };

  // ─── Submit Order (testing mode — generates docs only) ──────────
  const submitOrder = async () => {
    if (cart.length === 0) { alert("Cart is empty!"); return; }
    const orderNum = generateOrderNumber();
    setOrderNumber(orderNum);
    await generatePDF();
    generateExcel();
    clearCart();
    setIsCartOpen(false);
    alert(`Order ${orderNum} — PDF & Excel generated!`);
  };

  // ─── Render ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: colors.contentBg }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: colors.primary }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: colors.contentBg }}>
      {/* Breadcrumb */}
      <div className="px-6 pt-3 pb-1 text-xs" style={{ background: colors.cardBg, color: colors.textMuted }}>
        <a href="/suppliers" className="hover:underline" style={{ color: colors.primary }}>Suppliers</a>
        <span className="mx-1">›</span>
        <span>L&apos;Oréal Professionnel</span>
      </div>

      {/* Header */}
      <div className="px-4 py-3 sticky top-0 z-40" style={{ background: colors.cardBg, borderBottom: `1px solid ${colors.border}` }}>
        {/* Row 1: title + action buttons */}
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-base font-bold truncate" style={{ color: colors.text }}>
            L&apos;Oréal Catalogue
          </h1>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => { setQuoteModal(true); setQuoteResult(null); setQuoteText(""); }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Barcode className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Upload Quote</span>
            </button>

            <button
              onClick={() => setUpdateMode((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium"
              style={{ color: updateMode ? "#f59e0b" : colors.textMuted }}
            >
              <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${updateMode ? "bg-amber-400" : "bg-gray-200"}`}>
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${updateMode ? "translate-x-4" : "translate-x-0"}`} />
              </div>
            </button>

            <button
              onClick={() => setIsCartOpen(true)}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white font-medium text-sm transition-colors"
              style={{ background: colors.primary }}
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">Cart</span>
              {cart.length > 0 && (
                <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-xs flex items-center justify-center text-white font-bold"
                  style={{ background: colors.danger }}>
                  {cart.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Row 2: Search + category select */}
        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: colors.textMuted }} />
            <input
              type="text"
              placeholder="Search name, EAN, code…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border text-sm outline-none focus:ring-2"
              style={{ background: colors.cardBg, borderColor: colors.border, color: colors.text }}
            />
          </div>
          <select
            value={selectedCategory || ""}
            onChange={(e) => setSelectedCategory(e.target.value || null)}
            className="w-full sm:w-auto px-3 py-2 rounded-lg border text-sm outline-none"
            style={{ background: colors.cardBg, borderColor: colors.border, color: colors.text }}
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Brand Tabs */}
      <div className="px-4 pt-2 flex gap-1 overflow-x-auto border-b scrollbar-hide" style={{ borderColor: colors.border, background: colors.cardBg }}>
        <button
          onClick={() => { setSelectedBrand(null); setSelectedCategory(null); }}
          className="px-4 py-2 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0"
          style={{
            borderColor: selectedBrand === null ? colors.primary : "transparent",
            color: selectedBrand === null ? colors.primary : colors.textMuted,
          }}
        >
          All Brands
        </button>
        {availableBrands.map((brand) => (
          <button
            key={brand}
            onClick={() => { setSelectedBrand(brand); setSelectedCategory(null); }}
            className="px-4 py-2 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0"
            style={{
              borderColor: selectedBrand === brand ? colors.primary : "transparent",
              color: selectedBrand === brand ? colors.primary : colors.textMuted,
            }}
          >
            {brand}
          </button>
        ))}
      </div>

      {/* Category Pills — only when a brand is selected */}
      {visibleCategories.length > 0 && (
        <div className="px-4 py-2 flex gap-1.5 flex-wrap" style={{ background: colors.sidebarActive }}>
          <button
            onClick={() => setSelectedCategory(null)}
            className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
            style={{
              background: selectedCategory === null ? colors.primary : colors.cardBg,
              color: selectedCategory === null ? "white" : colors.textMuted,
              border: `1px solid ${selectedCategory === null ? colors.primary : colors.border}`,
            }}
          >
            All
          </button>
          {visibleCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id === selectedCategory ? null : cat.id)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={{
                background: selectedCategory === cat.id ? colors.primary : colors.cardBg,
                color: selectedCategory === cat.id ? "white" : colors.textMuted,
                border: `1px solid ${selectedCategory === cat.id ? colors.primary : colors.border}`,
              }}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Products Grid */}
      <div className="px-3 pb-6 pt-3">
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredProducts.map((product) => {
            const inCart = cart.find((c) => c.product.id === product.id);

            return (
              <div
                key={product.id}
                className="rounded-xl border overflow-hidden transition-shadow hover:shadow-md"
                style={{ background: colors.cardBg, borderColor: colors.border }}
              >
                {/* Image */}
                <div
                  className={`relative h-48 bg-gray-50 flex items-center justify-center overflow-hidden transition-all ${
                    updateMode && !product.photo ? "ring-2 ring-amber-400 ring-offset-1" : ""
                  }`}
                  onMouseEnter={() => updateMode && setHoveredProduct(product)}
                  onMouseLeave={() => updateMode && setHoveredProduct(null)}
                >
                  {product.photo ? (
                    <ImageZoom
                      src={product.photo_sm || product.photo}
                      alt={product.name}
                      imgClassName="w-full h-full object-contain p-4"
                    />
                  ) : null}
                  <SearchImagePlaceholder name={product.name} hidden={!!product.photo} />
                  {updateMode && !product.photo && hoveredProduct?.id === product.id && (
                    <div className="absolute inset-0 bg-amber-400/20 flex flex-col items-center justify-center gap-1 pointer-events-none">
                      <span className="text-2xl">📋</span>
                      <span className="text-xs font-bold text-amber-700 bg-white/80 px-2 py-0.5 rounded">Ctrl+V to paste</span>
                    </div>
                  )}
                  {inCart && (
                    <div className="absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-bold text-white"
                      style={{ background: colors.success }}>
                      <Check className="w-3 h-3 inline mr-1" />
                      {inCart.quantity} in cart
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide mb-0.5 truncate"
                    style={{ color: colors.primary }}>
                    {product.sub_category}
                  </p>
                  <h3 className="text-xs font-semibold leading-tight line-clamp-2 mb-2" style={{ color: colors.text }}>
                    {product.name}
                  </h3>

                  <div className="space-y-0.5 mb-2">
                    {product.ean && <p className="text-[10px] font-mono truncate" style={{ color: colors.textMuted }}>{product.ean}</p>}
                    {product.product_code && <p className="text-[10px] truncate" style={{ color: colors.textMuted }}>{product.product_code}</p>}
                  </div>

                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-bold" style={{ color: colors.primary }}>
                      {product.price ? product.price.toFixed(2) : <span className="text-[10px] text-gray-400">POA</span>}
                    </span>

                    {inCart ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateQuantity(inCart.id, inCart.quantity - 1)}
                          className="w-6 h-6 rounded flex items-center justify-center border"
                          style={{ borderColor: colors.border }}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-5 text-center text-sm font-semibold">{inCart.quantity}</span>
                        <button
                          onClick={() => updateQuantity(inCart.id, inCart.quantity + 1)}
                          className="w-6 h-6 rounded flex items-center justify-center text-white"
                          style={{ background: colors.primary }}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(product)}
                        disabled={saving}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-white text-xs font-medium transition-colors disabled:opacity-50"
                        style={{ background: colors.primary }}
                      >
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                        Add
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredProducts.length > 0 && (
          <p className="text-xs mb-3" style={{ color: colors.textMuted }}>
            Showing {filteredProducts.length} product{filteredProducts.length !== 1 ? "s" : ""}
            {selectedBrand ? ` · ${selectedBrand}` : ""}
          </p>
        )}

        {filteredProducts.length === 0 && (
          <div className="text-center py-20">
            <Package className="w-12 h-12 mx-auto mb-4" style={{ color: colors.textMuted }} />
            <p className="text-lg font-medium" style={{ color: colors.textMuted }}>
              No products found
            </p>
            <p className="text-sm mt-1" style={{ color: colors.textMuted }}>
              Try adjusting your search or category filter
            </p>
          </div>
        )}
      </div>

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold" style={{ color: colors.text }}>Sign in to continue</h2>
              <button onClick={() => setShowLoginModal(false)} className="p-1.5 rounded-full hover:bg-gray-100">
                <X className="w-5 h-5" style={{ color: colors.textMuted }} />
              </button>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textMuted }}>Email</label>
                <input
                  type="email" required value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none focus:ring-2"
                  style={{ borderColor: colors.border, color: colors.text }}
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textMuted }}>Password</label>
                <input
                  type="password" required value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none focus:ring-2"
                  style={{ borderColor: colors.border, color: colors.text }}
                  placeholder="••••••••"
                />
              </div>
              {loginError && <p className="text-xs" style={{ color: colors.danger }}>{loginError}</p>}
              <button
                type="submit" disabled={saving}
                className="w-full py-2.5 rounded-lg text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: colors.primary }}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign In"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Upload Quote Modal */}
      {quoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-gray-900 text-lg">Upload Quote</h2>
                <p className="text-xs text-gray-400 mt-0.5">Copy 2 columns from Excel: EA Barcode + Quantity, then paste below</p>
              </div>
              <button onClick={() => { setQuoteModal(false); setQuoteResult(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {!quoteResult ? (
              <>
                <textarea
                  className="w-full h-52 border border-gray-200 rounded-xl p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
                  placeholder={"3474637155025\t2\n3474636977369\t5\n30167476\t1\n..."}
                  value={quoteText}
                  onChange={(e) => setQuoteText(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-3 mt-3">
                  <button onClick={() => setQuoteModal(false)} className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">
                    Cancel
                  </button>
                  <button
                    onClick={importQuote}
                    disabled={!quoteText.trim()}
                    className="flex-1 py-2 rounded-xl bg-green-500 text-white text-sm font-bold hover:bg-green-600 disabled:opacity-40"
                  >
                    Import to Cart
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-3">
                  <p className="text-green-700 font-semibold text-sm">✓ {quoteResult.matched} product{quoteResult.matched !== 1 ? "s" : ""} added to cart</p>
                </div>
                {quoteResult.unmatched.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-3">
                    <p className="text-red-700 font-semibold text-sm mb-2">✗ {quoteResult.unmatched.length} not found:</p>
                    <ul className="text-xs text-red-600 space-y-0.5 max-h-32 overflow-y-auto">
                      {quoteResult.unmatched.map((u, i) => <li key={i}>{u}</li>)}
                    </ul>
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={() => { setQuoteResult(null); setQuoteText(""); }} className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">
                    Paste More
                  </button>
                  <button
                    onClick={() => { setQuoteModal(false); setQuoteResult(null); setIsCartOpen(true); }}
                    className="flex-1 py-2 rounded-xl bg-green-500 text-white text-sm font-bold hover:bg-green-600"
                  >
                    View Cart →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Paste Confirmation Modal */}
      {pasteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-5">
            <h3 className="font-bold text-gray-900 mb-1">Use this image?</h3>
            <p className="text-xs text-gray-500 mb-3 truncate">{pasteConfirm.product.name}</p>
            <img
              src={pasteConfirm.base64}
              alt="preview"
              className="w-full h-52 object-contain bg-gray-50 rounded-xl mb-4 border border-gray-100"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setPasteConfirm(null)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmPaste}
                className="flex-1 py-2 rounded-xl bg-amber-400 text-white text-sm font-bold hover:bg-amber-500"
              >
                Save & Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cart Slide-over */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setIsCartOpen(false)} />
          <div className="relative w-full max-w-lg h-full overflow-y-auto"
            style={{ background: colors.cardBg }}>

            {/* Cart Header */}
            <div className="sticky top-0 px-6 py-4 flex items-center justify-between"
              style={{ background: colors.cardBg, borderBottom: `1px solid ${colors.border}` }}>
              <div className="flex items-center gap-3">
                <ShoppingCart className="w-5 h-5" style={{ color: colors.primary }} />
                <h2 className="text-lg font-bold" style={{ color: colors.text }}>Your Cart</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white"
                  style={{ background: colors.primary }}>
                  {cart.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowHistory((v) => !v)} className="text-xs px-3 py-1 rounded-full border hover:bg-gray-50" style={{ borderColor: colors.border, color: colors.textMuted }}>
                  {showHistory ? "← Cart" : "History"}
                </button>
                <button onClick={() => setIsCartOpen(false)} className="p-2 rounded-lg hover:bg-gray-100">
                  <X className="w-5 h-5" style={{ color: colors.textMuted }} />
                </button>
              </div>
            </div>

            {/* Order History */}
            {showHistory && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-700">Order History</h3>
                  {orderHistory.length > 0 && (
                    <button onClick={() => { if (confirm("Clear all history?")) clearHistory(); }} className="text-xs text-red-400 hover:text-red-600">Clear history</button>
                  )}
                </div>
                {orderHistory.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No orders yet — generate a PDF to record an order.</p>
                ) : (
                  <div className="space-y-2">
                    {orderHistory.map((o, i) => (
                      <div key={i} className="p-3 rounded-xl border border-gray-100 bg-gray-50">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-sm font-bold text-gray-800">{o.orderNum}</p>
                            <p className="text-xs text-gray-400">{o.date}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-blue-600">{o.value.toFixed(2)}</p>
                            <p className="text-xs text-gray-400">{o.items ?? 0} item{(o.items ?? 0) !== 1 ? "s" : ""}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Cart Items */}
            {!showHistory && <div className="p-6 space-y-4">
              {cart.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingCart className="w-12 h-12 mx-auto mb-4" style={{ color: colors.textMuted }} />
                  <p style={{ color: colors.textMuted }}>Your cart is empty</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.id} className="flex gap-4 p-4 rounded-xl border"
                    style={{ borderColor: colors.border, background: colors.contentBg }}>

                    <img
                      src={item.product.photo}
                      alt={item.product.name}
                      className="w-20 h-20 object-contain rounded-lg bg-white"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23f3f4f6'/%3E%3C/svg%3E";
                      }}
                    />

                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold line-clamp-2" style={{ color: colors.text }}>
                        {item.product.name}
                      </h4>
                      <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
                        EAN: {item.product.ean}
                      </p>

                      <div className="flex items-center gap-4 mt-3">
                        {/* Quantity */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium" style={{ color: colors.textMuted }}>Qty:</span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="w-7 h-7 rounded border flex items-center justify-center"
                            style={{ borderColor: colors.border }}
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="w-7 h-7 rounded flex items-center justify-center text-white"
                            style={{ background: colors.primary }}
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                      </div>
                    </div>

                    <div className="flex flex-col items-end justify-between">
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" style={{ color: colors.danger }} />
                      </button>
                      <div className="text-right">
                        <p className="text-sm font-bold" style={{ color: colors.primary }}>
                          {((item.product.price || 0) * item.quantity).toFixed(2)}
                        </p>
                        {item.foc > 0 && (
                          <p className="text-xs" style={{ color: colors.success }}>
                            +{item.foc} FOC
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>}

            {/* Cart Footer */}
            {!showHistory && cart.length > 0 && (
              <div className="sticky bottom-0 p-6 border-t"
                style={{ background: colors.cardBg, borderColor: colors.border }}>

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span style={{ color: colors.textMuted }}>Total Quantity</span>
                    <span className="font-semibold">{cartTotals.totalQty}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold pt-2 border-t"
                    style={{ borderColor: colors.border, color: colors.text }}>
                    <span>Total Value</span>
                    <span style={{ color: colors.primary }}>{cartTotals.totalValue.toFixed(2)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    onClick={generatePDF}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors"
                    style={{ borderColor: colors.primary, color: colors.primary }}
                  >
                    <FileText className="w-4 h-4" />
                    PDF
                  </button>
                  <button
                    onClick={generateExcel}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors"
                    style={{ borderColor: colors.success, color: colors.success }}
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Excel
                  </button>
                </div>

                {/* Link Generator */}
                <ShareCartButton cart={cart} location={location} supplierId="loreal" supplierLabel="L'Oréal Professionnel" />

                <button
                  onClick={() => { if (confirm("Clear entire cart?")) clearCart(); }}
                  className="w-full mt-3 py-2 rounded-lg border border-red-200 text-red-500 text-sm hover:bg-red-50 flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" /> Clear Cart
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
