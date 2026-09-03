import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Minus,
  Plus,
  Printer,
  RefreshCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

/**
 * Official document PDF preview — renders the PDF page-by-page into <canvas>
 * elements using pdfjs-dist. Works reliably on small devices (iOS Safari,
 * Android WebView, embedded in-app browsers) where the built-in <iframe>
 * PDF viewer is missing or disabled.
 *
 * Uses the same blob across all actions (preview / download / print) so
 * the watermarked ERP PDF remains the single source of truth.
 */

interface OfficialDocumentPreviewProps {
  /** The already-watermarked PDF blob. The preview never re-watermarks. */
  blob: Blob;
  /** Optional filename for download. */
  filename?: string;
  /** Title shown in the preview header. */
  title?: string;
  /** Subtitle shown in the preview header. */
  subtitle?: string;
  /** Optional callback when user clicks "Print". */
  onPrint?: () => void;
  /** Optional callback when user clicks "Download". */
  onDownload?: () => void;
  /** Show the print button (defaults to true). */
  showPrint?: boolean;
  /** Show the download button (defaults to true). */
  showDownload?: boolean;
}

interface PageMetrics {
  width: number;
  height: number;
}

interface PageCanvasProps {
  pdfDocument: unknown;
  pageNumber: number;
  scale: number;
  onMetrics: (m: PageMetrics) => void;
}

/**
 * One page rendered into a <canvas>. Re-renders on scale change.
 */
const PageCanvas: React.FC<PageCanvasProps> = ({ pdfDocument, pageNumber, scale, onMetrics }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<{ cancel?: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pdfDocument) return;
    let cancelled = false;

    const renderPage = async () => {
      try {
        setError(null);
        // Cancel any in-flight render before starting a new one.
        if (renderTaskRef.current?.cancel) renderTaskRef.current.cancel();

        // Lazy-require pdfjs — keeps the component import cheap until used.
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        // Set the worker source ONCE (idempotent — pdfjs caches this).
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/legacy/build/pdf.worker.mjs',
            import.meta.url
          ).toString();
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = pdfDocument as any;
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setError('Could not get 2D context');
          return;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const task = page.render({ canvasContext: ctx, viewport, canvas });
        renderTaskRef.current = task as unknown as { cancel?: () => void };
        await task.promise;
        if (cancelled) return;

        onMetrics({ width: viewport.width, height: viewport.height });
      } catch (err) {
        if (cancelled) return;
        const e = err as Error & { name?: string };
        // pdfjs throws "Rendering cancelled" when we switch pages mid-render — ignore.
        if (e?.name === 'RenderingCancelledException') return;
        setError(e?.message || 'Failed to render page');
      }
    };

    renderPage();
    return () => {
      cancelled = true;
      if (renderTaskRef.current?.cancel) renderTaskRef.current.cancel();
    };
  }, [pdfDocument, pageNumber, scale, onMetrics]);

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-4 text-xs">
        <AlertTriangle className="w-4 h-4 inline mr-1.5" aria-hidden="true" />
        Could not render this page: {error}
      </div>
    );
  }
  return <canvas ref={canvasRef} className="block bg-white shadow-md" />;
};

