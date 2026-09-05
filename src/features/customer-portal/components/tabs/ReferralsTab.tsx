import React from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Gift,
  Loader2,
  Plus,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  Wallet as WalletIcon,
} from 'lucide-react';
import {
  AccountProfile,
  PortalReferral,
  ReferralCreatePayload,
  ReferralReward,
  ReferralStats,
  ReferralTimelineEntry,
  Wallet,
} from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { generateIdempotencyKey } from '../../utils/idempotency';
import { StatusBadge } from '../ui';
import { ReferralCodeCard } from './ReferralCodeCard';

interface ReferralsTabProps {
  profile: AccountProfile;
  referrals: PortalReferral[];
  stats: ReferralStats | null;
  rewards: ReferralReward[];
  wallet: Wallet | null;
  /** Creates a prospective-person referral. `idempotencyKey` identifies this
   * logical submission attempt and is reused when the attempt is retried
   * (the ERP replays its stored response for the same key). */
  onCreateReferral: (payload: ReferralCreatePayload, idempotencyKey: string) => Promise<PortalReferral>;
  /** Loads the ERP-tracked lifecycle timeline for one referral. */
  onLoadTimeline: (referralId: string) => Promise<ReferralTimelineEntry[]>;
}

const getEventTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    created: 'Created',
    converted: 'Converted',
    invoice_linked: 'Invoice Linked',
    expired: 'Expired',
    cancelled: 'Cancelled',
    reward_approved: 'Reward Approved',
    reward_paid: 'Reward Paid',
  };
  return labels[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

export const ReferralsTab: React.FC<ReferralsTabProps> = ({
  profile,
  referrals,
  stats,
  rewards,
  wallet,
  onCreateReferral,
  onLoadTimeline,
}) => {
  // ── Refer-a-person flow ──────────────────────────────────────────────────
  const [isFlowOpen, setIsFlowOpen] = React.useState(false);
  const [referredName, setReferredName] = React.useState('');
  const [referredEmail, setReferredEmail] = React.useState('');
  const [referredPhone, setReferredPhone] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [createError, setCreateError] = React.useState('');
  const [createdReferral, setCreatedReferral] = React.useState<PortalReferral | null>(null);

  // Idempotency key for the CURRENT logical submission attempt.
  const submissionKeyRef = React.useRef<string | null>(null);
  const payloadSignature = JSON.stringify([referredName.trim(), referredEmail.trim(), referredPhone.trim(), notes.trim()]);
  const lastPayloadSignatureRef = React.useRef(payloadSignature);
  React.useEffect(() => {
    if (lastPayloadSignatureRef.current !== payloadSignature) {
      submissionKeyRef.current = null;
      lastPayloadSignatureRef.current = payloadSignature;
    }
  }, [payloadSignature]);

  const handleSubmitReferral = async () => {
    if (!referredName.trim()) return;
    if (!referredEmail.trim() && !referredPhone.trim()) return;

    if (!submissionKeyRef.current) {
      submissionKeyRef.current = generateIdempotencyKey();
    }
    const idempotencyKey = submissionKeyRef.current;

    setIsSubmitting(true);
    setCreateError('');
    try {
      const created = await onCreateReferral(
        {
          referredName: referredName.trim(),
          referredEmail: referredEmail.trim() || undefined,
          referredPhone: referredPhone.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        idempotencyKey
      );
      submissionKeyRef.current = null;
      setCreatedReferral(created);
      setReferredName('');
      setReferredEmail('');
      setReferredPhone('');
      setNotes('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'The referral could not be submitted.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartAnother = () => {
    setCreatedReferral(null);
    setCreateError('');
    setIsFlowOpen(true);
  };

  // ── Timeline expansion ───────────────────────────────────────────────────
  const [expandedTimelineId, setExpandedTimelineId] = React.useState<string | null>(null);
  const [timelines, setTimelines] = React.useState<Record<string, ReferralTimelineEntry[]>>({});
  const [timelineError, setTimelineError] = React.useState('');

  const handleToggleTimeline = async (referralId: string) => {
    if (expandedTimelineId === referralId) {
      setExpandedTimelineId(null);
      return;
    }
    setExpandedTimelineId(referralId);
    setTimelineError('');
    if (timelines[referralId]) return;
    try {
      const entries = await onLoadTimeline(referralId);
      setTimelines((prev) => ({ ...prev, [referralId]: entries }));
    } catch (err) {
      setTimelineError(err instanceof Error ? err.message : 'The timeline could not be loaded.');
    }
  };

  return (
    <div className="space-y-3 pb-12 text-slate-900">
      {/* ── Hero Header ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-900 px-5 py-4 shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" aria-hidden="true" />
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber-500/10 blur-2xl" aria-hidden="true" />
        <div className="absolute -bottom-4 -left-4 h-24 w-24 rounded-full bg-blue-500/10 blur-2xl" aria-hidden="true" />

        <div className="relative flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-slate-950 shadow-sm">
            <Gift className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">
              Partner Referral Program
            </h2>
            <p className="mt-0.5 text-xs font-medium text-slate-400">
              Refer new people — the ERP tracks conversions and rewards
            </p>
          </div>
        </div>
      </div>

      {/* ── Stats Hero ──────────────────────────────────────────────────────── */}
      {stats && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                <Users className="h-3 w-3" aria-hidden="true" />
                People Referred
              </div>
              <p className="mt-1 text-2xl font-black text-slate-900 tabular-nums">{stats.total}</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                <UserPlus className="h-3 w-3" aria-hidden="true" />
                Registered
              </div>
              <p className="mt-1 text-2xl font-black text-slate-900 tabular-nums">
                {stats.registered ?? stats.signedUp}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Qualified
              </div>
              <p className="mt-1 text-2xl font-black text-slate-900 tabular-nums">{stats.qualified}</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                <TrendingUp className="h-3 w-3" aria-hidden="true" />
                Conversion
              </div>
              <p className="mt-1 text-2xl font-black text-slate-900 tabular-nums">{stats.conversionRate}%</p>
            </div>
          </div>

          <div className="mt-3 border-t border-slate-100 pt-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-xs font-bold text-slate-600">Pending Rewards</span>
                <span className="text-sm font-black text-amber-700 finance-nums">
                  {formatCurrency(stats.pendingRewardAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-xs font-bold text-slate-600">Total Earned</span>
                <span className="text-sm font-black text-emerald-700 finance-nums">
                  {formatCurrency(stats.totalEarned)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-xs font-bold text-slate-600">Paid Out</span>
                <span className="text-sm font-black text-slate-900 tabular-nums">{stats.paid}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Referral Code & Share ───────────────────────────────────────────── */}
      <ReferralCodeCard profile={profile} />

      {/* ── Refer a Customer ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {createdReferral ? (
          <div className="text-center space-y-4 py-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-black text-slate-900">Referral submitted</h3>
              <p className="mx-auto max-w-sm text-sm font-medium text-slate-600">
                <span className="font-bold text-slate-900">{createdReferral.referredCustomerName}</span> has been referred.
                The ERP tracks the referral lifecycle and rewards are approved and credited by ERP staff.
              </p>
            </div>
            <button
              onClick={handleStartAnother}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" /> Refer Another Person
            </button>
          </div>
        ) : !isFlowOpen ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <UserPlus className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">Refer a Person</h3>
                <p className="text-xs font-medium text-slate-500">Add a prospective new customer</p>
              </div>
            </div>
            <button
              onClick={() => setIsFlowOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-slate-800"
            >
              Start
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <UserPlus className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">New Referral</h3>
                <p className="text-[11px] font-medium text-slate-500">Only new or prospective people are eligible</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={referredName}
                  onChange={(e) => setReferredName(e.target.value)}
                  placeholder="e.g. Grace Banda"
                  disabled={isSubmitting}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 transition"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">
                    Email <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={referredEmail}
                    onChange={(e) => setReferredEmail(e.target.value)}
                    placeholder="email@example.com"
                    disabled={isSubmitting}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 transition"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={referredPhone}
                    onChange={(e) => setReferredPhone(e.target.value)}
                    placeholder="+265 ..."
                    disabled={isSubmitting}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">
                  Notes <span className="font-medium text-slate-400 normal-case">(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any context for the referral…"
                  rows={2}
                  disabled={isSubmitting}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 transition resize-none disabled:opacity-50"
                />
              </div>
            </div>

            {createError && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {createError}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => {
                  setIsFlowOpen(false);
                  setCreateError('');
                }}
                disabled={isSubmitting}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitReferral}
                disabled={!referredName.trim() || (!referredEmail.trim() && !referredPhone.trim()) || isSubmitting}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <Gift className="h-4 w-4" />
                    Submit Referral
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── My Referrals ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-black text-slate-900">My Referrals</h3>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600 tabular-nums">
            {referrals.length}
          </span>
        </div>

        {referrals.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium text-slate-500">
              No referrals yet. Use "Refer a Person" above to add your first.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {referrals.map((referral) => {
              const isExpanded = expandedTimelineId === referral.id;
              const timeline = timelines[referral.id];
              return (
                <li key={referral.id}>
                  <button
                    onClick={() => handleToggleTimeline(referral.id)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50/60"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">
                        {referral.referredCustomerName || referral.referredCustomerId}
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-slate-500 truncate">
                        {referral.referredCustomerEmail || referral.referredCustomerPhone || 'No contact'} · Referred {formatDate(referral.createdAt)}
                      </p>
                    </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={referral.status} type="referral" />
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-3">
                      <div className="border-l-2 border-amber-200 pl-4 space-y-3">
                        {referral.notes && (
                          <p className="text-xs font-medium text-slate-600">
                            <span className="font-bold text-slate-700">Note:</span> {referral.notes}
                          </p>
                        )}
                        {(referral.pendingInvoiceId || referral.convertedInvoiceId) && (
                          <p className="text-xs font-medium text-slate-600">
                            {referral.convertedInvoiceId
                              ? `Converted on invoice ${referral.convertedInvoiceId}${referral.convertedAt ? ` · ${formatDate(referral.convertedAt)}` : ''}`
                              : referral.pendingInvoiceId
                                ? `Pending invoice ${referral.pendingInvoiceId}${referral.pendingInvoiceAmount ? ` · ${formatCurrency(referral.pendingInvoiceAmount)}` : ''}`
                                : null}
                          </p>
                        )}
                        {timeline && timeline.length > 0 && (
                          <ul className="space-y-2.5 pt-1">
                            {timeline.map((entry) => (
                              <li key={entry.id} className="flex gap-2.5">
                                <Clock3 className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" aria-hidden="true" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold text-slate-900">
                                    {entry.title}
                                    <span className="ml-1.5 font-medium text-slate-400">
                                      · {getEventTypeLabel(entry.eventType)} · {formatDate(entry.timestamp || entry.createdAt)}
                                    </span>
                                  </p>
                                  {entry.description && (
                                    <p className="mt-0.5 text-xs font-medium text-slate-500">{entry.description}</p>
                                  )}
                                  {typeof entry.amount === 'number' && entry.amount !== null && (
                                    <p className="mt-0.5 text-xs font-black text-emerald-600 finance-nums">
                                      {formatCurrency(entry.amount)}
                                    </p>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                        {!timeline && (
                          <p className="text-xs font-medium text-slate-400">Loading timeline…</p>
                        )}
                        {timeline && timeline.length === 0 && (
                          <p className="text-xs font-medium text-slate-400">No timeline events yet.</p>
                        )}
                        {timelineError && (
                          <p className="flex items-center gap-1.5 text-xs font-bold text-rose-600">
                            <AlertTriangle className="h-3.5 w-3.5" /> {timelineError}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Rewards ─────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-black text-slate-900">Rewards</h3>
            <p className="mt-0.5 text-[11px] font-medium text-slate-500">
              Approved and credited to your wallet by ERP staff
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600 tabular-nums">
            {rewards.length}
          </span>
        </div>

        {rewards.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium text-slate-500">
              No rewards yet. Rewards are earned when referred customers convert.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rewards.map((reward) => (
                <li key={reward.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900 finance-nums">
                      {formatCurrency(reward.amount)}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-slate-500 truncate">
                      {reward.referredCustomerName || reward.referredCustomerId}
                      {reward.invoiceId ? ` · ${reward.invoiceId}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={reward.status} type="reward" dot={false} />
                </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Wallet ──────────────────────────────────────────────────────────── */}
      {wallet && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <WalletIcon className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">Wallet</h3>
                <p className="text-[11px] font-medium text-slate-500">Read-only · managed by ERP</p>
              </div>
            </div>
            <p className="text-lg font-black text-slate-900 finance-nums">
              {formatCurrency(wallet.walletBalance)}
            </p>
          </div>

          {wallet.transactions.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm font-medium text-slate-500">No wallet transactions yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {wallet.transactions.slice(0, 5).map((txn, idx) => (
                <li key={`${txn.date}-${txn.reference}-${idx}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{txn.reference}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-slate-500">{formatDate(txn.date)}</p>
                  </div>
                  <p
                    className={`text-sm font-black shrink-0 finance-nums ${
                      txn.type === 'credit' ? 'text-emerald-600' : 'text-slate-700'
                    }`}
                  >
                    {txn.type === 'credit' ? '+' : '−'}
                    {formatCurrency(txn.amount)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
