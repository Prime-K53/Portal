/**
 * Prime PORTAL — Customer Registration Request Service
 *
 * Approval-gated public intake for customer registration:
 *
 *   Create Account
 *       ↓
 *   POST /api/portal/registration-requests   (anonymous, Idempotency-Key)
 *       ↓
 *   PENDING request (CREG-YYYY-######) → pending confirmation screen
 *
 * A successful submission creates ONLY a pending request. It NEVER creates
 * an ERP customer, portal user, password hash, JWT, refresh token, session,
 * or authenticated state — the applicant remains anonymous until an ERP
 * administrator approves the request and the invitation/activation flow
 * issues credentials.
 *
 * Single-company ERP: no tenant_id / organization_id / company_id fields are
 * ever sent. The shared API client (owned by the auth service) is reused —
 * no second HTTP client is created. All calls use `skipAuth: true` because
 * the applicant is unauthenticated by design.
 */

import { ApiError, type ApiClient } from './apiClient';
import { authService } from './authService';
import type {
  RegistrationRequestInput,
  RegistrationRequestResponse,
  RegistrationRequestStatus,
  RegistrationRequestStatusResponse,
} from '../types';

/** Machine-readable outcome of a registration-request call. */
export type RegistrationRequestErrorKind =
  | 'duplicate-pending'
  | 'duplicate-customer'
  | 'invalid-referral'
  | 'validation'
  | 'rate-limited'
  | 'network'
  | 'not-found'
  | 'conflict'
  | 'unknown';

/** Typed error for registration-request failures (never a session error). */
export class RegistrationRequestError extends Error {
  readonly kind: RegistrationRequestErrorKind;
  readonly status: number | null;
  /** Existing CREG number carried by a 409 duplicate-pending response, if any. */
  readonly existingRequestNumber: string | null;

  constructor(
    message: string,
    options?: {
      kind?: RegistrationRequestErrorKind;
      status?: number | null;
      existingRequestNumber?: string | null;
    }
  ) {
    super(message);
    this.name = 'RegistrationRequestError';
    this.kind = options?.kind ?? 'unknown';
    this.status = options?.status ?? null;
    this.existingRequestNumber = options?.existingRequestNumber ?? null;
  }
}

/**
 * Extracts a CREG-YYYY-###### request number embedded in backend text (the
 * duplicate-pending 409 message carries the existing number in parentheses).
 */
export function extractRequestNumber(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = /CREG-\d{4}-\d+/i.exec(text);
  return match ? match[0].toUpperCase() : null;
}

/**
 * Builds the idempotency headers for a registration-request mutation. The
 * caller generates ONE key per logical submission attempt
 * (utils/idempotency.ts) and reuses it for retries of the SAME attempt so a
 * network timeout can never create a second request.
 */
export function buildRegistrationIdempotencyHeaders(idempotencyKey: string): Record<string, string> {
  return { 'Idempotency-Key': idempotencyKey };
}

function resolveClient(override?: ApiClient): ApiClient {
  const client = override ?? authService.getApiClient?.() ?? null;
  if (!client) {
    throw new RegistrationRequestError(
      'The ERP Portal API is not configured yet. Please try again later.',
      { kind: 'unknown' }
    );
  }
  return client;
}

function detailsText(details: unknown): string {
  return typeof details === 'string' ? details : '';
}

/**
 * Normalizes any failure from the registration-request endpoints into a
 * RegistrationRequestError with a machine-readable kind. The ERP error shape
 * is `{ error: <human text> }` (surfaced as ApiError.message); the
 * duplicate-pending message embeds the existing CREG number.
 */
