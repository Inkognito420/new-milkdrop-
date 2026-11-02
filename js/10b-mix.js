// new-milkdrop- · Teil 10b: Mix (ab Build 115). Zwei Favoriten werden zu einem neuen Bild gekreuzt.
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Dieser Teil ändert window.__AM_STEP NICHT: bricht er ab, fehlt nur der Mix-Knopf, alles andere läuft weiter.
if (window.__AM_STEP !== 10) throw new Error('new-milkdrop-: Teil 10b (mix) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== Idee (Emmo, Build 114): neue Bilder aus zwei vorhandenen, wie die „mash“-Presets der Milkdrop-Szene =====
// Ein Milkdrop-Preset besteht aus Bausteinen. Der Mix nimmt
//   BEWEGUNG von Elternteil A: Grundwerte (Zoom, Drehen, Verschiebung, Wellen …), Formeln (init/frame/pixel) und den Warp-Shader,
//   LOOK von Elternteil B:     den Comp-Shader (wie das Bild „angemalt“ wird) und die Look-Grundwerte (MIX_LOOK_KEYS),
//   FORMEN (Shapes, Waves) von A oder B.
// q-Werte: Comp-Shader lesen oft q1..q32, die die Formeln ihres eigenen Presets setzen. Braucht B's Comp q-Werte, laufen B's Formeln mit
// (vor A's Formeln), die q-Werte, die B's Comp braucht, werden gesichert und nach A's Formeln zurückgeschrieben. Liest A's Warp oder
// A's Pixel-Formel dieselben q-Werte, passt das Paar nicht zusammen (wird gar nicht erst versucht).
// Jeder Mix wird vorher unsichtbar geprüft (kleiner zweiter Visualizer, 128×72): nicht schwarz, nicht weiß, bewegt sich, keine Fehler.
// Ein Mix mit Stern wird als Rezept gespeichert (nmd:mixe, nur Namen der Eltern und Formen-Seite) und beim Start neu gebaut.
const MIX_LOOK_KEYS = ['gammaadj', 'echo_zoom', 'echo_alpha', 'echo_orient', 'red_blue', 'brighten', 'darken', 'solarize', 'invert',
  'b1n', 'b2n', 'b3n', 'b1x', 'b2x', 'b3x', 'b1ed'];
const MIXCFG = {
  tries: 8,                    // so viele Paare höchstens pro Knopfdruck
  w: 128, h: 72,               // Größe des Prüf-Visualizers
  frames: 40, perTick: 4,      // so viele Prüf-Bilder (je 1/30 s Musikzeit), so viele pro Bildschirm-Bild (verteilt die Arbeit)
  lumaMin: 16, lumaMax: 245,   // mittlere Helligkeit (0-255): darunter schwarz bzw. trüb, darüber weiß
  moveMin: 0.4,                // mittlere Änderung zwischen Bild 20 und 40 (0-255): darunter steht das Bild
  blend: 2                     // Überblenden zum Mix in Sekunden
};
const MIX = { recipes: [], busy: false, viz: null, vizFail: false, st: { made: 0, rejected: 0, why: {} } };
const isMix = n => typeof n === 'string' && n.indexOf('Mix · ') === 0;
const mixQs = s => { const o = new Set(); String(s || '').replace(/\bq(\d+)\b/g, (m, d) => { o.add(+d); return m; }); return o; };
const mixShort = n => { const s = String(n).replace(/^[_$\s]+/, '').split(/ - | · /).pop().replace(/\s*[\[(].*$/, '').trim() || String(n); return s.length > 22 ? s.slice(0, 21) + '…' : s; };
const mixFormsQ = p => [].concat(p.shapes || [], p.waves || []).filter(x => x && x.baseVals && x.baseVals.enabled !== 0)
  .map(x => (x.init_eqs_str || '') + (x.frame_eqs_str || '') + (x.point_eqs_str || '')).join(';');

// Ein Kind bauen. r = { a, b, f } (f: 'a' oder 'b' = woher die Formen kommen). Gibt null zurück, wenn das Paar nicht passt.
function mixBuild(r) {
  const A = presets[r.a], B = presets[r.b];
  if (!A || !B || r.a === r.b || isMix(r.a) || isMix(r.b) || SH[r.a] || SH[r.b]) return null;
  if (!B.comp) return null;                                         // ohne eigenen Look bringt B nichts mit
  const need = mixQs(B.comp), aUse = mixQs((A.warp || '') + ';' + (A.pixel_eqs_str || ''));
  for (const q of need) if (aUse.has(q)) return null;               // A und B brauchen dieselben q-Werte: passt nicht zusammen
  const withB = need.size > 0;
  let f = r.f === 'b' ? 'b' : 'a';
  if (f === 'b' && !withB && mixQs(mixFormsQ(B)).size) f = 'a';     // B's Formen brauchen B's q-Werte, die laufen aber nicht mit
  const qs = [...need], save = qs.map(q => 'a._mixq' + q + '=a.q' + q + ';').join(''), back = qs.map(q => 'a.q' + q + '=a._mixq' + q + ';').join('');
  const look = {}; for (const k of MIX_LOOK_KEYS) if (B.baseVals && k in B.baseVals) look[k] = B.baseVals[k];
  const F = f === 'b' ? B : A;
  return {
    baseVals: Object.assign({}, A.baseVals || {}, look),
    init_eqs_str: (withB ? (B.init_eqs_str || '') + ';\n' : '') + (A.init_eqs_str || ''),
    frame_eqs_str: withB ? (B.frame_eqs_str || '') + ';\n' + save + '\n' + (A.frame_eqs_str || '') + ';\n' + back : (A.frame_eqs_str || ''),
    pixel_eqs_str: A.pixel_eqs_str || '',
    warp: A.warp || '', comp: B.comp,
    shapes: (F.shapes || []).map(x => Object.assign({}, x)), waves: (F.waves || []).map(x => Object.assign({}, x)),
    mix: { a: r.a, b: r.b, f }
  };
}
function mixName(r) {
  const base = 'Mix · ' + mixShort(r.a) + ' × ' + mixShort(r.b);
  for (let i = 1; i < 99; i++) { const n = i === 1 ? base : base + ' ' + i; const p = presets[n]; if (!p || (p.mix && p.mix.a === r.a && p.mix.b === r.b)) return n; }
  return base + ' ' + Date.now();
}
// Eltern: Favoriten (Milkdrop-Presets, keine eigenen Shader, keine Mixe). Zu wenige Sterne: alle brauchbaren Presets.
function mixParents() {
  const ok = n => presets[n] && !SH[n] && !isMix(n) && usable(n);
  const fav = [...favs].filter(ok);
  return fav.length >= 2 ? { pool: fav, fav: true } : { pool: names.filter(ok), fav: false };
}

// ===== Prüfen: kleiner zweiter Visualizer, unsichtbar =====
function mixViz() {
  if (MIX.viz || MIX.vizFail) return MIX.viz;
  try {
    const c = document.createElement('canvas'); c.width = MIXCFG.w; c.height = MIXCFG.h;
    MIX.viz = BC.createVisualizer(ctx, c, { width: MIXCFG.w, height: MIXCFG.h, pixelRatio: 1, textureRatio: 1 });
    MIX.viz.connectAudio(delayNode);
    try { if (window.ACID_IMAGES) MIX.viz.loadExtraImages(window.ACID_IMAGES); } catch (e) {}
    if (!(MIX.viz.renderer && MIX.viz.renderer.gl)) { MIX.viz = null; MIX.vizFail = true; }
  } catch (e) { MIX.viz = null; MIX.vizFail = true; err('Mix: Prüf-Grafik startet nicht (' + (e && e.message || e) + '), Mixe laufen ungeprüft'); }
  return MIX.viz;
}
const mixTick = () => new Promise(res => requestAnimationFrame(() => res()));
async function mixCheck(p) {
  const V = mixViz(); if (!V) return { ok: true, skip: true };
  const gl = V.renderer.gl, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(4 * W * H);
  const read = () => { gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); return px.slice(); };
  let f20 = null, f40 = null;
  try {
    V.loadPreset(p, 0);
    for (let i = 1; i <= MIXCFG.frames; i++) {
      V.render({ elapsedTime: 1 / 30 });
      if (i === 20) f20 = read(); else if (i === MIXCFG.frames) f40 = read();
      if (i % MIXCFG.perTick === 0) await mixTick();
    }
  } catch (e) { return { ok: false, why: 'Fehler' }; }
  let l = 0, d = 0; const n = W * H;
  for (let i = 0; i < px.length; i += 4) { const y = 0.3 * f40[i] + 0.59 * f40[i + 1] + 0.11 * f40[i + 2]; l += y; d += Math.abs(f40[i] - f20[i]) + Math.abs(f40[i + 1] - f20[i + 1]) + Math.abs(f40[i + 2] - f20[i + 2]); }
  l /= n; d /= 3 * n;
  const out = { luma: +l.toFixed(1), move: +d.toFixed(2) };
  out.ok = l >= MIXCFG.lumaMin && l <= MIXCFG.lumaMax && d >= MIXCFG.moveMin;
  if (!out.ok) out.why = l < MIXCFG.lumaMin ? 'schwarz' : l > MIXCFG.lumaMax ? 'weiß' : 'steht';
  return out;
}

// ===== Knopf „Mix“: Paar suchen, prüfen, zeigen =====
async function mixNow() {
  if (MIX.busy || !viz) return false;
  MIX.busy = true; const btn = $('mixBtn'); if (btn) { btn.disabled = true; btn.textContent = 'Mix …'; }
  try {
    const P = mixParents();
    if (P.pool.length < 2) { rea('Mix: zu wenige Presets'); return false; }
    if (!P.fav) rea('Mix: weniger als 2 Favoriten, Eltern werden zufällig gewählt');
    for (let t = 0; t < MIXCFG.tries; t++) {
      const a = P.pool[Math.floor(Math.random() * P.pool.length)], b = P.pool[Math.floor(Math.random() * P.pool.length)];
      const r = { a, b, f: Math.random() < 0.5 ? 'a' : 'b' }, p = mixBuild(r);
      if (!p) { MIX.st.why.passt = (MIX.st.why.passt || 0) + 1; continue; }
      const c = await mixCheck(p);
      if (!c.ok) { MIX.st.rejected++; MIX.st.why[c.why] = (MIX.st.why[c.why] || 0) + 1; rea('Mix verworfen (' + c.why + (c.luma !== undefined ? ', Helligkeit ' + c.luma + ', Bewegung ' + c.move : '') + '): ' + a + ' × ' + b); continue; }
      const n = mixName(r); presets[n] = p; tunedCache.delete(n);
      if (!loadByName(n, MIXCFG.blend, true, 'm')) { MIX.st.why.laden = (MIX.st.why.laden || 0) + 1; continue; }
      MIX.st.made++;
      erg('Mix: ' + n + ' · Bewegung „' + a + '“, Look „' + b + '“, Formen von ' + (p.mix.f === 'a' ? 'Bewegung' : 'Look') + (c.skip ? ' · ungeprüft' : ' · geprüft (Helligkeit ' + c.luma + ', Bewegung ' + c.move + ')'));
      return true;
    }
    rea('Mix: in ' + MIXCFG.tries + ' Versuchen kein passendes Paar gefunden, nochmal tippen');
    return false;
  } finally { MIX.busy = false; if (btn) { btn.disabled = false; btn.textContent = 'Mix'; } }
}

// ===== Rezepte: Mixe mit Stern bleiben =====
function mixSave() {
  const keep = []; for (const n of favs) { const p = presets[n]; if (isMix(n) && p && p.mix) keep.push({ n, a: p.mix.a, b: p.mix.b, f: p.mix.f }); }
  MIX.recipes = keep; store.set('mixe', keep);
}
{ const saved = store.get('mixe', []); let ok = 0, lost = 0;
  if (Array.isArray(saved)) for (const r of saved) {
    if (!r || typeof r.n !== 'string' || !isMix(r.n)) continue;
    const p = mixBuild(r); if (p) { presets[r.n] = p; ok++; } else { lost++; favs.delete(r.n); }
  }
  MIX.recipes = Array.isArray(saved) ? saved.filter(r => r && presets[r.n]) : [];
  if (ok || lost) rea('Mixe mit Stern: ' + ok + ' gebaut' + (lost ? ', ' + lost + ' ohne Eltern (entfernt)' : '')); }
$('fav').addEventListener('click', () => { if (isMix(curName) || MIX.recipes.some(r => !favs.has(r.n))) mixSave(); });   // läuft nach dem Stern-Knopf (js/05): Stern gesetzt = Rezept speichern, weg = löschen
{ const b = $('mixBtn'); if (b) { b.hidden = false; b.addEventListener('click', () => { mixNow(); }); } }
window.__MIX = MIX; window.mixNow = mixNow; window.mixBuild = mixBuild;
