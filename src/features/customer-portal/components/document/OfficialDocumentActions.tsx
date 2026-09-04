import React from 'react';
import { Download, FileText, Loader2, RefreshCw } from 'lucide-react';
import type { OfficialDocumentState } from '../../hooks/useOfficialDocument';
import { DocumentOfficialStrip } from './DocumentOfficialStrip';

interface OfficialDocumentActionsProps {
  /** Live state of the loaded ERP PDF (useOfficialDocument). */
  state: OfficialDocumentState;
  /** 'Invoice' | 'Quotation' | 'Order' — used for button/copy labels. */
  kindLabel: 'Invoice' | 'Quotation' | 'Order';
  /** Opens the in-dialog PDF preview (blob is loaded from the ERP). */
  onViewPdf: () => void;
}

/**
 * Official-document actions for document views whose ERP PDF is auto-loaded
 * through `useOfficialDocument` (invoices, quotations, orders). Preview and
 * download reuse the exact same ERP-sourced blob — this component never
 * fetches or fabricates content.
 */
export const OfficialDocumentActions: React.FC<OfficialDocumentActionsProps> = ({
  state,
  kindLabel,
  onViewPdf,
}) => {
  const { document, error, isLoading, download, retry } = state;
  const label = kindLabel.toLowerCase();

  return (
    <DocumentOfficialStrip
      kindLabel={kindLabel}
      notice={
        error ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[11.5px] font-bold text-rose-700">
            <p className="min-w-0">{error}</p>
            <button
              type="button"
              onClick={retry}
              className="inline-flex shrink-0 items-center gap-1 font-extrabold text-rose-900 underline"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Retry
            </button>
          </div>
        ) : undefined
      }
      controls={
        isLoading && !document ? (
          // The Download control is ALWAYS visible on a document view. It stays
          // disabled until the official PDF is ready — a download never starts
          // on its own, only when the customer clicks it.
          <button
            type="button"
            disabled
            title="The official PDF is still preparing — it downloads only when you click this button"
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-extrabold text-white opacity-60"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            <span>Download Official {kindLabel}</span>
          </button>
        ) : document ? (
          <>
            <button
              type="button"
              onClick={onViewPdf}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-100"
              title={`Open the official ERP ${label} (PDF) preview`}
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">View Official PDF</span>
              <span className="sm:hidden">Preview</span>
            </button>
            <button
              type="button"
              onClick={download}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-slate-800"
              title={`Download the official ERP ${label} (PDF)`}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>Download Official {kindLabel}</span>
            </button>
          </>
        ) : undefined
      }
    />
  );
};
