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

  // Splits a duration into whole hours and minutes for display. Seconds are
  // dropped rather than rounded up into an extra minute, so the "time saved"
  // counter only ever grows — it never reads a big round number and then
  // ticks backward a minute right after.
  function formatDuration(totalSeconds) {
    var totalMinutes = Math.floor(Math.max(0, totalSeconds) / 60);
    return {
      hours: Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60,
    };
  }

  // Decides the "auto speed by video length" target: long videos (at or
  // past the threshold) get `longSpeed`, everything else gets `shortSpeed`.
  // Pure and DOM-free on purpose, so the actual decision is unit-testable
  // without a <video> element — content.js only supplies the numbers
  // (video.duration, the user's threshold/speed settings).
  function pickAutoSpeed(durationSeconds, thresholdMinutes, shortSpeed, longSpeed) {
    return durationSeconds >= thresholdMinutes * 60 ? longSpeed : shortSpeed;
  }

  var api = {
    SPEED_MIN: SPEED_MIN,
    SPEED_MAX: SPEED_MAX,
    PRESETS: PRESETS,
    clampSpeed: clampSpeed,
    formatSpeed: formatSpeed,
    formatDuration: formatDuration,
    pickAutoSpeed: pickAutoSpeed,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.SpeeVid = root.SpeeVid || {};
    root.SpeeVid.speedUtils = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
