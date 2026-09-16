(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var i18n = isNode ? require('./i18n.js') : root.SpeeVid && root.SpeeVid.i18n;
  var speedUtils = isNode ? require('./speed-utils.js') : root.SpeeVid && root.SpeeVid.speedUtils;

  var DEFAULT_KEY_BINDINGS = { increase: 's', decrease: 'd', reset: 'a', custom: 'q' };
  var DEFAULT_CUSTOM_SPEED = 2;

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

  function mergeDisabledSites(stored) {
    if (!Array.isArray(stored)) return [];
    var seen = {};
    var result = [];
    stored.forEach(function (entry) {
      if (typeof entry !== 'string' || !entry) return;
      var key = entry.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      result.push(key);
    });
    return result;
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
    };
  }

  var api = {
    DEFAULT_KEY_BINDINGS: DEFAULT_KEY_BINDINGS,
    DEFAULT_CUSTOM_SPEED: DEFAULT_CUSTOM_SPEED,
    buildSiteSpeedKey: buildSiteSpeedKey,
    mergeKeyBindings: mergeKeyBindings,
    mergeLanguage: mergeLanguage,
    mergeCustomSpeed: mergeCustomSpeed,
    mergeSyncAllTabs: mergeSyncAllTabs,
    mergeDisabledSites: mergeDisabledSites,
    mergeSettings: mergeSettings,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.SpeeVid = root.SpeeVid || {};
    root.SpeeVid.storageHelpers = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
