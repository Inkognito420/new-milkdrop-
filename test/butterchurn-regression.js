// Regressionstest für die eigene Butterchurn-Kopie (vendor/butterchurn/butterchurn.js):
//   1) Alte Presets laufen unverändert: alle 367 Standard-Presets (butterchurn-presets 2.4.7, Grund-, Extra- und Extra2-Paket) werden mit der
//      ORIGINAL-Butterchurn 2.6.7 (vendor/butterchurn/original/butterchurn-2.6.7.min.js, genau die Datei, die Acid vom CDN lädt) und mit der
//      KOPIE (alle neuen Klangrollen-Werte ungleich 0) je 90 Bilder lang gezeichnet (160×90, fester Testton, elapsedTime = 1/60).
//      Die Pixel-Prüfsummen nach Bild 45 und 90 müssen gleich sein.
//      Damit das überhaupt vergleichbar ist: Math.random wird durch einen Zufall mit festem Startwert ersetzt, und zwar VOR dem Erzeugen des
//      Visualizers (Rauschtexturen) und vor jedem loadPreset. Jeder Lauf bekommt eine frische Seite.
//   2) Shader: jeder Warp- und Comp-Shader wird mit der neuen Kopfzeile übersetzt. Kein Fehler, den das Original nicht auch hat.
//   3) Die neuen Werte kommen an: in init-, frame-, pixel-Gleichungen, Formen, Wellen, Warp- und Comp-Shader, auch beim Überblenden.
//
// Aufruf:  node test/butterchurn-regression.js [maxPresets]
// Umgebung: PLAYWRIGHT_MODULE, CHROMIUM_PATH wie bei test/browser.js; JOBS = Anzahl gleichzeitiger Seiten (Standard 4)
const http = require('http'), fs = require('fs'), path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { try { pw = require(process.env.PLAYWRIGHT_MODULE); } catch (e2) { console.error('Playwright fehlt (PLAYWRIGHT_MODULE setzen)'); process.exit(2); } }

const ROOT = path.join(__dirname, '..'), PORT = 8890 + Math.floor(Math.random() * 100);
const LIBS = { orig: 'vendor/butterchurn/original/butterchurn-2.6.7.min.js', copy: 'vendor/butterchurn/butterchurn.js' };
const HARNESS = lib => `<!doctype html><meta charset="utf-8"><body>
<script src="/${LIBS[lib]}"></script>
<script src="/vendor/butterchurn-presets/butterchurnPresets.min.js"></script>
<script src="/vendor/butterchurn-presets/butterchurnPresetsExtra.min.js"></script>
<script src="/vendor/butterchurn-presets/butterchurnPresetsExtra2.min.js"></script>
<script src="/__harness.js"></script></body>`;
// Läuft in der Seite. Kein Zugriff auf Variablen von außen.
const HARNESS_JS = `
window.__seed = function (s) { let a = s >>> 0; Math.random = function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const BC = window.butterchurn.default || window.butterchurn;
const PRESETS = Object.assign({}, window.butterchurnPresets.getPresets(), window.butterchurnPresetsExtra.getPresets(), window.butterchurnPresetsExtra2.getPresets());
window.__names = Object.keys(PRESETS);
// fester Testton: Kick (55 Hz mit Hüllkurve) + 303-artige Säge (110 Hz) + Rauschen mit festem Startwert, links/rechts leicht verschieden
function tone(frame, buf, pan) {
  let s = (frame * 7919 + (pan > 0 ? 17 : 3)) >>> 0;
  const kickEnv = Math.exp(-((frame % 26) / 5));
  for (let i = 0; i < buf.length; i++) {
    const t = (frame * 1024 + i) / 44100;
    s = (s * 1664525 + 1013904223) >>> 0;
    const v = 0.55 * kickEnv * Math.sin(2 * Math.PI * 55 * t) + 0.25 * (2 * ((t * 110) % 1) - 1) + 0.08 * (s / 4294967296 * 2 - 1) * (1 + 0.3 * pan);
    buf[i] = Math.max(0, Math.min(255, Math.round(128 + 127 * Math.max(-1, Math.min(1, v)))));
  }
}
function hash(gl, w, h) {
  const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let x = 2166136261 >>> 0; for (let i = 0; i < px.length; i++) { x ^= px[i]; x = Math.imul(x, 16777619) >>> 0; }
  return x.toString(16).padStart(8, '0');
}
const linkInfo = (gl, sh) => { if (!sh || !sh.shaderProgram) return 'kein Programm'; return gl.getProgramParameter(sh.shaderProgram, gl.LINK_STATUS) ? 'ok' : 'FEHLER ' + String(gl.getProgramInfoLog(sh.shaderProgram)).slice(0, 200); };
window.__run = function (name, extra) {
  const W = 160, H = 90, cv = document.createElement('canvas'); cv.width = W; cv.height = H; document.body.appendChild(cv);
  __seed(12345);
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const viz = BC.createVisualizer(ctx, cv, { width: W, height: H, pixelRatio: 1, textureRatio: 1 });
  if (extra) viz.setExtraVars(extra);
  const gl = viz.renderer.gl;
  __seed(777);
  viz.loadPreset(PRESETS[name], 0);
  const out = { warp: linkInfo(gl, viz.renderer.warpShader), comp: linkInfo(gl, viz.renderer.compShader), h: [] };
  const T = new Uint8Array(1024), L = new Uint8Array(1024), R = new Uint8Array(1024);
  try {
    for (let f = 1; f <= 90; f++) {
      tone(f, T, 0); tone(f, L, -1); tone(f, R, 1);
      viz.render({ audioLevels: { timeByteArray: T, timeByteArrayL: L, timeByteArrayR: R }, elapsedTime: 1 / 60 });
      if (f === 45 || f === 90) out.h.push(hash(gl, W, H));
    }
  } catch (e) { out.err = String(e && e.message || e).slice(0, 200); }
  try { ctx.close(); } catch (e) {}
  return out;
};
`;
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/__harness.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(HARNESS(new URL(req.url, 'http://x').searchParams.get('lib'))); }
  if (u === '/__harness.js') { res.writeHead(200, { 'content-type': 'application/javascript' }); return res.end(HARNESS_JS); }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'application/javascript' : 'text/html' }); fs.createReadStream(f).pipe(res);
});

