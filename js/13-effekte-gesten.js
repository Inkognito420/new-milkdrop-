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
// Ein Finger: wischen links/rechts = anderes Visual, tippen = Menü, Doppeltipp = Schnitt mit Blitz, halten = Freeze.
// Build 128 (Emmo, Gesten 1-4): wischen nach oben = Stern an/aus, nach unten = „Will ich nicht mehr sehen“ (mit Rückgängig),
//   zwei Finger links/rechts wischen = nächster/voriger Track, zwei Finger tippen = Mix (das laufende Visual wird erweitert).
// Drei Finger bleiben der Notaus (js/16). Senkrechtes Wischen, das am oberen oder unteren Rand beginnt, gehört dem iPhone
// (Mitteilungen, Kontrollzentrum, Home) und zählt hier nicht.
const GEST = { swipe: 60, axis: 1.3, tap: 20, tapMs: 350, dblMs: 300, holdMs: 450, edge: 28, two: 60, twoTap: 30, twoTapMs: 450 };
const ptrs = new Map();                                    // Finger auf dem Bild: pointerId → Start und letzte Lage
let pd = null, multi = null, lpTimer = 0, tapTimer = 0, lastTapT = 0, hudWokeByTap = false;
canvas.addEventListener('pointerdown', e => {
  ptrs.set(e.pointerId, { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY });
  if (ptrs.size === 1 && !multi) {
    pd = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, frozen: false };
    clearTimeout(lpTimer);
    lpTimer = setTimeout(() => { if (pd) { pd.frozen = true; frozen = true; } }, GEST.holdMs);
    return;
  }
  // zweiter (oder dritter) Finger: Mehrfinger-Geste, die Ein-Finger-Geste entfällt
  clearTimeout(lpTimer);
  if (pd && pd.frozen) frozen = false;
  if (!multi) multi = { t: pd ? pd.t : performance.now(), max: 0, moves: [], cancel: false };
  multi.max = Math.max(multi.max, ptrs.size);
  pd = null;
});
canvas.addEventListener('pointermove', e => {
  const P = ptrs.get(e.pointerId); if (P) { P.x = e.clientX; P.y = e.clientY; }
  if (!pd || pd.id !== e.pointerId || pd.frozen) return;
  if (Math.hypot(e.clientX - pd.x, e.clientY - pd.y) > 25) clearTimeout(lpTimer);
});
function gestEnd(e, cancel) {
  const P = ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
  if (multi) {
    if (P) multi.moves.push([e.clientX - P.x0, e.clientY - P.y0]);
    if (cancel) multi.cancel = true;
    if (!ptrs.size) { const m = multi; multi = null; twoFinger(m); }
    return;
  }
  if (!pd || pd.id !== e.pointerId) return;
  clearTimeout(lpTimer);
  const d = pd; pd = null;
  if (d.frozen) { frozen = false; return; }
  if (cancel) return;
  oneFinger(d, e.clientX - d.x, e.clientY - d.y, performance.now() - d.t);
}
canvas.addEventListener('pointerup', e => gestEnd(e, false));
canvas.addEventListener('pointercancel', e => gestEnd(e, true));
function oneFinger(d, dx, dy, dur) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax > GEST.swipe && ax > ay * GEST.axis) { if (dx < 0) goNext(); else goPrev(); return; }
  if (ay > GEST.swipe && ay > ax * GEST.axis) {
    const H = window.innerHeight || 0;
    if (d.y < GEST.edge || d.y > H - GEST.edge) { rea('Geste: senkrecht vom Rand, gehört dem iPhone'); return; }
    if (dy < 0) starSwipe(); else if (window.wegNow) wegNow();
    return;
  }
  if (Math.hypot(dx, dy) < GEST.tap && dur < GEST.tapMs) {
    const now = performance.now();
    if (now - lastTapT < GEST.dblMs) {
      clearTimeout(tapTimer); lastTapT = 0;
      if (hudWokeByTap) { hud.classList.add('off'); hudWokeByTap = false; }   // Doppeltipp ist ein Schnitt, keine Leiste
      flash = reduceMotion ? 0.2 : 0.6; pulse = Math.max(pulse, 0.05);
      nextPreset(0, moodTarget('drop'), false, 'd');
    } else {
      lastTapT = now;
      if (hud.classList.contains('off')) { hud.classList.remove('off'); hudWoke = now; hudWokeByTap = true; lastTouch = now; }   // sofort sichtbar
      else { hudWokeByTap = false; tapTimer = setTimeout(sheetsOrHide, 260); }
    }
  }
}
// Tipp aufs Bild bei sichtbarem Menü: erst ein offenes Fenster schließen, sonst das Menü ausblenden
function sheetsOrHide() {
  if (!$('fine').hidden) $('fineBtn').click();
  else if (!$('ownList').hidden) $('ownBtn').click();
  else hud.classList.add('off');
}
// Wisch nach oben: Stern an/aus, wie der Stern-Knopf (Mitschrift, Mix-Rezept), dazu ein großer Stern in der Mitte
function starSwipe() {
  if (!curName) return;
  $('fav').click();
  const on = favs.has(curName);
  if (window.gfxPop) gfxPop(on ? 'starf' : 'star', on ? '' : 'white');
  if (window.toast) toast((on ? '★ Favorit: ' : 'Stern entfernt: ') + curName, 1800);
}
// Zwei Finger: Track wechseln (wischen) oder Mix (tippen). Drei und mehr Finger: nichts (Notaus läuft in js/16).
function twoFinger(m) {
  if (m.cancel || m.max !== 2 || m.moves.length < 2) return;
  const dx = (m.moves[0][0] + m.moves[1][0]) / 2, dy = (m.moves[0][1] + m.moves[1][1]) / 2, dur = performance.now() - m.t;
  const still = m.moves.every(v => Math.hypot(v[0], v[1]) < GEST.twoTap);
  if (Math.abs(dx) > GEST.two && Math.abs(dx) > Math.abs(dy) * GEST.axis) { trackSwipe(dx < 0 ? 1 : -1); return; }
  if (still && dur < GEST.twoTapMs) {
    rea('Geste: zwei Finger tippen → Mix');
    if (window.gfxPop) gfxPop('mix');
    if (window.mixNow) mixNow(); else if (window.toast) toast('Mix geht gerade nicht', 2000);
  }
}
function trackSwipe(dir) {
  const i = qi + dir;
  if (micOn || !queue.length || typeof playAt !== 'function') { if (window.toast) toast(micOn ? 'Mikro läuft: keine Tracks zum Wechseln' : 'Noch keine Tracks geladen', 2200); return; }
  if (i < 0 || i >= queue.length) { if (window.toast) toast(dir > 0 ? 'Das ist der letzte Track' : 'Das ist der erste Track', 2000); return; }
  rea('Geste: zwei Finger wischen → ' + (dir > 0 ? 'nächster' : 'voriger') + ' Track');
  if (window.gfxPop) gfxPop(dir > 0 ? 'skip' : 'skipb', 'white');
  playAt(i);
  if (window.toast) toast((dir > 0 ? '⏭ ' : '⏮ ') + (i + 1) + '/' + queue.length + ' · ' + queue[i].name.replace(/\.[^.]+$/, ''), 2600);
}

// ===== Leiste blendet sich selbst aus =====
let lastTouch = performance.now();
const touched = () => { lastTouch = performance.now(); };
window.addEventListener('pointerdown', touched, true);
window.addEventListener('input', touched, true);
setInterval(() => {
  if ((!audio.paused || micOn) && $('fine').hidden && $('ownList').hidden && performance.now() - lastTouch > 12000) hud.classList.add('off');   // Build 127: offene Liste „Eigene“ hält die Leiste
}, 1000);

window.__AM_STEP = 13;
