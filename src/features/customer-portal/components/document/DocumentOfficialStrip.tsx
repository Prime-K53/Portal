import React from 'react';
import { ShieldCheck } from 'lucide-react';

interface DocumentOfficialStripProps {
  /** e.g. 'Invoice', 'Quotation', 'Order', 'Receipt', 'Delivery Note'. */
  kindLabel: string;
  /** Optional explanatory copy (defaults to the standard distinction line). */
  description?: React.ReactNode;
  /** Optional error/notice slot rendered above the strip. */
  notice?: React.ReactNode;
  /** Right-hand controls (download/preview buttons, spinners…). */
  controls?: React.ReactNode;
}

/**
 * Presentational strip shared by every Portal document view. It clearly
 * separates the interactive Portal HTML view (what the customer is reading)
 * from the official ERP document (the authoritative downloadable PDF).
 *
 * Consumers decide how their official document is produced (auto-loaded blob
 * via `useOfficialDocument`, or a lazy/on-demand ERP download) — this
 * component only owns the layout and copy.
 */
export const DocumentOfficialStrip: React.FC<DocumentOfficialStripProps> = ({
  kindLabel,
  description,
  notice,
  controls,
}) => {
  const label = kindLabel.toLowerCase();
  return (
    <div className="space-y-2.5">
      {notice}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-slate-800">Official ERP {kindLabel}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
              {description ??
                `Downloadable PDF issued by Prime ERP — the official record of this ${label}. The view above is a convenient online reading experience.`}
            </p>
          </div>
        </div>
        {controls && <div className="flex shrink-0 items-center justify-end gap-2">{controls}</div>}
      </div>
    </div>
  );
};
