import React from 'react';
import { Download, X } from 'lucide-react';
import { usePwaInstall } from '../../../pwa/usePwaInstall';

interface PwaInstallChipProps {
  /** Hidden while the cart bar occupies the bottom edge. */
  suppressed?: boolean;
}

/**
 * Floating "Install app" affordance backed by the native beforeinstallprompt
 * flow. Renders nothing unless the browser can actually install (and the
 * user hasn't dismissed it recently / isn't already running standalone).
 */
export const PwaInstallChip: React.FC<PwaInstallChipProps> = ({ suppressed = false }) => {
  const { shouldOffer, prompting, promptInstall, dismiss } = usePwaInstall();

  if (suppressed || !shouldOffer) return null;

  return (
    <div className="fixed bottom-24 right-3 sm:right-5 md:bottom-6 z-30 animate-slide-up">
      <div className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full bg-slate-950/95 text-white border border-slate-700 shadow-2xl backdrop-blur-md">
        <span className="text-[11px] font-extrabold tracking-tight">Install Prime PORTAL</span>
        <button
          onClick={() => { void promptInstall(); }}
          disabled={prompting}
          title="Install the portal as an app"
          className="p-1.5 rounded-full bg-amber-400 text-slate-950 hover:bg-amber-300 disabled:opacity-60 transition"
        >
          {prompting ? (
            <span className="block w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
        </button>
        <button
          onClick={dismiss}
          aria-label="Dismiss install offer"
          className="p-1 rounded-full text-slate-400 hover:text-white transition"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default PwaInstallChip;
