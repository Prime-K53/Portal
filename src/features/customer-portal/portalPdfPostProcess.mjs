/**
 * Portal PDF post-processor — applies the "PORTAL COPY" watermark to every
 * page of an official ERP-generated PDF BEFORE the Portal exposes it via
 * preview, download, or print.
 *
 * Strategy:
 *   - Locate every top-level "N M obj ... endobj" in the original PDF body.
 *   - For each /Page object, patch its bytes so:
 *       /Contents ...   →   /Contents [original_stream(s), watermark_stream]
 *       /Resources ...  →   exposes /F1 → new font resource object
 *     The original /Contents streams are PRESERVED — the watermark stream is
 *     APPENDED so ERP content still renders.
 *   - Patch the Catalog to point /Info at a brand-new Info dict carrying the
 *     watermark marker (/Keywords portal-copy-watermark-v1).
 *   - Append every NEW object (font resources, watermark streams, Info dict)
 *     to the END of the original body and rewrite the xref + trailer so a
 *     single, fully-consistent xref describes the entire document.
 *
 * The original PDF is NEVER mutated semantically — only Page dicts, the
 * Catalog's /Info, and the xref/trailer are rewritten. Compressed stream
 * payloads are NEVER text-edited.
 *
 * No external dependencies. Runs in Node and in the browser.
 */

const WATERMARK_TEXT = 'PORTAL COPY';
const WATERMARK_SUBJECT = 'Portal Copy';
const WATERMARK_KEYWORDS = 'portal-copy-watermark-v1';
const WATERMARK_FONT_SIZE = 72;
const WATERMARK_OPACITY = 0.18;
const WATERMARK_ROTATION_DEG = 35;
const WATERMARK_FONT_NAME = 'Helvetica';

/**
 * Cheap marker scan: if the bytes already carry the watermark keyword
 * marker, re-processing is a no-op.
 */
function isAlreadyWatermarked(bytes) {
  if (!bytes || bytes.length < 16) return false;
  // Scan the head of the buffer. Buffer.toString uses the buffer's own
  // byteOffset/length, so it correctly handles pooled/subarrayed buffers.
  const head = (Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength || bytes.length))
    .toString('latin1', 0, Math.min(bytes.length, 1 << 20));
  return head.indexOf('/Keywords') !== -1 && head.indexOf(WATERMARK_KEYWORDS) !== -1;
}

/**
 * Locate every top-level "N M obj ... endobj" span.
 * Returns objects sorted by their start offset.
 */
function locateObjects(buf) {
  const src = buf.toString('binary');
  const objects = [];
  const pattern = /(\d+)\s+(\d+)\s+obj\b/g;
  let match;
  while ((match = pattern.exec(src)) !== null) {
    const num = parseInt(match[1], 10);
    const gen = parseInt(match[2], 10);
    const start = match.index;
    const endObjIdx = src.indexOf('endobj', start);
    if (endObjIdx === -1) continue;
    let end = endObjIdx + 6; // skip "endobj" (6 chars: e-n-d-o-b-j)
    while (end < src.length && (src.charCodeAt(end) === 10 || src.charCodeAt(end) === 13 || src.charCodeAt(end) === 32)) {
      end += 1;
    }
    objects.push({ num, gen, start, end });
  }
  return objects;
}

/**
 * Find where the ORIGINAL xref begins — everything before that is the
 * original PDF body, which we copy verbatim (with surgical patches).
 */
function findXrefStart(src) {
  const m = /startxref\s+(\d+)\s+%%EOF/.exec(src);
  if (!m) return -1;
  return parseInt(m[1], 10);
}

/**
 * Build the watermark content stream — draws "PORTAL COPY" centered on the
 * page, rotated, semi-transparent.
 */
