import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useHashRoute } from '../../router/useHashRoute';
import { ROUTES } from '../../router/routes';
import { AuthMintShell } from './authTheme';

export function LandingPage() {
  const { navigate } = useHashRoute();

  return (
    <AuthMintShell>
      <div className="mt-4 text-center animate-rise">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900">
          Welcome to <span className="text-[#2563eb]">Prime</span> Portal
        </h1>
        <p className="mt-2 text-sm text-slate-500 max-w-xs mx-auto leading-relaxed">
          Smart. Simple. School Supplies. Manage your orders, invoices, and deliveries all in one place.
        </p>
      </div>

      {/* Features */}
      <div className="mt-6 space-y-3 animate-rise" style={{ animationDelay: '200ms' }}>
        {[
          { icon: ShoppingBag, label: 'Browse & order products', desc: 'Browse our catalog and place orders with ease' },
          { icon: FileText, label: 'Track invoices & payments', desc: 'View invoices, check status, and request payments' },
           { icon: Truck, label: 'Monitor deliveries', desc: 'Track shipments in real time with live updates' },
        ].map((feature) => (
          <div
            key={feature.label}
            className="flex items-start gap-3 p-3 rounded-xl bg-white/60 border border-slate-100"
          >
            <span className="shrink-0 w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
              <feature.icon className="w-4 h-4 text-emerald-600" />
            </span>
            <div className="text-left min-w-0">
              <p className="text-xs font-bold text-slate-900">{feature.label}</p>
              <p className="text-[11px] text-slate-500 leading-relaxed">{feature.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-6 animate-rise" style={{ animationDelay: '400ms' }}>
        <button
          type="button"
          onClick={() => navigate(ROUTES.login)}
          className="w-full h-[52px] rounded-full bg-[#2563eb] text-white text-[15px] font-bold shadow-[0_10px_25px_rgba(37,99,235,0.3)] hover:bg-blue-700 hover:shadow-[0_12px_28px_rgba(37,99,235,0.35)] active:scale-[0.99] transition-all flex items-center justify-center gap-2"
        >
          <span>Proceed to Sign In</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <p className="mt-4 text-center text-[12px] text-slate-400 animate-rise" style={{ animationDelay: '500ms' }}>
        Don't have an account? Contact your administrator to get started.
      </p>
    </AuthMintShell>
  );
}

function ShoppingBag(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function FileText(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" />
      <line x1="16" x2="8" y1="17" y2="17" />
      <line x1="10" x2="8" y1="9" y2="9" />
    </svg>
  );
}

function Truck(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="17" cy="20" r="1" />
      <circle cx="7" cy="20" r="1" />
    </svg>
  );
}

function Shield(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
  );
}
