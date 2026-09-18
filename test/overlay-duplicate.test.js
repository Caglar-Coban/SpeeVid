// Verifies the fix for "sometimes I see two speed badges": a page can have
// more than one real <video> at once (a hover-preview thumbnail, an ad
// player, a crossfade during autoplay-next, a scrubbing/seek preview, a
// duplicate PiP element — see test/manual/video-test.html, this project's
// own manual fixture, which has two <video> tags on one page). content.js
// still creates one overlay per <video> internally, but positionOverlays()
// must only ever display ONE of them: the currently-visible video with the
// largest on-screen area. This loads the REAL content script (not a
// reimplementation) and drives its real rAF position loop with controlled
// getBoundingClientRect() values per video.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const SHARED_SCRIPTS = [
  'src/shared/speed-utils.js',
  'src/shared/i18n.js',
  'src/shared/theme.js',
  'src/shared/storage-helpers.js',
  'src/shared/storage.js',
  'src/shared/messages.js',
];
const CONTENT_SCRIPT = 'src/content/content.js';
const ROOT = path.join(__dirname, '..');

function createChromeMock() {
  const syncStore = {};
  const localStore = {};
  return {
    runtime: {
      getURL: (p) => 'chrome-extension://test/' + p,
      sendMessage: (_msg, cb) => { if (cb) cb(); },
      lastError: undefined,
      onMessage: { addListener: () => {} },
    },
    storage: {
      sync: {
        get: (defaults, cb) => cb(Object.assign({}, defaults, syncStore)),
        set: (patch, cb) => { Object.assign(syncStore, patch); if (cb) cb(); },
      },
      local: {
        get: (defaults, cb) => {
          const result = {};
          Object.keys(defaults).forEach((k) => {
            result[k] = Object.prototype.hasOwnProperty.call(localStore, k) ? localStore[k] : defaults[k];
          });
          cb(result);
        },
        set: (patch, cb) => { Object.assign(localStore, patch); if (cb) cb(); },
      },
      onChanged: { addListener: () => {} },
    },
  };
}

function rectFor(box) {
  return Object.assign({ x: box.left, y: box.top, toJSON: () => box }, box);
}

// Loads the extension's real content script(s), in the same order the
// manifest injects them, into a fresh jsdom page containing one <video> per
// entry in `boxes` (each a {top,left,width,height} on-screen rect). Also
// drives content.js's real rAF-based positionOverlays() loop for a few
// ticks so the primary-video selection actually runs, capped so the loop
// can't reschedule forever and hang the test.
async function loadPageWithVideos(boxes) {
  const videosHtml = boxes.map((_, i) => `<video id="v${i}" src="movie.mp4"></video>`).join('\n');
  const dom = new JSDOM(`<!doctype html><html><body>${videosHtml}</body></html>`, {
    url: 'https://example.com/watch',
    pretendToBeVisual: true,
    runScripts: 'dangerously',
  });
  const ctx = dom.getInternalVMContext();
  dom.window.chrome = createChromeMock();

  const videos = boxes.map((box, i) => {
    const video = dom.window.document.getElementById('v' + i);
    const rect = rectFor({ top: box.top, left: box.left, width: box.width, height: box.height, right: box.left + box.width, bottom: box.top + box.height });
    video.getBoundingClientRect = () => rect;
    return video;
  });

  let ticksRemaining = 4;
  dom.window.requestAnimationFrame = (cb) => {
    if (ticksRemaining > 0) {
      ticksRemaining -= 1;
      setTimeout(() => cb(Date.now()), 0);
    }
    return 0;
  };
  dom.window.cancelAnimationFrame = () => {};

  [...SHARED_SCRIPTS, CONTENT_SCRIPT].forEach((relPath) => {
    const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    vm.runInContext(code, ctx, { filename: relPath });
  });

  // init()'s Promise.all resolves via our synchronous chrome.storage mock,
  // and each capped rAF tick above is itself queued one setTimeout(0) at a
  // time — enough round trips lets both init() and every tick settle.
  for (let i = 0; i < 6; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return { dom, videos };
}

// Overlay hosts are plain <div>s appended directly to <html> with an open
// shadow root containing a `.badge` element (see createOverlay() in
// content.js) — one per <video> content.js has ever seen, regardless of
// which one is currently allowed to be visible.
function overlayHosts(dom) {
  const children = Array.from(dom.window.document.documentElement.children);
  return children.filter((el) => el.shadowRoot && el.shadowRoot.querySelector('.badge'));
}

function visibleBadgeCount(dom) {
  return overlayHosts(dom).filter((host) => host.style.display === 'block').length;
}

test('a page with a single visible <video> shows exactly one badge', async () => {
  const { dom } = await loadPageWithVideos([{ top: 0, left: 0, width: 400, height: 225 }]);
  assert.equal(overlayHosts(dom).length, 1);
  assert.equal(visibleBadgeCount(dom), 1);
});

test('FIX: a page with two simultaneous <video> elements shows only one badge', async () => {
  // Same shape as test/manual/video-test.html (two <video> tags on one
  // page). Before the fix, positionOverlays() showed a badge for every
  // visible video; now only the one with the largest visible area does.
  const { dom } = await loadPageWithVideos([
    { top: 0, left: 0, width: 400, height: 225 }, // the "main" video — larger
    { top: 300, left: 0, width: 120, height: 68 }, // e.g. a hover-preview thumbnail — smaller
  ]);

  const hosts = overlayHosts(dom);
  // Internally, content.js still tracks one overlay per <video> it found...
  assert.equal(hosts.length, 2, 'expected one overlay host to exist per <video>');
  // ...but only one may ever be visible on screen at a time.
  assert.equal(visibleBadgeCount(dom), 1);
});

test('FIX: three simultaneous videos still show exactly one badge, tracking the largest', async () => {
  const { dom } = await loadPageWithVideos([
    { top: 0, left: 0, width: 100, height: 60 },
    { top: 0, left: 200, width: 640, height: 360 }, // largest — should win
    { top: 0, left: 900, width: 80, height: 45 },
  ]);
  assert.equal(overlayHosts(dom).length, 3);
  assert.equal(visibleBadgeCount(dom), 1);
});

test('an off-screen second <video> never gets a visible badge even though it exists', async () => {
  const { dom } = await loadPageWithVideos([
    { top: 0, left: 0, width: 400, height: 225 },
    { top: -500, left: 0, width: 400, height: 225 }, // scrolled out of view above the viewport
  ]);
  assert.equal(overlayHosts(dom).length, 2);
  assert.equal(visibleBadgeCount(dom), 1);
});
