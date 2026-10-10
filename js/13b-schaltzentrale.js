// new-milkdrop- · Teil 13b: Schaltzentrale, Teil 3a (ab Build 106)
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Dieser Teil ändert window.__AM_STEP NICHT: bricht er ab, läuft alles wie in Build 105 (die Anschlüsse in js/01, 04, 12, 12b prüfen window.__SZ).
if (window.__AM_STEP !== 13) throw new Error('new-milkdrop-: Teil 13b (schaltzentrale) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== Idee: jede Klangrolle bekommt genau EINE Bildebene, wie Kanäle am Mischpult =====
// Dieser Teil (3a) macht drei Ebenen und den Dirigenten. Er benutzt nur Werte, die die Klangrollen schon liefern (AKV, js/08b), und schreibt nur
// in Anschlüsse, die der Rest des Programms kennt. Die Presets und die Butterchurn-Kopie bleiben unverändert.
//   RAUM   (Stereo)  ak_pan, ak_pan_speed, ak_width  → Bild nach links/rechts schieben und verziehen (skewX). Ersetzt das Schwanken im Takt,
//                    solange Stereo-Bewegung da ist; ohne Stereo-Bewegung bleibt das alte Schwanken (Rückfall).
//   PADS   (Farbe)   pads_env, pads_pitch, pads_entry → Farbton gleitet (Tempo = Lautstärke der Pads), Helligkeit und Sättigung folgen der Tonhöhe
//                    (tief = düster und satt, hoch = hell und leuchtend), pads_entry = weicher Farbwechsel. Takt-Farbe: kleiner Schritt, mit Pads halb,
//                    ohne Pads größer (mit Obergrenze), damit die Farbe nicht stehen bleibt.
//   HATS   (Details) hats_density → Menge der Funken (Mischpult, mxSparks).
//   DIRIGENT         ak_build_strength → Aufbau (statt fester 8 Takte), ak_drop_strength → Wucht des Drops (statt immer gleich stark).
// Noch nicht in 3a (siehe ANWEISUNG-NAECHSTER-CHAT.md): Kick-Ebene (Drehen), Acid-Ebene (Verzerrung, braucht die Butterchurn-Kopie).
// Alles stark geglättet; jede Ebene einzeln in der Werkstatt (Gruppe „Schaltzentrale“) von 0 bis 150 % einstellbar.
const SZCFG = {
  gain: { raum: 1, pads: 1, hats: 1, dirigent: 1 },      // Voreinstellung der Regler (1 = 100 %)
  panMaxFloorSec: 6,        // Position wird auf ihr gleitendes Maximum der letzten Sekunden bezogen (live erreicht sie nur ca. ±0,5, offline ±0,9)
  panFloor: 0.35,           // ... mindestens dieses Maximum (sonst würde Rauschen bei Mono voll ausschlagen)
  panSmoothMs: 120,         // Glättung der Position für das Bild (flackerfrei)
  panSlew: 5,               // größte Änderung der (normierten) Position pro Sekunde, unabhängig von der Bildrate: ein voller Seitenwechsel dauert mindestens 0,4 s,
                            // darum werden sehr schnelle Wechsel (Sechzehntel) zu einem sanften Schimmern statt Flackern (1,3 % × 5 = 6,5 % pro Sekunde)
  widthDead: 0.12,          // Breite unter diesem Wert zählt als Mono (Test-Track mit leicht gepanntem Rauschen: Breite 0,07-0,1)
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
  dropWuchtMin: 0.5, dropWuchtMax: 1.4                     // Drop-Wucht (Blitz, Funken, Zoom-Stoß) aus ak_drop_strength 0..1
};
const SZ = { gain: Object.assign({}, SZCFG.gain), on: true, panMax: SZCFG.panFloor, panS: 0, act: 0, speedS: 0, widthS: 0,
  pe: 0, pp: 0.5, hueT: 0, hue: 0, entryPrev: 0, bright: 1, satMul: 1, x: 0, skew: 0, lastT: 0,
  st: { n: 0, act: 0, actMax: 0, bMin: 9, bMax: 0, drops: 0, t: 0 } };
{ const g = store.get('sz-gain', null); if (g) for (const k in SZ.gain) if (typeof g[k] === 'number' && g[k] >= 0 && g[k] <= 1.5) SZ.gain[k] = g[k]; }
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
  const wd = Math.max(0, SZ.widthS - SZCFG.widthDead) / (1 - SZCFG.widthDead);
  const want = Math.min(1, 1.5 * wd + SZ.speedS) * (V.ak_pan_speed > 0.02 || SZ.act > 0.05 ? 1 : 0.4);   // nur Breite allein zählt weniger als wirkliche Bewegung
  SZ.act = ems(SZ.act, szActive() ? want : 0, SZCFG.actMs);
  const g = SZ.gain.raum * SZ.act;
  SZ.x = SZ.panS * SZCFG.xMaxPct * g; SZ.skew = SZ.panS * SZCFG.skewMaxDeg * g;
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
  return 1 + (base - 1) * Math.min(1.5, SZ.gain.hats);
};
window.szDropWucht = () => {                                                        // js/12b mxDrop: Wucht des Drops
  if (!szActive() || SZ.gain.dirigent <= 0 || !szScan()) return 1;
  const s = AKV.ak_drop_strength, w = SZCFG.dropWuchtMin + (SZCFG.dropWuchtMax - SZCFG.dropWuchtMin) * s;
  SZ.st.drops++; return 1 + (w - 1) * Math.min(1.5, SZ.gain.dirigent);
};
window.szBuild = () => szActive() && SZ.gain.dirigent > 0 && szScan() ? Math.min(1, AKV.ak_build_strength * SZ.gain.dirigent) : -1;   // js/12 scanFrame: -1 = alte Regel (8 Takte)
window.__SZ = SZ;

// ===== Werkstatt: Gruppe „Schaltzentrale“ mit Reglern =====
{ const werk = document.getElementById('werk');
  if (werk) {
    const box = document.createElement('div'); box.className = 'grp';
    const lb = document.createElement('span'); lb.className = 'gl'; lb.textContent = 'Schaltzentrale'; box.appendChild(lb);
    const NAMES = { raum: 'Raum (Stereo)', pads: 'Pads (Farbe)', hats: 'Hats (Funken)', dirigent: 'Dirigent (Aufbau, Drop)' };
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
  erg('Schaltzentrale (letzte Minute): Raum Ø ' + f(S.act / S.n) + ' (max ' + f(S.actMax) + ') · Pads-Helligkeit ' + f(S.bMin) + '…' + f(S.bMax) + ' · Drops mit Wucht ' + S.drops
    + ' · Regler Raum/Pads/Hats/Dirigent ' + ['raum', 'pads', 'hats', 'dirigent'].map(k => Math.round(100 * SZ.gain[k])).join('/') + ' %' + (szScan() ? ' · Dirigent: Aufbau ' + f(AKV.ak_build_strength) + ', Drop-Stärke ' + f(AKV.ak_drop_strength) : ''));
  SZ.st = { n: 0, act: 0, actMax: 0, bMin: 9, bMax: 0, drops: 0, t: 0 };
}, 60000);
