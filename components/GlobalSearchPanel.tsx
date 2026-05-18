"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";

export default function GlobalSearchPanel() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/suppliers/search?q=${encodeURIComponent(q)}`);
  };

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
