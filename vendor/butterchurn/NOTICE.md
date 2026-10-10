# Butterchurn-Kopie für new-milkdrop-

**Herkunft:** npm-Paket `butterchurn@2.6.7` (Jordan Berg, https://github.com/jberg/butterchurn), Datei `lib/butterchurn.js`
(die unverkleinerte Fassung, 6738 Zeilen). Lizenz: MIT, siehe `LICENSE` in diesem Ordner (unverändert aus dem Paket).

**Dateien hier**

| Datei | Was |
|---|---|
| `butterchurn.js` | die Kopie, die new-milkdrop- lädt (geändert, siehe unten) |
| `original/butterchurn-2.6.7.js` | unverändertes Original (unverkleinert), zum Vergleichen: `diff original/butterchurn-2.6.7.js butterchurn.js` |
| `original/butterchurn-2.6.7.min.js` | unverändertes Original (verkleinert), genau die Datei, die Acid vom CDN lädt. Nur für den Regressionstest |
| `LICENSE` | MIT-Lizenz von Butterchurn |

Die Preset-Pakete liegen in `vendor/butterchurn-presets/` (`butterchurn-presets@2.4.7`, Jordan Berg, MIT, `LICENSE` dort): unverändert.

## Änderungen

Jede geänderte Stelle in `butterchurn.js` ist mit `/* AK-PATCH n */` markiert. Ganz oben steht der Hinweis
„Butterchurn 2.6.7, MIT, Jordan Berg, modifiziert für new-milkdrop-“. Sonst ist nichts verändert.
Insbesondere nicht: die Berechnung von bass/mid/treb (und damit der Einhängepunkt `audioLevels.updateAudioLevels`, den `hookInstr()` in
`js/02-instrumente.js` benutzt), die Zufallszahlen, das Überblenden. Neue Werte kommen nur dazu.

| Nr. | Stelle | Änderung |
|---|---|---|
| 1 | Anfang der Fabrik-Funktion | `AK_VAR_NAMES` (41 Namen: 33 + Build 104: acid_reso, hats_density, pads_pitch, ak_build_strength, ak_drop_strength + Build 105: ak_pan, ak_pan_speed, ak_width, jeweils hinten angehängt; die EINE Stelle für Namen und Reihenfolge), daraus `AK_SHADER_HEADER` (`uniform vec4 _ak0.._ak8` und `#define <name> _akN.x/y/z/w`), Hilfsfunktionen `akZeroVars`, `akMixInto`, `akShaderLocs`, `akShaderBufs`, `akShaderSet`; `window.AK_VAR_NAMES` |
| 2 | `PresetEquationRunner.initializeEquations` | `mdVSBase` bekommt die Werte: init-Gleichungen sehen sie, und sie gelten als eingebaute (nicht vom Preset erfundene) Variablen |
| 3 | `Renderer`-Konstruktor | `this.extraVars` (alle 0) und in die ersten `globalVars` |
| 4 | `Renderer.loadPreset` | `globalVars` für das neue Preset bekommen die aktuellen Werte |
| 5 | `Renderer.render` | jedes Bild `Object.assign(globalVars, this.extraVars)`, vor der Kopie `prevGlobalVars`: beim Überblenden sehen altes und neues Preset dieselben Werte. Formen und Wellen bekommen sie über `globalVars` |
| 6 | Kopfzeile von `CompShader` und `WarpShader` | `AK_SHADER_HEADER` nach `#define q32` eingefügt |
| 7 | `createShader` von Comp und Warp | Uniform-Orte `_akN` holen, je Block ein `Float32Array(4)` einmal anlegen |
| 8 | `renderQuadTexture` von Comp und Warp | jedes Bild die Werte aus `mdVSFrame` in die Blöcke schreiben (ohne `new`), nur für Blöcke, die der Shader benutzt |
| 9 | `Visualizer` | neue Methode `setExtraVars(obj)` (übernimmt nur bekannte Namen, NaN wird 0) und `Visualizer.AK_VAR_NAMES` |
| 10 | Fabrik-Funktion (Hilfsfunktionen), `CompShader`, `OutputShader`, `createShader`/`renderQuadTexture`, `Visualizer` | Endstufe: `AK_STAGE` (8 Zahlen), `uniform vec4 akfx_a, akfx_b`. (a) Comp-Shader, NACH dem Preset-Code: Kantenkontrast (Acid), Körnung und Glitzern (Hats, Seite). Der Preset-Code und `uv` bleiben unangetastet (eine Änderung von `uv` verschob bei „steel spring“ das Bild 90 im Regressionstest). (b) `OutputShader` (beide Varianten, FXAA und einfach): Verzerrung der Abtast-Koordinaten (Acid); der Durchgang läuft nur bei `setOutputAA(true)` (die App schaltet ihn nur bei sichtbarer Verzerrung ein). Alle Blöcke stehen hinter `if (Wert > 0.0)`: bei 0 (Voreinstellung) ändert sich kein Pixel. Neue Methode `Visualizer.setAkStage([acid, phase, reso, 0, körnung, glitzern, seite, saat])`. Die Werte laufen bewusst NICHT über `AK_VAR_NAMES` (die 41 Namen bleiben) |

## Geprüft (test/butterchurn-regression.js, test/klangrollen-namen.test.js)

- Alle 245 Standard-Presets: Original 2.6.7 (verkleinert) gegen diese Kopie (alle neuen Werte ≠ 0), je 90 Bilder 160×90, fester Testton,
  `elapsedTime = 1/60`, `Math.random` mit festem Startwert vor dem Visualizer und vor `loadPreset`, frische Seite pro Lauf:
  Pixel-Prüfsummen nach Bild 45 und 90 alle gleich. Kein Shader schlägt mit der neuen Kopfzeile fehl.
- Die Werte kommen an: init-, frame-, pixel-Gleichungen, Formen, Wellen (auch Punkt-Gleichungen), Warp- und Comp-Shader, beim Überblenden in beiden Presets.
- Keiner der 41 Namen kommt in einem der 245 Standard-Presets vor (Gleichungen, Startwerte, Shader; Groß/Klein egal).
- Geprüft in Chromium mit Software-Grafik (SwiftShader), nicht auf echten Handys.
