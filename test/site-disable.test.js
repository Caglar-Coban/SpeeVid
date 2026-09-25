// "Disable on this site": disabling must stick while the page is open, and
// the video must keep the page's own speed after that. Loads the REAL content script.
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

function createChromeMock(syncSettings, messageListeners, changeListeners) {
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
      onChanged: { addListener: (fn) => changeListeners.push(fn) },
    },
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function loadPage(settings, bodyHtml = '<video id="v"></video><audio id="a"></audio>') {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
    url: 'https://example.com/watch',
    pretendToBeVisual: true,
    runScripts: 'dangerously',
  });
  const ctx = dom.getInternalVMContext();
  const messageListeners = [];
  const changeListeners = [];
  dom.window.chrome = createChromeMock(settings, messageListeners, changeListeners);
  dom.window.requestAnimationFrame = () => 0;
  dom.window.cancelAnimationFrame = () => {};
  [...SHARED_SCRIPTS, CONTENT_SCRIPT].forEach((relPath) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, relPath), 'utf8'), ctx, { filename: relPath });
  });
  for (let i = 0; i < 6; i += 1) await tick();
  const doc = dom.window.document;
  return {
    dom,
    doc,
    video: doc.getElementById('v'),
    audio: doc.getElementById('a'),
    setSpeed: (speed) => messageListeners.forEach((fn) => fn({ type: 'SET_SPEED', speed }, {}, () => {})),
    getState: () => {
      let response;
      messageListeners.forEach((fn) => fn({ type: 'GET_STATE' }, {}, (r) => { response = r; }));
      return response;
    },
    // What chrome.storage.onChanged delivers when the popup flips a setting.
    settingChanged: (key, newValue) => changeListeners.forEach((fn) => fn({ [key]: { newValue } }, 'sync')),
    hosts: () => Array.from(doc.documentElement.children).filter((el) => el.shadowRoot && el.shadowRoot.querySelector('.badge')),
  };
}

test('disabling the site while a video plays puts it back to 1x and it stays there', async () => {
  const { video, setSpeed, settingChanged } = await loadPage({});
  setSpeed(2);
  assert.equal(video.playbackRate, 2);
  settingChanged('disabledSites', ['example.com']);
  assert.equal(video.playbackRate, 1);
  video.dispatchEvent(new video.ownerDocument.defaultView.Event('playing'));
  assert.equal(video.playbackRate, 1, 'a later playing event must not re-apply the speed');
});

test('once disabled, the page\'s own speed changes are left alone', async () => {
  const { video, setSpeed, settingChanged } = await loadPage({});
  setSpeed(2);
  settingChanged('disabledSites', ['example.com']);
  video.playbackRate = 1.25;
  assert.equal(video.playbackRate, 1.25);
});

test('SET_SPEED is ignored while disabled', async () => {
  const { video, setSpeed } = await loadPage({ disabledSites: ['example.com'] });
  setSpeed(2);
  assert.equal(video.playbackRate, 1);
});

test('re-enabling applies the speed again', async () => {
  const { video, setSpeed, settingChanged } = await loadPage({});
  setSpeed(2);
  settingChanged('disabledSites', ['example.com']);
  settingChanged('disabledSites', []);
  assert.equal(video.playbackRate, 2);
});
