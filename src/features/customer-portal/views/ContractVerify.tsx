import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { env } from '../config/env';

// Mirror of the ERP frontend's API base URL: `${env.apiUrl}/api`.
// In development (Vite) this is the relative /api proxy; in production it is the deployed ERP backend origin + /api.
const isDev = Boolean(import.meta.env?.DEV);
export const API_BASE_URL = isDev
  ? '/api'
  : env.apiUrl
    ? `${env.apiUrl.replace(/\/+$/, '')}/api`
    : '/api';

export const REDESIGN_CSS = `
.ppv-page{
  --paper:#F2EEE3; --paper-deep:#EAE4D2; --ink:#20261E; --ink-soft:#5B6156;
  --teal:#145C54; --teal-deep:#0E413B; --stamp:#B23A2E; --gold:#A9822F;
  --line:#D8D0BD; --line-soft:#E4DECB;
  margin:0; min-height:100vh; position:relative;
  background:radial-gradient(ellipse at 20% -10%, rgba(20,92,84,0.06), transparent 55%), var(--paper);
  display:flex; align-items:center; justify-content:center;
  padding:48px 20px; font-family:'Inter',system-ui,-apple-system,sans-serif; color:var(--ink);
}
.ppv-page::before{
  content:""; position:fixed; inset:0; pointer-events:none; opacity:.5;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 0.13  0 0 0 0 0.15  0 0 0 0 0.12  0 0 0 0.02 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
.ppv-stub{ position:relative; width:100%; max-width:460px; }
.ppv-perf{ display:flex; justify-content:space-evenly; position:relative; z-index:2; }
.ppv-perf span{ width:9px; height:9px; border-radius:50%; background:var(--paper); box-shadow:0 0 0 1px var(--line); transform:translateY(5px); }
.ppv-card{
  background:#FCFAF3; border:1px solid var(--line); border-top:none; position:relative;
  padding:44px 40px 36px;
  box-shadow:0 1px 0 rgba(255,255,255,.6) inset, 0 24px 48px -24px rgba(32,38,30,.28);
}
.ppv-card::before,.ppv-card::after{ content:""; position:absolute; top:-1px; width:22px; height:22px; background:var(--paper); border-radius:50%; }
.ppv-card::before{ left:-11px; } .ppv-card::after{ right:-11px; }
.ppv-mark{ text-align:center; margin-bottom:28px; }
.ppv-mark .glyph{
  width:34px; height:34px; margin:0 auto 10px; border:1.5px solid var(--teal); border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  font-family:'Fraunces',Georgia,serif; font-size:16px; font-weight:600; color:var(--teal);
}
.ppv-mark .name{ font-family:'Fraunces',Georgia,serif; font-weight:600; font-size:15px; letter-spacing:.03em; color:var(--teal-deep); }
.ppv-mark .sub{ font-size:12px; color:var(--ink-soft); margin-top:2px; }
.ppv-rule{ border:none; border-top:1px solid var(--line); margin:26px 0; }
.ppv-stamp-row{ display:flex; align-items:center; gap:18px; margin-bottom:26px; }
.ppv-stamp{ flex:none; width:76px; height:76px; position:relative; }
.ppv-stamp svg{ width:100%; height:100%; display:block; }
.ppv-stamp-text{ display:flex; flex-direction:column; }
.ppv-stamp-text .h1{ font-family:'Fraunces',Georgia,serif; font-weight:600; font-size:22px; color:var(--ink); line-height:1.15; }
.ppv-stamp-text .p1{ font-size:13px; color:var(--ink-soft); margin-top:4px; max-width:26ch; }
.ppv-doctype{ display:inline-flex; align-items:center; gap:8px; font-size:12px; color:var(--ink-soft); margin-bottom:22px; }
.ppv-doctype b{ color:var(--ink); font-weight:600; background:var(--paper-deep); padding:2px 8px; border-radius:3px; }
.ppv-row{ display:flex; align-items:baseline; gap:8px; padding:8px 0; }
.ppv-row .label{ font-size:13px; color:var(--ink-soft); white-space:nowrap; }
.ppv-row .fill{ flex:1; border-bottom:1px dotted var(--line); transform:translateY(-3px); }
.ppv-row .value{
  font-size:13.5px; font-weight:600; color:var(--ink); font-variant-numeric:tabular-nums;
  white-space:nowrap; max-width:58%; overflow:hidden; text-overflow:ellipsis;
}
.ppv-row.total{ margin-top:6px; padding-top:16px; border-top:1px solid var(--line); }
.ppv-row.total .label{ font-family:'Fraunces',Georgia,serif; font-weight:600; font-size:15px; color:var(--ink); }
.ppv-row.total .value{ font-family:'Fraunces',Georgia,serif; font-size:20px; font-weight:600; color:var(--teal-deep); }
.ppv-band{ margin-top:18px; display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-radius:2px; border:1px solid; }
.ppv-band .lab{ font-size:12px; color:var(--ink-soft); }
.ppv-band .val{ font-family:'Fraunces',Georgia,serif; font-weight:600; font-size:14px; letter-spacing:.04em; }
.ppv-band.red{ background:repeating-linear-gradient(-45deg, rgba(178,58,46,.06), rgba(178,58,46,.06) 6px, transparent 6px, transparent 12px); border-color:rgba(178,58,46,.35); }
.ppv-band.red .val{ color:var(--stamp); }
.ppv-band.teal{ background:repeating-linear-gradient(-45deg, rgba(20,92,84,.07), rgba(20,92,84,.07) 6px, transparent 6px, transparent 12px); border-color:rgba(20,92,84,.4); }
.ppv-band.teal .val{ color:var(--teal-deep); }
.ppv-band.amber{ background:repeating-linear-gradient(-45deg, rgba(169,130,47,.09), rgba(169,130,47,.09) 6px, transparent 6px, transparent 12px); border-color:rgba(169,130,47,.45); }
.ppv-band.amber .val{ color:var(--gold); }
.ppv-foot{ margin-top:30px; display:flex; align-items:center; gap:14px; }
.ppv-foot .qr{ flex:none; width:52px; height:52px; border:1px solid var(--line); border-radius:4px; display:flex; align-items:center; justify-content:center; font-family:'Fraunces',Georgia,serif; font-weight:600; color:var(--teal-deep); font-size:18px; background:var(--paper); }
.ppv-foot-text{ font-size:11.5px; line-height:1.5; color:var(--ink-soft); }
.ppv-foot-text a{ color:var(--teal-deep); text-decoration:none; border-bottom:1px solid var(--line); }
.ppv-skel{ height:12px; border-radius:3px; background:linear-gradient(90deg, var(--paper-deep) 25%, var(--line-soft) 50%, var(--paper-deep) 75%); background-size:200% 100%; animation:ppv-shimmer 1.2s infinite; }
@keyframes ppv-shimmer{ from{ background-position:200% 0; } to{ background-position:-200% 0; } }
.ppv-pulse{ animation:ppv-pulse 1.6s ease-in-out infinite; transform-origin:center; }
@keyframes ppv-pulse{ 0%,100%{ opacity:1; } 50%{ opacity:.55; } }
@media (max-width:480px){ .ppv-card{ padding:32px 22px 28px; } .ppv-stamp{ width:64px; height:64px; } .ppv-stamp-text .h1{ font-size:19px; } }
@media print{ .ppv-page{ background:#fff; padding:0; display:block; } .ppv-page::before{ display:none; } .ppv-card{ box-shadow:none; } }
`;

