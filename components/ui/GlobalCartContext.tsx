"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { saveSharedCart, updateSharedCart, loadSharedCart, type SharedCartItem } from "@/lib/sharedCart";
import { getStoredCartId, isCartExpired, storeCartId, clearStoredCart, touchCartTimestamp } from "@/lib/globalCart";

interface GlobalCartCtx {
  cartId: string | null;
  items: SharedCartItem[];
  itemCount: number;
  addItem: (item: Omit<SharedCartItem, "qty"> & { qty?: number }) => Promise<void>;
  removeItem: (uid: string, supplier: string) => void;
  updateQty: (uid: string, supplier: string, qty: number) => void;
  openCart: () => void;
  ready: boolean;
}

const Ctx = createContext<GlobalCartCtx>({
  cartId: null, items: [], itemCount: 0,
  addItem: async () => {}, removeItem: () => {}, updateQty: () => {},
  openCart: () => {}, ready: false,
});

export function useGlobalCart() { return useContext(Ctx); }

export function GlobalCartProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [cartId, setCartId] = useState<string | null>(null);
  const [items, setItems] = useState<SharedCartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [showExpiredModal, setShowExpiredModal] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Init on mount ──────────────────────────────────────────────────────────
  useEffect(() => {
    const expired = isCartExpired();
    const id = expired ? null : getStoredCartId();

    if (expired) {
      setShowExpiredModal(true);
      setReady(true);
      return;
    }

    if (id) {
      loadSharedCart(id).then((rec) => {
        if (rec) {
          setCartId(id);
          setItems(rec.items || []);
          touchCartTimestamp();
        } else {
          clearStoredCart();
        }
        setReady(true);
      });
    } else {
      setReady(true);
    }
  }, []);

  // ── Debounced save to Supabase ─────────────────────────────────────────────
  const scheduleSave = useCallback((id: string, next: SharedCartItem[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateSharedCart(id, next).catch(() => {});
      touchCartTimestamp();
    }, 800);
  }, []);

  // ── Ensure a cart exists, return its ID ───────────────────────────────────
  const ensureCart = useCallback(async (): Promise<string> => {
    if (cartId) return cartId;
    const location = localStorage.getItem("salon_location") || "session";
    const id = await saveSharedCart([], location);
    storeCartId(id);
    setCartId(id);
    return id;
  }, [cartId]);

  // ── Add item ───────────────────────────────────────────────────────────────
  const addItem = useCallback(async (raw: Omit<SharedCartItem, "qty"> & { qty?: number }) => {
    const item: SharedCartItem = { ...raw, qty: raw.qty ?? 1 };
    const id = await ensureCart();
    setItems((prev) => {
      const existing = prev.find((i) => i.uid === item.uid && i.supplier === item.supplier);
      const next = existing
        ? prev.map((i) => i.uid === item.uid && i.supplier === item.supplier ? { ...i, qty: i.qty + (item.qty ?? 1) } : i)
        : [...prev, item];
      scheduleSave(id, next);
      return next;
    });
  }, [ensureCart, scheduleSave]);

  // ── Remove item ────────────────────────────────────────────────────────────
  const removeItem = useCallback((uid: string, supplier: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => !(i.uid === uid && i.supplier === supplier));
      if (cartId) scheduleSave(cartId, next);
      return next;
    });
  }, [cartId, scheduleSave]);

  // ── Update qty ─────────────────────────────────────────────────────────────
  const updateQty = useCallback((uid: string, supplier: string, qty: number) => {
    setItems((prev) => {
      const next = prev.map((i) => i.uid === uid && i.supplier === supplier ? { ...i, qty: Math.max(1, qty) } : i);
      if (cartId) scheduleSave(cartId, next);
      return next;
    });
  }, [cartId, scheduleSave]);

  const openCart = useCallback(() => {
    if (cartId) router.push(`/cart/${cartId}`);
  }, [cartId, router]);

  const startFresh = useCallback(async () => {
    clearStoredCart();
    setCartId(null);
    setItems([]);
    setShowExpiredModal(false);
  }, []);

  const continueOld = useCallback(async () => {
    const id = localStorage.getItem("global_cart_id");
    if (!id) { setShowExpiredModal(false); return; }
    const rec = await loadSharedCart(id);
    if (rec) {
      storeCartId(id);
      setCartId(id);
      setItems(rec.items || []);
    } else {
      clearStoredCart();
    }
    setShowExpiredModal(false);
  }, []);

  const itemCount = items.reduce((s, i) => s + i.qty, 0);

  return (
    <Ctx.Provider value={{ cartId, items, itemCount, addItem, removeItem, updateQty, openCart, ready }}>
      {children}
      {showExpiredModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 flex flex-col gap-4">
            <div className="text-[15px] font-semibold text-slate-900">Welcome back!</div>
            <p className="text-[13px] text-slate-500 leading-relaxed">
              Your last cart is still available. Would you like to continue where you left off, or start a fresh cart?
            </p>
            <div className="flex gap-2">
              <button onClick={startFresh}
                className="flex-1 h-10 rounded-xl border border-[#ECEFF3] text-[13px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                Start fresh
              </button>
              <button onClick={continueOld}
                className="flex-1 h-10 rounded-xl bg-[#0091FF] text-white text-[13px] font-semibold hover:bg-[#0080E5] transition-colors">
                Continue last cart
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
