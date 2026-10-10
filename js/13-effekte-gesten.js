// Acid Milkdrop · Teil 13 von 16: Effekte (Puls, Blitz, Funken), Gesten, Leiste ausblenden
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Reihenfolge ist wichtig: index.html lädt sie nacheinander. Bricht ein Teil ab, starten die folgenden nicht.
if (window.__AM_STEP !== 12) throw new Error('Acid Milkdrop: Teil 13 (effekte-gesten) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== Effekte: Puls, Blitz, Build-up-Vignette, Funken, Ringe, Acid-Farbe =====
const fx2 = fxc.getContext('2d');
const sparks = [], rings = [];
let fxDirty = false, lastFx = performance.now(), lastTr = '', lastHead = 0;
const flashEl = $('flash'), dots = document.querySelectorAll('.beats i');

function onHat(s) {
  if (!toggles.spark || sparks.length > 140) return;
  const kn = kmNow(), hk = kn ? 0.6 + 0.8 * kn.hektik : 1;                 // Build 43: viele schnelle Hats im Takt = mehr Funken, ruhiger Takt = weniger
  let n = 2 + Math.floor(s * 4 * hk * (1 + 3 * (toggles.build ? build : 0)));
  if (window.__AMX && toggles.mix) n = mxSparks(n);                       // Build 46: Funken kosten Energie aus dem Konto
  for (let i = 0; i < n; i++) sparks.push({ x: Math.random() * fxc.width, y: Math.random() * fxc.height, r: (1 + 2.2 * Math.random()) * fxScale, life: 0, max: 160 + Math.random() * 140, acid: Math.random() < 0.5 });
}
function onSnare(s) {
  if (!toggles.spark || rings.length > 6) return;
  if (window.__AMX && toggles.mix && !mxRing()) return;
  rings.push({ life: 0, max: 340, a: 0.2 + 0.3 * s });
}
function burst(n) {
  if (!toggles.spark) return;
  const cx = fxc.width / 2, cy = fxc.height / 2;
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, d = Math.random() * Math.min(cx, cy); sparks.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, r: (1.5 + 3 * Math.random()) * fxScale, life: 0, max: 300 + Math.random() * 300, acid: true }); }
}

