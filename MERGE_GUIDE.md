# Prime PORTAL Integration & Merging Guide for PrimeERPsystem

This document provides step-by-step instructions for integrating and merging this **Prime PORTAL** customer module into the core **PrimeERPsystem** repository ([https://github.com/Prime-K53/PrimeERPsystem.git](https://github.com/Prime-K53/PrimeERPsystem.git)).

---

## 🏗️ Architecture Overview

The **Prime PORTAL** module is engineered as a clean, modular React TypeScript feature package located at:
```
/src/features/customer-portal
```

### Module Structure
```
src/features/customer-portal/
├── CustomerPortalApp.tsx              # Main entry view & tab orchestrator
├── index.ts                           # Barrel export for seamless imports
├── types.ts                           # TypeScript interface definitions
├── data.ts                            # Initial/sample data for standalone preview
├── services/
│   └── portalApiAdapter.ts            # ERP API adapter connecting UI to /api/portal/*
└── components/
    ├── AuthPage.tsx                   # B2B Sign In / Sign Up (credential-based)
    ├── Sidebar.tsx                    # Desktop navigation bar & brand header
    ├── MobileHeader.tsx               # Mobile header bar & top bar
    ├── BottomNavigation.tsx           # Mobile navigation bar
    ├── NotificationDrawer.tsx         # Notification drawer
    ├── modals/                        # Modals (Payment, Invoices, Deliveries, Orders, Quotes)
    ├── tabs/                          # Feature tabs (Overview, Invoices, Deliveries, Orders, Quotes, Statements, Referrals, Account)
    └── state/                         # Loading / Error / Empty state components
```

### Data & Authentication Architecture

```
UI → PortalService (hooks) → apiClient → ERP Portal API
UI → AuthService (useAuth) → JWT access token → authenticated session → customer_id
```

- `services/portalService.ts` — typed Portal data boundary (invoices, orders, quotes,
  deliveries, statements, referrals, catalog, account).
- `services/authService.ts` — authentication abstraction (`login`, `logout`,
  `refreshSession`, `getCurrentUser`, `getSession`, `isAuthenticated`).
- `services/apiClient.ts` — centralized HTTP client (GET/POST/PUT/PATCH/DELETE,
  bearer auth, timeouts, normalized errors, 401 refresh/retry).
- `config/env.ts` — centralized environment configuration.
- Routing is hash-based (`#/dashboard`, `#/invoices`, ...) with protected routes;
  unauthenticated users always reach `#/login`.

When integrating with PrimeERPsystem's existing `CustomerAuthProvider`, connect
the Sasa `AuthService` to the Portal authentication endpoints and map
`PortalUser.customerId` → `customers.id`.

---

## 🚀 Step-by-Step Merge Instructions into PrimeERPsystem

### Step 1: Copy Customer Portal Module
In the `PrimeERPsystem` workspace repository, copy the feature directory into the frontend workspace:
```bash
cp -r src/features/customer-portal <path-to-PrimeERPsystem>/frontend/src/features/customer-portal
```

Alternatively, if you prefer mounting inside `views/portal`:
```bash
cp -r src/features/customer-portal <path-to-PrimeERPsystem>/frontend/views/portal/PrimeCustomerPortal
```

---

### Step 2: Register Route in `frontend/App.tsx` or `CustomerLayout.tsx`

In `frontend/App.tsx` of PrimeERPsystem, import `CustomerPortalApp` and register its route:

```tsx
import { CustomerPortalApp } from './features/customer-portal';

// Inside your Router configuration:
<Route path="/portal/client-app/*" element={<CustomerPortalApp />} />
```

Or if integrating with PrimeERPsystem's existing `CustomerAuthProvider`:
```tsx
import { CustomerPortalApp } from './features/customer-portal';
import { useCustomerAuth } from './context/CustomerAuthContext';

export default function IntegratedCustomerPortal() {
  const { user, logout } = useCustomerAuth();

  return (
    <CustomerPortalApp
      initialProfileData={{
        customerName: user?.full_name || 'Client Contact',
        email: user?.email || '',
        accountNumber: user?.customer_id || 'CUST-001',
      }}
    />
  );
}
```

---

### Step 3: Configure Environment Variables

Create or update `.env` inside `frontend/` of PrimeERPsystem:
```env
VITE_API_URL=https://your-erp-host
```
> Note: `VITE_API_URL` is intentionally unset in this repository until the exact
> ERP Portal API contract is imported (Phase 3 of the Sasa replacement). The
> mock implementations (`VITE_ENABLE_MOCK_API`, `VITE_ENABLE_MOCK_AUTH`) are
> DEVELOPMENT ONLY and must never be enabled in production.

---

### Step 4: Backend Express Routes Verification (`backend/routes/portal.cjs`)

PrimeERPsystem's Express backend provides matching routes in `backend/routes/portal.cjs`:
- `GET /api/portal/catalog` → Live inventory product catalog with stock status & pricing
- `GET /api/portal/ads` & `/api/portal/promotions` → Banner promotional ads and special marketing offers
- `GET /api/portal/invoices` → Customer unpaid & historic invoices
- `POST /api/portal/payments` → Receives real payment prompts & notifies ERP finance
- `GET /api/portal/shipments` → Live delivery dispatch & tracking notifications
- `GET /api/portal/orders` & `POST /api/portal/orders` → Order management
- `GET /api/portal/requests` & `POST /api/portal/requests` → Custom Quote RFQs
- `GET /api/portal/statements` → Financial customer ledger entries
- `GET /api/portal/referrals` → B2B referral tracking & rewards

The Sasa frontend does not call these endpoints yet: the exact ERP Portal API
contract must first be imported into `src/features/customer-portal/services/`
(see `docs/SASA_PHASE_2_FOUNDATION.md`).

---

## 🧪 Testing & Verification

1. Run frontend typecheck:
   ```bash
   npm run typecheck --workspace=frontend
   ```
2. Run backend & frontend concurrently:
   ```bash
   npm run dev
   ```
3. Navigate to `http://localhost:5173/portal/client-app` to test the integrated portal.
