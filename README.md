<p align="center">
  <img src="assets/icon.png" width="128" height="128" alt="Canvas for ChatGPT Icon" />
</p>

# Canvas for ChatGPT

Transform [ChatGPT](https://chatgpt.com/) into a calm, ultra-responsive workspace with zero-lag rendering, bundled offline presets, local image/GIF/video uploads, custom web URLs, customizable sidebar frosting, and real-time visual controls.

---

## Features

- **Zero-Lag CSS-First Engine (`v3.3`)**: Streamlined pure-CSS rendering pipeline that eliminates `getComputedStyle` and `getBoundingClientRect` DOM walks, attribute-thrashing observers, and heavy `:has()` layout scans during ChatGPT streaming and typing.
- **Bundled Offline Presets**: Four built-in client-side wallpapers ready instantaneously with zero network delay — *Twilight Peaks*, *Cosmic Nebula*, *Misty Pines*, and *Northern Aurora (Animated GIF)*.
- **Local Media Uploads**: Upload static images, animated GIFs, or looping videos (`MP4`, `WEBM`, `OGG`, `MOV`) directly from your computer. Files are converted locally to data URLs and persisted in extension storage.
- **Custom Web URLs & Saved Library**: Paste any direct image or video URL, apply it immediately, and manage your saved library with live thumbnail previews.
- **Real-Time Visual Controls**:
  - **Image Opacity** (`0` to `1`)
  - **Image Blur** (`0px` to `100px`)
  - **Gradient Opacity** (`0` to `1`)
  - **Sidebar Style & Frosting** (`Clean` at `0%` for a completely transparent sidebar, or `Frosted` `1%–100%` to tune glass tint & blur)
- **Theme-Aware ChatGPT Integration**: Automatically adapts to ChatGPT's dark and light modes, lets you toggle between a completely clean transparent sidebar and customizable frosted glass (`#stage-slideover-sidebar` & `#stage-popover-sidebar`), keeps the prompt composer as a clean rounded pill without rectangular outer boxes, and protects dialogs and menus.
- **SPA & DOM Resilience**: Detects client-side route transitions (`pushState`, `replaceState`, `popstate`, Navigation API) and recovers automatically from React DOM updates via `MutationObserver`.

---

## Privacy & Permissions

**Canvas for ChatGPT runs 100% client-side.**

- Zero telemetry, zero analytics, and zero external backend API calls.
- All preferences, saved backgrounds, and uploaded media data URLs are stored locally in `chrome.storage.local` (backed by `@plasmohq/storage` with a direct `chrome.storage.local` fallback, preserving existing `chatgpt-custom-bg:cfg` data across upgrades).
- **Manifest permissions**:
  - `storage`: Stores settings and saved media locally.
  - `unlimitedStorage`: Allows storing large uploaded wallpapers, GIFs, and looping videos without hitting the standard 10 MB local quota.
  - Host permissions `https://chatgpt.com/*` and `https://chat.openai.com/*`: Injects the content script (`document_idle`) exclusively on ChatGPT.

---

## Browser Installation Guide

Download **`canvas-for-chatgpt-v3.3.zip`** from [GitHub Releases](https://github.com/AryanTechie-007/Canvas-For-ChatGPT/releases) and **extract the ZIP** into a permanent folder on your computer (do not delete that folder afterward—or if updating locally, replace/extract into your folder and click **Reload** (`↻`) on the extension card).

### Google Chrome
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the extracted folder (containing `manifest.json`).
4. Pin **Canvas for ChatGPT** from the Extensions toolbar menu and refresh `chatgpt.com`.

### Brave
1. Go to `brave://extensions`
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the extracted folder.
4. Pin it from the Extensions toolbar menu and refresh `chatgpt.com`.

### Microsoft Edge
1. Go to `edge://extensions`
2. Enable **Developer mode** (left sidebar / top-right).
3. Click **Load unpacked** and select the extracted folder.
4. Show it on the toolbar via the Extensions menu and refresh `chatgpt.com`.

### Opera / Opera GX
1. Go to `opera://extensions`
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the extracted folder.
4. Pin it via the Extensions cube icon and refresh `chatgpt.com`.

### Vivaldi
1. Go to `vivaldi://extensions`
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the extracted folder.
4. Refresh `chatgpt.com` and open the extension from the address bar.

### Arc (Chromium)
1. Go to `arc://extensions` (or `chrome://extensions`).
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the extracted folder.
4. Refresh `chatgpt.com` and open the extension from the toolbar / Site Control menu.

### Mozilla Firefox & Safari
- Not supported by this `.zip`: the packaged extension targets **Chromium Manifest V3** (`chrome-mv3`) and will not load directly in Safari or standard Firefox without a dedicated Firefox/Safari build.

---

## Development & Verification

### Prerequisites

- Node.js 18 or later
- npm or pnpm

### Commands

```bash
# Install dependencies
npm install

# Start Plasmo dev server with live reload
npm run dev

# Type-check TypeScript sources
npm run typecheck

# Build production bundle
npm run build

# Run headless Chromium CDP verification & streaming lag benchmark suite
npm test

# Package extension zip
npm run package
```

### Architecture

- `content.ts`: Zero-lag content script managing backdrop injection, O(1) DOM recovery, one-time composer pill binding, SPA route persistence, and theme synchronization.
- `lib/types.ts`: Shared TypeScript contracts for config and runtime messages.
- `lib/presets.ts`: Bundled offline WebP/GIF preset wallpapers.
- `lib/media.ts`: Media validation, video detection, and local `FileReader` data URL conversion.
- `lib/storage.ts`: Normalized configuration persistence via `@plasmohq/storage` and `chrome.storage.local`.
- `lib/styles.ts`: Pure-CSS transparency, configurable sidebar frosting, rounded composer pill, and dark/light gradient definitions.
- `popup.tsx` & `popup.css`: Toolbar popup UI with presets, local upload, custom URLs, saved library, coalesced real-time visual sliders, and Clean/Frosted sidebar controls.
- `options.tsx` & `options.css`: Options and documentation viewer rendering `README.md`.
- `test/run-browser-tests.js`: End-to-end headless Chromium CDP suite validating Manifest V3 build compliance, extension popup + content integration, SPA stability, desktop/mobile sidebar & composer styling, streaming performance, and Options page rendering.

---

## License

Licensed under the MIT License. Copyright (c) 2026 AryanTechie-007.
