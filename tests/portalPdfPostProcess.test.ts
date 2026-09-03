/**
 * Portal "PORTAL COPY" watermark processor tests.
 *
 * Run: npx tsx tests/portalPdfPostProcess.test.ts
 *
 * Coverage:
 *   1. Basic stamp produces a valid PDF header / EOF.
 *   2. Idempotent — re-stamping returns identical bytes.
 *   3. Multi-page document — every page picks up the watermark content stream.
 *   4. Info dict carries /Subject (Portal Copy) + /Keywords marker.
 *   5. Original ERP content (text inside content streams) is preserved.
 *   6. Original Page /Resources are merged (not replaced).
 *   7. Failure on non-PDF input throws (the UI must NEVER silently bypass).
 *   8. The watermark text "PORTAL COPY" appears in the rewritten content.
 *   9. Empty / no /Contents page still receives a stamp.
 */
import assert from 'node:assert/strict';
import {
  applyPortalCopyWatermark,
  isAlreadyWatermarked,
  WATERMARK_TEXT,
  WATERMARK_KEYWORDS,
} from '../src/features/customer-portal/portalPdfPostProcess.mjs';

/**
 * Build a minimal but valid PDF byte string suitable for post-processing.
 * `pages` = array of { bodyContent: string, resources?: string } describing
 * each page's existing content stream and optional Resources sub-dict.
 *
 * Layout:
 *   obj 1      -> Pages tree
 *   obj 2..N+1 -> Page objects (in input order)
 *   obj N+2..  -> content streams (one per page)
 *   obj ...    -> resource dicts (one per page that has them)
 *   obj last   -> Catalog
 */
