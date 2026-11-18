// Acid Milkdrop · Teil 1 von 16: Start, Hilfsfunktionen, Audio-Weg, Protokoll, Zustand
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Reihenfolge ist wichtig: index.html lädt sie nacheinander. Bricht ein Teil ab, starten die folgenden nicht.
window.__AM_STEP = 0;

const $ = id => document.getElementById(id);
const canvas = $('stage'), fxc = $('fx'), audio = $('audio'), hud = $('hud'), msg = $('msg');
const say = t => { msg.textContent = t || ''; };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ema = (avg, x, dt, tau) => avg + (x - avg) * (1 - Math.exp(-dt / tau));
// new-milkdrop-: Acid und new-milkdrop- liegen auf derselben Adresse (inkognito420.github.io) und teilen sich darum den Browser-Speicher.
// Alle Schlüssel bekommen hier den Vorsatz KEY_NS, damit new-milkdrop- nie Acids Sterne, Sperren, Einstellungen oder Protokolle überschreibt.
const KEY_NS = 'nmd:';
const store = {
  get(k, d) { try { const v = localStorage.getItem(KEY_NS + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(KEY_NS + k, JSON.stringify(v)); } catch (e) {} }
};
// Beim allerersten Start einmal Acids Sterne und vermessene Presets übernehmen. Acids Speicher wird dabei nur GELESEN, nie verändert.
try {
  if (localStorage.getItem(KEY_NS + 'import-acid') === null) {
    for (const k of ['am-favs', 'am-profiles-v1']) { const v = localStorage.getItem(k); if (v !== null && localStorage.getItem(KEY_NS + k) === null) localStorage.setItem(KEY_NS + k, v); }
    localStorage.setItem(KEY_NS + 'import-acid', String(Date.now()));
  }
} catch (e) {}

const BC = window.butterchurn && (window.butterchurn.default || window.butterchurn);
if (!BC || !BC.createVisualizer) { say('Visualizer-Bibliothek konnte nicht laden. Prüf die Internetverbindung und lade neu.'); throw new Error('Acid Milkdrop: Start abgebrochen'); }

// iPhone: Web Audio sonst stumm, wenn der Lautlos-Schalter an ist
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}

const presets = {};
try { Object.assign(presets, window.butterchurnPresets.getPresets()); } catch (e) {}
try { Object.assign(presets, window.butterchurnPresetsExtra.getPresets()); } catch (e) {}
try { Object.assign(presets, window.butterchurnPresetsExtra2.getPresets()); } catch (e) {}   // Build 111: drittes Paket (122 weitere Presets)
// Eigene Acid-Techno-Presets (acid-presets.js); fehlt die Datei, läuft alles ohne sie weiter
const ACID = new Set();
try { const ap = window.ACID_PRESETS || {}; for (const k in ap) { presets[k] = ap[k]; ACID.add(k); } } catch (e) {}
// Build 126: Emmos sieben eigene Visuals (eigene-visuals.js) sind echte Presets, gehören zu ACID (Lastbremse, kein Reaktions-Angleich) und haben einen eigenen Topf in der Auswahl
const EIGEN = new Set(Object.keys(window.EIGENE_VISUALS || {}));
const names = Object.keys(presets);
if (!names.length) { say('Keine Presets geladen. Lade die Seite neu.'); throw new Error('Acid Milkdrop: Start abgebrochen'); }
const broken = new Set(), slow = new Set(), suspect = new Set();   // suspect: Bilder, bei denen der letzte Lauf hängen blieb (Hänger-Wächter in 16)
let panicked = false;                                                // Notaus (Build 50): nach dem Stopp startet nichts mehr von allein

