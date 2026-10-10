// Acid Milkdrop · Teil 12b: Das Mischpult „Körper & Funken“ (ab Build 46)
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Dieser Teil ändert window.__AM_STEP NICHT: bricht er ab, läuft Teil 13 trotzdem und alles verhält sich wie vor Build 46.
if (window.__AM_STEP !== 12) throw new Error('Acid Milkdrop: Teil 12b (mischpult) nicht gestartet, ein früherer Teil ist abgebrochen');

// Die Idee (Emmo, 09.10.): Es gibt zwei Arten von Reaktion.
//   KÖRPER = alles, was sich bewegt (Zoom, Drehen, Schwanken). Das Bild hat Masse und hängt an Federn.
//            Die Musik schubst, das Bild schwingt nach. Die Zoom-Feder ist auf das Tempo gestimmt (ein Schwinger pro Schlag):
//            rein auf dem Kick, raus auf der Offbeat-Hat. Mit Scan wird der Stoß so früh gegeben, dass die Spitze genau auf dem Kick liegt.
//   FUNKEN = alles, was auftaucht (Funken, Ringe, Blitz). Kostet Energie aus einem Konto. Pro Schlag kommt Energie dazu
//            (Drop viel, Break wenig). Vor dem Drop wird gespart, im Drop wird alles auf einmal ausgegeben.
//   SIDECHAIN = wie im Track: der Kick drückt Drehen und Schwanken kurz weg, große Funken drücken den Körper weg,
//            ein stark schwingender Körper bekommt weniger Funken. Dazu ein Deckel pro Abschnitt (Unruhe-Budget).
//   AUSHOLEN = vor dem Drop wird die Dreh-Feder aufgezogen und das Bild zoomt langsam rein, einen Schlag vorher zieht es zurück,
//            im Drop schnappt die Feder los.
// Ersetzt (Schalter „Mischpult“ an): den alten Zoom aus Kick-Puls + Build-up, die Übergangs-Verformung (Blender),
// Funken-Menge, Ringe, Drop-Blitz und Drop-Funken. Farbe, Vignette und Bildwahl bleiben wie sie sind.

// Charakter je Abschnitt. zeta = Dämpfung (klein = schwingt lange, groß = knackig), cap = Unruhe-Deckel,
// inc = Energie fürs Funken-Konto pro Schlag (relativ), rot/sway = wie viel Drehen und Schwanken, pump = Sidechain-Tiefe
const MX_SEC = {
  intro:   { zeta: 0.35, cap: 0.55, inc: 0.30, rot: 0.7, sway: 0.5, pump: 0.25 },
  groove:  { zeta: 0.40, cap: 0.80, inc: 0.55, rot: 1.0, sway: 1.0, pump: 0.40 },
  break:   { zeta: 0.12, cap: 0.40, inc: 0.15, rot: 1.25, sway: 0.3, pump: 0.10 },
  buildup: { zeta: 0.30, cap: 0.65, inc: 0.40, rot: 0.9, sway: 0.6, pump: 0.30 },
  drop:    { zeta: 0.55, cap: 1.10, inc: 1.30, rot: 0.8, sway: 1.2, pump: 0.50 },
  outro:   { zeta: 0.30, cap: 0.50, inc: 0.25, rot: 0.7, sway: 0.5, pump: 0.25 }
};
const MX_ZAMP = { drop: 0.05, groove: 0.035, buildup: 0.02, intro: 0.025, break: 0.025, outro: 0.025 };   // Zoom pro Kick (wie vorher der Kick-Puls)
const MX_ZMAX = 0.08;                           // Zoom-Deckel (weich, tanh): kleine Werte bleiben fast unverändert
const MX_ROT_MAX = 2.2, MX_SWAY_MAX = 1.4;     // Grad, Prozent der Bildbreite
const MX_SPARK_COST = 0.004, MX_RING_COST = 0.04;

