const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSiteSpeedKey, mergeSettings } = require('../src/shared/storage-helpers.js');

test('buildSiteSpeedKey lowercases the hostname', () => {
  assert.equal(buildSiteSpeedKey('WWW.YouTube.com'), 'www.youtube.com');
});

test('buildSiteSpeedKey falls back to "unknown" for empty input', () => {
  assert.equal(buildSiteSpeedKey(''), 'unknown');
  assert.equal(buildSiteSpeedKey(undefined), 'unknown');
});

test('mergeSettings applies defaults for missing keys', () => {
  assert.deepEqual(mergeSettings({}), { floatingEnabled: true, shortcutsEnabled: true });
});

test('mergeSettings preserves explicit false values', () => {
  assert.deepEqual(
    mergeSettings({ floatingEnabled: false, shortcutsEnabled: false }),
    { floatingEnabled: false, shortcutsEnabled: false }
  );
});
