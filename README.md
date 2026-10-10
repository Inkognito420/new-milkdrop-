# new-milkdrop-

**New Milkdrop** ist ein Musik-Visualizer fürs Handy (iPhone/Safari, Android/Chrome) für Acid- und Peak-Time-Techno (135–155 BPM).
Er läuft im Browser oder als Home-Bildschirm-App. Nichts wird hochgeladen.

Das Projekt ist die Weiterentwicklung von **Acid Milkdrop** (Repo `Inkognito420/Acid`, Stand Build 54, Commit `b39306c`).
Acid ist die Version für Auftritte und bleibt unverändert. Hier wird weiterentwickelt. Neu gegenüber Acid:

1. **Eigene Butterchurn-Kopie** (`vendor/butterchurn/`, lesbar, MIT) statt Laden aus dem Internet (CDN). Die Kopie ist um neue
   Variablen erweitert, die alten 245 Presets laufen nachweislich bit-gleich wie vorher.
2. **Klangrollen-Analyse** (`js/08b-klangrollen.js`): erkennt Kick, Acid-Linie (303), Hi-Hats und Pads getrennt und gibt jedem Preset
   41 neue Werte (Einsatz, Anschlag, Aufbau, Ausklingen, Filter, Resonanz, Hats-Dichte, Pads-Tonhöhe, Tempo, Takt, Abschnitt, Aufbau- und Drop-Stärke, Stereo-Position, -Tempo und -Breite).
   Die Presets nutzen diese Werte noch nicht. Das kommt im nächsten Schritt.

Build-Nummern: new-milkdrop- zählt ab **Build 100** (steht im Protokoll), damit es nicht mit Acid verwechselt wird.

## Acid und new-milkdrop- nebeneinander auf dem Handy

Beide liegen später unter derselben Adresse `inkognito420.github.io`. Ein Browser trennt dort den Speicher nicht nach Ordnern. Damit
new-milkdrop- nie etwas von Acid verändert:

- Alle gespeicherten Einstellungen, Sterne, Sperren und Protokolle haben den Vorsatz `nmd:` (`KEY_NS` in `js/01-grundlagen.js`).
- Beim allerersten Start werden Acids Sterne und vermessene Presets einmal **gelesen** und kopiert. Acids Speicher bleibt unberührt.
  Später lassen sich Sterne mit „Sichern/Laden“ zwischen beiden Apps austauschen (gleiches Dateiformat).
- Offline-Speicher heißt `nmd-<Build>`, Hänger-Wächter-Datenbank `nmd-wd`, Partitur-Speicher `nmd-partitur`. Beim Aufräumen werden nur eigene `nmd-`-Speicher gelöscht.
- Name auf dem Home-Bildschirm: „New Milkdrop“ (Acid: „Acid“).

## Dateien

- `index.html`: Gerüst (Leiste, Menü, Knöpfe) und Loader. Build-Nummer `var B=...` steht nur hier.
- `app-files.js`: EINZIGE Liste der Bibliotheken (`AM_LIBS`) und Programmteile (`AM_FILES`) in Ladereihenfolge. Der Loader und `sw.js` lesen sie.
- `vendor/butterchurn/`: eigene Butterchurn-Kopie (`butterchurn.js`), Lizenz, `NOTICE.md` mit allen Änderungen, `original/` mit dem unveränderten Original.
- `vendor/butterchurn-presets/`: die Preset-Pakete `butterchurnPresets.min.js` und `butterchurnPresetsExtra.min.js` (unverändert), Lizenz.
- `js/01-grundlagen.js` bis `js/16-start.js`: das Programm aus Acid in Teilen, dazu neu `js/08b-klangrollen.js`.
  Jeder Teil prüft am Anfang, ob der vorige fertig ist (`window.__AM_STEP`).