const MX = {
  z: { p: 0, v: 0 }, r: { p: 0, v: 0 }, x: { p: 0, v: 0 }, y: { p: 0, v: 0 },
  c: Object.assign({}, MX_SEC.groove), sec: '',
  konto: 0.4, evLoad: 0, load: 0, comp: 1,
  nextBeat: -1e9, lastBeatN: null, swayDir: 1, windDir: 1, wind: 0, windMax: 0, relUntil: 0,
  lastT: 0, lastKickS: 0.8, out: { z: 0, r: 0, x: 0, y: 0, s: 1 },
  st: { t: 0, zMax: 0, rMax: 0, sMax: 0, sparks: 0, sparksWant: 0, rings: 0, ringsSkip: 0, comp: 0, frames: 0, konto: 0, drops: 0, kicks: 0 }
};

// Hilfen: Feder rechnen (halb-implizit, stabil), Stoß so bemessen, dass die erste Spitze genau amp erreicht
function mxSpring(s, w, zeta, rest, dt) {
  let left = dt;
  while (left > 1e-6) {
    const h = Math.min(0.01, left); left -= h;
    s.v += (-w * w * (s.p - rest) - 2 * zeta * w * s.v) * h;
    s.p += s.v * h;
  }
  if (!isFinite(s.p) || !isFinite(s.v)) { s.p = 0; s.v = 0; }
}
function mxPeakTime(w, zeta) { const z = clamp(zeta, 0.05, 0.95), wd = w * Math.sqrt(1 - z * z); return Math.atan2(Math.sqrt(1 - z * z), z) / wd; }
function mxKick(s, amp, w, zeta) { s.v += amp * w * Math.exp(clamp(zeta, 0.05, 0.95) * w * mxPeakTime(w, zeta)); }
const mxSoft = (v, m) => m * Math.tanh(v / m);

// Musik-Lage: Schlagdauer, nächster Schlag (mit Scan exakt, sonst aus dem Live-Takt), Kick auf einem Schlag ja/nein
function mxBeatInfo(t) {
  if (scanActive()) {
    const A = curAnalysis, ts = audio.currentTime - (+latEl.value) / 1000, P = A.beatS;
    const bn = Math.floor((ts - A.beat0) / P) + 1;
    const sec = sectionKey(), main = sec === 'groove' || sec === 'drop' || sec === 'buildup';
    const kickAt = i => { const ka = A.kA && i >= 0 && i < A.kA.length ? A.kA[i] : null; return (main && (ka === null || ka >= 0.2)) || (ka !== null && ka >= 0.35) ? (ka === null ? 1 : clamp(0.55 + 0.45 * ka)) : 0; };
    let toDrop = 1e9; if (A._drops) for (const d of A._drops) if (d > ts) { toDrop = d - ts; break; }
    return { P, bn, dtAt: i => A.beat0 + i * P - ts, kickAt, oneAt: i => ((i - A.barPhase) % 4 + 4) % 4 === 0, toDrop, scan: true, predict: true };
  }
  const P = 60 / bpm, live = beat.state === 'groove' || beat.state === 'drop' || beat.state === 'buildup';
  const fresh = beat.lastKick && t - beat.lastKick < 2.5 * P * 1000, n0 = beat.n;
  return { P, bn: n0 + 1, dtAt: i => (beat.t + (i - n0) * P * 1000 - t) / 1000, kickAt: () => live && fresh ? MX.lastKickS : 0, oneAt: i => i % 4 === 0, toDrop: 1e9, scan: false, predict: live && fresh };
}

