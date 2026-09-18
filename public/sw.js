/*
 * Prime PORTAL service worker.
 *
 * Strategy:
 *   - /api/*            → NETWORK ONLY. Never cached: business data, auth and
 *                         ERP documents must always come from the server.
 *   - navigations        → network-first, fall back to cache, then offline.html
 *   - static assets      → stale-while-revalidate (scripts/styles/images/fonts)
 *
 * Version bump the CACHE_NAME to invalidate everything on deploy.
 */
const CACHE_NAME = 'prime-portal-v5';
const PRECACHE = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
];
const MAX_CACHE_ENTRIES = 120;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isStaticAsset(request) {
  const url = new URL(request.url);
  return (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest' ||
    /\.(css|js|mjs|png|jpg|jpeg|svg|webp|ico|woff2?)$/i.test(url.pathname)
  );
}

/** Stale-while-revalidate for same-origin + Google Fonts static assets. */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (response && (response.ok || response.type === 'opaque')) {
        await capCache(cache);
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);
  return cached || (await network) || Response.error();
}

async function capCache(cache) {
  try {
    const keys = await cache.keys();
    if (keys.length >= MAX_CACHE_ENTRIES) {
      // Delete oldest entries (FIFO approximation) to bound storage.
      await cache.delete(keys[0]);
    }
  } catch (_) {
    // ignore
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Business data & official documents: ALWAYS the network. Mutations offline
  // get an explicit JSON 503 (not a hanging fetch) so the UI can show
  // "you're offline — retry" instead of NETWORK_ERROR.
  if (url.pathname.startsWith('/api/')) {
    if (request.method !== 'GET') {
      event.respondWith(
        fetch(request).catch(
          () =>
            new Response(JSON.stringify({ message: 'You are offline. Your change was not sent — please retry when back online.', offline: true }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            })
        )
      );
    }
    return;
  }

  if (request.method !== 'GET') return;

  // App navigations: network-first → cache → offline shell.
  // Hash routes (#/invoices) share one document — cache by pathname so all
  // tabs share the shell entry.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          await capCache(cache);
          // Normalize hash navigations to the pathname entry.
          cache.put(request, fresh.clone());
          return fresh;
        } catch (_) {
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match(request, { ignoreSearch: true })) ||
            (await cache.match('/index.html')) ||
            (await cache.match('/offline.html')) ||
            new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
          );
        }
      })()
    );
    return;
  }

  // Same-origin static assets + Google Fonts: stale-while-revalidate.
  if (
    isStaticAsset(request) ||
    url.hostname.endsWith('fonts.googleapis.com') ||
    url.hostname.endsWith('fonts.gstatic.com')
  ) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
