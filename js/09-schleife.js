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
// Build 125: War die Seite versteckt, zählt die nächste Messung nicht. Auf dem iPhone kommt das erste Bild nach der Rückkehr VOR dem Ereignis „wieder sichtbar“
// (Protokoll Build 111: Bild um 04:29,7, Ereignis um 04:29,8), der Schutz aus Build 49 (js/16) kam dafür zu spät: die wenigen Bilder wurden durch die ganze
// versteckte Zeit geteilt („tiefster Wert 2 fps“). Das Verstecken selbst meldet der Browser rechtzeitig, darum wird es hier gemerkt.
let fpsSkip = false;
document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') fpsSkip = true; });
// Build 125: wie lange das Laden eines Bilds die Seite anhält (Shader übersetzen): Zeit in loadPreset plus das erste Zeichnen danach. Steht alle 5 Minuten in der
// Leistungs-Zeile, einzelne lange Halte (ab LOAD_SLOW_MS) sofort. Damit sieht man im Protokoll, ob z. B. der harte Schnitt im Drop ruckelt.
const LOAD_SLOW_MS = 120;
const loadSt = { pend: null, n: 0, sum: 0, max: 0, maxName: '', grab: { n: 0, sum: 0, max: 0 } };
function loadTimed(n, ms) { loadSt.pend = { n, ms, sec: sectionKey() }; }                 // aus loadByName (js/08): Zeit in viz.loadPreset
function loadDone(ms) {                                                                    // erstes Zeichnen nach dem Laden
  const p = loadSt.pend; loadSt.pend = null; if (!p) return;
  const tot = p.ms + ms; loadSt.n++; loadSt.sum += tot; if (tot > loadSt.max) { loadSt.max = tot; loadSt.maxName = p.n; }
  if (tot >= LOAD_SLOW_MS) rea('Bild laden hielt ' + Math.round(tot) + ' ms an (' + Math.round(p.ms) + ' ms Laden + ' + Math.round(ms) + ' ms erstes Zeichnen) · ' + p.n + ' · Abschnitt ' + p.sec);
}
const FRAME_MIN = 1000 / 60 - 3;                 // fest 60 Bilder pro Sekunde: auf 120-Hz-Displays wird jedes zweite Bild gezeichnet
function loop() {
  requestAnimationFrame(loop);
  if (!viz) return;
  const t = performance.now();
  if (t - lastDraw < FRAME_MIN) return;
  lastDraw = t;
  rollenFrame(t); if (viz.setExtraVars) viz.setExtraVars(AKV);   // new-milkdrop-: Klangrollen (js/08b) an die Presets, direkt vor dem Zeichnen (die Endstufe der Schaltzentrale ist seit Build 126 entfernt)
  if (!frozen) {
    const lp = loadSt.pend, r0 = lp ? performance.now() : 0;
    try { viz.render(); } catch (e) { if (curName) broken.add(curName); nextPreset(0, undefined, false, 'g'); }
    if (lp && loadSt.pend === lp) loadDone(performance.now() - r0);
    sampleFrame(t);
  }
  frameCount++;
  if (t - fpsT >= 1000) {
    const fps = Math.round(frameCount * 1000 / (t - fpsT));
    frameCount = 0; fpsT = t;
    if (fpsSkip) fpsSkip = false;                                    // Messung über eine versteckte Zeit: verwerfen
    else if (document.visibilityState === 'visible' && !frozen) perSecond(fps, t);
  }
  beatFrame(t);
  instrFrame(t);
  jrFrame(t);
  fxFrame(t);
  if (window.bbFrame) window.bbFrame(t);          // Build 117: Bildbogen (js/09b), direkt nach dem Zeichnen, solange das Bild noch lesbar ist
  if (window.msFrame) window.msFrame(t);          // Build 122: Mitschnitt (js/09c), ebenso
  if (auto && !frozen && !(toggles.phrase && engaged()) && t - lastSwitch > switchMs()) nextPreset(blendSecs('groove'), undefined, true, 't');
}
// Leistungs-Protokoll: alle 5 Minuten Durchschnitt und tiefster Wert, dazu jede Wächter-Markierung (um zu sehen, ob das Handy mit der Zeit warm wird)
const perf = { t0: performance.now(), sum: 0, n: 0, min: 99, marked: 0, last: performance.now() };
const minSince = t => ((t - perf.t0) / 60000).toFixed(1).replace('.', ',') + ' min';
function perfLog(fps, t) {
  if (fps > 0) { perf.sum += fps; perf.n++; if (fps < perf.min) perf.min = fps; }
  if (t - perf.last < 300000 || !perf.n) return;
  erg('Leistung nach ' + minSince(t) + ': im Schnitt ' + Math.round(perf.sum / perf.n) + ' fps, tiefster Wert ' + perf.min + ' fps, langsam markiert bisher ' + perf.marked + ' (' + slow.size + ' gesperrt)'
    + (loadSt.n ? ' · Bild laden: ' + loadSt.n + '×, Ø ' + Math.round(loadSt.sum / loadSt.n) + ' ms, längstes ' + Math.round(loadSt.max) + ' ms (' + loadSt.maxName + ')' : '')
    + (loadSt.grab.n ? ' · Bild-Wächter liest das Bild: Ø ' + (loadSt.grab.sum / loadSt.grab.n).toFixed(1).replace('.', ',') + ' ms, längstes ' + loadSt.grab.max.toFixed(0) + ' ms (' + loadSt.grab.n + '×)' : ''));
  loadSt.n = 0; loadSt.sum = 0; loadSt.max = 0; loadSt.maxName = ''; loadSt.grab = { n: 0, sum: 0, max: 0 };
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
