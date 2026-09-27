import React, { createContext, useContext, useState, useCallback } from 'react';

export interface ComparisonItem {
  productId: string;
  productName: string;
  unitPrice: number;
  minOrder: number;
  description?: string;
}

interface ComparisonContextValue {
  items: ComparisonItem[];
  add: (item: ComparisonItem) => void;
  remove: (productId: string) => void;
  isCompared: (productId: string) => boolean;
  clear: () => void;
  count: number;
}

const ComparisonContext = createContext<ComparisonContextValue | null>(null);
const STORAGE_KEY = 'portal_comparison';
const MAX_COMPARE = 4;

function loadComparison(): ComparisonItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveComparison(items: ComparisonItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function ComparisonProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ComparisonItem[]>(loadComparison);

  const add = useCallback((item: ComparisonItem) => {
    setItems((prev) => {
      if (prev.some((i) => i.productId === item.productId)) return prev;
      if (prev.length >= MAX_COMPARE) return prev;
      const next = [...prev, item];
      saveComparison(next);
      return next;
    });
  }, []);

  const remove = useCallback((productId: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.productId !== productId);
      saveComparison(next);
      return next;
    });
  }, []);

  const isCompared = useCallback(
    (productId: string) => items.some((i) => i.productId === productId),
    [items]
  );

  const clear = useCallback(() => {
    setItems([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return (
    <ComparisonContext.Provider value={{ items, add, remove, isCompared, clear, count: items.length }}>
      {children}
    </ComparisonContext.Provider>
  );
}

export function useComparison(): ComparisonContextValue {
  const ctx = useContext(ComparisonContext);
  if (!ctx) {
    return {
      items: [],
      add: () => {},
      remove: () => {},
      isCompared: () => false,
      clear: () => {},
      count: 0,
    };
  }
  return ctx;
}