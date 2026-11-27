# Store Submission Guide & Ready-to-Paste Metadata

Use the packaged release archives in `build/` and the promotional assets in `assets/store/` to publish **Canvas for ChatGPT** on all major browser extension stores.

## Release Packages (`npm run package:all`)

- **Chrome Web Store / Microsoft Edge Add-ons / Opera Add-ons**: `build/canvas-for-chatgpt-v3.4.zip` (`chrome-mv3`)
- **Firefox Add-ons (AMO)**: `build/canvas-for-chatgpt-v3.4-firefox.zip` (`firefox-mv2`, includes `browser_specific_settings.gecko` with `data_collection_permissions: { required: ["none"] }`)

## Store Assets (`assets/store/`)

- **Extension Icons**: `icon-128.png` (`128×128`), `icon-96.png` (`96×96`), `icon-48.png` (`48×48`), `icon-300.png` (`300×300` for Edge Add-ons)
- **Screenshots (`1280×800`)**:
  1. `screenshot-1-frosted-aurora.png` — Frosted-glass sidebar & custom backdrop
  2. `screenshot-2-clean-space.png` — Clean transparent (`0%`) sidebar & Cosmic Nebula backdrop
  3. `screenshot-3-popup-controls.png` — Toolbar popup with presets, media upload, and real-time sliders
- **Promotional Tiles**:
  - `promo-small-440x280.png` (`440×280` — Chrome Web Store Small Promo Tile)
  - `promo-marquee-1400x560.png` (`1400×560` — Chrome Web Store Marquee / Hero Banner)

---

## Listing Copy

### Extension Name
`Canvas for ChatGPT`

### Short Description (132 chars max — `123` chars)
`Customize ChatGPT with zero-lag wallpapers, animated GIFs, video backdrops, blur & opacity sliders, and Clean/Frosted sidebars.`

### Detailed Description
```text
Transform ChatGPT into a calm, ultra-responsive workspace tailored to your style.

Canvas for ChatGPT lets you personalize chatgpt.com and chat.openai.com with zero-lag custom wallpapers, animated GIFs, or looping videos—all running 100% locally in your browser.

✨ KEY FEATURES
• Zero-Lag CSS-First Engine: Streamlined pure-CSS backdrop & transparency rendering built so streaming responses and typing stay buttery smooth.
• 4 Instant Offline Presets: Twilight Peaks, Cosmic Nebula, Misty Pines, and Northern Aurora (Animated GIF) bundled right inside the extension.
• Upload Local Media: Import images, animated GIFs, or looping MP4, WEBM, OGG, and MOV videos directly from your computer.
• Custom Web URLs & Saved Library: Paste any direct image or video URL and manage your saved backdrops with one-click thumbnail previews.
• Real-Time Visual Controls: Fine-tune Image Opacity (0%–100%), Image Blur (0px–100px), and readability Gradient Opacity (0%–100%).
• Clean vs. Frosted Sidebar: Choose a completely transparent Clean (0%) sidebar or dial in exact Sidebar Frosting (1%–100%) in real time.
• Automatic Dark & Light Mode Harmony: Adapts seamlessly to ChatGPT's theme, keeps the prompt composer as a clean rounded pill, and preserves dialogs, popovers, and menus.

🔒 100% PRIVATE
• Runs completely client-side with zero telemetry, analytics, or external servers.
• All preferences and uploaded media stay on your device in local browser storage.
```

### Category & URLs
- **Category**: Productivity (or Appearance / Tools)
- **Homepage URL**: `https://aryantechie-007.github.io/Canvas-For-ChatGPT/`
- **Support URL**: `https://github.com/AryanTechie-007/Canvas-For-ChatGPT/issues`
- **Privacy Policy URL**: `https://aryantechie-007.github.io/Canvas-For-ChatGPT/privacy.html`

---

## Chrome Web Store Privacy Tab & Permission Justifications

- **Single Purpose Description**:
  `Customize the visual background, blur, opacity, gradient overlay, and sidebar frosting of ChatGPT (chatgpt.com and chat.openai.com).`
- **Data Usage Disclosures**: Select **"No, my extension does not collect or use user data"** (all 9 data types unchecked).
- **Permission Justifications**:
  - `storage`: `Stores the user's selected backdrop URL, saved backgrounds list, enabled toggle state, and visual slider settings (opacity, blur, gradient, sidebar frosting) locally in chrome.storage.local.`
  - `unlimitedStorage`: `Allows users to upload local high-resolution images, animated GIFs, and looping background videos (MP4/WEBM/OGG/MOV) stored locally as data URLs without exceeding the standard 10 MB storage quota.`
  - `Host permissions (https://chatgpt.com/*, https://chat.openai.com/*)`: `Required exclusively to inject the client-side content script that renders the background canvas layer and makes ChatGPT layout wrappers transparent.`

---

## Store Submission Steps

1. **Chrome Web Store** (`https://chrome.google.com/webstore/devconsole`):
   - Upload `build/canvas-for-chatgpt-v3.4.zip`, paste the listing copy & justifications above, upload `assets/store/screenshot-*.png` and `assets/store/promo-small-440x280.png`, set Privacy Policy URL to `https://aryantechie-007.github.io/Canvas-For-ChatGPT/privacy.html`, and submit for review.
2. **Microsoft Edge Add-ons** (`https://partner.microsoft.com/dashboard/microsoftedge`):
   - Free registration. Upload `build/canvas-for-chatgpt-v3.4.zip`, `assets/store/icon-300.png`, screenshots, and Privacy Policy URL.
3. **Opera Add-ons** (`https://addons.opera.com/developer/`):
   - Free registration. Upload `build/canvas-for-chatgpt-v3.4.zip`, screenshots, and description.
4. **Firefox Add-ons (AMO)** (`https://addons.mozilla.org/developers/`):
   - Free registration. Upload `build/canvas-for-chatgpt-v3.4-firefox.zip`. If AMO requests source verification for the bundled TypeScript/Plasmo build, zip the repo source (excluding `node_modules/` and `build/`) and note build steps: `Node.js 18+`, `npm ci && npm run build:firefox`.
