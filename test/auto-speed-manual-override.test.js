// Reproduces "I set auto speed to a 5 minute threshold, manually put a short
// video at 2x, and it kept dropping back to 1x by itself": auto
// speed-by-duration re-evaluates on every 'loadedmetadata'/'durationchange'
// (and when a new <video> is bound), and used to happily overwrite a speed the
// user had just chosen by hand. This loads the REAL content script into
// jsdom and drives it with real DOM events and the real SET_SPEED message.
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

// Threshold 5 min, short videos 1x, long videos 2x — the user's exact setup.
async function loadPage() {
  const dom = new JSDOM('<!doctype html><html><body><video id="main" src="movie.mp4"></video></body></html>', {
    url: 'https://example.com/watch',
    pretendToBeVisual: true,
    runScripts: 'dangerously',
  });
  const ctx = dom.getInternalVMContext();
  const messageListeners = [];
  dom.window.chrome = createChromeMock(
    { autoSpeedByDuration: true, autoSpeedThresholdMinutes: 5, autoSpeedShortSpeed: 1, autoSpeedLongSpeed: 2 },
    messageListeners
  );
  dom.window.requestAnimationFrame = () => 0;
  dom.window.cancelAnimationFrame = () => {};

  [...SHARED_SCRIPTS, CONTENT_SCRIPT].forEach((relPath) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, relPath), 'utf8'), ctx, { filename: relPath });
  });
  for (let i = 0; i < 6; i += 1) await tick();

  const main = dom.window.document.getElementById('main');
  return {
    dom,
    main,
    // What the popup / overlay presets / keyboard do: an explicit user choice.
    manualSetSpeed: (speed) => messageListeners.forEach((fn) => fn({ type: 'SET_SPEED', speed }, {}, () => {})),
  };
}

function setDuration(video, seconds) {
  Object.defineProperty(video, 'duration', { configurable: true, get: () => seconds });
}

function fire(dom, video, type) {
  video.dispatchEvent(new dom.window.Event(type));
}

test('baseline: auto speed puts a short video at the short speed and a long one at the long speed', async () => {
  const { dom, main } = await loadPage();
  setDuration(main, 200); // < 5 min
  fire(dom, main, 'loadedmetadata');
  assert.equal(main.playbackRate, 1);
  setDuration(main, 900); // > 5 min
  fire(dom, main, 'durationchange');
  assert.equal(main.playbackRate, 2);
});

test('BUG: a speed the user set by hand survives a later durationchange on the same video', async () => {
  const { dom, main, manualSetSpeed } = await loadPage();
  setDuration(main, 200);
  fire(dom, main, 'loadedmetadata'); // auto -> 1x
  manualSetSpeed(2);
  assert.equal(main.playbackRate, 2);

  // Streaming players re-fire durationchange as they learn more about the
  // stream. None of these may undo the user's manual choice.
  fire(dom, main, 'durationchange');
  fire(dom, main, 'durationchange');
  fire(dom, main, 'loadedmetadata');
  assert.equal(main.playbackRate, 2);
});

test('BUG: another <video> (hover preview, ad) loading metadata cannot undo a manual speed', async () => {
  const { dom, main, manualSetSpeed } = await loadPage();
  setDuration(main, 200);
  fire(dom, main, 'loadedmetadata');
  manualSetSpeed(2);

  // Added after the manual change, so it was never itself "touched" by the
  // user — but it shares the frame's single speed, so it must not flip it.
  const preview = dom.window.document.createElement('video');
  dom.window.document.body.appendChild(preview);
  await tick();
  setDuration(preview, 30);
  fire(dom, preview, 'loadedmetadata');
  assert.equal(main.playbackRate, 2);
  assert.equal(preview.playbackRate, 2);
});

test('auto speed still applies to genuinely new content once the manually-set video loads a new source', async () => {
  const { dom, main, manualSetSpeed } = await loadPage();
  setDuration(main, 200);
  fire(dom, main, 'loadedmetadata');
  manualSetSpeed(2.5);

  // SPA "next video": same element, new source. 'emptied' is what the
  // browser fires when an element with media starts loading a new one.
  fire(dom, main, 'emptied');
  setDuration(main, 900);
  fire(dom, main, 'loadedmetadata');
  assert.equal(main.playbackRate, 2, 'long video should get the long auto speed again');
});
