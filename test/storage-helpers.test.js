const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSiteSpeedKey,
  mergeSettings,
  mergeKeyBindings,
  mergeLanguage,
  mergeCustomSpeed,
  mergeSyncAllTabs,
  mergeDisabledSites,
} = require('../src/shared/storage-helpers.js');

const DEFAULT_KEY_BINDINGS = { increase: 's', decrease: 'd', reset: 'a', custom: 'q' };

test('buildSiteSpeedKey lowercases the hostname', () => {
  assert.equal(buildSiteSpeedKey('WWW.YouTube.com'), 'www.youtube.com');
});

test('buildSiteSpeedKey falls back to "unknown" for empty input', () => {
  assert.equal(buildSiteSpeedKey(''), 'unknown');
  assert.equal(buildSiteSpeedKey(undefined), 'unknown');
});

test('mergeSettings applies defaults for missing keys', () => {
  assert.deepEqual(mergeSettings({}), {
    floatingEnabled: true,
    shortcutsEnabled: true,
    keyBindings: DEFAULT_KEY_BINDINGS,
    language: 'en',
    customSpeed: 2,
    syncAllTabs: false,
    disabledSites: [],
  });
});

test('mergeSettings preserves explicit false values', () => {
  assert.deepEqual(
    mergeSettings({ floatingEnabled: false, shortcutsEnabled: false }),
    {
      floatingEnabled: false,
      shortcutsEnabled: false,
      keyBindings: DEFAULT_KEY_BINDINGS,
      language: 'en',
      customSpeed: 2,
      syncAllTabs: false,
      disabledSites: [],
    }
  );
});

test('mergeKeyBindings applies defaults for missing/invalid entries', () => {
  assert.deepEqual(mergeKeyBindings(undefined), DEFAULT_KEY_BINDINGS);
  assert.deepEqual(mergeKeyBindings({ increase: '' }), DEFAULT_KEY_BINDINGS);
});

test('mergeKeyBindings preserves custom bindings', () => {
  assert.deepEqual(
    mergeKeyBindings({ increase: 'w', decrease: 'x', reset: 'arrowup', custom: 'z' }),
    { increase: 'w', decrease: 'x', reset: 'arrowup', custom: 'z' }
  );
});

test('mergeLanguage defaults to English for missing or unknown codes', () => {
  assert.equal(mergeLanguage(undefined), 'en');
  assert.equal(mergeLanguage(''), 'en');
  assert.equal(mergeLanguage('xx'), 'en');
});

test('mergeLanguage preserves a supported language code', () => {
  assert.equal(mergeLanguage('tr'), 'tr');
  assert.equal(mergeLanguage('ar'), 'ar');
});

test('mergeCustomSpeed defaults to 2x for missing/invalid values', () => {
  assert.equal(mergeCustomSpeed(undefined), 2);
  assert.equal(mergeCustomSpeed('2'), 2);
  assert.equal(mergeCustomSpeed(NaN), 2);
});

test('mergeCustomSpeed clamps a stored value to the valid speed range', () => {
  assert.equal(mergeCustomSpeed(1.5), 1.5);
  assert.equal(mergeCustomSpeed(30), 16);
  assert.equal(mergeCustomSpeed(0), 0.25);
});

test('mergeSyncAllTabs defaults to false for missing/invalid values', () => {
  assert.equal(mergeSyncAllTabs(undefined), false);
  assert.equal(mergeSyncAllTabs('true'), false);
});

test('mergeSyncAllTabs preserves an explicit boolean', () => {
  assert.equal(mergeSyncAllTabs(true), true);
  assert.equal(mergeSyncAllTabs(false), false);
});

test('mergeDisabledSites defaults to an empty array for missing/invalid input', () => {
  assert.deepEqual(mergeDisabledSites(undefined), []);
  assert.deepEqual(mergeDisabledSites('youtube.com'), []);
  assert.deepEqual(mergeDisabledSites(null), []);
});

test('mergeDisabledSites lowercases entries, drops non-strings, and de-duplicates', () => {
  assert.deepEqual(
    mergeDisabledSites(['YouTube.com', 'vimeo.com', 'youtube.com', 42, '']),
    ['youtube.com', 'vimeo.com']
  );
});
