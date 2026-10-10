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
console.log('aufbau.test.js: ok (' + all.length + ' Drops, Pausen ' + pausen.join('/') + ' Takte, Stärke ' + all.map(d => d.strength.toFixed(2)).join('/') + ')');
