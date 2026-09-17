(function (root) {
  'use strict';

  var helpers = root.SpeeVid && root.SpeeVid.storageHelpers;
  var i18n = root.SpeeVid && root.SpeeVid.i18n;
  var speedUtils = root.SpeeVid && root.SpeeVid.speedUtils;
  var DEFAULT_SETTINGS = {
    floatingEnabled: true,
    shortcutsEnabled: true,
    keyBindings: helpers.DEFAULT_KEY_BINDINGS,
    language: i18n.DEFAULT_LANGUAGE,
    customSpeed: helpers.DEFAULT_CUSTOM_SPEED,
    syncAllTabs: false,
    disabledSites: [],
    overlayPosition: helpers.DEFAULT_OVERLAY_POSITION,
    overlayAutoHide: false,
  };

  function safeSpeed(value, fallback) {
    return typeof value === 'number' && !Number.isNaN(value) ? speedUtils.clampSpeed(value) : fallback;
  }

  function getSettings() {
    return new Promise(function (resolve) {
      chrome.storage.sync.get(DEFAULT_SETTINGS, function (stored) {
        resolve(helpers.mergeSettings(stored));
      });
    });
  }

  function setSetting(key, value) {
    return new Promise(function (resolve) {
      var patch = {};
      patch[key] = value;
      chrome.storage.sync.set(patch, resolve);
    });
  }

  function toSiteSpeedsObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function getSiteSpeed(hostname) {
    var key = helpers.buildSiteSpeedKey(hostname);
    return new Promise(function (resolve) {
      chrome.storage.local.get({ siteSpeeds: {} }, function (result) {
        var siteSpeeds = toSiteSpeedsObject(result && result.siteSpeeds);
        resolve(siteSpeeds[key] || 1);
      });
    });
  }

  function setSiteSpeed(hostname, speed) {
    var key = helpers.buildSiteSpeedKey(hostname);
    return new Promise(function (resolve) {
      chrome.storage.local.get({ siteSpeeds: {} }, function (result) {
        var siteSpeeds = Object.assign({}, toSiteSpeedsObject(result && result.siteSpeeds));
        siteSpeeds[key] = speed;
        chrome.storage.local.set({ siteSpeeds: siteSpeeds }, resolve);
      });
    });
  }

  function getSiteSpeedsMap() {
    return new Promise(function (resolve) {
      chrome.storage.local.get({ siteSpeeds: {} }, function (result) {
        resolve(toSiteSpeedsObject(result && result.siteSpeeds));
      });
    });
  }

  // A pinned speed is a deliberate per-site default the user set on purpose,
  // distinct from `siteSpeeds` (which just remembers whatever speed was last
  // used there). It takes priority over the remembered speed on page load,
  // but ordinary in-session adjustments don't touch it unless the popup's
  // "pin" toggle is checked.
  function getPinnedSpeed(hostname) {
    var key = helpers.buildSiteSpeedKey(hostname);
    return new Promise(function (resolve) {
      chrome.storage.local.get({ pinnedSpeeds: {} }, function (result) {
        var pinnedSpeeds = toSiteSpeedsObject(result && result.pinnedSpeeds);
        resolve(Object.prototype.hasOwnProperty.call(pinnedSpeeds, key) ? pinnedSpeeds[key] : null);
      });
    });
  }

  function setPinnedSpeed(hostname, speed) {
    var key = helpers.buildSiteSpeedKey(hostname);
    return new Promise(function (resolve) {
      chrome.storage.local.get({ pinnedSpeeds: {} }, function (result) {
        var pinnedSpeeds = Object.assign({}, toSiteSpeedsObject(result && result.pinnedSpeeds));
        pinnedSpeeds[key] = speed;
        chrome.storage.local.set({ pinnedSpeeds: pinnedSpeeds }, resolve);
      });
    });
  }

  function removePinnedSpeed(hostname) {
    var key = helpers.buildSiteSpeedKey(hostname);
    return new Promise(function (resolve) {
      chrome.storage.local.get({ pinnedSpeeds: {} }, function (result) {
        var pinnedSpeeds = Object.assign({}, toSiteSpeedsObject(result && result.pinnedSpeeds));
        delete pinnedSpeeds[key];
        chrome.storage.local.set({ pinnedSpeeds: pinnedSpeeds }, resolve);
      });
    });
  }

  function getPinnedSpeedsMap() {
    return new Promise(function (resolve) {
      chrome.storage.local.get({ pinnedSpeeds: {} }, function (result) {
        resolve(toSiteSpeedsObject(result && result.pinnedSpeeds));
      });
    });
  }

  function onSettingsChanged(callback) {
    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName !== 'sync') return;
      var relevant = {};
      var hasChange = false;
      Object.keys(DEFAULT_SETTINGS).forEach(function (key) {
        if (changes[key]) {
          relevant[key] = changes[key].newValue;
          hasChange = true;
        }
      });
      if (hasChange) callback(relevant);
    });
  }

  // Shared across all tabs when "apply to all tabs" is on. Kept in `local`
  // (not `sync`) since speed changes can fire much more often than sync's
  // write-rate quota allows.
  function getGlobalSpeed() {
    return new Promise(function (resolve) {
      chrome.storage.local.get({ globalSpeed: 1 }, function (result) {
        resolve(result.globalSpeed);
      });
    });
  }

  function setGlobalSpeed(speed) {
    return new Promise(function (resolve) {
      chrome.storage.local.set({ globalSpeed: speed }, resolve);
    });
  }

  function onGlobalSpeedChanged(callback) {
    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName !== 'local' || !changes.globalSpeed) return;
      callback(changes.globalSpeed.newValue);
    });
  }

  // Restores a previously exported backup. Every value is re-validated
  // through the same merge/clamp logic as normal writes, so a hand-edited or
  // stale-format file can never leave storage in an inconsistent state.
  // Rejects anything that doesn't look like one of our own backups (wrong
  // version, missing settings object) instead of merging it into defaults —
  // otherwise picking the wrong file would silently wipe real settings.
  function importSettings(raw) {
    if (!helpers.isValidBackup(raw)) {
      return Promise.reject(new Error('Invalid backup file'));
    }
    var sanitizedSettings = helpers.mergeSettings(raw.settings);
    var rawSiteSpeeds = toSiteSpeedsObject(raw.siteSpeeds);
    var siteSpeeds = {};
    Object.keys(rawSiteSpeeds).forEach(function (key) {
      siteSpeeds[key] = safeSpeed(rawSiteSpeeds[key], 1);
    });
    var rawPinnedSpeeds = toSiteSpeedsObject(raw.pinnedSpeeds);
    var pinnedSpeeds = {};
    Object.keys(rawPinnedSpeeds).forEach(function (key) {
      pinnedSpeeds[key] = safeSpeed(rawPinnedSpeeds[key], 1);
    });
    var globalSpeed = safeSpeed(raw.globalSpeed, 1);

    return new Promise(function (resolve) {
      chrome.storage.sync.set(sanitizedSettings, function () {
        chrome.storage.local.set({ siteSpeeds: siteSpeeds, globalSpeed: globalSpeed, pinnedSpeeds: pinnedSpeeds }, function () {
          resolve(sanitizedSettings);
        });
      });
    });
  }

  root.SpeeVid = root.SpeeVid || {};
  root.SpeeVid.storage = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    getSettings: getSettings,
    setSetting: setSetting,
    getSiteSpeed: getSiteSpeed,
    setSiteSpeed: setSiteSpeed,
    getSiteSpeedsMap: getSiteSpeedsMap,
    getPinnedSpeed: getPinnedSpeed,
    setPinnedSpeed: setPinnedSpeed,
    removePinnedSpeed: removePinnedSpeed,
    getPinnedSpeedsMap: getPinnedSpeedsMap,
    onSettingsChanged: onSettingsChanged,
    getGlobalSpeed: getGlobalSpeed,
    setGlobalSpeed: setGlobalSpeed,
    onGlobalSpeedChanged: onGlobalSpeedChanged,
    importSettings: importSettings,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
