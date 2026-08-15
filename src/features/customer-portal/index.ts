/**
 * Prime PORTAL - Customer Portal Feature Module
 * Self-contained B2B Client Management Portal designed for seamless standalone preview
 * and direct merge into PrimeERPsystem (https://github.com/Prime-K53/PrimeERPsystem.git).
 *
 * Architecture: UI → Portal service → API client → ERP Portal API.
 * Mock data is DEVELOPMENT ONLY (VITE_ENABLE_MOCK_API=true) and is NOT exported
 * from this barrel.
 */

export { CustomerPortalApp } from './CustomerPortalApp';
export { AuthPage } from './components/AuthPage';
export { Sidebar } from './components/Sidebar';
export { MobileHeader } from './components/MobileHeader';
export { BottomNavigation } from './components/BottomNavigation';
export { NotificationDrawer } from './components/NotificationDrawer';

// Modals
export { PaymentModal } from './components/modals/PaymentModal';
export { InvoiceDetailModal } from './components/modals/InvoiceDetailModal';
export { DeliveryTrackingModal } from './components/modals/DeliveryTrackingModal';
export { QuoteRequestModal } from './components/modals/QuoteRequestModal';
export { CartDrawer } from './components/modals/CartDrawer';
export { CommandPaletteModal } from './components/modals/CommandPaletteModal';

// Tabs
export { DashboardTab } from './components/tabs/DashboardTab';
export { InvoicesTab } from './components/tabs/InvoicesTab';
export { DeliveriesTab } from './components/tabs/DeliveriesTab';
export { OrdersTab } from './components/tabs/OrdersTab';
export { QuotesTab } from './components/tabs/QuotesTab';
export { StatementsTab } from './components/tabs/StatementsTab';
export { ReferralsTab } from './components/tabs/ReferralsTab';
export { AccountTab } from './components/tabs/AccountTab';

// State components
export { LoadingState, EmptyState, ErrorState, PortalDataBoundary } from './components/state/PortalDataBoundary';

// Services (auth + portal data boundaries; API client)
export { authService, portalService, ApiError, AuthError, createApiClient } from './services';
export type {
  AuthService,
  PortalService,
  ApiClient,
  ApiClientDependencies,
  ApiErrorCode,
  ApiRequestOptions,
  HttpMethod,
  AuthErrorCode,
} from './services';

// Types & Domain Models
export * from './types';