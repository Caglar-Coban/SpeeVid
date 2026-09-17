const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidHexColor, hexToRgb, getAccentForeground, getAccentHalo, ACCENT_PRESETS, DEFAULT_ACCENT_COLOR, THEMES } = require('../src/shared/theme.js');

test('isValidHexColor accepts 6-digit hex colors, case-insensitively', () => {
  assert.equal(isValidHexColor('#6552e0'), true);
  assert.equal(isValidHexColor('#6552E0'), true);
  assert.equal(isValidHexColor('#FFFFFF'), true);
});

test('isValidHexColor rejects everything else', () => {
  assert.equal(isValidHexColor('#fff'), false); // 3-digit shorthand not accepted
  assert.equal(isValidHexColor('6552e0'), false); // missing #
  assert.equal(isValidHexColor('#gggggg'), false);
  assert.equal(isValidHexColor('red'), false);
  assert.equal(isValidHexColor(''), false);
  assert.equal(isValidHexColor(null), false);
  assert.equal(isValidHexColor(undefined), false);
  assert.equal(isValidHexColor(123456), false);
});

test('hexToRgb decodes each channel', () => {
  assert.deepEqual(hexToRgb('#000000'), { r: 0, g: 0, b: 0 });
  assert.deepEqual(hexToRgb('#ffffff'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(hexToRgb('#6552e0'), { r: 0x65, g: 0x52, b: 0xe0 });
});

test('getAccentForeground picks white text on a dark accent', () => {
  assert.equal(getAccentForeground('#1c1c20'), '#ffffff');
});

test('getAccentForeground picks dark text on a light accent', () => {
  assert.equal(getAccentForeground('#f5f5f7'), '#14141a');
});

test('getAccentForeground falls back to the default accent for invalid input', () => {
  assert.equal(getAccentForeground('not-a-color'), getAccentForeground(DEFAULT_ACCENT_COLOR));
});

test('getAccentHalo returns an rgba string with the requested alpha', () => {
  assert.equal(getAccentHalo('#ffffff', 0.5), 'rgba(255, 255, 255, 0.5)');
});

test('getAccentHalo defaults alpha to 0.2 when omitted', () => {
  assert.equal(getAccentHalo('#000000'), 'rgba(0, 0, 0, 0.2)');
});

test('ACCENT_PRESETS are all valid hex colors', () => {
  ACCENT_PRESETS.forEach((color) => {
    assert.equal(isValidHexColor(color), true, `${color} should be a valid hex color`);
  });
});

test('THEMES lists the three supported modes', () => {
  assert.deepEqual(THEMES, ['auto', 'light', 'dark']);
});
