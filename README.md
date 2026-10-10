# Acid

Acid Milkdrop: Musik-Visualizer fuers iPhone. Laeuft im Browser (Safari oder als
Home-Bildschirm-App), nichts wird hochgeladen: https://inkognito420.github.io/Acid/

Eigene Tracks laden, Takt und Abschnitte werden vorab erkannt (Scan), Milkdrop
(Butterchurn) und eigene Shader reagieren auf Kick, Mitten und Hi-Hats.

## Dateien

- `index.html` - nur noch das Geruest: Leiste, Menue, Knoepfe und die Liste der Programmteile
- `style.css` - Aussehen (Farben, Leiste, Menue)
- `app-files.js` - Liste aller Programmteile in Ladereihenfolge (liest der Loader in index.html und `sw.js`)
- `sw.js`, `manifest.webmanifest`, `icon-*.png` - Offline-Betrieb und Home-Bildschirm-App: nach dem ersten Laden startet die App auch ohne Netz (eigene Dateien und Butterchurn werden gespeichert; Schriften nicht)
- `js/analyse.js` - Track-Analyse (Tempo, Takt, Abschnitte, Klangbild, Klangmesser), reine Rechenfunktionen
- `js/01-grundlagen.js` bis `js/16-start.js` - das Programm in 16 Teilen, in dieser Reihenfolge geladen:
  01 Grundlagen (Start, Audio-Weg, Protokoll, Zustand) · 02 Instrumente hoeren ·
  03 Eigene Shader · 04 Bildschirm (Groesse, Farbe) · 05 Presets vermessen ·
  06 Mitschrift · 07 Sichern/Laden · 08 Auswahl (Lastbremse, Preset-Auswahl, Wechsel) ·
  09 Schleife (60 fps, Waechter) · 10 Bedienung (Schalter, Automatik-Karte, Auto-Pegel) ·
  11 Ton-Sicherheit · 12 Erkennung (live und Scan) · 12b Mischpult (Koerper & Funken) · 13 Effekte und Gesten ·
  14 Track-Scan · 15 Tracks und Mikro · 16 Start
  Alle Teile teilen sich einen gemeinsamen Bereich; jeder Teil prueft am Anfang, ob der
  vorige fertig ist (`window.__AM_STEP`), sonst startet er nicht.
  Nach jeder Aenderung die Build-Nummer `var B=...` in index.html hochzaehlen (steht nur dort; der Loader haengt sie als `?b=` an alle Teile),
  damit das Handy keine alten Teile aus dem Zwischenspeicher nimmt. Neue Teile in `app-files.js` eintragen (einzige Liste, Reihenfolge = Ladereihenfolge).
- `acid-shader.js` - eigene Shader (WebGL) und der Player dafuer
- `acid-profile.js`, `acid-presets.js` - vermessene Milkdrop-Presets, eigene Presets
- `adaptive-preset-blender.js`, `audio-reactive-controller.js` - Presets mischen, Reaktion
- `b33/` - Vergleichsseite: Stand von Build 33 unveraendert (nur Titel), zum Gegenhoeren unter `/Acid/b33/`. Hat eigene Kopien aller Dateien und gehoert nicht zum Programm.
- `shader-test.html` - Testseite fuer die eigenen Shader (Messlauf)
- `acid-bild-*.jpg` - Bilder fuer die Bild-Presets

Pruefen (laeuft bei jedem Push als GitHub-Aktion, `.github/workflows/pruefen.yml`):

- Schnell, nur Node: `for f in js/*.js *.js; do node --check $f; done; node test/files.test.js; node test/analyse.test.js`
- Im Browser (Chromium ueber Playwright, ohne Internet): `node test/browser.js [Szenario,...]`. Braucht `npm i playwright && npx playwright install chromium`.
  Butterchurn und Schriften werden durch Attrappen ersetzt, die Seite laeuft unter `/Acid/` wie auf GitHub Pages, Audiodateien kommen ueber das
  Dateifeld (`test/gen-track.js` erzeugt einen kuenstlichen 140-BPM-Track). Geprueft werden Start, Bedienung, Shader, Zufallswechsel und Gesten, Scan,
  Warteschlange, Grafik-Verlust, Mikrofon, Trackwechsel, Sicherung, Fehlermeldungen und Offline-Betrieb. Nicht geprueft werden Ton und Aussehen von Butterchurn
  und alles, was nur auf einem echten iPhone passiert (Safari, Lautlos-Schalter, Wake-Lock).

