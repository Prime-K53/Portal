import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  MessageSquareQuote,
  Plus,
  RefreshCcw,
  XCircle,
} from 'lucide-react';
import type { Quotation, QuoteRequest } from '../../types';
import { formatCurrency, formatDate, getQuoteStatusBadge } from '../../utils/formatters';
import { downloadOfficialDocument } from '../../utils/officialDocument';

type QuoteTab = 'submitted' | 'converted';

interface QuotesTabProps {
  quotes: Quotation[];
  quoteRequests: QuoteRequest[];
  onCreateQuote: () => void;
  onAcceptQuotation: (quotationId: string) => void;
  onRejectQuotation: (quotationId: string) => void;
  onRequestRevision: (quotationId: string) => void;
  onSelectQuotation: (quotation: Quotation | QuoteRequest) => void;
}

const SUBMITTED_QUOTE_REQUEST_STATUSES = new Set(['pending_review', 'quoted', 'revision_requested']);
const CONVERTED_QUOTE_REQUEST_STATUSES = new Set(['converted']);
const SUBMITTED_QUOTATION_STATUSES = new Set(['pending_review', 'quoted', 'revision_requested']);
const CONVERTED_QUOTATION_STATUSES = new Set(['accepted', 'converted']);

interface NormalizedQuote {
  id: string;
  number: string;
  date: string;
  validOrRequiredDate: string;
  status: string;
  itemsCount: number;
  total: number;
  isQuotation: boolean;
}

function normalizeQuotation(q: Quotation): NormalizedQuote {
  return {
    id: q.id,
    number: q.quotationNumber,
    date: q.issuedDate,
    validOrRequiredDate: q.validUntil,
    status: q.status,
    itemsCount: q.items.length,
    total: q.total,
    isQuotation: true,
  };
}

function normalizeQuoteRequest(q: QuoteRequest): NormalizedQuote {
  return {
    id: q.id,
    number: q.quoteNumber,
    date: q.requestDate,
    validOrRequiredDate: q.requiredByDate,
    status: q.status,
    itemsCount: q.items.length,
    total: q.estimatedTotal ?? 0,
    isQuotation: false,
  };
}

