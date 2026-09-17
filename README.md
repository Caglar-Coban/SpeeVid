<p align="right"><strong>English</strong> · <a href="README.tr.md">Türkçe</a></p>

# SpeeVid

A browser extension (Chrome and Firefox) for controlling video playback speed on any website.

## Features

- Works with HTML5 videos on any site, 0.25x-16x.
- Optional floating speed control that appears over the video, with a configurable corner position and an auto-hide mode (fades out when idle, flashes back on any speed change).
- Keyboard shortcuts: `S` speed up, `D` slow down, `A` reset (1x), `Q` jump to a custom speed by default — all rebindable from settings. The custom speed itself (0.25x-16x) is also adjustable. Pressing reset or the custom-speed key again while already at that exact speed toggles back to whatever speed you were at before.
- Popup UI available in 13 languages (default: English), switchable from the settings screen.
- Remembers the last speed used per site. You can also pin a deliberate default speed for a site (distinct from "last used"), which then wins on every page load; with "Apply to all tabs" enabled, a single speed syncs live across every open tab instead, overriding both.
- Shows the current speed as a badge on the toolbar icon (hidden at 1x).
- Can be fully disabled per site, either with the quick toggle in the popup or a manageable site list in settings.
- All settings, shortcuts, remembered speeds, and pinned speeds can be backed up to a JSON file and restored on another device (settings screen).
- Automatically follows the system's light/dark theme.

## Installation (developer mode)

**Chrome**

1. Go to `chrome://extensions` in Chrome.
2. Enable "Developer mode" in the top right.
3. Click "Load unpacked" and select this project folder.

**Firefox**

1. Run `npm run build:firefox` (writes a Firefox-ready copy to `dist/firefox/`).
2. Go to `about:debugging#/runtime/this-firefox` in Firefox.
3. Click "Load Temporary Add-on" and select `dist/firefox/manifest.json`.

Firefox reloads temporary add-ons only for the current session — after restarting the browser, repeat step 3. See [Cross-browser support](#cross-browser-support) below for how the two builds are kept in sync.

## Development

Shared logic lives under `src/shared/` as plain JS functions and is tested with `node --test`:

```
npm test
```

To regenerate the icons (Windows, PowerShell):

```
powershell -ExecutionPolicy Bypass -File tools/generate-icons.ps1
```

## Cross-browser support

`src/` and `icons/` are shared as-is between Chrome and Firefox — only the manifest differs (Chrome uses a `service_worker` background; Firefox uses a plain `background.scripts` list, since Firefox's MV3 service worker support is still inconsistent). `manifest.json` is Chrome's; `manifest.firefox.json` is Firefox's, and `npm run build:firefox` assembles `dist/firefox/` from it plus the shared source — no separate branch, no duplicated logic. `test/manifest.test.js` checks the two manifests stay in sync (same content scripts, icons, permissions) whenever either one changes.
