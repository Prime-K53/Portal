/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** ERP Portal API base URL. Intentionally left unset until the exact PrimeERPsystem Portal API contract is imported (Phase 3). */
  readonly VITE_API_URL?: string;
  /** Request timeout in milliseconds. Defaults to 15000. */
  readonly VITE_API_TIMEOUT_MS?: string;
  /** DEVELOPMENT ONLY — 'true' serves the in-memory mock PortalService. Never set in production. */
  readonly VITE_ENABLE_MOCK_API?: string;
  /** DEVELOPMENT ONLY — 'true' enables the in-memory mock AuthService. Never set in production. */
  readonly VITE_ENABLE_MOCK_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
