// Verifies the fix for "the speed badge shows on top of a site's settings
// menu / modal": the badge is `position: fixed` with the maximum z-index, so
// no page element can ever stack above it. Instead it now hides itself while
// a dialog, menu or modal backdrop sits between it and the video. This loads
// the REAL content script into jsdom and stubs document.elementsFromPoint
// (jsdom doesn't implement hit-testing) to describe what the page stacks at
// the badge's position.
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

// The covered-check is throttled (see COVER_CHECK_INTERVAL_MS in content.js),
// so tests that flip the stack between frames wait out the interval.
const PAST_THROTTLE_MS = 250;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

// One 400x225 video at the top-left. `bodyHtml` is placed around/after it so a
// test can add dialogs, menus, backdrops. `videoWrapper` optionally wraps the
// <video> (e.g. in a role=dialog lightbox). Returns helpers to drive frames.
async function loadPage({ bodyHtml = '', videoWrapper = null, stubHitTest = true } = {}) {
  const video = '<video id="v" src="movie.mp4"></video>';
  const wrapped = videoWrapper ? videoWrapper.replace('%VIDEO%', video) : video;
  const dom = new JSDOM(`<!doctype html><html><body>${wrapped}${bodyHtml}</body></html>`, {
    url: 'https://example.com/watch',
    pretendToBeVisual: true,
    runScripts: 'dangerously',
  });
  const ctx = dom.getInternalVMContext();
  dom.window.chrome = createChromeMock();

  const doc = dom.window.document;
  const videoEl = doc.getElementById('v');
  const box = { top: 0, left: 0, width: 400, height: 225, right: 400, bottom: 225 };
  videoEl.getBoundingClientRect = () => rectFor(box);

  let pending = null;
  dom.window.requestAnimationFrame = (cb) => { pending = cb; return 0; };
  dom.window.cancelAnimationFrame = () => {};

  const hitTest = { stack: () => [], calls: [] };
  if (stubHitTest) {
    doc.elementsFromPoint = (x, y) => {
      hitTest.calls.push({ x, y });
      return hitTest.stack();
    };
  }

  [...SHARED_SCRIPTS, CONTENT_SCRIPT].forEach((relPath) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, relPath), 'utf8'), ctx, { filename: relPath });
  });
  for (let i = 0; i < 6; i += 1) await wait(0);

  const host = () =>
    Array.from(doc.documentElement.children).find((el) => el.shadowRoot && el.shadowRoot.querySelector('.badge'));
  const frame = () => { const cb = pending; pending = null; if (cb) cb(Date.now()); };
  const shown = () => host().style.display === 'block';
  return { dom, doc, videoEl, host, frame, shown, hitTest };
}

// Marks an element as actually rendered (jsdom has no layout, so
// getClientRects() is always empty otherwise).
function rendered(el) {
  el.getClientRects = () => [{ width: 10, height: 10 }];
  return el;
}

function fullViewportFixed(el, dom) {
  el.style.position = 'fixed';
  el.getBoundingClientRect = () =>
    rectFor({ top: 0, left: 0, width: dom.window.innerWidth, height: dom.window.innerHeight, right: dom.window.innerWidth, bottom: dom.window.innerHeight });
  return el;
}

test('baseline: with nothing stacked above the video the badge is shown', async () => {
  const page = await loadPage();
  page.hitTest.stack = () => [page.host(), page.videoEl, page.doc.body, page.doc.documentElement];
  page.frame();
  assert.equal(page.shown(), true);
});

test('the hit-test is sampled at the badge itself, not somewhere else', async () => {
  const page = await loadPage();
  page.hitTest.stack = () => [page.host(), page.videoEl];
  page.frame();
  assert.ok(page.hitTest.calls.length > 0);
  // Default corner is bottom-right of a 400x225 video: badge spans
  // left 340-392, top 191-217.
  page.hitTest.calls.forEach(({ x, y }) => {
    assert.ok(x >= 340 && x <= 392, `x=${x} outside badge`);
    assert.ok(y >= 191 && y <= 217, `y=${y} outside badge`);
  });
});

test('FIX: a role=dialog stacked above the video hides the badge', async () => {
  const page = await loadPage({ bodyHtml: '<div id="dlg" role="dialog"><div id="inner">Settings</div></div>' });
  const inner = page.doc.getElementById('inner');
  page.hitTest.stack = () => [page.host(), inner, page.doc.getElementById('dlg'), page.videoEl, page.doc.body];
  page.frame();
  assert.equal(page.shown(), false);
});

