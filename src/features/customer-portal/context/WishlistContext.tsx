import React, { createContext, useContext, useState, useCallback } from 'react';

export interface WishlistItem {
  id: string;
  productId: string;
  productName: string;
  unitPrice: number;
  imageUrl?: string;
  addedAt: number;
}

interface WishlistContextValue {
  items: WishlistItem[];
  add: (item: Omit<WishlistItem, 'addedAt'>) => void;
  remove: (id: string) => void;
  isInWishlist: (productId: string) => boolean;
  clear: () => void;
  count: number;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);
const STORAGE_KEY = 'portal_wishlist';

function loadWishlist(): WishlistItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveWishlist(items: WishlistItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<WishlistItem[]>(loadWishlist);

  const add = useCallback((item: Omit<WishlistItem, 'addedAt'>) => {
    setItems((prev) => {
      if (prev.some((i) => i.productId === item.productId)) return prev;
      const next = [{ ...item, addedAt: Date.now() }, ...prev];
      saveWishlist(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      saveWishlist(next);
      return next;
    });
  }, []);

  const isInWishlist = useCallback(
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
    <WishlistContext.Provider value={{ items, add, remove, isInWishlist, clear, count: items.length }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) {
    return {
      items: [],
      add: () => {},
      remove: () => {},
      isInWishlist: () => false,
      clear: () => {},
      count: 0,
    };
  }
  return ctx;
}