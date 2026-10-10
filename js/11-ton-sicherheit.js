// Acid Milkdrop · Teil 11 von 16: Sicherheits-Modus für den Ton
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Reihenfolge ist wichtig: index.html lädt sie nacheinander. Bricht ein Teil ab, starten die folgenden nicht.
if (window.__AM_STEP !== 10) throw new Error('Acid Milkdrop: Teil 11 (ton-sicherheit) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== Sicherheits-Modus: Wenn der Player dem Visualizer keinen Ton liefert (z. B. manche Formate oder nach einer Unterbrechung),
// wird die Datei selbst dekodiert und über die Audio-Engine abgespielt. Der Player bleibt dabei die Uhr (Zeit, Pause, Spulen). =====
let bufState = null, wdSilent = 0, wdLimit = 4, driftHits = 0, lastResync = 0, resyncCount = 0;
function bufStop() {
  if (bufState && bufState.src) { try { bufState.src.stop(); } catch (e) {} try { bufState.src.disconnect(); } catch (e) {} bufState.src = null; }
}
function bufStart() {
  if (!bufState || !bufState.buf) return;
  bufStop();
  const pos = Math.max(0, Math.min(audio.currentTime, bufState.buf.duration - 0.05));
  const src = ctx.createBufferSource(); src.buffer = bufState.buf; src.connect(bufState.out);
  src.start(0, pos); bufState.src = src; bufState.t0 = ctx.currentTime - pos;
}
function bufExit() {
  if (!bufState) return;
  bufStop(); try { bufState.out.disconnect(); } catch (e) {}
  try { if (fileNode) fileNode.connect(ctx.destination); } catch (e) {}
  bufState = null;
}
async function enterBufferMode(why) {
  if (bufState || !curFile) return;
  const f = curFile; bufState = { busy: true };
  rea('Sicherheits-Modus: ' + why + ' Datei wird selbst dekodiert …');
  say('Sicherheits-Modus: Ton wird neu aufgebaut …');
  try {
    if (f.size > 250e6) throw new Error('Datei zu groß (' + (f.size / 1048576).toFixed(0) + ' MB)');
    const raw = await f.arrayBuffer();
    const buf = await new Promise((res, rej) => { const p = ctx.decodeAudioData(raw, res, rej); if (p && p.then) p.then(res, rej); });
    if (curFile !== f) { bufState = null; return; }
    const out = ctx.createGain(); out.connect(ctx.destination);
    try { fileNode.disconnect(ctx.destination); } catch (e) {}
    bufState = { buf, out, src: null, t0: 0 };
    connect(out);
    if (!audio.paused) bufStart();
    wdLimit = 1.5;                                    // beim nächsten Mal schneller umschalten
    say(''); rea('Sicherheits-Modus läuft: ' + buf.duration.toFixed(0) + ' s, ' + buf.sampleRate + ' Hz, ' + buf.numberOfChannels + ' Kanäle');
  } catch (e) {
    bufState = null; say('Dieser Track liefert keinen Ton. Probier MP3, M4A oder WAV.'); err('Sicherheits-Modus fehlgeschlagen: ' + (e && e.message || e));
  }
}
audio.addEventListener('playing', () => { if (bufState && bufState.buf) bufStart(); });
audio.addEventListener('pause', () => bufStop());
audio.addEventListener('ended', () => bufStop());
audio.addEventListener('seeked', () => { if (bufState && bufState.buf && !audio.paused) bufStart(); });
// Wächter: Läuft der Player, aber der Visualizer bekommt länger keinen Ton → Sicherheits-Modus. Gleichlauf im Sicherheits-Modus prüfen.
setInterval(() => {
  if (ctx.state !== 'running' || audio.paused || !isFinite(audio.duration)) { wdSilent = 0; return; }
  if (bufState && bufState.buf) {
    if (bufState.src) {
      const drift = (ctx.currentTime - bufState.t0) - audio.currentTime;
      if (Math.abs(drift) > 0.5) {
        const nowT = performance.now();
        if (++driftHits >= 3 && nowT - lastResync > 8000 && resyncCount < 4) {
          driftHits = 0; lastResync = nowT; resyncCount++;
          rea('Gleichlauf korrigiert (' + (drift * 1000).toFixed(0) + ' ms Abweichung)' + (resyncCount >= 4 ? ', ab jetzt nicht mehr (Uhren laufen unterschiedlich)' : '')); bufStart();
        }
      } else driftHits = 0;
    }
    return;
  }
  if (bufState || srcNode !== fileNode || audio.duration - audio.currentTime < 8) { wdSilent = 0; return; }
  if (performance.now() - agc.lastSig > 700) wdSilent += 0.5; else wdSilent = 0;
  if (wdSilent >= wdLimit) { wdSilent = 0; enterBufferMode('Der Player läuft, liefert dem Visualizer aber keinen Ton.'); }
}, 500);

function setBpm(v, show) {
  bpm = clamp(v, 60, 200);
  if (show) $('bpm').textContent = Math.round(bpm);
}

window.__AM_STEP = 11;
