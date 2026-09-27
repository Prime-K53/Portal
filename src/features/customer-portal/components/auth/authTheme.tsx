/**
 * Prime PORTAL — Shared mint-theme auth kit.
 *
 * Single visual language for every auth screen (login / activate / forgot /
 * register / pending): mint page, centered brand mark, SECURE SIGN-IN
 * eyebrow, "Welcome Back"-style heading, white inputs, black pill primary,
 * light secondary button. Screens keep their own logic — only the chrome
 * comes from here.
 */

import React from 'react';
import { X } from 'lucide-react';

/** White 52px input with emerald focus — matches the Welcome Back mock. */
export const authInputClass =
  'w-full h-[52px] px-4 bg-white border border-slate-200 rounded-[12px] text-[14px] text-slate-900 placeholder-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.05)] focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 focus:shadow-[0_2px_12px_rgba(16,185,129,0.15)] transition';

/** Black pill primary action. */
export const authPrimaryButtonClass =
  'w-full h-[52px] rounded-full bg-black text-white text-[15px] font-bold shadow-[0_10px_25px_rgba(0,0,0,0.25)] hover:bg-slate-900 hover:shadow-[0_12px_28px_rgba(0,0,0,0.3)] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100 disabled:shadow-none flex items-center justify-center gap-2 transition-all';

/** Light secondary action (replaces the old Google-style button slot). */
export const authSecondaryButtonClass =
  'w-full h-[52px] rounded-[16px] bg-[#edf1f7] hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 text-slate-800 text-[14px] font-bold flex items-center justify-center gap-2 transition-all';

/** Field label — 13px semibold, shared by every auth screen. */
export const authLabelClass = 'mb-1 block text-[13px] font-semibold text-slate-900';

export function AuthBrandMark() {
  const [failed, setFailed] = React.useState(false);

  // The official Prime Printing lockup with its backdrop removed, so it
  // sits directly on the mint background — exact artwork, zero recoloring.
  if (!failed) {
    return (
      <div className="flex flex-col items-center animate-rise">
        <img
          src="/prime-logo.png"
          alt="Prime Printing — Quality, Reliable, Affordable"
           width={230}
           height={153}
          onError={() => setFailed(true)}
           className="w-[180px] sm:w-[200px] h-auto drop-shadow-[0_10px_20px_rgba(15,23,42,0.15)]"
        />
      </div>
    );
  }

  // Text fallback if the artwork ever fails to load.
  return (
    <div className="flex flex-col items-center animate-rise">
      <div className="text-[30px] font-extrabold leading-none tracking-tight text-[#2f80ed]">
        Prime
      </div>
      <div className="mt-1 text-[9px] font-bold tracking-[0.35em] text-slate-500">
        PRINTING
      </div>
      <div className="mt-0.5 text-[8px] font-medium tracking-wide text-amber-700">
        Quality &bull; Reliable &bull; Affordable
      </div>
    </div>
  );
}

export function AuthEyebrow({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-blue-700" aria-hidden="true" />
      <span className="text-[11px] font-bold tracking-[0.22em] text-blue-700">{text}</span>
    </div>
  );
}

export function AuthUnderline() {
  return (
    <div className="mt-2 flex h-[4px] w-[72px] overflow-hidden rounded-full" aria-hidden="true">
      <div className="h-full w-[60%] bg-[#1d4ed8]" />
      <div className="h-full w-[40%] bg-[#f59e0b]" />
    </div>
  );
}

export function AuthHeading({
  lead,
  accent,
  description,
}: {
  lead: string;
  accent: string;
  description: string;
}) {
  return (
    <div className="mt-5 animate-rise" style={{ animationDelay: '70ms' }}>
      <AuthEyebrow text="SECURE SIGN-IN" />
      <h1 className="mt-1.5 text-[28px] sm:text-[32px] font-extrabold leading-tight tracking-tight text-slate-900">
        {lead} <span className="text-[#2563eb]">{accent}</span>
      </h1>
      <AuthUnderline />
      <p className="mt-2 text-[14px] leading-relaxed text-slate-500">{description}</p>
    </div>
  );
}

/** Dismissible error banner — announced assertively to screen readers. */
export function AuthError({ error, onDismiss }: { error: string; onDismiss?: () => void }) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium leading-relaxed text-rose-700"
    >
      <span>{error}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 font-black text-rose-400 hover:text-rose-600"
          aria-label="Dismiss error"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Label + control + validation message as one unit, so every auth screen
 * wires `aria-invalid` / `aria-describedby` identically.
 */
export function AuthField({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: React.ReactNode;
  error?: string | null;
  children: React.ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
}) {
  const errorId = `${id}-error`;
  const control = React.cloneElement(children, {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
  });
  return (
    <div>
      <label htmlFor={id} className={authLabelClass}>
        {label}
      </label>
      {control}
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs font-medium text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}

/** Page shell — mint background, centered 400px column, vertically centered
 *  on tall screens (m-auto never clips on short ones). */
export function AuthMintShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#e9f6ef] font-sans">
      {/* Whisper-soft depth — barely-there radial light, stays true to the flat mock. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(520px 340px at 50% -60px, rgba(255,255,255,0.9), rgba(255,255,255,0) 70%), radial-gradient(420px 300px at 85% 110%, rgba(37,99,235,0.06), rgba(37,99,235,0) 70%)',
        }}
      />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[400px] flex-col px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:py-8">
        <div className="m-auto w-full">
          <AuthBrandMark />
          {children}
        </div>
      </div>
    </div>
  );
}