// Jedes Bild: Körper rechnen, Konto füllen, Sidechain und Deckel. Gibt den CSS-Transform für das Bild zurück.
function mxFrame(t, dtMs) {
  const dt = clamp(dtMs / 1000, 0.001, 0.1);
  const playing = (scanActive() || micOn || !audio.paused) && !frozen;
  const sec = sectionKey(), C = MX_SEC[sec] || MX_SEC.groove, B = mxBeatInfo(t);
  // Abschnitts-Charakter weich überblenden (ca. ein halber Takt), damit kein Ruck entsteht
  const kc = 1 - Math.exp(-dt / Math.max(0.25, B.P * 2));
  for (const k in C) MX.c[k] += (C[k] - MX.c[k]) * kc;
  const wB = 2 * Math.PI / B.P;                          // eine Schwingung pro Schlag
  const zZeta = MX.c.zeta, wR = wB / 4, wS = wB / 8;       // Drehen: eine pro Takt, Schwanken: eine pro zwei Takte
  const relax = t < MX.relUntil;                           // nach dem Drop: Feder schwingt frei aus
  const rZeta = relax ? 0.12 : Math.min(0.5, 0.15 + 0.6 * MX.c.zeta);
  const kn = kmNow();

  if (sec !== MX.sec) {
    const prev = MX.sec; MX.sec = sec;
    if (sec === 'drop' && prev && toggles.build && MX.wind) { MX.relUntil = t + 8 * B.P * 1000; rea('Mischpult · Feder gelöst: ' + MX.windMax.toFixed(1).replace('.', ',') + '° schnappen zurück'); MX.windDir = -MX.windDir; MX.windMax = 0; }
  }

  // --- Körper: Zoom (Kick) ---
  let restZ = 0;
  const b = toggles.build ? build : 0;
  if (toggles.build) {
    restZ = 0.06 * b * b;                                                // vor dem Drop zoomt das Bild langsam rein
    if (B.scan && B.toDrop < B.P * 1.05 && sec !== 'drop') restZ = -0.012 * clamp(1 - B.toDrop / B.P) - 0.004;   // letzter Schlag: ausholen
  }
  if (toggles.pulse && playing) {
    // Der Stoß kommt so früh, dass die Feder ihre Spitze genau auf dem Kick hat (tp vorher). Ruckelt das Bild und ein Fenster wird
    // übersprungen, kommt er für den gerade vergangenen Schlag noch bis 0,12 s danach.
    const tp = mxPeakTime(wB, zZeta);
    if (B.bn < MX.nextBeat - 2) MX.nextBeat = B.bn - 1;                   // zurückgespult
    if (B.predict) for (const i of [B.bn - 1, B.bn]) {
      const dti = B.dtAt(i), k = i > MX.nextBeat && dti <= tp + 0.008 && dti > -0.12 ? B.kickAt(i) : 0;
      if (!k) continue;
      MX.nextBeat = i;
      let amp = MX_ZAMP[sec] || 0.03;
      if (sec === 'buildup') amp = 0.02 + 0.03 * b;
      if (kn) amp *= 0.7 + 0.6 * kn.spann;                                // Spannung des Takts (Klangmesser): 0,7 bis 1,3
      if (B.oneAt(i)) amp += 0.008;
      mxKick(MX.z, 0.85 * amp * k, wB, zZeta); MX.st.kicks++;
    }
    if (!B.predict && AMI.kHit > 0) { mxKick(MX.z, 0.025 * AMI.kHit, wB * 2, 0.4); MX.st.kicks++; }   // ohne Takt: direkt auf den erkannten Kick (Feder doppelt so schnell)
  }
  if (AMI.kHit > 0) MX.lastKickS = clamp(0.55 + 0.45 * AMI.kHit);
  mxSpring(MX.z, wB, zZeta, restZ, dt);

  // --- Körper: Drehen (303-Filterfahrt), mit aufgezogener Feder vor dem Drop ---
  const fdir = clamp((rFast - rSlow) * 8, -1, 1);                          // Filter öffnet = +, schließt = -
  const acidW = clamp((acidAct - 0.006) / 0.035) * (kn ? 0.6 + 0.8 * kn.beweg : 1);
  let restR = 0;
  if (toggles.morph && playing) {
    restR = 1.5 * fdir * acidW * MX.c.rot;
    if (AMI.mHit > 0 && acidW > 0.2) MX.r.v += 0.35 * wR * AMI.mHit * (fdir >= 0 ? 1 : -1) * acidW;   // jede 303-Note schubst ein bisschen mit
  }
  if (toggles.build && dropPre > 0.02 && sec !== 'drop') { MX.wind = -MX.windDir * 1.8 * Math.pow(dropPre, 1.5); restR += MX.wind; if (Math.abs(MX.wind) > Math.abs(MX.windMax)) MX.windMax = MX.wind; }
  else MX.wind = 0;
  mxSpring(MX.r, wR, rZeta, restR, dt);

  // --- Körper: Schwanken (Takt-Eins links/rechts, Schlag 3 hoch/runter), wie ein Tänzer, der von Fuß zu Fuß geht ---
  if (beat.n !== MX.lastBeatN) {
    const n = beat.n; MX.lastBeatN = n;
    if (toggles.morph && playing && (B.scan || beat.state !== 'warten')) {
      const dr = kn ? 0.6 + 0.8 * kn.druck : 1, a = 0.8 * MX.c.sway * dr;
      if (((n % 4) + 4) % 4 === 0) { MX.swayDir = -MX.swayDir; mxKick(MX.x, 0.5 * a * MX.swayDir, wS, 0.25); }
      else if (((n % 4) + 4) % 4 === 2) mxKick(MX.y, 0.25 * a * (((n >> 3) & 1) ? 1 : -1), wS, 0.25);
    }
  }
  mxSpring(MX.x, wS, 0.25, 0, dt);
  mxSpring(MX.y, wS, 0.25, 0, dt);

  // --- Funken-Konto: Energie pro Schlag, vor dem Drop sparen ---
  if (playing && (B.scan || beat.state !== 'warten')) {
    const hk = kn ? 0.5 + kn.hektik : 1;
    MX.konto = clamp(MX.konto + 0.07 * MX.c.inc * hk * dt / B.P);
    if (dropPre > 0.05) MX.konto += (1 - MX.konto) * (1 - Math.exp(-dt / (8 * B.P)));   // Ansparen: in 8 Takten fast voll, egal wie viel vorher da war
  }
  MX.evLoad *= Math.exp(-dt / 0.4);

  // --- Sidechain und Deckel ---
  const kickDuck = 1 - MX.c.pump * clamp(AMI.kE);                          // Kick drückt Drehen und Schwanken weg (wie im Track der Kick die Bassline)
  const evDuck = 1 / (1 + 0.8 * MX.evLoad);                                // große Funken drücken den Körper weg
  let zO = MX.z.p, rO = mxSoft(MX.r.p, MX_ROT_MAX) * kickDuck * evDuck, xO = mxSoft(MX.x.p, MX_SWAY_MAX) * kickDuck * evDuck, yO = mxSoft(MX.y.p, MX_SWAY_MAX) * kickDuck * evDuck;
  const punch = toggles.pulse ? pulse * (0.2 + 0.25 * clamp((MX.c.zeta - 0.12) / 0.43)) : 0;   // harter Anschlag oben drauf, im Drop mehr
  zO = (zO > 0 ? zO : 0.5 * zO) * evDuck + punch;
  if (zO > 0) zO = mxSoft(zO, MX_ZMAX);                                    // Build 51: weicher Deckel, im Drop kam der Zoom bis auf 12,5 %, jetzt höchstens ca. 8 %
  const bodyLoad = 0.5 * Math.abs(zO) / 0.05 + 0.35 * Math.abs(rO) / 2 + 0.25 * Math.hypot(xO, yO);
  MX.load += (bodyLoad - MX.load) * (1 - Math.exp(-dt / 0.15));
  const tot = MX.load + MX.evLoad, cap = MX.c.cap, want = tot > cap ? cap / tot : 1;
  MX.comp += (want - MX.comp) * (1 - Math.exp(-dt / (want < MX.comp ? 0.03 : 0.3)));
  if (!relax) { rO *= MX.comp; xO *= MX.comp; yO *= MX.comp; zO *= 0.5 + 0.5 * MX.comp; }

  // --- Ausgabe: Zoom so groß, dass beim Drehen und Schieben nie ein schwarzer Rand zu sehen ist ---
  const Wv = innerWidth || 1, Hv = innerHeight || 1, th = Math.abs(rO) * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
  const cover = Math.max((Wv * cs + Hv * sn) / Wv, (Wv * sn + Hv * cs) / Hv) + 2 * Math.max(Math.abs(xO), Math.abs(yO)) / 100;
  const S = cover * (1 + 0.012 + Math.max(-0.012, zO));
  MX.out.z = zO; MX.out.r = rO; MX.out.x = xO; MX.out.y = yO; MX.out.s = S;
  mxStats(t, zO, rO, xO, yO);
  if (Math.abs(rO) < 0.01 && Math.abs(xO) < 0.005 && Math.abs(yO) < 0.005 && Math.abs(S - 1.012) < 0.0005 && !playing) return '';
  return 'translate(' + xO.toFixed(3) + '%,' + yO.toFixed(3) + '%) rotate(' + rO.toFixed(3) + 'deg) scale(' + S.toFixed(4) + ')';
}