// ===== Audio =====
const AC = window.AudioContext || window.webkitAudioContext;
const ctx = new AC();
const unlock = () => { if (!panicked && ctx.state !== 'running') ctx.resume().catch(() => {}); };
['pointerdown', 'touchend', 'click'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

// Quelle → Reaktion (Gain) → Latenz (Delay) → Visualizer + Analyse. Hörbarer Ton geht unverzögert raus.
const inGain = ctx.createGain();
const delayNode = ctx.createDelay(1.0);
const analyser = ctx.createAnalyser();
analyser.fftSize = 2048;
analyser.smoothingTimeConstant = 0;
inGain.connect(delayNode);
delayNode.connect(analyser);
const levelAn = ctx.createAnalyser();            // misst den Pegel der Quelle, bevor der Visualizer-Zweig sie verstärkt
levelAn.fftSize = 2048; levelAn.smoothingTimeConstant = 0;
const fbuf = new Float32Array(analyser.frequencyBinCount);
const binHz = ctx.sampleRate / analyser.fftSize;

// ===== Protokoll: Auslöser → Reaktion → Ergebnis =====
const LOG = [], LOG_MAX = 400, LOG_HEAD = 6, t0 = performance.now();
const LOG_ALL = [], LOG_ALL_MAX = 20000;          // Build 121: alle Zeilen (ohne „ausgelassen“) für den Bildbogen, die ältesten fallen erst nach 20000 weg   // die ersten LOG_HEAD Zeilen (Build, Start, Gerät) bleiben immer erhalten (Build 49)
const stamp = () => { const t = (performance.now() - t0) / 1000; return String(Math.floor(t / 60)).padStart(2, '0') + ':' + (t % 60).toFixed(1).padStart(4, '0'); };
let logCount = 0;
function logEv(kind, text) {
  logCount++;
  LOG.push({ t: stamp(), k: kind, x: String(text) });
  LOG_ALL.push(LOG[LOG.length - 1]); if (LOG_ALL.length > LOG_ALL_MAX) LOG_ALL.splice(LOG_HEAD, LOG_ALL.length - LOG_ALL_MAX);
  if (LOG.length > LOG_MAX) {
    const g = LOG[LOG_HEAD];
    if (g && g.gap) { g.gap++; g.x = '… ' + g.gap + ' Zeilen ausgelassen'; LOG.splice(LOG_HEAD + 1, 1); }
    else LOG.splice(LOG_HEAD, 2, { t: '--:--', k: 'e', x: '… 2 Zeilen ausgelassen', gap: 2 });
  }
  renderLog();
}
const trg = t => logEv('a', t), rea = t => logEv('r', t), erg = t => logEv('e', t), err = t => logEv('x', t);
let hudWoke = 0;                                 // Zeitpunkt, an dem ein Tipp die Leiste geweckt hat
const KIND = { a: 'AUSLÖSER ', r: 'REAKTION  ', e: 'ERGEBNIS  ', x: 'FEHLER    ' };
function logText() { return LOG.map(l => l.t + '  ' + KIND[l.k] + l.x).join('\n'); }
function logTextAll() { return LOG_ALL.map(l => l.t + '  ' + KIND[l.k] + l.x).join('\n'); }
let logHold = false;                              // zeigt das Protokoll des letzten Laufs: neue Zeilen überschreiben es nicht
function renderLog() {
  if (logHold) return;
  const box = document.getElementById('logpre'); if (!box || document.getElementById('logbox').hidden) return;
  box.textContent = '';
  LOG.forEach(l => { const d = document.createElement('div'); d.className = l.k; d.textContent = l.t + '  ' + KIND[l.k] + l.x; box.appendChild(d); });
  box.scrollTop = box.scrollHeight;
}
function level() {
  const b = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(b);
  let sum = 0; for (let i = 0; i < b.length; i++) sum += b[i] * b[i];
  const r = Math.sqrt(sum / b.length); return r > 1e-6 ? (20 * Math.log10(r)).toFixed(1) + ' dB' : 'kein Signal';
}
function snapshot() {
  try {
    const as = navigator.audioSession, a = audio;
    return 'Status: Audio-Engine ' + ctx.state + ' · Ausgabeverzögerung ' + Math.round((ctx.outputLatency || 0) * 1000) + ' ms'
      + ' · iOS-Audio-Modus ' + (as ? as.type + '/' + (as.state || 'ohne state') : 'nicht vorhanden')
      + ' · Player ' + (a.paused ? 'pausiert' : 'spielt') + ' ' + a.currentTime.toFixed(1) + '/' + (isFinite(a.duration) ? a.duration.toFixed(0) : '?') + ' s'
      + ' · Lautstärke ' + a.volume + (a.muted ? ' STUMM' : '') + ' · bereit ' + a.readyState
      + ' · Pegel im Analysator ' + level() + ' · ' + agcText() + (bufState && bufState.buf ? ' · SICHERHEITS-MODUS' : '') + ' · Track ' + (curFile ? curFile.name : '–') + ' · Erkennung ' + (curAnalysis ? 'Scan' : 'live');
  } catch (e) { return 'Status nicht lesbar: ' + e.message; }
}
const standalone = !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
const BUILD_NO = 127;
const BUILD = 'Build ' + BUILD_NO + ' · Fünf neue eigene Presets: Säureschlange, Kick-Schockwelle, Hats-Sternenfeld, Pad-Nebel, Phrasen-Mandala; Knopf „Eigene“ zum gezielten Anschauen; Lichtwand ohne Flackern';   // Nummer kommt aus BUILD_NO, nur der Text wird von Hand gepflegt
trg('Seite geladen · ' + BUILD);
rea('Start · ' + (standalone ? 'Home-Bildschirm-App' : 'Safari-Tab') + ' · ' + innerWidth + '×' + innerHeight + ' @' + devicePixelRatio + 'x · iOS-Audio-Modus-API ' + (navigator.audioSession ? 'vorhanden' : 'fehlt'));
erg(navigator.userAgent);

ctx.addEventListener('statechange', () => { rea('Audio-Engine wechselt auf ' + ctx.state); });
try { if (navigator.audioSession) navigator.audioSession.addEventListener('statechange', () => rea('iOS-Audio-Modus: ' + (navigator.audioSession.state || 'ohne Angabe'))); } catch (e) {}
window.addEventListener('error', e => err((e.message || 'Fehler') + (e.lineno ? ' (Zeile ' + e.lineno + ')' : '')));
window.addEventListener('unhandledrejection', e => err('Abgelehnt: ' + (e.reason && e.reason.message || e.reason)));

// Player-Ereignisse: was passiert nach Play bzw. Track laden
let snapTimer = 0;
const afterSnap = ms => { clearTimeout(snapTimer); snapTimer = setTimeout(() => erg(snapshot()), ms); };
['loadstart', 'loadedmetadata', 'canplay', 'waiting', 'stalled', 'pause', 'ended', 'volumechange'].forEach(ev =>
  audio.addEventListener(ev, () => { rea('Player: ' + ev); if (ev === 'canplay') afterSnap(400); }));
audio.addEventListener('playing', () => { rea('Player: spielt'); afterSnap(1500); });
audio.addEventListener('error', () => err('Player-Fehler Code ' + (audio.error ? audio.error.code : '?') + (audio.error && audio.error.message ? ' ' + audio.error.message : '')));
canvas.addEventListener('webglcontextlost', () => err('Grafik vom System pausiert (WebGL verloren)'));
canvas.addEventListener('webglcontextrestored', () => rea('Grafik wiederhergestellt'));

// Bedienung protokollieren (Knöpfe, Regler, Auswahl, Tipp aufs Bild)
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('button'); if (!b || /^log|^beep/.test(b.id)) return;
  if (performance.now() - hudWoke < 700) return;
  trg('Tipp: ' + (b.textContent || b.id).trim() + (b.classList.contains('hot') ? ' (war an)' : ''));
}, true);
document.addEventListener('change', e => { const el = e.target; if (el && el.tagName === 'SELECT') trg('Auswahl: ' + (el.options[el.selectedIndex] || {}).text); }, true);
let sliderT = 0;
document.addEventListener('input', e => { const el = e.target; if (!el || el.type !== 'range') return; clearTimeout(sliderT); sliderT = setTimeout(() => trg('Regler ' + el.id + ' = ' + el.value), 400); }, true);
canvas.addEventListener('pointerup', () => trg('Tipp/Wisch aufs Bild'));

