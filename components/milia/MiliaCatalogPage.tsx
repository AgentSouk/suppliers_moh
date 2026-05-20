"use client";
import { useGlobalCart } from "@/components/ui/GlobalCartContext";
import ShareCartButton from "@/components/ui/ShareCartButton";
import UploadQuoteButton from "@/components/ui/UploadQuoteButton";

import React, { useState, useEffect, useMemo } from "react";
import { Search, ShoppingCart, Plus, Minus, Trash2, FileText, FileSpreadsheet, X } from "lucide-react";
import { generatePO } from "@/lib/generatePO";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { useCart } from "@/lib/useCart";
import CatalogCard from "@/components/catalog/CatalogCard";
import PaginatedGrid from "@/components/catalog/PaginatedGrid";

const colors = {
  primary: "#0d9488", primaryHover: "#0f766e",
  cardBg: "#ffffff", contentBg: "linear-gradient(135deg, #f0fdfa 0%, #f8faff 100%)",
  border: "#e5e7eb", text: "#111827", textMuted: "#6b7280",
  success: "#10b981", danger: "#ef4444",
};

interface Product {
  id?: string; name: string; brand: string;
  sku: string | null; ean: string | null;
  price: number | null; currency?: string;
  photo: string | null; photo_sm?: string | null; images?: string[]; description?: string | null;
  category?: string; tags?: string[]; available?: boolean;
  url: string; supplier: string;
}

