// Chrome loads this file as a service worker, where importScripts() is the
// only way to pull in the shared modules. Firefox's MV3 background instead
// uses a plain `background.scripts` list (see manifest.firefox.json) that
// already loads each shared file as its own <script>, so importScripts is
// both unavailable and unnecessary there.
if (typeof importScripts === 'function') {
  importScripts(
    '../shared/speed-utils.js',
    '../shared/i18n.js',
    '../shared/theme.js',
    '../shared/storage-helpers.js',
    '../shared/storage.js',
    '../shared/messages.js'
  );
}

chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.sync.get(SpeeVid.storage.DEFAULT_SETTINGS, function (stored) {
    chrome.storage.sync.set(stored);
  });
});

// Fallback only — content.js always sends the user's real accent color
// along with the message. This just guards against a message that somehow
// arrives without one (an old cached content script mid-update, etc.).
var DEFAULT_BADGE_COLOR = '#6552e0';

var MESSAGE_TYPES = SpeeVid.messages.MESSAGE_TYPES;

// Same fallback content.js uses for its own hostname, so a file:// page gets
// the same key from either side.
function hostFromUrl(url) {
  if (typeof url !== 'string' || !url) return null;
  try {
    var parsed = new URL(url);
    if (parsed.protocol === 'file:') return 'local-file';
    return parsed.hostname ? parsed.hostname.toLowerCase() : null;
  } catch (err) {
    return null;
  }
}

// The top frame always sends SPEED_CHANGED; an iframe only does when it
// holds the page's player (see content.js sendBadgeUpdate()). Both key their
// speed and disabled state on the tab's own site, so they agree.
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || !sender.tab || typeof sender.tab.id !== 'number') return false;

  if (message.type === MESSAGE_TYPES.SPEED_CHANGED) {
    var color = SpeeVid.theme.isValidHexColor(message.color) ? message.color : DEFAULT_BADGE_COLOR;
    chrome.action.setBadgeText({ text: message.text || '', tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color: color, tabId: sender.tab.id });
    return false;
  }

  // A cross-origin iframe can't read window.top.location, but per-site
  // settings belong to the page the user is on, not the embedded player's
  // domain. sender.tab.url is that page; when the browser doesn't expose it,
  // ask the tab's top frame directly.
  if (message.type === MESSAGE_TYPES.GET_PAGE_HOST) {
    var host = hostFromUrl(sender.tab.url);
    if (host) {
      sendResponse({ host: host });
      return false;
    }
    chrome.tabs.sendMessage(sender.tab.id, { type: MESSAGE_TYPES.GET_FRAME_HOST }, { frameId: 0 }, function (response) {
      void chrome.runtime.lastError;
      sendResponse({ host: response && typeof response.host === 'string' ? response.host : null });
    });
    return true;
  }

  return false;
});
