# Prüfdaten: echte Tracks, Takt für Takt gemessen

Echte Messwerte von zwei Tracks (Herbrido: „Spell“, „Dream Escape“). Nur Zahlen, keine Musik.
Herkunft: die Beispielwerte, die in Emmos `Klangmesser.html` eingebettet sind (`var EXAMPLE`), gemessen mit dem Klangmesser auf dem Handy.
Der Klangmesser rechnet dieselben Formeln wie der Scan in new-milkdrop- (`kmSetup`, `kmFrame`, `kmBars` in `js/analyse.js`, seit Build 43),
es ist aber ein anderer Lauf (andere Dekodierung, eigenes Raster). Kleine Abweichungen zur App sind also normal.

Benutzt von `test/aufbau.test.js` (Aufbau-Detektor `aufbauDetektor` in `js/analyse.js`). Diese Daten sind der Maßstab:
was hier nicht richtig erkannt wird, ist falsch.

## Dateien

| Datei | Track | BPM | Länge | Takte |
|---|---|---|---|---|
| `klangmesser-spell.json` | Spell | 132,99 | 366,5 s | 202 |
| `klangmesser-dream-escape.json` | Dream Escape | 135 | 316,9 s | 178 |

## Aufbau einer Datei

- `bpm`, `t0` (Beginn von Takt 0 in s), `spb` (Sekunden pro Schlag; ein Takt = 4 Schläge), `dur` (Länge in s)
- `felder`: Namen der Spalten in `takte`
- `takte`: eine Zeile pro Takt, Spalten:

| Spalte | Bedeutung | Bereich |
|---|---|---|
| `druck` | Lautstärke des ganzen Signals und des Basses unter 150 Hz | 0–1 |
| `hektik` | wie stark Mitten und Höhen im 8tel/16tel/32tel pulsieren, dazu Zwischen-Sechzehntel | 0–1 |
| `schaerfe` | Klangschwerpunkt (dumpf/hell) und Rauschanteil | 0–1 |
| `spann` | Spannung: dieser Takt gegen die 8 Takte davor (0,5 = gleich) | 0–1 |
| `beweg` | Filter: wie stark der Klangschwerpunkt im Takt schwankt | 0–1 |
| `ton` | stärkster der 12 Töne (0 = C … 11 = H) | 0–11 |
| `tk` | wie deutlich dieser Ton ist | 0–1 |
| `raster` | vorherrschendes Raster: 8, 16 oder 32 | |
| `db` | Pegel in dB | |
| `puls`, `p8`, `p16`, `p32` | Pulsstärke gesamt und je Raster | |

- `slots`: pro Sechzehntel die Einsatzstärke in Bass (`b`), Mitten (`m`), Höhen (`h`), 0–99

## Was in den Daten steckt (aus den Werten abgelesen, nicht abgehört)

Drop = der Druck kommt nach einer Pause zurück. Takt-Nummern ab 0, ±1 Takt (der Druck ist ein Mittel über den Takt;
der erste Takt eines Drops hat oft nur ca. 0,75, weil das Raster des Klangmessers etwas versetzt sein kann).

| Track | Drop bei Takt | Zeit | Pause davor | Was davor passiert |
|---|---|---|---|---|
| Spell | 48 | ca. 87 s | 15 Takte (33–47) | Break mit hoher Schärfe, am Ende steigt sie steil (Riser), Hektik bleibt niedrig |
| Spell | 104 | ca. 188 s | lang (ab Takt 80) | in den letzten Takten der Pause: Roll (Hektik bis 0,43) und Schärfe von 0 auf 0,76 |
| Spell | 136 | ca. 246 s | 3 Takte (133–135) | **Aufbau über dem durchlaufenden Kick**: Hektik ab Takt 113 bei 0,55, ab 121 bei 0,75–0,8; dann 3 Takte Pause mit Schärfe 1,0 |
| Spell | 168 | ca. 304 s | 7 Takte (161–167) | über dem Kick Hektik 0,5–0,6 (153–159), in der Pause Schärfe 0,9 |
| Dream Escape | 31 | ca. 56 s | 3 Takte (28–30, Druck halb) | Schärfe steigt von 0,64 auf 1,0 |
| Dream Escape | 96 | ca. 171 s | lang (ab Takt 63; 72–87 mit halbem Druck) | am Ende Schärfe von 0,34 auf 0,95 |
| Dream Escape | 143–144 | ca. 255 s | 3–4 Takte (140–143) | Schärfe 0,85 bis 1,0 |

Lehren für den Detektor:
- Keine festen Längen: Pausen von 3 bis über 30 Takten.
- Ein Aufbau kann über dem Kick laufen (Spell, Takt 113–131).
- Aufbau zeigt sich mal als Hektik (Rolls), mal als Schärfe (Rauschen, Riser), mal beides.
- In langen Breaks ist die Schärfe schon die ganze Zeit hoch: dort zählt der Anstieg am Ende, nicht die Höhe.
