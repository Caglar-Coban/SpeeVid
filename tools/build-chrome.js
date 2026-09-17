const fs = require('fs');
const path = require('path');
const { zipDirectory } = require('./zip.js');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'dist', 'chrome');
const pkg = require(path.join(root, 'package.json'));

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

fs.cpSync(path.join(root, 'src'), path.join(outDir, 'src'), { recursive: true });
fs.cpSync(path.join(root, 'icons'), path.join(outDir, 'icons'), { recursive: true });
fs.cpSync(path.join(root, '_locales'), path.join(outDir, '_locales'), { recursive: true });
fs.copyFileSync(path.join(root, 'manifest.json'), path.join(outDir, 'manifest.json'));

console.log('Chrome build written to dist/chrome/');
console.log('Load it via chrome://extensions -> "Load unpacked" -> dist/chrome/');

if (process.argv.includes('--zip')) {
  const zipPath = path.join(root, 'dist', `speevid-chrome-v${pkg.version}.zip`);
  zipDirectory(outDir, zipPath);
  console.log(`Zipped to ${path.relative(root, zipPath)}`);
}
