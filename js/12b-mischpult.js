// Acid Milkdrop · Teil 12b: Kick-Puls, Aufbau und Drop als Bewegung des ganzen Bilds (Mischpult ab Build 46, Build 126 aufgeräumt)
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Dieser Teil ändert window.__AM_STEP NICHT: bricht er ab, läuft Teil 13 trotzdem (einfacher Zoom wie vor Build 46).
if (window.__AM_STEP !== 12) throw new Error('Acid Milkdrop: Teil 12b (mischpult) nicht gestartet, ein früherer Teil ist abgebrochen');

// Das Bild hängt an einer Feder, die auf das Tempo gestimmt ist (ein Schwinger pro Schlag): rein auf dem Kick, raus dazwischen.
// Mit Scan kommt der Stoß so früh, dass die Spitze genau auf dem Kick liegt.
// AUFBAU: vor dem Drop zoomt das Bild langsam rein, einen Schlag vorher zieht es zurück (ausholen), im Drop ein großer Stoß mit Blitz.
// Build 126 (Emmo: keine Werkstatt, Kick-Puls, Aufbau und Drop-Blitz bleiben fest): Drehen, Schwanken, Funken-Konto, Ringe und die
// Anschlüsse an die Schaltzentrale sind entfernt. Übrig ist nur noch der Zoom.

// Dämpfung je Abschnitt (klein = schwingt lange, groß = knackig)
const MX_SEC = { intro: 0.35, groove: 0.40, break: 0.12, buildup: 0.30, drop: 0.55, outro: 0.30 };
const MX_ZAMP = { drop: 0.05, groove: 0.035, buildup: 0.02, intro: 0.025, break: 0.025, outro: 0.025 };   // Zoom pro Kick
const MX_ZMAX = 0.08;                           // Zoom-Deckel (weich, tanh): kleine Werte bleiben fast unverändert, Spitzen höchstens ca. 8 %

const MX = { z: { p: 0, v: 0 }, zeta: MX_SEC.groove, nextBeat: -1e9, lastKickS: 0.8, out: { z: 0, s: 1 }, st: { t: 0, zMax: 0, kicks: 0, drops: 0 } };

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

// Jedes Bild: Zoom-Feder rechnen. Gibt den CSS-Transform für das Bild zurück.
function mxFrame(t, dtMs) {
  const dt = clamp(dtMs / 1000, 0.001, 0.1);
  const playing = (scanActive() || micOn || !audio.paused) && !frozen;
  const sec = sectionKey(), B = mxBeatInfo(t);
  MX.zeta += ((MX_SEC[sec] || MX_SEC.groove) - MX.zeta) * (1 - Math.exp(-dt / Math.max(0.25, B.P * 2)));   // Abschnitts-Charakter weich überblenden
  const wB = 2 * Math.PI / B.P, kn = kmNow();                // eine Schwingung pro Schlag
  let restZ = 0;
  const b = toggles.build ? build : 0;
  if (toggles.build) {
    restZ = 0.06 * b * b;                                                                                          // vor dem Drop zoomt das Bild langsam rein
    if (B.scan && B.toDrop < B.P * 1.05 && sec !== 'drop') restZ = -0.012 * clamp(1 - B.toDrop / B.P) - 0.004;   // letzter Schlag: ausholen
  }
  if (toggles.pulse && playing) {
    // Der Stoß kommt so früh, dass die Feder ihre Spitze genau auf dem Kick hat (tp vorher). Ruckelt das Bild und ein Fenster wird
    // übersprungen, kommt er für den gerade vergangenen Schlag noch bis 0,12 s danach.
    const tp = mxPeakTime(wB, MX.zeta);
    if (B.bn < MX.nextBeat - 2) MX.nextBeat = B.bn - 1;                   // zurückgespult
    if (B.predict) for (const i of [B.bn - 1, B.bn]) {
      const dti = B.dtAt(i), k = i > MX.nextBeat && dti <= tp + 0.008 && dti > -0.12 ? B.kickAt(i) : 0;
      if (!k) continue;
      MX.nextBeat = i;
      let amp = MX_ZAMP[sec] || 0.03;
      if (sec === 'buildup') amp = 0.02 + 0.03 * b;
      if (kn) amp *= 0.7 + 0.6 * kn.spann;                                // Spannung des Takts (Klangmesser): 0,7 bis 1,3
      if (B.oneAt(i)) amp += 0.008;
      mxKick(MX.z, 0.85 * amp * k, wB, MX.zeta); MX.st.kicks++;
    }
    if (!B.predict && AMI.kHit > 0) { mxKick(MX.z, 0.025 * AMI.kHit, wB * 2, 0.4); MX.st.kicks++; }   // ohne Takt: direkt auf den erkannten Kick (Feder doppelt so schnell)
  }
  if (AMI.kHit > 0) MX.lastKickS = clamp(0.55 + 0.45 * AMI.kHit);
  mxSpring(MX.z, wB, MX.zeta, restZ, dt);
  const punch = toggles.pulse ? pulse * (0.2 + 0.25 * clamp((MX.zeta - 0.12) / 0.43)) : 0;   // harter Anschlag oben drauf, im Drop mehr
  let zO = (MX.z.p > 0 ? MX.z.p : 0.5 * MX.z.p) + punch;
  if (zO > 0) zO = mxSoft(zO, MX_ZMAX);                                    // Build 51: weicher Deckel, höchstens ca. 8 %
  const S = 1 + 0.012 + Math.max(-0.012, zO);                              // 1,2 % Grundzoom, damit das Ausholen vor dem Drop Platz hat
  MX.out.z = zO; MX.out.s = S;
  mxStats(t, zO);
  if (Math.abs(S - 1.012) < 0.0005 && !playing) return '';
  return 'scale(' + S.toFixed(4) + ')';
}

// Drop: Blitz und ein großer Zoom-Stoß
function mxDrop() {
  flash = reduceMotion ? 0.2 : 0.7;
  if (toggles.pulse) { const P = scanActive() ? curAnalysis.beatS : 60 / bpm; mxKick(MX.z, 0.09, 2 * Math.PI / P, 0.45); }
  rea('Drop: Blitz ' + Math.round(100 * flash) + ' %' + (toggles.pulse ? ', Zoom-Stoß' : ''));
  MX.st.drops++;
}

// Protokoll: einmal pro Minute, was der Puls getan hat (zum Nachprüfen aus Emmos Protokoll)
function mxStats(t, z) {
  const S = MX.st; if (!S.t) S.t = t;
  if (z > S.zMax) S.zMax = z;
  if (t - S.t < 60000) return;
  if (S.kicks > 0) erg('Puls (letzte Minute): ' + S.kicks + ' Kick-Stöße, Zoom bis ' + (100 * S.zMax).toFixed(1).replace('.', ',') + ' %' + (S.drops ? ' · Drops ' + S.drops : ''));
  Object.assign(S, { t, zMax: 0, kicks: 0, drops: 0 });
}

if (/[?&]debug\b/.test(location.search)) window.__MX = MX;   // nur zum Testen
window.__AMX = true;                                           // Teil 13 nutzt das Mischpult nur, wenn dieser Teil ganz durchgelaufen ist
