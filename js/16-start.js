// Acid Milkdrop · Teil 16 von 16: System: Wachhalter, Sichtbarkeit, Start
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Reihenfolge ist wichtig: index.html lädt sie nacheinander. Bricht ein Teil ab, starten die folgenden nicht.
if (window.__AM_STEP !== 15) throw new Error('Acid Milkdrop: Teil 16 (start) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== System =====
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); viz = null; say('Grafik wurde vom System pausiert. Startet neu …'); });
canvas.addEventListener('webglcontextrestored', () => { if (createViz()) say(''); });
// Bildschirm-Wachhalter: Weg 1 = Wake-Lock-API, Weg 2 (falls Weg 1 fehlt oder scheitert) = winziges stummes Video-Loop
let wakeSentinel = null, wakeVideo = null, wakeState = '', wakeTries = 0;
const WAKE_MP4 = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMzbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAl10cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAHVbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAgABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABgG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAUBzdGJsAAAAuHN0c2QAAAAAAAAAAQAAAKhhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2MC4zMS4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAALmF2Y0MBQsAK/+EAFmdCwArZHsBEAAADAAQAAAMAEDxImSABAAVoy4PLIAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAAqAAAAKgAAAABhzdHRzAAAAAAAAAAEAAAAEAAAgAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAAEAAAAAQAAACRzdHN6AAAAAAAAAAAAAAAEAAACgwAAAAoAAAAKAAAACQAAABRzdGNvAAAAAAAAAAEAAANjAAAAYnVkdGEAAABabWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAtaWxzdAAAACWpdG9vAAAAHWRhdGEAAAABAAAAAExhdmY2MC4xNi4xMDAAAAAIZnJlZQAAAqhtZGF0AAACcAYF//9s3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NCByMzEwOCAzMWUxOWY5IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyMyAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTAgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MToweDExMSBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MCBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0wIHdlaWdodHA9MCBrZXlpbnQ9MjUwIGtleWludF9taW49MiBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgcmNfbG9va2FoZWFkPTQwIHJjPWNyZiBtYnRyZWU9MSBjcmY9MjMuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAAAtliIQFPJigAD+/gAAAAAZBmjgKeoAAAAAGQZpUAp6gAAAABUGaYBL1';
const WAKE_WEBM = 'data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAInEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggEeTbuMU6uEHFO7a1OsggIR7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjAuMTYuMTAwV0GNTGF2ZjYwLjE2LjEwMESJiECfQAAAAAAAFlSua8GuAQAAAAAAADjXgQFzxYjFMvH4un7ZEJyBACK1nIN1bmSIgQCGhVZfVlA4g4EBI+ODhB3NZQDgibCBELqBEJqBAhJUw2f8c3OgY8CAZ8iaRaOHRU5DT0RFUkSHjUxhdmY2MC4xNi4xMDBzc9ZjwItjxYjFMvH4un7ZEGfIoUWjh0VOQ09ERVJEh5RMYXZjNjAuMzEuMTAyIGxpYnZweGfIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDIuMDAwMDAwMDAwAB9DtnXt54EAo6OBAACAEAIAnQEqEAAQAABHCIWFiIWEiAICAAwNYAD+/6tQgKOVgQH0ALEBAAEQEAAYABhYL/QACAAAo5WBA+gAsQEAARAQABgAGFgv9AAIAACjlYEF3ACxAQABEBAAGAAYWC/0AAgAABxTu2uRu4+zgQC3iveBAfGCAZ/wgQM=';
function wakeLog(s) { if (s !== wakeState) { wakeState = s; rea('Bildschirm-Wachhalter: ' + s); } }
function wakeFallback(why) {
  if (panicked) return;
  try {
    if (!wakeVideo) {
      wakeVideo = document.createElement('video');
      wakeVideo.muted = true; wakeVideo.loop = true; wakeVideo.setAttribute('playsinline', ''); wakeVideo.setAttribute('muted', '');
      wakeVideo.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;left:0;top:0';
      for (const [u, ty] of [[WAKE_MP4, 'video/mp4'], [WAKE_WEBM, 'video/webm']]) { const so = document.createElement('source'); so.src = u; so.type = ty; wakeVideo.appendChild(so); }
      document.body.appendChild(wakeVideo); wakeVideo.load();
    }
    wakeVideo.play().then(() => wakeLog('an über Video-Ersatz (' + why + ')'), e => wakeLog('Video-Ersatz wartet auf Tipp (' + why + '; ' + (e && e.name) + ')'));
  } catch (e) { wakeLog('aus (' + why + '; ' + (e && e.message) + ')'); }
}
async function requestWake() {
  if (panicked || document.visibilityState !== 'visible') return;
  if (wakeSentinel && !wakeSentinel.released) return;
  if (!('wakeLock' in navigator)) { wakeFallback('API fehlt'); return; }
  try {
    wakeSentinel = await navigator.wakeLock.request('screen');
    wakeLog('an (Wake-Lock)');
    wakeSentinel.addEventListener('release', () => { if (!panicked) wakeLog('Sperre freigegeben, hole sie neu'); wakeSentinel = null; setTimeout(requestWake, 300); });
  } catch (e) {
    wakeTries++; wakeLog('Wake-Lock abgelehnt (' + (e && e.name) + ')'); wakeFallback('Wake-Lock abgelehnt');
  }
}
// erster Tipp und Start der Wiedergabe: nochmal versuchen (manche Browser erlauben es erst nach einer Berührung)
['pointerdown', 'touchend', 'click'].forEach(ev => document.addEventListener(ev, () => { if (!wakeSentinel || wakeSentinel.released) requestWake(); if (wakeVideo && wakeVideo.paused) wakeVideo.play().then(() => wakeLog('an über Video-Ersatz (nach Tipp)'), () => {}); }, { capture: true, passive: true }));
audio.addEventListener('playing', () => requestWake());
document.addEventListener('visibilitychange', () => {
  // Build 49: Nach dem Hintergrund beginnt die Bildraten-Messung neu. Sonst teilt der erste Tick die wenigen Bilder durch die ganze versteckte Zeit (Protokoll: "2 fps"),
  // und die Lastbremse senkt die Auflösung eines Presets für 3 Tage, obwohl es nie langsam war.
  if (document.visibilityState === 'visible') { fpsT = performance.now(); frameCount = 0; slowSecs = 0; requestWake(); if (wakeVideo && wakeVideo.paused) wakeVideo.play().catch(() => {}); unlock(); resize(); jrSplit('h'); }
  else { slowSecs = 0; saveProfiles(performance.now()); jrEnd('h'); jrSave(performance.now(), true); }
});
window.addEventListener('pagehide', () => { saveProfiles(performance.now()); jrEnd('h'); jrSave(performance.now(), true); });

