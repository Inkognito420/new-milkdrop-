// Acid Milkdrop · Teil 3 von 16: Eigene Shader (eigene Zeichenfläche über Butterchurn)
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Reihenfolge ist wichtig: index.html lädt sie nacheinander. Bricht ein Teil ab, starten die folgenden nicht.
if (window.__AM_STEP !== 2) throw new Error('Acid Milkdrop: Teil 3 (eigene-shader) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== Eigene Shader (acid-shader.js): eigene Zeichenfläche über Butterchurn, ca. 15 % der Wechsel =====
// Läuft getrennt vom Ton-Weg. Fehlt die Datei oder startet die Grafik nicht, läuft alles wie vorher.
const shEl = $('sh'), SH = {};
try { (window.ACID_SHADERS || []).forEach(d => { SH['Eigen · ' + d.name] = d; }); } catch (e) {}
let shPlayer = null, shCur = null, shOp = 0, shFrom = 0, shTo = 0, shT0 = 0, shDur = 0;
let shTime = 0, shLastT = 0, shBar = 0, shHue0 = 0, lastShStyle = '';
const shLv = { b: 0, m: 0, h: 0, pb: 1e-4, pm: 1e-4, ph: 1e-4 };
// Grafik-Verlust (Build 48): Holt sich das System den WebGL-Speicher zurück (iOS z. B. im Hintergrund), meldet die Fläche "webglcontextlost".
// Ohne preventDefault kommt sie nie wieder: die Shader blieben bis zum Neuladen schwarz, und jeder neue Versuch sperrte einen weiteren als "kaputt".
// So: Shader aus dem Spiel nehmen, Milkdrop übernehmen lassen, nach der Wiederherstellung einen neuen Spieler anlegen und alles wieder freigeben.
let shGone = false, shWarmI = 0, shWarmAt = 0, shWarmMs = 0, shWarmMax = 0;
shEl.addEventListener('webglcontextlost', e => {
  e.preventDefault(); shGone = true;
  err('Grafik der eigenen Shader vom System pausiert (WebGL verloren)');
  const wasShown = !!shCur;
  shCur = null; shOp = 0; shDur = 0; shEl.style.opacity = '0';
  if (wasShown && curName && SH[curName]) nextPreset(0.5, undefined, false, 'g');
});
shEl.addEventListener('webglcontextrestored', () => {
  shPlayer = null; shWarmI = 0; shWarmAt = 0; shGone = false;     // neuer Spieler auf dem wiederhergestellten Kontext, Shader werden wieder vorab übersetzt
  for (const n in SH) broken.delete(n);
  rea('Eigene Shader: Grafik wiederhergestellt');
});
function shSize() {
  if (!W || !H) return;
  const T = targetSize(true);                                                         // ohne Lastbremse: die gilt nur für Milkdrop-Presets, eigene Shader laufen immer voll (halb)
  const w = Math.max(2, Math.round(T[0] * 0.5)), h = Math.max(2, Math.round(T[1] * 0.5));   // halbe Auflösung: spart Grafikleistung, Shader sind weich genug
  if (shEl.width !== w || shEl.height !== h) { shEl.width = w; shEl.height = h; }
}
function shEnsure() {
  if (shGone) return false;
  if (shPlayer) return true;
  if (!window.AcidShaderPlayer) return false;
  try { shSize(); shPlayer = new window.AcidShaderPlayer(shEl); rea('Eigene Shader: Grafik gestartet (' + shEl.width + '×' + shEl.height + ')'); return true; }
  catch (e) { err('Eigene Shader: Grafik startet nicht (' + e.message + ')'); for (const n in SH) broken.add(n); return false; }
}
function shFade(to, secs) { shFrom = shOp; shTo = to; shT0 = performance.now(); shDur = Math.max(150, secs * 1000); }
function shShow(n, blend) {
  if (!shEnsure()) return false;
  const d = SH[n];
  if (!shPlayer.use(d.id)) { err('Eigener Shader kaputt: ' + n + ' · ' + (shPlayer.errors[d.id] || '')); broken.add(n); return false; }
  if (shCur !== n) shHue0 = Math.random();
  shCur = n; shFade(1, blend); return true;
}
// Stil aus dem Abschnitt und der Stimmung: Drop = Peak Time, viel 303 = Acid, ruhige Teile = Driving
function shStyle() {
  const sec = sectionKey(), md = trackMood();
  if (sec === 'drop') return 'peak';
  if ((snd.acid || 0) > 0.4 || (md && md.acid > 0.35)) return 'acid';
  if (sec === 'break' || sec === 'intro' || sec === 'outro') return 'driving';
  return md && md.energy > 0.6 ? 'peak' : 'driving';
}
function pickShader() {
  const st = shStyle(), lastFew = recent.slice(-8), all = Object.keys(SH);
  const ok = n => usable(n) && n !== curName && !lastFew.includes(n);
  let a = all.filter(n => SH[n].style === st && ok(n));
  if (!a.length) a = all.filter(ok);
  if (!a.length) return null;
  const f = a.filter(n => favs.has(n)); if (f.length && Math.random() < 0.5) a = f;
  lastShStyle = st; return a[Math.floor(Math.random() * a.length)];
}
// Pegel für die Shader: Bass, Mitten (303), Höhen, je 0..1 an der eigenen Spitze gemessen
function shLevels(dt, b, m, h) {
  const k = Math.exp(-dt / 8000);
  shLv.pb = Math.max(shLv.pb * k, b, 1e-4); shLv.pm = Math.max(shLv.pm * k, m, 1e-4); shLv.ph = Math.max(shLv.ph * k, h, 1e-4);
  shLv.b = ema(shLv.b, clamp(b / shLv.pb), dt, 40); shLv.m = ema(shLv.m, clamp(m / shLv.pm), dt, 60); shLv.h = ema(shLv.h, clamp(h / shLv.ph), dt, 40);
}
// Vorbereiten: kurz nach dem Start jeden Shader einzeln übersetzen (unsichtbar), damit der erste echte Wechsel nicht ruckelt
function shWarmStep(t) {
  const list = window.ACID_SHADERS || [];
  if (!toggles.own || frozen || shWarmI >= list.length || shCur || shOp >= 0.002) return;
  if (!shWarmAt) { shWarmAt = t + 1500; return; }            // erst 1,5 s nach dem Start, dann alle 0,3 s einer
  if (t < shWarmAt || !shEnsure()) return;
  const d = list[shWarmI++], ms = shPlayer.warm(d.id);
  shWarmAt = t + 300;
  if (ms < 0) { err('Eigener Shader kaputt: Eigen · ' + d.name + ' · ' + (shPlayer.errors[d.id] || '')); broken.add('Eigen · ' + d.name); }
  else { shWarmMs += ms; shWarmMax = Math.max(shWarmMax, ms); }
  if (shWarmI >= list.length) rea('Eigene Shader vorbereitet: ' + list.length + ' Stück, zusammen ' + Math.round(shWarmMs) + ' ms, längster ' + Math.round(shWarmMax) + ' ms');
}
function shFrame(t) {
  shWarmStep(t);
  if (shDur) { const p = Math.min(1, (t - shT0) / shDur); shOp = shFrom + (shTo - shFrom) * p; if (p >= 1) shDur = 0; }
  const o = shOp < 0.002 ? '0' : shOp.toFixed(3);
  if (shEl.style.opacity !== o) shEl.style.opacity = o;
  const dt = shLastT ? Math.min(100, t - shLastT) : 16; shLastT = t;
  if (shOp < 0.002 || !shPlayer || frozen) return;
  shTime += dt / 1000;
  shSize();
  try {
    const S = { time: shTime, bass: shLv.b, mid: shLv.m, treb: shLv.h, beat: kickGlow, bar: shBar,
      build: toggles.build ? build : 0, hue: (shHue0 + shTime * 0.003) % 1, flash: reduceMotion ? 0.3 : 1 };
    shPlayer.draw(S);
  } catch (e) { if (shCur) { err('Eigener Shader Fehler: ' + e.message); broken.add(shCur); nextPreset(0.5, undefined, false, 'g'); } }
}

window.__AM_STEP = 3;
