const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSiteSpeedKey,
  mergeSettings,
  mergeKeyBindings,
  matchesKeyBinding,
  bindingKeyFromEvent,
  mergeLanguage,
  mergeCustomSpeed,
  mergeSyncAllTabs,
  mergeDisabledSites,
  mergeOverlayPosition,
  mergeOverlayAutoHide,
  mergePreservePitch,
  mergeAggressiveMode,
  mergeTrackTimeSaved,
  mergeTheme,
  mergeAccentColor,
  mergeAutoSpeedByDuration,
  mergeAutoSpeedThresholdMinutes,
  mergeAutoSpeedShortSpeed,
  mergeAutoSpeedLongSpeed,
  mergeControlAudio,
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
    theme: 'auto',
    accentColor: '#6552e0',
    autoSpeedByDuration: false,
    autoSpeedThresholdMinutes: 20,
    autoSpeedShortSpeed: 1,
    autoSpeedLongSpeed: 2,
    controlAudio: false,
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
      theme: 'auto',
      accentColor: '#6552e0',
      autoSpeedByDuration: false,
      autoSpeedThresholdMinutes: 20,
      autoSpeedShortSpeed: 1,
      autoSpeedLongSpeed: 2,
      controlAudio: false,
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

test('matchesKeyBinding matches the typed key case-insensitively', () => {
  assert.equal(matchesKeyBinding({ key: 'S', code: 'KeyS' }, 's'), true);
  assert.equal(matchesKeyBinding({ key: 's', code: 'KeyS' }, 'd'), false);
  assert.equal(matchesKeyBinding({ key: 'ArrowUp', code: 'ArrowUp' }, 'arrowup'), true);
});

test('matchesKeyBinding falls back to the physical Latin key on non-Latin layouts', () => {
  // Russian layout: the physical S key types 'ы'.
  assert.equal(matchesKeyBinding({ key: 'ы', code: 'KeyS' }, 's'), true);
  // Arabic, Greek, Hindi, Japanese kana, Korean hangul.
  assert.equal(matchesKeyBinding({ key: 'س', code: 'KeyS' }, 's'), true);
  assert.equal(matchesKeyBinding({ key: 'σ', code: 'KeyS' }, 's'), true);
  assert.equal(matchesKeyBinding({ key: 'ग', code: 'KeyS' }, 's'), true);
  assert.equal(matchesKeyBinding({ key: 'ㄴ', code: 'KeyS' }, 's'), true);
  // An IME that is composing reports 'Process' / 'Unidentified'.
  assert.equal(matchesKeyBinding({ key: 'Process', code: 'KeyS' }, 's'), true);
  assert.equal(matchesKeyBinding({ key: 'Unidentified', code: 'KeyS' }, 's'), true);
});

test('matchesKeyBinding still honours a binding stored as the non-Latin character itself', () => {
  assert.equal(matchesKeyBinding({ key: 'ы', code: 'KeyS' }, 'ы'), true);
});

test('matchesKeyBinding does NOT remap Latin-script layouts (Dvorak, Turkish, AZERTY)', () => {
  // Dvorak: physical KeyS types 'o' — that is what the user sees, so 's' must not fire.
  assert.equal(matchesKeyBinding({ key: 'o', code: 'KeyS' }, 's'), false);
  // Turkish: physical KeyI types 'ı' (dotless), still Latin script.
  assert.equal(matchesKeyBinding({ key: 'ı', code: 'KeyI' }, 'i'), false);
});

test('matchesKeyBinding ignores non-letter physical keys and missing fields', () => {
  assert.equal(matchesKeyBinding({ key: 'ы', code: 'Digit1' }, 's'), false);
  assert.equal(matchesKeyBinding({ key: 'ы' }, 's'), false);
  assert.equal(matchesKeyBinding({}, 's'), false);
});