export function Seal({ tone, glyph }: { tone: 'teal' | 'red' | 'amber'; glyph: 'check' | 'ban' | 'warn' | 'dots' }) {
  const main = tone === 'teal' ? '#145C54' : tone === 'amber' ? '#A9822F' : '#B23A2E';
  const inner = glyph === 'check'
    ? <path d="M35 51 L45.5 61.5 L67 38" fill="none" stroke="#FCFAF3" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    : glyph === 'ban'
      ? <g stroke="#FCFAF3" strokeWidth="4.5" strokeLinecap="round"><line x1="36" y1="36" x2="64" y2="64" /><circle cx="50" cy="50" r="15" fill="none" stroke="#FCFAF3" strokeWidth="4.5" /></g>
      : glyph === 'warn'
        ? <text x="50" y="65" textAnchor="middle" fontFamily="Fraunces, Georgia, serif" fontWeight="700" fontSize="34" fill="#FCFAF3">!</text>
        : <g fill="#FCFAF3"><circle cx="40" cy="50" r="3.4" /><circle cx="50" cy="50" r="3.4" /><circle cx="60" cy="50" r="3.4" /></g>;
  return (
    <svg viewBox="0 0 100 100" role="img" aria-hidden="true">
      <circle cx="50" cy="50" r="47" fill="none" stroke={main} strokeWidth="1" />
      <circle cx="50" cy="50" r="40.5" fill="none" stroke={main} strokeWidth="1" />
      <g stroke={main} strokeWidth="1">
        <line x1="50" y1="3" x2="50" y2="9" />
        <line x1="50" y1="91" x2="50" y2="97" />
        <line x1="3" y1="50" x2="9" y2="50" />
        <line x1="91" y1="50" x2="97" y2="50" />
        <line x1="16.6" y1="16.6" x2="20.8" y2="20.8" />
        <line x1="79.2" y1="16.6" x2="83.4" y2="20.8" />
        <line x1="16.6" y1="83.4" x2="20.8" y2="79.2" />
        <line x1="79.2" y1="83.4" x2="83.4" y2="79.2" />
      </g>
      <circle cx="50" cy="50" r="32" fill={main} />
      {inner}
    </svg>
  );
}

