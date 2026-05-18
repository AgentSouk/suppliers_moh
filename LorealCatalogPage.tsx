"use client";

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
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

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
  photo: string;
  url: string;
  category_id?: string | null;
  sub_category?: string | null;
  aki_code?: string | null;
  uom?: string;
}

interface CartItem {
  id: string;
  product_id: string;
  quantity: number;
  foc: number;
  product: Product;
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
  contentBg: "#f8fafc",
  cardBg: "#ffffff",
  border: "#e5e7eb",
  text: "#111827",
  textMuted: "#6b7280",
  success: "#10b981",
  danger: "#ef4444",
};

// ─── Mock Categories (populate these in your DB) ─────────────────
const DEFAULT_CATEGORIES: Category[] = [
  { id: "absolut-repair", name: "Absolut Repair", slug: "absolut-repair" },
  { id: "acidic-bonding", name: "Acidic Bonding", slug: "acidic-bonding" },
  { id: "blond-absolu", name: "Blond Absolu", slug: "blond-absolu" },
  { id: "blondifier", name: "Blondifier", slug: "blondifier" },
  { id: "chronologiste", name: "Chronologiste", slug: "chronologiste" },
  { id: "curl-expression", name: "Curl Expression", slug: "curl-expression" },
  { id: "densifique", name: "Densifique", slug: "densifique" },
  { id: "dia-color", name: "Dia Color", slug: "dia-color" },
  { id: "dia-light", name: "Dia Light", slug: "dia-light" },
  { id: "discipline", name: "Discipline", slug: "discipline" },
  { id: "elixir-ultime", name: "Elixir Ultime", slug: "elixir-ultime" },
  { id: "genesis", name: "Genesis", slug: "genesis" },
  { id: "gloss-absolu", name: "Gloss Absolu", slug: "gloss-absolu" },
  { id: "nutritive", name: "Nutritive", slug: "nutritive" },
  { id: "resistance", name: "Resistance", slug: "resistance" },
  { id: "styling", name: "Styling", slug: "styling" },
  { id: "color-technique", name: "Color Technique", slug: "color-technique" },
];

