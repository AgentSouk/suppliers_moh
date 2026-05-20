"use client";
import { useGlobalCart } from "@/components/ui/GlobalCartContext";
import ShareCartButton from "@/components/ui/ShareCartButton";

import React, { useState, useEffect, useMemo } from "react";
import { Search, ShoppingCart, Plus, Minus, Trash2, FileText, FileSpreadsheet, X, Check, Loader2, Barcode } from "lucide-react";
import { generatePO } from "@/lib/generatePO";
import CatalogCard from "@/components/catalog/CatalogCard";
import PaginatedGrid from "@/components/catalog/PaginatedGrid";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { useCart } from "@/lib/useCart";

const colors = {
  primary: "#2563eb", primaryHover: "#1d4ed8",
  cardBg: "#ffffff", contentBg: "linear-gradient(135deg, #eef4ff 0%, #f8faff 100%)",
  border: "#e5e7eb", text: "#111827", textMuted: "#6b7280",
  success: "#10b981", danger: "#ef4444",
};

interface Product {
  id?: string; name: string; brand: string;
  price: number | null; photo: string; photo_sm?: string | null; url: string; sku: string | null; ean: string | null; supplier: string;
  category?: string; sub_category?: string;
}

interface CartItem { id: string; product: Product; quantity: number; foc: number; }

function generateOrderNumber() {
  const d = new Date(), pad = (n: number) => String(n).padStart(2, "0");
  return `NAZ-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}


function SearchImagePlaceholder({ name, hidden }: { name: string; hidden: boolean }) {
  if (hidden) return null;
  return (
    <a href={`https://www.google.com/search?udm=2&q=${encodeURIComponent(name)}`} target="_blank" rel="noopener noreferrer"
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-gray-50 to-gray-100 hover:from-blue-50 hover:to-blue-100 transition-colors group">
      <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center group-hover:shadow-md">
        <Search className="w-5 h-5 text-gray-400 group-hover:text-blue-500" />
      </div>
      <span className="text-xs text-gray-400 group-hover:text-blue-500 font-medium">Search image</span>
    </a>
  );
}

