// Offline support: serve the app shell from cache when there's no signal. Always tries the network first,
// so updates you upload to GitHub show up on the next open. Never caches Google or AI responses.
const CACHE = 'aios-v1';
const SHELL = ['./', 'index.html', 'app.js', 'app.css', 'icon.svg', 'manifest.webmanifest', 'js/api.js', 'js/store.js', 'js/google.js', 'js/ai.js', 'js/core.js', 'js/plan.js', 'js/assist.js', 'js/pipeline.js', 'js/connectors.js', 'js/dates.js', 'js/demo.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
