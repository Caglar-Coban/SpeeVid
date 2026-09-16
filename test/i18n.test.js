const test = require('node:test');
const assert = require('node:assert/strict');
const { LANGUAGES, TRANSLATIONS, DEFAULT_LANGUAGE, isSupportedLanguage, translate } = require('../src/shared/i18n.js');

test('DEFAULT_LANGUAGE is English', () => {
  assert.equal(DEFAULT_LANGUAGE, 'en');
});

test('every listed language has a translation dictionary with the same keys as English', () => {
  const englishKeys = Object.keys(TRANSLATIONS.en).sort();
  LANGUAGES.forEach((lang) => {
    assert.ok(TRANSLATIONS[lang.code], `missing translations for ${lang.code}`);
    assert.deepEqual(Object.keys(TRANSLATIONS[lang.code]).sort(), englishKeys, `key mismatch for ${lang.code}`);
  });
});

test('isSupportedLanguage recognizes listed codes and rejects unknown ones', () => {
  LANGUAGES.forEach((lang) => {
    assert.equal(isSupportedLanguage(lang.code), true);
  });
  assert.equal(isSupportedLanguage('xx'), false);
  assert.equal(isSupportedLanguage(''), false);
});

test('translate falls back to English for an unsupported language', () => {
  assert.equal(translate('xx', 'back'), translate('en', 'back'));
});

test('translate falls back to the key itself when missing from every dictionary', () => {
  assert.equal(translate('en', 'nonexistentKey'), 'nonexistentKey');
});