export const QuotesTab: React.FC<QuotesTabProps> = ({
  quotes,
  quoteRequests,
  onCreateQuote,
  onAcceptQuotation,
  onRejectQuotation,
  onRequestRevision,
  onSelectQuotation,
}) => {
  const [activeTab, setActiveTab] = useState<QuoteTab>('submitted');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<{ id: string; message: string } | null>(null);

  const handleDownloadPDF = async (quoteId: string) => {
    setDownloadError(null);
    setDownloadingId(quoteId);
    try {
      await downloadOfficialDocument('quotation', quoteId);
    } catch (err) {
      setDownloadError({ id: quoteId, message: err instanceof Error ? err.message : 'Download failed.' });
    } finally {
      setDownloadingId(null);
    }
  };

  const submittedQuotes = quotes
    .filter((q) => SUBMITTED_QUOTATION_STATUSES.has(q.status))
    .map(normalizeQuotation);
  const submittedQuoteRequests = quoteRequests
    .filter((q) => SUBMITTED_QUOTE_REQUEST_STATUSES.has(q.status))
    .map(normalizeQuoteRequest);
  const submitted = [...submittedQuotes, ...submittedQuoteRequests];

  const convertedQuotes = quotes
    .filter((q) => CONVERTED_QUOTATION_STATUSES.has(q.status))
    .map(normalizeQuotation);
  const convertedQuoteRequests = quoteRequests
    .filter((q) => CONVERTED_QUOTE_REQUEST_STATUSES.has(q.status))
    .map(normalizeQuoteRequest);
  const converted = [...convertedQuotes, ...convertedQuoteRequests];

  const visible = activeTab === 'submitted' ? submitted : converted;

  return (
    <div className="space-y-4 pb-20 text-slate-900">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-2xl bg-indigo-600 text-white shadow-xs">
            <MessageSquareQuote className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Quotations</h2>
            <p className="text-xs text-slate-500">Commercial quotations issued by the ERP — review, accept, reject, or request a revision</p>
          </div>
        </div>
        <button
          onClick={onCreateQuote}
          className="shrink-0 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs transition"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Quote
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/80 w-fit">
        <button
          onClick={() => setActiveTab('submitted')}
          className={`px-4 py-2 rounded-lg text-xs font-extrabold transition ${
            activeTab === 'submitted'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Submitted
          <span className={`ml-1.5 inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
            activeTab === 'submitted' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-200 text-slate-600'
          }`}>
            {submitted.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('converted')}
          className={`px-4 py-2 rounded-lg text-xs font-extrabold transition ${
            activeTab === 'converted'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Converted
          <span className={`ml-1.5 inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
            activeTab === 'converted' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-200 text-slate-600'
          }`}>
            {converted.length}
          </span>
        </button>
      </div>

      {/* Quote List */}
      <div className="space-y-3">
        {visible.length === 0 ? (
          <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200/80 text-center text-slate-500 text-xs font-medium">
            {activeTab === 'submitted'
              ? 'No pending or reviewed quotation requests. Accepted and converted quotations appear in the Converted tab.'
              : 'No converted quotation requests yet. Accepted quotation requests will appear here.'}
          </div>
        ) : (
          [...visible]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map((q) => {
              const statusInfo = getQuoteStatusBadge(q.status);
              const isActionable = q.isQuotation && q.status === 'quoted';

              return (
                <div
                  key={q.id}
                  onClick={() => {
                    const original = q.isQuotation
                      ? quotes.find((qt) => qt.id === q.id)
                      : quoteRequests.find((qr) => qr.id === q.id);
                    if (original) onSelectQuotation(original);
                  }}
                  className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-slate-900 space-y-3 shadow-2xs cursor-pointer hover:border-indigo-300 hover:shadow-md transition"
                >
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-slate-900">{q.number}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusInfo.bg}`}>
                          {statusInfo.label}
                        </span>
                      </div>
                      <p className="text-[12.5px] text-slate-500 mt-0.5">
                        {q.isQuotation ? 'Issued' : 'Requested'} on {formatDate(q.date)}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-medium text-slate-900 block finance-nums">{formatCurrency(q.total)}</span>
                      <span className="text-[11.5px] text-slate-400">
                        {q.isQuotation ? 'Valid until' : 'Required by'} {q.validOrRequiredDate ? formatDate(q.validOrRequiredDate) : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[11.5px] text-slate-400 font-medium">
                      {q.itemsCount} line item{q.itemsCount !== 1 ? 's' : ''}
                    </span>
                    <span className="text-[11.5px] text-indigo-600 font-bold">View details →</span>
                  </div>

                  {/* Actions */}
                  {activeTab === 'converted' && q.isQuotation && (
                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
                      <span className="text-[12.5px] text-slate-500 font-medium">Official ERP document available</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDownloadPDF(q.id);
                        }}
                        disabled={downloadingId === q.id}
                        title={downloadingId === q.id ? 'Downloading official ERP document…' : 'Download official ERP quotation (PDF)'}
                        className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-extrabold text-xs shadow-xs flex items-center gap-1.5 transition"
                      >
                        {downloadingId === q.id ? (
                          <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        <span>Download PDF</span>
                      </button>
                    </div>
                  )}
                  {isActionable && (
                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
                      <span className="text-[12.5px] text-emerald-700 font-bold">Quote ready for your decision</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRequestRevision(q.id);
                          }}
                          className="px-3 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-extrabold text-xs shadow-xs flex items-center gap-1.5 transition"
                          title="Request changes to this quotation"
                        >
                          <RefreshCcw className="w-3.5 h-3.5" />
                          <span>Request Revision</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRejectQuotation(q.id);
                          }}
                          className="px-3 py-2 rounded-xl border border-rose-300 text-rose-700 hover:bg-rose-50 font-extrabold text-xs shadow-xs flex items-center gap-1.5 transition"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Decline</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAcceptQuotation(q.id);
                          }}
                          className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs shadow-xs flex items-center gap-1.5 transition"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Accept</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {downloadError?.id === q.id && (
                    <p className="text-[11.5px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5">
                      {downloadError.message}
                    </p>
                  )}
                </div>
              );
            })
        )}
      </div>
    </div>
  );
};