// Bildwechsel: statt der alten Verformung bekommt der Körper einen Stoß (Drehen, Zoom, Schwanken)
function mxTransition(blendS) {
  const P = scanActive() ? curAnalysis.beatS : 60 / bpm, wB = 2 * Math.PI / P;
  const dir = Math.random() < 0.5 ? -1 : 1, s = clamp(blendS / (4 * P), 0.5, 1.5);
  mxKick(MX.r, 1.1 * dir * s, wB / 4, 0.3);
  mxKick(MX.z, 0.02 * s, wB, MX.c.zeta);
  mxKick(MX.x, 0.4 * -dir * s, wB / 8, 0.25);
}

// Funken: wie viele von den geplanten wirklich kommen (Konto, Sparen vor dem Drop, Deckel)
function mxSparks(n) {
  MX.st.sparksWant += n;
  const pre = dropPre > 0.05 ? 0.35 : 1, ev = 1 / (1 + 0.8 * Math.max(0, MX.load - 0.3));
  let m = Math.round(n * (0.35 + 1.3 * MX.konto) * pre * ev);
  m = Math.max(0, Math.min(m, Math.floor(MX.konto / MX_SPARK_COST)));
  MX.konto -= m * MX_SPARK_COST; MX.evLoad += m * 0.012; MX.st.sparks += m;
  return m;
}
function mxRing() {
  if (MX.konto < MX_RING_COST || dropPre > 0.05) { MX.st.ringsSkip++; return false; }
  MX.konto -= MX_RING_COST; MX.evLoad += 0.15; MX.st.rings++;
  return true;
}
// Drop: alles, was angespart ist, auf einmal raus
function mxDrop() {
  const k = MX.konto, n = Math.round(18 + 70 * k);
  flash = reduceMotion ? 0.2 : 0.3 + 0.45 * k;
  burst(n);
  if (toggles.pulse) { const P = scanActive() ? curAnalysis.beatS : 60 / bpm; mxKick(MX.z, Math.min(0.1, 0.05 + 0.05 * k), 2 * Math.PI / P, 0.45); }
  rea('Mischpult · Drop: Konto ' + Math.round(100 * k) + ' % → ' + n + ' Funken, Blitz ' + Math.round(100 * flash) + ' %');
  MX.konto = 0.15; MX.st.drops++;
}

