(function (root) {
  'use strict';

  var SPEED_MIN = 0.25;
  var SPEED_MAX = 16;
  var PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 8, 16];

  function clampSpeed(value) {
    var num = Number(value);
    if (Number.isNaN(num)) return 1;
    var clamped = Math.min(SPEED_MAX, Math.max(SPEED_MIN, num));
    return Math.round(clamped * 100) / 100;
  }

  function formatSpeed(speed) {
    var rounded = Math.round(speed * 100) / 100;
    var text = rounded % 1 === 0 ? rounded.toFixed(0) : String(rounded);
    return text + 'x';
  }

  var api = {
    SPEED_MIN: SPEED_MIN,
    SPEED_MAX: SPEED_MAX,
    PRESETS: PRESETS,
    clampSpeed: clampSpeed,
    formatSpeed: formatSpeed,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.SpeeVid = root.SpeeVid || {};
    root.SpeeVid.speedUtils = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
