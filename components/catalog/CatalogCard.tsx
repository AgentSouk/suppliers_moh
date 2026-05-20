"use client";
import { Minus, Plus } from "lucide-react";
import LazyImage from "@/components/ui/LazyImage";

export interface CatalogCardProduct {
  id: string;
  name: string;
  brand?: string | null;
  subLabel?: string | null;   // sub_category, category, etc.
  price?: number | null;
  photo?: string | null;
  photo_sm?: string | null;
  sku?: string | null;
  ean?: string | null;
  available?: boolean;
}

interface CatalogCardProps {
  product: CatalogCardProduct;
  accentColor?: string;       // supplier brand color
  cartQty: number;            // 0 = not in cart
  onAdd: () => void;
  onInc: () => void;
  onDec: () => void;
  onClick?: () => void;       // open detail panel
}

export default function CatalogCard({
  product, accentColor = "#2563eb", cartQty, onAdd, onInc, onDec, onClick,
}: CatalogCardProps) {
  const imgSrc = product.photo_sm || product.photo || null;
  const codeLabel = product.ean || product.sku || null;
  const topLabel = product.brand || product.subLabel || null;
  const inCart = cartQty > 0;

  return (
    <div
      className="rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow flex flex-col bg-white"
      style={inCart ? { borderColor: accentColor, boxShadow: `0 0 0 1px ${accentColor}22` } : {}}
    >
      {/* Image */}
      <div
        className="relative bg-gray-50 overflow-hidden cursor-pointer"
        style={{ height: "11rem" }}
        onClick={onClick}
      >
        <LazyImage
          src={imgSrc}
          alt={product.name}
          className="w-full h-full"
          imgClassName="object-contain p-3"
        />
        {product.available === false && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-600">
            Out of stock
          </span>
        )}
        {inCart && (
          <span
            className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
            style={{ background: accentColor }}
          >
            ✓ {cartQty}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-3 flex flex-col flex-1 gap-1">
        {topLabel && (
          <p className="text-[10px] font-semibold uppercase tracking-wide truncate" style={{ color: accentColor }}>
            {topLabel}
          </p>
        )}
        <h3
          className="text-xs font-semibold leading-tight line-clamp-2 flex-1 text-gray-900 cursor-pointer hover:underline"
          onClick={onClick}
        >
          {product.name}
        </h3>
        {codeLabel && (
          <p className="font-mono text-[10px] text-gray-400 truncate">{codeLabel}</p>
        )}

        {/* Price + cart */}
        <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-gray-100">
          <span className="text-sm font-bold text-gray-900">
            {product.price != null && product.price > 0
              ? <>{product.price.toFixed(2)} <span className="text-[10px] font-normal text-gray-400">AED</span></>
              : <span className="text-xs text-gray-400">—</span>
            }
          </span>

          {inCart ? (
            <div className="flex items-center gap-1">
              <button
                onClick={onDec}
                className="w-7 h-7 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-50"
              >
                <Minus className="w-3 h-3 text-gray-500" />
              </button>
              <span className="w-6 text-center text-xs font-bold text-gray-900">{cartQty}</span>
              <button
                onClick={onInc}
                className="w-7 h-7 rounded flex items-center justify-center text-white"
                style={{ background: accentColor }}
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={onAdd}
              className="h-7 px-3 rounded text-xs font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: accentColor }}
            >
              Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
