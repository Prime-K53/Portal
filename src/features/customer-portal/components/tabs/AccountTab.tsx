import React from 'react';
import {
  Building2,
  CreditCard,
  Headphones,
  LogOut,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react';
import { AccountProfile } from '../../types';
import { formatCurrency } from '../../utils/formatters';

interface AccountTabProps {
  profile: AccountProfile;
  onSignOut?: () => void;
}

export const AccountTab: React.FC<AccountTabProps> = ({ profile, onSignOut }) => {
  const hasAccountManager = Boolean(profile.accountManager?.name);
  return (
    <div className="space-y-4 pb-20 text-slate-900">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-slate-900 text-white shadow-xs">
            <User className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Account & Company Profile</h2>
            <p className="text-xs text-slate-500">Company credentials, assigned account manager, and payment terms configuration</p>
          </div>
        </div>

        {onSignOut && (
          <button
            onClick={onSignOut}
            className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 rounded-xl font-bold text-xs flex items-center gap-2 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        )}
      </div>

      {/* Profile Header Card */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center font-black text-lg text-white shadow-xs">
            {(profile?.companyName || 'P').charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-base text-slate-900">{profile?.companyName || 'Customer'}</h3>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
            {profile?.accountNumber && (
              <p className="text-xs text-slate-500 font-mono font-bold">Account #: {profile.accountNumber}</p>
            )}
            <span className="inline-block mt-1 text-[10px] bg-orange-100 text-orange-800 border border-orange-200 px-2 py-0.5 rounded-full font-bold">
              {profile?.tier || 'Standard'}
            </span>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
          {profile?.customerName && (
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Contact: {profile.customerName}</span>
            </div>
          )}
          {profile?.email && (
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-slate-400 shrink-0" />
              <span>{profile.email}</span>
            </div>
          )}
          {profile?.phone && (
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-slate-400 shrink-0" />
              <span>{profile.phone}</span>
            </div>
          )}
          {profile?.address && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="truncate">{profile.address}</span>
            </div>
          )}
        </div>
      </div>

      {/* Credit Terms Overview */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3 shadow-2xs">
        <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-emerald-600" />
          <span>Approved Credit Line & Billing Terms</span>
        </h3>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-white rounded-xl border border-slate-200">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Approved Credit</span>
            <strong className="text-base font-black text-slate-900">{formatCurrency(profile.creditLimit)}</strong>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Current Drawn Balance</span>
            <strong className="text-base font-black text-orange-600">{formatCurrency(profile.currentBalance)}</strong>
          </div>
        </div>

        <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
          <p><strong>Default Terms:</strong> Net 30 Commercial Credit Terms</p>
          <p><strong>Discount Terms:</strong> 1.5% 10, Net 30 (1.5% discount if paid within 10 days)</p>
        </div>
      </div>

      {/* Account Manager Box — hidden when the ERP profile carries no manager data */}
      {hasAccountManager && (
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3 shadow-2xs">
          <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
            <Headphones className="w-4 h-4 text-slate-700" />
            <span>Dedicated Corporate Account Manager</span>
          </h3>

          <div className="flex items-center gap-3">
            <img
              src={profile.accountManager.avatar || undefined}
              alt={profile.accountManager.name}
              className="w-12 h-12 rounded-full object-cover border-2 border-slate-300"
            />
            <div>
              <h4 className="font-extrabold text-sm text-slate-900">{profile.accountManager.name}</h4>
              <p className="text-xs text-slate-500">{profile.accountManager.email}</p>
              <p className="text-xs text-slate-900 font-mono font-bold mt-0.5">{profile.accountManager.phone}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
