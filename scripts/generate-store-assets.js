#!/usr/bin/env node
/**
 * Generates resized PNG icons (48, 96, 128, 300) and captures real 1280x800
 * store screenshots & 440x280 / 1400x560 promo tiles via headless Chromium CDP.
 */

const { execSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "build", "chrome-mv3-prod");
const STORE_DIR = path.join(ROOT_DIR, "assets", "store");
const DOCS_ASSETS_DIR = path.join(ROOT_DIR, "docs", "assets");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function findChromeBinary() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.BROWSER_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(
      process.env.LOCALAPPDATA || "",
      "Google\\Chrome\\Application\\chrome.exe"
    ),
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"
  ].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error("Chrome/Edge/Brave binary not found");
  return found;
}

function resizeIcons() {
  const srcIcon = path.join(ROOT_DIR, "assets", "icon.png");
  const sizes = [48, 96, 128, 300];
  const psLines = [
    "Add-Type -AssemblyName System.Drawing",
    `$src = [System.Drawing.Image]::FromFile('${srcIcon.replace(/'/g, "''")}')`
  ];
  for (const s of sizes) {
    const outPath = path.join(STORE_DIR, `icon-${s}.png`).replace(/'/g, "''");
    psLines.push(
      `$bmp = New-Object System.Drawing.Bitmap(${s}, ${s})`,
      `$g = [System.Drawing.Graphics]::FromImage($bmp)`,
      `$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic`,
      `$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality`,
      `$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality`,
      `$g.DrawImage($src, 0, 0, ${s}, ${s})`,
      `$bmp.Save('${outPath}', [System.Drawing.Imaging.ImageFormat]::Png)`,
      `$g.Dispose()`,
      `$bmp.Dispose()`
    );
  }
  psLines.push("$src.Dispose()");
  execSync(
    `powershell -NoProfile -Command "${psLines.join("; ")}"`,
    { stdio: "inherit" }
  );
  console.log("Generated resized PNG icons (48, 96, 128, 300) in assets/store/");
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
  }
  async connect() {
    await new Promise((res, rej) => {
      this.ws.addEventListener("open", res, { once: true });
      this.ws.addEventListener("error", rej, { once: true });
    });
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined) {
        const entry = this.pending.get(msg.id);
        if (entry) {
          this.pending.delete(msg.id);
          msg.error ? entry.rej(new Error(msg.error.message)) : entry.res(msg.result);
        }
        return;
      }
      if (msg.method) {
        const list = this.events.get(`${msg.sessionId || ""}:${msg.method}`) || [];
        for (const fn of list) fn(msg.params, msg.sessionId);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify(payload));
    });
  }
  on(method, fn, sessionId = "") {
    const key = `${sessionId}:${method}`;
    const list = this.events.get(key) || [];
    list.push(fn);
    this.events.set(key, list);
  }
  async evalIn(sessionId, expression) {
    const r = await this.send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      sessionId
    );
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result?.value;
  }
  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

