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
  mergeOverlayPosition,
  mergeOverlayAutoHide,
  mergePreservePitch,
  mergeAggressiveMode,
  mergeTrackTimeSaved,
  isValidBackup,
  isValidSitePattern,
  hostMatchesPattern,
  hostMatchesAny,
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
    overlayPosition: 'bottom-right',
    overlayAutoHide: false,
    preservePitch: true,
    aggressiveMode: false,
    trackTimeSaved: true,
  });
});

test('mergeSettings preserves explicit false values', () => {
  assert.deepEqual(
    mergeSettings({ floatingEnabled: false, shortcutsEnabled: false, preservePitch: false, trackTimeSaved: false }),
    {
      floatingEnabled: false,
      shortcutsEnabled: false,
      keyBindings: DEFAULT_KEY_BINDINGS,
      language: 'en',
      customSpeed: 2,
      syncAllTabs: false,
      disabledSites: [],
      overlayPosition: 'bottom-right',
      overlayAutoHide: false,
      preservePitch: false,
      aggressiveMode: false,
      trackTimeSaved: false,
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

test('mergeDisabledSites keeps well-formed wildcard patterns but drops malformed ones', () => {
  assert.deepEqual(
    mergeDisabledSites(['*.Udemy.com', 'ex*ample.com', '**.example.com', '*', 'plain.com']),
    ['*.udemy.com', 'plain.com']
  );
});

test('isValidSitePattern accepts plain hostnames and single `*.` prefixes', () => {
  assert.equal(isValidSitePattern('example.com'), true);
  assert.equal(isValidSitePattern('*.example.com'), true);
});

test('isValidSitePattern rejects malformed wildcard usage', () => {
  assert.equal(isValidSitePattern('*'), false);
  assert.equal(isValidSitePattern('ex*ample.com'), false);
  assert.equal(isValidSitePattern('**.example.com'), false);
  assert.equal(isValidSitePattern(''), false);
  assert.equal(isValidSitePattern(null), false);
});

test('hostMatchesPattern matches a `*.` pattern against its base domain and subdomains', () => {
  assert.equal(hostMatchesPattern('udemy.com', '*.udemy.com'), true);
  assert.equal(hostMatchesPattern('www.udemy.com', '*.udemy.com'), true);
  assert.equal(hostMatchesPattern('app.udemy.com', '*.udemy.com'), true);
  assert.equal(hostMatchesPattern('notudemy.com', '*.udemy.com'), false);
  assert.equal(hostMatchesPattern('udemy.com.evil.com', '*.udemy.com'), false);
});

test('hostMatchesPattern requires an exact match for a plain pattern', () => {
  assert.equal(hostMatchesPattern('youtube.com', 'youtube.com'), true);
  assert.equal(hostMatchesPattern('m.youtube.com', 'youtube.com'), false);
});

test('hostMatchesAny checks a hostname against every pattern in the list', () => {
  assert.equal(hostMatchesAny('app.udemy.com', ['vimeo.com', '*.udemy.com']), true);
  assert.equal(hostMatchesAny('vimeo.com', ['vimeo.com', '*.udemy.com']), true);
  assert.equal(hostMatchesAny('netflix.com', ['vimeo.com', '*.udemy.com']), false);
  assert.equal(hostMatchesAny('netflix.com', undefined), false);
});

test('mergeOverlayPosition defaults to bottom-right for missing/invalid values', () => {
  assert.equal(mergeOverlayPosition(undefined), 'bottom-right');
  assert.equal(mergeOverlayPosition('middle'), 'bottom-right');
});

test('mergeOverlayPosition preserves a supported corner', () => {
  assert.equal(mergeOverlayPosition('top-left'), 'top-left');
  assert.equal(mergeOverlayPosition('bottom-left'), 'bottom-left');
});

test('mergeOverlayAutoHide defaults to false for missing/invalid values', () => {
  assert.equal(mergeOverlayAutoHide(undefined), false);
  assert.equal(mergeOverlayAutoHide('yes'), false);
});

test('mergeOverlayAutoHide preserves an explicit boolean', () => {
  assert.equal(mergeOverlayAutoHide(true), true);
  assert.equal(mergeOverlayAutoHide(false), false);
});

test('mergePreservePitch defaults to true for missing/invalid values', () => {
  assert.equal(mergePreservePitch(undefined), true);
  assert.equal(mergePreservePitch('yes'), true);
});

test('mergePreservePitch preserves an explicit boolean', () => {
  assert.equal(mergePreservePitch(true), true);
  assert.equal(mergePreservePitch(false), false);
});

test('mergeAggressiveMode defaults to false for missing/invalid values', () => {
  assert.equal(mergeAggressiveMode(undefined), false);
  assert.equal(mergeAggressiveMode('on'), false);
});

test('mergeAggressiveMode preserves an explicit boolean', () => {
  assert.equal(mergeAggressiveMode(true), true);
  assert.equal(mergeAggressiveMode(false), false);
});

test('mergeTrackTimeSaved defaults to true for missing/invalid values', () => {
  assert.equal(mergeTrackTimeSaved(undefined), true);
  assert.equal(mergeTrackTimeSaved('no'), true);
});

test('mergeTrackTimeSaved preserves an explicit boolean', () => {
  assert.equal(mergeTrackTimeSaved(true), true);
  assert.equal(mergeTrackTimeSaved(false), false);
});

test('isValidBackup accepts a well-formed backup', () => {
  assert.equal(isValidBackup({ version: 1, settings: {} }), true);
  assert.equal(isValidBackup({ version: 1, settings: { floatingEnabled: true } }), true);
});

test('isValidBackup rejects malformed or unrelated files', () => {
  assert.equal(isValidBackup(null), false);
  assert.equal(isValidBackup(undefined), false);
  assert.equal(isValidBackup('{}'), false);
  assert.equal(isValidBackup([]), false);
  assert.equal(isValidBackup({}), false);
  assert.equal(isValidBackup({ settings: {} }), false); // missing version
  assert.equal(isValidBackup({ version: 2, settings: {} }), false); // unknown version
  assert.equal(isValidBackup({ version: 1 }), false); // missing settings
  assert.equal(isValidBackup({ version: 1, settings: null }), false);
  assert.equal(isValidBackup({ version: 1, settings: [] }), false);
  assert.equal(isValidBackup({ version: '1', settings: {} }), false); // wrong type
});
