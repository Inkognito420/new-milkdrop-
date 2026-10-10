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
module.exports = { makeTrack };
if (require.main === module) {
  const [out, reps] = process.argv.slice(2);
  if (!out) { console.error('Aufruf: node test/gen-track.js <ausgabe.wav> [Durchgänge]'); process.exit(2); }
  const r = makeTrack(out, +reps || 1);
  console.log(out, (r.bytes / 1048576).toFixed(1) + ' MB,', r.seconds.toFixed(1) + ' s,', r.bars + ' Takte');
}
