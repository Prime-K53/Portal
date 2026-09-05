import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {registerServiceWorker} from './pwa/pwa';
import {initSentry} from './sentry';
import './index.css';

initSentry();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA: production-only service worker (installable app + offline shell).
registerServiceWorker();