Werkstatt-Schalter stehen an einer Stelle: Tabelle `TOGGLES` in `js/01-grundlagen.js` (Name, Gruppe, Beschriftung, Standard, Hinweis). Die Knoepfe entstehen daraus.

## Scan-Warteschlange (ab Build 48)

`js/14-track-scan.js`. Es laeuft immer nur ein Scan, und gescannt wird nur, was gebraucht wird: der laufende Track
zuerst, danach als Vorlauf der naechste der Liste. Wer schnell durch die Liste springt, stoesst keine unnoetigen Scans
mehr an: wartende Auftraege fuer andere Tracks fallen weg, ein laufender Scan hoert am naechsten Teilstueck (60 s Ton)
auf (`alive()` in `analyzeFile`). Ein verworfener Scan wird nicht gemerkt und startet bei Bedarf neu. Im Test (5 Tracks,
schnell durchgeskippt) war der Scan des gehoerten Tracks nach 3 statt 9 Sekunden da.

Dekodiert wird wie immer in der Rate der Audio-Engine, die Teilstuecke rechnen sie beim Rendern auf 22,05 kHz um. Das
gehoert zu den Messwerten (die Umrechnung hat keinen Tiefpass: Hoehen ueber 11 kHz falten ins Band darunter). Nur bei
sehr langen Tracks (geschaetzter Puffer ueber 200 MB, etwa 9 Minuten Stereo) oder unbekannter Laenge wird gleich in
22,05 kHz dekodiert: das braucht weniger als die Haelfte des Speichers. Tempo, Abschnitte, Drops und Tonart bleiben
dabei gleich, die Hoehen-Messwerte (Helligkeit, Filter) verschieben sich. Das Protokoll sagt es:
„Scan: dekodiert mit … Hz … MB im Speicher (sparsam, lange Datei)“.

## Track-Flug (Build 36 bis 47, entfernt in Build 48)

Der Track-Flug (Tunnel durch den gescannten Track) war seit Build 38 aus und ist entfernt. Wer ihn zurueckhaben will:
`git checkout e3a8885` (letzter Stand mit Track-Flug, Build 46), Shader `flug-track` in `acid-shader.js`, Teil 3 und die Verweise in 08, 10, 12, 15.

## Klangmesser (ab Build 43)

Messwerte pro Takt, im Scan berechnet (`kmSetup`, `kmFrame`, `kmChroma`, `kmBars` in `js/analyse.js`, Ergebnis `A.km`).
Rechenwege und Skalen stammen aus dem eigenständigen Klangmesser, laufen hier aber auf dem Raster des Scans
(Tempo auf 0,01 BPM, echte Takt-Eins) und im selben Durchlauf wie der Scan (keine zweite Dekodierung).

| Wert | Bedeutung | Wirkung im Visualizer |
| --- | --- | --- |
| Druck | Lautstärke und Bass | Bildwahl: Helligkeit |
| Hektik | 8tel/16tel/32tel-Puls in Mitten und Höhen | Bildwahl: Bewegung, Funken-Menge |
| Schärfe | Klangschwerpunkt, Rauschigkeit | Bildwahl: Sättigung |
| Spannung | Takt gegen die 8 davor (0,5 = neutral) | Stärke des Kick-Pulses (0,7 bis 1,3) |
| Filter | Schwanken des Klangschwerpunkts im Takt | Acid-Farbe (0,6 bis 1,4), Bildwahl: Acid-Grün |
| Ton | stärkster der 12 Töne (ab 100 Hz) | Farbsprung beim Tonwechsel (30° pro Halbton) |

