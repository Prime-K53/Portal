import React, { useEffect, useMemo, useState } from 'react';
import { useHashRoute } from '../router/useHashRoute';
import { env } from '../config/env';

type VerificationData = Record<string, any>;

type PageState =
  | { kind: 'loading' }
  | { kind: 'verified'; data: VerificationData }
  | { kind: 'terminal'; data: VerificationData }
  | { kind: 'invalid' };

const TYPE_TITLES: Record<string, string> = {
  invoice: 'invoice',
  receipt: 'receipt',
  quotation: 'quotation',
  sales_order: 'sales order',
  purchase_order: 'purchase order',
  delivery_note: 'delivery note',
  supplier_payment: 'supplier payment',
  statement: 'statement',
};

const TYPE_SLUGS: Record<string, string> = {
  invoice: 'invoice',
  receipt: 'receipt',
  quotation: 'quotation',
  sales_order: 'sales-order',
  purchase_order: 'purchase-order',
  delivery_note: 'delivery-note',
  supplier_payment: 'supplier-payment',
  statement: 'statement',
};

const SLUG_TO_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(TYPE_SLUGS).map(([type, slug]) => [slug, type])
);

const TERMINAL_STATUSES = ['VOID', 'CANCELLED', 'SUPERSEDED'];

const fmtMoney = (currency: string, n: number) =>
  `${currency} ${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const NUMBER_KEYS = [
  'invoiceNumber', 'receiptNumber', 'quotationNumber', 'orderNumber',
  'purchaseOrderNumber', 'deliveryNoteNumber', 'paymentNumber',
  'statementNumber',
];
const DATE_KEYS = [
  'invoiceDate', 'receiptDate', 'quotationDate', 'orderDate',
  'paymentDate', 'deliveryDate', 'creditNoteDate', 'debitNoteDate',
  'statementDate',
];

const SKIP_KEYS = new Set([
  'verified', 'documentType', 'companyName', ...NUMBER_KEYS, ...DATE_KEYS,
  'customerName', 'supplierName', 'status',
  'statementPeriodStart', 'statementPeriodEnd',
]);

function fieldRows(data: VerificationData): Array<[string, string]> {
  const numberKey = NUMBER_KEYS.find((k) => data[k] !== undefined);
  const dateKey = DATE_KEYS.find((k) => data[k] !== undefined);
  const party = data.customerName !== undefined ? 'Customer' : 'Supplier';
  const partyValue = data.customerName ?? data.supplierName ?? '';
  const rows: Array<[string, string]> = [];
  if (numberKey) rows.push(['Document Number', String(data[numberKey] ?? '')]);
  if (dateKey) rows.push(['Date', String(data[dateKey] ?? '')]);
  if (data.statementPeriodStart !== undefined || data.statementPeriodEnd !== undefined) {
    rows.push(['Statement Period', `${String(data.statementPeriodStart ?? '')} – ${String(data.statementPeriodEnd ?? '')}`]);
  }
  rows.push([party, String(partyValue)]);
  for (const [key, value] of Object.entries(data)) {
    if (SKIP_KEYS.has(key) || value === undefined || value === null || value === '') continue;
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
    const shown = /amount|total|balance|subtotal|^tax$/i.test(key) && typeof value === 'number'
      ? fmtMoney(String(data.currency || 'MWK'), value)
      : String(value);
    rows.push([label, shown]);
  }
  rows.push(['Status', String(data.status ?? '')]);
  return rows;
}

export function parseVerificationPath(path: string): { type: string | null; number: string; token: string } {
  const [pathPart, queryPart] = path.split('?');
  const parts = pathPart.split('/');
  const rawType = parts[2] || '';
  const rawNumber = parts[3] || '';
  const number = decodeURIComponent(rawNumber);
  const token = new URLSearchParams(queryPart || '').get('t') || '';
  const type = SLUG_TO_TYPE[rawType] || null;
  return { type, number, token };
}

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

function statusTone(status: string): 'paid' | 'unpaid' | 'partial' | 'neutral' | 'void' {
  const s = status.toUpperCase();
  if (s === 'PAID' || s === 'RECEIVED' || s === 'SETTLED') return 'paid';
  if (s.includes('PARTIAL') || s.includes('PARTLY')) return 'partial';
  if (s === 'UNPAID' || s === 'OVERDUE' || s === 'DUE' || s === 'OUTSTANDING') return 'unpaid';
  if (s === 'VOID' || s === 'CANCELLED' || s === 'SUPERSEDED') return 'void';
  return 'neutral';
}

function splitRowsForDisplay(all: Array<[string, string]>): {
  body: Array<[string, string]>;
  total: [string, string] | null;
  status: string;
} {
  const statusRow = all.find(([k]) => k === 'Status');
  const status = statusRow ? statusRow[1] : '';
  const bodyAll = all.filter(([k]) => k !== 'Status');
  const totalPriority = [/^balance due$/i, /^total$/i, /^grand total$/i, /^amount due$/i, /^balance$/i, /^amount payable$/i];
  let totalIdx = -1;
  for (const re of totalPriority) {
    const idx = bodyAll.findIndex(([k]) => re.test(k.trim()));
    if (idx >= 0) { totalIdx = idx; break; }
  }
  if (totalIdx >= 0) {
    const total = bodyAll[totalIdx];
    return { body: bodyAll.filter((_, i) => i !== totalIdx), total, status };
  }
  return { body: bodyAll, total: null, status };
}

const VERIFY_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');

.vp-scope {
  --paper: #F2EEE3;
  --paper-deep: #EAE4D2;
  --ink: #20261E;
  --ink-soft: #5B6156;
  --teal: #145C54;
  --teal-deep: #0E413B;
  --stamp: #B23A2E;
  --gold: #A9822F;
  --line: #D8D0BD;
  --line-soft: #E4DECB;
  --card: #FCFAF3;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 56px 20px 64px;
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(900px 420px at 18% -8%, rgba(20,92,84,0.10), transparent 60%),
    radial-gradient(760px 380px at 88% 8%, rgba(169,130,47,0.10), transparent 62%),
    radial-gradient(ellipse at 50% 110%, rgba(20,92,84,0.07), transparent 55%),
    var(--paper);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  color: var(--ink);
}
.vp-scope::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.55;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 0.13 0 0 0 0 0.15 0 0 0 0 0.12 0 0 0 0.025 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
.vp-orb { position: absolute; border-radius: 50%; filter: blur(70px); pointer-events: none; }
.vp-orb.a { width: 420px; height: 420px; left: -140px; top: -120px; background: rgba(20,92,84,0.14); }
.vp-orb.b { width: 360px; height: 360px; right: -120px; bottom: -100px; background: rgba(169,130,47,0.16); }

.vp-stub { position: relative; width: 100%; max-width: 472px; z-index: 1; animation: vp-rise 0.7s cubic-bezier(0.16,1,0.3,1) both; }
@keyframes vp-rise { from { opacity: 0; transform: translateY(22px) scale(0.99); } to { opacity: 1; transform: none; } }

.vp-perf { display: flex; justify-content: space-evenly; padding: 0 26px; position: relative; z-index: 2; }
.vp-perf span {
  width: 9px; height: 9px; border-radius: 50%;
  background: var(--paper);
  box-shadow: 0 0 0 1px var(--line), inset 0 -1px 1px rgba(0,0,0,0.08);
  transform: translateY(5px);
  animation: vp-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both;
}
@keyframes vp-pop { from { opacity: 0; transform: translateY(10px) scale(0.4); } to { opacity: 1; transform: translateY(5px) scale(1); } }

.vp-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-top: none;
  position: relative;
  padding: 42px 40px 32px;
  box-shadow: 0 1px 0 rgba(255,255,255,0.65) inset, 0 30px 60px -28px rgba(32,38,30,0.35), 0 2px 6px rgba(32,38,30,0.06);
  overflow: hidden;
}
.vp-card::before, .vp-card::after {
  content: ""; position: absolute; top: -1px; width: 22px; height: 22px;
  background: var(--paper); border-radius: 50%; z-index: 3;
}
.vp-card::before { left: -11px; box-shadow: inset -1px 0 0 var(--line); }
.vp-card::after { right: -11px; box-shadow: inset 1px 0 0 var(--line); }

/* travelling shine */
.vp-shine {
  position: absolute; inset: 0; pointer-events: none; z-index: 0;
  background: linear-gradient(105deg, transparent 42%, rgba(255,255,255,0.75) 50%, transparent 58%);
  transform: translateX(-110%);
  animation: vp-shine 6s ease-in-out 1.4s infinite;
}
@keyframes vp-shine {
  0% { transform: translateX(-110%); opacity: 0; }
  12% { opacity: 1; }
  38% { transform: translateX(110%); opacity: 0; }
  100% { transform: translateX(110%); opacity: 0; }
}

/* header mark — animated */
.vp-mark { text-align: center; margin-bottom: 24px; position: relative; z-index: 1; }
.vp-glyph-wrap { position: relative; width: 66px; height: 66px; margin: 0 auto 12px; }
.vp-glyph-halo {
  position: absolute; inset: -9px; border-radius: 50%;
  background: conic-gradient(from 0deg, rgba(20,92,84,0), rgba(20,92,84,0.45), rgba(169,130,47,0.5), rgba(20,92,84,0));
  animation: vp-spin 7s linear infinite;
  filter: blur(0.4px);
  opacity: 0.9;
}
.vp-glyph-halo::after {
  content: ""; position: absolute; inset: 7px; border-radius: 50%; background: var(--card);
}
@keyframes vp-spin { to { transform: rotate(360deg); } }
.vp-glyph {
  position: absolute; inset: 0;
  border: 1.5px solid var(--teal);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 24px; font-weight: 600; color: var(--teal);
  background: radial-gradient(circle at 30% 25%, #ffffff 0%, #f4efe0 55%, #e9e1ca 100%);
  box-shadow: 0 0 0 5px rgba(20,92,84,0.08), 0 6px 18px -8px rgba(20,92,84,0.5);
  animation: vp-glyph-breathe 3.4s ease-in-out infinite, vp-glyph-enter 0.8s cubic-bezier(0.34,1.56,0.64,1) both;
  overflow: hidden;
}
.vp-glyph::after {
  content: ""; position: absolute; inset: 0; border-radius: 50%;
  background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.9) 48%, transparent 62%);
  transform: translateX(-90%);
  animation: vp-glyph-sweep 4.2s ease-in-out 0.9s infinite;
}
@keyframes vp-glyph-enter { from { opacity: 0; transform: scale(0.5) translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes vp-glyph-breathe { 0%,100% { box-shadow: 0 0 0 5px rgba(20,92,84,0.08), 0 6px 18px -8px rgba(20,92,84,0.5); transform: translateY(0);} 50% { box-shadow: 0 0 0 9px rgba(20,92,84,0.05), 0 10px 24px -8px rgba(20,92,84,0.55); transform: translateY(-1.5px);} }
@keyframes vp-glyph-sweep { 0% { transform: translateX(-90%); opacity: 0;} 18% { opacity: 1;} 45%,100% { transform: translateX(90%); opacity: 0;} }
.vp-mark .vp-name { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 15px; letter-spacing: 0.04em; color: var(--teal-deep); }
.vp-mark .vp-sub { font-size: 12px; color: var(--ink-soft); margin-top: 3px; letter-spacing: 0.01em; }
.vp-live { display: inline-flex; align-items: center; gap: 7px; margin-top: 10px; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--teal-deep); background: rgba(20,92,84,0.08); border: 1px solid rgba(20,92,84,0.22); padding: 4px 10px; border-radius: 999px; }
.vp-live i { width: 7px; height: 7px; border-radius: 50%; background: #1a7f4b; box-shadow: 0 0 0 0 rgba(26,127,75,0.5); animation: vp-blink 1.8s ease-out infinite; }
@keyframes vp-blink { 0% { box-shadow: 0 0 0 0 rgba(26,127,75,0.45);} 70% { box-shadow: 0 0 0 7px rgba(26,127,75,0);} 100% { box-shadow: 0 0 0 0 rgba(26,127,75,0);} }

.vp-rule { border: none; border-top: 1px solid var(--line); margin: 24px 0; position: relative; z-index: 1; }
.vp-rule::after { content: "❦"; position: absolute; left: 50%; top: -9px; transform: translateX(-50%); background: var(--card); padding: 0 10px; font-size: 11px; color: var(--gold); }

/* stamp row */
.vp-stamp-row { display: flex; align-items: center; gap: 18px; margin-bottom: 24px; position: relative; z-index: 1; }
.vp-stamp { flex: none; width: 82px; height: 82px; position: relative; }
.vp-stamp svg { width: 100%; height: 100%; overflow: visible; }
.vp-stamp-hit { transform-origin: 50% 50%; animation: vp-stamp-in 0.65s cubic-bezier(0.16,1,0.3,1) 0.25s both; }
@keyframes vp-stamp-in {
  0% { opacity: 0; transform: scale(2.4) rotate(-22deg); filter: blur(2px); }
  55% { opacity: 1; transform: scale(0.9) rotate(-7deg); filter: blur(0); }
  75% { transform: scale(1.04) rotate(-3deg); }
  100% { opacity: 1; transform: scale(1) rotate(0deg); }
}
.vp-stamp-ring { position: absolute; inset: -6px; border-radius: 50%; border: 1.5px solid rgba(20,92,84,0.35); animation: vp-ring 2.6s ease-out 0.9s infinite; pointer-events: none; }
.vp-stamp-ring.d2 { animation-delay: 1.7s; }
@keyframes vp-ring { 0% { opacity: 0.7; transform: scale(0.82); } 100% { opacity: 0; transform: scale(1.28); } }
.vp-check-path { stroke-dasharray: 70; stroke-dashoffset: 70; animation: vp-draw 0.7s ease-out 0.75s forwards; }
@keyframes vp-draw { to { stroke-dashoffset: 0; } }
.vp-stamp-text .vp-h1 { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 23px; color: var(--ink); line-height: 1.12; animation: vp-fade-up 0.6s ease 0.45s both; }
.vp-stamp-text .vp-p1 { font-size: 13px; color: var(--ink-soft); margin-top: 5px; max-width: 27ch; line-height: 1.5; animation: vp-fade-up 0.6s ease 0.55s both; }
@keyframes vp-fade-up { from { opacity: 0; transform: translateY(8px);} to { opacity: 1; transform: none;} }

.vp-doctype { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--ink-soft); margin-bottom: 18px; position: relative; z-index: 1; animation: vp-fade-up 0.6s ease 0.65s both; }
.vp-doctype b { color: var(--ink); font-weight: 600; background: var(--paper-deep); padding: 3px 10px; border-radius: 4px; border: 1px solid var(--line); letter-spacing: 0.02em; }

.vp-rows { position: relative; z-index: 1; }
.vp-row { display: flex; align-items: baseline; gap: 10px; padding: 8.5px 0; animation: vp-fade-up 0.5s ease both; }
.vp-row .vp-label { font-size: 13px; color: var(--ink-soft); white-space: nowrap; }
.vp-row .vp-fill { flex: 1; border-bottom: 1px dotted #c6bda3; transform: translateY(-3px); min-width: 18px; }
.vp-row .vp-value { font-size: 13.5px; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; white-space: nowrap; max-width: 62%; overflow: hidden; text-overflow: ellipsis; }
.vp-row.vp-total { margin-top: 8px; padding-top: 16px; border-top: 1px solid var(--line); align-items: center; }
.vp-row.vp-total .vp-label { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 15.5px; color: var(--ink); }
.vp-row.vp-total .vp-value { font-family: 'Fraunces', Georgia, serif; font-size: 21px; font-weight: 600; color: var(--teal-deep); }

.vp-status { margin-top: 18px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 14px; border-radius: 3px; border: 1px solid; animation: vp-fade-up 0.55s ease 0.9s both; }
.vp-status .vp-lab { font-size: 12px; }
.vp-status .vp-val { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 14px; letter-spacing: 0.05em; }
.vp-status[data-tone="unpaid"] { background: repeating-linear-gradient(-45deg, rgba(178,58,46,0.07), rgba(178,58,46,0.07) 6px, transparent 6px, transparent 12px); border-color: rgba(178,58,46,0.4); }
.vp-status[data-tone="unpaid"] .vp-lab { color: var(--ink-soft); }
.vp-status[data-tone="unpaid"] .vp-val { color: var(--stamp); }
.vp-status[data-tone="paid"] { background: repeating-linear-gradient(-45deg, rgba(20,92,84,0.08), rgba(20,92,84,0.08) 6px, transparent 6px, transparent 12px); border-color: rgba(20,92,84,0.4); }
.vp-status[data-tone="paid"] .vp-val { color: var(--teal-deep); }
.vp-status[data-tone="partial"] { background: repeating-linear-gradient(-45deg, rgba(169,130,47,0.12), rgba(169,130,47,0.12) 6px, transparent 6px, transparent 12px); border-color: rgba(169,130,47,0.5); }
.vp-status[data-tone="partial"] .vp-val { color: #7a5c17; }
.vp-status[data-tone="neutral"] { background: rgba(32,38,30,0.04); border-color: var(--line); }
.vp-status[data-tone="neutral"] .vp-val { color: var(--ink); }
.vp-status[data-tone="void"] { background: repeating-linear-gradient(-45deg, rgba(32,38,30,0.08), rgba(32,38,30,0.08) 6px, transparent 6px, transparent 12px); border-color: rgba(32,38,30,0.35); }
.vp-status[data-tone="void"] .vp-val { color: #4a4f49; }

.vp-actions { display: flex; gap: 10px; margin-top: 26px; position: relative; z-index: 1; animation: vp-fade-up 0.55s ease 1s both; }
.vp-btn { flex: 1; text-align: center; padding: 12px 14px; font-size: 13.5px; font-weight: 600; border-radius: 4px; cursor: pointer; border: 1px solid transparent; font-family: 'Inter', sans-serif; text-decoration: none; transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, border-color 0.15s ease; }
.vp-btn:active { transform: translateY(1px); }
.vp-btn.vp-primary { background: var(--teal); color: #F7F4EA; box-shadow: 0 8px 18px -10px rgba(20,92,84,0.7); }
.vp-btn.vp-primary:hover { background: var(--teal-deep); transform: translateY(-1px); box-shadow: 0 12px 22px -10px rgba(20,92,84,0.7); }
.vp-btn.vp-ghost { background: transparent; border-color: var(--line); color: var(--ink); }
.vp-btn.vp-ghost:hover { border-color: var(--ink-soft); transform: translateY(-1px); }

.vp-foot { margin-top: 28px; display: flex; align-items: flex-start; gap: 14px; position: relative; z-index: 1; animation: vp-fade-up 0.55s ease 1.05s both; }
.vp-qr { flex: none; width: 54px; height: 54px; border: 1px solid var(--line); border-radius: 6px; background: #fff; padding: 5px; }
.vp-foot-text { font-size: 11.5px; line-height: 1.55; color: var(--ink-soft); }
.vp-foot-text a { color: var(--teal-deep); text-decoration: none; border-bottom: 1px solid var(--line); font-weight: 600; }
.vp-foot-text a:hover { border-color: var(--teal-deep); }
.vp-meta { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
.vp-chip { font-size: 10.5px; font-weight: 600; letter-spacing: 0.02em; background: var(--paper-deep); border: 1px solid var(--line); color: var(--ink-soft); border-radius: 999px; padding: 2px 9px; font-variant-numeric: tabular-nums; }

.vp-under { text-align: center; margin-top: 18px; font-size: 11.5px; color: #8a8b82; letter-spacing: 0.01em; }
.vp-under b { color: var(--teal-deep); font-weight: 600; }

/* skeleton + invalid */
.vp-skel { border-radius: 4px; background: linear-gradient(90deg, #e9e2cf 25%, #f7f2e4 50%, #e9e2cf 75%); background-size: 200% 100%; animation: vp-shimmer 1.4s ease-in-out infinite; }
@keyframes vp-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
.vp-invalid-icon { animation: vp-stamp-in 0.65s cubic-bezier(0.16,1,0.3,1) 0.2s both; }
.vp-shake { animation: vp-rise 0.7s cubic-bezier(0.16,1,0.3,1) both; }

@media (max-width: 520px) {
  .vp-scope { padding: 32px 12px 48px; }
  .vp-card { padding: 32px 22px 26px; }
  .vp-stamp { width: 70px; height: 70px; }
  .vp-stamp-text .vp-h1 { font-size: 20px; }
  .vp-actions { flex-direction: column; }
}
@media print {
  .vp-scope { background: #fff; padding: 0; display: block; }
  .vp-scope::before, .vp-orb, .vp-shine, .vp-actions, .vp-perf { display: none !important; }
  .vp-stub { max-width: none; animation: none; }
  .vp-card { border: 1px solid #ddd; box-shadow: none; }
  .vp-card::before, .vp-card::after { display: none; }
  .vp-glyph-halo, .vp-stamp-ring { display: none; }
  *, *::before, *::after { animation: none !important; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
  .vp-shine, .vp-glyph-halo, .vp-stamp-ring { display: none; }
}
`;

