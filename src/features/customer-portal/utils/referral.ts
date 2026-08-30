/**
 * Prime PORTAL — Referral Helpers
 *
 * Referrals refer EXISTING ERP customers (search → select → create) and the
 * ERP tracks the lifecycle (pending | registered | active | qualified | rewarded | reversed)
 * and manages rewards (pending | approved | paid | cancelled) + wallet crediting.
 * These helpers mirror the ERP contract exactly — Sasa never invents referral
 * codes, links, rewards or statuses.
 *
 * The ERP remains the final authority for ownership, conversions and reward
 * eligibility. These helpers only drive honest UI rendering.
 */

import type { PortalReferral, ReferralReward } from '../types';

export type ReferralStatus = PortalReferral['status'];
export type RewardStatus = ReferralReward['status'];

/** Human-friendly label for an ERP referral status. */
export function getReferralStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'registered':
      return 'Registered';
    case 'active':
      return 'Active';
    case 'qualified':
      return 'Qualified';
    case 'rewarded':
      return 'Rewarded';
    case 'reversed':
      return 'Reversed';
    case 'converted':
      return 'Converted';
    case 'expired':
      return 'Expired';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
  }
}

/** Tailwind badge styling for an ERP referral status. */
export function getReferralStatusBadge(status: string): { label: string; bg: string } {
  const label = getReferralStatusLabel(status);
  switch (status) {
    case 'pending':
      return { label, bg: 'bg-slate-100 text-slate-600 border-slate-200' };
    case 'registered':
      return { label, bg: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'active':
      return { label, bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'qualified':
      return { label, bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    case 'rewarded':
      return { label, bg: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
    case 'reversed':
      return { label, bg: 'bg-rose-50 text-rose-700 border-rose-200' };
    case 'converted':
      return { label, bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    case 'expired':
      return { label, bg: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'cancelled':
      return { label, bg: 'bg-slate-100 text-slate-600 border-slate-200' };
    default:
      return { label, bg: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
}

/** Human-friendly label for an ERP referral-reward status. */
export function getRewardStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'approved':
      return 'Approved';
    case 'paid':
      return 'Paid';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
  }
}

/** Tailwind badge styling for an ERP referral-reward status. */
export function getRewardStatusBadge(status: string): { label: string; bg: string } {
  const label = getRewardStatusLabel(status);
  switch (status) {
    case 'pending':
      return { label, bg: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'approved':
      return { label, bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'paid':
      return { label, bg: 'bg-sky-50 text-sky-700 border-sky-200' };
    case 'cancelled':
      return { label, bg: 'bg-slate-100 text-slate-600 border-slate-200' };
    default:
      return { label, bg: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
}
