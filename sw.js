// Offline support: precache the whole app shell. Requests go to the network first (with
// `cache: 'no-cache'` revalidation) so every deploy shows up on the next load; the cache is only
// used when the network is unavailable.
const VERSION = 'starhop-v2'; // bump when the asset list changes; activate deletes older caches
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'manifest.webmanifest',
  'fonts/baloo2-latin.woff2',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'data/levels.json',
  'js/main.js',
  'js/audio.js',
  'js/fx.js',
  'js/game.js',
  'js/genclient.js',
  'js/genworker.js',
  'js/genworker-core.js',
  'js/levels.js',
  'js/progression.js',
  'js/render.js',
  'js/rng.js',
  'js/ships.js',
  'js/sim.js',
  'js/solver.js',
  'js/ui.js',
  'js/worlds.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      try {
        // Navigation requests cannot be re-initialised, so fetch them by URL.
        const res = await fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache' });
        if (res.ok) e.waitUntil(cache.put(req, res.clone()));
        return res;
      } catch {
        const hit = await cache.match(req, { ignoreSearch: true });
        return hit || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
      }
    }),
  );
});
