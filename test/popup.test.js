// Popup behaviour: loads the REAL popup.html + popup.js into jsdom with a mocked
// chrome.* API, and a fake page whose answers to GET_STATE the test controls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const SCRIPTS = [
  'src/shared/speed-utils.js',
  'src/shared/i18n.js',
  'src/shared/theme.js',
  'src/shared/storage-helpers.js',
  'src/shared/storage.js',
  'src/shared/messages.js',
  'src/popup/popup.js',
];
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async () => {
  for (let i = 0; i < 10; i += 1) await tick();
};

// `frames` describes the tab: frame 0 is the top page, the rest are iframes.
// Each entry is what that frame's content script would answer to GET_STATE.
function createChromeMock({ syncSettings = {}, tabUrl = 'https://app.example.com/watch', frames }) {
  const syncWrites = [];
  const localStore = {};
  const chrome = {
    runtime: {
      getURL: (p) => 'chrome-extension://test/' + p,
      lastError: undefined,
    },
    tabs: {
      query: (_q, cb) => cb([{ id: 7, url: tabUrl }]),
      create: () => {},
      reload: () => {},
      sendMessage: (_tabId, message, optionsOrCb, maybeCb) => {
        const options = typeof optionsOrCb === 'function' ? {} : optionsOrCb;
        const cb = typeof optionsOrCb === 'function' ? optionsOrCb : maybeCb;
        const targets = typeof options.frameId === 'number' ? [frames[options.frameId]] : frames;
        let response;
        targets.some((frame) => {
          if (!frame) return false;
          if (message.type === 'GET_STATE') {
            if (message.onlyWithMedia && frame.videoCount === 0) return false;
            response = Object.assign({}, frame);
            return true;
          }
          if (message.type === 'SET_SPEED') {
            response = { speed: message.speed };
            return true;
          }
          return false;
        });
        setTimeout(() => {
          chrome.runtime.lastError = response ? undefined : { message: 'no receiver' };
          if (cb) cb(response);
          chrome.runtime.lastError = undefined;
        }, 0);
      },
    },
    storage: {
      sync: {
        get: (defaults, cb) => setTimeout(() => cb(Object.assign({}, defaults, syncSettings)), 0),
        set: (patch, cb) => {
          syncWrites.push(patch);
          Object.assign(syncSettings, patch);
          if (cb) setTimeout(cb, 0);
        },
      },
      local: {
        get: (defaults, cb) => {
          const result = {};
          Object.keys(defaults).forEach((k) => {
            result[k] = Object.prototype.hasOwnProperty.call(localStore, k) ? localStore[k] : defaults[k];
          });
          setTimeout(() => cb(result), 0);
        },
        set: (patch, cb) => {
          Object.assign(localStore, patch);
          if (cb) setTimeout(cb, 0);
        },
      },
      onChanged: { addListener: () => {} },
    },
  };
  return { chrome, syncSettings, syncWrites };
}

