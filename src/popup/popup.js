(function () {
  'use strict';

  var PRESETS = SpeeVid.speedUtils.PRESETS;
  var formatSpeed = SpeeVid.speedUtils.formatSpeed;
  var clampSpeed = SpeeVid.speedUtils.clampSpeed;
  var getSettings = SpeeVid.storage.getSettings;
  var setSetting = SpeeVid.storage.setSetting;
  var MESSAGE_TYPES = SpeeVid.messages.MESSAGE_TYPES;

  var videoSection = document.getElementById('videoSection');
  var emptySection = document.getElementById('emptySection');
  var unsupportedSection = document.getElementById('unsupportedSection');
  var speedValueEl = document.getElementById('speedValue');
  var speedSlider = document.getElementById('speedSlider');
  var presetsEl = document.getElementById('presets');
  var floatingToggle = document.getElementById('floatingToggle');
  var shortcutsToggle = document.getElementById('shortcutsToggle');

  var activeTabId = null;

  function showSection(section) {
    [videoSection, emptySection, unsupportedSection].forEach(function (el) {
      el.hidden = el !== section;
    });
  }

  function renderPresets(currentSpeed) {
    presetsEl.innerHTML = PRESETS.map(function (p) {
      var isActive = p === currentSpeed;
      return '<button type="button" data-speed="' + p + '" class="' + (isActive ? 'active' : '') + '">' + formatSpeed(p) + '</button>';
    }).join('');
  }

  function renderSpeed(speed) {
    var clamped = clampSpeed(speed);
    speedValueEl.textContent = formatSpeed(clamped);
    speedSlider.value = String(clamped);
    renderPresets(clamped);
  }

  function sendSpeed(speed) {
    if (activeTabId === null) return;
    chrome.tabs.sendMessage(activeTabId, { type: MESSAGE_TYPES.SET_SPEED, speed: speed }, function (response) {
      if (chrome.runtime.lastError) return;
      if (response) renderSpeed(response.speed);
    });
  }

  speedSlider.addEventListener('input', function (event) {
    sendSpeed(Number(event.target.value));
  });

  presetsEl.addEventListener('click', function (event) {
    var target = event.target.closest('button[data-speed]');
    if (!target) return;
    sendSpeed(Number(target.dataset.speed));
  });

  floatingToggle.addEventListener('change', function (event) {
    setSetting('floatingEnabled', event.target.checked);
  });

  shortcutsToggle.addEventListener('change', function (event) {
    setSetting('shortcutsEnabled', event.target.checked);
  });

  function init() {
    getSettings().then(function (settings) {
      floatingToggle.checked = settings.floatingEnabled;
      shortcutsToggle.checked = settings.shortcutsEnabled;
    });

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs[0];
      if (!tab || !tab.id || !tab.url || !/^https?:/.test(tab.url)) {
        showSection(unsupportedSection);
        return;
      }

      activeTabId = tab.id;

      // Target the top frame explicitly: with `all_frames: true` an untargeted
      // message resolves with whichever frame replies first (often an iframe
      // with no video at all). SET_SPEED stays untargeted on purpose so
      // embedded players still receive it.
      chrome.tabs.sendMessage(activeTabId, { type: MESSAGE_TYPES.GET_STATE }, { frameId: 0 }, function (response) {
        if (chrome.runtime.lastError || !response) {
          showSection(unsupportedSection);
          return;
        }
        if (response.videoCount === 0) {
          showSection(emptySection);
          return;
        }
        showSection(videoSection);
        renderSpeed(response.speed);
      });
    });
  }

  init();
})();
