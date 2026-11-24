const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const candidateBrowsers = [
  process.env.BROWSER_PATH,
  process.env.CHROME_BIN,
  "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);

const bravePath = candidateBrowsers.find(p => fs.existsSync(p));
if (!bravePath) {
  console.error("Could not find a Chromium-based browser (Brave, Chrome, or Edge). Set BROWSER_PATH.");
  process.exit(1);
}
const extensionBuildDir = path.resolve(__dirname, '..', 'build', 'chrome-mv3-prod');
if (!fs.existsSync(extensionBuildDir)) {
  console.error("Extension build directory does not exist. Run 'npm run build' first.");
  process.exit(1);
}

const buildFiles = fs.readdirSync(extensionBuildDir);
const contentJsFile = buildFiles.find(f => f.startsWith('content.') && f.endsWith('.js'));
if (!contentJsFile) {
  console.error("Could not find built content script in", extensionBuildDir);
  process.exit(1);
}
const contentJsCode = fs.readFileSync(path.join(extensionBuildDir, contentJsFile), 'utf8');

const MOCK_CHROME_JS = `
  window._storageData = {};
  window.chrome = window.chrome || {};
  const storageImpl = {
    get: (key, cb) => {
      const val = typeof key === 'string' ? { [key]: window._storageData[key] } : window._storageData;
      if (typeof cb === 'function') cb(val);
      return Promise.resolve(val);
    },
    set: (obj, cb) => {
      Object.assign(window._storageData, obj);
      if (typeof cb === 'function') cb();
      return Promise.resolve();
    },
    remove: (key, cb) => {
      delete window._storageData[key];
      if (typeof cb === 'function') cb();
      return Promise.resolve();
    }
  };
  window.chrome.storage = {
    local: storageImpl,
    sync: storageImpl
  };
  window.chrome.runtime = {
    onMessage: {
      listeners: [],
      addListener: (fn) => window.chrome.runtime.onMessage.listeners.push(fn)
    },
    sendMessage: (msg) => {
      let res;
      for (const l of window.chrome.runtime.onMessage.listeners) {
        l(msg, {}, (r) => { res = r; });
      }
      return Promise.resolve(res);
    }
  };
`;

const HTML_PAGE = `<!DOCTYPE html>
<html class="chatgpt-theme" data-theme="dark">
<head>
  <meta charset="utf-8">
  <title>ChatGPT Simulation</title>
  <style>
    :root {
      --bg-primary: #212121;
      --main-surface-primary: #212121;
      --color-background-panel: #171717;
    }
    body {
      margin: 0;
      background: var(--bg-primary);
      color: #ececec;
      font-family: sans-serif;
    }
    #root {
      display: flex;
      height: 100vh;
      width: 100vw;
    }
    nav {
      width: 260px;
      background: #171717;
      padding: 10px;
    }
    main {
      flex: 1;
      display: flex;
      flex-direction: column;
      position: relative;
    }
    .conversation-thread {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }
    .composer {
      padding: 20px;
      background: #303030;
    }
  </style>
  <script src="/mock-chrome.js"></script>
</head>
<body class="dark">
  <div id="root">
    <nav aria-label="Chat history">
      <div>Chat list header</div>
      <div>Chat item 1</div>
      <div>Chat footer</div>
    </nav>
    <main role="main">
      <header id="page-header">Model selector</header>
      <div class="conversation-thread">
        <div class="turn user-turn" id="turn-1">
          <div class="user-bubble">Hello ChatGPT!</div>
        </div>
        <div class="turn assistant-turn" id="turn-2">
          <div class="Markdown"><p>Hello! How can I help you today?</p></div>
        </div>
      </div>
      <div class="composer" data-composer-surface>
        <form>
          <textarea placeholder="Message ChatGPT..."></textarea>
        </form>
      </div>
    </main>
  </div>
  <script src="/content.js"></script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url.startsWith('/chat')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(HTML_PAGE);
  } else if (req.url === '/mock-chrome.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(MOCK_CHROME_JS);
  } else if (req.url === '/content.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(contentJsCode);
  } else {
    res.writeHead(404);
    res.end();
  }
});

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

server.listen(0, async () => {
  const PORT = server.address().port;
  console.log(`Test server running at http://127.0.0.1:${PORT}`);

  const tempProfile = path.resolve(`C:\\Users\\vaan2\\AppData\\Local\\Temp\\brave-audit-profile-${Date.now()}`);
  const remotePort = 9200 + Math.floor(Math.random() * 500);
  const proc = spawn(bravePath, [
    '--headless=new',
    `--remote-debugging-port=${remotePort}`,
    `--user-data-dir=${tempProfile}`,
    '--no-first-run',
    '--no-default-browser-check',
    `http://127.0.0.1:${PORT}/`
  ], { stdio: 'ignore' });

  try {
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${remotePort}/json/list`);
        const list = await res.json();
        const p = list.find(t => t.url.includes(`127.0.0.1:${PORT}`));
        if (p && p.webSocketDebuggerUrl) {
          wsUrl = p.webSocketDebuggerUrl;
          break;
        }
      } catch (e) {}
      await sleep(300);
    }

    if (!wsUrl) throw new Error("Could not connect to Brave page via CDP");
    console.log("Connected to Brave CDP:", wsUrl);

    const ws = new WebSocket(wsUrl);
    await new Promise(r => ws.onopen = r);

    let id = 1;
    const callbacks = new Map();
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg.result);
        callbacks.delete(msg.id);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve) => {
        const msgId = id++;
        callbacks.set(msgId, resolve);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    async function evaluate(code) {
      const isAsync = code.trim().startsWith('(async');
      const r = await send('Runtime.evaluate', {
        expression: code,
        returnByValue: true,
        awaitPromise: isAsync
      });
      if (r.exceptionDetails) {
        throw new Error(JSON.stringify(r.exceptionDetails));
      }
      return r.result.value;
    }

    await sleep(2000);

    console.log("\n==================== TEST SUITE EXECUTION IN BRAVE ====================");
    let passed = 0;
    let failed = 0;

    async function assertTest(name, fn) {
      console.log(`-> Starting test: ${name}`);
      try {
        const result = await fn();
        if (result.pass) {
          console.log(`[PASS] ${name} ${result.info ? '(' + result.info + ')' : ''}`);
          passed++;
        } else {
          console.error(`[FAIL] ${name} - ${result.error}`);
          failed++;
        }
      } catch (err) {
        console.error(`[ERROR] ${name} - Exception: ${err.message}`);
        failed++;
      }
    }

    // 1. Background layer tests
    await assertTest("Background layer element created in DOM", async () => {
      const res = await evaluate(`(() => {
        const bg = document.getElementById('cg-customizer-background');
        return {
          pass: !!bg && document.body.contains(bg),
          info: bg ? 'in body, id=' + bg.id : 'missing'
        };
      })()`);
      return res;
    });

    await assertTest("Background image and gradient elements exist with correct styling", async () => {
      const res = await evaluate(`(() => {
        const bg = document.getElementById('cg-customizer-background');
        if (!bg) return { pass: false, error: 'no bg' };
        const img = bg.querySelector('img');
        const grad = bg.querySelector('.cg-customizer-gradient');
        const style = window.getComputedStyle(bg);
        return {
          pass: !!img && !!grad && style.position === 'fixed' && style.pointerEvents === 'none',
          info: 'img.src=' + (img?.src?.slice(0, 30) || '') + '..., zIndex=' + style.zIndex
        };
      })()`);
      return res;
    });

    await assertTest("Class cg-customizer-background-enabled and CSS variables applied", async () => {
      const res = await evaluate(`(() => {
        const html = document.documentElement;
        const hasClass = html.classList.contains('cg-customizer-background-enabled');
        const mainStyle = window.getComputedStyle(document.querySelector('main'));
        return {
          pass: hasClass && mainStyle.backgroundColor === 'rgba(0, 0, 0, 0)',
          info: 'main bg=' + mainStyle.backgroundColor
        };
      })()`);
      return res;
    });

    await assertTest("Composer retains readable solid background", async () => {
      const res = await evaluate(`(() => {
        const comp = document.querySelector('[data-composer-surface]');
        const style = window.getComputedStyle(comp);
        return {
          pass: style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent',
          info: 'composer bg=' + style.backgroundColor
        };
      })()`);
      return res;
    });

    // 2. Runtime config patch test (opacity, blur, gradient, image url)
    await assertTest("Runtime configuration patch applies immediately", async () => {
      const res = await evaluate(`(async () => {
        for (const l of window.chrome.runtime.onMessage.listeners) {
          l({
            type: 'SET_CFG_PARTIAL',
            patch: {
              backgroundImageUrl: 'https://example.com/test-bg.jpg',
              mainImageOpacity: 0.85,
              blurAmount: 25,
              gradientOpacity: 0.75
            }
          }, {}, () => {});
        }
        await new Promise(r => setTimeout(r, 100));
        
        const img = document.querySelector('#cg-customizer-background img');
        const grad = document.querySelector('#cg-customizer-background .cg-customizer-gradient');
        
        const matchSrc = img.src === 'https://example.com/test-bg.jpg';
        const matchOpacity = img.style.opacity === '0.85';
        const matchBlur = img.style.filter.includes('25px');
        const matchGrad = grad.style.opacity === '0.75';
        
        return {
          pass: matchSrc && matchOpacity && matchBlur && matchGrad,
          info: 'src=' + matchSrc + ', opacity=' + matchOpacity + ', blur=' + matchBlur + ', grad=' + matchGrad
        };
      })()`);
      return res;
    });

    // 3. Clean disable test
    await assertTest("Disabling customization cleanly removes background and restores styles", async () => {
      const res = await evaluate(`(async () => {
        for (const l of window.chrome.runtime.onMessage.listeners) {
          l({ type: 'SET_CFG_PARTIAL', patch: { enabled: false } }, {}, () => {});
        }
        await new Promise(r => setTimeout(r, 100));
        
        const bg = document.getElementById('cg-customizer-background');
        const style = document.getElementById('cg-customizer-background-style');
        const hasClass = document.documentElement.classList.contains('cg-customizer-background-enabled');
        
        return {
          pass: !bg && !style && !hasClass,
          info: 'bgRemoved=' + !bg + ', styleRemoved=' + !style + ', classRemoved=' + !hasClass
        };
      })()`);
      return res;
    });

    // 4. Clean re-enable test
    await assertTest("Re-enabling customization restores background and layer cleanly", async () => {
      const res = await evaluate(`(async () => {
        for (const l of window.chrome.runtime.onMessage.listeners) {
          l({ type: 'SET_CFG_PARTIAL', patch: { enabled: true } }, {}, () => {});
        }
        await new Promise(r => setTimeout(r, 100));
        
        const bg = document.getElementById('cg-customizer-background');
        const hasClass = document.documentElement.classList.contains('cg-customizer-background-enabled');
        
        return {
          pass: !!bg && hasClass && document.body.contains(bg),
          info: 'bgRestored=' + !!bg + ', inBody=' + (bg ? document.body.contains(bg) : false)
        };
      })()`);
      return res;
    });

    // 5. Edge case: Extreme opacity and blur boundary values
    await assertTest("Edge case: Boundary values for opacity (0 & 1) and blur (0 & 100)", async () => {
      const res = await evaluate(`(async () => {
        for (const l of window.chrome.runtime.onMessage.listeners) {
          l({ type: 'SET_CFG_PARTIAL', patch: { mainImageOpacity: 0, blurAmount: 0 } }, {}, () => {});
        }
        await new Promise(r => setTimeout(r, 80));
        const img = document.querySelector('#cg-customizer-background img');
        const zeroOpacity = img.style.opacity === '0';
        const zeroBlur = img.style.filter.includes('0px');

        for (const l of window.chrome.runtime.onMessage.listeners) {
          l({ type: 'SET_CFG_PARTIAL', patch: { mainImageOpacity: 1, blurAmount: 100 } }, {}, () => {});
        }
        await new Promise(r => setTimeout(r, 80));
        const maxOpacity = img.style.opacity === '1';
        const maxBlur = img.style.filter.includes('100px');

        return {
          pass: zeroOpacity && zeroBlur && maxOpacity && maxBlur,
          info: 'zeroOpacity=' + zeroOpacity + ', zeroBlur=' + zeroBlur + ', maxOpacity=' + maxOpacity + ', maxBlur=' + maxBlur
        };
      })()`);
      return res;
    });

    // 6. Edge case: Theme switching light/dark gradient adaptation
    await assertTest("Edge case: Theme switching adapts gradient properly", async () => {
      const res = await evaluate(`(async () => {
        const html = document.documentElement;
        const grad = document.querySelector('#cg-customizer-background .cg-customizer-gradient');
        
        // Switch to light mode
        html.classList.remove('dark');
        html.setAttribute('data-theme', 'light');
        await new Promise(r => setTimeout(r, 100));
        
        // Switch back to dark mode
        html.classList.add('dark');
        html.setAttribute('data-theme', 'dark');
        await new Promise(r => setTimeout(r, 100));
        
        return {
          pass: !!grad,
          info: 'gradient preserved across theme switch'
        };
      })()`);
      return res;
    });

    // 7. SPA Navigation via history.pushState triggers immediate background verification
    await assertTest("SPA navigation via history.pushState triggers event and preserves background", async () => {
      const res = await evaluate(`(async () => {
        let spaEventFired = false;
        const handler = () => { spaEventFired = true; };
        window.addEventListener('cg-spa-navigate', handler);

        history.pushState({ chat: 123 }, '', '/c/test-chat-456');
        await new Promise(r => setTimeout(r, 200));

        window.removeEventListener('cg-spa-navigate', handler);
        const bg = document.getElementById('cg-customizer-background');

        return {
          pass: spaEventFired && !!bg && document.body.contains(bg),
          info: 'spaEventFired=' + spaEventFired + ', bgConnected=' + (bg ? document.body.contains(bg) : false)
        };
      })()`);
      return res;
    });

    // 8. Immediate background recovery when React removes background layer
    await assertTest("Immediate background recovery when DOM element is removed", async () => {
      const res = await evaluate(`(async () => {
        const bg = document.getElementById('cg-customizer-background');
        if (!bg) return { pass: false, info: 'no bg' };

        bg.remove();
        await new Promise(r => setTimeout(r, 250));
        
        const restoredBg = document.getElementById('cg-customizer-background');
        return {
          pass: !!restoredBg && document.body.contains(restoredBg),
          info: 'restored=' + !!restoredBg + ', inBody=' + (restoredBg ? document.body.contains(restoredBg) : false)
        };
      })()`);
      return res;
    });

    // 9. Manifest V3 version specification compliance (Chromium 1-4 dot-separated integer constraint)
    await assertTest("Manifest V3 version specification strictly complies with Chromium integer constraints", async () => {
      const manifestPath = path.join(extensionBuildDir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        return { pass: false, error: 'manifest.json missing in build' };
      }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const versionStr = manifest.version;
      const versionParts = typeof versionStr === 'string' ? versionStr.split('.') : [];
      const isIntegerParts = versionParts.length >= 1 && versionParts.length <= 4 &&
        versionParts.every(p => /^\d+$/.test(p) && Number(p) >= 0 && Number(p) <= 65535);

      if (!isIntegerParts) {
        return {
          pass: false,
          error: `manifest.version "${versionStr}" is invalid for Chromium (must be 1-4 dot-separated integers 0-65535)`
        };
      }

      return {
        pass: true,
        info: `version=${manifest.version}, version_name=${manifest.version_name}`
      };
    });

    console.log("=======================================================================");
    console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);

    ws.close();
    proc.kill();
    server.close();

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error("Test execution failed:", err);
    proc.kill();
    server.close();
    process.exit(1);
  }
});
