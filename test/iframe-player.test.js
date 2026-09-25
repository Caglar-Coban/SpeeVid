// Sites whose player is an iframe from another domain: the frame holding the
// <video> is not the top frame, and its own hostname isn't the site the user
// is on. Per-site settings (disable list, remembered/pinned speed) must follow
// the page's host, which the frame learns from the background script. Runs
// the REAL content script inside a real jsdom <iframe>.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const SCRIPTS = [
  'src/shared/speed-utils.js',
  'src/shared/i18n.js',
  'src/shared/theme.js',
  'src/shared/storage-helpers.js',
  'src/shared/storage.js',
  'src/shared/messages.js',
  'src/content/content.js',
];
const ROOT = path.join(__dirname, '..');
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createChromeMock({ syncSettings = {}, localStore = {}, pageHost = 'example.com', sent = [] }) {
  const messageListeners = [];
  const changeListeners = [];
  const chrome = {
    runtime: {
      getURL: (p) => 'chrome-extension://test/' + p,
      sendMessage: (msg, cb) => {
        sent.push(msg);
        // What the background answers for GET_PAGE_HOST (null = unknown).
        const response = msg.type === 'GET_PAGE_HOST' ? { host: pageHost } : undefined;
        if (cb) setTimeout(() => cb(response), 0);
      },
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
  return { chrome, messageListeners, changeListeners };
}

// A top page with no video of its own, and an iframe (about:blank, so its own
// hostname is empty -> 'local-file') holding the player.
async function loadEmbed(options = {}) {
  const dom = new JSDOM('<!doctype html><html><body><iframe id="player"></iframe></body></html>', {
    url: 'https://example.com/watch',
    pretendToBeVisual: true,
    runScripts: 'dangerously',
  });
  const frameWin = dom.window.document.getElementById('player').contentWindow;
  frameWin.document.body.innerHTML = '<video id="v"></video>';
  const mock = createChromeMock(options);
  frameWin.chrome = mock.chrome;
  frameWin.requestAnimationFrame = () => 0;
  frameWin.cancelAnimationFrame = () => {};
  SCRIPTS.forEach((relPath) => frameWin.eval(fs.readFileSync(path.join(ROOT, relPath), 'utf8')));
  for (let i = 0; i < 8; i += 1) await tick();
  return {
    frameWin,
    video: frameWin.document.getElementById('v'),
    setSpeed: (speed) => mock.messageListeners.forEach((fn) => fn({ type: 'SET_SPEED', speed }, {}, () => {})),
    ask: (message) => {
      let response;
      mock.messageListeners.forEach((fn) => fn(message, {}, (r) => { response = r; }));
      return response;
    },
    settingChanged: (key, newValue) => mock.changeListeners.forEach((fn) => fn({ [key]: { newValue } }, 'sync')),
  };
}

test('the iframe really is a non-top frame (sanity check for this harness)', async () => {
  const { frameWin } = await loadEmbed();
  assert.notEqual(frameWin.top, frameWin.self);
});

test('the iframe asks the background which site the tab is on', async () => {
  const sent = [];
  await loadEmbed({ sent });
  assert.ok(sent.some((m) => m.type === 'GET_PAGE_HOST'));
});

test('FIX: disabling the page\'s site also disables the player iframe', async () => {
  const { video, setSpeed } = await loadEmbed({ syncSettings: { disabledSites: ['example.com'] } });
  setSpeed(2);
  assert.equal(video.playbackRate, 1);
});

test('FIX: disabling the site live resets the player iframe to 1x', async () => {
  const { video, setSpeed, settingChanged } = await loadEmbed();
  setSpeed(2);
  assert.equal(video.playbackRate, 2);
  settingChanged('disabledSites', ['example.com']);
  assert.equal(video.playbackRate, 1);
});

test('a rule for the player\'s own domain still covers the embed', async () => {
  const { video, setSpeed } = await loadEmbed({ syncSettings: { disabledSites: ['local-file'] } });
  setSpeed(2);
  assert.equal(video.playbackRate, 1);
});

test('FIX: a speed set in the player iframe is remembered for the page\'s site', async () => {
  const localStore = {};
  const { setSpeed } = await loadEmbed({ localStore });
  setSpeed(1.75);
  await wait(400);
  assert.equal(JSON.stringify(localStore.siteSpeeds), JSON.stringify({ 'example.com': 1.75 }));
});

test('FIX: the player iframe starts at the speed remembered for the page\'s site', async () => {
  const { video } = await loadEmbed({ localStore: { siteSpeeds: { 'example.com': 1.5 } } });
  assert.equal(video.playbackRate, 1.5);
});

test('a pinned speed for the page\'s site applies inside the iframe', async () => {
  const { video } = await loadEmbed({ localStore: { siteSpeeds: { 'example.com': 1.5 }, pinnedSpeeds: { 'example.com': 3 } } });
  assert.equal(video.playbackRate, 3);
});

test('when the background can\'t tell, the frame falls back to its own host', async () => {
  const { video } = await loadEmbed({ pageHost: null, localStore: { siteSpeeds: { 'local-file': 1.25 } } });
  assert.equal(video.playbackRate, 1.25);
});

test('the player iframe answers the popup\'s "any frame with media?" question', async () => {
  const { ask, setSpeed } = await loadEmbed();
  setSpeed(2);
  const response = ask({ type: 'GET_STATE', onlyWithMedia: true });
  assert.equal(response.videoCount, 1);
  assert.equal(response.speed, 2);
});

test('the player iframe sends the toolbar badge (the top frame has no video)', async () => {
  const sent = [];
  const { setSpeed } = await loadEmbed({ sent });
  setSpeed(2);
  const badge = sent.filter((m) => m.type === 'SPEED_CHANGED').pop();
  assert.equal(badge.text, '2');
});
