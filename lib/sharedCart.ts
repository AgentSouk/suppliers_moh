/**
 * Shared cart persistence — save to / load from Supabase shared_carts table.
 * URL format: /cart/[id]  (e.g. /cart/xK9mP2)
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Nanoid-style short ID (URL-safe, 8 chars) ─────────────────────────────────
function shortId(): string {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let id = "";
  const arr = crypto.getRandomValues(new Uint8Array(8));
  for (const byte of arr) id += alpha[byte % alpha.length];
  return id;
}

export interface SharedCartItem {
  uid: string;          // EAN / SKU / product ID — whatever resolves in the JSON
  qty: number;
  supplier: string;     // supplier id key e.g. "milia"
  supplierLabel: string;
  product: {            // full product snapshot so the page can render without re-fetching
    name: string;
    brand?: string | null;
    price?: number | null;
    photo?: string | null;
    photo_sm?: string | null;
    ean?: string | null;
    sku?: string | null;
    aki_code?: string | null;
    sub_category?: string | null;
    uom?: string | null;
    [key: string]: any;
  };
}

export interface SharedCartRecord {
  id: string;
  location: string;
  items: SharedCartItem[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ── Save a new shared cart → returns the short ID ────────────────────────────
export async function saveSharedCart(
  items: SharedCartItem[],
  location: string,
  createdBy = ""
): Promise<string> {
  const id = shortId();
  const { error } = await supabase.from("shared_carts").insert({
    id,
    location,
    items,
    created_by: createdBy,
  });
  if (error) throw error;
  return id;
}

// ── Update an existing shared cart ───────────────────────────────────────────
export async function updateSharedCart(
  id: string,
  items: SharedCartItem[]
): Promise<void> {
  const { error } = await supabase
    .from("shared_carts")
    .update({ items, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ── Load a shared cart by ID ──────────────────────────────────────────────────
export async function loadSharedCart(id: string): Promise<SharedCartRecord | null> {
  const { data, error } = await supabase
    .from("shared_carts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as SharedCartRecord;
}
