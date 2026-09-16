importScripts('../shared/storage-helpers.js', '../shared/storage.js');

chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.sync.get(SpeeVid.storage.DEFAULT_SETTINGS, function (stored) {
    chrome.storage.sync.set(stored);
  });
});
