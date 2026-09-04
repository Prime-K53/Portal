import { useCallback, useEffect, useState } from 'react';
import type {
  OfficialDocumentDownload,
  OfficialDocumentKind,
} from '../utils/officialDocument';
import {
  fetchOfficialDocument,
  triggerBrowserDownload,
} from '../utils/officialDocument';

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
  download: () => void;
  retry: () => void;
}

/**
 * Loads ONE ERP-authoritative PDF and owns its browser object URL.
 *
 * Preview, download, and print callers all consume the same immutable blob
 * fetched from the ERP. The ERP PDF is the single source of truth for
 * accounting data, balances, company information, and document content.
 */
export function useOfficialDocument(
  request: OfficialDocumentRequest | null,
  enabled = true
): OfficialDocumentState {
  const [document, setDocument] = useState<LoadedOfficialDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);

  const kind = request && 'kind' in request ? request.kind : undefined;
  const id = request && 'kind' in request ? request.id : undefined;
  const path = request && 'path' in request ? request.path : undefined;

  useEffect(() => {
    if (!enabled || (!path && !kind)) {
      setDocument(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;
    setDocument(null);
    setError(null);
    setIsLoading(true);

    const target: OfficialDocumentKind | { path: string } = path ? { path } : kind!;
    (async () => {
      try {
        const result = await fetchOfficialDocument(target, id);
        if (!active) return;
        objectUrl = URL.createObjectURL(result.blob);
        setDocument({ ...result, objectUrl });
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

  return { document, error, isLoading, download, retry };
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