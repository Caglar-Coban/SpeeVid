(function (root) {
  'use strict';

  function buildSiteSpeedKey(hostname) {
    return (hostname || 'unknown').toLowerCase();
  }

  function mergeSettings(stored) {
    stored = stored || {};
    return {
      floatingEnabled: typeof stored.floatingEnabled === 'boolean' ? stored.floatingEnabled : true,
      shortcutsEnabled: typeof stored.shortcutsEnabled === 'boolean' ? stored.shortcutsEnabled : true,
    };
  }

  var api = {
    buildSiteSpeedKey: buildSiteSpeedKey,
    mergeSettings: mergeSettings,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.SpeeVid = root.SpeeVid || {};
    root.SpeeVid.storageHelpers = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
