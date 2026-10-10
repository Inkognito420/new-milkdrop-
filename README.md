# new-milkdrop-

**New Milkdrop** ist ein Musik-Visualizer fürs Handy (iPhone/Safari, Android/Chrome) für Acid- und Peak-Time-Techno (135–155 BPM).
Er läuft im Browser oder als Home-Bildschirm-App. Nichts wird hochgeladen.

Das Projekt ist die Weiterentwicklung von **Acid Milkdrop** (Repo `Inkognito420/Acid`, Stand Build 54, Commit `b39306c`).
Acid ist die Version für Auftritte und bleibt unverändert. Hier wird weiterentwickelt. Neu gegenüber Acid:

1. **Eigene Butterchurn-Kopie** (`vendor/butterchurn/`, lesbar, MIT) statt Laden aus dem Internet (CDN). Die Kopie ist um neue
   Variablen erweitert, die alten 245 Presets laufen nachweislich bit-gleich wie vorher.
2. **Klangrollen-Analyse** (`js/08b-klangrollen.js`): erkennt Kick, Acid-Linie (303), Hi-Hats und Pads getrennt und gibt jedem Preset
   33 neue Werte (Einsatz, Anschlag, Aufbau, Ausklingen, Filter, Tempo, Takt, Abschnitt).
   Die Presets nutzen diese Werte noch nicht. Das kommt im nächsten Schritt.

Build-Nummern: new-milkdrop- zählt ab **Build 100** (steht im Protokoll), damit es nicht mit Acid verwechselt wird.

## Acid und new-milkdrop- nebeneinander auf dem Handy

Beide liegen später unter derselben Adresse `inkognito420.github.io`. Ein Browser trennt dort den Speicher nicht nach Ordnern. Damit
new-milkdrop- nie etwas von Acid verändert:

- Alle gespeicherten Einstellungen, Sterne, Sperren und Protokolle haben den Vorsatz `nmd:` (`KEY_NS` in `js/01-grundlagen.js`).
- Beim allerersten Start werden Acids Sterne und vermessene Presets einmal **gelesen** und kopiert. Acids Speicher bleibt unberührt.
  Später lassen sich Sterne mit „Sichern/Laden“ zwischen beiden Apps austauschen (gleiches Dateiformat).
- Offline-Speicher heißt `nmd-<Build>`, Hänger-Wächter-Datenbank `nmd-wd`. Beim Aufräumen werden nur eigene `nmd-`-Speicher gelöscht.
- Name auf dem Home-Bildschirm: „New Milkdrop“ (Acid: „Acid“).

## Dateien

- `index.html`: Gerüst (Leiste, Menü, Knöpfe) und Loader. Build-Nummer `var B=...` steht nur hier.
- `app-files.js`: EINZIGE Liste der Bibliotheken (`AM_LIBS`) und Programmteile (`AM_FILES`) in Ladereihenfolge. Der Loader und `sw.js` lesen sie.
- `vendor/butterchurn/`: eigene Butterchurn-Kopie (`butterchurn.js`), Lizenz, `NOTICE.md` mit allen Änderungen, `original/` mit dem unveränderten Original.
- `vendor/butterchurn-presets/`: die Preset-Pakete `butterchurnPresets.min.js` und `butterchurnPresetsExtra.min.js` (unverändert), Lizenz.
- `js/01-grundlagen.js` bis `js/16-start.js`: das Programm aus Acid in Teilen, dazu neu `js/08b-klangrollen.js`.
  Jeder Teil prüft am Anfang, ob der vorige fertig ist (`window.__AM_STEP`).
- `js/analyse.js`: Track-Analyse (Scan) aus Acid.
- `acid-shader.js`, `acid-presets.js`, `acid-profile.js`, `acid-bild-*.jpg`: eigene Shader, die 5 eigenen Acid-Presets, vermessene Presets.
- `sw.js`, `manifest.webmanifest`, `icon-*.png`: Offline-Betrieb und Home-Bildschirm-App.
- `b33/`: alte Vergleichsseite aus Acid (Build 33). Unverändert übernommen, lädt Butterchurn noch selbst aus dem Internet und gehört nicht zum Programm.
- `test/`: Prüfungen (siehe unten).

## Klangrollen: die neuen Variablen

In Preset-Gleichungen heißen sie `a.<name>` (z. B. `a.kick_entry`), in Warp- und Comp-Shadern einfach `<name>` (z. B. `kick_entry`).
Die Namen legt **eine** Stelle fest: `AK_VAR_NAMES` in `vendor/butterchurn/butterchurn.js`. Die Werte rechnet `rollenFrame(t)` in
`js/08b-klangrollen.js` jedes Bild aus (Ergebnis im Objekt `AKV`), die Schleife gibt sie mit `viz.setExtraVars(AKV)` an Butterchurn.
Bisher läuft das an Butterchurn vorbei: `bass`, `mid`, `treb` und „Instrumente hören“ aus Acid bleiben genau wie vorher.

Rollen und Frequenzbereiche: **kick** 40–120 Hz · **acid** 300–3000 Hz (nur, wo sich der Klang bewegt, wie bei einer 303) ·
**hats** 6–16 kHz · **pads** 150–1500 Hz (nur die langsamen, gleichmäßigen Anteile, über etwa 1 s geglättet, Kick-Schläge ausgeblendet).

