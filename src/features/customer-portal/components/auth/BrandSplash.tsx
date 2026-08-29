import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface BrandSplashProps {
  /** Callback fired once the splash display time has elapsed. */
  onReady?: () => void;
  /** Minimum time to show the splash in milliseconds. Default: 4000 */
  duration?: number;
}

const WORDMARK_PRIME = 'Prime '.split('');
const WORDMARK_PORTAL = 'PORTAL'.split('');

export function BrandSplash({ onReady, duration = 4000 }: BrandSplashProps) {
  const [visible, setVisible] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    const showTimer = window.setTimeout(() => setVisible(true), 50);
    const readyTimer = window.setTimeout(() => {
      setFadingOut(true);
      onReady?.();
    }, duration);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(readyTimer);
    };
  }, [duration, onReady]);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white transition-opacity duration-500 ${
        fadingOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center gap-6">
        {/* Logo */}
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#2563eb] shadow-xl">
          <span className="text-5xl font-black text-white">P</span>
        </div>

        {/* Wordmark */}
        <div className="text-center">
          <h1 className="text-4xl font-black tracking-tight text-slate-900 flex items-center justify-center gap-0.5">
            {WORDMARK_PRIME.map((letter, i) => (
              <span
                key={`prime-${i}`}
                className="inline-block animate-letter-in"
                style={{ animationDelay: `${200 + i * 60}ms` }}
              >
                {letter === ' ' ? '\u00A0' : letter}
              </span>
            ))}
            {WORDMARK_PORTAL.map((letter, i) => (
              <span
                key={`portal-${i}`}
                className="inline-block animate-letter-in text-[#2563eb]"
                style={{ animationDelay: `${200 + (WORDMARK_PRIME.length + i) * 60}ms` }}
              >
                {letter}
              </span>
            ))}
          </h1>
          <p className="mt-2 text-sm font-medium text-slate-500">
            Smart. Simple. School Supplies.
          </p>
        </div>

        {/* Loading indicator */}
        <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin text-[#2563eb]" />
          <span>Loading...</span>
        </div>
      </div>
    </div>
  );
}

export default BrandSplash;
