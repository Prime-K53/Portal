/**
 * Official document download (ERP-authoritative PDF).
 *
 * Flow: authenticated GET → ERP streams application/pdf bytes → blob →
 * object URL → anchor download → revoke. The ERP provides the official
 * filename via Content-Disposition; it is never invented here.
 *
 * Errors are classified so the UI can show a meaningful message and never
 * attempt to parse an error response as a PDF.
 */
import { env } from '../config/env';
import { authService } from '../services/authService';
import { tokenStore } from '../services/tokenStore';

export type OfficialDocumentKind =
  | 'invoice'
  | 'quotation'
  | 'order'
  | 'receipt'
  | 'delivery-note'
  | 'statement';

/** Portal API paths per document kind (customer-scoped server-side by JWT). */
export function officialDocumentPath(kind: OfficialDocumentKind, id: string): string {
  const safeId = encodeURIComponent(id);
  switch (kind) {
    case 'invoice': return `/portal/invoices/${safeId}/document`;
    case 'quotation': return `/portal/quotations/${safeId}/document`;
    case 'order': return `/portal/orders/${safeId}/document`;
    case 'receipt': return `/portal/payments/${safeId}/document`;
    case 'delivery-note': return `/portal/deliveries/${safeId}/document`;
    case 'statement': return '/portal/customers/statement/document';
    default: throw new Error(`Unsupported official document kind: ${kind}`);
  }
}

/** Canonical YYYY-MM-DD for a Date (UTC-safe for date-only semantics). */
export function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Maps the Statements screen period selection to explicit ERP query dates
 * (YYYY-MM-DD). The preset values mirror StatementsTab's filter model.
 * 'all' intentionally returns empty dates so the ERP applies ITS OWN default
 * window (last 365 days) instead of Sasa guessing one.
 */
export function resolveStatementPeriod(
  preset: 'all' | '30days' | 'this_month' | 'custom',
  options?: { startDate?: string; endDate?: string; today?: Date }
): { from?: string; to?: string } {
  const today = options?.today ?? new Date();
  switch (preset) {
    case 'all':
      return {};
    case '30days': {
      const from = new Date(today.getTime() - 30 * 86400000);
      return { from: toISODate(from), to: toISODate(today) };
    }
    case 'this_month': {
      const first = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1));
      return { from: toISODate(first), to: toISODate(today) };
    }
    case 'custom': {
      const from = options?.startDate;
      const to = options?.endDate;
      return from && to ? { from, to } : {};
    }
    default:
      return {};
  }
}

/** Builds the statement document path incl. explicit period params. */
export function statementDocumentPath(period: { from?: string; to?: string }): string {
  const params = new URLSearchParams();
  if (period.from) params.set('from', period.from);
  if (period.to) params.set('to', period.to);
  const query = params.toString();
  return query ? `/portal/customers/statement/document?${query}` : '/portal/customers/statement/document';
}

/**
 * Extract the official filename from a Content-Disposition header.
 * Falls back ONLY when the ERP did not send one.
 */
export function parseContentDispositionFilename(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utf8 = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (utf8?.[1]) {
    try { return decodeURIComponent(utf8[1].trim()); } catch { /* fall through */ }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() || fallback;
}

/** Human-meaningful message for non-PDF responses. Never parses body as PDF. */
export async function describeDocumentError(response: Response): Promise<string> {
  let detail = '';
  try {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text);
      detail = String(parsed.error || '');
    } catch {
      detail = text.slice(0, 140);
    }
  } catch { /* ignore read failures */ }

  switch (response.status) {
    case 401: return 'Your session has expired. Please sign in again to download this document.';
    case 403: return 'You do not have permission to download this document.';
    case 404: return detail || 'Official document not found.';
    case 503:
      if (detail === 'official_document_renderer_unconfigured') {
        return 'The ERP has not been configured with the official document renderer yet. Please contact support.';
      }
      return 'The ERP document service is temporarily unavailable. Please try again shortly.';
    default:
      return detail
        ? `The ERP could not generate this document (${response.status}). ${detail}`
        : `The ERP could not generate this document (${response.status}).`;
  }
}

/** Maps a failed fetch (offline/DNS/CORS) to a friendly message. */
export function mapFetchError(error: unknown): Error {
  if (error instanceof Error && error.name === 'AbortError') {
    return new Error('The ERP took too long to respond. Please try again.');
  }
  return new Error('Unable to reach the ERP. Check your connection and try again.');
}

/** Minimal shape needed to match a ledger row to its ERP payment. */
export interface StatementEntryRef {
  reference: string;
  date: string;
  credit: number;
}

export interface PaymentRef {
  /** ERP customer_payments id — what the receipt endpoint needs. */
  id: string;
  paymentNumber?: string;
  referenceCode?: string;
  date?: string;
  amount?: number;
}

