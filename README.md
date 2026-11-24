<p align="center">
  <img src="assets/icon.png" width="128" height="128" alt="Canvas for ChatGPT Icon" />
</p>

# Canvas for ChatGPT

Canvas for ChatGPT transforms your ChatGPT interface into a personalized, focused workspace. Customize your chat backdrop with rich imagery and dynamic blur effects, fine-tune opacity, and personalize your experience with light and dark mode adaptations.

---

## ✨ Features

- **Personalized Canvas Backdrops**
  - Select from a curated gallery of high-definition backdrops or input custom image and GIF URLs.
  - Granular control over background opacity, Gaussian blur radius, and dark/light overlay gradients.
  - Theme-aware styles that harmonize with ChatGPT light and dark modes.

- **Privacy & Security**
  - Operates completely client-side in your browser.
  - Zero telemetry, analytics, or external server calls.
  - Settings are preserved solely in `chrome.storage.local`.

---

## 🚀 Installation

### Unpacked Extension (Developer Mode)

1. Download or clone this repository:
   ```bash
   git clone https://github.com/AryanTechie-007/Canvas-For-ChatGPT.git
   ```
2. Open your Chromium browser (Brave, Google Chrome, Microsoft Edge, Opera).
3. Navigate to `chrome://extensions/` (or `brave://extensions/`).
4. Turn on **Developer mode** via the switch in the top-right corner.
5. Click **Load unpacked**.
6. Select the project build directory (`build/chrome-mv3-prod`) or download the release zip, extract it, and select the extracted folder.
7. Open [ChatGPT](https://chatgpt.com) and click the Canvas for ChatGPT extension icon in your browser toolbar to customize your experience.

---

## 🛠️ Development

### Prerequisites

- Node.js 18 or later
- npm or pnpm

### Getting Started

```bash
# Install dependencies
npm install

# Start development with live reload
npm run dev

# Run comprehensive browser test suite
npm test

# Build production bundle
npm run build

# Package extension zip
npm run package
```

### Architecture

- `content.ts`: Main injection script managing backdrop rendering and DOM observation.
- `popup.tsx`: Toolbar popup UI for real-time background, blur, and opacity preferences.
- `options.tsx`: Documentation and options viewing portal.
- `test/run-browser-tests.js`: End-to-end CDP test suite validating background injection, DOM mutation recovery, and theme adaptation.

---

## 🔒 Privacy

Canvas for ChatGPT is built with user privacy as a foundational principle:
- **Client-only execution**: Operates solely within browser tab contexts on `https://chatgpt.com/*` and `https://chat.openai.com/*`.
- **No data harvesting**: No prompts, completions, telemetry, or user tokens are gathered, stored remotely, or transmitted.
- **Local configuration**: Custom URLs and styling preferences remain on your device in local browser extension storage.

---

## 📄 License

Licensed under the MIT License. Copyright (c) 2026 AryanTechie-007.