test('bindingKeyFromEvent records the physical Latin letter on non-Latin layouts', () => {
  assert.equal(bindingKeyFromEvent({ key: 'ы', code: 'KeyS' }), 's');
  assert.equal(bindingKeyFromEvent({ key: 'Process', code: 'KeyD' }), 'd');
});

test('bindingKeyFromEvent otherwise records the lowercased typed key', () => {
  assert.equal(bindingKeyFromEvent({ key: 'W', code: 'KeyW' }), 'w');
  assert.equal(bindingKeyFromEvent({ key: 'ArrowUp', code: 'ArrowUp' }), 'arrowup');
  assert.equal(bindingKeyFromEvent({ key: 'ı', code: 'KeyI' }), 'ı');
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

test('mergeTheme defaults to auto for missing/invalid values', () => {
  assert.equal(mergeTheme(undefined), 'auto');
  assert.equal(mergeTheme('purple'), 'auto');
  assert.equal(mergeTheme(1), 'auto');
});

test('mergeTheme preserves a supported theme', () => {
  assert.equal(mergeTheme('light'), 'light');
  assert.equal(mergeTheme('dark'), 'dark');
});

test('mergeAccentColor defaults to the default accent for missing/invalid values', () => {
  assert.equal(mergeAccentColor(undefined), '#6552e0');
  assert.equal(mergeAccentColor('not-a-color'), '#6552e0');
  assert.equal(mergeAccentColor('#fff'), '#6552e0');
});

test('mergeAccentColor preserves and lowercases a valid hex color', () => {
  assert.equal(mergeAccentColor('#2E7DD1'), '#2e7dd1');
  assert.equal(mergeAccentColor('#000000'), '#000000');
});

test('mergeAutoSpeedByDuration defaults to false for missing/invalid values', () => {
  assert.equal(mergeAutoSpeedByDuration(undefined), false);
  assert.equal(mergeAutoSpeedByDuration('on'), false);
});

test('mergeAutoSpeedByDuration preserves an explicit boolean', () => {
  assert.equal(mergeAutoSpeedByDuration(true), true);
  assert.equal(mergeAutoSpeedByDuration(false), false);
});

test('mergeAutoSpeedThresholdMinutes defaults to 20 for missing/invalid values', () => {
  assert.equal(mergeAutoSpeedThresholdMinutes(undefined), 20);
  assert.equal(mergeAutoSpeedThresholdMinutes('20'), 20);
  assert.equal(mergeAutoSpeedThresholdMinutes(NaN), 20);
});

test('mergeAutoSpeedThresholdMinutes rounds and clamps to 1-180', () => {
  assert.equal(mergeAutoSpeedThresholdMinutes(5.6), 6);
  assert.equal(mergeAutoSpeedThresholdMinutes(0), 1);
  assert.equal(mergeAutoSpeedThresholdMinutes(-10), 1);
  assert.equal(mergeAutoSpeedThresholdMinutes(999), 180);
});

test('mergeAutoSpeedShortSpeed defaults to 1x and clamps like any other speed', () => {
  assert.equal(mergeAutoSpeedShortSpeed(undefined), 1);
  assert.equal(mergeAutoSpeedShortSpeed('1'), 1);
  assert.equal(mergeAutoSpeedShortSpeed(30), 16);
});

test('mergeAutoSpeedLongSpeed defaults to 2x and clamps like any other speed', () => {
  assert.equal(mergeAutoSpeedLongSpeed(undefined), 2);
  assert.equal(mergeAutoSpeedLongSpeed('2'), 2);
  assert.equal(mergeAutoSpeedLongSpeed(0), 0.25);
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

test('mergeControlAudio defaults to false for missing/invalid values', () => {
  assert.equal(mergeControlAudio(undefined), false);
  assert.equal(mergeControlAudio('yes'), false);
  assert.equal(mergeControlAudio(1), false);
});

test('mergeControlAudio preserves an explicit boolean', () => {
  assert.equal(mergeControlAudio(true), true);
  assert.equal(mergeControlAudio(false), false);
});
