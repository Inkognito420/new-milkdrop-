// Acid Milkdrop · Offline-Speicher (Service Worker)
// Zweck: Die App startet auch ohne Netz (Club, Zug), sobald sie einmal geladen war. Gespeichert wird alles, was zum Start nötig ist:
// die eigenen Dateien (Liste in app-files.js) und die drei Butterchurn-Bibliotheken vom CDN.
// Die Build-Nummer kommt aus dem Aufruf (sw.js?b=46): neuer Build = neuer Speicher, der alte wird beim Aktivieren gelöscht.
const B = new URL(self.location.href).searchParams.get('b') || '0';
const CACHE = 'acid-' + B;
importScripts('app-files.js?b=' + B);

const CDN = [
  'https://cdn.jsdelivr.net/npm/butterchurn@2.6.7/lib/butterchurn.min.js',
  'https://cdn.jsdelivr.net/npm/butterchurn-presets@2.4.7/lib/butterchurnPresets.min.js',
  'https://cdn.jsdelivr.net/npm/butterchurn-presets@2.4.7/lib/butterchurnPresetsExtra.min.js'
];
const APP = ['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'acid-bild-gold.jpg', 'acid-bild-kugel.jpg',
  'style.css?b=' + B, 'app-files.js?b=' + B].concat(self.AM_FILES.map(f => f + '?b=' + B));
const NAV_WAIT = 3000;                         // Netz zu langsam (schlechter Empfang)? Nach 3 s kommt die gespeicherte Seite

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(APP.map(u => new Request(u, { cache: 'reload' })));              // eigene Dateien: alles oder nichts
    await Promise.allSettled(CDN.map(u => c.add(new Request(u, { cache: 'reload' }))));   // CDN: wenn es klappt; sonst beim nächsten Mal
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('acid-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const store = (req, res) => { if (res && res.ok) { const c = res.clone(); caches.open(CACHE).then(ca => ca.put(req, c)); } return res; };

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin && u.hostname !== 'cdn.jsdelivr.net') return;   // Schriften u. a. laufen am Speicher vorbei
  if (r.mode === 'navigate') {                  // Seite selbst: erst Netz (damit Updates ankommen), sonst gespeichert
    const net = fetch(r).then(res => store(r, res));
    const wait = new Promise(res => setTimeout(() => res(null), NAV_WAIT));
    e.respondWith(Promise.race([net, wait]).then(res => res || caches.match(r, { ignoreSearch: true }).then(m => m || net))
      .catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match('index.html'))));
    return;
  }
  e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => store(r, res))));    // alles andere: gespeichert zuerst
});
