(function () {
  'use strict';

  var clampSpeed = SpeeVid.speedUtils.clampSpeed;
  var getSettings = SpeeVid.storage.getSettings;
  var getSiteSpeed = SpeeVid.storage.getSiteSpeed;
  var setSiteSpeed = SpeeVid.storage.setSiteSpeed;
  var onSettingsChanged = SpeeVid.storage.onSettingsChanged;
  var MESSAGE_TYPES = SpeeVid.messages.MESSAGE_TYPES;

  var HOSTNAME = location.hostname || 'local-file';

  var formatSpeed = SpeeVid.speedUtils.formatSpeed;
  var PRESETS = SpeeVid.speedUtils.PRESETS;
  var BADGE_WIDTH = 52;
  var BADGE_HEIGHT = 26;
  var MARGIN = 8;
  var overlays = new Map();
  var rafId = null;

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
    updateAllOverlays();
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
      syncOverlaysWithVideos();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function isEditableTarget(target) {
    if (!target) return false;
    var tag = target.tagName ? target.tagName.toLowerCase() : '';
    return tag === 'input' || tag === 'textarea' || target.isContentEditable;
  }

  function handleKeydown(event) {
    if (!state.shortcutsEnabled) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (isEditableTarget(event.target)) return;
    if (scanVideos().length === 0) return;

    var key = event.key.toLowerCase();
    if (key === 's') {
      setSpeed(state.speed + 0.1);
    } else if (key === 'd') {
      setSpeed(state.speed - 0.1);
    } else if (key === 'a') {
      setSpeed(1);
    }
  }

  function getOverlayTemplate() {
    return (
      '<style>' +
      ':host { all: initial; }' +
      '.root { position: absolute; bottom: 0; right: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; ' +
      '--sv-bg: rgba(28, 28, 32, 0.9); --sv-fg: #f4f4f5; --sv-accent: #7c6cf6; --sv-border: rgba(255, 255, 255, 0.12); }' +
      '@media (prefers-color-scheme: light) { .root { --sv-bg: rgba(255, 255, 255, 0.95); --sv-fg: #1c1c20; --sv-border: rgba(0, 0, 0, 0.08); } }' +
      '.badge { display: flex; align-items: center; justify-content: center; min-width: 52px; height: 26px; padding: 0 8px; border-radius: 999px; background: var(--sv-bg); color: var(--sv-fg); border: 1px solid var(--sv-border); font-size: 12px; font-weight: 600; cursor: default; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25); user-select: none; }' +
      '.panel { display: none; position: absolute; bottom: calc(100% + 8px); right: 0; flex-direction: column; gap: 8px; width: 200px; padding: 12px; border-radius: 14px; background: var(--sv-bg); border: 1px solid var(--sv-border); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3); }' +
      '.root:hover .panel { display: flex; }' +
      '.slider { width: 100%; accent-color: var(--sv-accent); }' +
      '.presets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }' +
      '.presets button { font: inherit; font-size: 11px; padding: 4px 0; border-radius: 8px; border: 1px solid var(--sv-border); background: transparent; color: var(--sv-fg); cursor: pointer; }' +
      '.presets button:hover { background: var(--sv-accent); color: #fff; border-color: var(--sv-accent); }' +
      '</style>' +
      '<div class="root">' +
      '<div class="panel"><input type="range" class="slider" min="0.25" max="3" step="0.05" /><div class="presets"></div></div>' +
      '<div class="badge"></div>' +
      '</div>'
    );
  }

  function createOverlay(video) {
    if (overlays.has(video)) return;

    var host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.zIndex = '2147483647';
    host.style.width = BADGE_WIDTH + 'px';
    host.style.height = BADGE_HEIGHT + 'px';
    host.style.pointerEvents = 'none';
    document.documentElement.appendChild(host);

    var shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = getOverlayTemplate();

    var root = shadow.querySelector('.root');
    root.style.pointerEvents = 'auto';
    var badgeEl = shadow.querySelector('.badge');
    var sliderEl = shadow.querySelector('.slider');
    var presetsEl = shadow.querySelector('.presets');

    presetsEl.innerHTML = PRESETS.map(function (p) {
      return '<button type="button" data-speed="' + p + '">' + formatSpeed(p) + '</button>';
    }).join('');

    badgeEl.textContent = formatSpeed(state.speed);
    sliderEl.value = String(state.speed);

    sliderEl.addEventListener('input', function (event) {
      setSpeed(Number(event.target.value));
    });

    presetsEl.addEventListener('click', function (event) {
      var target = event.target.closest('button[data-speed]');
      if (!target) return;
      setSpeed(Number(target.dataset.speed));
    });

    overlays.set(video, { host: host, badgeEl: badgeEl, sliderEl: sliderEl });
    ensureLoopRunning();
  }

  function destroyOverlay(video) {
    var overlay = overlays.get(video);
    if (!overlay) return;
    overlay.host.remove();
    overlays.delete(video);
  }

  function destroyAllOverlays() {
    overlays.forEach(function (_overlay, video) {
      destroyOverlay(video);
    });
  }

  function updateAllOverlays() {
    overlays.forEach(function (overlay) {
      overlay.badgeEl.textContent = formatSpeed(state.speed);
      overlay.sliderEl.value = String(state.speed);
    });
  }

  function positionOverlays() {
    overlays.forEach(function (overlay, video) {
      if (!video.isConnected) {
        destroyOverlay(video);
        return;
      }
      var rect = video.getBoundingClientRect();
      var visible =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth;
      overlay.host.style.display = visible ? 'block' : 'none';
      if (!visible) return;
      overlay.host.style.top = Math.round(rect.bottom - BADGE_HEIGHT - MARGIN) + 'px';
      overlay.host.style.left = Math.round(rect.right - BADGE_WIDTH - MARGIN) + 'px';
    });
  }

  function loopTick() {
    positionOverlays();
    if (state.floatingEnabled && overlays.size > 0) {
      rafId = requestAnimationFrame(loopTick);
    } else {
      rafId = null;
    }
  }

  function ensureLoopRunning() {
    if (rafId === null && state.floatingEnabled && overlays.size > 0) {
      rafId = requestAnimationFrame(loopTick);
    }
  }

  function syncOverlaysWithVideos() {
    if (!state.floatingEnabled) {
      destroyAllOverlays();
      return;
    }
    var videos = scanVideos();
    videos.forEach(function (video) {
      createOverlay(video);
    });
    overlays.forEach(function (_overlay, video) {
      if (videos.indexOf(video) === -1) destroyOverlay(video);
    });
    ensureLoopRunning();
  }

  function init() {
    Promise.all([getSettings(), getSiteSpeed(HOSTNAME)]).then(function (results) {
      var settings = results[0];
      var siteSpeed = results[1];

      state.floatingEnabled = settings.floatingEnabled;
      state.shortcutsEnabled = settings.shortcutsEnabled;
      state.speed = clampSpeed(siteSpeed);

      applySpeedToAllVideos();
      syncOverlaysWithVideos();
      observeNewVideos();

      chrome.runtime.onMessage.addListener(handleMessage);
      document.addEventListener('keydown', handleKeydown, true);
      onSettingsChanged(function (changed) {
        if (typeof changed.floatingEnabled === 'boolean') {
          state.floatingEnabled = changed.floatingEnabled;
          syncOverlaysWithVideos();
        }
        if (typeof changed.shortcutsEnabled === 'boolean') {
          state.shortcutsEnabled = changed.shortcutsEnabled;
        }
      });
    });
  }

  init();
})();
