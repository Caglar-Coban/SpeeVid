const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const chromeManifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf8'));
const firefoxManifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.firefox.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

test('both manifests and package.json agree on the version number', () => {
  assert.equal(firefoxManifest.version, chromeManifest.version);
  assert.equal(pkg.version, chromeManifest.version);
});

test('both manifests declare the same content script files', () => {
  assert.deepEqual(firefoxManifest.content_scripts[0].js, chromeManifest.content_scripts[0].js);
});

test('both manifests share the same icons, action, and permissions', () => {
  assert.deepEqual(firefoxManifest.icons, chromeManifest.icons);
  assert.deepEqual(firefoxManifest.action, chromeManifest.action);
  assert.deepEqual(firefoxManifest.permissions, chromeManifest.permissions);
});

test('chrome manifest uses a service worker background; firefox uses background scripts', () => {
  assert.equal(typeof chromeManifest.background.service_worker, 'string');
  assert.equal(chromeManifest.background.scripts, undefined);
  assert.ok(Array.isArray(firefoxManifest.background.scripts));
  assert.equal(firefoxManifest.background.service_worker, undefined);
});

test("firefox background scripts load every shared module plus the chrome service worker file, in the same order the content script uses", () => {
  const sharedFiles = chromeManifest.content_scripts[0].js.slice(0, -1); // drop content.js
  assert.deepEqual(firefoxManifest.background.scripts.slice(0, -1), sharedFiles);
  assert.equal(firefoxManifest.background.scripts[firefoxManifest.background.scripts.length - 1], 'src/background/service-worker.js');
});

test('firefox manifest declares a stable gecko extension id', () => {
  assert.equal(typeof firefoxManifest.browser_specific_settings.gecko.id, 'string');
  assert.match(firefoxManifest.browser_specific_settings.gecko.id, /^[^@]+@[^@]+$/);
});
