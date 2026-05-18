/**
 * Global session cart — one Supabase shared_cart per browser session.
 * Persists 2 days, then prompts user on return.
 */

const KEY_ID  = "global_cart_id";
const KEY_TS  = "global_cart_ts";
const TTL_MS  = 2 * 24 * 60 * 60 * 1000; // 2 days

export function getStoredCartId(): string | null {
  if (typeof window === "undefined") return null;
  const id = localStorage.getItem(KEY_ID);
  const ts = localStorage.getItem(KEY_TS);
  if (!id || !ts) return null;
  if (Date.now() - parseInt(ts, 10) > TTL_MS) return null; // expired
  return id;
}

export function isCartExpired(): boolean {
  if (typeof window === "undefined") return false;
  const id = localStorage.getItem(KEY_ID);
  const ts = localStorage.getItem(KEY_TS);
  if (!id || !ts) return false;
  return Date.now() - parseInt(ts, 10) > TTL_MS;
}

export function storeCartId(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_ID, id);
  localStorage.setItem(KEY_TS, Date.now().toString());
}

export function clearStoredCart() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY_ID);
  localStorage.removeItem(KEY_TS);
}

export function touchCartTimestamp() {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_TS, Date.now().toString());
}
