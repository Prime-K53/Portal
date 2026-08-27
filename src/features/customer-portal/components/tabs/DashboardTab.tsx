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
import { AccountProfile, DeliveryNotification, Invoice, PortalAd, PortalAdImageMeta, StatementEntry, TabType } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { usePaymentRequestsData } from '../../hooks/usePortalData';
import { getPaymentRequestStatusLabel, isActivePaymentRequestStatus } from '../../utils/paymentRequest';

interface DashboardTabProps {
  profile: AccountProfile;
  invoices: Invoice[];
  deliveries: DeliveryNotification[];
  statements: StatementEntry[];
  /** ERP banner ads (GET /portal/ads) — displayed as carousel slides. */
  ads: PortalAd[];
  onNavigateTab: (tab: TabType) => void;
  onOpenPaymentModal: () => void;
  /**
   * Navigates to the invoices tab with a preset list filter (e.g. from the
   * Overdue / Outstanding KPI cards).
   */
  onNavigateInvoices?: (filter: 'unpaid' | 'overdue') => void;
}

/**
 * Maps an ERP ad CTA target (e.g. "/portal/orders") to a Sasa tab. Unknown
 * targets yield null — the slide renders without a CTA rather than navigating
 * to the wrong screen.
 */
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
  /** Tailwind gradient utility classes (Sasa-built slides). */
  gradientClass?: string;
  /** Full CSS gradient string from the ERP ad record (e.g. linear-gradient(...)). */
  gradientCss?: string;
  imageUrl?: string | null;
  /** ERP pipeline asset metadata (dimensions of the actual stored banner). */
  imageMeta?: PortalAdImageMeta | null;
  emoji?: string | null;
  ctaLabel?: string | null;
  onCta?: () => void;
}

/** Canonical banner aspect ratio — the ERP artwork is displayed at 4:1. */
const BANNER_ASPECT_RATIO = 4;

/**
 * Banner backdrop. The ERP gradient (or default Sasa gradient) always renders
 * behind the artwork so a slow/failed image never shows a blank or broken
 * region, and the 4:1 container height is reserved before the image arrives
 * (no dashboard layout shift).
 *
 * Image fitting is intrinsic-ratio aware so artwork is NEVER stretched:
 *  - ratio >= 4:1 (correct 1600×400 or wider) → object-cover fills the banner;
 *  - ratio < 4:1 (legacy square/tall uploads) → object-contain shows the full
 *    image undistorted, with the gradient visible in the letterbox.
 * A malformed/failed image URL silently falls back to the gradient instead of
 * breaking the dashboard.
 */
