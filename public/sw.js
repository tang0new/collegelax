const CACHE_NAME = 'college-lacrosse-v2';
const PRECACHE_URLS = ['/', '/rankings', '/about'];
const STATIC_PATH_PREFIXES = ['/_astro/', '/platform-logos/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_URLS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (
    event.request.mode === 'navigate' ||
    requestUrl.pathname.startsWith('/admin') ||
    requestUrl.pathname.startsWith('/api')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  const shouldCache =
    PRECACHE_URLS.includes(requestUrl.pathname) ||
    STATIC_PATH_PREFIXES.some((prefix) => requestUrl.pathname.startsWith(prefix));

  if (!shouldCache) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match('/'));
    })
  );
});
