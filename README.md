<p align="right"><strong>English</strong> · <a href="README.tr.md">Türkçe</a></p>

# SpeeVid

A Chrome extension for controlling video playback speed on any website.

## Features

- Works with HTML5 videos on any site, 0.25x-16x.
- Optional floating speed control that appears over the video (toggle in settings).
- Keyboard shortcuts: `S` speed up, `D` slow down, `A` reset (1x), `Q` jump to a custom speed by default — all rebindable from settings. The custom speed itself (0.25x-16x) is also adjustable.
- Popup UI available in 13 languages (default: English), switchable from the settings screen.
- Remembers the last speed used per site; with "Apply to all tabs" enabled, a single speed syncs live across every open tab instead.
- Shows the current speed as a badge on the toolbar icon (hidden at 1x).
- Can be fully disabled per site, either with the quick toggle in the popup or a manageable site list in settings.
- All settings, shortcuts, and remembered speeds can be backed up to a JSON file and restored on another device (settings screen).
- Automatically follows the system's light/dark theme.

## Installation (developer mode)

1. Go to `chrome://extensions` in Chrome.
2. Enable "Developer mode" in the top right.
3. Click "Load unpacked" and select this project folder.

## Development

Shared logic lives under `src/shared/` as plain JS functions and is tested with `node --test`:

```
npm test
```

To regenerate the icons (Windows, PowerShell):

```
powershell -ExecutionPolicy Bypass -File tools/generate-icons.ps1
```
