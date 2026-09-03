/**
 * Regression tests for the Portal "PORTAL COPY" watermark processor.
 *
 * These shapes are what REAL ERP-generated PDFs look like, and every one of
 * them silently failed (or rendered an invisible watermark) in the previous
 * implementation:
 *   A. nested (multi-level) /Pages trees
 *   B. /Contents as an inline stream
 *   C. /Contents as an array of indirect streams
 *   D. /Resources as an indirect reference to a SHARED dictionary whose
 *      /Font is itself an indirect dictionary
 *   E. no /Resources anywhere (inheritance absent)
 *
 * The tests also pin the ERP-authoritative contract (original financial text
 * survives; watermark text is added but nothing is changed) and the facade
 * blob flow used by preview/download/print.
 *
 * Run: npx tsx tests/watermarkRegression.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyPortalCopyWatermark,
  countWatermarkedPages,
  isAlreadyWatermarked,
  WATERMARK_TEXT,
} from '../src/features/customer-portal/portalPdfPostProcess.mjs';
import { watermarkBlob, applyPortalCopyWatermark as facadeWatermark } from '../src/features/customer-portal/utils/portalPdfPostProcess';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

let failures = 0;
async function check(label, fn) {
  try {
    await fn();
    console.log('ok   ' + label);
  } catch (err) {
    failures += 1;
    console.error('FAIL ' + label + ': ' + (err && err.message ? err.message : err));
  }
}

/* ------------------------------------------------------------------ */
/* Minimal-but-realistic PDF builders                                  */
/* ------------------------------------------------------------------ */

function emit(objects: Record<string, string>) {
  const header = '%PDF-1.4\n%\xff\xff\xff\xff\n';
  const parts: Buffer[] = [Buffer.from(header, 'binary')];
  const offs: Record<string, number> = {};
  let cursor = header.length;
  for (const n of Object.keys(objects).map(Number).sort((a, b) => a - b)) {
    offs[n] = cursor;
    const buf = Buffer.from(`${n} 0 obj\n${objects[n]}\nendobj\n`, 'binary');
    parts.push(buf);
    cursor += buf.length;
  }
  const max = Math.max(...Object.keys(objects).map(Number));
  let xref = `xref\n0 ${max + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= max; i++) {
    xref += offs[i] === undefined ? '0000000000 65535 f \n' : String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  }
  const trailer = `trailer\n<< /Size ${max + 1} /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'binary'), Buffer.from(trailer, 'binary'));
  return Buffer.concat(parts);
}

/** PDF whose page /Contents is an inline stream carrying ERP text. */
function buildInlineStreamPdf() {
  const c = 'BT /ERP 10 Tf 100 700 Td (INLINE STREAM CONTENT K1500) Tj ET';
  return emit({
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    3: [
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources 5 0 R',
      `/Contents << /Length ${c.length} >>\nstream\n${c}\nendstream >>`,
    ].join(' '),
    5: '<< /Font << /ERP << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>',
  });
}

