const CACHE_PREFIX = 'hukuk-portal-';
const CACHE_NAME = `${CACHE_PREFIX}2026-09-23-v3`;
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest'];
const DYNAMIC_PATHS = new Set(['/healthz', '/robots.txt', '/sitemap.xml', '/feed.xml']);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then(cache => cache.addAll(APP_SHELL))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

async function cacheResponse(request, response) {
  if (!response || !response.ok || response.type === 'opaque') return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

async function navigationResponse(request) {
  try {
    const response = await fetch(request);
    if (response.ok && /text\/html/i.test(response.headers.get('content-type') || '')) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put('/index.html', response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || (await caches.match('/index.html')) || Response.error();
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== 'GET') return;
  if (DYNAMIC_PATHS.has(url.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request));
    return;
  }

  if (!['script', 'style', 'image', 'font', 'manifest'].includes(request.destination)) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then(response => cacheResponse(request, response));
    if (cached) {
      event.waitUntil(network.catch(() => undefined));
      return cached;
    }
    return (await network.catch(() => null)) || Response.error();
  })());
});
