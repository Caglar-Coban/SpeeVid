(function () {
  'use strict';

  var clampSpeed = SpeeVid.speedUtils.clampSpeed;
  var getSettings = SpeeVid.storage.getSettings;
  var getSiteSpeed = SpeeVid.storage.getSiteSpeed;
  var setSiteSpeed = SpeeVid.storage.setSiteSpeed;
  var getPinnedSpeed = SpeeVid.storage.getPinnedSpeed;
  var getGlobalSpeed = SpeeVid.storage.getGlobalSpeed;
  var setGlobalSpeed = SpeeVid.storage.setGlobalSpeed;
  var onGlobalSpeedChanged = SpeeVid.storage.onGlobalSpeedChanged;
  var onSettingsChanged = SpeeVid.storage.onSettingsChanged;
  var addTimeSaved = SpeeVid.storage.addTimeSaved;
  var hostMatchesAny = SpeeVid.storageHelpers.hostMatchesAny;
  var getAccentForeground = SpeeVid.theme.getAccentForeground;
  var pickAutoSpeed = SpeeVid.speedUtils.pickAutoSpeed;
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
  var rateFightState = new WeakMap();
  var RATE_FIGHT_WINDOW_MS = 2000;
  var RATE_FIGHT_LIMIT = 6;
  var lastTimeUpdateAt = new WeakMap();
  var pendingTimeSaved = 0;
  var TIME_SAVED_FLUSH_MS = 10000;
  var timeSavedFlushTimer = null;
  var mainWorldInjected = false;
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
    preservePitch: true,
    aggressiveMode: false,
    trackTimeSaved: true,
    theme: 'auto',
    accentColor: '#6552e0',
    autoSpeedByDuration: false,
    autoSpeedThresholdMinutes: 20,
    autoSpeedShortSpeed: 1,
    autoSpeedLongSpeed: 2,
    // Whether this exact site has a *pinned* speed (a deliberate, visible,
    // removable choice in settings) — computed once at init() from storage,
    // not re-derived live. Only a pin outranks auto speed-by-duration.
    // The merely "last remembered" speed does NOT: it's incidental (every
    // manual speed change gets remembered for the site automatically, with
    // no way to review or clear it), so letting it silently and permanently
    // block auto speed-by-duration made the feature look broken forever
    // after the very first manual adjustment on a site.
    hasPinnedSpeed: false,
  };

  function sendBadgeUpdate() {
    if (!IS_TOP_FRAME) return;
    var text = !state.disabled && state.speed !== 1 ? formatSpeed(state.speed).replace('x', '') : '';
    // Carries the user's chosen accent color along so the badge matches the
    // rest of the theming instead of staying hardcoded purple in the
    // background script, which has no other way to know it.
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.SPEED_CHANGED, text: text, color: state.accentColor }, function () {
      void chrome.runtime.lastError;
    });
  }

  // Recurses into open shadow roots so videos rendered by web-component-based
  // players (some LMS platforms, some modern SPA frameworks) are still found.
  // Closed shadow roots (`attachShadow({ mode: 'closed' })`) are invisible to
  // any script outside the component that made them, including this one —
  // there's no way to reach into those from a content script.
  function collectVideos(root, results) {
    var videos = root.querySelectorAll('video');
    for (var i = 0; i < videos.length; i += 1) results.push(videos[i]);
    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length; i += 1) {
      if (all[i].shadowRoot) collectVideos(all[i].shadowRoot, results);
    }
  }

  function scanVideos() {
    var results = [];
    collectVideos(document, results);
    return results;
  }

  // Some sites (Netflix historically did this) run their own `ratechange`
  // handler that resets playbackRate back to 1, which re-triggers ours here,
  // which resets it again — an infinite back-and-forth that never throws
  // (each `playbackRate =` fires its event asynchronously, so it can't
  // recurse synchronously) but flickers visibly forever. If we're forced to
  // correct the same video's rate too many times in a short window, assume
  // we're fighting the page's own player and stand down until something
  // else (an explicit user action) changes the rate again.
  function isFightingRate(video) {
    var now = Date.now();
    var fight = rateFightState.get(video);
    if (!fight || now - fight.windowStart > RATE_FIGHT_WINDOW_MS) {
      fight = { windowStart: now, count: 0 };
    }
    fight.count += 1;
    rateFightState.set(video, fight);
    return fight.count > RATE_FIGHT_LIMIT;
  }

  // Without this, browsers correct pitch by default anyway — but some sites
  // deliberately turn it off (`preservesPitch = false`) so speed changes
  // sound "natural" to them, which at 1.5x+ produces the chipmunk effect.
  // Re-assert our own preference every time we touch playbackRate. The
  // unprefixed name shipped in Chrome 130+/Firefox 129+; the vendor-prefixed
  // ones cover everything before that, and setting a property a browser
  // doesn't recognize is a silent no-op, never an error.
  function applyPitchPreference(video) {
    video.preservesPitch = state.preservePitch;
    video.webkitPreservesPitch = state.preservePitch;
    video.mozPreservesPitch = state.preservePitch;
  }

  // Auto speed-by-duration only ever proposes a speed; it never overrides a
  // deliberate choice. A *pinned* speed for this exact site always wins
  // (checked once at init(), via state.hasPinnedSpeed), as does "apply to
  // all tabs" (a broader, explicit override than either) — but the merely
  // "last remembered" speed for this site does NOT block it, on purpose:
  // that memory is incidental (every manual change gets remembered, with no
  // way to review/clear it), so letting it silently override auto speed
  // forever after the very first manual adjustment made the feature look
  // permanently broken. The result here is never persisted as a remembered
  // site speed either — it's a per-video proposal, not a preference, so a
  // site with a mix of short and long videos gets re-evaluated for each one
  // instead of getting stuck at whatever the first video happened to decide.
  function maybeAutoSetSpeedByDuration(video) {
    if (!state.autoSpeedByDuration) return;
    if (state.syncAllTabs || state.hasPinnedSpeed) return;
    if (!isFinite(video.duration) || video.duration <= 0) return;
    var target = pickAutoSpeed(video.duration, state.autoSpeedThresholdMinutes, state.autoSpeedShortSpeed, state.autoSpeedLongSpeed);
    if (target === state.speed) return;
    setSpeed(target, false);
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
        if (evt === 'loadedmetadata') maybeAutoSetSpeedByDuration(video);
        if (video.playbackRate === state.speed) return;
        if (evt === 'ratechange' && isFightingRate(video)) return;
        video.playbackRate = state.speed;
        applyPitchPreference(video);
      });
    });
    video.addEventListener('timeupdate', function () {
      trackTimeSaved(video);
    });
    // The page's own script may have already loaded this video's metadata
    // before we got here, in which case 'loadedmetadata' already fired and
    // we'll never see it — check the duration directly for that case.
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) maybeAutoSetSpeedByDuration(video);
  }

  function applySpeedToAllVideos() {
    if (state.disabled) return;
    scanVideos().forEach(function (video) {
      bindVideo(video);
      video.playbackRate = state.speed;
      applyPitchPreference(video);
      // An explicit speed change (user action or sync) always wins — reset
      // any throttle so a fresh, legitimate change isn't mistaken for still
      // being mid-fight with the page's own player.
      rateFightState.delete(video);
    });
  }

  // Accumulates real time "saved" by watching faster than 1x, in the video's
  // own `timeupdate` cadence (fires a few times a second while playing,
  // independent of the floating overlay's rAF loop, so tracking still works
  // with the overlay turned off). Only counts speed-ups, not slow-downs, and
  // ignores any gap over 2s (tab backgrounded/suspended, video buffering) so
  // a long pause can't be misread as watching a huge chunk at high speed.
  function trackTimeSaved(video) {
    var now = Date.now();
    var last = lastTimeUpdateAt.get(video);
    lastTimeUpdateAt.set(video, now);
    if (last === undefined) return;
    if (!state.trackTimeSaved || state.disabled || video.paused) return;
    var elapsedSec = (now - last) / 1000;
    if (elapsedSec <= 0 || elapsedSec > 2) return;
    var saved = elapsedSec * (state.speed - 1);
    if (saved <= 0) return;
    pendingTimeSaved += saved;
    if (timeSavedFlushTimer === null) {
      timeSavedFlushTimer = setTimeout(flushTimeSaved, TIME_SAVED_FLUSH_MS);
    }
  }

  function flushTimeSaved() {
    timeSavedFlushTimer = null;
    if (pendingTimeSaved <= 0) return;
    var toFlush = pendingTimeSaved;
    pendingTimeSaved = 0;
    addTimeSaved(toFlush);
  }

  // Some sites (mainly LMS platforms — Udemy, Coursera, LinkedIn Learning)
  // wrap their player in a framework that re-clamps `playbackRate` back down
  // whenever it's set above the site's own UI limit (often 2x), which our
  // ratechange handler can't out-race indefinitely. The only real fix is to
  // patch the `playbackRate` setter on HTMLMediaElement.prototype itself —
  // but content scripts run in an isolated JS world with their own prototype
  // chain, so patching it here wouldn't touch the page's own scripts at all.
  // We inject a small script into the page's *main* world to do the patching,
  // and bridge the desired rate to it with window.postMessage (the standard,
  // cross-browser-safe way to talk across that world boundary — a direct
  // `window.foo = ...` from here would not be visible on the other side).
  // Off by default: this changes how `playbackRate` behaves for every
  // <video>/<audio> on the page, including the site's own legitimate uses of
  // it, so it's opt-in and clearly labeled as such in settings.
  //
  // NOT a security boundary: the postMessage channel and the patched
  // property are both necessarily reachable by the page's own main-world
  // scripts too (same window, and the property must stay `configurable` so
  // we can install it in the first place). A page that actively wants to
  // defeat this can just post its own {source:'speevid', type:'lock-rate',
  // rate:null} to release the lock, or redefine the property again itself.
  // That's an acceptable trade-off for the actual target (sites that
  // passively re-clamp the rate, not ones hostile to this extension), but
  // don't rely on this to hold up a genuinely adversarial page.
  function ensureMainWorldScript() {
    if (mainWorldInjected) return;
    mainWorldInjected = true;
    var script = document.createElement('script');
    script.src = chrome.runtime.getURL('src/content/main-world-lock.js');
    script.addEventListener('load', function () {
      script.remove();
    });
    script.addEventListener('error', function () {
      script.remove();
    });
    (document.head || document.documentElement).appendChild(script);
  }

  function broadcastLockedRate() {
    if (!state.aggressiveMode) return;
    ensureMainWorldScript();
    var rate = state.disabled ? null : state.speed;
    window.postMessage({ source: 'speevid', type: 'lock-rate', rate: rate }, '*');
  }

  function schedulePersist() {
    if (persistTimer !== null) clearTimeout(persistTimer);
    persistTimer = setTimeout(function () {
      persistTimer = null;
      // Never persist a speed for a frame that has no video of its own
      // (e.g. an unrelated ad iframe that received the SET_SPEED broadcast).
      if (scanVideos().length === 0) return;
      // Only the top frame writes to storage. SET_SPEED is broadcast to
      // every frame so an embedded player (e.g. a YouTube iframe on someone
      // else's site) still responds, but persisting from that frame would
      // silently save a site speed under the embed's own hostname
      // (youtube.com) instead of the page the user actually adjusted.
      if (!IS_TOP_FRAME) return;
      setSiteSpeed(HOSTNAME, state.speed);
      if (state.syncAllTabs) setGlobalSpeed(state.speed);
    }, PERSIST_DEBOUNCE_MS);
  }

  function setSpeed(rawSpeed, persist) {
    if (persist === undefined) persist = true;
    state.speed = clampSpeed(rawSpeed);
    applySpeedToAllVideos();
    broadcastLockedRate();
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
  //
  // Colors are computed here rather than left to a static stylesheet
  // because both the theme (auto/light/dark) and the accent color are
  // user-configurable. "auto" keeps the original prefers-color-scheme
  // media query (dark base, light override); an explicit light/dark choice
  // bakes the final colors directly into the base rule instead and skips
  // the media query entirely, so it can't be second-guessed by the OS
  // setting. This whole template is rebuilt from scratch whenever theme,
  // accent color, or position changes (see the onSettingsChanged handlers).
  function getOverlayTemplate(position) {
    var vertical = position.indexOf('top') === 0 ? 'top' : 'bottom';
    var horizontal = position.indexOf('right') !== -1 ? 'right' : 'left';
    var panelOpen = vertical === 'bottom' ? 'bottom: 100%; padding-bottom: 8px;' : 'top: 100%; padding-top: 8px;';
    var isLight = state.theme === 'light';
    var isDark = state.theme === 'dark';
    var baseBg = isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(28, 28, 32, 0.9)';
    var baseFg = isLight ? '#1c1c20' : '#f4f4f5';
    var baseBorder = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.12)';
    var autoLightOverride =
      !isLight && !isDark
        ? '@media (prefers-color-scheme: light) { .root { --sv-bg: rgba(255, 255, 255, 0.95); --sv-fg: #1c1c20; --sv-border: rgba(0, 0, 0, 0.08); } }'
        : '';
    return (
      '<style>' +
      ':host { all: initial; }' +
      '.root { position: absolute; ' + vertical + ': 0; ' + horizontal + ': 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; ' +
      'opacity: 1; transition: opacity 0.25s ease; ' +
      '--sv-bg: ' + baseBg + '; --sv-fg: ' + baseFg + '; --sv-accent: ' + state.accentColor + '; --sv-accent-fg: ' + getAccentForeground(state.accentColor) + '; --sv-border: ' + baseBorder + '; }' +
      '.root.idle { opacity: 0; }' +
      autoLightOverride +
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
    // `fixed` stays viewport-relative even after handleFullscreenChange()
    // reparents this host into the fullscreen element, which is fine here
    // only because a fullscreen element always covers the whole viewport —
    // so `fixed` and `absolute`-to-that-element resolve to the same
    // coordinates. Don't "simplify" this to `absolute` without re-checking
    // positionOverlays(), which reads getBoundingClientRect() (viewport
    // space) and assumes `fixed` semantics.
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
    Promise.all([getSettings(), getSiteSpeed(HOSTNAME), getGlobalSpeed(), getPinnedSpeed(HOSTNAME)])
      .then(function (results) {
        var settings = results[0];
        var siteSpeed = results[1];
        var globalSpeed = results[2];
        var pinnedSpeed = results[3];

        state.floatingEnabled = settings.floatingEnabled;
        state.shortcutsEnabled = settings.shortcutsEnabled;
        state.keyBindings = settings.keyBindings;
        state.customSpeed = settings.customSpeed;
        state.syncAllTabs = settings.syncAllTabs;
        state.disabled = hostMatchesAny(HOSTNAME, settings.disabledSites);
        state.overlayPosition = settings.overlayPosition;
        state.overlayAutoHide = settings.overlayAutoHide;
        state.preservePitch = settings.preservePitch;
        state.aggressiveMode = settings.aggressiveMode;
        state.trackTimeSaved = settings.trackTimeSaved;
        state.theme = settings.theme;
        state.accentColor = settings.accentColor;
        state.autoSpeedByDuration = settings.autoSpeedByDuration;
        state.autoSpeedThresholdMinutes = settings.autoSpeedThresholdMinutes;
        state.autoSpeedShortSpeed = settings.autoSpeedShortSpeed;
        state.autoSpeedLongSpeed = settings.autoSpeedLongSpeed;
        // Only a pin blocks auto speed-by-duration going forward (see
        // maybeAutoSetSpeedByDuration()) — the initial state.speed guess
        // below still prefers the remembered site speed over a flat 1x,
        // but that's just to avoid a jarring flash before the video's
        // actual duration is known; it gets corrected within moments.
        state.hasPinnedSpeed = pinnedSpeed !== null;
        // Priority, highest first: "apply to all tabs" (broadest explicit
        // override) > a pinned speed (deliberate per-site default) > the
        // last speed remembered for this site > auto speed-by-duration
        // (only a proposal, and only once a video's actual length is known
        // — see maybeAutoSetSpeedByDuration()) > the plain 1x default.
        state.speed = clampSpeed(
          state.syncAllTabs
            ? globalSpeed
            : pinnedSpeed !== null
            ? pinnedSpeed
            : siteSpeed !== null
            ? siteSpeed
            : state.autoSpeedByDuration
            ? state.autoSpeedShortSpeed
            : 1
        );

        applySpeedToAllVideos();
        broadcastLockedRate();
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
          if (typeof changed.preservePitch === 'boolean') {
            state.preservePitch = changed.preservePitch;
            scanVideos().forEach(applyPitchPreference);
          }
          if (typeof changed.aggressiveMode === 'boolean') {
            state.aggressiveMode = changed.aggressiveMode;
            broadcastLockedRate();
          }
          if (typeof changed.trackTimeSaved === 'boolean') {
            state.trackTimeSaved = changed.trackTimeSaved;
          }
          if (typeof changed.theme === 'string' || typeof changed.accentColor === 'string') {
            if (typeof changed.theme === 'string') state.theme = changed.theme;
            if (typeof changed.accentColor === 'string') state.accentColor = changed.accentColor;
            // Same as an overlayPosition change: the colors are baked into
            // each overlay's shadow-DOM CSS at creation time, so a full
            // rebuild is the only way to pick up new ones.
            destroyAllOverlays();
            syncOverlaysWithVideos();
          }
          if (
            typeof changed.autoSpeedByDuration === 'boolean' ||
            typeof changed.autoSpeedThresholdMinutes === 'number' ||
            typeof changed.autoSpeedShortSpeed === 'number' ||
            typeof changed.autoSpeedLongSpeed === 'number'
          ) {
            if (typeof changed.autoSpeedByDuration === 'boolean') state.autoSpeedByDuration = changed.autoSpeedByDuration;
            if (typeof changed.autoSpeedThresholdMinutes === 'number') state.autoSpeedThresholdMinutes = changed.autoSpeedThresholdMinutes;
            if (typeof changed.autoSpeedShortSpeed === 'number') state.autoSpeedShortSpeed = changed.autoSpeedShortSpeed;
            if (typeof changed.autoSpeedLongSpeed === 'number') state.autoSpeedLongSpeed = changed.autoSpeedLongSpeed;
            // Re-evaluate immediately for whatever's already loaded, rather
            // than waiting for the next 'loadedmetadata' (which may never
            // come again for an already-playing video).
            if (state.autoSpeedByDuration) scanVideos().forEach(maybeAutoSetSpeedByDuration);
          }
          if (Array.isArray(changed.disabledSites)) {
            var wasDisabled = state.disabled;
            state.disabled = hostMatchesAny(HOSTNAME, changed.disabledSites);
            if (state.disabled && !wasDisabled) {
              scanVideos().forEach(function (video) {
                video.playbackRate = 1;
              });
              destroyAllOverlays();
              broadcastLockedRate();
            } else if (!state.disabled && wasDisabled) {
              applySpeedToAllVideos();
              broadcastLockedRate();
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
  // A setTimeout-based flush can be dropped entirely on unload/backgrounding
  // (Chrome doesn't guarantee pending timers run), so flush eagerly on both
  // signals instead of only relying on the timer.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) flushTimeSaved();
  });
  window.addEventListener('pagehide', flushTimeSaved);

  init();
})();
