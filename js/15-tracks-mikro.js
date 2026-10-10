// Acid Milkdrop · Teil 15 von 16: Playlist, Laden von Tracks, Mikrofon
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Reihenfolge ist wichtig: index.html lädt sie nacheinander. Bricht ein Teil ab, starten die folgenden nicht.
if (window.__AM_STEP !== 14) throw new Error('Acid Milkdrop: Teil 15 (tracks-mikro) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== Playlist und Laden =====
function connect(node) {
  if (srcNode === node) return;
  if (srcNode) { try { srcNode.disconnect(inGain); } catch (e) {} try { srcNode.disconnect(levelAn); } catch (e) {} }
  srcNode = node; node.connect(inGain); node.connect(levelAn);
}
let trackExtra = '';
function setTrackInfo(extra) {
  if (extra !== undefined) trackExtra = extra;
  const f = queue[qi]; const el = $('track');
  if (!f) { el.textContent = 'Noch kein Track'; return; }
  const em = document.createElement('em'); em.textContent = f.name.replace(/\.[^.]+$/, '');
  el.replaceChildren(document.createTextNode(queue.length > 1 ? (qi + 1) + '/' + queue.length + ' · ' : ''), em, document.createTextNode(trackExtra ? ' · ' + trackExtra : ''));
  $('nextTrack').disabled = qi >= queue.length - 1;
}
async function playAt(i) {
  if (i < 0 || i >= queue.length) return;
  if (micOn) stopMic();
  qi = i; const f = queue[i]; jrEnd('k'); curFile = f;
  trg('Track geladen: ' + f.name + ' (' + (f.size / 1048576).toFixed(1) + ' MB)');
  curAnalysis = null; scanType = null; lastBi = null; $('timeline').hidden = true;
  bufExit(); wdSilent = 0; resyncCount = 0; driftHits = 0;
  resetBeat(); agcReset();
  jrPlay(f);                                         // Mitschreiben: Track vermerken, neuer Lauf für das laufende Visual
  if (audio.src) URL.revokeObjectURL(audio.src);
  audio.src = URL.createObjectURL(f);
  audio.load();
  if (!fileNode) { fileNode = ctx.createMediaElementSource(audio); fileNode.connect(ctx.destination); }
  connect(fileNode);
  $('play').disabled = false; $('intro').hidden = true;
  setTrackInfo('');
  say('');
  try { await ctx.resume(); await audio.play(); } catch (err) { say('Track geladen. Tippe auf Play.'); }
  try { viz && viz.launchSongTitleAnim(f.name.replace(/\.[^.]+$/, '')); } catch (err) {}
  applyScanFor(f);
}
function applyScanFor(f) {
  ensureScan(f).then(A => {
    if (curFile !== f || micOn) return;
    if (A && A.skipped === SCAN_STOP.skipped) return;   // Scan wurde verworfen (Track war kurz nicht gefragt): der neue Auftrag meldet sich selbst
    if (!A || A.skipped) {
      setTrackInfo(A && A.skipped === 'lang' ? 'langer Mix, läuft live' : 'läuft live');
      erg('Kein Scan: ' + (A && A.skipped ? A.skipped : 'fehlgeschlagen') + ', läuft live');
      jrScan(f, A);
    } else {
      curAnalysis = A; jrScan(f, A);
      if (A.grid) setBpm(A.bpm, true);
      erg('Scan fertig: ' + (A.grid ? A.bpm.toFixed(2) + ' BPM, ' + A.drops + ' Drops' : 'kein festes Raster'));
      if (A.klang) erg('Klangbild (Schläge und Töne getrennt, ' + A.klangMs + ' ms): ' + klangSummary(A));
      else if (A.klangErr) err('Klangbild fehlgeschlagen: ' + A.klangErr);
      if (A.km) erg('Klangmesser (' + A.kmMs + ' ms): ' + kmSummary(A));
      else if (A.kmErr) err('Klangmesser fehlgeschlagen: ' + A.kmErr);
      setTrackInfo(A.grid ? A.drops + (A.drops === 1 ? ' Drop' : ' Drops') : 'kein festes Raster, läuft live');
      $('mood').textContent = 'Stimmung: ' + moodText(A.mood) + ' · ' + (A.grid ? A.bpm.toFixed(1) + ' BPM' : 'ohne festes Tempo') + (A.km ? ' · Puls ' + A.km.puls16 + 'tel' + (A.km.keyShare >= 0.25 ? ' · Grundton ' + KM_NOTES[A.km.key] : '') : '');
      drawTimeline(A);
    }
    if (queue[qi + 1]) ensureScan(queue[qi + 1]);
  });
}
function setPlayLabel() { $('play').textContent = audio.paused ? 'Play' : 'Pause'; }
audio.addEventListener('play', setPlayLabel);
audio.addEventListener('pause', setPlayLabel);
audio.addEventListener('ended', () => { setPlayLabel(); if (qi < queue.length - 1) playAt(qi + 1); });
audio.addEventListener('error', () => say('Diese Datei kann das iPhone nicht abspielen. Nimm MP3, AAC/M4A oder WAV.'));
audio.addEventListener('loadedmetadata', () => { if (curAnalysis) drawTimeline(curAnalysis); });
$('play').addEventListener('click', async () => {
  // Build 49: Die Absicht gilt beim Tippen. Auf dem iPhone hängt ctx.resume() bis zum ersten Tipp; das wartende playAt startet den Track dann schon vor
  // diesem Handler, der ihn sonst sofort wieder pausiert hätte (Protokoll: "Player: spielt", "Player: pause", dann Neustart durch den Wächter).
  const wollteStarten = audio.paused;
  try { await ctx.resume(); } catch (e) {}
  if (micOn) { stopMic(); if (audio.src) { connect(fileNode); } }
  if (wollteStarten) { if (audio.paused) { try { await audio.play(); say(''); } catch (e) { say('Abspielen blockiert. Tippe nochmal auf Play.'); } } }
  else audio.pause();
});
$('nextTrack').addEventListener('click', () => playAt(qi + 1));

// ===== Mikrofon: auf den Ton aus der Umgebung reagieren =====
function micUi() { $('micBtn').classList.toggle('hot', micOn); $('micBtn').setAttribute('aria-pressed', String(micOn)); $('micBtn').textContent = micOn ? '🎤 Mikro an' : '🎤 Mikro'; }
async function startMic() {
  if (micOn) return;
  trg('Tipp: Mikro an');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { say('Das Mikrofon geht hier nicht. Öffne die Seite in Safari oder Chrome über den Link.'); erg('Mikro: getUserMedia fehlt'); return; }
  try { await ctx.resume(); } catch (e) {}
  try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch (e) {}
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }, video: false });
  } catch (e) {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e2) {}
    say(e && e.name === 'NotAllowedError' ? 'Mikrofon nicht erlaubt. Erlaube es in den Einstellungen von Safari bzw. Chrome für diese Seite.' : 'Kein Mikrofon gefunden.');
    erg('Mikro fehlgeschlagen: ' + (e && e.name) + ' ' + (e && e.message || '')); return;
  }
  wantPlay = false; audio.pause(); bufExit();
  micStream = stream; micNode = ctx.createMediaStreamSource(stream); micOn = true;
  micGainSaved = +gainEl.value; if (micGainSaved !== 1) { gainEl.value = 1; applyGain(); }   // der Auto-Pegel regelt das Mikro; ein hoher Regler würde zusätzlich übersteuern
  curAnalysis = null; scanType = null; lastBi = null; $('timeline').hidden = true;
  resetBeat(); agcReset(); applyLat(); jrSplit('k');
  connect(micNode);                                  // nur in die Analyse, nie zu den Lautsprechern (sonst Rückkopplung)
  $('intro').hidden = true; setTrackInfo(); $('track').textContent = 'Mikrofon · Umgebung, live'; say('');
  stream.getAudioTracks().forEach(t => t.addEventListener('ended', () => { if (micOn) { rea('Mikrofon wurde vom System beendet'); stopMic(); } }));
  micUi();
  const st = stream.getAudioTracks()[0] && stream.getAudioTracks()[0].getSettings ? stream.getAudioTracks()[0].getSettings() : {};
  erg('Mikro läuft · Echo-Filter ' + (st.echoCancellation ? 'AN (stört)' : 'aus') + ', Rauschfilter ' + (st.noiseSuppression ? 'AN (stört)' : 'aus') + ', Auto-Lautstärke ' + (st.autoGainControl ? 'AN (stört)' : 'aus'));
}
function stopMic() {
  if (!micOn) return;
  micOn = false;
  try { if (micNode) micNode.disconnect(); } catch (e) {}
  try { if (micStream) micStream.getTracks().forEach(t => t.stop()); } catch (e) {}
  micNode = null; micStream = null;
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  if (srcNode && srcNode !== fileNode) srcNode = null;
  gainEl.value = micGainSaved; applyGain();
  resetBeat(); agcReset(); applyLat(); micUi(); jrSplit('k');
  setTrackInfo(); rea('Mikro aus');
  if (curFile) applyScanFor(curFile);
}
$('micBtn').addEventListener('click', () => { if (micOn) { trg('Tipp: Mikro aus'); stopMic(); } else startMic(); });

