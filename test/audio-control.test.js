// "Control audio" (off by default): podcast/music pages use <audio>, but
// sites also use hidden <audio> elements for notification/effect sounds, so
// audio is only sped up when the user opts in. Loads the REAL content script.
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
    url: 'https://example.com/podcast',
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

test('default (off): <audio> is left alone, <video> is sped up', async () => {
  const { video, audio, setSpeed } = await loadPage({});
  setSpeed(2);
  assert.equal(video.playbackRate, 2);
  assert.equal(audio.playbackRate, 1);
});

test('FIX: with "control audio" on, <audio> follows the speed too', async () => {
  const { video, audio, setSpeed } = await loadPage({ controlAudio: true });
  setSpeed(2);
  assert.equal(video.playbackRate, 2);
  assert.equal(audio.playbackRate, 2);
});

test('an audio-only page counts as having media (popup shows the controls, not "no video")', async () => {
  const { getState } = await loadPage({ controlAudio: true }, '<audio id="a"></audio>');
  assert.equal(getState().videoCount, 1);
});

test('with the option off, an audio-only page still reports no media', async () => {
  const { getState } = await loadPage({}, '<audio id="a"></audio>');
  assert.equal(getState().videoCount, 0);
});

test('audio gets NO floating badge — only <video> does', async () => {
  const { hosts } = await loadPage({ controlAudio: true });
  assert.equal(hosts().length, 1, 'one overlay for the <video>, none for the <audio>');
});

test('turning "control audio" on applies the current speed to existing <audio> straight away', async () => {
  const { audio, setSpeed, settingChanged } = await loadPage({});
  setSpeed(2);
  assert.equal(audio.playbackRate, 1);
  settingChanged('controlAudio', true);
  assert.equal(audio.playbackRate, 2);
});

test('turning "control audio" off puts <audio> back to normal speed', async () => {
  const { video, audio, setSpeed, settingChanged } = await loadPage({ controlAudio: true });
  setSpeed(2);
  assert.equal(audio.playbackRate, 2);
  settingChanged('controlAudio', false);
  assert.equal(audio.playbackRate, 1);
  assert.equal(video.playbackRate, 2, 'video is unaffected');
});

test('a newly added <audio> picks up the speed when the option is on', async () => {
  const { doc, setSpeed } = await loadPage({ controlAudio: true });
  setSpeed(1.5);
  const late = doc.createElement('audio');
  doc.body.appendChild(late);
  for (let i = 0; i < 4; i += 1) await tick();
  assert.equal(late.playbackRate, 1.5);
});
