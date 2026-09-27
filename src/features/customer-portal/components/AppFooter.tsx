import React from 'react';

interface FooterConfig {
  companyName: string;
  tagline: string;
  supportEmail: string;
  supportPhone: string;
  copyrightYear: number;
}

const DEFAULT_CONFIG: FooterConfig = {
  companyName: 'Prime Printing',
  tagline: 'Quality, Reliable, Affordable',
  supportEmail: 'support@prime.mw',
  supportPhone: '+265 123 456 789',
  copyrightYear: new Date().getFullYear(),
};

const FooterConfigContext = React.createContext<FooterConfig>(DEFAULT_CONFIG);

export function FooterConfigProvider({
  children,
  config,
}: {
  children: React.ReactNode;
  config?: Partial<FooterConfig>;
}) {
  const merged = { ...DEFAULT_CONFIG, ...config };
  return (
    <FooterConfigContext.Provider value={merged}>{children}</FooterConfigContext.Provider>
  );
}

export function useFooterConfig(): FooterConfig {
  return React.useContext(FooterConfigContext);
}

export function AppFooter() {
  const config = useFooterConfig();
  return (
    <footer className="border-t border-slate-200 bg-white py-6 px-4 text-center">
      <p className="text-xs font-bold text-slate-900">
        {config.companyName} — {config.tagline}
      </p>
      <p className="text-[11px] text-slate-500 mt-1">
        {config.copyrightYear} © {config.companyName}. Support: {config.supportEmail} | {config.supportPhone}
      </p>
    </footer>
  );
}