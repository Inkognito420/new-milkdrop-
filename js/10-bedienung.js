// Acid Milkdrop · Teil 10 von 16: „Mehr“, Bluetooth-Versatz, Auto-Pegel, „Eigene“, Ausblenden (Build 128), Meldung oben
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Reihenfolge ist wichtig: index.html lädt sie nacheinander. Bricht ein Teil ab, starten die folgenden nicht.
if (window.__AM_STEP !== 9) throw new Error('Acid Milkdrop: Teil 10 (bedienung) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== „Mehr“ (Build 126: ohne Werkstatt, ohne Schalter und ohne Regler „Reaktion“; die Empfindlichkeit regelt der Auto-Pegel allein) =====
$('fineBtn').addEventListener('click', () => {
  const open = $('fine').hidden; $('fine').hidden = !open;
  $('fineBtn').setAttribute('aria-expanded', String(open)); $('fineBtn').classList.toggle('hot', open);
  if (open) { $('autoInfo').textContent = agcText(); if (typeof wegBuild === 'function') wegBuild(); }
  if (open && !$('ownList').hidden) $('ownBtn').click();             // Build 128: immer nur ein Fenster über dem Glas-Dock
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
    const box = document.createElement('div'); box.className = 'grid';   // Build 128: Raster statt Zeile
    for (const n of list) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.n = n;
      b.textContent = (favs.has(n) ? '★ ' : '') + n.replace(/^Eigen · |^Acid · /, '');
      if (n === curName || (presets[curName] && presets[curName].lens && presets[curName].lens.base === n)) b.classList.add('hot');   // Build 129: auch Varianten mit Linse
      if (WEG.has(n)) { b.classList.add('weg'); b.title = 'Ausgeblendet: kommt nicht von selbst, antippen zeigt es trotzdem'; }
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
  if (open && !$('fine').hidden) $('fineBtn').click();               // Build 128: immer nur ein Fenster über dem Glas-Dock
});
autoBtn.addEventListener('click', () => { if (auto) { autoBtn.hidden = true; rea('Automatik läuft wieder'); if (!ownList.hidden) ownBuild(); } });   // läuft nach dem Umschalten in js/08

// ===== Build 128: Meldung oben und großes Symbol in der Mitte (Rückmeldung für Gesten, auch wenn das Menü aus ist) =====
const toastEl = $('toast'), toastTxt = $('toastTxt'), toastBtn = $('toastBtn'), gfxEl = $('gfx');
let toastT = 0, toastAct = null;
function toast(text, ms = 2200, undo) {
  clearTimeout(toastT); toastTxt.textContent = text; toastAct = undo || null; toastBtn.hidden = !undo; toastEl.hidden = false;
  toastT = setTimeout(() => { toastEl.hidden = true; toastAct = null; }, ms);
}
toastBtn.addEventListener('click', () => { const f = toastAct; toastAct = null; clearTimeout(toastT); toastEl.hidden = true; if (f) f(); });
function gfxPop(icon, cls) {                                         // icon: Name einer Maske aus style.css (--i-…), cls: '' grün, 'ban' rot, 'white'
  gfxEl.className = ''; gfxEl.style.setProperty('--ic', 'var(--i-' + icon + ')');
  void gfxEl.offsetWidth; gfxEl.className = (cls ? cls + ' ' : '') + 'go';
}

// ===== Build 128 (Emmo): „Will ich nicht mehr sehen“ (Wisch nach unten) =====
// Das laufende Visual kommt nie wieder von selbst dran (WEG, js/05; usable() in js/08 lässt es weg, auch als Mix-Partner).
// 5 Sekunden lang holt „Rückgängig“ es sofort zurück, später die Liste „Ausgeblendet“ unter „Mehr“. Gezielt aus „Eigene“ geht es weiterhin.
// Ein Mix hat keinen festen Namen: dann wird nur diese Paarung für die Sitzung gesperrt.
const wegBox = $('wegBox');
function wegBuild() {
  if (!wegBox) return;
  wegBox.textContent = '';
  const add = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; wegBox.appendChild(e); return e; };
  add('div', 'gl', 'Ausgeblendet (' + WEG.size + ')');
  if (!WEG.size) { add('div', 'note', 'Noch nichts ausgeblendet. Nach unten wischen blendet das laufende Visual für immer aus.'); return; }
  add('div', 'note', 'Antippen holt ein Visual zurück (es kommt dann wieder von selbst dran).');
  const row = add('div', 'row');
  for (const n of [...WEG].sort()) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.n = n; b.textContent = '↩ ' + n;
    b.addEventListener('click', () => wegBack(n, false));
    row.appendChild(b);
  }
}
function wegBack(n, show) {
  if (!WEG.delete(n)) return false;
  wegSave(); erg('Zurückgeholt: „' + n + '“' + (show ? ' (Rückgängig)' : ' (Liste unter „Mehr“)'));
  if (!$('fine').hidden) wegBuild();
  if (!ownList.hidden) ownBuild();
  if (show) loadByName(n, 1.0, true, 'r'); else toast('Wieder dabei: ' + n);
  return true;
}
function wegNow() {
  const n = curName; if (!n || !viz) return false;
  if (presets[n] && presets[n].lens) {                                // Build 129: Variante mit Linse kommt ohnehin nicht von selbst wieder
    erg('Ausgeblendet: Variante „' + n + '“ (kommt nicht wieder, das Visual selbst bleibt)');
    gfxPop('ban', 'ban'); nextPreset(1.0, undefined, false, 'v'); toast('Diese Variante kommt nicht wieder');
    return true;
  }
  if (n.indexOf('Mix · ') === 0) {
    const p = presets[n]; if (p && p.mix && window.__MIX) __MIX.bad.add(p.mix.a + '|' + p.mix.b);
    erg('Ausgeblendet: Mix „' + n + '“ (diese Paarung kommt in dieser Sitzung nicht wieder)');
    gfxPop('ban', 'ban'); nextPreset(1.0, undefined, false, 'v'); toast('Dieser Mix kommt nicht wieder');
    return true;
  }
  WEG.add(n); wegSave();
  erg('Ausgeblendet: „' + n + '“ (kommt nie wieder von selbst, zurückholen unter „Mehr“)');
  gfxPop('ban', 'ban');
  nextPreset(1.0, undefined, false, 'v');
  toast('Ausgeblendet: ' + n, 5000, () => wegBack(n, true));
  if (!$('fine').hidden) wegBuild();
  if (!ownList.hidden) ownBuild();
  return true;
}
window.wegNow = wegNow; window.toast = toast; window.gfxPop = gfxPop;

window.__AM_STEP = 10;
