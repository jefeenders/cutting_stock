// Service worker: the app works offline at the mill after one online visit.
// App files: cache-first from a versioned cache, precached on install.
// UPDATE RULE: bump VERSION in every deploy that changes any app file, and keep FILES in step with
// the app (pwa.check.js fails otherwise). Phones then fetch the new files on their next visit and
// show them on the visit after that (this visit still runs the old cached files).
const VERSION = 'v2';
const APP = 'app-' + VERSION, FONTS = 'fonts';
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'view.js', 'cutting-plan.js',
  'parts.json', 'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png'
];

self.addEventListener('install', e => e.waitUntil(
  // cache: 'reload' skips the HTTP cache, so a fresh deploy can't be precached from stale copies
  caches.open(APP).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())
));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== APP && k !== FONTS).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

// Google Fonts (Barlow): stylesheet and font files cached on first use. Offline without them the
// request fails and the CSS falls back to system-ui.
const fromCache = (cache, req) => caches.open(cache).then(c => c.match(req, { ignoreSearch: cache === APP }).then(hit =>
  hit || fetch(req).then(r => { if (cache === FONTS && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; })));

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const { origin, hostname } = new URL(e.request.url);
  if (origin === location.origin) e.respondWith(fromCache(APP, e.request));
  else if (hostname === 'fonts.googleapis.com' || hostname === 'fonts.gstatic.com') e.respondWith(fromCache(FONTS, e.request));
});
