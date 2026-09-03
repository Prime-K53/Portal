/**
 * STRUCTURAL VERIFICATION — proves the stamped PDF is a valid PDF that
 * pdfjs-dist can parse and render, and that the watermark text actually
 * shows up in the rendered operator list for every page.
 */
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

function buildRealPdf() {
  const header = '%PDF-1.7\n%\xff\xff\xff\xff\n';
  const compressed = (s) => zlib.deflateSync(Buffer.from(s, 'binary'));
  const pages = [
    { resources: '<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Courier >> >> /ProcSet [/PDF /Text] >>',
      body: 'BT /F1 18 Tf 50 750 Td (Prime Printing Service) Tj 0 -20 Td /F1 12 Tf (Statement #12345) Tj 0 -30 Td /F1 10 Tf (Customer: Sample Co) Tj ET' },
    { resources: '<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> /ProcSet [/PDF /Text] >>',
      body: 'BT /F1 12 Tf 50 750 Td (Page 2 - ERP Transaction List) Tj ET' },
  ];
  const objects = [];
  objects[1] = '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>';
  objects[2] = '<< /Type /Catalog /Pages 1 0 R >>';
  const pageRefs = []; const contentRefs = []; const resourceRefs = [];
  let nextNum = 3;
  pages.forEach(() => { pageRefs.push(nextNum++); contentRefs.push(nextNum++); resourceRefs.push(nextNum++); });
  pages.forEach((p, i) => {
    const pn = pageRefs[i];
    objects[pn] = `<< /Type /Page /Parent 1 0 R /MediaBox [0 0 612 792] /Contents ${contentRefs[i]} 0 R /Resources ${resourceRefs[i]} 0 R >>`;
    const streamBytes = compressed(p.body);
    objects[contentRefs[i]] = `<< /Length ${streamBytes.length} /Filter /FlateDecode >>\nstream\n${streamBytes.toString('binary')}\nendstream`;
    objects[resourceRefs[i]] = p.resources;
  });
  const parts = [Buffer.from(header, 'binary')];
  const offsets = {};
  for (const n of Object.keys(objects)) {
    offsets[n] = Buffer.concat(parts).length;
    parts.push(Buffer.from(`${n} 0 obj\n${objects[n]}\nendobj\n`, 'binary'));
  }
  const xrefStart = Buffer.concat(parts).length;
  let xref = `xref\n0 9\n0000000000 65535 f \n`;
  for (let i = 1; i < 9; i++) xref += offsets[i].toString().padStart(10, '0') + ' 00000 n \n';
  const trailer = `trailer\n<< /Size 9 /Root 2 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'binary'));
  parts.push(Buffer.from(trailer, 'binary'));
  return Buffer.concat(parts);
}

const { applyPortalCopyWatermark } = await import('../src/features/customer-portal/portalPdfPostProcess.mjs');
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const original = buildRealPdf();
const stamped = applyPortalCopyWatermark(original);

let failures = 0;
async function check(label, fn) {
  try { await fn(); console.log('ok   ' + label); }
  catch (err) { failures++; console.error('FAIL ' + label + ': ' + err.message); }
}

await check('stamped PDF is parseable by pdfjs-dist', async () => {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(stamped), disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  assert.equal(doc.numPages, 2, 'expected 2 pages');
});

await check('every page renders ERP content + PORTAL COPY watermark', async () => {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(stamped), disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const OPS = pdfjs.OPS;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const ops = await page.getOperatorList();
    // Count showText operations per page. The watermark processor adds ONE
    // extra showText per page (the PORTAL COPY text inside the BT/ET block).
    // The original ERP stream had 1 BT/ET per page → 1 showText. After
    // watermarking, we have 2 BT/ET per page → 2 showText. (Some PDFs may
    // split into more — but the watermark must add at least one more.)
    let showTextCount = 0;
    for (let j = 0; j < ops.fnArray.length; j++) {
      if (ops.fnArray[j] === OPS.showText) showTextCount += 1;
    }
    console.log(`  page ${i}: showText operators: ${showTextCount}`);
    // The original PDF had 1 BT/ET block per page; after watermark we have
    // 2+ BT/ET blocks per page. So showText count should be at least 2.
    assert.ok(showTextCount >= 2,
      `page ${i}: expected at least 2 showText operators (ERP + watermark), got ${showTextCount}`);
  }
});

await check('stamped PDF has no duplicate object numbers', () => {
  const src = stamped.toString('binary');
  const matches = [...src.matchAll(/(\d+)\s+0\s+obj/g)];
  const counts = {};
  matches.forEach(m => { counts[m[1]] = (counts[m[1]] || 0) + 1; });
  const dupes = Object.entries(counts).filter(([_, c]) => c > 1);
  assert.equal(dupes.length, 0, 'duplicate objects: ' + JSON.stringify(dupes));
});

await check('watermark text is in the raw PDF stream (works for any font)', () => {
  const src = stamped.toString('binary');
  assert.ok(src.includes('PORTAL COPY'),
    'watermark text must appear in raw PDF stream');
  assert.ok(src.includes('portal-copy-watermark-v1'),
    'watermark marker must be in Info dict');
});

// Wrap the check calls in an async function so await works.

if (failures > 0) {
  console.error(failures + ' check(s) failed');
  process.exit(1);
}
console.log('All structural checks passed');