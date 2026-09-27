/**
 * Prime PORTAL — Real-time events (VERIFIED ERP contract)
 *
 * Verified from the PrimeERPsystem source (backend/routes/portal.cjs + portalLifecycleService.cjs):
 *
 * 1. POST /api/portal/events-ticket      (Bearer) → { ticket, expiresIn: 300 }
 * 2. EventSource /api/portal/events?token=<ticket>  (5-minute JWT ticket)
 * 3. The ERP emits NAMED events — the browser's `onmessage` handler does NOT
 *    fire for named events, so both names are registered with addEventListener:
 *      event: entity_changed   data: { customerId, docType, docId, event, eventType?, status?, docNumber?, metadata?, updatedAt? }
 *      event: notification     data: { customerId, type, title, body, link?, actorName?, createdAt }
 *
 * The server sends `retry: 15000` and a `: ping` heartbeat every 25s.
 * Tickets live ~5 minutes, so a fresh ticket is fetched before EVERY connect
 * and reconnect. Messages are deduplicated to survive reconnect bursts.
 *
 * The service is inert while not started; usePortalEvents() starts it when the
 * user is authenticated and stops it on logout/unmount.
 */

import type { ErpEntityChangedEvent, ErpNotificationEvent, ErpSseEvent } from '../types';
import type { ApiClient } from './apiClient';
import { authService, erpApiBaseUrl } from './authService';

export interface SseEventHandlers {
  onEntityChanged?: (event: ErpEntityChangedEvent) => void;
  onNotification?: (notification: ErpNotificationEvent) => void;
  onConnected?: () => void;
  onError?: (error: Error) => void;
}

interface PendingTicket {
  ticket: string;
  expiresAt: number;
}

const BASE_RECONNECT_MS = 2000;
const MAX_RECONNECT_MS = 30000;
// Tickets live ~5 minutes — proactively re-ticket before expiry while open.
const TICKET_REFRESH_MS = 4.5 * 60 * 1000;

export class ErpSseService {
  private readonly client: ApiClient;
  private source: EventSource | null = null;
  private handlers: SseEventHandlers | null = null;
  private reconnectTimer: number | null = null;
  private ticketRefreshTimer: number | null = null;
  private reconnectAttempts = 0;
  private disposed = false;
  private visibilityListener: (() => void) | null = null;
  private readonly seen = new Set<string>();
  private readonly seenMax = 200;

  constructor(client: ApiClient) {
    this.client = client;
  }

  get isConnected(): boolean {
    return this.source?.readyState === EventSource.OPEN;
  }

  /** Starts the event stream (idempotent). Refreshes the ticket on reconnect. */
  start(handlers: SseEventHandlers): void {
    // A previous stop() must never permanently wedge the stream: starting
    // again (e.g. next login) re-arms everything.
    this.disposed = false;
    this.handlers = handlers;
    if (this.source || this.reconnectTimer) return;
    this.watchVisibility();
    this.open();
  }

  stop(): void {
    this.disposed = true;
    this.handlers = null;
    this.clearTimers();
    this.closeSource();
    this.unwatchVisibility();
    this.seen.clear();
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private clearTimers(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ticketRefreshTimer !== null) {
      window.clearTimeout(this.ticketRefreshTimer);
      this.ticketRefreshTimer = null;
    }
  }

  /** Pause the stream while the tab is hidden — no point holding it open. */
  private watchVisibility(): void {
    if (this.visibilityListener || typeof document === 'undefined') return;
    const onChange = () => {
      try {
        if (document.hidden) {
          this.closeSource();
          this.clearTimers();
        } else if (!this.disposed && this.handlers && !this.source && !this.reconnectTimer) {
          this.open();
        }
      } catch {
        // ignore
      }
    };
    this.visibilityListener = onChange;
    document.addEventListener('visibilitychange', onChange);
  }

  private unwatchVisibility(): void {
    if (this.visibilityListener && typeof document !== 'undefined') {
      try {
        document.removeEventListener('visibilitychange', this.visibilityListener);
      } catch {
        // ignore
      }
    }
    this.visibilityListener = null;
  }

  private closeSource(): void {
    if (this.source) {
      this.source.close();
      this.source = null;
    }
  }