const isAudio = f => f && (/^audio\//.test(f.type) || /\.(mp3|m4a|aac|wav|aif|aiff|flac|caf|ogg|opus)$/i.test(f.name));
const dropEl = $('drop');
let dragDepth = 0;
const hasFiles = e => { const t = e.dataTransfer && e.dataTransfer.types; return !!t && Array.prototype.indexOf.call(t, 'Files') !== -1; };
window.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; dropEl.hidden = false; });
window.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; dropEl.hidden = false; });
window.addEventListener('dragleave', e => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropEl.hidden = true; });
window.addEventListener('drop', e => {
  e.preventDefault(); dragDepth = 0; dropEl.hidden = true;
  const dt = e.dataTransfer; if (!dt) return;
  let files = Array.from(dt.files || []);
  if (!files.length && dt.items) files = Array.from(dt.items).map(i => i.kind === 'file' ? i.getAsFile() : null).filter(Boolean);
  if (!files.length) { say('Da kam keine Datei an. Nimm „＋ Tracks“ oder zieh die Tracks aus der Dateien-App.'); return; }
  addTracks(files);
});
// Knopf „＋ Tracks“: normale Dateiauswahl (Android, iPhone, Rechner)
$('addBtn').addEventListener('click', () => { trg('Tipp: ＋ Tracks'); $('fileIn').value = ''; $('fileIn').click(); });
$('fileIn').addEventListener('change', e => {
  const files = Array.from(e.target.files || []);
  rea(files.length + ' Datei(en) ausgewählt');
  if (files.length) addTracks(files);
});
function addTracks(files) {
  const tracks = files.filter(isAudio);
  if (!tracks.length) { say('Keine Audiodatei dabei. Nimm MP3, M4A, WAV oder AIFF.'); return; }
  const wasIdle = qi < 0 || (audio.ended && qi >= queue.length - 1);
  const start = queue.length;
  rea(tracks.length + (tracks.length === 1 ? ' Track' : ' Tracks') + ' hinzugefügt (' + (wasIdle ? 'startet sofort' : 'kommt in die Liste') + ')');   // auch fürs Ablegen aus der Dateien-App
  queue.push(...tracks);
  if (wasIdle) playAt(start);
  else {
    setTrackInfo();
    say(tracks.length === 1 ? '„' + tracks[0].name + '“ kommt in die Liste.' : tracks.length + ' Tracks hinten angehängt.');
    setTimeout(() => say(''), 4000);
    if (queue[qi + 1]) ensureScan(queue[qi + 1]);
  }
}

window.__AM_STEP = 15;