- `js/13b-schaltzentrale.js` (ab Build 106): Schaltzentrale Teil 3a, siehe unten „Schaltzentrale“.
- `js/14b-partitur.js` (ab Build 102): Klangrollen offline über den ganzen Track und Partitur-Speicher (siehe unten).
- `js/analyse.js`: Track-Analyse (Scan) aus Acid.
- `acid-shader.js`, `acid-presets.js`, `acid-profile.js`, `acid-bild-*.jpg`: eigene Shader, die 5 eigenen Acid-Presets, vermessene Presets.
- `sw.js`, `manifest.webmanifest`, `icon-*.png`: Offline-Betrieb und Home-Bildschirm-App.
- `b33/`: alte Vergleichsseite aus Acid (Build 33). Unverändert übernommen, lädt Butterchurn noch selbst aus dem Internet und gehört nicht zum Programm.
- `test/`: Prüfungen (siehe unten).
- `ANWEISUNG-NAECHSTER-CHAT.md`: vollständige Anweisung für den nächsten Chat (Grundregel, Stand mit Datei-, Funktions- und Variablennamen, Plan der Schaltzentrale, Tests).
- `pruefdaten/`: echte Messwerte von zwei Tracks (Klangmesser, Takt für Takt), Maßstab für den Aufbau-Detektor (siehe `pruefdaten/LIESMICH.md`).

## Partitur: Tracks werden vorher ganz analysiert (ab Build 102)

- Ein geladener Track spielt **erst, wenn seine Analyse fertig ist** (Scan + Partitur). Bis dahin ist Play gesperrt („Analyse …“),
  die Leiste zeigt „Analyse xx %“, das Bild läuft ohne Musik weiter. Danach startet er wie bisher von selbst (iPhone: falls der
  Browser das nicht erlaubt, steht „Analyse fertig. Tippe auf Play.“ da).
- Alle Tracks der Liste werden direkt nacheinander analysiert: der laufende, dann der nächste, dann der Rest. Springt man auf einen
  noch nicht fertigen Track, unterbricht die laufende Analyse eines anderen Tracks und kommt später neu dran. Der dekodierte Ton wird
  nach der Analyse sofort freigegeben, übrig bleibt nur die kleine Partitur.
- **Partitur** = bisheriger Scan (Tempo, Raster, Abschnitte, Drops, Klangbild, Klangmesser) + Klangrollen pro Takt: die Analyse aus
  `js/08b-klangrollen.js` läuft einmal offline über den ganzen Track (gleiches Spektrum wie live, 60 Bilder/s); pro Takt bleiben die
  mittleren Werte von Kick, Acid, Hats, Pads, Filteröffnung, Filtertempo, Neuheit und welche Rolle NEU einsetzt (`curAnalysis.rollen`,
  Lesen mit `ptRolle(A, takt, 'kick')`).
- Gespeichert in IndexedDB `nmd-partitur` (Schlüssel: Dateiname, Größe, Änderungsdatum, Analyse-Version `PARTITUR_V`). Dieselbe Datei
  später wieder geladen: „Partitur aus Speicher“, Start ohne Wartezeit. Aufräumen: höchstens 200 Tracks bzw. 50 MB, die am längsten
  unbenutzten zuerst; Einträge alter Analyse-Versionen sofort.
- **Aufbau-Detektor** (ab Build 103, `aufbauDetektor` in `js/analyse.js`, Ergebnis `curAnalysis.aufbau`): findet in den Klangmesser-Werten
  pro Takt die Drops, den Aufbau davor und die Drop-Stärke (`drop_strength` 0–1). Keine festen Längen: Pausen von 2 bis beliebig vielen Takten,
  Aufbau auch über durchlaufendem Kick (als Anstieg von Hektik, Schärfe oder beidem). Maßstab sind die echten Tracks in `pruefdaten/`
  (`node test/aufbau.test.js`). Im Protokoll steht pro Track „Aufbau-Detektor: Drop Takt … Pause … Aufbau … Stärke …“.
  Die Bild-Effekte nutzen das noch nicht (kommt mit der Schaltzentrale).
- Notfall: scheitert die Analyse (Datei nicht lesbar, über 15 Minuten, zu wenig Speicher), kommt eine Meldung und Play heißt
  „Ohne Analyse spielen“: ein Tipp spielt den Track, das Bild reagiert dann nur live.

## Schaltzentrale (ab Build 106, Teil 3a)

Jede Klangrolle bekommt genau EINE Bildebene, wie Kanäle am Mischpult. Läuft über den Schalter „Mischpult“ (aus = alte Effekte). In der Werkstatt
gibt es die Gruppe „Schaltzentrale“ mit vier Reglern (0 = aus, 100 % normal, bis 150 %; gespeichert unter `nmd:sz-gain`).
- **Raum (Stereo):** `ak_pan` schiebt das Bild bis 1,3 % nach links/rechts und verzieht es bis 1° (`skewX`), `ak_pan_speed` und `ak_width` bestimmen, wie stark. Die Position wird auf ihr
  gleitendes Maximum bezogen (live erreicht sie nur ca. ±0,5) und hart in der Änderungsgeschwindigkeit begrenzt (`SZCFG.panSlew`): sehr schnelles Ping-Pong wird zum sanften Schimmern,
  nichts flackert. Ohne Stereo-Bewegung bleibt das alte Schwanken im Takt.
