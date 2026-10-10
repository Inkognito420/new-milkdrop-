// Acid Milkdrop · Teil 12 von 16: Live-Erkennung (Kick, Snare, Hats, Acid) und Scan-Modus (Ablauf aus dem Track)
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Reihenfolge ist wichtig: index.html lädt sie nacheinander. Bricht ein Teil ab, starten die folgenden nicht.
if (window.__AM_STEP !== 11) throw new Error('Acid Milkdrop: Teil 12 (erkennung) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== Live-Erkennung: Kick, Snare, Hi-Hats, Acid-Linie =====
function band(lo, hi) { return { lo: Math.max(1, Math.floor(lo / binHz)), hi: Math.min(fbuf.length - 1, Math.ceil(hi / binHz)) }; }
function bandE(b) { let e = 0; for (let i = b.lo; i <= b.hi; i++) e += Math.pow(10, fbuf[i] / 10); return Math.sqrt(e); }
function mkOnset(lo, hi, k, tau, minGap) { return Object.assign(band(lo, hi), { k, tau, minGap, prev: 0, mean: 0, varr: 0, avg: 0, last: 0, e: 0 }); }
function onsetStep(o, t, dt) {
  const e = bandE(o); o.e = e;
  const flux = Math.max(0, e - o.prev); o.prev = e;
  o.mean = ema(o.mean, flux, dt, o.tau);
  o.varr = ema(o.varr, (flux - o.mean) ** 2, dt, o.tau);
  o.avg = ema(o.avg, e, dt, 2500);
  const thr = o.mean + o.k * Math.sqrt(o.varr);
  if (flux > thr && e > o.avg * 0.8 && e > 1e-5 && t - o.last > o.minGap) { o.last = t; return Math.min(1, flux / (thr * 1.8 + 1e-9)); }
  return 0;
}
const det = {
  kick: mkOnset(40, 130, 2.0, 600, 180),
  snare: mkOnset(1500, 5000, 2.2, 500, 120),
  hat: mkOnset(7000, 15000, 1.6, 400, 55),
  mid: mkOnset(300, 3000, 1.6, 500, 80)           // Anschläge in den Mitten: 303-Noten, Synths, Claps (für „Instrumente hören“)
};
const bM1 = band(300, 1000), bM2 = band(1000, 3000);

let dropTimer = 0, reactiveErr = false;           // dropTimer: setzt nach einem Live-Drop den Zustand zurück; reactiveErr: Fehler der feinen Klang-Analyse nur einmal melden
function resetBeat() {
  tonLast = -1;
  clearTimeout(dropTimer);                        // ein Timer vom vorigen Track darf nicht in den neuen hineinfunken
  beat.state = 'warten'; beat.n = 0; beat.iois = []; beat.kickStreak = 0; beat.lastKick = 0;
  for (const k in det) Object.assign(det[k], { prev: 0, mean: 0, varr: 0, avg: 0 });
  build = 0;
}

const LABEL = { warten: '–', intro: 'Intro', groove: 'Groove', break: 'Break', buildup: 'Build-up', drop: 'DROP', outro: 'Outro' };
let shownState = '';
function beatFrame(t) {
  const dt = Math.min(100, t - lastT); lastT = t;
  if (srcNode && ctx.state === 'running') {
    analyser.getFloatFrequencyData(fbuf);
    let all = 0;
    for (let i = 1; i < 200; i += 4) all += Math.pow(10, fbuf[i] / 10);
    all = Math.sqrt(all);
    levelAvg = ema(levelAvg, all, dt, 800);

    det.kick.minGap = Math.min(300, 60000 / bpm * 0.6);
    const kS = onsetStep(det.kick, t, dt); if (kS) onKick(t, kS);
    const sS = onsetStep(det.snare, t, dt); if (sS && t - det.kick.last > 60) { onSnare(sS); if (!scanActive()) { AMI.ht = Math.max(AMI.ht, 0.5 + 0.5 * sS); AMI.n.t++; amiEv('s'); } }
    const hS = onsetStep(det.hat, t, dt); if (hS) { onHat(hS); if (!scanActive()) { AMI.ht = Math.max(AMI.ht, 0.35 + 0.65 * hS); AMI.n.t++; amiEv('h'); } }
    const mS = onsetStep(det.mid, t, dt); if (mS && t - det.kick.last > 50 && !scanActive()) { AMI.hm = Math.max(AMI.hm, 0.4 + 0.6 * mS); AMI.n.m++; amiEv('m'); }
    hiFast = ema(hiFast, det.hat.e + det.snare.e, dt, 800);
    if (reactive) { try { feedBlender(reactive.update(), dt); } catch (e) { if (!reactiveErr) { reactiveErr = true; err('Feine Klang-Analyse (24 Bänder) fehlgeschlagen: ' + (e && e.message || e)); } } }
    { const dec = Math.exp(-dt / 4000), perBeat = bpm / 60 * 4;   // ca. 4 Sekunden Gedächtnis
      snd.kick = snd.kick * dec + kS; snd.hat = snd.hat * dec + hS;
      snd.acid = ema(snd.acid, clamp((acidAct - 0.01) / 0.04), dt, 1500);
      snd.kN = clamp(snd.kick / (perBeat * 0.6)); snd.hN = clamp(snd.hat / (perBeat * 0.9)); }

    // Acid-Linie: Verschiebung zwischen tiefen und hohen Mitten = Filterfahrt der 303
    const m1 = bandE(bM1), m2 = bandE(bM2), r = m2 / (m1 + m2 + 1e-12);
    if (shPlayer) shLevels(dt, det.kick.e, m1 + m2, det.hat.e);
    rFast = ema(rFast, r, dt, 40); rSlow = ema(rSlow, r, dt, 1500);
    const d = rFast - rSlow;
    acidAct = ema(acidAct, Math.abs(d), dt, 300);
    const kn = kmNow();                                                    // Build 43: Filterfahrt des Takts aus dem Scan (0,6 ohne bis 1,4 mit starker Fahrt)
    const hTarget = toggles.acid && (m1 + m2) > 1e-4 ? clamp(d * 300 * (kn ? 0.6 + 0.8 * kn.beweg : 1), -60, 60) : 0;
    hue = ema(hue, hTarget, dt, 80);

    // Stimmung live mitschreiben (für Tracks ohne Scan)
    if (all > 1e-4) {
      live.seen += dt;
      const tot = m1 + m2 + det.hat.e + 1e-9;
      live.bright = ema(live.bright, clamp((det.hat.e / tot - 0.02) / 0.2), dt, 8000);
      live.acid = ema(live.acid, clamp((acidAct - 0.01) / 0.04), dt, 8000);
      live.energy = ema(live.energy, clamp(0.5 * clamp((20 * Math.log10(all + 1e-9) + 30) / 20) + 0.5 * clamp((bpm - 118) / 30)), dt, 8000);
    }
  } else {
    hue = ema(hue, 0, dt, 200);
  }

  if (scanActive()) scanFrame(t);
  else liveFrame(t);

  const st = frozen ? 'FREEZE' : (LABEL[scanActive() ? scanType : beat.state] || '–');
  if (st !== shownState) { shownState = st; $('state').textContent = st; }
}

function liveFrame(t) {
  const P = 60000 / bpm;
  // Lange nicht gelaufen (Scan-Modus, Pause, Track-Ende, Seite im Hintergrund): verpasste Schläge nicht auf einmal nachholen
  // (vorher: bei einer Pause nach 6 Minuten rund 200 Takte in einem Bild, Farbe sprang wild)
  if (t - beat.t > 6 * P) { const skip = Math.floor((t - beat.t) / P) - 1; beat.t += skip * P; beat.n += skip; }
  while (t - beat.t >= P) { beat.t += P; beat.n++; liveTicks++; if (beat.n % 4 === 0) { onBar(beat.state); stillCheck(beat.state, t, P); } onBeat(t, P); }
  const sinceKick = t - beat.lastKick;
  if (beat.state === 'groove' && sinceKick > 8 * P) { beat.breakStart = beat.lastKick; beat.kickStreak = 0; hiAtBreak = hiFast; setLiveState('break', t, P); }
  if (beat.state === 'break' && t - beat.breakStart > 16 * P && hiAtBreak > 0 && hiFast > hiAtBreak * 1.5) { buildStart = t; setLiveState('buildup', t, P); }
  if (beat.state !== 'warten' && levelAvg < 1e-4 && sinceKick > 4000) setLiveState('warten', t, P);
  build = beat.state === 'buildup' ? clamp((t - buildStart) / (32 * P)) : 0;
  dropPre = build * 0.6;                         // ohne Scan weiß niemand, wann der Drop kommt: nur schwacher Aufbau
}
function setLiveState(s, t, P) {
  const prev = beat.state; if (prev === s) return;
  beat.state = s;
  onSection(s, prev, P, t);
}

function onKick(t, strength) {
  if (scanActive()) return;                       // im Scan-Modus kommt der Puls exakt vom Raster (scanFrame)
  kickGlow = 1; AMI.hk = Math.max(AMI.hk, 0.55 + 0.45 * strength);
  pulse = Math.max(pulse, 0.02 + 0.04 * strength);
  const P = 60000 / bpm, gap = t - beat.lastKick;
  if (beat.lastKick && gap < 2000) {
    let p = gap; while (p < 300) p *= 2; while (p > 600) p /= 2;
    beat.iois.push(p); if (beat.iois.length > 24) beat.iois.shift();
    if (beat.iois.length >= 6) {
      const m = beat.iois.slice().sort((a, b) => a - b)[beat.iois.length >> 1];
      setBpm(bpm + (60000 / m - bpm) * 0.25, true);
    }
  }
  beat.lastKick = t; beat.kickStreak++;
  if (beat.state === 'warten' && beat.kickStreak >= 4) { beat.t = t; beat.n = 0; setLiveState('groove', t, P); return; }
  if ((beat.state === 'break' || beat.state === 'buildup') && t - beat.breakStart > 16 * P) {
    beat.t = t; beat.n = 0; setLiveState('drop', t, P);
    clearTimeout(dropTimer); dropTimer = setTimeout(() => { if (beat.state === 'drop') beat.state = 'groove'; }, 16 * P);
    return;
  }
  if (beat.state === 'break' || beat.state === 'buildup') beat.state = 'groove';
  let d = t - beat.t; if (d > P / 2) d -= P;
  if (Math.abs(d) < P * 0.25) beat.t += d * 0.3;
}

function onBeat(t, P) {
  if (!auto || frozen || !toggles.phrase) return;
  if (!(beat.state === 'groove' || beat.state === 'drop')) return;
  const since = beat.n - sectionBeat0;
  if (since > 0 && since % PHRASE_BEATS === 0 && t - sectionChangeT > 8 * P) nextPreset(blendSecs('groove'), moodTarget('groove'), true, 'f');
}

// Build 39: Sicherheitsnetz gegen Stillstand. Vorher wechselte die Automatik mit Scan nur in Groove und Drop
// (Phrasen) und an Abschnittsgrenzen: in langen Intros, Breaks und Outros (oder nach einem Wischer neben dem
// Phrasen-Raster) blieb ein Bild minutenlang stehen. Jetzt: spätestens nach 16 Takten ohne Wechsel auf der nächsten Takt-Eins.
const STILL_BARS = 16;
function stillCheck(type, t, P) {
  if (!auto || frozen || !(P > 0)) return;
  // Build 49: In Groove und Drop wechselt der Phrasen-Sync alle 16 Takte selbst. Das Sicherheitsnetz zählte ab dem Drop-Wechsel und feuerte 4 Takte vor der Phrase:
  // im Protokoll folgte nach jedem Drop (5 von 5) ein zweiter Wechsel genau 7,1 s später. Das Netz gilt nur noch dort, wo kein Phrasen-Wechsel kommt.
  if (toggles.phrase && (type === 'groove' || type === 'drop')) return;
  if (scanActive() ? audio.paused : !micOn && audio.paused) return;
  if (dropPre > 0.05) return;                                   // kurz vor dem Drop nicht dazwischenfunken, der Drop schneidet selbst
  if (t - lastSwitch < STILL_BARS * 4 * P - P / 2) return;
  rea('Wechsel: ' + STILL_BARS + ' Takte ohne Wechsel (' + (type || '–') + ')');
  const k = type === 'warten' || !type ? 'intro' : type;
  nextPreset(blendSecs(k), moodTarget(k), true, 't');
}

// Abschnittswechsel: hier passieren Schnitt, Blitz und Stimmungswechsel
function onSection(type, prev, P, t) {
  rea('Abschnitt: ' + (prev || '–') + ' → ' + type);
  sectionChangeT = t; sectionBeat0 = beat.n;
  if (frozen) return;
  if (type === 'drop') {
    build = 0; vign = 0; dropPre = 0;
    if (toggles.build && !reduceMotion) { bang = 1; if (toggles.bar) barHueTarget += 60; }   // Aufknallen: Farbe satt zurück + Farbsprung
    if (toggles.drop) {
      if (auto) nextPreset(0, moodTarget('drop'), false, 's');
      if (window.__AMX && toggles.mix) mxDrop();                 // Build 46: Mischpult gibt das angesparte Funken-Konto auf einmal aus
      else {
        flash = reduceMotion ? 0.2 : 0.7;
        burst(40);
      }
    }
    pulse = Math.max(pulse, 0.06);
    return;
  }
  if (!auto) return;
  if (!scanActive() && t - lastSwitch < 32 * P) { rea('Wechsel ausgelassen: letzter Wechsel weniger als 8 Takte her'); return; }
  if (type === 'break' && (prev === 'groove' || prev === 'drop')) nextPreset(blendSecs('break'), moodTarget('break'), true, 's');
  else if (type === 'groove' && (prev === 'intro' || prev === 'warten')) nextPreset(blendSecs('groove'), moodTarget('groove'), true, 's');
  else if (type === 'outro') nextPreset(blendSecs('outro'), moodTarget('outro'), true, 's');
}

// ===== Scan-Modus: Ablauf kommt aus dem vorab analysierten Track =====
function sectionAt(A, ts) {
  const S = A.sections; let lo = 0, hi = S.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (S[m].t0 <= ts) lo = m; else hi = m - 1; }
  return S[lo];
}
function scanFrame(t) {
  const A = curAnalysis;
  const ts = audio.currentTime - (+latEl.value) / 1000;
  const bi = Math.floor((ts - A.beat0) / A.beatS);
  beat.n = bi - A.barPhase;
  const s = sectionAt(A, ts);
  scanSec = s;
  const type = s ? s.type : 'intro';
  const P = A.beatS * 1000;
  if (!audio.paused) feedScanHits(A, ts);
  if (type !== scanType) {
    const prev = scanType; scanType = type;
    if (prev !== null) onSection(type, prev, P, t); else sectionChangeT = t;
  }
  build = type === 'buildup' && s ? clamp((ts - s.t0) / Math.max(0.1, s.t1 - s.t0)) : 0;
  // Vorausahnen: der Scan kennt den nächsten Drop. Ab 8 Takten vorher steigt die Spannung, egal ob Break oder Build-up.
  if (!A._drops) A._drops = A.sections.filter(x => x.type === 'drop').map(x => x.t0);
  let nd = -1; for (const d of A._drops) if (d > ts) { nd = d; break; }
  const lead = PRE_BARS * 4 * A.beatS;
  if (type !== 'drop' && nd > 0 && nd - ts < lead && !audio.paused) {
    dropPre = clamp(1 - (nd - ts) / lead);
    if (preLogT !== nd) { preLogT = nd; rea('Drop-Aufbau: Drop in ' + Math.round((nd - ts) / (4 * A.beatS)) + ' Takten (bei ' + nd.toFixed(1) + ' s)'); }
  } else dropPre = 0;
  build = Math.max(build, dropPre);
  if (bi !== lastBi) {
    const prevBi = lastBi; lastBi = bi;
    // Kick-Puls auf dem Raster: kommt pünktlich auf dem Schlag, nicht erst nach der Erkennung
    // Build 42: auch in Intro, Break und Outro, wenn dort wirklich ein Kick läuft (gemessene Stärke kA). Vorher reagierte
    // das Bild z. B. bei Lutgens – Resonance (Intro mit Kick, 111 s) fast zwei Minuten gar nicht auf den Kick.
    const kaHere = A.kA && bi >= 0 && bi < A.kA.length ? A.kA[bi] : null;
    const mainSec = type === 'groove' || type === 'drop' || type === 'buildup';
    if (prevBi !== null && bi === prevBi + 1 && (mainSec || (kaHere !== null && kaHere >= 0.35)) && !audio.paused) {
      const sinceDrop = type === 'drop' ? 1 : 0;
      const kmc = A.km && bi - A.barPhase >= 0 && Math.floor((bi - A.barPhase) / 4) < A.km.n ? A.km.spann[Math.floor((bi - A.barPhase) / 4)] : 0.5;   // Build 43: Spannung des Takts, 0,7 (löst sich) bis 1,3 (baut sich auf, Drop-Anfang)
      const kmg = 0.7 + 0.6 * kmc;
      kickGlow = 1; pulse = Math.max(pulse, kmg * (type === 'drop' ? 0.05 : type === 'buildup' ? 0.02 + 0.03 * build : mainSec ? 0.035 : 0.025));
      { const ka = kaHere === null ? 1 : kaHere; if (ka >= 0.35) AMI.hk = Math.max(AMI.hk, 0.5 + 0.5 * ka); }   // Instrumente hören: nur echte Kicks, mit gemessener Stärke
      if (beat.n % 4 === 0) { pulse += 0.01 * (1 + sinceDrop); onBar(type); }   // Takt-Eins etwas stärker, Farbe springt weiter
    }
    if (prevBi !== null && bi === prevBi + 1 && auto && !frozen && toggles.phrase && (type === 'groove' || type === 'drop')) {
      const since = bi - Math.round((s.t0 - A.beat0) / A.beatS);
      const rest = (s.t1 - ts) / A.beatS;
      if (since > 0 && since % PHRASE_BEATS === 0 && rest >= MIN_REST_BEATS && t - sectionChangeT > 8 * P) nextPreset(blendSecs('groove'), moodTarget('groove'), true, 'f');
    }
    if (prevBi !== null && bi === prevBi + 1 && beat.n % 4 === 0) stillCheck(type, t, P);
  }
}

window.__AM_STEP = 12;
