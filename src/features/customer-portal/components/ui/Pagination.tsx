import React from 'react';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  pageSizeOptions?: number[];
}

export function Pagination({ page, pageSize, total, onPageChange, pageSizeOptions = [10, 25, 50] }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  if (total <= pageSize) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">
          {start}–{end} of {total}
        </span>
        <select
          value={pageSize}
          onChange={(e) => onPageChange(1)}
          className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size} / page
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Previous
        </button>
        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
          let p;
          if (totalPages <= 5) {
            p = i + 1;
          } else if (page <= 3) {
            p = i + 1;
          } else if (page >= totalPages - 2) {
            p = totalPages - 4 + i;
          } else {
            p = page - 2 + i;
          }
          return (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={`w-8 h-8 text-xs font-bold rounded-lg transition ${
                page === p ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {p}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Next
        </button>
      </div>
    </div>
  );
}