export default function NazihCatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
  const { cart, setCart, location, setLocation, orderHistory, cartTotals, addToCart: _addToCart, removeFromCart, updateQuantity, clearCart, saveToHistory, clearHistory } = useCart("nazih");
  const { addItem: addToGlobalCart } = useGlobalCart();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [orderNumber] = useState(generateOrderNumber);
  const [updateMode, setUpdateMode] = useState(false);
  const [hoveredProduct, setHoveredProduct] = useState<Product | null>(null);
  const [pasteConfirm, setPasteConfirm] = useState<{ product: Product; base64: string } | null>(null);
  const [quoteModal, setQuoteModal] = useState(false);
  const [quoteText, setQuoteText] = useState("");
  const [quoteResult, setQuoteResult] = useState<{ matched: number; unmatched: string[] } | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Load products
  useEffect(() => {
    const loc = localStorage.getItem("salon_location") || "Salon";
    setLocation(loc);
    const load = (file: string) =>
      fetch(file).then(r => { if (!r.ok) throw new Error(); return r.json(); });
    load("/nazih_all_products.json")
      .catch(() => load("/nazih_products.json"))
      .then((data: Product[]) => {
        setProducts(data.map((p, i) => ({ ...p, id: p.url || `naz-${i}` })).filter(p => p.photo || p.photo_sm));
        setLoading(false);
      }).catch(() => setLoading(false));
  }, []);

  // Update mode paste
  useEffect(() => {
    if (!updateMode) return;
    const handlePaste = (e: ClipboardEvent) => {
      if (!hoveredProduct || hoveredProduct.photo) return;
      const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith("image/"));
      if (!item) return;
      const file = item.getAsFile(); if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setPasteConfirm({ product: hoveredProduct, base64: reader.result as string });
      reader.readAsDataURL(file);
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [updateMode, hoveredProduct]);

  const brands = useMemo(() => {
    const b = new Set(products.map(p => p.brand).filter(Boolean));
    return Array.from(b).sort();
  }, [products]);

  // Top-level categories derived from data
  const topCategories = useMemo(() => {
    const s = new Set(products.map(p => p.category).filter(Boolean) as string[]);
    return Array.from(s).sort();
  }, [products]);

  // Sub-categories for the selected top category
  const subCategories = useMemo(() => {
    const base = selectedCategory ? products.filter(p => p.category === selectedCategory) : products;
    const s = new Set(base.map(p => p.sub_category).filter(Boolean) as string[]);
    return Array.from(s).sort();
  }, [products, selectedCategory]);

  const filteredProducts = useMemo(() => {
    let f = products;
    if (selectedCategory) f = f.filter(p => p.category === selectedCategory);
    if (selectedSubCategory) f = f.filter(p => p.sub_category === selectedSubCategory);
    if (selectedBrand) f = f.filter(p => p.brand === selectedBrand);
    if (updateMode) f = f.filter(p => !p.photo);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      f = f.filter(p => p.name.toLowerCase().includes(q) || (p.brand||"").toLowerCase().includes(q) || (p.sku||"").toLowerCase().includes(q) || (p.ean||"").includes(q));
    }
    return f;
  }, [products, selectedCategory, selectedSubCategory, selectedBrand, searchQuery, updateMode]);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const ex = prev.find(c => c.product.id === product.id);
      if (ex) return prev.map(c => c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { id: product.id || `naz-${Date.now()}`, product, quantity: 1, foc: 0 }];
    });
    addToGlobalCart({
      uid: (product as any).ean || (product as any).sku || product.id || String(Date.now()),
      supplier: "nazih",
      supplierLabel: "Nazih Group",
      product: {
        name: product.name || "",
        brand: product.brand ?? null,
        price: product.price ?? null,
        photo: product.photo ?? null,
        ean: (product as any).ean ?? null,
        sku: (product as any).sku ?? null,
        aki_code: (product as any).aki_code ?? null,
        sub_category: (product as any).sub_category ?? (product as any).category ?? null,
        uom: (product as any).uom ?? null,
      },
    });
  };

  const inCart = (product: Product) => cart.find(c => c.product.id === product.id);

  // Import quote
  const importQuote = () => {
    const byKey: Record<string, Product> = {};
    products.forEach(p => {
      if (p.sku) byKey[p.sku.trim()] = p;
      if (p.ean) byKey[p.ean.trim()] = p;
    });
    const unmatched: string[] = []; let matched = 0;
    quoteText.split("\n").map(l => l.trim()).filter(Boolean).forEach(line => {
      const parts = line.split(/\t|,|;|\s+/).map(s => s.trim()).filter(Boolean);
      if (parts.length < 2) return;
      const sku = parts[0]; const qty = parseInt(parts[parts.length - 1], 10);
      if (!sku || isNaN(qty) || qty < 1) return;
      const product = byKey[sku];
      if (!product) { unmatched.push(`${sku} (qty ${qty})`); return; }
      setCart(prev => {
        const ex = prev.find(c => c.product.id === product.id);
        if (ex) return prev.map(c => c.product.id === product.id ? { ...c, quantity: c.quantity + qty } : c);
        return [...prev, { id: product.id || sku, product, quantity: qty, foc: 0 }];
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
      const res = await fetch("/api/save-image", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, productId: product.id }) });
      const { url } = await res.json();
      if (url) setProducts(prev => prev.map(p => p.id === product.id ? { ...p, photo: url } : p));
    } catch {}
  };

  // PDF
  const fetchCircleImage = async (photoUrl: string): Promise<string | null> => {
    try {
      const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(photoUrl)}`;
      const resp = await fetch(proxyUrl);
      if (!resp.ok) return null;
      const blob = await resp.blob();
      return new Promise(resolve => {
        const img = new window.Image();
        img.onload = () => {
          const size = Math.min(img.width, img.height);
          const canvas = document.createElement("canvas");
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext("2d")!;
          ctx.beginPath(); ctx.arc(size/2, size/2, size/2, 0, Math.PI*2); ctx.clip();
          ctx.drawImage(img, (img.width-size)/2, (img.height-size)/2, size, size, 0, 0, size, size);
          resolve(canvas.toDataURL("image/jpeg", 0.88));
        };
        img.onerror = () => resolve(null);
        img.src = URL.createObjectURL(blob);
      });
    } catch { return null; }
  };

  const generatePDF = async () => {
    const orderNum = await generatePO({
      cart,
      supplierName: "Nazih Group",
      supplierPrefix: "NZH",
      location,
    });
    saveToHistory(orderNum, cartTotals.totalValue);
  };

  const generateExcel = () => {
    const rows = cart.map(i => ({
      "EAN Barcode": i.product.ean || "", SKU: i.product.sku || "", Brand: i.product.brand, Product: i.product.name,
      Qty: i.quantity, Price: i.product.price || 0, Total: (i.product.price||0)*i.quantity,
      "Photo URL": i.product.photo || "", URL: i.product.url || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 50 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 60 }, { wch: 50 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Nazih Order");
    XLSX.writeFile(wb, `${orderNumber}.xlsx`);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: colors.contentBg }}>
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: colors.contentBg }}>

      {/* Header */}
      <div className="px-6 py-4 bg-white/80 backdrop-blur border-b border-blue-50 shadow-sm sticky top-0 z-40">
        <div className="text-xs mb-2 text-gray-400">
          <a href="/suppliers" className="hover:underline text-blue-500">Suppliers</a>
          <span className="mx-1">›</span><span>Nazih Group</span>
        </div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <img src="https://nazih.ae/media/logo/stores/1/Nazih-Group-Logo.png" alt="Nazih" className="h-6 sm:h-8 object-contain" onError={e => (e.target as HTMLImageElement).style.display='none'} />
            <div>
              <h1 className="text-xs sm:text-lg font-bold text-gray-900">Nazih Catalogue</h1>
              <p className="text-xs text-gray-400">{products.length} products</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Upload Quote */}
            <button onClick={() => { setQuoteModal(true); setQuoteResult(null); setQuoteText(""); }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors">
              <Barcode className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Upload Quote</span>
            </button>
            {/* Update Mode toggle */}
            <button onClick={() => setUpdateMode(v => !v)} className={`flex items-center gap-2 text-sm font-medium ${updateMode ? "text-amber-500" : "text-gray-500"}`}>
              <span className="hidden sm:inline">Update Mode</span>
              <div className={`relative w-11 h-6 rounded-full transition-colors ${updateMode ? "bg-amber-400" : "bg-gray-200"}`}>
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${updateMode ? "translate-x-5" : "translate-x-0"}`} />
              </div>
            </button>
            {/* Cart */}
            <button onClick={() => setIsCartOpen(true)} className="relative flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ background: colors.primary }}>
              <ShoppingCart className="w-4 h-4" /> Cart
              {cart.length > 0 && <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-xs flex items-center justify-center text-white font-bold" style={{ background: colors.danger }}>{cart.length}</span>}
            </button>
          </div>
        </div>
        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="w-full pl-9 pr-4 py-2 border border-blue-100 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Search by name, EAN, SKU…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
      </div>

      {/* Category nav — only shown when data has categories */}
      {topCategories.length > 0 && (
        <div className="bg-white/80 border-b border-blue-50 px-6 py-2">
          {/* Top categories */}
          <div className="flex gap-1.5 overflow-x-auto pb-1.5">
            <button onClick={() => { setSelectedCategory(null); setSelectedSubCategory(null); setSelectedBrand(null); }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${!selectedCategory ? "bg-blue-600 text-white" : "bg-white text-gray-500 border border-blue-100 hover:bg-blue-50"}`}>
              All
            </button>
            {topCategories.map(cat => (
              <button key={cat} onClick={() => { setSelectedCategory(cat); setSelectedSubCategory(null); setSelectedBrand(null); }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${selectedCategory === cat ? "bg-blue-600 text-white" : "bg-white text-gray-500 border border-blue-100 hover:bg-blue-50"}`}>
                {cat}
              </button>
            ))}
          </div>
          {/* Sub-categories */}
          {selectedCategory && subCategories.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pt-1.5">
              <button onClick={() => setSelectedSubCategory(null)}
                className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap transition-all ${!selectedSubCategory ? "bg-blue-100 text-blue-700 font-semibold" : "text-gray-400 hover:text-gray-600"}`}>
                All {selectedCategory}
              </button>
              {subCategories.map(sub => (
                <button key={sub} onClick={() => setSelectedSubCategory(sub)}
                  className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap transition-all ${selectedSubCategory === sub ? "bg-blue-100 text-blue-700 font-semibold" : "text-gray-400 hover:text-gray-600"}`}>
                  {sub}
                </button>
              ))}
            </div>
          )}
          {/* Brand filter — shown below category nav */}
          {brands.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pt-1.5 border-t border-blue-50 mt-1.5">
              <span className="text-[10px] text-gray-400 self-center pr-1 whitespace-nowrap">Brand:</span>
              <button onClick={() => setSelectedBrand(null)}
                className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap transition-all ${!selectedBrand ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-600"}`}>
                All
              </button>
              {brands.map(b => (
                <button key={b} onClick={() => setSelectedBrand(selectedBrand === b ? null : b)}
                  className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap transition-all ${selectedBrand === b ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-600"}`}>
                  {b}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Legacy brand tabs — shown only when no categories in data */}
      {topCategories.length === 0 && (
        <div className="bg-white/80 border-b border-blue-50 px-6 py-2 flex gap-1.5 overflow-x-auto">
          <button onClick={() => setSelectedBrand(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${!selectedBrand ? "bg-blue-600 text-white" : "bg-white text-gray-500 border border-blue-100 hover:bg-blue-50"}`}>
            All
          </button>
          {brands.map(b => (
            <button key={b} onClick={() => setSelectedBrand(b)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${selectedBrand === b ? "bg-blue-600 text-white" : "bg-white text-gray-500 border border-blue-100 hover:bg-blue-50"}`}>
              {b}
            </button>
          ))}
        </div>
      )}

      {/* Product Grid */}
      <div className="p-6">
        <p className="text-xs text-gray-400 mb-4">
          {filteredProducts.length} products
          {selectedCategory ? ` · ${selectedCategory}` : ""}
          {selectedSubCategory ? ` · ${selectedSubCategory}` : ""}
          {selectedBrand ? ` · ${selectedBrand}` : ""}
        </p>
        <PaginatedGrid
          items={filteredProducts}
          resetKey={`${selectedCategory}-${selectedSubCategory}-${selectedBrand}-${searchQuery}`}
          renderItem={(product) => {
            const cartItem = inCart(product);
            const cartQty = cartItem?.quantity ?? 0;
            return (
              <CatalogCard
                key={product.id}
                product={{
                  id: product.id!,
                  name: product.name,
                  brand: product.brand,
                  subLabel: product.sub_category || product.category,
                  price: product.price,
                  photo: product.photo,
                  photo_sm: product.photo_sm,
                  sku: product.sku,
                  ean: product.ean,
                }}
                accentColor={colors.primary}
                cartQty={cartQty}
                onAdd={() => addToCart(product)}
                onInc={() => updateQuantity(cartItem!.id, cartQty + 1)}
                onDec={() => {
                  if (cartQty > 1) updateQuantity(cartItem!.id, cartQty - 1);
                  else removeFromCart(cartItem!.id);
                }}
              />
            );
          }}
        />
      </div>

      {/* Paste Confirm */}
      {pasteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-2xl max-w-sm w-full mx-4 p-5">
            <h3 className="font-bold text-gray-900 mb-1">Use this image?</h3>
            <p className="text-xs text-gray-500 mb-3 truncate">{pasteConfirm.product.name}</p>
            <img src={pasteConfirm.base64} alt="preview" className="w-full h-52 object-contain bg-gray-50 rounded-xl mb-4 border" />
            <div className="flex gap-3">
              <button onClick={() => setPasteConfirm(null)} className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm">Cancel</button>
              <button onClick={confirmPaste} className="flex-1 py-2 rounded-xl bg-amber-400 text-white text-sm font-bold">Save & Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Quote Modal */}
      {quoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-gray-900 text-lg">Upload Quote</h2>
                <p className="text-xs text-gray-400 mt-0.5">Paste SKU + Quantity from Excel</p>
              </div>
              <button onClick={() => { setQuoteModal(false); setQuoteResult(null); }}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            {!quoteResult ? (
              <>
                <textarea className="w-full h-52 border border-gray-200 rounded-xl p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
                  placeholder={"SKU123\t2\nSKU456\t5\n..."} value={quoteText} onChange={e => setQuoteText(e.target.value)} autoFocus />
                <div className="flex gap-3 mt-3">
                  <button onClick={() => setQuoteModal(false)} className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm">Cancel</button>
                  <button onClick={importQuote} disabled={!quoteText.trim()} className="flex-1 py-2 rounded-xl bg-green-500 text-white text-sm font-bold disabled:opacity-40">Import to Cart</button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-3">
                  <p className="text-green-700 font-semibold text-sm">✓ {quoteResult.matched} products added</p>
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
                  <button onClick={() => { setQuoteResult(null); setQuoteText(""); }} className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm">Paste More</button>
                  <button onClick={() => { setQuoteModal(false); setQuoteResult(null); setIsCartOpen(true); }} className="flex-1 py-2 rounded-xl bg-green-500 text-white text-sm font-bold">View Cart →</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Cart Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setIsCartOpen(false)} />
          <div className="relative w-full max-w-lg h-full overflow-y-auto bg-white flex flex-col">
            {/* Cart Header */}
            <div className="sticky top-0 px-6 py-4 flex items-center justify-between bg-white border-b border-gray-100">
              <div className="flex items-center gap-3">
                <ShoppingCart className="w-5 h-5 text-blue-500" />
                <h2 className="text-lg font-bold text-gray-900">Cart · Nazih</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white bg-blue-500">{cart.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowHistory(v => !v)} className="text-xs px-3 py-1 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50">
                  {showHistory ? "← Cart" : "History"}
                </button>
                <button onClick={() => setIsCartOpen(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
            </div>

            {/* History */}
            {showHistory && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-700">Order History</h3>
                  {orderHistory.length > 0 && (
                    <button onClick={() => { if (confirm("Clear all history?")) clearHistory(); }} className="text-xs text-red-400 hover:text-red-600">Clear history</button>
                  )}
                </div>
                {orderHistory.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No orders yet</p> : (
                  <div className="space-y-2">
                    {orderHistory.map((o, i) => (
                      <div key={i} className="p-3 rounded-xl border border-gray-100 bg-gray-50 flex justify-between items-start">
                        <div><p className="text-sm font-bold text-gray-800">{o.orderNum}</p><p className="text-xs text-gray-400">{o.date}</p></div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-blue-600">{o.value.toFixed(2)}</p>
                          <p className="text-xs text-gray-400">{o.items ?? 0} items</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Cart Items */}
            {!showHistory && <div className="p-6 space-y-4 flex-1">
              {cart.length === 0 ? <p className="text-center text-gray-400 py-12">Cart is empty</p> :
                cart.map(item => (
                  <div key={item.id} className="flex gap-4 p-4 rounded-xl border border-gray-100 bg-gray-50">
                    {item.product.photo && <img src={item.product.photo_sm || item.product.photo} alt={item.product.name} className="w-20 h-20 object-contain rounded-lg bg-white" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-blue-500">{item.product.brand}</p>
                      <h4 className="text-sm font-medium text-gray-900 line-clamp-2">{item.product.name}</h4>
                      {item.product.ean && <p className="text-xs text-gray-400">EAN: {item.product.ean}</p>}
                      {item.product.sku && <p className="text-xs text-gray-400">SKU: {item.product.sku}</p>}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-gray-500">Qty:</span>
                        <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="w-7 h-7 rounded border flex items-center justify-center border-gray-200"><Minus className="w-3 h-3" /></button>
                        <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="w-7 h-7 rounded flex items-center justify-center text-white" style={{ background: colors.primary }}><Plus className="w-3 h-3" /></button>
                      </div>
                    </div>
                    <div className="flex flex-col items-end justify-between">
                      <button onClick={() => removeFromCart(item.id)}><Trash2 className="w-4 h-4 text-red-400" /></button>
                      <p className="text-sm font-bold text-blue-600">{((item.product.price||0)*item.quantity).toFixed(2)}</p>
                    </div>
                  </div>
                ))
              }
            </div>}

            {/* Cart Footer */}
            {!showHistory && cart.length > 0 && (
              <div className="sticky bottom-0 p-6 border-t bg-white">
                <div className="flex justify-between text-sm mb-1"><span className="text-gray-500">Total Qty</span><span className="font-semibold">{cartTotals.totalQty}</span></div>
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-100 mb-4"><span>Total</span><span className="text-blue-600">{cartTotals.totalValue.toFixed(2)}</span></div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button onClick={generatePDF} className="flex items-center justify-center gap-1.5 border border-blue-200 text-blue-600 rounded-lg py-2.5 text-sm hover:bg-blue-50">
                    <FileText className="w-4 h-4" /> PDF
                  </button>
                  <button onClick={generateExcel} className="flex items-center justify-center gap-1.5 border border-green-200 text-green-600 rounded-lg py-2.5 text-sm hover:bg-green-50">
                    <FileSpreadsheet className="w-4 h-4" /> Excel
                  </button>
                </div>
                <ShareCartButton cart={cart} location={location} supplierId="nazih" supplierLabel="Nazih Group" />
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
