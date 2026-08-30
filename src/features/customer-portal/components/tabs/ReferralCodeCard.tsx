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
  const shareMessage = profile.referralShareMessage ?? "I use Prime Printing for school stationery and printing services. Register through my referral link and receive a discount on your first order!";

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
    <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-lg">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-2 rounded-xl bg-white/20">
          <Link2 className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="font-extrabold text-sm text-white">Refer & Earn</h3>
          <p className="text-[11px] text-blue-200">Share your code — earn rewards when they convert</p>
        </div>
      </div>

      {referralCode ? (
        <>
          <div className="bg-white/10 rounded-xl p-3 mb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200 mb-1">Your Referral Code</p>
            <div className="flex items-center justify-between gap-2">
              <span className="font-black text-2xl tracking-widest text-white font-mono">{referralCode}</span>
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition text-xs font-bold text-white shrink-0"
              >
                {copied === referralCode ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleCopyLink}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 transition text-xs font-bold text-white"
            >
              {linkCopied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {linkCopied ? 'Copied!' : 'Copy Link'}
            </button>
            <button
              onClick={handleWhatsApp}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-green-500 hover:bg-green-400 transition text-xs font-bold text-white"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              WhatsApp
            </button>
            <button
              onClick={handleShareNative}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 transition text-xs font-bold text-white"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share
            </button>
          </div>
        </>
      ) : (
        <div className="bg-white/10 rounded-xl p-4 text-center">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-300" />
          <p className="text-xs text-blue-200 font-medium">Loading your referral code...</p>
        </div>
      )}
    </div>
  );
}
