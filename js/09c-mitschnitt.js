// new-milkdrop- · Teil 9c: Mitschnitt (ab Build 122). Video mit Ton von dem, was auf dem Schirm ist, nur im Speicher.
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Dieser Teil ändert window.__AM_STEP NICHT: bricht er ab, bleibt der Bildbogen (js/09b), alles andere läuft weiter.
if (window.__AM_STEP !== 9) throw new Error('new-milkdrop-: Teil 9c (mitschnitt) nicht gestartet, ein früherer Teil ist abgebrochen');
if (typeof bbScreen !== 'function') throw new Error('new-milkdrop-: Teil 9c (mitschnitt) braucht den Bildbogen (js/09b)');

// ===== Idee (Emmo, Build 121): „statt Bildbogen ein Screen-Recorder, der nur auf Knopfdruck geteilt wird, Ton gleich dabei, über 29 MB gesplittet“ =====
// Während Musik läuft (und der Schalter „Mitschnitt“ an ist), wird ein kleines Video aufgenommen: was auf dem Schirm ist (wie der Bildbogen:
// Milkdrop gespiegelt und mit Farbfilter, eigener Shader, Funken, Blitz) und der Ton der Quelle (Datei, Sicherheits-Modus oder Mikro, genau was
// man hört). Nichts wird gespeichert: die Teile liegen im Speicher, bis die App zu ist; behalten werden die letzten MSCFG.keepMB.
// Jeder Teil ist eine eigene Videodatei unter MSCFG.maxFileMB (Claude nimmt höchstens 30 MB pro Datei): wird er zu groß oder zu lang, beginnt
// der nächste. „Mitschnitt“ im Protokoll teilt die Videos, das ganze Protokoll und die Partitur-Blätter. Kann der Browser nicht aufnehmen,
// teilt der Knopf wie bisher den Bildbogen.
// Farbe: kann der Browser ctx.filter (Chrome), zeichnet bbScreen (js/09b) direkt in die Aufnahme. Safari kann es nicht: dann malt bbScreen
// ohne Filter in eine Zwischenfläche, und eine kleine WebGL-Fläche rechnet den Farbfilter als Matrix (bbMatrix) und legt Funken/Blitz darüber.
const MSCFG = {
  long: 640,             // lange Seite des Videos in Pixeln
  fps: 15,               // Bilder pro Sekunde im Video. Build 124: 30 → 15. Im Test (Build 123) kostete jedes Videobild Ø 23 ms (Safari liest das WebGL-Bild aus),
                         // bei 25 Bildern/s fiel die App von 56 auf 35 fps; im Video kamen trotzdem nur 17 Bilder/s an
  fpsSlow: 8, slowBelow: 45,   // läuft die App (Mittel der letzten 10 s) unter slowBelow fps, nur noch fpsSlow Bilder/s ins Video: die Show geht vor
  vbps: 700000, abps: 96000,     // gewünschte Bitraten (der Browser hält sich nicht immer daran, darum wird die Größe mitgezählt). Build 123: erster Mitschnitt
                                 // vom iPhone mit 1,2 M + 128 k ergab 1,6 Mbit/s = nur 2:20 min pro 27-MB-Datei; jetzt ca. 4 min
  maxFileMB: 27,         // ab dieser Größe beginnt ein neuer Teil (bleibt sicher unter 29 MB, auch mit dem letzten Datenpaket)
  maxSegMin: 5,          // spätestens nach so vielen Minuten beginnt ein neuer Teil
  sliceMs: 4000,         // so oft liefert die Aufnahme Daten (damit die Größe mitgezählt werden kann)
  keepMB: 140,           // so viel Video wird höchstens behalten (die ältesten Teile fallen weg), bei ca. 6 MB/min etwa 20 Minuten
  forceGL: false         // nur zum Testen: Farbe über WebGL wie auf dem iPhone, auch wenn der Browser ctx.filter kann
};
const MS = { slow: false, st: { n: 0, ms: 0, max: 0, msA: 0, slowN: 0, t: performance.now() }, ok: false, mime: '', ext: '', segs: [], cur: null, n: 0, tap: null, dest: null, cv: null, cx: null, a: null, ax: null, b: null, bx: null, gl: null, lastF: 0, err: '' };
{ const cand = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  try {
    if (typeof MediaRecorder !== 'undefined' && HTMLCanvasElement.prototype.captureStream && ctx.createMediaStreamDestination) {
      MS.mime = cand.find(m => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || '';
      MS.ext = /mp4/.test(MS.mime) ? 'mp4' : 'webm'; MS.ok = !!MS.mime;
    }
  } catch (e) { MS.ok = false; }
  if (!MS.ok) rea('Mitschnitt: dieser Browser kann nicht aufnehmen, der Knopf teilt den Bildbogen'); }
const msGL = () => MSCFG.forceGL || !bbFilterOk;

// Aufnahme-Fläche anlegen (Größe nach der Bildschirmlage)
function msSize() {
  const W0 = canvas.clientWidth || innerWidth || 1, H0 = canvas.clientHeight || innerHeight || 1;
  let w = W0 >= H0 ? MSCFG.long : Math.round(MSCFG.long * W0 / H0), h = W0 >= H0 ? Math.round(MSCFG.long * H0 / W0) : MSCFG.long;
  return [w & ~1, h & ~1];                                            // gerade Zahlen (Video-Kodierer)
}
function msSetup(w, h) {
  const gl = msGL();
  if (MS.cv && MS.cv.parentNode) MS.cv.remove();
  MS.cv = document.createElement('canvas'); MS.cv.width = w; MS.cv.height = h; MS.gl = null; MS.cx = null;
  MS.cv.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1';   // in der Seite, unsichtbar: manche Browser nehmen sonst nichts auf
  document.body.appendChild(MS.cv);
  if (!gl) { MS.cx = MS.cv.getContext('2d'); return !!MS.cx; }
  MS.a = document.createElement('canvas'); MS.b = document.createElement('canvas');
  for (const c of [MS.a, MS.b]) { c.width = w; c.height = h; }
  MS.ax = MS.a.getContext('2d'); MS.bx = MS.b.getContext('2d');
  const g = MS.cv.getContext('webgl', { preserveDrawingBuffer: true, alpha: false, antialias: false }); if (!g) return false;
  const sh = (t, src) => { const s = g.createShader(t); g.shaderSource(s, src); g.compileShader(s); return s; };
  const p = g.createProgram();
  g.attachShader(p, sh(g.VERTEX_SHADER, 'attribute vec2 q; varying vec2 v; void main(){ v = q*0.5+0.5; gl_Position = vec4(q,0.0,1.0); }'));
  g.attachShader(p, sh(g.FRAGMENT_SHADER, 'precision mediump float; varying vec2 v; uniform sampler2D A, B; uniform mat3 M; uniform vec3 O; uniform float F;' +
    'void main(){ vec3 a = texture2D(A, v).rgb*255.0; vec3 c = clamp((M*a + O)/255.0, 0.0, 1.0); c = min(c + texture2D(B, v).rgb, 1.0); gl_FragColor = vec4(mix(c, vec3(1.0), F), 1.0); }'));
  g.linkProgram(p); if (!g.getProgramParameter(p, g.LINK_STATUS)) return false;
  g.useProgram(p);
  const buf = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, buf); g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
  const q = g.getAttribLocation(p, 'q'); g.enableVertexAttribArray(q); g.vertexAttribPointer(q, 2, g.FLOAT, false, 0, 0);
  const tex = u => { const t = g.createTexture(); g.bindTexture(g.TEXTURE_2D, t); for (const [k, v] of [[g.TEXTURE_MIN_FILTER, g.LINEAR], [g.TEXTURE_MAG_FILTER, g.LINEAR], [g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE], [g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE]]) g.texParameteri(g.TEXTURE_2D, k, v); return t; };
  MS.gl = { g, ta: tex(), tb: tex(), lM: g.getUniformLocation(p, 'M'), lO: g.getUniformLocation(p, 'O'), lF: g.getUniformLocation(p, 'F') };
  g.uniform1i(g.getUniformLocation(p, 'A'), 0); g.uniform1i(g.getUniformLocation(p, 'B'), 1);
  g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, true); g.viewport(0, 0, w, h);
  return true;
}
// Ein Bild ins Video (aus der Schleife, js/09, direkt nach dem Zeichnen)
function msFrame(t) {
  const c = MS.cur; if (!c || c.state !== 'rec' || frozen) return;
  const now = performance.now(), recent = fpsHist.filter(h => now - h[0] <= 10000), app = recent.length >= 5 ? recent.reduce((s, h) => s + h[1], 0) / recent.length : 60;
  MS.slow = app < MSCFG.slowBelow; if (MS.slow) MS.st.slowN++;
  if (t - MS.lastF < 1000 / (MS.slow ? MSCFG.fpsSlow : MSCFG.fps) - 4) return;
  MS.lastF = t; const t0 = performance.now();
  try { msDraw(); } finally { const ms = performance.now() - t0; MS.st.n++; MS.st.ms += ms; if (ms > MS.st.max) MS.st.max = ms; }
}
function msDraw() {
  const w = MS.cv.width, h = MS.cv.height;
  try {
    if (!MS.gl) { bbScreen(MS.cx, w, h, { base: true, color: true, fx: true }); return; }
    const ta = performance.now();
    bbScreen(MS.ax, w, h, { base: true, color: false, fx: false });
    bbScreen(MS.bx, w, h, { base: false, fx: true, flash: false });
    MS.st.msA += performance.now() - ta;
    const G = MS.gl, g = G.g, m = (window.bbMatrix ? bbMatrix(canvas.style.filter) : { M: [1, 0, 0, 0, 1, 0, 0, 0, 1], o: [0, 0, 0] });
    g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, G.ta); g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, MS.a);
    g.activeTexture(g.TEXTURE1); g.bindTexture(g.TEXTURE_2D, G.tb); g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, MS.b);
    const M = m.M; g.uniformMatrix3fv(G.lM, false, [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]]);   // Spalten für GLSL
    g.uniform3f(G.lO, m.o[0], m.o[1], m.o[2]); g.uniform1f(G.lF, Math.min(1, flash > 0.02 ? flash : 0));
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
  } catch (e) { msFail('Bild: ' + (e && e.message || e)); }
}
window.msFrame = msFrame;
// Protokoll: einmal pro Minute, wie viele Bilder ins Video gingen und was das Zeichnen kostet (Build 123: im ersten iPhone-Mitschnitt kamen nur 15-21 Bilder/s an)
setInterval(() => { const S = MS.st, now = performance.now(), sec = (now - S.t) / 1000; MS.st = { n: 0, ms: 0, max: 0, msA: 0, slowN: 0, t: now }; if (!S.n) return;
  const fa = fpsHist.filter(h => now - h[0] <= 60000), app = fa.length ? Math.round(fa.reduce((s, h) => s + h[1], 0) / fa.length) : 0;
  erg('Mitschnitt (letzte Minute): ' + (S.n / sec).toFixed(1).replace('.', ',') + ' Bilder/s ins Video, Zeichnen Ø ' + (S.ms / S.n).toFixed(1).replace('.', ',') + ' ms (max ' + S.max.toFixed(0) + ' ms' + (MS.gl ? ', davon Bild abholen Ø ' + (S.msA / S.n).toFixed(1).replace('.', ',') + ' ms' : '') + ') · App Ø ' + app + ' fps' + (S.slowN ? ' · gebremst (App unter ' + MSCFG.slowBelow + ' fps)' : '') + ' · ' + (MS.gl ? 'Farbe über WebGL' : 'Farbe direkt') + ' · Teil ' + (MS.cur ? MS.cur.n + ' (' + (MS.cur.bytes / 1048576).toFixed(1).replace('.', ',') + ' MB)' : '–') + ' · gespeichert ' + MS.segs.length + ' Teile, ' + (MS.segs.reduce((s, x) => s + x.blob.size, 0) / 1048576).toFixed(0) + ' MB'); }, 60000);