// Alle neuen Werte auf etwas ungleich 0 (verschieden, damit Verwechslungen auffallen)
const EXTRA = {}; { const names = require('./klangrollen-namen.js').AK_NAMES; names.forEach((n, i) => { EXTRA[n] = 0.1 + 0.8 * ((i * 0.37) % 1); }); EXTRA.ak_bpm = 140; EXTRA.ak_barno = 17; EXTRA.ak_section = 3; }

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log((ok ? '  ok   ' : '  FEHL ') + name + (ok && !process.env.VERBOSE ? '' : '  → ' + detail)); };

async function runOne(browser, lib, name, extra) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/__harness.html?lib=${lib}`);
  const r = await page.evaluate(([n, x]) => window.__run(n, x), [name, extra]);
  await ctx.close();
  if (errs.length) r.pageErr = errs.join(' | ');
  return r;
}

async function probe(browser) {
  // Prüf-Presets: schreiben die neuen Werte in gmegabuf (Gleichungen, Formen, Wellen) bzw. in die Farbe (Shader)
  const ctx = await browser.newContext(); const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/__harness.html?lib=copy`);
  const r = await page.evaluate(() => {
    const W = 64, H = 36, cv = document.createElement('canvas'); cv.width = W; cv.height = H; document.body.appendChild(cv);
    const ctx = new AudioContext(), viz = BC.createVisualizer(ctx, cv, { width: W, height: H, pixelRatio: 1, textureRatio: 1 }), gl = viz.renderer.gl;
    const base = { wave_a: 0, decay: 0, ob_size: 0, ib_size: 0, zoom: 1, rot: 0, warp: 0, wave_mode: 0, mv_a: 0, gammaadj: 1, echo_alpha: 0, darken_center: 0 };
    const off = { baseVals: { enabled: 0 }, init_eqs_str: '', frame_eqs_str: '', point_eqs_str: '' };   // Butterchurn erwartet immer 4 Formen und 4 Wellen
    const mk = (tag, comp, warp) => ({ baseVals: base,
      init_eqs_str: "a.gmegabuf[0] = a.ak_bpm;",
      frame_eqs_str: "a.gmegabuf[1] = a.kick_env; a.q1 = a.acid_cutoff;",
      pixel_eqs_str: "a.gmegabuf[2] = a.pads_env;",
      shapes: [{ baseVals: { enabled: 1, num_inst: 1, a: 0, a2: 0, border_a: 0 }, init_eqs_str: '', frame_eqs_str: "a.gmegabuf[3] = a.hats_env + " + tag + ";" }].concat(off, off, off),
      waves: [{ baseVals: { enabled: 1, a: 0, samples: 16 }, init_eqs_str: '', frame_eqs_str: "a.gmegabuf[4] = a.ak_section + " + tag + ";", point_eqs_str: "a.gmegabuf[5] = a.ak_phrase;" }].concat(off, off, off),
      warp, comp });
    const WARP = 'shader_body { ret = vec3(kick_hit, acid_age, ak_bar); }';
    const COMP = 'shader_body { ret = vec3(kick_env, acid_cutoff, ak_section / 4.0); }';
    const set = { kick_env: 0.25, kick_hit: 0.5, acid_cutoff: 0.75, acid_age: 0.125, ak_bar: 0.625, pads_env: 0.375, hats_env: 0.875, ak_section: 2, ak_phrase: 0.3125, ak_bpm: 137 };
    viz.setExtraVars(set);
    const out = {};
    viz.loadPreset(mk(0, COMP, WARP), 0);
    const rd = () => { const p = new Uint8Array(4); gl.readPixels(W >> 1, H >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return [p[0] / 255, p[1] / 255, p[2] / 255]; };
    const R = viz.renderer;
    viz.render({ elapsedTime: 1 / 60 }); viz.render({ elapsedTime: 1 / 60 });
    const g = R.presetEquationRunner.gmegabuf.slice(0, 6);
    out.gleichungen = { init: g[0], frame: g[1], pixel: g[2], form: g[3], welle: g[4], wellenpunkt: g[5] };
    out.comp = rd();
    // Warp-Shader: Comp zeigt nur das Bild aus dem Warp (Standard-Comp), Verfall 1, damit der Warp-Wert stehen bleibt
    viz.loadPreset(mk(0, '', WARP), 0); for (let i = 0; i < 3; i++) viz.render({ elapsedTime: 1 / 60 });
    out.warp = rd();
    // Überblenden: altes und neues Preset sehen dieselben Werte (gmegabuf ist je Preset getrennt)
    viz.loadPreset(mk(0, COMP, WARP), 0); viz.render({ elapsedTime: 1 / 60 });
    viz.setExtraVars({ kick_env: 0.6, hats_env: 0.2, ak_section: 1 });
    viz.loadPreset(mk(10, COMP, WARP), 5); viz.render({ elapsedTime: 1 / 60 }); viz.render({ elapsedTime: 1 / 60 });
    const a = R.prevPresetEquationRunner.gmegabuf, b = R.presetEquationRunner.gmegabuf;
    out.blend = { blending: R.blending, alt: [a[1], a[3], a[4]], neu: [b[1], b[3], b[4]] };
    out.namen = Array.isArray(window.AK_VAR_NAMES) || Object.isFrozen(window.AK_VAR_NAMES) ? window.AK_VAR_NAMES.length : 0;
    return out;
  });
  await ctx.close();
  return { r, errs };
}