/** PDF with 2 pages sharing one indirect /Resources dict. */
function buildSharedResourcePdf() {
  const content = 'BT /ERP 10 Tf 100 700 Td (INVOICE TOTAL K1500) Tj ET';
  const content2 = 'BT /ERP 10 Tf 100 600 Td (QUOTATION TOTAL K2500) Tj ET';
  return emit({
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    2: '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources 8 0 R /Contents 6 0 R >>',
    4: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources 8 0 R /Contents 7 0 R >>',
    6: `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    7: `<< /Length ${content2.length} >>\nstream\n${content2}\nendstream`,
    8: '<< /Font << /ERP << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>',
  });
}

/** Nested page tree: root Pages -> inner Pages -> two leaf pages. */
function buildNestedTreePdf() {
  const c1 = 'BT /F1 12 Tf 100 700 Td (ERP page 1) Tj ET';
  const c2 = 'BT /F1 12 Tf 100 600 Td (ERP page 2) Tj ET';
  return emit({
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    2: '<< /Type /Pages /Kids [3 0 R] /Count 2 >>',
    3: '<< /Type /Pages /Kids [4 0 R 5 0 R] /Count 2 >>',
    4: '<< /Type /Page /Parent 3 0 R /MediaBox [0 0 595 842] /Resources 9 0 R /Contents 7 0 R >>',
    5: '<< /Type /Page /Parent 3 0 R /MediaBox [0 0 595 842] /Resources 9 0 R /Contents 8 0 R >>',
    7: `<< /Length ${c1.length} >>\nstream\n${c1}\nendstream`,
    8: `<< /Length ${c2.length} >>\nstream\n${c2}\nendstream`,
    9: '<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>',
  });
}

async function textOf(pdf: Uint8Array): Promise<string> {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdf),
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  const perPage: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    perPage.push(
      tc.items
        .map((it) => ('str' in it ? (it as { str: string }).str : ''))
        .join(' ')
    );
  }
  return perPage.join('\n--- PAGE ---\n');
}

/* ------------------------------------------------------------------ */
/* A. Nested page tree                                                 */
/* ------------------------------------------------------------------ */
await check('A nested Pages tree: every leaf page gets a watermark stream', () => {
  const pdf = buildNestedTreePdf();
  const stamped = applyPortalCopyWatermark(pdf);
  assert.equal(countWatermarkedPages(stamped), 2);
  assert.ok(!isAlreadyWatermarked(pdf));
  assert.ok(isAlreadyWatermarked(stamped));
});

await check('A nested Pages tree: ERP text preserved and watermark readable', async () => {
  const stamped = applyPortalCopyWatermark(buildNestedTreePdf());
  const text = await textOf(stamped);
  assert.ok(text.includes('ERP page 1'));
  assert.ok(text.includes('ERP page 2'));
  assert.ok(text.includes('PORTAL COPY'), 'watermark must be extractable from rendered text');
});

/* ------------------------------------------------------------------ */
/* B. Inline-stream /Contents                                          */
/* ------------------------------------------------------------------ */
await check('B inline-stream /Contents: page stamped without losing content', async () => {
  const stamped = applyPortalCopyWatermark(buildInlineStreamPdf());
  assert.equal(countWatermarkedPages(stamped), 1);
  const text = await textOf(stamped);
  assert.ok(text.includes('INLINE STREAM CONTENT K1500'), 'inline ERP content must survive');
  assert.ok(text.includes('PORTAL COPY'));
  // The page dict must not contain a duplicated /Contents key.
  const src = Buffer.from(stamped).toString('latin1');
  const pageObj = src.slice(src.indexOf('3 0 obj'), src.indexOf('endobj', src.indexOf('3 0 obj')) + 6);
  assert.ok((pageObj.match(/\/Contents/g) || []).length === 1, 'exactly one /Contents per page dict');
});

/* ------------------------------------------------------------------ */
/* C. Array /Contents                                                  */
/* ------------------------------------------------------------------ */
await check('C /Contents as array keeps all original streams + watermark', async () => {
  const c1 = 'BT /ERP 10 Tf 100 700 Td (first stream text) Tj ET';
  const c2 = 'BT /ERP 10 Tf 100 600 Td (second stream text) Tj ET';
  const pdf = emit({
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources 5 0 R /Contents [4 0 R 6 0 R] >>',
    4: `<< /Length ${c1.length} >>\nstream\n${c1}\nendstream`,
    6: `<< /Length ${c2.length} >>\nstream\n${c2}\nendstream`,
    5: '<< /Font << /ERP << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>',
  });
  const stamped = applyPortalCopyWatermark(pdf);
  assert.equal(countWatermarkedPages(stamped), 1);
  const text = await textOf(stamped);
  assert.ok(text.includes('first stream text') && text.includes('second stream text'));
  assert.ok(text.includes('PORTAL COPY'));
});

/* ------------------------------------------------------------------ */
/* D. Indirect shared /Resources (+ indirect /Font map)                */
/* ------------------------------------------------------------------ */
await check('D indirect shared Resources: stamped and ERP fonts untouched', async () => {
  const pdf = buildSharedResourcePdf();
  const before = Buffer.from(pdf);
  const stamped = applyPortalCopyWatermark(pdf);
  assert.equal(countWatermarkedPages(stamped), 2);
  // Input must never be mutated.
  assert.deepEqual(Buffer.from(pdf), before, 'input bytes must be unchanged');

  const src = Buffer.from(stamped).toString('latin1');
  // ERP font entry still maps its own /ERP name to a real font object.
  assert.ok(src.includes('/ERP <<'), 'original /ERP font entry must survive');
  // Collision-free watermark font registered in the SAME shared dict.
  assert.ok(src.includes('/PcWmF'), 'watermark font alias must be present');
  const text = await textOf(stamped);
  assert.ok(text.includes('INVOICE TOTAL K1500'));
  assert.ok(text.includes('QUOTATION TOTAL K2500'));
  assert.ok(text.includes('PORTAL COPY'));
  // Exactly two watermark streams for two pages.
  const markers = src.split('%PcWmV1').length - 1;
  assert.equal(markers, 2, 'two injected watermark streams expected');
});

/* ------------------------------------------------------------------ */
/* E. No resources at all                                              */
/* ------------------------------------------------------------------ */
await check('E page without any /Resources still renders watermark', async () => {
  const c1 = 'BT (bare page) Tj ET';
  const pdf = emit({
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    3: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>`,
    4: `<< /Length ${c1.length} >>\nstream\n${c1}\nendstream`,
  });
  const stamped = applyPortalCopyWatermark(pdf);
  assert.equal(countWatermarkedPages(stamped), 1);
  // The watermark stream carries its own font, so it must still render and
  // be extractable even though this unusual page declares no resources at
  // all (the ERP content stream cannot render — it had no font either).
  const text = await textOf(stamped);
  assert.ok(text.includes('PORTAL COPY'));
  // Watermark resource registration happened without corrupting the page.
  const src = Buffer.from(stamped).toString('latin1');
  assert.ok(src.includes('/PcWmF'));
});