function buildWatermarkStream(width, height, opts) {
  const text = opts.text ?? WATERMARK_TEXT;
  const opacity = typeof opts.opacity === 'number' ? opts.opacity : WATERMARK_OPACITY;
  const rot = typeof opts.rotationDeg === 'number' ? opts.rotationDeg : WATERMARK_ROTATION_DEG;
  const fs = typeof opts.fontSize === 'number' ? opts.fontSize : WATERMARK_FONT_SIZE;
  const cx = width / 2;
  const cy = height / 2;
  const halfWidth = text.length * fs * 0.28;
  const safeText = String(text).replace(/[()\\]/g, '\\$&');
  const rad = rot * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return (
    'q\n' +
    '  ' + opacity.toFixed(2) + ' g\n' +
    '  /F1 ' + fs + ' Tf\n' +
    '  BT\n' +
    '    ' + cos.toFixed(4) + ' ' + sin.toFixed(4) + ' ' + (-sin).toFixed(4) + ' ' + cos.toFixed(4) + ' ' + cx.toFixed(2) + ' ' + cy.toFixed(2) + ' Tm\n' +
    '    -' + halfWidth.toFixed(2) + ' 0 Td\n' +
    '    (' + safeText + ') Tj\n' +
    '  ET\n' +
    'Q\n'
  );
}

/** Body for the new font resource object (exposes /F1 → Helvetica). */
function buildFontResourceBody() {
  return '<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /' + WATERMARK_FONT_NAME + ' >> >> >>';
}

/** Body for the new Info dict (carries the watermark marker). */
function buildInfoBody() {
  const subj = WATERMARK_SUBJECT.replace(/[()\\]/g, '\\$&');
  const kw = WATERMARK_KEYWORDS.replace(/[()\\]/g, '\\$&');
  return '<< /Producer (PrimeERP) /Subject (' + subj + ') /Keywords (' + kw + ') >>';
}

/**
 * Given a string and the index of a "<<" opening a PDF dict, find the
 * index of the matching ">>" closing it. Returns -1 if not found.
 */
