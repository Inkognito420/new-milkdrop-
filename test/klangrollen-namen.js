// Liest die Namen der Klangrollen-Variablen aus der EINEN Stelle, an der sie festgelegt sind: AK_VAR_NAMES in vendor/butterchurn/butterchurn.js.
// Für Tests in Node (ohne Browser). Aufruf: require('./klangrollen-namen.js').AK_NAMES
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'vendor/butterchurn/butterchurn.js'), 'utf8');
const m = /var AK_VAR_NAMES = Object\.freeze\(\[([\s\S]*?)\]\);/.exec(src);
if (!m) throw new Error('AK_VAR_NAMES nicht gefunden in vendor/butterchurn/butterchurn.js');
module.exports = { AK_NAMES: m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean) };
