// Browser-Prüfung ohne Internet: startet die App in Chromium (Playwright), ersetzt Butterchurn und die Schriften durch Attrappen,
// lädt echte Audiodateien über das Dateifeld und prüft Start, Bedienung, Shader, Scan, Warteschlange, Grafik-Verlust, Mikrofon, Sicherung und Offline-Betrieb.
// Die Seite wird wie auf GitHub Pages unter /new-milkdrop-/ ausgeliefert. Die Bibliotheken (vendor/) werden durch Attrappen ersetzt, außer im Szenario echtbutterchurn.
// Szenario klangrollen prüft die neue Klang-Analyse (js/08b-klangrollen.js) mit künstlichen Tracks (test/gen-track.js), ohne Echtzeit (OfflineAudioContext).
//
// Aufruf:   node test/browser.js [Szenario,Szenario,...]
// Braucht:  npm i playwright && npx playwright install chromium      (läuft nicht in der GitHub-Aktion, nur von Hand)
// Umgebung: PLAYWRIGHT_MODULE (Pfad zu playwright, falls nicht auffindbar), CHROMIUM_PATH (eigener Chromium), KEEP=1 (Testdateien behalten)
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';   // damit Playwright auch Anfragen des Service Workers abfangen kann
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const { makeTrack, makePlanTrack, PLANS } = require('./gen-track');
let pw; try { pw = require('playwright'); } catch (e) { try { pw = require(process.env.PLAYWRIGHT_MODULE); } catch (e2) { console.error('Playwright fehlt: npm i playwright && npx playwright install chromium (oder PLAYWRIGHT_MODULE setzen)'); process.exit(2); } }

const ROOT = path.join(__dirname, '..'), PREFIX = '/new-milkdrop-/', PORT = 8790 + Math.floor(Math.random() * 100);
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
const misses = [];                     // Pfade, die der Server nicht kannte (für die Fehlersuche)
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (!u.startsWith(PREFIX)) { misses.push(u); res.writeHead(404); return res.end(); }
  if (u.startsWith(PREFIX + '__tmp/') && tmp) { const tf = path.join(tmp, path.basename(u)); if (fs.existsSync(tf)) { res.writeHead(200, { 'content-type': 'audio/wav' }); return fs.createReadStream(tf).pipe(res); } }
  const f = path.join(ROOT, u.slice(PREFIX.length) || 'index.html');
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(res);
});
const URL0 = `http://127.0.0.1:${PORT}${PREFIX}index.html`;
const STUB_VIZ = 'window.butterchurn={createVisualizer:()=>({connectAudio(){},loadPreset(){},render(){},setRendererSize(){},loadExtraImages(){},launchSongTitleAnim(){},setExtraVars(v){window.__akSet=(window.__akSet||0)+1;window.__akLast=v},renderer:{audioLevels:{val:[1,1,1],att:[1,1,1],updateAudioLevels(){}}}})};';
const STUB_PRE = 'window.butterchurnPresets={getPresets:()=>{const o={};for(let i=0;i<40;i++)o["Test · Preset "+i]={baseVals:{},frame_eqs_str:"",init_eqs_str:"",shapes:[],waves:[]};return o}};window.butterchurnPresetsExtra={getPresets:()=>({})};';

const results = []; let browser, tmp, T, TL; const PT = {};      // T: Pfade der Test-Tracks, PT: Plan-Tracks für die Klangrollen (Takt-Zeiten)
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log((ok ? '  ok   ' : '  FEHL ') + name + (ok ? '' : '  → ' + detail)); };

async function open(opts = {}) {
  const ctx = await browser.newContext({ serviceWorkers: opts.sw ? 'allow' : 'block', viewport: { width: 390, height: 844 } });
  await ctx.grantPermissions(['microphone']);
  if (!opts.real) await ctx.route(/\/vendor\/butterchurn(-presets)?\/[^/?]+\.js/, r => r.fulfill({ contentType: 'application/javascript', body: /Presets/.test(r.request().url()) ? STUB_PRE : STUB_VIZ }));
  await ctx.route(/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/, r => {
    const u = r.request().url(), h = { 'access-control-allow-origin': '*' };
    if (u.includes('fonts.')) return r.fulfill({ contentType: 'text/css', body: '', headers: h });
    return r.fulfill({ contentType: 'application/javascript', headers: h, body: u.includes('Presets') ? STUB_PRE : STUB_VIZ });
  });
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(URL0, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__AM_STEP === 16, null, { timeout: 15000 }).catch(() => {});
  return { ctx, page, errs, close: () => ctx.close() };
}
const scansWrapper = () => { window.__scans = []; const orig = analyzeFile; window.analyzeFile = async function (f) { const t = performance.now(); const r = await orig.apply(this, arguments); __scans.push({ f: f.name, ms: Math.round(performance.now() - t), r: r.skipped || 'ok' }); return r; }; };

// Klangrollen offline: Datei durch einen OfflineAudioContext, alle 1/60 s das Spektrum (Analyser 4096, ohne Glättung) an akCreate().step.
// P (optional): Plan-Track mit bar0/barS: dann bekommt die Analyse das Raster wie mit Scan (grid = {bpm, pos}).
const krRun = (page, name, gain, P) => page.evaluate(async ([url, gain, G]) => {
  const ab0 = await (await fetch(url)).arrayBuffer();
  const ab = await new OfflineAudioContext(2, 44100, 44100).decodeAudioData(ab0);
  const oc = new OfflineAudioContext(2, ab.length, ab.sampleRate), sr = ab.sampleRate;
  const src = oc.createBufferSource(); src.buffer = ab; const g = oc.createGain(); g.gain.value = gain;
  const an = oc.createAnalyser(); an.fftSize = AKCFG.fftSize; an.smoothingTimeConstant = 0;
  src.connect(g); g.connect(an); an.connect(oc.destination);
  const S = akCreate(sr, AKCFG.fftSize); S.events = []; S.hits = [];
  const ch0 = ab.getChannelData(0), ch1 = ab.numberOfChannels > 1 ? ab.getChannelData(1) : ch0, stL = new Float32Array(AKCFG.stN), stR = new Float32Array(AKCFG.stN);
  const XK = ['acid_reso', 'hats_density', 'pads_pitch', 'ak_pan', 'ak_pan_speed', 'ak_width'], xv = {};
  const spec = new Float32Array(an.frequencyBinCount), env = { kick: [], acid: [], hats: [], pads: [] }, rel = { kick: [], acid: [], hats: [], pads: [] }, sec = [], bpm = [];
  let ms = 0, msMax = 0, n = 0, lastT = 0;
  const N = Math.floor((ab.duration - 0.05) * 60);
  for (let i = 1; i <= N; i++) {
    const ts = Math.floor(i / 60 * sr / 128) * 128 / sr;
    oc.suspend(ts).then(() => {
      an.getFloatFrequencyData(spec);
      const t = ts * 1000, a = performance.now(); const SN = AKCFG.stN, e1 = Math.floor(ts * sr), w1 = Math.max(0, e1 - SN); stL.fill(0); stR.fill(0); stL.set(ch0.subarray(w1, e1), SN - (e1 - w1)); stR.set(ch1.subarray(w1, e1), SN - (e1 - w1));
      S.step(spec, t, lastT ? t - lastT : 16.7, G ? { bpm: 60 / G.beatS, pos: (ts - G.bar0) / G.beatS, sec: -1, secStart: 0 } : null, akStereoStats(stL, stR, SN, sr)); const d = performance.now() - a; lastT = t;
      ms += d; if (d > msMax) msMax = d; n++;
      for (const r in env) { env[r].push(+S.out[r + '_env'].toFixed(4)); rel[r].push(S.totRef > 0 ? S.R[r].x / S.totRef : 0); } sec.push(S.out.ak_section); bpm.push(S.out.ak_bpm);
      for (const k of XK) if (k in S.out) (xv[k] = xv[k] || []).push(+S.out[k].toFixed(4));
      (xv.held = xv.held || []).push(+(S.R.pads.held || 0).toFixed(4));
      oc.resume();
    });
  }
  src.start(0); await oc.startRendering();
  return { events: S.events.map(e => ({ t: +(e.t / 1000).toFixed(3), k: e.kind, r: e.role })), env, rel, xv, sec, bpm, hits: S.hits, ms: ms / n, msMax, n };
}, [PREFIX + '__tmp/' + name + '.wav', gain, P ? { bar0: P.bar0, beatS: P.barS / 4 } : null]);

const localStorage_nmd = saved => true;   // der Schlüssel heißt nmd:sz-gain (store.set setzt den Vorsatz); hier reicht, dass store.get ihn wiederfindet
const run2 = (page, ms) => page.evaluate(ms => new Promise(res => { const o = { act: 0, tr: 0 }; const t0 = performance.now(); const step = () => { o.act = Math.max(o.act, window.__SZ.act); if (/skewX/.test(canvas.style.transform)) o.tr++; if (performance.now() - t0 < ms) requestAnimationFrame(step); else res(o); }; requestAnimationFrame(step); }), ms);

