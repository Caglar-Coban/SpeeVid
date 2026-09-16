(function () {
  'use strict';

  var clampSpeed = SpeeVid.speedUtils.clampSpeed;
  var getSettings = SpeeVid.storage.getSettings;
  var getSiteSpeed = SpeeVid.storage.getSiteSpeed;
  var setSiteSpeed = SpeeVid.storage.setSiteSpeed;
  var onSettingsChanged = SpeeVid.storage.onSettingsChanged;
  var MESSAGE_TYPES = SpeeVid.messages.MESSAGE_TYPES;

  var HOSTNAME = location.hostname || 'local-file';

  var state = {
    speed: 1,
    floatingEnabled: true,
    shortcutsEnabled: true,
  };

  function scanVideos() {
    return Array.prototype.slice.call(document.querySelectorAll('video'));
  }

  function applySpeedToAllVideos() {
    scanVideos().forEach(function (video) {
      video.playbackRate = state.speed;
    });
  }

  function setSpeed(rawSpeed, persist) {
    if (persist === undefined) persist = true;
    state.speed = clampSpeed(rawSpeed);
    applySpeedToAllVideos();
    if (persist) {
      setSiteSpeed(HOSTNAME, state.speed);
    }
  }

  function handleMessage(message, _sender, sendResponse) {
    if (message.type === MESSAGE_TYPES.GET_STATE) {
      sendResponse({
        speed: state.speed,
        videoCount: scanVideos().length,
        floatingEnabled: state.floatingEnabled,
      });
      return false;
    }
    if (message.type === MESSAGE_TYPES.SET_SPEED) {
      setSpeed(message.speed);
      sendResponse({ speed: state.speed });
      return false;
    }
    return false;
  }

  function observeNewVideos() {
    var observer = new MutationObserver(function () {
      applySpeedToAllVideos();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function init() {
    Promise.all([getSettings(), getSiteSpeed(HOSTNAME)]).then(function (results) {
      var settings = results[0];
      var siteSpeed = results[1];

      state.floatingEnabled = settings.floatingEnabled;
      state.shortcutsEnabled = settings.shortcutsEnabled;
      state.speed = clampSpeed(siteSpeed);

      applySpeedToAllVideos();
      observeNewVideos();

      chrome.runtime.onMessage.addListener(handleMessage);
      onSettingsChanged(function (changed) {
        if (typeof changed.floatingEnabled === 'boolean') {
          state.floatingEnabled = changed.floatingEnabled;
        }
        if (typeof changed.shortcutsEnabled === 'boolean') {
          state.shortcutsEnabled = changed.shortcutsEnabled;
        }
      });
    });
  }

  init();
})();