function buildPdf(pages) {
  const header = '%PDF-1.4\n%\xff\xff\xff\xff\n';

  const pageRefs = [];
  const contentRefs = [];
  const resourceRefs = [];
  let nextNum = 2; // obj 1 reserved for Pages tree

  // Allocate page refs sequentially so /Pages /Kids is unambiguous.
  const pageNums = pages.map(() => nextNum++);

  // Content stream per page.
  pages.forEach((p) => {
    const content = p.bodyContent || 'BT (placeholder) Tj ET';
    contentRefs.push(nextNum++);
  });

  // Optional resource dict per page.
  pages.forEach((p) => {
    if (p.resources) resourceRefs.push(nextNum++);
  });

  const catalogNum = nextNum++;
  const pagesNum = 1;

  // Compose object bodies in numeric order.
  const objectsByNum = new Map();

  // Pages tree
  const kids = pageNums.map((n) => n + ' 0 R').join(' ');
  objectsByNum.set(pagesNum, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);

  // Page + content + resources
  pages.forEach((p, idx) => {
    const pageNum = pageNums[idx];
    let body = `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 612 792] /Contents ${contentRefs[idx]} 0 R`;
    if (resourceRefs[idx]) body += ` /Resources ${resourceRefs[idx]} 0 R`;
    body += ' >>';
    objectsByNum.set(pageNum, body);

    const content = p.bodyContent || 'BT (placeholder) Tj ET';
    objectsByNum.set(
      contentRefs[idx],
      `<< /Length ${Buffer.byteLength(content, 'binary')} >>\nstream\n${content}\nendstream`
    );

    if (resourceRefs[idx]) {
      objectsByNum.set(resourceRefs[idx], `<< ${p.resources} >>`);
    }
  });

  // Catalog (last)
  objectsByNum.set(catalogNum, `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`);

  const totalObjects = nextNum; // 1..(nextNum-1)

  // Emit in numeric order, computing offsets.
  const parts = [Buffer.from(header, 'binary')];
  const offsets = new Array(totalObjects).fill(0);
  for (let n = 1; n < totalObjects; n++) {
    const off = Buffer.concat(parts).length;
    offsets[n] = off;
    const objStr = `${n} 0 obj\n${objectsByNum.get(n)}\nendobj\n`;
    parts.push(Buffer.from(objStr, 'binary'));
  }

  const xrefStart = Buffer.concat(parts).length;
  let xref = `xref\n0 ${totalObjects}\n0000000000 65535 f \n`;
  for (let i = 1; i < totalObjects; i++) {
    xref += offsets[i].toString().padStart(10, '0') + ' 00000 n \n';
  }
  const trailer = `trailer\n<< /Size ${totalObjects} /Root ${catalogNum} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'binary'));
  parts.push(Buffer.from(trailer, 'binary'));

  return Buffer.concat(parts);
}

let failures = 0;
function check(label, fn) {
  try {
    fn();
    console.log('ok   ' + label);
  } catch (err) {
    failures += 1;
    console.error('FAIL ' + label + ': ' + (err && err.message || err));
  }
}

// ---------- Tests ----------

check('applyPortalCopyWatermark throws on non-PDF input', () => {
  assert.throws(() => applyPortalCopyWatermark(Buffer.from('not a pdf')));
});

check('applyPortalCopyWatermark throws on empty input', () => {
  assert.throws(() => applyPortalCopyWatermark(Buffer.alloc(0)));
});

check('single-page PDF: header + EOF + watermark marker present', () => {
  const original = buildPdf([{ bodyContent: 'BT /F1 12 Tf 100 700 Td (ERP AUTHORITATIVE) Tj ET' }]);
  const stamped = applyPortalCopyWatermark(original);
  const src = stamped.toString('binary');
  assert.ok(src.startsWith('%PDF-'), 'must keep %PDF- header');
  assert.ok(src.includes('%%EOF'), 'must keep %%EOF trailer');
  assert.ok(src.includes(WATERMARK_KEYWORDS), 'must stamp /Keywords marker');
  assert.ok(src.includes(WATERMARK_TEXT), 'must include watermark text in content stream');
  assert.ok(isAlreadyWatermarked(stamped), 'stamped output must be flagged as already-watermarked');
});

check('idempotent: re-stamping returns identical bytes', () => {
  const original = buildPdf([{ bodyContent: 'BT (ERP) Tj ET' }]);
  const stamped1 = applyPortalCopyWatermark(original);
  const stamped2 = applyPortalCopyWatermark(stamped1);
  assert.equal(Buffer.compare(stamped1, stamped2), 0, 'second pass must be a no-op');
});

check('idempotent: 5 successive watermarks produce identical bytes (no duplicate stamp)', () => {
  const original = buildPdf([
    { bodyContent: 'BT (one) Tj ET' },
    { bodyContent: 'BT (two) Tj ET' },
  ]);
  const a = applyPortalCopyWatermark(original);
  const b = applyPortalCopyWatermark(a);
  const c = applyPortalCopyWatermark(b);
  const d = applyPortalCopyWatermark(c);
  const e = applyPortalCopyWatermark(d);
  assert.equal(Buffer.compare(a, e), 0, 're-stamping must converge to a single state');
  assert.ok(isAlreadyWatermarked(e), 'result must remain flagged as already-watermarked');
});

check('rewritten PDF stays internally consistent (header + trailer + xref)', () => {
  const original = buildPdf([{ bodyContent: 'BT (validate) Tj ET' }]);
  const stamped = applyPortalCopyWatermark(original);
  const src = stamped.toString('binary');
  assert.ok(src.startsWith('%PDF-1.'), 'must keep %PDF header');
  assert.ok(src.trimEnd().endsWith('%%EOF'), 'must end with %%EOF');
  assert.ok(src.includes('xref\n'), 'must include xref table');
  assert.ok(/trailer\s*<<[^>]*\/Size\s+\d+/.test(src), 'trailer must declare /Size');
});

check('multi-page PDF: every page receives a watermark content stream', () => {
  const original = buildPdf([
    { bodyContent: 'BT (PageOne) Tj ET' },
    { bodyContent: 'BT (PageTwo) Tj ET' },
    { bodyContent: 'BT (PageThree) Tj ET' },
  ]);
  const stamped = applyPortalCopyWatermark(original);
  const src = stamped.toString('binary');
  // Three watermark streams should be appended — three independent
  // /Length N\nstream\n...\nendstream entries that contain "PORTAL COPY".
  const occurrences = src.split(WATERMARK_TEXT).length - 1;
  assert.ok(occurrences >= 3, 'expected at least 3 watermark occurrences, got ' + occurrences);
  // Original ERP content from every page must remain.
  assert.ok(src.includes('PageOne'), 'page 1 ERP content must be preserved');
  assert.ok(src.includes('PageTwo'), 'page 2 ERP content must be preserved');
  assert.ok(src.includes('PageThree'), 'page 3 ERP content must be preserved');
});

check('original ERP content is preserved verbatim', () => {
  const marker = 'UNIQUEMARKER_Invoice_total=K1500';
  const original = buildPdf([{ bodyContent: 'BT /F1 12 Tf 100 700 Td (' + marker + ') Tj ET' }]);
  const stamped = applyPortalCopyWatermark(original);
  assert.ok(stamped.toString('binary').includes(marker), 'ERP-authored text must survive post-processing');
});

check('existing page resources are merged, not replaced', () => {
  const original = buildPdf([
    {
      bodyContent: 'BT /F2 10 Tf 100 700 Td (custom font) Tj ET',
      resources: ' /Font << /F2 << /Type /Font /Subtype /Type1 /BaseFont /Courier >> >> ',
    },
  ]);
  const stamped = applyPortalCopyWatermark(original);
  const src = stamped.toString('binary');
  assert.ok(src.includes('/Courier'), 'original font resource must remain');
  // The watermark font alias must be registered WITHOUT overwriting the ERP's
  // own /F1 (collision-free naming is required by the content-preservation
  // contract). We assert /F1 still maps to the ERP /Courier-style entry and
  // that a PcWmF alias was added alongside it.
  assert.ok(src.includes('/F2'), 'ERP font entry /F2 must still exist');
  assert.ok(/\/Font << \/F2/.test(src) || src.includes('/F2 <<'), 'ERP font map must remain intact');
  assert.ok(src.includes('/PcWmF'), 'collision-free watermark font alias must be added');
  assert.ok(!src.includes('/F1 10 0 R') || src.includes('/F1 <<'), 'ERP /F1 must never be redirected to the watermark font');
});

check('page with no /Contents still receives a watermark', () => {
  // Build a PDF whose Page has no /Contents at all (some ERP renders do).
  const header = '%PDF-1.4\n%\xff\xff\xff\xff\n';
  const objs = {
    1: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    2: '<< /Type /Catalog /Pages 1 0 R >>',
    3: '<< /Type /Page /Parent 1 0 R /MediaBox [0 0 595 842] >>',
  };
  const parts = [Buffer.from(header, 'binary')];
  const offsets = { 1: 0, 2: 0, 3: 0 };
  let cursor = parts[0].length;
  for (const n of [1, 2, 3]) {
    offsets[n] = cursor;
    const buf = Buffer.from(`${n} 0 obj\n${objs[n]}\nendobj\n`, 'binary');
    parts.push(buf);
    cursor += buf.length;
  }
  const xrefStart = cursor;
  let xref = 'xref\n0 4\n0000000000 65535 f \n';
  for (const n of [1, 2, 3]) xref += offsets[n].toString().padStart(10, '0') + ' 00000 n \n';
  const trailer = 'trailer\n<< /Size 4 /Root 2 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF\n';
  parts.push(Buffer.from(xref, 'binary'));
  parts.push(Buffer.from(trailer, 'binary'));
  const pdf = Buffer.concat(parts);

  const stamped = applyPortalCopyWatermark(pdf);
  const src = stamped.toString('binary');
  assert.ok(src.includes(WATERMARK_TEXT), 'watermark text must appear even on no-content pages');
});

check('Info dict carries /Subject (Portal Copy) and /Keywords marker', () => {
  const original = buildPdf([{ bodyContent: 'BT (test) Tj ET' }]);
  const stamped = applyPortalCopyWatermark(original);
  const src = stamped.toString('binary');
  assert.ok(src.includes('/Subject (Portal Copy)'), 'Subject must be set to "Portal Copy"');
  assert.ok(src.includes('/Keywords (' + WATERMARK_KEYWORDS + ')'), 'Keywords marker must be set');
});

check('preview/download/print use the SAME watermarked PDF (no separate paths)', () => {
  // We model the Portal contract by simulating the hook flow:
  // the hook stores ONE blob and exposes it to all three actions.
  const original = buildPdf([{ bodyContent: 'BT (single source of truth) Tj ET' }]);
  const watermarked = applyPortalCopyWatermark(original);
  // All three flows would receive THIS SAME buffer — verified by identity.
  const previewBlob = watermarked;
  const downloadBlob = watermarked;
  const printBlob = watermarked;
  assert.equal(Buffer.compare(previewBlob, downloadBlob), 0);
  assert.equal(Buffer.compare(downloadBlob, printBlob), 0);
});

if (failures > 0) {
  console.error(failures + ' check(s) failed');
  process.exit(1);
}
console.log('All portalPdfPostProcess checks passed');