const SZ = {
  async start() {
    const { page, errs, close } = await open();
    check('Start: alle 16 Teile laufen (__AM_STEP = 16)', await page.evaluate(() => window.__AM_STEP) === 16);
    check('Start: keine Seitenfehler', errs.length === 0, errs.join(' | '));
    check('Start: Build-Nummer in index.html (var B) und im Programm (BUILD_NO) gleich', await page.evaluate(() => window.B === BUILD_NO));
    await close();
  },
  async bedienung() {
    const { page, errs, close } = await open();
    const r = await page.evaluate(() => {
      $('fineBtn').click(); $('werkBtn').click();
      const ids = [...document.querySelectorAll('#werk button[id^="t-"]')].map(b => b.id);
      for (const id of ids) $(id).click();
      const nachKlick = handSet().length; $('allAuto').click();
      return { schalter: ids.length, tabelle: TOGGLES.length, nachKlick, nachAuto: handSet().length, fehler: LOG.filter(l => l.k === 'x').map(l => l.x) };
    });
    check('Bedienung: 16 Werkstatt-Schalter, passend zur Tabelle TOGGLES', r.schalter === 16 && r.tabelle === 16, JSON.stringify(r));
    check('Bedienung: alle Schalter umgelegt = 16 von Hand verstellt, „Alles auf Auto“ setzt zurück', r.nachKlick === 16 && r.nachAuto === 0, JSON.stringify(r));
    check('Bedienung: keine Fehler im Protokoll, keine Seitenfehler', r.fehler.length === 0 && errs.length === 0, r.fehler.concat(errs).join(' | '));
    await close();
  },
  async shader() {
    const { page, close } = await open();
    const r = await page.evaluate(() => {
      shEnsure(); const res = {}, w = 320, h = 180; shEl.width = w; shEl.height = h;
      for (const d of window.ACID_SHADERS) {
        const ok = shPlayer.use(d.id); let mean = 0, nz = 0;
        if (ok) { for (let f = 0; f < 6; f++) shPlayer.draw({ time: 3 + f * 0.016, bass: 0.7, mid: 0.5, treb: 0.4, beat: f === 0 ? 1 : 0.2, bar: 0, build: 0.3, hue: 0.3, flash: 1 }); const gl = shPlayer.gl, px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); let s = 0, c = 0; for (let i = 0; i < px.length; i += 4) { const v = px[i] + px[i + 1] + px[i + 2]; s += v; if (v > 6) c++; } mean = s / (w * h * 3); nz = c / (w * h); }
        res[d.id] = { ok, mean: +mean.toFixed(2), nz: +nz.toFixed(2), err: shPlayer.errors[d.id] || null };
      }
      return res;
    });
    const ids = Object.keys(r);
    check('Shader: 7 eigene Shader vorhanden (kein Track-Flug mehr)', ids.length === 7 && !ids.includes('flug-track'), ids.join(','));
    check('Shader: jeder übersetzt und zeichnet ein Bild', ids.every(id => r[id].ok && r[id].mean > 1 && r[id].nz > 0.2), JSON.stringify(r));
    await close();
  },
  async zufall() {
    const { page, errs, close } = await open();
    const r = await page.evaluate(async () => {
      const seen = {}; let n = 0;
      for (let i = 0; i < 400; i++) { try { nextPreset(0.2, undefined, false, ['t', 's', 'f', 'n', 'p', 'd', 'x', 'a'][i % 8]); n++; } catch (e) { return { fehler: e.message, bei: i }; } seen[curName] = 1; if (i % 20 === 0) await new Promise(r => requestAnimationFrame(r)); }
      return { n, verschiedene: Object.keys(seen).length, eigene: Object.keys(seen).filter(k => /^Eigen/.test(k)).length, logFehler: LOG.filter(l => l.k === 'x').map(l => l.x) };
    });
    check('Zufall: 400 Wechsel ohne Fehler, Milkdrop und eigene Shader kommen vor', r.n === 400 && r.verschiedene > 10 && r.eigene >= 1 && r.logFehler.length === 0, JSON.stringify(r));
    const c = { x: 195, y: 300 };
    await page.mouse.move(c.x + 80, c.y); await page.mouse.down(); await page.mouse.move(c.x - 80, c.y, { steps: 6 }); await page.mouse.up();
    await page.mouse.click(c.x, c.y); await page.waitForTimeout(80); await page.mouse.click(c.x, c.y); await page.waitForTimeout(400);
    await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.waitForTimeout(600); const halten = await page.evaluate(() => frozen); await page.mouse.up(); await page.waitForTimeout(400);
    check('Gesten: Wischen, Doppeltipp, Halten (Freeze an, danach wieder aus)', halten === true && await page.evaluate(() => frozen) === false && errs.length === 0, errs.join(' | '));
    await close();
  },
  async scan() {
    const { page, close } = await open();
    await page.setInputFiles('#fileIn', [T[0]]);
    await page.waitForFunction(() => typeof curAnalysis !== 'undefined' && curAnalysis && curAnalysis.beatS, null, { timeout: 180000, polling: 200 });
    const A = await page.evaluate(() => ({ grid: curAnalysis.grid, bpm: curAnalysis.bpm, drops: curAnalysis.drops, kmErr: curAnalysis.kmErr || null, klangErr: curAnalysis.klangErr || null, km: !!curAnalysis.km, klang: !!curAnalysis.klang, info: $('track').textContent, log: LOG.map(l => l.x).filter(x => /dekodiert/.test(x)) }));
    check('Scan: festes Raster, 140 BPM (±0,3), mindestens ein Drop', A.grid && Math.abs(A.bpm - 140) < 0.3 && A.drops >= 1, JSON.stringify(A));
    check('Scan: Klangbild und Klangmesser ohne Fehler', A.km && A.klang && !A.kmErr && !A.klangErr, JSON.stringify(A));
    check('Scan: Protokoll nennt Dekodier-Rate und Speicher', A.log.length === 1 && /Hz, \d+ Kanäle, \d+ MB/.test(A.log[0]), A.log.join('|'));
    await close();
  },
  async warteschlange() {
    // Ab Build 102 werden ALLE geladenen Tracks analysiert; der gewählte (hier der letzte) hat Vorrang und unterbricht die anderen
    const { page, close } = await open();
    await page.evaluate(scansWrapper);
    await page.setInputFiles('#fileIn', T);
    await page.waitForTimeout(900);
    for (let i = 0; i < T.length - 1; i++) { await page.evaluate(() => $('nextTrack').click()); await page.waitForTimeout(200); }
    await page.waitForFunction(() => curAnalysis && curAnalysis.file === curFile, null, { timeout: 240000, polling: 200 });
    const vor = await page.evaluate(() => ({ fertig: __scans.filter(s => s.r === 'ok').map(s => s.f), aktuell: curFile.name }));
    const letzter = path.basename(T[T.length - 1]);
    check('Warteschlange: der gewählte (letzte) Track wurde zuerst fertig analysiert', vor.aktuell === letzter && vor.fertig[0] === letzter, JSON.stringify(vor));
    await page.waitForFunction(() => !scanJob && !scanQueue.length, null, { timeout: 400000, polling: 300 });
    const r = await page.evaluate(async () => { const all = await Promise.all(queue.map(f => scanCache.get(f))); return { scans: __scans, ok: all.map(A => !!(A && !A.skipped && A.rollen)), cache: scanCache.size, unterbrochen: LOG.filter(l => /unterbrochen/.test(l.x)).length }; });
    check('Warteschlange: danach sind ALLE 5 Tracks fertig (mit Partitur), nichts wartet oder läuft', r.ok.length === 5 && r.ok.every(Boolean) && r.cache === 5, JSON.stringify(r));
    check('Warteschlange: unterbrochene Analysen kamen später neu dran (jede Datei genau einmal fertig)', T.every(t => r.scans.filter(s => s.f === path.basename(t) && s.r === 'ok').length === 1), JSON.stringify(r.scans));
    await close();
  },
  async startsperre() {
    const { page, errs, close } = await open();
    await page.evaluate(() => { window.__ev = []; audio.addEventListener('playing', () => __ev.push(['spielt', performance.now(), !!curAnalysis])); });
    await page.setInputFiles('#fileIn', [T[0]]);
    await page.waitForTimeout(300);
    const w = await page.evaluate(() => ({ pausiert: audio.paused, playGesperrt: $('play').disabled, knopf: $('play').textContent, leiste: $('track').textContent }));
    check('Start-Sperre: während der Analyse kein Ton, Play gesperrt, Leiste zeigt „Analyse“', w.pausiert && w.playGesperrt && /Analyse/.test(w.leiste) && /Analyse/.test(w.knopf), JSON.stringify(w));
    await page.waitForTimeout(1500);
    const pr = await page.evaluate(() => $('track').textContent);
    await page.waitForFunction(() => !audio.paused && audio.currentTime > 0.2, null, { timeout: 180000, polling: 200 });
    const r = await page.evaluate(() => ({ ev: __ev, rollen: !!(curAnalysis && curAnalysis.rollen), log: LOG.map(l => l.x).filter(x => /Partitur fertig in|Start-Sperre frei|Partitur Klangrollen/.test(x)), play: $('play').textContent }));
    check('Start-Sperre: Track startet von selbst, erst NACH der fertigen Analyse (mit Klangrollen-Partitur)', r.ev.length >= 1 && r.ev.every(e => e[2]) && r.rollen && r.play === 'Pause' && r.log.some(x => /Partitur fertig in [\d,]+ s/.test(x)), JSON.stringify(r));
    check('Start-Sperre: Fortschritt „Analyse xx %“ in der Leiste', /Analyse \d+ %/.test(pr) || /Analyse/.test(pr), pr);
    // Plausibilität der Partitur im Test-Track (Intro 8, Groove 16, Break 8 mit Aufbau, Drop 16, Outro 8 Takte): Kick im Drop deutlich, im Break kaum
    const p = await page.evaluate(() => {
      const A = curAnalysis, P = A.rollen, mean = (ty, name) => { let s = 0, n = 0; for (const sc of A.sections.filter(x => x.type === ty)) for (let b = Math.ceil((sc.t0 - P.bar0) / P.barS); (b + 1) * P.barS + P.bar0 <= sc.t1 + 0.01; b++) { const v = ptRolle(A, b, name); if (v !== null) { s += v; n++; } } return n ? +(s / n).toFixed(3) : null; };
      return { n: P.n, takte: Math.round(A.duration / (4 * A.beatS)), kickDrop: mean('drop', 'kick'), kickBreak: mean('break', 'kick'), hatsDrop: mean('drop', 'hats'), sek: A.secs, typen: A.sections.map(s => s.type).join(' ') };
    });
    const au = await page.evaluate(() => { const A = curAnalysis, P = A.aufbau, sd = A.sections.filter(s => s.type === 'drop').map(s => +s.t0.toFixed(2)); return { drops: P ? P.drops.map(d => ({ t: d.t, takt: d.bar, pause: d.pause, aufbau: d.buildBars, staerke: d.strength })) : null, scanDrops: sd, barS: A.km.barS, log: LOG.some(l => /Aufbau-Detektor: Drop/.test(l.x)) }; });
    check('Aufbau-Detektor in der Partitur: findet den Drop nach dem 8-Takt-Break (±1 Takt zum Scan), mit Aufbau davor, Stärke 0..1, steht im Protokoll',
      au.drops && au.log && au.drops.some(d => au.scanDrops.some(t => Math.abs(d.t - t) <= au.barS * 1.05) && d.aufbau >= 2 && d.staerke > 0 && d.staerke <= 1), JSON.stringify(au));
    check('Partitur: ein Wert pro Takt; Kick im Drop deutlich (> 0,4), im Break kaum (< 0,15)', Math.abs(p.n - p.takte) <= 2 && p.kickDrop > 0.4 && p.kickBreak !== null && p.kickBreak < 0.15, JSON.stringify(p));
    console.log('       (Info) Analyse (Scan + Partitur) im Sandbox-Rechner: ' + p.sek + ' s für ' + p.takte + ' Takte');
    check('Start-Sperre: keine Seitenfehler, keine Fehler im Protokoll', errs.length === 0 && (await page.evaluate(() => LOG.filter(l => l.k === 'x').length)) === 0, errs.join(' | '));
    await close();
  },
  async speicher() {
    // Dieselbe Datei zweimal: beim zweiten Mal (neu geladene Seite) kommt die Partitur aus IndexedDB „nmd-partitur“ und der Track startet sofort
    const { page, close } = await open();
    await page.setInputFiles('#fileIn', [T[0]]);
    await page.waitForFunction(() => !audio.paused && curAnalysis && curAnalysis.rollen, null, { timeout: 180000, polling: 200 });
    await page.waitForTimeout(500);
    const vor = await page.evaluate(async () => ({ stats: await ptStats(), A: { bpm: curAnalysis.bpm, drops: curAnalysis.drops, n: curAnalysis.rollen.n, sum: Array.from(curAnalysis.rollen.v).reduce((a, b) => a + b, 0) } }));
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__AM_STEP === 16, null, { timeout: 15000 });
    await page.evaluate(() => { window.__t = {}; $('fileIn').addEventListener('change', () => { __t.wahl = performance.now(); }, true); audio.addEventListener('playing', () => { if (!__t.spielt) __t.spielt = performance.now(); }); });
    await page.setInputFiles('#fileIn', [T[0]]);
    await page.waitForFunction(() => !audio.paused && curAnalysis && __t.spielt, null, { timeout: 30000, polling: 50 });
    const r = await page.evaluate(() => ({ ms: Math.round(__t.spielt - __t.wahl), ausSpeicher: !!curAnalysis.fromStore, log: LOG.map(l => l.x).filter(x => /Partitur aus Speicher|Partitur fertig/.test(x)), A: { bpm: curAnalysis.bpm, drops: curAnalysis.drops, n: curAnalysis.rollen && curAnalysis.rollen.n, sum: curAnalysis.rollen ? Array.from(curAnalysis.rollen.v).reduce((a, b) => a + b, 0) : -1 }, km: !!curAnalysis.km, klang: !!curAnalysis.klang, onM: curAnalysis.onM && curAnalysis.onM.constructor.name }));
    check('Speicher: nach der ersten Analyse liegt 1 Partitur in „nmd-partitur“', vor.stats.n === 1 && vor.stats.mb > 0, JSON.stringify(vor.stats));
    check('Speicher: dieselbe Datei nach Neuladen: „Partitur aus Speicher“, keine neue Analyse, Start unter 1 s', r.ausSpeicher && r.ms < 1000 && r.log.some(x => /aus Speicher/.test(x)) && !r.log.some(x => /Partitur fertig/.test(x)), JSON.stringify(r));
    console.log('       (Info) Start mit Partitur aus dem Speicher: ' + r.ms + ' ms von der Dateiwahl bis Ton');
    check('Speicher: gespeicherte Partitur ist gleich (Tempo, Drops, Klangrollen, Klangbild, Klangmesser, Zahlenreihen)', JSON.stringify(r.A) === JSON.stringify(vor.A) && r.km && r.klang && r.onM === 'Float32Array', JSON.stringify(r.A) + ' gegen ' + JSON.stringify(vor.A));
    // Aufräumen: alte Analyse-Version fliegt sofort, sonst höchstens PT_MAX_N Einträge (die am längsten unbenutzten zuerst)
    const t = await page.evaluate(async () => {
      const db = await ptDb(), now = Date.now();
      await new Promise(res => { const tx = db.transaction(['meta', 'data'], 'readwrite'); for (let i = 0; i < PT_MAX_N + 5; i++) { const k = 'alt' + i + '|1|1|v' + PARTITUR_V; tx.objectStore('meta').put({ k, at: now - 1e9 + i, sz: 10, name: 'x' }); tx.objectStore('data').put({}, k); }
        tx.objectStore('meta').put({ k: 'uralt|1|1|v0', at: now, sz: 10, name: 'y' }); tx.objectStore('data').put({}, 'uralt|1|1|v0'); tx.oncomplete = res; });
      await ptTidy(db); const s = await ptStats(), echt = await ptLoad(curFile);
      return { n: s.n, echtNochDa: !!echt, v0: !!(await ptReq(db.transaction('meta').objectStore('meta').get('uralt|1|1|v0'))) };
    });
    check('Speicher aufräumen: höchstens 200 Einträge, alte Version weg, der zuletzt benutzte Track bleibt', t.n === 200 && t.echtNochDa && !t.v0, JSON.stringify(t));
    await close();
  },
  async hintergrund() {
    // Langer Track (6,4 Minuten) wird im Hintergrund analysiert, während ein anderer spielt: Bild muss flüssig bleiben
    const { page, close } = await open();
    await page.setInputFiles('#fileIn', [T[0], TL]);
    if (process.env.HG_DIAG) { await page.waitForFunction(() => !audio.paused, null, { timeout: 180000 }); const dg = await page.evaluate(() => new Promise(res => { const t0 = performance.now(), ev = []; const oa = File.prototype.arrayBuffer; File.prototype.arrayBuffer = function () { ev.push(['arrayBuffer', Math.round(performance.now() - t0)]); return oa.call(this).then(x => { ev.push(['arrayBuffer Ende', Math.round(performance.now() - t0)]); return x; }); };
      const od = BaseAudioContext.prototype.decodeAudioData; BaseAudioContext.prototype.decodeAudioData = function (b, ok, ko) { ev.push(['decode', Math.round(performance.now() - t0)]); return od.call(this, b, x => { ev.push(['decode Ende', Math.round(performance.now() - t0)]); ok && ok(x); }, ko); };
      const og = window.getDuration; window.getDuration = f => { ev.push(['dauer', Math.round(performance.now() - t0)]); return og(f).then(x => { ev.push(['dauer Ende', Math.round(performance.now() - t0)]); return x; }); };
      const gaps = []; let last = performance.now(); const step = () => { const n = performance.now(); if (n - last > 50) gaps.push([Math.round(n - t0), Math.round(n - last)]); last = n; if (n - t0 < 6000) requestAnimationFrame(step); else res({ gaps, ev }); }; requestAnimationFrame(step); })); console.log('DIAG0', JSON.stringify(dg)); }
    await page.waitForFunction(() => !audio.paused && scanJob && scanJob.file === queue[1], null, { timeout: 180000, polling: 100 });
    const frames = (stopWhenIdle) => page.evaluate(stop => new Promise(res => { const d = []; let last = performance.now(); const t0 = last;   // Bilddauern in ms, 4 s lang
      const step = () => { const n = performance.now(); d.push(n - last); last = n; if (n - t0 < 4000 && (!stop || scanJob)) requestAnimationFrame(step); else res(d); };
      requestAnimationFrame(step); }), stopWhenIdle);
    const dA = await frames(true);
    if (process.env.HG_DIAG) { const dg = await page.evaluate(() => new Promise(res => { const ph = []; const t0 = performance.now(); for (const n of ['analyzeEnvelopes', 'klangSplit', 'klangBars', 'kmBars', 'partiturRollen', 'getDuration']) { const o = window[n]; window[n] = function () { ph.push([n, Math.round(performance.now() - t0)]); const r = o.apply(this, arguments); if (r && r.then) r.then(() => ph.push([n + ' Ende', Math.round(performance.now() - t0)])); else ph.push([n + ' Ende', Math.round(performance.now() - t0)]); return r; }; }
      const gaps = []; let last = performance.now(); const step = () => { const n = performance.now(); if (n - last > 50) gaps.push([Math.round(n - t0), Math.round(n - last)]); last = n; if (scanJob) requestAnimationFrame(step); else res({ gaps, ph }); }; requestAnimationFrame(step); })); console.log('DIAG', JSON.stringify(dg)); }
    await page.waitForFunction(() => !scanJob && !scanQueue.length, null, { timeout: 400000, polling: 500 });
    const dR = await frames(false);                                         // Vergleich: dieselbe Messung ohne Analyse
    // „Langsames Bild“ = Aussetzer: über 100 ms UND über dem 3-fachen eines normalen Bildes ohne Analyse (auf dem GitHub-Rechner liegen normale Bilder schon bei 30-50 ms, mit Analyse bei 40-97 ms)
    const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1], thr = Math.max(100, 3 * med(dR));
    const stat = d => ({ n: d.length, fps: +(1000 * d.length / d.reduce((x, y) => x + y, 0)).toFixed(1), langsam: d.filter(x => x > thr).length, max: Math.round(Math.max(...d)) });
    const f = stat(dA), ruhe = stat(dR);
    const r = await page.evaluate(async () => { const A = await scanCache.get(queue[1]); return { min: +(A.duration / 60).toFixed(1), sek: A.secs, rollenMs: A.rollenMs, takte: A.rollen && A.rollen.n }; });
    console.log('       (Info) Langer Track ' + r.min + ' min, im Hintergrund während Musik: Analyse ' + r.sek + ' s (davon Klangrollen-Partitur ' + (r.rollenMs / 1000).toFixed(1) + ' s), ' + r.takte + ' Takte · Bild dabei ' + f.fps + ' fps, ' + f.langsam + ' Aussetzer, längstes ' + f.max + ' ms (ohne Analyse: ' + ruhe.fps + ' fps, ' + ruhe.langsam + ' langsame, längstes ' + ruhe.max + ' ms; langsam = über ' + Math.round(thr) + ' ms)');
    check('Hintergrund-Analyse: Bild bleibt flüssig (Sandbox: mindestens 60 % der Bildrate ohne Analyse, höchstens 12 Aussetzer mehr (Bilder über 100 ms und über 3 normalen Bildern), kein Bild über 600 ms und über dem Doppelten des längsten Bildes ohne Analyse; Einlesen und Dekodieren der Datei macht der Browser am Stück), langer Track wird fertig', f.fps >= 0.6 * ruhe.fps && f.langsam <= ruhe.langsam + 12 && f.max < Math.max(600, 2 * ruhe.max) && r.takte > 200, JSON.stringify(f) + ' ' + JSON.stringify(r) + ' ohne ' + JSON.stringify(ruhe));
    await close();
  },
  async notfall() {
    // Analyse scheitert: klare Meldung, Play wird „Ohne Analyse spielen“, ein Tipp spielt den Track live
    const { page, close } = await open();
    await page.evaluate(() => { window.analyzeFile = async () => { throw new Error('Test: zu wenig Speicher'); }; });
    await page.setInputFiles('#fileIn', [T[0]]);
    await page.waitForFunction(() => /Ohne Analyse/.test($('play').textContent), null, { timeout: 20000, polling: 100 });
    const a = await page.evaluate(() => ({ pausiert: audio.paused, knopf: $('play').textContent, frei: !$('play').disabled, meldung: $('msg') ? $('msg').textContent : document.body.innerText.match(/Analyse nicht möglich[^\n]*/)?.[0] }));
    await page.click('#play'); await page.waitForTimeout(800);
    const b = await page.evaluate(() => ({ spielt: !audio.paused, live: !curAnalysis, knopf: $('play').textContent }));
    check('Notfall: Analyse scheitert → Meldung, Track wartet, Knopf „Ohne Analyse spielen“ startet ihn live', a.pausiert && a.frei && /Analyse nicht möglich/.test(a.meldung || '') && b.spielt && b.live && b.knopf === 'Pause', JSON.stringify(a) + ' → ' + JSON.stringify(b));
    await close();
    // Trackende: der nächste Track lässt sich nicht analysieren → keine Stille, er spielt sofort ohne Analyse (mit Hinweis)
    const c = await open();
    await c.page.evaluate(() => { const orig = analyzeFile; window.analyzeFile = async (f, alive) => { if (/t2/.test(f.name)) throw new Error('Test: kaputt'); return orig(f, alive); }; });
    await c.page.setInputFiles('#fileIn', T.slice(0, 2));
    await c.page.waitForFunction(() => !audio.paused && audio.currentTime > 0.2, null, { timeout: 180000 });
    await c.page.waitForFunction(() => !scanJob && !scanQueue.length, null, { timeout: 180000, polling: 200 });
    await c.page.evaluate(() => { audio.currentTime = audio.duration - 0.4; });
    await c.page.waitForFunction(() => qi === 1, null, { timeout: 20000 }); await c.page.waitForTimeout(1000);
    const e = await c.page.evaluate(() => ({ qi, spielt: !audio.paused, live: !curAnalysis, hinweis: $('msg').textContent, log: LOG.some(l => /keine Stille/.test(l.x)) }));
    check('Notfall am Trackende: nächster Track ohne Analyse spielt sofort weiter (keine Stille), mit Hinweis', e.qi === 1 && e.spielt && e.live && /ohne Analyse/.test(e.hinweis) && e.log, JSON.stringify(e));
    await c.close();
  },
  async zurueckspringen() {
    const { page, close } = await open();
    await page.evaluate(scansWrapper);
    await page.setInputFiles('#fileIn', T.slice(0, 2));
    await page.waitForTimeout(500);
    await page.evaluate(() => playAt(1)); await page.waitForTimeout(60); await page.evaluate(() => playAt(0));
    await page.waitForFunction(() => curAnalysis && curAnalysis.file === curFile, null, { timeout: 120000, polling: 200 });
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => ({ info: $('track').textContent, log: LOG.map(l => l.x).filter(x => /Kein Scan|abgebrochen/.test(x)) }));
    check('Hin und gleich zurück: Track zeigt seinen Scan („Drops“), nicht „läuft live“', /Drops?/.test(r.info) && r.log.length === 0, JSON.stringify(r));
    await close();
  },
  async trackwechsel() {
    const { page, close } = await open();
    await page.setInputFiles('#fileIn', T.slice(0, 2));
    await page.waitForFunction(() => audio.duration > 0 && !audio.paused, null, { timeout: 180000 });
    await page.waitForFunction(() => !scanJob && !scanQueue.length, null, { timeout: 180000, polling: 200 });   // der zweite wird im Hintergrund vorab analysiert
    await page.evaluate(() => { audio.currentTime = audio.duration - 0.4; });
    await page.waitForFunction(() => qi === 1, null, { timeout: 20000 });
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => ({ qi, spielt: !audio.paused, partitur: !!(curAnalysis && curAnalysis.rollen), fehler: LOG.filter(l => l.k === 'x').map(l => l.x) }));
    check('Trackende: nächster Track (schon vorab analysiert) startet ohne Wartezeit von selbst', r.qi === 1 && r.spielt && r.partitur && r.fehler.length === 0, JSON.stringify(r));
    await close();
  },
  async grafikverlust() {
    const { page, close } = await open();
    const r = await page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms)), out = {}, N = 'Eigen · Peak · Strahlen';
      const px = () => { const gl = shPlayer.gl, a = new Uint8Array(64 * 36 * 4); shEl.width = 320; shEl.height = 180; shPlayer.draw({ time: 3, bass: .7, mid: .5, treb: .4, beat: 1, bar: 0, build: .3, hue: .3, flash: 1 }); gl.readPixels(100, 70, 64, 36, gl.RGBA, gl.UNSIGNED_BYTE, a); let s = 0; for (let i = 0; i < a.length; i += 4) s += a[i] + a[i + 1] + a[i + 2]; return +(s / (64 * 36 * 3)).toFixed(2); };
      shEnsure(); toggles.own = true; loadByName(N, 0); await wait(300);
      out.vorher = px(); const gl = shPlayer.gl, ext = gl.getExtension('WEBGL_lose_context'); ext.loseContext(); await wait(300);
      const eigen = () => [...broken].filter(x => /^Eigen/.test(x)).length, b0 = eigen();
      for (let i = 0; i < 40; i++) nextPreset(0, undefined, false, 't');
      out.gesperrt = eigen() - b0; out.imVerlust = { shCur, shOp };
      ext.restoreContext(); await wait(600); out.zurueck = !gl.isContextLost();
      loadByName(N, 0); await wait(300); out.nachher = px();
      return out;
    });
    check('Grafik-Verlust: Shader aus dem Spiel genommen, Milkdrop übernimmt, kein Shader zu Unrecht gesperrt', r.gesperrt === 0 && r.imVerlust.shCur === null && r.imVerlust.shOp === 0, JSON.stringify(r));
    check('Grafik-Verlust: Kontext kommt zurück, Shader zeichnet dasselbe Bild wie vorher', r.zurueck && r.vorher > 1 && r.nachher === r.vorher, JSON.stringify(r));
    await close();
  },
  async mikrofon() {
    const { page, close } = await open();
    const r = await page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms)), out = {};
      await startMic(); out.an = micOn; await wait(500); out.quelle = srcNode === micNode; stopMic(); out.aus = !micOn;
      for (let i = 0; i < 3; i++) { await startMic(); await wait(80); stopMic(); }
      $('micBtn').click(); await wait(400); out.knopfAn = micOn; $('micBtn').click(); await wait(100); out.knopfAus = !micOn;
      out.fehler = LOG.filter(l => l.k === 'x').map(l => l.x); return out;
    });
    check('Mikrofon: an, Quelle ist das Mikro, aus, mehrfach hintereinander, per Knopf, ohne Fehler', r.an && r.quelle && r.aus && r.knopfAn && r.knopfAus && r.fehler.length === 0, JSON.stringify(r));
    await close();
  },
  async sicherung() {
    const { page, close } = await open();
    const r = await page.evaluate(() => {
      favs.add('Test · Preset 3'); store.set('am-favs', [...favs]);
      const txt = JSON.stringify(dPack()), p = dParse(txt), o = {};
      o.parse = !!p.o; const m = dMerge(p.o, false); o.nichtsNeu = m.favs === 0 && m.prof === 0 && m.runs === 0 && m.tracks === 0;
      const had = toggles.spark; toggles.spark = !had; dSettings(JSON.parse(txt).settings); o.einstellungen = toggles.spark === had;
      o.schalter = Object.keys(JSON.parse(txt).settings.toggles).length; return o;
    });
    check('Sicherung: lesen, zusammenführen (nichts doppelt), Einstellungen zurückspielen, 16 Schalter', r.parse && r.nichtsNeu && r.einstellungen && r.schalter === 16, JSON.stringify(r));
    await close();
  },
  async fehlermeldungen() {
    const { page, close } = await open();
    await page.setInputFiles('#fileIn', [T[0]]);
    await page.waitForFunction(() => curAnalysis && !audio.paused, null, { timeout: 180000, polling: 200 });   // ab Build 102 startet der Track erst nach der Analyse
    const r = await page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms)), out = {};
      reactive.update = () => { throw new Error('Test-Fehler A'); }; await wait(800);
      for (let i = 0; i < 20; i++) viz.renderer.audioLevels.updateAudioLevels.call({}, 60, i); await wait(200);
      out.meldungen = LOG.filter(l => l.k === 'x').map(l => l.x);
      curAnalysis = null;   // Live-Prüfung: ohne Scan (ab Build 102 ist der Scan hier schon fertig, vorher lief die Prüfung zufällig davor)
      audio.pause(); bpm = 200; const P = 60000 / bpm; beat.state = 'break'; beat.breakStart = performance.now() - 20 * P; beat.lastKick = 0; beat.kickStreak = 9;
      onKick(performance.now(), 1); out.drop = beat.state; resetBeat(); beat.state = 'drop';
      // Während des Wartens nur der alte Drop-Zeitgeber: die Live-Erkennung (echte Kicks, Stille nach der Pause) ruht, sonst misst die Prüfung Zufall
      const lf = window.liveFrame, ok = window.onKick; window.liveFrame = () => {}; window.onKick = () => {};
      await wait(16 * P + 400); out.nachAltemTimer = beat.state; window.liveFrame = lf; window.onKick = ok; return out;
    });
    check('Fehler pro Bild werden gemeldet, aber nur einmal (2 Meldungen trotz 20+ Aufrufen)', r.meldungen.length === 2, JSON.stringify(r.meldungen));
    check('Live-Drop: Timer des vorigen Tracks schaltet den neuen Track nicht um', r.drop === 'drop' && r.nachAltemTimer === 'drop', JSON.stringify(r));
    await close();
  },
  async offline() {
    const { page, ctx, errs, close } = await open({ sw: true });
    await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(1500);
    const on = await page.evaluate(async () => { const k = await caches.keys(), c = await caches.open(k[0]); return { caches: k, n: (await c.keys()).length, scope: (await navigator.serviceWorker.ready).scope, files: AM_FILES.length }; });
    check('Offline: Service Worker aktiv unter ' + PREFIX + ', Speicher mit allen Dateien und den 3 Bibliotheken', on.scope.endsWith(PREFIX) && on.caches.length === 1 && on.n >= on.files + 3 + 10, JSON.stringify(on));
    await ctx.setOffline(true); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1500);
    const off = await page.evaluate(() => ({ step: window.__AM_STEP, sw: !!navigator.serviceWorker.controller }));
    check('Offline: Neuladen ohne Netz startet die App bis Teil 16', off.step === 16 && off.sw && errs.length === 0, JSON.stringify(off) + errs.join(' | '));
    await close();
  },
  async vergleichsseite() {
    // b33/ liegt im Bereich des Service Workers: sie muss mit aktivem Service Worker weiter ihren eigenen Stand zeigen
    const { page, errs, close } = await open({ sw: true });
    await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(800);
    const fehlend = []; page.on('response', x => { if (x.status() >= 400) fehlend.push(x.status() + ' ' + x.url().replace(/^http:\/\/127\.0\.0\.1:\d+/, '')); });
    await page.goto(URL0.replace('index.html', 'b33/index.html'), { waitUntil: 'load' }); await page.waitForTimeout(1500);
    const r = await page.evaluate(() => ({ titel: document.title, build: typeof BUILD !== 'undefined' ? BUILD : null, start: !!document.getElementById('stage') }));
    check('b33: Vergleichsseite zeigt Build 33 und startet ohne Fehler (auch mit Service Worker)', /Build 33/.test(r.titel) && r.start && errs.filter(e => !(/Failed to load resource/.test(e) && misses.every(m => m === '/favicon.ico'))).length === 0,   // das fehlende Favicon der alten, unveränderten Seite ist egal
       JSON.stringify(r) + errs.join(' | ') + ' 404: ' + misses.join(','));
    await close();
  },
  async protokollfixes() {
    // Vier Fehler aus dem iPhone-Protokoll von Build 48
    const { page, close } = await open();
    await page.setInputFiles('#fileIn', [T[0]]);
    await page.waitForFunction(() => curAnalysis && curAnalysis.beatS, null, { timeout: 120000, polling: 200 });
    const wait = ms => page.waitForTimeout(ms);
    // 1) Lastbremse: Zähler für langsame Sekunden darf Hintergrund und Rückkehr nicht überleben
    const lb = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms)), vis = v => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v }); document.dispatchEvent(new Event('visibilitychange')); };
      const vorher = LOG.filter(l => /Lastbremse/.test(l.x)).length;   // echte Langsamkeit des Test-Rechners (Software-GL) zählt nicht
      slowSecs = 2; vis('hidden'); await w(300); const nachHidden = slowSecs; slowSecs = 2; vis('visible'); await w(1500);
      return { nachHidden, nachVisible: slowSecs, lastbremse: LOG.filter(l => /Lastbremse/.test(l.x)).length - vorher };
    });
    check('Lastbremse: Zähler wird beim Verstecken und bei der Rückkehr geleert, keine Fehlauslösung', lb.nachHidden === 0 && lb.nachVisible === 0 && lb.lastbremse === 0, JSON.stringify(lb));
    // 2) Play-Tipp: ein wartendes playAt startet den Track vor dem Handler; der darf ihn nicht wieder pausieren
    const pl = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms)); audio.pause(); await w(100);
      const orig = ctx.resume.bind(ctx); let go, pausen = 0; ctx.resume = () => new Promise(r => { go = () => r(orig()); });
      $('play').click(); await w(50); await audio.play(); await w(100);
      audio.addEventListener('pause', () => pausen++); go(); await w(600); ctx.resume = orig;   // der Wächter würde eine Pause nach 0,2 s zurücknehmen: darum zählen wir die Pause selbst
      return { spielt: !audio.paused, pausenNachDemTipp: pausen };
    });
    check('Play-Tipp: ein schon gestarteter Track wird nicht sofort wieder pausiert', pl.spielt && pl.pausenNachDemTipp === 0, JSON.stringify(pl));
    // 3) Sicherheitsnetz gegen Stillstand: in Groove und Drop wechselt der Phrasen-Sync, kein zweiter Wechsel
    const sc = await page.evaluate(() => {
      let n = 0; const orig = nextPreset; window.nextPreset = function () { n++; };
      const P = 60000 / bpm, t = performance.now(), res = {}; auto = true; frozen = false; dropPre = 0;
      for (const [ph, ty] of [[true, 'groove'], [true, 'drop'], [true, 'break'], [true, 'intro'], [false, 'groove']]) { toggles.phrase = ph; lastSwitch = t - 1e6; n = 0; stillCheck(ty, t, P); res[ty + (ph ? '' : '(Phrase aus)')] = n; }
      window.nextPreset = orig; toggles.phrase = true; return res;
    });
    check('Stillstands-Netz: nicht in Groove und Drop (Phrasen-Sync an), sonst schon', sc.groove === 0 && sc.drop === 0 && sc.break === 1 && sc.intro === 1 && sc['groove(Phrase aus)'] === 1, JSON.stringify(sc));
    // 4) Protokoll: Kopf bleibt, Lücke wird markiert, Obergrenze gilt
    const lg = await page.evaluate(() => {
      for (let i = 0; i < 700; i++) rea('Füllzeile ' + i);
      return { n: LOG.length, kopf: LOG[0].x.slice(0, 20), luecke: LOG.some(l => l.gap), text: /Zeilen ausgelassen/.test(logText()), letzte: LOG[LOG.length - 1].x };
    });
    check('Protokoll: Obergrenze 400, die ersten Zeilen (Build, Start) bleiben, Lücke ist markiert', lg.n === 400 && /Seite geladen/.test(lg.kopf) && lg.luecke && lg.text && lg.letzte === 'Füllzeile 699', JSON.stringify(lg));
    await close();
  },
  async notaus() {
    const { page, close } = await open();
    await page.setInputFiles('#fileIn', [T[0]]);
    await page.waitForFunction(() => curAnalysis && curAnalysis.beatS && !audio.paused, null, { timeout: 120000, polling: 200 });
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms)), touch = i => new Touch({ identifier: i, target: document.body, clientX: 50 + 40 * i, clientY: 300 });
      const vor = { spielt: !audio.paused, ctx: ctx.state };
      document.body.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(1), touch(2)], bubbles: true })); const zweiFinger = panicked;
      document.body.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(1), touch(2), touch(3)], bubbles: true })); await w(400);
      const vis = v => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v }); document.dispatchEvent(new Event('visibilitychange')); };
      vis('hidden'); await w(100); vis('visible'); await w(900);        // Rückkehr aus dem Hintergrund darf nichts wieder anwerfen
      return { vor, zweiFinger, panicked, pausiert: audio.paused, quelleWeg: audio.getAttribute('src') === null, ctx: ctx.state, vizAus: viz === null, overlay: !$('panicBox').hidden, hudWeg: hud.style.display === 'none', warteschlangeLeer: queue.length === 0, wake: !wakeSentinel || wakeSentinel.released, mikro: micOn };
    });
    check('Notaus (drei Finger): zwei Finger tun nichts, drei stoppen Ton, Grafik und Bildschirmsperre', r.vor.spielt && !r.zweiFinger && r.panicked && r.pausiert && r.quelleWeg && r.vizAus && r.overlay && r.hudWeg && r.warteschlangeLeer && r.wake && !r.mikro, JSON.stringify(r));
    check('Notaus: nach dem Hintergrund startet nichts von allein wieder (Audio-Engine bleibt aus)', r.ctx === 'suspended' && r.pausiert, JSON.stringify(r));
    await close();
    const b = await open();
    await b.page.click('#panic'); await b.page.waitForTimeout(300);
    check('Notaus (Knopf): löst aus und zeigt die Meldung', await b.page.evaluate(() => panicked && !$('panicBox').hidden && LOG.some(l => /NOTAUS \(Knopf\)/.test(l.x))));
    await b.close();
  },
  async haenger() {
    // Der Wächter-Worker muss einen Stillstand der Seite aufschreiben, auch wenn danach alles neu startet
    const { page, close } = await open();
    await page.waitForTimeout(2500);
    await page.evaluate(() => { const t = performance.now(); while (performance.now() - t < 11000) {} });     // Seite steht 11 s
    await page.waitForTimeout(3000);
    const rec = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('nmd-wd', 1); r.onsuccess = () => { const g = r.result.transaction('k').objectStore('k').get('hang'); g.onsuccess = () => res(g.result || null); }; r.onerror = () => res(null); }));
    check('Hänger-Wächter: 11 s Stillstand aufgeschrieben, mit dem Bild, das lief', rec && rec.recovered && rec.ms >= 9000 && rec.crumb && rec.crumb.n && /Lastbremse/.test(rec.crumb.txt), JSON.stringify(rec));
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__AM_STEP === 16, null, { timeout: 15000 }); await page.waitForTimeout(1500);
    const n = await page.evaluate(() => ({ meldung: LOG.some(l => /Letzter Lauf hing/.test(l.x)), gesperrt: [...suspect], gespeichert: store.get('am-suspect-v1', []).length }));
    check('Hänger-Wächter: nächster Start meldet den Hänger und sperrt das Bild für 7 Tage', n.meldung && n.gesperrt.length === 1 && n.gesperrt[0] === rec.crumb.n && n.gespeichert === 1, JSON.stringify(n) + ' erwartet ' + (rec && rec.crumb && rec.crumb.n));
    const aus = await page.evaluate(() => { for (let i = 0; i < 200; i++) nextPreset(0, undefined, false, 't'); return [...suspect][0] === curName; });
    check('Hänger-Wächter: das gesperrte Bild wird bei 200 Wechseln nicht mehr gewählt', await page.evaluate(() => { const bad = [...suspect][0]; let hit = 0; for (let i = 0; i < 200; i++) { nextPreset(0, undefined, false, 't'); if (curName === bad) hit++; } return hit === 0; }), String(aus));
    await close();
  },
  async letzterlauf() {
    const { page, close } = await open();
    await page.evaluate(() => { rea('Markenzeile vom ersten Lauf'); lastLogSave(true); });
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__AM_STEP === 16, null, { timeout: 15000 });
    await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('nein')) } }); $('logBtn').click(); $('logPrev').click(); }); await page.waitForTimeout(30);
    const r = await page.evaluate(() => ({ vorhanden: !!prevLog && /Markenzeile vom ersten Lauf/.test(prevLog.text) && /Seite geladen/.test(prevLog.text), zeigt: /LETZTEN Laufs/.test($('logpre').textContent) || $('logPrev').textContent === 'Kopiert' }));
    check('Letzter Lauf: Protokoll des vorigen Starts ist da, und der Knopf gibt es aus', r.vorhanden && r.zeigt, JSON.stringify(r));
    await close();
  },
  async ruhiger() {
    const { page, close } = await open();
    await page.setInputFiles('#fileIn', [T[0]]);
    await page.waitForFunction(() => scanActive(), null, { timeout: 120000, polling: 200 });
    const r = await page.evaluate(() => {
      const alt = curAnalysis.km, padsG = window.__SZ.gain.pads; window.__SZ.gain.pads = 0;   // Schaltzentrale: Pads-Farbschritt aus, hier zählt nur die Ton-Sprung-Logik (Schritt genau 20°)
      const lauf = tonFolge => {
        const n = tonFolge.length; curAnalysis.km = { n, t0: 1e9, barS: 1, ton: tonFolge, tk: tonFolge.map(() => 0.5) }; tonLast = -1; toggles.bar = true; dropPre = 0;
        const v = barHueTarget; for (let k = 1; k < n; k++) { beat.n = k * 4; onBar('groove'); } return barHueTarget - v - 20 * (n - 1);
      };
      const pendeln = lauf([9, 4, 9, 4, 9, 4, 9, 4]), wechsel = lauf([9, 9, 9, 4, 4, 4, 4]), kurz = lauf([9, 9, 4, 4, 9, 9, 9, 9, 9]);
      curAnalysis.km = alt; window.__SZ.gain.pads = padsG;
      const S = window.__SZ, pe0 = S.pe; S.pe = 0; const ohnePads = szBarStep(20), gross = szBarStep(45); S.pe = 1; const mitPads = szBarStep(20); S.pe = pe0;
      mxFrame(0, 0.016); MX.z.p = 0.3; MX.z.v = 0; mxFrame(16, 0.016); const z = MX.out.z;
      return { pendeln, wechsel, kurz, z, ohnePads, gross, mitPads };
    });
    check('Takt-Farbe: Pendeln zwischen zwei Tönen gibt keinen Farbsprung, ein Ton, der nur 2 Takte bleibt, ebenfalls nicht; ein echter Wechsel (A→E, 4 Takte) genau einen', r.pendeln === 0 && r.kurz === 0 && r.wechsel === -150, JSON.stringify(r));
    check('Takt-Farbschritt (Schaltzentrale): ohne Pads größer als normal (20° → 28°), mit vollen Pads kleiner (10°), nie über 40°', r.ohnePads > 20 && r.ohnePads <= 40 && r.mitPads < 20 && r.gross <= 40, JSON.stringify({ o: r.ohnePads, m: r.mitPads, g: r.gross }));
    check('Drop-Zoom: auch bei übergroßem Anschlag bleibt der Zoom unter 8 % (vorher bis 12,5 %)', r.z > 0.05 && r.z <= 0.08, JSON.stringify(r));
    await page.waitForFunction(() => curAnalysis && curAnalysis.km, null, { timeout: 120000, polling: 200 });
    const sw = await page.evaluate(() => { const K = curAnalysis.km, v = Array.from(K.sweep || []); return { n: K.n, len: v.length, max: Math.max(0, ...v.map(Math.abs)), ok: v.every(x => x >= -1 && x <= 1) }; });
    check('Filterfahrt: pro Takt ein Wert zwischen -1 und +1, im Test-Track mit wandernder Filterfrequenz nicht überall 0', sw.len === sw.n && sw.ok && sw.max > 0.1, JSON.stringify(sw));
    const q = await page.evaluate(() => { const t = targetSize(true); return { q: $('quality').value, lang: Math.max(t[0], t[1]), ton: TON_MIN, bk: BRAKE_KEY }; });
    check('Standard-Auflösung: 1080p, längste Seite höchstens 1920 px; Ton-Schwelle 0,10; Lastbremse-Speicher v2', q.q === '1080' && q.lang <= 1920 && q.ton === 0.10 && q.bk === 'am-brake-v2', JSON.stringify(q));
    await close();
  },
  async klangrollen() {
    // Klang-Analyse ohne Echtzeit: die Datei läuft durch einen OfflineAudioContext, alle 1/60 s wird angehalten, das Spektrum
    // genau wie live (Analyser 4096, ohne Glättung) an akCreate().step gegeben. So prüfen 4 Tracks in Sekunden statt Minuten.
    const { page, errs, close } = await open();
    const run = (name, gain) => krRun(page, name, gain);
    const barT = (P, b) => P.bar0 + b * P.barS, beatS = PT.kickDurch.barS / 4;
    // Diagnose (KR_DIAG=1): pro Takt Mittelwert von env und Anteil am Gesamtpegel je Rolle
    const diag = (name, R, P) => { if (!process.env.KR_DIAG) return; console.log('       DIAG ' + name + ' (Takt: env k/a/h/p · Anteil k/a/h/p)');
      const nb = Math.floor((R.env.kick.length / 60 - P.bar0) / P.barS);
      for (let b = 0; b < nb; b++) { const i0 = Math.round((P.bar0 + b * P.barS) * 60), i1 = Math.round((P.bar0 + (b + 1) * P.barS) * 60), m = a => { let x = 0; for (let i = i0; i < i1; i++) x += a[i] || 0; return (x / (i1 - i0)).toFixed(3); };
        console.log('         ' + String(b).padStart(2) + '  ' + ['kick', 'acid', 'hats', 'pads'].map(r => m(R.env[r])).join(' ') + '  ·  ' + ['kick', 'acid', 'hats', 'pads'].map(r => m(R.rel[r])).join(' ')); } };

    // 1) Durchgehender Kick: kick_entry nur einmal am Anfang
    const a = await run('kickDurch', 1), ke = a.events.filter(e => e.k === 'entry' && e.r === 'kick');
    check('Klangrollen 1: durchgehender Kick (32 Takte): kick_entry genau einmal, am Anfang', ke.length === 1 && ke[0].t < barT(PT.kickDurch, 1), JSON.stringify(ke));
    const bpmEnd = a.bpm[a.bpm.length - 1];
    check('Klangrollen: Tempo erkannt (140 BPM ± 1), Abschnitt bleibt groove', Math.abs(bpmEnd - 140) <= 1 && a.sec.slice(120).every(x => x === 0), 'BPM ' + bpmEnd + ' · Abschnitte ' + JSON.stringify(a.events.filter(e => e.k === 'section')));
    // 2) Kick fehlt einen Takt (Takt 8): break spätestens am Ende des Takts + 1 Schlag, danach wieder groove (kurze Lücke, kein drop)
    if (process.env.KR_DIAG) { const bb = await run('kickLuecke', 1), B8_ = barT(PT.kickLuecke, 8); console.log('       DIAG Kick-Treffer [t, Anstieg, Stärke] um die Lücke (Takt 8 ab ' + B8_.toFixed(2) + ' s): ' + JSON.stringify(bb.hits.filter(h => h[0] > B8_ - 3 && h[0] < B8_ + 5))); const rs = a.hits.slice(20).map(h => h[1]).sort((x, y) => x - y); console.log('       DIAG Anstieg bei durchgehendem Kick: 5% ' + rs[Math.floor(rs.length * 0.05)] + ' · Median ' + rs[rs.length >> 1] + ' · n ' + rs.length); }
    const b = await run('kickLuecke', 1), bs = b.events.filter(e => e.k === 'section');
    const B8 = barT(PT.kickLuecke, 8), brk = bs.find(e => e.r === 'break'), back = brk && bs.find(e => e.t > brk.t);
    check('Klangrollen 2: Kick fehlt 1 Takt: ak_section wird 1 (break) bis Ende des Takts + 1 Schlag, danach wieder 0 (kein drop)',
      brk && brk.t >= B8 && brk.t <= B8 + 5 * beatS && back && back.r === 'groove' && back.t <= B8 + 6 * beatS && b.sec[b.sec.length - 1] === 0 && !bs.some(e => e.r === 'drop'),
      'Takt 8 beginnt bei ' + B8.toFixed(2) + ' s, Abschnitte: ' + JSON.stringify(bs));
    // 3) Acid fehlt Takt 8-9 und kommt in Takt 10 wieder: acid_entry innerhalb 1 Takt
    const c = await run('acidNeu', 1); diag('acidNeu (Acid 0-7, 10-19; Pad 14-19)', c, PT.acidNeu); const ae = c.events.filter(e => e.k === 'entry' && e.r === 'acid'), B10 = barT(PT.acidNeu, 10);
    check('Klangrollen 3: neue 303 nach 2 Takten Pause: acid_entry innerhalb 1 Takt', ae.some(e => e.t >= B10 && e.t <= B10 + PT.acidNeu.barS), 'Takt 10 bei ' + B10.toFixed(2) + ' s, acid_entry: ' + JSON.stringify(ae));
    check('Klangrollen 3: kein falsches acid_entry, solange die 303 durchläuft', ae.filter(e => e.t > barT(PT.acidNeu, 1) && e.t < B10).length === 0, JSON.stringify(ae));
    const pe = c.events.filter(e => e.k === 'entry' && e.r === 'pads'), B14 = barT(PT.acidNeu, 14);
    const barMean = (R, P, r, b0, b1) => { const i0 = Math.round(barT(P, b0) * 60), i1 = Math.round(barT(P, b1) * 60); let x = 0; for (let i = i0; i < i1; i++) x += R.env[r][i]; return x / (i1 - i0); };
    const padOhne = barMean(c, PT.acidNeu, 'pads', 1, 14), padMit = barMean(c, PT.acidNeu, 'pads', 15, 20);
    check('Klangrollen 5: Pads trennen sich von der 303: ohne Pad (Takt 1-13, nur 303/Kick/Hats) pads_env im Mittel unter 0,25, mit Pad (Takt 15-19) über 0,6',
      padOhne < 0.25 && padMit > 0.6, 'ohne ' + padOhne.toFixed(3) + ' · mit ' + padMit.toFixed(3));
    check('Klangrollen 5: pads_entry erst, wenn das Pad kommt (innerhalb 2 Takte ab Takt 14), vorher nicht', pe.length >= 1 && pe[0].t >= B14 && pe[0].t <= B14 + 2 * PT.acidNeu.barS, JSON.stringify(pe));
    // 4) Lautstärke: derselbe Track voll und halb so laut: nach den ersten 30 s höchstens 10 % Unterschied in den env-Werten
    await page.evaluate(() => 0);
    const full = await run('t1', 1), half = await run('t1', 0.5), from = 30 * 60, diffs = {};
    for (const r of ['kick', 'acid', 'hats', 'pads']) { let d = 0, s = 0, mx = 0; for (let i = from; i < Math.min(full.env[r].length, half.env[r].length); i++) { const x = Math.abs(full.env[r][i] - half.env[r][i]); d += x; s += full.env[r][i]; if (x > mx) mx = x; } diffs[r] = { relativ: +(s ? d / s : 0).toFixed(4), maxAbs: +mx.toFixed(3) }; }
    check('Klangrollen 4: voll gegen halb so laut: env-Werte nach 30 s im Mittel höchstens 10 % verschieden (jede Rolle)', Object.values(diffs).every(x => x.relativ <= 0.10), JSON.stringify(diffs));
    const fs_ = full.events.filter(e => e.k === 'section').map(e => e.r + '@' + e.t.toFixed(1));
    console.log('       (Info) Standard-Track (Intro 8, Groove 16, Break 8 mit Aufbau, Drop 16, Outro 8 Takte; Takt 0 bei 0,35 s, 1,71 s pro Takt): ' + fs_.join(' '));
    check('Klangrollen (Zusatz): im Standard-Track wird der Drop nach dem 8-Takt-Break erkannt', fs_.some(x => /^drop@/.test(x)), fs_.join(' '));
    // Rechenzeit (Sandbox-Rechner, Software ohne Grafikkarte; das Handy ist anders schnell)
    const ms = Math.max(a.ms, b.ms, c.ms, full.ms);
    console.log('       (Info) Rechenzeit pro Bild: im Schnitt ' + ms.toFixed(3) + ' ms, Spitze ' + Math.max(a.msMax, full.msMax).toFixed(2) + ' ms (' + full.n + ' Bilder)');
    check('Klangrollen: Rechenzeit unter 1 ms pro Bild im Schnitt (Sandbox)', ms < 1, ms.toFixed(3) + ' ms');
    check('Klangrollen: keine Seitenfehler', errs.length === 0, errs.join(' | '));
    await close();
  },
  async klangrollen2() {
    // Ab Build 104: Fehlmessungen aus dem iPhone-Protokoll (Build 102, „Until The End“): Kick 184-248 Schläge/min bei 150 BPM, Pads immer 0,8.
    const { page, errs, close } = await open();
    const perBar = (R, P, key, b0, b1, src = 'env') => { const a = src === 'env' ? R.env[key] : R.xv[key]; if (!a) return null; const i0 = Math.round((P.bar0 + b0 * P.barS) * 60), i1 = Math.round((P.bar0 + b1 * P.barS) * 60); let x = 0; for (let i = i0; i < i1; i++) x += a[i] || 0; return +(x / (i1 - i0)).toFixed(3); };
    // 1) Rollende Bassline: mit Raster (Scan) zählen nur die Kicks auf den Schlägen
    const rb = await krRun(page, 'rollBass', 1, PT.rollBass), rbLive = await krRun(page, 'rollBass', 1);
    const perMin = R => { const h = R.hits.filter(x => x[0] > PT.rollBass.bar0 + 2 * PT.rollBass.barS); const dur = (PT.rollBass.bars - 2) * PT.rollBass.barS; return Math.round(h.length / dur * 60); };
    if (process.env.KR_DIAG) { const P = PT.rollBass, bs = P.barS / 4, ph = h => { const x = ((h[0] - 0.025 - P.bar0) / bs) % 1; return +(x > 0.5 ? x - 1 : x).toFixed(3); };
      console.log('       DIAG Kick-Treffer ohne Raster, Lage im Schlag (0 = auf dem Schlag, ±0,25 = Sechzehntel) [Lage, Anstieg, Stärke]: ' + JSON.stringify(rbLive.hits.slice(8, 40).map(h => [ph(h), h[1], h[2]])));
      console.log('       DIAG mit Raster: ' + JSON.stringify(rb.hits.slice(8, 30).map(h => [ph(h), h[1], h[2]]))); }
    console.log('       (Info) rollende Bassline: Kick-Schläge/min mit Raster ' + perMin(rb) + ', ohne Raster ' + perMin(rbLive) + ' (echt: 140)');
    check('Klangrollen 6: rollende Bassline zwischen den Kicks: mit Raster (Scan) 140 Kick-Schläge/min (±10 %), die Bass-Sechzehntel zählen nicht', Math.abs(perMin(rb) - 140) <= 14, 'mit Raster ' + perMin(rb) + ', ohne ' + perMin(rbLive));
    // 2) Dichter Klangteppich ohne gehaltene Töne: Pads niedrig; mit Pad hoch
    const pt = await krRun(page, 'padTeppich', 1, PT.padTeppich), P = PT.padTeppich;
    const ohne = perBar(pt, P, 'pads', 3, 10), mit = perBar(pt, P, 'pads', 12, 18);
    console.log('       (Info) Pads im dichten Teppich: ohne Pad ' + ohne + ', mit Pad ' + mit + (pt.xv.pads_pitch ? ' · pads_pitch ohne ' + perBar(pt, P, 'pads_pitch', 3, 10, 'x') + ', mit ' + perBar(pt, P, 'pads_pitch', 12, 18, 'x') : ''));
    if (process.env.KR_DIAG) for (const [nm, b0, b1] of [['padTeppich ohne', 3, 10], ['padTeppich mit', 12, 18]]) console.log('       DIAG Gehaltenheit ' + nm + ': ' + perBar(pt, P, 'held', b0, b1, 'x'));
    if (process.env.KR_DIAG) { const an = await krRun(page, 'acidNeu', 1, PT.acidNeu), kd = await krRun(page, 'kickDurch', 1, PT.kickDurch), t1 = await krRun(page, 't1', 1);
      console.log('       DIAG Gehaltenheit acidNeu ohne Pad (1-13) ' + perBar(an, PT.acidNeu, 'held', 1, 14, 'x') + ', mit Pad (15-19) ' + perBar(an, PT.acidNeu, 'held', 15, 20, 'x') + ' · kickDurch ' + perBar(kd, PT.kickDurch, 'held', 2, 30, 'x') + ' · pads_env acidNeu ohne ' + perBar(an, PT.acidNeu, 'pads', 1, 14) + ' mit ' + perBar(an, PT.acidNeu, 'pads', 15, 20) + ' · kickDurch ' + perBar(kd, PT.kickDurch, 'pads', 2, 30));
      const T1 = { bar0: 0.35, barS: 4 * 60 / 140 }; console.log('       DIAG Standard-Track (Intro 0-7, Groove 8-23, Break 24-31, Drop 32-47): Gehaltenheit ' + [[0, 8], [8, 24], [24, 32], [32, 48]].map(([a, b]) => perBar(t1, T1, 'held', a, b, 'x')).join(' / ') + ' · pads_env ' + [[0, 8], [8, 24], [24, 32], [32, 48]].map(([a, b]) => perBar(t1, T1, 'pads', a, b)).join(' / ')); }
    check('Klangrollen 7: dichter Klangteppich ohne gehaltene Töne: pads_env im Mittel unter 0,3, mit Pad über 0,6', ohne < 0.3 && mit > 0.6, 'ohne ' + ohne + ' · mit ' + mit);
    // 3) pads_pitch: tiefer Pad düster (unter 0,45), hoher Pad hell (mindestens 0,3 höher); danach ohne Pads langsam zurück zur Mitte, ohne Sprung
    const ph = await krRun(page, 'padHoch', 1, PT.padHoch), Q = PT.padHoch, xp = ph.xv.pads_pitch;
    const tief = perBar(ph, Q, 'pads_pitch', 4, 8, 'x'), hoch = perBar(ph, Q, 'pads_pitch', 12, 16, 'x');
    const i16 = Math.round((Q.bar0 + 16 * Q.barS) * 60), i17 = Math.round((Q.bar0 + 17 * Q.barS) * 60), iEnd = xp.length - 1;
    let sprung = 0; for (let i = i16; i < iEnd; i++) sprung = Math.max(sprung, Math.abs(xp[i + 1] - xp[i]));
    console.log('       (Info) pads_pitch tiefer Pad ' + tief + ', hoher Pad ' + hoch + ' · nach dem Pad: 1 Takt später ' + xp[i17].toFixed(3) + ', am Ende ' + xp[iEnd].toFixed(3) + ' (Mitte 0,5) · pads_env ohne Pad ' + perBar(ph, Q, 'pads', 20, 26));
    check('pads_pitch: tiefer Pad düster (unter 0,45), hoher Pad hell (mindestens 0,3 höher)', tief < 0.45 && hoch - tief >= 0.3, 'tief ' + tief + ' · hoch ' + hoch);
    check('pads_pitch: ohne Pads hält er den letzten Wert und gleitet langsam zur Mitte (1 Takt danach noch nah am hohen Wert, am Ende näher an 0,5, kein Sprung über 0,01 pro Bild)',
      Math.abs(xp[i17] - hoch) < 0.15 && Math.abs(xp[iEnd] - 0.5) < Math.abs(xp[i17] - 0.5) && sprung < 0.01, JSON.stringify({ einTakt: xp[i17], ende: xp[iEnd], sprung }));
    // 4) hats_density: nur Offbeat ca. 0,25, jede Sechzehntel nahe 1
    const hd = await krRun(page, 'hatsDicht', 1, PT.hatsDicht), dOff = perBar(hd, PT.hatsDicht, 'hats_density', 3, 8, 'x'), d16 = perBar(hd, PT.hatsDicht, 'hats_density', 11, 16, 'x');
    console.log('       (Info) hats_density: Offbeat-Hats ' + dOff + ', Sechzehntel-Hats ' + d16);
    check('hats_density: Hats nur auf dem Offbeat 0,2-0,45, auf jeder Sechzehntel über 0,7', dOff >= 0.2 && dOff <= 0.45 && d16 > 0.7, 'Offbeat ' + dOff + ' · 16tel ' + d16);
    // 6) Stereo: Hats mittig (Takt 2-7), dann Ping-Pong links/rechts 1, 2, 4 pro Schlag. ak_pan wechselt mit, ak_pan_speed steigt mit dem Tempo, ak_width hoch
    const pg = await krRun(page, 'pingPong', 1, PT.pingPong), G = PT.pingPong, xs = (k, a, b) => perBar(pg, G, k, a, b, 'x');
    const seg = (a, b) => { const i0 = Math.round((G.bar0 + a * G.barS) * 60), i1 = Math.round((G.bar0 + b * G.barS) * 60), v = pg.xv.ak_pan.slice(i0, i1); return { min: Math.min(...v), max: Math.max(...v) }; };
    const mi = { pan: xs('ak_pan_speed', 3, 8), w: xs('ak_width', 3, 8) }, p1 = xs('ak_pan_speed', 11, 16), p2 = xs('ak_pan_speed', 19, 24), p4 = xs('ak_pan_speed', 27, 32), wP = xs('ak_width', 11, 32), sg = seg(11, 32), sm = seg(3, 8);
    console.log('       (Info) Stereo: Wechsel-Tempo mittig ' + mi.pan + ', Ping-Pong 1/Schlag ' + p1 + ', 2/Schlag ' + p2 + ', 4/Schlag ' + p4 + ' (Soll 0 / 0,25 / 0,5 / 1) · Breite mittig ' + mi.w + ', Ping-Pong ' + wP + ' · Position mittig ' + sm.min.toFixed(2) + '..' + sm.max.toFixed(2) + ', Ping-Pong ' + sg.min.toFixed(2) + '..' + sg.max.toFixed(2));
    if (process.env.KR_DIAG) { const i0 = Math.round((G.bar0 + 11 * G.barS) * 60); console.log('       DIAG Wechsel in Takt 11-15 (Soll 4 pro Takt): ' + pg.events.length); console.log('       DIAG pan Takt 11-12 (jedes 4. Bild): ' + pg.xv.ak_pan.slice(i0, i0 + 200).filter((_, i) => i % 4 === 0).map(v => v.toFixed(2)).join(' ')); console.log('       DIAG width: ' + pg.xv.ak_width.slice(i0, i0 + 200).filter((_, i) => i % 8 === 0).map(v => v.toFixed(2)).join(' ')); }
    check('Stereo: Hats in der Mitte: ak_pan bleibt nahe 0 (zwischen -0,2 und 0,2), Breite unter 0,2, kein Wechsel-Tempo (unter 0,05)', sm.min > -0.2 && sm.max < 0.2 && mi.w < 0.2 && mi.pan < 0.05, JSON.stringify({ sm, mi }));
    check('Stereo: Ping-Pong hart links/rechts: ak_pan schlägt auf beide Seiten aus (unter -0,6 und über +0,6), Breite über 0,7', sg.min < -0.6 && sg.max > 0.6 && wP > 0.7, JSON.stringify({ sg, wP }));
    check('Stereo: ak_pan_speed steigt mit dem Tempo des Ping-Pong und liegt nahe am Soll (0,25 / 0,5 / 1, jeweils ±0,15)', Math.abs(p1 - 0.25) <= 0.15 && Math.abs(p2 - 0.5) <= 0.15 && p4 >= 0.85 && p1 < p2 && p2 < p4, JSON.stringify({ p1, p2, p4 }));
    // 5) acid_reso: 303 mit hoher Resonanz (Standard-Track, Groove/Drop, Q 4) schärfer als die weichen Töne im Break (Q 1,5); ohne Acid 0
    const t1 = await krRun(page, 't1', 1), T1 = { bar0: 0.35, barS: 4 * 60 / 140 };
    const rIntro = perBar(t1, T1, 'acid_reso', 1, 7, 'x'), rBreak = perBar(t1, T1, 'acid_reso', 25, 31, 'x'), rDrop = perBar(t1, T1, 'acid_reso', 33, 47, 'x');
    console.log('       (Info) acid_reso: Intro (keine 303) ' + rIntro + ', Break (weiche Töne) ' + rBreak + ', Drop (303, hohe Resonanz) ' + rDrop);
    check('acid_reso: 303 mit hoher Resonanz deutlich schärfer (mindestens 0,15 mehr) als die weichen Töne im Break, ohne Acid nahe 0', rDrop - rBreak >= 0.15 && rIntro < 0.1, 'Intro ' + rIntro + ' · Break ' + rBreak + ' · Drop ' + rDrop);
    check('Klangrollen 6/7: keine Seitenfehler', errs.length === 0, errs.join(' | '));
    await close();
  },
  async klangrollenLive() {
    // Live-Weg: echter Track läuft in Echtzeit, rollenFrame() in der Schleife gibt jedes Bild alle 41 Werte an viz.setExtraVars
    const { page, errs, close } = await open();
    await page.setInputFiles('#fileIn', [T[0]]);
    await page.waitForFunction(() => !audio.paused && audio.currentTime > 0.5, null, { timeout: 180000 });
    await page.evaluate(() => { audio.currentTime = 20; });              // mitten in den Groove (ab Takt 8 läuft der Kick)
    await page.waitForTimeout(9000);
    const r = await page.evaluate(() => ({ calls: window.__akSet || 0, keys: window.__akLast ? Object.keys(window.__akLast).length : 0, bpm: AKV.ak_bpm, kick: AK.R.kick.nEntry, env: AKV.kick_env, maxRef: AK.R.kick.ref > 0,
      ms: akN ? akMs / akN : null, fehler: LOG.filter(l => l.k === 'x').map(l => l.x), dbg: !!$('akDbgBtn') }));
    check('Klangrollen live: setExtraVars bekommt jedes Bild alle 41 Werte, Tempo um 140, Kick erkannt, keine Fehler', r.calls > 100 && r.keys === 41 && Math.abs(r.bpm - 140) <= 2 && r.kick >= 1 && r.fehler.length === 0 && errs.length === 0, JSON.stringify(r) + errs.join(' | '));
    const d = await page.evaluate(async () => { $('fineBtn').click(); $('werkBtn').click(); $('akDbgBtn').click(); await new Promise(r => setTimeout(r, 300)); const el = $('akDebug'); return { an: !!el && !el.hidden, text: el ? el.textContent : '', schalter: document.querySelectorAll('#werk button[id^="t-"]').length }; });
    // Mit Scan kommt der Abschnitt aus dem Scan: in einen Break und an einen Drop-Anfang springen
    await page.waitForFunction(() => curAnalysis && curAnalysis.beatS && scanActive(), null, { timeout: 120000, polling: 200 });
    const sc = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms)), S = curAnalysis.sections, out = {};
      for (const [ty, want] of [['break', 1], ['drop', 3], ['groove', 0]]) {
        const br = S.find(x => x.type === 'break' && x.t1 - x.t0 > 4);   // Drop und Groove: die nach dem Break (der erste „Drop“ ist der Kick-Einsatz nach dem Intro)
        const s = ty === 'break' ? br : S.find(x => x.type === ty && x.t1 - x.t0 > 4 && (!br || x.t0 >= br.t0)); if (!s) { out[ty] = 'fehlt'; continue; }
        audio.currentTime = s.t0 + 0.6; await w(900); out[ty] = { erwartet: want, ak_section: AKV.ak_section, phrase: +AKV.ak_phrase.toFixed(3), drop: +AKV.ak_drop_strength.toFixed(3), build: +AKV.ak_build_strength.toFixed(3) };
      }
      return out;
    });
    check('Klangrollen mit Scan: ak_section folgt dem Scan (break 1, drop 3, groove 0), Phrase zählt ab Abschnittsbeginn', ['break', 'drop', 'groove'].every(k => sc[k] && sc[k].ak_section === sc[k].erwartet && sc[k].phrase < 0.1), JSON.stringify(sc));
    check('ak_drop_strength: schon im Break vor dem Drop die Stärke des kommenden Drops (über 0), im Drop dieselbe (gleicher Wert ±0,02)', sc.drop && sc.drop.drop > 0 && sc.break && sc.break.drop > 0 && Math.abs(sc.break.drop - sc.drop.drop) < 0.02, JSON.stringify(sc));
    const ml = await page.evaluate(() => { akM.n = 1800; akM.t = 1; akMeasure(1e6); return LOG.map(l => l.x).filter(x => /Klangrollen-Messung/.test(x)).pop() || ''; });
    check('Klangrollen-Messzeile: enthält Pads-Gehaltenheit, Stereo und die Lage der Kick-Treffer am Raster', /Gehaltenheit/.test(ml) && /Stereo: \|Position\|/.test(ml) && /Kick-Treffer am Raster: \d+ von \d+/.test(ml), ml.slice(-260));
    check('Klangrollen-Anzeige: Knopf in der Werkstatt schaltet sie an (Balken, BPM, Abschnitt); die 16 Schalter bleiben 16', d.an && /BPM/.test(d.text) && d.schalter === 16, JSON.stringify(d));
    await close();
  },
  async schaltzentrale() {
    // Schaltzentrale 3a: Raum (Ping-Pong schiebt und verzieht das Bild, Mono nicht), Regler, flackerfrei, Dirigent (gemessener Aufbau, Drop-Wucht)
    const { page, errs, close } = await open();
    await page.setInputFiles('#fileIn', [path.join(tmp, 'pingPong.wav')]);
    await page.waitForFunction(() => !audio.paused && audio.currentTime > 0.5, null, { timeout: 180000, polling: 200 });
    await page.evaluate(() => { audio.currentTime = 24; }); await page.waitForTimeout(3500);
    const run = ms => page.evaluate(ms => new Promise(res => { const o = { x: [], k: [], act: [], tr: 0, dx: 0, dk: 0, db: 0 }, H = []; const t0 = performance.now();
      const step = () => { const s = window.__SZ, now = performance.now(); o.x.push(s.x); o.k.push(s.skew); o.act.push(s.act); if (/skewX/.test(canvas.style.transform)) o.tr++;
        H.push([now, s.x, s.skew, s.bright]); while (H.length > 1 && now - H[1][0] >= 120) H.shift();   // Änderung über ein Fenster von mindestens 120 ms (bildratenunabhängig, ohne Zählfehler durch versetzte Bilder)
        if (now - H[0][0] >= 120) { const ds = (now - H[0][0]) / 1000; o.dx = Math.max(o.dx, Math.abs(s.x - H[0][1]) / ds); o.dk = Math.max(o.dk, Math.abs(s.skew - H[0][2]) / ds); o.db = Math.max(o.db, Math.abs(s.bright - H[0][3]) / ds); }
        if (now - t0 < ms) requestAnimationFrame(step); else res(o); }; requestAnimationFrame(step); }), ms);
    const A = await run(4000), mx = a => Math.max(...a.map(Math.abs));
    console.log('       (Info) Raum bei Ping-Pong: Aktivität bis ' + mx(A.act).toFixed(2) + ', Verschiebung bis ' + mx(A.x).toFixed(2) + ' %, Verzerrung bis ' + mx(A.k).toFixed(2) + '°, Bilder mit skewX ' + A.tr + ' von ' + A.x.length + ' · größte Änderung pro Sekunde (über 120 ms): ' + A.dx.toFixed(2) + ' % / ' + A.dk.toFixed(2) + '°');
    check('Schaltzentrale Raum: Ping-Pong schiebt das Bild (Verschiebung über 0,3 %) und verzieht es (skewX im Transform), Grenzen eingehalten (höchstens 1,3 % und 1,0°)', mx(A.x) > 0.3 && A.tr > 10 && mx(A.x) <= 1.31 && mx(A.k) <= 1.01, JSON.stringify({ x: mx(A.x), k: mx(A.k), tr: A.tr }));
    check('Schaltzentrale flackerfrei: größte Änderung pro Sekunde höchstens 9 % Verschiebung und 7° Verzerrung (gemessen über 120 ms, bei jeder Bildrate)', A.dx <= 9 && A.dk <= 7, JSON.stringify({ dx: A.dx, dk: A.dk }));
    await page.evaluate(() => { const r = document.getElementById('sz-raum'); r.value = '0'; r.dispatchEvent(new Event('input')); }); await page.waitForTimeout(3000);
    const Z = await run(1500), saved = await page.evaluate(() => store.get('sz-gain', null));
    check('Schaltzentrale Regler: „Raum“ auf 0 stellt die Ebene ab (keine Verschiebung, kein skewX), der Wert wird unter nmd: gespeichert', mx(Z.x) < 0.001 && Z.tr === 0 && saved && saved.raum === 0 && !!localStorage_nmd(saved), JSON.stringify({ x: mx(Z.x), tr: Z.tr, saved }));
    check('Schaltzentrale: keine Seitenfehler', errs.length === 0, errs.join(' | '));
    await close();
    // Mono-Track: Raum bleibt aus; Dirigent: gemessener Aufbau vor dem Drop
    const m = await open();
    await m.page.setInputFiles('#fileIn', [T[0]]);
    await m.page.waitForFunction(() => !audio.paused && curAnalysis && curAnalysis.aufbau, null, { timeout: 180000, polling: 200 });
    await m.page.evaluate(() => { audio.currentTime = 20; }); await m.page.waitForTimeout(3000);
    const mono = await run2(m.page, 3000);
    check('Schaltzentrale Raum: Mono-Track bleibt ohne Raum-Bewegung (Aktivität unter 0,15, kein skewX)', mono.act < 0.15 && mono.tr < 5, JSON.stringify(mono));
    const D = await m.page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms)), dr = curAnalysis.aufbau.drops[0], out = {};
      if (!dr) return { keinDrop: true };
      const B = curAnalysis.aufbau, mid = B.t0 + (dr.buildFrom >= 0 ? dr.buildFrom + 0.7 * (dr.bar - dr.buildFrom) : dr.bar - 2) * B.barS;
      out.drop = { bar: dr.bar, buildFrom: dr.buildFrom, buildBars: dr.buildBars };
      const g = window.__SZ.gain.dirigent, seek = () => { audio.currentTime = Math.max(0, mid); };
      window.__SZ.gain.dirigent = 0; seek(); await w(700); out.altDirigentAus = +dropPre.toFixed(2); window.__SZ.gain.dirigent = g;   // Regler auf 0: alte feste Regel
      seek(); await w(1000);
      out.vorDrop = { dropPre: +dropPre.toFixed(2), build: +AKV.ak_build_strength.toFixed(2), log: LOG.some(l => /Aufbau \(gemessen\)/.test(l.x)), bit: +window.__SZ.bit.toFixed(3) };
      audio.currentTime = B.t0 + (dr.bar + 1) * B.barS; await w(1500); out.imDrop = +AKV.ak_drop_strength.toFixed(2); out.strength = dr.strength; out.bitDrop = +window.__SZ.bitDrop.toFixed(3); out.bitImDrop = +window.__SZ.bit.toFixed(3);
      { const sd = []; let ohneSaat = 0, prev = null; const t0 = performance.now(); while (performance.now() - t0 < 2000) { const st = szStage(), v = st[7]; if (!sd.length || sd[sd.length - 1] !== v) sd.push(v); else if (prev !== null && st[3] !== prev) ohneSaat++; prev = st[3]; await new Promise(r => requestAnimationFrame(r)); }
        out.saatWechselIn2s = sd.length - 1; out.bitWechselOhneSaat = ohneSaat; }
      const gb = window.__SZ.gain.bit; window.__SZ.gain.bit = 0; await w(3000); out.bitAus = szStage()[3]; window.__SZ.gain.bit = gb;
      return out;
    });
    console.log('       (Info) Dirigent: ' + JSON.stringify(D));
    check('Schaltzentrale Bit-Salat: im Aufbau an (über 0,05), am Drop ein Stoß (bitDrop über 0,2), neue Muster höchstens 3 pro Sekunde (in 2 s höchstens 7 Saat-Wechsel, die Stärke ändert sich nur zusammen mit der Saat), Regler „Bit-Salat“ auf 0 = Stufe nach weichem Ausblenden (3 s) aus (genau 0)', !D.keinDrop && D.vorDrop.bit > 0.05 && D.bitDrop > 0.2 && D.bitImDrop > 0.05 && D.saatWechselIn2s <= 7 && D.bitWechselOhneSaat === 0 && D.bitAus === 0, JSON.stringify(D));
    { const e = await m.page.evaluate(() => { // Einsatz-Akzente: szEntry meldet einen Einsatz genau einmal pro Anstieg über SZCFG.entry
        const o = AKV.acid_entry, p = SZ.ePrev.acid; SZ.ePrev.acid = 0; AKV.acid_entry = 1; const a = szEntry('acid'), b = szEntry('acid'); AKV.acid_entry = 0; const c = szEntry('acid'); AKV.acid_entry = 1; const d = szEntry('acid');
        AKV.acid_entry = o; SZ.ePrev.acid = p; return { a, b, c, d }; });
      check('Schaltzentrale Akzente: ein Einsatz (R_entry über 0,8) zählt genau einmal pro Anstieg', e.a && !e.b && !e.c && e.d, JSON.stringify(e)); }
    check('Schaltzentrale Dirigent: vor dem Drop ist dropPre gleich der gemessenen Aufbau-Stärke (statt fester 8 Takte), im Drop ak_drop_strength = Stärke aus dem Detektor; mit Regler „Dirigent“ auf 0 gilt wieder die alte feste Regel (dropPre über 0,05)', !D.keinDrop && D.vorDrop.dropPre > 0.05 && Math.abs(D.vorDrop.dropPre - D.vorDrop.build) < 0.1 && Math.abs(D.imDrop - D.strength) < 0.02 && D.altDirigentAus > 0.05, JSON.stringify(D));
    { const k = await m.page.evaluate(() => { // Kick-Ebene: Drehen im Takt wechselt die Richtung mit jeder Takt-Eins, Regler 0 = aus, Break leiser, Acid dreht weniger
        const g0 = SZ.gain.kick, on0 = SZ.on, out = {}; SZ.on = true; toggles.mix = true;
        const mk = () => ({ v: 0 }); const a = mk(), b = mk(), c = mk(), wR = 3;
        SZ.gain.kick = 1; szKickRot(a, 1, wR, true); const d1 = a.v; szKickRot(a, 1, wR, false); szKickRot(b, 1, wR, true); const d2 = b.v - 0;   // zweiter Takt: andere Richtung
        out.richtung = d1 * (a.v - d1 > 0 ? 1 : -1) > 0 && Math.sign(d1) === Math.sign(a.v - d1) && Math.sign(d1) !== Math.sign(d2);
        out.groesse = Math.abs(d1) <= SZCFG.kickRot * wR * 1.001;
        SZ.gain.kick = 0; szKickRot(c, 1, wR, false); out.aus = c.v === 0 && szAcidRot() === 1;
        SZ.gain.kick = 1; out.acid = Math.abs(szAcidRot() - (1 - SZCFG.acidRotShare)) < 1e-9;
        SZ.kickS = SZCFG.kickBreak; out.break = Math.abs(szKickAmp() - SZCFG.kickBreak) < 1e-9; SZ.kickS = 1; out.normal = szKickAmp() === 1;
        SZ.gain.kick = g0; SZ.on = on0; return out; });
      check('Schaltzentrale Kick-Ebene: Drehen im Takt (Richtung wechselt je Takt, begrenzt), Regler 0 = aus, Acid dreht weniger, Break leiser', k.richtung && k.groesse && k.aus && k.acid && k.break && k.normal, JSON.stringify(k)); }
    check('Schaltzentrale: keine Seitenfehler (Mono-Track)', m.errs.length === 0, m.errs.join(' | '));
    await m.close();
    // Breit, aber mittig (wie der iPhone-Track mit Breite 0,75 und Wechsel-Tempo 0): Breite hoch, aber die Raum-Ebene bleibt aus
    const w = await open();
    await w.page.setInputFiles('#fileIn', [path.join(tmp, 'breitMitte.wav')]);
    await w.page.waitForFunction(() => !audio.paused && audio.currentTime > 0.5, null, { timeout: 180000, polling: 200 });
    await w.page.evaluate(() => { audio.currentTime = 8; }); await w.page.waitForTimeout(3500);
    const wb = await w.page.evaluate(ms => new Promise(res => { const o = { act: 0, wid: 0, tr: 0 }; const t0 = performance.now(); const step = () => { o.act = Math.max(o.act, window.__SZ.act); o.wid = Math.max(o.wid, AKV.ak_width); if (/skewX/.test(canvas.style.transform)) o.tr++; if (performance.now() - t0 < ms) requestAnimationFrame(step); else res(o); }; requestAnimationFrame(step); }), 4000);
    console.log('       (Info) breit, aber mittig: Breite bis ' + wb.wid.toFixed(2) + ', Raum-Aktivität bis ' + wb.act.toFixed(2));
    check('Schaltzentrale Raum: breites, aber mittiges Stereobild (Breite über 0,5) löst keine Raum-Bewegung aus (Aktivität unter 0,2, kaum skewX)', wb.wid > 0.5 && wb.act < 0.2 && wb.tr < 20, JSON.stringify(wb));
    await w.close();
  },
  async stereoLive() {
    // Live-Weg mit zwei Analysern (Splitter): Ping-Pong-Track in Echtzeit, ak_pan muss auf beide Seiten ausschlagen, ak_pan_speed über 0; der Mono-Track (t1) bleibt bei Position 0
    const { page, errs, close } = await open();
    const sample = ms => page.evaluate(ms => new Promise(res => { const v = { pan: [], sp: [], w: [], hs: [] }; const t0 = performance.now(); const iv = setInterval(() => { v.hs.push(AKSIDE.hats_side); v.pan.push(AKV.ak_pan); v.sp.push(AKV.ak_pan_speed); v.w.push(AKV.ak_width); if (performance.now() - t0 > ms) { clearInterval(iv); res(v); } }, 40); }), ms);
    const sum = v => ({ min: +Math.min(...v.pan).toFixed(2), max: +Math.max(...v.pan).toFixed(2), sp: +(v.sp.reduce((a, b) => a + b, 0) / v.sp.length).toFixed(2), w: +(v.w.reduce((a, b) => a + b, 0) / v.w.length).toFixed(2), hsMin: +Math.min(...v.hs).toFixed(2), hsMax: +Math.max(...v.hs).toFixed(2) });
    await page.setInputFiles('#fileIn', [path.join(tmp, 'pingPong.wav')]);
    await page.waitForFunction(() => !audio.paused && audio.currentTime > 0.5, null, { timeout: 180000, polling: 200 });
    await page.evaluate(() => { audio.currentTime = 12; }); await page.waitForTimeout(2500);    // Ping-Pong 1/Schlag
    const a = sum(await sample(5000));
    await page.evaluate(() => { audio.currentTime = 22; }); await page.waitForTimeout(2500);   // Ping-Pong 2/Schlag
    const b2 = sum(await sample(5000));
    console.log('       (Info) Stereo live: Ping-Pong 1/Schlag ' + JSON.stringify(a) + ' · 2/Schlag ' + JSON.stringify(b2));
    check('Stereo live (zwei Analyser): Ping-Pong schlägt auf beide Seiten aus (unter -0,4 und über +0,4), Wechsel-Tempo über 0,05 und mit 2/Schlag höher als mit 1/Schlag (genaue Zahlen: Offline-Prüfung, Echtzeit hängt an der Bildrate des Rechners)', a.min < -0.4 && a.max > 0.4 && a.sp > 0.05 && b2.sp > a.sp, JSON.stringify({ a, b2 }));
    check('Seiten-Funken live: hats_side zeigt beim Ping-Pong auf beide Seiten (unter -0,5 und über +0,5), nie außerhalb von ±1', a.hsMin < -0.5 && a.hsMax > 0.5 && a.hsMin >= -1 && a.hsMax <= 1, JSON.stringify({ a }));
    { const q = await page.evaluate(() => { // Funken auf der Seite des Treffers: hats_side festhalten, Hats-Treffer auslösen, Lage der neuen Funken messen
        const old = AKSIDE.hats_side, w = fxc.width, res = {}; toggles.spark = true;
        for (const sd of [-1, 1, 0]) { sparks.length = 0; MX.konto = 1; AKSIDE.hats_side = sd; for (let i = 0; i < 20; i++) { onHat(1); if (sparks.length > 100) break; }
          const xs = sparks.map(s => s.x / w); res[sd] = { n: xs.length, links: xs.filter(x => x < 0.5).length, rechts: xs.filter(x => x >= 0.5).length }; }
        sparks.length = 0; AKSIDE.hats_side = old; return res; });
      check('Seiten-Funken: Treffer links erzeugt nur Funken in der linken Bildhälfte, rechts nur rechts, Mitte verteilt auf beide', q[-1].n > 0 && q[-1].rechts === 0 && q[1].n > 0 && q[1].links === 0 && q[0].links > 0 && q[0].rechts > 0, JSON.stringify(q)); }
    await close();
    const m = await open();
    await m.page.setInputFiles('#fileIn', [T[0]]);
    await m.page.waitForFunction(() => !audio.paused && audio.currentTime > 0.5, null, { timeout: 180000, polling: 200 });
    await m.page.evaluate(() => { audio.currentTime = 20; }); await m.page.waitForTimeout(2500);
    const c = await m.page.evaluate(ms => new Promise(res => { const v = []; const t0 = performance.now(); const iv = setInterval(() => { v.push(Math.abs(AKV.ak_pan)); if (performance.now() - t0 > ms) { clearInterval(iv); res({ max: +Math.max(...v).toFixed(2), w: +AKV.ak_width.toFixed(2) }); } }, 40); }), 4000);
    check('Stereo live: Mono-Track (Test-Track): Position bleibt in der Mitte (unter 0,25), Breite unter 0,25', c.max < 0.25 && c.w < 0.25, JSON.stringify(c));
    check('Stereo live: keine Seitenfehler', errs.length === 0 && m.errs.length === 0, errs.concat(m.errs).join(' | '));
    await m.close();
  },
  async echtbutterchurn() {
    // Mit der echten Butterchurn-Kopie (vendor/) statt Attrappe: Start, Presets, die neuen Werte kommen im Renderer an
    const { page, errs, close } = await open({ real: true });
    await page.setInputFiles('#fileIn', [T[0]]);
    await page.waitForFunction(() => !audio.paused && audio.currentTime > 0.5, null, { timeout: 180000 });
    await page.evaluate(() => { audio.currentTime = 20; });
    await page.waitForTimeout(6000);
    const r = await page.evaluate(() => ({ step: window.__AM_STEP, presets: names.length, ext: viz && viz.renderer && viz.renderer.extraVars ? Object.keys(viz.renderer.extraVars).length : 0,
      bpm: viz && viz.renderer.extraVars.ak_bpm, kick: viz && viz.renderer.extraVars.kick_env, gl2: webgl2Ok(), cur: curName, fehler: LOG.filter(l => l.k === 'x').map(l => l.x) }));
    check('Echte Butterchurn-Kopie: startet bis Teil 16, 372 Presets (367 + 5 eigene), Werte kommen im Renderer an, keine Fehler', r.step === 16 && r.presets === 372 && r.ext === 41 && r.bpm > 0 && r.gl2 && r.fehler.length === 0 && errs.length === 0, JSON.stringify(r) + errs.join(' | '));
    { const q = await page.evaluate(async () => { // AK-PATCH 10: Endstufe. Werte kommen im Comp-Shader an, Shader übersetzt ohne Fehler, Stärke 0 ändert das Bild nicht
        const R = viz.renderer, gl = R.gl, cs = R.compShader, out = {}; if (!viz.setAkStage || !cs || !cs.akStageLocs) return { fehlt: true };
        const px = () => { viz.render(); const u = new Uint8Array(4 * 16 * 16); gl.readPixels(0, 0, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, u); return u; };
        const err0 = gl.getError(); viz.setAkStage([0.8, 0.3, 0.5, 0, 0.7, 0.8, -0.5, 5]); viz.render(); const got = gl.getUniform(cs.shaderProgram, cs.akStageLocs[0]), got2 = gl.getUniform(cs.shaderProgram, cs.akStageLocs[1]);
        out.a = Array.from(got).map(x => +x.toFixed(2)); out.b = Array.from(got2).map(x => +x.toFixed(2)); out.glFehler = gl.getError() - 0 + err0;
        const df = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return d / a.length; }, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, rd = () => { const u = new Uint8Array(4 * W * H); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, u); return u; };
        const Z = [0, 0, 0, 0, 0, 0, 0, 0]; viz.setOutputAA(true); viz.setAkStage(Z); viz.render(); const tex = R.compTexture, again = () => { gl.bindFramebuffer(gl.FRAMEBUFFER, null); R.outputShader.renderQuadTexture(tex); return rd(); };
        const z1 = again(), z2 = again(); viz.setAkStage([0.9, 0.3, 0.8, 0, 0, 0, 0, 5]); const s1 = again();
        viz.setAkStage([0, 0, 0, 0, 0, 0, -0.6, 5]); const b0 = again(); viz.setAkStage([0, 0, 0, 0.8, 0, 0, -0.6, 5]); const b1 = again(), b2 = again(); viz.setAkStage([0, 0, 0, 0.8, 0, 0, -0.6, 6]); const b3 = again();
        viz.setAkStage(Z); viz.setOutputAA(false);
        const mean = u => { let m = 0; for (let i = 0; i < u.length; i += 4) m += (u[i] + u[i + 1] + u[i + 2]) / 3; return m / (u.length / 4); };
        out.diffNull = +df(z1, z2).toFixed(3); out.diffAcid = +df(z2, s1).toFixed(3); out.diffHats = 0;
        out.bitNullSeite = +df(z2, b0).toFixed(3); out.diffBit = +df(z2, b1).toFixed(3); out.bitGleicheSaat = +df(b1, b2).toFixed(3); out.bitNeueSaat = +df(b1, b3).toFixed(3); out.bitHell = +(mean(b1) - mean(z2)).toFixed(2);
        viz.setAkStage([0, 0, 0, 0, 0, 0, 0, 0]); viz.render(); out.null = Array.from(gl.getUniform(cs.shaderProgram, cs.akStageLocs[0])).every(x => x === 0) && Array.from(gl.getUniform(cs.shaderProgram, cs.akStageLocs[1])).every(x => x === 0);
        return out; });
      console.log('       (Info) Endstufe: ' + JSON.stringify(q));
      check('Echte Butterchurn-Kopie, Bit-Salat (AK-PATCH 11): Stärke 0 = Ausgabe bit-gleich (auch mit gesetzter Seite und Saat), Stärke 0,8 verändert das Bild sichtbar, gleiche Saat = gleiches Bild (kein Flackern ohne Saat-Wechsel), neue Saat = neues Muster, mittlere Helligkeit bleibt (höchstens ±6 von 255)', !q.fehlt && q.bitNullSeite === 0 && q.diffBit > 0.3 && q.bitGleicheSaat === 0 && q.bitNeueSaat > 0.1 && Math.abs(q.bitHell) <= 6, JSON.stringify(q));
    check('Echte Butterchurn-Kopie, Endstufe (AK-PATCH 10): setAkStage kommt im Comp-Shader an (akfx_a/akfx_b), kein GL-Fehler, mit 0 sind alle Blöcke aus, derselbe Bildinhalt zweimal ausgegeben ist bit-gleich, die Acid-Verzerrung im Ausgabe-Durchgang verändert ihn sichtbar', !q.fehlt && q.a && q.a[0] === 0.8 && q.a[1] === 0.3 && q.b[0] === 0.7 && q.b[2] === -0.5 && q.glFehler === 0 && q.null && q.diffNull === 0 && q.diffAcid > 0.3, JSON.stringify(q)); }
    await close();
  },
  async manifest() {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
    const miss = m.icons.map(i => i.src).concat(['icon-180.png']).filter(f => !fs.existsSync(path.join(ROOT, f)));
    check('Manifest: Name, Startseite und alle Icons vorhanden', m.name && m.start_url && miss.length === 0, miss.join(','));
  }
};

