(function (root) {
  'use strict';

  var DEFAULT_THEME = 'auto';
  var THEMES = ['auto', 'light', 'dark'];
  var DEFAULT_ACCENT_COLOR = '#6552e0';
  // A handful of ready-made accents shown as swatches in settings, so
  // personalizing the color doesn't require reaching for the picker every
  // time — but the picker is always right next to them for any other color.
  var ACCENT_PRESETS = ['#6552e0', '#2e7dd1', '#1c9e6e', '#d1663a', '#c23b6b', '#3a8fa8'];
  var HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

  function isValidHexColor(value) {
    return typeof value === 'string' && HEX_COLOR_RE.test(value);
  }

  function hexToRgb(hex) {
    var num = parseInt(hex.slice(1), 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  // Not the full WCAG relative-luminance formula (no gamma correction) —
  // just the standard quick perceived-brightness estimate, which is plenty
  // accurate for picking a legible black-or-white label on a colored chip.
  function perceivedBrightness(rgb) {
    return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000 / 255;
  }

  // The color used for text/icons drawn on top of a solid accent-colored
  // background (e.g. the active preset button, the toggle switch thumb).
  function getAccentForeground(hex) {
    if (!isValidHexColor(hex)) hex = DEFAULT_ACCENT_COLOR;
    return perceivedBrightness(hexToRgb(hex)) > 0.6 ? '#14141a' : '#ffffff';
  }

  // A translucent version of the accent for glow/halo effects, so any chosen
  // color gets the same soft-glow treatment the default purple has.
  function getAccentHalo(hex, alpha) {
    if (!isValidHexColor(hex)) hex = DEFAULT_ACCENT_COLOR;
    var rgb = hexToRgb(hex);
    return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + (typeof alpha === 'number' ? alpha : 0.2) + ')';
  }

  var api = {
    DEFAULT_THEME: DEFAULT_THEME,
    THEMES: THEMES,
    DEFAULT_ACCENT_COLOR: DEFAULT_ACCENT_COLOR,
    ACCENT_PRESETS: ACCENT_PRESETS,
    isValidHexColor: isValidHexColor,
    hexToRgb: hexToRgb,
    getAccentForeground: getAccentForeground,
    getAccentHalo: getAccentHalo,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.SpeeVid = root.SpeeVid || {};
    root.SpeeVid.theme = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
