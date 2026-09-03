/**
 * Portal PDF post-processor — applies the "PORTAL COPY" watermark to every
 * page of an official ERP-generated PDF BEFORE the Portal exposes it via
 * preview, download, or print.
 *
 * Design rules:
 *
 *  1. ZERO runtime dependencies and NO reliance on Node globals. This module
 *     NEVER touches `Buffer` (browsers do not define it). All byte work uses
 *     Uint8Array + latin1 strings, so the same code runs in Node tests and in
 *     the Vite browser bundle.
 *
 *  2. The ERP PDF is the single source of truth. Accounting data, company
 *     identity, balances, totals, QR codes and signatures live inside the
 *     ORIGINAL content streams, which are NEVER decoded or edited. This
 *     processor only:
 *       - appends ONE new content stream per page (the watermark),
 *       - registers a font + ExtGState entry in the page's resources
 *         (without touching any existing resource names),
 *       - rewrites the page /Contents entry so the new stream is rendered,
 *       - points the Catalog at a fresh /Info dict carrying the marker.
 *
 *  3. No silent failures. If any page cannot be processed the function
 *     THROWS, so the UI can never hand a customer an unwatermarked official
 *     document by accident.
 *
 *  4. Idempotent. Every injected watermark stream carries a marker comment;
 *     re-processing a stamped PDF returns the input unchanged.
 *
 * Supported input shapes (verified by tests):
 *   - flat /Pages trees AND nested (multi-level) /Pages trees
 *   - /Contents as a single indirect stream, an array of streams, an inline
 *     stream, or absent
 *   - /Resources inline, an indirect reference to a shared dictionary, or
 *     absent (with inheritance from ancestor /Pages nodes)
 *   - compressed (FlateDecode) content streams — untouched; watermarks are
 *     appended as fresh uncompressed streams
 *   - classic xref tables (single or incremental)
 *
 * Unsupported (throws a descriptive Error): xref-stream/object-stream PDFs
 * and malformed structures. Failing loudly is deliberate — see rule 3.
 */

const WATERMARK_TEXT = 'PORTAL COPY';
const WATERMARK_SUBJECT = 'Portal Copy';
const WATERMARK_KEYWORDS = 'portal-copy-watermark-v1';
/** Comment marker placed inside EVERY injected watermark content stream. */
const WATERMARK_STREAM_MARKER = '%PcWmV1';
const WATERMARK_FONT_SIZE = 64;
const WATERMARK_ALPHA = 0.18;
const WATERMARK_ROTATION_DEG = 35;

/* ------------------------------------------------------------------ */
/* Byte helpers (latin1 = one byte per char — safe for raw PDF bytes)  */
/* ------------------------------------------------------------------ */

function bytesToLatin1(bytes) {
  const len = bytes.byteLength;
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < len; i += CHUNK) {
    const end = Math.min(len, i + CHUNK);
    const chunk = bytes.subarray(i, end);
    let part = '';
    for (let j = 0; j < chunk.length; j += 1) part += String.fromCharCode(chunk[j]);
    out += part;
  }
  return out;
}

