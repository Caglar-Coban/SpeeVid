(function (root) {
  'use strict';

  var helpers = root.SpeeVid && root.SpeeVid.storageHelpers;
  var DEFAULT_SETTINGS = { floatingEnabled: true, shortcutsEnabled: true };

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

  function getSiteSpeed(hostname) {
    var key = helpers.buildSiteSpeedKey(hostname);
    return new Promise(function (resolve) {
      chrome.storage.local.get({ siteSpeeds: {} }, function (result) {
        resolve(result.siteSpeeds[key] || 1);
      });
    });
  }

  function setSiteSpeed(hostname, speed) {
    var key = helpers.buildSiteSpeedKey(hostname);
    return new Promise(function (resolve) {
      chrome.storage.local.get({ siteSpeeds: {} }, function (result) {
        var siteSpeeds = Object.assign({}, result.siteSpeeds);
        siteSpeeds[key] = speed;
        chrome.storage.local.set({ siteSpeeds: siteSpeeds }, resolve);
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

  root.SpeeVid = root.SpeeVid || {};
  root.SpeeVid.storage = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    getSettings: getSettings,
    setSetting: setSetting,
    getSiteSpeed: getSiteSpeed,
    setSiteSpeed: setSiteSpeed,
    onSettingsChanged: onSettingsChanged,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
