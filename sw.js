// Service worker: deja la app disponible sin conexión.
const CACHE = 'puno-y-letra-v3';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'css/archivero.css',
  'js/app.js', 'js/capture.js', 'js/chars.js', 'js/db.js', 'js/glyphs.js', 'js/icons.js', 'js/layout.js', 'js/look.js', 'js/paper.js',
  'js/print.js', 'js/refs.js', 'js/skeleton.js', 'js/template.js', 'js/theme.js', 'js/util.js', 'js/wordmark.js', 'js/writer.js',
  'fonts/caveat-500.woff2', 'fonts/inter-latin-400-normal.woff2', 'fonts/inter-latin-500-normal.woff2', 'fonts/inter-latin-600-normal.woff2',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Primero la red (así siempre ves la última versión); si no hay conexión, lo guardado.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((m) => m || caches.match('index.html')))
  );
});