(async () => {
  const max = +process.argv[2] || Infinity;
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined,
    args: [...(process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : []), '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const t0 = Date.now();

  console.log('\nWerte kommen an (Prüf-Preset, Kopie)');
  const p = await probe(browser), r = p.r, near = (x, y, tol = 0.02) => Math.abs(x - y) <= tol;
  const G = r.gleichungen;
  check('Gleichungen: init sieht ak_bpm, frame kick_env, pixel pads_env, Formen hats_env, Wellen ak_section und ak_phrase',
    G.init === 137 && G.frame === 0.25 && G.pixel === 0.375 && G.form === 0.875 && G.welle === 2 && G.wellenpunkt === 0.3125, JSON.stringify(G));
  check('Comp-Shader: kick_env, acid_cutoff, ak_section kommen als Farbe an', near(r.comp[0], 0.25) && near(r.comp[1], 0.75) && near(r.comp[2], 0.5), JSON.stringify(r.comp));
  check('Warp-Shader: kick_hit, acid_age, ak_bar kommen als Farbe an', near(r.warp[0], 0.5) && near(r.warp[1], 0.125) && near(r.warp[2], 0.625), JSON.stringify(r.warp));
  check('Überblenden: altes und neues Preset sehen dieselben (neuen) Werte', r.blend.blending && r.blend.alt[0] === 0.6 && r.blend.neu[0] === 0.6 && r.blend.alt[1] === 0.2 && r.blend.neu[1] === 10.2 && r.blend.alt[2] === 1 && r.blend.neu[2] === 11, JSON.stringify(r.blend));
  check('AK_VAR_NAMES: 41 Namen, für die App sichtbar', r.namen === 41 && p.errs.length === 0, r.namen + ' ' + p.errs.join(' | '));

  console.log('\nAlte Presets unverändert (Original 2.6.7 gegen Kopie mit Werten ≠ 0)');
  const pg = await browser.newPage(); await pg.goto(`http://127.0.0.1:${PORT}/__harness.html?lib=orig`);
  const names = (await pg.evaluate(() => window.__names)).filter(n => !process.env.ONLY || process.env.ONLY.split('|').includes(n)).slice(0, max); await pg.close();
  // Vorprüfung: das Original ist mit dem festen Zufall reproduzierbar (sonst sagt der Vergleich nichts)
  const rep = []; for (const n of names.slice(0, 3)) { const a = await runOne(browser, 'orig', n), b = await runOne(browser, 'orig', n); rep.push(a.h.join() === b.h.join()); }
  check('Vorprüfung: Original zweimal gezeichnet = bit-gleich (fester Zufall wirkt), 3 von 3', rep.every(Boolean), JSON.stringify(rep));
  const JOBS = +process.env.JOBS || 4, diff = [], wackel = [], shaderNew = [], errsNew = [], seen = new Set(); let same = 0, idx = 0, done = 0;
  const worker = async () => {
    while (idx < names.length) {
      const n = names[idx++];
      const a = await runOne(browser, 'orig', n), b = await runOne(browser, 'copy', n, EXTRA);
      seen.add(a.h[1]);
      if (a.h.join() === b.h.join() && (a.err || '') === (b.err || '')) same++;
      else {
        // Abweichung: zeichnet das ORIGINAL dieses Preset überhaupt jedes Mal gleich? Wenn nicht (gesehen bei „Magellan's Nebula“: Original jedes Mal anders,
        // Kopie immer gleich), lässt sich nichts vergleichen. Dann zählt es als „Original wackelt“, nicht als Fehler der Kopie.
        const a2 = await runOne(browser, 'orig', n);
        if (a2.h.join() !== a.h.join()) wackel.push({ n, orig: [a.h, a2.h], kopie: b.h });
        else diff.push({ n, orig: a.h, kopie: b.h, eo: a.err, ek: b.err });
      }
      if ((b.warp !== 'ok' && a.warp === 'ok') || (b.comp !== 'ok' && a.comp === 'ok')) shaderNew.push({ n, warp: b.warp, comp: b.comp });
      if (b.pageErr && !a.pageErr) errsNew.push({ n, e: b.pageErr });
      if (++done % 25 === 0) console.log('    … ' + done + ' / ' + names.length + ' (' + Math.round((Date.now() - t0) / 1000) + ' s)');
    }
  };
  await Promise.all(Array.from({ length: JOBS }, worker));
  if (wackel.length) console.log('       (Info) Original zeichnet nicht jedes Mal gleich, darum nicht vergleichbar: ' + wackel.map(w => w.n + ' (Original ' + w.orig.map(h => h.join('/')).join(' bzw. ') + ', Kopie ' + w.kopie.join('/') + ')').join(' · '));
  check('Pixel-Prüfsummen (Bild 45 und 90) bei allen ' + names.length + ' Presets gleich (außer höchstens 2 %, die schon das Original nicht wiederholbar zeichnet)', diff.length === 0 && wackel.length <= Math.max(3, Math.ceil(0.02 * names.length)) && same + wackel.length === names.length && names.length > 0, same + ' gleich, abweichend: ' + JSON.stringify(diff.slice(0, 5)) + ', Original wackelt: ' + wackel.length);
  check('Der Vergleich sieht etwas: die Presets ergeben verschiedene Bilder (mindestens 90 % verschiedene Prüfsummen)', seen.size >= 0.9 * names.length, seen.size + ' verschiedene bei ' + names.length);
  check('Shader: kein Warp- oder Comp-Shader schlägt mit der neuen Kopfzeile fehl, der im Original klappt', shaderNew.length === 0, JSON.stringify(shaderNew.slice(0, 5)));
  check('Keine neuen Seitenfehler mit der Kopie', errsNew.length === 0, JSON.stringify(errsNew.slice(0, 5)));

  await browser.close(); server.close();
  const bad = results.filter(x => !x.ok);
  console.log('\n' + (results.length - bad.length) + ' von ' + results.length + ' Prüfungen bestanden (' + Math.round((Date.now() - t0) / 1000) + ' s).');
  process.exit(bad.length ? 1 : 0);
})();