(async () => {
  const want = process.argv[2] ? process.argv[2].split(',') : Object.keys(SZ);
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'acid-test-'));
  T = ['t1', 't2', 't3', 't4', 't5'].map(n => path.join(tmp, n + '.wav'));
  makeTrack(T[0], 1); for (const f of T.slice(1)) fs.copyFileSync(T[0], f);
  if (want.includes('hintergrund')) { TL = path.join(tmp, 'lang.wav'); makeTrack(TL, 4); }
  if (want.some(w => /^(klangrollen2?|stereoLive|schaltzentrale|klangrollenLive)$/.test(w))) { for (const k in PLANS) PT[k] = makePlanTrack(path.join(tmp, k + '.wav'), PLANS[k]()); }
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined,
    args: [...(process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : []), '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const n of want) {
    if (!SZ[n]) { console.error('Unbekanntes Szenario: ' + n + ' (gibt es: ' + Object.keys(SZ).join(', ') + ')'); process.exitCode = 2; continue; }
    console.log('\n' + n);
    try { await SZ[n](); } catch (e) { check(n + ': Prüfung lief durch', false, e.message.split('\n')[0]); }
  }
  await browser.close(); server.close();
  if (!process.env.KEEP) fs.rmSync(tmp, { recursive: true, force: true });
  const bad = results.filter(r => !r.ok);
  console.log('\n' + (results.length - bad.length) + ' von ' + results.length + ' Prüfungen bestanden' + (bad.length ? ', ' + bad.length + ' fehlgeschlagen' : '') + '.');
  process.exit(bad.length ? 1 : (process.exitCode || 0));
})();