if (createViz()) requestWake();
loop();

// ===== Notaus (Build 50) =====
// Schaltet sofort alles ab, was Ton, Mikrofon, Bildschirmsperre oder Grafik belegt, und lässt nichts mehr von allein anlaufen.
// Wirkt, solange die Seite noch auf Eingaben reagiert (auch bei sehr langsamer Grafik). Hängt die Seite ganz, kann sie selbst nichts mehr tun:
// dafür gibt es unten den Hänger-Wächter, der es aufschreibt und das Bild beim nächsten Start sperrt.
function panic(why) {
  if (panicked) return;
  panicked = true; wantPlay = false;
  err('NOTAUS (' + why + ')');
  const tun = f => { try { f(); } catch (e) {} };
  tun(() => { queue.length = 0; curFile = null; });                  // laufende Scans hören am nächsten Teilstück auf
  tun(() => { audio.pause(); audio.removeAttribute('src'); audio.load(); });
  tun(() => { if (silentEl) { silentEl.pause(); silentEl.removeAttribute('src'); silentEl.load(); silentEl = null; } });
  tun(bufStop);
  tun(() => { if (micOn) stopMic(); });
  tun(() => { if (wakeSentinel) wakeSentinel.release(); });
  tun(() => { if (wakeVideo) { wakeVideo.pause(); wakeVideo.remove(); wakeVideo = null; } });
  tun(() => { viz = null; });                                         // die Schleife zeichnet nichts mehr
  tun(() => ctx.suspend());
  tun(() => { if (navigator.mediaSession) { navigator.mediaSession.playbackState = 'none'; navigator.mediaSession.metadata = null; } });
  tun(() => { for (const c of [canvas, shEl, fxc]) c.style.display = 'none'; hud.style.display = 'none'; });
  tun(() => { $('panicBox').hidden = false; });
  tun(() => lastLogSave(true));
}
$('panic').addEventListener('click', () => panic('Knopf'));
$('panicReload').addEventListener('click', () => location.reload());
window.addEventListener('touchstart', e => { if (e.touches && e.touches.length >= 3) panic('drei Finger'); }, { passive: true, capture: true });

