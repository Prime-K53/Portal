/**
 * Prime PORTAL — Session Token Storage (ERP contract)
 *
 * The ONLY module allowed to persist authentication material. Implements the
 * Phase 3 ERP contract exactly:
 *
 *   storage: sessionStorage
 *   key:     portal_session
 *   value:   { access_token, refresh_token, expires_in, user }
 *
 * Access tokens are NEVER written to localStorage. Refresh tokens never appear
 * in application code — they live only inside this envelope, read by the auth
 * service for refresh/logout calls.
 */

import { env } from '../config/env';

/** ERP session envelope stored in sessionStorage under `portal_session`. */
export interface PortalSessionEnvelope {
  access_token: string;
  refresh_token: string;
  expires_in: string;
  user: {
    id: string;
    customer_id: string;
    email: string;
    full_name?: string;
    phone?: string;
  };
}

const sessionKey = env.sessionStorageKey;

function readEnvelope(): PortalSessionEnvelope | null {
  try {
    const raw = window.sessionStorage.getItem(sessionKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PortalSessionEnvelope;
    if (!parsed || typeof parsed.access_token !== 'string' || !parsed.access_token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const tokenStore = {
  /** Returns the current ERP JWT access token, or null. */
  getAccessToken(): string | null {
    return readEnvelope()?.access_token ?? null;
  },

  /** Returns the ERP refresh token (auth service use only). */
  getRefreshToken(): string | null {
    return readEnvelope()?.refresh_token ?? null;
  },

  /** Returns the authenticated ERP user embedded in the session envelope. */
  getUser(): PortalSessionEnvelope['user'] | null {
    const envelope = readEnvelope();
    return envelope?.user ?? null;
  },

  /** Replaces the whole ERP session envelope. */
  writeEnvelope(envelope: PortalSessionEnvelope): void {
    try {
      window.sessionStorage.setItem(sessionKey, JSON.stringify(envelope));
    } catch {
      // Storage unavailable — session simply will not survive reload.
    }
  },

  /** Reads the ERP session envelope, or null when absent/invalid. */
  readEnvelope(): PortalSessionEnvelope | null {
    return readEnvelope();
  },

  /** Clears the ERP session (logout / unrecoverable auth failure). */
  clearEnvelope(): void {
    try {
      window.sessionStorage.removeItem(sessionKey);
    } catch {
      // Ignore storage failures.
    }
  },
};
