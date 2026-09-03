import React, { useRef } from 'react';
import { Printer, X } from 'lucide-react';
import { useFocusTrap } from '../../utils/useFocusTrap';

interface DocumentSheetProps {
  /** id of the <h1> inside the children — referenced by the dialog aria-labelledby. */
  titleId: string;
  /** Human-readable document type, e.g. 'Invoice' / 'Quotation'. */
  documentType: string;
  /** Closes the document view (also fired on Escape). */
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Premium Portal HTML document view shell (invoice / quotation).
 *
 * A full-screen, centered "paper" sheet (~960px max) with a sticky Prime
 * Printing app bar. The sheet scrolls internally so the portal behind stays
 * in place, and collapses to a full-height edge-to-edge view on phones.
 *
 * This is a PRESENTATION layer only: it renders children from the existing
 * ERP-backed data and never replaces the official PDF document.
 */
export const DocumentSheet: React.FC<DocumentSheetProps> = ({
  titleId,
  documentType,
  onClose,
  children,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, { active: true, onEscape: onClose });

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/45 backdrop-blur-xs animate-fade-in">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="mx-auto flex h-dvh w-full max-w-[960px] flex-col bg-white text-slate-900 sm:h-[calc(100dvh-3rem)] sm:my-6 sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-2xl sm:overflow-hidden"
      >
        {/* Sticky app bar — brand + "portal view" marker + close */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs"
              aria-hidden="true"
            >
              <Printer className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-black tracking-tight text-slate-900">
                Prime Printing
              </span>
              <span className="flex items-center gap-1.5 text-[10.5px] font-bold text-slate-500">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                Portal view · {documentType.toLowerCase()}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label={`Close ${documentType.toLowerCase()} view`}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable document content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-10 pt-5 sm:px-8 sm:pt-7 lg:px-10">
          {children}
        </div>
      </div>
    </div>
  );
};
