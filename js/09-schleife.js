// Acid Milkdrop · Teil 9 von 16: Render-Schleife (60 fps), Leistung und Wächter
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Reihenfolge ist wichtig: index.html lädt sie nacheinander. Bricht ein Teil ab, starten die folgenden nicht.
if (window.__AM_STEP !== 8) throw new Error('Acid Milkdrop: Teil 9 (schleife) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== Render-Schleife (fest 60 fps) und Wächter =====
$('guard').addEventListener('click', () => { guard = !guard; $('guard').classList.toggle('hot', guard); slowSecs = 0; if (curName) brakeApply(curName); });
const switchMs = () => PHRASE_BEATS * 60000 / bpm;
const engaged = () => scanActive() || beat.state !== 'warten';

let frameCount = 0, fpsT = performance.now();
let lastDraw = 0;
const FRAME_MIN = 1000 / 60 - 3;                 // fest 60 Bilder pro Sekunde: auf 120-Hz-Displays wird jedes zweite Bild gezeichnet
function loop() {
  requestAnimationFrame(loop);
  if (!viz) return;
  const t = performance.now();
  if (t - lastDraw < FRAME_MIN) return;
  lastDraw = t;
  if (!frozen) {
    const shFull = shCur && shOp >= 0.999;          // eigener Shader deckt alles ab: Milkdrop pausiert und spart Grafikleistung
    if (!shFull) { try { viz.render(); } catch (e) { if (curName) broken.add(curName); nextPreset(0, undefined, false, 'g'); } }
    if (!shCur && shOp < 0.01) sampleFrame(t);
  }
  shFrame(t);
  frameCount++;
  if (t - fpsT >= 1000) {
    const fps = Math.round(frameCount * 1000 / (t - fpsT));
    frameCount = 0; fpsT = t;
    if (document.visibilityState === 'visible' && !frozen) perSecond(fps, t);
  }
  beatFrame(t);
  instrFrame(t);
  jrFrame(t);
  fxFrame(t);
  if (auto && !frozen && !(toggles.phrase && engaged()) && t - lastSwitch > switchMs()) nextPreset(blendSecs('groove'), undefined, true, 't');
}
// Leistungs-Protokoll: alle 5 Minuten Durchschnitt und tiefster Wert, dazu jede Wächter-Markierung (um zu sehen, ob das Handy mit der Zeit warm wird)
const perf = { t0: performance.now(), sum: 0, n: 0, min: 99, marked: 0, last: performance.now() };
const minSince = t => ((t - perf.t0) / 60000).toFixed(1).replace('.', ',') + ' min';
function perfLog(fps, t) {
  if (fps > 0) { perf.sum += fps; perf.n++; if (fps < perf.min) perf.min = fps; }
  if (t - perf.last < 300000 || !perf.n) return;
  erg('Leistung nach ' + minSince(t) + ': im Schnitt ' + Math.round(perf.sum / perf.n) + ' fps, tiefster Wert ' + perf.min + ' fps, langsam markiert bisher ' + perf.marked + ' (' + slow.size + ' gesperrt)');
  perf.sum = 0; perf.n = 0; perf.min = 99; perf.last = t;
}
function perSecond(fps, t) {
  $('fps').textContent = fps;
  $('hz').textContent = '60';
  perfLog(fps, t);
  fpsHist.push([t, fps]); while (fpsHist.length && t - fpsHist[0][0] > 60000) fpsHist.shift();
  if (!guard || t - lastSwitch < 3000 || t < brakeUntil || t < scanBusyUntil) { slowSecs = 0; return; }
  if (fps < 52) slowSecs++; else slowSecs = 0;
  if (slowSecs >= 3 && curName) {
    slowSecs = 0;
    if (brakeTry(curName, fps, t)) return;                          // schwerer Favorit: erst eine Stufe kleiner, dann erst sperren
    slow.add(curName); perf.marked++;
    erg('Wächter: zu langsam (' + fps + ' fps) nach ' + minSince(t) + ' · ' + curName + ' · gesperrt: ' + slow.size);
    slowMarks.push(t); while (slowMarks.length && t - slowMarks[0] > 60000) slowMarks.shift();
    if (slowMarks.length >= 6) {
      err('Wächter aus nach ' + minSince(t) + ': 6 langsame Presets in 1 Minute (Handy vermutlich warm oder überlastet)');
      guard = false; $('guard').classList.remove('hot'); slow.clear(); slowMarks.length = 0;
      say('Gerade schaffen viele Presets keine 60 fps. Wächter ist aus.');
      return;
    }
    nextPreset(1.5, undefined, false, 'g');
  }
}

// Treffer-Korrektur: zählt, was man SIEHT. Landet ein Tipp (wegen iOS-Fehler nach dem Drehen) auf einem anderen Knopf als dem,
// über dem der Finger war, wird der Knopf unter dem Finger ausgelöst.
{ const hud = $('hud'); let tp = null;
  hud.addEventListener('touchstart', e => { tp = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true, capture: true });
  hud.addEventListener('touchend', e => {
    if (!tp || e.changedTouches.length !== 1) { tp = null; return; }
    const c = e.changedTouches[0], moved = Math.hypot(c.clientX - tp.x, c.clientY - tp.y); tp = null;
    if (moved > 10) return;
    const tgt = e.target && e.target.closest ? e.target : null;
    if (tgt && tgt.closest('select,input,label,textarea')) return;
    const tb = tgt && tgt.closest('button');
    let hit = null;
    for (const b of hud.querySelectorAll('button')) {
      if (b.disabled || !b.offsetParent) continue;
      const r = b.getBoundingClientRect();
      if (c.clientX >= r.left && c.clientX <= r.right && c.clientY >= r.top && c.clientY <= r.bottom) { hit = b; break; }
    }
    if (hit && hit !== tb) { e.preventDefault(); rea('Treffer-Versatz korrigiert: ' + (tb ? tb.id || tb.textContent : 'kein Knopf') + ' → ' + (hit.id || hit.textContent)); hit.click(); }
  }, { capture: true });
}

if (/[?&]debug\b/.test(location.search)) window.__BRAKE = { brake, brakeTry, brakeApply, fpsHist, perSecond, slow, loadByName, get step() { return curStep; }, get ticks() { return liveTicks; }, get guard() { return guard; }, set brakeUntil(v) { brakeUntil = v; } };   // nur zum Testen

window.__AM_STEP = 9;
