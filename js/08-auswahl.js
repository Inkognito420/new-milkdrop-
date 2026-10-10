// Acid Milkdrop · Teil 8 von 16: Lastbremse, Preset-Auswahl und Wechsel
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Reihenfolge ist wichtig: index.html lädt sie nacheinander. Bricht ein Teil ab, starten die folgenden nicht.
if (window.__AM_STEP !== 7) throw new Error('Acid Milkdrop: Teil 8 (auswahl) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== Lastbremse (Build 35) =====
// Ein Favorit (oder eigenes Acid-Preset), der bei voller Auflösung unter 52 fps fällt, wird nicht mehr gesperrt, sondern läuft eine Stufe kleiner
// (80, 65, 50 %). Butterchurn rechnet beim Ändern der Größe das aktuelle Bild um, es flackert nichts. Die Stufe wird je Preset 3 Tage gemerkt
// (das Handy kann warm gewesen sein, danach wird neu geprüft). Reicht auch 50 % nicht, sperrt der Wächter wie bisher.
const BRAKE_KEY = 'am-brake-v2', BRAKE_TTL = 3 * 86400;
const brake = {};
try { localStorage.removeItem('am-brake-v1'); } catch (e) {}      // Build 54: die Stufen aus der 2K-Zeit waren bei 1080p zu streng, v2 fängt frisch an
{ const b = store.get(BRAKE_KEY, {}), now = Date.now() / 1000;
  if (b && typeof b === 'object') for (const k in b) { const e = b[k]; if (e && e.s >= 1 && e.s < BRAKE_STEPS.length && e.t > now - BRAKE_TTL) brake[k] = { s: e.s | 0, t: e.t | 0 }; } }
let brakeUntil = 0, liveTicks = 0;                     // liveTicks: nur für den Test (zählt Schläge im Live-Raster)
const fpsHist = [];
const brakeWant = n => (guard && !SH[n] && brake[n]) ? brake[n].s : 0;
function brakeApply(n) {
  if (SH[n]) return;                                  // eigene Shader haben ihre eigene (halbe) Fläche, Milkdrop steht dann still
  const want = brakeWant(n);
  if (want === curStep) return;
  curStep = want; resize();
  rea('Auflösung: ' + W + '×' + H + (want ? ' (Lastbremse Stufe ' + want + ', ' + Math.round(BRAKE_STEPS[want] * 100) + ' %)' : ' (voll)'));
}
// Schafft das Handy gerade überhaupt nichts über 40 fps (Stromsparmodus, heiß)? Dann liegt es nicht am Preset: nicht verkleinern.
const brakeCapped = t => { let n = 0, mx = 0; for (const h of fpsHist) if (t - h[0] <= 45000) { n++; if (h[1] > mx) mx = h[1]; } return n >= 20 && mx < 40; };
function brakeTry(n, fps, t) {
  if (SH[n] || !(favs.has(n) || ACID.has(n))) return false;          // nur Favoriten und eigene Acid-Presets, alles andere wird wie bisher übersprungen
  if (brakeCapped(t)) return false;
  const s = brake[n] ? brake[n].s : 0;
  if (s >= BRAKE_STEPS.length - 1) return false;                      // auch die kleinste Stufe reicht nicht: dann sperren
  brake[n] = { s: s + 1, t: Math.floor(Date.now() / 1000) }; store.set(BRAKE_KEY, brake);
  perf.marked++;
  erg('Lastbremse: ' + n + ' zu langsam (' + fps + ' fps) nach ' + minSince(t) + ' → Stufe ' + (s + 1) + ' (' + Math.round(BRAKE_STEPS[s + 1] * 100) + ' %)');
  slowMarks.push(t); while (slowMarks.length && t - slowMarks[0] > 60000) slowMarks.shift();
  brakeApply(n); brakeUntil = t + 3500;
  if (JR.run) JR.run.fl |= 128;
  return true;
}
function usable(n) { return !broken.has(n) && !DEAD.has(n) && !suspect.has(n) && !(guard && slow.has(n)); }
function loadByName(n, blend, pushHist = true, why = 'a') {
  rea('Preset: ' + n);
  if (!viz) return false;
  brakeApply(n);                                     // Lastbremse: schwere Favoriten in kleinerer Auflösung, alles andere voll
  if (SH[n]) { if (!shShow(n, blend)) return false; }
  else {
    try { viz.loadPreset(tuned(n), blend); }
    catch (e) { tunedCache.set(n, presets[n]); try { viz.loadPreset(presets[n], blend); } catch (e2) { broken.add(n); return false; } }
    if (shCur || shOp > 0) { shCur = null; shFade(0, Math.max(blend, 0.3)); }   // eigener Shader blendet aus, Milkdrop übernimmt
  }
  curName = n; presetStart = lastSwitch = performance.now(); prevLuma = null;
  if (blender && blend > 0.2 && toggles.morph && !reduceMotion) { blender.begin(blend * 1000); morphOn = true; }
  recent.push(n); if (recent.length > 90) recent.shift();
  jrStart(n, why);                                   // Mitschreiben: neuer Lauf, der vorige wird mit diesem Anlass abgeschlossen
  if (pushHist) { hist.splice(histPos + 1); hist.push(n); if (hist.length > 60) hist.shift(); histPos = hist.length - 1; }
  $('preset').textContent = n; showFav();
  return true;
}
function randomUsable() {
  for (let i = 0; i < 60; i++) { const n = names[Math.floor(Math.random() * names.length)]; if (usable(n) && !recent.includes(n) && n !== curName) return n; }
  return names.find(usable) || names[0];
}
// Ziel-Klangbild [Bass, Mitten, Höhen]: was gerade zu hören ist, plus was der Abschnitt gleich bringt
// Build 41: Mit Scan kommt das Klangbild aus dem Track selbst (Schläge und Töne getrennt, pro Takt), aktueller Takt
// plus die nächsten 3. Die Live-Werte waren im Groove fast immer 33/33/33 (Zähler liefen voll).
function scanKlang() {
  const A = curAnalysis, K = A && A.klang; if (!K || !scanActive()) return null;
  const ts = audio.currentTime - (+latEl.value) / 1000, j0 = Math.floor((ts - K.t0) / K.barS);
  const v = [0, 0, 0]; let n = 0;
  for (let j = Math.max(0, j0); j <= j0 + 3 && j < K.n; j++) { const o = j * 3; if (K.share[o] + K.share[o + 1] + K.share[o + 2] < 0.5) continue; v[0] += K.share[o]; v[1] += K.share[o + 1]; v[2] += K.share[o + 2]; n++; }
  return n ? v.map(x => x / n) : null;
}
// Build 43: Klangmesser pro Takt (Hektik, Schärfe, Druck, Filter, Spannung, Ton) aus dem Scan.
// Druck/Hektik/Schärfe/Filter sind auf den Track selbst bezogen (10-%- bis 90-%-Wert der vollen Takte, 0..1), Spannung ist absolut (0,5 = neutral).
const KM_KEYS = ['druck', 'hektik', 'schaerfe', 'beweg'];
const kmRel = (K, key, v) => clamp((v - K.lo[key]) / Math.max(0.12, K.hi[key] - K.lo[key]));
let kmCacheK = null, kmCacheJ = -2, kmCache = null;
function kmBarVals(K, j) {
  const o = { j, spann: K.spann[j], sweep: K.sweep ? K.sweep[j] : 0, ton: K.ton[j], tk: K.tk[j] };
  for (const k of KM_KEYS) o[k] = kmRel(K, k, K[k][j]);
  return o;
}
function kmNow() {                                  // aktueller Takt, nur mit Scan und während es läuft
  const A = curAnalysis, K = A && A.km; if (!K || !scanActive()) return null;
  const ts = audio.currentTime - (+latEl.value) / 1000, j = Math.floor((ts - K.t0) / K.barS);
  if (j < 0 || j >= K.n) return null;
  if (K !== kmCacheK || j !== kmCacheJ) { kmCacheK = K; kmCacheJ = j; kmCache = kmBarVals(K, j); }
  return kmCache;
}
function kmAhead(n) {                               // Mittel aus aktuellem Takt und den nächsten n (für die Bildwahl: das neue Bild läuft ja länger)
  const A = curAnalysis, K = A && A.km; if (!K || !scanActive()) return null;
  const ts = audio.currentTime - (+latEl.value) / 1000, j0 = Math.floor((ts - K.t0) / K.barS);
  const o = { druck: 0, hektik: 0, schaerfe: 0, beweg: 0, spann: 0 }; let c = 0;
  for (let j = Math.max(0, j0); j <= j0 + n && j < K.n; j++) { const v = kmBarVals(K, j); for (const k of KM_KEYS) o[k] += v[k]; o.spann += v.spann; c++; }
  if (!c) return null;
  for (const k in o) o[k] /= c;
  return o;
}
function soundTarget() {
  const sk = scanKlang();
  if (sk) { if (sectionKey() === 'drop') { sk[0] += 0.3; const s = sk[0] + sk[1] + sk[2]; return sk.map(x => x / s); } return sk; }
  const v = [snd.kN || 0, snd.acid || 0, snd.hN || 0];
  const sec = sectionKey();
  if (sec === 'drop') v[0] += 0.6;
  else if (sec === 'buildup') { v[2] += 0.4; v[1] += 0.2; }
  else if (sec === 'break') { v[0] *= 0.3; v[1] += 0.15; }
  const sum = v[0] + v[1] + v[2];
  return sum < 0.15 ? null : v.map(x => x / sum);
}
let reactRank = null;
function reactFit(n, v) {
  const R = REACT[n]; if (!R || !v) return 0.5;
  if (!reactRank) { const all = Object.values(REACT).map(r => r[0] + r[1] + r[2]).sort((a, b) => a - b); reactRank = x => { let i = 0; while (i < all.length && all[i] < x) i++; return i / Math.max(1, all.length - 1); }; }
  const S = R[0] + R[1] + R[2] + 1e-9;
  const match = Math.min(R[0] / S, v[0]) + Math.min(R[1] / S, v[1]) + Math.min(R[2] / S, v[2]);   // 1 = gleiche Gewichtung
  return 0.75 * match + 0.25 * reactRank(S);                                                         // + wie stark es überhaupt reagiert
}
let lastFitInfo = '';
function pickPreset(tg) {
  const sv = toggles.mood ? soundTarget() : null;
  // Favoriten (ca. 40 %) und eigene Acid-Presets (ca. 12 %) kommen bevorzugt dran, passend zum Klang gewählt
  const lastFew = recent.slice(-6), pool = (set, minLeft) => { const a = []; for (const n of set) if (presets[n] && usable(n) && n !== curName && !lastFew.includes(n)) a.push(n); return a.length >= minLeft ? a : []; };
  for (const [set, chance, tag] of [[favs, 0.4, 'Favorit'], [ACID, 0.12, 'Acid-Preset']]) {
    if (Math.random() >= chance) continue;
    const a = pool(set, 1); if (!a.length) continue;
    let best = null, bf = -9;
    for (const n of a) { const f = reactFit(n, sv) + Math.random() * 0.35; if (f > bf) { bf = f; best = n; } }
    lastFitInfo = ' · ' + tag; return best;
  }
  const known = [], unknown = [];
  for (const n of names) {
    if (!usable(n) || recent.includes(n) || n === curName) continue;
    const P = profiles[n];
    (P && P.n >= 6 && P.nm >= 4 ? known : unknown).push(n);
  }
  const explore = known.length < 30 ? 0.6 : 0.3;
  if (!known.length || (unknown.length && Math.random() < explore)) {
    if (!unknown.length) return randomUsable();
    let best = null, bf = -1;
    for (let i = 0; i < 10; i++) { const n = unknown[Math.floor(Math.random() * unknown.length)], f = reactFit(n, sv) + Math.random() * 0.1; if (f > bf) { bf = f; best = n; } }
    lastFitInfo = fitText(sv, best); return best;
  }
  const ranker = key => {
    const s = known.map(n => profiles[n][key]).sort((a, b) => a - b);
    return v => { let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] < v) lo = m + 1; else hi = m; } return lo / Math.max(1, s.length - 1); };
  };
  const rb = ranker('b'), rm = ranker('m'), rs = ranker('s');
  const scored = known.map(n => {
    const P = profiles[n];
    let d = (rb(P.b) - tg.b) ** 2 + 1.3 * (rm(P.m) - tg.m) ** 2 + 0.6 * (rs(P.s) - tg.s) ** 2;
    if (tg.hueW > 0) {
      const h = Math.atan2(P.hy, P.hx), sat = Math.hypot(P.hx, P.hy);
      let dh = Math.abs(h - tg.hue); if (dh > Math.PI) dh = 2 * Math.PI - dh;
      d += tg.hueW * (dh / Math.PI) ** 2 * Math.min(1, sat * 4);
    }
    if (sv) d += 1.6 * (1 - reactFit(n, sv));
    return [d, n];
  }).sort((a, b) => a[0] - b[0]);
  const top = scored.slice(0, Math.min(scored.length, Math.max(20, Math.round(scored.length * 0.15))));   // breiter Topf statt nur 5: mehr Abwechslung
  const pick = top[Math.floor(Math.random() * top.length)][1];
  lastFitInfo = fitText(sv, pick); return pick;
}
function fitText(v, n) {
  const R = REACT[n]; if (!v || !R) return '';
  const S = R[0] + R[1] + R[2] + 1e-9, p = x => Math.round(x * 100);
  return ' · Klang' + (scanKlang() ? ' (Scan)' : '') + ' Kick ' + p(v[0]) + ' / ' + (scanKlang() ? 'Töne ' : 'Acid ') + p(v[1]) + ' / Hats ' + p(v[2]) + ' % → Preset Bass ' + p(R[0] / S) + ' / Mitten ' + p(R[1] / S) + ' / Höhen ' + p(R[2] / S) + ' %';
}
function trackMood() {
  if (curAnalysis && curAnalysis.mood) return curAnalysis.mood;
  if (live.seen > 4000) return { bright: live.bright, acid: live.acid, energy: live.energy };
  return null;
}
function moodTarget(section) {
  const base = {
    intro: { b: .35, m: .35, s: .5 }, groove: { b: .55, m: .6, s: .55 }, break: { b: .22, m: .18, s: .45 },
    buildup: { b: .5, m: .7, s: .6 }, drop: { b: .85, m: .9, s: .8 }, outro: { b: .3, m: .3, s: .45 }
  }[section] || { b: .5, m: .5, s: .5 };
  const tg = Object.assign({ hue: 0, hueW: 0 }, base);
  const md = trackMood();
  if (md) {
    tg.b = clamp(tg.b + (md.bright - 0.5) * 0.4);
    tg.m = clamp(tg.m + (md.energy - 0.5) * 0.3);
    tg.s = clamp(tg.s + md.acid * 0.25);
    if (md.acid > 0.35) { tg.hue = 75 * Math.PI / 180; tg.hueW = md.acid * 1.2; }
    else if (md.bright < 0.35) { tg.hue = 250 * Math.PI / 180; tg.hueW = 0.5; }
  }
  // Build 43: Klangmesser des laufenden Abschnitts. Hektik -> Bewegung, Schärfe -> Sättigung, Druck -> Helligkeit, Filterfahrten -> Acid-Grün.
  const km = toggles.mood ? kmAhead(3) : null;
  if (km) {
    tg.m = clamp(tg.m + (km.hektik - 0.5) * 0.5);
    tg.s = clamp(tg.s + (km.schaerfe - 0.5) * 0.4);
    tg.b = clamp(tg.b + (km.druck - 0.5) * 0.3);
    if (km.beweg > 0.55) { tg.hue = 75 * Math.PI / 180; tg.hueW = Math.max(tg.hueW, (km.beweg - 0.4) * 1.5); }
  }
  return tg;
}
const scanActive = () => !!(curAnalysis && curAnalysis.grid && !audio.paused);
function sectionKey() {
  const s = scanActive() ? scanType : beat.state;
  return s === 'warten' || !s ? 'intro' : s;
}
// Übergangsdauer in ganzen Takten: mit Scan aus der Analyse (pro Abschnitt), sonst aus dem Live-Tempo
let scanSec = null;
function blendSecs(type) {
  const live = { intro: 2, groove: 2, break: 4, buildup: 2, drop: 2, outro: 4 };
  let bars = live[type] || 2, beatS = 60 / bpm;
  if (scanActive() && curAnalysis) { beatS = curAnalysis.beatS; if (scanSec && scanSec.blendBars) bars = scanSec.blendBars; }
  return +(bars * 4 * beatS).toFixed(3);
}
function nextPreset(blend = 2.7, tg, exact, why) {
  if (blend > 0 && !exact && blender && toggles.mood) {              // Übergangsdauer nach Klang: laut/hart = kurz, ruhig = lang
    const a = blender.suggestDuration() / 1000;
    blend = Math.min(a, Math.max(blend, 1.2));
  }
  if (toggles.own && Object.keys(SH).length && Math.random() < (shCur ? 0.05 : 0.15)) {
    const sn = pickShader();
    if (sn && loadByName(sn, blend, true, why)) { rea('Eigener Shader · Stil ' + lastShStyle + ' · Abschnitt ' + sectionKey()); return; }
  }
  for (let tries = 0; tries < 20; tries++) {
    lastFitInfo = '';
    const n = toggles.mood ? pickPreset(tg || moodTarget(sectionKey())) : randomUsable();
    if (n && loadByName(n, blend, true, why)) { if (lastFitInfo) rea('Passung' + lastFitInfo); return; }
  }
}
function goNext() {
  if (histPos < hist.length - 1) { histPos++; loadByName(hist[histPos], 1.5, false, 'n'); }
  else nextPreset(1.5, undefined, false, 'n');
}
function goPrev() { if (histPos > 0) { histPos--; loadByName(hist[histPos], 1.5, false, 'p'); } }
$('next').addEventListener('click', goNext);
$('prev').addEventListener('click', goPrev);
$('auto').addEventListener('click', () => { auto = !auto; $('auto').classList.toggle('hot', auto); lastSwitch = performance.now(); });