function buildShowcaseChatGptHtml() {
  return `<!doctype html>
<html lang="en" class="dark" data-theme="dark">
<head>
<meta charset="utf-8" />
<title>Canvas for ChatGPT</title>
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; width: 100%; height: 100%;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
    color: #eceff4; background: #212121; overflow: hidden;
  }
  #__next { display: flex; width: 100vw; height: 100vh; }
  #stage-slideover-sidebar {
    width: 260px; height: 100vh; display: flex; flex-direction: column;
    border-right: 1px solid rgba(255,255,255,0.1); flex-shrink: 0;
  }
  nav[aria-label="Chat history"] {
    display: flex; flex-direction: column; height: 100%; padding: 12px 10px;
  }
  .sb-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 8px 12px; font-weight: 700; font-size: 15px;
  }
  .sb-item {
    display: flex; align-items: center; gap: 9px; padding: 8px 10px;
    border-radius: 9px; font-size: 13px; color: #e5e8ef; text-decoration: none;
    margin-bottom: 2px;
  }
  .sb-item.active { background: rgba(255,255,255,0.12); font-weight: 600; }
  .sb-section {
    font-size: 11px; color: rgba(235,238,245,0.55); padding: 14px 10px 6px;
    font-weight: 600; letter-spacing: 0.02em;
  }
  .sb-scroll { flex: 1; overflow: hidden; }
  .sb-footer {
    display: flex; align-items: center; gap: 10px; padding: 10px 8px 4px;
    border-top: 1px solid rgba(255,255,255,0.1);
  }
  .avatar {
    width: 30px; height: 30px; border-radius: 999px;
    background: #10a37f; color: #fff; font-weight: 700; font-size: 12px;
    display: grid; place-items: center;
  }
  main {
    flex: 1; display: flex; flex-direction: column; height: 100vh;
    justify-content: space-between; padding: 16px 40px 26px;
  }
  header[data-testid="page-header"] {
    display: flex; align-items: center; justify-content: space-between;
    font-size: 15px; font-weight: 600; color: rgba(255,255,255,0.92);
  }
  .pill-badge {
    font-size: 11px; padding: 4px 10px; border-radius: 999px;
    background: rgba(16,163,127,0.2); border: 1px solid rgba(16,163,127,0.45);
    color: #9ff5dc;
  }
  .thread {
    max-width: 740px; width: 100%; margin: 0 auto; display: flex;
    flex-direction: column; gap: 22px; padding: 20px 0;
  }
  .user-msg {
    align-self: flex-end; max-width: 72%;
    background: rgba(48, 50, 58, 0.86); border: 1px solid rgba(255,255,255,0.12);
    padding: 12px 16px; border-radius: 18px; font-size: 14px; line-height: 1.5;
  }
  .assistant-msg {
    font-size: 14.5px; line-height: 1.65; color: #f3f5f8;
    text-shadow: 0 1px 2px rgba(0,0,0,0.45);
  }
  .assistant-msg pre {
    background: rgba(13, 15, 20, 0.88); border: 1px solid rgba(255,255,255,0.12);
    border-radius: 12px; padding: 14px 16px; font-family: ui-monospace, Consolas, monospace;
    font-size: 12.5px; line-height: 1.5; color: #a7f3d0; margin-top: 12px;
  }
  footer[data-ds-composer] {
    max-width: 740px; width: 100%; margin: 0 auto;
  }
  [data-composer-surface] {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px; border-radius: 26px;
    border: 1px solid rgba(255,255,255,0.14);
    box-shadow: 0 12px 32px rgba(0,0,0,0.35);
  }
  #prompt-textarea { color: rgba(255,255,255,0.65); font-size: 14px; }
  .send-btn {
    width: 32px; height: 32px; border-radius: 999px; background: #ffffff;
    color: #111; display: grid; place-items: center; font-weight: 700; font-size: 15px;
  }
</style>
</head>
<body class="dark">
  <div id="__next">
    <aside id="stage-slideover-sidebar">
      <nav aria-label="Chat history">
        <div class="sb-head"><span>ChatGPT</span><span>◧</span></div>
        <a class="sb-item active" href="/">✎ New chat</a>
        <a class="sb-item" href="/gpts">❖ Explore GPTs</a>
        <div class="sb-section">Recent Chats</div>
        <div class="sb-scroll">
          <a class="sb-item" href="/c/1">Distributed Systems Notes</a>
          <a class="sb-item" href="/c/2">TypeScript Architecture Review</a>
          <a class="sb-item" href="/c/3">CSS GPU Compositing Tips</a>
          <a class="sb-item" href="/c/4">Shader &amp; Blur Pipeline</a>
          <a class="sb-item" href="/c/5">System Design Checklist</a>
          <a class="sb-item" href="/c/6">Algorithms Practice Plan</a>
        </div>
        <div class="sb-footer">
          <div class="avatar">AS</div>
          <div>
            <div style="font-size:12.5px;font-weight:600;">Workspace</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.55);">Canvas Active</div>
          </div>
        </div>
      </nav>
    </aside>
    <main role="main">
      <header data-testid="page-header">
        <span>ChatGPT ▾</span>
        <span class="pill-badge">Canvas v3.4</span>
      </header>
      <section class="thread">
        <div class="user-msg">
          Help me design a fast, distraction-free study schedule for systems programming.
        </div>
        <div class="assistant-msg">
          <p>Here is a focused 4-block weekly cadence balancing theory and low-level implementation:</p>
          <pre>const blocks = [
  { focus: "Memory &amp; Allocators", hours: 3 },
  { focus: "Concurrency &amp; Async I/O", hours: 3 },
  { focus: "Profiling &amp; Flamegraphs", hours: 2 }
];</pre>
        </div>
      </section>
      <footer data-ds-composer>
        <form>
          <div data-composer-surface>
            <div id="prompt-textarea" contenteditable="true">Ask anything...</div>
            <div class="send-btn">↑</div>
          </div>
        </form>
      </footer>
    </main>
  </div>
</body>
</html>`;
}