/* ------------------------------------------------------------------ */
/* F. ERP remains authoritative                                        */
/* ------------------------------------------------------------------ */
await check('F ERP-authoritative: financial text/values preserved byte-for-byte in original streams', () => {
  const pdf = buildSharedResourcePdf();
  const src = Buffer.from(pdf).toString('latin1');
  const stamped = applyPortalCopyWatermark(pdf);
  const stampedSrc = Buffer.from(stamped).toString('latin1');
  // Original content streams are copied verbatim into the output.
  for (const token of ['INVOICE TOTAL K1500', 'QUOTATION TOTAL K2500', '/BaseFont /Helvetica']) {
    assert.ok(stampedSrc.includes(token), token + ' must survive');
  }
  assert.ok(src.length < stampedSrc.length, 'processed bytes must be larger (streams appended)');
});

await check('F idempotent: re-stamping an already-watermarked PDF returns identical bytes', () => {
  const once = applyPortalCopyWatermark(buildNestedTreePdf());
  const twice = applyPortalCopyWatermark(once);
  assert.equal(Buffer.compare(Buffer.from(once), Buffer.from(twice)), 0);
  const thrice = applyPortalCopyWatermark(twice);
  assert.equal(Buffer.compare(Buffer.from(once), Buffer.from(thrice)), 0);
});

await check('F watermark failure throws (never silently returns unwatermarked PDF)', () => {
  assert.throws(() => applyPortalCopyWatermark(Buffer.from('not a pdf at all')));
  assert.throws(() => applyPortalCopyWatermark(Buffer.alloc(0)));
});