function latin1ToBytes(str) {
  const len = str.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

function copyBytes(input) {
  const out = new Uint8Array(input.byteLength);
  out.set(input);
  return out;
}

/* ------------------------------------------------------------------ */
/* Marker / idempotency                                                */
/* ------------------------------------------------------------------ */

/**
 * Marker scan across the WHOLE file. The marker comment is embedded in every
 * injected watermark content stream, so its presence is proof that real
 * watermark bytes were added — never merely an Info-dict mention.
 */
function isAlreadyWatermarked(bytes) {
  if (!bytes || bytes.byteLength < 16) return false;
  return bytesToLatin1(bytes).indexOf(WATERMARK_STREAM_MARKER) !== -1;
}

/** How many pages carry an injected watermark stream (0 = unprocessed). */
function countWatermarkedPages(bytes) {
  if (!bytes) return 0;
  const src = bytesToLatin1(bytes);
  let count = 0;
  let idx = 0;
  while ((idx = src.indexOf(WATERMARK_STREAM_MARKER, idx)) !== -1) {
    count += 1;
    idx += WATERMARK_STREAM_MARKER.length;
  }
  return count;
}

/* ------------------------------------------------------------------ */
/* Low-level string scanning                                           */
/* ------------------------------------------------------------------ */

function skipWs(str, i) {
  while (
    i < str.length &&
    (str[i] === ' ' || str[i] === '\t' || str[i] === '\r' || str[i] === '\n' || str[i] === '\f')
  ) i += 1;
  return i;
}

function isEol(ch) {
  return ch === '\n' || ch === '\r';
}

/** Find a whole PDF name token "/name" (never a prefix of a longer name). */
function findName(str, name, from = 0) {
  const target = '/' + name;
  let i = from;
  for (;;) {
    const idx = str.indexOf(target, i);
    if (idx === -1) return -1;
    const before = idx === 0 ? ' ' : str[idx - 1];
    const after = str[idx + target.length];
    const allowedBefore = /[\s>\[\]<>()\/{}%]/.test(before);
    const allowedAfter = after === undefined || !/[A-Za-z0-9]/.test(after);
    if (allowedBefore && allowedAfter) return idx;
    i = idx + 1;
  }
}

/**
 * From `i` positioned at '(' '[' or '<', return the index just past the
 * matching closer — honoring nested <<..>> / [..], parenthesized strings with
 * escapes, and hex strings. Returns -1 when unbalanced.
 */
function scanMatching(str, i) {
  if (str[i] === '(') {
    let depth = 1;
    let j = i + 1;
    while (j < str.length) {
      const c = str[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '(') depth += 1;
      else if (c === ')') { depth -= 1; if (depth === 0) return j + 1; }
      j += 1;
    }
    return -1;
  }
  if (str[i] === '<') {
    if (str[i + 1] === '<') {
      let depth = 0;
      let j = i;
      while (j < str.length - 1) {
        const c = str[j];
        if (c === '\\') { j += 2; continue; }
        if (c === '(') {
          j = scanMatching(str, j);
          if (j === -1) return -1;
          continue;
        }
        if (c === '<' && str[j + 1] === '<') { depth += 1; j += 2; continue; }
        if (c === '>' && str[j + 1] === '>') { depth -= 1; j += 2; if (depth === 0) return j; continue; }
        if (c === '<') {
          const hexEnd = str.indexOf('>', j + 1);
          if (hexEnd === -1) return -1;
          j = hexEnd + 1;
          continue;
        }
        j += 1;
      }
      return -1;
    }
    const end = str.indexOf('>', i + 1);
    return end === -1 ? -1 : end + 1;
  }
  if (str[i] === '[') {
    let depth = 0;
    let j = i;
    while (j < str.length) {
      const c = str[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '(') {
        j = scanMatching(str, j);
        if (j === -1) return -1;
        continue;
      }
      if (c === '[') depth += 1;
      else if (c === ']') { depth -= 1; if (depth === 0) return j + 1; }
      j += 1;
    }
    return -1;
  }
  return -1;
}

/**
 * Read the PDF value beginning at `pos`. Returns
 * { kind, start, end, text, num?, inner?, payload? }.
 * kinds: 'number' | 'ref' | 'name' | 'array' | 'dict' | 'string' |
 *        'hexstring' | 'inlinestream' | 'other'
 * `end` is exclusive. `inner` is the text between delimiters (dicts/arrays);
 * `payload` is the raw stream payload for inline streams.
 */
function readValue(str, pos) {
  const c = str[pos];
  if (c === undefined) return { kind: 'other', start: pos, end: pos, text: '' };
  if (c === '[') {
    const end = scanMatching(str, pos);
    if (end === -1) return { kind: 'other', start: pos, end: pos + 1, text: '[' };
    return { kind: 'array', start: pos, end, inner: str.slice(pos + 1, end - 1) };
  }
  if (c === '<') {
    if (str[pos + 1] === '<') {
      const end = scanMatching(str, pos);
      if (end === -1) return { kind: 'other', start: pos, end: pos + 1, text: '<' };
      let after = skipWs(str, end);
      if (str.startsWith('stream', after) && (after + 6 >= str.length || isEol(str[after + 6]))) {
        let dataBegin = after + 6;
        if (str[dataBegin] === '\r' && str[dataBegin + 1] === '\n') dataBegin += 2;
        else if (isEol(str[dataBegin])) dataBegin += 1;
        const esIdx = str.indexOf('endstream', dataBegin);
        if (esIdx === -1) return { kind: 'other', start: pos, end: pos + 1, text: '<' };
        return {
          kind: 'inlinestream',
          start: pos,
          end: esIdx + 'endstream'.length,
          text: str.slice(pos, esIdx + 'endstream'.length),
          dictText: str.slice(pos, end), // the << .. >> stream dictionary only
          payload: str.slice(dataBegin, esIdx),
        };
      }
      return {
        kind: 'dict',
        start: pos,
        end,
        inner: str.slice(pos + 2, end - 2),
        text: str.slice(pos, end),
      };
    }
    const end = str.indexOf('>', pos + 1);
    if (end === -1) return { kind: 'other', start: pos, end: pos + 1, text: '<' };
    return { kind: 'hexstring', start: pos, end: end + 1, text: str.slice(pos, end + 1) };
  }
  if (c === '(') {
    const end = scanMatching(str, pos);
    if (end === -1) return { kind: 'other', start: pos, end: pos + 1, text: '(' };
    return { kind: 'string', start: pos, end, text: str.slice(pos, end) };
  }
  if (c === '/') {
    let j = pos + 1;
    while (j < str.length && !/[\s()[\]<>{}/%]/.test(str[j])) j += 1;
    return { kind: 'name', start: pos, end: j, text: str.slice(pos, j) };
  }
  if (c === '+' || c === '-' || c === '.' || /^[0-9]/.test(c)) {
    let j = pos;
    while (j < str.length && /[0-9.+\-eE]/.test(str[j])) j += 1;
    const numText = str.slice(pos, j);
    let k = skipWs(str, j);
    if (/^[0-9]/.test(str[k] || '')) {
      let m = k;
      while (m < str.length && /[0-9]/.test(str[m])) m += 1;
      const l = skipWs(str, m);
      if (str[l] === 'R') {
        return {
          kind: 'ref',
          start: pos,
          end: l + 1,
          num: parseInt(numText, 10),
          gen: parseInt(str.slice(k, m), 10) || 0,
          text: str.slice(pos, l + 1),
        };
      }
    }
    return { kind: 'number', start: pos, end: j, text: numText };
  }
  return { kind: 'other', start: pos, end: pos + 1, text: str.slice(pos, pos + 1) };
}

/**
 * Locate every top-level "N M obj ... endobj" in `src` (scanning only up to
 * `limit`) with stream-payload skipping so binary data can never fake an
 * object header. Returns objects sorted by start offset.
 */
function locateObjects(src, limit) {
  const objects = [];
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m.index >= limit) break;
    const num = parseInt(m[1], 10);
    const gen = parseInt(m[2], 10);
    const start = m.index;

    let cursor = m.index + m[0].length;
    let end = -1;
    for (;;) {
      const sIdx = src.indexOf('stream', cursor);
      const eIdx = src.indexOf('endobj', cursor);
      if (eIdx === -1) break;
      const boundaryOk =
        sIdx !== -1 &&
        sIdx < eIdx &&
        (sIdx === 0 || /\s/.test(src[sIdx - 1])) &&
        (sIdx + 6 >= src.length || isEol(src[sIdx + 6]));
      if (boundaryOk) {
        const esIdx = src.indexOf('endstream', sIdx + 6);
        if (esIdx === -1) break;
        cursor = esIdx + 'endstream'.length;
        continue;
      }
      end = eIdx + 'endobj'.length;
      break;
    }
    if (end === -1) break; // malformed tail — stop scanning
    objects.push({ num, gen, start, end });
    re.lastIndex = end; // never scan inside a consumed object
    if (end >= limit) break;
  }
  return objects.sort((a, b) => a.start - b.start);
}

