/**
 * Browser-safe TypeScript facade over portalPdfPostProcess.cjs.
 *
 * The CJS module is the single source of truth for the watermark; this file
 * only adds:
 *   - typed wrappers (no `any`)
 *   - Blob / Uint8Array conversions for the React layer
 *   - in-flight dedupe so concurrent fetchers do not watermark twice
 *   - safe failure reporting (the UI must NEVER silently fall back to an
 *     unwatermarked official document — see useOfficialDocument.ts).
 */
import {
  applyPortalCopyWatermark as applyPortalCopyWatermarkCjs,
  isAlreadyWatermarked as isAlreadyWatermarkedCjs,
  WATERMARK_KEYWORDS,
  WATERMARK_SUBJECT,
  WATERMARK_TEXT,
} from '../portalPdfPostProcess.mjs';

export interface PortalCopyWatermarkOptions {
  text?: string;
  opacity?: number;
  rotationDeg?: number;
  fontSize?: number;
}

export interface WatermarkResult {
  bytes: Uint8Array;
  alreadyWatermarked: boolean;
}

const WATERMARK_PROCESS_MARKER = WATERMARK_KEYWORDS;

const inflight = new Map<string, Promise<WatermarkResult>>();

function bytesToBufferLike(bytes: Uint8Array): Uint8Array {
  // Buffer extends Uint8Array in Node, but the CJS module accepts any
  // Uint8Array-shaped input. In the browser we hand it the same view.
  return bytes;
}

/**
 * Stamps an official ERP PDF with the Portal "PORTAL COPY" watermark.
 * Concurrent calls with the SAME source bytes share a single in-flight run
 * so we never watermark the same buffer twice in parallel.
 *
 * Idempotency: when the bytes already carry the watermark marker (either from
 * a previous call or because the ERP itself emitted a previously-watermarked
 * document), the original buffer is returned unchanged.
 *
 * Throws on parse failure — callers must NOT swallow.
 */
export async function applyPortalCopyWatermark(
  source: Uint8Array,
  options?: PortalCopyWatermarkOptions
): Promise<WatermarkResult> {
  if (isAlreadyWatermarkedCjs(bytesToBufferLike(source))) {
    return { bytes: source, alreadyWatermarked: true };
  }

  // Dedupe by source-byte identity. We avoid holding the original buffer
  // alive — only a hash-like fingerprint (length + small head/tail) is enough
  // because the Portal loads each document exactly once per session per kind.
  const fingerprint = `${source.byteLength}:${headTailFingerprint(source)}`;
  const pending = inflight.get(fingerprint);
  if (pending) return pending;

  const run = (async () => {
    const result = applyPortalCopyWatermarkCjs(bytesToBufferLike(source), options);
    const out = result instanceof Uint8Array ? result : new Uint8Array(result);
    return { bytes: out, alreadyWatermarked: false };
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

export async function watermarkBlob(blob: Blob): Promise<Blob> {
  const bytes = await blobToUint8Array(blob);
  const { bytes: watermarked } = await applyPortalCopyWatermark(bytes);
  return new Blob([watermarked], { type: 'application/pdf' });
}

export const __watermarkInternals = {
  PROCESS_MARKER: WATERMARK_PROCESS_MARKER,
  SUBJECT: WATERMARK_SUBJECT,
  TEXT: WATERMARK_TEXT,
};