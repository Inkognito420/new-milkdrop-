// Acid Milkdrop · Teil 1 von 16: Start, Hilfsfunktionen, Audio-Weg, Protokoll, Zustand
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Reihenfolge ist wichtig: index.html lädt sie nacheinander. Bricht ein Teil ab, starten die folgenden nicht.
window.__AM_STEP = 0;

const $ = id => document.getElementById(id);
const canvas = $('stage'), fxc = $('fx'), audio = $('audio'), hud = $('hud'), msg = $('msg');
const say = t => { msg.textContent = t || ''; };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ema = (avg, x, dt, tau) => avg + (x - avg) * (1 - Math.exp(-dt / tau));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

const BC = window.butterchurn && (window.butterchurn.default || window.butterchurn);
if (!BC || !BC.createVisualizer) { say('Visualizer-Bibliothek konnte nicht laden. Prüf die Internetverbindung und lade neu.'); throw new Error('Acid Milkdrop: Start abgebrochen'); }

// iPhone: Web Audio sonst stumm, wenn der Lautlos-Schalter an ist
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}

const presets = {};
try { Object.assign(presets, window.butterchurnPresets.getPresets()); } catch (e) {}
try { Object.assign(presets, window.butterchurnPresetsExtra.getPresets()); } catch (e) {}
// Eigene Acid-Techno-Presets (acid-presets.js); fehlt die Datei, läuft alles ohne sie weiter
const ACID = new Set();
try { const ap = window.ACID_PRESETS || {}; for (const k in ap) { presets[k] = ap[k]; ACID.add(k); } } catch (e) {}
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
const LOG = [], LOG_MAX = 400, LOG_HEAD = 6, t0 = performance.now();   // die ersten LOG_HEAD Zeilen (Build, Start, Gerät) bleiben immer erhalten (Build 49)
const stamp = () => { const t = (performance.now() - t0) / 1000; return String(Math.floor(t / 60)).padStart(2, '0') + ':' + (t % 60).toFixed(1).padStart(4, '0'); };
let logCount = 0;
function logEv(kind, text) {
  logCount++;
  LOG.push({ t: stamp(), k: kind, x: String(text) });
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
const BUILD = 'Build 54 · Takt-Farbe wartet 4 Takte auf neuen Ton, Lastbremse fängt bei 1080p frisch an';
const BUILD_NO = 54;
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

// Testtöne: Welcher Weg ist hörbar?
function makeWav(sec, freq, amp) {
  const rate = 22050, n = Math.floor(rate * sec), buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * freq * i / rate) * amp * 32767), true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
$('beepA').addEventListener('click', async () => {
  trg('Testton 1 (über die Audio-Engine, so wie der Track)');
  try {
    await ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 440; g.gain.value = 0.25;
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.6);
    rea('Ton gesendet, Engine ' + ctx.state); erg('Hörst du den Ton? Ja/Nein merken');
  } catch (e) { err('Testton 1: ' + e.message); }
});
$('beepB').addEventListener('click', async () => {
  trg('Testton 2 (über den normalen Player, ohne Audio-Engine)');
  try { const a = new Audio(makeWav(0.6, 660, 0.4)); await a.play(); rea('Player-Ton gestartet'); erg('Hörst du den Ton? Ja/Nein merken'); }
  catch (e) { err('Testton 2: ' + e.message); }
});

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
  const txt = 'Acid Milkdrop Protokoll des LETZTEN Laufs (Build ' + prevLog.b + ', ' + new Date(prevLog.at * 1000).toLocaleString('de-DE') + ', letzte Zeilen)\n' + prevLog.text;
  const show = () => { logHold = true; $('logpre').textContent = txt; const r = document.createRange(); r.selectNodeContents($('logpre')); const se = getSelection(); se.removeAllRanges(); se.addRange(r); say('Protokoll des letzten Laufs steht oben. Markiert, von Hand kopieren.'); };
  try { navigator.clipboard.writeText(txt).then(() => { $('logPrev').textContent = 'Kopiert'; setTimeout(() => { $('logPrev').textContent = 'Letzter Lauf'; }, 2000); }, show); } catch (e) { show(); }
});
$('logCopy').addEventListener('click', () => {
  const txt = 'Acid Milkdrop Protokoll · ' + BUILD + ' · ' + (standalone ? 'Home-Bildschirm-App' : 'Safari-Tab') + '\n' + logText();
  const ok = () => { $('logCopy').textContent = 'Kopiert'; setTimeout(() => { $('logCopy').textContent = 'Kopieren'; }, 2000); };
  const sel = () => { const r = document.createRange(); r.selectNodeContents($('logpre')); const se = getSelection(); se.removeAllRanges(); se.addRange(r); say('Protokoll markiert. Tippe „Kopieren“ im Menü.'); };
  try { navigator.clipboard.writeText(txt).then(ok, sel); } catch (e) { sel(); }
});

