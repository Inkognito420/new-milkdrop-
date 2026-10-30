// Acid Milkdrop · Teil 14 von 16: Track-Scan: Datei vorab analysieren
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Reihenfolge ist wichtig: index.html lädt sie nacheinander. Bricht ein Teil ab, starten die folgenden nicht.
if (window.__AM_STEP !== 13) throw new Error('Acid Milkdrop: Teil 14 (track-scan) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== Track-Scan =====
function getDuration(file) {
  return new Promise(res => {
    const a = new Audio(); const url = URL.createObjectURL(file);
    let to = 0;
    const done = v => { clearTimeout(to); URL.revokeObjectURL(url); a.removeAttribute('src'); res(v); };
    to = setTimeout(() => done(NaN), 5000);
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => done(NaN);
    a.src = url;
  });
}
const tick = () => new Promise(r => setTimeout(r, 0));
// Build 102: Rechenzeit in Häppchen. Spielt Musik (die nächsten Tracks werden im Hintergrund analysiert), rechnet die Analyse höchstens
// ca. 6 ms am Stück und macht nach dem nächsten Bild weiter; wartet der Track auf seine Analyse, ca. 30 ms. Versteckt: nur ab und zu
// (Zeitgeber laufen dort gebremst, Bilder gar nicht). Billig aufzurufen: gibt nur ab, wenn das Häppchen voll ist.
const SCAN_SLICE_PLAY = 6, SCAN_SLICE_WAIT = 30;
let scanSliceT = 0, scanSliceN = 0;
async function scanYield() {
  const now = performance.now(), playing = !audio.paused, vis = document.visibilityState === 'visible';
  if (now - scanSliceT < (playing ? SCAN_SLICE_PLAY : SCAN_SLICE_WAIT)) return;
  if (!vis && (++scanSliceN & 63)) return;
  if (playing && vis) await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  else await tick();
  scanSliceT = performance.now();
}
const decodeAudio = (c, buf) => new Promise((res, rej) => { const p = c.decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); });
const SCAN_STOP = { skipped: 'abgebrochen' };       // Ergebnis eines Scans, der nicht mehr gebraucht wurde (wird nicht gemerkt)
const SCAN_SPARSAM_MB = 200;                        // ab dieser geschätzten Puffergröße (ca. 9 Minuten Stereo bei 48 kHz) wird sparsam dekodiert
// alive(): false, sobald niemand den Scan mehr braucht (Build 48). Geprüft wird nach jedem Schritt, der länger dauert (Dauer lesen, Dekodieren,
// jedes Teilstück von 60 s, Nachbearbeitung), nie mittendrin.
async function analyzeFile(file, alive = () => true) {
  const dur = await getDuration(file);
  if (!alive()) return SCAN_STOP;
  if ((isFinite(dur) && dur > 900) || (!isFinite(dur) && file.size > 40e6) || file.size > 150e6) return { skipped: 'lang' };
  // Fortschritt für die Leiste: Scan (Teilstücke) bis 55 %, Klangrollen-Partitur bis 95 %, Nachbearbeitung bis 100 % (ab Build 102 zusammen „Analyse“)
  const report = p => { if (file === curFile && !micOn) setTrackInfo('Analyse ' + Math.round(p * 100) + ' %'); };
  report(0);
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  let SR = 22050;
  try { new OAC(1, 1, SR); } catch (e) { SR = 44100; }
  // Dekodieren. Normale Tracks wie immer in der Rate der Audio-Engine (48 kHz); die Teilstücke unten rechnen sie beim Rendern auf die Scan-Rate um.
  // Das gehört zu den Messwerten: Diese Umrechnung hat keinen Tiefpass, Höhen über 11 kHz falten ins Band darunter. Saubere Umrechnung beim Dekodieren
  // drückte in einem Test die „Helligkeit“ von 0,14 auf 0,05 (Tempo, Abschnitte, Drops und Tonart blieben gleich) und würde die abgestimmte Stimmungswahl
  // verschieben. Nur sehr lange Tracks (oder unbekannte Länge) werden gleich in der Scan-Rate dekodiert (Build 48): das braucht weniger als die Hälfte des Speichers
  // (Stereo, 15 Minuten: etwa 160 statt 345 MB). Geht das nicht, läuft es wie bei normalen Tracks.
  const estMB = isFinite(dur) ? dur * ctx.sampleRate * 8 / 1048576 : Infinity;     // Größe des Puffers bei Stereo und 4 Byte pro Wert
  const sparsam = estMB > SCAN_SPARSAM_MB;
  let raw = await file.arrayBuffer(), decoded = null;
  if (sparsam) { try { decoded = await decodeAudio(new OAC(1, 1, SR), raw); } catch (e) { decoded = null; } }
  if (!decoded) {
    if (sparsam) raw = await file.arrayBuffer();       // decodeAudioData nimmt den Puffer weg: für den zweiten Versuch neu lesen
    decoded = await decodeAudio(ctx, raw);
  }
  raw = null;
  rea('Scan: dekodiert mit ' + decoded.sampleRate + ' Hz, ' + decoded.numberOfChannels + ' Kanäle, ' + (decoded.length * decoded.numberOfChannels * 4 / 1048576).toFixed(0) + ' MB im Speicher'
    + (sparsam ? (decoded.sampleRate === SR ? ' (sparsam, lange Datei)' : ' (sparsam fehlgeschlagen, wie normal)') : ''));
  if (!alive()) return SCAN_STOP;
  const hop = Math.round(SR * 0.02322);
  const segFrames = Math.round(60 / (hop / SR));
  const total = Math.floor(decoded.duration * SR / hop);
  const SUB = 4;                                     // Bassband zusätzlich 4x feiner (ca. 6 ms) für genaues Tempo
  const env = { lowF: new Float32Array(total * SUB), low: new Float32Array(total), m1: new Float32Array(total), m2: new Float32Array(total), hi: new Float32Array(total), full: new Float32Array(total) };
  const keys = ['low', 'm1', 'm2', 'hi', 'full'];
  // Build 41: Klangbild für „Schläge und Töne trennen“ (64 Bänder pro Bild, siehe js/analyse.js)
  let KL = null, KM = null;
  try { KL = klangSetup(SR); KM = new Float32Array(total * KL.NB); } catch (e) { KL = null; }
  // Build 43: Klangmesser (Hektik, Schärfe, Spannung, Filter, Ton pro Takt, siehe js/analyse.js). Läuft im selben Durchlauf, Fehler stoppen den Scan nicht.
  let KX = null, kxErr = '';
  try { KX = kmSetup(SR, hop, total); } catch (e) { KX = null; kxErr = String(e && e.message || e); }
  const PAD = 8 * hop;                               // etwas mehr rendern, damit die Fenster am Abschnittsende nicht ins Leere greifen
  for (let f0 = 0; f0 < total; f0 += segFrames) {
    if (!alive()) return SCAN_STOP;
    const frames = Math.min(segFrames, total - f0);
    const off = new OAC(5, frames * hop + PAD, SR);
    // Build 102: nur das Stück (plus Rand) übergeben, nicht den ganzen Track: sonst übernimmt der Browser bei jedem Teilstück den ganzen
    // Puffer (Test: alle 0,5 s ein Ruckler von ca. 100 ms, während im Hintergrund analysiert wird und Musik läuft)
    const dsr = decoded.sampleRate, at = f0 * hop / SR * dsr, s0 = Math.floor(at), sLen = Math.min(decoded.length - s0, Math.ceil((frames * hop + PAD) / SR * dsr) + 2);
    const seg = ctx.createBuffer(decoded.numberOfChannels, Math.max(1, sLen), dsr);
    for (let c = 0; c < decoded.numberOfChannels; c++) seg.getChannelData(c).set(decoded.getChannelData(c).subarray(s0, s0 + sLen));
    const src = off.createBufferSource(); src.buffer = seg;
    const merger = off.createChannelMerger(5);
    const bq = (type, f) => { const b = off.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = 0.707; return b; };
    const chain = (...nodes) => { let p = src; for (const n of nodes) { p.connect(n); p = n; } return p; };
    chain(bq('lowpass', 130), bq('lowpass', 130)).connect(merger, 0, 0);
    chain(bq('highpass', 300), bq('lowpass', 1000)).connect(merger, 0, 1);
    chain(bq('highpass', 1000), bq('lowpass', 3000)).connect(merger, 0, 2);
    chain(bq('highpass', 7000), bq('highpass', 7000)).connect(merger, 0, 3);
    src.connect(merger, 0, 4);
    merger.connect(off.destination);
    src.start(0, (at - s0) / dsr, (frames * hop + PAD) / SR);
    const r = await off.startRendering();
    for (let c = 0; c < 5; c++) {
      const d = r.getChannelData(c), out = env[keys[c]];
      for (let f = 0; f < frames; f++) {
        if ((f & 255) === 255) await scanYield();
        let s = 0; const base = f * hop;
        for (let k = 0; k < hop; k++) { const v = d[base + k]; s += v * v; }
        out[f0 + f] = Math.sqrt(s / hop);
        if (c === 0) {
          const sh = hop / SUB;
          for (let u = 0; u < SUB; u++) {
            let s2 = 0; const b2 = base + Math.round(u * sh), e2 = base + Math.round((u + 1) * sh);
            for (let k = b2; k < e2; k++) { const v = d[k]; s2 += v * v; }
            env.lowF[(f0 + f) * SUB + u] = Math.sqrt(s2 / Math.max(1, e2 - b2));
          }
        }
      }
    }
    const d4 = r.getChannelData(4);
    if (KL) { for (let f = 0; f < frames; f++) { klangFrame(KL, d4, f * hop, KM, (f0 + f) * KL.NB); if ((f & 31) === 31) await scanYield(); } }
    if (KX) {
      try {
        const nFine = frames * 2, base = f0 * 2;
        for (let c0 = 0; c0 < nFine; c0 += 32) {                  // in Häppchen (scanYield), damit das Bild flüssig bleibt
          if (!alive()) return SCAN_STOP;
          const c1 = Math.min(nFine, c0 + 32);
          for (let q = c0; q < c1; q++) kmFrame(KX, d4, q * KX.hopF, base + q);
          await scanYield();
        }
        for (let p = 0, g = f0 * hop / KX.hopC, n = 0; p + KX.Nc / 2 < frames * hop; p += KX.hopC, g++, n++) { kmChroma(KX, d4, p, g); if ((n & 7) === 7) await scanYield(); }
      } catch (e) { KX = null; kxErr = String(e && e.message || e); }
    }
    report(0.55 * Math.min(1, (f0 + frames) / total));
    await tick();
  }
  if (!alive()) return SCAN_STOP;
  const A = analyzeEnvelopes(env, hop / SR);
  // Build 102: Klangrollen-Partitur (js/14b-partitur.js) braucht noch den Ton und das Raster. Fehler stoppen den Scan nicht.
  if (A.grid && typeof partiturRollen === 'function') {
    try {
      const k0 = performance.now(), P = await partiturRollen(decoded, A, alive, p => report(0.55 + 0.4 * p));
      if (P === SCAN_STOP) return SCAN_STOP;
      A.rollen = P; A.rollenMs = Math.round(performance.now() - k0);
    } catch (e) { A.rollen = null; A.rollenErr = String(e && e.message || e); }
  }
  decoded = null;                                    // der große Ton-Puffer wird ab hier nicht mehr gebraucht: sofort freigeben (iPhone-Speicher)
  report(0.96);
  if (!alive()) return SCAN_STOP;
  if (KL && A.grid) {
    try { const k0 = performance.now(); A.klang = klangBars(A, await klangSplit(KM, total, KL.fc, scanYield), hop / SR); A.klangMs = Math.round(performance.now() - k0); }
    catch (e) { A.klang = null; A.klangErr = String(e && e.message || e); }
  }
  if (!alive()) return SCAN_STOP;
  if (KX && A.grid) {
    try { const k0 = performance.now(); A.km = await kmBars(A, KX, scanYield); A.kmMs = Math.round(performance.now() - k0); }
    catch (e) { A.km = null; A.kmErr = String(e && e.message || e); }
  } else if (kxErr) A.kmErr = kxErr;
  // Build 103: Aufbau-Detektor auf den Klangmesser-Werten pro Takt (js/analyse.js): Drops, Aufbau, drop_strength, ohne feste Längen
  if (A.km) { try { A.aufbau = aufbauFor(A); } catch (e) { A.aufbau = null; A.aufbauErr = String(e && e.message || e); } }
  if (A.aufbau) { try { abschnitteMitDetektor(A); } catch (e) { A.aufbauErr = 'Abschnitte: ' + String(e && e.message || e); } }   // Build 114: Detektor-Drops in die Abschnitte
  if (!alive()) return SCAN_STOP;
  A.file = file;
  return A;
}

