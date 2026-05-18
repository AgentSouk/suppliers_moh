"use client";

import React, { useState } from "react";
import { ShoppingCart, ArrowRight, Check, Loader2 } from "lucide-react";
import { saveSharedCart } from "@/lib/sharedCart";

interface CartItemRaw {
  id?: string;
  quantity?: number;
  product?: {
    name?: string; brand?: string | null; price?: number | null;
    photo?: string | null; ean?: string | null; sku?: string | null;
    aki_code?: string | null; sub_category?: string | null; uom?: string | null;
    id?: string; [key: string]: any;
  };
  [key: string]: any;
}

interface Props {
  cart: CartItemRaw[];
  location: string;
  supplierId: string;
  supplierLabel: string;
}

export default function ShareCartButton({ cart, location, supplierId, supplierLabel }: Props) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const share = async () => {
    if (!cart.length || state === "saving") return;
    setState("saving");
    try {
      const items = cart.map((i) => ({
        uid: i.product?.ean || i.product?.sku || i.product?.id || i.id || "",
        qty: i.quantity || 1,
        supplier: supplierId,
        supplierLabel,
        product: {
          name: i.product?.name || "",
          brand: i.product?.brand ?? null,
          price: i.product?.price ?? null,
          photo: i.product?.photo ?? null,
          ean: i.product?.ean ?? null,
          sku: i.product?.sku ?? null,
          aki_code: i.product?.aki_code ?? null,
          sub_category: i.product?.sub_category ?? null,
          uom: i.product?.uom ?? null,
        },
      }));

      const id = await saveSharedCart(items, location || "salon");
      const url = `${window.location.origin}/cart/${id}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      setState("saved");
      setTimeout(() => { window.location.href = `/cart/${id}`; }, 600);
    } catch (e: any) {
      console.error("ShareCartButton error:", e);
      // Show friendly message if table missing
      const msg = e?.message || JSON.stringify(e);
      if (msg.includes("does not exist") || msg === "{}" || !msg) {
        alert('The shared_carts table is missing in Supabase.\n\nRun this SQL in your Supabase dashboard:\n\ncreate table shared_carts (\n  id text primary key,\n  location text not null default \'\',\n  items jsonb not null default \'[]\',\n  created_by text not null default \'\',\n  created_at timestamptz not null default now(),\n  updated_at timestamptz not null default now()\n);\nalter table shared_carts enable row level security;\ncreate policy "public read" on shared_carts for select using (true);\ncreate policy "public write" on shared_carts for insert with check (true);\ncreate policy "public update" on shared_carts for update using (true);');
      } else {
        alert(`Could not create share link: ${msg}`);
      }
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  };

  if (cart.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={share}
        disabled={state === "saving"}
        className="group w-full h-11 flex items-center justify-center gap-2 rounded-xl font-semibold text-[14px] text-white transition-all disabled:cursor-wait active:translate-y-px"
        style={{
          background: state === "saved" ? "#10b981"
            : state === "error" ? "#ef4444"
            : "linear-gradient(135deg, #0091FF 0%, #006BC2 100%)",
          boxShadow: state === "idle" ? "0 1px 0 rgba(0,107,194,0.5), 0 4px 12px -2px rgba(0,145,255,0.35)" : "none",
        }}
      >
        {state === "saving" && <Loader2 size={16} className="animate-spin" />}
        {state === "saved" && <Check size={16} />}
        {state === "idle" && <ShoppingCart size={16} />}
        {state === "error" && "✕"}

        <span>
          {state === "saving" ? "Creating link…"
            : state === "saved" ? "Copied — opening…"
            : state === "error" ? "Failed — try again"
            : "Share with my team"}
        </span>

        {state === "idle" && (
          <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
        )}
      </button>
    </div>
  );
}
