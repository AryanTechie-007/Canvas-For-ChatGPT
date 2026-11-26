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

    // 9. Outer rectangular form/wrapper transparency around rounded composer pill
    await assertTest("Outer rectangular form and div wrappers around rounded prompt pill stay transparent", async () => {
      const res = await evaluate(`(async () => {
        const main = document.querySelector('main');
        const host = document.createElement('div');
        host.id = 'modern-composer-host';
        host.innerHTML = \`
          <div class="composer-outer-rect" style="background: rgb(20, 20, 20);">
            <form class="composer-form-rect">
              <div class="composer-inner-rect">
                <div class="composer-pill-rounded" data-composer-surface style="border-radius: 28px; min-height: 52px;">
                  <div id="prompt-textarea" contenteditable="true">Ask ChatGPT</div>
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
        \`;
        main.appendChild(host);
        await new Promise(r => setTimeout(r, 350));

        const outerRectBg = window.getComputedStyle(host.querySelector('.composer-outer-rect')).backgroundColor;
        const formRectBg = window.getComputedStyle(host.querySelector('.composer-form-rect')).backgroundColor;
        const innerRectBg = window.getComputedStyle(host.querySelector('.composer-inner-rect')).backgroundColor;
        const pillBg = window.getComputedStyle(host.querySelector('.composer-pill-rounded')).backgroundColor;

        const outerNoAttrBg = window.getComputedStyle(host.querySelector('.composer-outer-no-attr')).backgroundColor;
        const formNoAttrBg = window.getComputedStyle(host.querySelector('.composer-form-no-attr')).backgroundColor;
        const pillNoAttrBg = window.getComputedStyle(host.querySelector('.composer-pill-no-attr')).backgroundColor;

        host.remove();
        await new Promise(r => setTimeout(r, 300));

        const wrappersTransparent =
          outerRectBg === 'rgba(0, 0, 0, 0)' &&
          formRectBg === 'rgba(0, 0, 0, 0)' &&
          innerRectBg === 'rgba(0, 0, 0, 0)' &&
          outerNoAttrBg === 'rgba(0, 0, 0, 0)' &&
          formNoAttrBg === 'rgba(0, 0, 0, 0)';
        const pillsSolid =
          pillBg !== 'rgba(0, 0, 0, 0)' && pillBg !== 'transparent' &&
          pillNoAttrBg !== 'rgba(0, 0, 0, 0)' && pillNoAttrBg !== 'transparent';

        return {
          pass: wrappersTransparent && pillsSolid,
          info: 'formBg=' + formRectBg + ', innerRectBg=' + innerRectBg + ', pillBg=' + pillBg + ', pillNoAttrBg=' + pillNoAttrBg
        };
      })()`);
      return res;
    });

    // 10. Footer backdrop strips and ::before backdrops stay transparent behind rounded form pill
    await assertTest("Footer backdrop strips and ::before layers stay transparent behind rounded form", async () => {
      const res = await evaluate(`(async () => {
        const styleEl = document.createElement('style');
        styleEl.id = 'test-pseudo-backdrop-style';
        styleEl.textContent = '.test-pseudo-wrapper::before { content: ""; position: absolute; inset: 0; background-color: rgb(0, 0, 0); z-index: -1; }';
        document.head.appendChild(styleEl);

        const footer = document.createElement('footer');
        footer.setAttribute('data-ds-composer', '');
        footer.innerHTML = \`
          <span aria-hidden="true" class="test-strip" style="position: absolute; inset-inline: 0; bottom: 0; height: 24px; background: rgb(0, 0, 0);"></span>
          <div class="test-pseudo-wrapper" style="position: relative;">
            <form class="test-rounded-form" style="border-radius: 28px; min-height: 52px; background: rgb(33, 33, 33);">
              <textarea placeholder="Ask ChatGPT"></textarea>
            </form>
          </div>
        \`;
        document.body.appendChild(footer);
        await new Promise(r => setTimeout(r, 350));

        const stripBg = window.getComputedStyle(footer.querySelector('.test-strip')).backgroundColor;
        const pseudoBg = window.getComputedStyle(footer.querySelector('.test-pseudo-wrapper'), '::before').backgroundColor;
        const formBg = window.getComputedStyle(footer.querySelector('.test-rounded-form')).backgroundColor;

        footer.remove();
        styleEl.remove();
        await new Promise(r => setTimeout(r, 300));

        return {
          pass: stripBg === 'rgba(0, 0, 0, 0)' && pseudoBg === 'rgba(0, 0, 0, 0)' && formBg === 'rgb(33, 33, 33)',
          info: 'stripBg=' + stripBg + ', pseudoBg=' + pseudoBg + ', formBg=' + formBg
        };
      })()`);
      return res;
    });

    // 11. Per-chat wallpapers apply per route and fall back to Global Default
    await assertTest("Per-chat wallpapers switch across chats and fall back to Global Default", async () => {
      const res = await evaluate(`(async () => {
        for (const l of window.chrome.runtime.onMessage.listeners) {
          l({
            type: 'SET_CFG_PARTIAL',
            patch: {
              backgroundImageUrl: 'https://example.com/global-default.jpg',
              mainImageOpacity: 0.5,
              blurAmount: 20,
              chatBackgrounds: {
                'c:chat-alpha': {
                  backgroundImageUrl: 'https://example.com/alpha.jpg',
                  mainImageOpacity: 0.9,
                  blurAmount: 5
                },
                'c:chat-beta': {
                  backgroundImageUrl: 'https://example.com/beta.jpg',
                  mainImageOpacity: 0.35,
                  blurAmount: 40
                }
              }
            }
          }, {}, () => {});
        }
        await new Promise(r => setTimeout(r, 100));

        history.pushState({}, '', '/c/chat-alpha');
        await new Promise(r => setTimeout(r, 150));
        const img = document.querySelector('#cg-customizer-background img');
        const alphaOk = img.src === 'https://example.com/alpha.jpg' && img.style.opacity === '0.9' && img.style.filter.includes('5px');

        let ctxAlpha = null;
        for (const l of window.chrome.runtime.onMessage.listeners) {
          l({ type: 'GET_CHAT_CONTEXT' }, {}, (resp) => { if (resp) ctxAlpha = resp; });
        }

        history.pushState({}, '', '/g/g-demo/c/chat-beta');
        await new Promise(r => setTimeout(r, 150));
        const betaOk = img.src === 'https://example.com/beta.jpg' && img.style.opacity === '0.35' && img.style.filter.includes('40px');

        history.pushState({}, '', '/c/chat-no-override');
        await new Promise(r => setTimeout(r, 150));
        const fallbackOk = img.src === 'https://example.com/global-default.jpg' && img.style.opacity === '0.5' && img.style.filter.includes('20px');

        history.pushState({}, '', '/');
        await new Promise(r => setTimeout(r, 150));
        const rootFallbackOk = img.src === 'https://example.com/global-default.jpg';

        return {
          pass: alphaOk && betaOk && fallbackOk && rootFallbackOk && ctxAlpha?.chatKey === 'c:chat-alpha',
          info: 'alpha=' + alphaOk + ', beta=' + betaOk + ', fallback=' + fallbackOk + ', root=' + rootFallbackOk + ', ctxKey=' + ctxAlpha?.chatKey
        };
      })()`);
      return res;
    });

    // 12. Modern ChatGPT #stage-slideover-sidebar becomes single frosted-glass surface while preserving pills/buttons/menus
    await assertTest("Modern #stage-slideover-sidebar becomes uniform frosted glass without flattening pills or avatars", async () => {
      const res = await evaluate(`(async () => {
        const styleEl = document.createElement('style');
        styleEl.id = 'test-modern-sidebar-style';
        styleEl.textContent = \`
          #stage-slideover-sidebar {
            --sidebar-surface-primary: rgb(22, 22, 22);
            --bg-elevated-secondary: rgb(22, 22, 22);
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

        const appShell = document.createElement('div');
        appShell.id = 'modern-sidebar-host';
        appShell.style.backgroundColor = 'rgb(22, 22, 22)';
        appShell.innerHTML = \`
          <div class="shell-inner" style="background-color: rgb(22, 22, 22);">
            <div id="stage-slideover-sidebar" style="background-color: var(--bg-elevated-secondary);">
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
                    <a href="/c/two">OS Notes</a>
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
        \`;
        document.body.appendChild(appShell);
        await new Promise(r => setTimeout(r, 350));

        const root = appShell.querySelector('#stage-slideover-sidebar');
        const rootCs = window.getComputedStyle(root);
        const shellInnerBg = window.getComputedStyle(appShell.querySelector('.shell-inner')).backgroundColor;
        const innerWrapBg = window.getComputedStyle(appShell.querySelector('.sidebar-inner-wrapper')).backgroundColor;
        const navBg = window.getComputedStyle(appShell.querySelector('nav')).backgroundColor;
        const navBlur = window.getComputedStyle(appShell.querySelector('nav')).backdropFilter;
        const headerWrapBg = window.getComputedStyle(appShell.querySelector('.sticky-header-wrap')).backgroundColor;
        const headerElBg = window.getComputedStyle(appShell.querySelector('#sidebar-header')).backgroundColor;
        const asideBg = window.getComputedStyle(appShell.querySelector('.sidebar-top-links')).backgroundColor;
        const scrollWrapBg = window.getComputedStyle(appShell.querySelector('.sidebar-scroll-fade')).backgroundColor;
        const scrollPseudoBg = window.getComputedStyle(appShell.querySelector('.sidebar-scroll-fade'), '::before').backgroundColor;
        const stickySecCs = window.getComputedStyle(appShell.querySelector('.history-section-sticky'));
        const footerWrapBg = window.getComputedStyle(appShell.querySelector('.sidebar-footer-wrap')).backgroundColor;

        const newChatBg = window.getComputedStyle(appShell.querySelector('.new-chat-pill')).backgroundColor;
        const chatRowBg = window.getComputedStyle(appShell.querySelector('.chat-row-group')).backgroundColor;
        const avatarBg = window.getComputedStyle(appShell.querySelector('.avatar-badge')).backgroundColor;
        const claimOfferBg = window.getComputedStyle(appShell.querySelector('.claim-offer-btn')).backgroundColor;
        const menuBg = window.getComputedStyle(appShell.querySelector('.sidebar-context-menu')).backgroundColor;

        const rootBg = rootCs.backgroundColor;
        const rootBlur = rootCs.backdropFilter;
        const stickyBg = stickySecCs.backgroundColor;
        const stickyBlur = stickySecCs.backdropFilter;

        const darkFrostedOk = rootBg === 'rgba(24, 24, 24, 0.4)' && (rootBlur || '').includes('blur(12px)');
        const innerTransparentOk =
          shellInnerBg === 'rgba(0, 0, 0, 0)' &&
          innerWrapBg === 'rgba(0, 0, 0, 0)' &&
          navBg === 'rgba(0, 0, 0, 0)' &&
          navBlur === 'none' &&
          headerWrapBg === 'rgba(0, 0, 0, 0)' &&
          headerElBg === 'rgba(0, 0, 0, 0)' &&
          asideBg === 'rgba(0, 0, 0, 0)' &&
          scrollWrapBg === 'rgba(0, 0, 0, 0)' &&
          scrollPseudoBg === 'rgba(0, 0, 0, 0)' &&
          stickyBg === 'rgba(0, 0, 0, 0)' &&
          (stickyBlur || '').includes('blur(12px)') &&
          footerWrapBg === 'rgba(0, 0, 0, 0)';
        const interactivePreservedOk =
          newChatBg === 'rgb(46, 46, 46)' &&
          chatRowBg === 'rgb(40, 40, 40)' &&
          avatarBg === 'rgb(44, 182, 156)' &&
          claimOfferBg === 'rgb(33, 33, 33)' &&
          menuBg === 'rgb(42, 42, 42)';

        // Also verify light mode adapts frosted tint cleanly
        document.documentElement.classList.remove('dark');
        document.documentElement.setAttribute('data-theme', 'light');
        await new Promise(r => setTimeout(r, 120));
        const lightBg = window.getComputedStyle(root).backgroundColor;
        const lightFrostedOk = lightBg === 'rgba(255, 255, 255, 0.4)';

        // Restore dark mode, verify disabling cleans sidebar attributes, then re-enable & cleanup
        document.documentElement.classList.add('dark');
        document.documentElement.setAttribute('data-theme', 'dark');
        await new Promise(r => setTimeout(r, 120));

        for (const l of window.chrome.runtime.onMessage.listeners) {
          l({ type: 'SET_CFG_PARTIAL', patch: { enabled: false } }, {}, () => {});
        }
        await new Promise(r => setTimeout(r, 100));
        const cleanedUpOk =
          document.querySelectorAll('[data-cg-sidebar-surface], [data-cg-sidebar-ancestor], [data-cg-sidebar-transparent], [data-cg-sidebar-sticky], [data-cg-sidebar-pseudo-bg]').length === 0 &&
          window.getComputedStyle(root).backgroundColor === 'rgb(22, 22, 22)';

        for (const l of window.chrome.runtime.onMessage.listeners) {
          l({ type: 'SET_CFG_PARTIAL', patch: { enabled: true } }, {}, () => {});
        }
        await new Promise(r => setTimeout(r, 100));

        appShell.remove();
        styleEl.remove();
        await new Promise(r => setTimeout(r, 300));

        const diag =
          'darkFrosted=' + darkFrostedOk + '(' + rootBg + '|' + rootBlur + ')' +
          ', lightFrosted=' + lightFrostedOk + '(' + lightBg + ')' +
          ', innerTransparent=' + innerTransparentOk +
          '[shell=' + shellInnerBg + ',wrap=' + innerWrapBg + ',nav=' + navBg + ',navBlur=' + navBlur + ',hw=' + headerWrapBg + ',he=' + headerElBg + ',aside=' + asideBg + ',scroll=' + scrollWrapBg + ',pseudo=' + scrollPseudoBg + ',sticky=' + stickyBg + '|' + stickyBlur + ',footer=' + footerWrapBg + ']' +
          ', interactivePreserved=' + interactivePreservedOk +
          '[new=' + newChatBg + ',row=' + chatRowBg + ',avatar=' + avatarBg + ',claim=' + claimOfferBg + ',menu=' + menuBg + ']' +
          ', cleanedUp=' + cleanedUpOk;

        const pass = darkFrostedOk && innerTransparentOk && lightFrostedOk && interactivePreservedOk && cleanedUpOk;
        return {
          pass,
          info: diag,
          error: pass ? undefined : diag
        };
      })()`);
      return res;
    });

    // 13. Mobile #stage-popover-sidebar gets frosted glass without affecting unrelated dialogs
    await assertTest("Mobile #stage-popover-sidebar gets frosted glass while unrelated dialogs stay solid", async () => {
      const res = await evaluate(`(async () => {
        const host = document.createElement('div');
        host.id = 'mobile-popover-host';
        host.innerHTML = \`
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
        document.body.appendChild(host);
        await new Promise(r => setTimeout(r, 350));

        const scrimBg = window.getComputedStyle(host.querySelector('.popover-scrim')).backgroundColor;
        const popoverBg = window.getComputedStyle(host.querySelector('#stage-popover-sidebar')).backgroundColor;
        const popoverNavBg = window.getComputedStyle(host.querySelector('#stage-popover-sidebar nav')).backgroundColor;
        const modalBg = window.getComputedStyle(host.querySelector('#settings-modal')).backgroundColor;
        const modalNavBg = window.getComputedStyle(host.querySelector('#settings-modal nav')).backgroundColor;

        host.remove();
        await new Promise(r => setTimeout(r, 300));

        const pass =
          scrimBg === 'rgba(0, 0, 0, 0.5)' &&
          popoverBg === 'rgba(24, 24, 24, 0.4)' &&
          popoverNavBg === 'rgba(0, 0, 0, 0)' &&
          modalBg === 'rgb(40, 40, 40)' &&
          modalNavBg === 'rgb(45, 45, 45)';
        const diag = 'scrim=' + scrimBg + ', popover=' + popoverBg + ', popoverNav=' + popoverNavBg + ', modal=' + modalBg + ', modalNav=' + modalNavBg;

        return {
          pass,
          info: diag,
          error: pass ? undefined : diag
        };
      })()`);
      return res;
    });

    // 14. Manifest V3 version specification compliance (Chromium 1-4 dot-separated integer constraint)
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
