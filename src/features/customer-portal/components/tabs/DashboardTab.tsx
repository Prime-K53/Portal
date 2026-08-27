import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  Award,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  Gift,
  Landmark,
  Package,
  MessageSquareQuote,
  Receipt,
  ShoppingBag,
  Star,
  Truck,
  Undo2,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import {
  AccountProfile,
  DeliveryNotification,
  Invoice,
  Order,
  PortalAd,
  PortalAdImageMeta,
  StatementEntry,
  TabType,
} from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { usePaymentRequestsData } from '../../hooks/usePortalData';
import { getPaymentRequestStatusLabel, isActivePaymentRequestStatus } from '../../utils/paymentRequest';

interface DashboardTabProps {
  profile: AccountProfile;
  invoices: Invoice[];
  orders: Order[];
  deliveries: DeliveryNotification[];
  statements: StatementEntry[];
  ads: PortalAd[];
  onNavigateTab: (tab: TabType) => void;
  onOpenPaymentModal: () => void;
  onNavigateInvoices?: (filter: 'unpaid' | 'overdue') => void;
}

function tabForCtaTarget(target: string | null): TabType | null {
  if (!target) return null;
  const t = target.toLowerCase();
  if (t.includes('order')) return 'orders';
  if (t.includes('invoice')) return 'invoices';
  if (t.includes('quotation') || t.includes('quote')) return 'quotes';
  if (t.includes('deliver') || t.includes('shipment')) return 'deliveries';
  if (t.includes('statement')) return 'statements';
  if (t.includes('referral')) return 'referrals';
  if (t.includes('account') || t.includes('profile')) return 'account';
  if (t.includes('catalog') || t.includes('product')) return 'orders';
  return null;
}

interface BannerSlide {
  id: string;
  badge: string;
  badgeBg: string;
  title: string;
  subtitle: string;
  extra?: string;
  gradientClass?: string;
  gradientCss?: string;
  imageUrl?: string | null;
  imageMeta?: PortalAdImageMeta | null;
  emoji?: string | null;
  ctaLabel?: string | null;
  onCta?: () => void;
}

const BANNER_ASPECT_RATIO = 4;

const BannerBackground: React.FC<{ slide: BannerSlide }> = ({ slide }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const [isAtLeastWide, setIsAtLeastWide] = useState(() => {
    const meta = slide.imageMeta;
    if (meta && Number.isFinite(meta.width) && Number(meta.width) > 0 && Number(meta.height) > 0) {
      return Number(meta.width) / Number(meta.height) >= BANNER_ASPECT_RATIO;
    }
    return true;
  });

  const gradientLayer = slide.gradientCss ? (
    <div className="absolute inset-0 z-0" style={{ background: slide.gradientCss }} />
  ) : (
    <div
      className={`absolute inset-0 z-0 bg-gradient-to-r ${
        slide.gradientClass ?? 'from-slate-900 via-indigo-950 to-slate-900'
      }`}
    />
  );

  return (
    <>
      {gradientLayer}
      {slide.imageUrl && !imageFailed && (
        <img
          src={slide.imageUrl}
          alt={slide.title}
          onError={() => setImageFailed(true)}
          onLoad={(e) => {
            const { naturalWidth, naturalHeight } = e.currentTarget;
            setIsAtLeastWide(
              naturalHeight > 0 && naturalWidth / naturalHeight >= BANNER_ASPECT_RATIO
            );
          }}
          className={`absolute inset-0 z-0 w-full h-full ${
            isAtLeastWide ? 'object-cover' : 'object-contain'
          }`}
        />
      )}
    </>
  );
};

type IconComponent = React.ComponentType<{ className?: string }>;

const ACTIVITY_TONES: Record<string, { icon: IconComponent; cls: string }> = {
  Payment: { icon: Wallet, cls: 'bg-emerald-50 text-emerald-600' },
  'Credit Note': { icon: Undo2, cls: 'bg-amber-50 text-amber-600' },
};
const ACTIVITY_DEFAULT_TONE = { icon: FileText, cls: 'bg-slate-100 text-slate-600' };

