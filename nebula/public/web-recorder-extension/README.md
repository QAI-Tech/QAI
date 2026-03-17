# QAI Web Recorder Chrome Extension

A Chrome extension that captures user interactions (clicks, scrolls, typing) on any website for QAI test case generation.

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select this folder (`public/web-recorder-extension`)

## Usage

1. Click the extension icon in Chrome toolbar
2. Click "Start Capturing"
3. Navigate to any website and interact with it
4. Your clicks, scrolls, and typing will be captured
5. Click "Stop Capturing" when done
6. Export the captured actions as JSON

### Auto-start from Graph Editor (QAI app)

If you open a web product via **Capture live flow** in the Graph Editor, the app can ask the extension to start capturing automatically (no need to click the extension popup), as long as:

- The extension is installed and enabled
- You are on a supported Graph Editor origin (see `manifest.json` content script matches)

## Features

- **Click tracking**: Captures coordinates and element info (tag, id, class, text)
- **Scroll tracking**: Captures scroll position and delta
- **Keyboard tracking**: Captures typed text and special keys (Enter, Backspace, Tab, Escape)
- **Focus tracking**: Captures when input fields are focused
- **Visual indicator**: Shows a red "Capturing" badge on pages being captured
- **Export**: Download actions as JSON or copy to clipboard

## Files

- `manifest.json` - Extension configuration
- `background.js` - Service worker that manages capturing state
- `content.js` - Injected into every page to capture events
- `popup.html/js` - Extension popup UI

## Icons

You need to add icon files:

- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

You can use any icon or generate simple ones. For now, the extension will work without icons but Chrome will show a default placeholder.