export function toRegistrationRequestError(error: unknown): RegistrationRequestError {
  if (error instanceof RegistrationRequestError) return error;
  if (error instanceof ApiError) {
    const message = error.message || 'Registration failed. Please try again.';
    if (error.isNetworkError || error.code === 'NOT_CONFIGURED') {
      return new RegistrationRequestError(
        'We could not reach the registration service. Your request may still have been received — retrying is safe and will not create a duplicate.',
        { kind: 'network', status: error.status }
      );
    }
    if (error.status === 429) {
      return new RegistrationRequestError(
        'Too many attempts right now. Please wait a moment and try again.',
        { kind: 'rate-limited', status: error.status }
      );
    }
    if (error.status === 409) {
      const existingRequestNumber =
        extractRequestNumber(message) ?? extractRequestNumber(detailsText(error.details));
      if (/pending/i.test(message)) {
        return new RegistrationRequestError(
          'A registration request with these details is already pending review.',
          { kind: 'duplicate-pending', status: error.status, existingRequestNumber }
        );
      }
      return new RegistrationRequestError(
        'An account with these details already exists. Please sign in instead.',
        { kind: 'duplicate-customer', status: error.status }
      );
    }
    if (error.status === 400) {
      const combined = `${message} ${detailsText(error.details)}`;
      if (/INVALID_REFERRAL|invalid referral/i.test(combined)) {
        return new RegistrationRequestError(
          'The referral code is invalid or has expired. Check the code and try again, or continue without it.',
          { kind: 'invalid-referral', status: error.status }
        );
      }
      return new RegistrationRequestError(message, { kind: 'validation', status: error.status });
    }
    if (error.status === 404) {
      return new RegistrationRequestError(
        'Registration request not found. Check the request number and email address.',
        { kind: 'not-found', status: error.status }
      );
    }
    return new RegistrationRequestError(message, { kind: 'unknown', status: error.status });
  }
  return new RegistrationRequestError(
    error instanceof Error ? error.message : 'Registration failed. Please try again.',
    { kind: 'unknown' }
  );
}

/** ERP 201 / public-DTO payload (request identity + status only). */
interface ErpRegistrationRequestDto {
  requestNumber?: string;
  status?: string;
  submittedAt?: string | null;
  message?: string;
}

function toStatusResponse(dto: ErpRegistrationRequestDto): RegistrationRequestStatusResponse {
  return {
    requestNumber: dto.requestNumber ?? '',
    status: (dto.status ?? 'pending') as RegistrationRequestStatus,
    submittedAt: dto.submittedAt ?? null,
  };
}

/**
 * Submits a public registration request (anonymous — no session is created,
 * no tokens are stored, no navigation to authenticated pages happens here).
 *
 * `idempotencyKey` identifies ONE logical submission attempt: generate it
 * once when the user submits and reuse the SAME key when retrying that
 * attempt. A NEW attempt (different applicant details) needs a NEW key.
 */
export async function submitRegistrationRequest(
  input: RegistrationRequestInput,
  idempotencyKey: string,
  client?: ApiClient
): Promise<RegistrationRequestResponse> {
  const body: Record<string, string> = {
    companyName: input.companyName.trim(),
    contactName: input.contactName.trim(),
    email: input.email.trim().toLowerCase(),
  };
  const phone = input.phone?.trim();
  if (phone) body.phone = phone;
  if (input.tier) body.tier = input.tier;
  if (input.referredByCode) body.referredByCode = input.referredByCode;
  // NOTE: password / credential / tenant fields are NEVER sent — the backend
  // strips them at the boundary and a request is an application, not an
  // account.

  try {
    const response = await resolveClient(client).post<ErpRegistrationRequestDto>(
      '/portal/registration-requests',
      body,
      { skipAuth: true, headers: buildRegistrationIdempotencyHeaders(idempotencyKey) }
    );
    if (!response?.requestNumber) {
      throw new RegistrationRequestError(
        'The registration service returned an unexpected response. Please check your request status before retrying.',
        { kind: 'unknown' }
      );
    }
    return {
      requestNumber: response.requestNumber,
      status: (response.status ?? 'pending') as RegistrationRequestStatus,
      submittedAt: response.submittedAt ?? new Date().toISOString(),
      message: response.message,
    };
  } catch (error) {
    throw toRegistrationRequestError(error);
  }
}

/**
 * Anonymous status lookup — requires the applicant email as proof of
 * ownership. The backend deliberately answers 404 on email mismatch so
 * request numbers cannot be enumerated; that behavior is preserved here.
 */
