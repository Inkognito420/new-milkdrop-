// new-milkdrop- · Teil 10b: Mix (ab Build 115). Zwei Presets werden zu einem neuen Bild gekreuzt (Knopf ab Build 128: das laufende Visual bleibt Anker).
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
  tries: 12,                   // so viele Paare höchstens pro Suche (Build 120: 8 → 12, in der Sandbox fand jede 12. Suche mit 12 Favoriten in 8 Versuchen nichts)
  w: 128, h: 72,               // Größe des Prüf-Visualizers
  frames: 40, perTick: 4,      // so viele Prüf-Bilder (je 1/30 s Musikzeit), so viele pro Bildschirm-Bild (verteilt die Arbeit)
  lumaMin: 16, lumaMax: 220,   // mittlere Helligkeit (0-255): darunter schwarz bzw. trüb, darüber zu hell. Build 119 nach Emmos Sternen (Bildbogen + Protokoll Build 117):
                               // gesternt bei Helligkeit 20, 24, 71, 210; nicht gesternt und fast weiß bei 227-234 (Build 118 hatte 205, das hätte den 210er verworfen)
  washLuma: 185, washStd: 35,  // Build 120 (zweiter Bildbogen vom iPhone): blass = hell UND wenig Kontrast (Streuung der Helligkeit über das Bild).
                               // Gemessen an Emmos Bildbögen (Helligkeit/Kontrast): verworfen gehörten 220/30, 215/20, 213/26, 242/7, 229/32; gut waren z. B. 97/38, 70/76
  flatStd: 15, flatSat: 12,
  flatAny: 10,                 // Build 121: flach = kaum Kontrast, auch wenn farbig (dritter Bildbogen: „cartune × splatter effects“ war nur eine Farbfläche, Kontrast 3-7, Farbe 34-186)    // grau = kaum Kontrast UND kaum Farbe (gemessen 86/4 bzw. 89/14 bei Farbigkeit 0-10); dunkel, aber farbig (26/12, Farbigkeit 44) bleibt
  moveMin: 5,                  // mittlere Änderung zwischen Bild 20 und 40 (0-255): darunter steht das Bild. Build 119: 0,4 → 5 (gesternt bei Bewegung 15-74,
                               // die fast stehenden mit 0,5 und 4 sahen im Bildbogen wie ein Standbild aus)
  blend: 2,                    // Überblenden zum Mix in Sekunden
  share: 0.35,                 // Auto-Mix (Build 118): so viele automatische Bildwechsel (Abschnitt, Phrase, Zeit) werden ein frischer Mix (Build 126: fest, kein Regler mehr)
  prepEveryMs: 3000,           // so oft wird nachgesehen, ob ein Mix vorbereitet werden muss
  prepAfterSwitchMs: 3500      // ... aber erst so lange nach einem Bildwechsel (Überblenden ist dann durch, das Prüfen stört nichts)
};
const MIX = { bad: new Set(), recipes: [], busy: false, viz: null, vizFail: false, ready: null, share: MIXCFG.share, st: { made: 0, rejected: 0, auto: 0, why: {} } };
const isMix = n => typeof n === 'string' && n.indexOf('Mix · ') === 0;
const isOwn = n => EIGEN.has(n) || !!(presets[n] && presets[n].lens);   // Build 129: eigene Visuals und ihre Linsen-Varianten (nie Mix-Eltern)
const mixQs = s => { const o = new Set(); String(s || '').replace(/\bq(\d+)\b/g, (m, d) => { o.add(+d); return m; }); return o; };
const mixShort = n => { const s = String(n).replace(/^[_$\s]+/, '').split(/ - | · /).pop().replace(/\s*[\[(].*$/, '').trim() || String(n); return s.length > 22 ? s.slice(0, 21) + '…' : s; };
const mixFormsQ = p => [].concat(p.shapes || [], p.waves || []).filter(x => x && x.baseVals && x.baseVals.enabled !== 0)
  .map(x => (x.init_eqs_str || '') + (x.frame_eqs_str || '') + (x.point_eqs_str || '')).join(';');

// Ein Kind bauen. r = { a, b, f } (f: 'a' oder 'b' = woher die Formen kommen). Gibt null zurück, wenn das Paar nicht passt.
function mixBuild(r) {
  const A = presets[r.a], B = presets[r.b];
  if (!A || !B || r.a === r.b || isMix(r.a) || isMix(r.b) || isOwn(r.a) || isOwn(r.b)) return null;   // Build 126: eigene Visuals zeichnen ihr Bild ganz im Comp, als Mix-Partner taugen sie nicht
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
  const ok = n => presets[n] && !isOwn(n) && !isMix(n) && usable(n);
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
// Bewertung eines Prüfbilds: '' = gut, sonst der Grund (Helligkeit, Kontrast = Streuung der Helligkeit, Farbe = max-min je Punkt, Bewegung; alles 0-255)
function mixJudge(l, sd, sat, d) {
  const C = MIXCFG;
  return l < C.lumaMin ? 'schwarz' : l > C.lumaMax ? 'weiß' : d < C.moveMin ? 'steht' : (l >= C.washLuma && sd < C.washStd) ? 'blass' : (sd < C.flatStd && sat < C.flatSat) ? 'grau' : sd < C.flatAny ? 'flach' : '';
}
const mixTick = () => new Promise(res => requestAnimationFrame(() => res()));
async function mixCheck(p, keepPx) {                                // keepPx (Build 129): das letzte Prüfbild mitgeben (Linsen-Vergleich)
  const V = mixViz(); if (!V) return { ok: true, skip: true };
  const gl = V.renderer.gl, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(4 * W * H);
  const read = () => { gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); return px.slice(); };
  let f20 = null, f40 = null, h0 = performance.now(), hMax = 0;      // Build 125: wie lange die Prüfung die Seite am Stück anhält (Laden + je perTick Prüfbilder)
  const held = () => { const ms = performance.now() - h0; if (ms > hMax) hMax = ms; };
  try {
    V.loadPreset(p, 0);
    for (let i = 1; i <= MIXCFG.frames; i++) {
      V.render({ elapsedTime: 1 / 30 });
      if (i === 20) f20 = read(); else if (i === MIXCFG.frames) f40 = read();
      if (i % MIXCFG.perTick === 0) { held(); await mixTick(); h0 = performance.now(); }
    }
  } catch (e) { return { ok: false, why: 'Fehler' }; }
  held(); { const S = MIX.st; S.chkN = (S.chkN || 0) + 1; S.chkSum = (S.chkSum || 0) + hMax; if (hMax > (S.chkMax || 0)) S.chkMax = hMax; }
  let l = 0, l2 = 0, d = 0, sat = 0; const n = W * H;
  for (let i = 0; i < px.length; i += 4) {
    const r = f40[i], g = f40[i + 1], b = f40[i + 2], y = 0.3 * r + 0.59 * g + 0.11 * b;
    l += y; l2 += y * y; sat += Math.max(r, g, b) - Math.min(r, g, b);
    d += Math.abs(r - f20[i]) + Math.abs(g - f20[i + 1]) + Math.abs(b - f20[i + 2]);
  }
  l /= n; d /= 3 * n; sat /= n; const sd = Math.sqrt(Math.max(0, l2 / n - l * l));
  const out = { luma: +l.toFixed(1), move: +d.toFixed(2), kontrast: +sd.toFixed(1), farbe: +sat.toFixed(1) };
  out.why = mixJudge(l, sd, sat, d); out.ok = !out.why;
  if (keepPx) out.px = f40;
  return out;
}

// ===== Paar suchen und prüfen (für Knopf und Auto-Mix) =====
// Ein Rezept bauen und prüfen. Gibt { r, p, c } zurück oder null (dann ist die Paarung bis zum Neuladen gesperrt).
async function mixTry(r, tag) {
  const key = r.a + '|' + r.b;
  if (MIX.bad.has(key)) return null;                                // Build 120: schon einmal durchgefallen (bis zum Neuladen gemerkt)
  const p = mixBuild(r);
  if (!p) { MIX.bad.add(key); MIX.st.why.passt = (MIX.st.why.passt || 0) + 1; return null; }
  const c = await mixCheck(p);
  if (!c.ok) { MIX.bad.add(key); MIX.st.rejected++; MIX.st.why[c.why] = (MIX.st.why[c.why] || 0) + 1; rea(tag + ' verworfen (' + c.why + (c.luma !== undefined ? ', Helligkeit ' + c.luma + ', Kontrast ' + c.kontrast + ', Farbe ' + c.farbe + ', Bewegung ' + c.move : '') + '): ' + r.a + ' × ' + r.b); return null; }
  return { r, p, c };
}
async function mixFind(tag) {
  const P = mixParents();
  if (P.pool.length < 2) { rea('Mix: zu wenige Presets'); return null; }
  for (let t = 0; t < MIXCFG.tries; t++) {
    const a = P.pool[Math.floor(Math.random() * P.pool.length)], b = P.pool[Math.floor(Math.random() * P.pool.length)];
    const m = await mixTry({ a, b, f: Math.random() < 0.5 ? 'a' : 'b' }, tag);
    if (m) { m.fav = P.fav; return m; }
  }
  rea(tag + ': in ' + MIXCFG.tries + ' Versuchen kein passendes Paar gefunden');
  return null;
}

// ===== Build 128 (Emmo): Mix-Knopf und Zwei-Finger-Tipp ERWEITERN das laufende Visual, statt es zu ersetzen =====
// Das laufende Visual ist der Anker und behält seine Formen (Linien, Kreise, Wellen):
//   normales Preset: per Zufall bleibt seine Bewegung (neuer Look vom Partner) oder sein Look (neue Bewegung vom Partner).
//   Mix: die Hälfte mit den Formen bleibt in ihrer Rolle, die andere Hälfte wird ersetzt. Mehrmals drücken = das Bild entwickelt sich weiter.
// Partner: zu 60 % ein Favorit (wenn es einen gibt), sonst irgendein brauchbares Preset. Nie eigene Visuals, Mixe, Ausgeblendete oder der Anker selbst.
// Eigene Visuals zeichnen ihr Bild ganz im Comp-Shader, dazu passt kein Partner: für sie gibt es ab Build 129 „Variante + Linse“ (unten).
const MIX_FAV_SHARE = 0.6;
function mixAnchor(n) {
  if (!n || !presets[n] || isOwn(n)) return null;
  if (!isMix(n)) return { n, role: null, other: null };
  const m = presets[n].mix; if (!m) return null;
  const k = m.f === 'b' ? 'b' : 'a';
  return presets[m[k]] ? { n: m[k], role: k, other: m[k === 'a' ? 'b' : 'a'] } : null;
}
async function mixExtendFind(an, tag) {
  const ok = x => presets[x] && x !== an.n && x !== an.other && !isOwn(x) && !isMix(x) && usable(x);
  const fav = [...favs].filter(ok), all = names.filter(ok);
  if (!all.length) { rea(tag + ': kein Partner übrig'); return null; }
  const hasComp = !!presets[an.n].comp;
  for (let t = 0; t < MIXCFG.tries; t++) {
    const pool = fav.length && Math.random() < MIX_FAV_SHARE ? fav : all;
    const x = pool[Math.floor(Math.random() * pool.length)];
    let role = an.role || (hasComp && Math.random() < 0.5 ? 'b' : 'a');   // ohne eigenen Comp kann der Anker nur die Bewegung behalten
    const r = role === 'a' ? { a: an.n, b: x, f: 'a' } : { a: x, b: an.n, f: 'b' };
    const m = await mixTry(r, tag);
    if (m) { m.keep = role; return m; }
  }
  rea(tag + ': in ' + MIXCFG.tries + ' Versuchen kein Partner für „' + an.n + '“ gefunden');
  return null;
}
// Einen gefundenen Mix zeigen
function mixShow(m, blend, why, tag) {
  const n = mixName(m.r); presets[n] = m.p; tunedCache.delete(n);
  if (!loadByName(n, blend, true, why)) { MIX.st.why.laden = (MIX.st.why.laden || 0) + 1; return false; }
  MIX.st.made++;
  erg(tag + ': ' + n + (m.keep ? ' · erweitert, ' + (m.keep === 'a' ? 'Bewegung' : 'Look') + ' und Formen von „' + (m.keep === 'a' ? m.r.a : m.r.b) + '“ bleiben' : '') + ' · Bewegung „' + m.r.a + '“, Look „' + m.r.b + '“, Formen von ' + (m.p.mix.f === 'a' ? 'Bewegung' : 'Look') + (m.c.skip ? ' · ungeprüft' : ' · geprüft (Helligkeit ' + m.c.luma + ', Kontrast ' + m.c.kontrast + ', Farbe ' + m.c.farbe + ', Bewegung ' + m.c.move + ')') + (m.fav ? '' : ' · Eltern zufällig (weniger als 2 Favoriten)'));
  return true;
}
// Vorbereiten: ein geprüfter Mix liegt bereit, damit der nächste Wechsel (z. B. der Drop) ohne Wartezeit genau auf dem Takt kommt
async function mixPrepare() {
  if (MIX.busy || MIX.ready || !viz) return;
  MIX.busy = true;
  try { const m = await mixFind('Auto-Mix'); if (m) MIX.ready = m; }
  finally { MIX.busy = false; }
}
setInterval(() => {
  const playing = micOn || (curFile && !audio.paused);
  if (MIX.share > 0 && playing && !frozen && document.visibilityState === 'visible' && performance.now() - lastSwitch > MIXCFG.prepAfterSwitchMs) mixPrepare();
}, MIXCFG.prepEveryMs);
// Auto-Mix: aus nextPreset (js/08) für automatische Wechsel. true = ein Mix wurde gezeigt.
function mixAuto(blend, why) {
  if (!auto || MIX.share <= 0 || !MIX.ready || 'stf'.indexOf(why) < 0 || Math.random() >= MIX.share) return false;
  const m = MIX.ready; MIX.ready = null;
  if (!mixShow(m, blend, why, 'Auto-Mix · ' + sectionKey())) return false;
  MIX.st.auto++; return true;
}
window.mixAuto = mixAuto;

// ===== Build 129 (Emmo, A + B): Mix bei eigenen Visuals = neue Variante + zufällige Linse =====
// Eigene Visuals lassen sich nicht kreuzen (sie malen alles im Comp, der Warp ist schwarz). Stattdessen:
//   A Variante: die Zufallswerte (rand_preset, im Shader u_v, u_w, u_hue) werden fest neu gewürfelt: andere Farben, Anordnung, Muster-Tempo.
//   B Linse:    die Bildkoordinaten laufen durch eine zufällige Linse (Kaleidoskop, Spiegel, Kacheln, Fischauge, Wirbel, Pixel, Drehung).
//               Eingesetzt am Bildpunkt selbst (gl_FragCoord, darüber auch eiUvc() aus eigene-visuals.js) und für uv (Spur aus dem Warp, Blur-Bilder). Nur im Comp:
//               der Warp (Rückkopplung) bleibt unverändert, die Spur erscheint durch die Linse. Kostet nur ein paar Rechenschritte pro Punkt.
// Das Ergebnis ist ein eigenes Preset „<Visual> + <Linse>“ mit p.lens = { base, lens, seed }. Stern = Rezept (nmd:linsen), nach dem Neustart gleich.
// Geprüft wird wie beim Mix im kleinen Prüf-Visualizer, aber relativ: die Linse darf das Bild nicht deutlich dunkler machen als das Visual ohne Linse
// (eigene Visuals sind oft dunkel, die festen Mix-Grenzen würden sie verwerfen). Passt keine Linse, kommt nur die neue Variante.
const EIUVC = 'vec2 eiUvc() { return (gl_FragCoord.xy - 0.5 * u_res) / u_res.y; }';
const LENS_ROT = 'float cs = cos(k), sn = sin(k); return vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y);';
const LENS = {                                                     // c: Bildpunkt um die Mitte, Höhe -0,5 … 0,5 (wie eiUvc)
  'Kaleidoskop 6': 'float r = length(c), a = atan(c.y, c.x) + time * 0.05, s = 6.2831853 / 6.0; a = mod(a, s); a = abs(a - 0.5 * s); return r * vec2(cos(a), sin(a));',
  'Kaleidoskop 8': 'float r = length(c), a = atan(c.y, c.x) - time * 0.04, s = 6.2831853 / 8.0; a = mod(a, s); a = abs(a - 0.5 * s); return r * vec2(cos(a), sin(a));',
  'Spiegel': 'return vec2(abs(c.x), c.y);',
  'Kacheln': 'vec2 w = vec2(u_res.x / u_res.y, 1.0); vec2 u = c * 2.0 / w + 0.5; u = 1.0 - abs(1.0 - mod(u, 2.0)); return (u - 0.5) * w;',
  'Fischauge': 'return c * (0.55 + 0.9 * dot(c, c));',
  'Wirbel': 'float k = (1.0 - smoothstep(0.0, 0.8, length(c))) * (1.6 + 2.2 * u_bass); ' + LENS_ROT,
  'Pixel': 'float g = (1.0 / 56.0) * (1.0 + 1.5 * u_beat); return (floor(c / g) + 0.5) * g;',
  'Drehung': 'float k = time * 0.12 + 0.25 * sin(time * 0.3); ' + LENS_ROT
};
const LENSCFG = { tries: 4, darkShare: 0.5, darkMin: 3, diffMin: 2, diffLuma: 4 };
// tries: so viele Linsen höchstens pro Druck; darkShare/darkMin: mit Linse mindestens halb so hell wie ohne (und über 3 von 255);
// diffMin: mittlere Änderung gegenüber ohne Linse (0-255), sonst sieht man die Linse nicht (gemessen: das Phrasen-Mandala ist am Phrasenanfang
// rund, Drehen und Spiegeln ändern dort nichts); gilt nur, wenn das Bild ohne Linse überhaupt Inhalt hat (Helligkeit ab diffLuma).
const lensSeed = () => [0, 0, 0, 0].map(() => +Math.random().toFixed(4));
function lensBuild(r) {
  const B = presets[r.base];
  if (!B || !EIGEN.has(r.base) || !Array.isArray(r.seed) || r.seed.length !== 4 || !r.seed.every(x => isFinite(+x))) return null;
  const v = 'vec4(' + r.seed.map(x => (+x).toFixed(4)).join(', ') + ')';
  let comp = String(B.comp || '').split('rand_preset').join(v);
  const warp = String(B.warp || '').split('rand_preset').join(v);
  if (r.lens) {
    if (!LENS[r.lens] || comp.indexOf(EIUVC) < 0 || !/shader_body\s*\{/.test(comp)) return null;
    // Jeder Bildpunkt (gl_FragCoord.xy, auch in eiUvc() und z. B. der Lichtwand) und uv laufen durch die Linse
    comp = comp.replace(EIUVC, '@@NMDLINSE@@' + EIUVC).split('gl_FragCoord.xy').join('nmdFC()').replace('@@NMDLINSE@@',
      'vec2 nmdLens(vec2 c) { ' + LENS[r.lens] + ' }\n' +
      'vec2 nmdFC() { return nmdLens((gl_FragCoord.xy - 0.5 * u_res) / u_res.y) * u_res.y + 0.5 * u_res; }\n' +
      'vec2 nmdLensUv(vec2 t) { float as = u_res.x / u_res.y; vec2 c = nmdLens(vec2((t.x - 0.5) * as, 0.5 - t.y)); return vec2(c.x / as + 0.5, 0.5 - c.y); }\n')
      .replace(/shader_body\s*\{/, 'shader_body {\n  uv = nmdLensUv(uv);');
  }
  return Object.assign({}, B, { comp, warp, baseVals: Object.assign({}, B.baseVals || {}),
    shapes: (B.shapes || []).map(x => Object.assign({}, x)), waves: (B.waves || []).map(x => Object.assign({}, x)),
    lens: { base: r.base, lens: r.lens || '', seed: r.seed.map(x => +x) } });
}
function lensName(r) {
  const base = r.base + ' + ' + (r.lens || 'Variante');
  for (let i = 1; i < 99; i++) {
    const n = i === 1 ? base : base + ' ' + i, p = presets[n];
    if (!p || !favs.has(n) || (p.lens && p.lens.seed.join() === r.seed.join())) return n;   // ohne Stern wird die alte Fassung ersetzt
  }
  return base + ' ' + Date.now();
}
async function lensCheck(p, base) {
  const b = await mixCheck(lensBuild({ base, lens: '', seed: p.lens.seed }), true);   // dieselbe Variante ohne Linse
  if (b.skip) return b;
  const c = await mixCheck(p, true);
  if (c.why === 'Fehler') return c;
  let d = 0; if (b.px && c.px) { for (let i = 0; i < c.px.length; i += 4) d += Math.abs(c.px[i] - b.px[i]) + Math.abs(c.px[i + 1] - b.px[i + 1]) + Math.abs(c.px[i + 2] - b.px[i + 2]); d /= 3 * c.px.length / 4; }
  c.base = b.luma; c.diff = +d.toFixed(1); delete c.px;
  c.why = c.luma < Math.max(LENSCFG.darkMin, LENSCFG.darkShare * b.luma) ? 'dunkler' : (b.luma >= LENSCFG.diffLuma && d < LENSCFG.diffMin) ? 'kaum anders' : '';
  c.ok = !c.why;
  return c;
}
async function lensFind(base, from, tag) {
  const cur = presets[from] && presets[from].lens ? presets[from].lens.lens : '';
  const keys = Object.keys(LENS).filter(k => k !== cur);
  for (let t = 0; t < LENSCFG.tries && keys.length; t++) {
    const lens = keys.splice(Math.floor(Math.random() * keys.length), 1)[0];
    const r = { base, lens, seed: lensSeed() }, p = lensBuild(r);
    if (!p) { rea(tag + ': Linse „' + lens + '“ passt nicht zu „' + base + '“'); continue; }
    const c = await lensCheck(p, base);
    if (!c.ok) { MIX.st.why.linse = (MIX.st.why.linse || 0) + 1; rea(tag + ': Linse „' + lens + '“ verworfen (' + c.why + ', Helligkeit ' + c.luma + ' statt ' + c.base + ', Änderung ' + c.diff + ')'); continue; }
    return { r, p, c };
  }
  const r = { base, lens: '', seed: lensSeed() };                   // keine Linse passt: nur eine neue Variante
  return { r, p: lensBuild(r), c: { ok: true, nurVariante: true } };
}
function lensShow(m, tag) {
  if (!m || !m.p) return false;
  const n = lensName(m.r); presets[n] = m.p; tunedCache.delete(n);
  if (!loadByName(n, MIXCFG.blend, true, 'm')) { MIX.st.why.laden = (MIX.st.why.laden || 0) + 1; return false; }
  MIX.st.lens = (MIX.st.lens || 0) + 1;
  erg(tag + ': ' + n + ' · neue Variante (' + m.r.seed.join(', ') + ')' + (m.r.lens ? ', Linse „' + m.r.lens + '“' : ', ohne Linse (keine passte)') +
    (m.c.skip ? ' · ungeprüft' : m.c.nurVariante ? '' : ' · geprüft (Helligkeit ' + m.c.luma + ', ohne Linse ' + m.c.base + ', Änderung ' + m.c.diff + ')'));
  if (window.toast) toast(m.r.lens ? 'Neue Variante mit Linse: ' + m.r.lens : 'Neue Variante', 2600);
  return true;
}
// Rezepte: Varianten mit Stern bleiben (nmd:linsen, nur Name, Visual, Linse und die vier Zufallswerte)
function lensSave() {
  const keep = []; for (const n of favs) { const p = presets[n]; if (p && p.lens) keep.push({ n, base: p.lens.base, lens: p.lens.lens, seed: p.lens.seed }); }
  store.set('linsen', keep);
}
{ const saved = store.get('linsen', []); let ok = 0, lost = 0;
  if (Array.isArray(saved)) for (const r of saved) {
    if (!r || typeof r.n !== 'string' || typeof r.base !== 'string') continue;
    const p = lensBuild({ base: r.base, lens: typeof r.lens === 'string' ? r.lens : '', seed: r.seed });
    if (p) { presets[r.n] = p; ok++; } else { lost++; favs.delete(r.n); }
  }
  if (ok || lost) rea('Varianten mit Stern: ' + ok + ' gebaut' + (lost ? ', ' + lost + ' ohne Visual (entfernt)' : '')); }
$('fav').addEventListener('click', () => { if ((presets[curName] && presets[curName].lens) || store.get('linsen', []).some(r => r && !favs.has(r.n))) lensSave(); });

// ===== Knopf „Mix“ und Zwei-Finger-Tipp (Build 128): das laufende Visual erweitern =====
// Der vorbereitete Auto-Mix (MIX.ready) bleibt für die automatischen Wechsel, er hat mit dem laufenden Bild nichts zu tun.
async function mixNow() {
  if (!viz) return false;
  const btn = $('mixBtn');
  const busy = on => { if (btn) { btn.disabled = on; btn.textContent = on ? 'Mix …' : 'Mix'; } };
  if (MIX.busy) {                                                    // gerade wird einer vorbereitet (oder ein zweiter Tipp): abwarten
    busy(true);
    for (let i = 0; i < 600 && MIX.busy; i++) await mixTick();
    busy(false);
    if (MIX.busy) return false;
  }
  const from = curName;
  if (from && isOwn(from)) {                                         // Build 129: eigenes Visual → neue Variante + Linse
    const base = EIGEN.has(from) ? from : presets[from].lens.base;
    MIX.busy = true; busy(true);
    try { return lensShow(await lensFind(base, from, 'Mix · Linse'), 'Mix · Linse'); }
    finally { MIX.busy = false; busy(false); }
  }
  const an = mixAnchor(from);
  if (!an) {
    const why = 'Dieses Visual lässt sich nicht mischen';
    rea('Mix: ' + why + ' (' + (from || 'nichts geladen') + ')'); if (window.toast) toast(why, 2600);
    return false;
  }
  MIX.busy = true; busy(true);
  try {
    const m = await mixExtendFind(an, 'Mix');
    if (!m) { if (window.toast) toast('Kein passender Partner gefunden, nochmal versuchen', 2600); return false; }
    if (curName !== from) { rea('Mix: inzwischen lief ein anderes Visual, der Mix wird trotzdem gezeigt'); }
    const ok = mixShow(m, MIXCFG.blend, 'm', 'Mix');
    if (ok && window.toast) toast((m.keep === 'a' ? 'Bewegung bleibt, neuer Look: ' + mixShort(m.r.b) : 'Look bleibt, neue Bewegung: ' + mixShort(m.r.a)), 2600);
    return ok;
  }
  finally { MIX.busy = false; busy(false); }
}

// Protokoll: einmal pro Minute, wenn Mixe kamen
setInterval(() => { const S = MIX.st; if (!S.made && !S.rejected && !S.lens) return; erg('Mix (letzte Minute): ' + S.made + ' gezeigt, davon ' + S.auto + ' automatisch, ' + S.rejected + ' verworfen' + (S.lens ? ', ' + S.lens + ' Varianten eigener Visuals' : '') + (Object.keys(S.why).length ? ' (' + Object.entries(S.why).map(([k, n]) => k + ' ' + n).join(', ') + ')' : '') + ' · Anteil ' + Math.round(MIX.share * 100) + ' %' + (S.chkN ? ' · Prüfen hielt die Seite Ø ' + Math.round(S.chkSum / S.chkN) + ' ms an, längstes ' + Math.round(S.chkMax) + ' ms (' + S.chkN + ' Prüfungen)' : '')); MIX.st = { made: 0, rejected: 0, auto: 0, why: {} }; }, 60000);

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
window.__MIX = MIX; window.mixNow = mixNow; window.mixBuild = mixBuild; window.mixAnchor = mixAnchor; window.lensBuild = lensBuild; window.lensFind = lensFind; window.LENS = LENS; window.mixPrepare = mixPrepare; window.mixJudge = mixJudge;
