// Browser-Prüfung ohne Internet: startet die App in Chromium (Playwright), ersetzt Butterchurn und die Schriften durch Attrappen,
// lädt echte Audiodateien über das Dateifeld und prüft Start, Bedienung, Shader, Scan, Warteschlange, Grafik-Verlust, Mikrofon, Sicherung und Offline-Betrieb.
// Die Seite wird wie auf GitHub Pages unter /Acid/ ausgeliefert.
//
// Aufruf:   node test/browser.js [Szenario,Szenario,...]
// Braucht:  npm i playwright && npx playwright install chromium      (läuft nicht in der GitHub-Aktion, nur von Hand)
// Umgebung: PLAYWRIGHT_MODULE (Pfad zu playwright, falls nicht auffindbar), CHROMIUM_PATH (eigener Chromium), KEEP=1 (Testdateien behalten)
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';   // damit Playwright auch Anfragen des Service Workers abfangen kann
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const { makeTrack } = require('./gen-track');
let pw; try { pw = require('playwright'); } catch (e) { try { pw = require(process.env.PLAYWRIGHT_MODULE); } catch (e2) { console.error('Playwright fehlt: npm i playwright && npx playwright install chromium (oder PLAYWRIGHT_MODULE setzen)'); process.exit(2); } }

const ROOT = path.join(__dirname, '..'), PREFIX = '/Acid/', PORT = 8790 + Math.floor(Math.random() * 100);
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
const misses = [];                     // Pfade, die der Server nicht kannte (für die Fehlersuche)
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (!u.startsWith(PREFIX)) { misses.push(u); res.writeHead(404); return res.end(); }
  const f = path.join(ROOT, u.slice(PREFIX.length) || 'index.html');
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(res);
});
const URL0 = `http://127.0.0.1:${PORT}${PREFIX}index.html`;
const STUB_VIZ = 'window.butterchurn={createVisualizer:()=>({connectAudio(){},loadPreset(){},render(){},setRendererSize(){},loadExtraImages(){},launchSongTitleAnim(){},renderer:{audioLevels:{val:[1,1,1],att:[1,1,1],updateAudioLevels(){}}}})};';
const STUB_PRE = 'window.butterchurnPresets={getPresets:()=>{const o={};for(let i=0;i<40;i++)o["Test · Preset "+i]={baseVals:{},frame_eqs_str:"",init_eqs_str:"",shapes:[],waves:[]};return o}};window.butterchurnPresetsExtra={getPresets:()=>({})};';

const results = []; let browser, tmp, T;      // T: Pfade der Test-Tracks
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log((ok ? '  ok   ' : '  FEHL ') + name + (ok ? '' : '  → ' + detail)); };

