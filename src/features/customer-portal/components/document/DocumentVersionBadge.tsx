import React from 'react';
import { History } from 'lucide-react';
import { formatDate } from '../../utils/formatters';

interface DocumentVersionBadgeProps {
  /**
   * ERP document version (existing ERP quotation rows carry a `version`
   * column that increments on every revision). Nothing is rendered for
   * version 1 (the original issue) or when no version data exists — version
   * information must stay secondary metadata.
   */
  version?: number | null;
  /** Revision/update timestamp shown alongside the badge (ISO string). */
  revisedAt?: string | null;
}

/**
 * Compact, professional revision indicator for a Portal document.
 *
 * Renders only when the ERP data actually reports a revised document
 * (version > 1). Never exposes database ids or technical implementation
 * details to the customer.
 */
export const DocumentVersionBadge: React.FC<DocumentVersionBadgeProps> = ({ version, revisedAt }) => {
  const numeric = Number(version);
  if (!Number.isFinite(numeric) || numeric < 2) return null;

  const revised = revisedAt ? formatDate(revisedAt) : null;
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[10px] font-extrabold">
      <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 uppercase tracking-wide text-indigo-700">
        <History className="h-3 w-3" aria-hidden="true" />
        Revision {numeric}
      </span>
      {revised && (
        <span className="font-bold normal-case tracking-normal text-slate-400">Revised {revised}</span>
      )}
    </span>
  );
};
