// new-milkdrop- · Teil 14b: Partitur (ab Build 102)
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Dieser Teil ändert window.__AM_STEP NICHT: bricht er ab, läuft alles weiter wie vor Build 102 (Scan ohne Klangrollen-Partitur, ohne Speicher).
if (window.__AM_STEP !== 14) throw new Error('new-milkdrop-: Teil 14b (partitur) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== Was ist die Partitur? =====
// Ein geladener Track wird komplett vorab analysiert, BEVOR er spielt. Ergebnis = „Partitur“:
//   1. der bisherige Scan (Tempo, Raster, Abschnitte, Drops, Klangbild, Klangmesser; js/14-track-scan.js)
//   2. NEU: die Klangrollen (js/08b-klangrollen.js) laufen einmal offline über den ganzen Track, genau wie live
//      (Spektrum wie ein AnalyserNode mit 4096er-FFT, ohne Glättung, 60 Bilder pro Sekunde). Pro Takt bleibt übrig:
//      mittlere Hüllkurve von Kick, Acid, Hats, Pads, Filteröffnung, Filtertempo, Neuheit und welche Rolle in dem Takt NEU einsetzt.
// Die Partitur ist klein (ein paar hundert KB) und wird in IndexedDB „nmd-partitur“ gespeichert. Lädt man dieselbe Datei wieder
// (gleicher Name, gleiche Größe, gleiches Änderungsdatum), ist sie sofort da.
//
// Analyse-Version: steigt, sobald sich an Scan oder Partitur etwas ändert, das andere Ergebnisse gibt. Ältere Einträge gelten dann
// nicht mehr (werden neu gerechnet und beim Aufräumen entfernt).
const PARTITUR_V = 1;
const PT_DB = 'nmd-partitur';                        // eigene Datenbank (Vorsatz nmd-, Acid benutzt sie nie)
const PT_MAX_N = 200, PT_MAX_MB = 50;                // Aufräumen: höchstens so viele Tracks und so viele MB, die am längsten unbenutzten fliegen zuerst
const PT_FPS = 60;                                   // Bilder pro Sekunde wie live (AKCFG.padHoldFrames und kickRiseFrames zählen Bilder)
const PT_ROLLEN = ['kick', 'acid', 'hats', 'pads', 'cut', 'sq', 'nov'];   // Felder pro Takt (je 0..255): Hüllkurven, acid_cutoff, acid_squelch, ak_novelty
const ptKey = f => f.name + '|' + f.size + '|' + (f.lastModified || 0) + '|v' + PARTITUR_V;

// ===== Klangrollen offline über den ganzen Track =====
// buf: dekodierter Ton (AudioBuffer), A: Scan mit Raster. Rechnet das Spektrum selbst (Blackman-Fenster, |X|/N in dB, wie
// AnalyserNode.getFloatFrequencyData mit smoothingTimeConstant 0) und gibt es an akCreate().step, mit dem Raster aus dem Scan.
// Bei 22050 Hz (sparsam dekodierte lange Tracks) gibt es kein Hats-Band über 11 kHz: hats bleibt dort niedrig (steht im Protokoll).
async function partiturRollen(buf, A, alive, report) {
  if (!A || !A.grid || !(A.beatS > 0) || typeof akCreate !== 'function') return null;
  const sr = buf.sampleRate, N = sr >= 32000 ? 4096 : 2048;   // ca. 11 Hz pro Stufe wie live
  const F = kmFFT(N), win = new Float32Array(N), spec = new Float32Array(N / 2);
  for (let i = 0; i < N; i++) win[i] = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / N) + 0.08 * Math.cos(4 * Math.PI * i / N);
  const S = akCreate(sr, N);
  const L = buf.getChannelData(0), Rc = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
  const barS = 4 * A.beatS, bar0 = A.beat0 + (A.barPhase || 0) * A.beatS;
  const nBars = Math.max(0, Math.floor((buf.duration - bar0) / barS));
  if (nBars < 1) return null;
  const K = PT_ROLLEN.length, sum = new Float32Array(nBars * K), cnt = new Uint16Array(nBars), ent = new Uint8Array(nBars);
  const bit = { kick: 1, acid: 2, hats: 4, pads: 8 };
  let curBar = -1;
  S.onEntry = n => { if (curBar >= 0) ent[curBar] |= bit[n]; };
  const total = Math.floor(buf.duration * PT_FPS), invN = 1 / N, nb = N / 2;
  const hiBin = Math.min(nb - 1, Math.round(16000 / (sr / N)) + 1);   // akCreate liest nur bis 16 kHz
  const grid = { bpm: 60 / A.beatS, pos: 0, sec: -1, secStart: 0 };
  for (let i = 1; i <= total; i++) {
    const t = i / PT_FPS, end = Math.floor(t * sr), start = end - N;
    for (let k = 0; k < N; k++) {
      const j = start + k; let v = 0;
      if (j >= 0 && j < L.length) v = Rc ? 0.5 * (L[j] + Rc[j]) : L[j];
      F.re[k] = v * win[k]; F.im[k] = 0;
    }
    F.run();
    for (let k = 0; k <= hiBin; k++) { const m = Math.sqrt(F.re[k] * F.re[k] + F.im[k] * F.im[k]) * invN; spec[k] = m > 0 ? 20 * Math.log10(m) : -Infinity; }
    grid.pos = (t - A.beat0) / A.beatS - (A.barPhase || 0); grid.sec = -1; grid.secStart = 0;
    const sc = A.sections && A.sections.length && typeof sectionAt === 'function' ? sectionAt(A, t) : null;
    if (sc) { grid.sec = AK_SCAN_SEC[sc.type] || 0; grid.secStart = Math.round((sc.t0 - A.beat0) / A.beatS - (A.barPhase || 0)); }
    const b = Math.floor((t - bar0) / barS);
    curBar = b >= 0 && b < nBars ? b : -1;
    S.step(spec, t * 1000, 1000 / PT_FPS, grid);
    if (curBar >= 0) {
      const o = S.out, q = curBar * K;
      sum[q] += o.kick_env; sum[q + 1] += o.acid_env; sum[q + 2] += o.hats_env; sum[q + 3] += o.pads_env;
      sum[q + 4] += o.acid_cutoff; sum[q + 5] += o.acid_squelch; sum[q + 6] += o.ak_novelty; cnt[curBar]++;
    }
    if ((i & 7) === 0) {
      if (!alive()) return SCAN_STOP;
      if (report && (i & 255) === 0) report(i / total);
      await scanYield();                             // Häppchen: während Musik ca. 6 ms, sonst 30 ms am Stück (js/14-track-scan.js)
    }
  }
  const v = new Uint8Array(nBars * K);
  for (let b = 0; b < nBars; b++) for (let k = 0; k < K; k++) v[b * K + k] = Math.round(255 * akClamp(cnt[b] ? sum[b * K + k] / cnt[b] : 0));
  return { n: nBars, bar0, barS, f: PT_ROLLEN, v, ent, sr, fft: N };
}
// Wert einer Rolle in Takt b (0..1); null, wenn es keine Partitur gibt
function ptRolle(A, b, name) {
  const P = A && A.rollen; if (!P || b < 0 || b >= P.n) return null;
  const k = P.f.indexOf(name); return k < 0 ? null : P.v[b * P.f.length + k] / 255;
}
function ptSummary(A) {
  const P = A && A.rollen; if (!P) return '';
  const K = P.f.length, m = k => { let s = 0; for (let b = 0; b < P.n; b++) s += P.v[b * K + k]; return (s / P.n / 255).toFixed(2).replace('.', ','); };
  const e = { kick: 0, acid: 0, hats: 0, pads: 0 }; for (let b = 0; b < P.n; b++) { if (P.ent[b] & 1) e.kick++; if (P.ent[b] & 2) e.acid++; if (P.ent[b] & 4) e.hats++; if (P.ent[b] & 8) e.pads++; }
  return P.n + ' Takte · env Ø Kick ' + m(0) + ' · Acid ' + m(1) + ' · Hats ' + m(2) + ' · Pads ' + m(3) + ' · NEU Kick ' + e.kick + ', Acid ' + e.acid + ', Hats ' + e.hats + ', Pads ' + e.pads
    + (P.sr < 32000 ? ' · (' + P.sr + ' Hz: Hats nicht messbar)' : '');
}

