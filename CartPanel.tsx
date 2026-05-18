"use client";

import { useState } from "react";
import {
  ShoppingCart,
  X,
  History,
  Minus,
  Plus,
  Trash2,
  FileText,
  FileSpreadsheet,
  Copy,
  Check,
  ArrowRight,
  Undo2,
  Send,
} from "lucide-react";

/* ---------- Types & mock data ---------- */
type CartItem = {
  id: string;
  brand: string;
  title: string;
  ean: string;
  sku: string;
  qty: number;
  price: number;
  removed?: boolean;
};

const INITIAL_ITEMS: CartItem[] = [
  { id: "a", brand: "ONETECH",   title: "Onetech Metal Hair Clips | Metallic Silver | 1 Pc", ean: "98000000061678", sku: "15910543", qty: 1, price: 11.00 },
  { id: "b", brand: "ONETECH",   title: "Onetech Hair Clips Assorted Color | 1 X 6 PCS",    ean: "98000000061986", sku: "12490045", qty: 1, price: 26.00 },
  { id: "c", brand: "WET BRUSH", title: "Wet Brush Pro Big Mouth Clips | 4 Pcs Assorted",   ean: "98000000054211", sku: "15910544", qty: 2, price: 12.35 },
];

const SHARE_URL =
  "https://nxcut.com/cart/salon/12300042013_1-12300042019_1-12300286_1-13930058_1-15910543_1-12490045_1";

/* ---------- Component ---------- */
export default function CartPanel({ onClose }: { onClose?: () => void }) {
  const [items, setItems] = useState<CartItem[]>(INITIAL_ITEMS);
  const [copied, setCopied] = useState(false);

  const visible = items.filter((i) => !i.removed);
  const totalQty = visible.reduce((s, i) => s + i.qty, 0);
  const subtotal = visible.reduce((s, i) => s + i.qty * i.price, 0);
  const vat = subtotal * 0.05;
  const total = subtotal + vat;

  const updateQty = (id: string, delta: number) =>
    setItems((arr) =>
      arr.map((i) => (i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i))
    );
  const remove = (id: string) =>
    setItems((arr) => arr.map((i) => (i.id === id ? { ...i, removed: true } : i)));
  const undo = (id: string) =>
    setItems((arr) => arr.map((i) => (i.id === id ? { ...i, removed: false } : i)));
  const clear = () => {
    if (confirm("Clear all items from the cart?")) setItems([]);
  };
  const copyLink = async () => {
    await navigator.clipboard.writeText(SHARE_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <aside
      aria-label="Cart"
      className="grid h-screen max-h-screen w-[440px] grid-rows-[auto_1fr_auto] border-l border-slate-200 bg-white shadow-2xl"
    >
      {/* ---- Header ---- */}
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2.5 overflow-hidden border-b border-slate-200 bg-gradient-to-b from-slate-50/60 to-white px-5 py-4">
        <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-sky-50 text-sky-500">
          <ShoppingCart size={18} />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h2 className="m-0 text-[16px] font-semibold tracking-tight text-slate-900">Cart</h2>
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-sky-500 px-1.5 text-[11.5px] font-semibold tabular-nums text-white">
              {totalQty}
            </span>
          </div>
          <div className="truncate text-[13px] text-slate-500">
            for <b className="font-semibold text-slate-900">Nazih</b> · Salon B2B
          </div>
        </div>
        <button
          type="button"
          aria-label="History"
          className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-[13px] font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
        >
          <History size={14} />
          History
        </button>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="grid h-[34px] w-[34px] place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <X size={18} />
        </button>
      </header>

      {/* ---- Items ---- */}
      <div
        className="flex flex-col gap-2.5 overflow-y-auto p-4"
        style={{ scrollbarWidth: "thin" }}
      >
        {items.length === 0 ? (
          <EmptyState />
        ) : (
          items.map((it) => (
            <CartRow
              key={it.id}
              item={it}
              onQty={updateQty}
              onRemove={remove}
              onUndo={undo}
            />
          ))
        )}
      </div>

      {/* ---- Footer ---- */}
      {items.length > 0 && (
        <footer className="flex min-w-0 flex-col gap-3 overflow-hidden border-t border-slate-200 bg-white px-4 py-4">
          {/* Totals */}
          <dl className="grid gap-1.5 text-[13px] text-slate-500">
            <Row label={`Subtotal · ${totalQty} items`} value={`${subtotal.toFixed(2)} AED`} />
            <Row label="VAT (5%)" value={`${vat.toFixed(2)} AED`} />
            <div className="mt-1 flex items-baseline justify-between border-t border-dashed border-slate-200 pt-2.5">
              <dt className="text-[14px] font-semibold text-slate-900">Total</dt>
              <dd className="text-[22px] font-bold tracking-tight tabular-nums text-slate-900">
                {total.toFixed(2)}
                <span className="ml-1 font-mono text-[11px] font-medium text-slate-500">AED</span>
              </dd>
            </div>
          </dl>

          {/* Primary CTA — share with team */}
          <button
            type="button"
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-sky-500 text-[15px] font-semibold text-white shadow-[0_1px_0_rgba(0,107,194,0.5),0_4px_12px_-2px_rgba(0,145,255,0.35)] transition-colors hover:bg-sky-600 active:translate-y-px"
          >
            <ShoppingCart size={18} />
            Share with my team
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
          </button>

          {/* Share row */}
          <div className="flex items-center gap-1.5 rounded-[10px] border border-slate-200 bg-slate-50 py-1.5 pl-3 pr-1.5">
            <span
              className="flex-1 min-w-0 overflow-hidden truncate font-mono text-[11.5px] font-medium text-slate-500"
              style={{ direction: "rtl", textAlign: "left" }}
              title={SHARE_URL}
            >
              {"\u2066" + SHARE_URL + "\u2069"}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={copyLink}
                aria-label="Copy link"
                className="grid h-7 w-7 place-items-center rounded-md text-slate-500 transition-colors hover:bg-white hover:text-slate-900"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
              <button
                type="button"
                aria-label="Send via WhatsApp"
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[#25D366] px-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#1FBB58]"
              >
                <Send size={12} />
                WhatsApp
              </button>
            </div>
          </div>

          {/* Secondary actions */}
          <div className="grid grid-cols-3 gap-1.5">
            <ActionBtn icon={<FileText size={14} />} label="PDF" />
            <ActionBtn icon={<FileSpreadsheet size={14} />} label="Excel" />
            <ActionBtn icon={<Trash2 size={14} />} label="Clear" danger onClick={clear} />
          </div>
        </footer>
      )}
    </aside>
  );
}

/* ---------- Subcomponents ---------- */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt>{label}</dt>
      <dd className="font-semibold tabular-nums text-slate-900">{value}</dd>
    </div>
  );
}

