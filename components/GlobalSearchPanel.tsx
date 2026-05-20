"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";

export default function GlobalSearchPanel({ dark = false }: { dark?: boolean }) {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/suppliers/search?q=${encodeURIComponent(q)}`);
  };

  if (dark) {
    return (
      <form onSubmit={submit} className="w-full max-w-xl mx-auto">
        <div className="flex items-center gap-3 px-4 py-3">
          <Search className="w-4 h-4 text-white/40 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products across all suppliers…"
            className="flex-1 bg-transparent outline-none text-sm text-white placeholder-white/35"
          />
          {query.trim() && (
            <button
              type="submit"
              className="bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-white/30 transition-colors border border-white/25"
            >
              Search
            </button>
          )}
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="w-full max-w-xl mx-auto">
      <div className="flex items-center gap-3 bg-white border border-blue-200 rounded-2xl px-4 py-3 shadow-sm focus-within:border-blue-400 focus-within:shadow-md transition-all">
        <Search className="w-4 h-4 text-blue-400 shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products across all suppliers…"
          className="flex-1 bg-transparent outline-none text-sm text-gray-700 placeholder-gray-400"
        />
        {query.trim() && (
          <button
            type="submit"
            className="bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Search
          </button>
        )}
      </div>
    </form>
  );
}
