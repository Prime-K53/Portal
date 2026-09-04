import React, { useState } from 'react';
import { CheckCircle2, Copy, Link2, Loader2, MessageCircle, Share2 } from 'lucide-react';
import { AccountProfile } from '../../types';

interface ReferralCodeCardProps {
  profile: AccountProfile;
}

function buildReferralUrl(referralCode: string): string {
  const base = window.location.origin;
  return `${base}/register?ref=${encodeURIComponent(referralCode)}`;
}

export function ReferralCodeCard({ profile }: ReferralCodeCardProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [whatsAppCopied, setWhatsAppCopied] = useState(false);

  const referralCode = profile.referralCode ?? null;
  const shareMessage = profile.referralShareMessage ?? "I use Prime Printing for school stationery and printing. Register using my referral link to get a discount on your first order!";

  const referralUrl = referralCode ? buildReferralUrl(referralCode) : null;

  const handleCopyCode = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(referralCode);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(referralCode);
    }
  };

  const handleCopyLink = async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setLinkCopied(true);
    }
  };

  const handleWhatsApp = () => {
    if (!referralUrl) return;
    const text = `${shareMessage}\n\nMy referral link: ${referralUrl}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setWhatsAppCopied(true);
    setTimeout(() => setWhatsAppCopied(false), 2000);
  };

  const handleShareNative = async () => {
    if (!referralUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Prime Printing Referral',
          text: shareMessage,
          url: referralUrl,
        });
      } catch {
        // User cancelled or share failed
      }
    } else {
      await handleCopyLink();
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-900 p-4 shadow-sm">
      <div
        className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
        aria-hidden="true"
      />
      <div
        className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-500/10 blur-xl"
        aria-hidden="true"
      />

      <div className="relative">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white">
            <Link2 className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white">Refer & Earn</h3>
            <p className="text-[11px] font-medium text-slate-400">
              Share your code — earn rewards when they convert
            </p>
          </div>
        </div>

        {referralCode ? (
          <>
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 mb-3">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                Your Referral Code
              </p>
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-2xl font-black tracking-widest text-white">
                  {referralCode}
                </span>
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition px-3 py-2 text-xs font-bold text-white shrink-0"
                >
                  {copied === referralCode ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={handleCopyLink}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition px-3 py-2.5 text-xs font-bold text-white"
              >
                {linkCopied ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {linkCopied ? 'Copied' : 'Link'}
              </button>
              <button
                onClick={handleWhatsApp}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 transition px-3 py-2.5 text-xs font-bold text-white"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                WhatsApp
              </button>
              <button
                onClick={handleShareNative}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition px-3 py-2.5 text-xs font-bold text-white"
              >
                <Share2 className="h-3.5 w-3.5" />
                Share
              </button>
            </div>
          </>
        ) : (
          <div className="rounded-xl bg-white/5 border border-white/10 p-6 text-center">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-slate-400" />
            <p className="text-xs font-medium text-slate-400">Loading your referral code…</p>
          </div>
        )}
      </div>
    </div>
  );
}