/**
 * Resolve which ERP payment a statement ledger row refers to.
 * The ERP ledger stamps payment rows with the payment's own reference
 * (customerLedger.cjs: reference = pay.reference ?? receiptNumber ?? id),
 * so we match on reference first, then date+amount as a fallback.
 */
export function findPaymentForStatementEntry(
  entry: StatementEntryRef,
  payments: PaymentRef[] = []
): PaymentRef | null {
  const ref = String(entry.reference || '').trim();
  if (ref) {
    const byReference = payments.find(
      (p) => p.referenceCode === ref || p.paymentNumber === ref || p.id === ref
    );
    if (byReference) return byReference;
  }
  // Fallback: exact date + amount.
  return (
    payments.find(
      (p) =>
        p.date === entry.date &&
        Number(p.amount ?? NaN) === Number(entry.credit) &&
        Number(entry.credit) > 0
    ) || null
  );
}

export interface OfficialDocumentDownload {
  blob: Blob;
  filename: string;
  contentType: string;
}

/**
 * Hard cap for a single official-document download. Normal generation takes
 * a few seconds; the ceiling only exists so the busy spinner can NEVER spin
 * indefinitely when the ERP stalls (stale/hung process, network black hole).
 * It deliberately exceeds apiTimeoutMs because a cold first call also loads
 * the renderer bundle.
 */
export const OFFICIAL_DOCUMENT_TIMEOUT_MS = 90_000;

/** Message for a download that hit the ceiling. */
export function mapDownloadTimeout(): Error {
  return new Error(
    'Unable to download the official document — the ERP did not respond in time. Please try again.'
  );
}

/**
 * Fetch an official ERP document as bytes using the SAME authentication the
 * JSON API client uses (Bearer access token from the portal session store).
 * The request is time-boxed (AbortController) so the UI busy state ALWAYS
 * resolves, even when the ERP accepts the connection but never responds.
 */
export async function fetchOfficialDocument(
  kindOrPath: OfficialDocumentKind | { path: string },
  id?: string,
  timeoutMs: number = OFFICIAL_DOCUMENT_TIMEOUT_MS
): Promise<OfficialDocumentDownload> {
  if (!env.apiUrl) throw new Error('ERP API origin is not configured.');
  const apiPath =
    typeof kindOrPath === 'string' ? officialDocumentPath(kindOrPath, id ?? '') : kindOrPath.path;

  const token = tokenStore.getAccessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const requestDocument = (accessToken: string | null) =>
    fetch(`${env.apiUrl.replace(/\/+$/, '')}/api${apiPath}`, {
      method: 'GET',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      credentials: 'omit',
      signal: controller.signal,
    });

  let response: Response;
  try {
    response = await requestDocument(token);
    // Keep binary document requests on the same single-flight token-rotation
    // path as the JSON API. The browser never receives ERP service credentials;
    // it only retries once with its own refreshed customer JWT.
    if (response.status === 401 && token) {
      const refreshedToken = await authService.refreshAccessToken();
      if (refreshedToken) response = await requestDocument(refreshedToken);
    }
  } catch (err) {
    clearTimeout(timer);
    if (controller.signal.aborted) throw mapDownloadTimeout();
    throw mapFetchError(err);
  }
  clearTimeout(timer);

  const contentType = response.headers.get('Content-Type') || '';
  if (!response.ok || !contentType.includes('application/pdf')) {
    throw Object.assign(new Error(await describeDocumentError(response)), {
      status: response.status,
    });
  }

  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error('The ERP returned an empty document.');
  }

  // Deterministic fallback per document family when the ERP omits a header.
  const familyFallback = apiPath.includes('/customers/statement/document')
    ? 'Statement.pdf'
    : apiPath.includes('/payments/')
      ? 'Receipt.pdf'
      : apiPath.includes('/deliveries/')
        ? 'Delivery-Note.pdf'
        : `${String(typeof kindOrPath === 'string' ? kindOrPath : 'document')}-${id ?? 'document'}.pdf`;

  const filename = parseContentDispositionFilename(
    response.headers.get('Content-Disposition'),
    familyFallback
  );
  return { blob, filename, contentType };
}

/** Blob → object URL → anchor click → revoke. */
export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * One-call helper used by download buttons (kind+id OR explicit path).
 *
 * Always stamps the "PORTAL COPY" watermark on the downloaded PDF — the
 * ERP bytes are the single source of truth for accounting data, and the
 * Portal adds exactly one presentation layer on top of them.
 *
 * Watermarking failures are surfaced as a thrown Error so the caller UI can
 * show the retry path (never a silent unwatermarked official document).
 */
export async function downloadOfficialDocument(
  target: OfficialDocumentKind | { path: string },
  id?: string
): Promise<void> {
  const { blob, filename } = await fetchOfficialDocument(target, id);
  // Lazy import keeps the official-document module free of PDF-rewriting
  // concerns until a download is actually requested.
  const { watermarkBlob } = await import('./portalPdfPostProcess');
  const finalBlob = await watermarkBlob(blob);
  triggerBrowserDownload(finalBlob, filename);
}
