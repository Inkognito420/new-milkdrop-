// Acid Milkdrop · Teil 13 von 16: Effekte (Puls, Blitz, Aufbau), Gesten, Leiste ausblenden
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Reihenfolge ist wichtig: index.html lädt sie nacheinander. Bricht ein Teil ab, starten die folgenden nicht.
if (window.__AM_STEP !== 12) throw new Error('Acid Milkdrop: Teil 13 (effekte-gesten) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== Effekte: Kick-Puls, Drop-Blitz, Build-up-Vignette und -Sättigung =====
// Build 126 (Emmo: keine Schalter, Kick-Puls, Aufbau und Drop-Blitz bleiben fest): Funken, Ringe, Übergangs-Verformung, Acid- und Takt-Farbe
// sowie die zweite Zeichenfläche der eigenen Shader sind entfernt. Die Presets wirken für sich.
const fx2 = fxc.getContext('2d');
let fxDirty = false, lastFx = performance.now(), lastTr = '', lastHead = 0;
const flashEl = $('flash'), dots = document.querySelectorAll('.beats i');

function fxFrame(t) {
  const dt = Math.min(100, t - lastFx); lastFx = t;
  pulse *= Math.exp(-dt / 110);
  flash *= Math.exp(-dt / 140);
  kickGlow *= Math.exp(-dt / 120);
  const b = toggles.build ? build : 0;
  bang *= Math.exp(-dt / 900);
  const pr = toggles.build ? dropPre : 0;
  sat = (1 - 0.7 * pr * pr) * (1 + 0.45 * bang);   // vor dem Drop Farbe raus, im Drop kurz übersatt
  let tr = window.__AMX && toggles.mix && !reduceMotion ? mxFrame(t, dt) : oldBody(b);   // Teil 12b: Zoom-Feder auf dem Kick, Aufbau, Drop
  if (mdFlip) tr = (tr || '') + mdFlip;              // Build 116: Bild gespiegelt (links/rechts, oben/unten oder beides)
  if (tr !== lastTr) { canvas.style.transform = tr; lastTr = tr; }
  flashEl.style.opacity = flash > 0.01 ? flash.toFixed(3) : '0';
  applyFilter(false);
  const cur = beat.state === 'warten' && !scanActive() ? -1 : ((beat.n % 4) + 4) % 4;
  for (let i = 0; i < 4; i++) { dots[i].classList.toggle('on', i === cur); dots[i].classList.toggle('kick', i === cur && kickGlow > 0.3); }
  if (t - lastHead > 250) { lastHead = t; moveHead(); }
  drawFx(dt, b);
}
// Ohne Teil 12b oder mit „Bewegung reduzieren“ im System: Kick-Puls und Aufbau als einfacher Zoom
function oldBody(b) {
  const sc = (toggles.pulse ? 1 + pulse : 1) + 0.07 * b * b;
  return sc !== 1 ? 'scale(' + sc.toFixed(4) + ')' : '';
}
// Aufbau: das Bild wird zum Rand hin dunkler (Vignette)
function drawFx(dt, b) {
  vign = ema(vign, b * 0.8, dt, 120);
  if (vign < 0.005) {
    if (fxDirty) { fx2.clearRect(0, 0, fxc.width, fxc.height); fxDirty = false; }
    return;
  }
  const w = fxc.width, h = fxc.height, cx = w / 2, cy = h / 2, mn = Math.min(w, h), mx = Math.max(w, h);
  fx2.clearRect(0, 0, w, h); fxDirty = true;
  const g = fx2.createRadialGradient(cx, cy, mn * 0.3 * (1 - vign * 0.6), cx, cy, mx * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + vign.toFixed(3) + ')');
  fx2.fillStyle = g; fx2.fillRect(0, 0, w, h);
}

// ===== Gesten auf dem Bild =====
let pd = null, lpTimer = 0, tapTimer = 0, lastTapT = 0, hudWokeByTap = false;
canvas.addEventListener('pointerdown', e => {
  pd = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, frozen: false };
  clearTimeout(lpTimer);
  lpTimer = setTimeout(() => { if (pd) { pd.frozen = true; frozen = true; } }, 450);
});
canvas.addEventListener('pointermove', e => {
  if (!pd || pd.id !== e.pointerId || pd.frozen) return;
  if (Math.hypot(e.clientX - pd.x, e.clientY - pd.y) > 25) clearTimeout(lpTimer);
});
canvas.addEventListener('pointerup', e => {
  if (!pd || pd.id !== e.pointerId) return;
  clearTimeout(lpTimer);
  const d = pd; pd = null;
  if (d.frozen) { frozen = false; return; }
  const dx = e.clientX - d.x, dy = e.clientY - d.y, dur = performance.now() - d.t;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.3) { if (dx < 0) goNext(); else goPrev(); return; }
  if (Math.hypot(dx, dy) < 20 && dur < 350) {
    const now = performance.now();
    if (now - lastTapT < 300) {
      clearTimeout(tapTimer); lastTapT = 0;
      if (hudWokeByTap) { hud.classList.add('off'); hudWokeByTap = false; }   // Doppeltipp ist ein Schnitt, keine Leiste
      flash = reduceMotion ? 0.2 : 0.6; pulse = Math.max(pulse, 0.05);
      nextPreset(0, moodTarget('drop'), false, 'd');
    } else {
      lastTapT = now;
      if (hud.classList.contains('off')) { hud.classList.remove('off'); hudWoke = now; hudWokeByTap = true; lastTouch = now; }   // sofort sichtbar
      else { hudWokeByTap = false; tapTimer = setTimeout(() => { if (!$('fine').hidden) $('fineBtn').click(); else hud.classList.add('off'); }, 260); }
    }
  }
});
canvas.addEventListener('pointercancel', () => { if (pd && pd.frozen) frozen = false; pd = null; clearTimeout(lpTimer); });

// ===== Leiste blendet sich selbst aus =====
let lastTouch = performance.now();
const touched = () => { lastTouch = performance.now(); };
window.addEventListener('pointerdown', touched, true);
window.addEventListener('input', touched, true);
setInterval(() => {
  if ((!audio.paused || micOn) && $('fine').hidden && $('ownList').hidden && performance.now() - lastTouch > 12000) hud.classList.add('off');   // Build 127: offene Liste „Eigene“ hält die Leiste
}, 1000);

window.__AM_STEP = 13;