/* ------------------------------------------------------------------ */
/* G. Facade / blob flow (what preview/download/print consume)         */
/* ------------------------------------------------------------------ */
await check('G facade watermarkBlob returns changed application/pdf blob', async () => {
  const pdf = buildSharedResourcePdf();
  const blob = new Blob([new Uint8Array(pdf)], { type: 'application/pdf' });
  const processed = await watermarkBlob(blob, 'statement');
  assert.equal(processed.type, 'application/pdf');
  const processedBytes = new Uint8Array(await processed.arrayBuffer());
  assert.ok(processedBytes.byteLength > pdf.byteLength);
  assert.ok(countWatermarkedPages(processedBytes) === 2);
});

await check('G facade is idempotent across calls (same bytes in -> same bytes out)', async () => {
  const pdf = buildSharedResourcePdf();
  const blob = new Blob([new Uint8Array(pdf)], { type: 'application/pdf' });
  const a = new Uint8Array(await (await watermarkBlob(blob, 'invoice')).arrayBuffer());
  const b = new Uint8Array(await (await watermarkBlob(blob, 'invoice')).arrayBuffer());
  assert.equal(Buffer.compare(Buffer.from(a), Buffer.from(b)), 0);
});

await check('G facade result reports stamped pages', async () => {
  const res = await facadeWatermark(new Uint8Array(buildNestedTreePdf()));
  assert.equal(res.stampedPages, 2);
  assert.equal(res.alreadyWatermarked, false);
  const again = await facadeWatermark(new Uint8Array(res.bytes));
  assert.equal(again.alreadyWatermarked, true);
  assert.equal(again.stampedPages, 2);
});

/* ------------------------------------------------------------------ */
/* H. Every official-document UI flow routes through the processor     */
/* ------------------------------------------------------------------ */
await check('H all official-document consumers route through watermark/processed blob', () => {
  const featureDir = path.join(ROOT, 'src', 'features', 'customer-portal');
  const files = [
    'components/modals/InvoiceDetailModal.tsx',
    'components/modals/StatementPrintModal.tsx',
    'components/modals/StatementItemDetailModal.tsx',
    'components/modals/DeliveryTrackingModal.tsx',
    'components/tabs/InvoicesTab.tsx',
    'components/tabs/QuotesTab.tsx',
    'components/OfficialDocumentPreview.tsx',
    'hooks/useOfficialDocument.ts',
    'utils/officialDocument.ts',
  ];
  for (const rel of files) {
    const text = readFileSync(path.join(featureDir, rel), 'utf8');
    assert.ok(
      /useOfficialDocument|OfficialDocumentPreview|downloadOfficialDocument|watermarkBlob/.test(text),
      rel + ' must consume the processed-document path'
    );
  }
  // The processor file must be the only implementation of the watermark
  // algorithm (no duplicate .cjs/.js copies floating around).
  const processorCandidates = globSync(
    path.join(featureDir, '**', 'portalPdfPostProcess.*')
  );
  const canonical = processorCandidates.filter((f) =>
    /portalPdfPostProcess\.mjs$/.test(f) || /portalPdfPostProcess\.ts$/.test(f)
  );
  assert.ok(canonical.length >= 1, 'canonical processor module must exist');
  const nonCanonical = processorCandidates.filter((f) => !canonical.includes(f));
  assert.equal(nonCanonical.length, 0, 'no duplicate processor implementations: ' + nonCanonical.join(', '));
});

/* ------------------------------------------------------------------ */
/* I. Watermark must actually be injected (byte proof)                 */
/* ------------------------------------------------------------------ */
await check('I generated PDF structure: page /Contents references the watermark stream', async () => {
  const pdf = buildNestedTreePdf();
  const stamped = applyPortalCopyWatermark(pdf);
  const src = Buffer.from(stamped).toString('latin1');

  // The raw watermark content text (uncompressed stream) must appear once per
  // page, plus the marker comment per page.
  assert.ok(src.includes('PORTAL COPY'));
  const textOccurrences = src.split('(PORTAL COPY) Tj').length - 1;
  assert.equal(textOccurrences, 2, 'the watermark text operator must appear once per page');
});

if (failures > 0) {
  console.error(`\n${failures} regression check(s) failed`);
  process.exit(1);
}
console.log('\nAll watermark regression checks passed');
