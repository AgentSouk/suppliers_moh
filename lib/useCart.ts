"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface CartItem {
  id: string;
  quantity: number;
  foc: number;
  product: any;
}

export interface HistoryEntry {
  date: string;
  orderNum: string;
  items: number;
  value: number;
}

export function useCart(supplier: "loreal" | "nazih" | "wella" | "skeyndor" | "victoriavynn" | "madi" | "milia" | "awarid" | "nawajm" | "albasel") {
  const localCartKey = `${supplier}_cart`;
  const localHistoryKey = `${supplier}_order_history`;

  const [cart, setCart] = useState<CartItem[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(localCartKey) || "[]"); } catch { return []; }
  });

  const [orderHistory, setOrderHistory] = useState<HistoryEntry[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(localHistoryKey) || "[]"); } catch { return []; }
  });

  const [location, setLocation] = useState("");

  // Load location + sync cart from Supabase on mount
  useEffect(() => {
    const loc = localStorage.getItem("salon_location") || "";
    setLocation(loc);
    if (!loc) return;
    supabase
      .from("loreal_saved_carts")
      .select("cart_data")
      .eq("location", `${loc}::${supplier}`)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.cart_data && Array.isArray(data.cart_data) && (data.cart_data as CartItem[]).length > 0) {
          const supaCart = data.cart_data as CartItem[];
          // Merge: keep supabase as base, add local items not yet synced (e.g. added via global search)
          setCart((prev) => {
            const merged = [...supaCart];
            for (const localItem of prev) {
              if (!merged.find((c) => c.product?.id === localItem.product?.id)) {
                merged.push(localItem);
              }
            }
            return merged;
          });
        }
      });
  }, [supplier]);

  // Persist cart to localStorage + Supabase
  useEffect(() => {
    try {
      localStorage.setItem(localCartKey, JSON.stringify(cart));
      if (cart.length > 0) localStorage.setItem(`${supplier}_cart_ts`, new Date().toLocaleString());
    } catch {}
    if (!location) return;
    supabase
      .from("loreal_saved_carts")
      .upsert(
        { location: `${location}::${supplier}`, cart_data: cart, updated_at: new Date().toISOString() },
        { onConflict: "location" }
      )
      .then(() => {});
  }, [cart, location, supplier, localCartKey]);

  const addToCart = useCallback((product: Record<string, any>, itemId: string) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) return prev.map((c) => c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { id: itemId, product, quantity: 1, foc: 0 }];
    });
  }, []);

  const removeFromCart = useCallback((cartItemId: string) => {
    setCart((prev) => prev.filter((c) => c.id !== cartItemId));
  }, []);

  const updateQuantity = useCallback((cartItemId: string, newQty: number) => {
    if (newQty < 1) return;
    setCart((prev) => prev.map((c) => c.id === cartItemId ? { ...c, quantity: newQty } : c));
  }, []);

  const updateFOC = useCallback((cartItemId: string, newFoc: number) => {
    setCart((prev) => prev.map((c) => c.id === cartItemId ? { ...c, foc: newFoc } : c));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const saveToHistory = useCallback((orderNum: string, value: number) => {
    const entry: HistoryEntry = {
      date: new Date().toLocaleString(),
      orderNum,
      items: cart.length,
      value,
    };
    setOrderHistory((prev) => {
      const updated = [entry, ...prev].slice(0, 50);
      try { localStorage.setItem(localHistoryKey, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, [cart.length, localHistoryKey]);

  const clearHistory = useCallback(() => {
    setOrderHistory([]);
    try { localStorage.removeItem(localHistoryKey); } catch {}
  }, [localHistoryKey]);

  const cartTotals = cart.reduce(
    (acc, item) => ({
      totalQty: acc.totalQty + item.quantity,
      totalFoc: acc.totalFoc + (item.foc || 0),
      totalValue: acc.totalValue + (item.product.price || 0) * item.quantity,
    }),
    { totalQty: 0, totalFoc: 0, totalValue: 0 }
  );

  return {
    cart, setCart,
    location, setLocation,
    orderHistory,
    cartTotals,
    addToCart,
    removeFromCart,
    updateQuantity,
    updateFOC,
    clearCart,
    saveToHistory,
    clearHistory,
  };
}