- **Pads (Farbe):** Farbton gleitet (Tempo = `pads_env`), `pads_pitch` steuert Helligkeit und Sättigung (tief = düster und satt, hoch = hell und leuchtend), `pads_entry` = weicher Farbwechsel.
  Der Takt-Farbschritt wird mit Pads halb so groß, ohne Pads größer (Obergrenze 40°).
- **Hats (Details):** `hats_density` skaliert die Menge der Funken (50–150 %).
- **Dirigent:** vor dem Drop gilt `ak_build_strength` (gemessener Aufbau) statt der festen 8 Takte (`PRE_BARS`), im Drop skaliert `ak_drop_strength` Blitz, Funken und Zoom-Stoß (50–140 %).
  Regler „Dirigent“ auf 0 = alte feste Regel.
Noch offen: Kick-Ebene (Drehen), Acid-Ebene (Verzerrung, braucht die Butterchurn-Kopie), Hats-Körnung, Mitten ohne Funken. Siehe `ANWEISUNG-NAECHSTER-CHAT.md`.

## Klangrollen: die neuen Variablen

In Preset-Gleichungen heißen sie `a.<name>` (z. B. `a.kick_entry`), in Warp- und Comp-Shadern einfach `<name>` (z. B. `kick_entry`).
Die Namen legt **eine** Stelle fest: `AK_VAR_NAMES` in `vendor/butterchurn/butterchurn.js`. Die Werte rechnet `rollenFrame(t)` in
`js/08b-klangrollen.js` jedes Bild aus (Ergebnis im Objekt `AKV`), die Schleife gibt sie mit `viz.setExtraVars(AKV)` an Butterchurn.
Bisher läuft das an Butterchurn vorbei: `bass`, `mid`, `treb` und „Instrumente hören“ aus Acid bleiben genau wie vorher.

Rollen und Frequenzbereiche: **kick** 40–120 Hz · **acid** 300–3000 Hz (nur, wo sich der Klang bewegt, wie bei einer 303) ·
**hats** 6–16 kHz · **pads** 150–1500 Hz (je Frequenz nur, was mindestens 0,5 s durchgehend klingt, also gehaltene Akkorde und Flächen, nicht die 303; über etwa 1 s geglättet, Kick-Schläge ausgeblendet).
Der Kick zählt nur bei echten Schlägen (steiler Anstieg), nicht bei tiefem Bass im selben Band. Ab Build 104 zählt er mit Scan außerdem nur
auf den Schlägen des Rasters (rollende Basslines zwischen den Kicks zählten vorher mit). Ab Build 105 wird auch Stereo gemessen (`akStereoStats`: Links und Rechts getrennt, ab 500 Hz; Mono-Quellen und das Mikrofon geben Position 0).
Pads zählen ab Build 104 nur, soweit der Klang im
Pads-Bereich wirklich gehalten ist („Gehaltenheit“, `AKCFG.padHeld`); vorher ergab jeder gleichmäßige Klangteppich etwa 0,8.

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
| `acid_reso` | wie scharf die 303-Resonanz ist (Spitze im Acid-Band; ohne Acid 0) | 0–1 |
| `hats_density` | wie dicht die Hats kommen: nur Offbeats ca. 0,33, jede Sechzehntel ca. 0,8–1 | 0–1 |
| `pads_pitch` | Tonhöhe der gehaltenen Töne: 0 = tief/düster (150 Hz), 1 = hoch/hell (1500 Hz); ohne Pads bleibt der letzte Wert und gleitet langsam zu 0,5 | 0–1 |
| `ak_pan` | Stereo-Position der Mitten und Höhen (ab 500 Hz): −1 links … 0 Mitte … +1 rechts. Folgt Ping-Pong-Effekten (Hats, Synth-Töne, die von links nach rechts wandern) | −1…+1 |
| `ak_pan_speed` | wie schnell die Position die Seite wechselt: 0 = steht, 0,25 = ein Wechsel pro Schlag, 0,5 = zwei, 1 = jede Sechzehntel | 0–1 |
| `ak_width` | Breite des Stereobilds in den Mitten und Höhen: 0 = Mono, 1 = sehr breit | 0–1 |
| `ak_build_strength` | gemessener Aufbau vor dem nächsten Drop (Aufbau-Detektor, nur mit Scan) | 0–1 |
| `ak_drop_strength` | Stärke des laufenden Drops (lange Pause und großer Aufbau = stark), 0 sobald die nächste Pause beginnt; nur mit Scan | 0–1 |

