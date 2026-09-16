(function () {
  'use strict';

  var clampSpeed = SpeeVid.speedUtils.clampSpeed;
  var getSettings = SpeeVid.storage.getSettings;
  var getSiteSpeed = SpeeVid.storage.getSiteSpeed;
  var setSiteSpeed = SpeeVid.storage.setSiteSpeed;
  var getGlobalSpeed = SpeeVid.storage.getGlobalSpeed;
  var setGlobalSpeed = SpeeVid.storage.setGlobalSpeed;
  var onGlobalSpeedChanged = SpeeVid.storage.onGlobalSpeedChanged;
  var onSettingsChanged = SpeeVid.storage.onSettingsChanged;
  var MESSAGE_TYPES = SpeeVid.messages.MESSAGE_TYPES;

  var HOSTNAME = location.hostname || 'local-file';
  // Only the top frame should speak for the tab's toolbar badge — otherwise
  // an unrelated ad iframe with its own <video> could overwrite it.
  var IS_TOP_FRAME = window.top === window.self;

  var formatSpeed = SpeeVid.speedUtils.formatSpeed;
  var PRESETS = SpeeVid.speedUtils.PRESETS;
  var BADGE_WIDTH = 52;
  var BADGE_HEIGHT = 26;
  var MARGIN = 8;
  var AUTO_HIDE_DELAY_MS = 1500;
  var overlays = new Map();
  var rafId = null;
  var PERSIST_DEBOUNCE_MS = 300;
  var persistTimer = null;
  var boundVideos = new WeakSet();
  // Ephemeral (not persisted): remembers the speed a reset/custom-speed jump
  // came from, so pressing that same key again while already at its target
  // toggles back instead of doing nothing.
  var preJumpSpeed = 1;

  var state = {
    speed: 1,
    floatingEnabled: true,
    shortcutsEnabled: true,
    keyBindings: { increase: 's', decrease: 'd', reset: 'a', custom: 'q' },
    customSpeed: 2,
    syncAllTabs: false,
    disabled: false,
    overlayPosition: 'bottom-right',
    overlayAutoHide: false,
  };

  function sendBadgeUpdate() {
    if (!IS_TOP_FRAME) return;
    var text = !state.disabled && state.speed !== 1 ? formatSpeed(state.speed).replace('x', '') : '';
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.SPEED_CHANGED, text: text }, function () {
      void chrome.runtime.lastError;
    });
  }

  function scanVideos() {
    return Array.prototype.slice.call(document.querySelectorAll('video'));
  }

  // Sites often reset playbackRate to 1 themselves when a new source loads
  // into an existing <video> element (e.g. autoplay/next-episode on an SPA,
  // which reuses the element so our mutation observer never fires). Watching
  // these events lets us reassert our speed instead of silently losing it.
  function bindVideo(video) {
    if (boundVideos.has(video)) return;
    boundVideos.add(video);
    ['loadedmetadata', 'playing', 'ratechange'].forEach(function (evt) {
      video.addEventListener(evt, function () {
        if (video.playbackRate !== state.speed) {
          video.playbackRate = state.speed;
        }
      });
    });
  }

  function applySpeedToAllVideos() {
    if (state.disabled) return;
    scanVideos().forEach(function (video) {
      bindVideo(video);
      video.playbackRate = state.speed;
    });
  }

  function schedulePersist() {
    if (persistTimer !== null) clearTimeout(persistTimer);
    persistTimer = setTimeout(function () {
      persistTimer = null;
      // Never persist a speed for a frame that has no video of its own
      // (e.g. an unrelated ad iframe that received the SET_SPEED broadcast).
      if (scanVideos().length === 0) return;
      setSiteSpeed(HOSTNAME, state.speed);
      if (state.syncAllTabs) setGlobalSpeed(state.speed);
    }, PERSIST_DEBOUNCE_MS);
  }

  function setSpeed(rawSpeed, persist) {
    if (persist === undefined) persist = true;
    state.speed = clampSpeed(rawSpeed);
    applySpeedToAllVideos();
    updateAllOverlays();
    sendBadgeUpdate();
    if (persist) {
      schedulePersist();
    }
  }

  function handleMessage(message, _sender, sendResponse) {
    if (message.type === MESSAGE_TYPES.GET_STATE) {
      sendResponse({
        speed: state.speed,
        videoCount: scanVideos().length,
        floatingEnabled: state.floatingEnabled,
        disabled: state.disabled,
      });
      return false;
    }
    if (message.type === MESSAGE_TYPES.SET_SPEED) {
      if (!state.disabled) setSpeed(message.speed);
      sendResponse({ speed: state.speed });
      return false;
    }
    return false;
  }

  function nodeListHasVideo(nodes) {
    if (!nodes) return false;
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (!node || node.nodeType !== 1) continue;
      if (node.tagName === 'VIDEO') return true;
      if (node.querySelector && node.querySelector('video')) return true;
    }
    return false;
  }

  function mutationsTouchVideo(mutations) {
    for (var i = 0; i < mutations.length; i += 1) {
      var mutation = mutations[i];
      if (nodeListHasVideo(mutation.addedNodes)) return true;
      if (nodeListHasVideo(mutation.removedNodes)) return true;
    }
    return false;
  }

  function observeNewVideos() {
    var observer = new MutationObserver(function (mutations) {
      // The observer only watches childList/subtree, so only added/removed
      // nodes can ever change the set of videos. Skip everything else.
      if (!mutationsTouchVideo(mutations)) return;
      applySpeedToAllVideos();
      syncOverlaysWithVideos();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function isEditableTarget(target) {
    if (!target) return false;
    var tag = target.tagName ? target.tagName.toLowerCase() : '';
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  }

  function getRealTarget(event) {
    // Events crossing a shadow boundary are retargeted to the host at the
    // document level, so composedPath()[0] is the actual focused element.
    if (typeof event.composedPath === 'function') {
      var path = event.composedPath();
      if (path && path.length > 0) return path[0];
    }
    return event.target;
  }

  // Pressing a reset/custom-speed key while already at that exact speed
  // toggles back to whatever speed preceded the last jump, instead of
  // being a no-op.
  function jumpToSpeed(target) {
    if (state.speed === target) {
      setSpeed(preJumpSpeed);
    } else {
      preJumpSpeed = state.speed;
      setSpeed(target);
    }
  }

  function handleKeydown(event) {
    if (state.disabled) return;
    if (!state.shortcutsEnabled) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (isEditableTarget(getRealTarget(event))) return;
    if (scanVideos().length === 0) return;

    var key = event.key.toLowerCase();
    var bindings = state.keyBindings;
    if (key === bindings.increase) {
      setSpeed(state.speed + 0.1);
    } else if (key === bindings.decrease) {
      setSpeed(state.speed - 0.1);
    } else if (key === bindings.reset) {
      jumpToSpeed(1);
    } else if (key === bindings.custom) {
      jumpToSpeed(state.customSpeed);
    }
  }

  // `.panel` sits flush against `.badge` (opening away from whichever edge
  // the badge is pinned to) and creates the visual 8px offset with its own
  // transparent padding, so the cursor never crosses a non-hovered gap on
  // its way from the badge to the panel.
  function getOverlayTemplate(position) {
    var vertical = position.indexOf('top') === 0 ? 'top' : 'bottom';
    var horizontal = position.indexOf('right') !== -1 ? 'right' : 'left';
    var panelOpen = vertical === 'bottom' ? 'bottom: 100%; padding-bottom: 8px;' : 'top: 100%; padding-top: 8px;';
    return (
      '<style>' +
      ':host { all: initial; }' +
      '.root { position: absolute; ' + vertical + ': 0; ' + horizontal + ': 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; ' +
      'opacity: 1; transition: opacity 0.25s ease; ' +
      '--sv-bg: rgba(28, 28, 32, 0.9); --sv-fg: #f4f4f5; --sv-accent: #7c6cf6; --sv-border: rgba(255, 255, 255, 0.12); }' +
      '.root.idle { opacity: 0; }' +
      '@media (prefers-color-scheme: light) { .root { --sv-bg: rgba(255, 255, 255, 0.95); --sv-fg: #1c1c20; --sv-border: rgba(0, 0, 0, 0.08); } }' +
      '.badge { display: flex; align-items: center; justify-content: center; min-width: 52px; height: 26px; padding: 0 8px; border-radius: 999px; background: var(--sv-bg); color: var(--sv-fg); border: 1px solid var(--sv-border); font-size: 12px; font-weight: 600; cursor: default; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25); user-select: none; }' +
      '.panel { display: none; position: absolute; ' + panelOpen + ' ' + horizontal + ': 0; flex-direction: column; }' +
      '.panel-inner { display: flex; flex-direction: column; gap: 8px; width: 200px; padding: 12px; border-radius: 14px; background: var(--sv-bg); border: 1px solid var(--sv-border); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3); }' +
      '.root:hover .panel { display: flex; }' +
      '.slider { width: 100%; accent-color: var(--sv-accent); }' +
      '.presets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }' +
      '.presets button { font: inherit; font-size: 11px; padding: 4px 0; border-radius: 8px; border: 1px solid var(--sv-border); background: transparent; color: var(--sv-fg); cursor: pointer; }' +
      '.presets button:hover { background: var(--sv-accent); color: #fff; border-color: var(--sv-accent); }' +
      '</style>' +
      '<div class="root">' +
      '<div class="panel"><div class="panel-inner"><input type="range" class="slider" min="0.25" max="16" step="0.05" /><div class="presets"></div></div></div>' +
      '<div class="badge"></div>' +
      '</div>'
    );
  }

  // Fullscreen content renders in its own layer above the rest of the
  // document, so overlays must live inside the fullscreen element to be seen.
  function getOverlayParent() {
    var fsEl = document.fullscreenElement;
    // A bare <video> cannot render child elements, so fall back to the root.
    if (fsEl && fsEl.tagName !== 'VIDEO') return fsEl;
    return document.documentElement;
  }

  function handleFullscreenChange() {
    var parent = getOverlayParent();
    overlays.forEach(function (overlay) {
      // Re-appending an existing node moves it; it does not clone it.
      parent.appendChild(overlay.host);
    });
  }

  // Reveals an overlay and (re)starts its auto-hide countdown. Called on
  // creation and on every speed change, so a keyboard shortcut always
  // flashes the badge even if "auto-hide" had faded it out.
  function showOverlay(overlay) {
    overlay.root.classList.remove('idle');
    scheduleHide(overlay);
  }

  function scheduleHide(overlay) {
    if (overlay.hideTimer !== null) {
      clearTimeout(overlay.hideTimer);
      overlay.hideTimer = null;
    }
    if (!state.overlayAutoHide || overlay.hovering) return;
    overlay.hideTimer = setTimeout(function () {
      overlay.hideTimer = null;
      overlay.root.classList.add('idle');
    }, AUTO_HIDE_DELAY_MS);
  }

  function createOverlay(video) {
    if (overlays.has(video)) return;

    var host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.zIndex = '2147483647';
    host.style.width = BADGE_WIDTH + 'px';
    host.style.height = BADGE_HEIGHT + 'px';
    host.style.pointerEvents = 'none';
    getOverlayParent().appendChild(host);

    var shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = getOverlayTemplate(state.overlayPosition);

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

    var overlay = { host: host, root: root, badgeEl: badgeEl, sliderEl: sliderEl, hideTimer: null, hovering: false };
    root.addEventListener('mouseenter', function () {
      overlay.hovering = true;
      showOverlay(overlay);
    });
    root.addEventListener('mouseleave', function () {
      overlay.hovering = false;
      scheduleHide(overlay);
    });

    overlays.set(video, overlay);
    ensureLoopRunning();
    showOverlay(overlay);
  }

  function destroyOverlay(video) {
    var overlay = overlays.get(video);
    if (!overlay) return;
    if (overlay.hideTimer !== null) clearTimeout(overlay.hideTimer);
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
      showOverlay(overlay);
    });
  }

  function positionOverlays() {
    var vertical = state.overlayPosition.indexOf('top') === 0 ? 'top' : 'bottom';
    var horizontal = state.overlayPosition.indexOf('right') !== -1 ? 'right' : 'left';
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
      overlay.host.style.top = Math.round(vertical === 'top' ? rect.top + MARGIN : rect.bottom - BADGE_HEIGHT - MARGIN) + 'px';
      overlay.host.style.left = Math.round(horizontal === 'left' ? rect.left + MARGIN : rect.right - BADGE_WIDTH - MARGIN) + 'px';
    });
  }

  function loopTick() {
    // Skip layout reads while the tab is hidden, but keep the loop scheduled
    // so it resumes on its own once the tab becomes visible again.
    if (!document.hidden) {
      positionOverlays();
    }
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
    if (state.disabled || !state.floatingEnabled) {
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
    Promise.all([getSettings(), getSiteSpeed(HOSTNAME), getGlobalSpeed()])
      .then(function (results) {
        var settings = results[0];
        var siteSpeed = results[1];
        var globalSpeed = results[2];

        state.floatingEnabled = settings.floatingEnabled;
        state.shortcutsEnabled = settings.shortcutsEnabled;
        state.keyBindings = settings.keyBindings;
        state.customSpeed = settings.customSpeed;
        state.syncAllTabs = settings.syncAllTabs;
        state.disabled = settings.disabledSites.indexOf(HOSTNAME) !== -1;
        state.overlayPosition = settings.overlayPosition;
        state.overlayAutoHide = settings.overlayAutoHide;
        state.speed = clampSpeed(state.syncAllTabs ? globalSpeed : siteSpeed);

        applySpeedToAllVideos();
        syncOverlaysWithVideos();
        observeNewVideos();
        sendBadgeUpdate();

        onSettingsChanged(function (changed) {
          if (typeof changed.floatingEnabled === 'boolean') {
            state.floatingEnabled = changed.floatingEnabled;
            syncOverlaysWithVideos();
          }
          if (typeof changed.shortcutsEnabled === 'boolean') {
            state.shortcutsEnabled = changed.shortcutsEnabled;
          }
          if (changed.keyBindings && typeof changed.keyBindings === 'object') {
            state.keyBindings = changed.keyBindings;
          }
          if (typeof changed.customSpeed === 'number') {
            state.customSpeed = changed.customSpeed;
          }
          if (typeof changed.syncAllTabs === 'boolean') {
            state.syncAllTabs = changed.syncAllTabs;
          }
          if (typeof changed.overlayPosition === 'string') {
            state.overlayPosition = changed.overlayPosition;
            // The corner is baked into each overlay's shadow-DOM CSS at
            // creation time, so a position change needs a full rebuild.
            destroyAllOverlays();
            syncOverlaysWithVideos();
          }
          if (typeof changed.overlayAutoHide === 'boolean') {
            state.overlayAutoHide = changed.overlayAutoHide;
            overlays.forEach(function (overlay) {
              showOverlay(overlay);
            });
          }
          if (Array.isArray(changed.disabledSites)) {
            var wasDisabled = state.disabled;
            state.disabled = changed.disabledSites.indexOf(HOSTNAME) !== -1;
            if (state.disabled && !wasDisabled) {
              scanVideos().forEach(function (video) {
                video.playbackRate = 1;
              });
              destroyAllOverlays();
            } else if (!state.disabled && wasDisabled) {
              applySpeedToAllVideos();
              syncOverlaysWithVideos();
            }
            if (state.disabled !== wasDisabled) sendBadgeUpdate();
          }
        });

        onGlobalSpeedChanged(function (newSpeed) {
          if (!state.syncAllTabs) return;
          if (scanVideos().length === 0) return;
          setSpeed(newSpeed, false);
        });
      })
      .catch(function (err) {
        console.error('[SpeeVid] init failed', err);
      });
  }

  // Registered synchronously so a failed/slow async load can never leave this
  // frame deaf to messages or shortcuts. `state` already has sane defaults.
  chrome.runtime.onMessage.addListener(handleMessage);
  document.addEventListener('keydown', handleKeydown, true);
  document.addEventListener('fullscreenchange', handleFullscreenChange);

  init();
})();