async function openPopup(options) {
  const html = fs.readFileSync(path.join(ROOT, 'src/popup/popup.html'), 'utf8').replace(/<script[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { url: 'chrome-extension://test/src/popup/popup.html', runScripts: 'outside-only' });
  const mock = createChromeMock(options);
  dom.window.chrome = mock.chrome;
  SCRIPTS.forEach((relPath) => dom.window.eval(fs.readFileSync(path.join(ROOT, relPath), 'utf8')));
  await settle();
  const doc = dom.window.document;
  const visible = () => ['videoSection', 'emptySection', 'disabledSection', 'reloadSection', 'unsupportedSection', 'settingsSection'].filter((id) => !doc.getElementById(id).hidden);
  return { dom, doc, mock, visible };
}

const TOP_WITH_VIDEO = { speed: 1.5, videoCount: 1, floatingEnabled: true, disabled: false };
const TOP_WITHOUT_VIDEO = { speed: 1, videoCount: 0, floatingEnabled: true, disabled: false };

test('a page with a video shows the speed controls', async () => {
  const { visible, doc } = await openPopup({ frames: [TOP_WITH_VIDEO] });
  assert.deepEqual(visible(), ['videoSection']);
  assert.equal(doc.getElementById('speedValue').textContent, '1.5x');
});

test('FIX: a player inside an iframe is found (top frame has no video)', async () => {
  const { visible, doc } = await openPopup({ frames: [TOP_WITHOUT_VIDEO, { speed: 2, videoCount: 1, floatingEnabled: true, disabled: false }] });
  assert.deepEqual(visible(), ['videoSection']);
  assert.equal(doc.getElementById('speedValue').textContent, '2x');
});

test('no media in any frame still says "no video"', async () => {
  const { visible } = await openPopup({ frames: [TOP_WITHOUT_VIDEO, TOP_WITHOUT_VIDEO] });
  assert.deepEqual(visible(), ['emptySection']);
});

test('a disabled site shows the disabled message', async () => {
  const { visible, doc } = await openPopup({ syncSettings: { disabledSites: ['app.example.com'] }, frames: [TOP_WITH_VIDEO] });
  assert.deepEqual(visible(), ['disabledSection']);
  assert.equal(doc.getElementById('siteDisableToggle').checked, true);
});

test('FIX: re-enabling shows the controls even if the page still reports the old "disabled" state', async () => {
  // The page hasn't seen the storage change yet and still answers disabled:true.
  const stale = Object.assign({}, TOP_WITH_VIDEO, { disabled: true });
  const { visible, doc, dom, mock } = await openPopup({ syncSettings: { disabledSites: ['app.example.com'] }, frames: [stale] });
  const toggle = doc.getElementById('siteDisableToggle');
  toggle.checked = false;
  toggle.dispatchEvent(new dom.window.Event('change'));
  await settle();
  assert.deepEqual(Array.from(mock.syncSettings.disabledSites), []);
  assert.deepEqual(visible(), ['videoSection']);
});

test('FIX: unticking removes the wildcard rule that disabled this site, and says so', async () => {
  const { doc, dom, mock } = await openPopup({ syncSettings: { disabledSites: ['*.example.com', 'other.com'] }, frames: [TOP_WITH_VIDEO] });
  const toggle = doc.getElementById('siteDisableToggle');
  assert.equal(toggle.checked, true);
  toggle.checked = false;
  toggle.dispatchEvent(new dom.window.Event('change'));
  await settle();
  assert.deepEqual(Array.from(mock.syncSettings.disabledSites), ['other.com']);
  assert.equal(toggle.checked, false);
  const notice = doc.getElementById('siteRuleNotice');
  assert.equal(notice.hidden, false);
  assert.match(notice.textContent, /\*\.example\.com/);
});

test('ticking the box adds just this host', async () => {
  const { doc, dom, mock, visible } = await openPopup({ frames: [TOP_WITH_VIDEO] });
  const toggle = doc.getElementById('siteDisableToggle');
  toggle.checked = true;
  toggle.dispatchEvent(new dom.window.Event('change'));
  await settle();
  assert.deepEqual(Array.from(mock.syncSettings.disabledSites), ['app.example.com']);
  assert.deepEqual(visible(), ['disabledSection']);
});

function pressKey(dom, key, code) {
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, code, bubbles: true }));
}

test('FIX: binding a key already used by another action swaps the two', async () => {
  const { doc, dom, mock } = await openPopup({ frames: [TOP_WITH_VIDEO] });
  doc.querySelector('.key-btn[data-action="increase"]').click();
  pressKey(dom, 'd', 'KeyD');
  await settle();
  const saved = mock.syncSettings.keyBindings;
  assert.equal(saved.increase, 'd');
  assert.equal(saved.decrease, 's');
});

test('FIX: Escape cancels rebinding without changing anything', async () => {
  const { doc, dom, mock } = await openPopup({ frames: [TOP_WITH_VIDEO] });
  const btn = doc.querySelector('.key-btn[data-action="reset"]');
  btn.click();
  assert.equal(btn.classList.contains('listening'), true);
  pressKey(dom, 'Escape', 'Escape');
  await settle();
  assert.equal(btn.classList.contains('listening'), false);
  assert.equal(btn.textContent, 'a');
  assert.equal(mock.syncSettings.keyBindings, undefined);
});

test('FIX: dragging the accent color picker previews but saves only once, on change', async () => {
  const { doc, dom, mock } = await openPopup({ frames: [TOP_WITH_VIDEO] });
  const input = doc.getElementById('accentColorInput');
  ['#112233', '#223344', '#334455'].forEach((value) => {
    input.value = value;
    input.dispatchEvent(new dom.window.Event('input'));
  });
  assert.equal(mock.syncWrites.filter((w) => 'accentColor' in w).length, 0);
  assert.equal(doc.documentElement.style.getPropertyValue('--sv-accent'), '#334455');
  input.dispatchEvent(new dom.window.Event('change'));
  assert.deepEqual(mock.syncWrites.filter((w) => 'accentColor' in w).map((w) => w.accentColor), ['#334455']);
});