// ===== Zustand =====
let viz = null, srcNode = null, fileNode = null, W = 0, H = 0, fxScale = 1;
// Lastbremse (Build 35): schwere Favoriten laufen in kleinerer Auflösung statt gesperrt zu werden. Stufe 0 = volle Auflösung.
const BRAKE_STEPS = [1, 0.8, 0.65, 0.5];
let curStep = 0;
let micOn = false, micStream = null, micNode = null, micGainSaved = 1;
let auto = true, lastSwitch = performance.now(), presetStart = performance.now(), curName = null;
let guard = true, maxHz = 0, slowSecs = 0, sixtySecs = 0, hintShown = false;
const slowMarks = [];
let frozen = false;
let bpm = 140;
const savedToggles = store.get('am-toggles', null);
const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
// Build 37: so ist alles gedacht (Automatik). Werkstatt-Schalter weichen davon ab, „Alles auf Auto“ setzt zurück.
// Alle Schalter an EINER Stelle: [Name, Gruppe in der Werkstatt, Beschriftung (auch für die Automatik-Karte), Standard, Hinweistext].
// Die Knöpfe t-<Name> entstehen daraus (index.html hat nur die leeren Gruppen).
const TOGGLES = [
  ["mood", "Bildwechsel", "Stimmungs-Presets", true, "Presets passend zu Klang, Abschnitt und Stimmung"],
  ["phrase", "Bildwechsel", "Phrasen-Sync", true, "Wechsel auf Phrasen und Abschnitten im Takt"],
  ["drop", "Bildwechsel", "Drop-Cut", true, "Harter Schnitt mit Blitz im Drop"],
  ["own", "Bildwechsel", "Eigene Shader", true, "Ab und zu kommt einer der eigenen Shader (Peak Time, Driving, Acid) statt eines Milkdrop-Presets, passend zum Abschnitt"],
  ["build", "Effekte", "Build-up", true, "Spannung vor dem Drop: Zoom, Vignette, Funken"],
  ["pulse", "Effekte", "Kick-Puls", !reduceMotion, "Bild pumpt mit dem Kick"],
  ["spark", "Effekte", "Hats & Snares", !reduceMotion, "Funken und Ringe auf Hi-Hats und Snares"],
  ["morph", "Effekte", "Übergangs-Verformung", true, "Beim Bildwechsel verformt sich das Bild kurz mit dem Klang. Mit Mischpult: Drehen mit der 303, Schwanken im Takt, Stoß beim Bildwechsel"],
  ["mix", "Effekte", "Mischpult", true, "Körper & Funken: Das Bild hängt an Federn, die auf das Tempo gestimmt sind. Funken kosten Energie aus einem Konto, vor dem Drop wird gespart. Aus = Effekte wie vor Build 46 (zum Vergleichen)"],
  ["acid", "Farbe", "Acid-Farbe", true, "Farbe folgt der 303-Filterfahrt"],
  ["bar", "Farbe", "Takt-Farbe", true, "Farbton springt auf jeder Takt-Eins ein Stück weiter: im Groove leicht, im Drop kräftig, im Break steht er"],
  ["auto", "Hören", "Auto-Pegel", true, "Gleicht leise und laute Tracks für den Visualizer an (der Ton bleibt unverändert)"],
  ["instr", "Hören", "Instrumente hören", true, "Die Presets bekommen Kick, Mitten (303, Synths, Claps) und Hi-Hats einzeln statt verschwommener Frequenzbereiche."],
  ["tune", "Hören", "Reaktions-Angleich", true, "Schwach reagierende Presets werden verstärkt, zu starke gedämpft (gilt ab dem nächsten Bildwechsel)"],
  ["name", "Anzeige", "Name oben rechts", true, "Name des laufenden Presets oben rechts, wenn die Leiste weg ist (für Screenshots)"],
  ["journal", "Anzeige", "Mitschreiben", true, "Schreibt unsichtbar mit, welches Visual zu welcher Musik lief und was du damit gemacht hast (Wischen, Stern, Halten). Bleibt nur im Browser, nichts wird gesendet."]
];
const TOG_DEFAULT = {}, TOG_LABEL = {}, togIds = {};
for (const [k, grp, label, def, tip] of TOGGLES) {
  TOG_DEFAULT[k] = def; TOG_LABEL[k] = label; togIds[k] = "t-" + k;
  const box = [...document.querySelectorAll("#werk .grp")].find(g => g.querySelector(".gl").textContent === grp);
  const b = document.createElement("button"); b.id = "t-" + k; b.type = "button"; b.title = tip; b.textContent = label;
  box.appendChild(b);
}
const toggles = Object.assign({}, TOG_DEFAULT, savedToggles || {});
delete toggles.flug;                              // Build 48: der Track-Flug ist entfernt, ein alter gespeicherter Schalterstand dazu fällt weg

