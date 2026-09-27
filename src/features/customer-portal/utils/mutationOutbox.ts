/**
 * Prime PORTAL — Offline mutation outbox (honest offline, no silent loss).
 *
 * Mutations made while offline (or 503-offline from the SW) are persisted to
 * localStorage with their Idempotency-Key so reconnect + retry replays the
 * SAME logical attempt instead of creating duplicates. The ERP remains the
 * idempotency authority; the outbox only preserves intent + key.
 *
 * Scope is deliberately narrow: order requests, payment requests, referrals,
 * support tickets/messages. Reads never queue.
 */

export interface OutboxEntry {
  id: string;
  kind: 'order-request' | 'payment-request' | 'referral' | 'support-ticket' | 'support-message';
  idempotencyKey: string;
  payload: unknown;
  createdAt: string;
  attempts: number;
}

const STORAGE_KEY = 'portal_mutation_outbox';
const MAX_ENTRIES = 50;
/** Entries older than this are never replayed — intent goes stale. */
export const OUTBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Entries failing this many times need human attention, not auto-retry. */
export const MAX_OUTBOX_ATTEMPTS = 5;

function isExpired(entry: OutboxEntry, now = Date.now()): boolean {
  const created = Date.parse(entry.createdAt);
  if (Number.isNaN(created)) return true;
  return now - created > OUTBOX_TTL_MS;
}

/** True while an entry is still worth an automatic replay attempt. */
export function isOutboxEntryRetryable(entry: OutboxEntry): boolean {
  return !isExpired(entry) && entry.attempts < MAX_OUTBOX_ATTEMPTS;
}

function readAll(): OutboxEntry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OutboxEntry[];
    if (!Array.isArray(parsed)) return [];
    // Lazily prune expired entries so stale intent can never replay.
    const now = Date.now();
    const fresh = parsed.filter((e) => e && !isExpired(e, now));
    if (fresh.length !== parsed.length) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh.slice(0, MAX_ENTRIES)));
      } catch {
        // ignore
      }
    }
    return fresh;
  } catch {
    return [];
  }
}

function writeAll(entries: OutboxEntry[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // Quota / private mode — intent is lost, caller already surfaced offline copy.
  }
}

export function enqueueOutbox(entry: Omit<OutboxEntry, 'id' | 'createdAt' | 'attempts'>): OutboxEntry {
  const full: OutboxEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  const all = readAll();
  // Same idempotency key = same logical attempt — replace, don't duplicate.
  const deduped = all.filter((e) => e.idempotencyKey !== full.idempotencyKey);
  writeAll([full, ...deduped]);
  try {
    window.dispatchEvent(new CustomEvent('portal-outbox-changed'));
  } catch {
    // ignore
  }
  return full;
}

export function listOutbox(): OutboxEntry[] {
  return readAll();
}

export function removeOutboxEntry(id: string): void {
  writeAll(readAll().filter((e) => e.id !== id));
  try {
    window.dispatchEvent(new CustomEvent('portal-outbox-changed'));
  } catch {
    // ignore
  }
}

export function bumpOutboxAttempts(id: string): void {
  writeAll(readAll().map((e) => (e.id === id ? { ...e, attempts: e.attempts + 1 } : e)));
}

export function isOfflineError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; status?: number; message?: string };
  if (e.code === 'NETWORK_ERROR' || e.code === 'TIMEOUT') return true;
  if (e.status === 503 && /offline/i.test(String((e as { message?: string }).message ?? ''))) return true;
  try {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  } catch {
    return false;
  }
}
