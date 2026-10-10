// Acid Milkdrop · Teil 2 von 16: Instrumente hören: Kick, Mitten, Hi-Hats einzeln an Milkdrop
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Reihenfolge ist wichtig: index.html lädt sie nacheinander. Bricht ein Teil ab, starten die folgenden nicht.
if (window.__AM_STEP !== 1) throw new Error('Acid Milkdrop: Teil 2 (instrumente) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== Instrumente hören =====
// Milkdrop-Presets bekommen von Butterchurn nur drei verschwommene Frequenzbereiche (bass/mid/treb). Hier werden sie ersetzt durch
//   Bass = Kick (taktgenau: im Scan vom Raster, live vom Kick-Melder; Takt-Eins etwas stärker),
//   Mitte = Mitten-Anschläge (303, Synths, Claps; Acid-Passagen heben die Grundlinie),
//   Höhen = Hi-Hats und Snares.
// Maßstab wie bei Milkdrop: 1 = Durchschnitt, Spitzen bis ca. 2. Der Pegel (wie laut es gerade ist) kommt weiter von Milkdrop (att), nur die Form kommt von uns.
// Gilt für alles im Preset: Formeln, Formen, Wellen und Shader (Einhängepunkt: updateAudioLevels, siehe hookInstr).
const AMI = { t0: 0, kE: 0, kS: 0, mE: 0, mS: 0, tE: 0, tS: 0, hk: 0, hm: 0, ht: 0, bar: 0, act: 0, hooked: false, logT: 0, lt: 0, lv: [1, 1, 1], sv: [1, 1, 1], sa: [1, 1, 1],
  n: { k: 0, m: 0, t: 0 }, so: [0, 0, 0], mo: [0, 0, 0], sn: [0, 0, 0], mn: [0, 0, 0], c: 0, lo: [0, 0, 0] };
const INSTR = { bV: [0.38, 2.00], bA: [0.56, 0.70], mV: [0.32, 1.70], mA: [0.55, 0.65], tV: [0.42, 2.10], tA: [0.60, 0.80] };   // [Grundwert zwischen den Schlägen, Zuschlag auf dem Schlag]
if (/[?&]debug\b/.test(location.search)) { window.__AMI = AMI; AMI.ev = { k: [], m: [], h: [], s: [] }; }   // nur zum Testen: Zeitpunkte der Treffer
let amiErr = false;                                           // Fehler beim Überschreiben der Pegel nur einmal melden (läuft in jedem Bild)
const amiEv = k => { if (AMI.ev) AMI.ev[k].push(+audio.currentTime.toFixed(3)); };
// Läuft jedes Bild nach der Erkennung: Hüllkurven der Kanäle. Neue Treffer (kickGlow, hm, ht) kommen voll an, danach klingen sie ab.
function instrFrame(t) {
  const dt = AMI.t0 ? Math.min(100, t - AMI.t0) : 16; AMI.t0 = t;
  const hearing = !!srcNode && ctx.state === 'running' && levelAvg > 1e-4 && (micOn || !audio.paused);
  AMI.act = ema(AMI.act, hearing ? 1 : 0, dt, 350);
  if (AMI.act > 0.9) AMI.ams = (AMI.ams || 0) + dt;
  if (AMI.hk > 0) { AMI.n.k++; amiEv('k'); }
  AMI.kHit = AMI.hk; AMI.mHit = AMI.hm; AMI.tHit = AMI.ht;   // Build 46: Treffer dieses Bildes fürs Mischpult (Teil 12b)
  AMI.kE = Math.max(AMI.kE * Math.exp(-dt / 110), AMI.hk); AMI.hk = 0;
  AMI.kS = Math.max(AMI.kS * Math.exp(-dt / 260), AMI.kE);
  AMI.mE = Math.max(AMI.mE * Math.exp(-dt / 110), AMI.hm); AMI.hm = 0;
  AMI.mS = Math.max(AMI.mS * Math.exp(-dt / 260), AMI.mE);
  AMI.tE = Math.max(AMI.tE * Math.exp(-dt / 80), AMI.ht); AMI.ht = 0;
  AMI.tS = Math.max(AMI.tS * Math.exp(-dt / 220), AMI.tE);
  AMI.bar *= Math.exp(-dt / 220);
  if (!AMI.logT) AMI.logT = t;
  if (t - AMI.logT >= 120000) instrLog(t);
}
// Wird von Butterchurn in jedem Bild nach der eigenen Pegelberechnung aufgerufen (val = gerade jetzt, att = geglättet)
function applyInstr(al) {
  const w = toggles.instr ? AMI.act : 0, rec = AMI.act > 0.9;
  // Pegel: wie laut ein Band gerade im Vergleich zum Durchschnitt ist (Milkdrops val, über ca. 1,2 s geglättet). Nur die Form der Schläge kommt von uns.
  const now = performance.now(), dtl = AMI.lt ? clamp(now - AMI.lt, 4, 100) : 16; AMI.lt = now;
  for (let i = 0; i < 3; i++) { const v = isFinite(al.val[i]) ? al.val[i] : 1; AMI.lo[i] = v; AMI.lv[i] += (v - AMI.lv[i]) * (1 - Math.exp(-dtl / 1200)); if (!isFinite(AMI.lv[i])) AMI.lv[i] = 1; }
  if (rec) { AMI.c++; for (let i = 0; i < 3; i++) { AMI.so[i] += al.val[i]; if (al.val[i] > AMI.mo[i]) AMI.mo[i] = al.val[i]; } }
  if (w < 0.01) return;
  const ac = clamp(snd.acid), I = INSTR;
  // Form der Kanäle (Boden + Zuschlag auf dem Schlag). Damit jeder Kanal im Schnitt wie bei Milkdrop bei 1 liegt, egal wie dicht die Treffer sind
  // (4-on-the-floor, Breaks, viele oder wenige Hats), wird die Form durch ihren eigenen Durchschnitt der letzten ca. 10 s geteilt.
  const fv = [I.bV[0] + I.bV[1] * AMI.kE + 0.35 * AMI.bar * AMI.kE, I.mV[0] + I.mV[1] * AMI.mE + 0.10 * ac, I.tV[0] + I.tV[1] * AMI.tE];
  const fa = [I.bA[0] + I.bA[1] * AMI.kS, I.mA[0] + I.mA[1] * AMI.mS + 0.06 * ac, I.tA[0] + I.tA[1] * AMI.tS];
  const kn = AMI.act > 0.5 ? 1 - Math.exp(-dtl / 10000) : 0;
  const nv = [0, 0, 0], na = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    AMI.sv[i] += (fv[i] - AMI.sv[i]) * kn; AMI.sa[i] += (fa[i] - AMI.sa[i]) * kn;
    const L = clamp(AMI.lv[i], 0.3, 1.35);
    nv[i] = L * fv[i] * clamp(1 / AMI.sv[i], 0.8, 1.6);
    na[i] = L * fa[i] * clamp(1 / AMI.sa[i], 0.8, 1.6);
  }
  for (let i = 0; i < 3; i++) {
    if (!isFinite(nv[i]) || !isFinite(na[i])) continue;
    al.val[i] += (clamp(nv[i], 0.05, 3.2) - al.val[i]) * w;
    al.att[i] += (clamp(na[i], 0.05, 3.2) - al.att[i]) * w;
    if (rec) { AMI.sn[i] += al.val[i]; if (al.val[i] > AMI.mn[i]) AMI.mn[i] = al.val[i]; }
  }
}
function instrLog(t) {
  const c = AMI.c, am = (AMI.ams || 0) / 60000;
  AMI.logT = t;
  if (c >= 600 && toggles.instr && am > 0.2) {
    const f = x => x.toFixed(2).replace('.', ',');
    const row = (nm, i) => nm + ' Ø' + f(AMI.so[i] / c) + ' (max ' + f(AMI.mo[i]) + ') → Ø' + f(AMI.sn[i] / c) + ' (max ' + f(AMI.mn[i]) + ')';
    erg('Instrumente in ' + f(am) + ' min Musik, Milkdrop → neu: ' + row('Bass', 0) + ' · ' + row('Mitte', 1) + ' · ' + row('Höhen', 2) + ' · Treffer pro Minute: Kick ' + Math.round(AMI.n.k / am) + ', Mitte ' + Math.round(AMI.n.m / am) + ', Höhen ' + Math.round(AMI.n.t / am));
  }
  AMI.c = 0; AMI.ams = 0; AMI.n.k = AMI.n.m = AMI.n.t = 0;
  for (let i = 0; i < 3; i++) { AMI.so[i] = AMI.sn[i] = AMI.mo[i] = AMI.mn[i] = 0; }
}
// Scan-Modus: Mitten- und Höhen-Anschläge kommen aus der Vorab-Analyse (A.onM, A.onH) genau dann, wenn der Ton dort ankommt
const scanPtr = { A: null, ts: -1, m: 0, h: 0 };
function feedScanHits(A, ts) {
  if (!A.onM || !A.onH) return;
  const P = scanPtr, lower = (arr, x) => { let lo = 0, hi = arr.length >> 1; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[2 * m] < x) lo = m + 1; else hi = m; } return lo; };
  if (P.A !== A || ts < P.ts - 0.02 || ts > P.ts + 0.5) { P.A = A; P.m = lower(A.onM, ts); P.h = lower(A.onH, ts); }   // neuer Track oder gespult: Zeiger neu setzen
  P.ts = ts;
  while (P.m < (A.onM.length >> 1) && A.onM[2 * P.m] <= ts) { AMI.hm = Math.max(AMI.hm, 0.4 + 0.6 * A.onM[2 * P.m + 1]); AMI.n.m++; amiEv('m'); P.m++; }
  while (P.h < (A.onH.length >> 1) && A.onH[2 * P.h] <= ts) { AMI.ht = Math.max(AMI.ht, 0.35 + 0.65 * A.onH[2 * P.h + 1]); AMI.n.t++; amiEv('h'); P.h++; }
}
// Einhängen: Butterchurn berechnet bass/mid/treb in renderer.audioLevels; wir lassen danach unsere Werte darüberlaufen.
// So sehen alle Teile eines Presets (Formeln, Formen, Wellen, Shader) dieselben Werte. Fehlt der Einhängepunkt, läuft alles wie vorher.
function hookInstr() {
  try {
    const al = viz && viz.renderer && viz.renderer.audioLevels;
    if (!al || typeof al.updateAudioLevels !== 'function' || !al.val || !al.att) { err('Instrumente hören: Einhängepunkt in Butterchurn nicht gefunden, Presets hören wie vorher'); return; }
    const orig = al.updateAudioLevels;
    al.updateAudioLevels = function (fps, frame) { orig.call(this, fps, frame); try { applyInstr(this); } catch (e) { if (!amiErr) { amiErr = true; err('Instrumente hören: ' + (e && e.message || e)); } } };
    AMI.hooked = true; if (window.__AMI) AMI.al = al;
    rea('Instrumente hören: eingehängt (Kick, Mitten, Höhen einzeln)');
  } catch (e) { err('Instrumente hören: ' + e.message); }
}
// Feinere Klang-Analyse (24 Bänder) und Übergangs-Steuerung. Fehlen die Dateien, läuft alles wie vorher.
const reactive = window.AudioReactiveController ? (() => { try { return new window.AudioReactiveController(analyser, { numBands: 24, minHz: 35, maxHz: 16000, smoothing: 0.18 }); } catch (e) { return null; } })() : null;
const blender = window.AdaptivePresetBlender ? new window.AdaptivePresetBlender() : null;
const rel = { energy: 0.05, flux: 0.01, beat: 0.01, bass: 0.05, mid: 0.05, treble: 0.05 };   // langsam mitlaufende Spitzenwerte: macht die Schwellen unabhängig von der Lautstärke
function feedBlender(st, dt) {
  if (!reactive || !blender) return;
  const k = Math.exp(-dt / 20000);
  for (const n in rel) rel[n] = Math.max(rel[n] * k, st[n] || 0, n === 'energy' ? 0.05 : 0.01);
  const r = n => clamp((st[n] || 0) / rel[n]);
  blender.pushAudioSample({ energy: r('energy'), flux: r('flux'), beat: r('beat'), bass: r('bass'), mid: r('mid'), treble: r('treble'), brightness: clamp((st.brightness || 0) * 3), centroid: clamp((st.centroid || 0) / 6000) });
}

window.__AM_STEP = 2;