// ─── Helper: Detect category from product name ────────────────────
function detectCategory(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("absolut repair")) return "absolut-repair";
  if (lower.includes("acidic bonding")) return "acidic-bonding";
  if (lower.includes("blond absolu") || lower.includes("blond bain") || lower.includes("blond studio") || lower.includes("blondifier")) return "blond-absolu";
  if (lower.includes("chronologiste")) return "chronologiste";
  if (lower.includes("curl expression")) return "curl-expression";
  if (lower.includes("densifique")) return "densifique";
  if (lower.includes("dia color")) return "dia-color";
  if (lower.includes("dia light")) return "dia-light";
  if (lower.includes("discipline")) return "discipline";
  if (lower.includes("elixir ultime")) return "elixir-ultime";
  if (lower.includes("genesis")) return "genesis";
  if (lower.includes("gloss absolu")) return "gloss-absolu";
  if (lower.includes("nutritive") || lower.includes("bain satin")) return "nutritive";
  if (lower.includes("resistance")) return "resistance";
  if (lower.includes("styling") || lower.includes("mousse") || lower.includes("spray") || lower.includes("hairspray")) return "styling";
  if (lower.includes("dia ") || lower.includes("blond studio") || lower.includes("oxydant") || lower.includes("developer")) return "color-technique";
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
export default function LorealCatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [categories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [location] = useState("Hadil Strokes location");
  const [orderNumber, setOrderNumber] = useState("");

  // ─── Load Products from JSON (in real app, fetch from Supabase) ─
  useEffect(() => {
    async function loadProducts() {
      try {
        // In production, fetch from Supabase:
        // const { data, error } = await supabase.from("loreal_products").select("*");
        // For now, we'll simulate by importing the JSON
        const res = await fetch("/loreal_products.json");
        const jsonData = await res.json();

        const mapped: Product[] = jsonData.map((item: any, idx: number) => ({
          id: item.ean || String(idx),
          name: item.name,
          brand: item.brand || "L'Oréal Professionnel",
          product_code: item.product_code,
          ean: item.ean,
          price: item.price,
          photo: item.photo,
          url: item.url,
          sub_category: extractSubCategory(item.name),
          aki_code: generateAKICode(item.product_code),
          uom: "EA",
        }));

        setProducts(mapped);
      } catch (err) {
        console.error("Failed to load products:", err);
      } finally {
        setLoading(false);
      }
    }
    loadProducts();
  }, []);

  // ─── Load Cart from Supabase ────────────────────────────────────
  const loadCart = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("loreal_cart")
      .select(`*, product:loreal_products(*)`)
      .eq("user_id", user.id);

    if (error) {
      console.error("Cart load error:", error);
      return;
    }

    if (data) {
      setCart(data as CartItem[]);
    }
  }, []);

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  // ─── Add to Cart (saves immediately to Supabase) ────────────────
  const addToCart = async (product: Product) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert("Please sign in to add items to cart");
        return;
      }

      // Check if product exists in DB, if not insert it
      const { data: existingProduct } = await supabase
        .from("loreal_products")
        .select("id")
        .eq("ean", product.ean)
        .single();

      let productDbId = existingProduct?.id;

      if (!productDbId) {
        const { data: newProduct, error: insertError } = await supabase
          .from("loreal_products")
          .insert({
            name: product.name,
            brand: product.brand,
            product_code: product.product_code,
            ean: product.ean,
            price: product.price,
            photo: product.photo,
            url: product.url,
            sub_category: product.sub_category,
            aki_code: product.aki_code,
            uom: product.uom,
          })
          .select("id")
          .single();

        if (insertError) throw insertError;
        productDbId = newProduct!.id;
      }

      // Upsert cart item
      const { error: cartError } = await supabase
        .from("loreal_cart")
        .upsert(
          {
            user_id: user.id,
            product_id: productDbId,
            quantity: 1,
            foc: 0,
          },
          { onConflict: "user_id,product_id" }
        );

      if (cartError) throw cartError;

      await loadCart();
    } catch (err) {
      console.error("Add to cart error:", err);
      alert("Failed to add to cart");
    } finally {
      setSaving(false);
    }
  };

  // ─── Update Quantity ──────────────────────────────────────────────
  const updateQuantity = async (cartItemId: string, newQty: number) => {
    if (newQty < 1) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("loreal_cart")
        .update({ quantity: newQty })
        .eq("id", cartItemId);

      if (error) throw error;
      await loadCart();
    } catch (err) {
      console.error("Update error:", err);
    } finally {
      setSaving(false);
    }
  };

  // ─── Update FOC ───────────────────────────────────────────────────
  const updateFOC = async (cartItemId: string, newFoc: number) => {
    if (newFoc < 0) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("loreal_cart")
        .update({ foc: newFoc })
        .eq("id", cartItemId);

      if (error) throw error;
      await loadCart();
    } catch (err) {
      console.error("FOC update error:", err);
    } finally {
      setSaving(false);
    }
  };

  // ─── Remove from Cart ─────────────────────────────────────────────
  const removeFromCart = async (cartItemId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("loreal_cart")
        .delete()
        .eq("id", cartItemId);

      if (error) throw error;
      await loadCart();
    } catch (err) {
      console.error("Remove error:", err);
    } finally {
      setSaving(false);
    }
  };

  // ─── Filter Products ──────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    let filtered = products;

    if (selectedCategory) {
      filtered = filtered.filter((p) => detectCategory(p.name) === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.ean.includes(q) ||
          p.product_code.toLowerCase().includes(q) ||
          (p.aki_code && p.aki_code.toLowerCase().includes(q))
      );
    }

    return filtered;
  }, [products, searchQuery, selectedCategory]);

  // ─── Cart Totals ──────────────────────────────────────────────────
  const cartTotals = useMemo(() => {
    let totalQty = 0;
    let totalFoc = 0;
    let totalValue = 0;

    cart.forEach((item) => {
      totalQty += item.quantity;
      totalFoc += item.foc;
      const price = item.product.price || 0;
      totalValue += price * item.quantity;
    });

    return { totalQty, totalFoc, totalValue };
  }, [cart]);

  // ─── Generate Order Number ──────────────────────────────────────
  const generateOrderNumber = () => {
    const date = new Date();
    const prefix = "LOP";
    const suffix = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}-${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}`;
    return `${prefix}-${suffix}`;
  };

  // ─── Generate PO PDF (5 items per page) ─────────────────────────
  const generatePDF = async () => {
    const doc = new jsPDF("p", "mm", "a4");
    const orderNum = orderNumber || generateOrderNumber();
    if (!orderNumber) setOrderNumber(orderNum);

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    let currentY = 20;

    // Header
    doc.setFontSize(20);
    doc.setTextColor(37, 99, 235);
    doc.text("PURCHASE ORDER", pageWidth / 2, currentY, { align: "center" });

    currentY += 10;
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Order #: ${orderNum}`, margin, currentY);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth - margin, currentY, { align: "right" });

    currentY += 6;
    doc.text(`Location: ${location}`, margin, currentY);
    doc.text(`Supplier: L'Oréal Professionnel`, pageWidth - margin, currentY, { align: "right" });

    currentY += 15;

    // Items table (5 per page)
    const itemsPerPage = 5;
    const chunks = [];
    for (let i = 0; i < cart.length; i += itemsPerPage) {
      chunks.push(cart.slice(i, i + itemsPerPage));
    }

    chunks.forEach((chunk, pageIdx) => {
      if (pageIdx > 0) {
        doc.addPage();
        currentY = 20;
      }

      // Page header on continuation pages
      if (pageIdx > 0) {
        doc.setFontSize(12);
        doc.setTextColor(37, 99, 235);
        doc.text(`Purchase Order (continued) - ${orderNum}`, margin, currentY);
        currentY += 10;
      }

      chunk.forEach((item, idx) => {
        const product = item.product;
        const boxY = currentY;
        const boxHeight = 35;

        // Box border
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.roundedRect(margin, boxY, pageWidth - margin * 2, boxHeight, 3, 3);

        // Product image placeholder (we'll add barcode instead since images need external loading)
        doc.setFillColor(248, 250, 252);
        doc.rect(margin + 2, boxY + 2, 25, 31, "F");

        // Barcode text (EAN)
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text("EAN:", margin + 30, boxY + 8);
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(product.ean, margin + 30, boxY + 13);

        // AKI Code
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text("AKI Code:", margin + 30, boxY + 20);
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.text(product.aki_code || "N/A", margin + 30, boxY + 25);

        // Product name
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        const nameLines = doc.splitTextToSize(product.name, 80);
        doc.text(nameLines, margin + 75, boxY + 10);

        // Sub category
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(product.sub_category || "Other", margin + 75, boxY + 20);

        // Qty & FOC
        doc.setFontSize(10);
        doc.setTextColor(37, 99, 235);
        doc.text(`Qty: ${item.quantity}`, pageWidth - margin - 50, boxY + 10);
        if (item.foc > 0) {
          doc.setTextColor(16, 185, 129);
          doc.text(`FOC: ${item.foc}`, pageWidth - margin - 50, boxY + 18);
        }

        // Price
        const price = product.price || 0;
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(`AED ${price.toFixed(2)}`, pageWidth - margin - 10, boxY + 10, { align: "right" });

        const lineTotal = price * item.quantity;
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text(`Total: AED ${lineTotal.toFixed(2)}`, pageWidth - margin - 10, boxY + 18, { align: "right" });

        currentY += boxHeight + 5;
      });

      // Page footer
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Page ${pageIdx + 1} of ${chunks.length}`, pageWidth / 2, pageHeight - 10, { align: "center" });
    });

    // Summary page
    doc.addPage();
    currentY = 20;

    doc.setFontSize(16);
    doc.setTextColor(37, 99, 235);
    doc.text("ORDER SUMMARY", pageWidth / 2, currentY, { align: "center" });

    currentY += 15;

    autoTable(doc, {
      startY: currentY,
      head: [["Item", "Description", "Qty", "FOC", "UOM", "Price", "Total"]],
      body: cart.map((item) => [
        item.product.aki_code || item.product.ean,
        item.product.name,
        item.quantity,
        item.foc,
        item.product.uom || "EA",
        `AED ${(item.product.price || 0).toFixed(2)}`,
        `AED ${((item.product.price || 0) * item.quantity).toFixed(2)}`,
      ]),
      theme: "striped",
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      styles: { fontSize: 9 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;

    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Total Items: ${cartTotals.totalQty}`, margin, finalY);
    doc.text(`Total FOC: ${cartTotals.totalFoc}`, margin, finalY + 6);
    doc.setFontSize(14);
    doc.setTextColor(37, 99, 235);
    doc.text(`TOTAL ORDER VALUE: AED ${cartTotals.totalValue.toFixed(2)}`, pageWidth - margin, finalY, { align: "right" });

    doc.save(`PO-${orderNum}.pdf`);
  };

  // ─── Generate Excel ─────────────────────────────────────────────
  const generateExcel = () => {
    const orderNum = orderNumber || generateOrderNumber();
    if (!orderNumber) setOrderNumber(orderNum);

    const rows = cart.map((item) => ({
      Barcode: item.product.ean,
      Brand: item.product.brand || "LP",
      "AKI Code": item.product.aki_code || generateAKICode(item.product.product_code),
      "Item Description": item.product.name,
      "SUB CATEGORY": item.product.sub_category || "Other",
      "Price per pc/outer": item.product.price || 0,
      "Order in PC": item.quantity,
      FOC: item.foc,
      TOTAL: item.quantity + item.foc,
      UOM: item.product.uom || "EA",
      "TOTAL ORDER VALUE": (item.product.price || 0) * item.quantity,
    }));

    // Add totals row
    rows.push({
      Barcode: "",
      Brand: "",
      "AKI Code": "",
      "Item Description": "TOTALS",
      "SUB CATEGORY": "",
      "Price per pc/outer": 0,
      "Order in PC": cartTotals.totalQty,
      FOC: cartTotals.totalFoc,
      TOTAL: cartTotals.totalQty + cartTotals.totalFoc,
      UOM: "",
      "TOTAL ORDER VALUE": cartTotals.totalValue,
    });

    const ws = XLSX.utils.json_to_sheet(rows);

    // Set column widths
    const colWidths = [
      { wch: 18 }, // Barcode
      { wch: 8 },  // Brand
      { wch: 15 }, // AKI Code
      { wch: 50 }, // Item Description
      { wch: 15 }, // SUB CATEGORY
      { wch: 18 }, // Price per pc/outer
      { wch: 12 }, // Order in PC
      { wch: 8 },  // FOC
      { wch: 8 },  // TOTAL
      { wch: 6 },  // UOM
      { wch: 18 }, // TOTAL ORDER VALUE
    ];
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Order");

    // Add summary sheet
    const summaryRows = [
      { Field: "Order Number", Value: orderNum },
      { Field: "Date", Value: new Date().toLocaleDateString() },
      { Field: "Location", Value: location },
      { Field: "Supplier", Value: "L'Oréal Professionnel" },
      { Field: "Total Items", Value: cartTotals.totalQty },
      { Field: "Total FOC", Value: cartTotals.totalFoc },
      { Field: "Grand Total", Value: `AED ${cartTotals.totalValue.toFixed(2)}` },
    ];
    const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
    summaryWs["!cols"] = [{ wch: 20 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

    XLSX.writeFile(wb, `Order-${orderNum}.xlsx`);
  };

  // ─── Submit Order ─────────────────────────────────────────────────
  const submitOrder = async () => {
    if (cart.length === 0) {
      alert("Cart is empty!");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert("Please sign in");
        return;
      }

      const orderNum = generateOrderNumber();
      setOrderNumber(orderNum);

      // Create order
      const { data: order, error: orderError } = await supabase
        .from("loreal_supplier_orders")
        .insert({
          user_id: user.id,
          location_id: location,
          order_number: orderNum,
          status: "submitted",
          total_value: cartTotals.totalValue,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = cart.map((item) => ({
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        foc: item.foc,
        price_per_pc: item.product.price,
        total_value: (item.product.price || 0) * item.quantity,
      }));

      const { error: itemsError } = await supabase
        .from("loreal_order_items")
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // Clear cart
      await supabase.from("loreal_cart").delete().eq("user_id", user.id);
      setCart([]);
      setIsCartOpen(false);

      // Generate documents
      await generatePDF();
      generateExcel();

      alert(`Order ${orderNum} submitted successfully!`);
    } catch (err) {
      console.error("Submit error:", err);
      alert("Failed to submit order");
    } finally {
      setSaving(false);
    }
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
      {/* Header */}
      <div className="px-6 py-4" style={{ background: colors.cardBg, borderBottom: `1px solid ${colors.border}` }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: colors.text }}>
              L&apos;Oréal Professional Catalog
            </h1>
            <p className="text-sm mt-1" style={{ color: colors.textMuted }}>
              Browse products and create purchase orders
            </p>
          </div>

          <button
            onClick={() => setIsCartOpen(true)}
            className="relative flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium transition-colors"
            style={{ background: colors.primary }}
            onMouseEnter={(e) => (e.currentTarget.style.background = colors.primaryHover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = colors.primary)}
          >
            <ShoppingCart className="w-5 h-5" />
            <span>Cart</span>
            {cart.length > 0 && (
              <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-xs flex items-center justify-center text-white font-bold"
                style={{ background: colors.danger }}>
                {cart.length}
              </span>
            )}
          </button>
        </div>

        {/* Search & Filters */}
        <div className="flex items-center gap-4 mt-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: colors.textMuted }} />
            <input
              type="text"
              placeholder="Search by name, EAN, product code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm outline-none focus:ring-2"
              style={{
                background: colors.cardBg,
                borderColor: colors.border,
                color: colors.text,
              }}
            />
          </div>

          <select
            value={selectedCategory || ""}
            onChange={(e) => setSelectedCategory(e.target.value || null)}
            className="px-4 py-2.5 rounded-lg border text-sm outline-none"
            style={{ background: colors.cardBg, borderColor: colors.border, color: colors.text }}
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Category Pills */}
      <div className="px-6 py-3 flex gap-2 flex-wrap">
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
        {categories.map((cat) => (
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

      {/* Products Grid */}
      <div className="px-6 pb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredProducts.map((product) => {
            const inCart = cart.find((c) => c.product.ean === product.ean);

            return (
              <div
                key={product.ean}
                className="rounded-xl border overflow-hidden transition-shadow hover:shadow-md"
                style={{ background: colors.cardBg, borderColor: colors.border }}
              >
                {/* Image */}
                <div className="relative h-48 bg-gray-50 flex items-center justify-center overflow-hidden">
                  <img
                    src={product.photo}
                    alt={product.name}
                    className="w-full h-full object-contain p-4"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23f3f4f6'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='.3em' fill='%239ca3af' font-size='12'%3ENo Image%3C/text%3E%3C/svg%3E";
                    }}
                  />
                  {inCart && (
                    <div className="absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-bold text-white"
                      style={{ background: colors.success }}>
                      <Check className="w-3 h-3 inline mr-1" />
                      {inCart.quantity} in cart
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide mb-1"
                        style={{ color: colors.primary }}>
                        {product.sub_category}
                      </p>
                      <h3 className="text-sm font-semibold leading-tight line-clamp-2" style={{ color: colors.text }}>
                        {product.name}
                      </h3>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1">
                    <p className="text-xs" style={{ color: colors.textMuted }}>
                      EAN: <span className="font-mono" style={{ color: colors.text }}>{product.ean}</span>
                    </p>
                    <p className="text-xs" style={{ color: colors.textMuted }}>
                      Code: <span style={{ color: colors.text }}>{product.product_code}</span>
                    </p>
                    <p className="text-xs" style={{ color: colors.textMuted }}>
                      AKI: <span style={{ color: colors.text }}>{product.aki_code}</span>
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-lg font-bold" style={{ color: colors.primary }}>
                      {product.price ? `AED ${product.price.toFixed(2)}` : "Price on request"}
                    </span>

                    {inCart ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQuantity(inCart.id, inCart.quantity - 1)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center border"
                          style={{ borderColor: colors.border }}
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center font-semibold">{inCart.quantity}</span>
                        <button
                          onClick={() => updateQuantity(inCart.id, inCart.quantity + 1)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
                          style={{ background: colors.primary }}
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(product)}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50"
                        style={{ background: colors.primary }}
                        onMouseEnter={(e) => !saving && (e.currentTarget.style.background = colors.primaryHover)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = colors.primary)}
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Add
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

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
              <button onClick={() => setIsCartOpen(false)} className="p-2 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5" style={{ color: colors.textMuted }} />
              </button>
            </div>

            {/* Cart Items */}
            <div className="p-6 space-y-4">
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

                        {/* FOC */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium" style={{ color: colors.success }}>FOC:</span>
                          <button
                            onClick={() => updateFOC(item.id, item.foc - 1)}
                            className="w-7 h-7 rounded border flex items-center justify-center"
                            style={{ borderColor: colors.border }}
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center text-sm font-semibold" style={{ color: colors.success }}>
                            {item.foc}
                          </span>
                          <button
                            onClick={() => updateFOC(item.id, item.foc + 1)}
                            className="w-7 h-7 rounded flex items-center justify-center text-white"
                            style={{ background: colors.success }}
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
                          AED {((item.product.price || 0) * item.quantity).toFixed(2)}
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
            </div>

            {/* Cart Footer */}
            {cart.length > 0 && (
              <div className="sticky bottom-0 p-6 border-t"
                style={{ background: colors.cardBg, borderColor: colors.border }}>

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span style={{ color: colors.textMuted }}>Total Quantity</span>
                    <span className="font-semibold">{cartTotals.totalQty}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: colors.textMuted }}>Total FOC</span>
                    <span className="font-semibold" style={{ color: colors.success }}>{cartTotals.totalFoc}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold pt-2 border-t"
                    style={{ borderColor: colors.border, color: colors.text }}>
                    <span>Total Value</span>
                    <span style={{ color: colors.primary }}>AED {cartTotals.totalValue.toFixed(2)}</span>
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

                <button
                  onClick={submitOrder}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-white font-semibold transition-colors disabled:opacity-50"
                  style={{ background: colors.primary }}
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                  Submit Order & Generate Documents
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
