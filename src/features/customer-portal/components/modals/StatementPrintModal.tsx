import React, { useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Receipt, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useOfficialDocument } from '../../hooks/useOfficialDocument';
import { resolveStatementPeriod, statementDocumentPath } from '../../utils/officialDocument';
import { useFocusTrap } from '../../utils/useFocusTrap';
import { OfficialDocumentPreview } from '../OfficialDocumentPreview';

interface StatementPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  dateFilter: 'all' | '30days' | 'this_month' | 'custom';
  startDate: string;
  endDate: string;
}

/** Minimal self-contained toast — auto-dismisses after 4 seconds. */
function DownloadToast({ filename, onDone }: { filename: string; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 4000);
    return () => window.clearTimeout(timer);
  }, [onDone]);
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 px-4 animate-fade-in"
    >
      <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-xl max-w-[min(90vw,420px)]">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
        <p className="text-xs font-semibold text-emerald-800 truncate">
          Statement download started — check your device’s Downloads folder
          {filename ? <span className="block text-[10.5px] text-emerald-700/80 font-medium mt-0.5">{filename}</span> : null}
        </p>
      </div>
    </div>
  );
}

export const StatementPrintModal: React.FC<StatementPrintModalProps> = ({
  isOpen,
  onClose,
  dateFilter,
  startDate,
  endDate,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useFocusTrap(containerRef, { active: isOpen, onEscape: onClose });

  const period =
    dateFilter === 'custom'
      ? resolveStatementPeriod('custom', { startDate, endDate })
      : resolveStatementPeriod(dateFilter);
  const path = statementDocumentPath(period);
  const officialDocument = useOfficialDocument({ path }, isOpen);
  const visibleError = officialDocument.error ?? actionError;

  // Auto-download: trigger a browser download as soon as the watermarked PDF
  // becomes available. Tracks the last-triggered objectUrl so retries or
  // successive modal opens don't re-fire the download for the same bytes.
  const lastAutoDownloadedUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen) {
      lastAutoDownloadedUrlRef.current = null;
      return;
    }
    const doc = officialDocument.document;
    if (!doc) return;
    if (lastAutoDownloadedUrlRef.current === doc.objectUrl) return;
    lastAutoDownloadedUrlRef.current = doc.objectUrl;
    
    
    
    try {
      // Use the existing watermarked blob directly instead of creating a new one
      const url = URL.createObjectURL(doc.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke after the browser has had a chance to start the download.
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      setToast(doc.filename);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'The download could not start.');
    }
  }, [isOpen, officialDocument.document]);

  if (!isOpen) return null;

  const handleDownload = () => {
    setActionError(null);
    officialDocument.download();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-5xl bg-white border border-slate-200 text-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[92vh]"
      >
        <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 bg-slate-100 text-slate-800 rounded-xl border border-slate-200">
              <Receipt className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 id={titleId} className="font-extrabold text-base text-slate-900">Official Account Statement</h3>
              <p className="text-xs text-slate-500 truncate">
                ERP-generated PDF · preview, download, and print use the same document
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {officialDocument.isLoading && (
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" aria-hidden="true" />
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
              aria-label="Close statement preview"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {visibleError && (
          <div className="px-4 py-3 bg-rose-50 border-b border-rose-200 flex items-center justify-between gap-3">
            <p className="text-[11.5px] font-bold text-rose-700">{visibleError}</p>
            {officialDocument.error && (
              <button
                onClick={officialDocument.retry}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-1.5 hover:bg-rose-100"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                Retry
              </button>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0 relative" data-testid="official-statement-preview">
          {officialDocument.isLoading && !officialDocument.document && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-50 text-slate-600 z-10">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" aria-hidden="true" />
              <div className="text-center">
                <p className="text-sm font-extrabold text-slate-800">Generating statement in PrimeERP…</p>
                <p className="text-xs mt-1">Loading authoritative accounting data and company settings</p>
              </div>
            </div>
          )}

          {!officialDocument.isLoading && officialDocument.error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-50 px-6 text-center">
              <ShieldCheck className="w-10 h-10 text-rose-500" aria-hidden="true" />
              <div>
                <p className="text-sm font-extrabold text-slate-800">Official statement unavailable</p>
                <p className="text-xs text-slate-500 mt-1 max-w-lg">
                  No Portal-generated statement or fallback company identity will be substituted.
                </p>
              </div>
              <button
                onClick={officialDocument.retry}
                className="px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-1.5 hover:bg-rose-100"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                Retry
              </button>
            </div>
          )}

          {officialDocument.document && (
            <OfficialDocumentPreview
              blob={officialDocument.document.blob}
              filename={officialDocument.document.filename}
              title="Official Account Statement"
              subtitle="ERP-generated PDF · preview, download, and print use the same document"
            />
          )}
        </div>
      </div>
      {toast && <DownloadToast filename={toast} onDone={() => setToast(null)} />}
    </div>
  );
};
