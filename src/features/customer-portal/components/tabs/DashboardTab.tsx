import React, { useState, useEffect } from 'react';
import {
  Award,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Gift,
  MessageSquareQuote,
  Receipt,
  ShoppingBag,
  Star,
  Truck,
  Wallet,
} from 'lucide-react';
import { AccountProfile, DeliveryNotification, Invoice, PortalAd, PortalAdImageMeta, StatementEntry, TabType } from '../../types';
import { formatCurrency } from '../../utils/formatters';

interface DashboardTabProps {
  profile: AccountProfile;
  invoices: Invoice[];
  deliveries: DeliveryNotification[];
  statements: StatementEntry[];
  /** ERP banner ads (GET /portal/ads) — displayed as carousel slides. */
  ads: PortalAd[];
  onNavigateTab: (tab: TabType) => void;
  onOpenPaymentModal: () => void;
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

export const DashboardTab: React.FC<DashboardTabProps> = ({
  profile,
  invoices,
  deliveries,
  statements,
  ads,
  onNavigateTab,
  onOpenPaymentModal,
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideDirection, setSlideDirection] = useState<'next' | 'prev'>('next');
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const bannerSlides: BannerSlide[] = [
    {
      id: 'slide_welcome',
      badge: '👋 WELCOME BACK',
      badgeBg: 'bg-amber-400 text-slate-950',
      title: `Welcome back, ${profile.customerName}`,
      subtitle: `Account ID: ${profile.accountNumber} • ${profile.tier || 'Standard'} Tier`,
      extra: `Available Credit: ${formatCurrency((profile.creditLimit ?? 0) - (profile.currentBalance ?? 0))}`,
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
    const timer = setInterval(() => {
      setSlideDirection('next');
      setCurrentSlide((prev) => (prev + 1) % bannerSlides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [bannerSlides.length]);

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

  const totalPayment = statements.reduce((sum, s) => sum + s.credit, 0);
  const sortedStatements = [...statements].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const outstandingBalance = sortedStatements.length > 0 ? sortedStatements[sortedStatements.length - 1].balance : 0;
  const isFullyPaid = outstandingBalance === 0;

  return (
    <div className="space-y-6 pb-24 text-slate-900 animate-fade-in">
      {/* 1. Header Profile & Partner Badge */}
      <div className="space-y-3">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-100 to-amber-50/80 border border-amber-200 text-amber-900 text-xs font-black shadow-md">
            <Award className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
            <span>{profile.tier || 'Standard'}</span>
          </span>
        </div>

        {/* Title and View Profile Button */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {profile.customerName || 'Account'}
            </h1>
            {profile.accountNumber && (
              <p className="text-xs font-medium text-slate-600 mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-slate-800">Customer ID: {profile.accountNumber}</span>
              </p>
            )}
          </div>

          <button
            onClick={() => onNavigateTab('account')}
            className="px-4 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-black rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 shrink-0"
          >
            <span>View Profile</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </div>

      {/* 2. Interactive Sliding Banner (real data slides — no hardcoded ad images) */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
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
      </div>

      {/* KPI Mini Cards Grid */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {/* Outstanding Summary Card */}
          <div className="bg-amber-50/80 rounded-2xl p-4 border border-amber-200/80 space-y-1">
            <div className="flex items-center justify-between text-amber-800">
              <span className="text-xs font-bold uppercase tracking-wider">Outstanding</span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-xl font-extrabold font-mono text-amber-950">
              {formatCurrency(outstandingBalance)}
            </p>
            <p className="text-[11px] text-amber-700 font-medium">
              {isFullyPaid ? 'No Unpaid Balance' : 'Has Outstanding Balance'}
            </p>
          </div>

          {/* Total Payment Summary Card */}
          <div
            className={`rounded-2xl p-4 border transition-all duration-300 space-y-1 ${
              isFullyPaid
                ? 'bg-emerald-900 text-white border-emerald-700 shadow-md'
                : 'bg-slate-900/80 text-white border-slate-800/80'
            }`}
          >
            <div className="flex items-center justify-between text-slate-300">
              <span className="text-xs font-bold uppercase tracking-wider">Total Payment</span>
              <CheckCircle2
                className={`w-4 h-4 ${isFullyPaid ? 'text-emerald-400' : 'text-amber-400'}`}
              />
            </div>
            <p className="text-xl font-extrabold font-mono text-white">
              {formatCurrency(totalPayment)}
            </p>
            <p
              className={`text-[11px] ${isFullyPaid ? 'text-emerald-300 font-bold' : 'text-slate-400'}`}
            >
              {isFullyPaid ? 'Fully Settled ✓' : 'Amount Paid'}
            </p>
          </div>
        </div>
      </div>

      {/* 4. Quick Actions Grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-black text-slate-900 tracking-tight relative">
          Quick Actions
          <span className="absolute -bottom-1 left-0 w-5 h-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-sm" />
        </h3>

        <div className="grid grid-cols-3 gap-2.5">
          <button
            onClick={onOpenPaymentModal}
            className="group p-4 bg-white border-2 border-slate-100 rounded-2xl hover:border-blue-200 hover:bg-gradient-to-b hover:from-blue-50/50 hover:to-white transition-all text-center flex flex-col items-center justify-center space-y-2.5 shadow-md hover:shadow-lg"
          >
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 text-slate-800 group-hover:from-blue-100 group-hover:to-blue-50 group-hover:scale-110 transition-all">
              <CreditCard className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-xs font-black text-slate-900">Pay Invoices</span>
          </button>

          <button
            onClick={() => onNavigateTab('orders')}
            className="group p-4 bg-white border-2 border-slate-100 rounded-2xl hover:border-green-200 hover:bg-gradient-to-b hover:from-green-50/50 hover:to-white transition-all text-center flex flex-col items-center justify-center space-y-2.5 shadow-md hover:shadow-lg"
          >
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 text-slate-800 group-hover:from-green-100 group-hover:to-green-50 group-hover:scale-110 transition-all">
              <ShoppingBag className="w-5 h-5 text-green-600" />
            </div>
            <span className="text-xs font-black text-slate-900">New Order</span>
          </button>

          <button
            onClick={() => onNavigateTab('quotes')}
            className="group p-4 bg-white border-2 border-slate-100 rounded-2xl hover:border-purple-200 hover:bg-gradient-to-b hover:from-purple-50/50 hover:to-white transition-all text-center flex flex-col items-center justify-center space-y-2.5 shadow-md hover:shadow-lg"
          >
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 text-slate-800 group-hover:from-purple-100 group-hover:to-purple-50 group-hover:scale-110 transition-all">
              <MessageSquareQuote className="w-5 h-5 text-purple-600" />
            </div>
            <span className="text-xs font-black text-slate-900">Get Quote</span>
          </button>

          <button
            onClick={() => onNavigateTab('deliveries')}
            className="group p-4 bg-white border-2 border-slate-100 rounded-2xl hover:border-sky-200 hover:bg-gradient-to-b hover:from-sky-50/50 hover:to-white transition-all text-center flex flex-col items-center justify-center space-y-2.5 shadow-md hover:shadow-lg"
          >
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 text-slate-800 group-hover:from-sky-100 group-hover:to-sky-50 group-hover:scale-110 transition-all">
              <Truck className="w-5 h-5 text-sky-600" />
            </div>
            <span className="text-xs font-black text-slate-900">Track Shipments</span>
          </button>

          <button
            onClick={() => onNavigateTab('referrals')}
            className="group p-4 bg-white border-2 border-slate-100 rounded-2xl hover:border-amber-200 hover:bg-gradient-to-b hover:from-amber-50/50 hover:to-white transition-all text-center flex flex-col items-center justify-center space-y-2.5 shadow-md hover:shadow-lg"
          >
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 text-slate-800 group-hover:from-amber-100 group-hover:to-amber-50 group-hover:scale-110 transition-all">
              <Gift className="w-5 h-5 text-amber-600" />
            </div>
            <span className="text-xs font-black text-slate-900">Refer Business</span>
          </button>

          <button
            onClick={() => onNavigateTab('statements')}
            className="group p-4 bg-white border-2 border-slate-100 rounded-2xl hover:border-indigo-200 hover:bg-gradient-to-b hover:from-indigo-50/50 hover:to-white transition-all text-center flex flex-col items-center justify-center space-y-2.5 shadow-md hover:shadow-lg"
          >
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 text-slate-800 group-hover:from-indigo-100 group-hover:to-indigo-50 group-hover:scale-110 transition-all">
              <Receipt className="w-5 h-5 text-indigo-600" />
            </div>
            <span className="text-xs font-black text-slate-900">Statements</span>
          </button>
        </div>
      </div>

      {/* 5. Recent Transactions Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900 tracking-tight relative">
            Recent Transactions
            <span className="absolute -bottom-1 left-0 w-5 h-2 bg-gradient-to-r from-amber-500 to-orange-500 rounded-sm" />
          </h3>
          <button
            onClick={() => onNavigateTab('statements')}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 transition"
          >
            View All
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 divide-y divide-slate-100 overflow-hidden shadow-md">
          {[...statements]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 4)
            .map((st, index) => (
            <div
              key={st.id}
              onClick={() => onNavigateTab('statements')}
              className={`px-3.5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition-all cursor-pointer group ${
                index % 2 === 1 ? 'bg-slate-50/40' : ''
              }`}
            >
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-xs text-slate-900 group-hover:text-blue-600 transition-colors">
                    {st.reference}
                  </span>
                  <span
                    className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                      st.type === 'Payment'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : st.type === 'Credit Note'
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : 'bg-slate-200 text-slate-700 border border-slate-300'
                    }`}
                  >
                    {st.type}
                  </span>
                </div>
                <p className="text-xs text-slate-600 font-medium line-clamp-1">{st.description}</p>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span>{st.date}</span>
                </div>
              </div>

              <div className="text-right shrink-0 flex items-center gap-2">
                <div className="text-right font-medium">
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
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