test('FIX: the badge comes back once the dialog closes', async () => {
  const page = await loadPage({ bodyHtml: '<div id="dlg" role="dialog"></div>' });
  const dlg = page.doc.getElementById('dlg');
  page.hitTest.stack = () => [page.host(), dlg, page.videoEl];
  page.frame();
  assert.equal(page.shown(), false);

  page.hitTest.stack = () => [page.host(), page.videoEl];
  await wait(PAST_THROTTLE_MS);
  page.frame();
  assert.equal(page.shown(), true);
});

test('FIX: aria-modal and role=menu (an in-player settings menu) also hide the badge', async () => {
  const page = await loadPage({
    bodyHtml: '<div id="modal" aria-modal="true"></div><div id="wrap"><div id="menu" role="menu"><div id="item"></div></div></div>',
  });
  page.hitTest.stack = () => [page.host(), page.doc.getElementById('modal'), page.videoEl];
  page.frame();
  assert.equal(page.shown(), false, 'aria-modal');

  page.hitTest.stack = () => [page.host(), page.doc.getElementById('item'), page.doc.getElementById('menu'), page.videoEl];
  await wait(PAST_THROTTLE_MS);
  page.frame();
  assert.equal(page.shown(), false, 'role=menu');
});

test('REGRESSION GUARD: ordinary player controls above the video do NOT hide the badge', async () => {
  // A YouTube-style control bar sits over the same corner as the badge. It's
  // not a dialog or menu, so the badge must keep floating above it.
  const page = await loadPage({ bodyHtml: '<div id="controls"><button id="play"></button></div>' });
  page.hitTest.stack = () => [page.host(), page.doc.getElementById('play'), page.doc.getElementById('controls'), page.videoEl];
  page.frame();
  assert.equal(page.shown(), true);
});

test('REGRESSION GUARD: a video that lives INSIDE a dialog (lightbox) keeps its badge', async () => {
  const page = await loadPage({ videoWrapper: '<div id="lightbox" role="dialog">%VIDEO%</div>' });
  page.hitTest.stack = () => [page.host(), page.videoEl, page.doc.getElementById('lightbox'), page.doc.body];
  page.frame();
  assert.equal(page.shown(), true);
});

test('elements BELOW the video in the stack never count as covering it', async () => {
  const page = await loadPage({ bodyHtml: '<div id="dlg" role="dialog"></div>' });
  page.hitTest.stack = () => [page.host(), page.videoEl, page.doc.getElementById('dlg')];
  page.frame();
  assert.equal(page.shown(), true);
});

test('FIX: a full-viewport fixed backdrop hides the badge when a visible modal exists', async () => {
  // Typical MUI/Radix shape: the dimming backdrop is a sibling of (not inside)
  // the role=dialog element, so only the backdrop is under the badge.
  const page = await loadPage({
    bodyHtml: '<div id="backdrop" aria-hidden="true"></div><div id="dlg" role="dialog"></div>',
  });
  fullViewportFixed(page.doc.getElementById('backdrop'), page.dom);
  rendered(page.doc.getElementById('dlg'));
  page.hitTest.stack = () => [page.host(), page.doc.getElementById('backdrop'), page.videoEl];
  page.frame();
  assert.equal(page.shown(), false);
});

test('a full-viewport fixed layer with NO modal on the page is left alone (could be site chrome)', async () => {
  const page = await loadPage({ bodyHtml: '<div id="layer"></div>' });
  fullViewportFixed(page.doc.getElementById('layer'), page.dom);
  page.hitTest.stack = () => [page.host(), page.doc.getElementById('layer'), page.videoEl];
  page.frame();
  assert.equal(page.shown(), true);
});

test('a hidden (display:none-style) dialog in the DOM does not count as a modal being present', async () => {
  const page = await loadPage({ bodyHtml: '<div id="backdrop"></div><div id="dlg" role="dialog"></div>' });
  fullViewportFixed(page.doc.getElementById('backdrop'), page.dom);
  // #dlg keeps jsdom's default empty getClientRects() => not rendered.
  page.hitTest.stack = () => [page.host(), page.doc.getElementById('backdrop'), page.videoEl];
  page.frame();
  assert.equal(page.shown(), true);
});

test('the badge\'s own overlay host is never mistaken for a cover', async () => {
  const page = await loadPage();
  // Even if the stack reports the host with its own shadow contents.
  const badge = page.host().shadowRoot.querySelector('.badge');
  page.hitTest.stack = () => [badge, page.host(), page.videoEl];
  page.frame();
  assert.equal(page.shown(), true);
});

test('a browser/page without document.elementsFromPoint just shows the badge', async () => {
  const page = await loadPage({ stubHitTest: false });
  page.frame();
  assert.equal(page.shown(), true);
});