// Zurück aus dem Hintergrund (z. B. App zum zweiten Mal geöffnet): Audio-Sitzung und Engine neu anstoßen
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') { rea('Seite im Hintergrund'); return; }
  if (panicked) return;
  rea('Seite wieder sichtbar · Audio-Engine ' + ctx.state);
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  ctx.resume().then(() => rea('Audio-Engine nach Rückkehr: ' + ctx.state), () => {});
});
window.addEventListener('pageshow', e => { if (e.persisted) rea('Seite aus dem Zwischenspeicher zurück'); });

// WAV-Ton erzeugen (für den stillen Player beim Lautlos-Schalter-Trick; die Testton-Knöpfe sind seit Build 126 entfernt)
function makeWav(sec, freq, amp) {
  const rate = 22050, n = Math.floor(rate * sec), buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * freq * i / rate) * amp * 32767), true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
// Lautlos-Schalter-Trick: ein stiller Player zwingt iOS in den Wiedergabe-Modus, damit die Audio-Engine nicht stumm bleibt.
// Er startet erst, wenn der Track schon läuft, und der Track wird danach wieder angeschoben, falls iOS ihn dabei pausiert.
let silentEl = null, wantPlay = false, resumeTries = 0;
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#play') && !audio.paused) wantPlay = false; }, true);
audio.addEventListener('ended', () => { wantPlay = false; });
function resumeIfCut(why) {
  if (!wantPlay || !audio.paused || resumeTries >= 3) return;
  resumeTries++; rea('iOS hat den Track pausiert (' + why + '), starte ihn wieder (' + resumeTries + ')');
  audio.play().catch(e => err('Neustart fehlgeschlagen: ' + e.message));
}
function startSilent() {
  if (silentEl) return;
  try {
    silentEl = new Audio(makeWav(1, 0, 0)); silentEl.loop = true; silentEl.setAttribute('playsinline', '');
    silentEl.play().then(() => { rea('Stiller Hilfs-Player läuft (hebt den Lautlos-Modus für die Audio-Engine auf)'); setTimeout(() => resumeIfCut('Hilfs-Player gestartet'), 150); },
      e => { rea('Hilfs-Player blockiert: ' + e.message); silentEl = null; });
  } catch (e) { silentEl = null; }
}
audio.addEventListener('playing', () => { wantPlay = true; resumeTries = 0; startSilent(); });
audio.addEventListener('pause', () => { setTimeout(() => resumeIfCut('Pause ohne Tipp'), 200); });

