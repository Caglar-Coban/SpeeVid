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
  var onPinnedSpeedChanged = SpeeVid.storage.onPinnedSpeedChanged;
  var addTimeSaved = SpeeVid.storage.addTimeSaved;
  var hostMatchesAny = SpeeVid.storageHelpers.hostMatchesAny;
  var matchesKeyBinding = SpeeVid.storageHelpers.matchesKeyBinding;
  var buildSiteSpeedKey = SpeeVid.storageHelpers.buildSiteSpeedKey;
  var getAccentForeground = SpeeVid.theme.getAccentForeground;
  var pickAutoSpeed = SpeeVid.speedUtils.pickAutoSpeed;
  var MESSAGE_TYPES = SpeeVid.messages.MESSAGE_TYPES;

  var HOSTNAME = location.hostname || 'local-file';
  var IS_TOP_FRAME = window.top === window.self;
  // The host of the page the user is actually on (the tab's top frame).
  // Every per-site setting — disable list, remembered and pinned speeds — is
  // keyed on this, not on HOSTNAME: on sites whose player lives in an iframe
  // from another domain, the frame that owns the <video> would otherwise
  // look everything up under the player's domain, so disabling the site did
  // nothing to the video and its speed was never remembered. A cross-origin
  // iframe can't read window.top.location, so it asks the background script
  // (see resolvePageHost()); until that answers it falls back to its own.
  var PAGE_HOST = HOSTNAME;

  var formatSpeed = SpeeVid.speedUtils.formatSpeed;
  var PRESETS = SpeeVid.speedUtils.PRESETS;
  var BADGE_WIDTH = 52;
  var BADGE_HEIGHT = 26;
  var MARGIN = 8;
  var AUTO_HIDE_DELAY_MS = 1500;
  var COVER_CHECK_INTERVAL_MS = 150;
  // Things that mean "a dialog/menu is open over the page" (see
  // isBadgeCovered()).
  var MODAL_SELECTOR = '[aria-modal="true"], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], dialog[open]';
  var coverCheck = { at: 0, video: null, covered: false };
  // One entry per <video> found on the page, not one visible badge per
  // entry — positionOverlays() only ever shows the single "primary" video's
  // host (largest visible area) and keeps the rest display:none. See
  // positionOverlays() for why.
  var overlays = new Map();
  var rafId = null;
  var PERSIST_DEBOUNCE_MS = 300;
  var persistTimer = null;
  var boundVideos = new WeakSet();
  // A plain Set (not weak) so hasManualOverride() can enumerate and prune it.
  var manualOverrideVideos = new Set();
  var rateFightState = new WeakMap();
  var RATE_FIGHT_WINDOW_MS = 2000;
  var RATE_FIGHT_LIMIT = 6;
  // Frame-wide, not per video: two videos playing at once (a muted hover
  // preview next to the main one) used to each add their own elapsed time,
  // counting the same real seconds twice.
  var lastTimeUpdateAt = null;
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
    controlAudio: false,
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

  // The top frame always speaks for the tab's toolbar badge. An iframe only
  // does when it has media of its own — that's the embedded-player case,
  // where the top frame has no video. Both derive their speed and disabled
  // state from PAGE_HOST, so they agree; an unrelated iframe without media
  // stays silent.
  function sendBadgeUpdate() {
    if (!IS_TOP_FRAME && scanMedia().length === 0) return;
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
  function collectVideos(root, results, selector) {
    var videos = root.querySelectorAll(selector);
    for (var i = 0; i < videos.length; i += 1) results.push(videos[i]);
    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length; i += 1) {
      if (all[i].shadowRoot) collectVideos(all[i].shadowRoot, results, selector);
    }
  }

  // <video> elements only — what gets a floating badge. Audio never does:
  // it has no picture to sit over, and a hidden <audio> has no position.
  function scanVideos() {
    var results = [];
    collectVideos(document, results, 'video');
    return results;
  }

  // What the speed is applied to: every <video>, plus <audio> when the user
  // opted in ("control audio", off by default because sites also use hidden
  // <audio> elements for notification/effect sounds that shouldn't speed up).
  function mediaSelector() {
    return state.controlAudio ? 'video, audio' : 'video';
  }

  function scanMedia() {
    var results = [];
    collectVideos(document, results, mediaSelector());
    return results;
  }

  // Filters an already-scanned media list down to <video> so callers that
  // need both lists still only pay for one walk of the page.
  function onlyVideos(media) {
    return media.filter(function (el) {
      return el.tagName === 'VIDEO';
    });
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

  // A speed the user picked by hand (popup, overlay slider/presets, keyboard)
  // must not be second-guessed by auto speed-by-duration for that video —
  // otherwise every later 'durationchange' (streaming players fire it
  // repeatedly) or a second <video> loading metadata (hover preview, ad)
  // silently snaps the speed back to the auto value. The speed is one
  // frame-wide value, so the override is frame-wide too: it holds while ANY
  // still-attached video was set by hand, and each video's own override ends
  // when it starts loading a new source ('emptied', see bindVideo()) so the
  // next piece of content is judged on its own length again. Videos that
  // left the DOM are dropped so a finished video can't pin the override.
  function markManualOverride(videos) {
    (videos || scanMedia()).forEach(function (video) {
      manualOverrideVideos.add(video);
    });
  }

  function hasManualOverride() {
    manualOverrideVideos.forEach(function (video) {
      if (!video.isConnected) manualOverrideVideos.delete(video);
    });
    return manualOverrideVideos.size > 0;
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
    if (hasManualOverride()) return;
    if (!isFinite(video.duration) || video.duration <= 0) return;
    var target = pickAutoSpeed(video.duration, state.autoSpeedThresholdMinutes, state.autoSpeedShortSpeed, state.autoSpeedLongSpeed);
    if (target === state.speed) return;
    setSpeed(target, false);
  }

  // Sites often reset playbackRate to 1 themselves when a new source loads
  // into an existing <video> element (e.g. autoplay/next-episode on an SPA,
  // which reuses the element so our mutation observer never fires). Watching
  // these events lets us reassert our speed instead of silently losing it.
  // Listeners stay attached to an <audio> after the user turns "control
  // audio" off (there's no cheap way to unbind them by element), so every
  // handler checks this first — otherwise 'ratechange' would immediately
  // re-apply our speed to the audio we just handed back.
  function isControlled(media) {
    return media.tagName !== 'AUDIO' || state.controlAudio;
  }

  function bindVideo(video) {
    if (boundVideos.has(video)) return;
    boundVideos.add(video);
    ['loadedmetadata', 'durationchange', 'playing', 'ratechange'].forEach(function (evt) {
      video.addEventListener(evt, function () {
        // Listeners outlive a live "disable on this site": without this,
        // the playbackRate = 1 reset on disable fires 'ratechange' and this
        // handler immediately puts our speed straight back.
        if (state.disabled) return;
        if (!isControlled(video)) return;
        // Some players (adaptive/streaming ones especially) report an
        // unusable duration (Infinity/NaN) at 'loadedmetadata' and only
        // update it later via a separate 'durationchange' — without also
        // watching that event, auto speed-by-duration could be stuck
        // forever on its initial guess for exactly those sites.
        if (evt === 'loadedmetadata' || evt === 'durationchange') maybeAutoSetSpeedByDuration(video);
        if (video.playbackRate === state.speed) return;
        if (evt === 'ratechange' && isFightingRate(video)) return;
        video.playbackRate = state.speed;
        applyPitchPreference(video);
      });
    });
    // The element is starting to load different media (SPA autoplay-next
    // reuses it), so a manual speed chosen for the previous content no longer
    // applies to what's about to play.
    video.addEventListener('emptied', function () {
      manualOverrideVideos.delete(video);
    });
    video.addEventListener('timeupdate', function () {
      if (isControlled(video)) trackTimeSaved(video);
    });
    // The page's own script may have already loaded this video's metadata
    // before we got here, in which case 'loadedmetadata' already fired and
    // we'll never see it — check the duration directly for that case.
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) maybeAutoSetSpeedByDuration(video);
  }

  // `videos` lets a caller that already scanned share that result instead of
  // paying for another full-DOM walk (see scanVideos()).
  function applySpeedToAllVideos(videos) {
    if (state.disabled) return;
    (videos || scanMedia()).forEach(function (video) {
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
    var last = lastTimeUpdateAt;
    lastTimeUpdateAt = now;
    if (last === null) return;
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
      // The lock-rate message broadcastLockedRate() sends right after
      // calling this function (same tick) can easily arrive before this
      // script's own 'message' listener has registered — loading a script
      // is asynchronous, so there's no way to guarantee that ordering.
      // 'load' firing means the whole script already ran synchronously
      // (listener included), so re-sending here guarantees the lock takes
      // effect at least once injection is actually done, even if that
      // first attempt was silently dropped.
      broadcastLockedRate();
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
      if (scanMedia().length === 0) return;
      // Saved under PAGE_HOST, so an embedded player (a YouTube/Vimeo iframe
      // on someone else's site) remembers the speed for the page the user is
      // on, not for the embed's own domain. Only the frame that actually has
      // media writes; on an embed site that's the iframe, not the top frame.
      setSiteSpeed(PAGE_HOST, state.speed);
      if (state.syncAllTabs) setGlobalSpeed(state.speed);
    }, PERSIST_DEBOUNCE_MS);
  }

  function setSpeed(rawSpeed, persist) {
    if (persist === undefined) persist = true;
    state.speed = clampSpeed(rawSpeed);
    // One scan shared by everything below — dragging the overlay slider
    // calls this many times a second.
    var videos = scanMedia();
    applySpeedToAllVideos(videos);
    broadcastLockedRate();
    updateAllOverlays();
    sendBadgeUpdate();
    if (persist) {
      // Every caller passing persist=true is an explicit user action (popup
      // message, overlay slider/presets, keyboard); the automatic paths (sync,
      // auto speed) pass false. So "persist" also means "user chose this".
      markManualOverride(videos);
      schedulePersist();
    }
  }

  function handleMessage(message, _sender, sendResponse) {
    if (message.type === MESSAGE_TYPES.GET_FRAME_HOST) {
      if (IS_TOP_FRAME) sendResponse({ host: HOSTNAME });
      return false;
    }
    if (message.type === MESSAGE_TYPES.GET_STATE) {
      // The popup's second, untargeted ask ("does any frame have media?")
      // is answered only by frames that do; with every other frame staying
      // silent, the first frame that answers is one that has a player.
      if (message.onlyWithMedia && scanMedia().length === 0) return false;
      sendResponse({
        speed: state.speed,
        videoCount: scanMedia().length,
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
    var selector = mediaSelector();
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (!node || node.nodeType !== 1) continue;
      if (node.tagName === 'VIDEO' || (state.controlAudio && node.tagName === 'AUDIO')) return true;
      if (node.querySelector && node.querySelector(selector)) return true;
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

  // KNOWN GAP: this only catches light-DOM mutations. A MutationObserver's
  // `subtree` option does not cross shadow boundaries, and `querySelector`
  // inside nodeListHasVideo() doesn't either — so a video added dynamically
  // *inside* an already-attached open shadow root (or inside a brand-new
  // custom element's shadow root, created synchronously as that element is
  // inserted) is invisible to this observer, even though the initial
  // scanVideos()/collectVideos() pass at load time does find videos in
  // shadow roots that already exist. Properly fixing this means observing
  // every shadow root as it's created (patching Element.prototype.attachShadow
  // globally, with its own footprint/risk similar to the aggressive-mode
  // patch) or falling back to periodic re-scanning — neither implemented
  // yet; left as an accepted limitation for now.
  function observeNewVideos() {
    var observer = new MutationObserver(function (mutations) {
      // The observer only watches childList/subtree, so only added/removed
      // nodes can ever change the set of videos. Skip everything else.
      if (!mutationsTouchVideo(mutations)) return;
      var media = scanMedia();
      applySpeedToAllVideos(media);
      syncOverlaysWithVideos(onlyVideos(media));
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

    // Work out which action (if any) this key is bound to BEFORE looking for
    // videos: scanMedia() walks every element on the page, and this handler
    // runs for every key press anywhere on every page.
    var bindings = state.keyBindings;
    var action = matchesKeyBinding(event, bindings.increase)
      ? 'increase'
      : matchesKeyBinding(event, bindings.decrease)
      ? 'decrease'
      : matchesKeyBinding(event, bindings.reset)
      ? 'reset'
      : matchesKeyBinding(event, bindings.custom)
      ? 'custom'
      : null;
    if (action === null) return;
    if (scanMedia().length === 0) return;
    // The key did something for us, so don't also let the page act on it
    // (a user who binds Space or an arrow key would otherwise get both our
    // speed change and the player's own play/pause or seek).
    event.preventDefault();
    event.stopPropagation();

    if (action === 'increase') {
      setSpeed(state.speed + 0.1);
    } else if (action === 'decrease') {
      setSpeed(state.speed - 0.1);
    } else if (action === 'reset') {
      jumpToSpeed(1);
    } else {
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
    var fsEl = document.fullscreenElement;
    if (fsEl && fsEl.tagName === 'VIDEO') {
      // A bare <video> promoted to native fullscreen sits alone in the
      // browser's own top layer — nothing else in the document, including
      // an overlay appended to document.documentElement, renders above or
      // even alongside it. There's no DOM location that would actually be
      // visible here, so hide the overlay instead of rendering it uselessly
      // behind the video for the whole fullscreen session.
      destroyAllOverlays();
      return;
    }
    var parent = getOverlayParent();
    overlays.forEach(function (overlay) {
      // Re-appending an existing node moves it; it does not clone it.
      parent.appendChild(overlay.host);
    });
    // Recreates whatever a previous bare-video fullscreen destroyed above;
    // a harmless no-op otherwise (createOverlay() skips videos that already
    // have one).
    syncOverlaysWithVideos();
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
    // A bare <video> in fullscreen can't render an overlay anyone could see
    // (see handleFullscreenChange()) — don't create a doomed-invisible one
    // if something else (e.g. the mutation observer finding a new video)
    // tries to while that's the current state.
    var fsEl = document.fullscreenElement;
    if (fsEl && fsEl.tagName === 'VIDEO') return;

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
    // Hidden until positionOverlays() (driven by the rAF loop below) sets a
    // real top/left and flips this to 'block'. `position: fixed` with no
    // offsets falls back to the browser's own static-position guess, which
    // for a freshly appended node reads as stuck near the viewport's
    // top-left corner — visible immediately with correct badge text but
    // the wrong place, until the first tick lands. That's normally
    // ~16ms and unnoticeable, but a backgrounded/throttled tab can delay
    // it far longer, so don't show anything unpositioned in the meantime.
    host.style.display = 'none';
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

  // A page can have more than one real <video> at once — a hover-preview
  // thumbnail, an ad player, a crossfade during autoplay-next, a live
  // scrubbing/seek preview, a duplicate PiP element — and createOverlay()
  // gives each of them its own host (see syncOverlaysWithVideos()). Showing
  // a badge for every one of them looked like a bug (two floating speed
  // indicators on screen). Only ONE badge should ever be visible: whichever
  // currently-visible video covers the most viewport area is treated as
  // "the" video for this frame, and every other video's host is forced to
  // display:none. Hosts for the non-primary videos are kept alive (not
  // destroyed) so nothing has to be rebuilt the moment the primary video
  // changes (e.g. scrolling a different video into view).
  function composedContains(ancestor, node) {
    while (node) {
      if (node === ancestor) return true;
      // ShadowRoot has no parentNode but does have a host to keep climbing.
      node = node.parentNode || node.host;
    }
    return false;
  }

  function isOwnOverlayNode(el) {
    var own = false;
    overlays.forEach(function (overlay) {
      if (!own && composedContains(overlay.host, el)) own = true;
    });
    return own;
  }

  // document.elementsFromPoint() reports an open shadow host but not what's
  // inside it, so descend into each (other than our own overlay hosts).
  // Inner elements are listed before their host, matching paint order.
  function elementsAtPoint(root, x, y) {
    var out = [];
    root.elementsFromPoint(x, y).forEach(function (el) {
      if (el.shadowRoot && typeof el.shadowRoot.elementsFromPoint === 'function' && !isOwnOverlayNode(el)) {
        out.push.apply(out, elementsAtPoint(el.shadowRoot, x, y));
      }
      out.push(el);
    });
    return out;
  }

  function isRendered(el) {
    return el.getClientRects().length > 0;
  }

  function isViewportBackdrop(el) {
    if (getComputedStyle(el).position !== 'fixed') return false;
    var rect = el.getBoundingClientRect();
    return rect.width >= window.innerWidth * 0.9 && rect.height >= window.innerHeight * 0.9;
  }

  // True when a visible dialog/menu exists that the video is not part of.
  function pageHasModal(video) {
    var modals = document.querySelectorAll(MODAL_SELECTOR);
    for (var i = 0; i < modals.length; i += 1) {
      if (!composedContains(modals[i], video) && isRendered(modals[i])) return true;
    }
    return false;
  }

  // The badge is `position: fixed` with the maximum z-index, so no page
  // element can ever stack above it — a site's settings menu or modal opened
  // over the video used to render *underneath* the badge. Since we can't
  // outrank it, hide the badge instead while such a thing sits between it
  // and the video. Walks what the page stacks at the badge's position, from
  // the top down until it reaches the video (or something containing it —
  // everything after that is beneath the video, so irrelevant).
  //
  // Deliberately narrow, because a false positive silently removes the
  // badge: ordinary player controls above the video (a YouTube-style bar at
  // the same corner) must NOT count. Only two things do:
  //   1. semantic dialogs/menus (MODAL_SELECTOR) that don't contain the video;
  //   2. a near-full-viewport `position: fixed` layer (a dimming backdrop,
  //      which is usually a *sibling* of the role=dialog element, not inside
  //      it) — but only when a visible modal actually exists on the page, so
  //      unrelated full-screen site chrome is left alone.
  // Sites whose modals use no ARIA roles and no full-viewport backdrop are
  // not detected. Only the badge's center is sampled.
  function isBadgeCovered(video, x, y) {
    if (typeof document.elementsFromPoint !== 'function') return false;
    var stack = elementsAtPoint(document, x, y);
    var modalPresent = null;
    for (var i = 0; i < stack.length; i += 1) {
      var el = stack[i];
      if (isOwnOverlayNode(el)) continue;
      if (composedContains(el, video)) break;
      var modal = el.closest ? el.closest(MODAL_SELECTOR) : null;
      if (modal && !composedContains(modal, video)) return true;
      if (isViewportBackdrop(el)) {
        if (modalPresent === null) modalPresent = pageHasModal(video);
        if (modalPresent) return true;
      }
    }
    return false;
  }

  function positionOverlays() {
    var vertical = state.overlayPosition.indexOf('top') === 0 ? 'top' : 'bottom';
    var horizontal = state.overlayPosition.indexOf('right') !== -1 ? 'right' : 'left';

    var candidates = [];
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
      if (!visible) return;
      var visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
      var visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
      candidates.push({ video: video, rect: rect, area: visibleWidth * visibleHeight });
    });

    var primary = null;
    candidates.forEach(function (candidate) {
      if (!primary || candidate.area > primary.area) primary = candidate;
    });

    overlays.forEach(function (overlay, video) {
      if (!primary || video !== primary.video) {
        overlay.host.style.display = 'none';
        return;
      }
      var rect = primary.rect;
      var top = Math.round(vertical === 'top' ? rect.top + MARGIN : rect.bottom - BADGE_HEIGHT - MARGIN);
      var left = Math.round(horizontal === 'left' ? rect.left + MARGIN : rect.right - BADGE_WIDTH - MARGIN);
      overlay.host.style.top = top + 'px';
      overlay.host.style.left = left + 'px';

      // Hit-testing is comparatively costly and a menu opening doesn't need
      // frame-accurate reaction, so re-check a few times a second rather
      // than on every rAF tick (unless the primary video just changed).
      var now = Date.now();
      if (coverCheck.video !== video || now - coverCheck.at >= COVER_CHECK_INTERVAL_MS) {
        coverCheck = {
          at: now,
          video: video,
          covered: isBadgeCovered(video, left + BADGE_WIDTH / 2, top + BADGE_HEIGHT / 2),
        };
      }
      overlay.host.style.display = coverCheck.covered ? 'none' : 'block';
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

  function syncOverlaysWithVideos(scanned) {
    if (state.disabled || !state.floatingEnabled) {
      destroyAllOverlays();
      return;
    }
    var videos = scanned || scanVideos();
    videos.forEach(function (video) {
      createOverlay(video);
    });
    overlays.forEach(function (_overlay, video) {
      if (videos.indexOf(video) === -1) destroyOverlay(video);
    });
    ensureLoopRunning();
  }

  function isDisabledHere(disabledSites) {
    // The page's own host is what the popup's "disable on this site" writes.
    // The frame's own host still counts too, so a rule for a player domain
    // (e.g. "youtube.com") keeps covering its embeds on other sites.
    return hostMatchesAny(PAGE_HOST, disabledSites) || hostMatchesAny(HOSTNAME, disabledSites);
  }

  function resolvePageHost() {
    if (IS_TOP_FRAME) return Promise.resolve(HOSTNAME);
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_PAGE_HOST }, function (response) {
          void chrome.runtime.lastError;
          resolve(response && typeof response.host === 'string' && response.host ? response.host : HOSTNAME);
        });
      } catch (err) {
        resolve(HOSTNAME);
      }
    });
  }

  function init() {
    resolvePageHost()
      .then(function (pageHost) {
        PAGE_HOST = pageHost;
        return Promise.all([getSettings(), getSiteSpeed(PAGE_HOST), getGlobalSpeed(), getPinnedSpeed(PAGE_HOST)]);
      })
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
        state.disabled = isDisabledHere(settings.disabledSites);
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
        state.controlAudio = settings.controlAudio;
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
            scanMedia().forEach(applyPitchPreference);
          }
          if (typeof changed.aggressiveMode === 'boolean') {
            if (state.aggressiveMode && !changed.aggressiveMode) {
              // Turning off: release the lock explicitly before flipping
              // the flag. broadcastLockedRate() intentionally no-ops when
              // state.aggressiveMode is false (that's what keeps every
              // OTHER speed change from paying the postMessage cost for
              // users who never touch this feature), so calling it after
              // the flag flips would silently skip sending the release and
              // leave the page locked at the last rate forever.
              window.postMessage({ source: 'speevid', type: 'lock-rate', rate: null }, '*');
            }
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
            // Changing the auto settings is itself a deliberate act, so it
            // supersedes any earlier manual speed — otherwise the new
            // setting would appear to do nothing until the next page load.
            manualOverrideVideos.clear();
            // Re-evaluate immediately for whatever's already loaded, rather
            // than waiting for the next 'loadedmetadata' (which may never
            // come again for an already-playing video).
            if (state.autoSpeedByDuration) scanMedia().forEach(maybeAutoSetSpeedByDuration);
          }
          if (typeof changed.controlAudio === 'boolean') {
            state.controlAudio = changed.controlAudio;
            if (state.controlAudio) {
              // Reach the <audio> elements that were being ignored a moment ago.
              applySpeedToAllVideos();
            } else {
              // Give back the ones we were driving; <video> is unaffected.
              var audios = [];
              collectVideos(document, audios, 'audio');
              audios.forEach(function (audio) {
                audio.playbackRate = 1;
              });
            }
          }
          if (Array.isArray(changed.disabledSites)) {
            var wasDisabled = state.disabled;
            state.disabled = isDisabledHere(changed.disabledSites);
            if (state.disabled && !wasDisabled) {
              scanMedia().forEach(function (video) {
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
          if (scanMedia().length === 0) return;
          setSpeed(newSpeed, false);
        });

        // Pinning/unpinning from the popup writes straight to storage with
        // no message to this frame, so without this, pinning a speed while
        // this exact page is already open would never stop auto
        // speed-by-duration from overriding it on the next video/duration
        // change — state.hasPinnedSpeed would stay stuck at whatever it was
        // when init() ran.
        onPinnedSpeedChanged(function (pinnedSpeeds) {
          var key = buildSiteSpeedKey(PAGE_HOST);
          state.hasPinnedSpeed = Object.prototype.hasOwnProperty.call(pinnedSpeeds, key);
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
