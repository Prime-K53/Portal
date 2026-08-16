import React from 'react';
import { AlertTriangle, Gift } from 'lucide-react';
import { AccountProfile, Referral } from '../../types';

interface ReferralsTabProps {
  profile: AccountProfile;
  referrals: Referral[];
  onSendInvite: (name: string, company: string, email: string) => void;
  onClaimReward: (referralId: string) => void;
}

/**
 * Referral features are NOT wired in Sasa. The ERP referral API is live
 * (GET/POST /api/portal/referrals), but it refers EXISTING customers by their
 * ERP customer id — Sasa's name/email invite flow does not match that contract,
 * and reward claiming is ERP-admin approved (no customer claim endpoint).
 * This screen states that explicitly instead of fabricating referral codes,
 * links, or reward balances.
 */
export const ReferralsTab: React.FC<ReferralsTabProps> = () => {
  return (
    <div className="space-y-4 pb-20 text-slate-900">
      <div className="flex items-center gap-3 pb-3 border-b border-slate-200/80">
        <div className="p-2.5 rounded-2xl bg-amber-500 text-slate-950 shadow-xs">
          <Gift className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Partner Referral Program</h2>
          <p className="text-xs text-slate-500">Invite business contacts and earn account credit rewards</p>
        </div>
      </div>

      {/* Blocked-State Panel */}
      <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200/80 text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h3 className="font-extrabold text-sm text-slate-900">Referrals Are Not Yet Available Here</h3>
          <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto font-medium">
            The ERP referral program refers existing customers by their ERP customer ID — this portal's
            invite-by-email flow does not match that contract, so invitations cannot be submitted yet.
            Referral rewards are also approved and credited by ERP staff rather than claimed by customers.
          </p>
        </div>
        <p className="text-[12.5px] text-slate-400 font-medium">
          The referral screen must be rebuilt around the verified ERP contract before it can be enabled.
          Contact your account manager for the latest status.
        </p>
      </div>
    </div>
  );
};