const ORDER_STATUS_STYLES: Record<string, { label: string; dot: string }> = {
  pending: { label: 'Pending', dot: 'bg-amber-500' },
  processing: { label: 'Processing', dot: 'bg-blue-500' },
  confirmed: { label: 'Confirmed', dot: 'bg-indigo-500' },
  shipped: { label: 'Shipped', dot: 'bg-purple-500' },
  delivered: { label: 'Delivered', dot: 'bg-emerald-500' },
  cancelled: { label: 'Cancelled', dot: 'bg-slate-400' },
  draft: { label: 'Draft', dot: 'bg-slate-300' },
  fulfilled: { label: 'Fulfilled', dot: 'bg-emerald-600' },
};

const DELIVERY_STATUS_STYLES: Record<string, { label: string; dot: string }> = {
  order_placed: { label: 'Placed', dot: 'bg-slate-400' },
  processing: { label: 'Processing', dot: 'bg-blue-500' },
  dispatched: { label: 'Dispatched', dot: 'bg-indigo-500' },
  out_for_delivery: { label: 'In Transit', dot: 'bg-purple-500' },
  delivered: { label: 'Delivered', dot: 'bg-emerald-500' },
  delayed: { label: 'Delayed', dot: 'bg-rose-500' },
};

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = now - then;
  if (diffMs < 0) return formatDate(dateStr);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  profile,
  invoices,
  orders,
  deliveries,
  statements,
  ads,
  onNavigateTab,
  onOpenPaymentModal,
  onNavigateInvoices,
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideDirection, setSlideDirection] = useState<'next' | 'prev'>('next');
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [isCarouselPaused, setIsCarouselPaused] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);

  const paymentRequestsQuery = usePaymentRequestsData(true);
  const paymentRequests = paymentRequestsQuery.data ?? [];
  const activePaymentRequest = paymentRequests.find((r) => isActivePaymentRequestStatus(r.status));

  // ── Banner slides ──────────────────────────────────────────────────────
  const bannerSlides: BannerSlide[] = [
    {
      id: 'slide_welcome',
      badge: '👋 WELCOME BACK',
      badgeBg: 'bg-amber-400 text-slate-950',
      title: `Welcome back, ${profile.customerName}`,
      subtitle: `Account ID: ${profile.accountNumber} • ${profile.tier || 'Standard'} Tier`,
      gradientClass: 'from-slate-900 via-indigo-950 to-slate-900',
    },
  ];

  ads.forEach((ad) => {
    const ctaTab = tabForCtaTarget(ad.ctaTarget);
    bannerSlides.push({
      id: `slide_ad_${ad.id}`,
      badge: ad.badge ?? 'PROMOTION',
      badgeBg: 'bg-white/20 text-white backdrop-blur-md',
      title: ad.title || 'Special Offer',
      subtitle: ad.subtitle ?? '',
      gradientCss: ad.gradient ?? undefined,
      imageUrl: ad.imageUrl,
      imageMeta: ad.imageMeta,
      emoji: ad.emoji,
      ctaLabel: ad.ctaLabel,
      onCta: ctaTab ? () => onNavigateTab(ctaTab) : undefined,
    });
  });

  if (deliveries.length > 0) {
    const latest = deliveries[0];
    bannerSlides.push({
      id: 'slide_delivery',
      badge: '🚚 LIVE SHIPMENT UPDATE',
      badgeBg: 'bg-sky-400 text-slate-950',
      title: `Order ${latest.orderId} is ${latest.status === 'delivered' ? 'Delivered' : 'in Transit'}`,
      subtitle: `Tracking #: ${latest.trackingNumber}`,
      extra: latest.estimatedArrival
        ? `Est. Arrival: ${latest.estimatedArrival}${latest.driverName ? ` • Driver: ${latest.driverName}` : ''}`
        : '',
      gradientClass: 'from-slate-950 via-sky-950 to-slate-900',
    });
  }

  useEffect(() => {
    if (isCarouselPaused || bannerSlides.length <= 1) return;
    const timer = setInterval(() => {
      setSlideDirection('next');
      setCurrentSlide((prev) => (prev + 1) % bannerSlides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [bannerSlides.length, isCarouselPaused]);

  const activeSlide = bannerSlides[Math.min(currentSlide, bannerSlides.length - 1)];

  const goNext = () => {
    setSlideDirection('next');
    setCurrentSlide((prev) => (prev + 1) % bannerSlides.length);
  };

  const goPrev = () => {
    setSlideDirection('prev');
    setCurrentSlide((prev) => (prev - 1 + bannerSlides.length) % bannerSlides.length);
  };

  const goToSlide = (target: number) => {
    setSlideDirection(target > currentSlide ? 'next' : 'prev');
    setCurrentSlide(target);
  };

  const dismissAlert = (id: string) => setDismissedAlerts((prev) => [...prev, id]);
  const isAlertDismissed = (id: string) => dismissedAlerts.includes(id);

  const handleTouchStart = (e: React.TouchEvent) => setTouchStartX(e.touches[0].clientX);
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (diff > 40) goNext();
    else if (diff < -40) goPrev();
    setTouchStartX(null);
  };

  // ── Financial data ─────────────────────────────────────────────────────
  const totalPayment = statements.reduce((sum, s) => sum + s.credit, 0);
  const payableInvoices = invoices.filter(
    (i) => i.status === 'unpaid' || i.status === 'overdue' || i.status === 'partially_paid'
  );
  const outstandingTotal = payableInvoices.reduce((sum, i) => sum + i.amountRemaining, 0);
  const isFullyPaid = outstandingTotal === 0;
  const overdueInvoices = invoices.filter((i) => i.status === 'overdue');
  const overdueTotal = overdueInvoices.reduce((sum, i) => sum + i.amountRemaining, 0);

  const dueSoonCutoff = new Date();
  dueSoonCutoff.setDate(dueSoonCutoff.getDate() + 7);
  const dueSoonInvoices = payableInvoices.filter((i) => {
    if (i.status === 'overdue') return false;
    const due = new Date(i.dueDate);
    return !Number.isNaN(due.getTime()) && due.getTime() <= dueSoonCutoff.getTime();
  });

  // Invoice counts by status
  const paidInvoices = invoices.filter((i) => i.status === 'paid');
  const partialInvoices = invoices.filter((i) => i.status === 'partially_paid');

  // ── Active orders (non-terminal) ───────────────────────────────────────
  const activeOrders = orders.filter(
    (o) => !['delivered', 'cancelled', 'fulfilled'].includes(o.status)
  );

  // ── Active deliveries ──────────────────────────────────────────────────
  const activeDeliveries = deliveries.filter((d) => d.status !== 'delivered');

  // ── Recent statements ──────────────────────────────────────────────────
  const seen = new Set<string>();
  const uniqueStatements = statements.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
  const recentStatements = [...uniqueStatements]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  // ── Account snapshot data ──────────────────────────────────────────────
  const availableCredit = (profile.creditLimit || 0) - (profile.currentBalance || 0);
  const hasCreditData = profile.creditLimit > 0;

  return (
    <div className="space-y-5 pb-24 text-slate-900 animate-fade-in">
      {/* ═══ 1. HEADER — Customer Identity ═══════════════════════════════════ */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-black text-slate-900 tracking-tight leading-tight">
            {profile.customerName || 'Account'}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            {profile.accountNumber && (
              <span className="text-xs font-mono font-bold text-slate-500">
                {profile.accountNumber}
              </span>
            )}
            {profile.tier && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-100 to-amber-50/80 border border-amber-200 text-amber-900 text-[10px] font-black shadow-xs">
                <Award className="w-3 h-3 text-amber-600 fill-amber-500" />
                {profile.tier}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => onNavigateTab('account')}
          className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-1 shrink-0"
          aria-label="View profile"
        >
          Profile
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>

      {/* ═══ 2. BANNER — Ads / Live Shipment ═════════════════════════════════ */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseEnter={() => setIsCarouselPaused(true)}
        onMouseLeave={() => setIsCarouselPaused(false)}
        onFocus={() => setIsCarouselPaused(true)}
        onBlur={() => setIsCarouselPaused(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
          if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
        }}
        role="region"
        aria-roledescription="carousel"
        aria-live="polite"
        aria-label="Announcements and account updates"
        tabIndex={bannerSlides.length > 1 ? 0 : -1}
        className="relative overflow-hidden rounded-2xl aspect-[4/1] w-full bg-slate-900 text-white shadow-lg border-0 transition-all duration-500 flex flex-col justify-between group"
      >
        <div
          key={activeSlide.id}
          className={`absolute inset-0 ${slideDirection === 'next' ? 'animate-slide-left' : 'animate-slide-right'}`}
        >
          <BannerBackground slide={activeSlide} />
          <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:14px_14px] z-0" />
          {(activeSlide.title || activeSlide.subtitle || activeSlide.emoji || activeSlide.onCta) && (
            <div className="absolute inset-x-0 inset-y-0 z-10 flex items-center">
              <div className="w-full px-5 sm:px-7 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 sm:gap-5 min-w-0">
                  <div className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg">
                    {activeSlide.emoji ? (
                      <span className="text-2xl sm:text-3xl leading-none">{activeSlide.emoji}</span>
                    ) : (
                      <Star className="w-6 h-6 sm:w-7 sm:h-7 text-white fill-white/80" />
                    )}
                  </div>
                  <div className="space-y-1 min-w-0">
                    {activeSlide.badge && (
                      <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.15em] text-white/70">
                        {activeSlide.badge}
                      </p>
                    )}
                    {activeSlide.title && (
                      <h2 className="text-base sm:text-xl font-black text-white tracking-tight leading-snug drop-shadow-md truncate">
                        {activeSlide.title}
                      </h2>
                    )}
                    {activeSlide.subtitle && (
                      <p className="text-xs sm:text-sm text-white/80 font-medium drop-shadow-sm line-clamp-2">
                        {activeSlide.subtitle}
                      </p>
                    )}
                    {activeSlide.extra && (
                      <p className="text-[11px] sm:text-xs text-amber-300 font-semibold pt-0.5 drop-shadow-sm">
                        {activeSlide.extra}
                      </p>
                    )}
                  </div>
                </div>
                {activeSlide.onCta && activeSlide.ctaLabel && (
                  <button
                    onClick={activeSlide.onCta}
                    className="shrink-0 flex items-center gap-1 text-xs font-black text-white hover:text-white/80 transition-colors"
                  >
                    <span>{activeSlide.ctaLabel}</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        {bannerSlides.length > 1 && (
          <div
            role="tablist"
            aria-label="Slide selector"
            className="hidden lg:flex absolute bottom-2.5 left-1/2 -translate-x-1/2 z-20 gap-1.5"
          >
            {bannerSlides.map((slide, idx) => (
              <button
                key={`dot_${slide.id}`}
                type="button"
                role="tab"
                aria-selected={idx === currentSlide}
                aria-label={`Go to slide ${idx + 1} of ${bannerSlides.length}`}
                onClick={() => goToSlide(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentSlide ? 'w-5 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* ═══ 3. ATTENTION STRIP ═══════════════════════════════════════════════ */}
      {(overdueInvoices.length > 0 || dueSoonInvoices.length > 0 || activePaymentRequest) && (
        <div className="flex flex-wrap gap-2" aria-label="Items needing attention">
          {overdueInvoices.length > 0 && !isAlertDismissed('overdue') && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => onNavigateInvoices?.('overdue')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onNavigateInvoices?.('overdue'); }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold shadow-xs hover:bg-rose-100 transition-colors cursor-pointer"
            >
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                {formatCurrency(overdueTotal)} overdue · {overdueInvoices.length} invoice{overdueInvoices.length === 1 ? '' : 's'}
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); dismissAlert('overdue'); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); dismissAlert('overdue'); } }}
                className="shrink-0 p-0.5 rounded hover:bg-rose-200 text-rose-500 hover:text-rose-700 transition-colors cursor-pointer"
                aria-label="Dismiss overdue alert"
              >
                <X className="w-3 h-3" />
              </span>
            </div>
          )}
          {dueSoonInvoices.length > 0 && !isAlertDismissed('due-soon') && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => onNavigateInvoices?.('unpaid')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onNavigateInvoices?.('unpaid'); }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold shadow-xs hover:bg-amber-100 transition-colors cursor-pointer"
            >
              <CalendarDays className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                {dueSoonInvoices.length} due within 7 days ·{' '}
                {formatCurrency(dueSoonInvoices.reduce((sum, i) => sum + i.amountRemaining, 0))}
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); dismissAlert('due-soon'); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); dismissAlert('due-soon'); } }}
                className="shrink-0 p-0.5 rounded hover:bg-amber-200 text-amber-500 hover:text-amber-700 transition-colors cursor-pointer"
                aria-label="Dismiss due soon alert"
              >
                <X className="w-3 h-3" />
              </span>
            </div>
          )}
          {activePaymentRequest && !isAlertDismissed('payment-request') && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => onNavigateTab('invoices')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onNavigateTab('invoices'); }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 text-xs font-bold shadow-xs hover:bg-sky-100 transition-colors cursor-pointer"
            >
              <Landmark className="w-4 h-4 text-sky-600 shrink-0" />
              <span>
                Payment request {activePaymentRequest.requestNumber} ·{' '}
                {getPaymentRequestStatusLabel(activePaymentRequest.status)}
                {activePaymentRequest.requestedAmount > 0 && ` · ${formatCurrency(activePaymentRequest.requestedAmount)}`}
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); dismissAlert('payment-request'); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); dismissAlert('payment-request'); } }}
                className="shrink-0 p-0.5 rounded hover:bg-sky-200 text-sky-500 hover:text-sky-700 transition-colors cursor-pointer"
                aria-label="Dismiss payment request alert"
              >
                <X className="w-3 h-3" />
              </span>
            </div>
          )}
        </div>
      )}

      {/* ═══ 4. FINANCIAL SUMMARY — Account Balance ═══════════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-4 pt-4 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex p-1.5 rounded-lg bg-slate-100" aria-hidden="true">
              <Landmark className="w-4 h-4 text-slate-600" />
            </span>
            <h3 className="text-sm font-black text-slate-900 tracking-tight">Account Balance</h3>
          </div>
          {invoices.length > 0 && (
            <button
              type="button"
              onClick={() => onNavigateTab('invoices')}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 transition-colors"
            >
              View invoices <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="px-4 pb-4">
          {isFullyPaid && invoices.length === 0 ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-1.5" />
              <p className="text-sm font-bold text-slate-700">No outstanding balance</p>
              <p className="text-xs text-slate-500">You're all caught up.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {/* Outstanding */}
              <button
                type="button"
                onClick={() => onNavigateInvoices?.('unpaid')}
                className="text-left p-3 rounded-xl bg-amber-50 border border-amber-200/80 hover:border-amber-300 hover:shadow-sm transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                aria-label={`Outstanding balance ${formatCurrency(outstandingTotal)}`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1">Outstanding</p>
                <p className="text-base sm:text-lg font-extrabold font-mono text-amber-950 leading-tight">
                  {formatCurrency(outstandingTotal)}
                </p>
                <p className="text-[10px] text-amber-700 font-medium mt-0.5">
                  {isFullyPaid ? 'No unpaid balance' : `${payableInvoices.length} open`}
                </p>
              </button>

              {/* Total Paid */}
              <div className="text-left p-3 rounded-xl bg-emerald-50 border border-emerald-200/80">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1">Total Paid</p>
                <p className="text-base sm:text-lg font-extrabold font-mono text-emerald-900 leading-tight">
                  {formatCurrency(totalPayment)}
                </p>
                <p className="text-[10px] text-emerald-700 font-medium mt-0.5">
                  {paidInvoices.length} invoice{paidInvoices.length === 1 ? '' : 's'}
                </p>
              </div>

              {/* Invoice Count */}
              <button
                type="button"
                onClick={() => onNavigateTab('invoices')}
                className="text-left p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                aria-label={`${invoices.length} total invoices`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Invoices</p>
                <p className="text-base sm:text-lg font-extrabold font-mono text-slate-900 leading-tight">
                  {invoices.length}
                </p>
                <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                  {overdueInvoices.length > 0 && (
                    <span className="text-rose-600 font-bold">{overdueInvoices.length} overdue</span>
                  )}
                  {overdueInvoices.length === 0 && partialInvoices.length > 0 && (
                    <span className="text-amber-600">{partialInvoices.length} partial</span>
                  )}
                  {overdueInvoices.length === 0 && partialInvoices.length === 0 && 'All time'}
                </p>
              </button>
            </div>
          )}
        </div>

        {/* Credit utilization — only when meaningful */}
        {hasCreditData && outstandingTotal > 0 && (
          <div className="px-4 pb-4">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              <span>Credit Utilization</span>
              <span>{Math.round(((profile.currentBalance ?? 0) / profile.creditLimit) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  (profile.currentBalance ?? 0) >= profile.creditLimit
                    ? 'bg-rose-500'
                    : (profile.currentBalance ?? 0) / profile.creditLimit > 0.8
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, ((profile.currentBalance ?? 0) / profile.creditLimit) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ═══ 5. QUICK ACTIONS — compact list cards ═══════════════════════════ */}
      <div className="space-y-3">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2.5 px-0.5">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            {
              key: 'pay',
              label: 'Pay Invoice',
              count: payableInvoices.length,
              icon: CreditCard,
              chip: 'bg-blue-50 text-blue-600 group-hover:bg-blue-100',
              go: onOpenPaymentModal,
            },
            {
              key: 'order',
              label: 'New Order',
              count: null,
              icon: ShoppingBag,
              chip: 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100',
              go: () => onNavigateTab('orders'),
            },
            {
              key: 'quote',
              label: 'Get Quote',
              count: null,
              icon: MessageSquareQuote,
              chip: 'bg-purple-50 text-purple-600 group-hover:bg-purple-100',
              go: () => onNavigateTab('quotes'),
            },
            {
              key: 'track',
              label: 'Track',
              count: deliveries.length,
              icon: Truck,
              chip: 'bg-sky-50 text-sky-600 group-hover:bg-sky-100',
              go: () => onNavigateTab('deliveries'),
            },
            {
              key: 'refer',
              label: 'Refer',
              count: null,
              icon: Gift,
              chip: 'bg-amber-50 text-amber-600 group-hover:bg-amber-100',
              go: () => onNavigateTab('referrals'),
            },
            {
              key: 'stmts',
              label: 'Statements',
              count: statements.length > 0 ? statements.length : null,
              icon: Receipt,
              chip: 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100',
              go: () => onNavigateTab('statements'),
            },
          ].map(({ key, label, count, icon: Icon, chip, go }) => (
            <button
              key={key}
              type="button"
              onClick={go}
              aria-label={count !== null ? `${label} (${count})` : label}
              className="group px-2.5 py-2 bg-white border border-slate-200/80 rounded-xl hover:border-slate-300 hover:shadow-sm transition-all flex items-center gap-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 min-w-0"
            >
              <span className={`shrink-0 p-1.5 rounded-lg transition-colors ${chip}`} aria-hidden="true">
                <Icon className="w-3.5 h-3.5" />
              </span>
              <span className="flex-1 min-w-0 text-[11.5px] font-bold text-slate-700 group-hover:text-slate-900 transition-colors truncate text-left">
                {label}
              </span>
              {count !== null && count > 0 && (
                <span className="shrink-0 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-slate-900 text-white text-[9px] font-black min-w-[16px]">
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ 6. ACTIVE ORDERS ═════════════════════════════════════════════════ */}
      {activeOrders.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2.5 px-0.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex p-1.5 rounded-lg bg-indigo-50" aria-hidden="true">
                <Package className="w-4 h-4 text-indigo-600" />
              </span>
              <h3 className="text-sm font-black text-slate-900 tracking-tight">Active Orders</h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('orders')}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 transition-colors"
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            {activeOrders.slice(0, 3).map((order) => {
              const status = ORDER_STATUS_STYLES[order.status] ?? { label: order.status, dot: 'bg-slate-400' };
              return (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => onNavigateTab('orders')}
                  className="w-full flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200/80 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${status.dot}`} aria-hidden="true" />
                    <div className="min-w-0 text-left">
                      <p className="text-xs font-bold text-slate-900 font-mono truncate group-hover:text-blue-600 transition-colors">
                        {order.orderNumber}
                      </p>
                      <p className="text-[11px] text-slate-500 font-medium">
                        {order.items.length} item{order.items.length === 1 ? '' : 's'}
                        {order.estimatedDelivery && ` · Est. ${formatDate(order.estimatedDelivery)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-bold text-slate-500">{status.label}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ 7. ACTIVE DELIVERIES ═════════════════════════════════════════════ */}
      {activeDeliveries.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2.5 px-0.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex p-1.5 rounded-lg bg-sky-50" aria-hidden="true">
                <Truck className="w-4 h-4 text-sky-600" />
              </span>
              <h3 className="text-sm font-black text-slate-900 tracking-tight">Shipments in Progress</h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('deliveries')}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 transition-colors"
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            {activeDeliveries.slice(0, 3).map((d) => {
              const status = DELIVERY_STATUS_STYLES[d.status] ?? { label: d.status, dot: 'bg-slate-400' };
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onNavigateTab('deliveries')}
                  className="w-full flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200/80 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${status.dot}`} aria-hidden="true" />
                    <div className="min-w-0 text-left">
                      <p className="text-xs font-bold text-slate-900 font-mono truncate group-hover:text-blue-600 transition-colors">
                        {d.trackingNumber}
                      </p>
                      <p className="text-[11px] text-slate-500 font-medium">
                        {d.title || `Order ${d.orderId}`}
                        {d.estimatedArrival && ` · ETA ${d.estimatedArrival}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-bold text-slate-500">{status.label}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ 8. RECENT ACTIVITY ═══════════════════════════════════════════════ */}
      <div>
        <div className="flex items-center justify-between mb-2.5 px-0.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex p-1.5 rounded-lg bg-amber-50" aria-hidden="true">
              <Activity className="w-4 h-4 text-amber-600" />
            </span>
            <h3 className="text-sm font-black text-slate-900 tracking-tight">Recent Activity</h3>
          </div>
          {recentStatements.length > 0 && (
            <button
              type="button"
              onClick={() => onNavigateTab('statements')}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 transition-colors"
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {recentStatements.length === 0 ? (
          <div className="px-4 py-6 text-center border border-dashed border-slate-200 rounded-xl">
            <Activity className="w-6 h-6 mx-auto stroke-1 text-slate-300 mb-1.5" />
            <p className="text-xs font-bold text-slate-600">No activity yet</p>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              Invoices, payments and orders will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {recentStatements.map((st) => {
              const tone = ACTIVITY_TONES[st.type] ?? ACTIVITY_DEFAULT_TONE;
              const ToneIcon = tone.icon;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => onNavigateTab('statements')}
                  aria-label={`${st.type} ${st.reference}: ${st.description}. View statements.`}
                  className="w-full flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200/80 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer group"
                >
                  <span className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${tone.cls}`} aria-hidden="true">
                    <ToneIcon className="w-3.5 h-3.5" />
                  </span>
                  <span className="flex-1 min-w-0 text-left">
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-[11px] text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                        {st.reference}
                      </span>
                      <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase">
                        {st.type}
                      </span>
                    </span>
                    <span className="block text-[11px] text-slate-500 font-medium line-clamp-1 mt-0.5">
                      {st.description}
                    </span>
                  </span>
                  <span className="text-right shrink-0 flex flex-col items-end gap-0.5">
                    <span className="text-xs font-black tabular-nums">
                      {st.debit > 0 ? (
                        <span className="text-slate-900">+{formatCurrency(st.debit)}</span>
                      ) : (
                        <span className="text-emerald-600">-{formatCurrency(st.credit)}</span>
                      )}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium tabular-nums">
                      {timeAgo(st.date)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ 9. ACCOUNT SNAPSHOT ═══════════════════════════════════════════════ */}
      {hasCreditData && (
        <div>
          <div className="flex items-center justify-between mb-2.5 px-0.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex p-1.5 rounded-lg bg-slate-100" aria-hidden="true">
                <Wallet className="w-4 h-4 text-slate-600" />
              </span>
              <h3 className="text-sm font-black text-slate-900 tracking-tight">Account Snapshot</h3>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 divide-y divide-slate-100">
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs text-slate-500 font-medium">Credit limit</span>
              <span className="text-xs font-black text-slate-900 tabular-nums">{formatCurrency(profile.creditLimit)}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs text-slate-500 font-medium">Available credit</span>
              <span className={`text-xs font-black tabular-nums ${availableCredit > 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                {formatCurrency(availableCredit)}
              </span>
            </div>
            {profile.tier && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-xs text-slate-500 font-medium">Customer tier</span>
                <span className="text-xs font-black text-slate-900">{profile.tier}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
