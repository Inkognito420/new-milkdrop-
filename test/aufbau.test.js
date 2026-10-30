// Test ohne Browser: Aufbau-Detektor (aufbauDetektor in js/analyse.js) mit den Prüfdaten (pruefdaten/, echte Tracks, Klangmesser-Werte pro Takt).
// Die Prüfdaten sind der Maßstab: Drops an der richtigen Stelle (±1 Takt), Aufbau auch über dem Kick, keine festen Längen,
// Drops nach langer Pause stärker als nach kurzer. Aufruf: node test/aufbau.test.js   (AUFBAU_DIAG=1 druckt alle Werte)
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
vm.runInThisContext(fs.readFileSync(path.join(root, 'js/analyse.js'), 'utf8'), { filename: 'js/analyse.js' });

const load = f => { const t = JSON.parse(fs.readFileSync(path.join(root, 'pruefdaten', f), 'utf8')), F = t.felder, col = k => t.takte.map(r => r[F.indexOf(k)]);
  return { t, R: aufbauDetektor({ n: t.takte.length, druck: col('druck'), hektik: col('hektik'), schaerfe: col('schaerfe') }) }; };
const spell = load('klangmesser-spell.json'), dream = load('klangmesser-dream-escape.json');
for (const { t, R } of [spell, dream]) {
  if (process.env.AUFBAU_DIAG) { console.log(t.name); for (const d of R.drops) console.log('  ' + JSON.stringify(d)); let s = ''; for (const v of R.build) s += ' .:-=+*#%@'[Math.round(v * 9)]; console.log('  Aufbau ' + s); }
}
// Erwartet (aus den Werten abgelesen, siehe pruefdaten/LIESMICH.md): Takt des Drops und Pausenlänge (ungefähr)
const SOLL = { Spell: [48, 104, 136, 168], 'Dream Escape': [31, 96, 144] };
for (const { t, R } of [spell, dream]) {
  const ist = R.drops.map(d => d.bar);
  assert.strictEqual(ist.length, SOLL[t.name].length, t.name + ': ' + SOLL[t.name].length + ' Drops erwartet, gefunden: ' + ist.join(','));
  SOLL[t.name].forEach((b, i) => assert.ok(Math.abs(ist[i] - b) <= 1, t.name + ': Drop ' + (i + 1) + ' bei Takt ' + b + ' (±1) erwartet, gefunden ' + ist[i]));
  for (const d of R.drops) assert.ok(d.buildBars >= 2, t.name + ': vor dem Drop bei Takt ' + d.bar + ' kein Aufbau erkannt');
  for (let i = 0; i < R.build.length; i++) assert.ok(R.build[i] >= 0 && R.build[i] <= 1, 'build außerhalb 0..1');
}
// Aufbau über dem durchlaufenden Kick (Spell, Drop bei 246 s nach nur 3 Takten Pause): mindestens 8 Takte, und in Takt 121-131 (Hektik 0,75-0,8, Kick läuft) über 0,5
const d136 = spell.R.drops.find(d => Math.abs(d.bar - 136) <= 1);
assert.ok(d136.pause <= 4 && d136.buildBars >= 8, 'Spell 246 s: Aufbau über dem Kick nicht erkannt: ' + JSON.stringify(d136));
for (let b = 121; b <= 131; b++) assert.ok(spell.R.build[b] > 0.5, 'Spell Takt ' + b + ': build ' + spell.R.build[b].toFixed(2) + ', erwartet > 0,5 (Aufbau über dem Kick)');
// Keine festen Längen: Pausen von 3 bis 33 Takten kommen vor und werden alle erkannt
const pausen = spell.R.drops.concat(dream.R.drops).map(d => d.pause);
assert.ok(Math.min(...pausen) <= 4 && Math.max(...pausen) >= 30, 'Pausen von 3 bis über 30 Takten erwartet: ' + pausen.join(','));
// Drop-Stärke: nach langer Pause (16, 24, 33 Takte) stärker als nach kurzer (3, 4 Takte)
const all = spell.R.drops.concat(dream.R.drops), lang = all.filter(d => d.pause >= 15), kurz = all.filter(d => d.pause <= 4);
assert.ok(lang.length === 3 && kurz.length === 3, 'erwartet 3 lange und 3 kurze Pausen: ' + JSON.stringify(all.map(d => d.pause)));
assert.ok(Math.min(...lang.map(d => d.strength)) > Math.max(...kurz.map(d => d.strength)), 'Drop-Stärke: lang ' + lang.map(d => d.strength) + ' muss über kurz ' + kurz.map(d => d.strength) + ' liegen');
for (const d of all) assert.ok(d.strength > 0 && d.strength <= 1, 'drop_strength außerhalb 0..1');
// Kein Drop am Anfang, keiner mitten im Groove (kleine Durchhänger wie Spell Takt 119-120 und 151-152 zählen nicht)
assert.ok(!all.some(d => [0, 1, 119, 120, 151, 152].includes(d.bar)), 'falscher Drop: ' + all.map(d => d.bar).join(','));
// Gegenprobe mit künstlichen Verläufen: Groove 16 Takte, Pause p Takte (Riser in den letzten 3 Takten), Groove 16 Takte → genau ein Drop am richtigen Takt
for (const p of [2, 3, 5, 8, 16, 33, 40]) {
  const druck = [], hektik = [], schaerfe = [], add = (d, h, s) => { druck.push(d + 0.01 * Math.sin(druck.length)); hektik.push(h); schaerfe.push(s); };
  for (let i = 0; i < 16; i++) add(0.9, 0.35, 0.4);
  for (let i = 0; i < p; i++) add(0.1, 0.1, i >= p - 3 ? 0.5 + 0.15 * (i - p + 3) : 0.3);
  for (let i = 0; i < 16; i++) add(0.9, 0.35, 0.4);
  const R = aufbauDetektor({ druck, hektik, schaerfe });
  assert.ok(R.drops.length === 1 && R.drops[0].bar === 16 + p && R.drops[0].pause === p, 'künstlich, Pause ' + p + ': ' + JSON.stringify(R.drops));
  assert.ok(R.drops[0].buildBars >= 2, 'künstlich, Pause ' + p + ': Riser nicht als Aufbau erkannt ' + JSON.stringify(R.drops));
}
{ const flat = Array.from({ length: 64 }, (_, i) => 0.9 + 0.02 * Math.sin(i)), R = aufbauDetektor({ druck: flat, hektik: flat.map(() => 0.3), schaerfe: flat.map(() => 0.4) });
  assert.strictEqual(R.drops.length, 0, 'durchgehender Groove: kein Drop erwartet ' + JSON.stringify(R.drops)); }
{ const R = aufbauDetektor({ druck: [0.9, 0.1, 0.9], hektik: [0, 0, 0], schaerfe: [0, 0, 0] }); assert.strictEqual(R.drops.length, 0, 'zu kurz: kein Drop'); }
// Build 114: Detektor-Drops in die Abschnitte (abschnitteMitDetektor). Zahlen aus dem iPhone-Protokoll „Lutgens - Resonance“ (137,89 BPM, Takt 1,74 s):
// Scan sagt Intro bis 111 s, Detektor findet Drops bei 55 s (0,51, Pause 2) und 83 s (0,62, Pause 4) im Intro. Dazu ein Fill im Groove wie bei „Adrenaline“
// (Stärke 0,6, Pause 3) und ein klarer Groove-Drop (0,75, Pause 6).
{ const barS = 4 * 60 / 137.89, T = b => +(b * barS).toFixed(3), sec = (type, b0, b1) => ({ type, startBar: b0, endBar: b1, t0: T(b0), t1: T(b1), blendBars: 2 });
  const A = { grid: true, sections: [sec('intro', 0, 64), sec('drop', 64, 72), sec('groove', 72, 88), sec('break', 88, 96), sec('drop', 96, 104), sec('groove', 104, 200), sec('outro', 200, 216)],
    aufbau: { barS, drops: [[31.6, 0.51, 2], [47.7, 0.62, 4], [64, 0.61, 4], [96.2, 0.77, 16], [120, 0.6, 3], [150, 0.75, 6], [205, 0.8, 8]].map(([b, strength, pause]) => ({ t: T(b), bar: b, strength, pause })) } };
  const n = abschnitteMitDetektor(A), ty = A.sections.map(s => s.type + '@' + Math.round(s.t0)).join(' ');
  const at = t => A.sections.find(s => t >= s.t0 && t < s.t1).type;
  assert.strictEqual(n, 3, 'drei Detektor-Drops übernommen (55 s, 83 s, Groove-Drop) ' + ty);
  assert.ok(at(T(31.6) + 1) === 'drop' && at(T(47.7) + 1) === 'drop', 'Drops bei 55 s und 83 s ' + ty);
  assert.ok(at(T(20)) === 'intro' && at(T(40)) === 'groove' && at(T(60)) === 'groove', 'Intro endet am ersten Drop, danach Groove ' + ty);
  assert.ok(at(T(120) + 1) === 'groove', 'Fill im Groove (Stärke 0,6, Pause 3) bleibt Groove ' + ty);
  assert.ok(at(T(150) + 1) === 'drop' && at(T(150 + 7.5)) === 'drop' && at(T(150 + 8.5)) === 'groove', 'klarer Groove-Drop: 8 Takte Drop ' + ty);
  assert.ok(at(T(205)) === 'outro', 'Outro bleibt ' + ty);
  assert.strictEqual(A.sections.filter(s => s.type === 'drop' && Math.abs(s.t0 - T(64)) < 1).length, 1, 'Scan-Drop bei 111 s nicht doppelt ' + ty);
  assert.strictEqual(A.drops, 5, 'A.drops gezählt ' + ty);
  for (let i = 1; i < A.sections.length; i++) assert.ok(Math.abs(A.sections[i].t0 - A.sections[i - 1].t1) < 1e-6, 'Abschnitte lückenlos ' + ty);
  assert.strictEqual(abschnitteMitDetektor(A), 0, 'zweiter Aufruf ändert nichts');
  console.log('Detektor-Drops: ' + ty); }
console.log('aufbau.test.js: ok (' + all.length + ' Drops, Pausen ' + pausen.join('/') + ' Takte, Stärke ' + all.map(d => d.strength.toFixed(2)).join('/') + ')');
