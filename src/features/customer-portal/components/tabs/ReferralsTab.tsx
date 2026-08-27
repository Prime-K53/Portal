import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Gift,
  Loader2,
  Plus,
  Search,
  UserPlus,
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
import { getReferralStatusBadge, getRewardStatusBadge } from '../../utils/referral';

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

  const statCards = [
    { label: 'Referred', value: stats ? String(stats.total) : '—' },
    { label: 'Active', value: stats ? String(stats.signedUp) : '—' },
    { label: 'Rewards Approved', value: stats ? String(stats.rewardApproved) : '—' },
    { label: 'Total Earned', value: stats ? formatCurrency(stats.totalEarned) : '—' },
  ];

  return (
    <div className="space-y-4 pb-20 text-slate-900">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-slate-200/80">
        <div className="p-2.5 rounded-2xl bg-amber-500 text-slate-950 shadow-xs">
          <Gift className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Partner Referral Program</h2>
          <p className="text-xs text-slate-500">Refer new people — the ERP tracks conversions and rewards</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        {statCards.map((card) => (
          <div key={card.label} className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{card.label}</p>
            <p className="mt-1 text-xl font-black text-slate-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Refer a Customer */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
        {createdReferral ? (
          <div className="text-center space-y-3 py-2">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-extrabold text-sm text-slate-900">
                Referral submitted — <span className="text-emerald-600">Status: Active</span>
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                {createdReferral.referredCustomerName} has been referred. The ERP tracks the referral
                (conversion, expiry) and rewards are approved and credited by ERP staff — there is nothing
                else to do on this screen.
              </p>
            </div>
            <button
              onClick={handleStartAnother}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold px-4 py-2.5 hover:bg-slate-800 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Refer Another Customer
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">Refer a Customer</h3>
                  <p className="text-[11px] text-slate-500">Refer a new or prospective person</p>
                </div>
              </div>
              {!isFlowOpen && (
                <button
                  onClick={() => setIsFlowOpen(true)}
                  className="rounded-xl bg-slate-900 text-white text-xs font-bold px-3.5 py-2 hover:bg-slate-800 transition-colors"
                >
                  Start
                </button>
              )}
            </div>

            {isFlowOpen && (
              <div className="mt-3 space-y-3">
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={referredName}
                      onChange={(e) => setReferredName(e.target.value)}
                      placeholder="Full name of the person"
                      disabled={isSubmitting}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Email <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={referredEmail}
                      onChange={(e) => setReferredEmail(e.target.value)}
                      placeholder="email@example.com"
                      disabled={isSubmitting}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={referredPhone}
                      onChange={(e) => setReferredPhone(e.target.value)}
                      placeholder="+265 ..."
                      disabled={isSubmitting}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Notes (optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Context for the referral…"
                    rows={2}
                    disabled={isSubmitting}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/60 disabled:opacity-50"
                  />
                </div>

                {createError && (
                  <p className="flex items-center gap-1.5 text-xs text-rose-600 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" /> {createError}
                  </p>
                )}

                <button
                  onClick={handleSubmitReferral}
                  disabled={!referredName.trim() || (!referredEmail.trim() && !referredPhone.trim()) || isSubmitting}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 text-slate-950 text-sm font-extrabold px-4 py-3 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
                  {isSubmitting ? 'Submitting…' : 'Submit Referral'}
                </button>
                <p className="text-[11px] text-slate-400 font-medium text-center">
                  Existing customers cannot be referred. Only new/prospective people are eligible.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* My Referrals */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
        <h3 className="font-extrabold text-sm text-slate-900 mb-3">My Referrals</h3>
        {referrals.length === 0 ? (
          <p className="text-xs text-slate-500 font-medium py-2">
            No referrals yet. Use "Refer Someone" above to refer a new person.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {referrals.map((referral) => {
              const statusBadge = getReferralStatusBadge(referral.status);
              const isExpanded = expandedTimelineId === referral.id;
              const timeline = timelines[referral.id];
              return (
                <li key={referral.id} className="py-3">
                  <button
                    onClick={() => handleToggleTimeline(referral.id)}
                    className="w-full flex items-center justify-between gap-2 text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">
                        {referral.referredCustomerName || referral.referredCustomerId}
                      </p>
                      <p className="text-xs text-slate-500 font-medium">{referral.referredCustomerEmail || referral.referredCustomerPhone || ''} · Referred {formatDate(referral.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[11px] font-bold px-2 py-1 rounded-full border ${statusBadge.bg}`}>
                        {statusBadge.label}
                      </span>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-2.5 ml-1 border-l-2 border-amber-200 pl-3 space-y-2">
                      {referral.notes && (
                        <p className="text-xs text-slate-600 font-medium">Note: {referral.notes}</p>
                      )}
                      {(referral.pendingInvoiceId || referral.convertedInvoiceId) && (
                        <p className="text-xs text-slate-500 font-medium">
                          {referral.convertedInvoiceId
                            ? `Converted on invoice ${referral.convertedInvoiceId}${referral.convertedAt ? ` (${formatDate(referral.convertedAt)})` : ''}`
                            : referral.pendingInvoiceId
                              ? `Pending invoice ${referral.pendingInvoiceId}${referral.pendingInvoiceAmount ? ` — ${formatCurrency(referral.pendingInvoiceAmount)}` : ''}`
                              : null}
                        </p>
                      )}
                      {timeline && timeline.length > 0 && (
                        <ul className="space-y-2 pt-1">
                          {timeline.map((entry) => (
                            <li key={entry.id} className="flex gap-2.5">
                              <Clock3 className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-900">
                                  {entry.title}{' '}
                                  <span className="font-medium text-slate-400">
                                    {getEventTypeLabel(entry.eventType)} · {formatDate(entry.timestamp || entry.createdAt)}
                                  </span>
                                </p>
                                {entry.description && (
                                  <p className="text-xs text-slate-500 font-medium">{entry.description}</p>
                                )}
                                {typeof entry.amount === 'number' && entry.amount !== null && (
                                  <p className="text-xs font-bold text-emerald-600">{formatCurrency(entry.amount)}</p>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                      {!timeline && (
                        <p className="text-xs text-slate-400 font-medium">Loading timeline…</p>
                      )}
                      {timeline && timeline.length === 0 && (
                        <p className="text-xs text-slate-400 font-medium">No timeline events yet.</p>
                      )}
                      {timelineError && (
                        <p className="flex items-center gap-1.5 text-xs text-rose-600 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" /> {timelineError}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Rewards */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
        <h3 className="font-extrabold text-sm text-slate-900 mb-1">Rewards</h3>
        <p className="text-[11px] text-slate-500 font-medium mb-3">
          Rewards are approved and credited to your wallet by ERP staff — read-only here.
        </p>
        {rewards.length === 0 ? (
          <p className="text-xs text-slate-500 font-medium py-2">
            No rewards yet. Rewards are earned when referred customers convert.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rewards.map((reward) => {
              const statusBadge = getRewardStatusBadge(reward.status);
              return (
                <li key={reward.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">{formatCurrency(reward.amount)}</p>
                    <p className="text-xs text-slate-500 font-medium truncate">
                      {reward.referredCustomerName || reward.referredCustomerId}
                      {reward.invoiceId ? ` · ${reward.invoiceId}` : ''}
                    </p>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-1 rounded-full border shrink-0 ${statusBadge.bg}`}>
                    {statusBadge.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Wallet */}
      {wallet && (
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <WalletIcon className="w-4 h-4 text-amber-600" />
              <h3 className="font-extrabold text-sm text-slate-900">Wallet</h3>
            </div>
            <p className="text-lg font-black text-slate-900">{formatCurrency(wallet.walletBalance)}</p>
          </div>
          <p className="text-[11px] text-slate-500 font-medium mb-2">
            Wallet balances are managed by the ERP — read-only here.
          </p>
          {wallet.transactions.length === 0 ? (
            <p className="text-xs text-slate-500 font-medium">No wallet transactions yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {wallet.transactions.slice(0, 5).map((txn, idx) => (
                <li key={`${txn.date}-${txn.reference}-${idx}`} className="py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{txn.reference}</p>
                    <p className="text-[11px] text-slate-500 font-medium">{formatDate(txn.date)}</p>
                  </div>
                  <p
                    className={`text-sm font-black shrink-0 ${
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