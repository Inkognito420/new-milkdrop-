// Kollisionstest: Die neuen Klangrollen-Variablen (AK_VAR_NAMES) dürfen in keinem der 245 Standard-Presets vorkommen
// (Gleichungen von Preset, Formen und Wellen, Startwerte, Warp- und Comp-Shader; Groß/Klein egal). Sonst würde ein altes Preset
// plötzlich unsere Werte statt seiner eigenen Variable sehen. Prüft auch die Regeln für die Namen.
// Aufruf: node test/klangrollen-namen.test.js
const path = require('path'), assert = require('assert');
const { AK_NAMES } = require('./klangrollen-namen.js');
global.window = global;
const V = path.join(__dirname, '..', 'vendor/butterchurn-presets/');
const get = m => (m.getPresets ? m : m.default).getPresets();
const P = Object.assign({}, get(require(V + 'butterchurnPresets.min.js')), get(require(V + 'butterchurnPresetsExtra.min.js')));
const names = Object.keys(P);
assert.strictEqual(names.length, 245, 'erwartet 245 Standard-Presets, gefunden ' + names.length);

// Regeln: 38 Namen (Build 104: +acid_reso, hats_density, pads_pitch, ak_build_strength, ak_drop_strength), klein geschrieben, keine doppelt, Rollen kick_/acid_/hats_/pads_, alles andere mit ak_
assert.strictEqual(AK_NAMES.length, 38, 'Anzahl Namen ' + AK_NAMES.length);
assert.strictEqual(new Set(AK_NAMES).size, AK_NAMES.length, 'doppelte Namen');
for (const n of AK_NAMES) {
  assert.ok(/^[a-z][a-z0-9_]*$/.test(n), 'nicht klein/gültig: ' + n);
  assert.ok(/^(kick|acid|hats|pads|ak)_/.test(n), 'falsches Präfix: ' + n);
}

// Alle Wörter (Bezeichner) eines Presets, klein geschrieben
const words = new Set();
function collect(v, key) {
  if (key) words.add(String(key).toLowerCase());
  if (typeof v === 'string') { for (const w of v.toLowerCase().match(/[a-z_][a-z0-9_]*/g) || []) words.add(w); }
  else if (Array.isArray(v)) v.forEach(x => collect(x));
  else if (v && typeof v === 'object') for (const k in v) collect(v[k], k);
}
const hits = {};
for (const n of names) {
  words.clear(); collect(P[n]);
  for (const a of AK_NAMES) if (words.has(a)) (hits[a] = hits[a] || []).push(n);
  for (const w of words) if (/^_ak\d+$/.test(w)) (hits[w] = hits[w] || []).push(n);
}
assert.deepStrictEqual(hits, {}, 'Namen kommen in Standard-Presets vor: ' + JSON.stringify(hits));
// Begründung für das Präfix ak_: "bpm" und "hit" sind in Standard-Presets eigene Variablen
const plain = { bpm: 0, hit: 0 };
for (const n of names) { words.clear(); collect(P[n]); for (const k in plain) if (words.has(k)) plain[k]++; }
console.log('klangrollen-namen.test.js: ok (' + AK_NAMES.length + ' Namen, 245 Presets ohne Treffer; zum Vergleich: "bpm" in ' + plain.bpm + ', "hit" in ' + plain.hit + ' Presets)');
