// Shortcut keys are consumed once they act, "time saved" isn't counted twice
// for two videos playing at once, and quick successive storage updates don't
// overwrite each other. Loads the REAL content script / storage module.
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
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// `asyncLocal` makes storage.local answer on a later tick, like the real API,
// which is what lets two read-modify-writes interleave.
function createChromeMock({ syncSettings = {}, localStore = {}, asyncLocal = false } = {}) {
  const messageListeners = [];
  const later = (fn) => (asyncLocal ? setTimeout(fn, 5) : fn());
  return {
    messageListeners,
    localStore,
    chrome: {
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
              result[k] = Object.prototype.hasOwnProperty.call(localStore, k) ? JSON.parse(JSON.stringify(localStore[k])) : defaults[k];
            });
            later(() => cb(result));
          },
          set: (patch, cb) => later(() => { Object.assign(localStore, patch); if (cb) cb(); }),
        },
        onChanged: { addListener: () => {} },
      },
    },
  };
}

async function loadPage(bodyHtml, mockOptions) {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
    url: 'https://example.com/watch',
    pretendToBeVisual: true,
    runScripts: 'dangerously',
  });
  const ctx = dom.getInternalVMContext();
  const mock = createChromeMock(mockOptions);
  dom.window.chrome = mock.chrome;
  dom.window.requestAnimationFrame = () => 0;
  dom.window.cancelAnimationFrame = () => {};
  [...SHARED_SCRIPTS, CONTENT_SCRIPT].forEach((relPath) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, relPath), 'utf8'), ctx, { filename: relPath });
  });
  for (let i = 0; i < 6; i += 1) await tick();
  return { dom, mock };
}

function keydown(dom, key, code) {
  const event = new dom.window.KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true });
  dom.window.document.body.dispatchEvent(event);
  return event;
}

test('FIX: a shortcut that changed the speed is not also handed to the page', async () => {
  const { dom } = await loadPage('<video id="v"></video>');
  const event = keydown(dom, 's', 'KeyS');
  assert.equal(dom.window.document.getElementById('v').playbackRate, 1.1);
  assert.equal(event.defaultPrevented, true);
});

test('a key that is not bound to anything is left alone', async () => {
  const { dom } = await loadPage('<video id="v"></video>');
  const event = keydown(dom, 'k', 'KeyK');
  assert.equal(event.defaultPrevented, false);
});

test('a bound key on a page with no video is left alone', async () => {
  const { dom } = await loadPage('<p>no media</p>');
  const event = keydown(dom, 's', 'KeyS');
  assert.equal(event.defaultPrevented, false);
});

test('FIX: two videos playing at once count the elapsed time once, not twice', async () => {
  const { dom, mock } = await loadPage('<video id="a"></video><video id="b"></video>');
  mock.messageListeners.forEach((fn) => fn({ type: 'SET_SPEED', speed: 2 }, {}, () => {}));
  const doc = dom.window.document;
  const videos = [doc.getElementById('a'), doc.getElementById('b')];
  videos.forEach((v) => Object.defineProperty(v, 'paused', { get: () => false }));
  let now = 1000000;
  dom.window.Date.now = () => now;
  const fire = () => videos.forEach((v) => v.dispatchEvent(new dom.window.Event('timeupdate')));
  fire();
  now += 1000;
  fire();
  dom.window.dispatchEvent(new dom.window.Event('pagehide'));
  await tick();
  // 1 real second at 2x saves 1 second — not 2.
  assert.equal(mock.localStore.timeSavedSeconds, 1);
});

function loadStorage(mockOptions) {
  const mock = createChromeMock(mockOptions);
  const sandbox = { chrome: mock.chrome, setTimeout, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  SHARED_SCRIPTS.forEach((relPath) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, relPath), 'utf8'), sandbox, { filename: relPath });
  });
  return { storage: sandbox.SpeeVid.storage, localStore: mock.localStore };
}

test('FIX: removing two pinned sites in quick succession removes both', async () => {
  const { storage, localStore } = loadStorage({
    asyncLocal: true,
    localStore: { pinnedSpeeds: { 'a.com': 2, 'b.com': 3, 'c.com': 1.5 } },
  });
  await Promise.all([storage.removePinnedSpeed('a.com'), storage.removePinnedSpeed('b.com')]);
  assert.deepEqual(Object.keys(localStore.pinnedSpeeds), ['c.com']);
});

test('FIX: quick successive site-speed saves for different sites all persist', async () => {
  const { storage, localStore } = loadStorage({ asyncLocal: true });
  await Promise.all([storage.setSiteSpeed('a.com', 2), storage.setSiteSpeed('b.com', 1.5)]);
  assert.equal(JSON.stringify(localStore.siteSpeeds), JSON.stringify({ 'a.com': 2, 'b.com': 1.5 }));
});

test('concurrent time-saved additions all add up', async () => {
  const { storage, localStore } = loadStorage({ asyncLocal: true });
  await Promise.all([storage.addTimeSaved(5), storage.addTimeSaved(7)]);
  assert.equal(localStore.timeSavedSeconds, 12);
});
