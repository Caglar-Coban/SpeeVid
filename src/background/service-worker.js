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

// Only the content script's top frame sends this (see content.js), so each
// tab's badge always reflects that tab's own page, never an embedded iframe.
chrome.runtime.onMessage.addListener(function (message, sender) {
  if (message && message.type === SpeeVid.messages.MESSAGE_TYPES.SPEED_CHANGED && sender.tab && typeof sender.tab.id === 'number') {
    var color = SpeeVid.theme.isValidHexColor(message.color) ? message.color : DEFAULT_BADGE_COLOR;
    chrome.action.setBadgeText({ text: message.text || '', tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color: color, tabId: sender.tab.id });
  }
});
