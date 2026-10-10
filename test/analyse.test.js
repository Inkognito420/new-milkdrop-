// Test ohne Browser: js/analyse.js mit einem künstlichen Track (140 BPM, Intro, Groove, Break, Drop).
// Aufruf: node test/analyse.test.js
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
vm.runInThisContext(fs.readFileSync(path.join(root, 'js/analyse.js'), 'utf8'), { filename: 'js/analyse.js' });

const hopS = 512 / 22050, BPM = 140, beatS = 60 / BPM, BEAT0 = 0.35;     // Kick auf jedem Schlag ab 0,35 s
const dur = 200, N = Math.floor(dur / hopS), SUB = 4;
// Takte: 0-7 Intro ohne Kick, 8-39 Groove, 40-47 Break ohne Kick (Hats steigen), 48-79 Drop/Groove, danach Ende
const barOf = t => Math.floor((t - BEAT0) / (4 * beatS));
const kickOn = bar => (bar >= 8 && bar < 40) || (bar >= 48 && bar < 80);
let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const mk = n => new Float32Array(n);
const env = { low: mk(N), m1: mk(N), m2: mk(N), hi: mk(N), full: mk(N), lowF: mk(N * SUB) };
const kickAt = t => { const x = ((t - BEAT0) % beatS + beatS) % beatS; return barOf(t) >= 0 && kickOn(barOf(t)) ? Math.exp(-x / 0.09) : 0; };
for (let i = 0; i < N; i++) {
  const t = i * hopS, bar = barOf(t), k = kickAt(t);
  const up = bar >= 40 && bar < 48 ? (bar - 40) / 8 : 0;
  env.low[i] = 0.02 + 0.5 * k + 0.01 * rnd();
  env.m1[i] = 0.05 + 0.02 * rnd(); env.m2[i] = 0.05 + 0.02 * rnd();
  env.hi[i] = 0.03 + 0.12 * up + 0.02 * rnd();
  env.full[i] = env.low[i] + env.m1[i] + env.m2[i] + env.hi[i];
  for (let u = 0; u < SUB; u++) env.lowF[i * SUB + u] = 0.02 + 0.5 * kickAt(t + u * hopS / SUB) + 0.01 * rnd();
}
const A = analyzeEnvelopes(env, hopS);
const types = A.sections.map(s => s.type);
console.log('BPM', A.bpm.toFixed(2), '· Raster', A.grid, '· Drops', A.drops, '· Abschnitte', types.join(' '));
assert.ok(A.grid, 'festes Raster erwartet');
assert.ok(Math.abs(A.bpm - BPM) < 0.3, 'Tempo ' + A.bpm + ' statt ' + BPM);
assert.ok(Math.abs(A.beat0 - BEAT0) < 0.05, 'Takt-Start ' + A.beat0 + ' statt ' + BEAT0);
assert.ok(A.drops >= 1, 'mindestens ein Drop');
for (const need of ['intro', 'break', 'drop']) assert.ok(types.includes(need), 'Abschnitt fehlt: ' + need);
assert.ok(A.sections[0].t0 === 0 && Math.abs(A.sections[A.sections.length - 1].t1 - dur) < 0.1, 'Abschnitte decken den ganzen Track ab');
for (let i = 1; i < A.sections.length; i++) assert.ok(A.sections[i].t0 >= A.sections[i - 1].t0, 'Abschnitte nicht aufsteigend');
// FFT-Grundprobe: ein Sinus bei Bin 8 muss dort die größte Stärke haben
const F = kmFFT(256); for (let i = 0; i < 256; i++) { F.re[i] = Math.sin(2 * Math.PI * 8 * i / 256); F.im[i] = 0; } F.run();
let pk = 1; for (let k = 1; k < 128; k++) if (Math.hypot(F.re[k], F.im[k]) > Math.hypot(F.re[pk], F.im[pk])) pk = k;
assert.strictEqual(pk, 8, 'FFT-Spitze bei Bin ' + pk);
console.log('analyse.test.js: ok');
