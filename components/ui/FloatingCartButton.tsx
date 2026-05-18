"use client";

import { ShoppingCart } from "lucide-react";
import { useGlobalCart } from "./GlobalCartContext";
import { usePathname } from "next/navigation";

export default function FloatingCartButton() {
  const { itemCount, openCart, cartId } = useGlobalCart();
  const pathname = usePathname();

  // Hide on the cart page itself
  if (pathname.startsWith("/cart/")) return null;
  if (!cartId && itemCount === 0) return null;

  return (
    <button
      onClick={openCart}
      aria-label="Open cart"
      className="fixed bottom-6 right-5 z-[999] flex items-center gap-2 h-12 pl-3.5 pr-4 rounded-full shadow-lg text-white text-[13px] font-semibold transition-all active:scale-95"
      style={{ background: "linear-gradient(135deg, #0091FF 0%, #006BC2 100%)", boxShadow: "0 4px 20px -2px rgba(0,145,255,0.5)" }}
    >
      <ShoppingCart size={18} />
      {itemCount > 0 && (
        <span className="tabular-nums">{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
      )}
      {itemCount === 0 && <span>View cart</span>}
    </button>
  );
}
