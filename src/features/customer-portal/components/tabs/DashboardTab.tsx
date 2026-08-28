import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  FileText,
  Gift,
  MessageSquareQuote,
  MoreHorizontal,
  Receipt,
  ShoppingBag,
  Star,
  Truck,
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
import { formatCurrency, formatCurrencyCompact, formatDate } from '../../utils/formatters';

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

const ORDER_STATUS_STYLES: Record<string, { label: string; dot: string; bg: string }> = {
  pending: { label: 'Pending', dot: 'bg-amber-500', bg: 'bg-amber-50 text-amber-700' },
  processing: { label: 'Processing', dot: 'bg-blue-500', bg: 'bg-blue-50 text-blue-700' },
  confirmed: { label: 'Confirmed', dot: 'bg-indigo-500', bg: 'bg-indigo-50 text-indigo-700' },
  shipped: { label: 'Shipped', dot: 'bg-purple-500', bg: 'bg-purple-50 text-purple-700' },
  delivered: { label: 'Delivered', dot: 'bg-emerald-500', bg: 'bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'Cancelled', dot: 'bg-slate-400', bg: 'bg-slate-100 text-slate-600' },
  draft: { label: 'Draft', dot: 'bg-slate-300', bg: 'bg-slate-50 text-slate-500' },
  fulfilled: { label: 'Fulfilled', dot: 'bg-emerald-600', bg: 'bg-emerald-50 text-emerald-700' },
};

const DELIVERY_STATUS_STYLES: Record<string, { label: string; dot: string; bg: string }> = {
  order_placed: { label: 'Placed', dot: 'bg-slate-400', bg: 'bg-slate-100 text-slate-600' },
  processing: { label: 'Processing', dot: 'bg-blue-500', bg: 'bg-blue-50 text-blue-700' },
  dispatched: { label: 'Dispatched', dot: 'bg-indigo-500', bg: 'bg-indigo-50 text-indigo-700' },
  out_for_delivery: { label: 'In Transit', dot: 'bg-purple-500', bg: 'bg-purple-50 text-purple-700' },
  delivered: { label: 'Delivered', dot: 'bg-emerald-500', bg: 'bg-emerald-50 text-emerald-700' },
  delayed: { label: 'Delayed', dot: 'bg-rose-500', bg: 'bg-rose-50 text-rose-700' },
};

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

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDateTimeShort(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatDate(dateStr)}, ${formatTime(dateStr)}`;
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
  // ── Banner carousel state ────────────────────────────────────────────
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideDirection, setSlideDirection] = useState<'next' | 'prev'>('next');
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [isCarouselPaused, setIsCarouselPaused] = useState(false);

  // ── Data derivations ──────────────────────────────────────────────────
  const overdueInvoices = invoices.filter((i) => i.status === 'overdue');
  const unpaidInvoices = invoices.filter((i) => i.status === 'unpaid' || i.status === 'overdue' || i.status === 'partially_paid');
  const paidInvoices = invoices.filter((i) => i.status === 'paid');
  const draftInvoices = invoices.filter((i) => i.status === 'draft');

  const outstandingTotal = unpaidInvoices.reduce((sum, i) => sum + i.amountRemaining, 0);
  const totalPayment = statements.reduce((sum, s) => sum + s.credit, 0);

  // Active orders (non-terminal)
  const activeOrders = orders.filter(
    (o) => !['delivered', 'cancelled', 'fulfilled'].includes(o.status)
  );

  // Recent statements for activity
  const seen = new Set<string>();
  const uniqueStatements = statements.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
  const recentStatements = [...uniqueStatements]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 4);

  // ── Banner slides ──────────────────────────────────────────────────────
  const bannerSlides: BannerSlide[] = [
    {
      id: 'slide_welcome',
      badge: 'WELCOME BACK',
      badgeBg: 'bg-white/20 text-white backdrop-blur-md',
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
      badge: 'LIVE SHIPMENT UPDATE',
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

  const handleTouchStart = (e: React.TouchEvent) => setTouchStartX(e.touches[0].clientX);
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (diff > 40) goNext();
    else if (diff < -40) goPrev();
    setTouchStartX(null);
  };

  // Quick actions — 4 primary + 4 secondary, matching reference layout
  const quickActions = [
    { key: 'pay', label: 'Pay', icon: CreditCard, chip: 'bg-blue-50 text-blue-600', go: onOpenPaymentModal },
    { key: 'order', label: 'Order', icon: ShoppingBag, chip: 'bg-emerald-50 text-emerald-600', go: () => onNavigateTab('orders') },
    { key: 'quote', label: 'Quote', icon: MessageSquareQuote, chip: 'bg-purple-50 text-purple-600', go: () => onNavigateTab('quotes') },
    { key: 'track', label: 'Track', icon: Truck, chip: 'bg-sky-50 text-sky-600', go: () => onNavigateTab('deliveries') },
    { key: 'profile', label: 'Profile', icon: Star, chip: 'bg-rose-50 text-rose-600', go: () => onNavigateTab('account') },
    { key: 'stmts', label: 'Statements', icon: Receipt, chip: 'bg-indigo-50 text-indigo-600', go: () => onNavigateTab('statements') },
    { key: 'refer', label: 'Refer', icon: Gift, chip: 'bg-amber-50 text-amber-600', go: () => onNavigateTab('referrals') },
    { key: 'more', label: 'More', icon: MoreHorizontal, chip: 'bg-slate-100 text-slate-600', go: () => onNavigateTab('account') },
  ];

  const isFullyPaid = outstandingTotal === 0;

  return (
    <div className="space-y-4 sm:space-y-5 pb-24 text-slate-900 animate-fade-in">

      {/* ═══ 1. HEADER — Company Identity ═══════════════════════════════════ */}
      <div className="flex items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <span className="text-sm font-black tracking-tight">
              {profile.companyName?.substring(0, 2).toUpperCase() || 'PE'}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-tight truncate">
              {profile.companyName || profile.customerName || 'Account'}
            </h1>
            <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 min-w-0">
              {profile.accountNumber && (
                <span className="text-[10px] sm:text-xs text-slate-500 font-medium truncate">
                  ID: <span className="font-bold text-slate-700">{profile.accountNumber}</span>
                </span>
              )}
              {profile.tier && (
                <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[9px] sm:text-[10px] font-bold shrink-0">
                  {profile.tier}
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => onNavigateTab('account')}
          className="px-3 sm:px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-bold rounded-xl shadow-sm hover:shadow active:scale-95 transition-all flex items-center gap-1 shrink-0 min-h-[44px]"
        >
          <span className="hidden sm:inline">View Profile</span>
          <span className="sm:hidden">Profile</span>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* ═══ 2. AD BANNER CAROUSEL ════════════════════════════════════════════ */}
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
        className="relative overflow-hidden rounded-2xl aspect-[2.6/1] bg-slate-900 text-white shadow-lg border-0 transition-all duration-500 flex flex-col justify-between group"
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
          <>
            <button
              onClick={goPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Previous slide"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
            </button>
            <button
              onClick={goNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Next slide"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div
              role="tablist"
              aria-label="Slide selector"
              className="flex absolute bottom-2.5 left-1/2 -translate-x-1/2 z-20 gap-1.5"
            >
              {bannerSlides.map((slide, idx) => (
                <button
                  key={`dot_${slide.id}`}
                  type="button"
                  role="tab"
                  aria-selected={idx === currentSlide}
                  aria-label={`Go to slide ${idx + 1} of ${bannerSlides.length}`}
                  onClick={() => goToSlide(idx)}
                  className={`h-1.5 rounded-full transition-all duration-300 min-w-[6px] min-h-[6px] ${
                    idx === currentSlide ? 'w-5 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ═══ 3. ACCOUNT SUMMARY — Unified card (reference match) ═══════════════ */}
      <div>
        <div className="flex items-center justify-between mb-3 px-0.5">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Account Summary</h3>
          <button
            type="button"
            onClick={() => onNavigateTab('statements')}
            className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 transition-colors"
          >
            View statements <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        <div className="relative bg-white border border-slate-200/60 rounded-2xl p-4 sm:p-5 shadow-xs overflow-hidden">
          {/* Wallet icon — top right, semantic blue */}
          <div className="absolute top-3 right-3 sm:top-4 sm:right-4 w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <CreditCard className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="flex items-center gap-3 sm:gap-5 min-w-0 pr-12 sm:pr-14">
            {/* Outstanding Balance — left half, rose (money owed) */}
            <button
              type="button"
              onClick={() => onNavigateInvoices?.('unpaid')}
              className="flex-1 min-w-0 text-left active:scale-[0.98] transition-transform"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Outstanding Balance
              </p>
              <p className="text-[clamp(1.125rem,4.5vw,1.5rem)] font-black text-rose-600 leading-tight currency-display truncate">
                {formatCurrencyCompact(outstandingTotal)}
              </p>
              {overdueInvoices.length > 0 ? (
                <p className="text-[10px] font-bold text-rose-600 mt-1.5 flex items-center gap-1 truncate">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  <span className="truncate">{overdueInvoices.length} Overdue</span>
                </p>
              ) : (
                <p className="text-[10px] font-medium text-emerald-600 mt-1.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                  No overdue
                </p>
              )}
            </button>
            {/* Vertical divider */}
            <div className="w-px h-12 sm:h-14 bg-slate-200 shrink-0" />
            {/* Total Paid — right half, emerald (money paid) */}
            <button
              type="button"
              onClick={() => onNavigateTab('statements')}
              className="flex-1 min-w-0 text-left active:scale-[0.98] transition-transform"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Total Paid
              </p>
              <p className="text-[clamp(1.125rem,4.5vw,1.5rem)] font-black text-emerald-600 leading-tight currency-display truncate">
                {formatCurrencyCompact(totalPayment)}
              </p>
              <p className="text-[10px] font-medium text-slate-400 mt-1.5">All time</p>
            </button>
          </div>
        </div>
      </div>

      {/* ═══ 4. QUICK ACTIONS — 4×2 mobile, 8×1 desktop ════════════════════════ */}
      <div>
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3 px-0.5">Quick Actions</h3>
        <div className="grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-2.5">
          {quickActions.map(({ key, label, icon: Icon, chip, go }) => (
            <button
              key={key}
              type="button"
              onClick={go}
              aria-label={label}
              className="group flex flex-col items-center justify-center gap-1.5 p-2 sm:p-2.5 bg-white border border-slate-200/60 rounded-xl hover:border-slate-300 hover:shadow-sm active:scale-95 transition-all min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <span className={`shrink-0 p-2 sm:p-2.5 rounded-xl transition-colors ${chip}`} aria-hidden="true">
                <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
              </span>
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-700 group-hover:text-slate-900 transition-colors text-center leading-tight w-full truncate">
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ═══ 5. THREE COLUMN — Invoices / Orders / Deliveries ═══════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">

        {/* ── Invoices Overview ──────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden min-w-0">
          <div className="flex items-center justify-between px-4 pt-4 pb-2 gap-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 truncate">Invoices Overview</h3>
            <button
              type="button"
              onClick={() => onNavigateTab('invoices')}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 transition-colors min-h-[44px] px-2 shrink-0"
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="px-4 pb-4 space-y-1.5">
            {[
              { label: 'Outstanding', count: unpaidInvoices.length, amount: outstandingTotal, dot: 'bg-amber-500', amountClass: 'text-slate-900' },
              { label: 'Overdue', count: overdueInvoices.length, amount: overdueInvoices.reduce((s, i) => s + i.amountRemaining, 0), dot: 'bg-rose-500', amountClass: 'text-rose-600' },
              { label: 'Paid', count: paidInvoices.length, amount: totalPayment, dot: 'bg-emerald-500', amountClass: 'text-emerald-600' },
              { label: 'Draft', count: draftInvoices.length, amount: draftInvoices.reduce((s, i) => s + i.amountRemaining, 0), dot: 'bg-slate-300', amountClass: 'text-slate-500' },
            ].map(({ label, count, amount, dot, amountClass }) => (
              <div key={label} className="flex items-center justify-between py-1 gap-2 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`shrink-0 w-2 h-2 rounded-full ${dot}`} />
                  <span className="text-xs font-medium text-slate-600 truncate">{label}</span>
                  <span className="text-xs font-bold text-slate-900 shrink-0">{count}</span>
                </div>
                <span className={`text-xs font-bold font-mono currency-display truncate ${amountClass}`}>
                  {formatCurrency(amount)}
                </span>
              </div>
            ))}
            <div className="border-t border-slate-100 pt-2 mt-2 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">Total Invoices</span>
              <span className="text-xs font-black text-slate-900">{invoices.length}</span>
            </div>
          </div>
        </div>

        {/* ── Active Orders ──────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden min-w-0">
          <div className="flex items-center justify-between px-4 pt-4 pb-2 gap-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 truncate">Active Orders</h3>
            <button
              type="button"
              onClick={() => onNavigateTab('orders')}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 transition-colors min-h-[44px] px-2 shrink-0"
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="px-3 pb-3 space-y-1.5">
            {activeOrders.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No active orders</p>
            ) : (
              activeOrders.slice(0, 3).map((order) => {
                const st = ORDER_STATUS_STYLES[order.status] ?? { label: order.status, dot: 'bg-slate-400', bg: 'bg-slate-100 text-slate-600' };
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => onNavigateTab('orders')}
                    className="w-full flex items-center gap-3 p-2.5 bg-slate-50/80 rounded-xl hover:bg-slate-100 active:scale-[0.99] transition-all cursor-pointer group min-h-[44px] min-w-0"
                  >
                    <span className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                      <ShoppingBag className="w-4 h-4 text-emerald-600" />
                    </span>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-xs font-bold font-mono text-blue-600 truncate group-hover:text-blue-700 transition-colors">
                        {order.orderNumber}
                      </p>
                      <p className="text-[10px] text-slate-500 font-medium truncate">
                        {order.items.length} item{order.items.length === 1 ? '' : 's'} · {formatCurrency(order.totalAmount)}
                      </p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Recent Deliveries ──────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden min-w-0 md:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between px-4 pt-4 pb-2 gap-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 truncate">Recent Deliveries</h3>
            <button
              type="button"
              onClick={() => onNavigateTab('deliveries')}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 transition-colors min-h-[44px] px-2 shrink-0"
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="px-3 pb-3 space-y-1.5">
            {deliveries.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No recent deliveries</p>
            ) : (
              deliveries.slice(0, 3).map((d) => {
                const st = DELIVERY_STATUS_STYLES[d.status] ?? { label: d.status, dot: 'bg-slate-400', bg: 'bg-slate-100 text-slate-600' };
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onNavigateTab('deliveries')}
                    className="w-full flex items-center gap-3 p-2.5 bg-slate-50/80 rounded-xl hover:bg-slate-100 active:scale-[0.99] transition-all cursor-pointer group min-h-[44px] min-w-0"
                  >
                    <span className="w-9 h-9 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
                      <Truck className="w-4 h-4 text-sky-600" />
                    </span>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-xs font-bold font-mono text-blue-600 truncate group-hover:text-blue-700 transition-colors">
                        {d.trackingNumber}
                      </p>
                      <p className="text-[10px] text-slate-500 font-medium truncate">
                        {d.title || `Order ${d.orderId}`}
                      </p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ═══ 6. BOTTOM — Recent Activity + Account Snapshot ═══════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Recent Activity (right-aligned amount + status badge) ───────── */}
        <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Recent Activity</h3>
            <button
              type="button"
              onClick={() => onNavigateTab('statements')}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 transition-colors min-h-[44px] px-2"
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="px-3 pb-3 divide-y divide-slate-100">
            {recentStatements.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No activity yet</p>
            ) : (
              recentStatements.map((st) => {
                const isCredit = st.type === 'Payment' || st.type === 'Credit Note';
                const Icon = isCredit ? CheckCircle2 : FileText;
                const iconBg = isCredit ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600';
                const amount = st.debit > 0 ? st.debit : st.credit;
                const isPositive = isCredit;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => onNavigateTab('statements')}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 active:scale-[0.99] transition-all group min-h-[44px]"
                  >
                    <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${iconBg}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-xs font-bold text-slate-800 truncate group-hover:text-blue-600 transition-colors">
                        {st.description}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium">
                        {st.type} · {timeAgo(st.date)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span className={`text-xs font-black currency-display ${
                        isPositive ? 'text-emerald-600' : 'text-slate-900'
                      }`}>
                        {isPositive ? '+' : '−'}{formatCurrency(amount)}
                      </span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                        isPositive
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {isPositive ? 'Paid' : 'Pending'}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Account Snapshot ───────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Account Snapshot</h3>
          </div>
          <div className="px-4 pb-4 divide-y divide-slate-100">
            <div className="flex items-center justify-between py-2.5 gap-3 min-w-0">
              <span className="text-xs text-slate-500 font-medium shrink-0">Credit Limit</span>
              <span className="text-xs font-black text-slate-900 font-mono currency-display truncate">
                {formatCurrency(profile.creditLimit)}
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5 gap-3 min-w-0">
              <span className="text-xs text-slate-500 font-medium shrink-0">Available Credit</span>
              <span className={`text-xs font-black font-mono currency-display truncate ${
                (profile.creditLimit - profile.currentBalance) > 0 ? 'text-emerald-600' : 'text-slate-900'
              }`}>
                {formatCurrency(profile.creditLimit - profile.currentBalance)}
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5 gap-3 min-w-0">
              <span className="text-xs text-slate-500 font-medium shrink-0">Payment Terms</span>
              <span className="text-xs font-bold text-slate-900">30 days</span>
            </div>
            {profile.tier && (
              <div className="flex items-center justify-between py-2.5 gap-3 min-w-0">
                <span className="text-xs text-slate-500 font-medium shrink-0">Customer Tier</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                  {profile.tier}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between py-2.5 gap-3 min-w-0">
              <span className="text-xs text-slate-500 font-medium shrink-0">Member Since</span>
              <span className="text-xs font-bold text-slate-900">—</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