// Bedienung des Protokoll-Fensters
$('logBtn').addEventListener('click', () => {
  logHold = false; const open = $('logbox').hidden; $('logbox').hidden = !open; $('logBtn').setAttribute('aria-expanded', String(open)); $('logBtn').classList.toggle('hot', open);
  if (open) { erg(snapshot()); }
});
$('logSnap').addEventListener('click', () => { logHold = false; erg(snapshot()); });
$('logClear').addEventListener('click', () => { LOG.length = 0; renderLog(); });
// Protokoll des letzten Laufs (Build 50): überlebt einen Hänger. Das laufende Protokoll wird ab 30 s Laufzeit alle 10 s gekürzt gesichert, der Stand vom
// vorigen Start liegt in prevLog.
const prevLog = store.get('am-curlog', null);
let lastLogN = -1;
function lastLogSave(force) {
  if (!force && (performance.now() - t0 < 30000 || logCount === lastLogN)) return;
  lastLogN = logCount;
  store.set('am-curlog', { b: BUILD_NO, at: Math.floor(Date.now() / 1000), text: logText().split('\n').slice(-150).join('\n') });
}
setInterval(() => lastLogSave(false), 10000);
$('logPrev').addEventListener('click', () => {
  if (!prevLog) { say('Vom letzten Lauf ist kein Protokoll gespeichert.'); return; }
  const txt = 'New Milkdrop Protokoll des LETZTEN Laufs (Build ' + prevLog.b + ', ' + new Date(prevLog.at * 1000).toLocaleString('de-DE') + ', letzte Zeilen)\n' + prevLog.text;
  const show = () => { logHold = true; $('logpre').textContent = txt; const r = document.createRange(); r.selectNodeContents($('logpre')); const se = getSelection(); se.removeAllRanges(); se.addRange(r); say('Protokoll des letzten Laufs steht oben. Markiert, von Hand kopieren.'); };
  try { navigator.clipboard.writeText(txt).then(() => { $('logPrev').textContent = 'Kopiert'; setTimeout(() => { $('logPrev').textContent = 'Letzter Lauf'; }, 2000); }, show); } catch (e) { show(); }
});
$('logCopy').addEventListener('click', () => {
  const txt = 'New Milkdrop Protokoll · ' + BUILD + ' · ' + (standalone ? 'Home-Bildschirm-App' : 'Safari-Tab') + '\n' + logText();
  const ok = () => { $('logCopy').textContent = 'Kopiert'; setTimeout(() => { $('logCopy').textContent = 'Kopieren'; }, 2000); };
  const sel = () => { const r = document.createRange(); r.selectNodeContents($('logpre')); const se = getSelection(); se.removeAllRanges(); se.addRange(r); say('Protokoll markiert. Tippe „Kopieren“ im Menü.'); };
  try { navigator.clipboard.writeText(txt).then(ok, sel); } catch (e) { sel(); }
});