/**
 * Public printing-contract verification page.
 *
 *   /verify?c=<contract-number-url-safe>&h=<full-sha256>
 *
 * The QR on the printed contract encodes the full digest. The server looks the
 * contract up, recomputes the canonical digest from the STORED record and
 * compares it constant-time — the browser never decides authenticity.
 *
 * The short code (`4612-f2e1-2ecc`) is a MANUAL lookup aid printed under the
 * hash: it identifies a contract but is NOT proof on its own. A short-code
 * lookup therefore still resolves server-side and validates the full stored
 * digest.
 *
 * Deliberately router-free: the page is mounted directly by `index.tsx` for
 * real `/verify` URLs (before `HashRouter` boots) and as a normal `/verify`
 * route for the `/#/verify?...` fallback.
 */

type ContractDetails = {
  contractNumber: string;
  customerName: string;
  contractDate: string;
  status: string;
  total: number;
  currency: string;
  companyName?: string;
};

type PageState =
  | { kind: 'idle' }
  | { kind: 'loading'; lookup: string }
  | { kind: 'verified'; data: ContractDetails }
  | { kind: 'altered'; lookup: string }
  | { kind: 'not_found'; lookup: string }
  | { kind: 'error'; lookup: string; hash: string };

const SHORT_CODE_RE = /^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/i;

const CONTRACT_VERIFY_CSS = `
.ppv-lede{ font-size:13px; line-height:1.55; color:var(--ink-soft); margin:-6px 0 22px; }
.ppv-form{ display:grid; gap:8px; margin-top:4px; }
.ppv-form label{ font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--ink-soft); font-weight:600; }
.ppv-input{
  width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid var(--line);
  border-radius:3px; background:#FCFAF3; color:var(--ink); font-size:14px;
  font-family:'Inter',system-ui,-apple-system,sans-serif; outline:none;
}
.ppv-input:focus{ border-color:var(--teal); box-shadow:0 0 0 2px rgba(20,92,84,.12); }
.ppv-btn{
  justify-self:start; margin-top:4px; padding:9px 18px; border:1px solid var(--teal-deep);
  border-radius:3px; background:var(--teal-deep); color:#FCFAF3; font-size:13px;
  font-weight:600; letter-spacing:.02em; cursor:pointer;
}
.ppv-btn:hover{ background:var(--teal); }
.ppv-btn:disabled{ opacity:.55; cursor:not-allowed; }
.ppv-note{ margin-top:18px; padding-top:14px; border-top:1px solid var(--line-soft); font-size:11.5px; line-height:1.55; color:var(--ink-soft); }
.ppv-note b{ color:var(--ink); font-weight:600; }
.ppv-mono{ font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:12.5px; }
.ppv-err{ margin-top:14px; padding:10px 12px; border:1px solid rgba(178,58,46,.35); background:rgba(178,58,46,.05); color:var(--stamp); font-size:12.5px; line-height:1.5; }
`;