// ===== Hänger-Wächter (Build 50) =====
// Ein Web Worker läuft auf einem eigenen Faden und bekommt jede Sekunde ein Lebenszeichen der Seite samt dem, was gerade lief. Bleibt es bei sichtbarer Seite
// länger als 6 s aus, schreibt der Worker das in die Datenbank (IndexedDB), und zwar fortlaufend, auch wenn die Seite nie zurückkommt. Beim nächsten Start
// steht es im Protokoll; ein Bild, bei dem die Seite nicht zurückkam oder über 10 s stand, ist dann 7 Tage gesperrt.
const WD_SRC = `
let last = Date.now(), vis = true, crumb = null, hung = 0, since = 0, hungCrumb = null, db = null;
const put = (k, v) => { try { db && db.transaction('k', 'readwrite').objectStore('k').put(v, k); } catch (e) {} };
try { const r = indexedDB.open('acid-wd', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => { db = r.result; }; } catch (e) {}
onmessage = e => {
  const m = e.data; last = Date.now(); vis = m.vis; if (m.crumb) crumb = m.crumb;
  if (hung) { put('hang', { at: since, ms: last - since, crumb: hungCrumb, recovered: true }); hung = 0; }
};
setInterval(() => {
  const ms = Date.now() - last;
  if (vis && ms > 6000) { if (!hung) { hung = 1; since = last; hungCrumb = crumb; } put('hang', { at: since, ms, crumb: hungCrumb, recovered: false }); }
}, 1000);`;
const SUSPECT_KEY = 'am-suspect-v1', SUSPECT_TTL = 7 * 86400;
{ const now = Date.now() / 1000, l = store.get(SUSPECT_KEY, []);
  if (Array.isArray(l)) for (const e of l) if (e && typeof e.n === 'string' && e.t > now - SUSPECT_TTL) suspect.add(e.n); }
function wdRead() {                                                   // liest und löscht den Eintrag des Wächters vom letzten Lauf
  return new Promise(res => {
    try {
      const r = indexedDB.open('acid-wd', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onerror = () => res(null);
      r.onsuccess = () => { const st = r.result.transaction('k', 'readwrite').objectStore('k'), g = st.get('hang'); g.onsuccess = () => { if (g.result) st.delete('hang'); res(g.result || null); }; g.onerror = () => res(null); };
    } catch (e) { res(null); }
  });
}
wdRead().then(h => {
  if (!h || !h.ms) return;
  const c = h.crumb || {}, secs = Math.round(h.ms / 1000);
  err('Letzter Lauf hing ' + secs + ' s (' + (h.recovered ? 'kam zurück' : 'kam nicht zurück') + ') · zuletzt: ' + (c.txt || 'unbekannt'));
  if (c.n && (!h.recovered || h.ms > 10000)) {
    suspect.add(c.n);
    const l = store.get(SUSPECT_KEY, []); l.push({ n: c.n, t: Math.floor(Date.now() / 1000) }); store.set(SUSPECT_KEY, l.slice(-30));
    sayFor('Der letzte Lauf ist bei „' + c.n + '“ hängen geblieben. Dieses Bild kommt 7 Tage nicht mehr vor.', 14000);
  }
});
let wd = null;
try { wd = new Worker(URL.createObjectURL(new Blob([WD_SRC], { type: 'text/javascript' }))); } catch (e) { rea('Hänger-Wächter nicht verfügbar: ' + (e && e.message)); }
const wdBeat = withCrumb => { if (!wd || panicked) return; const m = { vis: document.visibilityState === 'visible' };
  if (withCrumb) m.crumb = { n: curName || '', txt: (curName || '–') + ' · ' + W + '×' + H + ' · Lastbremse Stufe ' + curStep + ' · ' + (audio.paused ? 'Pause' : 'spielt') + ' · Abschnitt ' + sectionKey() };
  try { wd.postMessage(m); } catch (e) {} };
setInterval(() => wdBeat(true), 1000);
document.addEventListener('visibilitychange', () => wdBeat(false));

window.__AM_STEP = 16;