const beat = { t: performance.now(), n: 0, state: 'warten', lastKick: 0, kickStreak: 0, breakStart: 0, iois: [] };
let levelAvg = 0, lastT = performance.now(), sectionChangeT = 0, sectionBeat0 = 0;
const PHRASE_BEATS = 16 * 4;                     // Phrase = 16 Takte, wird ab Abschnittsbeginn gezählt, nicht mehr nach festem Zähler
const MIN_REST_BEATS = 8 * 4;                    // kurz vor einem Abschnittsende kein Extra-Wechsel: der Wechsel kommt dann mit dem Abschnitt
let swLive = 0;                                   // Build 53: geglättete Filterfahrt (-1..+1) des aktuellen Takts
let kickGlow = 0, pulse = 0, flash = 0, build = 0, vign = 0, hue = 0, lastHue = 0;
// Takt-Farbe: eigener Farbton-Anteil, springt auf der Takt-Eins weiter (hue = Acid-Anteil, barHue = Takt-Anteil)
const TON_HALT = 3;                              // Build 54: so viele Takte nach dem ersten muss ein neuer Ton bleiben (Build 51: 1, bei Protokoll 03:05/03:08 sprang A→E→A nach zwei Takten)
const TON_MIN = 0.10;                            // Build 52: Ton-Sicherheit ab 10 % (vorher 15 %): in dichten Techno-Takten liegt sie bei 0,15-0,18, ein Track mit 17 % löste in 7 Minuten keinen einzigen Farbsprung aus
let barHue = 0, barHueTarget = 0, barSteps = 0, tonLast = -1;   // tonLast: zuletzt angewendeter Grundton (Build 51: Pendeln zwischen zwei Tönen löst keinen Farbsprung mehr aus)
// Drop-Aufbau: dropPre 0..1 = wie nah der nächste Drop ist (mit Scan ab 8 Takten vorher), bang = Aufknallen im Drop
let dropPre = 0, bang = 0, sat = 1, lastSat = 1, preLogT = -1;
const PRE_BARS = 8;
const BAR_STEP = { groove: 20, drop: 45 };      // Grad pro Takt; Intro, Break, Build-up, Outro: Farbe bleibt stehen
function onBar(type) {
  shBar = 1;                                     // eigene Shader: Takt-Eins
  AMI.bar = 1;                                   // Instrumente hören: Kick auf der Eins etwas stärker
  if (!toggles.bar || frozen || dropPre > 0.05) return;   // vor dem Drop bleibt die Farbe stehen
  let st = BAR_STEP[type] || 0; if (!st) return;
  const kw = kmNow(); if (kw && kw.sweep > 0) st = Math.round(st * (1 + 0.5 * kw.sweep));   // Build 53: öffnet sich der Filter, dreht die Farbe schneller
  // Build 43: mit Klangmesser kommt zum Takt-Schritt ein Farbsprung, wenn der Grundton des Takts wechselt (jeder der 12 Töne ist 30° auf dem Farbkreis, kürzester Weg).
  // Bleibt der Ton gleich, ändert sich nichts gegenüber vorher. Schwelle 0,15: in lauten Takten liegt die Ton-Sicherheit bei 0,15-0,18 (Build 44 mit 0,20 sprang nie).
  const KB = curAnalysis && curAnalysis.km, kj = KB && scanActive() ? Math.floor(beat.n / 4) : -1;
  let tonJump = 0, tonTxt = '';
  if (kj >= 1 && kj < KB.n && KB.tk[kj] >= TON_MIN) {
    if (tonLast < 0 || kj === 1) tonLast = KB.ton[kj - 1];
    // Build 51/54: der neue Ton muss auch in den nächsten 3 Takten gelten (zusammen 4 Takte) (sonst pendelt A↔E mit ±150° im Takt); verglichen wird mit dem zuletzt angewendeten Ton
    let hält = kj + TON_HALT < KB.n; for (let q = 1; q <= TON_HALT && hält; q++) hält = KB.tk[kj + q] >= TON_MIN && KB.ton[kj + q] === KB.ton[kj];
    if (KB.ton[kj] !== tonLast && hält) {
      const dn = ((KB.ton[kj] - tonLast + 18) % 12) - 6;     // -6 .. +5 Halbtöne
      tonJump = dn * 30; tonTxt = ' · Ton ' + KM_NOTES[tonLast] + ' → ' + KM_NOTES[KB.ton[kj]] + ': ' + (tonJump > 0 ? '+' : '') + tonJump + '°';
      tonLast = KB.ton[kj];
    }
  }
  barHueTarget += st + tonJump; barSteps++;
  if (tonJump) rea('Takt-Farbe: +' + st + '° auf der Eins (' + type + ')' + tonTxt + ', jetzt ' + Math.round(((barHueTarget % 360) + 360) % 360) + '°');
  else if (barSteps % 32 === 1) rea('Takt-Farbe: +' + st + '° auf der Eins (' + type + '), jetzt ' + Math.round(barHueTarget % 360) + '°');
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
