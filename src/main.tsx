import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ContractVerify from './views/portal/ContractVerify';
import {registerServiceWorker} from './pwa/pwa';
import {initSentry} from './sentry';
import { assertEnvAtBoot } from './features/customer-portal/config/env';
import './index.css';

assertEnvAtBoot();
initSentry();

const isStandaloneContractVerify = (): boolean => {
  if (typeof window === 'undefined') return false;
  const path = String(window.location.pathname || '').replace(/\/+$/, '');
  return /(^|\/)verify$/.test(path);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isStandaloneContractVerify() ? <ContractVerify /> : <App />}
  </StrictMode>,
);

// PWA: production-only service worker (installable app + offline shell).
registerServiceWorker();
