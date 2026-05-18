"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Download,
  FileText,
  FileSpreadsheet,
  X,
  Check,
  Loader2,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────
interface EssieProduct {
  name: string;
  colour_group: string;
  category: string;
  sub_category: string;
  description: string | null;
  photos: string[];
  photo: string;
  url: string;
}

interface CartItem {
  id: string;
  product: EssieProduct;
  quantity: number;
  foc: number;
}

const COLOUR_ORDER = [
  "Nudes", "Pinks", "Reds", "Corals", "Oranges", "Yellows",
  "Greens", "Blues", "Purples", "Browns", "Grays", "Whites",
  "Sheers", "Longwear", "Nail Treatments", "Base & Top Coats",
];

const COLOUR_SWATCHES: Record<string, string> = {
  Nudes: "#c8a882", Pinks: "#f48fb1", Reds: "#e53935", Corals: "#ff7043",
  Oranges: "#ff9800", Yellows: "#fdd835", Greens: "#66bb6a", Blues: "#42a5f5",
  Purples: "#ab47bc", Browns: "#795548", Grays: "#9e9e9e", Whites: "#eeeeee",
  Sheers: "#fce4ec", Longwear: "#607d8b", "Nail Treatments": "#b0bec5",
  "Base & Top Coats": "#e0e0e0",
};

