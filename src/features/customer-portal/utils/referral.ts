/**
 * Prime PORTAL — Referral Helpers
 *
 * Referrals refer EXISTING ERP customers (search → select → create) and the
 * ERP tracks the lifecycle (active | converted | expired | cancelled) and
 * manages rewards (pending | approved | paid | cancelled) + wallet crediting.
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
    case 'active':
      return 'Active';
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
    case 'active':
      return { label, bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
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