// ===== Teile aufnehmen =====
function msTap() {                                                     // Ton der aktuellen Quelle in die Aufnahme (wechselt mit Track, Mikro, Sicherheits-Modus)
  if (!MS.dest) MS.dest = ctx.createMediaStreamDestination();
  if (MS.tap === srcNode) return;
  if (MS.tap) { try { MS.tap.disconnect(MS.dest); } catch (e) {} }
  MS.tap = srcNode; if (srcNode) { try { srcNode.connect(MS.dest); } catch (e) {} }
}
function msStart() {
  const [w, h] = msSize();
  if (!msSetup(w, h)) { msFail('Aufnahme-Fläche startet nicht'); return; }
  msTap();
  const vs = MS.cv.captureStream(MSCFG.fps), st = new MediaStream([...vs.getVideoTracks(), ...MS.dest.stream.getAudioTracks()]);
  let rec;
  try { rec = new MediaRecorder(st, { mimeType: MS.mime, videoBitsPerSecond: MSCFG.vbps, audioBitsPerSecond: MSCFG.abps }); }
  catch (e) { msFail('Rekorder startet nicht (' + (e && e.message || e) + ')'); return; }
  const c = { rec, chunks: [], bytes: 0, t0: stamp(), t0ms: performance.now(), recMs: 0, runFrom: performance.now(), w, h, state: 'rec', tracks: new Set(), done: null, n: ++MS.n };
  rec.ondataavailable = e => { if (e.data && e.data.size) { c.chunks.push(e.data); c.bytes += e.data.size; } };
  rec.onerror = e => msFail('Aufnahme-Fehler (' + (e && e.error && e.error.name || 'unbekannt') + ')');
  c.done = new Promise(res => { rec.onstop = () => { vs.getTracks().forEach(x => x.stop()); res(); }; });
  rec.start(MSCFG.sliceMs); MS.cur = c;
  if (MS.n === 1) rea('Mitschnitt läuft: ' + MS.mime.split(';')[0] + ', ' + w + '×' + h + ', ' + MSCFG.fps + ' Bilder/s' + (MS.gl ? ', Farbe über WebGL' : ''));
}
async function msCut(why) {                                            // aktuellen Teil abschließen (bleibt im Speicher)
  const c = MS.cur; if (!c) return; MS.cur = null;
  if (c.state === 'rec') c.recMs += performance.now() - c.runFrom;
  c.state = 'stop'; try { c.rec.stop(); } catch (e) {}
  await c.done;
  if (!c.chunks.length) return;
  const blob = new Blob(c.chunks, { type: MS.mime.split(';')[0] }); c.chunks = null;
  MS.segs.push({ n: c.n, blob, t0: c.t0, t1: stamp(), min: c.recMs / 60000, tracks: [...c.tracks], w: c.w, h: c.h });
  rea('Mitschnitt: Teil ' + c.n + ' fertig (' + why + ', ' + (c.recMs / 60000).toFixed(1).replace('.', ',') + ' min, ' + (blob.size / 1048576).toFixed(1).replace('.', ',') + ' MB)');
  let tot = MS.segs.reduce((s, x) => s + x.blob.size, 0);
  while (MS.segs.length > 1 && tot > MSCFG.keepMB * 1048576) { tot -= MS.segs.shift().blob.size; }
}
function msFail(why) { MS.err = why; err('Mitschnitt aus: ' + why); const c = MS.cur; MS.cur = null; if (c) { try { c.rec.stop(); } catch (e) {} } MS.ok = false; msLabel(); }
// Jede halbe Sekunde: starten, pausieren, weiter, Teil abschließen
setInterval(() => {
  if (!MS.ok) return;
  const want = toggles.rec && !panicked && document.visibilityState === 'visible' && (micOn || (curFile && !audio.paused));
  const c = MS.cur;
  if (!c) { if (want) msStart(); return; }
  if (curFile && !micOn) c.tracks.add(curFile.name); else if (micOn) c.tracks.add('Mikro');
  if (want) {
    msTap();
    if (c.state === 'pause') { try { c.rec.resume(); c.state = 'rec'; c.runFrom = performance.now(); } catch (e) { msFail('Fortsetzen ging nicht'); } }
    const [w, h] = msSize(), mins = (c.recMs + (c.state === 'rec' ? performance.now() - c.runFrom : 0)) / 60000;
    if (w !== c.w || h !== c.h) msCut('Bildschirm gedreht');
    else if (c.bytes > MSCFG.maxFileMB * 1048576 * 0.97) msCut('Größe');
    else if (mins >= MSCFG.maxSegMin) msCut('Länge');
  } else if (c.state === 'rec') {
    try { c.rec.pause(); c.recMs += performance.now() - c.runFrom; c.state = 'pause'; } catch (e) { msCut('Pause'); }
  }
}, 500);

