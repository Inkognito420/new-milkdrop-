// Acid Milkdrop · Teil 7 von 16: Sichern und Laden (Datei/Text)
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Reihenfolge ist wichtig: index.html lädt sie nacheinander. Bricht ein Teil ab, starten die folgenden nicht.
if (window.__AM_STEP !== 6) throw new Error('Acid Milkdrop: Teil 7 (sichern-laden) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== Sichern und Laden: Sterne, vermessene Presets, Mitschrift (auf Wunsch auch Einstellungen) als Datei oder Text =====
// Safari und das Home-Bildschirm-Icon teilen sich auf dem iPhone keinen Speicher. Laden führt zusammen und ist wiederholbar:
// nichts wird doppelt gezählt, Sterne werden nur hinzugefügt (nie entfernt).
const APP_ID = 'acid-milkdrop';
function slimProfiles(onlyLearned) {
  const slim = {};
  for (const n in profiles) {
    const P = profiles[n];
    if (onlyLearned && !(P.n > 6 || P.nm > 4)) continue;               // reine Startwerte aus acid-profile.js gehören nicht in die Sicherung
    slim[n] = { b: +P.b.toFixed(4), s: +P.s.toFixed(4), hx: +P.hx.toFixed(4), hy: +P.hy.toFixed(4), m: +P.m.toFixed(4), n: P.n, nm: P.nm };
  }
  return slim;
}
function dPack() {
  jrSave(performance.now(), true);
  return {
    app: APP_ID, fmt: 1, build: BUILD_NO, at: Math.floor(Date.now() / 1000), dev: JR.dev,
    standalone: !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches)),
    favs: [...favs],
    profiles: slimProfiles(true),
    settings: { toggles, gain: store.get('am-gain2', null), lat: store.get('am-lat', null), quality: store.get('am-quality', null), color: store.get('am-color', null) },
    journal: { cols: JR_COLS, runs: JR.runs, tracks: JR.tracks, sess: JR.sess }
  };
}
function jrMergeTrack(L, T) {                                          // ergänzt, was lokal fehlt; null = nichts Neues
  const o = Object.assign({}, L); let ch = false;
  if (T.c > o.c) { o.c = T.c; ch = true; }
  if (T.t > o.t) { o.t = T.t; ch = true; }
  for (const k of ['n', 'z', 'd', 'bpm', 'dr', 'mo', 'fp']) if ((o[k] === undefined || o[k] === '' || o[k] === 0) && T[k]) { o[k] = T[k]; ch = true; }
  if (!o.g && T.g) { o.g = 1; ch = true; }
  return ch ? o : null;
}
// Prüft eine Sicherung (apply = false: nur zählen) oder führt sie mit dem Stand hier zusammen (apply = true)
function dMerge(o, apply) {
  const res = { favs: 0, prof: 0, runs: 0, runsAll: 0, tracks: 0, sess: 0 };
  for (const n of (Array.isArray(o.favs) ? o.favs : [])) if (typeof n === 'string' && n.length < 300 && !favs.has(n) && (presets[n] || SH[n])) { res.favs++; if (apply) favs.add(n); }
  const pr = o.profiles && typeof o.profiles === 'object' ? o.profiles : {};
  for (const n in pr) {
    const Q = pr[n]; if (!presets[n] || !Q || typeof Q !== 'object') continue;
    const q = { b: +Q.b, s: +Q.s, hx: +Q.hx, hy: +Q.hy, m: +Q.m, n: jrInt(Q.n), nm: jrInt(Q.nm) };
    if (![q.b, q.s, q.hx, q.hy, q.m].every(isFinite) || q.n < 1 || q.n > 1e6 || q.nm < 0 || q.nm > 1e6) continue;
    const L = profiles[n];
    if (!L || q.n > L.n) { res.prof++; if (apply) profiles[n] = q; }      // die besser vermessene Fassung gewinnt
  }
  const J = o.journal && typeof o.journal === 'object' ? o.journal : {};
  const have = new Set(JR.runs.map(r => r[0] + '|' + r[1])), add = [];
  if (Array.isArray(J.runs)) for (const r of J.runs) {
    const c = jrClean(r); if (!c) continue;
    res.runsAll++; const k = c[0] + '|' + c[1];
    if (!have.has(k)) { have.add(k); add.push(c); }
  }
  res.runs = add.length;
  if (J.tracks && typeof J.tracks === 'object') for (const id in J.tracks) {
    const T = jrCleanTrack(J.tracks[id]); if (!T) continue;
    const key = String(id).slice(0, 16), L = JR.tracks[key];
    if (!L) { res.tracks++; if (apply) JR.tracks[key] = T; }
    else { const m = jrMergeTrack(L, T); if (m) { res.tracks++; if (apply) JR.tracks[key] = m; } }
  }
  const haveS = new Set(JR.sess.map(x => x.ts + '|' + x.dev)), addS = [];
  if (Array.isArray(J.sess)) for (const x of J.sess) { const c = jrCleanSess(x); if (c && c.ts && !haveS.has(c.ts + '|' + c.dev)) { haveS.add(c.ts + '|' + c.dev); addS.push(c); } }
  res.sess = addS.length;
  if (apply) {
    if (add.length) { JR.runs = JR.runs.concat(add).sort((a, b) => a[0] - b[0]); }
    if (addS.length) { JR.sess = JR.sess.concat(addS).sort((a, b) => a.ts - b.ts); }
    jrTrim();
    if (res.favs) { store.set('am-favs', [...favs]); showFav(); }
    if (res.prof) { profDirty = true; saveProfiles(performance.now()); }
    if (add.length || res.tracks || addS.length) { JR.dirty = true; jrSave(performance.now(), true); }
    jrInfo();
  }
  return res;
}
function dSettings(S) {                                                // Einstellungen aus einer Sicherung übernehmen (nur auf Wunsch)
  if (!S || typeof S !== 'object') return false;
  let did = false;
  if (S.toggles && typeof S.toggles === 'object') {
    for (const k in togIds) if (typeof S.toggles[k] === 'boolean') { toggles[k] = S.toggles[k]; $(togIds[k]).classList.toggle('hot', toggles[k]); did = true; }
    store.set('am-toggles', toggles); showName(); if (typeof autoCard === 'function') autoCard();
    if (!toggles.journal) jrEnd('x'); else if (!JR.run && curName) jrStart(curName, 'x');
  }
  for (const [el, v] of [[gainEl, S.gain], [latEl, S.lat]]) if (v !== null && v !== undefined && isFinite(+v)) { el.value = +v; el.dispatchEvent(new Event('input')); did = true; }
  for (const [el, v] of [[$('quality'), S.quality], [colorEl, S.color]]) if (typeof v === 'string' && [...el.options].some(o => o.value === v && !o.disabled)) { el.value = v; el.dispatchEvent(new Event('change')); did = true; }
  jrInfo();
  return did;
}
function dParse(text) {
  let o; try { o = JSON.parse(String(text).replace(/^﻿/, '').trim()); } catch (e) { return { err: 'Das ist keine gültige Sicherung (Text unvollständig oder verändert).' }; }
  if (!o || typeof o !== 'object' || o.app !== APP_ID) return { err: 'Das ist keine Sicherung von Acid Milkdrop.' };
  if (!(o.fmt >= 1) || o.fmt > 1) return { err: 'Diese Sicherung stammt aus einer neueren Version. Lade die Seite neu und versuch es nochmal.' };
  return { o };
}
const dEl = { pane: $('dPane'), text: $('dText'), sum: $('dSum'), set: $('dSet'), apply: $('dApply') };
let dPend = null, dT = 0, sayT = 0;
const sayFor = (t, ms = 7000) => { say(t); clearTimeout(sayT); sayT = setTimeout(() => say(''), ms); };
function dOpen(showText) { dEl.pane.hidden = false; dEl.text.hidden = !showText; dEl.sum.textContent = ''; dEl.apply.disabled = true; dEl.set.checked = false; dPend = null; }
const dDate = s => { const d = new Date(s * 1000), p = x => String(x).padStart(2, '0'); return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); };
function dShow(text) {
  const r = dParse(text);
  if (r.err) { dEl.sum.textContent = r.err; dEl.apply.disabled = true; dPend = null; return; }
  dPend = r.o;
  const m = dMerge(r.o, false), parts = [];
  if (m.favs) parts.push(m.favs + (m.favs === 1 ? ' neuer Stern' : ' neue Sterne'));
  if (m.prof) parts.push(m.prof + ' besser vermessene Presets');
  if (m.runs) parts.push(m.runs + ' neue Läufe in der Mitschrift (' + m.runsAll + ' in der Datei)');
  if (m.tracks) parts.push(m.tracks + (m.tracks === 1 ? ' neuer oder ergänzter Track' : ' neue oder ergänzte Tracks'));
  dEl.sum.textContent = 'Sicherung vom ' + dDate(r.o.at || 0) + ' · Build ' + jrInt(r.o.build) + (r.o.standalone ? ' · aus dem Icon' : ' · aus Safari') + ' · bringt mit: ' + (parts.length ? parts.join(', ') : 'nichts Neues, alles schon da') + '.';
  dEl.set.disabled = !r.o.settings;
  dEl.apply.disabled = false;
}
async function dSave() {
  const json = JSON.stringify(dPack()), kb = Math.round(json.length / 1024);
  const name = 'acid-milkdrop-sicherung-' + new Date().toISOString().slice(0, 10) + '.txt';   // .txt: lässt sich auf dem iPhone überall teilen und in Dateien ablegen
  try {
    const file = new File([json], name, { type: 'text/plain' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Acid Milkdrop Sicherung' }); rea('Sicherung geteilt: ' + name + ' (' + kb + ' KB)'); return; }
  } catch (e) {
    if (e && e.name === 'AbortError') { rea('Sichern abgebrochen'); return; }
    rea('Teilen nicht möglich (' + (e && e.name) + '), lade stattdessen herunter');
  }
  try {
    const a = document.createElement('a'), url = URL.createObjectURL(new Blob([json], { type: 'text/plain' }));
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    rea('Sicherung heruntergeladen: ' + name + ' (' + kb + ' KB)');
  } catch (e) { err('Sichern fehlgeschlagen: ' + e.message); sayFor('Sichern ging nicht. Nimm „Text kopieren“.'); }
}
$('dBtn').addEventListener('click', () => {
  const open = $('dBox').hidden; $('dBox').hidden = !open; $('dBtn').setAttribute('aria-expanded', String(open)); $('dBtn').classList.toggle('hot', open);
  if (open) jrInfo();
});
$('dSave').addEventListener('click', dSave);
$('dCopy').addEventListener('click', () => {
  const json = JSON.stringify(dPack()), kb = Math.round(json.length / 1024);
  const ok = () => { rea('Sicherung als Text kopiert (' + kb + ' KB)'); sayFor('Kopiert (' + kb + ' KB). In der anderen App: „Text einfügen“.'); };
  const fallback = () => {
    dOpen(true); dEl.text.value = json; dEl.text.focus(); try { dEl.text.setSelectionRange(0, json.length); } catch (e) {}
    sayFor('Automatisch kopieren ging nicht. Der Text steht unten: markieren und von Hand kopieren.', 12000);
  };
  try { navigator.clipboard.writeText(json).then(ok, fallback); } catch (e) { fallback(); }
});
$('dLoad').addEventListener('click', () => { $('dFile').value = ''; $('dFile').click(); });
$('dFile').addEventListener('change', async () => {
  const f = $('dFile').files && $('dFile').files[0]; if (!f) return;
  dOpen(false);
  if (f.size > 12e6) { dEl.sum.textContent = 'Die Datei ist zu groß für eine Sicherung.'; return; }
  try { const text = await f.text(); rea('Datei gelesen: ' + f.name + ' (' + Math.round(f.size / 1024) + ' KB)'); dShow(text); }
  catch (e) { dEl.sum.textContent = 'Die Datei konnte nicht gelesen werden.'; }
});
$('dPaste').addEventListener('click', () => { dOpen(true); dEl.text.value = ''; dEl.text.focus(); });
dEl.text.addEventListener('input', () => { clearTimeout(dT); dT = setTimeout(() => { if (dEl.text.value.trim()) dShow(dEl.text.value); else { dEl.sum.textContent = ''; dEl.apply.disabled = true; dPend = null; } }, 250); });
$('dClose').addEventListener('click', () => { dEl.pane.hidden = true; dEl.text.value = ''; dPend = null; });
dEl.apply.addEventListener('click', () => {
  if (!dPend) return;
  const o = dPend; dPend = null; dEl.apply.disabled = true;
  const m = dMerge(o, true);
  const setDid = dEl.set.checked && !dEl.set.disabled && dSettings(o.settings);
  const parts = [];
  if (m.favs) parts.push(m.favs + ' Sterne');
  if (m.prof) parts.push(m.prof + ' Preset-Messungen');
  if (m.runs) parts.push(m.runs + ' Läufe');
  if (m.tracks) parts.push(m.tracks + ' Tracks');
  if (setDid) parts.push('Einstellungen');
  const txt = 'Geladen und zusammengeführt: ' + (parts.length ? parts.join(', ') : 'nichts Neues (alles war schon da)') + '.';
  rea(txt); dEl.sum.textContent = txt; sayFor(txt);
});
let dClearT = 0;
$('dClear').addEventListener('click', () => {
  const b = $('dClear'), reset = () => { dClearT = 0; b.textContent = 'Mitschrift leeren'; b.classList.remove('hot'); };
  if (!dClearT) { b.textContent = 'Wirklich? Nochmal tippen'; b.classList.add('hot'); dClearT = setTimeout(reset, 4000); return; }
  clearTimeout(dClearT); reset();
  JR.runs.length = 0; JR.tracks = {}; JR.run = null;
  jrSave(performance.now(), true); if (curName && toggles.journal) jrStart(curName, 'x');
  rea('Mitschrift geleert (Sterne und vermessene Presets bleiben)');
});
if (/[?&]debug\b/.test(location.search)) window.__DATA = { dPack, dParse, dMerge, dShow, dSettings, slimProfiles };   // nur zum Testen

window.__AM_STEP = 7;