function findMatchingDictEnd(str, startIdx) {
  let depth = 0;
  for (let i = startIdx; i < str.length - 1; i += 1) {
    if (str.charCodeAt(i) === 60 && str.charCodeAt(i + 1) === 60) {
      depth += 1;
      i += 1;
    } else if (str.charCodeAt(i) === 62 && str.charCodeAt(i + 1) === 62) {
      depth -= 1;
      i += 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Patch a Page dict so its /Contents references the watermark stream AS
 * WELL AS the original stream(s), and so /Resources exposes /F1 → our
 * font resource.
 *
 * Returns the patched Page bytes (INCLUDING the surrounding "N M obj" and
 * "endobj"), or null if this is not a Page.
 */
function patchPage(pageBytes, watermarkStreamNum, fontResNum) {
  const asString = pageBytes.toString('binary');

  // Only patch /Page (not /Pages, which is the catalog's kid container).
  if (!/\/Type\s*\/Page\b/.test(asString)) return null;
  if (/\/Type\s*\/Pages\b/.test(asString)) return null;

  const WMS = watermarkStreamNum + ' 0 R';
  let patched = asString;

  // ----- 1. Append watermark stream to /Contents -----
  const scalarRe = /(\/Contents\s+)(\d+)\s+(\d+)\s+R(\b)/;
  if (scalarRe.test(patched)) {
    patched = patched.replace(scalarRe, '$1[$2 $3 R ' + WMS + ']');
  } else {
    const arrayRe = /(\/Contents\s*)\[([^\]]*)\](\s*\/?>?)/;
    const am = arrayRe.exec(patched);
    if (am) {
      const inner = am[2].trim();
      const trailing = am[3];
      patched = patched.replace(arrayRe, '$1[' + (inner ? inner + ' ' : '') + WMS + ']' + trailing);
    } else {
      // Find the last ">>" that closes the page dict (i.e. is followed by
      // optional whitespace + "endobj" + end-of-string). Tolerates either
      // \n or \r\n between >> and endobj.
      const closeRe = />>\s*(?:\r?\n)?(?:endobj\s*)?$/;
      if (closeRe.test(patched)) {
        patched = patched.replace(closeRe, '/Contents ' + WMS + '\n>>');
      } else {
        return null;
      }
    }
  }

  // ----- 2. Ensure /Resources exposes /F1 → fontResNum -----
  patched = ensurePageFontResource(patched, fontResNum);

  return Buffer.from(patched, 'binary');
}

/**
 * Ensure a Page dict's /Resources exposes /F1 → fontResNum.
 * Handles:
 *   - /Resources << ... /Font << ... >> ... >>     (merge into existing /Font)
 *   - /Resources << ... >>                          (add /Font << /F1 N 0 R >>)
 *   - /Resources N M R                              (indirect — left alone; watermark may not render)
 *   - missing /Resources                            (add inline /Resources)
 */
function ensurePageFontResource(pageString, fontResNum) {
  const FONT_REF = '/F1 ' + fontResNum + ' 0 R';
  const FONT_DICT = '/Font << ' + FONT_REF + ' >>';

  const resIdx = pageString.indexOf('/Resources');
  if (resIdx === -1) {
    const closeRe = />>\s*(?:\r?\n)?(?:endobj\s*)?$/;
    if (closeRe.test(pageString)) {
      return pageString.replace(closeRe, '/Resources << ' + FONT_DICT + ' >>\n>>');
    }
    return pageString;
  }

  const after = pageString.slice(resIdx + '/Resources'.length);
  const ws = after.match(/^\s*/)[0].length;
  const valStart = resIdx + '/Resources'.length + ws;
  const nextCh = pageString.charAt(valStart);

  if (nextCh === '<' && pageString.charAt(valStart + 1) === '<') {
    const dictEnd = findMatchingDictEnd(pageString, valStart);
    if (dictEnd === -1) return pageString;
    const dictBody = pageString.slice(valStart + 2, dictEnd);

    const fontIdx = dictBody.indexOf('/Font');
    if (fontIdx !== -1) {
      const fontDictStart = dictBody.indexOf('<<', fontIdx);
      if (fontDictStart !== -1) {
        const fontDictEnd = findMatchingDictEnd(dictBody, fontDictStart);
        if (fontDictEnd !== -1) {
          const inner = dictBody.slice(fontDictStart + 2, fontDictEnd).trim();
          const newInner = (inner ? inner + ' ' : '') + FONT_REF;
          const newDictBody =
            dictBody.slice(0, fontDictStart) +
            '<< ' + newInner + ' >>' +
            dictBody.slice(fontDictEnd + 2);
          return pageString.slice(0, valStart) + '<<' + newDictBody + '>>' + pageString.slice(dictEnd + 2);
        }
      }
    } else {
      const newDictBody = (dictBody.trim() ? dictBody.trim() + ' ' : '') + FONT_DICT;
      return pageString.slice(0, valStart) + '<< ' + newDictBody + ' >>' + pageString.slice(dictEnd + 2);
    }
  }

  return pageString;
}

/**
 * Patch the Catalog dict to point /Info at our new Info dict.
 */
function patchCatalog(catalogBytes, newInfoNum) {
  const asString = catalogBytes.toString('binary');
  if (!/\/Type\s*\/Catalog\b/.test(asString)) return null;

  const INFO_REF = '/Info ' + newInfoNum + ' 0 R';
  let patched = asString;

  const infoRe = /(\/Info\s+)(\d+)\s+(\d+)\s+R/;
  if (infoRe.test(patched)) {
    patched = patched.replace(infoRe, '$1' + newInfoNum + ' 0 R');
  } else {
    const closeRe = />>\s*(?:\r?\n)?(?:endobj\s*)?$/;
    if (closeRe.test(patched)) {
      patched = patched.replace(closeRe, INFO_REF + '\n>>');
    } else {
      return null;
    }
  }
  return Buffer.from(patched, 'binary');
}

/** Extract MediaBox from a Page dict string. Defaults to US Letter. */
function getMediaBox(pageStr) {
  const mb = pageStr.match(/\/MediaBox\s*\[\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s*\]/);
  if (!mb) return [0, 0, 612, 792];
  return [parseFloat(mb[1]), parseFloat(mb[2]), parseFloat(mb[3]), parseFloat(mb[4])];
}

/**
 * Build a complete xref table + trailer from the offset map.
 */
function buildXrefAndTrailer(offsets, rootRef, infoRef, totalObjects, xrefOffset) {
  const lines = ['xref', '0 ' + totalObjects];
  for (let i = 0; i < totalObjects; i += 1) {
    const off = offsets[i];
    lines.push(
      off === undefined
        ? '0000000000 65535 f \n'
        : off.toString().padStart(10, '0') + ' 00000 n \n'
    );
  }
  const xref = lines.join('');
  const trailer =
    'trailer\n<< /Size ' + totalObjects + ' /Root ' + rootRef + ' /Info ' + infoRef + ' >>\nstartxref\n' +
    xrefOffset + '\n%%EOF\n';
  return Buffer.from(xref + trailer, 'binary');
}

/**
 * Main entry point.
 *
 * Idempotent. Throws on parse failure.
 */
function applyPortalCopyWatermark(input, options) {
  if (!input) throw new Error('portalPdfPostProcess: empty PDF input');
  const opts = options || {};

  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);

  if (isAlreadyWatermarked(buf)) return buf;

  const headerMagic = buf.toString('latin1', 0, 5);
  if (headerMagic !== '%PDF-') {
    throw new Error('portalPdfPostProcess: input is not a PDF (missing %PDF- header)');
  }

  const src = buf.toString('binary');
  const xrefStartInOriginal = findXrefStart(src);
  if (xrefStartInOriginal === -1) {
    throw new Error('portalPdfPostProcess: PDF has no xref/startxref');
  }

  const originalBody = buf.slice(0, xrefStartInOriginal);

  const objects = locateObjects(originalBody);
  if (objects.length === 0) {
    throw new Error('portalPdfPostProcess: no PDF objects found in body');
  }

  const catalog = objects.find(o => {
    const b = originalBody.slice(o.start, o.end).toString('binary');
    return /\/Type\s*\/Catalog\b/.test(b);
  });
  if (!catalog) throw new Error('portalPdfPostProcess: PDF has no /Catalog object');

  const catalogBodyStr = originalBody.slice(catalog.start, catalog.end).toString('binary');
  const pagesRefMatch = catalogBodyStr.match(/\/Pages\s+(\d+)\s+(\d+)\s+R/);
  if (!pagesRefMatch) throw new Error('portalPdfPostProcess: catalog has no /Pages reference');
  const pagesNum = parseInt(pagesRefMatch[1], 10);

  const pagesObj = objects.find(o => o.num === pagesNum);
  if (!pagesObj) throw new Error('portalPdfPostProcess: /Pages object not found');

  const pagesBodyStr = originalBody.slice(pagesObj.start, pagesObj.end).toString('binary');
  const kidsMatch = pagesBodyStr.match(/\/Kids\s*\[([^\]]*)\]/);
  if (!kidsMatch) throw new Error('portalPdfPostProcess: /Pages has no /Kids array');
  const kids = [];
  const inner = kidsMatch[1];
  const re2 = /(\d+)\s+(\d+)\s+R/g;
  let m2;
  while ((m2 = re2.exec(inner)) !== null) {
    kids.push({ num: parseInt(m2[1], 10), gen: parseInt(m2[2], 10) });
  }
  if (kids.length === 0) {
    throw new Error('portalPdfPostProcess: /Pages /Kids is empty');
  }

  // Allocate new object numbers.
  const maxExisting = objects.reduce((m, o) => o.num > m ? o.num : m, 0);
  let nextNum = maxExisting + 1;
  const newFontResNum = nextNum++;
  const newStreamNums = kids.map(() => nextNum++);
  const newInfoNum = nextNum++;
  const totalObjects = nextNum;

  // Build per-page patches and gather the new objects to append.
  const replacements = new Map();
  const newObjectsToAppend = [];

  for (let i = 0; i < kids.length; i += 1) {
    const kid = kids[i];
    const pageObj = objects.find(o => o.num === kid.num);
    if (!pageObj) continue;
    const pageBytes = originalBody.slice(pageObj.start, pageObj.end);
    const pageStr = pageBytes.toString('binary');
    const mediaBox = getMediaBox(pageStr);
    const width = mediaBox[2] - mediaBox[0];
    const height = mediaBox[3] - mediaBox[1];

    const watermarkStreamStr = buildWatermarkStream(width, height, opts);
    const watermarkBytes = Buffer.from(watermarkStreamStr, 'binary');

    const patched = patchPage(pageBytes, newStreamNums[i], newFontResNum);
    if (!patched) continue;

    replacements.set(kid.num, patched);
    newObjectsToAppend.push({
      num: newStreamNums[i],
      body: '<< /Length ' + watermarkBytes.length + ' >>\nstream\n' + watermarkBytes.toString('binary') + '\nendstream',
    });
  }

  // Font resource object (shared across pages — referenced by every /F1 entry).
  newObjectsToAppend.push({ num: newFontResNum, body: buildFontResourceBody() });

  // Patch Catalog to point at our new Info dict.
  const catalogBytes = originalBody.slice(catalog.start, catalog.end);
  const patchedCatalog = patchCatalog(catalogBytes, newInfoNum);
  if (patchedCatalog) {
    replacements.set(catalog.num, patchedCatalog);
  }
  newObjectsToAppend.push({ num: newInfoNum, body: buildInfoBody() });

  // Re-emit the body in numeric-start order, then append new objects.
  const sortedObjs = objects.slice().sort((a, b) => a.start - b.start);
  const pieces = [];

  // Emit the PDF header + everything between objects.
  // We use obj.start to slice the BYTES BEFORE each object, which includes
  // the %PDF- header and any whitespace.
  let cursor = 0;
  for (const obj of sortedObjs) {
    pieces.push(buf.slice(cursor, obj.start));
    const rep = replacements.get(obj.num);
    pieces.push(rep ?? buf.slice(obj.start, obj.end));
    cursor = obj.end;
  }
  // Tail bytes after the last object (just in case).
  if (cursor < originalBody.length) pieces.push(buf.slice(cursor, originalBody.length));

  newObjectsToAppend.sort((a, b) => a.num - b.num);
  for (const a of newObjectsToAppend) {
    pieces.push(Buffer.from(a.num + ' 0 obj\n' + a.body + '\nendobj\n', 'binary'));
  }

  const rebuiltBody = Buffer.concat(pieces);
  const rebuiltSrc = rebuiltBody.toString('binary');

  // Compute xref offsets (first match wins → no duplicates).
  const offsets = new Array(totalObjects).fill(undefined);
  const rx = /(\d+)\s+(\d+)\s+obj\b/g;
  let mm;
  while ((mm = rx.exec(rebuiltSrc)) !== null) {
    const n = parseInt(mm[1], 10);
    if (offsets[n] === undefined) offsets[n] = mm.index;
  }

  const xrefOffset = rebuiltBody.length;
  const rootRef = catalog.num + ' 0 R';
  const infoRef = newInfoNum + ' 0 R';

  const xrefAndTrailer = buildXrefAndTrailer(offsets, rootRef, infoRef, totalObjects, xrefOffset);

  return Buffer.concat([rebuiltBody, xrefAndTrailer]);
}

export {
  applyPortalCopyWatermark,
  isAlreadyWatermarked,
  WATERMARK_TEXT,
  WATERMARK_SUBJECT,
  WATERMARK_KEYWORDS,
};