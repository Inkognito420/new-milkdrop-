// Künstlicher Acid-Techno-Track als WAV (140 BPM, Stereo 44,1 kHz, 16 Bit) für die Browser-Prüfung.
// Aufbau pro Durchgang (56 Takte, ca. 97 s): Intro 8 · Groove 16 · Break 8 (die letzten 4 mit Aufbau) · Drop 16 · Outro 8, Kick beginnt bei 0,35 s.
// Aufruf: node test/gen-track.js <ausgabe.wav> [Durchgänge]      oder:  require('./gen-track').makeTrack(pfad, durchgaenge)
const fs = require('fs');

function makeTrack(out, reps = 1) {
  const SR = 44100, BPM = 140, beat = 60 / BPM, bar = 4 * beat, LEAD = 0.35;
  const secs = [['intro', 8], ['groove', 16], ['break', 8], ['drop', 16], ['outro', 8]];
  const nBars = reps * secs.reduce((a, s) => a + s[1], 0);
  const N = Math.ceil((LEAD + nBars * bar + 1) * SR), L = new Float32Array(N), R = new Float32Array(N);
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296 * 2 - 1;
  const kinds = []; for (let r = 0; r < reps; r++) for (const [k, n] of secs) for (let i = 0; i < n; i++) kinds.push([k, i, n]);
  const kick = (t0, amp) => { const s0 = Math.floor((LEAD + t0) * SR); let ph = 0; for (let i = 0; i < 0.3 * SR && s0 + i < N; i++) { const t = i / SR; ph += 2 * Math.PI * (42 + 120 * Math.exp(-t * 30)) / SR; const v = Math.sin(ph) * Math.exp(-t * 7) * amp; L[s0 + i] += v; R[s0 + i] += v; } };
  const noise = (t0, dur, amp, hp, pan) => { const s0 = Math.floor((LEAD + t0) * SR); let lp = 0; for (let i = 0; i < dur * SR && s0 + i < N; i++) { const x = rnd(); lp += hp * (x - lp); const y = x - lp, e = Math.exp(-i / SR / (dur / 4)), v = y * e * amp; L[s0 + i] += v * (1 - pan); R[s0 + i] += v * (1 + pan); } };
  const acid = (t0, dur, f, cutoff, res, amp) => { const s0 = Math.floor((LEAD + t0) * SR); let lo = 0, bp = 0; for (let i = 0; i < dur * SR && s0 + i < N; i++) { const t = i / SR, saw = 2 * ((t * f) % 1) - 1, g = 2 * Math.sin(Math.PI * Math.min(0.45, cutoff(t0 + t) / SR)), q = 1 / res; lo += g * bp; const hi = saw - lo - q * bp; bp += g * hi; const v = lo * Math.min(1, t * 200) * Math.exp(-t * 3.5) * amp; L[s0 + i] += v; R[s0 + i] += v * 0.9; } };
  const pat = [55, 55, 110, 55, 82.4, 55, 110, 98, 55, 55, 110, 55, 123.5, 82.4, 110, 65.4];
  for (let b = 0; b < kinds.length; b++) {
    const [k, i, n] = kinds[b], tb = b * bar, kickOn = k === 'groove' || k === 'drop' || (k === 'outro' && i < 6);
    for (let q = 0; q < 4; q++) {
      const t = tb + q * beat;
      if (kickOn) kick(t, k === 'drop' ? 0.95 : 0.8);
      if (k !== 'break' || i >= n - 4) noise(t + beat / 2, 0.07, k === 'break' ? 0.1 + 0.25 * (i - (n - 4)) / 4 : 0.28, 0.35, 0.15);
      if (k === 'drop' && (q === 1 || q === 3)) noise(t, 0.12, 0.3, 0.06, -0.1);
      if (k === 'groove' || k === 'drop' || k === 'outro') for (let s = 0; s < 4; s++) { const idx = (q * 4 + s) % 16, tt = t + s * beat / 4; if (idx % 5 !== 3) acid(tt, beat / 4 * 0.9, pat[idx], tm => (k === 'drop' ? 700 + 2600 * (0.5 + 0.5 * Math.sin(tm * 0.9)) : 350 + 900 * (0.5 + 0.5 * Math.sin(tm * 0.5))), 4, 0.33); }
    }
    if (k === 'break') for (let q = 0; q < 4; q++) acid(tb + q * beat, beat * 0.95, 55 * (1 + (i % 2)), () => 500 + 40 * i, 1.5, 0.12);
  }
  let mx = 0; for (let i = 0; i < N; i++) mx = Math.max(mx, Math.abs(L[i]), Math.abs(R[i]));
  const g = 0.8 / mx, buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4); }
  fs.writeFileSync(out, buf);
  return { bytes: buf.length, seconds: N / SR, bars: nBars };
}
// new-milkdrop-: Track nach Plan für die Klangrollen-Prüfung. plan = ein Eintrag pro Takt: { k: Kick, h: Hi-Hats, a: Acid-303, p: Pad-Akkord } (je true/false).
// Ab Build 104 außerdem: b = rollende Bassline (drei Sechzehntel zwischen den Kicks, 50-60 Hz, wie in Peak-Time-Techno),
// m = dichter Klangteppich ohne gehaltene Töne (viele kurze Synth-Tupfer mit wechselnder Tonhöhe, 150-1500 Hz, nie ganz still),
// pp = Ping-Pong: so viele Hi-Hat-Anschläge pro Schlag, abwechselnd hart links und rechts (1, 2 oder 4), statt h; w = Synth-Tupfer breit (links/rechts verschieden).
// q = hoher Pad (gleicher Akkord zwei Oktaven höher, 880-1568 Hz), s = Hi-Hats auf jeder Sechzehntel statt nur auf dem Offbeat.
// Gleiche Klangerzeuger wie oben (Kick 42 Hz mit Pitch-Abfall, gefiltertes Rauschen, Säge mit resonantem Filter), dazu ein gleichmäßiger Pad-Akkord.
// gain: Lautstärke (1 = auf 0,8 normiert, 0,5 = halb so laut). Rückgabe wie makeTrack, dazu bar0 (Start von Takt 0 in s) und barS (Taktlänge in s).
function makePlanTrack(out, plan, opts = {}) {
  const SR = 44100, BPM = opts.bpm || 140, beat = 60 / BPM, bar = 4 * beat, LEAD = 0.35, gain = opts.gain || 1;
  const N = Math.ceil((LEAD + plan.length * bar + 1) * SR), L = new Float32Array(N), R = new Float32Array(N);
  let seed = 11; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296 * 2 - 1;
  const kick = (t0, amp) => { const s0 = Math.floor((LEAD + t0) * SR); let ph = 0; for (let i = 0; i < 0.3 * SR && s0 + i < N; i++) { const t = i / SR; ph += 2 * Math.PI * (42 + 120 * Math.exp(-t * 30)) / SR; const v = Math.sin(ph) * Math.exp(-t * 7) * amp; L[s0 + i] += v; R[s0 + i] += v; } };
  const noise = (t0, dur, amp, hp, pan) => { const s0 = Math.floor((LEAD + t0) * SR); let lp = 0; for (let i = 0; i < dur * SR && s0 + i < N; i++) { const x = rnd(); lp += hp * (x - lp); const y = x - lp, e = Math.exp(-i / SR / (dur / 4)), v = y * e * amp; L[s0 + i] += v * (1 - pan); R[s0 + i] += v * (1 + pan); } };
  const acid = (t0, dur, f, cutoff, res, amp) => { const s0 = Math.floor((LEAD + t0) * SR); let lo = 0, bp = 0; for (let i = 0; i < dur * SR && s0 + i < N; i++) { const t = i / SR, saw = 2 * ((t * f) % 1) - 1, g = 2 * Math.sin(Math.PI * Math.min(0.45, cutoff(t0 + t) / SR)), q = 1 / res; lo += g * bp; const hi = saw - lo - q * bp; bp += g * hi; const v = lo * Math.min(1, t * 200) * Math.exp(-t * 3.5) * amp; L[s0 + i] += v; R[s0 + i] += v * 0.9; } };
  // Breites, aber mittiges Rauschen: links und rechts unabhängig (Breite hoch, Position bleibt in der Mitte)
  const noiseW = (t0, dur, amp, hp) => { const s0 = Math.floor((LEAD + t0) * SR); let a = 0, b = 0; for (let i = 0; i < dur * SR && s0 + i < N; i++) { const xa = rnd(), xb = rnd(); a += hp * (xa - a); b += hp * (xb - b); const e = Math.exp(-i / SR / (dur / 4)); L[s0 + i] += (xa - a) * e * amp; R[s0 + i] += (xb - b) * e * amp; } };
  const pad = (t0, dur, amp, mul = 1) => { const s0 = Math.floor((LEAD + t0) * SR), fr = [220, 261.6, 329.6, 392].map(f => f * mul); for (let i = 0; i < dur * SR && s0 + i < N; i++) { const t = i / SR, tt = t0 + t, e = Math.min(1, t / 0.05, (dur - t) / 0.05); let v = 0; for (const f of fr) v += Math.sin(2 * Math.PI * f * tt) + 0.3 * Math.sin(4 * Math.PI * f * tt); v *= e * amp / fr.length; L[s0 + i] += v; R[s0 + i] += v; } };
  // Rumble-Bass: kurzer Anschlag mit Tonhöhen-Abfall wie ein kleiner Kick (so klingen rollende Peak-Time-Basslines im Kick-Band)
  const bass = (t0, f, amp) => { const s0 = Math.floor((LEAD + t0) * SR); let ph = 0; for (let i = 0; i < 0.12 * SR && s0 + i < N; i++) { const t = i / SR; ph += 2 * Math.PI * (f + 60 * Math.exp(-t * 40)) / SR; const v = Math.sin(ph) * Math.min(1, t / 0.002) * Math.exp(-t * 16) * amp; L[s0 + i] += v; R[s0 + i] += v; } };
  const blip = (t0, f, dur, amp) => { const s0 = Math.floor((LEAD + t0) * SR); for (let i = 0; i < dur * SR && s0 + i < N; i++) { const t = i / SR, e = Math.min(1, t / 0.005) * Math.exp(-t * 14), v = (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(4 * Math.PI * f * t)) * e * amp; L[s0 + i] += v; R[s0 + i] += v * 0.95; } };
  const pat = [55, 55, 110, 55, 82.4, 55, 110, 98, 55, 55, 110, 55, 123.5, 82.4, 110, 65.4];
  let pingN = 0;
  for (let b = 0; b < plan.length; b++) {
    const x = plan[b], tb = b * bar;
    if (x.b) for (let q = 0; q < 4; q++) for (let s = 1; s < 4; s++) bass(tb + q * beat + s * beat / 4, s === 2 ? 55 : 49, 0.7);
    if (x.m) for (let s = 0; s < 32; s++) blip(tb + s * bar / 32 + 0.01 * rnd(), 150 * Math.pow(10, 0.5 + 0.5 * rnd()), 0.25, 0.05);
    for (let q = 0; q < 4; q++) {
      const t = tb + q * beat;
      if (x.k) kick(t, 0.85);
      if (x.pp) for (let u = 0; u < x.pp; u++) { pingN = (pingN || 0) + 1; noise(t + u * beat / x.pp, 0.05, 0.28, 0.35, pingN % 2 ? 0.95 : -0.95); }
      if (x.wc) { noiseW(t + beat / 2, 0.07, 0.28, 0.35); noiseW(t + beat / 4, 0.05, 0.12, 0.35); noiseW(t + 3 * beat / 4, 0.05, 0.12, 0.35); }
      if (x.h && !x.s) noise(t + beat / 2, 0.07, 0.28, 0.35, 0.15);
      if (x.s) for (let u = 0; u < 4; u++) noise(t + u * beat / 4, 0.05, u === 2 ? 0.28 : 0.2, 0.35, 0.15);
      if (x.a) for (let s = 0; s < 4; s++) { const idx = (q * 4 + s) % 16; if (idx % 5 !== 3) acid(t + s * beat / 4, beat / 4 * 0.9, pat[idx], tm => 350 + 1800 * (0.5 + 0.5 * Math.sin(tm * 0.7)), 4, 0.33); }
    }
    if (x.p) pad(tb, bar, 0.12);
    if (x.q) pad(tb, bar, 0.12, 4);
  }
  let mx = 0; for (let i = 0; i < N; i++) mx = Math.max(mx, Math.abs(L[i]), Math.abs(R[i]));
  const g = 0.8 / mx * gain, buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4); }
  fs.writeFileSync(out, buf);
  return { bytes: buf.length, seconds: N / SR, bars: plan.length, bar0: LEAD, barS: bar };
}
// Pläne für die Prüfkriterien (Takte)
const bars = (n, x) => Array.from({ length: n }, () => Object.assign({}, x));
const PLANS = {
  kickDurch: () => bars(32, { k: 1, h: 1, a: 1 }),                                                   // 1) 32 Takte durchgehender Kick
  kickLuecke: () => bars(8, { k: 1, h: 1, a: 1 }).concat(bars(1, { h: 1, a: 1 }), bars(8, { k: 1, h: 1, a: 1 })),   // 2) Kick fehlt Takt 8
  rollBass: () => bars(16, { k: 1, h: 1, b: 1 }),                                                     // 6) rollende Bassline zwischen den Kicks: nur die 4 Kicks pro Takt zählen
  padTeppich: () => bars(10, { k: 1, h: 1, a: 1, m: 1 }).concat(bars(8, { k: 1, h: 1, a: 1, m: 1, p: 1 })),   // 7) dichter Teppich ohne Pad (Takt 0-9), dann mit Pad (10-17)
  padHoch: () => bars(8, { k: 1, h: 1, p: 1 }).concat(bars(8, { k: 1, h: 1, q: 1 }), bars(10, { k: 1, h: 1 })),   // 8) tiefer Pad, hoher Pad, dann keiner
  pingPong: () => bars(8, { k: 1, h: 1 }).concat(bars(8, { k: 1, pp: 1 }), bars(8, { k: 1, pp: 2 }), bars(8, { k: 1, pp: 4 })),   // 10) Hats mittig, dann Ping-Pong 1, 2, 4 pro Schlag (wird immer schneller)
  breitMitte: () => bars(16, { k: 1, wc: 1 }),                                                        // 11) breit (links/rechts unabhängig), aber mittig: Breite hoch, keine Wanderung
  hatsDicht: () => bars(8, { k: 1, h: 1 }).concat(bars(8, { k: 1, h: 1, s: 1 })),                   // 9) Hats nur Offbeat (4 pro Takt), dann jede Sechzehntel (16)
  acidNeu: () => bars(8, { k: 1, h: 1, a: 1 }).concat(bars(2, { k: 1, h: 1 }), bars(4, { k: 1, h: 1, a: 1 }), bars(6, { k: 1, h: 1, a: 1, p: 1 }))   // 3) Acid fehlt Takt 8-9, kommt in Takt 10; Pad ab Takt 14
};
module.exports = { makeTrack, makePlanTrack, PLANS };
if (require.main === module) {
  const [out, reps] = process.argv.slice(2);
  if (!out) { console.error('Aufruf: node test/gen-track.js <ausgabe.wav> [Durchgänge]'); process.exit(2); }
  const r = makeTrack(out, +reps || 1);
  console.log(out, (r.bytes / 1048576).toFixed(1) + ' MB,', r.seconds.toFixed(1) + ' s,', r.bars + ' Takte');
}