Abschnitte: **Break**, wenn der Kick mindestens 1 Takt fehlt. **Build-up**, wenn danach (frühestens 2 Takte im Break) Hi-Hats oder Acid
anwachsen oder sich der Klang stark ändert und der Kick weiter fehlt. **Drop**, wenn der Kick nach mindestens 4 Takten Break zurückkommt
(bei kürzerer Lücke: Groove). Der Drop hält 8 Takte, dann Groove. Liegt ein Scan des Tracks vor, kommen Tempo, Schlag, Takt, Phrase
**und der Abschnitt** aus dem Scan (der kennt den ganzen Track und war auf dem iPhone zuverlässiger). Die Regeln oben gelten dann fürs Mikrofon
und bis der Scan fertig ist. Jede Minute mit Musik steht eine Zeile „Klangrollen-Messung“ im Protokoll (Mittel und Maximum je Rolle, Einsätze, Abschnitte). Alle Zahlen (Bänder, Schwellen, Takte, Rauschboden, Tempo-Bereich …) stehen mit Erklärung im Objekt **`AKCFG`** oben in
`js/08b-klangrollen.js`.

**Zum Prüfen:** In „Mehr“ → „Werkstatt“ → „Anzeige“ gibt es den Knopf **„Klangrollen-Anzeige“** (oder `?debug` an die Adresse hängen).
Unten links erscheinen Balken für Kick, Acid, Hats und Pads, „ACID NEU“ usw. beim Einsatz, Tempo, Abschnitt und Rechenzeit.
Ist die Anzeige aus, kostet sie nichts. Alle 5 Minuten steht die Rechenzeit der Analyse im Protokoll.

Wichtig für die Lautstärke: Die Werte beziehen sich auf das Maximum der letzten 30 Sekunden. Wird es mitten im Track plötzlich viel leiser,
sind die Werte darum etwa 30 Sekunden lang kleiner, danach wieder normal.

## Prüfen

Läuft bei jedem Push als GitHub-Aktion (`.github/workflows/pruefen.yml`). Von Hand:

- Schnell (nur Node): `node test/files.test.js`, `node test/analyse.test.js`, `node test/aufbau.test.js` (Prüfdaten), `node test/klangrollen-namen.test.js`
  (die 41 Namen kommen in keinem der 245 Standard-Presets vor).
- Im Browser (Chromium über Playwright, ohne Internet):
  `PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node test/browser.js [Szenario,...]`: alle Acid-Prüfungen (Start, Bedienung, Shader, Scan, Offline,
  Notaus, Hänger-Wächter, Lastbremse …) und neu `klangrollen` (künstliche Tracks aus `test/gen-track.js`: Kick durchgehend, Kick-Lücke,
  neue 303, voll gegen halb laut), `klangrollenLive`, `echtbutterchurn` (mit der echten Kopie statt Attrappe) und ab Build 102
  `startsperre`, `speicher`, `notfall` (Partitur: erst analysieren, dann spielen; Speicher und Aufräumen; Analyse scheitert).
- `node test/butterchurn-regression.js`: alle 245 Presets mit dem Original und mit der Kopie zeichnen und die Pixel vergleichen (dauert etwa 8 Minuten).

Geprüft wird in einer Sandbox mit Software-Grafik. Ob es auf dem Handy flüssig läuft (60 fps auf dem iPhone 15 Pro), zeigt nur ein echter Lauf:
Protokoll → „Letzter Lauf“ bzw. „Kopieren“ nach etwa 10 Minuten.

## Lizenzen

- Butterchurn 2.6.7 und butterchurn-presets 2.4.7: © Jordan Berg, MIT-Lizenz (`vendor/butterchurn/LICENSE`, `vendor/butterchurn-presets/LICENSE`).
  Die Butterchurn-Kopie ist verändert, siehe `vendor/butterchurn/NOTICE.md`.
- Die Milkdrop-Presets in den Paketen stammen von vielen Autorinnen und Autoren der Milkdrop-Szene (Namen stehen im Preset-Namen).
- Alles andere: aus Acid Milkdrop übernommen bzw. für new-milkdrop- geschrieben.