/**
 * Given a full object string "N M obj <<..>> endobj" return
 * { dictInner, dictOpen, dictClose } — dictOpen is the index of '<<' and
 * dictClose the index just past '>>'. Returns null for non-dict objects.
 */
function parseObjectDict(objText) {
  const objWord = objText.indexOf('obj');
  if (objWord === -1) return null;
  const start = skipWs(objText, objWord + 3);
  if (!objText.startsWith('<<', start)) return null;
  const end = scanMatching(objText, start);
  if (end === -1) return null;
  return { dictInner: objText.slice(start + 2, end - 2), dictOpen: start, dictClose: end };
}

/* ------------------------------------------------------------------ */
/* Watermark building                                                  */
/* ------------------------------------------------------------------ */

function buildWatermarkStream(width, height, fontName, gsName, opts) {
  const text = opts.text || WATERMARK_TEXT;
  const fontSize = typeof opts.fontSize === 'number' ? opts.fontSize : WATERMARK_FONT_SIZE;
  const alpha = typeof opts.alpha === 'number' ? opts.alpha : WATERMARK_ALPHA;
  const rot = typeof opts.rotationDeg === 'number' ? opts.rotationDeg : WATERMARK_ROTATION_DEG;

  const cx = width / 2;
  const cy = height / 2;
  const rad = (rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Rough Helvetica advance estimate used only to center the string.
  let advance = 0;
  for (let i = 0; i < text.length; i += 1) advance += text[i] === ' ' ? 0.28 : 0.6;
  const halfWidth = (advance * fontSize) / 2;
  const safeText = String(text).replace(/[()\\]/g, '\\$&');

  return (
    WATERMARK_STREAM_MARKER + '\n' +
    'q\n' +
    '/' + gsName + ' gs\n' +
    '0 0 0 rg\n' +
    'BT\n' +
    '/' + fontName + ' ' + fontSize.toFixed(1) + ' Tf\n' +
    cos.toFixed(4) + ' ' + sin.toFixed(4) + ' ' + (-sin).toFixed(4) + ' ' + cos.toFixed(4) +
      ' ' + cx.toFixed(2) + ' ' + cy.toFixed(2) + ' Tm\n' +
    (-halfWidth).toFixed(2) + ' 0 Td\n' +
    '(' + safeText + ') Tj\n' +
    'ET\n' +
    'Q\n'
  );
}

function buildFontObjectBody() {
  return '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
}

function buildExtGStateObjectBody(alpha) {
  return '<< /Type /ExtGState /ca ' + alpha.toFixed(2) + ' /CA ' + alpha.toFixed(2) + ' >>';
}

function buildInfoBody() {
  const subj = WATERMARK_SUBJECT.replace(/[()\\]/g, '\\$&');
  const kw = WATERMARK_KEYWORDS.replace(/[()\\]/g, '\\$&');
  return '<< /Producer (PrimeERP) /Subject (' + subj + ') /Keywords (' + kw + ') >>';
}

function pickFreeName(inner, base) {
  let name = base;
  let i = 1;
  while (inner.indexOf('/' + name) !== -1) {
    i += 1;
    name = base + i;
  }
  return name;
}

/* ------------------------------------------------------------------ */
/* Core processor                                                      */
/* ------------------------------------------------------------------ */

function applyPortalCopyWatermark(input, options) {
  if (!input) throw new Error('portalPdfPostProcess: empty PDF input');
  const opts = options || {};

  const srcBytes =
    input instanceof Uint8Array
      ? input
      : new Uint8Array(input.buffer || input, input.byteOffset || 0, input.byteLength || input.length);

  if (isAlreadyWatermarked(srcBytes)) return copyBytes(srcBytes);

  const src = bytesToLatin1(srcBytes);
  if (src.slice(0, 5) !== '%PDF-') {
    throw new Error('portalPdfPostProcess: input is not a PDF (missing %PDF- header)');
  }

  // Final (active) xref offset: the value of the LAST startxref keyword.
  let xrefPos = -1;
  {
    let searchFrom = 0;
    for (;;) {
      const sx = src.indexOf('startxref', searchFrom);
      if (sx === -1) break;
      const valStart = skipWs(src, sx + 'startxref'.length);
      const numEnd = /^[0-9]+/.exec(src.slice(valStart));
      if (numEnd) xrefPos = parseInt(numEnd[0], 10);
      searchFrom = sx + 1;
    }
  }
  if (xrefPos === -1 || xrefPos >= src.length) {
    throw new Error('portalPdfPostProcess: PDF has no startxref');
  }

  const objects = locateObjects(src, xrefPos);
  if (objects.length === 0) {
    throw new Error(
      'portalPdfPostProcess: no PDF objects found in body (xref-stream/object-stream PDFs are not supported)'
    );
  }

  // Active object per number = the LAST occurrence in file order.
  const lastIdxByNum = new Map();
  for (const o of objects) lastIdxByNum.set(o.num, o);
  const byNum = lastIdxByNum;

  const maxObj = objects.reduce((mx, o) => (o.num > mx ? o.num : mx), 0);

  // Find the active Catalog object.
  let catalog = null;
  for (const o of objects) {
    if (byNum.get(o.num) !== o) continue;
    const parsed = parseObjectDict(src.slice(o.start, o.end));
    if (parsed && /\/Type\s*\/Catalog\b/.test(parsed.dictInner)) {
      catalog = o;
      break;
    }
  }
  if (!catalog) {
    throw new Error(
      'portalPdfPostProcess: no /Catalog object found (xref-stream/object-stream PDFs are not supported)'
    );
  }

  // Root /Pages ref from the Catalog.
  const catalogParsed = parseObjectDict(src.slice(catalog.start, catalog.end));
  const pagesKeyIdx = findName(catalogParsed.dictInner, 'Pages');
  if (pagesKeyIdx === -1) throw new Error('portalPdfPostProcess: catalog has no /Pages reference');
  const pagesVal = readValue(catalogParsed.dictInner, skipWs(catalogParsed.dictInner, pagesKeyIdx + 7));
  if (pagesVal.kind !== 'ref') throw new Error('portalPdfPostProcess: catalog /Pages is not an indirect reference');
  const rootPagesNum = pagesVal.num;

  // Walk the page tree (BFS) collecting leaf page object numbers.
  const leafPages = [];
  {
    const seen = new Set();
    const queue = [rootPagesNum];
    while (queue.length > 0) {
      const num = queue.shift();
      if (seen.has(num)) continue;
      const obj = byNum.get(num);
      if (!obj) throw new Error('portalPdfPostProcess: page-tree reference ' + num + ' not found');
      seen.add(num);
      const parsed = parseObjectDict(src.slice(obj.start, obj.end));
      if (!parsed) throw new Error('portalPdfPostProcess: page-tree object ' + num + ' is not a dictionary');

      let typeText = null;
      const typeKey = findName(parsed.dictInner, 'Type');
      if (typeKey !== -1) {
        const tv = readValue(parsed.dictInner, skipWs(parsed.dictInner, typeKey + 5));
        if (tv.kind === 'name') typeText = tv.text;
      }

      if (typeText === '/Pages') {
        const kidsKey = findName(parsed.dictInner, 'Kids');
        if (kidsKey === -1) throw new Error('portalPdfPostProcess: /Pages node ' + num + ' has no /Kids');
        const kidsVal = readValue(parsed.dictInner, skipWs(parsed.dictInner, kidsKey + 5));
        if (kidsVal.kind !== 'array') throw new Error('portalPdfPostProcess: /Pages node ' + num + ' /Kids is not an array');
        const refRe = /(\d+)\s+(\d+)\s+R/g;
        let rm;
        while ((rm = refRe.exec(kidsVal.inner)) !== null) {
          const kidNum = parseInt(rm[1], 10);
          if (!seen.has(kidNum)) queue.push(kidNum);
        }
      } else {
        leafPages.push(num); // a /Page or a Type-less kid — treat as page
      }
    }
  }
  if (leafPages.length === 0) {
    throw new Error('portalPdfPostProcess: no leaf /Page objects found in the Pages tree');
  }

  /* ---------------------------------------------------------------- */
  /* Planning state                                                    */
  /* ---------------------------------------------------------------- */
  let nextNum = maxObj + 1;
  const fontObjNum = nextNum++;
  const gsObjNum = nextNum++;
  const infoObjNum = nextNum++;

  /** Queued text patches per object number — every patch re-parses the
   *  CURRENT text at run time, so earlier patches can never shift anchors. */
  const patches = new Map();
  /** Brand-new objects appended after the original body. */
  const appended = new Map();
  /** Inline-stream /Contents clones (page -> clone object number). */
  const inlineCloneNums = new Map();
  /** Per-page /Contents patch descriptors. */
  const pageContentsPatch = new Map();

  // Category-merge caches so shared resource objects merge exactly once.
  const fontCache = new Map(); // key -> font name registered
  const gsCache = new Map(); // key -> gs name registered

  const fontRefText = fontObjNum + ' 0 R';
  const gsRefText = gsObjNum + ' 0 R';

  function getObjectText(num) {
    const obj = byNum.get(num);
    return obj ? src.slice(obj.start, obj.end) : null;
  }

  function registerPatch(objNum, fn) {
    const list = patches.get(objNum) || [];
    list.push(fn);
    patches.set(objNum, list);
  }

  /**
   * Run-time merge: insert ` /category << /name ref >> ` (or append ` /name
   * ref ` into an existing category dict) into the /Resources dictionary
   * that page-or-object `holderObjNum` ends up with.
   *
   * holderShape tells us where the resources dict lives:
   *   'top'    — holderObjNum's own dict IS the resources dictionary
   *   'inline' — holderObjNum contains an inline /Resources dictionary
   *   'create' — holderObjNum had no resources; the FIRST category creates
   *              an inline /Resources dictionary on it, later categories
   *              append into that same dictionary
   */
  function applyCategoryMerge(text, holderShape, categoryName, name, refText) {
    const p = parseObjectDict(text);
    if (!p) return text;

    let resInnerText = null;
    let resInnerAbs = -1; // abs index of '<<' of the resources dict
    let resCloseAbs = -1; // abs index just past '>>' of the resources dict

    if (holderShape === 'top') {
      resInnerText = p.dictInner;
      resInnerAbs = p.dictOpen + 2;
      resCloseAbs = p.dictClose;
    } else {
      const resKey = findName(p.dictInner, 'Resources');
      if (resKey === -1) {
        if (holderShape !== 'create') return text; // unexpected — guard throws
        // Create a resources dict containing only this category.
        const closeInner = p.dictOpen + 2 + p.dictInner.length;
        return (
          text.slice(0, closeInner) +
          ' /Resources << ' + categoryName + ' << /' + name + ' ' + refText + ' >> >>' +
          text.slice(closeInner)
        );
      }
      const resVal = readValue(p.dictInner, skipWs(p.dictInner, resKey + 10));
      if (resVal.kind !== 'dict') return text; // unexpected shape — guard throws
      resInnerText = resVal.inner;
      resInnerAbs = p.dictOpen + 2 + resVal.start + 2;
      resCloseAbs = p.dictOpen + 2 + resVal.end;
    }

    const catIdx = findName(resInnerText, categoryName);
    if (catIdx === -1) {
      // No category in this resources dict — insert just before its closing >>.
      const insertAt = resCloseAbs - 2;
      return text.slice(0, insertAt) + ' ' + categoryName + ' << /' + name + ' ' + refText + ' >>' + text.slice(insertAt);
    }
    const catVal = readValue(resInnerText, skipWs(resInnerText, catIdx + categoryName.length + 1));
    if (catVal.kind !== 'dict') return text; // indirect category cannot be patched here
    const insertAbs = resInnerAbs + (catVal.end - 2); // before category '>>'
    return text.slice(0, insertAbs) + ' /' + name + ' ' + refText + text.slice(insertAbs);
  }

  /**
   * Register (once) the FONT or EXTGSTATE entry for a page's resources and
   * return the name the page's watermark stream must reference.
   *
   * `holder`: { objNum, shape: 'top' | 'inline' | 'create' } where 'top'
   * means objNum's own dict is a resources/font-map dict (reached through an
   * indirect reference), 'inline' means objNum holds an inline /Resources
   * dictionary, 'create' means the page had none anywhere.
   */
  function ensureCategoryEntry(holder, categoryName, cache, baseName, refText) {
    const cacheKey = categoryName + ':' + holder.shape + ':' + holder.objNum;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const holderText = getObjectText(holder.objNum);
    const parsed = parseObjectDict(holderText);
    if (!parsed) throw new Error('portalPdfPostProcess: resources holder is not a dictionary');

    // Which text do we inspect for existing names / category shape?
    let inspectInner = null;
    if (holder.shape === 'top') {
      inspectInner = parsed.dictInner;
    } else {
      const resKey = findName(parsed.dictInner, 'Resources');
      if (resKey !== -1) {
        const resVal = readValue(parsed.dictInner, skipWs(parsed.dictInner, resKey + 10));
        if (resVal.kind === 'ref') {
          // Resources is an indirect ref: the merge must happen inside that
          // object ('top' shape) — shared once through the cache.
          const name = ensureCategoryEntry(
            { objNum: resVal.num, shape: 'top' },
            categoryName, cache, baseName, refText
          );
          cache.set(cacheKey, name);
          return name;
        }
        if (resVal.kind === 'dict') inspectInner = resVal.inner;
      }
      if (inspectInner === null) {
        // holder said inline/create but no /Resources present now → treat as
        // 'create' so the patch builds one.
        const name = pickFreeName(parsed.dictInner, baseName);
        registerPatch(holder.objNum, (text) =>
          applyCategoryMerge(text, 'create', categoryName, name, refText)
        );
        cache.set(cacheKey, name);
        return name;
      }
    }

    const catIdx = findName(inspectInner, categoryName);
    if (catIdx !== -1) {
      const catVal = readValue(inspectInner, skipWs(inspectInner, catIdx + categoryName.length + 1));
      if (catVal.kind === 'ref') {
        // Category dict is itself indirect (shared) → merge into that object.
        const name = ensureCategoryEntry(
          { objNum: catVal.num, shape: 'top' },
          categoryName, cache, baseName, refText
        );
        cache.set(cacheKey, name);
        return name;
      }
      if (catVal.kind === 'dict') {
        const name = pickFreeName(catVal.inner, baseName);
        registerPatch(holder.objNum, (text) =>
          applyCategoryMerge(text, holder.shape === 'inline' ? 'inline' : holder.shape === 'create' ? 'create' : 'top', categoryName, name, refText)
        );
        cache.set(cacheKey, name);
        return name;
      }
      throw new Error('portalPdfPostProcess: /' + categoryName + ' category has an unsupported shape');
    }

    // No category — name is free inside the resources dict.
    const name = pickFreeName(inspectInner, baseName);
    const shape =
      holder.shape === 'inline' ? 'inline' :
      holder.shape === 'create' ? 'create' : 'top';
    registerPatch(holder.objNum, (text) =>
      applyCategoryMerge(text, shape, categoryName, name, refText)
    );
    cache.set(cacheKey, name);
    return name;
  }

  /**
   * Holder resolution for a page: where do its effective /Resources live?
   * Walks the page → /Parent chain (resources are inheritable in PDFs).
   */
  function resolveResourcesHolder(pageNum) {
    let num = pageNum;
    let walkedParent = false;
    for (let depth = 0; depth < 80; depth += 1) {
      const parsed = parseObjectDict(getObjectText(num));
      if (!parsed) return { objNum: pageNum, shape: 'create' };
      const resKey = findName(parsed.dictInner, 'Resources');
      if (resKey !== -1) {
        const resVal = readValue(parsed.dictInner, skipWs(parsed.dictInner, resKey + 10));
        if (resVal.kind === 'ref') return { objNum: resVal.num, shape: 'top' };
        if (resVal.kind === 'dict') return { objNum: num, shape: 'inline' };
        return { objNum: pageNum, shape: 'create' };
      }
      if (!walkedParent) {
        walkedParent = true;
        const parentKey = findName(parsed.dictInner, 'Parent');
        if (parentKey === -1) break;
        const parentVal = readValue(parsed.dictInner, skipWs(parsed.dictInner, parentKey + 7));
        if (parentVal.kind !== 'ref') break;
        num = parentVal.num;
      } else {
        break;
      }
    }
    return { objNum: pageNum, shape: 'create' };
  }

  /** Page box: own /MediaBox or /CropBox, else nearest ancestor's, else A4. */
  function resolvePageBox(pageNum) {
    let num = pageNum;
    for (let depth = 0; depth < 80; depth += 1) {
      const parsed = parseObjectDict(getObjectText(num));
      if (!parsed) break;
      for (const key of ['MediaBox', 'CropBox']) {
        const kIdx = findName(parsed.dictInner, key);
        if (kIdx === -1) continue;
        const v = readValue(parsed.dictInner, skipWs(parsed.dictInner, kIdx + key.length + 1));
        if (v.kind === 'array') {
          const nums = v.inner.match(/-?[0-9]+(?:\.[0-9]+)?/g);
          if (nums && nums.length >= 4) {
            return [parseFloat(nums[0]), parseFloat(nums[1]), parseFloat(nums[2]), parseFloat(nums[3])];
          }
        }
      }
      if (depth === 0) {
        const parentKey = findName(parsed.dictInner, 'Parent');
        if (parentKey === -1) break;
        const parentVal = readValue(parsed.dictInner, skipWs(parsed.dictInner, parentKey + 7));
        if (parentVal.kind !== 'ref') break;
        num = parentVal.num;
      } else {
        break;
      }
    }
    return [0, 0, 595, 842];
  }

  /* ---------------------------------------------------------------- */
  /* Plan every leaf page                                              */
  /* ---------------------------------------------------------------- */
  for (const pageNum of leafPages) {
    const obj = byNum.get(pageNum);
    const pageText = src.slice(obj.start, obj.end);
    const parsed = parseObjectDict(pageText);
    if (!parsed) throw new Error('portalPdfPostProcess: page object ' + pageNum + ' is not a dictionary');
    const inner = parsed.dictInner;

    // Classify /Contents.
    let contentsKind = 'absent';
    const contentsKey = findName(inner, 'Contents');
    if (contentsKey !== -1) {
      const cv = readValue(inner, skipWs(inner, contentsKey + 9));
      if (cv.kind === 'ref') contentsKind = 'ref';
      else if (cv.kind === 'array') contentsKind = 'array';
      else if (cv.kind === 'inlinestream') contentsKind = 'inline';
      else if (cv.kind === 'other' && cv.text === '') contentsKind = 'absent';
      else throw new Error('portalPdfPostProcess: page ' + pageNum + ' /Contents has an unsupported shape');
    }

    const watermarkStreamNum = nextNum++;
    pageContentsPatch.set(pageNum, { kind: contentsKind, streamNum: watermarkStreamNum });

    if (contentsKind === 'inline') {
      inlineCloneNums.set(pageNum, nextNum++);
    }

    // Register font + gs entries (order matters on 'create' pages: font
    // builds the /Resources dict, gs appends to it).
    const holder = resolveResourcesHolder(pageNum);
    const fontName = ensureCategoryEntry(holder, 'Font', fontCache, 'PcWmF', fontRefText);
    const gsName = ensureCategoryEntry(holder, 'ExtGState', gsCache, 'PcWmG', gsRefText);

    const box = resolvePageBox(pageNum);
    const width = box[2] - box[0];
    const height = box[3] - box[1];

    const streamContent = buildWatermarkStream(width, height, fontName, gsName, opts);
    appended.set(watermarkStreamNum, {
      text:
        watermarkStreamNum + ' 0 obj\n<< /Length ' + streamContent.length + ' >>\nstream\n' +
        streamContent + '\nendstream\nendobj\n',
    });
  }

  /* ---------------------------------------------------------------- */
  /* Inline-stream /Contents clones                                    */
  /* ---------------------------------------------------------------- */
  for (const [pageNum, cloneNum] of inlineCloneNums) {
    const parsed = parseObjectDict(getObjectText(pageNum));
    const contentsKey = findName(parsed.dictInner, 'Contents');
    const cv = readValue(parsed.dictInner, skipWs(parsed.dictInner, contentsKey + 9));
    if (cv.kind !== 'inlinestream') {
      throw new Error('portalPdfPostProcess: inline /Contents vanished before cloning (page ' + pageNum + ')');
    }
    const payload = cv.payload;
    // Preserve the original inline-stream dictionary verbatim (/Filter,
    // /Length, ...) so decoding semantics never change.
    appended.set(cloneNum, {
      text:
        cloneNum + ' 0 obj\n' + cv.dictText + '\nstream\n' +
        payload + '\nendstream\nendobj\n',
    });
  }

  /* ---------------------------------------------------------------- */
  /* Run-time /Contents patch functions (re-parse current text)        */
  /* ---------------------------------------------------------------- */
  for (const [pageNum, plan] of pageContentsPatch) {
    registerPatch(pageNum, (text) => {
      const p = parseObjectDict(text);
      if (!p) return text;
      const streamRef = plan.streamNum + ' 0 R';
      const key = findName(p.dictInner, 'Contents');

      if (plan.kind === 'absent') {
        if (key !== -1) return text;
        const closeInner = p.dictOpen + 2 + p.dictInner.length;
        return text.slice(0, closeInner) + ' /Contents ' + streamRef + text.slice(closeInner);
      }
      if (key === -1) return text;
      const v = readValue(p.dictInner, skipWs(p.dictInner, key + 9));

      if (plan.kind === 'ref') {
        if (v.kind !== 'ref') return text;
        const absStart = p.dictOpen + 2 + v.start;
        const absEnd = p.dictOpen + 2 + v.end;
        return text.slice(0, absStart) + '[' + v.text + ' ' + streamRef + ']' + text.slice(absEnd);
      }
      if (plan.kind === 'array') {
        if (v.kind !== 'array') return text;
        const abs = p.dictOpen + 2 + (v.end - 1);
        return text.slice(0, abs) + ' ' + streamRef + text.slice(abs);
      }
      if (plan.kind === 'inline') {
        if (v.kind !== 'inlinestream') return text;
        const cloneNum = inlineCloneNums.get(pageNum);
        const absStart = p.dictOpen + 2 + v.start;
        const absEnd = p.dictOpen + 2 + v.end;
        return text.slice(0, absStart) + '[' + cloneNum + ' 0 R ' + streamRef + ']' + text.slice(absEnd);
      }
      return text;
    });
  }

  /* ---------------------------------------------------------------- */
  /* Patch the Catalog /Info                                           */
  /* ---------------------------------------------------------------- */
  registerPatch(catalog.num, (text) => {
    const p = parseObjectDict(text);
    if (!p) return text;
    const newInfoRef = infoObjNum + ' 0 R';
    const key = findName(p.dictInner, 'Info');
    if (key !== -1) {
      const v = readValue(p.dictInner, skipWs(p.dictInner, key + 5));
      if (v.kind === 'ref') {
        const absStart = p.dictOpen + 2 + v.start;
        const absEnd = p.dictOpen + 2 + v.end;
        return text.slice(0, absStart) + newInfoRef + text.slice(absEnd);
      }
      const abs = p.dictOpen + 2 + v.start;
      return text.slice(0, abs) + newInfoRef + text.slice(abs);
    }
    const closeInner = p.dictOpen + 2 + p.dictInner.length;
    return text.slice(0, closeInner) + ' /Info ' + newInfoRef + text.slice(closeInner);
  });

  /* ---------------------------------------------------------------- */
  /* Apply every queued patch (each re-parses current text)            */
  /* ---------------------------------------------------------------- */
  const replacements = new Map();
  for (const [objNum, fns] of patches) {
    const obj = byNum.get(objNum);
    if (!obj) continue;
    let text = src.slice(obj.start, obj.end);
    for (const fn of fns) text = fn(text);
    replacements.set(objNum, text);
  }

  // Shared font, ExtGState and Info objects.
  appended.set(fontObjNum, { text: fontObjNum + ' 0 obj\n' + buildFontObjectBody() + '\nendobj\n' });
  appended.set(gsObjNum, { text: gsObjNum + ' 0 obj\n' + buildExtGStateObjectBody(WATERMARK_ALPHA) + '\nendobj\n' });
  appended.set(infoObjNum, { text: infoObjNum + ' 0 obj\n' + buildInfoBody() + '\nendobj\n' });

  /* ---------------------------------------------------------------- */
  /* Assemble: originals verbatim (with replacements) + appended +     */
  /* freshly computed xref/trailer with exact offsets.                 */
  /* ---------------------------------------------------------------- */
  const offsets = new Map();
  const genByNum = new Map();
  const pieces = [];
  // srcCursor walks the ORIGINAL source (gaps between objects); outCursor
  // counts OUTPUT bytes so object offsets stay exact even when a replacement
  // has a different length than the span it replaces.
  let srcCursor = 0;
  let outCursor = 0;
  const size = nextNum; // object numbers 0 .. nextNum-1

  for (const o of objects) {
    if (o.start > srcCursor) {
      const gap = src.slice(srcCursor, o.start);
      pieces.push(gap);
      outCursor += gap.length;
      srcCursor = o.start;
    }
    const pieceOffset = outCursor;
    const replacement = byNum.get(o.num) === o ? replacements.get(o.num) : undefined;
    const text = replacement !== undefined ? replacement : src.slice(o.start, o.end);
    pieces.push(text);
    outCursor += text.length;
    srcCursor = o.end;
    if (byNum.get(o.num) === o) {
      offsets.set(o.num, pieceOffset);
      genByNum.set(o.num, o.gen);
    }
  }
  // Bytes between the last object and the original xref are old xref/trailer
  // scaffolding — intentionally dropped (offsets are recomputed below).

  for (const num of [...appended.keys()].sort((a, b) => a - b)) {
    offsets.set(num, outCursor);
    genByNum.set(num, 0);
    const text = appended.get(num).text;
    pieces.push(text);
    outCursor += text.length;
  }

  // Preserve the original trailer /ID when present.
  let idText = '';
  {
    const trailerRegion = src.slice(xrefPos);
    const idMatch = /\/ID\s*\[([^\]]+)\]/.exec(trailerRegion);
    if (idMatch) idText = ' /ID [' + idMatch[1] + ']';
  }

  let xref = 'xref\n0 ' + size + '\n0000000000 65535 f \n';
  for (let i = 1; i < size; i += 1) {
    if (offsets.has(i)) {
      xref +=
        String(offsets.get(i)).padStart(10, '0') + ' ' +
        String(genByNum.get(i) || 0).padStart(5, '0') + ' n \n';
    } else {
      xref += '0000000000 65535 f \n';
    }
  }

  const body = pieces.join('');
  const xrefOffset = body.length;
  const trailer =
    'trailer\n<< /Size ' + size + ' /Root ' + catalog.num + ' 0 R /Info ' + infoObjNum +
    ' 0 R' + idText + ' >>\nstartxref\n' + xrefOffset + '\n%%EOF\n';

  const out = latin1ToBytes(body + xref + trailer);

  // Hard guard: the output MUST carry exactly one watermark stream per page.
  const stamped = countWatermarkedPages(out);
  if (stamped !== leafPages.length) {
    throw new Error(
      'portalPdfPostProcess: watermark injection failed (' + stamped + '/' + leafPages.length + ' pages stamped)'
    );
  }

  // Node tooling (tests) benefits from a Buffer view; browsers get the plain
  // Uint8Array. The Buffer branch is guarded so it never runs in the browser.
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(out.buffer, out.byteOffset, out.byteLength);
  }
  return out;
}

export {
  applyPortalCopyWatermark,
  isAlreadyWatermarked,
  countWatermarkedPages,
  WATERMARK_TEXT,
  WATERMARK_SUBJECT,
  WATERMARK_KEYWORDS,
};
