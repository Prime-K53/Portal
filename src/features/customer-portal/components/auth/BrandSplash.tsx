import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface BrandSplashProps {
  /** Callback fired once the splash display time has elapsed. */
  onReady?: () => void;
  /** Minimum time to show the splash in milliseconds. Default: 4000 */
  duration?: number;
  /** External visibility override — when true the splash is forced visible. */
  visible?: boolean;
}

export function BrandSplash({ onReady, duration = 4000, visible = false }: BrandSplashProps) {
  const [mounted, setMounted] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const wasExternallyVisible = React.useRef(false);
  const timerRef = React.useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (visible) {
      wasExternallyVisible.current = true;
      setFadingOut(false);
      setMounted(true);
      return;
    }

    if (!mounted) return;

    const delay = wasExternallyVisible.current ? 500 : duration;

    setFadingOut(true);
    timerRef.current = window.setTimeout(() => {
      setMounted(false);
      setFadingOut(false);
      wasExternallyVisible.current = false;
      onReady?.();
    }, delay);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [visible, mounted, duration, onReady]);

  useEffect(() => {
    if (visible || mounted) return;
    const t = window.setTimeout(() => setMounted(true), 50);
    return () => window.clearTimeout(t);
  }, [visible, mounted]);

  if (!mounted && !fadingOut) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white transition-opacity duration-500 ${
        fadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center gap-6">
        {/* Logo */}
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-[#2563eb] shadow-xl">
          <span className="text-5xl font-black text-white">P</span>
        </div>

        {/* Wordmark */}
        <div className="text-center">
          <h1 className="text-4xl font-black tracking-tight text-slate-900">
            Prime<span className="text-[#2563eb]">PORTAL</span>
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