function buildPromoHtml(width, height, isMarquee, iconDataUrl, bgDataUrl) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; width: ${width}px; height: ${height}px; overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
    color: #f4f7fb; background: #0c0e14;
  }
  .wrap {
    position: relative; width: 100%; height: 100%; display: flex;
    align-items: center; justify-content: space-between;
    padding: ${isMarquee ? "52px 72px" : "24px 28px"};
  }
  .bg {
    position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
    opacity: 0.65; filter: saturate(115%);
  }
  .scrim {
    position: absolute; inset: 0;
    background: linear-gradient(125deg, rgba(10,12,18,0.88) 15%, rgba(12,16,24,0.62) 65%, rgba(16,163,127,0.22) 100%);
  }
  .content { position: relative; z-index: 2; max-width: ${isMarquee ? "680px" : "100%"}; }
  .badge-row { display: flex; align-items: center; gap: ${isMarquee ? "16px" : "12px"}; margin-bottom: ${isMarquee ? "22px" : "12px"}; }
  .icon {
    width: ${isMarquee ? "64px" : "46px"}; height: ${isMarquee ? "64px" : "46px"};
    border-radius: ${isMarquee ? "16px" : "12px"}; box-shadow: 0 10px 24px rgba(0,0,0,0.45);
  }
  .eyebrow {
    display: inline-block; font-size: ${isMarquee ? "13px" : "10.5px"}; font-weight: 700;
    letter-spacing: 0.06em; text-transform: uppercase;
    color: #7ee8c9; background: rgba(16,163,127,0.2);
    border: 1px solid rgba(16,163,127,0.45); padding: 4px 10px; border-radius: 999px;
  }
  h1 {
    margin: 0 0 ${isMarquee ? "14px" : "8px"}; font-size: ${isMarquee ? "50px" : "26px"};
    line-height: 1.08; letter-spacing: -0.025em; font-weight: 800;
  }
  p {
    margin: 0; font-size: ${isMarquee ? "20px" : "12.5px"}; line-height: 1.45;
    color: rgba(236, 242, 248, 0.85);
  }
  .chips {
    display: flex; flex-wrap: wrap; gap: ${isMarquee ? "10px" : "6px"};
    margin-top: ${isMarquee ? "24px" : "14px"};
  }
  .chip {
    font-size: ${isMarquee ? "13px" : "10.5px"}; font-weight: 600;
    padding: ${isMarquee ? "6px 14px" : "4px 9px"}; border-radius: 999px;
    background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.18);
  }
  ${
    isMarquee
      ? `.preview-card {
    position: relative; z-index: 2; width: 420px; height: 320px;
    border-radius: 18px; border: 1px solid rgba(255,255,255,0.2);
    background: rgba(18, 21, 28, 0.72); backdrop-filter: blur(16px);
    box-shadow: 0 24px 60px rgba(0,0,0,0.5); padding: 20px;
    display: flex; flex-direction: column; justify-content: space-between;
  }`
      : ""
  }
