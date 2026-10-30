// new-milkdrop- · Teil 13b: Schaltzentrale (Teil 3a ab Build 106, 3b ab Build 109, Bit-Salat und Akzente ab Build 112)
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Dieser Teil ändert window.__AM_STEP NICHT: bricht er ab, läuft alles wie in Build 105 (die Anschlüsse in js/01, 04, 12, 12b prüfen window.__SZ).
if (window.__AM_STEP !== 13) throw new Error('new-milkdrop-: Teil 13b (schaltzentrale) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== Idee: jede Klangrolle bekommt genau EINE Bildebene, wie Kanäle am Mischpult =====
// Dieser Teil (3a) macht drei Ebenen und den Dirigenten. Er benutzt nur Werte, die die Klangrollen schon liefern (AKV, js/08b), und schreibt nur
// in Anschlüsse, die der Rest des Programms kennt. Die Presets und die Butterchurn-Kopie bleiben unverändert.
//   RAUM   (Stereo)  ak_pan, ak_pan_speed, ak_width  → Bild nach links/rechts schieben und verziehen (skewX). Ersetzt das Schwanken im Takt,
//                    solange Stereo-Bewegung da ist; ohne Stereo-Bewegung bleibt das alte Schwanken (Rückfall).
//   SEITEN (Build 108) hats_side, ak_side (nur in AK.side, nicht in AKV) → Funken entstehen auf der Bildseite, auf der der Hats-Treffer klingt;
//                    Breite (ak_width) + Seiten-Puls lassen das Bild leicht atmen (Zoom). Gehört zum Regler „Raum“ (0 = Funken wie vorher zufällig).
//   KICK   (Build 108) Zoom-Puls und Drehen im Takt (Richtung wechselt je Takt, vorher 303-Filterfahrt); im Break fährt die Ebene herunter,
//                    das Bild atmet nur mit den Pads. Quelle: Scan-Raster (A.kA) im Mischpult, nicht die Kick-Treffer der Klangrollen.
//   PADS   (Farbe)   pads_env, pads_pitch, pads_entry → Farbton gleitet (Tempo = Lautstärke der Pads), Helligkeit und Sättigung folgen der Tonhöhe
//                    (tief = düster und satt, hoch = hell und leuchtend), pads_entry = weicher Farbwechsel. Takt-Farbe: kleiner Schritt, mit Pads halb,
//                    ohne Pads größer (mit Obergrenze), damit die Farbe nicht stehen bleibt.
//   HATS   (Details) hats_density → Menge der Funken (Mischpult, mxSparks).
//   DIRIGENT         ak_build_strength → Aufbau (statt fester 8 Takte), ak_drop_strength → Wucht des Drops (statt immer gleich stark).
//   ACID   (Build 110) Verzerrung im Ausgabe-Durchgang (AK-PATCH 10); HATS-Körnung und Glitzern im Comp-Shader.
//   BIT-SALAT (Build 112, AK-PATCH 11) Glitch: Blockversatz (auf der Seite des Hats-Treffers), RGB-Versatz, Farbstufen. Leise aus Hats-Dichte und
//                    Acid-Resonanz, stark im Aufbau (ak_build_strength) und als Stoß am Drop (ak_drop_strength, klingt über ca. 4 s ab).
//   AKZENTE (Build 112) R_entry/R_release je Ebene: Kick-Einsatz = Puls-Neustart (Zoom-Stoß, nicht im Drop, der hat seinen eigenen),
//                    Acid-Einsatz = Verzerrungs-Ruck, Hats-Einsatz = Funkenregen, Hats-Ausklingen = weniger neue Funken und Körnung. Pads: siehe oben.
// Alles stark geglättet; jede Ebene einzeln in der Werkstatt (Gruppe „Schaltzentrale“) von 0 bis 150 % einstellbar.
const SZCFG = {
  gain: { raum: 1, pads: 1, hats: 1, dirigent: 1, kick: 1, acid: 1, bit: 1 },      // Voreinstellung der Regler (1 = 100 %)
  panMaxFloorSec: 6,        // Position wird auf ihr gleitendes Maximum der letzten Sekunden bezogen (live erreicht sie nur ca. ±0,5, offline ±0,9)
  panFloor: 0.35,           // ... mindestens dieses Maximum (sonst würde Rauschen bei Mono voll ausschlagen)
  panSmoothMs: 120,         // Glättung der Position für das Bild (flackerfrei)
  panSlew: 5,               // größte Änderung der (normierten) Position pro Sekunde, unabhängig von der Bildrate: ein voller Seitenwechsel dauert mindestens 0,4 s,
                            // darum werden sehr schnelle Wechsel (Sechzehntel) zu einem sanften Schimmern statt Flackern (1,3 % × 5 = 6,5 % pro Sekunde)
  moveMin: 0.12, moveFull: 0.5,   // größter |ak_pan| der letzten Sekunden: darunter keine Raum-Bewegung, ab moveFull volle
  widthDead: 0.12,          // Breite unter diesem Wert zählt als Mono (Test-Track mit leicht gepanntem Rauschen: Breite 0,07-0,1)
  breathMax: 0.012,         // Breite lässt das Bild atmen: Zoom höchstens +1,2 % (Build 108), mal Breite und Seiten-Puls, geglättet
  breathMs: 700,            // Glättung des Atmens (Anstieg und Abfall: höchstens ca. 1,5 Wechsel pro Sekunde)
  kickBreak: 0.25,          // Kick-Ebene im Break: so viel bleibt vom Kick-Puls (Bild atmet dann nur mit den Pads)
  kickMs: 900,              // so langsam fährt die Kick-Ebene im Break herunter und danach wieder hoch
  kickRot: 0.25,            // Drehen im Takt: Anstoß je Kick (mal Welle des Takts); die Richtung wechselt mit jeder Takt-Eins
  acidRotShare: 0.7,        // so viel vom Drehen der 303-Filterfahrt geht an die Kick-Ebene über (bei Regler Kick 100 %)
  breakBreath: 0.012,       // im Break atmet das Bild mit den Pads: Zoom höchstens +1,2 % mal Pads-Pegel
  acidUpMs: 80, acidDownMs: 450,     // Acid-Verzerrung (Build 109, AK-PATCH 10): Anstieg frühestens 60 ms, Abfall frühestens 300 ms
  acidBuild: 0.6, acidDrop: 0.4,     // Aufbau (ak_build_strength) und Drop (ak_drop_strength) verstärken die Verzerrung um bis zu so viel
  acidPhase: [0.12, 1.2],            // Wellen-Tempo (Umdrehungen pro Sekunde) bei ruhigem / schnell wechselndem Filter (acid_squelch)
  grainMax: 0.7, glitterMax: 0.8,    // Hats-Körnung und Glitzern: größte Stärke (Shader: Körnung ±6 %, Glitzer-Punkte bis +0,28)
  grainMs: [120, 500], seedHz: 3,    // Hats-Hüllkurve für das Bild: Anstieg/Abfall in ms; neue Körnungs-Muster höchstens 3 pro Sekunde (kein Flackern)
  actMs: 900,               // so langsam geht die Ebene „Raum“ an und aus
  xMaxPct: 1.3,             // größte Verschiebung (Prozent der Bildbreite)
  skewMaxDeg: 1.0,          // größte Verzerrung (Grad)
  padHueDegPerSec: 5,       // Farbton-Gleiten bei vollen Pads
  padEntryDeg: 28,          // Farbwechsel bei pads_entry
  padHueMs: 600,            // Glättung des Farbwechsels
  padBright: 0.13,          // Helligkeit ± bei tiefstem/höchstem Pad-Ton (mal pads_env)
  padSat: 0.16,             // Sättigung ± (tief satt, hoch leuchtend: weniger)
  padSmoothMs: 1500,        // Glättung von Pads-Pegel und Tonhöhe fürs Bild
  barStepWith: 0.5, barStepWithout: 1.4, barStepMax: 40,   // Takt-Farbschritt: mit Pads, ohne Pads, Obergrenze in Grad
  hatsMin: 0.5, hatsMax: 1.5,                              // Funken-Menge: 50 % bei keiner Hats-Dichte bis 150 % bei dichten Hats
  dropWuchtMin: 0.5, dropWuchtMax: 1.4,                    // Drop-Wucht (Blitz, Funken, Zoom-Stoß) aus ak_drop_strength 0..1
  bitHats: 0.5, bitHit: 0.35, bitAcid: 0.5,   // Bit-Salat im Groove (Build 113, vorher 0,35/0/0,25: im Groove nur 0,06-0,14 = unsichtbar): Hats-Pegel (hats_env × (0,4 + 0,6 × hats_density)),
                                     // Zucken auf jedem Hats-Treffer (hats_hit), Acid-Kanten (acid_env × acid_reso)
  bitBuild: 0.7, bitDrop: 1.0,       // ... im Aufbau dazu (mal ak_build_strength²: steigt erst spät stark), am Drop als Stoß (mal ak_drop_strength)
  bitDropMs: 4000, bitMax: 0.85,     // Drop-Stoß klingt so langsam ab; größte Stärke (Shader: Blöcke bis 4 % der Breite, Farbstufen bis 5)
  bitUpMs: 60, bitDownMs: 600, bitMin: 0.03, bitBreak: 0.35,   // ... im Break nur so viel (Bild weit und ruhig)   // Glättung (Anstieg/Abfall); darunter ist der Filter ganz aus (Durchgang übersprungen)
  entry: 0.8,                        // ab diesem R_entry gilt ein Einsatz (einmal pro Anstieg)
  kickEntryZoom: 0.018,              // Kick-Einsatz: Zoom-Stoß (Teil des 8-%-Deckels im Mischpult)
  acidJolt: 0.35, acidJoltMs: 400,   // Acid-Einsatz: Verzerrungs-Ruck, klingt so schnell ab
  hatsEntrySpark: 2,                 // Hats-Einsatz: ein Funkenregen (wie ein starker Hats-Treffer, kostet Konto)
  hatsReleaseCut: 0.7                // Hats-Ausklingen: so viel weniger neue Funken und Körnung bei hats_release 1
};
const SZ = { gain: Object.assign({}, SZCFG.gain), on: true, panMax: SZCFG.panFloor, panS: 0, act: 0, acA: 0, acPh: 0, gr: 0, gl: 0, stage: new Float32Array(8), kickS: 1, kickDir: 1, speedS: 0, widthS: 0,
  pe: 0, pp: 0.5, hueT: 0, hue: 0, entryPrev: 0, bright: 1, satMul: 1, x: 0, skew: 0, lastT: 0,
  bit: 0, bitDrop: 0, bitHold: 0, bitPub: 0, seedPrev: -1, secPrev: 0, acJolt: 0, ePrev: { kick: 0, acid: 0, hats: 0 },
  st: { n: 0, act: 0, actMax: 0, bMin: 9, bMax: 0, drops: 0, t: 0, sp: 0, spL: 0, spR: 0, ac: 0, acMax: 0, gr: 0, bit: 0, bitMax: 0, ek: 0, ea: 0, eh: 0 } };
{ const g = store.get('sz-gain', null); if (g) for (const k in SZ.gain) if (typeof g[k] === 'number' && g[k] >= 0 && g[k] <= 1.5) SZ.gain[k] = g[k]; }
// Einsatz einer Rolle: einmal, wenn R_entry über SZCFG.entry steigt
function szEntry(name) { const v = AKV[name + '_entry'], was = SZ.ePrev[name]; SZ.ePrev[name] = v; return v > SZCFG.entry && was <= SZCFG.entry; }
const szActive = () => SZ.on && toggles.mix && !reduceMotion;
const szScan = () => scanActive() && curAnalysis && curAnalysis.aufbau;

// Jedes Bild (aus mxFrame, Teil 12b): Ebenen rechnen. dt in Sekunden.
function szFrame(dt) {
  const V = AKV, ems = (a, x, ms) => a + (x - a) * (1 - Math.exp(-dt * 1000 / ms));
  // RAUM
  SZ.panMax = Math.max(SZCFG.panFloor, Math.abs(V.ak_pan), SZ.panMax * Math.exp(-dt / SZCFG.panMaxFloorSec));
  { const tgt = ems(SZ.panS, Math.max(-1, Math.min(1, V.ak_pan / SZ.panMax)), SZCFG.panSmoothMs), mxStep = SZCFG.panSlew * dt;
    SZ.panS += Math.max(-mxStep, Math.min(mxStep, tgt - SZ.panS)); }
  SZ.speedS = ems(SZ.speedS, V.ak_pan_speed, SZCFG.actMs); SZ.widthS = ems(SZ.widthS, V.ak_width, SZCFG.actMs);
  SZ.panRaw = Math.max(Math.abs(V.ak_pan), (SZ.panRaw || 0) * Math.exp(-dt / SZCFG.panMaxFloorSec));
  // Build 106 (iPhone-Protokoll: Raum Ø 0,97 bei einem breiten, aber mittigen Track ohne Ping-Pong, Breite 0,75, Wechsel-Tempo 0): aktiv wird die Ebene nur, wenn die Position
  // wirklich ausschlägt (größter Ausschlag der letzten Sekunden über moveMin, voll ab moveFull). Breite allein genügt nicht.
  const move = Math.max(0, Math.min(1, (SZ.panRaw - SZCFG.moveMin) / (SZCFG.moveFull - SZCFG.moveMin)));
  const wd = Math.max(0, SZ.widthS - SZCFG.widthDead) / (1 - SZCFG.widthDead);
  const want = move * (0.5 + 0.5 * Math.min(1, 4 * SZ.speedS + 1.5 * wd));
  SZ.act = ems(SZ.act, szActive() ? want : 0, SZCFG.actMs);
  const g = SZ.gain.raum * SZ.act;
  SZ.x = SZ.panS * SZCFG.xMaxPct * g; SZ.skew = SZ.panS * SZCFG.skewMaxDeg * g;
  SZ.kickS = ems(SZ.kickS, szActive() && sectionKey() === 'break' ? SZCFG.kickBreak : 1, SZCFG.kickMs);
  SZ.breath = ems(SZ.breath || 0, szActive() ? SZCFG.breathMax * SZ.gain.raum * wd * (0.5 + 0.5 * AKSIDE.ak_side) : 0, SZCFG.breathMs);
  // AKZENTE (Build 112): Einsatz einer Rolle nach mindestens einem Takt Pause
  { const on = szActive(), eK = szEntry('kick'), eA = szEntry('acid'), eH = szEntry('hats');
    if (on && eK && SZ.gain.kick > 0 && toggles.pulse && sectionKey() !== 'drop' && typeof mxKick === 'function') {
      const P = scanActive() ? curAnalysis.beatS : 60 / bpm; mxKick(MX.z, SZCFG.kickEntryZoom * Math.min(1.5, SZ.gain.kick), 2 * Math.PI / P, MX.c.zeta); SZ.st.ek++; }
    if (on && eA && SZ.gain.acid > 0) { SZ.acJolt = SZCFG.acidJolt * Math.min(1.5, SZ.gain.acid); SZ.st.ea++; }
    if (on && eH && SZ.gain.hats > 0 && typeof onHat === 'function') { onHat(SZCFG.hatsEntrySpark * Math.min(1.5, SZ.gain.hats)); SZ.st.eh++; } }
  SZ.acJolt *= Math.exp(-dt * 1000 / SZCFG.acidJoltMs);
  // ACID (Verzerrung) und HATS (Körnung, Glitzern): Werte für die Endstufe in der Butterchurn-Kopie (AK-PATCH 10). Alles 0 = Stufe übersprungen.
  { const on = szActive(), ga = on ? Math.min(1.5, SZ.gain.acid) : 0, gh = on ? Math.min(1.5, SZ.gain.hats) : 0, dg = on && SZ.gain.dirigent > 0 && szScan() ? Math.min(1.5, SZ.gain.dirigent) : 0;
    const wA = V.acid_env * (0.25 + 0.75 * V.acid_cutoff) * (1 + dg * (SZCFG.acidBuild * V.ak_build_strength + SZCFG.acidDrop * V.ak_drop_strength * (V.ak_section === 3 ? 1 : 0)));
    const tA = Math.min(1, Math.min(1, wA) * ga + SZ.acJolt);
    SZ.acA = ems(SZ.acA, tA, tA > SZ.acA ? SZCFG.acidUpMs : SZCFG.acidDownMs);
    SZ.acPh = (SZ.acPh + dt * (SZCFG.acidPhase[0] + (SZCFG.acidPhase[1] - SZCFG.acidPhase[0]) * V.acid_squelch)) % 1000;
    const tG = Math.min(1, V.hats_env * (0.3 + 0.7 * V.hats_density)) * gh * (1 - SZCFG.hatsReleaseCut * V.hats_release);
    SZ.gr = ems(SZ.gr, tG, tG > SZ.gr ? SZCFG.grainMs[0] : SZCFG.grainMs[1]);
    SZ.gl = ems(SZ.gl, Math.min(1, V.hats_hit * 0.6 + 0.4 * tG) * gh, SZ.gl < tG ? SZCFG.grainMs[0] : SZCFG.grainMs[1]);
    const st = SZ.stage; st[0] = SZ.acA < 0.003 ? 0 : SZ.acA; st[1] = SZ.acPh; st[2] = SZ.acA < 0.003 ? 0 : V.acid_reso;
    st[4] = SZ.gr < 0.01 ? 0 : SZ.gr * SZCFG.grainMax; st[5] = SZ.gl < 0.01 ? 0 : SZ.gl * SZCFG.glitterMax; st[6] = AKSIDE.hats_side * (on ? Math.min(1, SZ.gain.raum) : 0);
    st[7] = Math.floor(performance.now() / 1000 * SZCFG.seedHz) % 997;
    // BIT-SALAT (AK-PATCH 11): leise aus Hats und Acid-Kanten, stark im Aufbau, Stoß am Drop. Muster wechselt nur mit der Saat st[7] (höchstens 3 pro Sekunde)
    const gb = on ? Math.min(1.5, SZ.gain.bit) : 0;
    if (V.ak_section === 3 && SZ.secPrev !== 3 && dg > 0) SZ.bitDrop = Math.max(SZ.bitDrop, V.ak_drop_strength > 0 ? V.ak_drop_strength : 0.6);
    SZ.secPrev = V.ak_section; SZ.bitDrop *= Math.exp(-dt * 1000 / SZCFG.bitDropMs);
    const bb = V.ak_build_strength, tB = Math.min(SZCFG.bitMax, gb * ((SZCFG.bitHats * V.hats_env * (0.4 + 0.6 * V.hats_density) + SZCFG.bitHit * V.hats_hit) * (1 - SZCFG.hatsReleaseCut * V.hats_release) + SZCFG.bitAcid * V.acid_env * V.acid_reso
      + dg * (SZCFG.bitBuild * bb * bb * (V.ak_section === 3 ? 0 : 1) + SZCFG.bitDrop * SZ.bitDrop)));
    SZ.bit = ems(SZ.bit, tB * (V.ak_section === 1 ? SZCFG.bitBreak : 1), tB > SZ.bit ? SZCFG.bitUpMs : SZCFG.bitDownMs);
    // Build 113: die Stärke (sie bestimmt auch, WELCHE Blöcke verrutschen) geht nur zusammen mit einem neuen Muster an den Shader, als Höchstwert seit dem letzten:
    // so zucken die Blöcke mit den Hats, wechseln aber nie öfter als die Saat (höchstens 3 pro Sekunde)
    SZ.bitHold = Math.max(SZ.bitHold, SZ.bit);
    if (st[7] !== SZ.seedPrev) { SZ.seedPrev = st[7]; SZ.bitPub = SZ.bitHold; SZ.bitHold = SZ.bit; }
    st[3] = !gb || SZ.bitPub < SZCFG.bitMin ? 0 : SZ.bitPub;
    SZ.st.ac += SZ.acA; SZ.st.gr += SZ.gr; if (SZ.acA > SZ.st.acMax) SZ.st.acMax = SZ.acA; SZ.st.bit += st[3]; if (st[3] > SZ.st.bitMax) SZ.st.bitMax = st[3]; }
  // PADS
  SZ.pe = ems(SZ.pe, V.pads_env, SZCFG.padSmoothMs); SZ.pp = ems(SZ.pp, V.pads_pitch, SZCFG.padSmoothMs);
  const gp = szActive() ? SZ.gain.pads : 0;
  if (V.pads_entry > 0.8 && SZ.entryPrev <= 0.8) SZ.hueT += SZCFG.padEntryDeg * gp;
  SZ.entryPrev = V.pads_entry;
  SZ.hueT += SZCFG.padHueDegPerSec * SZ.pe * gp * dt;
  SZ.hue = ems(SZ.hue, SZ.hueT, SZCFG.padHueMs);
  if (SZ.hueT > 3600) { SZ.hueT -= 3600; SZ.hue -= 3600; }
  const pd = (SZ.pp - 0.5) * 2 * SZ.pe * gp;                       // -1 tief ... +1 hoch, nur so weit Pads da sind
  SZ.bright = 1 + SZCFG.padBright * pd; SZ.satMul = 1 - SZCFG.padSat * pd;
  const S = SZ.st; S.n++; S.act += SZ.act; if (SZ.act > S.actMax) S.actMax = SZ.act; if (SZ.bright < S.bMin) S.bMin = SZ.bright; if (SZ.bright > S.bMax) S.bMax = SZ.bright;
}
// Anschlüsse
window.szHueAdd = () => SZ.hue;                                                    // js/04 applyFilter: zusätzlicher Farbton
window.szBright = () => SZ.bright;                                                  // js/04 applyFilter: Helligkeit
window.szSatMul = () => SZ.satMul;                                                  // js/13 fxFrame: Sättigung
window.szBarStep = st => {                                                          // js/01 onBar: Takt-Farbschritt
  if (!szActive() || SZ.gain.pads <= 0) return st;
  const m = SZCFG.barStepWithout + (SZCFG.barStepWith - SZCFG.barStepWithout) * Math.min(1, SZ.pe * 1.5);
  return Math.min(SZCFG.barStepMax, Math.round(st * m));
};
window.szHats = () => {                                                              // js/12b mxSparks: Funken-Menge
  if (!szActive()) return 1;
  const base = SZCFG.hatsMin + (SZCFG.hatsMax - SZCFG.hatsMin) * AKV.hats_density;
  return (1 + (base - 1) * Math.min(1.5, SZ.gain.hats)) * (1 - SZCFG.hatsReleaseCut * Math.min(1, SZ.gain.hats) * AKV.hats_release);   // Build 112: Hats klingen aus = weniger neue Funken
};
window.szKickAmp = () => szActive() ? Math.min(1.5, SZ.gain.kick) * SZ.kickS : 1;  // js/12b: Stärke des Kick-Zooms (Break leiser)
window.szKickRot = (r, k, wR, one) => {                                              // js/12b: Drehen im Takt, ein Anstoß je Kick
  if (!szActive() || SZ.gain.kick <= 0) return;
  if (one) SZ.kickDir = -SZ.kickDir;
  r.v += SZ.kickDir * SZCFG.kickRot * wR * k * Math.min(1.5, SZ.gain.kick) * SZ.kickS;
};
window.szAcidRot = () => szActive() ? 1 - SZCFG.acidRotShare * Math.min(1, SZ.gain.kick) : 1;   // js/12b: 303-Filterfahrt dreht weniger
window.szBreakBreath = () => szActive() && sectionKey() === 'break' ? SZCFG.breakBreath * Math.min(1, SZ.gain.pads) * SZ.pe : 0;   // js/12b: Break atmet mit den Pads
const SZ_ZERO = new Float32Array(8);
// Die Acid-Verzerrung (AK-PATCH 10) und der Bit-Salat (AK-PATCH 11) sitzen im Ausgabe-Durchgang der Kopie; der läuft nur, wenn setOutputAA(true) gesetzt ist (das Bild geht dann erst in eine Textur und von dort
// verzerrt auf den Schirm, kostet einen Durchgang). Darum nur einschalten, solange die Verzerrung wirklich sichtbar ist (Schalten mit Hysterese, damit es nicht hin und her springt).
let szAA = false;
window.szOutputAA = () => { const a = szActive() ? Math.max(SZ.stage[0], SZ.stage[3]) : 0; szAA = szAA ? a > 0.004 : a > 0.02; return szAA; };
window.szStage = () => szActive() ? SZ.stage : SZ_ZERO;                                                         // js/09: Werte für viz.setAkStage (AK-PATCH 10)
window.szSide = () => {                                                              // js/13 onHat: Seite des letzten Hats-Treffers, Stärke 0..1 (0 = Mitte oder Regler aus)
  const a = szActive() ? Math.min(1, SZ.gain.raum) : 0, v = AKSIDE.hats_side * a;
  SZ.st.sp++; if (v < 0) SZ.st.spL++; else if (v > 0) SZ.st.spR++;
  return v;
};
window.szDropWucht = () => {                                                        // js/12b mxDrop: Wucht des Drops
  if (!szActive() || SZ.gain.dirigent <= 0 || !szScan()) return 1;
  const s = AKV.ak_drop_strength; if (s <= 0) return 1;                            // keine Stärke bekannt (z. B. erster Kick nach dem Intro): Wucht wie vorher
  const w = SZCFG.dropWuchtMin + (SZCFG.dropWuchtMax - SZCFG.dropWuchtMin) * s;
  SZ.st.drops++; return 1 + (w - 1) * Math.min(1.5, SZ.gain.dirigent);
};
window.szBuild = () => szActive() && SZ.gain.dirigent > 0 && szScan() ? Math.min(1, AKV.ak_build_strength * SZ.gain.dirigent) : -1;   // js/12 scanFrame: -1 = alte Regel (8 Takte)
window.__SZ = SZ;

// ===== Werkstatt: Gruppe „Schaltzentrale“ mit Reglern =====
{ const werk = document.getElementById('werk');
  if (werk) {
    const box = document.createElement('div'); box.className = 'grp';
    const lb = document.createElement('span'); lb.className = 'gl'; lb.textContent = 'Schaltzentrale'; box.appendChild(lb);
    const NAMES = { kick: 'Kick (Puls, Drehen)', acid: 'Acid (Verzerrung)', raum: 'Raum (Stereo)', pads: 'Pads (Farbe)', hats: 'Hats (Funken)', dirigent: 'Dirigent (Aufbau, Drop)', bit: 'Bit-Salat (Glitch)' };
    for (const k of Object.keys(NAMES)) {
      const row = document.createElement('label'); row.style.cssText = 'flex:0 0 100%;display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dim)';
      const t = document.createElement('span'); t.style.cssText = 'flex:0 0 150px'; t.textContent = NAMES[k];
      const r = document.createElement('input'); r.type = 'range'; r.min = '0'; r.max = '150'; r.step = '5'; r.value = String(Math.round(SZ.gain[k] * 100)); r.id = 'sz-' + k; r.style.flex = '1';
      const v = document.createElement('span'); v.style.cssText = 'flex:0 0 40px;text-align:right'; v.textContent = r.value + ' %';
      r.addEventListener('input', () => { SZ.gain[k] = +r.value / 100; v.textContent = r.value + ' %'; store.set('sz-gain', SZ.gain); });
      row.appendChild(t); row.appendChild(r); row.appendChild(v); box.appendChild(row);
    }
    werk.appendChild(box);
  } }

// Protokoll: einmal pro Minute, was die Schaltzentrale getan hat
setInterval(() => {
  const S = SZ.st; if (S.n < 600 || !szActive()) return;
  const f = x => x.toFixed(2).replace('.', ',');
  erg('Schaltzentrale (letzte Minute): Raum Ø ' + f(S.act / S.n) + ' (max ' + f(S.actMax) + ') · Pads-Helligkeit ' + f(S.bMin) + '…' + f(S.bMax) + ' · Acid-Verzerrung Ø ' + f(S.ac / S.n) + ' (max ' + f(S.acMax) + ') · Hats-Körnung Ø ' + f(S.gr / S.n) + ' · Bit-Salat Ø ' + f(S.bit / S.n) + ' (max ' + f(S.bitMax) + ') · Einsätze Kick/Acid/Hats ' + S.ek + '/' + S.ea + '/' + S.eh + ' · Seiten-Funken links/rechts/Mitte ' + S.spL + '/' + S.spR + '/' + (S.sp - S.spL - S.spR) + ' · Drops mit Wucht ' + S.drops
    + ' · Regler Kick/Acid/Raum/Pads/Hats/Dirigent/Bit-Salat ' + ['kick', 'acid', 'raum', 'pads', 'hats', 'dirigent', 'bit'].map(k => Math.round(100 * SZ.gain[k])).join('/') + ' %' + (szScan() ? ' · Dirigent: Aufbau ' + f(AKV.ak_build_strength) + ', Drop-Stärke ' + f(AKV.ak_drop_strength) : ''));
  SZ.st = { n: 0, act: 0, actMax: 0, bMin: 9, bMax: 0, drops: 0, t: 0, sp: 0, spL: 0, spR: 0, ac: 0, acMax: 0, gr: 0, bit: 0, bitMax: 0, ek: 0, ea: 0, eh: 0 };
}, 60000);