// ===== Teilen: Videos + ganzes Protokoll + Partitur-Blätter =====
async function msFiles() {
  if (MS.cur) await msCut('geteilt');
  const day = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ''), safe = s => String(s).replace(/\.[a-z0-9]+$/i, '').replace(/[^\w\-]+/g, '_').slice(0, 40);
  const files = MS.segs.map(s => new File([s.blob], 'mitschnitt-' + day + '-' + String(s.n).padStart(2, '0') + '-' + s.t0.replace(/[:.]/g, '') + '.' + MS.ext, { type: s.blob.type }));
  if (window.bbPartituren) for (const p of await bbPartituren()) files.push(new File([p.blob], 'partitur-' + day + '-' + safe(p.tk) + '.jpg', { type: 'image/jpeg' }));
  files.push(new File([logTextAll()], 'protokoll-' + day + '.txt', { type: 'text/plain' }));
  return files;
}
async function msShare() {
  const btn = $('logBild'); if (btn) { btn.disabled = true; btn.textContent = 'Mitschnitt …'; }
  try {
    const files = await msFiles(), vids = files.filter(f => /^mitschnitt/.test(f.name));
    if (!vids.length) { rea('Mitschnitt: noch nichts aufgenommen (es läuft, sobald Musik spielt); teile den Bildbogen'); return bbShare(); }
    rea('Mitschnitt geteilt: ' + vids.length + ' Video' + (vids.length === 1 ? '' : 's') + ' (' + vids.map(f => (f.size / 1048576).toFixed(1).replace('.', ',') + ' MB').join(', ') + '), ' + (files.length - vids.length - 1) + ' Partitur-Blätter, Protokoll ' + LOG_ALL.length + ' Zeilen');
    if (navigator.canShare && navigator.canShare({ files })) { try { await navigator.share({ files, title: 'New Milkdrop Mitschnitt' }); return files.length; } catch (e) { if (e && e.name === 'AbortError') return files.length; } }
    for (const f of files) { const a = document.createElement('a'), u = URL.createObjectURL(f); a.href = u; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); }
    return files.length;
  } finally { if (btn) { btn.disabled = false; msLabel(); } }
}
msShare.ok = () => MS.ok || MS.segs.length > 0;
function msLabel() { const b = $('logBild'); if (b) { b.textContent = msShare.ok() ? 'Mitschnitt' : 'Bildbogen'; b.title = msShare.ok() ? 'Video der letzten Minuten (mit Ton), ganzes Protokoll und Partitur teilen (jedes Video unter 29 MB)' : b.title; } }
msLabel();
window.msShare = msShare; window.msFiles = msFiles; window.__MS = MS; window.MSCFG = MSCFG; window.msCut = msCut;
