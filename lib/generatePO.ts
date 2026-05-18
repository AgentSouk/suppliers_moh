/**
 * Shared Purchase Order PDF generator.
 * Matches the L'Oréal catalog design exactly — use for all suppliers.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface POCartItem {
  quantity: number;
  foc?: number;
  product: {
    name: string;
    photo?: string | null;
    ean?: string | null;
    sku?: string | null;
    aki_code?: string | null;
    price?: number | null;
    brand?: string | null;
    sub_category?: string | null;
    uom?: string | null;
  };
}

export interface GeneratePOOptions {
  cart: POCartItem[];
  supplierName: string;
  supplierPrefix: string;   // e.g. "LOP", "NZH", "WEL"
  location: string;
  isColourProduct?: (name: string) => boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function generateOrderNumber(prefix: string): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const hm  = `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  return `${prefix}-${ymd}-${hm}`;
}

async function fetchCircleImage(photoUrl: string): Promise<string | null> {
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
}

async function fetchProductImage(photoUrl: string): Promise<{ data: string; format: string } | null> {
  try {
    const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(photoUrl)}`;
    const resp = await fetch(proxyUrl);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const format = blob.type.includes("png") ? "PNG" : "JPEG";
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { data, format };
  } catch { return null; }
}

// ── Main generator ────────────────────────────────────────────────────────────

export async function generatePO(options: GeneratePOOptions): Promise<string> {
  const { cart, supplierName, supplierPrefix, location, isColourProduct } = options;
  const orderNum = generateOrderNumber(supplierPrefix);

  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth  = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let currentY = 20;

  const colourItems  = isColourProduct ? cart.filter((i) => isColourProduct(i.product.name)) : [];
  const regularItems = isColourProduct ? cart.filter((i) => !isColourProduct(i.product.name)) : cart;

  // ── Colour palette pages ────────────────────────────────────────────────────
  if (colourItems.length > 0) {
    doc.setFontSize(16);
    doc.setTextColor(37, 99, 235);
    doc.text("COLOUR ORDER", pageWidth / 2, currentY, { align: "center" });
    currentY += 8;
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Order #: ${orderNum}   ·   Date: ${new Date().toLocaleDateString()}`,
      pageWidth / 2, currentY, { align: "center" }
    );
    currentY += 10;

    const circleD = 20;
    const colW    = (pageWidth - margin * 2) / 2;
    const rowH    = circleD + 22;
    let   pageCount = 1;

    const drawColourItem = async (item: POCartItem, x: number, y: number) => {
      const p  = item.product;
      const cx = x + circleD / 2;
      const cy = y + circleD / 2;

      const photoUrl = p.photo
        ? (p.photo.startsWith("/") ? `${window.location.origin}${p.photo}` : p.photo)
        : null;
      const circleImg = photoUrl ? await fetchCircleImage(photoUrl) : null;

      if (circleImg) {
        doc.addImage(circleImg, "JPEG", x, y, circleD, circleD);
      } else {
        doc.setFillColor(220, 220, 220);
        doc.circle(cx, cy, circleD / 2, "F");
      }

      // Qty badge
      doc.setFillColor(37, 99, 235);
      doc.circle(x + circleD - 4, y + 4, 4, "F");
      doc.setFontSize(5);
      doc.setTextColor(255, 255, 255);
      doc.text(`x${item.quantity}`, x + circleD - 4, y + 4.5, { align: "center" });

      // Name
      const cleanName = p.name.replace(/\s*\[.*?\]\s*/g, "").replace(/\b(V[A-Z0-9]{2,})\b/gi, "").trim();
      const nameLines = doc.splitTextToSize(cleanName, colW - 4);
      doc.setFontSize(6.5);
      doc.setTextColor(20, 20, 20);
      doc.text(nameLines.slice(0, 2), x, y + circleD + 5);

      // Barcode
      doc.setFontSize(6);
      doc.setTextColor(80, 80, 80);
      doc.text(p.ean || p.sku || "—", x, y + circleD + 11);

      // Code
      doc.setFontSize(5.5);
      doc.setTextColor(130, 130, 130);
      doc.text(p.aki_code || p.sku || "", x, y + circleD + 16);
    };

    for (let i = 0; i < colourItems.length; i += 2) {
      if (currentY + rowH > pageHeight - 15) {
        if (pageCount >= 2) break;
        doc.addPage(); pageCount++; currentY = 20;
      }
      await drawColourItem(colourItems[i], margin, currentY);
      if (colourItems[i + 1]) await drawColourItem(colourItems[i + 1], margin + colW, currentY);
      doc.setDrawColor(235, 235, 235);
      doc.setLineWidth(0.3);
      doc.line(margin, currentY + rowH - 1, pageWidth - margin, currentY + rowH - 1);
      currentY += rowH;
    }

    if (regularItems.length > 0) { doc.addPage(); currentY = 20; }
  }

  // ── Regular items pages ─────────────────────────────────────────────────────
  // Header (first page or after colour section)
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
  doc.text(`Supplier: ${supplierName}`, pageWidth - margin, currentY, { align: "right" });

  currentY += 15;

  const items = regularItems.length > 0 ? regularItems : (colourItems.length === 0 ? cart : []);
  const itemsPerPage = 4;
  const chunks: POCartItem[][] = [];
  for (let i = 0; i < items.length; i += itemsPerPage) {
    chunks.push(items.slice(i, i + itemsPerPage));
  }

  for (let pageIdx = 0; pageIdx < chunks.length; pageIdx++) {
    const chunk = chunks[pageIdx];
    if (pageIdx > 0) {
      doc.addPage(); currentY = 20;
      doc.setFontSize(12);
      doc.setTextColor(37, 99, 235);
      doc.text(`Purchase Order (continued) — ${orderNum}`, margin, currentY);
      currentY += 10;
    }

    for (let idx = 0; idx < chunk.length; idx++) {
      const item    = chunk[idx];
      const product = item.product;
      const boxY    = currentY;
      const imgSize = 38;
      const boxH    = imgSize + 4;

      // Load image
      let imgData: string | null = null;
      let imgFormat = "JPEG";
      if (product.photo) {
        const result = await fetchProductImage(
          product.photo.startsWith("/") ? `${window.location.origin}${product.photo}` : product.photo
        );
        if (result) { imgData = result.data; imgFormat = result.format; }
      }

      // Box
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.4);
      doc.roundedRect(margin, boxY, pageWidth - margin * 2, boxH, 2, 2);

      // Image
      if (imgData) {
        doc.addImage(imgData, imgFormat, margin + 2, boxY + 2, imgSize, imgSize);
      } else {
        doc.setFillColor(243, 244, 246);
        doc.rect(margin + 2, boxY + 2, imgSize, imgSize, "F");
        doc.setFontSize(7);
        doc.setTextColor(160, 160, 160);
        doc.text("No image", margin + 2 + imgSize / 2, boxY + 2 + imgSize / 2, { align: "center" });
      }

      const col2x = margin + imgSize + 6;

      // Barcode (EAN / SKU)
      doc.setFontSize(7); doc.setTextColor(120, 120, 120);
      doc.text("EAN:", col2x, boxY + 8);
      doc.setFontSize(9); doc.setTextColor(30, 30, 30);
      doc.text(product.ean || product.sku || "—", col2x, boxY + 13);

      // Supplier code (AKI / SKU)
      doc.setFontSize(7); doc.setTextColor(120, 120, 120);
      doc.text("Code:", col2x, boxY + 21);
      doc.setFontSize(8); doc.setTextColor(30, 30, 30);
      doc.text(product.aki_code || product.sku || "N/A", col2x, boxY + 26);

      // Product name
      const col3x    = col2x + 42;
      const qtyColX  = pageWidth - margin - 48;
      const nameWidth = qtyColX - col3x - 3;
      doc.setFontSize(9); doc.setTextColor(0, 0, 0);
      const nameLines = doc.splitTextToSize(product.name, nameWidth);
      doc.text(nameLines.slice(0, 4), col3x, boxY + 9);

      const subY = boxY + 9 + Math.min(nameLines.length, 4) * 3.8 + 2;
      doc.setFontSize(7.5); doc.setTextColor(120, 120, 120);
      doc.text(product.sub_category || product.brand || "", col3x, subY);

      // Qty & FOC
      doc.setFontSize(10); doc.setTextColor(37, 99, 235);
      doc.text(`Qty: ${item.quantity}`, qtyColX, boxY + 12);
      if ((item.foc ?? 0) > 0) {
        doc.setFontSize(9); doc.setTextColor(16, 185, 129);
        doc.text(`FOC: ${item.foc}`, qtyColX, boxY + 20);
      }

      // Price
      const price = product.price || 0;
      doc.setFontSize(10); doc.setTextColor(0, 0, 0);
      doc.text(`${price.toFixed(2)}`, pageWidth - margin - 2, boxY + 30, { align: "right" });
      doc.setFontSize(8); doc.setTextColor(120, 120, 120);
      doc.text(`Line: ${(price * item.quantity).toFixed(2)}`, pageWidth - margin - 2, boxY + 36, { align: "right" });

      currentY += boxH + 4;
    }

    doc.setFontSize(8); doc.setTextColor(150, 150, 150);
    doc.text(`Page ${pageIdx + 1} of ${chunks.length}`, pageWidth / 2, pageHeight - 10, { align: "center" });
  }

  // ── Summary page ────────────────────────────────────────────────────────────
  doc.addPage(); currentY = 20;
  doc.setFontSize(16); doc.setTextColor(37, 99, 235);
  doc.text("ORDER SUMMARY", pageWidth / 2, currentY, { align: "center" });
  currentY += 15;

  autoTable(doc, {
    startY: currentY,
    head: [["EA Barcode", "Code", "Description", "Qty", "FOC", "UOM", "Price", "Total"]],
    body: cart.map((item) => [
      item.product.ean || item.product.sku || "—",
      item.product.aki_code || item.product.sku || "—",
      item.product.name,
      item.quantity,
      item.foc ?? 0,
      item.product.uom || "EA",
      (item.product.price || 0).toFixed(2),
      ((item.product.price || 0) * item.quantity).toFixed(2),
    ]),
    theme: "striped",
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    styles: { fontSize: 8.5 },
    columnStyles: { 3: { halign: "center" }, 4: { halign: "center" }, 6: { halign: "right" }, 7: { halign: "right" } },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 10;
  const totalQty   = cart.reduce((s, i) => s + i.quantity, 0);
  const totalFoc   = cart.reduce((s, i) => s + (i.foc ?? 0), 0);
  const totalValue = cart.reduce((s, i) => s + (i.product.price || 0) * i.quantity, 0);

  doc.setFontSize(12); doc.setTextColor(0, 0, 0);
  doc.text(`Total Items: ${totalQty}`, margin, finalY);
  if (totalFoc > 0) doc.text(`Total FOC: ${totalFoc}`, margin, finalY + 6);
  doc.setFontSize(14); doc.setTextColor(37, 99, 235);
  doc.text(`TOTAL ORDER VALUE: ${totalValue.toFixed(2)}`, pageWidth - margin, finalY, { align: "right" });

  // ── Disclaimer on every page ─────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  const disclaimer = "Please check with Supplier to apply your specific Salon discount, these prices are gross from the Suppliers Price List";
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7); doc.setTextColor(160, 160, 160);
    doc.text(disclaimer, pageWidth / 2, pageHeight - 5, { align: "center" });
  }

  doc.save(`PO-${orderNum}.pdf`);
  return orderNum;
}
