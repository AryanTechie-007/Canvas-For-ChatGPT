# Privacy Policy — Canvas for ChatGPT

**Last updated:** November 28, 2026

**Canvas for ChatGPT** is a 100% client-side browser extension designed with privacy as a core principle.

## Data Collection & Usage

- **No personal data collected:** Canvas for ChatGPT does **not** collect, read, log, transmit, or sell your ChatGPT prompts, AI responses, browsing history, IP address, cookies, or account details.
- **No analytics or telemetry:** The extension contains zero analytics SDKs, crash trackers, ads, or external API endpoints.
- **Local-only storage:** Your selected background URL, uploaded media (stored locally as data URLs), saved backdrop gallery, and visual settings (image opacity, image blur, gradient opacity, and sidebar frosting) are stored solely on your device in `chrome.storage.local` (or `browser.storage.local` in Firefox).

## Permissions Explained

- **`storage`**: Saves your selected backdrop, saved backgrounds list, and visual control preferences locally on your device.
- **`unlimitedStorage`**: Allows you to upload and store high-resolution local images, animated GIFs, or looping videos (`MP4`, `WEBM`, `OGG`, `MOV`) without hitting the default 10 MB storage limit.
- **Host permissions (`https://chatgpt.com/*`, `https://chat.openai.com/*`)**: Required solely so the extension's content script can render your chosen backdrop layer and apply transparent surface styling on ChatGPT pages.

## Contact

For privacy questions or security reports, open an issue at:
https://github.com/AryanTechie-007/Canvas-For-ChatGPT/issues