// Preset vermessen: Helligkeit, Sättigung, Farbton, Bewegung (nur bis genug Messungen da sind)
function sampleFrame(t) {
  if (!curName || t - lastSample < 500 || t - presetStart < 3000) return;
  const P0 = profiles[curName];
  if (P0 && P0.n >= 30 && P0.nm >= 20) return;
  lastSample = t;
  let d;
  try { sctx.drawImage(canvas, 0, 0, 32, 18); d = sctx.getImageData(0, 0, 32, 18).data; } catch (e) { return; }
  const N = 576, luma = new Float32Array(N);
  let sb = 0, ss = 0, hx = 0, hy = 0, mot = 0;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    luma[p] = l; sb += l;
    const sat = mx > 0 ? (mx - mn) / mx : 0; ss += sat;
    if (mx - mn > 0.02) {
      let h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
      h *= Math.PI / 3; const w = sat * mx; hx += Math.cos(h) * w; hy += Math.sin(h) * w;
    }
    if (prevLuma) mot += Math.abs(l - prevLuma[p]);
  }
  const P = profiles[curName] || (profiles[curName] = { b: 0, s: 0, hx: 0, hy: 0, m: 0, n: 0, nm: 0 });
  const k = Math.min(P.n, 40);
  P.b = (P.b * k + sb / N) / (k + 1); P.s = (P.s * k + ss / N) / (k + 1);
  P.hx = (P.hx * k + hx / N) / (k + 1); P.hy = (P.hy * k + hy / N) / (k + 1); P.n++;
  if (prevLuma) { const km = Math.min(P.nm, 40); P.m = (P.m * km + mot / N) / (km + 1); P.nm++; }
  prevLuma = luma; profDirty = true;
  if (t - lastProfSave > 15000) saveProfiles(t);
}
function saveProfiles(t) {
  if (!profDirty) return;
  profDirty = false; lastProfSave = t;
  store.set('am-profiles-v1', slimProfiles(false));
}

function createViz() {
  try { viz = BC.createVisualizer(ctx, canvas, { width: W, height: H, pixelRatio: 1, textureRatio: 1 }); }
  catch (e) { viz = null; say('WebGL startet nicht. Schließ andere Tabs und lade die Seite neu.'); return false; }
  try { viz.connectAudio(delayNode); } catch (e) { err('Milkdrop-Audio-Anschluss fehlgeschlagen: ' + (e && e.message || e)); }
  hookInstr();
  try { if (window.ACID_IMAGES) viz.loadExtraImages(window.ACID_IMAGES); } catch (e) { err('Bilder für die Bild-Presets konnten nicht geladen werden: ' + (e && e.message || e)); }   // Bilder für die Bild-Presets (acid-presets.js)
  applyColor();
  nextPreset(0, undefined, false, 'i');
  return true;
}

window.__AM_STEP = 8;
