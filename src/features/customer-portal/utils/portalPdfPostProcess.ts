/**
 * Browser-safe TypeScript facade over portalPdfPostProcess.mjs.
 *
 * The ESM module is the single source of truth for the watermark; this file
 * only adds:
 *   - typed wrappers (no `any`)
 *   - Blob / Uint8Array conversions for the React layer
 *   - in-flight dedupe so concurrent fetchers do not watermark twice
 *   - development-only diagnostics ([Portal PDF] …) so a developer can prove
 *     the blob changed; never enabled in production builds
 *   - safe failure reporting (the UI must NEVER silently fall back to an
 *     unwatermarked official document — see useOfficialDocument.ts).
 */
import {
  applyPortalCopyWatermark as applyPortalCopyWatermarkCore,
  countWatermarkedPages,
  isAlreadyWatermarked as isAlreadyWatermarkedCore,
  WATERMARK_KEYWORDS,
  WATERMARK_SUBJECT,
  WATERMARK_TEXT,
} from '../portalPdfPostProcess.mjs';

export interface PortalCopyWatermarkOptions {
  text?: string;
  alpha?: number;
  rotationDeg?: number;
  fontSize?: number;
}

export interface WatermarkResult {
  bytes: Uint8Array;
  alreadyWatermarked: boolean;
  /** Number of pages that carry an injected watermark stream (0 if none). */
  stampedPages: number;
}

const inflight = new Map<string, Promise<WatermarkResult>>();

/**
 * Development-only flag. In Vite production builds `import.meta.env.PROD` is
 * statically replaced with `true`, so this branch (and its log calls) is
 * eliminated from the shipped bundle. In Node tests it simply stays false.
 */
function isDevDiagnosticsEnabled(): boolean {
  try {
    const meta = (import.meta as { env?: Record<string, unknown> }).env;
    if (!meta) return false;
    return meta.PROD !== true && meta.DEV !== false;
  } catch {
    return false;
  }
}

/**
 * Stamps an official ERP PDF with the Portal "PORTAL COPY" watermark.
 * Concurrent calls with the SAME source bytes share a single in-flight run
 * so we never watermark the same buffer twice in parallel.
 *
 * Idempotency: when the bytes already carry the watermark marker (from a
 * previous call), the original buffer is returned unchanged.
 *
 * Throws on parse failure — callers must NOT swallow.
 */
export async function applyPortalCopyWatermark(
  source: Uint8Array,
  options?: PortalCopyWatermarkOptions
): Promise<WatermarkResult> {
  if (isAlreadyWatermarkedCore(source)) {
    return { bytes: source, alreadyWatermarked: true, stampedPages: countWatermarkedPages(source) };
  }

  // Dedupe by source-byte identity (length + small head/tail fingerprint).
  const fingerprint = `${source.byteLength}:${headTailFingerprint(source)}`;
  const pending = inflight.get(fingerprint);
  if (pending) return pending;

  const run = (async () => {
    const result = applyPortalCopyWatermarkCore(source, options);
    const out = result instanceof Uint8Array ? result : new Uint8Array(result);
    return {
      bytes: out,
      alreadyWatermarked: false,
      stampedPages: countWatermarkedPages(out),
    };
  })();

  inflight.set(fingerprint, run);
  try {
    return await run;
  } finally {
    inflight.delete(fingerprint);
  }
}

function headTailFingerprint(bytes: Uint8Array): string {
  const take = 64;
  if (bytes.byteLength <= take * 2) {
    return Array.from(bytes).join(',');
  }
  const head = Array.from(bytes.subarray(0, take));
  const tail = Array.from(bytes.subarray(bytes.byteLength - take));
  return `${head.join(',')}|${tail.join(',')}`;
}

export async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const ab = await blob.arrayBuffer();
  return new Uint8Array(ab);
}

/**
 * Watermark an ERP PDF blob. `documentKind` is used ONLY by development
 * diagnostics (statement / invoice / quotation / receipt / delivery-note…)
 * and is never exposed in the document or logs beyond a safe label.
 *
 * Throws when processing fails — the UI must surface the error and retry,
 * never silently show the unwatermarked ERP bytes.
 */
export async function watermarkBlob(blob: Blob, documentKind?: string): Promise<Blob> {
  const original = await blobToUint8Array(blob);
  const result = await applyPortalCopyWatermark(original);
  const processed = new Blob([result.bytes], { type: 'application/pdf' });

  if (isDevDiagnosticsEnabled()) {
    // eslint-disable-next-line no-console
    console.debug('[Portal PDF]', {
      documentType: documentKind ?? 'unknown',
      originalSize: original.byteLength,
      processedSize: result.bytes.byteLength,
      watermarkApplied: !result.alreadyWatermarked,
      alreadyWatermarked: result.alreadyWatermarked,
      pagesProcessed: result.stampedPages,
    });
  }

  if (!result.alreadyWatermarked && result.bytes.byteLength === original.byteLength) {
    // Impossible in practice: the processor always appends streams. This
    // guard makes byte-level regression impossible to miss.
    throw new Error('The Portal watermark produced no byte-level change — refusing to continue.');
  }
  return processed;
}

export const __watermarkInternals = {
  PROCESS_MARKER: WATERMARK_KEYWORDS,
  SUBJECT: WATERMARK_SUBJECT,
  TEXT: WATERMARK_TEXT,
};
