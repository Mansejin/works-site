const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname);
const files = ['prompt-manager.js', 'config.js', 'file-parser.js', 'error-log.js', 'research-log.js', 'product-brief.js', 'research.js', 'app.js'];
const out = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
fs.writeFileSync(path.join(dir, 'main.js'), out, 'utf8');
console.log('bundled', out.length, 'chars');
