/* LEARNING ACTIVITY — Service Worker
   Tujuan: aplikasi bisa dipasang di HP & terbuka cepat. Data (Apps Script) TIDAK pernah di-cache di sini.
   Strategi:
   - Berkas aplikasi (HTML/CSS/JS milik sendiri): jaringan dulu → cadangan dari cache bila offline.
     Jadi setelah `git push`, versi terbaru langsung dipakai tanpa perlu mengosongkan cache.
   - Font/CDN (Bootstrap, Google Fonts, SheetJS): pakai cache lalu perbarui diam-diam.
   - Apps Script & login Google: selalu langsung ke jaringan.
   Naikkan VERSION bila daftar PRECACHE berubah. */
const VERSION = 'la-pwa-v1';
const SHELL = VERSION + '-shell';
const RUNTIME = VERSION + '-rt';
const PRECACHE = [
  './', 'index.html', 'manifest.json',
  'css/style.css', 'js/config.js', 'js/api.js', 'js/auth.js', 'js/app.js', 'js/pwa.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];
const BYPASS_HOSTS = ['script.google.com', 'script.googleusercontent.com', 'accounts.google.com', 'apis.google.com', 'www.googleapis.com', 'oauth2.googleapis.com'];
const NET_TIMEOUT = 6000;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.indexOf(VERSION) !== 0).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((r) => { clearTimeout(t); resolve(r); }, (err) => { clearTimeout(t); reject(err); });
  });
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await withTimeout(fetch(req), NET_TIMEOUT);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    if (req.mode === 'navigate') { const idx = await cache.match('index.html') || await cache.match('./'); if (idx) return idx; }
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(req);
  const net = fetch(req).then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  if (BYPASS_HOSTS.indexOf(url.hostname) >= 0) return;          // data & login: tidak dicegat
  if (url.origin === self.location.origin) { e.respondWith(networkFirst(req, SHELL)); return; }
  e.respondWith(staleWhileRevalidate(req));
});
