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

const DEFAULT_RECONNECT_MS = 4000;

export class ErpSseService {
  private readonly client: ApiClient;
  private source: EventSource | null = null;
  private handlers: SseEventHandlers | null = null;
  private reconnectTimer: number | null = null;
  private disposed = false;
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
    this.handlers = handlers;
    if (this.source || this.reconnectTimer) return;
    this.open();
  }

  stop(): void {
    this.disposed = true;
    this.handlers = null;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.closeSource();
    this.seen.clear();
  }

  // ── Internals ─────────────────────────────────────────────────────────────

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
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.disposed) return;
      void this.open();
    }, DEFAULT_RECONNECT_MS);
  }

  private dispatch(event: ErpSseEvent): void {
    if (!this.handlers || this.disposed) return;

    if (event.name === 'entity_changed') {
      const data = event.data;
      const key = `e_${data.docType}_${data.docId}_${data.event}`;
      if (this.isDuplicate(key)) return;
      this.handlers.onEntityChanged?.(data);
      return;
    }

    if (event.name === 'notification') {
      const data = event.data;
      const key = `n_${data.createdAt}_${data.title}`;
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
