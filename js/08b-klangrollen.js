// new-milkdrop- · Teil 8b: Klangrollen (Kick, Acid, Hats, Pads) als eigene Variablen für die Presets
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Reihenfolge ist wichtig: index.html lädt sie nacheinander. Bricht ein Teil ab, starten die folgenden nicht.
if (window.__AM_STEP !== 8) throw new Error('new-milkdrop-: Teil 8b (klangrollen) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== Klangrollen =====
// Eigene, von Butterchurn unabhängige Analyse. Hängt parallel am Latenz-Ausgleich (delayNode), hört also dasselbe wie Milkdrop, und läuft live
// (Datei und Mikrofon). Liegt ein Scan vor (curAnalysis), kommen Tempo und Raster (Schlag, Takt, Phrase) aus dem Scan.
// Ergebnis: Objekt AKV mit den Werten unten. Die Schleife (js/09-schleife.js) ruft jedes Bild rollenFrame(t) und gibt AKV an viz.setExtraVars(AKV).
// Die Namen und ihre Reihenfolge legt EINE Stelle fest: AK_VAR_NAMES in vendor/butterchurn/butterchurn.js (AK-PATCH 1).
//
// Alle Variablen (in Preset-Gleichungen a.<name>, in Warp- und Comp-Shadern <name>):
//   R steht für die vier Rollen kick (40-120 Hz), acid (300-3000 Hz), hats (6-16 kHz), pads (150-1500 Hz, nur die langsamen, gleichmäßigen Anteile)
//   R_env      Hüllkurve 0..1, relativ zum gleitenden Maximum der letzten 30 s (Lautstärke egal)
//   R_hit      einzelner Anschlag: springt beim Treffer auf seine Stärke (0..1) und fällt schnell ab
//   R_entry    Impuls 0..1, wenn die Rolle NEU dazukommt, nachdem sie mindestens 1 Takt gefehlt hat (nicht bei jedem Schlag)
//   R_age      1 = gerade neu (entry), fällt in AKCFG.ageBars Takten auf 0
//   R_build    Anwachsen der Hüllkurve über AKCFG.buildBars Takte (0..1)
//   R_release  Ausklingen: steigt, wenn die Rolle leiser wird oder verschwindet, fällt über etwa 1 Takt (0..1)
//   acid_cutoff   wie offen der 303-Filter ist (Schwerpunkt des Acid-Bandes, auf den eigenen Bereich der letzten 30 s normiert, 0..1)
//   acid_squelch  wie schnell sich acid_cutoff gerade ändert (0..1)
//   ak_bpm        Tempo in BPM (gesucht nur in 125..160), NICHT 0..1
//   ak_beatphase  Position im Schlag 0..1
//   ak_bar        Position im Takt 0..1 (4/4)
//   ak_barno      laufende Taktnummer (0, 1, 2, ...)
//   ak_phrase     Position in der 16-Takt-Phrase 0..1, gezählt ab Abschnittsbeginn (wie PHRASE_BEATS)
//   ak_novelty    0..1: wie stark sich der Klang gegenüber den letzten Sekunden ändert
//   ak_section    0 = groove, 1 = break, 2 = buildup, 3 = drop
//
// Alle Schwellwerte an einer Stelle. Zeiten in Millisekunden, wenn nicht anders angegeben.
const AKCFG = {
  fftSize: 4096,            // eigene FFT: bei 48 kHz 11,7 Hz pro Stufe (Butterchurns eigene ist für die Kick-Zone 40-120 Hz zu grob)
  bands: {                  // Frequenzbereiche der Rollen in Hz
    kick: [40, 120], acid: [300, 3000], hats: [6000, 16000], pads: [150, 1500]
  },
  noiseFloorDb: -75,        // Rauschboden: Bandpegel darunter gilt als Stille (dB, Summe über das Band). Hebt den Bezug, damit Rauschen nicht zu 1 wird
  maxWindowSec: 30,         // gleitendes Maximum über so viele Sekunden (Eimer-Maximum)
  maxBuckets: 30,           // so viele Eimer (je maxWindowSec / maxBuckets Sekunden)
  longHalfSec: 120,         // Langzeit-Maximum: Halbwertszeit in s. Fehlt eine Rolle länger als 30 s, rechnet sie kein Rauschen hoch
  longFrac: 0.25,           // Bezug mindestens dieser Anteil des Langzeit-Maximums
  role: {                   // je Rolle: Abklingen der Hüllkurve, Anwesenheit (Hysterese), Anschläge
    kick: { relMs: 90,  onThr: 0.30, offThr: 0.12, onMs: 0,   holdMs: 600, onsetK: 2.0, onsetTau: 600, minGap: 180, hitMin: 0.25, hitDecay: 120 },
    acid: { relMs: 120, onThr: 0.30, offThr: 0.12, onMs: 120, holdMs: 350, onsetK: 1.6, onsetTau: 500, minGap: 70,  hitMin: 0.20, hitDecay: 100 },
    hats: { relMs: 60,  onThr: 0.30, offThr: 0.12, onMs: 60,  holdMs: 300, onsetK: 1.6, onsetTau: 400, minGap: 50,  hitMin: 0.20, hitDecay: 70 },
    pads: { relMs: 1000, onThr: 0.35, offThr: 0.15, onMs: 400, holdMs: 800, onsetK: 2.0, onsetTau: 1500, minGap: 300, hitMin: 0.30, hitDecay: 250 }
  },
  padsSmoothMs: 1000,       // pads: über etwa 1 s geglättet (nur die langsamen Anteile)
  kickMaskMs: 120,          // so lange nach einem Kick-Treffer zählen Acid- und Pads-Band nicht (der Kick-Klick reicht bis in die Mitten)
  fluxLo: 0.03, fluxHi: 0.12,   // Bewegung im Band (relativer spektraler Fluss): darunter gleichmäßig (Pad), darüber bewegt (303)
  fluxTau: 100,             // Glättung des Flusses
  entryAbsentBars: 1,       // entry nur, wenn die Rolle vorher mindestens so viele Takte gefehlt hat
  entryDecay: 300,          // entry-Impuls fällt mit dieser Zeitkonstante
  absentTolBeats: 0.3,      // Toleranz beim Zählen fehlender Schläge (Schläge)
  ageBars: 8,               // age fällt in so vielen Takten von 1 auf 0
  buildBars: 2,             // build vergleicht mit dem Stand vor so vielen Takten
  buildRef: 0.35,           // so viel Anstieg (in env) gilt als build = 1
  lvlTau: 250,              // langsamer Pegel einer Rolle (Grundlage für build und release)
  releaseRef: 0.5,          // so viel Abfall gegenüber dem Höchststand des letzten Takts gilt als release = 1
  bpmMin: 125, bpmMax: 160, // Tempo nur in diesem Bereich suchen (hält Oktavfehler fern)
  bpmDefault: 140,          // Tempo, solange noch keins erkannt ist
  bpmIois: 16,              // so viele Kick-Abstände bilden den Median
  bpmMinIois: 6,            // ab so vielen Abständen gibt es ein erstes Tempo
  bpmSwitchDiff: 2,         // weicht ein neuer Wert mehr als so viele BPM ab, muss er erst gewinnen
  bpmSwitchSec: 3,          // ... und zwar so viele Sekunden lang stabil (±1 BPM)
  bpmFollow: 0.1,           // kleine Abweichungen: so viel pro Kick nachführen
  bpmTrim: 0.06,            // für das Tempo zählen nur Abstände, die höchstens 6 % vom Median abweichen
  phaseFollow: 0.3,         // Schlag-Raster: so viel des Versatzes pro Kick korrigieren
  kickLagMs: 25,            // Analyse-Verzögerung der 4096er-FFT beim Kick (wird vom Treffer-Zeitpunkt abgezogen)
  breakBars: 1,             // break: Kick fehlt mindestens so viele Takte
  dropMinBreakBars: 4,      // drop: Kick kommt nach einem break von mindestens so vielen Takten zurück (kürzer: groove)
  dropHoldBars: 8,          // drop hält so viele Takte, dann groove
  buildupThr: 0.25,         // buildup: build von hats oder acid über diesem Wert ...
  buildupNovelty: 0.5,      // ... oder novelty über diesem Wert ...
  buildupBeats: 1,          // ... mindestens so viele Schläge lang (Kick fehlt weiter)
  buildupMinBars: 2,        // ... frühestens so viele Takte nach Beginn des breaks (der Wegfall des Kicks selbst ist auch „neu“ und zählt nicht)
  silenceMs: 4000,          // so lange Stille: Abschnitte zurück auf Anfang (Track zu Ende, Pause)
  novShortTau: 250, novLongTau: 4000,   // Klangbild jetzt gegen die letzten Sekunden
  novDbRef: 6,              // so viel mittlere Änderung (dB über 8 Bänder) gilt als novelty = 1
  novTau: 150,              // Glättung von novelty
  cutRangeOct: 0.7,         // acid_cutoff: kleinster Bereich in Oktaven (sonst wird Zittern zu großen Sprüngen)
  cutTau: 40,               // Glättung von acid_cutoff
  squelchTau: 120,          // Glättung der Änderungsgeschwindigkeit
  squelchFloor: 1.5         // acid_squelch: so viele Oktaven pro Sekunde gelten mindestens als 1
};
const AK_ROLES = ['kick', 'acid', 'hats', 'pads'];
const AK_SECTION = ['groove', 'break', 'buildup', 'drop'];

// Eimer-Maximum: Maximum der letzten n Eimer zu je ms Millisekunden (feste Größe, kein "new" im Bildtakt)
function akBuckets(n, ms) {
  return { b: new Float32Array(n), i: 0, t0: -1, ms,
    push(v, t) {
      if (this.t0 < 0) { this.t0 = t; this.b.fill(v); return; }
      let k = Math.floor((t - this.t0) / this.ms);
      if (k > 0) { if (k > this.b.length) k = this.b.length; for (let j = 0; j < k; j++) { this.i = (this.i + 1) % this.b.length; this.b[this.i] = v; } this.t0 += Math.floor((t - this.t0) / this.ms) * this.ms; }
      if (v > this.b[this.i]) this.b[this.i] = v;
    },
    max() { let m = -Infinity; for (let j = 0; j < this.b.length; j++) if (this.b[j] > m) m = this.b[j]; return m; },
    reset() { this.t0 = -1; this.b.fill(0); this.i = 0; }
  };
}
const akEma = (avg, x, dt, tau) => tau > 0 ? avg + (x - avg) * (1 - Math.exp(-dt / tau)) : x;
const akClamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;

// Die Analyse selbst: rechnet nur mit dem Spektrum, das sie bekommt (live: eigener Analyser; im Test: aus einer Datei). Alles vorab angelegt.
function akCreate(sampleRate, fftSize) {
  const C = AKCFG, binHz = sampleRate / fftSize, nBins = fftSize / 2;
  const bin = hz => Math.max(1, Math.min(nBins - 1, Math.round(hz / binHz)));
  const hiBin = bin(16000);
  const pw = new Float32Array(hiBin + 1), mg = new Float32Array(hiBin + 1), mgPrev = new Float32Array(hiBin + 1);
  const floorLin = Math.pow(10, C.noiseFloorDb / 20), bucketMs = C.maxWindowSec * 1000 / C.maxBuckets;
  const R = {};
  for (const n of AK_ROLES) {
    const [lo, hi] = C.bands[n];
    R[n] = { n, c: C.role[n], lo: bin(lo), hi: bin(hi), x: 0, e: 0, ref: floorLin, mx: akBuckets(C.maxBuckets, bucketMs), lm: 0,
      env: 0, hit: 0, entry: 0, age: 0, build: 0, release: 0, lvl: 0, peak: 0,
      prevX: 0, fMean: 0, fVar: 0, lastHit: -1e9, seen: false, lastSeen: 0, gap: 0, pend: 0, pendGap: 0, act: false, lastEntry: -1,
      fl: 0, raw: 0, hist: new Float32Array(64), hi_: 0, histT: 0, nEntry: 0 };
  }
  const nb = 8, nbLo = new Int32Array(nb), nbHi = new Int32Array(nb), novS = new Float32Array(nb), novL = new Float32Array(nb);
  for (let k = 0; k < nb; k++) { nbLo[k] = bin(40 * Math.pow(400, k / nb)); nbHi[k] = Math.max(nbLo[k], bin(40 * Math.pow(400, (k + 1) / nb)) - 1); }
  const iois = new Float32Array(C.bpmIois), sorted = new Float32Array(C.bpmIois);
  const cutMax = akBuckets(C.maxBuckets, bucketMs), cutMin = akBuckets(C.maxBuckets, bucketMs), sqMax = akBuckets(C.maxBuckets, bucketMs);
  const S = {
    R, out: {}, t: 0, lastKickHitT: 0,
    bpm: 0, nIoi: 0, iIoi: 0, pendBpm: 0, pendSince: 0, lastIoiHit: 0,
    beatT: 0, beatTotal: 0, barBeat: 0, barno: 0, phase: 0, gridScan: false,
    sec: 0, secStartBeat: 0, kickEver: false, dropEnd: 0, buildupMs: 0, silentMs: 0, total: 0,
    nov: 0, novInit: false, cut: 0.5, cutRaw: 0, cutPrev: -1, cutS: 0.5, sq: 0, sqRate: 0,
    events: null,                                    // nur für Test und Anzeige: [{t, kind, role}] (wird nur gefüllt, wenn gesetzt)
    onEntry: null, onSection: null
  };
  for (const n of AK_ROLES) for (const s of ['env', 'hit', 'entry', 'age', 'build', 'release']) S.out[n + '_' + s] = 0;
  Object.assign(S.out, { acid_cutoff: 0, acid_squelch: 0, ak_bpm: C.bpmDefault, ak_beatphase: 0, ak_bar: 0, ak_barno: 0, ak_phrase: 0, ak_novelty: 0, ak_section: 0 });

  const P = () => 60000 / (S.bpm || C.bpmDefault);
  const fold = ms => { const lo = 60000 / C.bpmMax, hi = 60000 / C.bpmMin; while (ms < lo) ms *= 2; while (ms > hi) ms /= 2; return ms; };
  const foldBpm = b => { if (!(b > 0)) return 0; while (b < C.bpmMin) b *= 2; while (b > C.bpmMax) b /= 2; return akClamp(b, C.bpmMin, C.bpmMax); };

  function bpmFromKick(th) {
    const gap = th - S.lastIoiHit; S.lastIoiHit = th;
    if (!(gap > 150 && gap < 2000)) return;
    iois[S.iIoi] = fold(gap); S.iIoi = (S.iIoi + 1) % iois.length; if (S.nIoi < iois.length) S.nIoi++;
    if (S.nIoi < C.bpmMinIois) return;
    for (let i = 0; i < S.nIoi; i++) { const v = iois[i]; let j = i - 1; while (j >= 0 && sorted[j] > v) { sorted[j + 1] = sorted[j]; j--; } sorted[j + 1] = v; }
    // Mittelwert der Abstände nahe am Median: der Median allein springt zwischen den Bild-Zeitpunkten (16,7 ms Raster), der Mittelwert nicht
    const med = sorted[S.nIoi >> 1]; let sum = 0, cnt = 0;
    for (let i = 0; i < S.nIoi; i++) if (Math.abs(sorted[i] - med) <= med * C.bpmTrim) { sum += sorted[i]; cnt++; }
    const cand = 60000 / (sum / cnt);
    if (!S.bpm) { S.bpm = cand; return; }
    if (Math.abs(cand - S.bpm) <= C.bpmSwitchDiff) { S.bpm += (cand - S.bpm) * C.bpmFollow; S.pendBpm = 0; return; }
    if (!S.pendBpm || Math.abs(cand - S.pendBpm) > 1) { S.pendBpm = cand; S.pendSince = th; return; }
    if (th - S.pendSince >= C.bpmSwitchSec * 1000) { S.bpm = cand; S.pendBpm = 0; ev('bpm', null); }
  }
  function ev(kind, role) { if (S.events) S.events.push({ t: S.t, kind, role, sec: S.sec, bpm: S.bpm }); }
  function setSection(s, startBeat) {
    if (s === S.sec) return;
    S.sec = s; S.secStartBeat = startBeat; S.buildupMs = 0;
    ev('section', AK_SECTION[s]); if (S.onSection) S.onSection(s);
  }

  // Ein Bild: spec = Spektrum in dB (Float32Array, wie getFloatFrequencyData), t und dt in ms; grid (optional) = {bpm, pos} aus dem Scan, pos = Schläge ab der ersten Takt-Eins
  S.step = function (spec, t, dt, grid) {
    S.t = t;
    if (!(dt > 0)) dt = 16.7; if (dt > 100) dt = 100;
    let total = 0;
    for (let k = 1; k <= hiBin; k++) { const d = spec[k]; const p = d > -200 ? Math.pow(10, d / 10) : 0; pw[k] = p; mg[k] = Math.sqrt(p); total += p; }
    total = Math.sqrt(total); S.total = total;
    const silent = total < floorLin;
    S.silentMs = silent ? S.silentMs + dt : 0;
    const masked = t - S.lastKickHitT < C.kickMaskMs;
    const Pm = P(), barMs = 4 * Pm;

    for (const n of AK_ROLES) {
      const r = R[n], c = r.c;
      let amp = 0, fl = 0, fs = 0;
      for (let k = r.lo; k <= r.hi; k++) { amp += pw[k]; const d = mg[k] - mgPrev[k]; if (d > 0) fl += d; fs += mg[k]; }
      amp = Math.sqrt(amp);
      if (n === 'acid' || n === 'pads') {
        // Bewegung im Band: 303-Linien ändern Tonhöhe und Filter von Note zu Note, Pads klingen gleichmäßig. Nach einem Kick-Treffer zählt das Band kurz nicht.
        if (!masked) r.fl = akEma(r.fl, fs > 0 ? fl / fs : 0, dt, C.fluxTau);
        const mov = akClamp((r.fl - C.fluxLo) / (C.fluxHi - C.fluxLo));
        if (!masked) r.raw = n === 'acid' ? amp * mov : akEma(r.raw, amp * (1 - mov), dt, C.padsSmoothMs);
        r.x = r.raw;
      } else r.x = amp;
      // Hüllkurve: sofort hoch, klingt mit relMs ab (pads sind schon geglättet)
      r.e = n === 'pads' ? r.x : Math.max(r.x, r.e * Math.exp(-dt / c.relMs));
      // Bezug: Maximum der letzten 30 s, mindestens ein Teil des Langzeit-Maximums und der Rauschboden
      r.mx.push(r.e, t);
      r.lm = Math.max(r.e, r.lm * Math.pow(0.5, dt / (C.longHalfSec * 1000)));
      r.ref = Math.max(r.mx.max(), r.lm * C.longFrac, floorLin);
      r.env = akClamp(r.e / r.ref);
      // Anschlag: Fluss über dem gleitenden Mittel + k Standardabweichungen
      const flux = Math.max(0, r.x - r.prevX); r.prevX = r.x;
      r.fMean = akEma(r.fMean, flux, dt, c.onsetTau); r.fVar = akEma(r.fVar, (flux - r.fMean) * (flux - r.fMean), dt, c.onsetTau);
      const thr = r.fMean + c.onsetK * Math.sqrt(r.fVar);
      r.hit *= Math.exp(-dt / c.hitDecay);
      if (flux > thr && flux > 0 && r.env >= c.hitMin && t - r.lastHit >= c.minGap && !(masked && n !== 'kick' && n !== 'hats')) {
        r.lastHit = t; const st = akClamp(r.env); if (st > r.hit) r.hit = st;
        if (n === 'kick') onKickHit(t - C.kickLagMs, st);
      }
      // Anwesenheit mit Hysterese; entry nur nach mindestens entryAbsentBars Takten Pause
      const seen = r.env >= c.onThr && !silent;
      if (seen) {
        r.gap = r.lastSeen ? t - r.lastSeen : Infinity;
        if (!r.act && !r.pend && r.gap >= (C.entryAbsentBars * 4 - C.absentTolBeats) * Pm) { r.pend = t; r.pendGap = r.gap; }
        r.lastSeen = t;
      }
      if (r.pend) {
        if (r.env < c.offThr) r.pend = 0;
        else if (t - r.pend >= c.onMs) {
          r.pend = 0; r.act = true; r.entry = 1; r.lastEntry = t; r.nEntry++;
          ev('entry', n); if (S.onEntry) S.onEntry(n);
          if (n === 'kick') onKickReturn(r.pendGap);
        }
      }
      if (r.act && t - r.lastSeen > c.holdMs && r.env < c.offThr) { r.act = false; r.release = 1; ev('weg', n); }
      if (seen && !r.act && r.lastSeen && r.gap < (C.entryAbsentBars * 4 - C.absentTolBeats) * Pm) r.act = true;   // kurz weg und wieder da: kein entry
      r.entry *= Math.exp(-dt / C.entryDecay); if (r.lastEntry === t) r.entry = 1;
      r.age = r.lastEntry >= 0 ? akClamp(1 - (t - r.lastEntry) / (C.ageBars * barMs)) : 0;
      // build und release aus dem langsamen Pegel
      r.lvl = akEma(r.lvl, r.env, dt, C.lvlTau);
      r.histT += dt;
      const histStep = C.buildBars * barMs / r.hist.length;
      while (r.histT >= histStep) { r.histT -= histStep; r.hi_ = (r.hi_ + 1) % r.hist.length; r.hist[r.hi_] = r.lvl; }
      const old = r.hist[(r.hi_ + 1) % r.hist.length];
      r.build = akEma(r.build, akClamp((r.lvl - old) / C.buildRef), dt, 200);
      r.peak = Math.max(r.lvl, r.peak * Math.exp(-dt / barMs));
      r.release = Math.max(r.release * Math.exp(-dt / barMs), r.peak > 0.15 ? akClamp((r.peak - r.lvl) / C.releaseRef) : 0);
      const o = S.out;
      o[n + '_env'] = r.env; o[n + '_hit'] = r.hit; o[n + '_entry'] = r.entry; o[n + '_age'] = r.age; o[n + '_build'] = r.build; o[n + '_release'] = r.release;
    }
    mgPrev.set(mg);

    // acid_cutoff: Schwerpunkt im Acid-Band (in Oktaven), nur solange Acid da ist; normiert auf den eigenen Bereich der letzten 30 s
    { const r = R.acid;
      if (r.act && !masked) {
        let sw = 0, sc = 0; for (let k = r.lo; k <= r.hi; k++) { sw += pw[k]; sc += pw[k] * Math.log2(k * binHz); }
        if (sw > 0) {
          const c = sc / sw; cutMax.push(c, t); cutMin.push(-c, t);
          if (S.cutPrev >= 0) S.sqRate = akEma(S.sqRate, Math.abs(c - S.cutPrev) * 1000 / dt, dt, C.squelchTau);
          S.cutPrev = c;
          const hi = cutMax.max(), lo = -cutMin.max(), range = Math.max(hi - lo, C.cutRangeOct), mid = (hi + lo) / 2;
          S.cutS = akEma(S.cutS, akClamp((c - (mid - range / 2)) / range), dt, C.cutTau);
        }
      } else { S.sqRate = akEma(S.sqRate, 0, dt, C.squelchTau); if (!r.act) S.cutPrev = -1; }
      sqMax.push(S.sqRate, t);
      S.out.acid_cutoff = S.cutS;
      S.out.acid_squelch = akClamp(S.sqRate / Math.max(sqMax.max(), C.squelchFloor));
    }
    // novelty: 8 Bänder (dB) jetzt gegen die letzten Sekunden
    if (!silent) {
      let d = 0;
      for (let k = 0; k < nb; k++) {
        let s = 0; for (let j = nbLo[k]; j <= nbHi[k]; j++) s += pw[j];
        const db = 10 * Math.log10(s + 1e-12);
        if (!S.novInit) { novS[k] = db; novL[k] = db; }
        novS[k] = akEma(novS[k], db, dt, C.novShortTau); novL[k] = akEma(novL[k], db, dt, C.novLongTau);
        d += Math.abs(novS[k] - novL[k]);
      }
      S.novInit = true;
      S.nov = akEma(S.nov, akClamp(d / nb / C.novDbRef), dt, C.novTau);
    } else S.nov = akEma(S.nov, 0, dt, C.novTau);
    S.out.ak_novelty = S.nov;

    // Raster: Schlag, Takt, Phrase
    if (grid && grid.bpm > 0) {
      S.gridScan = true; S.bpm = foldBpm(grid.bpm);
      const pos = Math.max(0, grid.pos), bt = Math.floor(pos);
      S.phase = pos - bt; S.barBeat = ((bt % 4) + 4) % 4; S.barno = Math.floor(bt / 4);
      if (bt !== S.beatTotal) S.beatTotal = bt;
      S.beatT = t - S.phase * P();
    } else {
      S.gridScan = false;
      const Pn = P();
      if (!S.beatT) S.beatT = t;
      if (t - S.beatT > 8 * Pn) { const skip = Math.floor((t - S.beatT) / Pn) - 1; S.beatT += skip * Pn; S.beatTotal += skip; S.barBeat = (S.barBeat + skip) % 4; }
      while (t - S.beatT >= Pn) { S.beatT += Pn; S.beatTotal++; S.barBeat = (S.barBeat + 1) % 4; if (S.barBeat === 0) S.barno++; }
      S.phase = akClamp((t - S.beatT) / Pn, 0, 0.9999);
    }
    // Abschnitte (Regeln in AKCFG): break, buildup, drop, groove
    if (S.silentMs > C.silenceMs) { if (S.sec !== 0 || S.kickEver) { setSection(0, S.beatTotal); S.kickEver = false; } }
    else if (!silent && S.kickEver) {
      const kAbs = t - R.kick.lastSeen;
      if ((S.sec === 0 || S.sec === 3) && kAbs >= (C.breakBars * 4 + C.absentTolBeats) * Pm) setSection(1, S.beatTotal - Math.floor(kAbs / Pm) + 1);
      if (S.sec === 1) {
        const up = R.hats.build >= C.buildupThr || R.acid.build >= C.buildupThr || S.nov >= C.buildupNovelty;
        S.buildupMs = up && (S.beatTotal - S.secStartBeat) >= C.buildupMinBars * 4 ? S.buildupMs + dt : 0;
        if (S.buildupMs >= C.buildupBeats * Pm) setSection(2, S.beatTotal - S.barBeat);
      }
      if (S.sec === 3 && t >= S.dropEnd) setSection(0, S.beatTotal - S.barBeat);
    }
    if (R.kick.env >= R.kick.c.onThr && !silent && !S.kickEver) { S.kickEver = true; if (S.sec !== 0) setSection(0, S.beatTotal); }
    // Rückkehr des Kicks ohne entry (Lücke kürzer als entryAbsentBars), aber nach einem break: groove
    if ((S.sec === 1 || S.sec === 2) && R.kick.lastSeen === t && R.kick.gap < (C.entryAbsentBars * 4 - C.absentTolBeats) * Pm) setSection(0, S.beatTotal - S.barBeat);

    const o = S.out, Pn = P();
    o.ak_bpm = S.bpm || C.bpmDefault;
    o.ak_beatphase = S.phase;
    o.ak_bar = (S.barBeat + S.phase) / 4;
    o.ak_barno = S.barno;
    const since = S.beatTotal - S.secStartBeat + S.phase, PB = typeof PHRASE_BEATS === 'number' ? PHRASE_BEATS : 64;
    o.ak_phrase = since >= 0 ? (since % PB) / PB : 0;
    o.ak_section = S.sec;
    return o;
  };
  // Kick-Treffer: Tempo und Schlag-Raster nachführen
  function onKickHit(th, st) {
    S.lastKickHitT = th + AKCFG.kickLagMs;
    if (st >= 0.4) bpmFromKick(th);
    if (S.gridScan) return;
    const Pn = P(); let d = th - S.beatT; if (d > Pn / 2) d -= Pn; if (d < -Pn / 2) d += Pn;
    if (Math.abs(d) < Pn * 0.25) S.beatT += d * AKCFG.phaseFollow;
  }
  // Kick kommt nach mindestens entryAbsentBars Takten wieder (oder zum ersten Mal): neuer Takt beginnt, Abschnitt entscheiden
  function onKickReturn(gap) {
    const C = AKCFG, Pn = P();
    if (!S.gridScan) {                              // live: der zurückkehrende Kick ist die neue Takt-Eins
      if (S.barBeat !== 0 || S.phase > 0.25) S.barno++;
      S.beatT = S.t - C.kickLagMs; S.barBeat = 0; S.phase = 0;
    }
    if (!S.kickEver) { S.kickEver = true; setSection(0, S.beatTotal); return; }
    const absentBars = gap / (4 * Pn);
    if ((S.sec === 1 || S.sec === 2) && absentBars >= C.dropMinBreakBars) { setSection(3, S.beatTotal - S.barBeat); S.dropEnd = S.t + C.dropHoldBars * 4 * Pn; }
    else if (S.sec !== 3) setSection(0, S.beatTotal - S.barBeat);
  }
  // Neuer Track oder Mikro: Anwesenheit und Abschnitte von vorn (Maxima und Tempo bleiben, sie gleichen sich in Sekunden an)
  S.reset = function () {
    for (const n of AK_ROLES) { const r = R[n]; r.act = false; r.pend = 0; r.lastSeen = 0; r.lastEntry = -1; r.entry = 0; r.age = 0; }
    S.kickEver = false; S.sec = 0; S.secStartBeat = S.beatTotal; S.buildupMs = 0;
  };
  return S;
}

// ===== Live: eigener Analyser parallel am Latenz-Ausgleich =====
const akAn = ctx.createAnalyser();
akAn.fftSize = AKCFG.fftSize; akAn.smoothingTimeConstant = 0;
delayNode.connect(akAn);
const akSpec = new Float32Array(akAn.frequencyBinCount);
const AK = akCreate(ctx.sampleRate, AKCFG.fftSize);
const AKV = AK.out;                                  // diese Werte gehen jedes Bild an viz.setExtraVars
let akT = 0, akErr = false, akSrc = null, akSilent = false, akMs = 0, akN = 0;
// Prüft einmal, ob die Analyse genau die Namen liefert, die die Butterchurn-Kopie erwartet
{ const want = window.AK_VAR_NAMES, have = Object.keys(AKV);
  if (want) { const miss = want.filter(n => !(n in AKV)), extra = have.filter(n => want.indexOf(n) < 0);
    if (miss.length || extra.length) err('Klangrollen: Namen passen nicht zu AK_VAR_NAMES (fehlt: ' + miss.join(',') + ' · zu viel: ' + extra.join(',') + ')'); } }
AK.onEntry = n => { if (akDbg.on) akDbgFlash(n); };
AK.onSection = s => { rea('Klangrollen: Abschnitt ' + AK_SECTION[s] + ' (ak_section ' + s + ')'); };

function rollenFrame(t) {
  try {
    const t0 = performance.now();
    const dt = akT ? t - akT : 16.7; akT = t;
    const src = micOn ? 'mic' : curFile;
    if (src !== akSrc) { akSrc = src; AK.reset(); }
    if (srcNode && ctx.state === 'running' && (micOn || !audio.paused)) { akAn.getFloatFrequencyData(akSpec); akSilent = false; }
    else if (!akSilent) { akSpec.fill(-Infinity); akSilent = true; }
    let grid = null;
    const A = curAnalysis;
    if (A && A.grid && A.beatS > 0 && typeof scanActive === 'function' && scanActive()) {
      const ts = audio.currentTime - (+latEl.value) / 1000;
      grid = { bpm: 60 / A.beatS, pos: (ts - A.beat0) / A.beatS - (A.barPhase || 0) };
    }
    AK.step(akSpec, t, dt, grid);
    if (akDbg.on) akDbgFrame();
    akMs += performance.now() - t0; akN++;
  } catch (e) { if (!akErr) { akErr = true; err('Klangrollen: ' + (e && e.message || e)); } }
  return AKV;
}

// ===== Debug-Anzeige (Schalter in der Werkstatt unter „Anzeige“ oder ?debug in der Adresse). Aus = keine Rechenlast =====
const akDbg = { on: false, el: null, bars: {}, txt: null, flash: null, flashT: 0 };
function akDbgBuild() {
  const d = document.createElement('div'); d.id = 'akDebug';
  d.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:30;font:600 11px/1.3 "Azeret Mono",monospace;color:#fff;background:rgba(0,0,0,.55);padding:6px 8px;border-radius:6px;pointer-events:none;min-width:150px';
  const col = { kick: '#ff3b6b', acid: '#c6ff00', hats: '#33d6ff', pads: '#b18cff' };
  for (const n of AK_ROLES) {
    const row = document.createElement('div'); row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:2px 0';
    const lb = document.createElement('span'); lb.textContent = n.toUpperCase(); lb.style.width = '36px';
    const bg = document.createElement('span'); bg.style.cssText = 'flex:1;height:8px;background:rgba(255,255,255,.15);border-radius:4px;overflow:hidden';
    const b = document.createElement('span'); b.style.cssText = 'display:block;height:100%;width:0;background:' + col[n];
    bg.appendChild(b); row.appendChild(lb); row.appendChild(bg); d.appendChild(row); akDbg.bars[n] = b;
  }
  akDbg.txt = document.createElement('div'); d.appendChild(akDbg.txt);
  akDbg.flash = document.createElement('div'); akDbg.flash.style.cssText = 'font-size:16px;color:#c6ff00;min-height:20px'; d.appendChild(akDbg.flash);
  document.body.appendChild(d); akDbg.el = d;
}
function akDbgSet(on) {
  akDbg.on = !!on;
  if (on && !akDbg.el) akDbgBuild();
  if (akDbg.el) akDbg.el.hidden = !on;
  const b = $('akDbgBtn'); if (b) b.classList.toggle('hot', akDbg.on);
}
function akDbgFlash(n) { akDbg.flash.textContent = n.toUpperCase() + ' NEU'; akDbg.flashT = performance.now(); }
function akDbgFrame() {
  for (const n of AK_ROLES) akDbg.bars[n].style.width = Math.round(AKV[n + '_env'] * 100) + '%';
  const s = Math.round(AKV.ak_bpm) + ' BPM · ' + AK_SECTION[AKV.ak_section].toUpperCase() + ' · Takt ' + AKV.ak_barno + ' · ' + (akN ? (akMs / akN).toFixed(2) : '–') + ' ms';
  if (akDbg.txt.textContent !== s) akDbg.txt.textContent = s;
  if (akDbg.flashT && performance.now() - akDbg.flashT > 800) { akDbg.flash.textContent = ''; akDbg.flashT = 0; }
}
{ const box = [...document.querySelectorAll('#werk .grp')].find(g => g.querySelector('.gl').textContent === 'Anzeige');
  const b = document.createElement('button'); b.id = 'akDbgBtn'; b.type = 'button'; b.textContent = 'Klangrollen-Anzeige';
  b.title = 'Zeigt unten links, was die Klangrollen-Analyse hört: Balken für Kick, Acid, Hats, Pads, „NEU“ beim Einsatz, Tempo und Abschnitt. Nur zum Prüfen.';
  b.addEventListener('click', () => akDbgSet(!akDbg.on));
  if (box) box.appendChild(b);
  if (/[?&]debug\b/.test(location.search)) akDbgSet(true);
}
// Alle 5 Minuten ins Protokoll: wie viel Rechenzeit die Analyse braucht
setInterval(() => { if (akN > 600) { erg('Klangrollen: ' + (akMs / akN).toFixed(2).replace('.', ',') + ' ms pro Bild im Schnitt · ' + Math.round(AKV.ak_bpm) + ' BPM · Abschnitt ' + AK_SECTION[AKV.ak_section]); akMs = 0; akN = 0; } }, 300000);
