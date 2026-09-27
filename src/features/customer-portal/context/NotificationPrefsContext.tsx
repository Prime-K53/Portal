import React, { createContext, useContext, useState, useCallback } from 'react';

export type NotificationType = 'order' | 'invoice' | 'delivery' | 'statement' | 'referral';

interface NotificationPrefs {
  order: boolean;
  invoice: boolean;
  delivery: boolean;
  statement: boolean;
  referral: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  order: true,
  invoice: true,
  delivery: true,
  statement: true,
  referral: true,
};

interface NotificationPrefsContextValue {
  prefs: NotificationPrefs;
  toggle: (type: NotificationType) => void;
  setAll: (value: boolean) => void;
}

const NotificationPrefsContext = createContext<NotificationPrefsContextValue | null>(null);

export function NotificationPrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);

  const toggle = useCallback((type: NotificationType) => {
    setPrefs((prev) => ({ ...prev, [type]: !prev[type] }));
  }, []);

  const setAll = useCallback((value: boolean) => {
    setPrefs({ order: value, invoice: value, delivery: value, statement: value, referral: value });
  }, []);

  return (
    <NotificationPrefsContext.Provider value={{ prefs, toggle, setAll }}>
      {children}
    </NotificationPrefsContext.Provider>
  );
}

export function useNotificationPrefs(): NotificationPrefsContextValue {
  const ctx = useContext(NotificationPrefsContext);
  if (!ctx) {
    return {
      prefs: DEFAULT_PREFS,
      toggle: () => {},
      setAll: () => {},
    };
  }
  return ctx;
}