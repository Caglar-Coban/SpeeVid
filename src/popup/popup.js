(function () {
  'use strict';

  var PRESETS = SpeeVid.speedUtils.PRESETS;
  var formatSpeed = SpeeVid.speedUtils.formatSpeed;
  var formatDuration = SpeeVid.speedUtils.formatDuration;
  var clampSpeed = SpeeVid.speedUtils.clampSpeed;
  var getSettings = SpeeVid.storage.getSettings;
  var setSetting = SpeeVid.storage.setSetting;
  var hostMatchesAny = SpeeVid.storageHelpers.hostMatchesAny;
  var hostMatchesPattern = SpeeVid.storageHelpers.hostMatchesPattern;
  var MESSAGE_TYPES = SpeeVid.messages.MESSAGE_TYPES;
  var i18n = SpeeVid.i18n;
  var theme = SpeeVid.theme;

  var videoSection = document.getElementById('videoSection');
  var emptySection = document.getElementById('emptySection');
  var unsupportedSection = document.getElementById('unsupportedSection');
  var reloadSection = document.getElementById('reloadSection');
  var reloadBtn = document.getElementById('reloadBtn');
  var disabledSection = document.getElementById('disabledSection');
  var settingsSection = document.getElementById('settingsSection');
  var speedValueEl = document.getElementById('speedValue');
  var speedSlider = document.getElementById('speedSlider');
  var presetsEl = document.getElementById('presets');
  var pinSpeedToggle = document.getElementById('pinSpeedToggle');
  var pinnedSpeedsList = document.getElementById('pinnedSpeedsList');
  var floatingToggle = document.getElementById('floatingToggle');
  var shortcutsToggle = document.getElementById('shortcutsToggle');
  var syncAllTabsToggle = document.getElementById('syncAllTabsToggle');
  var appFooter = document.getElementById('appFooter');
  var settingsBtn = document.getElementById('settingsBtn');
  var backBtn = document.getElementById('backBtn');
  var languageSelect = document.getElementById('languageSelect');
  var overlayPositionSelect = document.getElementById('overlayPositionSelect');
  var overlayAutoHideToggle = document.getElementById('overlayAutoHideToggle');
  var autoSpeedByDurationToggle = document.getElementById('autoSpeedByDurationToggle');
  var autoSpeedThresholdInput = document.getElementById('autoSpeedThresholdInput');
  var autoSpeedShortInput = document.getElementById('autoSpeedShortInput');
  var autoSpeedLongInput = document.getElementById('autoSpeedLongInput');
  var autoSpeedConflictNotice = document.getElementById('autoSpeedConflictNotice');
  var syncAllTabsConflictNotice = document.getElementById('syncAllTabsConflictNotice');
  var themeButtons = Array.prototype.slice.call(document.querySelectorAll('.theme-btn'));
  var accentPresetsEl = document.getElementById('accentPresets');
  var accentColorInput = document.getElementById('accentColorInput');
  var preservePitchToggle = document.getElementById('preservePitchToggle');
  var aggressiveModeToggle = document.getElementById('aggressiveModeToggle');
  var trackTimeSavedToggle = document.getElementById('trackTimeSavedToggle');
  var controlAudioToggle = document.getElementById('controlAudioToggle');
  var timeSavedValueEl = document.getElementById('timeSavedValue');
  var resetTimeSavedBtn = document.getElementById('resetTimeSavedBtn');
  var customSpeedInput = document.getElementById('customSpeedInput');
  var siteDisableRow = document.getElementById('siteDisableRow');
  var siteDisableToggle = document.getElementById('siteDisableToggle');
  var siteRuleNotice = document.getElementById('siteRuleNotice');
  var disabledSiteInput = document.getElementById('disabledSiteInput');
  var addDisabledSiteBtn = document.getElementById('addDisabledSiteBtn');
  var disabledSitesList = document.getElementById('disabledSitesList');
  var disabledSiteError = document.getElementById('disabledSiteError');
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

  var ALL_SECTIONS = [videoSection, emptySection, unsupportedSection, reloadSection, disabledSection, settingsSection];

  // Briefly reveals a status/notice element, then hides it again.
  function flashNotice(el, durationMs) {
    el.hidden = false;
    setTimeout(function () {
      el.hidden = true;
    }, durationMs === undefined ? 2500 : durationMs);
  }

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

  function renderSpeed(speed, skipSlider) {
    var clamped = clampSpeed(speed);
    speedValueEl.textContent = formatSpeed(clamped);
    // Skipped while the user is mid-drag: this response is async, and
    // stomping speedSlider.value while their pointer is still moving it
    // makes the thumb visibly jump/fight the drag.
    if (!skipSlider) speedSlider.value = String(clamped);
    renderPresets(clamped);
  }

  function sendSpeed(speed) {
    if (activeTabId === null) return;
    // Broadcast untargeted so embedded players (e.g. a YouTube iframe on
    // this page) still apply the speed too — but ignore this call's own
    // response. Without a frameId, Chrome resolves the callback from
    // whichever frame answers first, which can be that same unrelated
    // iframe instead of the actual page; trusting it here previously let a
    // stray response get displayed, and — worse — persisted as this site's
    // pinned speed if "pin" was checked.
    chrome.tabs.sendMessage(activeTabId, { type: MESSAGE_TYPES.SET_SPEED, speed: speed }, function () {
      void chrome.runtime.lastError;
    });
    // Same targeting GET_STATE already uses, for the one response this
    // function actually trusts.
    chrome.tabs.sendMessage(activeTabId, { type: MESSAGE_TYPES.SET_SPEED, speed: speed }, { frameId: 0 }, function (response) {
      if (chrome.runtime.lastError) return;
      if (response) {
        renderSpeed(response.speed, document.activeElement === speedSlider);
        // Pin is "sticky": adjusting the speed while pinned updates the lock
        // to match, rather than leaving it pointing at a stale value.
        if (pinSpeedToggle.checked && currentHostname) {
          SpeeVid.storage.setPinnedSpeed(currentHostname, response.speed).then(refreshPinnedSpeedsList);
        }
      }
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
    // "Apply to all tabs" broadcasts one speed everywhere; auto speed by
    // video length decides a different speed per video based on its own
    // duration. They can't both be meaningfully active — leaving both on
    // used to leave auto speed silently overridden with no visible
    // explanation, so make the clash impossible instead of just
    // documenting it deep in content.js's priority order.
    if (event.target.checked && autoSpeedByDurationToggle.checked) {
      autoSpeedByDurationToggle.checked = false;
      setSetting('autoSpeedByDuration', false);
      flashNotice(syncAllTabsConflictNotice, 4000);
    }
  });

  overlayPositionSelect.addEventListener('change', function (event) {
    setSetting('overlayPosition', event.target.value);
  });

  overlayAutoHideToggle.addEventListener('change', function (event) {
    setSetting('overlayAutoHide', event.target.checked);
  });

  // "auto" removes the attribute entirely rather than setting it to an empty
  // string, so popup.css's plain :root + prefers-color-scheme rules apply
  // exactly as if theming had never been touched.
  function applyTheme(value) {
    if (value === 'auto') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.dataset.theme = value;
    }
    themeButtons.forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.theme === value);
    });
  }

  themeButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      applyTheme(btn.dataset.theme);
      setSetting('theme', btn.dataset.theme);
    });
  });

  function renderAccentPresets() {
    accentPresetsEl.innerHTML = theme.ACCENT_PRESETS.map(function (color) {
      return '<button type="button" class="accent-swatch" data-color="' + color + '" style="background:' + color + '"></button>';
    }).join('');
  }

  function applyAccentColor(hex) {
    document.documentElement.style.setProperty('--sv-accent', hex);
    document.documentElement.style.setProperty('--sv-accent-fg', theme.getAccentForeground(hex));
    document.documentElement.style.setProperty('--sv-accent-halo', theme.getAccentHalo(hex));
    accentColorInput.value = hex;
    Array.prototype.slice.call(accentPresetsEl.querySelectorAll('.accent-swatch')).forEach(function (swatch) {
      swatch.classList.toggle('active', swatch.dataset.color === hex);
    });
  }

  renderAccentPresets();

  accentPresetsEl.addEventListener('click', function (event) {
    var target = event.target.closest('button[data-color]');
    if (!target) return;
    applyAccentColor(target.dataset.color);
    setSetting('accentColor', target.dataset.color);
  });

  // Preview live while the picker is being dragged, but only save once the
  // color is chosen: saving on every 'input' tick blew through
  // storage.sync's write quota (~120/minute) and made every open tab rebuild
  // its overlay on each tick.
  accentColorInput.addEventListener('input', function (event) {
    applyAccentColor(event.target.value);
  });

  accentColorInput.addEventListener('change', function (event) {
    applyAccentColor(event.target.value);
    setSetting('accentColor', event.target.value);
  });

  preservePitchToggle.addEventListener('change', function (event) {
    setSetting('preservePitch', event.target.checked);
  });

  aggressiveModeToggle.addEventListener('change', function (event) {
    setSetting('aggressiveMode', event.target.checked);
  });

  trackTimeSavedToggle.addEventListener('change', function (event) {
    setSetting('trackTimeSaved', event.target.checked);
  });

  controlAudioToggle.addEventListener('change', function (event) {
    setSetting('controlAudio', event.target.checked);
  });

  customSpeedInput.addEventListener('change', function (event) {
    var clamped = clampSpeed(Number(event.target.value));
    customSpeedInput.value = String(clamped);
    setSetting('customSpeed', clamped);
  });

  autoSpeedByDurationToggle.addEventListener('change', function (event) {
    setSetting('autoSpeedByDuration', event.target.checked);
    // See the matching comment on syncAllTabsToggle's handler — same
    // conflict, opposite direction.
    if (event.target.checked && syncAllTabsToggle.checked) {
      syncAllTabsToggle.checked = false;
      setSetting('syncAllTabs', false);
      flashNotice(autoSpeedConflictNotice, 4000);
    }
  });

  autoSpeedThresholdInput.addEventListener('change', function (event) {
    // Reuses the exact same clamp the backup-import path applies
    // (mergeAutoSpeedThresholdMinutes), rather than a hand-rolled copy —
    // a hand-rolled `|| DEFAULT` fallback here previously treated a typed
    // "0" as falsy and silently saved 20 instead of clamping it to 1 like
    // every other path did, which was one value producing two different
    // persisted results depending on which code touched it.
    var clamped = SpeeVid.storageHelpers.mergeAutoSpeedThresholdMinutes(Number(event.target.value));
    autoSpeedThresholdInput.value = String(clamped);
    setSetting('autoSpeedThresholdMinutes', clamped);
  });

  autoSpeedShortInput.addEventListener('change', function (event) {
    var clamped = clampSpeed(Number(event.target.value));
    autoSpeedShortInput.value = String(clamped);
    setSetting('autoSpeedShortSpeed', clamped);
  });

  autoSpeedLongInput.addEventListener('change', function (event) {
    var clamped = clampSpeed(Number(event.target.value));
    autoSpeedLongInput.value = String(clamped);
    setSetting('autoSpeedLongSpeed', clamped);
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
    var key = SpeeVid.storageHelpers.bindingKeyFromEvent(event);
    if (key === 'escape') {
      stopListening();
      return;
    }
    if (BLOCKED_KEYS.indexOf(key) !== -1) return;

    var action = listeningAction;
    var updated = Object.assign({}, keyBindings);
    // Two actions on one key left the second one dead (content.js checks
    // them in a fixed order), so the action that had this key takes over
    // the one being rebound's old key instead.
    Object.keys(updated).forEach(function (other) {
      if (other !== action && updated[other] === key) updated[other] = keyBindings[action];
    });
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
        // init() already filtered out non-http(s) URLs into unsupportedSection.
        // A getMessage failure here, on an http(s) page, almost always means
        // the content script simply isn't injected yet — the tab was already
        // open when SpeeVid was installed or updated. Reloading fixes it, so
        // say that instead of implying the page can never work.
        showSection(reloadSection);
        return;
      }
      // Decided from the popup's own copy of the list, not response.disabled:
      // right after the toggle changes, the page hasn't necessarily received
      // the storage change yet and still answers with the old state — which
      // left the popup saying "disabled" after the user had just re-enabled.
      if (isCurrentSiteDisabled()) {
        showSection(disabledSection);
        return;
      }
      if (response.videoCount > 0) {
        showVideoControls(response.speed);
        return;
      }
      // The top frame has no media, but the player may be an iframe from
      // another domain (embeds, most streaming sites). Ask every frame; only
      // one that has media answers.
      chrome.tabs.sendMessage(activeTabId, { type: MESSAGE_TYPES.GET_STATE, onlyWithMedia: true }, function (frameResponse) {
        if (chrome.runtime.lastError || !frameResponse) {
          showSection(emptySection);
          return;
        }
        showVideoControls(frameResponse.speed);
      });
    });
  }

  function isCurrentSiteDisabled() {
    return !!currentHostname && hostMatchesAny(currentHostname, disabledSites);
  }

  function showVideoControls(speed) {
    showSection(videoSection);
    renderSpeed(speed);
    if (currentHostname) {
      SpeeVid.storage.getPinnedSpeed(currentHostname).then(function (pinned) {
        pinSpeedToggle.checked = pinned !== null;
      });
    }
  }

  reloadBtn.addEventListener('click', function () {
    if (activeTabId === null) return;
    chrome.tabs.reload(activeTabId);
    window.close();
  });

  pinSpeedToggle.addEventListener('change', function (event) {
    if (!currentHostname) return;
    if (event.target.checked) {
      SpeeVid.storage.setPinnedSpeed(currentHostname, clampSpeed(Number(speedSlider.value))).then(refreshPinnedSpeedsList);
    } else {
      SpeeVid.storage.removePinnedSpeed(currentHostname).then(refreshPinnedSpeedsList);
    }
  });

  // Built with DOM APIs rather than innerHTML string interpolation: site
  // names can come from an imported backup file, so they're untrusted input
  // and must never be parsed as markup.
  function renderPinnedSpeedsList(map) {
    pinnedSpeedsList.innerHTML = '';
    var hosts = Object.keys(map).sort();

    if (hosts.length === 0) {
      var emptyLi = document.createElement('li');
      emptyLi.className = 'disabled-sites-empty';
      emptyLi.textContent = i18n.translate(currentLanguage, 'pinnedSpeedsEmpty');
      pinnedSpeedsList.appendChild(emptyLi);
      return;
    }

    var removeLabel = i18n.translate(currentLanguage, 'removeSite');
    hosts.forEach(function (host) {
      var li = document.createElement('li');
      var nameSpan = document.createElement('span');
      nameSpan.className = 'site-name';
      nameSpan.textContent = host + ' — ' + formatSpeed(map[host]);

      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'remove-site-btn';
      removeBtn.dataset.site = host;
      removeBtn.setAttribute('aria-label', removeLabel);
      removeBtn.title = removeLabel;
      removeBtn.textContent = '×';

      li.appendChild(nameSpan);
      li.appendChild(removeBtn);
      pinnedSpeedsList.appendChild(li);
    });
  }

  function refreshPinnedSpeedsList() {
    return SpeeVid.storage.getPinnedSpeedsMap().then(renderPinnedSpeedsList);
  }

  pinnedSpeedsList.addEventListener('click', function (event) {
    var target = event.target.closest('button[data-site]');
    if (!target) return;
    var host = target.dataset.site;
    SpeeVid.storage.removePinnedSpeed(host).then(function () {
      refreshPinnedSpeedsList();
      if (host === currentHostname) pinSpeedToggle.checked = false;
    });
  });

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
    var saved = setSetting('disabledSites', disabledSites);
    renderDisabledSitesList();
    if (currentHostname) siteDisableToggle.checked = hostMatchesAny(currentHostname, disabledSites);
    return saved;
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
    var updated;
    var removedRules = [];
    if (event.target.checked) {
      updated = disabledSites.indexOf(currentHostname) === -1 ? disabledSites.concat([currentHostname]) : disabledSites.slice();
    } else {
      // Unticking means "run on this page". When a wildcard such as
      // "*.example.com" is what disables it, removing only the exact host
      // changed nothing and the box ticked itself again — the switch looked
      // broken. So every rule covering this host goes, and the user is told
      // which wider rule went with it.
      updated = disabledSites.filter(function (site) {
        var covers = hostMatchesPattern(currentHostname, site);
        if (covers && site !== currentHostname) removedRules.push(site);
        return !covers;
      });
    }
    var saved = updateDisabledSites(updated);
    if (removedRules.length > 0) {
      siteRuleNotice.textContent = i18n.translate(currentLanguage, 'siteRuleRemoved').replace('{rule}', removedRules.join(', '));
      flashNotice(siteRuleNotice, 5000);
    }
    if (event.target.checked) {
      showSection(disabledSection);
    } else {
      saved.then(refreshVideoState);
    }
  });

  function flashDisabledSiteError() {
    flashNotice(disabledSiteError);
  }

  function addDisabledSiteFromInput() {
    var host = normalizeHostInput(disabledSiteInput.value);
    if (!host) return;
    // Reject anything mergeDisabledSites would silently drop on the next
    // settings load anyway (e.g. "*evil.com" with no dot after the `*`) —
    // without this, it looked "added" in this session, matched nothing the
    // whole time, and then vanished with zero explanation next time
    // settings were read.
    if (!SpeeVid.storageHelpers.isValidSitePattern(host)) {
      flashDisabledSiteError();
      return;
    }
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
    // Translate first: renderDisabledSitesList()/renderPinnedSpeedsList()
    // read `currentLanguage` directly (their list items aren't [data-i18n]
    // elements applyTranslations() can re-visit later), so it must already
    // be correct before they run.
    applyTranslations(settings.language);
    floatingToggle.checked = settings.floatingEnabled;
    shortcutsToggle.checked = settings.shortcutsEnabled;
    syncAllTabsToggle.checked = settings.syncAllTabs;
    overlayPositionSelect.value = settings.overlayPosition;
    overlayAutoHideToggle.checked = settings.overlayAutoHide;
    preservePitchToggle.checked = settings.preservePitch;
    aggressiveModeToggle.checked = settings.aggressiveMode;
    trackTimeSavedToggle.checked = settings.trackTimeSaved;
    controlAudioToggle.checked = settings.controlAudio;
    applyTheme(settings.theme);
    applyAccentColor(settings.accentColor);
    autoSpeedByDurationToggle.checked = settings.autoSpeedByDuration;
    autoSpeedThresholdInput.value = settings.autoSpeedThresholdMinutes;
    autoSpeedShortInput.value = settings.autoSpeedShortSpeed;
    autoSpeedLongInput.value = settings.autoSpeedLongSpeed;
    // A pre-existing conflict from before these two were mutually
    // exclusive (both could be turned on independently, and "apply to all
    // tabs" silently overrode auto speed with no explanation — the actual
    // bug report that led here). Resolve it the same direction the live
    // toggle handlers below do: auto speed by duration wins.
    if (settings.autoSpeedByDuration && settings.syncAllTabs) {
      syncAllTabsToggle.checked = false;
      setSetting('syncAllTabs', false);
      flashNotice(syncAllTabsConflictNotice, 4000);
    }
    customSpeedInput.value = settings.customSpeed;
    keyBindings = settings.keyBindings;
    disabledSites = settings.disabledSites;
    if (currentHostname) siteDisableToggle.checked = hostMatchesAny(currentHostname, disabledSites);
    renderKeyBindings();
    renderDisabledSitesList();
    refreshPinnedSpeedsList();
    refreshTimeSaved();
  }

  function renderTimeSaved(totalSeconds) {
    if (totalSeconds < 60) {
      timeSavedValueEl.textContent = i18n.translate(currentLanguage, 'timeSavedNone');
      return;
    }
    var duration = formatDuration(totalSeconds);
    var parts = [];
    if (duration.hours > 0) parts.push(duration.hours + i18n.translate(currentLanguage, 'unitHours'));
    parts.push(duration.minutes + i18n.translate(currentLanguage, 'unitMinutes'));
    timeSavedValueEl.textContent = i18n.translate(currentLanguage, 'timeSavedLabel') + ': ' + parts.join(' ');
  }

  function refreshTimeSaved() {
    return SpeeVid.storage.getTimeSaved().then(renderTimeSaved);
  }

  resetTimeSavedBtn.addEventListener('click', function () {
    SpeeVid.storage.resetTimeSaved().then(refreshTimeSaved);
  });

  function showBackupStatus(key) {
    backupStatus.textContent = i18n.translate(currentLanguage, key);
    backupStatus.hidden = false;
    setTimeout(function () {
      backupStatus.hidden = true;
    }, 2500);
  }

  exportBtn.addEventListener('click', function () {
    Promise.all([
      getSettings(),
      SpeeVid.storage.getSiteSpeedsMap(),
      SpeeVid.storage.getGlobalSpeed(),
      SpeeVid.storage.getPinnedSpeedsMap(),
      SpeeVid.storage.getTimeSaved(),
    ]).then(function (results) {
      var backup = {
        version: 1,
        settings: results[0],
        siteSpeeds: results[1],
        globalSpeed: results[2],
        pinnedSpeeds: results[3],
        timeSavedSeconds: results[4],
      };
      var blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'speevid-backup.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoking in the same tick can cancel the download before the browser
      // has read the blob (seen in Firefox).
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
    });
  });

  // Firefox closes the toolbar popup as soon as the file picker opens, and
  // the chosen file is lost with it. There the import runs from this same
  // page opened in a normal tab (see IMPORT_TAB_MODE in init()).
  var IS_FIREFOX = chrome.runtime.getURL('').indexOf('moz-extension://') === 0;
  var IMPORT_TAB_MODE = location.hash === '#import';

  importBtn.addEventListener('click', function () {
    if (IS_FIREFOX && !IMPORT_TAB_MODE) {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/popup.html#import') });
      window.close();
      return;
    }
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
      SpeeVid.storage.importSettings(parsed)
        .then(function (settings) {
          renderSettingsUI(settings);
          refreshVideoState();
          showBackupStatus('importSuccess');
        })
        .catch(function () {
          showBackupStatus('importError');
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

    // refreshVideoState() decides "disabled" from the loaded list, so it
    // must not run before the settings are in.
    var settingsReady = getSettings().then(renderSettingsUI);

    if (IMPORT_TAB_MODE) {
      settingsReady.then(function () {
        showSection(unsupportedSection);
        showSection(settingsSection);
      });
      return;
    }

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
        siteDisableToggle.checked = hostMatchesAny(currentHostname, disabledSites);
      }

      settingsReady.then(refreshVideoState);
    });
  }

  init();
})();