// ===== Zustand =====
let viz = null, srcNode = null, fileNode = null, W = 0, H = 0, fxScale = 1;
// Lastbremse (Build 35): schwere Favoriten laufen in kleinerer Auflösung statt gesperrt zu werden. Stufe 0 = volle Auflösung.
const BRAKE_STEPS = [1, 0.8, 0.65, 0.5];
let curStep = 0;
let micOn = false, micStream = null, micNode = null;
let auto = true, lastSwitch = performance.now(), presetStart = performance.now(), curName = null;
let guard = true, maxHz = 0, slowSecs = 0, sixtySecs = 0, hintShown = false;
const slowMarks = [];
let frozen = false;
let bpm = 140;
const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
// Build 126 (Emmo: „ich möchte die nicht an- oder ausklicken können“): keine Werkstatt, keine Schalter. Was bleibt, läuft fest so, wie es gedacht ist.
// Gespeicherte Werkstatt-Werte (nmd:am-toggles, nmd:am-gain2, nmd:sz-gain, nmd:mix-anteil) bleiben im Speicher liegen, werden aber weder gelesen noch geändert.
// Raus sind: Funken und Ringe (spark), Übergangs-Verformung und Drehen/Schwanken (morph), Acid- und Takt-Farbe (acid, bar), Mitschreiben (journal),
// eigene Shader auf zweiter Fläche (own: jetzt Presets). Der Mitschnitt läuft nur über die Test-Adresse …/?mitschnitt.
const TEST_REC = /[?&]mitschnitt\b/.test(location.search);
const toggles = Object.freeze({ mood: true, phrase: true, drop: true, flip: true, build: true, pulse: !reduceMotion, mix: true, auto: true, instr: true, tune: true, name: true,
  rec: TEST_REC, own: false, spark: false, morph: false, acid: false, bar: false, journal: false });

const beat = { t: performance.now(), n: 0, state: 'warten', lastKick: 0, kickStreak: 0, breakStart: 0, iois: [] };
let levelAvg = 0, lastT = performance.now(), sectionChangeT = 0, sectionBeat0 = 0;
const PHRASE_BEATS = 16 * 4;                     // Phrase = 16 Takte, wird ab Abschnittsbeginn gezählt, nicht mehr nach festem Zähler
const MIN_REST_BEATS = 8 * 4;                    // kurz vor einem Abschnittsende kein Extra-Wechsel: der Wechsel kommt dann mit dem Abschnitt
let kickGlow = 0, pulse = 0, flash = 0, build = 0, vign = 0;
// Drop-Aufbau: dropPre 0..1 = wie nah der nächste Drop ist (mit Scan ab 8 Takten vorher), bang = Aufknallen im Drop
let dropPre = 0, bang = 0, sat = 1, lastSat = 1, preLogT = -1;
const PRE_BARS = 8;
// Takt-Eins. Build 126: die Takt-Farbe (Farbton springt auf jeder Eins) ist entfernt, die Presets zeigen ihre eigenen Farben.
function onBar(type) {
  AMI.bar = 1;                                   // Instrumente hören: Kick auf der Eins etwas stärker
}
let hiFast = 0, hiAtBreak = 0, buildStart = 0;
let rFast = 0, rSlow = 0, acidAct = 0;
const live = { bright: 0.5, acid: 0, energy: 0.5, seen: 0 };
// Klangbild der letzten Sekunden: wie stark gerade Kick, Acid-Linie und Hi-Hats sind (je 0..1)
const snd = { kick: 0, hat: 0, acid: 0 };

// Track-Liste und Scan-Zustand
const queue = []; let qi = -1, curFile = null, curAnalysis = null, scanType = null, lastBi = null;
const scanCache = new Map();                     // Datei -> Ergebnis des Scans (Warteschlange und Abbruch: js/14-track-scan.js)
let scanBusyUntil = 0;                           // Build 44: solange ein Scan rechnet (und 3 s danach) zählt die Lastbremse keine langsamen Sekunden

window.__AM_STEP = 1;
