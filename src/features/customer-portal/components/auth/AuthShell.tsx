/**
 * Prime PORTAL — Auth Shell
 *
 * Shared responsive frame for the customer auth screens (login / activate /
 * forgot password). Keeps the premium dark ambient look consistent:
 *
 *   • Mobile & tablet portrait  → single centered white card (max-w-[440px])
 *   • Tablet landscape & desktop → split card with a branded teal panel
 */

import React from 'react';
import { Building2, FileText, Landmark, Truck } from 'lucide-react';

const PANEL_FEATURES = [
  { icon: FileText, title: 'Invoices & Billing', text: 'Live balances straight from the ERP ledger.' },
  { icon: Truck, title: 'Order Tracking', text: 'Real-time dispatch updates as they happen.' },
  { icon: Landmark, title: 'Secure Payments', text: 'Bank transfers verified by our finance team.' },
];

interface AuthShellProps {
  /** Form column content (rendered on the white card). */
  children: React.ReactNode;
}

export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="fixed inset-0 overflow-y-auto bg-slate-900 font-sans">
      {/* Background mesh orbs — premium ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-blue-500/20 blur-[140px]" />
        <div className="absolute top-1/3 -right-28 h-[26rem] w-[26rem] rounded-full bg-blue-600/15 blur-[160px]" />
        <div className="absolute -bottom-28 left-1/3 h-80 w-80 rounded-full bg-blue-400/10 blur-[140px]" />
      </div>

      {/* Centered card — widens into a split panel on desktop */}
      <div className="relative z-10 flex min-h-full items-center justify-center p-4 sm:p-6 lg:p-10">
        <div className="w-full max-w-[440px] lg:max-w-[60rem] animate-fade-in">
          <div className="grid overflow-hidden rounded-3xl shadow-2xl shadow-black/40 ring-1 ring-white/10 lg:grid-cols-[1.05fr_1fr]">
            {/* ── Brand panel (desktop / large tablet landscape only) ── */}
            <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#1e3a5f] via-[#1e40af] to-slate-950 p-10 text-white lg:flex xl:p-12">
              {/* Panel glow */}
              <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                <div className="absolute -top-16 -right-16 h-64 w-64 rounded-full bg-blue-400/20 blur-[100px]" />
                <div className="absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-blue-300/15 blur-[110px]" />
              </div>

              <div className="relative z-10 flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur-sm">
                  <Building2 className="h-5 w-5 text-blue-200" />
                </div>
                <h1 className="text-lg font-black tracking-tight">
                  Prime <span className="text-blue-400">PORTAL</span>
                </h1>
              </div>

              <div className="relative z-10 space-y-7 py-10">
                <h2 className="max-w-sm text-3xl font-black leading-tight tracking-tight xl:text-4xl">
                  Your business,
                  <br />
                    <span className="bg-gradient-to-r from-blue-200 via-blue-100 to-blue-300 bg-clip-text text-transparent">
                    in perfect sync.
                  </span>
                </h2>

                <ul className="space-y-4">
                  {PANEL_FEATURES.map(({ icon: Icon, title, text }) => (
                    <li key={title} className="flex items-start gap-3.5">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                        <Icon className="h-4 w-4 text-blue-200" />
                      </span>
                      <span>
                        <span className="block text-xs font-bold text-white">{title}</span>
                        <span className="block text-xs font-medium leading-relaxed text-white/60">{text}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="relative z-10 text-[11px] font-medium text-white/40">
                &copy; {new Date().getFullYear()} Prime Printing Services &middot; Powered by PrimeERP
              </p>
            </aside>

            {/* ── Form column (all breakpoints) ── */}
            <div className="bg-white/95 p-6 backdrop-blur-2xl sm:p-8 lg:p-10">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuthShell;
