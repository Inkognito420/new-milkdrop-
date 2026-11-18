// Acid Milkdrop · Teil 10 von 16: „Mehr“, Bluetooth-Versatz, Auto-Pegel
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Reihenfolge ist wichtig: index.html lädt sie nacheinander. Bricht ein Teil ab, starten die folgenden nicht.
if (window.__AM_STEP !== 9) throw new Error('Acid Milkdrop: Teil 10 (bedienung) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== „Mehr“ (Build 126: ohne Werkstatt, ohne Schalter und ohne Regler „Reaktion“; die Empfindlichkeit regelt der Auto-Pegel allein) =====
$('fineBtn').addEventListener('click', () => {
  const open = $('fine').hidden; $('fine').hidden = !open;
  $('fineBtn').setAttribute('aria-expanded', String(open)); $('fineBtn').classList.toggle('hot', open);
  if (open) $('autoInfo').textContent = agcText();
});

const latEl = $('latency');
let autoGain = 1;
const pushGain = tc => inGain.gain.setTargetAtTime(toggles.auto ? autoGain : 1, ctx.currentTime, tc);
const applyLat = () => { delayNode.delayTime.setTargetAtTime((micOn ? 0 : +latEl.value) / 1000, ctx.currentTime, 0.02); $('latOut').textContent = latEl.value + ' ms'; };
{
  const l = store.get('am-lat', null);
  if (l !== null) latEl.value = l; else if (ctx.outputLatency) latEl.value = Math.round(ctx.outputLatency * 1000 / 5) * 5;
}
latEl.addEventListener('input', () => { applyLat(); store.set('am-lat', +latEl.value); });
pushGain(0.03); applyLat();

// ===== Auto-Pegel: gleicht nur die Empfindlichkeit des Visualizers an, der Ton zu den Lautsprechern bleibt unverändert =====
// Ziel: Eingang im Mittel bei -12 dB (Spitzen bleiben unter dem Anschlag). Langsam gemittelt, damit Breaks und Drops ihren Unterschied behalten.
const AGC_TARGET = -12, lvBuf = new Float32Array(levelAn.fftSize);
const agc = { e: null, active: 0, nextLog: 3, db: null, lastSig: performance.now() };
function agcReset() { agc.lastSig = performance.now(); agc.e = null; agc.active = 0; agc.nextLog = 3; agc.db = null; autoGain = 1; pushGain(0.3); }
function agcText() {
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
  if (agc.active >= agc.nextLog) { agc.nextLog += 20; if (toggles.auto) rea(agcText()); }
}, 100);

// ===== „Eigene“ (Build 127, Emmos Wunsch): Liste der selbstgebauten Visuals, gezielt anschauen =====
// Antippen lädt das Visual und hält es fest: keine automatischen Wechsel (auch nicht im Drop, der Bild-Wächter pausiert mit), bis „Weiter automatisch“.
// Wischen geht weiter von Hand. Die Liste: eigene Visuals (eigene-visuals.js) und die Acid-Presets (acid-presets.js), Stern = Favorit.
const ownBtn = $('ownBtn'), ownList = $('ownList'), autoBtn = $('auto');
function ownBuild() {
  ownList.textContent = '';
  for (const [title, list] of [['Eigene Visuals', [...EIGEN].sort()], ['Acid-Presets', [...ACID].filter(n => !EIGEN.has(n)).sort()]]) {
    if (!list.length) continue;
    const h = document.createElement('div'); h.className = 'gl'; h.textContent = title + ' (' + list.length + ')'; ownList.appendChild(h);
    const box = document.createElement('div'); box.className = 'row';
    for (const n of list) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.n = n;
      b.textContent = (favs.has(n) ? '★ ' : '') + n.replace(/^Eigen · |^Acid · /, '');
      if (n === curName) b.classList.add('hot');
      b.addEventListener('click', () => ownShow(n));
      box.appendChild(b);
    }
    ownList.appendChild(box);
  }
}
function ownShow(n) {
  if (!loadByName(n, 1.0, true, 'w')) { sayFor('„' + n + '“ lässt sich gerade nicht laden.', 3000); return; }
  auto = false; autoBtn.hidden = false; autoBtn.classList.remove('hot'); autoBtn.textContent = 'Weiter automatisch';
  rea('Eigene: „' + n + '“ gezielt gewählt, automatische Wechsel pausiert');
  ownBuild();
}
ownBtn.addEventListener('click', () => {
  const open = ownList.hidden; ownList.hidden = !open;
  ownBtn.setAttribute('aria-expanded', String(open)); ownBtn.classList.toggle('hot', open);
  if (open) ownBuild();
});
autoBtn.addEventListener('click', () => { if (auto) { autoBtn.hidden = true; rea('Automatik läuft wieder'); if (!ownList.hidden) ownBuild(); } });   // läuft nach dem Umschalten in js/08

window.__AM_STEP = 10;