// ===== Analyse-Warteschlange (Build 48, ab Build 102 für alle geladenen Tracks) =====
// Es läuft immer nur eine Analyse. Ab Build 102 werden ALLE Tracks der Liste nacheinander analysiert, damit beim Trackwechsel nichts wartet:
// zuerst der laufende Track, dann der nächste, dann der Rest (ab dem übernächsten, am Ende wieder von vorn).
// Springt man auf einen Track, der noch nicht fertig ist, unterbricht eine laufende Analyse eines ANDEREN Tracks am nächsten Häppchen und
// kommt später neu dran (der gewählte Track hat Vorrang). Fliegt ein Track aus der Liste (Notaus), hört seine Analyse auf und wird vergessen.
// Vor jeder Analyse wird im Partitur-Speicher nachgesehen (js/14b-partitur.js): dieselbe Datei ist dann sofort fertig.
const scanQueue = []; let scanJob = null;
const scanWanted = f => queue.indexOf(f) >= 0;
function scanPrio(f) {
  if (f === curFile) return 0;
  const i = queue.indexOf(f), n = queue.length;
  if (i < 0) return 1e9;
  return 1 + ((i - qi - 1) % n + n) % n;               // der nächste 1, der übernächste 2, ... am Ende wieder von vorn
}
const scanInFlight = f => (scanJob && scanJob.file === f) || scanQueue.some(j => j.file === f);
// Der gewählte Track wartet auf seine Analyse, während eine andere läuft: dann die andere unterbrechen
const scanPreempt = job => job.file !== curFile && scanQueue.some(j => j.file === curFile && !j.loading);
function scanDrop(job) {
  if (scanCache.get(job.file) === job.p) scanCache.delete(job.file);
  job.resolve(SCAN_STOP);
}
function scanPump() {
  for (const f of [...scanCache.keys()]) if (!scanWanted(f) && !scanInFlight(f)) scanCache.delete(f);   // nicht mehr in der Liste: vergessen
  if (scanJob) { if (scanPreempt(scanJob)) scanJob.stop = true; return; }
  for (let i = scanQueue.length - 1; i >= 0; i--) if (!scanWanted(scanQueue[i].file)) scanDrop(scanQueue.splice(i, 1)[0]);
  const ready = scanQueue.filter(j => !j.loading);
  if (!ready.length) return;
  ready.sort((x, y) => scanPrio(x.file) - scanPrio(y.file));
  const job = scanJob = ready[0]; scanQueue.splice(scanQueue.indexOf(job), 1); job.stop = false;
  scanBusyUntil = Infinity;
  const t0 = performance.now();
  analyzeFile(job.file, () => !job.stop && scanWanted(job.file) && !scanPreempt(job))
    .catch(e => { err('Analyse fehlgeschlagen: ' + (e && e.message || e)); return { skipped: 'fehler', why: String(e && e.message || e) }; })
    .then(r => {
      scanJob = null; scanBusyUntil = performance.now() + 3000;
      if (r && r.skipped === SCAN_STOP.skipped) {
        if (scanWanted(job.file)) { rea('Analyse von „' + job.file.name + '“ unterbrochen: der gewählte Track zuerst'); scanQueue.push(job); }
        else scanDrop(job);
      } else {
        if (r && !r.skipped) {
          r.secs = +((performance.now() - t0) / 1000).toFixed(1);
          erg('Partitur fertig in ' + r.secs.toFixed(1).replace('.', ',') + ' s: ' + job.file.name);
          if (typeof ptSave === 'function') ptSave(job.file, r);
        }
        job.resolve(r);
      }
      scanPump();
    });
}
function ensureScan(file) {
  let p = scanCache.get(file);
  if (!p) {
    let resolve; p = new Promise(r => { resolve = r; });
    const job = { file, p, resolve, loading: typeof ptLoad === 'function' };
    scanCache.set(file, p); scanQueue.push(job);
    if (job.loading) {
      const t0 = performance.now();
      ptLoad(file).then(A => {
        job.loading = false;
        const i = scanQueue.indexOf(job);
        if (A && i >= 0) {
          scanQueue.splice(i, 1); A.file = file; A.fromStore = true;
          erg('Partitur aus Speicher (' + Math.round(performance.now() - t0) + ' ms): ' + file.name);
          resolve(A);
        }
        scanPump();
      });
    }
    scanPump();
  }
  return p;
}
// Alle Tracks der Liste in die Analyse geben (Reihenfolge macht scanPrio)
function ensureAllScans() { for (const f of queue) ensureScan(f); scanPump(); }

function moodText(md) {
  const tone = md.bright < 0.38 ? 'dunkel' : md.bright > 0.62 ? 'hell' : 'neutral';
  const drive = md.energy > 0.6 ? 'treibend' : md.energy < 0.35 ? 'ruhig' : 'mittel';
  return tone + ' · ' + drive + ' · Acid ' + Math.round(md.acid * 100) + ' %';
}
function drawTimeline(A) {
  const tl = $('timeline');
  if (!A || !A.grid) { tl.hidden = true; return; }
  const dur = audio.duration && isFinite(audio.duration) ? audio.duration : A.duration;
  tl.innerHTML = A.sections.map(s => '<span class="t-' + s.type + '" style="left:' + (100 * s.t0 / dur).toFixed(3) + '%;width:' + (100 * (s.t1 - s.t0) / dur).toFixed(3) + '%"></span>').join('') + '<span id="head" style="left:0"></span>';
  tl.hidden = false;
}
function moveHead() {
  const h = document.getElementById('head');
  if (!h || !curAnalysis || !audio.duration) return;
  h.style.left = (100 * audio.currentTime / audio.duration).toFixed(2) + '%';
}

window.__AM_STEP = 14;
