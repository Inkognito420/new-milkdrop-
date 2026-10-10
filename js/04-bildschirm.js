// Acid Milkdrop · Teil 4 von 16: Größe, Auflösung und Farbe (P3, OLED-Schwarz)
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Reihenfolge ist wichtig: index.html lädt sie nacheinander. Bricht ein Teil ab, starten die folgenden nicht.
if (window.__AM_STEP !== 3) throw new Error('Acid Milkdrop: Teil 4 (bildschirm) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== Größe =====
function targetSize(noBrake) {
  const vv = window.visualViewport;
  const cw = Math.round(vv ? vv.width : window.innerWidth);
  const ch = Math.round(vv ? vv.height : window.innerHeight);
  const dpr = window.devicePixelRatio || 1, long = Math.max(cw, ch), q = $('quality').value;
  let scale = dpr;
  if (q === '2k') scale = Math.min(dpr, 2560 / long);
  else if (q === '1080') scale = Math.min(dpr, 1920 / long);
  else if (q === '720') scale = Math.min(dpr, 1280 / long);
  if (!noBrake) scale *= BRAKE_STEPS[curStep] || 1;
  return [Math.max(2, Math.round(cw * scale)), Math.max(2, Math.round(ch * scale)), cw, ch, dpr];
}
function resize() {
  const [w, h, cw, ch, dpr] = targetSize();
  fxScale = Math.min(2, dpr);
  const fw = Math.round(cw * fxScale), fh = Math.round(ch * fxScale);
  if (fxc.width !== fw || fxc.height !== fh) { fxc.width = fw; fxc.height = fh; }
  if (w === W && h === H) return;
  W = w; H = h; canvas.width = W; canvas.height = H;
  if (shPlayer) shSize();
  if (viz) { try { viz.setRendererSize(W, H); } catch (e) {} }
  $('res').textContent = W + '×' + H;
}
let rT = 0, hT1 = 0, hT2 = 0;
// iOS merkt sich nach dem Drehen manchmal die alte Lage der Knöpfe: Leiste zurücksetzen und neu aufbauen
function refreshHud() {
  const h = $('hud'); h.scrollTop = 0;
  h.style.display = 'none'; void h.offsetHeight; h.style.display = '';
  const r = h.getBoundingClientRect(), vv = window.visualViewport;
  rea('Drehung: ' + window.innerWidth + '×' + window.innerHeight + (vv ? ' (sichtbar ' + Math.round(vv.width) + '×' + Math.round(vv.height) + ')' : '') + ', Leiste Höhe ' + Math.round(r.height) + ' px');
}
const queueResize = () => { clearTimeout(rT); rT = setTimeout(resize, 150); clearTimeout(hT1); clearTimeout(hT2); hT1 = setTimeout(refreshHud, 250); hT2 = setTimeout(refreshHud, 900); };
window.addEventListener('resize', queueResize);
window.addEventListener('orientationchange', queueResize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', queueResize);
$('quality').value = '1080';                     // fest: 1080p (Build 52; vorher 2K = volle Pixelzahl des iPhone 15 Pro, das zwang schwere Presets in die Lastbremse und gab Unschärfesprünge)
$('quality').addEventListener('change', () => { store.set('am-quality', $('quality').value); W = 0; resize(); });
resize();

// ===== Farbe: P3, OLED-Schwarz und Acid-Farbton =====
const hasP3 = !!(window.matchMedia && matchMedia('(color-gamut: p3)').matches);
const colorEl = $('color');
if (!hasP3) { colorEl.querySelector('option[value="p3"]').disabled = true; colorEl.querySelector('option[value="p3oled"]').disabled = true; }
colorEl.value = hasP3 ? 'p3oled' : 'srgb';
let filterBase = '';
function applyColor() {
  const mode = colorEl.value;
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (gl && 'drawingBufferColorSpace' in gl) { try { gl.drawingBufferColorSpace = mode === 'srgb' ? 'srgb' : 'display-p3'; } catch (e) {} }
  filterBase = mode === 'p3oled' ? 'contrast(1.12) saturate(1.08)' : '';
  applyFilter(true);
}
function applyFilter(force) {
  const tot = hue + barHue;
  if (!force && Math.abs(tot - lastHue) < 0.7 && Math.abs(sat - lastSat) < 0.02) return;
  lastHue = tot; lastSat = sat;
  const a = ((tot % 360) + 360) % 360, hh = a > 180 ? a - 360 : a;
  const h = Math.abs(hh) >= 0.7 ? ' hue-rotate(' + hh.toFixed(1) + 'deg)' : '';
  const sv = Math.abs(sat - 1) >= 0.02 ? ' saturate(' + sat.toFixed(2) + ')' : '';
  canvas.style.filter = (filterBase + h + sv).trim();
  shEl.style.filter = canvas.style.filter;          // Takt-Farbe, Acid-Farbe und Drop-Entsättigung gelten auch für eigene Shader
}
colorEl.addEventListener('change', () => { store.set('am-color', colorEl.value); applyColor(); });

window.__AM_STEP = 4;
