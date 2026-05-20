"use client";

import React, { useState } from "react";
import { Barcode, X } from "lucide-react";

interface Product {
  id?: string | null;
  ean?: string | null;
  sku?: string | null;
  [key: string]: any;
}

interface Props {
  products: Product[];
  /** Called for each matched product with the qty from the paste */
  onMatch: (product: Product, qty: number) => void;
  /** Which field(s) to match on — defaults to ean then sku */
  matchFields?: string[];
}

export default function UploadQuoteButton({ products, onMatch, matchFields = ["ean", "sku"] }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ matched: number; unmatched: string[] } | null>(null);

  const buildIndex = () => {
    const index: Record<string, Product> = {};
    for (const p of products) {
      for (const field of matchFields) {
        const val = (p as any)[field];
        if (val) index[String(val).trim()] = p;
      }
    }
    return index;
  };

  const importQuote = () => {
    const index = buildIndex();
    const unmatched: string[] = [];
    let matched = 0;

    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const parts = line.split(/\t|,|;|\s+/).map((s) => s.trim()).filter(Boolean);
      if (parts.length < 2) continue;
      const code = parts[0].replace(/[^0-9A-Za-z\-_]/g, "");
      const qty = parseInt(parts[parts.length - 1], 10);
      if (!code || isNaN(qty) || qty < 1) continue;

      const product = index[code];
      if (!product) {
        unmatched.push(`${parts[0]} (qty ${qty})`);
        continue;
      }
      onMatch(product, qty);
      matched++;
    }

    setResult({ matched, unmatched });
    setText("");
  };

  const close = () => { setOpen(false); setResult(null); setText(""); };

  return (
    <>
      <button
        onClick={() => { setOpen(true); setResult(null); setText(""); }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <Barcode className="w-3.5 h-3.5 text-slate-400" />
        <span className="hidden sm:inline">Upload Quote</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 px-4 py-6 flex items-start justify-center sm:items-center">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
                  <Barcode className="w-5 h-5 text-slate-400" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 text-[15px]">Upload Quote</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">Paste 2 columns from Excel: Barcode + Quantity</p>
                </div>
              </div>
              <button onClick={close} className="text-slate-400 hover:text-slate-600 mt-0.5">
                <X className="w-5 h-5" />
              </button>
            </div>

            {!result ? (
              <>
                <textarea
                  className="w-full h-52 border border-slate-200 rounded-xl p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none text-slate-800 placeholder-slate-300"
                  placeholder={"3474637155025\t2\n3474636977369\t5\n30167476\t1\n..."}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-3 mt-3">
                  <button onClick={close}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={importQuote}
                    disabled={!text.trim()}
                    className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 disabled:opacity-30 transition-colors">
                    Import to Cart
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-3">
                  <p className="text-green-700 font-semibold text-sm">
                    ✓ {result.matched} product{result.matched !== 1 ? "s" : ""} added to cart
                  </p>
                </div>
                {result.unmatched.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-3">
                    <p className="text-red-700 font-semibold text-sm mb-2">
                      ✗ {result.unmatched.length} not found:
                    </p>
                    <ul className="text-xs text-red-600 space-y-0.5 max-h-32 overflow-y-auto">
                      {result.unmatched.map((u, i) => <li key={i}>{u}</li>)}
                    </ul>
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={() => { setResult(null); setText(""); }}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors">
                    Paste More
                  </button>
                  <button onClick={close}
                    className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-colors">
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
