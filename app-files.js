// Alle Programmteile in Ladereihenfolge. EINZIGE Liste: der Loader in index.html und der Offline-Speicher (sw.js) lesen sie.
// Reihenfolge nicht ändern: jeder Teil baut auf den vorherigen auf. Neue Teile hier eintragen.
// new-milkdrop-: Bibliotheken liegen im Repo (kein CDN mehr). Die eigene Butterchurn-Kopie (vendor/butterchurn, Änderungen in NOTICE.md) und die Preset-Pakete.
self.AM_LIBS = [
  "vendor/butterchurn/butterchurn.js",
  "vendor/butterchurn-presets/butterchurnPresets.min.js",
  "vendor/butterchurn-presets/butterchurnPresetsExtra.min.js"
];
self.AM_FILES = [
  "audio-reactive-controller.js",
  "adaptive-preset-blender.js",
  "acid-presets.js",
  "acid-profile.js",
  "acid-shader.js",
  "js/analyse.js",
  "js/01-grundlagen.js",
  "js/02-instrumente.js",
  "js/03-eigene-shader.js",
  "js/04-bildschirm.js",
  "js/05-presets-vermessen.js",
  "js/06-mitschrift.js",
  "js/07-sichern-laden.js",
  "js/08-auswahl.js",
  "js/08b-klangrollen.js",
  "js/09-schleife.js",
  "js/10-bedienung.js",
  "js/11-ton-sicherheit.js",
  "js/12-erkennung.js",
  "js/12b-mischpult.js",
  "js/13-effekte-gesten.js",
  "js/14-track-scan.js",
  "js/14b-partitur.js",
  "js/15-tracks-mikro.js",
  "js/16-start.js"
];
