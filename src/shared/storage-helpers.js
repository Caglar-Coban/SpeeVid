(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var i18n = isNode ? require('./i18n.js') : root.SpeeVid && root.SpeeVid.i18n;
  var speedUtils = isNode ? require('./speed-utils.js') : root.SpeeVid && root.SpeeVid.speedUtils;
  var theme = isNode ? require('./theme.js') : root.SpeeVid && root.SpeeVid.theme;

  var DEFAULT_KEY_BINDINGS = { increase: 's', decrease: 'd', reset: 'a', custom: 'q' };
  var DEFAULT_CUSTOM_SPEED = 2;
  var OVERLAY_POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
  var DEFAULT_OVERLAY_POSITION = 'bottom-right';
  var DEFAULT_AUTO_SPEED_THRESHOLD_MINUTES = 20;
  var AUTO_SPEED_THRESHOLD_MIN_MINUTES = 1;
  var AUTO_SPEED_THRESHOLD_MAX_MINUTES = 180;
  var DEFAULT_AUTO_SPEED_SHORT_SPEED = 1;
  var DEFAULT_AUTO_SPEED_LONG_SPEED = 2;

  function buildSiteSpeedKey(hostname) {
    return (hostname || 'unknown').toLowerCase();
  }

  function mergeKeyBindings(stored) {
    stored = stored && typeof stored === 'object' ? stored : {};
    var merged = {};
    Object.keys(DEFAULT_KEY_BINDINGS).forEach(function (action) {
      merged[action] = typeof stored[action] === 'string' && stored[action] ? stored[action] : DEFAULT_KEY_BINDINGS[action];
    });
    return merged;
  }

  function mergeLanguage(stored) {
    var lang = typeof stored === 'string' ? stored : '';
    return i18n.isSupportedLanguage(lang) ? lang : i18n.DEFAULT_LANGUAGE;
  }

  function mergeCustomSpeed(stored) {
    return typeof stored === 'number' && !Number.isNaN(stored) ? speedUtils.clampSpeed(stored) : DEFAULT_CUSTOM_SPEED;
  }

  function mergeSyncAllTabs(stored) {
    return typeof stored === 'boolean' ? stored : false;
  }

  function mergeOverlayPosition(stored) {
    return typeof stored === 'string' && OVERLAY_POSITIONS.indexOf(stored) !== -1 ? stored : DEFAULT_OVERLAY_POSITION;
  }

  function mergeOverlayAutoHide(stored) {
    return typeof stored === 'boolean' ? stored : false;
  }

  // A pattern is either a plain hostname ("example.com") or a `*.` prefixed
  // wildcard ("*.example.com", matching example.com itself and any of its
  // subdomains). Only a single leading `*.` is accepted — anything else
  // (`ex*ample.com`, `**.example.com`, a bare `*`) is rejected rather than
  // silently doing something the user didn't ask for.
  function isValidSitePattern(entry) {
    if (typeof entry !== 'string' || !entry) return false;
    if (entry.indexOf('*') === -1) return true;
    return entry.indexOf('*.') === 0 && entry.indexOf('*', 2) === -1 && entry.length > 2;
  }

  function mergeDisabledSites(stored) {
    if (!Array.isArray(stored)) return [];
    var seen = {};
    var result = [];
    stored.forEach(function (entry) {
      if (typeof entry !== 'string' || !entry) return;
      var key = entry.toLowerCase();
      if (!isValidSitePattern(key)) return;
      if (seen[key]) return;
      seen[key] = true;
      result.push(key);
    });
    return result;
  }

  // Matches a hostname against a single pattern. A `*.` prefix matches the
  // base domain itself as well as any subdomain of it, so users don't need
  // two separate entries for "example.com" and "app.example.com".
  function hostMatchesPattern(hostname, pattern) {
    if (!hostname || !pattern) return false;
    if (pattern.indexOf('*.') === 0) {
      var base = pattern.slice(2);
      return hostname === base || hostname.slice(-(base.length + 1)) === '.' + base;
    }
    return hostname === pattern;
  }

  function hostMatchesAny(hostname, patterns) {
    if (!Array.isArray(patterns)) return false;
    for (var i = 0; i < patterns.length; i += 1) {
      if (hostMatchesPattern(hostname, patterns[i])) return true;
    }
    return false;
  }

  function mergePreservePitch(stored) {
    return typeof stored === 'boolean' ? stored : true;
  }

  function mergeAggressiveMode(stored) {
    return typeof stored === 'boolean' ? stored : false;
  }

  function mergeTrackTimeSaved(stored) {
    return typeof stored === 'boolean' ? stored : true;
  }

  function mergeAutoSpeedByDuration(stored) {
    return typeof stored === 'boolean' ? stored : false;
  }

  function mergeAutoSpeedThresholdMinutes(stored) {
    if (typeof stored !== 'number' || Number.isNaN(stored)) return DEFAULT_AUTO_SPEED_THRESHOLD_MINUTES;
    var rounded = Math.round(stored);
    return Math.min(AUTO_SPEED_THRESHOLD_MAX_MINUTES, Math.max(AUTO_SPEED_THRESHOLD_MIN_MINUTES, rounded));
  }

  function mergeAutoSpeedShortSpeed(stored) {
    return typeof stored === 'number' && !Number.isNaN(stored) ? speedUtils.clampSpeed(stored) : DEFAULT_AUTO_SPEED_SHORT_SPEED;
  }

  function mergeAutoSpeedLongSpeed(stored) {
    return typeof stored === 'number' && !Number.isNaN(stored) ? speedUtils.clampSpeed(stored) : DEFAULT_AUTO_SPEED_LONG_SPEED;
  }

  function mergeTheme(stored) {
    return typeof stored === 'string' && theme.THEMES.indexOf(stored) !== -1 ? stored : theme.DEFAULT_THEME;
  }

  function mergeAccentColor(stored) {
    return theme.isValidHexColor(stored) ? stored.toLowerCase() : theme.DEFAULT_ACCENT_COLOR;
  }

  function mergeSettings(stored) {
    stored = stored || {};
    return {
      floatingEnabled: typeof stored.floatingEnabled === 'boolean' ? stored.floatingEnabled : true,
      shortcutsEnabled: typeof stored.shortcutsEnabled === 'boolean' ? stored.shortcutsEnabled : true,
      keyBindings: mergeKeyBindings(stored.keyBindings),
      language: mergeLanguage(stored.language),
      customSpeed: mergeCustomSpeed(stored.customSpeed),
      syncAllTabs: mergeSyncAllTabs(stored.syncAllTabs),
      disabledSites: mergeDisabledSites(stored.disabledSites),
      overlayPosition: mergeOverlayPosition(stored.overlayPosition),
      overlayAutoHide: mergeOverlayAutoHide(stored.overlayAutoHide),
      preservePitch: mergePreservePitch(stored.preservePitch),
      aggressiveMode: mergeAggressiveMode(stored.aggressiveMode),
      trackTimeSaved: mergeTrackTimeSaved(stored.trackTimeSaved),
      theme: mergeTheme(stored.theme),
      accentColor: mergeAccentColor(stored.accentColor),
      autoSpeedByDuration: mergeAutoSpeedByDuration(stored.autoSpeedByDuration),
      autoSpeedThresholdMinutes: mergeAutoSpeedThresholdMinutes(stored.autoSpeedThresholdMinutes),
      autoSpeedShortSpeed: mergeAutoSpeedShortSpeed(stored.autoSpeedShortSpeed),
      autoSpeedLongSpeed: mergeAutoSpeedLongSpeed(stored.autoSpeedLongSpeed),
    };
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  // A backup is only trusted if it declares the version this build knows how
  // to read and carries a settings object to merge. Anything else — a
  // different app's export, a hand-edited file missing fields, an unrelated
  // JSON file the user picked by mistake — is rejected outright instead of
  // silently merging into defaults and wiping the user's real settings.
  function isValidBackup(raw) {
    return isPlainObject(raw) && raw.version === 1 && isPlainObject(raw.settings);
  }

  var api = {
    DEFAULT_KEY_BINDINGS: DEFAULT_KEY_BINDINGS,
    DEFAULT_CUSTOM_SPEED: DEFAULT_CUSTOM_SPEED,
    OVERLAY_POSITIONS: OVERLAY_POSITIONS,
    DEFAULT_OVERLAY_POSITION: DEFAULT_OVERLAY_POSITION,
    buildSiteSpeedKey: buildSiteSpeedKey,
    mergeKeyBindings: mergeKeyBindings,
    mergeLanguage: mergeLanguage,
    mergeCustomSpeed: mergeCustomSpeed,
    mergeSyncAllTabs: mergeSyncAllTabs,
    mergeDisabledSites: mergeDisabledSites,
    mergeOverlayPosition: mergeOverlayPosition,
    mergeOverlayAutoHide: mergeOverlayAutoHide,
    mergePreservePitch: mergePreservePitch,
    mergeAggressiveMode: mergeAggressiveMode,
    mergeTrackTimeSaved: mergeTrackTimeSaved,
    mergeTheme: mergeTheme,
    mergeAccentColor: mergeAccentColor,
    mergeAutoSpeedByDuration: mergeAutoSpeedByDuration,
    mergeAutoSpeedThresholdMinutes: mergeAutoSpeedThresholdMinutes,
    mergeAutoSpeedShortSpeed: mergeAutoSpeedShortSpeed,
    mergeAutoSpeedLongSpeed: mergeAutoSpeedLongSpeed,
    DEFAULT_AUTO_SPEED_THRESHOLD_MINUTES: DEFAULT_AUTO_SPEED_THRESHOLD_MINUTES,
    AUTO_SPEED_THRESHOLD_MIN_MINUTES: AUTO_SPEED_THRESHOLD_MIN_MINUTES,
    AUTO_SPEED_THRESHOLD_MAX_MINUTES: AUTO_SPEED_THRESHOLD_MAX_MINUTES,
    DEFAULT_AUTO_SPEED_SHORT_SPEED: DEFAULT_AUTO_SPEED_SHORT_SPEED,
    DEFAULT_AUTO_SPEED_LONG_SPEED: DEFAULT_AUTO_SPEED_LONG_SPEED,
    mergeSettings: mergeSettings,
    isPlainObject: isPlainObject,
    isValidBackup: isValidBackup,
    isValidSitePattern: isValidSitePattern,
    hostMatchesPattern: hostMatchesPattern,
    hostMatchesAny: hostMatchesAny,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.SpeeVid = root.SpeeVid || {};
    root.SpeeVid.storageHelpers = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
