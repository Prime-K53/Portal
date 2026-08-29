/**
 * Prime PORTAL — Focus Trap Utility
 *
 * Tiny dependency-free focus trap for modals. Wraps a modal's content
 * element so:
 *   - Tab and Shift+Tab cycle focus only inside the trap.
 *   - Escape calls the supplied `onEscape` (when provided).
 *   - The element that was focused before the trap opened is restored
 *     to focus on close.
 *
 * Usage:
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   useFocusTrap(containerRef, { active: isOpen, onEscape: onClose });
 *   ...
 *   <div ref={containerRef} role="dialog" aria-modal="true">
 */

import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('aria-hidden') && el.offsetParent !== null
  );
}

export interface FocusTrapOptions {
  /** When false the trap is detached and focus is restored. */
  active: boolean;
  /** Optional Escape handler (e.g. the modal's onClose). */
  onEscape?: () => void;
}

export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  { active, onEscape }: FocusTrapOptions
): void {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    // Remember the element that had focus before the modal opened so we can
    // restore it when the modal closes.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus into the trap on open. Prefer the first focusable child;
    // fall back to the container itself (which must be focusable via tabindex).
    const initial = getFocusable(container)[0] ?? container;
    // Defer to next tick so any animation / transition can settle.
    const initialTimer = window.setTimeout(() => {
      try {
        initial.focus();
      } catch {
        /* element may not be focusable — ignore */
      }
    }, 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) {
        e.stopPropagation();
        onEscape();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = getFocusable(container);
      if (focusables.length === 0) {
        // Nothing focusable inside — keep focus on the container itself.
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !container.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(initialTimer);
      document.removeEventListener('keydown', handleKeyDown);
      // Restore the previously-focused element on close, but only if it's
      // still in the DOM and focusable.
      if (previouslyFocused && previouslyFocused.isConnected) {
        try {
          previouslyFocused.focus();
        } catch {
          /* element may have been removed — ignore */
        }
      }
    };
  }, [active, onEscape, ref]);
}