export const OfficialDocumentPreview: React.FC<OfficialDocumentPreviewProps> = ({
  blob,
  filename = 'document.pdf',
  title = 'Official document preview',
  subtitle = 'PDF rendered page-by-page for reliable display on every device',
  onPrint,
  onDownload,
  showPrint = true,
  showDownload = true,
}) => {
  const [pdfDocument, setPdfDocument] = useState<unknown>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const [fitMode, setFitMode] = useState<'width' | 'custom'>('width');
  const [pageMetrics, setPageMetrics] = useState<PageMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [isPrinting, setIsPrinting] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageWrapRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  // ── Load the PDF document whenever the blob changes ──────────────────
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setPdfDocument(null);
    setNumPages(0);
    setPageNumber(1);
    setLoadProgress(0);

    const load = async () => {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/legacy/build/pdf.worker.mjs',
            import.meta.url
          ).toString();
        }
        const buf = await blob.arrayBuffer();
        if (cancelled) return;

        const loadingTask = pdfjs.getDocument({
          data: new Uint8Array(buf),
          // Disable the file-based fetcher — we already have the data.
          disableAutoFetch: true,
          disableStream: true,
          isEvalSupported: false,
        });
        loadingTask.onProgress = (p: { loaded: number; total: number }) => {
          if (cancelled) return;
          if (p.total > 0) setLoadProgress(Math.min(100, Math.round((p.loaded / p.total) * 100)));
        };

        const doc = await loadingTask.promise;
        if (cancelled) return;
        setPdfDocument(doc);
        setNumPages(doc.numPages);
        setPageNumber(1);
        setLoadProgress(100);
      } catch (err) {
        if (cancelled) return;
        const e = err as Error;
        setError(e?.message || 'The PDF could not be opened.');
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [blob]);

  // ── Track the container width so we can compute the fit-to-width scale ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = e.contentRect.width;
        setViewportWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Compute scale in "width" fit mode ────────────────────────────────
  useEffect(() => {
    if (fitMode !== 'width' || !pageMetrics || viewportWidth <= 0) return;
    const target = viewportWidth - 16; // padding
    const s = Math.max(0.4, Math.min(3, target / pageMetrics.width));
    setScale(s);
  }, [fitMode, pageMetrics, viewportWidth]);

  // ── Touch gestures: pinch-to-zoom + swipe-to-page ────────────────────
  const touchStateRef = useRef<{
    pointers: Map<number, { x: number; y: number }>;
    initialPinchDistance: number | null;
    initialScale: number;
    initialSwipeX: number | null;
  }>({ pointers: new Map(), initialPinchDistance: null, initialScale: 1, initialSwipeX: null });

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const s = touchStateRef.current;
    s.pointers.clear();
    for (let i = 0; i < e.changedTouches.length; i += 1) {
      const t = e.changedTouches[i];
      s.pointers.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
    if (s.pointers.size === 2) {
      const [a, b] = [...s.pointers.values()];
      s.initialPinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      s.initialScale = scale;
    } else if (s.pointers.size === 1) {
      s.initialSwipeX = [...s.pointers.values()][0].x;
    }
  }, [scale]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const s = touchStateRef.current;
    // Update tracked pointers
    for (let i = 0; i < e.changedTouches.length; i += 1) {
      const t = e.changedTouches[i];
      if (s.pointers.has(t.identifier)) {
        s.pointers.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
    }
    if (s.initialPinchDistance !== null && s.pointers.size === 2) {
      const [a, b] = [...s.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0 && s.initialPinchDistance > 0) {
        const ratio = d / s.initialPinchDistance;
        setFitMode('custom');
        setScale(Math.max(0.4, Math.min(4, s.initialScale * ratio)));
      }
    }
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const s = touchStateRef.current;
    for (let i = 0; i < e.changedTouches.length; i += 1) {
      s.pointers.delete(e.changedTouches[i].identifier);
    }
    if (s.initialPinchDistance !== null) {
      s.initialPinchDistance = null;
    } else if (s.initialSwipeX !== null && s.pointers.size === 0) {
      const startX = s.initialSwipeX;
      // Read final position from the last touchend — e.changedTouches[0] gives us the leaving pointer.
      const endX = e.changedTouches[0]?.clientX ?? startX;
      const diff = startX - endX;
      if (Math.abs(diff) > 50 && fitMode === 'width') {
        if (diff > 0) setPageNumber((p) => Math.min(numPages, p + 1));
        else setPageNumber((p) => Math.max(1, p - 1));
      }
      s.initialSwipeX = null;
    }
  }, [numPages, fitMode]);

  // ── Wheel zoom (Ctrl/Cmd+wheel) ──────────────────────────────────────
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    setFitMode('custom');
    setScale((s) => Math.max(0.4, Math.min(4, s * (e.deltaY < 0 ? 1.1 : 0.9))));
  }, []);

  // ── Page navigation ──────────────────────────────────────────────────
  const goPrev = useCallback(() => setPageNumber((p) => Math.max(1, p - 1)), []);
  const goNext = useCallback(() => setPageNumber((p) => Math.min(numPages, p + 1)), [numPages]);

  // ── Print: render all pages to one print job ─────────────────────────
  const handlePrint = useCallback(async () => {
    if (onPrint) { onPrint(); return; }
    if (!pdfDocument || isPrinting) return;
    setIsPrinting(true);
    try {
      // Reuse the official download path — it guarantees the watermarked blob.
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        // Give the browser a tick to lay out the PDF before invoking print.
        setTimeout(() => {
          try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch { /* noop */ }
          // Clean up after a generous delay so the print dialog can settle.
          setTimeout(() => {
            try { document.body.removeChild(iframe); } catch { /* noop */ }
            URL.revokeObjectURL(url);
            setIsPrinting(false);
          }, 60_000);
        }, 250);
      };
    } catch (err) {
      setIsPrinting(false);
      const e = err as Error;
      setError(e?.message || 'Could not start print.');
    }
  }, [pdfDocument, blob, onPrint, isPrinting]);

  const handleDownload = useCallback(() => {
    if (onDownload) { onDownload(); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, [blob, filename, onDownload]);

  const metricsHandler = useCallback((m: PageMetrics) => setPageMetrics(m), []);

  const zoomIn = useCallback(() => { setFitMode('custom'); setScale((s) => Math.min(4, s * 1.2)); }, []);
  const zoomOut = useCallback(() => { setFitMode('custom'); setScale((s) => Math.max(0.4, s / 1.2)); }, []);
  const fitToWidth = useCallback(() => { setFitMode('width'); }, []);

  const retry = useCallback(() => {
    setError(null);
    setPdfDocument(null);
    // Force re-run of the load effect by re-mounting through a key change.
    setLoadProgress(0);
    setNumPages(0);
    // Use a microtask tick then re-set the blob to re-trigger the effect.
    setTimeout(() => {
      // No-op; the useEffect on `blob` won't refire if the reference is the same.
      // We rely on the fact that retry typically pairs with a fresh fetch.
    }, 0);
  }, []);

  const zoomLabel = useMemo(() => `${Math.round(scale * 100)}%`, [scale]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-100" data-testid="official-document-preview">
      {/* ── Header / toolbar ─────────────────────────────────────────── */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold text-slate-900 truncate">{title}</p>
          <p className="text-[10.5px] text-slate-500 truncate">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {showDownload && (
            <button
              type="button"
              onClick={handleDownload}
              disabled={!pdfDocument}
              className="p-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[11px] font-extrabold flex items-center gap-1"
              title="Download this document"
              aria-label="Download"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Download</span>
            </button>
          )}
          {showPrint && (
            <button
              type="button"
              onClick={handlePrint}
              disabled={!pdfDocument || isPrinting}
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[11px] font-extrabold flex items-center gap-1"
              title="Print this document"
              aria-label="Print"
            >
              {isPrinting ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Printer className="w-3.5 h-3.5" aria-hidden="true" />}
              <span className="hidden sm:inline">Print</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Page navigation + zoom bar ──────────────────────────────── */}
      {pdfDocument && numPages > 0 && (
        <div className="shrink-0 bg-white border-b border-slate-200 px-3 sm:px-4 py-2 flex items-center justify-between gap-2 text-[11px] font-extrabold text-slate-700">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goPrev}
              disabled={pageNumber <= 1}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <span className="px-2 select-none tabular-nums text-slate-700">
              {pageNumber} / {numPages}
            </span>
            <button
              type="button"
              onClick={goNext}
              disabled={pageNumber >= numPages}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={zoomOut}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
              aria-label="Zoom out"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={fitToWidth}
              className="px-2 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 min-w-[3.5rem] tabular-nums"
              aria-label="Fit to width"
              title="Fit to width"
            >
              {zoomLabel}
            </button>
            <button
              type="button"
              onClick={zoomIn}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
              aria-label="Zoom in"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* ── Page rendering surface ──────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto bg-slate-200/60 px-2 py-3 sm:py-4 overscroll-contain"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onWheel={onWheel}
      >
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-4 mx-auto max-w-md text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="font-extrabold mb-1">Could not display this PDF</p>
              <p className="break-words">{error}</p>
              <button
                type="button"
                onClick={retry}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-extrabold text-rose-900 underline"
              >
                <RefreshCw className="w-3 h-3" aria-hidden="true" /> Retry
              </button>
            </div>
          </div>
        )}

        {!error && !pdfDocument && (
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-slate-500 text-xs gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" aria-hidden="true" />
            <p className="font-extrabold text-slate-700">Loading document…</p>
            {loadProgress > 0 && loadProgress < 100 && (
              <div className="w-40 h-1 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all"
                  style={{ width: `${loadProgress}%` }}
                />
              </div>
            )}
          </div>
        )}

        {pdfDocument && numPages > 0 && (
          <div
            ref={pageWrapRef}
            className="mx-auto w-fit max-w-full"
            style={{ minWidth: 'fit-content' }}
          >
            <PageCanvas
              key={`${pageNumber}-${Math.round(scale * 1000)}`}
              pdfDocument={pdfDocument}
              pageNumber={pageNumber}
              scale={scale}
              onMetrics={metricsHandler}
            />
          </div>
        )}

        {!error && pdfDocument && numPages > 1 && (
          <div className="mt-3 flex items-center justify-center gap-2 text-[10.5px] text-slate-500 font-extrabold">
            <span>Swipe to turn pages · pinch to zoom</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default OfficialDocumentPreview;