function generateOrderNumber() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `ESS-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

export default function EssieCatalogPage() {
  const [products, setProducts] = useState<EssieProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState<string>("All");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [lightboxProduct, setLightboxProduct] = useState<EssieProduct | null>(null);
  const [lightboxPhotoIdx, setLightboxPhotoIdx] = useState(0);
  const [orderNumber, setOrderNumber] = useState("");
  const [location, setLocation] = useState("Salon");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch("/essie_products.json")
      .then((r) => r.json())
      .then((data: EssieProduct[]) => {
        setProducts(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const colourGroups = useMemo(() => {
    const groups = new Set(products.map((p) => p.colour_group));
    return ["All", ...COLOUR_ORDER.filter((g) => groups.has(g))];
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchGroup = activeGroup === "All" || p.colour_group === activeGroup;
      const q = search.toLowerCase();
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.colour_group.toLowerCase().includes(q);
      return matchGroup && matchSearch;
    });
  }, [products, search, activeGroup]);

  const cartTotals = useMemo(() => ({
    totalQty: cart.reduce((s, i) => s + i.quantity, 0),
    totalFoc: cart.reduce((s, i) => s + i.foc, 0),
  }), [cart]);

  function addToCart(product: EssieProduct) {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.name === product.name);
      if (existing) {
        return prev.map((i) =>
          i.product.name === product.name ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { id: `${product.name}-${Date.now()}`, product, quantity: 1, foc: 0 }];
    });
  }

  function updateQty(id: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i))
        .filter((i) => i.quantity > 0)
    );
  }

  function updateFoc(id: string, delta: number) {
    setCart((prev) =>
      prev.map((i) => (i.id === id ? { ...i, foc: Math.max(0, i.foc + delta) } : i))
    );
  }

  function removeFromCart(id: string) {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }

  const cartCount = (product: EssieProduct) =>
    cart.find((i) => i.product.name === product.name)?.quantity || 0;

  // ─── PDF ──────────────────────────────────────────────────────────
  const generatePDF = async () => {
    const doc = new jsPDF("p", "mm", "a4");
    const orderNum = orderNumber || generateOrderNumber();
    if (!orderNumber) setOrderNumber(orderNum);

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    let currentY = 20;

    doc.setFontSize(20);
    doc.setTextColor(213, 0, 0);
    doc.text("ESSIE — PURCHASE ORDER", pageWidth / 2, currentY, { align: "center" });
    currentY += 10;

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Order #: ${orderNum}`, margin, currentY);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth - margin, currentY, { align: "right" });
    currentY += 6;
    doc.text(`Location: ${location}`, margin, currentY);
    doc.text("Supplier: essie / L'Oréal", pageWidth - margin, currentY, { align: "right" });
    currentY += 15;

    const itemsPerPage = 4;
    const chunks: CartItem[][] = [];
    for (let i = 0; i < cart.length; i += itemsPerPage) chunks.push(cart.slice(i, i + itemsPerPage));

    for (let pageIdx = 0; pageIdx < chunks.length; pageIdx++) {
      if (pageIdx > 0) {
        doc.addPage();
        currentY = 20;
        doc.setFontSize(12);
        doc.setTextColor(213, 0, 0);
        doc.text(`Essie PO (continued) — ${orderNum}`, margin, currentY);
        currentY += 10;
      }

      for (const item of chunks[pageIdx]) {
        const product = item.product;
        const imgSize = 38;
        const boxHeight = imgSize + 4;
        const boxY = currentY;

        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.4);
        doc.roundedRect(margin, boxY, pageWidth - margin * 2, boxHeight, 2, 2);

        // Image
        let imgData: string | null = null;
        if (product.photo) {
          try {
            const resp = await fetch(product.photo);
            const blob = await resp.blob();
            imgData = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
          } catch { imgData = null; }
        }

        if (imgData) {
          doc.addImage(imgData, "JPEG", margin + 2, boxY + 2, imgSize, imgSize);
        } else {
          doc.setFillColor(243, 244, 246);
          doc.rect(margin + 2, boxY + 2, imgSize, imgSize, "F");
          // Colour swatch
          const swatch = COLOUR_SWATCHES[product.colour_group];
          if (swatch) {
            const r = parseInt(swatch.slice(1, 3), 16);
            const g = parseInt(swatch.slice(3, 5), 16);
            const b = parseInt(swatch.slice(5, 7), 16);
            doc.setFillColor(r, g, b);
            doc.circle(margin + 2 + imgSize / 2, boxY + 2 + imgSize / 2, 8, "F");
          }
        }

        const col2x = margin + imgSize + 6;

        // Colour group
        const swatch = COLOUR_SWATCHES[product.colour_group];
        if (swatch) {
          const r = parseInt(swatch.slice(1, 3), 16);
          const g = parseInt(swatch.slice(3, 5), 16);
          const b = parseInt(swatch.slice(5, 7), 16);
          doc.setFillColor(r, g, b);
          doc.circle(col2x + 2, boxY + 7, 2, "F");
        }
        doc.setFontSize(8);
        doc.setTextColor(80, 80, 80);
        doc.text(product.colour_group, col2x + 6, boxY + 8);

        // Product name
        const col3x = col2x + 38;
        const qtyColX = pageWidth - margin - 48;
        const nameWidth = qtyColX - col3x - 3;
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        const nameLines = doc.splitTextToSize(product.name, nameWidth);
        doc.text(nameLines.slice(0, 4), col3x, boxY + 9);

        const subY = boxY + 9 + Math.min(nameLines.length, 4) * 3.8 + 2;
        doc.setFontSize(7.5);
        doc.setTextColor(120, 120, 120);
        doc.text(product.sub_category || product.category || "", col3x, subY);

        // Qty & FOC
        doc.setFontSize(10);
        doc.setTextColor(213, 0, 0);
        doc.text(`Qty: ${item.quantity}`, qtyColX, boxY + 12);
        if (item.foc > 0) {
          doc.setFontSize(9);
          doc.setTextColor(16, 185, 129);
          doc.text(`FOC: ${item.foc}`, qtyColX, boxY + 20);
        }

        currentY += boxHeight + 4;
      }

      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Page ${pageIdx + 1} of ${chunks.length}`, pageWidth / 2, pageHeight - 10, { align: "center" });
    }

    // Summary page
    doc.addPage();
    currentY = 20;
    doc.setFontSize(16);
    doc.setTextColor(213, 0, 0);
    doc.text("ORDER SUMMARY", pageWidth / 2, currentY, { align: "center" });
    currentY += 15;

    autoTable(doc, {
      startY: currentY,
      head: [["Shade", "Colour Group", "Qty", "FOC"]],
      body: cart.map((item) => [
        item.product.name,
        item.product.colour_group,
        item.quantity,
        item.foc,
      ]),
      theme: "striped",
      headStyles: { fillColor: [213, 0, 0], textColor: 255 },
      styles: { fontSize: 9 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Total Shades: ${cart.length}`, margin, finalY);
    doc.text(`Total Units: ${cartTotals.totalQty}`, margin, finalY + 7);
    doc.text(`Total FOC: ${cartTotals.totalFoc}`, margin, finalY + 14);

    doc.save(`PO-${orderNum}.pdf`);
  };

  // ─── Excel ────────────────────────────────────────────────────────
  const generateExcel = () => {
    const orderNum = orderNumber || generateOrderNumber();
    if (!orderNumber) setOrderNumber(orderNum);
    const rows = cart.map((item) => ({
      "Shade Name": item.product.name,
      "Colour Group": item.product.colour_group,
      Category: item.product.category,
      Qty: item.quantity,
      FOC: item.foc,
      "Photo URL": item.product.photo || "",
      URL: item.product.url || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 40 }, { wch: 20 }, { wch: 20 }, { wch: 8 }, { wch: 8 }, { wch: 60 }, { wch: 50 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Essie Order");
    XLSX.writeFile(wb, `PO-${orderNum}.xlsx`);
  };

  const handleSubmitOrder = async () => {
    setSubmitting(true);
    await generatePDF();
    generateExcel();
    setSubmitting(false);
    setSubmitted(true);
    setTimeout(() => {
      setCart([]);
      setOrderNumber("");
      setSubmitted(false);
      setCartOpen(false);
    }, 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
        <span className="ml-3 text-gray-600">Loading essie catalogue…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-red-600 tracking-tight">essie</span>
            <span className="text-gray-300 text-xl">|</span>
            <span className="text-gray-600 text-sm font-medium">Nail Colour Catalogue</span>
          </div>

          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Search shades…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div>
              <input
                className="border border-gray-200 rounded px-2 py-1 text-sm w-36 focus:outline-none focus:ring-1 focus:ring-red-400"
                placeholder="Location / Salon"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <button
              onClick={() => setCartOpen(true)}
              className="relative flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
            >
              <ShoppingCart className="w-4 h-4" />
              Order
              {cart.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-white text-red-600 border border-red-600 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {cart.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Colour group tabs */}
        <div className="max-w-7xl mx-auto px-4 pb-2 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {colourGroups.map((group) => (
              <button
                key={group}
                onClick={() => setActiveGroup(group)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  activeGroup === group
                    ? "bg-red-600 text-white shadow"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {group !== "All" && COLOUR_SWATCHES[group] && (
                  <span
                    className="w-3 h-3 rounded-full border border-white/30 inline-block flex-shrink-0"
                    style={{ backgroundColor: COLOUR_SWATCHES[group] }}
                  />
                )}
                {group}
                {group !== "All" && (
                  <span className="opacity-60">
                    ({products.filter((p) => p.colour_group === group).length})
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Product Grid */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <p className="text-sm text-gray-500 mb-4">
          {filtered.length} shade{filtered.length !== 1 ? "s" : ""}
          {activeGroup !== "All" ? ` in ${activeGroup}` : ""}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filtered.map((product) => {
            const inCart = cartCount(product);
            return (
              <div
                key={product.name}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow group"
              >
                <div
                  className="relative cursor-pointer overflow-hidden bg-gray-50"
                  style={{ aspectRatio: "1/1" }}
                  onClick={() => {
                    setLightboxProduct(product);
                    setLightboxPhotoIdx(0);
                  }}
                >
                  <img
                    src={product.photo}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23f3f4f6'/%3E%3C/svg%3E";
                    }}
                  />
                  {/* Colour swatch dot */}
                  {COLOUR_SWATCHES[product.colour_group] && (
                    <span
                      className="absolute top-2 left-2 w-4 h-4 rounded-full border-2 border-white shadow"
                      style={{ backgroundColor: COLOUR_SWATCHES[product.colour_group] }}
                    />
                  )}
                </div>

                <div className="p-2.5">
                  <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2 mb-1">
                    {product.name}
                  </p>
                  <p className="text-[10px] text-gray-400 mb-2">{product.colour_group}</p>

                  {inCart > 0 ? (
                    <div className="flex items-center justify-between bg-red-50 rounded-lg px-1 py-0.5">
                      <button
                        onClick={() => {
                          const item = cart.find((i) => i.product.name === product.name);
                          if (item) updateQty(item.id, -1);
                        }}
                        className="text-red-600 hover:text-red-800 p-0.5"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-bold text-red-700">{inCart}</span>
                      <button
                        onClick={() => addToCart(product)}
                        className="text-red-600 hover:text-red-800 p-0.5"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => addToCart(product)}
                      className="w-full text-[11px] bg-red-600 text-white rounded-lg py-1 hover:bg-red-700 transition-colors font-medium"
                    >
                      Add
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Lightbox */}
      {lightboxProduct && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxProduct(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="font-bold text-gray-900 text-lg leading-tight">{lightboxProduct.name}</h2>
                <div className="flex items-center gap-1.5 mt-1">
                  {COLOUR_SWATCHES[lightboxProduct.colour_group] && (
                    <span
                      className="w-3 h-3 rounded-full border border-gray-200"
                      style={{ backgroundColor: COLOUR_SWATCHES[lightboxProduct.colour_group] }}
                    />
                  )}
                  <span className="text-sm text-gray-500">{lightboxProduct.colour_group}</span>
                </div>
              </div>
              <button onClick={() => setLightboxProduct(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-gray-50 rounded-xl overflow-hidden mb-4" style={{ height: 320 }}>
              <img
                src={lightboxProduct.photos[lightboxPhotoIdx] || lightboxProduct.photo}
                alt={lightboxProduct.name}
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23f3f4f6'/%3E%3C/svg%3E";
                }}
              />
            </div>

            {/* Photo thumbnails */}
            {lightboxProduct.photos.filter((p) => p.startsWith("http")).length > 1 && (
              <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                {lightboxProduct.photos
                  .filter((p) => p.startsWith("http"))
                  .map((ph, i) => (
                    <button
                      key={i}
                      onClick={() => setLightboxPhotoIdx(i)}
                      className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors ${
                        lightboxPhotoIdx === i ? "border-red-500" : "border-transparent"
                      }`}
                    >
                      <img src={ph} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
              </div>
            )}

            {lightboxProduct.description && (
              <p className="text-sm text-gray-600 mb-4">{lightboxProduct.description}</p>
            )}

            <button
              onClick={() => {
                addToCart(lightboxProduct);
                setLightboxProduct(null);
              }}
              className="w-full bg-red-600 text-white py-2 rounded-xl font-semibold hover:bg-red-700 transition-colors"
            >
              Add to Order
            </button>
          </div>
        </div>
      )}

      {/* Cart / Order Drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setCartOpen(false)} />
          <div className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900 text-lg">Current Order</h2>
                <p className="text-xs text-gray-500">
                  {cart.length} shade{cart.length !== 1 ? "s" : ""} · {cartTotals.totalQty} units
                </p>
              </div>
              <button onClick={() => setCartOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Location */}
            <div className="px-5 py-3 bg-gray-50 border-b">
              <label className="text-xs text-gray-500 block mb-1">Location / Salon</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            {/* Cart items */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
              {cart.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No shades added yet</p>
                </div>
              )}
              {cart.map((item) => (
                <div key={item.id} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
                  <div className="flex gap-3">
                    <img
                      src={item.product.photo}
                      alt={item.product.name}
                      className="w-14 h-14 rounded-lg object-cover bg-gray-50 flex-shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23f3f4f6'/%3E%3C/svg%3E";
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 leading-tight truncate">
                        {item.product.name}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        {COLOUR_SWATCHES[item.product.colour_group] && (
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-gray-200 flex-shrink-0"
                            style={{ backgroundColor: COLOUR_SWATCHES[item.product.colour_group] }}
                          />
                        )}
                        <p className="text-xs text-gray-400">{item.product.colour_group}</p>
                      </div>
                    </div>
                    <button onClick={() => removeFromCart(item.id)} className="text-gray-300 hover:text-red-500 self-start">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-7">Qty</span>
                      <button onClick={() => updateQty(item.id, -1)} className="w-6 h-6 flex items-center justify-center rounded-full border border-gray-200 hover:border-red-400 text-gray-600 hover:text-red-600">
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center text-sm font-bold text-gray-800">{item.quantity}</span>
                      <button onClick={() => updateQty(item.id, 1)} className="w-6 h-6 flex items-center justify-center rounded-full border border-gray-200 hover:border-red-400 text-gray-600 hover:text-red-600">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-emerald-600 w-7">FOC</span>
                      <button onClick={() => updateFoc(item.id, -1)} className="w-6 h-6 flex items-center justify-center rounded-full border border-gray-200 hover:border-emerald-400 text-gray-600 hover:text-emerald-600">
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center text-sm font-bold text-emerald-700">{item.foc}</span>
                      <button onClick={() => updateFoc(item.id, 1)} className="w-6 h-6 flex items-center justify-center rounded-full border border-gray-200 hover:border-emerald-400 text-gray-600 hover:text-emerald-600">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer actions */}
            {cart.length > 0 && (
              <div className="border-t border-gray-100 px-5 py-4 space-y-3">
                <div className="flex gap-2">
                  <button
                    onClick={generatePDF}
                    className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50"
                  >
                    <FileText className="w-4 h-4" /> PDF
                  </button>
                  <button
                    onClick={generateExcel}
                    className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50"
                  >
                    <FileSpreadsheet className="w-4 h-4" /> Excel
                  </button>
                </div>
                <button
                  onClick={handleSubmitOrder}
                  disabled={submitting || submitted}
                  className="w-full flex items-center justify-center gap-2 bg-red-600 text-white py-3 rounded-xl font-semibold hover:bg-red-700 transition-colors disabled:opacity-60"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                  ) : submitted ? (
                    <><Check className="w-4 h-4" /> Order Submitted!</>
                  ) : (
                    <><Download className="w-4 h-4" /> Submit Order</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
