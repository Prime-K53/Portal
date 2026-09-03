/**
 * Real-browser visual verification (temporary tool — not shipped).
 *
 * 1. Builds a realistic 2-page "Prime Printing Service" ERP-style PDF.
 * 2. Watermarks it with the production portal processor.
 * 3. Saves both PDFs under artifacts/ for manual opening.
 * 4. Renders both documents page-by-page with pdf.js inside headless Chrome
 *    (driven over the Chrome DevTools Protocol) and pixel-diffs each page to
 *    PROVE the PORTAL COPY watermark is actually painted by a real renderer.
 *
 * Run: node scripts/visual-verify.mjs
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { applyPortalCopyWatermark } from '../src/features/customer-portal/portalPdfPostProcess.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACTS = path.join(ROOT, 'artifacts');
mkdirSync(ARTIFACTS, { recursive: true });

function buildErpStatementPdf(opts) {
  const textOnly = opts && opts.textOnly;
  const header = '%PDF-1.6\n%\xff\xff\xff\xff\n';
  const objects = {};
  let nextObj = 1;
  const addObj = (body) => { const n = nextObj++; objects[n] = body; return n; };

  const pagesObjNum = addObj('');
  const catalogNum = addObj('');
  const resNum = addObj('<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Courier >> >> /ProcSet [/PDF /Text] >>');
  const pageNums = [];
  const contentNums = [];
  const pageContent = [
    [
      'BT /F1 20 Tf 50 800 Td (Prime Printing Service) Tj ET',
      'BT /F1 10 Tf 50 786 Td (P.O. Box 1234, Lilongwe) Tj ET',
      'BT /F1 10 Tf 50 774 Td (Phone: +265 992 528 222   Email: info.primemw@gmail.com) Tj ET',
      ...(textOnly ? [] : ['0.7 0.7 0.7 RG 2 w 50 760 m 545 760 l S']),
      'BT /F2 14 Tf 50 730 Td (ACCOUNT STATEMENT) Tj ET',
      'BT /F1 10 Tf 380 730 Td (Statement #ST-2026-0451) Tj ET',
      'BT /F1 10 Tf 50 700 Td (Customer: ACME LTD   Account: CUST-0001) Tj ET',
      'BT /F2 10 Tf 50 670 Td (Opening balance) Tj ET',
      'BT /F1 10 Tf 200 670 Td (K 0.00) Tj ET',
      'BT /F2 10 Tf 50 650 Td (INV-1001   Invoice #INV-2026-0001) Tj ET',
      'BT /F1 10 Tf 200 650 Td (K 1,250.00) Tj ET',
      'BT /F2 10 Tf 50 630 Td (PAY-2210  Payment reference PR-8821) Tj ET',
      'BT /F1 10 Tf 200 630 Td (K -500.00) Tj ET',
      ...(textOnly ? [] : ['0.7 0.7 0.7 RG 2 w 50 590 m 545 590 l S']),
      'BT /F1 12 Tf 50 565 Td (Closing balance) Tj ET',
      'BT /F1 12 Tf 200 565 Td (K 750.00) Tj ET',
      ...(textOnly ? [] : ['0.5 0.5 0.5 RG 2 w 50 540 m 545 540 l S', 'q 0.9 0.9 0.9 rg 60 500 100 30 re f Q']),
      ...(textOnly ? [] : ['BT /F1 8 Tf 65 512 Td (AUTHORISED SIGNATURE) Tj ET']),
    ].join('\n'),
    [
      'BT /F1 14 Tf 50 800 Td (Transaction detail - continued) Tj ET',
      'BT /F2 10 Tf 50 770 Td (INV-1002 Invoice #INV-2026-0002) Tj ET',
      'BT /F1 10 Tf 220 770 Td (K 300.00) Tj ET',
      'BT /F2 10 Tf 50 750 Td (Total debits) Tj ET',
      'BT /F1 10 Tf 220 750 Td (K 1,550.00) Tj ET',
      'BT /F2 10 Tf 50 730 Td (Total credits) Tj ET',
      'BT /F1 10 Tf 220 730 Td (K 500.00) Tj ET',
      ...(textOnly ? [] : ['0.7 0.7 0.7 RG 2 w 50 700 m 545 700 l S']),
      'BT /F1 12 Tf 50 675 Td (Balance carried forward) Tj ET',
      'BT /F1 12 Tf 220 675 Td (K 750.00) Tj ET',
    ].join('\n'),
  ];

  pageContent.forEach((body) => {
    pageNums.push(addObj(''));
    contentNums.push(addObj(`<< /Length ${Buffer.byteLength(body, 'binary')} >>\nstream\n${body}\nendstream`));
  });

  const kids = pageNums.map((n) => `${n} 0 R`).join(' ');
  objects[pagesObjNum] = `<< /Type /Pages /Kids [${kids}] /Count ${pageNums.length} >>`;
  pageNums.forEach((pn, i) => {
    objects[pn] = `<< /Type /Page /Parent ${pagesObjNum} 0 R /MediaBox [0 0 595 842] /Resources ${resNum} 0 R /Contents ${contentNums[i]} 0 R >>`;
  });
  objects[catalogNum] = `<< /Type /Catalog /Pages ${pagesObjNum} 0 R >>`;

  const parts = [Buffer.from(header, 'binary')];
  const offsets = {};
  for (const n of Object.keys(objects).map(Number).sort((a, b) => a - b)) {
    offsets[n] = Buffer.concat(parts).length;
    parts.push(Buffer.from(`${n} 0 obj\n${objects[n]}\nendobj\n`, 'binary'));
  }
  const size = nextObj;
  const xrefStart = Buffer.concat(parts).length;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let i = 1; i < size; i++) xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  const trailer = `trailer\n<< /Size ${size} /Root ${catalogNum} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'binary'), Buffer.from(trailer, 'binary'));
  return Buffer.concat(parts);
}

async function cdpConnect(port, wantedUrl) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  let page = list.find((t) => t.type === 'page' && wantedUrl && t.url.includes(wantedUrl));
  if (!page) page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled' || msg.method === 'Runtime.exceptionThrown' || msg.method === 'Log.entryAdded') {
      events.push(msg);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  const close = () => ws.close();
  return { send, close, events };
}

async function cdpEval(send, expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('page error: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
}

const original = buildErpStatementPdf({ textOnly: true });
const watermarked = applyPortalCopyWatermark(original);
const origB64 = original.toString('base64');
const wmB64 = Buffer.from(watermarked).toString('base64');

writeFileSync(path.join(ARTIFACTS, 'portal-copy-sample-erp-original.pdf'), original);
writeFileSync(path.join(ARTIFACTS, 'portal-copy-sample-watermarked.pdf'), watermarked);
console.log(`wrote artifacts/portal-copy-sample-erp-original.pdf (${original.length} bytes)`);
console.log(`wrote artifacts/portal-copy-sample-watermarked.pdf (${watermarked.length} bytes)`);

const harnessPath = path.join(ROOT, 'scripts', 'wm-visual', 'harness.html');
let html = readFileSync(harnessPath, 'utf8');
html = html
  .replace('__ORIGINAL_B64__', origB64)
  .replace('__WATERMARKED_B64__', wmB64);
const servedHarness = path.join(ARTIFACTS, 'wm-harness.html');
writeFileSync(servedHarness, html);

const express = (await import('express')).default;
const app = express();
const mime = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json' };
app.use((req, res, next) => {
  const ext = path.extname(req.path);
  if (mime[ext]) res.type(mime[ext]);
  next();
});
app.use(express.static(ROOT));
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/artifacts/wm-harness.html`;
console.log('harness at', url);

const chromeCandidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const chrome = chromeCandidates.find((c) => {
  try { readFileSync(c); return true; } catch { return false; }
});
if (!chrome) throw new Error('Chrome/Edge not found');

const cdpPort = 9300 + Math.floor(Math.random() * 200);
const userData = path.join(ARTIFACTS, 'chrome-profile');
mkdirSync(userData, { recursive: true });
const child = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${userData}`,
  '--window-size=1400,1200',
  url,
], { stdio: ['ignore', 'ignore', 'pipe'] });

try {
  let cdp;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      cdp = await cdpConnect(cdpPort, 'wm-harness');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!cdp) throw new Error('could not connect to chrome CDP');
  const { send, close, events } = cdp;

  await send('Runtime.enable');
  await send('Log.enable').catch(() => {});
  const pageUrl = String(await cdpEval(send, 'location.href'));
  if (!pageUrl.includes('wm-harness')) {
    await send('Page.enable');
    await send('Page.navigate', { url });
  }
  let raw = 'RUNNING';
  for (let attempt = 0; attempt < 300; attempt++) {
    raw = String(await cdpEval(send, 'document.getElementById("result") && document.getElementById("result").textContent'));
    if (raw && raw !== 'RUNNING' && raw !== 'null') break;
    await new Promise((r) => setTimeout(r, 400));
  }
  close();

  if (raw === 'RUNNING' || !raw || raw === 'null') {
    const recent = events.slice(-12).map((e) => JSON.stringify(e).slice(0, 400));
    console.error('harness never finished. recent page events:\n' + recent.join('\n'));
    throw new Error('harness never finished');
  }

  let result;
  try {
    result = JSON.parse(raw);
  } catch (err) {
    console.error('raw result was not JSON — first 600 chars:', String(raw).slice(0, 600));
    throw err;
  }
  if (result.error) {
    console.error('harness error:', result.error);
    console.error('recent page events:\n' + events.slice(-8).map((e) => JSON.stringify(e).slice(0, 400)).join('\n'));
    process.exit(1);
  }
  console.log('\n=== RENDER DIFF (watermarked vs original), per page ===');
  const pageExpectations = {
    1: ['Prime Printing Service', 'ST-2026-0451', '+265 992 528 222', 'info.primemw@gmail.com', 'K 1,250.00', 'K 750.00'],
    2: ['K 300.00', 'Balance carried forward', 'K 750.00'],
  };
  let failures = 0;
  for (const p of result.pages) {
    const v = p.vsOriginal;
    const s = p.sanityDiff;
    const b = p.erpPaintedVsBlank;
    const hasWatermarkText = p.textWatermarked.includes('PORTAL COPY');
    const withoutWm = p.textWatermarked.replace(/PORTAL COPY/g, '');
    const missingTokens = (pageExpectations[p.page] || []).filter((tok) => !withoutWm.includes(tok));
    const erpKept = missingTokens.length === 0;
    // Watermark pixels must appear around the page center (rotated text band).
    const center = Math.floor(p.height / 2);
    const centerPx = (v.rowCounts || []).slice(center - 120, center + 120).reduce((a, c) => a + c, 0);
    const alphaPainted = v.changed > 100 && v.pct > 0.05 && centerPx > 60 && v.maxDelta > 20;
    const sanityOk = s.changed > 100;
    const erpTextPaints = b.pct > 0.1;
    const pass = alphaPainted && sanityOk && erpTextPaints && hasWatermarkText && erpKept;
    if (!pass) failures += 1;
    console.log(`page ${p.page}: ${p.width}x${p.height}`);
    console.log(`  watermark vs original : changed=${v.changed} (${v.pct.toFixed(3)}%) maxDelta=${v.maxDelta} centerPx=${centerPx} => ${alphaPainted ? 'PAINTED' : 'NOT PAINTED'}`);
    console.log(`  sanity red line : changed=${s.changed} | ERP text paints: ${b.pct.toFixed(2)}% vs blank`);
    console.log(`  watermark text in text layer: ${hasWatermarkText} | ERP tokens missing after wm: ${missingTokens.length ? missingTokens.join(', ') : 'none'}`);
    console.log(`  => ${pass ? 'PASS' : 'FAIL'}`);
  }
  if (failures > 0) {
    console.error(`${failures} page visual check(s) failed`);
    process.exit(1);
  }
  console.log('\nVisual verification PASSED — PORTAL COPY pixels are painted on every page by a real Chrome PDF render.');
} finally {
  child.kill();
  server.close();
}