function generateOrderNumber() {
  const d = new Date(), pad = (n: number) => String(n).padStart(2, "0");
  return `ML-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}


export default function MiliaCatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

  const { cart, setCart, location, setLocation, orderHistory, cartTotals,
    removeFromCart, updateQuantity, clearCart, saveToHistory, clearHistory } = useCart("milia");
  const { addItem: addToGlobalCart } = useGlobalCart();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [orderNumber] = useState(generateOrderNumber);

  useEffect(() => {
    const loc = localStorage.getItem("salon_location") || "Salon";
    setLocation(loc);
    fetch("/milia_products.json")
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: Product[]) => {
        setProducts(data.map((p, i) => ({ ...p, id: p.id || p.sku || `ml-${i}` })).filter(p => p.photo || p.photo_sm));
        setLoading(false);
      }).catch(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const s = new Set(products.map(p => p.category).filter(Boolean) as string[]);
    return Array.from(s).sort();
  }, [products]);

  const brands = useMemo(() => {
    const base = selectedCategory ? products.filter(p => p.category === selectedCategory) : products;
    const s = new Set(base.map(p => p.brand).filter(Boolean) as string[]);
    return Array.from(s).sort();
  }, [products, selectedCategory]);

  const filteredProducts = useMemo(() => {
    let f = products;
    if (selectedCategory) f = f.filter(p => p.category === selectedCategory);
    if (selectedBrand) f = f.filter(p => p.brand === selectedBrand);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      f = f.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.sku || "").toLowerCase().includes(q) ||
        (p.brand || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q)
      );
    }
    return f;
  }, [products, selectedCategory, selectedBrand, searchQuery]);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const ex = prev.find(c => c.product.id === product.id);
      if (ex) return prev.map(c => c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { id: product.id!, product, quantity: 1, foc: 0 }];
    });
    addToGlobalCart({
      uid: (product as any).ean || (product as any).sku || product.id || String(Date.now()),
      supplier: "milia",
      supplierLabel: "Milia Cosmetics",
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

  const generatePDF = async () => {
    const orderNum = await generatePO({
      cart,
      supplierName: "Milia Cosmetics",
      supplierPrefix: "MLI",
      location,
    });
    saveToHistory(orderNum, cartTotals.totalValue);
  };

  const generateExcel = () => {
    const rows = cart.map(i => ({
      "SKU": (i.product as Product).sku || "",
      Brand: (i.product as Product).brand || "",
      Category: (i.product as Product).category || "",
      Product: i.product.name,
      Qty: i.quantity,
      "Price (AED)": i.product.price || "",
      "Total (AED)": i.product.price ? (i.product.price * i.quantity).toFixed(2) : "",
      "Photo URL": (i.product as Product).photo || "",
      URL: i.product.url || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [15, 20, 25, 50, 8, 12, 12, 70, 70].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Milia Order");
    XLSX.writeFile(wb, `${orderNumber}.xlsx`);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: colors.contentBg }}>
      <div className="w-8 h-8 rounded-full border-4 border-teal-200 border-t-teal-600 animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: colors.contentBg }}>

      {/* Breadcrumb */}
      <div className="px-6 pt-3 pb-1 text-xs bg-white/70 border-b border-teal-50" style={{ color: colors.textMuted }}>
        <a href="/suppliers" className="hover:underline" style={{ color: colors.primary }}>Suppliers</a>
        <span className="mx-1">›</span><span>Milia Cosmetics</span>
      </div>

      {/* Header */}
      <div className="px-6 py-4 bg-white/80 backdrop-blur border-b border-teal-50 shadow-sm sticky top-0 z-40">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <img src="https://miliacosmetics.com/cdn/shop/files/MILLIA-LOGO--no_background_a9192dbb-2e70-46dc-b7bd-83756031e268.png?v=1774424377" alt="Milia Cosmetics" className="h-6 sm:h-8 object-contain" onError={e => (e.target as HTMLImageElement).style.display='none'} />
            <div>
              <h1 className="text-xs sm:text-lg font-bold text-gray-900">Milia Cosmetics Catalogue</h1>
              <p className="text-xs text-gray-400">{products.length} products</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <UploadQuoteButton
              products={products}
              matchFields={["sku"]}
              onMatch={(product, qty) => {
                const p = product as any;
                setCart(prev => {
                  const ex = prev.find(c => c.product.id === p.id);
                  if (ex) return prev.map(c => c.product.id === p.id ? { ...c, quantity: c.quantity + qty } : c);
                  return [...prev, { id: p.id || p.sku || String(Date.now()), product: p, quantity: qty, foc: 0 }];
                });
              }}
            />
            <button onClick={() => setIsCartOpen(true)} className="relative flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ background: colors.primary }}>
            <ShoppingCart className="w-4 h-4" /> Cart
            {cart.length > 0 && <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-xs flex items-center justify-center text-white font-bold" style={{ background: colors.danger }}>{cart.length}</span>}
          </button>
          </div>
        </div>
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="w-full pl-9 pr-4 py-2 border border-teal-100 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
            placeholder="Search by name, SKU, brand…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
      </div>

      {/* Category / Brand nav */}
      <div className="bg-white/80 border-b border-teal-50 px-6 py-2">
        {/* Top categories */}
        <div className="flex gap-1.5 overflow-x-auto pb-1.5">
          <button onClick={() => { setSelectedCategory(null); setSelectedBrand(null); }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${!selectedCategory ? "text-white" : "bg-white text-gray-500 border border-teal-100 hover:bg-teal-50"}`}
            style={!selectedCategory ? { background: colors.primary } : {}}>
            All
          </button>
          {categories.map(cat => (
            <button key={cat} onClick={() => { setSelectedCategory(cat); setSelectedBrand(null); }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${selectedCategory === cat ? "text-white" : "bg-white text-gray-500 border border-teal-100 hover:bg-teal-50"}`}
              style={selectedCategory === cat ? { background: colors.primary } : {}}>
              {cat}
            </button>
          ))}
        </div>
        {/* Brand filter */}
        {brands.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pt-1.5 border-t border-teal-50 mt-1.5">
            <span className="text-[10px] text-gray-400 self-center pr-1 whitespace-nowrap">Brand:</span>
            <button onClick={() => setSelectedBrand(null)}
              className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap transition-all ${!selectedBrand ? "text-white" : "text-gray-400 hover:text-gray-600"}`}
              style={!selectedBrand ? { background: colors.primaryHover } : {}}>
              All
            </button>
            {brands.map(b => (
              <button key={b} onClick={() => setSelectedBrand(selectedBrand === b ? null : b)}
                className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap transition-all ${selectedBrand === b ? "text-white" : "text-gray-400 hover:text-gray-600"}`}
                style={selectedBrand === b ? { background: colors.primaryHover } : {}}>
                {b}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="p-6">
        <p className="text-xs text-gray-400 mb-4">
          {filteredProducts.length} products
          {selectedCategory ? ` · ${selectedCategory}` : ""}
          {selectedBrand ? ` · ${selectedBrand}` : ""}
        </p>

        {filteredProducts.length === 0 ? (
          <div className="text-center py-24 text-gray-400">
            <p className="text-lg mb-2">No products yet</p>
            <p className="text-sm">Run <code className="bg-gray-100 px-2 py-0.5 rounded">python3 milia_scraper.py</code> then copy to <code className="bg-gray-100 px-2 py-0.5 rounded">public/</code></p>
          </div>
        ) : (
          <PaginatedGrid
            items={filteredProducts}
            resetKey={`${selectedCategory}-${selectedBrand}-${searchQuery}`}
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
                    subLabel: product.category,
                    price: product.price,
                    photo: product.photo,
                    photo_sm: product.photo_sm,
                    sku: product.sku,
                    ean: product.ean,
                    available: product.available,
                  }}
                  accentColor={colors.primary}
                  cartQty={cartQty}
                  onAdd={() => addToCart(product)}
                  onInc={() => updateQuantity(cartItem!.id, cartQty + 1)}
                  onDec={() => {
                    if (cartQty > 1) updateQuantity(cartItem!.id, cartQty - 1);
                    else removeFromCart(cartItem!.id);
                  }}
                  onClick={() => setDetailProduct(product)}
                />
              );
            }}
          />
        )}
      </div>

      {/* Product Detail Modal */}
      {detailProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDetailProduct(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between rounded-t-2xl">
              <div className="flex-1 pr-4">
                <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: colors.primary }}>{detailProduct.brand}</p>
                <h2 className="text-base font-bold text-gray-900 leading-snug">{detailProduct.name}</h2>
              </div>
              <button onClick={() => setDetailProduct(null)} className="text-gray-400 hover:text-gray-600 mt-0.5">
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Image */}
            {detailProduct.photo && (
              <div className="bg-gray-50 px-6 py-4 flex justify-center">
                <img src={detailProduct.photo} alt={detailProduct.name}
                  className="max-h-52 object-contain rounded-lg" />
              </div>
            )}
            {/* Details */}
            <div className="px-6 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {detailProduct.sku && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">SKU</p>
                    <p className="text-sm font-mono font-semibold text-gray-800">{detailProduct.sku}</p>
                  </div>
                )}
                {detailProduct.category && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Category</p>
                    <p className="text-sm font-semibold text-gray-800">{detailProduct.category}</p>
                  </div>
                )}
                {detailProduct.price && (
                  <div className="rounded-xl p-3" style={{ background: "#f0fdfa" }}>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Price</p>
                    <p className="text-lg font-bold" style={{ color: colors.primary }}>{detailProduct.price.toFixed(2)} <span className="text-xs font-normal text-gray-400">AED</span></p>
                  </div>
                )}
                {detailProduct.available === false && (
                  <div className="bg-red-50 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Availability</p>
                    <p className="text-sm font-semibold text-red-500">Out of stock</p>
                  </div>
                )}
              </div>
              {detailProduct.description && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Description</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{detailProduct.description}</p>
                </div>
              )}
              {detailProduct.tags && detailProduct.tags.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {detailProduct.tags.map((tag, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-500">{tag}</span>
                    ))}
                  </div>
                </div>
              )}
              {detailProduct.url && (
                <a href={detailProduct.url} target="_blank" rel="noopener noreferrer"
                  className="block text-xs text-center py-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                  View on Milia Cosmetics ↗
                </a>
              )}
            </div>
            {/* Add to cart */}
            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4">
              {(() => {
                const cartItem = inCart(detailProduct);
                return cartItem ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">In cart: {cartItem.quantity}</span>
                    <div className="flex items-center gap-3">
                      <button onClick={() => updateQuantity(cartItem.id, cartItem.quantity - 1)}
                        className="w-9 h-9 rounded-lg flex items-center justify-center border border-gray-200">
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center font-bold">{cartItem.quantity}</span>
                      <button onClick={() => updateQuantity(cartItem.id, cartItem.quantity + 1)}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-white" style={{ background: colors.primary }}>
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { addToCart(detailProduct); setDetailProduct(null); }}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold"
                    style={{ background: colors.primary }}>
                    <Plus className="w-4 h-4" /> Add to Cart
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Cart Panel */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setIsCartOpen(false)} />
          <div className="relative w-full max-w-lg h-full overflow-y-auto bg-white flex flex-col">
            <div className="sticky top-0 px-6 py-4 flex items-center justify-between bg-white border-b border-teal-50">
              <div className="flex items-center gap-3">
                <ShoppingCart className="w-5 h-5" style={{ color: colors.primary }} />
                <h2 className="text-lg font-bold text-gray-900">Cart · Milia Cosmetics</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: colors.primary }}>{cart.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowHistory(v => !v)} className="text-xs px-3 py-1 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50">
                  {showHistory ? "← Cart" : "History"}
                </button>
                <button onClick={() => setIsCartOpen(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
            </div>

            {showHistory && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-700">Order History</h3>
                  {orderHistory.length > 0 && <button onClick={() => { if (confirm("Clear all history?")) clearHistory(); }} className="text-xs text-red-400 hover:text-red-600">Clear</button>}
                </div>
                {orderHistory.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No orders yet</p> : (
                  <div className="space-y-2">
                    {orderHistory.map((o, i) => (
                      <div key={i} className="p-3 rounded-xl border border-gray-100 bg-gray-50 flex justify-between items-start">
                        <div><p className="text-sm font-bold text-gray-800">{o.orderNum}</p><p className="text-xs text-gray-400">{o.date}</p></div>
                        <div className="text-right">
                          <p className="text-sm font-semibold" style={{ color: colors.primary }}>{o.value > 0 ? o.value.toFixed(2) : "—"}</p>
                          <p className="text-xs text-gray-400">{o.items ?? 0} items</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!showHistory && (
              <div className="p-6 space-y-4 flex-1">
                {cart.length === 0 ? <p className="text-center text-gray-400 py-12">Cart is empty</p> :
                  cart.map(item => (
                    <div key={item.id} className="flex gap-4 p-4 rounded-xl border border-gray-100 bg-gray-50">
                      {(item.product as Product).photo && (
                        <img src={(item.product as Product).photo_sm || (item.product as Product).photo || ""} alt={item.product.name} className="w-20 h-20 object-contain rounded-lg bg-white" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold" style={{ color: colors.primary }}>{(item.product as Product).brand}</p>
                        <h4 className="text-sm font-medium text-gray-900 line-clamp-2">{item.product.name}</h4>
                        {(item.product as Product).sku && <p className="text-xs text-gray-400">SKU: {(item.product as Product).sku}</p>}
                        <div className="flex items-center gap-2 mt-2">
                          <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="w-7 h-7 rounded border flex items-center justify-center border-gray-200"><Minus className="w-3 h-3" /></button>
                          <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="w-7 h-7 rounded flex items-center justify-center text-white" style={{ background: colors.primary }}><Plus className="w-3 h-3" /></button>
                        </div>
                      </div>
                      <div className="flex flex-col items-end justify-between">
                        <button onClick={() => removeFromCart(item.id)}><Trash2 className="w-4 h-4 text-red-400" /></button>
                        {item.product.price && <p className="text-sm font-bold" style={{ color: colors.primary }}>{(item.product.price * item.quantity).toFixed(2)}</p>}
                      </div>
                    </div>
                  ))
                }
              </div>
            )}

            {!showHistory && cart.length > 0 && (
              <div className="sticky bottom-0 p-6 border-t bg-white">
                <div className="flex justify-between text-sm mb-1"><span className="text-gray-500">Total Items</span><span className="font-semibold">{cartTotals.totalQty}</span></div>
                {cartTotals.totalValue > 0 && (
                  <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-100 mb-4">
                    <span>Total</span><span style={{ color: colors.primary }}>{cartTotals.totalValue.toFixed(2)} AED</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button onClick={generatePDF} className="flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm border" style={{ borderColor: colors.primary, color: colors.primary }}>
                    <FileText className="w-4 h-4" /> PDF
                  </button>
                  <button onClick={generateExcel} className="flex items-center justify-center gap-1.5 border border-green-200 text-green-600 rounded-lg py-2.5 text-sm hover:bg-green-50">
                    <FileSpreadsheet className="w-4 h-4" /> Excel
                  </button>
                </div>
                <ShareCartButton cart={cart} location={location} supplierId="milia" supplierLabel="Milia Cosmetics" />
                <button onClick={() => { if (confirm("Clear entire cart?")) clearCart(); }}
                  className="w-full mt-3 py-2 rounded-lg border border-red-200 text-red-500 text-sm hover:bg-red-50 flex items-center justify-center gap-1.5">
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
