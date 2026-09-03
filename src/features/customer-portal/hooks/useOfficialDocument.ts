import { useCallback, useEffect, useState } from 'react';
import type {
  OfficialDocumentDownload,
  OfficialDocumentKind,
} from '../utils/officialDocument';
import {
  fetchOfficialDocument,
  triggerBrowserDownload,
} from '../utils/officialDocument';
import { watermarkBlob } from '../utils/portalPdfPostProcess';

export type OfficialDocumentRequest =
  | { kind: OfficialDocumentKind; id: string }
  | { path: string };

export interface LoadedOfficialDocument extends OfficialDocumentDownload {
  objectUrl: string;
}

export interface OfficialDocumentState {
  document: LoadedOfficialDocument | null;
  error: string | null;
  isLoading: boolean;
  /** True once the Portal "PORTAL COPY" watermark has been applied to the blob. */
  isWatermarked: boolean;
  download: () => void;
  retry: () => void;
}

/**
 * Loads ONE ERP-authoritative PDF, stamps it with the Portal "PORTAL COPY"
 * watermark, and owns its browser object URL.
 *
 * Preview, download, and print callers all consume the same immutable
 * watermarked blob; this hook never creates or falls back to Portal-rendered
 * document content.
 *
 * The ERP PDF is the single source of truth for accounting data, balances,
 * company information, and document content. The Portal only adds the
 * presentation-layer watermark on top of those authoritative bytes.
 */
export function useOfficialDocument(
  request: OfficialDocumentRequest | null,
  enabled = true
): OfficialDocumentState {
  const [document, setDocument] = useState<LoadedOfficialDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isWatermarked, setIsWatermarked] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);

  const kind = request && 'kind' in request ? request.kind : undefined;
  const id = request && 'kind' in request ? request.id : undefined;
  const path = request && 'path' in request ? request.path : undefined;

  useEffect(() => {
    if (!enabled || (!path && !kind)) {
      setDocument(null);
      setError(null);
      setIsLoading(false);
      setIsWatermarked(false);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;
    setDocument(null);
    setError(null);
    setIsLoading(true);
    setIsWatermarked(false);

    const target: OfficialDocumentKind | { path: string } = path ? { path } : kind!;
    (async () => {
      try {
        const result = await fetchOfficialDocument(target, id);
        if (!active) return;

        // Apply the Portal "PORTAL COPY" watermark BEFORE the blob is shared
        // by preview, download, and print. The ERP bytes are never destroyed
        // — they live only inside `result.blob` and are not mutated in place.
        let finalBlob = result.blob;
        try {
          finalBlob = await watermarkBlob(result.blob);
        } catch (watermarkError) {
          // Hard fail: never silently hand a customer an unwatermarked
          // official document. Log, surface the error, allow retry.
          if (active) {
            const message =
              watermarkError instanceof Error
                ? watermarkError.message
                : 'The Portal could not apply the required document watermark.';
            setError(
              `The ERP document was downloaded successfully, but the Portal watermark could not be applied (${message}). Please retry.`
            );
            setIsLoading(false);
          }
          return;
        }

        if (!active) return;
        objectUrl = URL.createObjectURL(finalBlob);
        setDocument({ ...result, blob: finalBlob, objectUrl });
        setIsWatermarked(true);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'The ERP could not load this document.');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [enabled, id, kind, path, retryVersion]);

  const download = useCallback(() => {
    if (!document) return;
    triggerBrowserDownload(document.blob, document.filename);
  }, [document]);

  const retry = useCallback(() => setRetryVersion((version) => version + 1), []);

  return { document, error, isLoading, isWatermarked, download, retry };
}

/** Prints the PDF loaded in a preview frame, never the surrounding Portal UI. */
export function printOfficialDocumentFrame(frame: HTMLIFrameElement | null): void {
  const printWindow = frame?.contentWindow;
  if (!printWindow) {
    throw new Error('The official PDF preview is not ready to print.');
  }
  printWindow.focus();
  printWindow.print();
}