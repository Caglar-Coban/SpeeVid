// Runs in the page's own ("main") JS world — injected by content.js only
// when the user turns on "Aggressive speed lock" in settings. Its only job
// is to stop the page's own scripts from overriding the speed the user
// chose, for sites whose player framework re-clamps `playbackRate` back to
// its own UI limit (common on some LMS platforms).
//
// content.js (running in the isolated content-script world) cannot patch
// HTMLMediaElement.prototype here directly — the two worlds share the DOM
// but not the JS heap/prototype chain, so a patch made in the isolated world
// is invisible to the page's own scripts. Hence this separate file, and
// window.postMessage as the bridge between the two worlds (a direct
// `window.someProperty = ...` from the isolated world would not be visible
// here either, for the same reason).
//
// NOT a security boundary. This code runs in the page's own main world, so
// anything the page can do, a hostile script the page loads can do too:
// post a fake {source:'speevid', type:'lock-rate', rate:null} message to
// release the lock, or call Object.defineProperty again over ours (it has
// to stay `configurable` for us to have installed it at all). Designed
// against sites that passively fight the speed back, not ones actively
// trying to defeat this extension.
(function () {
  'use strict';

  if (window.__speevidLockInstalled) return;
  window.__speevidLockInstalled = true;

  var proto = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
  var descriptor = proto && Object.getOwnPropertyDescriptor(proto, 'playbackRate');
  // If the browser doesn't expose a configurable, settable playbackRate
  // descriptor (future engine change, unexpected environment), bail out
  // quietly rather than throwing — this feature degrading is fine, breaking
  // video playback on every page is not.
  if (!descriptor || !descriptor.configurable || typeof descriptor.set !== 'function') return;

  var nativeSet = descriptor.set;
  var lockedRate = null; // null = no lock active, every write passes through

  Object.defineProperty(proto, 'playbackRate', {
    configurable: true,
    enumerable: descriptor.enumerable,
    get: descriptor.get,
    set: function (value) {
      if (lockedRate !== null && value !== lockedRate) {
        // A page script tried to move the rate away from the user's chosen
        // speed — ignore it instead of letting it win.
        return;
      }
      nativeSet.call(this, value);
    },
  });

  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    var data = event.data;
    if (!data || data.source !== 'speevid' || data.type !== 'lock-rate') return;
    lockedRate = typeof data.rate === 'number' ? data.rate : null;
    if (lockedRate === null) return;
    // Re-apply immediately through the original setter so the lock takes
    // effect right away, rather than waiting for the next natural rate
    // change on the page.
    document.querySelectorAll('video, audio').forEach(function (media) {
      nativeSet.call(media, lockedRate);
    });
  });
})();