</style>
</head>
<body>
  <div class="wrap">
    <img class="bg" src="${bgDataUrl}" alt="" />
    <div class="scrim"></div>
    <div class="content">
      <div class="badge-row">
        <img class="icon" src="${iconDataUrl}" alt="" />
        <span class="eyebrow">100% Client-Side • Zero Lag</span>
      </div>
      <h1>Canvas for ChatGPT</h1>
      <p>Custom images, animated GIFs &amp; looping video backdrops with Clean or Frosted sidebars.</p>
      <div class="chips">
        <span class="chip">Offline Presets</span>
        <span class="chip">Blur &amp; Opacity</span>
        <span class="chip">Clean / Frosted Sidebar</span>
        <span class="chip">Chrome &amp; Firefox</span>
      </div>
    </div>
    ${
      isMarquee
        ? `<div class="preview-card">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-weight:700;font-size:15px;">Visual Controls</span>
        <span style="font-size:11px;color:#7ee8c9;background:rgba(16,163,127,0.2);padding:3px 9px;border-radius:999px;">Real-time</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px;"><span>Image Opacity</span><span>0.78</span></div><div style="height:6px;border-radius:999px;background:rgba(255,255,255,0.14);"><div style="width:78%;height:100%;border-radius:999px;background:#10a37f;"></div></div></div>
        <div><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px;"><span>Image Blur</span><span>12px</span></div><div style="height:6px;border-radius:999px;background:rgba(255,255,255,0.14);"><div style="width:18%;height:100%;border-radius:999px;background:#10a37f;"></div></div></div>
        <div><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px;"><span>Gradient Opacity</span><span>0.55</span></div><div style="height:6px;border-radius:999px;background:rgba(255,255,255,0.14);"><div style="width:55%;height:100%;border-radius:999px;background:#10a37f;"></div></div></div>
        <div><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px;"><span>Sidebar Frosting</span><span>Clean / 45%</span></div><div style="height:6px;border-radius:999px;background:rgba(255,255,255,0.14);"><div style="width:45%;height:100%;border-radius:999px;background:#10a37f;"></div></div></div>
      </div>
      <div style="font-size:11.5px;color:rgba(255,255,255,0.65);">Chrome • Brave • Edge • Opera • Vivaldi • Arc • Firefox</div>
    </div>`
        : ""
    }
  </div>
