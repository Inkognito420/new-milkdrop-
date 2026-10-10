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
const decodeAudio = (c, buf) => new Promise((res, rej) => { const p = c.decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); });
const SCAN_STOP = { skipped: 'abgebrochen' };       // Ergebnis eines Scans, der nicht mehr gebraucht wurde (wird nicht gemerkt)
const SCAN_SPARSAM_MB = 200;                        // ab dieser geschätzten Puffergröße (ca. 9 Minuten Stereo bei 48 kHz) wird sparsam dekodiert
// alive(): false, sobald niemand den Scan mehr braucht (Build 48). Geprüft wird nach jedem Schritt, der länger dauert (Dauer lesen, Dekodieren,
// jedes Teilstück von 60 s, Nachbearbeitung), nie mittendrin.
async function analyzeFile(file, alive = () => true) {
  const dur = await getDuration(file);
  if (!alive()) return SCAN_STOP;
  if ((isFinite(dur) && dur > 900) || (!isFinite(dur) && file.size > 40e6) || file.size > 150e6) return { skipped: 'lang' };
  const report = p => { if (file === curFile) setTrackInfo('Scan ' + Math.round(p * 100) + ' %'); };
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
  const visible = () => document.visibilityState === 'visible';
  for (let f0 = 0; f0 < total; f0 += segFrames) {
    if (!alive()) return SCAN_STOP;
    const frames = Math.min(segFrames, total - f0);
    const off = new OAC(5, frames * hop + PAD, SR);
    const src = off.createBufferSource(); src.buffer = decoded;
    const merger = off.createChannelMerger(5);
    const bq = (type, f) => { const b = off.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = 0.707; return b; };
    const chain = (...nodes) => { let p = src; for (const n of nodes) { p.connect(n); p = n; } return p; };
    chain(bq('lowpass', 130), bq('lowpass', 130)).connect(merger, 0, 0);
    chain(bq('highpass', 300), bq('lowpass', 1000)).connect(merger, 0, 1);
    chain(bq('highpass', 1000), bq('lowpass', 3000)).connect(merger, 0, 2);
    chain(bq('highpass', 7000), bq('highpass', 7000)).connect(merger, 0, 3);
    src.connect(merger, 0, 4);
    merger.connect(off.destination);
    src.start(0, f0 * hop / SR, (frames * hop + PAD) / SR);
    const r = await off.startRendering();
    for (let c = 0; c < 5; c++) {
      const d = r.getChannelData(c), out = env[keys[c]];
      for (let f = 0; f < frames; f++) {
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
    if (KL) { for (let f = 0; f < frames; f++) klangFrame(KL, d4, f * hop, KM, (f0 + f) * KL.NB); }
    if (KX) {
      try {
        const nFine = frames * 2, base = f0 * 2;
        for (let c0 = 0; c0 < nFine; c0 += 256) {                 // in Häppchen von ca. 30 ms, damit das Bild flüssig bleibt
          if (!alive()) return SCAN_STOP;
          const c1 = Math.min(nFine, c0 + 256);
          for (let q = c0; q < c1; q++) kmFrame(KX, d4, q * KX.hopF, base + q);
          if (visible()) await tick();
        }
        for (let p = 0, g = f0 * hop / KX.hopC; p + KX.Nc / 2 < frames * hop; p += KX.hopC, g++) kmChroma(KX, d4, p, g);
      } catch (e) { KX = null; kxErr = String(e && e.message || e); }
    }
    report(Math.min(0.9, (f0 + frames) / total));
    await tick();
  }
  decoded = null;                                    // der große Ton-Puffer wird ab hier nicht mehr gebraucht: für die Nachbearbeitung freigeben
  if (!alive()) return SCAN_STOP;
  const A = analyzeEnvelopes(env, hop / SR);
  if (KL && A.grid) {
    try { const k0 = performance.now(); A.klang = klangBars(A, await klangSplit(KM, total, KL.fc, tick), hop / SR); A.klangMs = Math.round(performance.now() - k0); }
    catch (e) { A.klang = null; A.klangErr = String(e && e.message || e); }
  }
  if (!alive()) return SCAN_STOP;
  if (KX && A.grid) {
    try { const k0 = performance.now(); A.km = await kmBars(A, KX, tick); A.kmMs = Math.round(performance.now() - k0); }
    catch (e) { A.km = null; A.kmErr = String(e && e.message || e); }
  } else if (kxErr) A.kmErr = kxErr;
  if (!alive()) return SCAN_STOP;
  A.file = file;
  return A;
}

// ===== Scan-Warteschlange (Build 48) =====
// Es läuft immer nur ein Scan, und gescannt wird nur, was gebraucht wird: der laufende Track zuerst, danach als Vorlauf der nächste der Liste.
// Wer schnell durch die Liste springt, stößt keine Scans mehr an, die niemand braucht (vorher liefen alle der Reihe nach durch, und der Track,
// den man hört, kam erst als letzter dran): wartende Aufträge für andere Tracks fallen weg, ein laufender Scan hört am nächsten Teilstück auf.
// Ein verworfener Scan wird nicht gemerkt; braucht man den Track später doch, startet er neu.
const scanQueue = []; let scanJob = null;
const scanWanted = f => f === curFile || f === queue[qi + 1];
const scanInFlight = f => (scanJob && scanJob.file === f) || scanQueue.some(j => j.file === f);
function scanDrop(job) {
  if (scanCache.get(job.file) === job.p) scanCache.delete(job.file);
  job.resolve(SCAN_STOP);
}
function scanPump() {
  if (scanJob) return;
  for (let i = scanQueue.length - 1; i >= 0; i--) if (!scanWanted(scanQueue[i].file)) scanDrop(scanQueue.splice(i, 1)[0]);
  if (!scanQueue.length) return;
  const k = scanQueue.findIndex(j => j.file === curFile), job = scanJob = scanQueue.splice(k < 0 ? 0 : k, 1)[0];   // der laufende Track hat Vorrang
  scanBusyUntil = Infinity;
  analyzeFile(job.file, () => scanWanted(job.file))
    .catch(e => { err('Scan fehlgeschlagen: ' + (e && e.message || e)); return { skipped: 'fehler' }; })
    .then(r => {
      scanJob = null; scanBusyUntil = performance.now() + 3000;
      if (r && r.skipped === SCAN_STOP.skipped) scanDrop(job); else job.resolve(r);
      scanPump();
    });
}
function ensureScan(file) {
  let p = scanCache.get(file);
  if (!p) {
    let resolve; p = new Promise(r => { resolve = r; });
    scanCache.set(file, p); scanQueue.push({ file, p, resolve });
    while (scanCache.size > 12) { const old = [...scanCache.keys()].find(f => !scanInFlight(f)); if (!old) break; scanCache.delete(old); }   // älteste fertige Scans fallen weg
    scanPump();
  }
  return p;
}

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
