// Prüft die Dateiliste (app-files.js): jede Datei da, jeder Teil prüft seinen Vorgänger, Build-Nummer überall gleich.
// Aufruf: node test/files.test.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const sandbox = { self: {} }; vm.runInNewContext(read('app-files.js'), sandbox);
const files = sandbox.self.AM_FILES;
for (const f of files) assert.ok(fs.existsSync(path.join(root, f)), 'fehlt: ' + f);
const parts = files.filter(f => /^js\/\d\d/.test(f));
const stepOf = f => { const m = /^js\/(\d\d)b?-/.exec(f); return m ? +m[1] : -1; };
let prev = 0;
for (const f of parts) {
  const n = stepOf(f), src = read(f);
  if (/^js\/\d\db-/.test(f)) { assert.ok(src.includes('__AM_STEP !== ' + prev), f + ' prüft nicht Teil ' + prev); continue; }   // 12b ändert die Stufe nicht
  assert.ok(src.includes('__AM_STEP !== ' + (n - 1)) || n === 1, f + ' prüft nicht Teil ' + (n - 1));
  assert.ok(src.includes('window.__AM_STEP = ' + n + ';'), f + ' setzt nicht Stufe ' + n);
  prev = n;
}
const orphan = fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js') && !files.includes('js/' + f));
assert.deepStrictEqual(orphan, [], 'nicht in app-files.js: ' + orphan);
const html = read('index.html'), bn = +/var B=(\d+)/.exec(html)[1], bt = +/const BUILD_NO = (\d+)/.exec(read('js/01-grundlagen.js'))[1];
assert.strictEqual(bn, bt, 'Build-Nummer: index.html ' + bn + ' ≠ 01-grundlagen.js ' + bt);
console.log('files.test.js: ok (' + files.length + ' Dateien, Build ' + bn + ')');
