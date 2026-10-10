// Acid Milkdrop · Teil 10 von 16: Schalter, Automatik-Karte, Regler, Auto-Pegel
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Reihenfolge ist wichtig: index.html lädt sie nacheinander. Bricht ein Teil ab, starten die folgenden nicht.
if (window.__AM_STEP !== 9) throw new Error('Acid Milkdrop: Teil 10 (bedienung) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== Schalter im Sound-Menü =====
for (const k in togIds) {
  const el = $(togIds[k]);
  el.classList.toggle('hot', toggles[k]);
  el.addEventListener('click', () => {
    toggles[k] = !toggles[k]; el.classList.toggle('hot', toggles[k]); store.set('am-toggles', toggles);
    if (k === 'phrase') lastSwitch = performance.now();
    if (k === 'name') showName();
    if (k === 'journal') { rea('Mitschreiben: ' + (toggles.journal ? 'an' : 'aus (bisherige Mitschrift bleibt, es kommt nichts dazu)')); jrSplit('x'); jrInfo(); }
    if (k === 'mix') rea('Mischpult (Körper & Funken): ' + (toggles.mix ? 'an' : 'aus (Effekte wie vor Build 46)'));
    if (k === 'instr') rea('Instrumente hören: ' + (toggles.instr ? 'an (Kick, Mitten, Höhen einzeln)' : 'aus (Milkdrop hört wie vorher Bass, Mitte, Höhen)'));
    if (k === 'own' && !toggles.own && shCur) nextPreset(1.5, undefined, false, 'x');
  });
}
$('fineBtn').addEventListener('click', () => {
  const open = $('fine').hidden; $('fine').hidden = !open;
  $('fineBtn').setAttribute('aria-expanded', String(open)); $('fineBtn').classList.toggle('hot', open);
  if (open) autoCard();
});
$('werkBtn').addEventListener('click', () => {
  const open = $('werk').hidden; $('werk').hidden = !open;
  $('werkBtn').setAttribute('aria-expanded', String(open)); $('werkBtn').classList.toggle('hot', open);
});
// ===== Automatik-Karte (Build 37): zeigt, ob alles automatisch läuft oder etwas von Hand verstellt ist =====
function handSet() {
  const out = [];
  for (const k in TOG_DEFAULT) if (toggles[k] !== TOG_DEFAULT[k]) out.push(TOG_LABEL[k] + (toggles[k] ? ' an' : ' aus'));
  const g = +$('gain').value; if (Math.abs(g - 1) > 0.05) out.push('Reaktion ' + g.toFixed(1) + '×');
  return out;
}
function autoCard() {
  const h = handSet(), card = $('autoCard');
  card.classList.toggle('hand', h.length > 0);
  $('allAuto').hidden = !h.length;
  $('autoTxt').textContent = h.length
    ? 'Von Hand verstellt: ' + h.join(', ') + '.'
    : 'Alles läuft automatisch: Bildwechsel, Effekte und Farben richten sich nach dem Track. Du musst nichts einstellen.';
}
$('allAuto').addEventListener('click', () => {
  const was = handSet();
  for (const k in TOG_DEFAULT) if (toggles[k] !== TOG_DEFAULT[k]) $(togIds[k]).click();   // über den Schalter, damit jede Nebenwirkung mitläuft
  if (Math.abs(+$('gain').value - 1) > 0.05) { $('gain').value = 1; $('gain').dispatchEvent(new Event('input')); }
  rea('Alles auf Auto (vorher von Hand: ' + (was.join(', ') || 'nichts') + ')');
  autoCard(); sayFor('Alles wieder auf Automatik.', 3000);
});
for (const k in togIds) $(togIds[k]).addEventListener('click', autoCard);
$('gain').addEventListener('change', autoCard);

const gainEl = $('gain'), latEl = $('latency');
let autoGain = 1;
const pushGain = tc => inGain.gain.setTargetAtTime(+gainEl.value * (toggles.auto ? autoGain : 1), ctx.currentTime, tc);
const applyGain = () => { pushGain(0.03); $('gainOut').textContent = (+gainEl.value).toFixed(1) + '×'; };
const applyLat = () => { delayNode.delayTime.setTargetAtTime((micOn ? 0 : +latEl.value) / 1000, ctx.currentTime, 0.02); $('latOut').textContent = latEl.value + ' ms'; };
{
  const g = store.get('am-gain2', null), l = store.get('am-lat', null);
  if (g !== null) gainEl.value = g;
  if (l !== null) latEl.value = l; else if (ctx.outputLatency) latEl.value = Math.round(ctx.outputLatency * 1000 / 5) * 5;
}
gainEl.addEventListener('input', () => { applyGain(); store.set('am-gain2', +gainEl.value); });
latEl.addEventListener('input', () => { applyLat(); store.set('am-lat', +latEl.value); });
applyGain(); applyLat();

// ===== Auto-Pegel: gleicht nur die Empfindlichkeit des Visualizers an, der Ton zu den Lautsprechern bleibt unverändert =====
// Ziel: Eingang im Mittel bei -12 dB (Spitzen bleiben unter dem Anschlag). Langsam gemittelt, damit Breaks und Drops ihren Unterschied behalten.
const AGC_TARGET = -12, lvBuf = new Float32Array(levelAn.fftSize);
const agc = { e: null, active: 0, nextLog: 3, db: null, lastSig: performance.now() };
function agcReset() { agc.lastSig = performance.now(); agc.e = null; agc.active = 0; agc.nextLog = 3; agc.db = null; autoGain = 1; pushGain(0.3); }
function agcText() {
  if (!toggles.auto) return 'Auto-Pegel aus. Reaktion wirkt direkt.';
  if (agc.db === null) return 'Auto-Pegel: wartet auf Ton.';
  return 'Auto-Pegel: Eingang ' + agc.db.toFixed(1) + ' dB, Ziel ' + AGC_TARGET + ' dB, Verstärkung ×' + autoGain.toFixed(2);
}
setInterval(() => {
  if (ctx.state !== 'running' || !srcNode || (audio.paused && srcNode === fileNode)) return;
  levelAn.getFloatTimeDomainData(lvBuf);
  let sum = 0; for (let i = 0; i < lvBuf.length; i++) sum += lvBuf[i] * lvBuf[i];
  const e = sum / lvBuf.length;
  if (e < 1e-5) return;                                  // Stille: Wert halten
  agc.lastSig = performance.now();
  agc.active += 0.1;
  const tau = Math.min(12, 0.8 + 0.8 * agc.active);     // am Anfang schnell, dann langsam
  agc.e = agc.e === null ? e : agc.e + (e - agc.e) * (1 - Math.exp(-0.1 / tau));
  agc.db = 10 * Math.log10(agc.e);
  autoGain = Math.pow(10, clamp(AGC_TARGET - agc.db, -12, micOn ? 36 : 15) / 20);   // Mikrofon ist viel leiser als eine Datei: bis +36 dB
  if (toggles.auto) pushGain(0.5);
  if (!$('fine').hidden) $('autoInfo').textContent = agcText();
  if (agc.active >= agc.nextLog) { agc.nextLog += 20; if (toggles.auto) rea(agcText() + ' (Reaktion ×' + (+gainEl.value).toFixed(1) + ')'); }
}, 100);
$('t-auto').addEventListener('click', () => { pushGain(0.2); $('autoInfo').textContent = agcText(); rea(agcText()); });

window.__AM_STEP = 10;
