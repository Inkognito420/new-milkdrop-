// Acid Milkdrop · Teil 6 von 16: Mitschreiben: was lief, wozu, was damit gemacht wurde
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Reihenfolge ist wichtig: index.html lädt sie nacheinander. Bricht ein Teil ab, starten die folgenden nicht.
if (window.__AM_STEP !== 5) throw new Error('Acid Milkdrop: Teil 6 (mitschrift) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== Mitschreiben (Build 34): was lief, wozu, und was damit gemacht wurde =====
// Jeder Preset-/Shader-Lauf wird als eine Zeile festgehalten, dazu pro Track ein kleiner Steckbrief aus dem Scan.
// Alles bleibt im Browser (localStorage), nichts wird gesendet. „Sichern/Laden“ gleicht Safari und Icon ab.
// Anlass-Buchstaben (Start und Ende eines Laufs): i Grafik neu gestartet, a unbestimmt, t Zeitgeber, f Phrase, s Abschnittswechsel, l Track-Flug gestartet (Build 36 bis 47, wird nicht mehr geschrieben),
//   n Wischen weiter, p Wischen zurück, d Doppeltipp (Schnitt), g Wächter/Fehler (kein Geschmackssignal), x Einstellung, k Track-/Quellenwechsel, h Seite im Hintergrund.
// Flags: 1 Stern gesetzt, 2 gehalten (Freeze), 4 Stern entfernt, 8 eigener Shader, 16 war Favorit, 32 Scan aktiv, 64 Mikro, 128 Lastbremse (Auflösung verkleinert, ab Build 35).
const JR_KEY = 'am-journal-v1', JR_RUNS = 2500, JR_TRACKS = 80, JR_SESS = 120;
const JR_COLS = ['ts', 'name', 'dur', 'start', 'end', 'sec', 'flags', 'track', 'pos', 'kick', 'acid', 'hat', 'bright', 'energy', 'acidMood', 'bpm', 'touches', 'sinceTouch', 'freeze'];
const SEC1 = { intro: 'i', groove: 'g', break: 'b', buildup: 'u', drop: 'd', outro: 'o' };
const jrInt = (v, d = 0) => { v = Math.round(+v); return isFinite(v) ? v : d; };
const jrNum = (v, dec) => { v = +v; return isFinite(v) ? +v.toFixed(dec) : 0; };
const jrCh = (v, d) => (typeof v === 'string' && v ? v[0] : d);
// Eine Zeile prüfen und in feste Form bringen (gilt auch für geladene Dateien)
function jrClean(r) {
  if (!Array.isArray(r) || r.length < 8 || !isFinite(+r[0]) || typeof r[1] !== 'string' || !r[1] || r[1].length > 300) return null;
  return [jrInt(r[0]), r[1].slice(0, 200), jrNum(r[2], 1), jrCh(r[3], 'a'), jrCh(r[4], 'a'), jrCh(r[5], 'g'), jrInt(r[6]) & 255, typeof r[7] === 'string' ? r[7].slice(0, 16) : '',
    jrInt(r[8], -1), jrInt(r[9], -1), jrInt(r[10], -1), jrInt(r[11], -1), jrInt(r[12], -1), jrInt(r[13], -1), jrInt(r[14], -1), jrNum(r[15], 1), jrInt(r[16]), jrInt(r[17], -1), jrNum(r[18], 1)];
}
function jrCleanFp(f) {
  if (!f || typeof f !== 'object') return null;
  const n = jrInt(f.n); if (n < 1 || n > 3000) return null;
  const hex = v => (typeof v === 'string' && v.length <= 6000 && /^[0-9a-f]*$/.test(v) ? v : '');
  return { b0: jrNum(f.b0, 3), bs: jrNum(f.bs, 4), bp: jrInt(f.bp) & 3, n, lo: hex(f.lo), mi: hex(f.mi), hi: hex(f.hi), fu: hex(f.fu), kc: hex(f.kc), om: hex(f.om), oh: hex(f.oh),
    ty: typeof f.ty === 'string' && f.ty.length <= 3000 && /^[igbudo]*$/.test(f.ty) ? f.ty : '' };
}
function jrCleanTrack(T) {
  if (!T || typeof T !== 'object') return null;
  const o = { n: String(T.n || '').slice(0, 80), c: jrInt(T.c), t: jrInt(T.t), z: jrNum(T.z, 1), d: jrInt(T.d), bpm: jrNum(T.bpm, 3), dr: jrInt(T.dr), g: T.g ? 1 : 0 };
  if (Array.isArray(T.mo) && T.mo.length === 3) o.mo = T.mo.map(x => jrInt(x));
  if (typeof T.sk === 'string') o.sk = T.sk.slice(0, 12);
  const fp = jrCleanFp(T.fp); if (fp) o.fp = fp;
  return o;
}
const jrCleanSess = x => (x && typeof x === 'object' ? { ts: jrInt(x.ts), dev: String(x.dev || '').slice(0, 16), b: jrInt(x.b), sa: x.sa ? 1 : 0 } : null);
const JR = { dev: '', runs: [], tracks: {}, sess: [], run: null, lt: performance.now(), saved: performance.now(), dirty: false, bytes: 0, touchT: null, errLogged: false };
function jrInfo() {
  const el = $('dInfo'); if (!el) return;
  el.textContent = 'Mitschrift: ' + JR.runs.length + ' Läufe · ' + Object.keys(JR.tracks).length + ' Tracks · ' + favs.size + ' Sterne · ' + Math.max(1, Math.round(JR.bytes / 1024)) + ' KB' + (toggles.journal ? '' : ' · pausiert');
}
function jrTrim() {
  if (JR.runs.length > JR_RUNS) JR.runs.splice(0, JR.runs.length - JR_RUNS);
  const ids = Object.keys(JR.tracks);
  if (ids.length > JR_TRACKS) { ids.sort((a, b) => (JR.tracks[a].t || 0) - (JR.tracks[b].t || 0)); for (const id of ids.slice(0, ids.length - JR_TRACKS)) delete JR.tracks[id]; }
  if (JR.sess.length > JR_SESS) JR.sess.splice(0, JR.sess.length - JR_SESS);
}
function jrSave(t, force) {
  if (!JR.dirty && !force) return;
  JR.dirty = false; JR.saved = t; jrTrim();
  const pack = () => JSON.stringify({ v: 1, dev: JR.dev, runs: JR.runs, tracks: JR.tracks, sess: JR.sess });
  try { const s = pack(); localStorage.setItem(JR_KEY, s); JR.bytes = s.length; }
  catch (e) {
    JR.runs.splice(0, Math.ceil(JR.runs.length * 0.3));             // Speicher voll: die ältesten Läufe gehen zuerst
    try { const s = pack(); localStorage.setItem(JR_KEY, s); JR.bytes = s.length; }
    catch (e2) { if (!JR.errLogged) { JR.errLogged = true; err('Mitschrift konnte nicht gespeichert werden: ' + (e2 && e2.message)); } }
  }
  jrInfo();
}
(function jrLoad() {
  let d = null, len = 0;
  try { const s = localStorage.getItem(JR_KEY); if (s) { len = s.length; d = JSON.parse(s); } } catch (e) {}
  if (d && typeof d === 'object') {
    JR.dev = typeof d.dev === 'string' ? d.dev.slice(0, 16) : '';
    if (Array.isArray(d.runs)) for (const r of d.runs) { const c = jrClean(r); if (c) JR.runs.push(c); }
    if (d.tracks && typeof d.tracks === 'object') for (const id in d.tracks) { const T = jrCleanTrack(d.tracks[id]); if (T) JR.tracks[String(id).slice(0, 16)] = T; }
    if (Array.isArray(d.sess)) for (const x of d.sess) { const c = jrCleanSess(x); if (c) JR.sess.push(c); }
  }
  if (!JR.dev) JR.dev = Math.random().toString(36).slice(2, 10);
  JR.bytes = len;
  JR.sess.push({ ts: Math.floor(Date.now() / 1000), dev: JR.dev, b: BUILD_NO, sa: (navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches)) ? 1 : 0 });
  JR.dirty = true; jrInfo();
  erg('Mitschrift: ' + JR.runs.length + ' Läufe, ' + Object.keys(JR.tracks).length + ' Tracks im Speicher (' + Math.max(1, Math.round(len / 1024)) + ' KB), Mitschreiben ' + (toggles.journal ? 'an' : 'aus'));
})();
function jrTid(f) {
  if (f._tid) return f._tid;
  let h = 2166136261; const s = f.name + '|' + f.size;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (f._tid = (h >>> 0).toString(36));
}
const jrPct3 = o => (o ? [o.bright, o.energy, o.acid].map(x => Math.round(x * 100)) : null);
function jrStart(name, why) {
  jrEnd(why);
  if (!toggles.journal || !name) return;
  const sv = soundTarget();
  JR.run = {
    ts: Math.floor(Date.now() / 1000), name, act: 0, fz: 0, tc: 0, st: why || 'a', sec: SEC1[sectionKey()] || 'g',
    fl: (SH[name] ? 8 : 0) | (favs.has(name) ? 16 : 0) | (scanActive() ? 32 : 0) | (micOn ? 64 : 0) | (curStep && !SH[name] ? 128 : 0),
    tk: micOn ? 'mic' : (curFile ? jrTid(curFile) : ''), pos: micOn || !curFile ? -1 : Math.round(audio.currentTime),
    v: sv ? sv.map(x => Math.round(x * 100)) : null, m: jrPct3(trackMood()), bpm
  };
}
function jrEnd(why) {
  const r = JR.run; if (!r) return;
  JR.run = null;
  if (r.act < 0.5) return;                                          // lief nie mit Musik (Start, Pause): nichts zu lernen
  if (!r.m && r.tk === (micOn ? 'mic' : (curFile ? jrTid(curFile) : ''))) r.m = jrPct3(trackMood());
  const ta = JR.touchT === null ? -1 : Math.min(999, Math.round((performance.now() - JR.touchT) / 1000));
  const v = r.v || [-1, -1, -1], m = r.m || [-1, -1, -1];
  JR.runs.push([r.ts, r.name, jrNum(r.act, 1), r.st, why || 'a', r.sec, r.fl, r.tk, r.pos, v[0], v[1], v[2], m[0], m[1], m[2], jrNum(r.bpm, 1), Math.min(99, r.tc), ta, jrNum(r.fz, 1)]);
  if (JR.runs.length > JR_RUNS + 100) JR.runs.splice(0, JR.runs.length - JR_RUNS);
  JR.dirty = true;
}
const jrSplit = why => { if (curName && toggles.journal) jrStart(curName, why); else jrEnd(why); };
function jrFrame(t) {
  const dt = Math.min(0.25, Math.max(0, (t - JR.lt) / 1000)); JR.lt = t;
  const r = JR.run;
  if (r && document.visibilityState === 'visible' && (!audio.paused || micOn)) { r.act += dt; if (frozen) { r.fz += dt; r.fl |= 2; } }
  if (JR.dirty && t - JR.saved > 45000) jrSave(t);                 // höchstens alle 45 s schreiben (bei vollem Speicher ca. 13 ms), dazu beim Verlassen und beim Sichern
}
window.addEventListener('pointerdown', () => { JR.touchT = performance.now(); if (JR.run) JR.run.tc++; }, true);
function jrPlay(f) {
  const id = jrTid(f), T = JR.tracks[id] || (JR.tracks[id] = { n: '', c: 0, t: 0, z: 0, d: 0, bpm: 0, dr: 0, g: 0 });
  T.n = f.name.replace(/\.[^.]+$/, '').slice(0, 80); T.c++; T.t = Math.floor(Date.now() / 1000); T.z = jrNum(f.size / 1048576, 1);
  JR.dirty = true; jrTrim();
  jrSplit('k'); if (JR.run) JR.run.pos = 0;
}
function jrScan(f, A) {
  const id = jrTid(f), T = JR.tracks[id]; if (!T) return;
  if (!A || A.skipped) { T.sk = A && A.skipped ? String(A.skipped).slice(0, 12) : 'fehler'; if (isFinite(audio.duration) && audio.duration > 0) T.d = Math.round(audio.duration); }
  else {
    delete T.sk; T.d = Math.round(A.duration); T.g = A.grid ? 1 : 0; T.dr = A.drops || 0;
    if (A.grid) T.bpm = jrNum(A.bpm, 3);
    T.mo = jrPct3(A.mood);
    if (A.fp && !T.fp) T.fp = A.fp;
  }
  const r = JR.run;                                                  // der laufende Lauf kennt jetzt die Stimmung des Tracks
  if (r && r.tk === id && A && !A.skipped) { if (A.grid) r.fl |= 32; if (!r.m) r.m = jrPct3(A.mood); }
  JR.dirty = true; jrInfo();
}
if (/[?&]debug\b/.test(location.search)) window.__JR = JR;           // nur zum Testen

window.__AM_STEP = 6;
