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
const bbFilterOk = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;
// Build 119: Safari (iPhone) kann ctx.filter nicht (erster Bildbogen: „ohne Farbfilter“). Dann wird der CSS-Filter des Bilds (contrast, saturate, hue-rotate,
// brightness, wie applyFilter in js/04 sie setzt) als Farbmatrix nachgerechnet, nach den Formeln der Filter-Spezifikation (ohne Zwischen-Abschneiden).
function bbMatrix(f) {
  let M = [1, 0, 0, 0, 1, 0, 0, 0, 1], o = [0, 0, 0];
  const mul = (A, a) => { const N = [], q = []; for (let r = 0; r < 3; r++) { for (let c = 0; c < 3; c++) N[r * 3 + c] = A[r * 3] * M[c] + A[r * 3 + 1] * M[3 + c] + A[r * 3 + 2] * M[6 + c]; q[r] = A[r * 3] * o[0] + A[r * 3 + 1] * o[1] + A[r * 3 + 2] * o[2] + a[r]; } M = N; o = q; };
  String(f || '').replace(/([a-z-]+)\(([-\d.]+)(deg)?\)/g, (m, fn, v) => {
    const x = +v;
    if (fn === 'saturate') mul([0.213 + 0.787 * x, 0.715 - 0.715 * x, 0.072 - 0.072 * x, 0.213 - 0.213 * x, 0.715 + 0.285 * x, 0.072 - 0.072 * x, 0.213 - 0.213 * x, 0.715 - 0.715 * x, 0.072 + 0.928 * x], [0, 0, 0]);
    else if (fn === 'hue-rotate') { const c = Math.cos(x * Math.PI / 180), s = Math.sin(x * Math.PI / 180);
      mul([0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928, 0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283, 0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072], [0, 0, 0]); }
    else if (fn === 'brightness') mul([x, 0, 0, 0, x, 0, 0, 0, x], [0, 0, 0]);
    else if (fn === 'contrast') mul([x, 0, 0, 0, x, 0, 0, 0, x], [127.5 - 127.5 * x, 127.5 - 127.5 * x, 127.5 - 127.5 * x]);
    return m; });
  return { M, o };
}
function bbRecolor(x, w, h, f) {
  if (!f || f === 'none') return;
  const { M, o } = bbMatrix(f), img = x.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2];
    d[i] = M[0] * r + M[1] * g + M[2] * b + o[0]; d[i + 1] = M[3] * r + M[4] * g + M[5] * b + o[1]; d[i + 2] = M[6] * r + M[7] * g + M[8] * b + o[2]; }
  x.putImageData(img, 0, 0);
}
const BB = { tracks: {}, list: [], nextT: 0, lastT: -1e9, name: '', after: null, cv: null, cx: null, n: 0 };
const bbPos = () => micOn ? 'Mikro' : (curFile && !audio.paused || audio.currentTime > 0) ? Math.floor(audio.currentTime / 60) + ':' + String(Math.floor(audio.currentTime % 60)).padStart(2, '0') : '';
// Was auf dem Schirm ist, verkleinert in einen 2D-Kontext zeichnen (Build 122: auch für den Mitschnitt, js/09c).
// o.base: Milkdrop (gespiegelt wie auf dem Schirm) und eigener Shader; o.color: deren Farbfilter (ctx.filter, sonst nachgerechnet); o.fx: Funken, Ringe, Blitz
function bbScreen(x, tw, th, o) {
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.fillStyle = '#000'; x.fillRect(0, 0, tw, th);
  const useF = o.color && bbFilterOk;
  if (o.base) {
    const shFull = shCur && shOp >= 0.999;
    if (!shFull) {
      x.save(); if (useF) { try { x.filter = canvas.style.filter || 'none'; } catch (e) {} }
      const fl = !shCur && mdFlip ? mdFlip : '';
      const sx = /scale\(-1,/.test(fl) ? -1 : 1, sy = /,-1\)/.test(fl) ? -1 : 1;
      if (sx < 0 || sy < 0) { x.translate(sx < 0 ? tw : 0, sy < 0 ? th : 0); x.scale(sx, sy); }
      x.drawImage(canvas, 0, 0, tw, th); x.restore();
    }
    if (shOp > 0.01) { x.save(); x.globalAlpha = Math.min(1, shOp); if (useF) { try { x.filter = shEl.style.filter || 'none'; } catch (e) {} } x.drawImage(shEl, 0, 0, tw, th); x.restore(); }
    if (o.color && !bbFilterOk) bbRecolor(x, tw, th, canvas.style.filter);     // Milkdrop und eigener Shader haben denselben Filter (applyFilter, js/04); Funken und Blitz nicht
  }
  if (o.fx) {
    x.save(); x.globalCompositeOperation = 'lighter'; x.drawImage(fxc, 0, 0, tw, th); x.restore();
    if (o.flash !== false && flash > 0.02) { x.fillStyle = 'rgba(255,255,255,' + Math.min(1, flash).toFixed(2) + ')'; x.fillRect(0, 0, tw, th); }
  }
}
function bbGrab(name, tag) {
  const W0 = canvas.clientWidth || innerWidth || 1, H0 = canvas.clientHeight || innerHeight || 1;
  const tw = W0 >= H0 ? BBCFG.long : 112, th = Math.max(40, Math.round(tw * H0 / W0));
  if (!BB.cv) { BB.cv = document.createElement('canvas'); BB.cx = BB.cv.getContext('2d'); }
  const c = BB.cv, x = BB.cx; if (!x) return;
  if (c.width !== tw || c.height !== th) { c.width = tw; c.height = th; }
  try { bbScreen(x, tw, th, { base: true, color: true, fx: true }); } catch (e) { return; }
  const tk = micOn ? 'Mikro' : curFile ? curFile.name : '';
  if (tk && curAnalysis && curFile && !micOn && !BB.tracks[tk]) BB.tracks[tk] = curAnalysis;     // Build 121: Partitur des Tracks für das Partitur-Blatt
  const item = { t: stamp(), pos: bbPos(), name: name || '', tag, sec: sectionKey(), w: tw, h: th, blob: null,
    tk, tpos: micOn ? -1 : audio.currentTime, snd: [AKV.kick_env, AKV.acid_env, AKV.hats_env, AKV.pads_env].map(v => Math.max(0, Math.min(1, +v || 0))) };
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
    x.fillText('New Milkdrop Bildbogen · Build ' + BUILD_NO + ' · ' + new Date().toLocaleString('de-DE') + (parts > 1 ? ' · Blatt ' + (p + 1) + '/' + parts : '') + ' · ' + L[0].t + '–' + L[L.length - 1].t + (bbFilterOk ? '' : ' · Farbe nachgerechnet'), 8, 21);
    for (let i = 0; i < L.length; i++) {
      const it = L[i], col = i % cols, row = Math.floor(i / cols), x0 = 4 + col * cw, y0 = head + row * chh;
      const im = await bbLoad(it.blob);
      if (im) x.drawImage(im, x0 + (cw - 8 - it.w) / 2, y0 + (ih - it.h) / 2, it.w, it.h);
      if (it.snd) bbMeter(x, x0 + (cw - 8 - it.w) / 2 + 2, y0 + (ih + it.h) / 2 - 2, it.snd);
      x.fillStyle = it.tag === 'vor Wechsel' ? '#f9a' : it.tag === 'nach Wechsel' ? '#8cf' : '#ccc'; x.font = '10px monospace';
      x.fillText((it.t + ' ' + (it.pos ? '▶' + it.pos + ' ' : '') + (it.tag || it.sec || '')).slice(0, Math.floor((cw - 8) / 6)), x0, y0 + ih + 12);
      x.fillStyle = '#fff'; x.fillText(String(it.name).slice(0, Math.floor((cw - 8) / 6)), x0, y0 + ih + 24);
    }
    out.push(await new Promise(res => c.toBlob(b => res(b), 'image/jpeg', BBCFG.sheetQ)));
  }
  return out.filter(Boolean);
}
// Klang im Moment des Bilds (Build 121): vier kleine Balken unten links im Vorschaubild, Kick / Acid / Hats / Pads (Klangrollen, 0..1)
const BB_ROLLEN = [['Kick', '#ff5050'], ['Acid', '#c6f432'], ['Hats', '#4dd2ff'], ['Pads', '#b48cff']];
function bbMeter(x, left, bottom, v) {
  x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(left, bottom - 18, 23, 18);
  for (let k = 0; k < 4; k++) { const h = Math.max(1, Math.round(16 * v[k])); x.fillStyle = BB_ROLLEN[k][1]; x.fillRect(left + 2 + k * 5, bottom - 1 - h, 4, h); }
}
// Partitur-Blatt je Track (Build 121): die Musik als Zeitleiste (Abschnitte, Kick/Acid/Hats/Pads Takt für Takt, Drops) und darunter,
// wann welches Vorschaubild entstand (Zeit wie im Protokoll). So passen Bild, Protokoll und Musik zusammen.
const BB_SEC = { intro: '#4a4a66', groove: '#2a7a4a', break: '#3366cc', buildup: '#cc9933', drop: '#e03030', outro: '#665555' };
async function bbPartituren() {
  const out = [], names = [...new Set(BB.list.filter(i => i.tk && i.tk !== 'Mikro').map(i => i.tk))];
  for (const tk of names) {
    const A = BB.tracks[tk], L = BB.list.filter(i => i.tk === tk && i.tpos >= 0);
    const W = 1208, X0 = 64, XW = W - X0 - 12, dur = A && A.duration ? A.duration : Math.max(1, ...L.map(i => i.tpos)) + 5;
    const tx = s => X0 + Math.max(0, Math.min(1, s / dur)) * XW, rows = { sec: 30, r0: 58, rh: 20, img: 146 }, H = 236;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.fillStyle = '#111'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#c6f432'; x.font = 'bold 13px monospace';
    x.fillText(('Partitur · ' + tk + (A && A.bpm ? ' · ' + A.bpm.toFixed(1) + ' BPM' : '') + ' · ' + Math.floor(dur / 60) + ':' + String(Math.floor(dur % 60)).padStart(2, '0') + ' · Build ' + BUILD_NO).slice(0, 150), 8, 19);
    x.font = '10px monospace'; x.fillStyle = '#aaa';
    x.fillText('Abschnitt', 4, rows.sec + 13); BB_ROLLEN.forEach((r, k) => { x.fillStyle = r[1]; x.fillText(r[0], 4, rows.r0 + k * rows.rh + 13); });
    x.fillStyle = '#aaa'; x.fillText('Bilder', 4, rows.img + 12);
    if (A && A.sections) for (const s of A.sections) {
      const a = tx(s.t0), b = tx(s.t1); x.fillStyle = BB_SEC[s.type] || '#444'; x.fillRect(a, rows.sec, Math.max(1, b - a - 1), 18);
      if (b - a > 34) { x.fillStyle = '#fff'; x.fillText(s.type, a + 3, rows.sec + 13); }
    }
    const P = A && A.rollen;
    if (P && P.n) for (let bi = 0; bi < P.n; bi++) {
      const a = tx(P.bar0 + bi * P.barS), b = tx(P.bar0 + (bi + 1) * P.barS);
      for (let k = 0; k < 4; k++) { const v = P.v[bi * P.f.length + k] / 255; x.globalAlpha = 0.12 + 0.88 * v; x.fillStyle = BB_ROLLEN[k][1]; x.fillRect(a, rows.r0 + k * rows.rh + Math.round((1 - v) * 16), Math.max(1, b - a), 2 + Math.round(v * 16)); }
      if (P.ent[bi] & 15) { x.globalAlpha = 1; x.fillStyle = '#fff'; x.fillRect(a, rows.r0 - 4, 1, 3); }
    }
    x.globalAlpha = 1;
    if (!A) { x.fillStyle = '#f9a'; x.fillText('keine Partitur (Track lief ohne Analyse)', X0, rows.r0 + 20); }
    if (A && A.aufbau && A.aufbau.drops) for (const d of A.aufbau.drops) { const a = tx(d.t); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(a, rows.sec - 2); x.lineTo(a - 4, rows.sec - 9); x.lineTo(a + 4, rows.sec - 9); x.fill(); }
    for (let m = 0; m <= dur; m += 30) { const a = tx(m); x.fillStyle = '#333'; x.fillRect(a, rows.r0, 1, 4 * rows.rh); x.fillStyle = '#777'; x.fillText(Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'), a + 2, rows.img - 6); }
    let lastX = -1e9, lane = 0;
    for (const it of L) {
      const a = tx(it.tpos); x.fillStyle = it.tag === 'vor Wechsel' ? '#f9a' : it.tag === 'nach Wechsel' ? '#8cf' : '#888';
      x.fillRect(a, rows.img, 1, it.tag === 'nach Wechsel' ? 14 : 8);
      if (it.tag === 'nach Wechsel' && a - lastX > 44) { lane = (lane + 1) % 4; x.fillText(it.t, a + 2, rows.img + 26 + lane * 16); lastX = a; }
    }
    x.fillStyle = '#777'; x.fillText('▲ Drop (Aufbau-Detektor) · rot = Bild vor Wechsel, blau = nach Wechsel (mit Zeit wie im Protokoll und im Bildbogen) · Balken: Klangrollen je Takt', 8, H - 6);
    out.push({ tk, blob: await new Promise(res => c.toBlob(b => res(b), 'image/jpeg', 0.88)) });
  }
  return out.filter(o => o.blob);
}
// Alle Dateien zum Teilen: Bildbogen-Blätter, Partitur-Blätter, vollständiges Protokoll
async function bbFiles() {
  const blobs = await bbSheets(); if (!blobs.length) return [];
  const day = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ''), safe = s => String(s).replace(/\.[a-z0-9]+$/i, '').replace(/[^\w\-]+/g, '_').slice(0, 40);
  const files = blobs.map((b, i) => new File([b], 'bildbogen-' + day + (blobs.length > 1 ? '-' + (i + 1) : '') + '.jpg', { type: 'image/jpeg' }));
  for (const p of await bbPartituren()) files.push(new File([p.blob], 'partitur-' + day + '-' + safe(p.tk) + '.jpg', { type: 'image/jpeg' }));
  files.push(new File([logTextAll()], 'protokoll-' + day + '.txt', { type: 'text/plain' }));
  return files;
}
async function bbShare() {
  const btn = $('logBild'); if (btn) { btn.disabled = true; btn.textContent = 'Bildbogen …'; }
  try {
    const files = await bbFiles();
    if (!files.length) { rea('Bildbogen: noch keine Bilder (sie entstehen, während Musik läuft)'); return 0; }
    const nb = files.filter(f => /^bildbogen/.test(f.name)).length, np = files.filter(f => /^partitur/.test(f.name)).length;
    rea('Bildbogen: ' + BB.list.length + ' Bilder auf ' + nb + (nb === 1 ? ' Blatt' : ' Blättern') + ', ' + np + ' Partitur-' + (np === 1 ? 'Blatt' : 'Blätter') + ', Protokoll ' + LOG_ALL.length + ' Zeilen, zusammen ' + Math.round(files.reduce((s, f) => s + f.size, 0) / 1024) + ' KB');
    if (navigator.canShare && navigator.canShare({ files })) { try { await navigator.share({ files, title: 'New Milkdrop Bildbogen' }); return files.length; } catch (e) { if (e && e.name === 'AbortError') return files.length; } }
    for (const f of files) { const a = document.createElement('a'), u = URL.createObjectURL(f); a.href = u; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 20000); }
    return files.length;
  } finally { if (btn) { btn.disabled = false; btn.textContent = 'Bildbogen'; } }
}
{ const b = $('logBild'); if (b) b.addEventListener('click', () => { if (window.msShare && window.msShare.ok()) window.msShare(); else bbShare(); }); }   // Build 122: Mitschnitt (js/09c), sonst Bildbogen
window.bbScreen = bbScreen; window.__BB = BB; window.bbFiles = bbFiles; window.bbPartituren = bbPartituren; window.bbSheets = bbSheets; window.bbShare = bbShare; window.BBCFG = BBCFG;