- Druck, Hektik, Schärfe und Filter werden für die Bildwahl auf den Track selbst bezogen (`K.lo`/`K.hi`, 10- bis 90-%-Wert der vollen Takte), Spannung bleibt absolut.
- Ohne Scan (Mikro, langer Mix) fehlen die Werte, alles läuft dann wie vorher.
- Fehler im Klangmesser stoppen den Scan nicht: `A.kmErr`, Protokollzeile „Klangmesser fehlgeschlagen“.
- Protokoll nach dem Scan: „Klangmesser (… ms): Druck … · Hektik … · Grundton …“. Die Stimmungszeile zeigt zusätzlich Puls und Grundton.
- Test ohne Browser: Rechenfunktionen laufen in Node (`vm.runInThisContext` auf `js/analyse.js`), z. B. mit einem künstlichen Track.

## Mischpult „Koerper & Funken“ (ab Build 46)

`js/12b-mischpult.js`. Zwei Arten von Reaktion, an einer Stelle gemischt:

- **Koerper** (alles, was sich bewegt): Zoom, Drehen, Schwanken als Federn. Die Zoom-Feder ist auf das
  Tempo gestimmt (eine Schwingung pro Schlag): rein auf dem Kick, zurueck zum Offbeat. Mit Scan kommt der
  Stoss so frueh, dass die Spitze genau auf dem Kick liegt. Drehen folgt der 303-Filterfahrt (eine
  Schwingung pro Takt), Schwanken geht auf der Takt-Eins links/rechts (eine pro zwei Takte).
- **Funken** (alles, was auftaucht): Funken und Ringe kosten Energie aus einem Konto. Pro Schlag kommt
  Energie dazu (Drop viel, Break wenig). Vor dem Drop wird angespart (in 8 Takten fast voll), im Drop
  geht alles auf einmal raus (Funken und Blitz je nach Kontostand).
- **Sidechain / Unruhe-Budget**: Der Kick drueckt Drehen und Schwanken kurz weg, grosse Funken druecken
  den Koerper weg, ein stark schwingender Koerper bekommt weniger Funken. Deckel pro Abschnitt.
- **Ausholen**: Vor dem Drop wird die Dreh-Feder aufgezogen und das Bild zoomt langsam rein, einen Schlag
  vorher zieht es zurueck, im Drop schnappt die Feder los und schwingt 2 Takte frei aus.

Ersetzt (Schalter „Mischpult“ an, Standard): den alten Zoom aus Kick-Puls und Build-up, die
Uebergangs-Verformung des Blenders, Funken-Menge, Ringe, Drop-Blitz und Drop-Funken. Farbe, Vignette und
Bildwahl bleiben. Schalter in der Werkstatt: Kick-Puls (Zoom), Uebergangs-Verformung (Drehen, Schwanken,
Stoss beim Bildwechsel), Hats & Snares (Funken), Build-up (Ansparen, Ausholen). Mischpult aus = Verhalten
wie Build 45. Bricht `12b` ab, laeuft alles wie vorher (`window.__AMX` fehlt).
Protokoll: „Mischpult · Drop: Konto …“, „Mischpult · Feder geloest …“ und einmal pro Minute eine Zeile
mit Kick-Stoessen, Zoom, Drehen, Schwanken, Funken, Konto und wie oft gedeckelt wurde. Debug: `?debug`, `window.__MX`.

## Notaus und Hänger-Wächter (Build 50)

- **■ Stopp** (oder drei Finger gleichzeitig auf den Bildschirm): beendet sofort Ton, Grafik, Mikrofon und Bildschirmsperre. Danach „Neu starten“.
  Wirkt nur, solange die Seite noch reagiert. Steht sie komplett, hilft nur Schließen; der Ton läuft dann in iOS in einem eigenen Prozess weiter.
- **Hänger-Wächter**: ein Worker misst jede Sekunde. Steht die Seite länger als 6 s, schreibt er auf, welches Bild lief. Beim nächsten Start steht das im Protokoll
  („Letzter Lauf hing …“); das Bild wird 7 Tage nicht mehr gewählt.
- **Letzter Lauf** (Protokoll-Leiste): die letzten 150 Zeilen vom vorigen Start, auch nach einem Hänger.