const str = (value: unknown, fallback = '—'): string => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const fmtTotal = (currency: string, value: unknown): string =>
  `${String(currency || 'MWK')} ${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtDate = (raw: unknown): string => {
  const text = String(raw ?? '').trim();
  if (!text) return '—';
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (dmy) return `${dmy[1].padStart(2, '0')}/${dmy[2].padStart(2, '0')}/${dmy[3]}`;
  return text;
};

const statusTone = (status: unknown): 'teal' | 'amber' | 'red' => {
  const value = String(status || '').toUpperCase();
  if (['ACTIVE', 'COMPLETED', 'SIGNED', 'APPROVED'].includes(value)) return 'teal';
  if (['CANCELLED', 'CANCELED', 'VOID', 'VOIDED'].includes(value)) return 'red';
  return 'amber';
};

/** Reads `c`/`h` from the real query string AND the hash-router query. */
export function readContractVerifyParams(search?: string, hash?: string): { c: string; h: string } {
  const actualSearch = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  const actualHash = hash ?? (typeof window !== 'undefined' ? window.location.hash : '');
  const queryIndex = actualHash.indexOf('?');
  const hashQuery = queryIndex >= 0 ? actualHash.slice(queryIndex + 1) : '';

  const fromSearch = new URLSearchParams(String(actualSearch || '').replace(/^\?/, ''));
  const fromHash = new URLSearchParams(hashQuery);

  const pick = (...keys: string[]): string => {
    for (const key of keys) {
      const value = fromSearch.get(key) ?? fromHash.get(key);
      if (value && value.trim()) return value.trim();
    }
    return '';
  };

  return {
    c: pick('c', 'contract', 'number', 'sc', 'shortCode'),
    h: pick('h', 'hash'),
  };
}

async function requestContract(
  lookup: string,
  hash: string,
  signal?: AbortSignal,
): Promise<{ result: 'verified' | 'altered' | 'not_found'; data?: ContractDetails }> {
  const params = new URLSearchParams();
  params.set('c', lookup);
  if (hash) params.set('h', hash);

  const res = await fetch(
    `${API_BASE_URL}/public/documents/contract-verify?${params.toString()}`,
    { signal, headers: { Accept: 'application/json' } },
  );

  if (!res.ok) {
    if (res.status === 503) throw new Error('unavailable');
    throw new Error(`http_${res.status}`);
  }

  const body = await res.json().catch(() => null) as Record<string, any> | null;
  const result = String(body?.result || (body?.verified === true ? 'verified' : 'not_found'));
  if (result === 'verified' && body?.verified === true) {
    return {
      result: 'verified',
      data: {
        contractNumber: str(body.contractNumber),
        customerName: str(body.customerName),
        contractDate: fmtDate(body.contractDate),
        status: str(body.status),
        total: Number(body.total || 0),
        currency: String(body.currency || 'MWK'),
        companyName: body.companyName ? String(body.companyName) : undefined,
      },
    };
  }
  if (result === 'altered') return { result: 'altered' };
  return { result: 'not_found' };
}

export const ContractVerify: React.FC = () => {
  const initial = useMemo(() => readContractVerifyParams(), []);
  const [state, setState] = useState<PageState>({ kind: 'idle' });
  const [lookup, setLookup] = useState(() => (SHORT_CODE_RE.test(initial.c) ? initial.c : ''));
  const [formError, setFormError] = useState('');
  const requestSeq = useRef(0);

  const runLookup = useCallback(async (value: string, hash: string) => {
    const requestId = ++requestSeq.current;
    setState({ kind: 'loading', lookup: value });
    try {
      const response = await requestContract(value, hash);
      if (requestId !== requestSeq.current) return;
      if (response.result === 'verified' && response.data) {
        setState({ kind: 'verified', data: response.data });
      } else if (response.result === 'altered') {
        setState({ kind: 'altered', lookup: value });
      } else {
        setState({ kind: 'not_found', lookup: value });
      }
    } catch {
      if (requestId === requestSeq.current) setState({ kind: 'error', lookup: value, hash });
    }
  }, []);

  useEffect(() => {
    if (initial.c) void runLookup(initial.c, initial.h);
    return () => {
      // Invalidate any response still in flight when the page unmounts.
      requestSeq.current += 1;
    };
  }, [initial.c, initial.h, runLookup]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = String(lookup || '').trim();
    if (!SHORT_CODE_RE.test(value)) {
      setFormError('Enter the short code exactly as printed: three groups of four characters (for example 4612-f2e1-2ecc).');
      return;
    }
    setFormError('');
    void runLookup(value, '');
  };

  const shell = (body: React.ReactNode) => (
    <div className="ppv-page">
      <style>{REDESIGN_CSS}</style>
      <style>{CONTRACT_VERIFY_CSS}</style>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <div className="ppv-stub">
        <div className="ppv-perf" aria-hidden="true">
          <span /><span /><span /><span /><span /><span /><span /><span /><span /><span />
        </div>
        <div className="ppv-card">{body}</div>
      </div>
    </div>
  );

  const mark = (
    <div className="ppv-mark">
      <div className="glyph">P</div>
      <div className="name">PRIME PRINTING</div>
      <div className="sub">Printing contract verification</div>
    </div>
  );

  const form = (submitLabel = 'Verify contract') => (
    <form className="ppv-form" onSubmit={submit}>
      <label htmlFor="contract-lookup">Short code</label>
      <input
        id="contract-lookup"
        className="ppv-input ppv-mono"
        value={lookup}
        onChange={(event) => {
          setLookup(event.target.value);
          if (formError) setFormError('');
        }}
        placeholder="4612-f2e1-2ecc"
        autoComplete="off"
        spellCheck={false}
        maxLength={14}
        aria-describedby="contract-lookup-note"
        aria-invalid={Boolean(formError)}
      />
      {formError ? <div className="ppv-err" role="alert">{formError}</div> : null}
      <button className="ppv-btn" type="submit" disabled={state.kind === 'loading'}>
        {submitLabel}
      </button>
      <div className="ppv-note" id="contract-lookup-note">
        The <b>short code</b> is printed under the content hash. It identifies the contract for a manual
        lookup, but it is <b>not proof on its own</b> — the server still validates the full stored digest
        before reporting a match.
      </div>
    </form>
  );

  if (state.kind === 'loading') {
    return shell(
      <>
        {mark}
        <hr className="ppv-rule" />
        <div className="ppv-stamp-row">
          <div className="ppv-stamp ppv-pulse"><Seal tone="teal" glyph="dots" /></div>
          <div className="ppv-stamp-text">
            <div className="h1">Verifying contract</div>
            <div className="p1">Recomputing the content hash from Prime Printing records…</div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
          <div className="ppv-skel" style={{ width: '100%' }} />
          <div className="ppv-skel" style={{ width: '82%' }} />
          <div className="ppv-skel" style={{ width: '64%' }} />
        </div>
      </>
    );
  }

  if (state.kind === 'verified') {
    const d = state.data;
    const tone = statusTone(d.status);
    return shell(
      <>
        {mark}
        <hr className="ppv-rule" />
        <div className="ppv-stamp-row">
          <div className="ppv-stamp"><Seal tone="teal" glyph="check" /></div>
          <div className="ppv-stamp-text">
            <div className="h1">Verified - matches our records</div>
            <div className="p1">The contract data still matches the content hash printed on the document.</div>
          </div>
        </div>
        <div className="ppv-doctype">Document type <b>Printing contract</b></div>
        <div>
          <div className="ppv-row">
            <span className="label">Contract number</span><span className="fill" />
            <span className="value">{str(d.contractNumber)}</span>
          </div>
          <div className="ppv-row">
            <span className="label">Client</span><span className="fill" />
            <span className="value">{str(d.customerName)}</span>
          </div>
          <div className="ppv-row">
            <span className="label">Date</span><span className="fill" />
            <span className="value">{fmtDate(d.contractDate)}</span>
          </div>
          <div className="ppv-row total">
            <span className="label">Total</span><span className="fill" />
            <span className="value">{fmtTotal(d.currency, d.total)}</span>
          </div>
        </div>
        <div className={`ppv-band ${tone}`}>
          <span className="lab">Contract status</span>
          <span className="val">{str(d.status).toUpperCase()}</span>
        </div>
        <div className="ppv-foot">
          <div className="qr" aria-hidden="true">✓</div>
          <div className="ppv-foot-text">
            Checked against {str(d.companyName, 'Prime Printing')} records. The QR on the printed
            contract carries the same full SHA-256 digest.
          </div>
        </div>
      </>
    );
  }

  if (state.kind === 'altered') {
    return shell(
      <>
        {mark}
        <hr className="ppv-rule" />
        <div className="ppv-stamp-row">
          <div className="ppv-stamp"><Seal tone="red" glyph="warn" /></div>
          <div className="ppv-stamp-text">
            <div className="h1">Altered - does not match our records</div>
            <div className="p1">
              The contract data no longer matches the content hash on the document. Do not rely on this
              copy — contact Prime Printing.
            </div>
          </div>
        </div>
        <div className="ppv-err">
          No contract details are shown for a document that fails the integrity check.
        </div>
        {form('Check another contract')}
      </>
    );
  }

  if (state.kind === 'not_found') {
    return shell(
      <>
        {mark}
        <hr className="ppv-rule" />
        <div className="ppv-stamp-row">
          <div className="ppv-stamp"><Seal tone="amber" glyph="warn" /></div>
          <div className="ppv-stamp-text">
            <div className="h1">Not found</div>
            <div className="p1">No contract matches that number or short code in Prime Printing records.</div>
          </div>
        </div>
        {form('Try again')}
      </>
    );
  }

  if (state.kind === 'error') {
    return shell(
      <>
        {mark}
        <hr className="ppv-rule" />
        <div className="ppv-stamp-row">
          <div className="ppv-stamp"><Seal tone="amber" glyph="warn" /></div>
          <div className="ppv-stamp-text">
            <div className="h1">Verification unavailable</div>
            <div className="p1">The verification service could not be reached. Please try again.</div>
          </div>
        </div>
        <button
          className="ppv-btn"
          type="button"
          disabled={!state.lookup}
          onClick={() => void runLookup(state.lookup, state.hash)}
        >
          Retry
        </button>
        {form('Check another contract')}
      </>
    );
  }

  return shell(
    <>
      {mark}
      <hr className="ppv-rule" />
      <div className="ppv-stamp-row">
        <div className="ppv-stamp"><Seal tone="teal" glyph="dots" /></div>
        <div className="ppv-stamp-text">
          <div className="h1">Verify a printing contract</div>
          <div className="p1">Scan the QR on the contract, or enter the short code printed under its hash.</div>
        </div>
      </div>
      <p className="ppv-lede">
        The QR opens this page with the contract number and its full SHA-256 content hash. A short-code
        lookup runs the same server-side check.
      </p>
      {form()}
    </>
  );
};

export default ContractVerify;