| Variable (R = kick, acid, hats, pads) | Bedeutung | Bereich |
|---|---|---|
| `R_env` | Lautstärke-Hüllkurve der Rolle, im Verhältnis zum Maximum der letzten 30 s (Gesamtlautstärke egal) | 0–1 |
| `R_hit` | einzelner Anschlag: springt auf seine Stärke und fällt schnell ab | 0–1 |
| `R_entry` | Impuls, wenn die Rolle **neu** dazukommt, nachdem sie mindestens 1 Takt gefehlt hat (nicht bei jedem Schlag) | 0–1 |
| `R_age` | wie frisch der letzte Einsatz ist: 1 = gerade neu, fällt in 8 Takten auf 0 | 0–1 |
| `R_build` | die Rolle wird über die letzten 2 Takte lauter (Aufbau) | 0–1 |
| `R_release` | die Rolle wird leiser oder verschwindet (Ausklingen), fällt über etwa 1 Takt | 0–1 |
| `acid_cutoff` | wie offen der 303-Filter ist (auf den eigenen Bereich der letzten 30 s bezogen) | 0–1 |
| `acid_squelch` | wie schnell sich der Filter gerade bewegt | 0–1 |
| `ak_bpm` | Tempo (gesucht nur zwischen 125 und 160) | BPM |
| `ak_beatphase` | Position im Schlag | 0–1 |
| `ak_bar` | Position im Takt (4/4) | 0–1 |
| `ak_barno` | laufende Taktnummer | 0, 1, 2 … |
| `ak_phrase` | Position in der 16-Takt-Phrase, gezählt ab Abschnittsbeginn | 0–1 |
| `ak_novelty` | wie stark sich der Klang gegenüber den letzten Sekunden ändert | 0–1 |
| `ak_section` | 0 = Groove, 1 = Break, 2 = Build-up, 3 = Drop | 0–3 |

Abschnitte: **Break**, wenn der Kick mindestens 1 Takt fehlt. **Build-up**, wenn danach (frühestens 2 Takte im Break) Hi-Hats oder Acid
anwachsen oder sich der Klang stark ändert und der Kick weiter fehlt. **Drop**, wenn der Kick nach mindestens 4 Takten Break zurückkommt
(bei kürzerer Lücke: Groove). Der Drop hält 8 Takte, dann Groove. Liegt ein Scan des Tracks vor, kommen Tempo, Schlag, Takt und Phrase
aus dem Scan. Alle Zahlen (Bänder, Schwellen, Takte, Rauschboden, Tempo-Bereich …) stehen mit Erklärung im Objekt **`AKCFG`** oben in
`js/08b-klangrollen.js`.

**Zum Prüfen:** In „Mehr“ → „Werkstatt“ → „Anzeige“ gibt es den Knopf **„Klangrollen-Anzeige“** (oder `?debug` an die Adresse hängen).
Unten links erscheinen Balken für Kick, Acid, Hats und Pads, „ACID NEU“ usw. beim Einsatz, Tempo, Abschnitt und Rechenzeit.
Ist die Anzeige aus, kostet sie nichts. Alle 5 Minuten steht die Rechenzeit der Analyse im Protokoll.

Wichtig für die Lautstärke: Die Werte beziehen sich auf das Maximum der letzten 30 Sekunden. Wird es mitten im Track plötzlich viel leiser,
sind die Werte darum etwa 30 Sekunden lang kleiner, danach wieder normal.

## Prüfen

Läuft bei jedem Push als GitHub-Aktion (`.github/workflows/pruefen.yml`). Von Hand:

- Schnell (nur Node): `node test/files.test.js`, `node test/analyse.test.js`, `node test/klangrollen-namen.test.js`
  (die 33 Namen kommen in keinem der 245 Standard-Presets vor).
- Im Browser (Chromium über Playwright, ohne Internet):
  `PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node test/browser.js [Szenario,...]`: alle Acid-Prüfungen (Start, Bedienung, Shader, Scan, Offline,
  Notaus, Hänger-Wächter, Lastbremse …) und neu `klangrollen` (künstliche Tracks aus `test/gen-track.js`: Kick durchgehend, Kick-Lücke,
  neue 303, voll gegen halb laut), `klangrollenLive` und `echtbutterchurn` (mit der echten Kopie statt Attrappe).
- `node test/butterchurn-regression.js`: alle 245 Presets mit dem Original und mit der Kopie zeichnen und die Pixel vergleichen (dauert etwa 8 Minuten).

Geprüft wird in einer Sandbox mit Software-Grafik. Ob es auf dem Handy flüssig läuft (60 fps auf dem iPhone 15 Pro), zeigt nur ein echter Lauf:
Protokoll → „Letzter Lauf“ bzw. „Kopieren“ nach etwa 10 Minuten.

## Lizenzen

- Butterchurn 2.6.7 und butterchurn-presets 2.4.7: © Jordan Berg, MIT-Lizenz (`vendor/butterchurn/LICENSE`, `vendor/butterchurn-presets/LICENSE`).
  Die Butterchurn-Kopie ist verändert, siehe `vendor/butterchurn/NOTICE.md`.
- Die Milkdrop-Presets in den Paketen stammen von vielen Autorinnen und Autoren der Milkdrop-Szene (Namen stehen im Preset-Namen).
- Alles andere: aus Acid Milkdrop übernommen bzw. für new-milkdrop- geschrieben.