// ===== Speicher (IndexedDB „nmd-partitur“) =====
// Zwei Fächer: „meta“ (klein: Schlüssel, zuletzt benutzt, Größe, Name) zum Aufräumen und „data“ (die Partitur selbst).
let ptDbP = null;
function ptDb() {
  if (!ptDbP) ptDbP = new Promise(res => {
    try {
      const r = indexedDB.open(PT_DB, 1);
      r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' }); if (!db.objectStoreNames.contains('data')) db.createObjectStore('data'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null); r.onblocked = () => res(null);
    } catch (e) { res(null); }
  });
  return ptDbP;
}
const ptReq = r => new Promise(res => { r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); });
// Ungefähre Größe in Bytes (Zahlenreihen genau, der Rest grob)
function ptBytes(o, d = 0) {
  if (o == null || d > 6) return 8;
  if (ArrayBuffer.isView(o)) return o.byteLength;
  if (typeof o === 'string') return 2 * o.length;
  if (typeof o !== 'object') return 8;
  let s = 16; for (const k in o) s += 2 * k.length + ptBytes(o[k], d + 1); return s;
}
// Speicherbare Form: ohne Datei-Objekt und ohne Zwischenwerte (_drops), die beim Abspielen neu entstehen
function ptStrip(A) { const o = {}; for (const k in A) if (k !== 'file' && k[0] !== '_') o[k] = A[k]; return o; }
async function ptLoad(file) {
  try {
    const db = await ptDb(); if (!db) return null;
    const k = ptKey(file), tx = db.transaction(['meta', 'data'], 'readwrite');
    const A = await ptReq(tx.objectStore('data').get(k));
    if (!A || typeof A !== 'object') return null;
    const m = await ptReq(tx.objectStore('meta').get(k));
    if (m) { m.at = Date.now(); tx.objectStore('meta').put(m); }   // zuletzt benutzt: fliegt beim Aufräumen später
    return A;
  } catch (e) { return null; }
}
async function ptSave(file, A) {
  try {
    const db = await ptDb(); if (!db) return false;
    const k = ptKey(file), o = ptStrip(A), sz = ptBytes(o);
    await new Promise((res, rej) => {
      const tx = db.transaction(['meta', 'data'], 'readwrite');
      tx.objectStore('data').put(o, k); tx.objectStore('meta').put({ k, at: Date.now(), sz, name: file.name });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
    await ptTidy(db);
    return true;
  } catch (e) { err('Partitur speichern fehlgeschlagen: ' + (e && e.message || e)); return false; }
}
// Aufräumen: alte Analyse-Versionen sofort, dann die am längsten unbenutzten, bis höchstens PT_MAX_N Tracks und PT_MAX_MB übrig sind
async function ptTidy(db) {
  const all = await ptReq(db.transaction('meta').objectStore('meta').getAll()) || [];
  const v = '|v' + PARTITUR_V, drop = all.filter(m => !m.k.endsWith(v)), keep = all.filter(m => m.k.endsWith(v)).sort((a, b) => b.at - a.at);
  let n = 0, bytes = 0;
  for (const m of keep) { n++; bytes += m.sz || 0; if (n > PT_MAX_N || bytes > PT_MAX_MB * 1048576) drop.push(m); }
  if (!drop.length) return;
  await new Promise(res => { const tx = db.transaction(['meta', 'data'], 'readwrite'); for (const m of drop) { tx.objectStore('meta').delete(m.k); tx.objectStore('data').delete(m.k); } tx.oncomplete = res; tx.onerror = res; tx.onabort = res; });
  rea('Partitur-Speicher aufgeräumt: ' + drop.length + ' alte Einträge entfernt');
}
// Für Protokoll und Test: wie viel liegt im Speicher
async function ptStats() {
  const db = await ptDb(); if (!db) return { n: 0, mb: 0 };
  const all = await ptReq(db.transaction('meta').objectStore('meta').getAll()) || [];
  return { n: all.length, mb: +(all.reduce((s, m) => s + (m.sz || 0), 0) / 1048576).toFixed(2) };
}
ptStats().then(s => { if (s.n) rea('Partitur-Speicher: ' + s.n + ' Tracks, ' + s.mb.toFixed(1).replace('.', ',') + ' MB'); }).catch(() => {});