function fxFrame(t) {
  const dt = Math.min(100, t - lastFx); lastFx = t;
  pulse *= Math.exp(-dt / 110);
  flash *= Math.exp(-dt / 140);
  kickGlow *= Math.exp(-dt / 120);
  const b = toggles.build ? build : 0;
  bang *= Math.exp(-dt / 900);
  const pr = toggles.build ? dropPre : 0;
  { const kw = toggles.bar && !reduceMotion ? kmNow() : null; swLive = ema(swLive, kw ? kw.sweep : 0, dt, 700); }
  sat = (1 - 0.7 * pr * pr) * (1 + 0.45 * bang) * (1 + 0.3 * swLive);   // Build 53: Filter öffnet = Farben blühen auf, Filter schließt = zurückhaltender   // vor dem Drop Farbe raus, im Drop kurz übersatt
  let tr;
  if (window.__AMX && toggles.mix && !reduceMotion) {   // Build 46: Mischpult „Körper & Funken“ rechnet die ganze Bewegung (Teil 12b)
    if (morphOn) { morphOn = false; mxTransition(blender ? blender.state.blendDuration / 1000 : 2); }
    tr = mxFrame(t, dt);
  } else tr = oldBody(t, b);
  if (tr !== lastTr) { canvas.style.transform = tr; shEl.style.transform = tr; lastTr = tr; }
  shBar *= Math.exp(-dt / 250);
  flashEl.style.opacity = flash > 0.01 ? flash.toFixed(3) : '0';
  if (!toggles.bar) barHueTarget = barHue;      // ausgeschaltet: Farbe bleibt, wo sie ist
  barHue = ema(barHue, barHueTarget, dt, 90);    // kurzer Sprung (ca. 0,2 s), kein langes Gleiten
  if (barHueTarget > 3600) { barHueTarget -= 3600; barHue -= 3600; lastHue -= 3600; }
  applyFilter(false);
  const cur = beat.state === 'warten' && !scanActive() ? -1 : ((beat.n % 4) + 4) % 4;
  for (let i = 0; i < 4; i++) { dots[i].classList.toggle('on', i === cur); dots[i].classList.toggle('kick', i === cur && kickGlow > 0.3); }
  if (t - lastHead > 250) { lastHead = t; moveHead(); }
  drawFx(dt, b);
}
// Bewegung wie vor Build 46 (Schalter „Mischpult“ aus): Kick-Puls und Build-up als Zoom, beim Bildwechsel die Verformung des Blenders
function oldBody(t, b) {
  let sc = (toggles.pulse ? 1 + pulse : 1) + 0.07 * b * b;
  let tx = '';
  if (morphOn && blender) {
    const d = blender.update(null, t).deformed;
    if (!blender.state.active) morphOn = false;
    const rot = Math.max(-4, Math.min(4, d.rotation * 0.5));                               // höchstens 4°
    const zoom = Math.min(0.14, (d.scale - 1) * 0.9) + Math.abs(rot) * Math.PI / 180 * 2.2;   // etwas größer, damit beim Drehen keine Ecken sichtbar werden
    const dx = Math.max(-3, Math.min(3, d.x * 6)), dy = Math.max(-3, Math.min(3, d.y * 6));
    sc *= 1 + zoom;
    if (morphOn) tx = 'translate(' + dx.toFixed(2) + '%,' + dy.toFixed(2) + '%) rotate(' + rot.toFixed(2) + 'deg) ';
  }
  return (tx || sc !== 1) ? tx + 'scale(' + sc.toFixed(4) + ')' : '';
}
function drawFx(dt, b) {
  vign = ema(vign, b * 0.8, dt, 120);
  if (!sparks.length && !rings.length && vign < 0.005) {
    if (fxDirty) { fx2.clearRect(0, 0, fxc.width, fxc.height); fxDirty = false; }
    return;
  }
  const w = fxc.width, h = fxc.height, cx = w / 2, cy = h / 2, mn = Math.min(w, h), mx = Math.max(w, h);
  fx2.clearRect(0, 0, w, h); fxDirty = true;
  if (vign >= 0.005) {
    const g = fx2.createRadialGradient(cx, cy, mn * 0.3 * (1 - vign * 0.6), cx, cy, mx * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + vign.toFixed(3) + ')');
    fx2.fillStyle = g; fx2.fillRect(0, 0, w, h);
  }
  fx2.globalCompositeOperation = 'lighter';
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]; s.life += dt;
    if (s.life >= s.max) { sparks.splice(i, 1); continue; }
    const a = 1 - s.life / s.max;
    fx2.fillStyle = s.acid ? 'rgba(198,244,50,' + (a * 0.9).toFixed(3) + ')' : 'rgba(255,255,255,' + (a * 0.8).toFixed(3) + ')';
    fx2.beginPath(); fx2.arc(s.x, s.y, s.r * (0.6 + a * 0.6), 0, Math.PI * 2); fx2.fill();
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.life += dt;
    if (r.life >= r.max) { rings.splice(i, 1); continue; }
    const p = r.life / r.max;
    fx2.strokeStyle = 'rgba(198,244,50,' + (r.a * (1 - p)).toFixed(3) + ')';
    fx2.lineWidth = 2.5 * fxScale;
    fx2.beginPath(); fx2.arc(cx, cy, mn * (0.08 + 0.55 * p), 0, Math.PI * 2); fx2.stroke();
  }
  fx2.globalCompositeOperation = 'source-over';
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
      flash = reduceMotion ? 0.2 : 0.6; burst(30); pulse = Math.max(pulse, 0.05);
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
  if ((!audio.paused || micOn) && $('fine').hidden && performance.now() - lastTouch > 12000) hud.classList.add('off');
}, 1000);

window.__AM_STEP = 13;
