// Behavior tests for the real content script around keyboard shortcuts:
//  - shortcuts must work on non-Latin keyboard layouts (Russian, Arabic, ...),
//    where event.key is not the Latin letter the binding was stored as;
//  - handling a key press or a speed change must not walk the whole DOM more
//    than necessary (a full walk = querySelectorAll('*') in scanVideos()).
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

function createChromeMock(syncSettings, messageListeners) {
  const localStore = {};
  return {
    runtime: {
      getURL: (p) => 'chrome-extension://test/' + p,
      sendMessage: (_msg, cb) => { if (cb) cb(); },
      lastError: undefined,
      onMessage: { addListener: (fn) => messageListeners.push(fn) },
    },
    storage: {
      sync: {
        get: (defaults, cb) => cb(Object.assign({}, defaults, syncSettings)),
        set: (patch, cb) => { Object.assign(syncSettings, patch); if (cb) cb(); },
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

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function loadPage({ settings = {}, videos = 1 } = {}) {
  const videoTags = Array.from({ length: videos }, (_, i) => `<video id="v${i}" src="movie.mp4"></video>`).join('');
  const dom = new JSDOM(`<!doctype html><html><body>${videoTags}<div><p>filler</p></div></body></html>`, {
    url: 'https://example.com/watch',
    pretendToBeVisual: true,
    runScripts: 'dangerously',
  });
  const ctx = dom.getInternalVMContext();
  const messageListeners = [];
  dom.window.chrome = createChromeMock(settings, messageListeners);
  dom.window.requestAnimationFrame = () => 0;
  dom.window.cancelAnimationFrame = () => {};

  [...SHARED_SCRIPTS, CONTENT_SCRIPT].forEach((relPath) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, relPath), 'utf8'), ctx, { filename: relPath });
  });
  for (let i = 0; i < 6; i += 1) await tick();

  const doc = dom.window.document;
  // scanVideos() = querySelectorAll('video') + querySelectorAll('*') (the
  // latter is the full-DOM walk that looks for shadow roots). Count those.
  const walks = { full: 0 };
  const realQsa = doc.querySelectorAll.bind(doc);
  doc.querySelectorAll = (selector) => {
    if (selector === '*') walks.full += 1;
    return realQsa(selector);
  };

  return {
    dom,
    doc,
    walks,
    video: doc.getElementById('v0'),
    press: (init) => doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', Object.assign({ bubbles: true }, init))),
    message: (msg) => messageListeners.forEach((fn) => fn(msg, {}, () => {})),
  };
}

test('default shortcut works with a Latin key (baseline)', async () => {
  const { video, press } = await loadPage();
  press({ key: 's', code: 'KeyS' });
  assert.equal(video.playbackRate, 1.1);
});

test('FIX: shortcuts work on a Russian layout (physical S types "ы")', async () => {
  const { video, press } = await loadPage();
  press({ key: 'ы', code: 'KeyS' }); // increase
  assert.equal(video.playbackRate, 1.1);
  press({ key: 'в', code: 'KeyD' }); // decrease
  assert.equal(video.playbackRate, 1);
  press({ key: 'ы', code: 'KeyS' });
  press({ key: 'ф', code: 'KeyA' }); // reset
  assert.equal(video.playbackRate, 1);
});

test('FIX: shortcuts work while an IME reports key "Process"', async () => {
  const { video, press } = await loadPage();
  press({ key: 'Process', code: 'KeyS' });
  assert.equal(video.playbackRate, 1.1);
});

test('a Dvorak-style Latin layout is not remapped by physical position', async () => {
  const { video, press } = await loadPage();
  press({ key: 'o', code: 'KeyS' }); // types "o" — not a bound key
  assert.equal(video.playbackRate, 1);
});

test('PERF: an unbound key press does not walk the DOM at all', async () => {
  const { walks, press } = await loadPage();
  press({ key: 'x', code: 'KeyX' });
  press({ key: 'Enter', code: 'Enter' });
  press({ key: ' ', code: 'Space' });
  assert.equal(walks.full, 0);
});

test('a bound key press walks the DOM twice: once to confirm a video exists, once for the speed change', async () => {
  const { walks, press } = await loadPage();
  press({ key: 's', code: 'KeyS' });
  // handleKeydown() checks for videos once; setSpeed() reuses one scan.
  assert.equal(walks.full, 2);
});

test('PERF: one speed change is a single scan, not one per step (apply, mark manual, ...)', async () => {
  const { walks, message } = await loadPage({ videos: 3 });
  message({ type: 'SET_SPEED', speed: 2 });
  assert.equal(walks.full, 1);
});

test('PERF: a new <video> added to the page triggers one scan, shared by speed-apply and overlay sync', async () => {
  const { dom, doc, walks } = await loadPage();
  walks.full = 0;
  doc.body.appendChild(doc.createElement('video'));
  for (let i = 0; i < 4; i += 1) await tick(); // MutationObserver callback is async
  assert.equal(walks.full, 1);
  assert.equal(doc.querySelectorAll('video').length, 2);
  void dom;
});