  private async open(): Promise<void> {
    if (this.disposed) return;

    let ticket: PendingTicket | null = null;
    try {
      const response = await this.client.post<{ ticket: string; expiresIn?: number }>('/portal/events-ticket');
      if (!response?.ticket) {
        throw new Error('The ERP returned no events ticket.');
      }
      ticket = { ticket: response.ticket, expiresAt: Date.now() + (response.expiresIn ?? 300) * 1000 };
    } catch (error) {
      // Auth failure or network error → retry later; the auth layer reports 401s.
      this.scheduleReconnect();
      this.handlers?.onError?.(error instanceof Error ? error : new Error('Failed to obtain an events ticket.'));
      return;
    }

    const baseUrl = erpApiBaseUrl();
    if (!baseUrl) {
      this.scheduleReconnect();
      return;
    }
    const source = new EventSource(`${baseUrl}/portal/events?token=${encodeURIComponent(ticket.ticket)}`);
    this.source = source;

    source.onopen = () => {
      this.reconnectAttempts = 0;
      this.scheduleTicketRefresh();
      this.handlers?.onConnected?.();
    };

    // The ERP writes NAMED events (`event: notification` / `event: entity_changed`).
    // Named events never reach `onmessage` — they must be registered per name.
    source.addEventListener('entity_changed', (message) => {
      try {
        const data = JSON.parse(message.data as string) as ErpEntityChangedEvent;
        this.dispatch({ name: 'entity_changed', data });
      } catch {
        // Malformed payloads are never fatal.
      }
    });

    source.addEventListener('notification', (message) => {
      try {
        const data = JSON.parse(message.data as string) as ErpNotificationEvent;
        this.dispatch({ name: 'notification', data });
      } catch {
        // Malformed payloads are never fatal.
      }
    });

    source.onerror = () => {
      this.closeSource();
      // EventSource auto-reconnect races with manual reconnects; always settle
      // on ONE authoritative source. A fresh ticket is fetched on every retry
      // because tickets expire after ~5 minutes.
      if (!this.reconnectTimer && !this.disposed) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer !== null) return;
    // Exponential backoff with jitter: 2s, 4s, 8s … capped at 30s, so a
    // flapping backend doesn't get hammered on a fixed cadence.
    const backoff = Math.min(MAX_RECONNECT_MS, BASE_RECONNECT_MS * 2 ** this.reconnectAttempts);
    const delay = backoff / 2 + Math.random() * (backoff / 2);
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.disposed) return;
      void this.open();
    }, delay);
  }

  /** Re-ticket an open stream before the 5-minute ticket expires. */
  private scheduleTicketRefresh(): void {
    if (this.ticketRefreshTimer !== null) {
      window.clearTimeout(this.ticketRefreshTimer);
    }
    this.ticketRefreshTimer = window.setTimeout(() => {
      this.ticketRefreshTimer = null;
      if (this.disposed || !this.handlers) return;
      this.closeSource();
      void this.open();
    }, TICKET_REFRESH_MS);
  }

  private dispatch(event: ErpSseEvent): void {
    if (!this.handlers || this.disposed) return;

    if (event.name === 'entity_changed') {
      const data = event.data;
      const key = `e_${data.docType}_${data.docId}_${data.event}_${data.status ?? ''}_${data.updatedAt ?? ''}`;
      if (this.isDuplicate(key)) return;
      this.handlers.onEntityChanged?.(data);
      return;
    }

    if (event.name === 'notification') {
      const data = event.data;
      const key = `n_${data.createdAt}_${data.type}_${data.title}_${data.body ?? ''}_${data.link ?? ''}`;
      if (this.isDuplicate(key)) return;
      this.handlers.onNotification?.(data);
    }
  }

  private isDuplicate(key: string): boolean {
    if (this.seen.has(key)) return true;
    this.seen.add(key);
    if (this.seen.size > this.seenMax) {
      const first = this.seen.values().next().value;
      if (first) this.seen.delete(first);
    }
    return false;
  }
}

/**
 * Application-wide SSE singleton. In mock mode the EventSource has no real
 * stream, so the mock auth/portal data path simply never starts it
 * (usePortalEvents gates on the real backend flag).
 */
export const sseService: ErpSseService = new ErpSseService(authService.getApiClient?.() ?? (null as unknown as ApiClient));
