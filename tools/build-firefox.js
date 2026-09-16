const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'dist', 'firefox');

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

fs.cpSync(path.join(root, 'src'), path.join(outDir, 'src'), { recursive: true });
fs.cpSync(path.join(root, 'icons'), path.join(outDir, 'icons'), { recursive: true });
fs.copyFileSync(path.join(root, 'manifest.firefox.json'), path.join(outDir, 'manifest.json'));

console.log('Firefox build written to dist/firefox/');
console.log('Load it via about:debugging#/runtime/this-firefox -> "Load Temporary Add-on" -> dist/firefox/manifest.json');
