"use client";
import { useState, useEffect } from "react";

interface PaginatedGridProps<T> {
  items: T[];
  pageSize?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  gridClassName?: string;
  resetKey?: string | number;  // when filters change, reset to page 1
}

export default function PaginatedGrid<T>({
  items,
  pageSize = 48,
  renderItem,
  gridClassName = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3",
  resetKey,
}: PaginatedGridProps<T>) {
  const [visible, setVisible] = useState(pageSize);

  // Reset to first page when items change (filter applied)
  useEffect(() => { setVisible(pageSize); }, [resetKey, pageSize]);

  const shown = items.slice(0, visible);
  const remaining = items.length - visible;

  return (
    <div>
      <div className={gridClassName}>
        {shown.map((item, i) => renderItem(item, i))}
      </div>

      {remaining > 0 && (
        <div className="mt-6 flex flex-col items-center gap-1">
          <button
            onClick={() => setVisible((v) => v + pageSize)}
            className="px-6 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            Show {Math.min(remaining, pageSize)} more
            <span className="ml-2 text-xs text-gray-400">({items.length - visible} remaining)</span>
          </button>
        </div>
      )}
    </div>
  );
}