function StampSeal({ tone = 'teal', symbol = 'check' }: { tone?: 'teal' | 'red' | 'grey' | 'amber'; symbol?: 'check' | 'warn' | 'void' }) {
  const main = tone === 'teal' ? '#145C54' : tone === 'red' ? '#B23A2E' : tone === 'amber' ? '#A9822F' : '#5B6156';
  const fill = tone === 'teal' ? '#145C54' : tone === 'red' ? '#B23A2E' : tone === 'amber' ? '#A9822F' : '#5B6156';
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label={symbol === 'check' ? 'Verified seal' : symbol === 'warn' ? 'Warning seal' : 'Void seal'}>
      <circle cx="50" cy="50" r="47" fill="none" stroke={main} strokeWidth="1" opacity="0.9" />
      <circle cx="50" cy="50" r="40.5" fill="none" stroke={main} strokeWidth="1" opacity="0.9" />
      <g stroke={main} strokeWidth="1" opacity="0.85">
        <line x1="50" y1="3" x2="50" y2="9" />
        <line x1="50" y1="91" x2="50" y2="97" />
        <line x1="3" y1="50" x2="9" y2="50" />
        <line x1="91" y1="50" x2="97" y2="50" />
        <line x1="16.6" y1="16.6" x2="20.8" y2="20.8" />
        <line x1="79.2" y1="16.6" x2="83.4" y2="20.8" />
        <line x1="16.6" y1="83.4" x2="20.8" y2="79.2" />
        <line x1="79.2" y1="83.4" x2="83.4" y2="79.2" />
      </g>
      <circle cx="50" cy="50" r="32" fill={fill} />
      {symbol === 'check' && (
        <path
          className="vp-check-path"
          d="M35 51 L45.5 61.5 L67 38"
          fill="none"
          stroke="#FCFAF3"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {symbol === 'warn' && (
        <g stroke="#FCFAF3" strokeWidth="4.5" strokeLinecap="round">
          <line x1="50" y1="36" x2="50" y2="56" />
          <circle cx="50" cy="65" r="2.6" fill="#FCFAF3" stroke="none" />
        </g>
      )}
      {symbol === 'void' && (
        <g stroke="#FCFAF3" strokeWidth="4.5" strokeLinecap="round">
          <line x1="38" y1="38" x2="62" y2="62" />
          <line x1="62" y1="38" x2="38" y2="62" />
        </g>
      )}
    </svg>
  );
}

function QrMark() {
  const cells = useMemo(() => {
    // Deterministic decorative QR-like pattern (not scannable — visual trust cue only)
    const seed = [1,0,1,1,0,1,0,0,1,0,1,1,1,0,0,1,0,1,1,0,1,0,0,1,1];
    return Array.from({ length: 81 }, (_, i) => {
      const x = i % 9; const y = Math.floor(i / 9);
      const inFinder = (x < 3 && y < 3) || (x > 5 && y < 3) || (x < 3 && y > 5);
      if (inFinder) {
        const lx = x < 3 ? x : x - 6; const ly = y < 3 ? y : y - 6;
        return lx === 0 || lx === 2 || ly === 0 || ly === 2 || (lx === 1 && ly === 1) ? 1 : 0;
      }
      return seed[(i * 7 + 3) % seed.length];
    });
  }, []);
  return (
    <svg viewBox="0 0 9 9" className="vp-qr" aria-hidden="true" style={{ width: '100%', height: '100%' }}>
      {cells.map((v, i) => (
        <rect key={i} x={i % 9} y={Math.floor(i / 9)} width="0.92" height="0.92" rx="0.12" fill={v ? '#20261E' : 'transparent'} />
      ))}
    </svg>
  );
}

export const DocumentVerify: React.FC = () => {
  const { path } = useHashRoute();
  const { type, number, token } = parseVerificationPath(path);
  const [state, setState] = useState<PageState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: 'loading' });
      if (!type || !number || !token) {
        setState({ kind: 'invalid' });
        return;
      }
      try {
        const apiBase = env.apiUrl.replace(/\/+$/, '');
        const res = await fetch(
          `${apiBase}/api/public/documents/verify/${encodeURIComponent(type)}/${encodeURIComponent(number)}?t=${encodeURIComponent(token)}`
        );
        if (!res.ok) {
          if (!cancelled) setState({ kind: 'invalid' });
          return;
        }
        const data = (await res.json()) as VerificationData;
        if (!cancelled) {
          setState(
            TERMINAL_STATUSES.includes(String(data.status || '').toUpperCase())
              ? { kind: 'terminal', data }
              : { kind: 'verified', data }
          );
        }
      } catch {
        if (!cancelled) setState({ kind: 'invalid' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [type, number, token]);

  const typeTitle = TYPE_TITLES[type || ''] || 'document';
  const typeLabel = typeTitle.replace(/^./, (c) => c.toUpperCase());
  const checkedOn = useMemo(
    () =>
      new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    []
  );
  const tokenFrag = token ? `${token.slice(0, 6)}…${token.slice(-4)}` : '—';

  const shell = (body: React.ReactNode) => (
    <div className="vp-scope">
      <style>{VERIFY_CSS}</style>
      <div className="vp-orb a" aria-hidden="true" />
      <div className="vp-orb b" aria-hidden="true" />
      <div className="vp-stub">
        <div className="vp-perf" aria-hidden="true">
          {Array.from({ length: 10 }).map((_, i) => (
            <span key={i} style={{ animationDelay: `${i * 45}ms` }} />
          ))}
        </div>
        <div className="vp-card">
          <div className="vp-shine" aria-hidden="true" />
          {body}
        </div>
        <div className="vp-under">
          Secured by <b>Prime Printing</b> · primeportalmw.vercel.app
        </div>
      </div>
    </div>
  );

  const mark = (liveLabel: string) => (
    <div className="vp-mark">
      <div className="vp-glyph-wrap" aria-hidden="true">
        <div className="vp-glyph-halo" />
        <div className="vp-glyph">P</div>
      </div>
      <div className="vp-name">PRIME PRINTING</div>
      <div className="vp-sub">Document verification</div>
      <div><span className="vp-live"><i />{liveLabel}</span></div>
    </div>
  );

  const foot = (docNo: string) => (
    <div className="vp-foot">
      <div className="vp-qr" aria-hidden="true"><QrMark /></div>
      <div className="vp-foot-text">
        Verified against Prime Printing records. Fraud check — match the document number, date and totals with your copy.
        {' '}<a href="#/login">Customer portal sign-in</a>
        <div className="vp-meta">
          <span className="vp-chip">Checked {checkedOn}</span>
          {docNo ? <span className="vp-chip">{docNo}</span> : null}
          <span className="vp-chip">Ref {tokenFrag}</span>
        </div>
      </div>
    </div>
  );

  if (state.kind === 'loading') {
    return shell(
      <>
        {mark('Checking records')}
        <hr className="vp-rule" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 22 }}>
          <div className="vp-stamp" aria-hidden="true">
            <div className="vp-skel" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="vp-skel" style={{ height: 22, width: '62%', marginBottom: 10 }} />
            <div className="vp-skel" style={{ height: 13, width: '88%' }} />
          </div>
        </div>
        <div aria-live="polite" aria-busy="true">
          {[92, 78, 84, 70, 88].map((w, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 0', alignItems: 'center' }}>
              <div className="vp-skel" style={{ height: 12, width: `${w * 0.4}px`, flex: 'none' }} />
              <div style={{ flex: 1, borderBottom: '1px dotted #D8D0BD' }} />
              <div className="vp-skel" style={{ height: 12, width: `${w}px` }} />
            </div>
          ))}
        </div>
        <p style={{ fontSize: 13, color: '#5B6156', textAlign: 'center', marginTop: 18 }}>Verifying document… checking Prime Printing records.</p>
      </>
    );
  }

  if (state.kind === 'invalid') {
    return shell(
      <div className="vp-shake">
        {mark('Verification failed')}
        <hr className="vp-rule" />
        <div className="vp-stamp-row">
          <div className="vp-stamp vp-invalid-icon">
            <StampSeal tone="red" symbol="warn" />
          </div>
          <div className="vp-stamp-text">
            <div className="vp-h1">Could not be verified</div>
            <div className="vp-p1">The document number or verification code did not match Prime Printing records.</div>
          </div>
        </div>
        <div className="vp-status" data-tone="unpaid">
          <span className="vp-lab">Verification result</span>
          <span className="vp-val">NOT FOUND</span>
        </div>
        <p style={{ fontSize: 13, color: '#5B6156', lineHeight: 1.6, marginTop: 18 }}>
          Please check the QR code or link with the business that issued the document. Expired links, re-typed
          numbers and screenshots of old copies are the most common causes.
        </p>
        <div className="vp-actions">
          <a className="vp-btn vp-primary" href="#/login">Open customer portal</a>
          <button className="vp-btn vp-ghost" type="button" onClick={() => window.location.reload()}>Try again</button>
        </div>
        {foot(number || '')}
      </div>
    );
  }

  if (state.kind === 'terminal') {
    const d = state.data;
    const upperStatus = String(d.status || '').toUpperCase();
    const cancelled = upperStatus === 'CANCELLED';
    const superseded = upperStatus === 'SUPERSEDED';
    const title = cancelled ? 'Cancelled document' : superseded ? 'Superseded document' : 'Void document';
    const sub = superseded
      ? `This ${typeTitle} was issued by Prime Printing but has subsequently been superseded by a newer statement. Only the latest statement is current.`
      : `This ${typeTitle} was issued by Prime Printing but has subsequently been ${cancelled ? 'cancelled' : 'voided'}.`;
    const preview = fieldRows(d).filter(([k]) => k !== 'Status').slice(0, 3);
    return shell(
      <>
        {mark('Record found')}
        <hr className="vp-rule" />
        <div className="vp-stamp-row">
          <div className="vp-stamp">
            <div className="vp-stamp-hit"><StampSeal tone="grey" symbol="void" /></div>
          </div>
          <div className="vp-stamp-text">
            <div className="vp-h1">{title}</div>
            <div className="vp-p1">{sub}</div>
          </div>
        </div>
        <div className="vp-doctype">Document type <b>{typeLabel}</b></div>
        <div className="vp-rows">
          {preview.map(([k, v], i) => (
            <div key={k} className="vp-row" style={{ animationDelay: `${0.7 + i * 0.07}s` }}>
              <span className="vp-label">{k}</span><span className="vp-fill" /><span className="vp-value">{v}</span>
            </div>
          ))}
        </div>
        <div className="vp-status" data-tone="void">
          <span className="vp-lab">Document status</span>
          <span className="vp-val">{upperStatus || 'VOID'}</span>
        </div>
        <div className="vp-actions">
          <a className="vp-btn vp-primary" href="#/login">Open customer portal</a>
          <button className="vp-btn vp-ghost" type="button" onClick={() => window.print()}>Print record</button>
        </div>
        {foot(String(preview[0]?.[1] ?? number))}
      </>
    );
  }

  const d = state.data;
  const { body, total, status } = splitRowsForDisplay(fieldRows(d));
  const tone = statusTone(status || '');
  return shell(
    <>
      {mark('Secure verification')}
      <hr className="vp-rule" />
      <div className="vp-stamp-row">
        <div className="vp-stamp" title="Verified seal">
          <span className="vp-stamp-ring" aria-hidden="true" />
          <span className="vp-stamp-ring d2" aria-hidden="true" />
          <div className="vp-stamp-hit"><StampSeal tone="teal" symbol="check" /></div>
        </div>
        <div className="vp-stamp-text">
          <div className="vp-h1">Verified document</div>
          <div className="vp-p1">Checked against Prime Printing&apos;s records on {checkedOn}</div>
        </div>
      </div>

      <div className="vp-doctype">Document type <b>{typeLabel}</b></div>

      <div className="vp-rows" aria-live="polite">
        {body.map(([k, v], i) => (
          <div key={k} className="vp-row" style={{ animationDelay: `${0.7 + i * 0.06}s` }}>
            <span className="vp-label">{k}</span><span className="vp-fill" /><span className="vp-value" title={v}>{v}</span>
          </div>
        ))}
        {total && (
          <div className="vp-row vp-total" style={{ animationDelay: `${0.7 + body.length * 0.06}s` }}>
            <span className="vp-label">{total[0]}</span><span className="vp-fill" /><span className="vp-value" title={total[1]}>{total[1]}</span>
          </div>
        )}
      </div>

      <div className="vp-status" data-tone={tone}>
        <span className="vp-lab">Payment status</span>
        <span className="vp-val">{(status || '—').toUpperCase()}</span>
      </div>

      <div className="vp-actions">
        <button className="vp-btn vp-primary" type="button" onClick={() => window.print()}>Print verification</button>
        <a className="vp-btn vp-ghost" href="#/login">Customer sign-in</a>
      </div>

      {foot(String(body[0]?.[1] ?? number))}
    </>
  );
};

export default DocumentVerify;