</body>
</html>`;
}

async function run() {
  ensureDir(STORE_DIR);
  ensureDir(DOCS_ASSETS_DIR);
  resizeIcons();

  if (!fs.existsSync(DIST_DIR)) {
    throw new Error("Run plasmo build first so build/chrome-mv3-prod exists");
  }

  const chromePath = findChromeBinary();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-assets-"));
  const proc = spawn(
    chromePath,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${userDataDir}`,
      "--enable-unsafe-extension-debugging",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1280,800",
      "about:blank"
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  const wsUrl = await new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(new Error("Chrome timeout")), 15000);
    proc.stderr.on("data", (c) => {
      stderr += c.toString();
      const m = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
  });

  const cdp = new CDPClient(wsUrl);
  await cdp.connect();

  try {
    const loadRes = await cdp.send("Extensions.loadUnpacked", { path: DIST_DIR });
    const extensionId = loadRes.id;

    const { targetId: chatTargetId } = await cdp.send("Target.createTarget", {
      url: "about:blank"
    });
    const { sessionId: chatSession } = await cdp.send("Target.attachToTarget", {
      targetId: chatTargetId,
      flatten: true
    });
    await cdp.send("Page.enable", {}, chatSession);
    await cdp.send("Runtime.enable", {}, chatSession);
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
      chatSession
    );
    await cdp.send(
      "Fetch.enable",
      { patterns: [{ urlPattern: "https://chatgpt.com/*" }] },
      chatSession
    );
    cdp.on(
      "Fetch.requestPaused",
      async (params) => {
        if (params.request.url.startsWith("https://chatgpt.com/")) {
          const html = buildShowcaseChatGptHtml();
          await cdp.send(
            "Fetch.fulfillRequest",
            {
              requestId: params.requestId,
              responseCode: 200,
              responseHeaders: [{ name: "Content-Type", value: "text/html; charset=utf-8" }],
              body: Buffer.from(html, "utf8").toString("base64")
            },
            chatSession
          );
        } else {
          await cdp.send("Fetch.continueRequest", { requestId: params.requestId }, chatSession);
        }
      },
      chatSession
    );

    await cdp.send("Page.navigate", { url: "https://chatgpt.com/c/showcase" }, chatSession);
    await new Promise((r) => setTimeout(r, 1200));

    // Open popup to manipulate live presets cleanly
    const { targetId: popupTargetId } = await cdp.send("Target.createTarget", {
      url: `chrome-extension://${extensionId}/popup.html`
    });
    const { sessionId: popupSession } = await cdp.send("Target.attachToTarget", {
      targetId: popupTargetId,
      flatten: true
    });
    await cdp.send("Runtime.enable", {}, popupSession);
    await new Promise((r) => setTimeout(r, 500));

    // Screenshot 1: Frosted Aurora
    await cdp.evalIn(
      popupSession,
      `document.querySelector('[data-testid="preset-aurora"]')?.click()`
    );
    await cdp.send("Target.activateTarget", { targetId: chatTargetId });
    await new Promise((r) => setTimeout(r, 500));
    const shot1 = await cdp.send("Page.captureScreenshot", { format: "png" }, chatSession);
    fs.writeFileSync(
      path.join(STORE_DIR, "screenshot-1-frosted-aurora.png"),
      Buffer.from(shot1.data, "base64")
    );

    // Screenshot 2: Clean (0%) Cosmic Nebula
    await cdp.evalIn(
      popupSession,
      `(() => {
        document.querySelector('[data-testid="preset-space"]')?.click();
        document.querySelector('[data-testid="sidebar-mode-clean"]')?.click();
      })()`
    );
    await cdp.send("Target.activateTarget", { targetId: chatTargetId });
    await new Promise((r) => setTimeout(r, 500));
    const shot2 = await cdp.send("Page.captureScreenshot", { format: "png" }, chatSession);
    fs.writeFileSync(
      path.join(STORE_DIR, "screenshot-2-clean-space.png"),
      Buffer.from(shot2.data, "base64")
    );

    // Screenshot 3: Popup framed cleanly over live Twilight Peaks canvas
    await cdp.evalIn(
      popupSession,
      `(() => {
        document.querySelector('[data-testid="preset-mountain"]')?.click();
        document.querySelector('[data-testid="sidebar-mode-frosted"]')?.click();
      })()`
    );
    await new Promise((r) => setTimeout(r, 500));
    const popupHeight = await cdp.evalIn(
      popupSession,
      `Math.min(620, Math.ceil(document.querySelector(".popup-shell")?.getBoundingClientRect().height || 600))`
    );
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width: 390, height: popupHeight, deviceScaleFactor: 1, mobile: false },
      popupSession
    );
    const popupShot = await cdp.send("Page.captureScreenshot", { format: "png" }, popupSession);
    const bgShot = await cdp.send("Page.captureScreenshot", { format: "png" }, chatSession);

    // Compose 1280x800 showcase combining real canvas screenshot + real popup screenshot
    const { targetId: composeTargetId } = await cdp.send("Target.createTarget", {
      url: "about:blank"
    });
    const { sessionId: composeSession } = await cdp.send("Target.attachToTarget", {
      targetId: composeTargetId,
      flatten: true
    });
    await cdp.send("Page.enable", {}, composeSession);
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
      composeSession
    );
    await cdp.send(
      "Page.setDocumentContent",
      {
        frameId: (await cdp.send("Page.getFrameTree", {}, composeSession)).frameTree.frame.id,
        html: `<!doctype html><html><body style="margin:0;width:1280px;height:800px;position:relative;overflow:hidden;background:#0e1015;">
          <img src="data:image/png;base64,${bgShot.data}" style="width:1280px;height:800px;display:block;object-fit:cover;" />
          <div style="position:absolute;top:22px;right:28px;border-radius:16px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.65);border:1px solid rgba(255,255,255,0.2);">
            <img src="data:image/png;base64,${popupShot.data}" style="width:390px;display:block;" />
          </div>
        </body></html>`
      },
      composeSession
    );
    await new Promise((r) => setTimeout(r, 250));
    const shot3 = await cdp.send("Page.captureScreenshot", { format: "png" }, composeSession);
    fs.writeFileSync(
      path.join(STORE_DIR, "screenshot-3-popup-controls.png"),
      Buffer.from(shot3.data, "base64")
    );

    // Promo tiles
    const iconDataUrl =
      "data:image/png;base64," +
      fs.readFileSync(path.join(ROOT_DIR, "assets", "icon.png")).toString("base64");
    const spaceDataUrl =
      "data:image/webp;base64," +
      fs.readFileSync(path.join(ROOT_DIR, "assets", "presets", "space.webp")).toString("base64");
    const mountainDataUrl =
      "data:image/webp;base64," +
      fs.readFileSync(path.join(ROOT_DIR, "assets", "presets", "mountain.webp")).toString("base64");

    const frameId = (await cdp.send("Page.getFrameTree", {}, composeSession)).frameTree.frame.id;
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width: 440, height: 280, deviceScaleFactor: 1, mobile: false },
      composeSession
    );
    await cdp.send(
      "Page.setDocumentContent",
      { frameId, html: buildPromoHtml(440, 280, false, iconDataUrl, spaceDataUrl) },
      composeSession
    );
    await new Promise((r) => setTimeout(r, 250));
    const promoSmall = await cdp.send("Page.captureScreenshot", { format: "png" }, composeSession);
    fs.writeFileSync(
      path.join(STORE_DIR, "promo-small-440x280.png"),
      Buffer.from(promoSmall.data, "base64")
    );

    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width: 1400, height: 560, deviceScaleFactor: 1, mobile: false },
      composeSession
    );
    await cdp.send(
      "Page.setDocumentContent",
      { frameId, html: buildPromoHtml(1400, 560, true, iconDataUrl, mountainDataUrl) },
      composeSession
    );
    await new Promise((r) => setTimeout(r, 250));
    const promoMarquee = await cdp.send("Page.captureScreenshot", { format: "png" }, composeSession);
    fs.writeFileSync(
      path.join(STORE_DIR, "promo-marquee-1400x560.png"),
      Buffer.from(promoMarquee.data, "base64")
    );

    // Sync web assets to docs/assets/ for GitHub Pages
    for (const file of [
      "icon-128.png",
      "screenshot-1-frosted-aurora.png",
      "screenshot-2-clean-space.png",
      "screenshot-3-popup-controls.png",
      "promo-marquee-1400x560.png"
    ]) {
      fs.copyFileSync(
        path.join(STORE_DIR, file),
        path.join(DOCS_ASSETS_DIR, file)
      );
    }

    console.log("Generated store screenshots, promo tiles, and synced docs/assets/");
  } finally {
    try {
      await cdp.send("Browser.close");
    } catch {}
    cdp.close();
    if (!proc.killed) proc.kill();
    await new Promise((r) => setTimeout(r, 200));
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