// Protokoll: einmal pro Minute, was das Mischpult getan hat (zum Nachprüfen aus Emmos Protokoll)
function mxStats(t, z, r, x, y) {
  const S = MX.st; if (!S.t) S.t = t;
  S.frames++; S.konto += MX.konto; if (MX.comp < 0.95) S.comp++;
  if (z > S.zMax) S.zMax = z; if (Math.abs(r) > S.rMax) S.rMax = Math.abs(r); const h = Math.hypot(x, y); if (h > S.sMax) S.sMax = h;
  if (t - S.t < 60000) return;
  const f = (v, d) => v.toFixed(d).replace('.', ',');
  if (S.kicks + S.sparks + S.rings > 0) erg('Mischpult (letzte Minute): ' + S.kicks + ' Kick-Stöße, Zoom bis ' + f(100 * S.zMax, 1) + ' %, Drehen bis ' + f(S.rMax, 1) + '°, Schwanken bis ' + f(S.sMax, 1)
    + ' % · Funken ' + S.sparks + ' von ' + S.sparksWant + ', Ringe ' + S.rings + (S.ringsSkip ? ' (' + S.ringsSkip + ' gespart)' : '') + ' · Konto Ø ' + Math.round(100 * S.konto / S.frames) + ' %'
    + ' · gedeckelt ' + Math.round(100 * S.comp / S.frames) + ' % der Zeit' + (S.drops ? ' · Drops ' + S.drops : ''));
  Object.assign(S, { t, zMax: 0, rMax: 0, sMax: 0, sparks: 0, sparksWant: 0, rings: 0, ringsSkip: 0, comp: 0, frames: 0, konto: 0, drops: 0, kicks: 0 });
}

if (/[?&]debug\b/.test(location.search)) window.__MX = MX;   // nur zum Testen
window.__AMX = true;                                           // Teil 13 nutzt das Mischpult nur, wenn dieser Teil ganz durchgelaufen ist
