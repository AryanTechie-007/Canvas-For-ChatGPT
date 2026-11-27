<p align="center">
  <img src="assets/icon.png" width="128" height="128" alt="Canvas for ChatGPT Icon" />
</p>

# Canvas for ChatGPT

Transform [ChatGPT](https://chatgpt.com/) into a calm, ultra-responsive workspace with zero-lag rendering, per-chat wallpapers, bundled offline presets, local image/GIF/video uploads, custom web URLs, and real-time visual controls.

---

## Features

- **Zero-Lag CSS-First Engine (`v3.2`)**: Rebuilt with a streamlined pure-CSS rendering pipeline that eliminates `getComputedStyle` and `getBoundingClientRect` DOM walks, attribute-thrashing observers, and heavy `:has()` layout scans during ChatGPT streaming and typing.
- **Per-Chat & Route-Aware Wallpapers**: Assign unique wallpapers and visual tuning to individual conversations (`/c/<id>`, `/g/<gpt-id>/c/<id>`), Custom GPTs (`/g/<gpt-id>`), and shared links (`/share/<id>`), or fall back to a **Global Default** on Home (`/`) and uncustomized chats.
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
- **Per-Chat Wallpapers Manager**: View every customized chat by readable title and route key, reset individual chats (`✕`), reset the active chat to default, or clear all overrides at once.

---

## Privacy & Permissions

**Canvas for ChatGPT runs 100% client-side.**

- Zero telemetry, zero analytics, and zero external backend API calls.
- All preferences, saved backgrounds, uploaded media data URLs, and per-chat mappings are stored locally in `chrome.storage.local` (backed by `@plasmohq/storage` with a direct `chrome.storage.local` fallback, preserving existing `chatgpt-custom-bg:cfg` data across upgrades).
- **Manifest permissions**:
  - `storage`: Stores settings and per-chat wallpaper mappings locally.
  - `unlimitedStorage`: Allows storing large uploaded wallpapers, GIFs, and looping videos without hitting the standard 10 MB local quota.
  - Host permissions `https://chatgpt.com/*` and `https://chat.openai.com/*`: Injects the content script (`document_idle`) exclusively on ChatGPT.

---

## Browser Installation Guide

Download the latest **`canvas-for-chatgpt-v3.2.zip`** from [GitHub Releases](https://github.com/AryanTechie-007/Canvas-For-ChatGPT/releases) and **extract the ZIP** into a permanent folder on your computer (for example, `Documents/Canvas-For-ChatGPT`).

> **Note:** Do not delete the extracted folder after installing—your browser loads the extension from that folder. If you build from source, run `npm install && npm run build` first and select `build/chrome-mv3-prod`.

### Google Chrome / Brave / Edge / Opera / Vivaldi / Arc

1. Open your browser's extensions page (`chrome://extensions`, `brave://extensions`, `edge://extensions`, `opera://extensions`, `vivaldi://extensions`, or `arc://extensions`).
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
4. Open [chatgpt.com](https://chatgpt.com/) and click the **Canvas for ChatGPT** toolbar icon.

### Updating an Existing Installation

Extract the new release ZIP over your existing extension folder, click **Reload** (`↻`) on the **Canvas for ChatGPT** card on your extensions page, and refresh ChatGPT.

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

- `content.ts`: Zero-lag content script managing backdrop injection, O(1) DOM recovery, one-time composer pill binding, SPA route transitions, and theme synchronization.
- `lib/types.ts`: Shared TypeScript contracts for config, routes, and messages.
- `lib/presets.ts`: Bundled offline WebP/GIF preset wallpapers.
- `lib/media.ts`: Media validation, video detection, and local `FileReader` data URL conversion.
- `lib/routing.ts`: ChatGPT route resolution (`/c/...`, `/g/.../c/...`, `/g/...`, `/share/...`, `/`) and DOM title extraction.
- `lib/storage.ts`: Normalized configuration persistence via `@plasmohq/storage` and `chrome.storage.local`.
- `lib/styles.ts`: Pure-CSS transparency, frosted sidebar, rounded composer pill, and dark/light gradient definitions.
- `popup.tsx` & `popup.css`: Toolbar popup UI with **This Chat** vs **Global Default** scope tabs, presets, local upload, custom URLs, coalesced real-time sliders, and **Per-Chat Wallpapers** manager.
- `options.tsx` & `options.css`: Options and documentation viewer rendering `README.md`.
- `test/run-browser-tests.js`: End-to-end headless Chromium CDP suite validating Manifest V3 build compliance, extension popup + content integration, per-chat routing, frosted desktop/mobile sidebars, rounded composer transparency, streaming performance, and Options page rendering.

---

## License

Licensed under the MIT License. Copyright (c) 2026 AryanTechie-007.
