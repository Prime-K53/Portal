import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export interface ViewHistoryEntry {
  id: string;
  type: string;
  label: string;
  path: string;
  timestamp: number;
}

interface RecentViewsContextValue {
  history: ViewHistoryEntry[];
  addToHistory: (entry: Omit<ViewHistoryEntry, 'timestamp'>) => void;
  removeFromHistory: (id: string) => void;
  clearHistory: () => void;
}

const RecentViewsContext = createContext<RecentViewsContextValue | null>(null);
const STORAGE_KEY = 'portal_recent_views';
const MAX_HISTORY = 20;

function loadHistory(): ViewHistoryEntry[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: ViewHistoryEntry[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {
    // ignore
  }
}

export function RecentViewsProvider({ children }: { children: React.ReactNode }) {
  const [history, setHistory] = useState<ViewHistoryEntry[]>(loadHistory);

  const addToHistory = useCallback((entry: Omit<ViewHistoryEntry, 'timestamp'>) => {
    setHistory((prev) => {
      const filtered = prev.filter((h) => h.id !== entry.id);
      const next = [{ ...entry, timestamp: Date.now() }, ...filtered];
      saveHistory(next);
      return next;
    });
  }, []);

  const removeFromHistory = useCallback((id: string) => {
    setHistory((prev) => {
      const next = prev.filter((h) => h.id !== id);
      saveHistory(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return (
    <RecentViewsContext.Provider value={{ history, addToHistory, removeFromHistory, clearHistory }}>
      {children}
    </RecentViewsContext.Provider>
  );
}

export function useRecentViews(): RecentViewsContextValue {
  const ctx = useContext(RecentViewsContext);
  if (!ctx) {
    return {
      history: [],
      addToHistory: () => {},
      removeFromHistory: () => {},
      clearHistory: () => {},
    };
  }
  return ctx;
}