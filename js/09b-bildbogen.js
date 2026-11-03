// new-milkdrop- · Teil 9b: Bildbogen (ab Build 117). Kleine Vorschaubilder von dem, was wirklich auf dem Bildschirm ist.
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Dieser Teil ändert window.__AM_STEP NICHT: bricht er ab, fehlt nur der Bildbogen, alles andere läuft weiter.
if (window.__AM_STEP !== 9) throw new Error('new-milkdrop-: Teil 9b (bildbogen) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== Idee (Emmo, Build 116): „Kann man was einbauen, dass du siehst, was ich sehe?“ =====
// Das Protokoll sagt nur, WELCHES Bild lief. Der Bildbogen zeigt, WIE es aussah: alle BBCFG.everyS Sekunden ein Vorschaubild, dazu bei jedem
// Bildwechsel eins kurz davor (altes Bild) und eins BBCFG.afterS Sekunden danach (neues Bild, Überblenden fertig). Gezeichnet wird, was auf dem
// Schirm ist: Milkdrop (mit Farbfilter und Spiegelung), eigener Shader (mit seiner Deckkraft), Funken und Ringe, Blitz. Nicht dabei: Zoom/Drehen
// des Mischpults (wenige Prozent). Die Bilder liegen nur im Speicher (JPEG, je ca. 5-10 KB, höchstens BBCFG.max), beim Neuladen sind sie weg.
// „Bildbogen“ im Protokoll setzt sie zu Blättern zusammen (Zeit, Track-Position, Anlass, Preset-Name unter jedem Bild) und teilt sie (iPhone:
// Teilen-Menü, sonst Download). Gelesen wird die WebGL-Fläche direkt nach dem Zeichnen im selben Bild (js/09 ruft bbFrame am Ende der Schleife).
const BBCFG = {
  everyS: 5,            // Abstand der Vorschaubilder ohne Bildwechsel
  afterS: 3.2,          // so lange nach einem Bildwechsel kommt das Bild „danach“ (Überblenden ist dann durch)
  minGapS: 1.2,         // Bilder näher beieinander als das werden ausgelassen (schnelles Wischen)
  long: 192,            // lange Seite eines Vorschaubilds in Pixeln (Hochformat: kurze Seite 112)
  max: 360,             // so viele Bilder werden behalten (die ältesten fallen weg), bei 5 s ca. 25 Minuten
  q: 0.72,              // JPEG-Qualität der Vorschaubilder
  cols: 6, perSheet: 120, sheetQ: 0.82   // Bildbogen: Spalten, Bilder pro Blatt, JPEG-Qualität
};
const bbFilterOk = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;   // ohne: Vorschaubilder ohne Takt-/Acid-Farbe
const BB = { list: [], nextT: 0, lastT: -1e9, name: '', after: null, cv: null, cx: null, n: 0 };
const bbPos = () => micOn ? 'Mikro' : (curFile && !audio.paused || audio.currentTime > 0) ? Math.floor(audio.currentTime / 60) + ':' + String(Math.floor(audio.currentTime % 60)).padStart(2, '0') : '';
function bbGrab(name, tag) {
  const W0 = canvas.clientWidth || innerWidth || 1, H0 = canvas.clientHeight || innerHeight || 1;
  const tw = W0 >= H0 ? BBCFG.long : 112, th = Math.max(40, Math.round(tw * H0 / W0));
  if (!BB.cv) { BB.cv = document.createElement('canvas'); BB.cx = BB.cv.getContext('2d'); }
  const c = BB.cv, x = BB.cx; if (!x) return;
  if (c.width !== tw || c.height !== th) { c.width = tw; c.height = th; }
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.fillStyle = '#000'; x.fillRect(0, 0, tw, th);
  try {
    const shFull = shCur && shOp >= 0.999;
    if (!shFull) {
      x.save(); try { x.filter = canvas.style.filter || 'none'; } catch (e) {}
      const fl = !shCur && mdFlip ? mdFlip : '';
      const sx = /scale\(-1,/.test(fl) ? -1 : 1, sy = /,-1\)/.test(fl) ? -1 : 1;
      if (sx < 0 || sy < 0) { x.translate(sx < 0 ? tw : 0, sy < 0 ? th : 0); x.scale(sx, sy); }
      x.drawImage(canvas, 0, 0, tw, th); x.restore();
    }
    if (shOp > 0.01) { x.save(); x.globalAlpha = Math.min(1, shOp); try { x.filter = shEl.style.filter || 'none'; } catch (e) {} x.drawImage(shEl, 0, 0, tw, th); x.restore(); }
    x.save(); x.globalCompositeOperation = 'lighter'; x.drawImage(fxc, 0, 0, tw, th); x.restore();
    if (flash > 0.02) { x.fillStyle = 'rgba(255,255,255,' + Math.min(1, flash).toFixed(2) + ')'; x.fillRect(0, 0, tw, th); }
  } catch (e) { return; }
  const item = { t: stamp(), pos: bbPos(), name: name || '', tag, sec: sectionKey(), w: tw, h: th, blob: null };
  BB.list.push(item); BB.n++; if (BB.list.length > BBCFG.max) BB.list.shift();
  try { c.toBlob(b => { if (b) item.blob = b; else BB.list.splice(BB.list.indexOf(item), 1); }, 'image/jpeg', BBCFG.q); }
  catch (e) { BB.list.splice(BB.list.indexOf(item), 1); }
}
// Am Ende jedes Bilds aus der Schleife (js/09): Wechsel erkennen, Bilder nehmen
function bbFrame(t) {
  if (frozen || document.visibilityState !== 'visible') return;
  const playing = micOn || (curFile && !audio.paused);
  if (curName !== BB.name) {
    const old = BB.name; BB.name = curName;
    if (old && playing) {
      const last = BB.list[BB.list.length - 1];
      if (t - BB.lastT > BBCFG.minGapS * 1000) { bbGrab(old, 'vor Wechsel'); BB.lastT = t; }
      else if (last && last.name === old && !last.tag) last.tag = 'vor Wechsel';   // gerade erst ein Bild vom alten Preset: das ist das „davor“
    }
    BB.after = { t: t + BBCFG.afterS * 1000, name: curName };
    BB.nextT = t + (BBCFG.afterS + BBCFG.everyS) * 1000;
    return;
  }
  if (!playing) return;
  if (BB.after && t >= BB.after.t) {
    const a = BB.after; BB.after = null;
    if (a.name === curName) { bbGrab(curName, 'nach Wechsel'); BB.lastT = t; BB.nextT = t + BBCFG.everyS * 1000; }
    return;
  }
  if (t >= BB.nextT && t - BB.lastT > BBCFG.minGapS * 1000) { bbGrab(curName, ''); BB.lastT = t; BB.nextT = t + BBCFG.everyS * 1000; }
}
window.bbFrame = bbFrame;

// ===== Blätter bauen: Raster mit Beschriftung =====
const bbLoad = b => new Promise(res => { const u = URL.createObjectURL(b), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); res(null); }; im.src = u; });
async function bbSheets() {
  const all = BB.list.filter(i => i.blob), out = [];
  if (!all.length) return out;
  const parts = Math.ceil(all.length / BBCFG.perSheet);
  for (let p = 0; p < parts; p++) {
    const L = all.slice(p * BBCFG.perSheet, (p + 1) * BBCFG.perSheet);
    const cw = Math.max(...L.map(i => i.w)) + 8, ih = Math.max(...L.map(i => i.h)), chh = ih + 30, head = 34;
    const cols = Math.min(BBCFG.cols, L.length), rows = Math.ceil(L.length / cols);
    const c = document.createElement('canvas'); c.width = cols * cw + 8; c.height = head + rows * chh + 4;
    const x = c.getContext('2d'); x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#c6f432'; x.font = 'bold 13px monospace';
    x.fillText('New Milkdrop Bildbogen · Build ' + BUILD_NO + ' · ' + new Date().toLocaleString('de-DE') + (parts > 1 ? ' · Blatt ' + (p + 1) + '/' + parts : '') + ' · ' + L[0].t + '–' + L[L.length - 1].t + (bbFilterOk ? '' : ' · ohne Farbfilter'), 8, 21);
    for (let i = 0; i < L.length; i++) {
      const it = L[i], col = i % cols, row = Math.floor(i / cols), x0 = 4 + col * cw, y0 = head + row * chh;
      const im = await bbLoad(it.blob);
      if (im) x.drawImage(im, x0 + (cw - 8 - it.w) / 2, y0 + (ih - it.h) / 2, it.w, it.h);
      x.fillStyle = it.tag === 'vor Wechsel' ? '#f9a' : it.tag === 'nach Wechsel' ? '#8cf' : '#ccc'; x.font = '10px monospace';
      x.fillText((it.t + ' ' + (it.pos ? '▶' + it.pos + ' ' : '') + (it.tag || it.sec || '')).slice(0, Math.floor((cw - 8) / 6)), x0, y0 + ih + 12);
      x.fillStyle = '#fff'; x.fillText(String(it.name).slice(0, Math.floor((cw - 8) / 6)), x0, y0 + ih + 24);
    }
    out.push(await new Promise(res => c.toBlob(b => res(b), 'image/jpeg', BBCFG.sheetQ)));
  }
  return out.filter(Boolean);
}
async function bbShare() {
  const btn = $('logBild'); if (btn) { btn.disabled = true; btn.textContent = 'Bildbogen …'; }
  try {
    const blobs = await bbSheets();
    if (!blobs.length) { rea('Bildbogen: noch keine Bilder (sie entstehen, während Musik läuft)'); return 0; }
    const day = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const files = blobs.map((b, i) => new File([b], 'bildbogen-' + day + (blobs.length > 1 ? '-' + (i + 1) : '') + '.jpg', { type: 'image/jpeg' }));
    rea('Bildbogen: ' + BB.list.length + ' Bilder auf ' + files.length + (files.length === 1 ? ' Blatt' : ' Blättern') + ', zusammen ' + Math.round(files.reduce((s, f) => s + f.size, 0) / 1024) + ' KB');
    if (navigator.canShare && navigator.canShare({ files })) { try { await navigator.share({ files, title: 'New Milkdrop Bildbogen' }); return files.length; } catch (e) { if (e && e.name === 'AbortError') return files.length; } }
    for (const f of files) { const a = document.createElement('a'), u = URL.createObjectURL(f); a.href = u; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 20000); }
    return files.length;
  } finally { if (btn) { btn.disabled = false; btn.textContent = 'Bildbogen'; } }
}
{ const b = $('logBild'); if (b) b.addEventListener('click', () => { bbShare(); }); }
window.__BB = BB; window.bbSheets = bbSheets; window.bbShare = bbShare; window.BBCFG = BBCFG;
