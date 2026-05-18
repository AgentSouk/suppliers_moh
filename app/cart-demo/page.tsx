"use client";

import { useState } from "react";
import { ShoppingCart } from "lucide-react";
import CartPanel from "@/components/CartPanel";

export default function CartDemoPage() {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 h-10 px-5 rounded-[10px] bg-brand text-white text-sm font-semibold hover:bg-brand-600 transition-colors shadow-md"
      >
        <ShoppingCart className="w-4 h-4" />
        Open Cart
      </button>

      {/* Slide-over */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />
          {/* Panel — pinned to right edge */}
          <div className="fixed right-0 top-0 z-50 h-screen w-[440px]">
            <CartPanel onClose={() => setOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
}