function CartRow({
  item,
  onQty,
  onRemove,
  onUndo,
}: {
  item: CartItem;
  onQty: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  onUndo: (id: string) => void;
}) {
  if (item.removed) {
    return (
      <div className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3.5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 opacity-50">
        <Thumb />
        <div className="min-w-0">
          <div className="font-mono text-[10.5px] font-medium uppercase tracking-wider text-sky-700">
            {item.brand}
          </div>
          <div className="line-clamp-2 text-[13.5px] font-medium text-slate-900 line-through">
            {item.title}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Removed</div>
        </div>
        <button
          type="button"
          onClick={() => onUndo(item.id)}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
        >
          <Undo2 size={13} />
          Undo
        </button>
      </div>
    );
  }
  return (
    <div className="grid min-w-0 grid-cols-[56px_minmax(0,1fr)_auto] gap-3.5 rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-slate-300">
      <Thumb />
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="font-mono text-[10.5px] font-medium uppercase tracking-wider text-sky-700">
          {item.brand}
        </div>
        <div className="line-clamp-2 text-[13.5px] font-medium leading-snug text-slate-900">
          {item.title}
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] font-medium text-slate-400">
          <span>SKU {item.sku}</span>
          <span className="h-[3px] w-[3px] rounded-full bg-slate-300" />
          <span>EAN {item.ean.slice(-6)}</span>
        </div>
        <div className="mt-1 flex items-center">
          <div
            role="group"
            aria-label="Quantity"
            className="inline-flex h-[30px] items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5"
          >
            <button
              type="button"
              aria-label="Decrease"
              disabled={item.qty <= 1}
              onClick={() => onQty(item.id, -1)}
              className="grid h-[26px] w-[26px] place-items-center rounded-md text-slate-600 transition-colors hover:bg-white hover:text-slate-900 hover:shadow-sm disabled:cursor-not-allowed disabled:bg-transparent disabled:text-slate-300 disabled:shadow-none"
            >
              <Minus size={14} />
            </button>
            <span className="min-w-[28px] text-center text-[13px] font-semibold tabular-nums text-slate-900">
              {item.qty}
            </span>
            <button
              type="button"
              aria-label="Increase"
              onClick={() => onQty(item.id, +1)}
              className="grid h-[26px] w-[26px] place-items-center rounded-md text-slate-600 transition-colors hover:bg-white hover:text-slate-900 hover:shadow-sm"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end justify-between gap-2">
        <button
          type="button"
          aria-label="Remove"
          onClick={() => onRemove(item.id)}
          className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 size={15} />
        </button>
        <span className="inline-flex items-baseline gap-1">
          <span className="text-[15px] font-bold tabular-nums tracking-tight text-slate-900">
            {(item.price * item.qty).toFixed(2)}
          </span>
          <span className="font-mono text-[10.5px] font-medium text-slate-500">AED</span>
        </span>
      </div>
    </div>
  );
}

function Thumb() {
  return (
    <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-slate-200 bg-gradient-to-br from-white to-slate-100">
      <div className="h-7 w-7 rounded-full bg-slate-300/70" />
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex h-[38px] items-center justify-center gap-1.5 rounded-[9px] border border-slate-200 bg-transparent text-[12.5px] font-medium text-slate-700 transition-colors " +
        (danger
          ? "hover:border-red-200 hover:bg-red-50 hover:text-red-600 [&_svg]:text-slate-500 [&:hover_svg]:text-red-600"
          : "hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 [&_svg]:text-slate-500 [&:hover_svg]:text-slate-700")
      }
    >
      {icon}
      {label}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3.5 px-6 py-12 text-center text-slate-500">
      <div className="grid h-20 w-20 place-items-center rounded-full bg-sky-50 text-sky-500">
        <ShoppingCart size={28} />
      </div>
      <h3 className="m-0 text-[16px] font-semibold text-slate-900">Your cart is empty</h3>
      <p className="m-0 max-w-[280px] text-[13.5px]">
        Add products from the catalogue and they'll show up here.
      </p>
      <button
        type="button"
        className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-[13px] font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
      >
        Browse catalogue
        <ArrowRight size={14} />
      </button>
    </div>
  );
}
