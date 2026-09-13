/**
 * Prime PORTAL — Services Barrel
 */

export { ApiError, createApiClient } from './apiClient';
export type { ApiClient, ApiClientDependencies, ApiErrorCode, ApiRequestOptions, HttpMethod } from './apiClient';
export { AuthError, authService, createAuthService, erpApiBaseUrl, PORTAL_SESSION_EXPIRED_EVENT } from './authService';
export type { AuthService, AuthErrorCode, LoginOutcome } from './authService';
export { MockAuthService } from './authService';
export {
  RegistrationRequestError,
  PENDING_REGISTRATION_STORAGE_KEY,
  buildRegistrationIdempotencyHeaders,
  cancelRegistrationRequest,
  clearPendingRegistration,
  extractRequestNumber,
  getRegistrationRequestStatus,
  readPendingRegistration,
  submitRegistrationRequest,
  toRegistrationRequestError,
  writePendingRegistration,
} from './registrationRequestService';
export type {
  PendingRegistrationInfo,
  PendingStorageLike,
  RegistrationRequestErrorKind,
} from './registrationRequestService';
export { MockPortalService } from './mockPortalService';
export { createPortalService, portalService } from './portalService';
export type { PortalService } from './portalService';
export { ErpSseService, sseService } from './sseService';
export type { SseEventHandlers } from './sseService';
export { tokenStore } from './tokenStore';