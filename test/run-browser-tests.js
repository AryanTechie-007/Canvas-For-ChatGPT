#!/usr/bin/env node
/**
 * End-to-end Chromium Manifest V3, CDP & zero-lag streaming verification suite
 * for Canvas for ChatGPT v3.3.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "build", "chrome-mv3-prod");

function findChromeBinary() {
  const envPaths = [
    process.env.CHROME_PATH,
    process.env.BROWSER_PATH,
    process.env.CHROME_BIN
  ].filter(Boolean);
  for (const p of envPaths) {
    if (fs.existsSync(p)) return p;
  }

  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(
      process.env.LOCALAPPDATA || "",
      "Google\\Chrome\\Application\\chrome.exe"
    ),
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "Could not locate a Chromium/Chrome/Edge/Brave binary. Set CHROME_PATH environment variable."
  );
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.eventHandlers = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });

    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== undefined) {
        const entry = this.pending.get(msg.id);
        if (entry) {
          this.pending.delete(msg.id);
          if (msg.error) {
            entry.reject(
              new Error(
                `${entry.method}: ${msg.error.message || JSON.stringify(msg.error)}`
              )
            );
          } else {
            entry.resolve(msg.result);
          }
        }
        return;
      }

      if (msg.method) {
        const key = `${msg.sessionId || ""}:${msg.method}`;
        const list = this.eventHandlers.get(key) || [];
        for (const fn of list) {
          fn(msg.params, msg.sessionId);
        }
        const globalList = this.eventHandlers.get(`*:${msg.method}`) || [];
        for (const fn of globalList) {
          fn(msg.params, msg.sessionId);
        }
      }
    });
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify(payload));
    });
  }

  on(method, handler, sessionId = "*") {
    const key = `${sessionId}:${method}`;
    const list = this.eventHandlers.get(key) || [];
    list.push(handler);
    this.eventHandlers.set(key, list);
  }

  async evalInSession(sessionId, expression) {
    const res = await this.send(
      "Runtime.evaluate",
      {
        expression,
        awaitPromise: true,
        returnByValue: true
      },
      sessionId
    );
    if (res.exceptionDetails) {
      const desc =
        res.exceptionDetails.exception?.description ||
        res.exceptionDetails.text ||
        "Runtime.evaluate exception";
      throw new Error(desc);
    }
    return res.result?.value;
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // Ignore close errors
    }
  }
}

async function waitFor(
  fn,
  timeoutMs = 8000,
  intervalMs = 100,
  label = "condition"
) {
  const start = Date.now();
  let lastVal;
  while (Date.now() - start < timeoutMs) {
    lastVal = await fn();
    if (lastVal) return lastVal;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for ${label} (last=${JSON.stringify(lastVal)})`
  );
}

function buildMockChatGptHtml(
  initialPath = "/c/chat-alpha",
  title = "Alpha Architecture Discussion - ChatGPT"
) {
  return `<!doctype html>
<html lang="en" class="dark" data-theme="dark">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    :root {
      --bg-primary: #212121;
      --main-surface-primary: #212121;
      --sidebar-surface-primary: #171717;
    }
    html, body {
      margin: 0;
      padding: 0;
      background-color: rgb(33, 33, 33);
      color: #ececec;
      font-family: system-ui, sans-serif;
    }
    #__next {
      display: flex;
      min-height: 100vh;
      width: 100vw;
      background-color: rgb(33, 33, 33);
    }
    #stage-slideover-sidebar {
      width: 260px;
      background-color: rgb(23, 23, 23);
    }
    main {
      flex: 1;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 24px;
      background-color: rgb(33, 33, 33);
    }
    [role="dialog"] {
      background-color: rgb(42, 42, 46);
      padding: 16px;
      border-radius: 12px;
    }
    [data-composer-surface] {
      background-color: rgb(48, 48, 48);
      border-radius: 26px;
      padding: 12px 16px;
    }
  </style>
</head>
<body class="dark">
  <div id="__next" class="bg-token-main-surface-primary">
    <aside id="stage-slideover-sidebar">
      <nav aria-label="Chat history">
        <a href="/c/chat-alpha" aria-current="${initialPath === "/c/chat-alpha" ? "page" : "false"}">Alpha Architecture Discussion</a>
        <a href="/c/chat-beta" aria-current="${initialPath === "/c/chat-beta" ? "page" : "false"}">Beta Shader Notes</a>
      </nav>
    </aside>
    <main role="main" class="bg-token-bg-primary">
      <header data-testid="page-header" class="bg-token-bg-primary">ChatGPT</header>
      <section id="thread">
        <article data-message-author-role="user">
          <div>Design a lag-free workspace.</div>
        </article>
        <article data-message-author-role="assistant">
          <div class="markdown"><p>Here is your zero-lag customizable canvas.</p></div>
        </article>
      </section>
      <div role="dialog" aria-label="Settings modal">Modal Content</div>
      <footer data-ds-composer>
        <form>
          <div data-composer-surface>
            <div id="prompt-textarea" contenteditable="true">Message ChatGPT...</div>
          </div>
        </form>
      </footer>
    </main>
  </div>
</body>
</html>`;
}

function verifyManifestV3Build() {
  console.log("[1/10] Verifying Manifest V3 build output...");
  const manifestPath = path.join(DIST_DIR, "manifest.json");
  assert.ok(
    fs.existsSync(manifestPath),
    `Missing built manifest at ${manifestPath}`
  );

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8")
  );

  assert.equal(manifest.manifest_version, 3, "manifest_version must be 3");
  assert.equal(manifest.name, "Canvas for ChatGPT");
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.version_name, "v3.4");
  assert.equal(
    manifest.browser_specific_settings,
    undefined,
    "Chromium manifest should not contain browser_specific_settings"
  );

  const versionParts = String(manifest.version || "").split(".");
  assert.ok(
    versionParts.length >= 1 &&
      versionParts.length <= 4 &&
      versionParts.every(
        (p) => /^\d+$/.test(p) && Number(p) >= 0 && Number(p) <= 65535
      ),
    `Invalid Chromium manifest version: ${manifest.version}`
  );

  assert.ok(
    manifest.permissions.includes("storage"),
    "Missing storage permission"
  );
  assert.ok(
    manifest.permissions.includes("unlimitedStorage"),
    "Missing unlimitedStorage permission"
  );
  assert.ok(
    manifest.host_permissions.includes("https://chatgpt.com/*"),
    "Missing https://chatgpt.com/* host permission"
  );
  assert.ok(
    manifest.host_permissions.includes("https://chat.openai.com/*"),
    "Missing https://chat.openai.com/* host permission"
  );

  const cs = (manifest.content_scripts || []).find(
    (entry) =>
      (entry.matches || []).includes("https://chatgpt.com/*") &&
      (entry.matches || []).includes("https://chat.openai.com/*")
  );
  assert.ok(cs, "Missing content_scripts entry for ChatGPT hosts");
  assert.equal(cs.run_at, "document_idle");
  for (const jsFile of cs.js || []) {
    assert.ok(
      fs.existsSync(path.join(DIST_DIR, jsFile)),
      `Missing content script file ${jsFile}`
    );
  }

  assert.ok(manifest.action?.default_popup, "Missing action.default_popup");
  assert.ok(
    fs.existsSync(path.join(DIST_DIR, manifest.action.default_popup)),
    "Missing built popup HTML"
  );
  const optionsPage = manifest.options_ui?.page || manifest.options_page;
  assert.ok(optionsPage, "Missing options page in manifest");
  assert.ok(
    fs.existsSync(path.join(DIST_DIR, optionsPage)),
    "Missing built options HTML"
  );

  // Verify Firefox MV2 build if present
  const ffDistDir = path.join(ROOT_DIR, "build", "firefox-mv2-prod");
  const ffManifestPath = path.join(ffDistDir, "manifest.json");
  assert.ok(
    fs.existsSync(ffManifestPath),
    `Missing built Firefox manifest at ${ffManifestPath}`
  );
  const ffManifest = JSON.parse(fs.readFileSync(ffManifestPath, "utf8"));
  assert.equal(ffManifest.manifest_version, 2, "Firefox manifest_version must be 2");
  assert.equal(ffManifest.version, pkg.version);
  assert.equal(
    ffManifest.version_name,
    undefined,
    "Firefox manifest must not include Chromium version_name"
  );
  assert.ok(
    ffManifest.browser_specific_settings?.gecko?.id,
    "Missing browser_specific_settings.gecko.id in Firefox manifest"
  );
  assert.deepEqual(
    ffManifest.browser_specific_settings?.gecko?.data_collection_permissions?.required,
    ["none"],
    "Firefox manifest must declare data_collection_permissions required: ['none']"
  );
  assert.ok(
    ffManifest.permissions.includes("https://chatgpt.com/*") &&
      ffManifest.permissions.includes("https://chat.openai.com/*"),
    "Firefox MV2 manifest missing ChatGPT host permissions"
  );
  assert.ok(ffManifest.browser_action?.default_popup, "Missing Firefox browser_action.default_popup");
  for (const jsFile of ffManifest.content_scripts?.[0]?.js || []) {
    assert.ok(
      fs.existsSync(path.join(ffDistDir, jsFile)),
      `Missing Firefox content script file ${jsFile}`
    );
  }
  console.log("  ✓ Chromium MV3 & Firefox MV2 build outputs verified");
}

async function launchChromeWithCdp(chromePath) {
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "canvas-chatgpt-test-")
  );
  const proc = spawn(
    chromePath,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${userDataDir}`,
      "--enable-unsafe-extension-debugging",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--window-size=1280,800",
      "about:blank"
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  const wsUrl = await new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => {
      reject(
        new Error(`Chrome did not expose DevTools WebSocket in time.\n${stderr}`)
      );
    }, 15000);

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });

    proc.once("exit", (code) => {
      clearTimeout(timer);
      reject(
        new Error(`Chrome exited prematurely with code ${code}.\n${stderr}`)
      );
    });
  });

  const cdp = new CDPClient(wsUrl);
  await cdp.connect();

  const cleanup = async () => {
    try {
      await Promise.race([
        cdp.send("Browser.close"),
        new Promise((r) => setTimeout(r, 1500))
      ]);
    } catch {
      // Ignore
    }
    cdp.close();
    if (!proc.killed) {
      proc.kill();
    }
    await new Promise((r) => setTimeout(r, 300));
    try {
      fs.rmSync(userDataDir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 150
      });
    } catch {
      // Best-effort temp cleanup on Windows
    }
  };

  return { cdp, cleanup };
}

async function runTests() {
  verifyManifestV3Build();

  const chromePath = findChromeBinary();
  console.log(`[2/10] Launching headless Chromium (${chromePath})...`);
  const { cdp, cleanup } = await launchChromeWithCdp(chromePath);

  try {
    const loadRes = await cdp.send("Extensions.loadUnpacked", {
      path: DIST_DIR
    });
    const extensionId = loadRes.id;
    assert.ok(extensionId, "Failed to load unpacked extension via CDP");
    console.log(`  ✓ Loaded extension id=${extensionId}`);

    const { targetId: chatTargetId } = await cdp.send("Target.createTarget", {
      url: "about:blank"
    });
    const { sessionId: chatSession } = await cdp.send(
      "Target.attachToTarget",
      {
        targetId: chatTargetId,
        flatten: true
      }
    );

    await cdp.send("Page.enable", {}, chatSession);
    await cdp.send("Runtime.enable", {}, chatSession);
    await cdp.send(
      "Fetch.enable",
      {
        patterns: [
          { urlPattern: "https://chatgpt.com/*" },
          { urlPattern: "https://chat.openai.com/*" },
          { urlPattern: "https://media.example.test/*" }
        ]
      },
      chatSession
    );

    cdp.on(
      "Fetch.requestPaused",
      async (params) => {
        const reqUrl = params.request.url;
        if (
          reqUrl.startsWith("https://chatgpt.com/") ||
          reqUrl.startsWith("https://chat.openai.com/")
        ) {
          const parsed = new URL(reqUrl);
          const body = buildMockChatGptHtml(parsed.pathname);
          await cdp.send(
            "Fetch.fulfillRequest",
            {
              requestId: params.requestId,
              responseCode: 200,
              responseHeaders: [
                { name: "Content-Type", value: "text/html; charset=utf-8" }
              ],
              body: Buffer.from(body, "utf8").toString("base64")
            },
            chatSession
          );
          return;
        }

        if (reqUrl.startsWith("https://media.example.test/")) {
          const png1x1 =
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
          await cdp.send(
            "Fetch.fulfillRequest",
            {
              requestId: params.requestId,
              responseCode: 200,
              responseHeaders: [{ name: "Content-Type", value: "image/png" }],
              body: png1x1
            },
            chatSession
          );
          return;
        }

        await cdp.send(
          "Fetch.continueRequest",
          { requestId: params.requestId },
          chatSession
        );
      },
      chatSession
    );

    console.log(
      "[3/10] Navigating to https://chatgpt.com/c/chat-alpha & verifying backdrop injection..."
    );
    await cdp.send(
      "Page.navigate",
      { url: "https://chatgpt.com/c/chat-alpha" },
      chatSession
    );

    const injectedState = await waitFor(
      async () => {
        return cdp.evalInSession(
          chatSession,
          `(() => {
            const backdrop = document.getElementById("canvas-for-chatgpt-backdrop");
            const media = document.getElementById("canvas-for-chatgpt-media");
            const grad = document.getElementById("canvas-for-chatgpt-gradient");
            const styleEl = document.getElementById("canvas-for-chatgpt-styles");
            if (!backdrop || !media || !grad || !styleEl) return null;
            const bStyle = getComputedStyle(backdrop);
            const mainStyle = getComputedStyle(document.querySelector("main"));
            const composer = document.querySelector("[data-composer-surface]");
            const composerStyle = getComputedStyle(composer);
            const dialogStyle = getComputedStyle(document.querySelector('[role="dialog"]'));
            return {
              enabledClass: document.documentElement.classList.contains("canvas-for-chatgpt-enabled"),
              darkClass: document.documentElement.classList.contains("canvas-for-chatgpt-dark"),
              backdropTag: backdrop.tagName,
              pointerEvents: bStyle.pointerEvents,
              position: bStyle.position,
              zIndex: bStyle.zIndex,
              width: Math.round(backdrop.getBoundingClientRect().width),
              height: Math.round(backdrop.getBoundingClientRect().height),
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              mediaTag: media.tagName,
              mediaSrcPrefix: (media.getAttribute("src") || "").slice(0, 24),
              mainBg: mainStyle.backgroundColor,
              composerBg: composerStyle.backgroundColor,
              dialogBg: dialogStyle.backgroundColor
            };
          })()`
        );
      },
      10000,
      100,
      "backdrop injection"
    );

    assert.equal(injectedState.enabledClass, true, "Root enabled class missing");
    assert.equal(injectedState.darkClass, true, "Dark theme class missing");
    assert.equal(injectedState.pointerEvents, "none");
    assert.equal(injectedState.position, "fixed");
    assert.equal(injectedState.zIndex, "0");
    assert.equal(injectedState.width, injectedState.innerWidth);
    assert.equal(injectedState.height, injectedState.innerHeight);
    assert.equal(injectedState.mediaTag, "IMG");
    assert.ok(injectedState.mediaSrcPrefix.startsWith("data:image/"));
    assert.equal(
      injectedState.mainBg,
      "rgba(0, 0, 0, 0)",
      "Main wrapper should be transparent"
    );
    assert.notEqual(
      injectedState.composerBg,
      "rgba(0, 0, 0, 0)",
      "Composer pill should retain readable background"
    );
    assert.notEqual(
      injectedState.dialogBg,
      "rgba(0, 0, 0, 0)",
      "Modal/dialog should preserve readability"
    );
    console.log(
      "  ✓ Backdrop layer, DOM transparency, and composer pill styling verified"
    );

    console.log(
      "[4/10] Opening popup.html & verifying unified controls (no This Chat / Global Default), presets, sliders, sidebar frosting, upload, video..."
    );
    const { targetId: popupTargetId } = await cdp.send("Target.createTarget", {
      url: `chrome-extension://${extensionId}/popup.html`
    });
    const { sessionId: popupSession } = await cdp.send(
      "Target.attachToTarget",
      {
        targetId: popupTargetId,
        flatten: true
      }
    );
    await cdp.send("Runtime.enable", {}, popupSession);

    const popupReady = await waitFor(
      async () => {
        return cdp.evalInSession(
          popupSession,
          `(() => {
            const preset = document.querySelector('[data-testid="preset-aurora"]');
            if (!preset) return null;
            return {
              hasScopeChat: Boolean(document.querySelector('[data-testid="scope-tab-chat"]')),
              hasScopeGlobal: Boolean(document.querySelector('[data-testid="scope-tab-global"]')),
              hasContextBanner: Boolean(document.querySelector('[data-testid="context-banner"]')),
              hasPerChatList: Boolean(document.querySelector('[data-testid="per-chat-list"]')),
              hasResetBtn: Boolean(document.querySelector('[data-testid="reset-this-chat-btn"]')),
              bodyText: document.body.textContent || ""
            };
          })()`
        );
      },
      8000,
      100,
      "popup ready"
    );
    assert.equal(popupReady.hasScopeChat, false, "This Chat tab must be removed");
    assert.equal(popupReady.hasScopeGlobal, false, "Global Default tab must be removed");
    assert.equal(popupReady.hasContextBanner, false, "Scope context banner must be removed");
    assert.equal(popupReady.hasPerChatList, false, "Per-chat list must be removed");
    assert.equal(popupReady.hasResetBtn, false, "Reset chat button must be removed");
    assert.equal(popupReady.bodyText.includes("This Chat"), false);
    assert.equal(popupReady.bodyText.includes("Global Default"), false);

    // Select Northern Aurora GIF preset
    await cdp.evalInSession(
      popupSession,
      `document.querySelector('[data-testid="preset-aurora"]').click()`
    );

    const gifApplied = await waitFor(
      async () => {
        return cdp.evalInSession(
          chatSession,
          `(() => {
            const media = document.getElementById("canvas-for-chatgpt-media");
            return media && media.tagName === "IMG" && (media.getAttribute("src") || "").startsWith("data:image/gif")
              ? media.getAttribute("src").slice(0, 32)
              : null;
          })()`
        );
      },
      6000,
      100,
      "animated GIF preset update"
    );
    assert.ok(gifApplied.startsWith("data:image/gif"));

    // Update sliders (opacity, blur, gradient) in real time
    await cdp.evalInSession(
      popupSession,
      `(() => {
        function setSlider(testId, val) {
          const el = document.querySelector('[data-testid="' + testId + '"]');
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
          setter.call(el, String(val));
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        setSlider("slider-opacity", 0.42);
        setSlider("slider-blur", 18);
        setSlider("slider-gradient", 0.77);
      })()`
    );

    const sliderUpdated = await waitFor(
      async () => {
        return cdp.evalInSession(
          chatSession,
          `(() => {
            const media = document.getElementById("canvas-for-chatgpt-media");
            const grad = document.getElementById("canvas-for-chatgpt-gradient");
            if (!media || !grad) return null;
            if (media.style.opacity !== "0.42" || media.style.filter !== "blur(18px)" || grad.style.opacity !== "0.77") {
              return null;
            }
            return {
              opacity: media.style.opacity,
              filter: media.style.filter,
              gradOpacity: grad.style.opacity
            };
          })()`
        );
      },
      6000,
      100,
      "real-time slider application"
    );
    assert.deepEqual(sliderUpdated, {
      opacity: "0.42",
      filter: "blur(18px)",
      gradOpacity: "0.77"
    });

    // Test Sidebar Style: Clean (0%), Frosted restore, and custom frosting slider (80% -> back to 45%)
    await cdp.evalInSession(
      popupSession,
      `document.querySelector('[data-testid="sidebar-mode-clean"]').click()`
    );
    const cleanSidebarState = await waitFor(
      async () =>
        cdp.evalInSession(
          chatSession,
          `(() => {
            const sidebar = document.getElementById("stage-slideover-sidebar");
            const cs = getComputedStyle(sidebar);
            const blur = cs.backdropFilter || cs.webkitBackdropFilter || "";
            if (cs.backgroundColor !== "rgba(0, 0, 0, 0)" || blur !== "none") return null;
            return { bg: cs.backgroundColor, blur };
          })()`
        ),
      6000,
      100,
      "clean transparent sidebar mode"
    );
    assert.equal(cleanSidebarState.bg, "rgba(0, 0, 0, 0)");
    assert.equal(cleanSidebarState.blur, "none");

    const cleanLabel = await cdp.evalInSession(
      popupSession,
      `document.querySelector('[data-testid="sidebar-frosting-value"]').textContent`
    );
    assert.equal(cleanLabel, "Clean (0%)");

    await cdp.evalInSession(
      popupSession,
      `document.querySelector('[data-testid="sidebar-mode-frosted"]').click()`
    );
    await waitFor(
      async () =>
        cdp.evalInSession(
          chatSession,
          `(() => {
            const sidebar = document.getElementById("stage-slideover-sidebar");
            const cs = getComputedStyle(sidebar);
            const blur = cs.backdropFilter || cs.webkitBackdropFilter || "";
            return blur.includes("blur(") && cs.backgroundColor !== "rgba(0, 0, 0, 0)"
              ? { bg: cs.backgroundColor, blur }
              : null;
          })()`
        ),
      6000,
      100,
      "frosted sidebar restore"
    );

    await cdp.evalInSession(
      popupSession,
      `(() => {
        const el = document.querySelector('[data-testid="slider-sidebar-frosting"]');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setter.call(el, "80");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      })()`
    );
    const highFrostState = await waitFor(
      async () =>
        cdp.evalInSession(
          chatSession,
          `(() => {
            const sidebar = document.getElementById("stage-slideover-sidebar");
            const cs = getComputedStyle(sidebar);
            const blur = cs.backdropFilter || cs.webkitBackdropFilter || "";
            if (cs.backgroundColor !== "rgba(24, 24, 28, 0.52)" || !blur.includes("blur(19px)")) {
              return null;
            }
            return { bg: cs.backgroundColor, blur };
          })()`
        ),
      6000,
      100,
      "custom 80% sidebar frosting"
    );
    assert.equal(highFrostState.bg, "rgba(24, 24, 28, 0.52)");

    // Restore default 45% frosting before subsequent layout checks
    await cdp.evalInSession(
      popupSession,
      `(() => {
        const el = document.querySelector('[data-testid="slider-sidebar-frosting"]');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setter.call(el, "45");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      })()`
    );
    await waitFor(
      async () =>
        cdp.evalInSession(
          chatSession,
          `(() => {
            const sidebar = document.getElementById("stage-slideover-sidebar");
            return getComputedStyle(sidebar).backgroundColor === "rgba(24, 24, 28, 0.29)";
          })()`
        ),
      6000,
      100,
      "restore 45% sidebar frosting"
    );

    // Apply custom MP4 video URL
    await cdp.evalInSession(
      popupSession,
      `(() => {
        const input = document.querySelector('[data-testid="custom-url-input"]');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setter.call(input, "https://media.example.test/ambient-loop.mp4");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        document.querySelector('[data-testid="custom-url-apply"]').click();
      })()`
    );

    const videoApplied = await waitFor(
      async () => {
        return cdp.evalInSession(
          chatSession,
          `(() => {
            const media = document.getElementById("canvas-for-chatgpt-media");
            if (!media || media.tagName !== "VIDEO") return null;
            return {
              tagName: media.tagName,
              src: media.getAttribute("src"),
              autoplay: media.autoplay,
              loop: media.loop,
              muted: media.muted,
              playsInline: media.playsInline
            };
          })()`
        );
      },
      6000,
      100,
      "video wallpaper element"
    );
    assert.equal(videoApplied.tagName, "VIDEO");
    assert.equal(
      videoApplied.src,
      "https://media.example.test/ambient-loop.mp4"
    );
    assert.equal(videoApplied.autoplay, true);
    assert.equal(videoApplied.loop, true);
    assert.equal(videoApplied.muted, true);
    assert.equal(videoApplied.playsInline, true);

    // Upload local PNG via file input
    await cdp.evalInSession(
      popupSession,
      `(() => {
        const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
        const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const file = new File([bin], "local-upload.png", { type: "image/png" });
        const dt = new DataTransfer();
        dt.items.add(file);
        const input = document.querySelector('[data-testid="upload-media-input"]');
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      })()`
    );

    const localUploadApplied = await waitFor(
      async () => {
        return cdp.evalInSession(
          chatSession,
          `(() => {
            const media = document.getElementById("canvas-for-chatgpt-media");
            return media && media.tagName === "IMG" && (media.getAttribute("src") || "").startsWith("data:image/png")
              ? media.getAttribute("src")
              : null;
          })()`
        );
      },
      6000,
      100,
      "local media data URL upload"
    );
    assert.ok(localUploadApplied.startsWith("data:image/png;base64,"));

    // Delete uploaded saved item and re-apply MP4 URL
    await waitFor(
      async () =>
        cdp.evalInSession(
          popupSession,
          `Boolean(document.querySelector('[data-testid="saved-item-1"]'))`
        ),
      5000,
      100,
      "two saved backgrounds present"
    );
    await cdp.evalInSession(
      popupSession,
      `document.querySelector('[data-testid="saved-delete-0"]').click()`
    );
    await waitFor(
      async () =>
        cdp.evalInSession(
          popupSession,
          `!document.querySelector('[data-testid="saved-item-1"]')`
        ),
      5000,
      100,
      "saved background deletion"
    );

    await cdp.evalInSession(
      popupSession,
      `document.querySelector('[data-testid="saved-item-0"] .saved-apply-btn').click()`
    );
    await waitFor(
      async () =>
        cdp.evalInSession(
          chatSession,
          `(() => {
            const media = document.getElementById("canvas-for-chatgpt-media");
            return media && media.tagName === "VIDEO" ? true : null;
          })()`
        ),
      5000,
      100,
      "re-apply saved MP4 video"
    );
    console.log(
      "  ✓ Unified popup presets, GIF, local upload, video, sliders, sidebar frosting, and saved list verified"
    );

    console.log(
      "[5/10] Verifying SPA navigation preserves canvas across routes..."
    );
    for (const routePath of [
      "/c/chat-beta",
      "/g/g-demo",
      "/share/share-9",
      "/",
      "/c/chat-alpha"
    ]) {
      await cdp.evalInSession(
        chatSession,
        `history.pushState({}, "", ${JSON.stringify(routePath)})`
      );
      const persisted = await waitFor(
        async () =>
          cdp.evalInSession(
            chatSession,
            `(() => {
              const media = document.getElementById("canvas-for-chatgpt-media");
              return media && media.tagName === "VIDEO" ? media.getAttribute("src") : null;
            })()`
          ),
        4000,
        100,
        `canvas persistence on ${routePath}`
      );
      assert.equal(persisted, "https://media.example.test/ambient-loop.mp4");
    }
    console.log("  ✓ Unified canvas persists cleanly across all SPA routes");

    console.log(
      "[6/10] Verifying composer wrapper transparency, ::before strips, and modern desktop/mobile frosted sidebars..."
    );
    const composerAudit = await cdp.evalInSession(
      chatSession,
      `(async () => {
        const styleEl = document.createElement("style");
        styleEl.id = "test-composer-pseudo-style";
        styleEl.textContent = ".test-pseudo-wrapper::before { content: ''; position: absolute; inset: 0; background-color: rgb(0, 0, 0); z-index: -1; }";
        document.head.appendChild(styleEl);

        const main = document.querySelector("main");
        const host = document.createElement("div");
        host.id = "modern-composer-host";
        host.innerHTML = \`
          <div class="composer-outer-rect" style="background: rgb(20, 20, 20);">
            <form class="composer-form-rect">
              <div class="composer-inner-rect">
                <div class="composer-pill-rounded" data-composer-surface style="border-radius: 28px; min-height: 52px;">
                  <div id="prompt-textarea-2" contenteditable="true">Ask ChatGPT</div>
                </div>
              </div>
            </form>
          </div>
          <div class="composer-outer-no-attr" style="background: rgb(20, 20, 20);">
            <form class="composer-form-no-attr">
              <div class="composer-pill-no-attr" style="border-radius: 28px; min-height: 52px;">
                <textarea placeholder="Ask ChatGPT"></textarea>
              </div>
            </form>
          </div>
          <footer data-ds-composer>
            <span aria-hidden="true" class="test-strip" style="position: absolute; inset-inline: 0; bottom: 0; height: 24px; background: rgb(0, 0, 0);"></span>
            <div class="test-pseudo-wrapper" style="position: relative;">
              <form class="test-rounded-form" style="border-radius: 28px; min-height: 52px; background: rgb(33, 33, 33);">
                <textarea placeholder="Ask ChatGPT"></textarea>
              </form>
            </div>
          </footer>
        \`;
        main.appendChild(host);
        await new Promise((r) => setTimeout(r, 250));

        const res = {
          outerRectBg: getComputedStyle(host.querySelector(".composer-outer-rect")).backgroundColor,
          formRectBg: getComputedStyle(host.querySelector(".composer-form-rect")).backgroundColor,
          innerRectBg: getComputedStyle(host.querySelector(".composer-inner-rect")).backgroundColor,
          pillBg: getComputedStyle(host.querySelector(".composer-pill-rounded")).backgroundColor,
          outerNoAttrBg: getComputedStyle(host.querySelector(".composer-outer-no-attr")).backgroundColor,
          formNoAttrBg: getComputedStyle(host.querySelector(".composer-form-no-attr")).backgroundColor,
          pillNoAttrBg: getComputedStyle(host.querySelector(".composer-pill-no-attr")).backgroundColor,
          stripBg: getComputedStyle(host.querySelector(".test-strip")).backgroundColor,
          pseudoBg: getComputedStyle(host.querySelector(".test-pseudo-wrapper"), "::before").backgroundColor,
          roundedFormBg: getComputedStyle(host.querySelector(".test-rounded-form")).backgroundColor
        };

        host.remove();
        styleEl.remove();
        return res;
      })()`
    );
    assert.equal(composerAudit.outerRectBg, "rgba(0, 0, 0, 0)");
    assert.equal(composerAudit.formRectBg, "rgba(0, 0, 0, 0)");
    assert.equal(composerAudit.innerRectBg, "rgba(0, 0, 0, 0)");
    assert.notEqual(composerAudit.pillBg, "rgba(0, 0, 0, 0)");
    assert.equal(composerAudit.outerNoAttrBg, "rgba(0, 0, 0, 0)");
    assert.equal(composerAudit.formNoAttrBg, "rgba(0, 0, 0, 0)");
    assert.notEqual(composerAudit.pillNoAttrBg, "rgba(0, 0, 0, 0)");
    assert.equal(composerAudit.stripBg, "rgba(0, 0, 0, 0)");
    assert.equal(composerAudit.pseudoBg, "rgba(0, 0, 0, 0)");
    assert.notEqual(composerAudit.roundedFormBg, "rgba(0, 0, 0, 0)");

    const sidebarAudit = await cdp.evalInSession(
      chatSession,
      `(async () => {
        const styleEl = document.createElement("style");
        styleEl.id = "test-modern-sidebar-style";
        styleEl.textContent = \`
          #modern-sidebar-host #stage-slideover-sidebar {
            width: 260px;
            height: 500px;
          }
          .sidebar-scroll-fade::before {
            content: "";
            position: absolute;
            inset-inline: 0;
            top: 0;
            height: 20px;
            background: rgb(22, 22, 22);
          }
        \`;
        document.head.appendChild(styleEl);

        const appShell = document.createElement("div");
        appShell.id = "modern-sidebar-host";
        appShell.style.backgroundColor = "rgb(22, 22, 22)";
        appShell.innerHTML = \`
          <div class="shell-inner" style="background-color: rgb(22, 22, 22);">
            <div id="stage-slideover-sidebar" style="background-color: rgb(22, 22, 22);">
              <div class="sidebar-inner-wrapper" style="display: flex; flex-direction: column; height: 100%; background-color: rgb(22, 22, 22);">
                <div id="stage-sidebar-tiny-bar" style="background: transparent;"></div>
                <nav aria-label="Chat history" style="display: flex; flex-direction: column; height: 100%; background-color: rgb(22, 22, 22);">
                  <div class="sticky-header-wrap bg-token-bg-elevated-secondary" style="background-color: rgb(14, 14, 14); height: 40px;">
                    <div id="sidebar-header" style="display: flex; justify-content: space-between; background-color: rgb(14, 14, 14);">
                      <a href="/" aria-label="Home">ChatGPT</a>
                      <button type="button" aria-label="Close sidebar">X</button>
                    </div>
                  </div>
                  <aside class="sidebar-top-links" style="background-color: rgb(22, 22, 22);">
                    <div class="new-chat-pill" style="border-radius: 8px; height: 36px; background-color: rgb(46, 46, 46);">
                      <a href="/">New chat</a>
                    </div>
                    <a href="/library">Library</a>
                  </aside>
                  <div class="sidebar-scroll-fade" style="position: relative; flex: 1; overflow-y: auto; background-color: rgb(22, 22, 22); min-height: 180px;">
                    <div class="history-section-sticky" style="position: sticky; top: 0; height: 28px; background-color: rgb(22, 22, 22);">Recents</div>
                    <div class="chat-row-group" style="border-radius: 8px; height: 36px; background-color: rgb(40, 40, 40);">
                      <a href="/c/one">Java Crash Course</a>
                      <button type="button" aria-label="Options">...</button>
                    </div>
                  </div>
                  <div class="sidebar-footer-wrap" style="background-color: rgb(22, 22, 22); height: 90px;">
                    <button type="button" class="profile-btn" style="border-radius: 8px; height: 40px; background-color: transparent;">
                      <span class="avatar-badge" style="display: inline-block; width: 28px; height: 28px; border-radius: 9999px; background-color: rgb(44, 182, 156);">AS</span>
                      <span>Aryan Sinha</span>
                    </button>
                    <button type="button" class="claim-offer-btn" style="border-radius: 9999px; height: 36px; background-color: rgb(33, 33, 33);">Claim offer</button>
                  </div>
                  <div role="menu" class="sidebar-context-menu" style="background-color: rgb(42, 42, 42);">Rename / Delete</div>
                </nav>
              </div>
            </div>
          </div>
          <div class="popover-scrim" style="position: fixed; inset: 0; width: 100vw; height: 100vh; background-color: rgba(0, 0, 0, 0.5);">
            <div id="stage-popover-sidebar" role="dialog" style="width: 260px; height: 480px; background-color: rgb(22, 22, 22);">
              <nav aria-label="Chat history" style="height: 100%; background-color: rgb(22, 22, 22);">
                <a href="/c/mobile-1">Mobile Chat</a>
              </nav>
            </div>
          </div>
          <div id="settings-modal" role="dialog" style="width: 300px; height: 200px; background-color: rgb(40, 40, 40);">
            <nav aria-label="Settings tabs" style="background-color: rgb(45, 45, 45);">Settings Nav</nav>
          </div>
        \`;
        document.body.appendChild(appShell);
        await new Promise((r) => setTimeout(r, 250));

        const root = appShell.querySelector("#stage-slideover-sidebar");
        const rootCs = getComputedStyle(root);
        const popoverCs = getComputedStyle(appShell.querySelector("#stage-popover-sidebar"));
        const res = {
          rootBg: rootCs.backgroundColor,
          rootBlur: rootCs.backdropFilter || rootCs.webkitBackdropFilter || "",
          shellInnerBg: getComputedStyle(appShell.querySelector(".shell-inner")).backgroundColor,
          innerWrapBg: getComputedStyle(appShell.querySelector(".sidebar-inner-wrapper")).backgroundColor,
          navBg: getComputedStyle(appShell.querySelector("#stage-slideover-sidebar nav")).backgroundColor,
          navBlur: getComputedStyle(appShell.querySelector("#stage-slideover-sidebar nav")).backdropFilter,
          headerWrapBg: getComputedStyle(appShell.querySelector(".sticky-header-wrap")).backgroundColor,
          headerElBg: getComputedStyle(appShell.querySelector("#sidebar-header")).backgroundColor,
          asideBg: getComputedStyle(appShell.querySelector(".sidebar-top-links")).backgroundColor,
          scrollWrapBg: getComputedStyle(appShell.querySelector(".sidebar-scroll-fade")).backgroundColor,
          scrollPseudoBg: getComputedStyle(appShell.querySelector(".sidebar-scroll-fade"), "::before").backgroundColor,
          stickySecBg: getComputedStyle(appShell.querySelector(".history-section-sticky")).backgroundColor,
          footerWrapBg: getComputedStyle(appShell.querySelector(".sidebar-footer-wrap")).backgroundColor,
          newChatBg: getComputedStyle(appShell.querySelector(".new-chat-pill")).backgroundColor,
          chatRowBg: getComputedStyle(appShell.querySelector(".chat-row-group")).backgroundColor,
          avatarBg: getComputedStyle(appShell.querySelector(".avatar-badge")).backgroundColor,
          claimOfferBg: getComputedStyle(appShell.querySelector(".claim-offer-btn")).backgroundColor,
          menuBg: getComputedStyle(appShell.querySelector(".sidebar-context-menu")).backgroundColor,
          scrimBg: getComputedStyle(appShell.querySelector(".popover-scrim")).backgroundColor,
          popoverBg: popoverCs.backgroundColor,
          popoverNavBg: getComputedStyle(appShell.querySelector("#stage-popover-sidebar nav")).backgroundColor,
          modalBg: getComputedStyle(appShell.querySelector("#settings-modal")).backgroundColor,
          modalNavBg: getComputedStyle(appShell.querySelector("#settings-modal nav")).backgroundColor
        };

        appShell.remove();
        styleEl.remove();
        return res;
      })()`
    );

    assert.equal(sidebarAudit.rootBg, "rgba(24, 24, 28, 0.29)");
    assert.ok(sidebarAudit.rootBlur.includes("blur(11px)"));
    assert.equal(sidebarAudit.shellInnerBg, "rgba(0, 0, 0, 0)");
    assert.equal(sidebarAudit.innerWrapBg, "rgba(0, 0, 0, 0)");
    assert.equal(sidebarAudit.navBg, "rgba(0, 0, 0, 0)");
    assert.equal(sidebarAudit.navBlur, "none");
    assert.equal(sidebarAudit.headerWrapBg, "rgba(0, 0, 0, 0)");
    assert.equal(sidebarAudit.headerElBg, "rgba(0, 0, 0, 0)");
    assert.equal(sidebarAudit.asideBg, "rgba(0, 0, 0, 0)");
    assert.equal(sidebarAudit.scrollWrapBg, "rgba(0, 0, 0, 0)");
    assert.equal(sidebarAudit.scrollPseudoBg, "rgba(0, 0, 0, 0)");
    assert.equal(sidebarAudit.stickySecBg, "rgba(0, 0, 0, 0)");
    assert.equal(sidebarAudit.footerWrapBg, "rgba(0, 0, 0, 0)");
    assert.equal(sidebarAudit.newChatBg, "rgb(46, 46, 46)");
    assert.equal(sidebarAudit.chatRowBg, "rgb(40, 40, 40)");
    assert.equal(sidebarAudit.avatarBg, "rgb(44, 182, 156)");
    assert.equal(sidebarAudit.claimOfferBg, "rgb(33, 33, 33)");
    assert.equal(sidebarAudit.menuBg, "rgb(42, 42, 42)");
    assert.equal(sidebarAudit.scrimBg, "rgba(0, 0, 0, 0.5)");
    assert.equal(sidebarAudit.popoverBg, "rgba(24, 24, 28, 0.29)");
    assert.equal(sidebarAudit.popoverNavBg, "rgba(0, 0, 0, 0)");
    assert.equal(sidebarAudit.modalBg, "rgb(40, 40, 40)");
    assert.equal(sidebarAudit.modalNavBg, "rgb(45, 45, 45)");
    console.log(
      "  ✓ Composer wrapper transparency & unified frosted desktop/mobile sidebars verified"
    );

    console.log("[7/10] Verifying theme switching (dark -> light -> dark)...");
    await cdp.evalInSession(
      chatSession,
      `(() => {
        document.documentElement.classList.remove("dark");
        document.documentElement.classList.add("light");
        document.documentElement.setAttribute("data-theme", "light");
      })()`
    );
    const lightApplied = await waitFor(
      async () =>
        cdp.evalInSession(
          chatSession,
          `document.documentElement.classList.contains("canvas-for-chatgpt-light")`
        ),
      5000,
      100,
      "light theme class"
    );
    assert.equal(lightApplied, true);

    await cdp.evalInSession(
      chatSession,
      `(() => {
        document.documentElement.classList.remove("light");
        document.documentElement.classList.add("dark");
        document.documentElement.setAttribute("data-theme", "dark");
      })()`
    );
    await waitFor(
      async () =>
        cdp.evalInSession(
          chatSession,
          `document.documentElement.classList.contains("canvas-for-chatgpt-dark")`
        ),
      5000,
      100,
      "dark theme restore"
    );
    console.log("  ✓ Light/dark theme synchronization verified");

    console.log(
      "[8/10] Verifying MutationObserver DOM recovery & enable/disable toggle..."
    );
    await cdp.evalInSession(
      chatSession,
      `(() => {
        document.getElementById("canvas-for-chatgpt-backdrop")?.remove();
        document.getElementById("canvas-for-chatgpt-styles")?.remove();
        document.documentElement.classList.remove("canvas-for-chatgpt-enabled");
      })()`
    );

    const recovered = await waitFor(
      async () =>
        cdp.evalInSession(
          chatSession,
          `Boolean(
            document.getElementById("canvas-for-chatgpt-backdrop") &&
            document.getElementById("canvas-for-chatgpt-media") &&
            document.getElementById("canvas-for-chatgpt-styles") &&
            document.documentElement.classList.contains("canvas-for-chatgpt-enabled")
          )`
        ),
      5000,
      100,
      "DOM mutation recovery"
    );
    assert.equal(recovered, true);

    // Disable via popup toggle and verify clean teardown
    await cdp.evalInSession(
      popupSession,
      `document.querySelector('[data-testid="enable-toggle"]').click()`
    );
    const tornDown = await waitFor(
      async () =>
        cdp.evalInSession(
          chatSession,
          `Boolean(
            !document.getElementById("canvas-for-chatgpt-backdrop") &&
            !document.getElementById("canvas-for-chatgpt-styles") &&
            !document.documentElement.classList.contains("canvas-for-chatgpt-enabled") &&
            document.querySelectorAll("[data-canvas-chatgpt-composer], [data-canvas-chatgpt-composer-wrapper], [data-canvas-chatgpt-ancestor]").length === 0
          )`
        ),
      5000,
      100,
      "clean disable teardown"
    );
    assert.equal(tornDown, true);

    // Re-enable
    await cdp.evalInSession(
      popupSession,
      `document.querySelector('[data-testid="enable-toggle"]').click()`
    );
    await waitFor(
      async () =>
        cdp.evalInSession(
          chatSession,
          `Boolean(document.getElementById("canvas-for-chatgpt-backdrop"))`
        ),
      5000,
      100,
      "re-enable backdrop"
    );
    console.log("  ✓ DOM mutation recovery & toggle teardown verified");

    console.log(
      "[9/10] Benchmarking ChatGPT streaming & typing lag (250 rapid streaming mutations + sidebar stability)..."
    );
    await cdp.send("Target.activateTarget", { targetId: chatTargetId });
    const perfResult = await cdp.evalInSession(
      chatSession,
      `(async () => {
        const nav = document.querySelector("#stage-slideover-sidebar nav");
        for (let i = 0; i < 120; i++) {
          const a = document.createElement("a");
          a.href = "/c/hist-" + i;
          a.textContent = "Conversation history item #" + i;
          nav.appendChild(a);
        }

        let sidebarAttributeMutations = 0;
        const sidebarSpy = new MutationObserver((list) => {
          sidebarAttributeMutations += list.length;
        });
        sidebarSpy.observe(document.getElementById("stage-slideover-sidebar"), {
          attributes: true,
          subtree: true
        });

        const yieldTask = () => new Promise((r) => {
          const mc = new MessageChannel();
          mc.port1.onmessage = r;
          mc.port2.postMessage(null);
        });

        const assistantP = document.querySelector('[data-message-author-role="assistant"] .markdown p');
        const promptInput = document.getElementById("prompt-textarea");
        const start = performance.now();

        for (let i = 0; i < 250; i++) {
          const span = document.createElement("span");
          span.textContent = " token" + i;
          assistantP.appendChild(span);
          if (i % 10 === 0) {
            promptInput.textContent = "drafting " + i;
          }
          await yieldTask();
        }

        await new Promise((r) => setTimeout(r, 200));
        const elapsedMs = performance.now() - start;
        sidebarSpy.disconnect();

        return {
          elapsedMs: Math.round(elapsedMs),
          sidebarAttributeMutations,
          backdropPresent: Boolean(document.getElementById("canvas-for-chatgpt-backdrop"))
        };
      })()`
    );
    assert.equal(perfResult.backdropPresent, true);
    assert.equal(
      perfResult.sidebarAttributeMutations,
      0,
      `Expected 0 sidebar attribute mutations during streaming, got ${perfResult.sidebarAttributeMutations}`
    );
    assert.ok(
      perfResult.elapsedMs < 3000,
      `Streaming benchmark took too long: ${perfResult.elapsedMs}ms`
    );
    console.log(
      `  ✓ Streaming benchmark passed (250 chunks in ${perfResult.elapsedMs}ms, 0 sidebar attribute churn)`
    );

    console.log(
      "[10/10] Verifying Options page renders README.md via marked..."
    );
    const { targetId: optionsTargetId } = await cdp.send(
      "Target.createTarget",
      {
        url: `chrome-extension://${extensionId}/options.html`
      }
    );
    const { sessionId: optionsSession } = await cdp.send(
      "Target.attachToTarget",
      {
        targetId: optionsTargetId,
        flatten: true
      }
    );
    await cdp.send("Runtime.enable", {}, optionsSession);

    const optionsContent = await waitFor(
      async () => {
        return cdp.evalInSession(
          optionsSession,
          `(() => {
            const el = document.querySelector('[data-testid="options-readme"]');
            if (!el) return null;
            const h1 = el.querySelector("h1")?.textContent || "";
            const h2s = Array.from(el.querySelectorAll("h2")).map((n) => n.textContent);
            return { h1, h2s };
          })()`
        );
      },
      6000,
      100,
      "options README render"
    );

    assert.equal(optionsContent.h1, "Canvas for ChatGPT");
    assert.ok(optionsContent.h2s.includes("Features"));
    assert.ok(optionsContent.h2s.includes("Privacy & Permissions"));
    console.log("  ✓ Options page README rendering verified");

    console.log("\nALL BROWSER TESTS PASSED (10/10).");
  } finally {
    await cleanup();
  }
}

runTests().catch((err) => {
  console.error("\nBROWSER TEST FAILED:\n", err);
  process.exit(1);
});
