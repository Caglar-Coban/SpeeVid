(function () {
  'use strict';

  var PRESETS = SpeeVid.speedUtils.PRESETS;
  var formatSpeed = SpeeVid.speedUtils.formatSpeed;
  var clampSpeed = SpeeVid.speedUtils.clampSpeed;
  var getSettings = SpeeVid.storage.getSettings;
  var setSetting = SpeeVid.storage.setSetting;
  var MESSAGE_TYPES = SpeeVid.messages.MESSAGE_TYPES;
  var i18n = SpeeVid.i18n;

  var videoSection = document.getElementById('videoSection');
  var emptySection = document.getElementById('emptySection');
  var unsupportedSection = document.getElementById('unsupportedSection');
  var disabledSection = document.getElementById('disabledSection');
  var settingsSection = document.getElementById('settingsSection');
  var speedValueEl = document.getElementById('speedValue');
  var speedSlider = document.getElementById('speedSlider');
  var presetsEl = document.getElementById('presets');
  var floatingToggle = document.getElementById('floatingToggle');
  var shortcutsToggle = document.getElementById('shortcutsToggle');
  var syncAllTabsToggle = document.getElementById('syncAllTabsToggle');
  var appFooter = document.getElementById('appFooter');
  var settingsBtn = document.getElementById('settingsBtn');
  var backBtn = document.getElementById('backBtn');
  var languageSelect = document.getElementById('languageSelect');
  var overlayPositionSelect = document.getElementById('overlayPositionSelect');
  var overlayAutoHideToggle = document.getElementById('overlayAutoHideToggle');
  var customSpeedInput = document.getElementById('customSpeedInput');
  var siteDisableRow = document.getElementById('siteDisableRow');
  var siteDisableToggle = document.getElementById('siteDisableToggle');
  var disabledSiteInput = document.getElementById('disabledSiteInput');
  var addDisabledSiteBtn = document.getElementById('addDisabledSiteBtn');
  var disabledSitesList = document.getElementById('disabledSitesList');
  var exportBtn = document.getElementById('exportBtn');
  var importBtn = document.getElementById('importBtn');
  var importFileInput = document.getElementById('importFileInput');
  var backupStatus = document.getElementById('backupStatus');
  var keyBindButtons = Array.prototype.slice.call(document.querySelectorAll('.key-btn'));

  var activeTabId = null;
  var currentMainSection = null;
  var keyBindings = Object.assign({}, SpeeVid.storage.DEFAULT_SETTINGS.keyBindings);
  var disabledSites = SpeeVid.storage.DEFAULT_SETTINGS.disabledSites.slice();
  var listeningAction = null;
  var currentLanguage = SpeeVid.storage.DEFAULT_SETTINGS.language;
  var currentHostname = null;

  var ALL_SECTIONS = [videoSection, emptySection, unsupportedSection, disabledSection, settingsSection];

  function showSection(section) {
    ALL_SECTIONS.forEach(function (el) {
      el.hidden = el !== section;
    });
    if (section !== settingsSection) {
      currentMainSection = section;
    }
    appFooter.hidden = section === settingsSection;
    siteDisableRow.hidden = section === settingsSection || currentHostname === null;
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

  syncAllTabsToggle.addEventListener('change', function (event) {
    setSetting('syncAllTabs', event.target.checked);
  });

  overlayPositionSelect.addEventListener('change', function (event) {
    setSetting('overlayPosition', event.target.value);
  });

  overlayAutoHideToggle.addEventListener('change', function (event) {
    setSetting('overlayAutoHide', event.target.checked);
  });

  customSpeedInput.addEventListener('change', function (event) {
    var clamped = clampSpeed(Number(event.target.value));
    customSpeedInput.value = clamped;
    setSetting('customSpeed', clamped);
  });

  var BLOCKED_KEYS = ['shift', 'control', 'alt', 'meta', 'tab', 'capslock', 'escape'];

  function renderKeyBindings() {
    keyBindButtons.forEach(function (btn) {
      var action = btn.dataset.action;
      btn.textContent = keyBindings[action];
    });
  }

  function stopListening() {
    if (listeningAction === null) return;
    listeningAction = null;
    keyBindButtons.forEach(function (btn) {
      btn.classList.remove('listening');
    });
    renderKeyBindings();
  }

  function startListening(action, btn) {
    stopListening();
    listeningAction = action;
    btn.classList.add('listening');
    btn.textContent = '...';
  }

  keyBindButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (listeningAction === btn.dataset.action) {
        stopListening();
        return;
      }
      startListening(btn.dataset.action, btn);
    });
  });

  document.addEventListener('keydown', function (event) {
    if (listeningAction === null) return;
    event.preventDefault();
    var key = event.key.toLowerCase();
    if (BLOCKED_KEYS.indexOf(key) !== -1) return;

    var action = listeningAction;
    var updated = Object.assign({}, keyBindings);
    updated[action] = key;
    keyBindings = updated;
    stopListening();
    setSetting('keyBindings', keyBindings);
  });

  settingsBtn.addEventListener('click', function () {
    showSection(settingsSection);
  });

  backBtn.addEventListener('click', function () {
    stopListening();
    showSection(currentMainSection || emptySection);
  });

  function populateLanguageOptions() {
    languageSelect.innerHTML = i18n.LANGUAGES.map(function (lang) {
      return '<option value="' + lang.code + '">' + lang.name + '</option>';
    }).join('');
  }

  function applyTranslations(lang) {
    currentLanguage = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = i18n.isRtl(lang) ? 'rtl' : 'ltr';
    languageSelect.value = lang;

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = i18n.translate(lang, el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label', i18n.translate(lang, el.dataset.i18nAria));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.title = i18n.translate(lang, el.dataset.i18nTitle);
    });
  }

  languageSelect.addEventListener('change', function (event) {
    var lang = event.target.value;
    applyTranslations(lang);
    setSetting('language', lang);
  });

  function refreshVideoState() {
    if (activeTabId === null) return;

    // Target the top frame explicitly: with `all_frames: true` an untargeted
    // message resolves with whichever frame replies first (often an iframe
    // with no video at all). SET_SPEED stays untargeted on purpose so
    // embedded players still receive it.
    chrome.tabs.sendMessage(activeTabId, { type: MESSAGE_TYPES.GET_STATE }, { frameId: 0 }, function (response) {
      if (chrome.runtime.lastError || !response) {
        showSection(unsupportedSection);
        return;
      }
      if (response.disabled) {
        showSection(disabledSection);
        return;
      }
      if (response.videoCount === 0) {
        showSection(emptySection);
        return;
      }
      showSection(videoSection);
      renderSpeed(response.speed);
    });
  }

  // Built with DOM APIs rather than innerHTML string interpolation: site
  // names can come from an imported backup file, so they're untrusted input
  // and must never be parsed as markup.
  function renderDisabledSitesList() {
    disabledSitesList.innerHTML = '';

    if (disabledSites.length === 0) {
      var emptyLi = document.createElement('li');
      emptyLi.className = 'disabled-sites-empty';
      emptyLi.textContent = i18n.translate(currentLanguage, 'disabledSitesEmpty');
      disabledSitesList.appendChild(emptyLi);
      return;
    }

    var removeLabel = i18n.translate(currentLanguage, 'removeSite');
    disabledSites.forEach(function (site) {
      var li = document.createElement('li');
      var nameSpan = document.createElement('span');
      nameSpan.className = 'site-name';
      nameSpan.textContent = site;

      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'remove-site-btn';
      removeBtn.dataset.site = site;
      removeBtn.setAttribute('aria-label', removeLabel);
      removeBtn.title = removeLabel;
      removeBtn.textContent = '×';

      li.appendChild(nameSpan);
      li.appendChild(removeBtn);
      disabledSitesList.appendChild(li);
    });
  }

  function updateDisabledSites(updated) {
    disabledSites = updated;
    setSetting('disabledSites', disabledSites);
    renderDisabledSitesList();
    if (currentHostname) siteDisableToggle.checked = disabledSites.indexOf(currentHostname) !== -1;
  }

  function normalizeHostInput(value) {
    value = (value || '').trim();
    if (!value) return '';
    if (value.indexOf('://') !== -1) {
      try {
        return new URL(value).hostname.toLowerCase();
      } catch (err) {
        return '';
      }
    }
    return value.split('/')[0].toLowerCase();
  }

  siteDisableToggle.addEventListener('change', function (event) {
    if (!currentHostname) return;
    var updated = disabledSites.slice();
    var index = updated.indexOf(currentHostname);
    if (event.target.checked && index === -1) {
      updated.push(currentHostname);
    } else if (!event.target.checked && index !== -1) {
      updated.splice(index, 1);
    }
    updateDisabledSites(updated);
    if (event.target.checked) {
      showSection(disabledSection);
    } else {
      refreshVideoState();
    }
  });

  function addDisabledSiteFromInput() {
    var host = normalizeHostInput(disabledSiteInput.value);
    if (!host) return;
    disabledSiteInput.value = '';
    if (disabledSites.indexOf(host) !== -1) return;
    // Stay on the settings view; the top toggle picks up the new state the
    // next time this site's row is visible.
    updateDisabledSites(disabledSites.concat([host]));
  }

  addDisabledSiteBtn.addEventListener('click', addDisabledSiteFromInput);

  disabledSiteInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      addDisabledSiteFromInput();
    }
  });

  disabledSitesList.addEventListener('click', function (event) {
    var target = event.target.closest('button[data-site]');
    if (!target) return;
    var host = target.dataset.site;
    var updated = disabledSites.filter(function (site) {
      return site !== host;
    });
    // Stay on the settings view; the video/empty/disabled section underneath
    // resolves itself next time the popup opens (or via the top toggle).
    updateDisabledSites(updated);
  });

  function renderSettingsUI(settings) {
    floatingToggle.checked = settings.floatingEnabled;
    shortcutsToggle.checked = settings.shortcutsEnabled;
    syncAllTabsToggle.checked = settings.syncAllTabs;
    overlayPositionSelect.value = settings.overlayPosition;
    overlayAutoHideToggle.checked = settings.overlayAutoHide;
    customSpeedInput.value = settings.customSpeed;
    keyBindings = settings.keyBindings;
    disabledSites = settings.disabledSites;
    if (currentHostname) siteDisableToggle.checked = disabledSites.indexOf(currentHostname) !== -1;
    renderKeyBindings();
    renderDisabledSitesList();
    applyTranslations(settings.language);
  }

  function showBackupStatus(key) {
    backupStatus.textContent = i18n.translate(currentLanguage, key);
    backupStatus.hidden = false;
    setTimeout(function () {
      backupStatus.hidden = true;
    }, 2500);
  }

  exportBtn.addEventListener('click', function () {
    Promise.all([getSettings(), SpeeVid.storage.getSiteSpeedsMap(), SpeeVid.storage.getGlobalSpeed()]).then(function (results) {
      var backup = { version: 1, settings: results[0], siteSpeeds: results[1], globalSpeed: results[2] };
      var blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'speevid-backup.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });
  });

  importBtn.addEventListener('click', function () {
    importFileInput.click();
  });

  importFileInput.addEventListener('change', function (event) {
    var file = event.target.files[0];
    event.target.value = '';
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch (err) {
        showBackupStatus('importError');
        return;
      }
      SpeeVid.storage.importSettings(parsed).then(function (settings) {
        renderSettingsUI(settings);
        refreshVideoState();
        showBackupStatus('importSuccess');
      });
    };
    reader.onerror = function () {
      showBackupStatus('importError');
    };
    reader.readAsText(file);
  });

  function init() {
    populateLanguageOptions();
    applyTranslations(currentLanguage);

    getSettings().then(renderSettingsUI);

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs[0];
      if (!tab || !tab.id || !tab.url || !/^https?:/.test(tab.url)) {
        showSection(unsupportedSection);
        return;
      }

      activeTabId = tab.id;
      try {
        currentHostname = new URL(tab.url).hostname.toLowerCase();
      } catch (err) {
        currentHostname = null;
      }
      if (currentHostname) {
        siteDisableRow.hidden = false;
        siteDisableToggle.checked = disabledSites.indexOf(currentHostname) !== -1;
      }

      refreshVideoState();
    });
  }

  init();
})();
