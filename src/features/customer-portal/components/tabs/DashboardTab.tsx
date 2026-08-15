import React, { useState, useEffect } from 'react';
import {
  Award,
  Building2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  Gift,
  MessageSquareQuote,
  Receipt,
  ShoppingBag,
  Star,
  Truck,
  Wallet,
} from 'lucide-react';
import { AccountProfile, DeliveryNotification, Invoice, StatementEntry, TabType } from '../../types';
import { formatCurrency } from '../../utils/formatters';

interface DashboardTabProps {
  profile: AccountProfile;
  invoices: Invoice[];
  deliveries: DeliveryNotification[];
  statements: StatementEntry[];
  onNavigateTab: (tab: TabType) => void;
  onOpenPaymentModal: () => void;
  onOpenQuoteModal: () => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  profile,
  invoices,
  deliveries,
  statements,
  onNavigateTab,
  onOpenPaymentModal,
  onOpenQuoteModal,
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideDirection, setSlideDirection] = useState<'next' | 'prev'>('next');
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const bannerSlides = [
    {
      id: 'slide_welcome',
      badge: '👋 WELCOME BACK',
      badgeBg: 'bg-amber-400 text-slate-950',
      title: `Welcome back, ${profile.customerName}`,
      subtitle: `Account ID: ${profile.accountNumber} • ${profile.tier || 'Standard'} Tier`,
      extra: `Available Credit: ${formatCurrency((profile.creditLimit ?? 0) - (profile.currentBalance ?? 0))}`,
      gradient: 'from-slate-900 via-indigo-950 to-slate-900',
      imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80',
    },
    {
      id: 'slide_promo_image',
      badge: '📦 FEATURED BANNER',
      badgeBg: 'bg-indigo-400 text-slate-950',
      title: '', // Image banner without heavy text descriptions
      subtitle: '',
      extra: '',
      gradient: 'from-indigo-950 to-slate-950',
      imageUrl: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80',
      isPureImage: true,
    },
    {
      id: 'slide_promo',
      badge: '🎁 SPECIAL PROMOTION',
      badgeBg: 'bg-emerald-400 text-slate-950',
      title: '15% OFF Bulk Printing & Office Supplies',
      subtitle: 'Use promo code PROMO2026 at checkout for orders over $500.',
      extra: 'Valid through end of month for registered partners',
      gradient: 'from-indigo-950 via-slate-900 to-blue-950',
      imageUrl: 'https://images.unsplash.com/photo-1562577309-2592ab84b1bc?auto=format&fit=crop&w=1200&q=80',
    },
  ];

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
      gradient: 'from-slate-950 via-sky-950 to-slate-900',
      imageUrl: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=1200&q=80',
    });
  }

  useEffect(() => {
    const timer = setInterval(() => {
      setSlideDirection('next');
      setCurrentSlide((prev) => (prev + 1) % bannerSlides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [bannerSlides.length]);

  const activeSlide = bannerSlides[currentSlide];

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

  const unpaidInvoices = invoices.filter((i) => i.status === 'unpaid' || i.status === 'overdue' || i.status === 'partially_paid');
  const unpaidTotal = unpaidInvoices.reduce((sum, i) => sum + i.amountRemaining, 0);
  const overdueCount = unpaidInvoices.filter((i) => i.status === 'overdue').length;

  return (
    <div className="space-y-5 pb-24 text-slate-900 animate-fade-in">
      {/* 1. Header Profile & Partner Badge */}
      <div className="space-y-2">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100/80 border border-amber-200 text-amber-900 text-xs font-bold shadow-2xs">
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
            className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-bold rounded-xl shadow-2xs flex items-center gap-1 transition shrink-0"
          >
            <span>View Profile</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </div>

      {/* 2. Interactive Sliding Banner (Supports Text, Sliding Images, or Pure Image Banners) */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative overflow-hidden rounded-2xl min-h-[140px] sm:min-h-[160px] bg-slate-900 p-4 sm:p-5 text-white shadow-md border border-transparent transition-all duration-500 flex flex-col justify-between group"
      >
        {/* Slide Content — keyed so it remounts and slides in on every slide change */}
        <div
          key={activeSlide.id}
          className={`absolute inset-0 ${slideDirection === 'next' ? 'animate-slide-left' : 'animate-slide-right'}`}
        >
          {/* Background Image Layer */}
          {activeSlide.imageUrl && (
            <div className="absolute inset-0 z-0">
              <img
                src={activeSlide.imageUrl}
                alt={activeSlide.title || 'Banner Slide'}
                className="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
              />
              {/* Scrim Overlay for Contrast if text exists */}
              {!activeSlide.isPureImage ? (
                <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-900/75 to-slate-950/40" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/40" />
              )}
            </div>
          )}

          {/* Fallback Gradient if no image */}
          {!activeSlide.imageUrl && (
            <div className={`absolute inset-0 z-0 bg-gradient-to-r ${activeSlide.gradient}`} />
          )}

          {/* Texture overlay */}
          <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#60a5fa_1px,transparent_1px)] [background-size:12px_12px] z-0" />

          {/* Active Banner Slide Text Content (if not image-only) */}
          {!activeSlide.isPureImage && (activeSlide.title || activeSlide.subtitle) && (
            <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                {activeSlide.title && (
                  <h2 className="text-base sm:text-lg font-black text-white tracking-tight leading-snug drop-shadow-xs">
                    {activeSlide.title}
                  </h2>
                )}
                {activeSlide.subtitle && (
                  <p className="text-xs text-indigo-100 font-medium drop-shadow-xs">
                    {activeSlide.subtitle}
                  </p>
                )}
                {activeSlide.extra && (
                  <p className="text-[12.5px] text-amber-300/90 font-semibold pt-0.5">
                    {activeSlide.extra}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Controls and Badge Top Header */}
        <div className="relative z-10 flex items-center justify-between gap-2">
          <span className={`text-[11.5px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md shadow-2xs flex items-center gap-1 backdrop-blur-md ${activeSlide.badgeBg}`}>
            <Star className="w-3 h-3 fill-slate-950" /> {activeSlide.badge}
          </span>

          {/* Slider Navigation Controls */}
          <div className="flex items-center gap-1.5 bg-slate-950/60 backdrop-blur-md p-1 rounded-xl border border-white/10 shadow-xs">
            <button
              onClick={goPrev}
              className="p-1.5 rounded-lg hover:bg-white/20 transition text-slate-200"
              aria-label="Previous Slide"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex gap-1.5 mx-1">
              {bannerSlides.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => goToSlide(idx)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    currentSlide === idx ? 'w-5 bg-amber-400' : 'w-2 bg-white/40 hover:bg-white/60'
                  }`}
                />
              ))}
            </div>

            <button
              onClick={goNext}
              className="p-1.5 rounded-lg hover:bg-white/20 transition text-slate-200"
              aria-label="Next Slide"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Account Summary Section (Removed Active Delivery KPI as requested) */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900 tracking-tight">Account Summary</h3>
          <button
            onClick={() => onNavigateTab('invoices')}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 transition"
          >
            View All
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Card 1: Unpaid Invoices */}
          <button
            onClick={onOpenPaymentModal}
            className="p-3.5 bg-rose-50/70 border border-rose-100 rounded-2xl text-left space-y-1.5 hover:bg-rose-100/60 transition shadow-2xs group"
          >
            <div className="flex items-center justify-between">
              <div className="p-1.5 rounded-lg bg-rose-100 text-rose-600">
                <FileText className="w-4 h-4" />
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <div className="text-[12.5px] font-extrabold text-slate-700 leading-tight">Unpaid Invoices</div>
            <div className="text-sm sm:text-base font-black text-rose-600 tracking-tight tabular-nums">
              {formatCurrency(unpaidTotal)}
            </div>
            <div className="text-[11.5px] font-bold text-rose-700">{overdueCount > 0 ? `${overdueCount} Overdue` : 'Outstanding Balance'}</div>
          </button>

          {/* Card 2: Available Credit */}
          <button
            onClick={() => onNavigateTab('statements')}
            className="p-3.5 bg-emerald-50/70 border border-emerald-100 rounded-2xl text-left space-y-1.5 hover:bg-emerald-100/60 transition shadow-2xs group"
          >
            <div className="flex items-center justify-between">
              <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                <Wallet className="w-4 h-4" />
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <div className="text-[12.5px] font-extrabold text-slate-700 leading-tight">Available Credit</div>
            <div className="text-sm sm:text-base font-black text-emerald-600 tracking-tight tabular-nums">
              {formatCurrency((profile.creditLimit ?? 0) - (profile.currentBalance ?? 0))}
            </div>
            <div className="text-[11.5px] font-bold text-emerald-700">Available</div>
          </button>
        </div>
      </div>

      {/* 4. Quick Actions Grid */}
      <div className="space-y-2.5">
        <h3 className="text-sm font-black text-slate-900 tracking-tight">Quick Actions</h3>

        <div className="grid grid-cols-3 gap-2.5">
          <button
            onClick={onOpenPaymentModal}
            className="p-3.5 bg-white border border-slate-200/80 rounded-2xl hover:border-slate-300 hover:bg-slate-50 transition-all text-center flex flex-col items-center justify-center space-y-2 group shadow-2xs"
          >
            <div className="p-2.5 rounded-xl bg-slate-100 text-slate-800 group-hover:scale-110 transition-transform">
              <CreditCard className="w-5 h-5 text-slate-900" />
            </div>
            <span className="text-xs font-extrabold text-slate-900">Pay Invoices</span>
          </button>

          <button
            onClick={() => onNavigateTab('orders')}
            className="p-3.5 bg-white border border-slate-200/80 rounded-2xl hover:border-slate-300 hover:bg-slate-50 transition-all text-center flex flex-col items-center justify-center space-y-2 group shadow-2xs"
          >
            <div className="p-2.5 rounded-xl bg-slate-100 text-slate-800 group-hover:scale-110 transition-transform">
              <ShoppingBag className="w-5 h-5 text-slate-900" />
            </div>
            <span className="text-xs font-extrabold text-slate-900">New Order</span>
          </button>

          <button
            onClick={onOpenQuoteModal}
            className="p-3.5 bg-white border border-slate-200/80 rounded-2xl hover:border-slate-300 hover:bg-slate-50 transition-all text-center flex flex-col items-center justify-center space-y-2 group shadow-2xs"
          >
            <div className="p-2.5 rounded-xl bg-slate-100 text-slate-800 group-hover:scale-110 transition-transform">
              <MessageSquareQuote className="w-5 h-5 text-slate-900" />
            </div>
            <span className="text-xs font-extrabold text-slate-900">Get Quote</span>
          </button>

          <button
            onClick={() => onNavigateTab('deliveries')}
            className="p-3.5 bg-white border border-slate-200/80 rounded-2xl hover:border-slate-300 hover:bg-slate-50 transition-all text-center flex flex-col items-center justify-center space-y-2 group shadow-2xs"
          >
            <div className="p-2.5 rounded-xl bg-slate-100 text-slate-800 group-hover:scale-110 transition-transform">
              <Truck className="w-5 h-5 text-slate-900" />
            </div>
            <span className="text-xs font-extrabold text-slate-900">Track Shipments</span>
          </button>

          <button
            onClick={() => onNavigateTab('referrals')}
            className="p-3.5 bg-white border border-slate-200/80 rounded-2xl hover:border-slate-300 hover:bg-slate-50 transition-all text-center flex flex-col items-center justify-center space-y-2 group shadow-2xs"
          >
            <div className="p-2.5 rounded-xl bg-slate-100 text-slate-800 group-hover:scale-110 transition-transform">
              <Gift className="w-5 h-5 text-slate-900" />
            </div>
            <span className="text-xs font-extrabold text-slate-900">Refer Business</span>
          </button>

          <button
            onClick={() => onNavigateTab('statements')}
            className="p-3.5 bg-white border border-slate-200/80 rounded-2xl hover:border-slate-300 hover:bg-slate-50 transition-all text-center flex flex-col items-center justify-center space-y-2 group shadow-2xs"
          >
            <div className="p-2.5 rounded-xl bg-slate-100 text-slate-800 group-hover:scale-110 transition-transform">
              <Receipt className="w-5 h-5 text-slate-900" />
            </div>
            <span className="text-xs font-extrabold text-slate-900">Statements</span>
          </button>
        </div>
      </div>

      {/* 5. Recent Transactions Section */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900 tracking-tight">
            Recent Transactions
          </h3>
          <button
            onClick={() => onNavigateTab('statements')}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 transition"
          >
            View All
          </button>
        </div>

        <div className="space-y-2.5">
          {statements.slice(0, 4).map((st) => (
            <div
              key={st.id}
              onClick={() => onNavigateTab('statements')}
              className="p-3.5 rounded-2xl bg-white border border-slate-200/80 hover:border-slate-400 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between gap-3 shadow-2xs group"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs text-slate-900 group-hover:text-blue-600 transition-colors">
                    {st.reference}
                  </span>
                  <span
                    className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded ${
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
                <div className="flex items-center gap-2 text-[11.5px] text-slate-400">
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
                  <span className="text-[11.5px] text-slate-400 block font-medium tabular-nums">
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

