// Offline support: precache the whole app shell, serve cache-first, refresh in the background.
const VERSION = 'starhop-v1';
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'manifest.webmanifest',
  'fonts/baloo2-latin.woff2',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
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
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (hit) {
        e.waitUntil(net);
        return hit;
      }
      return (await net) || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
    }),
  );
});
