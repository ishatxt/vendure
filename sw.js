/* Vendure service worker — offline app shell + runtime font cache */
const VERSION = 'vendure-v6';
const SHELL = [
  './',
  './index.html',
  './share.html',
  './manifest.json',
  './src/style.css',
  './src/share.css',
  './src/app.js',
  './src/constants.js',
  './src/garden.js',
  './src/ui.js',
  './src/share.js',
  './src/share-page.js',
  './src/garden-state.js',
  './src/poster.js',
  './src/export.js',
  './src/input.js',
  './src/draw.js',
  './src/layout.js',
  './src/growth.js',
  './src/butterflies.js',
  './src/frame.js',
  './src/palettes.js',
  './src/math.js',
  './src/encoders.js',
  './src/state.js',
  './assets/icon.png'
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* navigations: network-first so a deploy shows up, offline falls back to the
     page that was asked for (share.html is not index.html) */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true })
          .then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  /* Google Fonts: cache-first so the garden keeps its typeface offline */
  if (FONT_HOSTS.indexOf(url.hostname) !== -1) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  /* same-origin assets: stale-while-revalidate */
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
  }
});