export async function getRegistrationRequestStatus(
  requestNumber: string,
  email: string,
  client?: ApiClient
): Promise<RegistrationRequestStatusResponse> {
  try {
    const path =
      `/portal/registration-requests/${encodeURIComponent(requestNumber.trim())}` +
      `?email=${encodeURIComponent(email.trim().toLowerCase())}`;
    const response = await resolveClient(client).get<ErpRegistrationRequestDto>(path, {
      skipAuth: true,
    });
    return toStatusResponse(response);
  } catch (error) {
    throw toRegistrationRequestError(error);
  }
}

/**
 * Applicant cancellation — requires the original email; only pending
 * requests can be cancelled (the ERP rejects other transitions with 409).
 * Never creates a session.
 */
export async function cancelRegistrationRequest(
  requestNumber: string,
  email: string,
  idempotencyKey?: string,
  client?: ApiClient
): Promise<RegistrationRequestStatusResponse> {
  try {
    const response = await resolveClient(client).post<ErpRegistrationRequestDto>(
      `/portal/registration-requests/${encodeURIComponent(requestNumber.trim())}/cancel`,
      { email: email.trim().toLowerCase() },
      {
        skipAuth: true,
        ...(idempotencyKey ? { headers: buildRegistrationIdempotencyHeaders(idempotencyKey) } : {}),
      }
    );
    return toStatusResponse(response);
  } catch (error) {
    // The ERP rejects cancelling a reviewed request with 409
    // `Invalid registration request transition: <from> → <to>` — that is a
    // state conflict, not a duplicate customer. Classify it before the
    // generic 409 mapping runs.
    if (
      error instanceof ApiError &&
      error.status === 409 &&
      /Invalid registration request transition/i.test(error.message)
    ) {
      throw new RegistrationRequestError(
        'Only pending requests can be cancelled. This request has already been reviewed.',
        { kind: 'conflict', status: error.status }
      );
    }
    throw toRegistrationRequestError(error);
  }
}

// ── Pending-state persistence (refresh-safe minimum) ─────────────────────────
//
// Only the minimum needed to display/re-retrieve the pending state is kept:
// requestNumber + email + status. NEVER password, token, JWT, refresh token,
// or other credential material.

/** sessionStorage key for the applicant-visible pending registration. */
export const PENDING_REGISTRATION_STORAGE_KEY = 'portal_registration_pending';

export interface PendingRegistrationInfo {
  requestNumber: string;
  email: string;
  status: string;
  submittedAt: string | null;
}

/** Minimal storage surface so tests can inject a fake without a DOM. */
export interface PendingStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultPendingStorage(): PendingStorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) return window.sessionStorage;
    return null;
  } catch {
    return null;
  }
}

/** Persists the safe pending minimum after the backend accepts the request. */
export function writePendingRegistration(
  info: PendingRegistrationInfo,
  storage?: PendingStorageLike | null
): void {
  const store = storage ?? defaultPendingStorage();
  if (!store) return;
  try {
    store.setItem(PENDING_REGISTRATION_STORAGE_KEY, JSON.stringify(info));
  } catch {
    // Storage unavailable — the pending screen simply will not survive reload.
  }
}

/** Reads the persisted pending minimum, or null when absent/invalid. */
export function readPendingRegistration(
  storage?: PendingStorageLike | null
): PendingRegistrationInfo | null {
  const store = storage ?? defaultPendingStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(PENDING_REGISTRATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingRegistrationInfo>;
    if (!parsed || typeof parsed.requestNumber !== 'string' || !parsed.requestNumber) return null;
    return {
      requestNumber: parsed.requestNumber,
      email: typeof parsed.email === 'string' ? parsed.email : '',
      status: typeof parsed.status === 'string' ? parsed.status : 'pending',
      submittedAt: typeof parsed.submittedAt === 'string' ? parsed.submittedAt : null,
    };
  } catch {
    return null;
  }
}

/** Clears the persisted pending state (e.g. after cancellation). */
export function clearPendingRegistration(storage?: PendingStorageLike | null): void {
  const store = storage ?? defaultPendingStorage();
  if (!store) return;
  try {
    store.removeItem(PENDING_REGISTRATION_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}