const BannerBackground: React.FC<{ slide: BannerSlide }> = ({ slide }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const [isAtLeastWide, setIsAtLeastWide] = useState(() => {
    // Decide the initial fit from the ERP pipeline metadata (no flash of the
    // wrong fit, no runtime probe needed for prepared assets). Legacy banners
    // without metadata default to cover and correct themselves on load.
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

/** Shared dashboard section header — tinted icon chip + title (+ subtitle / action). */
const SectionHeader: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  iconChipClass: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}> = ({ icon: Icon, iconChipClass, title, subtitle, action }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="flex items-center gap-2.5 min-w-0">
      <span className={`shrink-0 inline-flex p-1.5 rounded-lg ${iconChipClass}`} aria-hidden="true">
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-black text-slate-900 tracking-tight leading-tight">{title}</h3>
        {subtitle && (
          <p className="text-[11px] text-slate-400 font-medium -mt-0.5 truncate">{subtitle}</p>
        )}
      </div>
    </div>
    {action}
  </div>
);

type IconComponent = React.ComponentType<{ className?: string }>;

/** Visual treatment per ledger entry type in the Recent Activity feed. */
const ACTIVITY_TONES: Record<string, { icon: IconComponent; cls: string }> = {
  Payment: { icon: Wallet, cls: 'bg-emerald-50 text-emerald-600' },
  'Credit Note': { icon: Undo2, cls: 'bg-amber-50 text-amber-600' },
};
const ACTIVITY_DEFAULT_TONE = { icon: FileText, cls: 'bg-slate-100 text-slate-600' };

export const DashboardTab: React.FC<DashboardTabProps> = ({
  profile,
  invoices,
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
  /** Desktop pause-on-hover for the auto-rotating banner. */
  const [isCarouselPaused, setIsCarouselPaused] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);

  // Active payment requests (GET /portal/payment-requests) — surfaces the
  // "under review" chip. In mock/dev mode the query errors and stays hidden.
  const paymentRequestsQuery = usePaymentRequestsData(true);
  const paymentRequests = paymentRequestsQuery.data ?? [];
  const activePaymentRequest = paymentRequests.find((r) => isActivePaymentRequestStatus(r.status));

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

  // Real ERP advertisements (GET /portal/ads) — rendered exactly as the ERP
  // serves them: real image when provided, otherwise the ERP gradient/emoji
  // presentation. No hardcoded or placeholder ad content.
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

  // The live-shipment slide only renders with real ERP shipment data.
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
    // Auto-rotate unless the desktop user is hovering/focusing the carousel,
    // or there is nothing to rotate.
    if (isCarouselPaused || bannerSlides.length <= 1) return;
    const timer = setInterval(() => {
      setSlideDirection('next');
      setCurrentSlide((prev) => (prev + 1) % bannerSlides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [bannerSlides.length, isCarouselPaused]);

  // Clamp so a change in slide count (ads loading/refetch) never indexes past
  // the array and crashes the carousel.
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

  const dismissAlert = (id: string) => {
    setDismissedAlerts((prev) => [...prev, id]);
  };

  const isAlertDismissed = (id: string) => dismissedAlerts.includes(id);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (diff > 40) {
      // Swipe left -> Next slide
      goNext();
    } else if (diff < -40) {
      // Swipe right -> Prev slide
      goPrev();
    }
    setTouchStartX(null);
  };

  // ── Financial snapshot (invoices are the source of truth) ─────────────────
  const totalPayment = statements.reduce((sum, s) => sum + s.credit, 0);
  const payableInvoices = invoices.filter(
    (i) => i.status === 'unpaid' || i.status === 'overdue' || i.status === 'partially_paid'
  );
  const outstandingTotal = payableInvoices.reduce((sum, i) => sum + i.amountRemaining, 0);
  const isFullyPaid = outstandingTotal === 0;

  // Overdue: past their due date per ERP status.
  const overdueInvoices = invoices.filter((i) => i.status === 'overdue');
  const overdueTotal = overdueInvoices.reduce((sum, i) => sum + i.amountRemaining, 0);

  // Due soon: still payable and due within the next 7 days (not already overdue).
  const dueSoonCutoff = new Date();
  dueSoonCutoff.setDate(dueSoonCutoff.getDate() + 7);
  const dueSoonInvoices = payableInvoices.filter((i) => {
    if (i.status === 'overdue') return false;
    const due = new Date(i.dueDate);
    return !Number.isNaN(due.getTime()) && due.getTime() <= dueSoonCutoff.getTime();
  });

  const seen = new Set<string>();
  const uniqueStatements = statements.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
  const recentStatements = [...uniqueStatements]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 4);

  return (
    <div className="space-y-6 pb-24 text-slate-900 animate-fade-in">
      {/* 1. Header Profile & Partner Badge */}
      <div className="space-y-1">
        {/* Title and View Profile Button */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <h1 className="text-lg font-black text-slate-900 tracking-tight">
                {profile.customerName || 'Account'}
              </h1>
              {profile.accountNumber && (
                <p className="text-xs font-medium text-slate-600 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-slate-800">Customer ID: {profile.accountNumber}</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-100 to-amber-50/80 border border-amber-200 text-amber-900 text-[10px] font-black shadow-xs">
                    <Award className="w-3 h-3 text-amber-600 fill-amber-500" />
                    <span>{profile.tier || 'Standard'}</span>
                  </span>
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onNavigateTab('account')}
              className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-black rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 shrink-0"
            >
              <span>View Profile</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Credit utilization bar — hidden until a balance is actually drawn */}
        {profile.creditLimit > 0 && (profile.currentBalance ?? 0) > 0 && (
          <div className="mt-1.5">
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

      {/* 2. Interactive Sliding Banner (real data slides — no hardcoded ad images) */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseEnter={() => setIsCarouselPaused(true)}
        onMouseLeave={() => setIsCarouselPaused(false)}
        onFocus={() => setIsCarouselPaused(true)}
        onBlur={() => setIsCarouselPaused(false)}
        onKeyDown={(e) => {
          // Desktop keyboard navigation for the carousel.
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
        {/* Slide Content — keyed so it remounts and slides in on every slide change */}
        <div
          key={activeSlide.id}
          className={`absolute inset-0 ${slideDirection === 'next' ? 'animate-slide-left' : 'animate-slide-right'}`}
        >
          {/* Banner Background — real ERP image when provided, otherwise the
              ERP ad's CSS gradient, otherwise the default Sasa gradient. Never
              a placeholder/stock image. The artwork always fills the reserved
              4:1 space without stretching (see BannerBackground). */}
          <BannerBackground slide={activeSlide} />

          {/* Texture overlay */}
          <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:14px_14px] z-0" />

          {/* Main Slide Content */}
          {(activeSlide.title || activeSlide.subtitle || activeSlide.emoji || activeSlide.onCta) && (
            <div className="absolute inset-x-0 inset-y-0 z-10 flex items-center">
              <div className="w-full px-5 sm:px-7 flex items-center justify-between gap-4">
                {/* Left: Icon + Text */}
                <div className="flex items-center gap-3.5 sm:gap-5 min-w-0">
                  {/* Icon Box */}
                  <div className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg">
                    {activeSlide.emoji ? (
                      <span className="text-2xl sm:text-3xl leading-none">{activeSlide.emoji}</span>
                    ) : (
                      <Star className="w-6 h-6 sm:w-7 sm:h-7 text-white fill-white/80" />
                    )}
                  </div>

                  {/* Text Content */}
                  <div className="space-y-1 min-w-0">
                    {/* Badge/Label */}
                    {activeSlide.badge && (
                      <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.15em] text-white/70">
                        {activeSlide.badge}
                      </p>
                    )}

                    {/* Title */}
                    {activeSlide.title && (
                      <h2 className="text-base sm:text-xl font-black text-white tracking-tight leading-snug drop-shadow-md truncate">
                        {activeSlide.title}
                      </h2>
                    )}

                    {/* Subtitle */}
                    {activeSlide.subtitle && (
                      <p className="text-xs sm:text-sm text-white/80 font-medium drop-shadow-sm line-clamp-2">
                        {activeSlide.subtitle}
                      </p>
                    )}

                    {/* Extra Info */}
                    {activeSlide.extra && (
                      <p className="text-[11px] sm:text-xs text-amber-300 font-semibold pt-0.5 drop-shadow-sm">
                        {activeSlide.extra}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: CTA Button */}
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

      {/* 3. Needs Attention Strip — actionable finance alerts (hidden when clear) */}
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
                {dueSoonInvoices.length} invoice{dueSoonInvoices.length === 1 ? '' : 's'} due within 7 days ·{' '}
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

      {/* 4. KPI Mini Cards — invoice-authoritative totals, click to drill in */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {/* Outstanding Summary Card */}
          <button
            type="button"
            onClick={() => onNavigateInvoices?.('unpaid')}
            aria-label={`Outstanding balance ${formatCurrency(outstandingTotal)}. View open invoices.`}
            className="text-left bg-amber-50/80 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 border border-amber-200/80 space-y-0.5 sm:space-y-1 hover:border-amber-300 hover:shadow-md transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <div className="flex items-center justify-between text-amber-800">
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Outstanding</span>
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600" />
                <ChevronRight className="w-3 h-3 text-amber-400 hidden sm:block" />
              </div>
            </div>
            <p className="text-xl sm:text-3xl font-extrabold font-mono text-amber-950">
              {formatCurrency(outstandingTotal)}
            </p>
            <p className="text-[10px] sm:text-[11px] text-amber-700 font-medium">
              {isFullyPaid ? 'No Unpaid Balance' : `${payableInvoices.length} Open Invoice${payableInvoices.length === 1 ? '' : 's'}`}
            </p>
          </button>

          {/* Total Payment Summary Card */}
          <button
            type="button"
            onClick={() => onNavigateTab('statements')}
            aria-label={`Total paid ${formatCurrency(totalPayment)}. View statements.`}
            className={`text-left rounded-xl sm:rounded-2xl p-2.5 sm:p-4 border transition-all duration-300 space-y-0.5 sm:space-y-1 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              isFullyPaid
                ? 'bg-emerald-900 text-white border-emerald-700 shadow-md'
                : 'bg-slate-900 text-white border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-300">
              <div className="flex items-center gap-1">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Total Paid</span>
                <ChevronRight className="w-3 h-3 text-slate-400 hidden sm:block" />
              </div>
              <CheckCircle2
                className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isFullyPaid ? 'text-emerald-400' : 'text-amber-400'}`}
              />
            </div>
            <p className="text-xl sm:text-3xl font-extrabold font-mono text-white">
              {formatCurrency(totalPayment)}
            </p>
            <p
              className={`text-[10px] sm:text-[11px] ${isFullyPaid ? 'text-emerald-300 font-bold' : 'text-slate-400'}`}
            >
              {isFullyPaid ? 'Fully Settled ✓' : 'All-time Payments Recorded'}
            </p>
          </button>
        </div>
      </div>

      {/* 5. Quick Actions — small list cards in a 3×2 grid */}
      <div className="space-y-3">
        <SectionHeader
          icon={Zap}
          iconChipClass="bg-indigo-50 text-indigo-600"
          title="Quick Actions"
          subtitle="Common tasks in one tap"
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            {
              key: 'pay',
              label: 'Pay Invoices',
              icon: CreditCard,
              chip: 'bg-blue-50 text-blue-600 group-hover:bg-blue-100',
              go: onOpenPaymentModal,
            },
            {
              key: 'order',
              label: 'New Order',
              icon: ShoppingBag,
              chip: 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100',
              go: () => onNavigateTab('orders'),
            },
            {
              key: 'quote',
              label: 'Get Quote',
              icon: MessageSquareQuote,
              chip: 'bg-purple-50 text-purple-600 group-hover:bg-purple-100',
              go: () => onNavigateTab('quotes'),
            },
            {
              key: 'track',
              label: 'Track Shipments',
              icon: Truck,
              chip: 'bg-sky-50 text-sky-600 group-hover:bg-sky-100',
              go: () => onNavigateTab('deliveries'),
            },
            {
              key: 'refer',
              label: 'Refer Business',
              icon: Gift,
              chip: 'bg-amber-50 text-amber-600 group-hover:bg-amber-100',
              go: () => onNavigateTab('referrals'),
            },
            {
              key: 'stmts',
              label: 'Statements',
              icon: Receipt,
              chip: 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100',
              go: () => onNavigateTab('statements'),
            },
          ].map(({ key, label, icon: Icon, chip, go }) => (
            <button
              key={key}
              type="button"
              onClick={go}
              aria-label={label}
              className="group px-2.5 py-2 bg-white border border-slate-200/80 rounded-xl hover:border-slate-300 hover:shadow-sm transition-all flex items-center gap-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 min-w-0"
            >
              <span className={`shrink-0 p-1.5 rounded-lg transition-colors ${chip}`} aria-hidden="true">
                <Icon className="w-3.5 h-3.5" />
              </span>
              <span className="flex-1 min-w-0 text-[11.5px] font-bold text-slate-700 group-hover:text-slate-900 transition-colors truncate text-left">
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 6. Recent Activity — ledger feed */}
      <div className="space-y-3">
        <SectionHeader
          icon={Activity}
          iconChipClass="bg-amber-50 text-amber-600"
          title="Recent Activity"
          subtitle="Latest ledger entries"
          action={
            <button
              type="button"
              onClick={() => onNavigateTab('statements')}
              className="inline-flex shrink-0 items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:text-slate-900 hover:border-slate-300 transition-colors"
            >
              View All
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          }
        />

        {recentStatements.length === 0 ? (
          /* Empty state — no ledger entries yet */
          <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center space-y-2 shadow-md">
            <Activity className="w-8 h-8 mx-auto stroke-1 text-slate-300" />
            <p className="font-bold text-sm text-slate-700">No recent activity</p>
            <p className="text-xs text-slate-500 font-medium">
              Ledger entries will appear here once financial activity is recorded.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {recentStatements.map((st) => {
              const tone = ACTIVITY_TONES[st.type] ?? ACTIVITY_DEFAULT_TONE;
              const ToneIcon = tone.icon;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => onNavigateTab('statements')}
                  aria-label={`${st.type} ${st.reference}: ${st.description}. View statements.`}
                  className="w-full text-left bg-white rounded-2xl border border-slate-200/80 p-4 shadow-md hover:border-slate-300 hover:shadow-lg transition-all cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <div className="flex items-center gap-3">
                    {/* Type icon */}
                    <span
                      className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${tone.cls}`}
                      aria-hidden="true"
                    >
                      <ToneIcon className="w-4 h-4" />
                    </span>

                    {/* Reference, type + description + date */}
                    <span className="flex-1 min-w-0 space-y-0.5">
                      <span className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                          {st.reference}
                        </span>
                        <span className="shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500">
                          {st.type}
                        </span>
                      </span>
                      <span className="block text-xs text-slate-600 font-medium line-clamp-1">
                        {st.description}
                      </span>
                      <span className="block text-[11px] text-slate-400 font-medium">
                        {formatDate(st.date)}
                      </span>
                    </span>

                    {/* Amount + balance */}
                    <span className="text-right shrink-0 flex items-center gap-1.5">
                      <span className="block font-medium">
                        {st.debit > 0 ? (
                          <span className="text-xs font-black text-slate-900 block tabular-nums">
                            +{formatCurrency(st.debit)}
                          </span>
                        ) : (
                          <span className="text-xs font-black text-emerald-600 block tabular-nums">
                            -{formatCurrency(st.credit)}
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400 block font-medium tabular-nums">
                          Bal: {formatCurrency(st.balance)}
                        </span>
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