async function open(opts = {}) {
  const ctx = await browser.newContext({ serviceWorkers: opts.sw ? 'allow' : 'block', viewport: { width: 390, height: 844 } });
  await ctx.grantPermissions(['microphone']);
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
    const { page, close } = await open();
    await page.evaluate(scansWrapper);
    await page.setInputFiles('#fileIn', T);
    await page.waitForTimeout(900);
    for (let i = 0; i < T.length - 1; i++) { await page.evaluate(() => $('nextTrack').click()); await page.waitForTimeout(200); }
    await page.waitForFunction(() => curAnalysis && curAnalysis.file === curFile, null, { timeout: 240000, polling: 200 });
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => ({ scans: __scans, aktuell: curFile.name, wartend: scanQueue.length, laeuft: !!scanJob, cache: scanCache.size }));
    const letzter = path.basename(T[T.length - 1]), fremd = r.scans.filter(s => s.f !== letzter);
    check('Warteschlange: der gehörte (letzte) Track wurde fertig gescannt', r.aktuell === letzter && r.scans.some(s => s.f === letzter && s.r === 'ok'), JSON.stringify(r));
    check('Warteschlange: unnötige Scans der übersprungenen Tracks abgebrochen (höchstens 2 liefen durch)', fremd.filter(s => s.r === 'abgebrochen').length >= 2 && fremd.filter(s => s.r === 'ok').length <= 2, JSON.stringify(r.scans));
    check('Warteschlange: danach nichts wartend oder laufend, abgebrochene nicht im Speicher', r.wartend === 0 && !r.laeuft && r.cache <= 3, JSON.stringify(r));
    await close();
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
    await page.waitForFunction(() => audio.duration > 0 && !audio.paused, null, { timeout: 20000 });
    await page.evaluate(() => { audio.currentTime = audio.duration - 0.4; });
    await page.waitForFunction(() => qi === 1, null, { timeout: 20000 });
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => ({ qi, spielt: !audio.paused, fehler: LOG.filter(l => l.k === 'x').map(l => l.x) }));
    check('Trackende: nächster Track startet von selbst', r.qi === 1 && r.spielt && r.fehler.length === 0, JSON.stringify(r));
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
    await page.setInputFiles('#fileIn', [T[0]]); await page.waitForTimeout(1500);
    const r = await page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms)), out = {};
      reactive.update = () => { throw new Error('Test-Fehler A'); }; await wait(800);
      for (let i = 0; i < 20; i++) viz.renderer.audioLevels.updateAudioLevels.call({}, 60, i); await wait(200);
      out.meldungen = LOG.filter(l => l.k === 'x').map(l => l.x);
      audio.pause(); bpm = 200; const P = 60000 / bpm; beat.state = 'break'; beat.breakStart = performance.now() - 20 * P; beat.lastKick = 0; beat.kickStreak = 9;
      onKick(performance.now(), 1); out.drop = beat.state; resetBeat(); beat.state = 'drop'; await wait(16 * P + 400); out.nachAltemTimer = beat.state; return out;
    });
    check('Fehler pro Bild werden gemeldet, aber nur einmal (2 Meldungen trotz 20+ Aufrufen)', r.meldungen.length === 2, JSON.stringify(r.meldungen));
    check('Live-Drop: Timer des vorigen Tracks schaltet den neuen Track nicht um', r.drop === 'drop' && r.nachAltemTimer === 'drop', JSON.stringify(r));
    await close();
  },
  async offline() {
    const { page, ctx, errs, close } = await open({ sw: true });
    await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(1500);
    const on = await page.evaluate(async () => { const k = await caches.keys(), c = await caches.open(k[0]); return { caches: k, n: (await c.keys()).length, scope: (await navigator.serviceWorker.ready).scope, files: AM_FILES.length }; });
    check('Offline: Service Worker aktiv unter /Acid/, Speicher mit allen Dateien und den 3 Bibliotheken', on.scope.endsWith(PREFIX) && on.caches.length === 1 && on.n >= on.files + 3 + 10, JSON.stringify(on));
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
    const rec = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('acid-wd', 1); r.onsuccess = () => { const g = r.result.transaction('k').objectStore('k').get('hang'); g.onsuccess = () => res(g.result || null); }; r.onerror = () => res(null); }));
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
      const alt = curAnalysis.km;
      const lauf = tonFolge => {
        const n = tonFolge.length; curAnalysis.km = { n, t0: 1e9, barS: 1, ton: tonFolge, tk: tonFolge.map(() => 0.5) }; tonLast = -1; toggles.bar = true; dropPre = 0;
        const v = barHueTarget; for (let k = 1; k < n; k++) { beat.n = k * 4; onBar('groove'); } return barHueTarget - v - 20 * (n - 1);
      };
      const pendeln = lauf([9, 4, 9, 4, 9, 4, 9, 4]), wechsel = lauf([9, 9, 9, 4, 4, 4, 4]), kurz = lauf([9, 9, 4, 4, 9, 9, 9, 9, 9]);
      curAnalysis.km = alt;
      mxFrame(0, 0.016); MX.z.p = 0.3; MX.z.v = 0; mxFrame(16, 0.016); const z = MX.out.z;
      return { pendeln, wechsel, kurz, z };
    });
    check('Takt-Farbe: Pendeln zwischen zwei Tönen gibt keinen Farbsprung, ein Ton, der nur 2 Takte bleibt, ebenfalls nicht; ein echter Wechsel (A→E, 4 Takte) genau einen', r.pendeln === 0 && r.kurz === 0 && r.wechsel === -150, JSON.stringify(r));
    check('Drop-Zoom: auch bei übergroßem Anschlag bleibt der Zoom unter 8 % (vorher bis 12,5 %)', r.z > 0.05 && r.z <= 0.08, JSON.stringify(r));
    await page.waitForFunction(() => curAnalysis && curAnalysis.km, null, { timeout: 120000, polling: 200 });
    const sw = await page.evaluate(() => { const K = curAnalysis.km, v = Array.from(K.sweep || []); return { n: K.n, len: v.length, max: Math.max(0, ...v.map(Math.abs)), ok: v.every(x => x >= -1 && x <= 1) }; });
    check('Filterfahrt: pro Takt ein Wert zwischen -1 und +1, im Test-Track mit wandernder Filterfrequenz nicht überall 0', sw.len === sw.n && sw.ok && sw.max > 0.1, JSON.stringify(sw));
    const q = await page.evaluate(() => { const t = targetSize(true); return { q: $('quality').value, lang: Math.max(t[0], t[1]), ton: TON_MIN, bk: BRAKE_KEY }; });
    check('Standard-Auflösung: 1080p, längste Seite höchstens 1920 px; Ton-Schwelle 0,10; Lastbremse-Speicher v2', q.q === '1080' && q.lang <= 1920 && q.ton === 0.10 && q.bk === 'am-brake-v2', JSON.stringify(q));
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
