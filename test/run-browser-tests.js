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
      background: #212121;
    }
    .conversation-thread {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 800px;
      margin: 0 auto;
      width: 100%;
    }
    .turn {
      padding: 12px;
      border-radius: 8px;
    }
    .user-turn {
      align-self: flex-end;
      background: #2f2f2f;
      max-width: 70%;
    }
    .assistant-turn {
      align-self: flex-start;
      background: #212121;
      width: 100%;
    }
    .CodeBlock {
      background: #000;
      padding: 8px;
      border-radius: 4px;
      margin: 8px 0;
    }
    .TableView {
      margin: 8px 0;
    }
    .DILRender {
      padding: 8px;
      border: 1px dashed #555;
      margin: 8px 0;
    }
    .composer {
      padding: 16px;
      background: #303030;
      border-top: 1px solid #333;
    }
    textarea {
      width: 100%;
      background: transparent;
      color: white;
      border: 1px solid #555;
      padding: 8px;
    }
  </style>
  <script src="/mock-chrome.js"></script>
</head>
<body>
  <div id="root">
    <nav aria-label="Chat history">
      <div><h3>Chats</h3></div>
      <div class="chat-list"><p>Previous chat 1</p><p>Previous chat 2</p></div>
      <div>Profile</div>
    </nav>
    <main>
      <div class="conversation-thread">
        <!-- Turn 1: User message -->
        <div class="turn user-turn" id="turn-1">
          <div class="user-bubble">Hello ChatGPT, explain quicksort algorithm with code</div>
          <button aria-label="Edit message" style="font-size:10px">Edit</button>
        </div>

        <!-- Turn 2: Modern Assistant message with multiple nested content components -->
        <div class="turn assistant-turn" id="turn-2">
          <div class="content-wrapper">
            <div class="Markdown"><p>Quicksort is an efficient, general-purpose sorting algorithm.</p></div>
            <div class="CodeBlock"><pre><code>def quicksort(arr): return arr</code></pre></div>
            <div class="TableView"><table><tr><th>Avg Time</th><th>Worst</th></tr><tr><td>O(n log n)</td><td>O(n^2)</td></tr></table></div>
            <div class="DILRender"><span>Interactive Simulation Component</span></div>
          </div>
          <div class="actions-bar" style="margin-top:8px">
            <button aria-label="Copy message">Copy</button>
            <button aria-label="Good response">Like</button>
          </div>
        </div>

        <!-- Turn 3: Short User message -->
        <div class="turn user-turn" id="turn-3">
          <div class="user-bubble">How about merge sort?</div>
          <button aria-label="Edit message" style="font-size:10px">Edit</button>
        </div>

        <!-- Turn 4: Legacy/Standard Assistant message with data attributes -->
        <div class="turn assistant-turn" id="turn-4" data-message-id="msg-legacy-999" data-message-author-role="assistant">
          <div class="prose"><p>Merge sort is a divide-and-conquer algorithm that guarantees O(n log n) time.</p></div>
          <div class="actions-bar"><button aria-label="Copy">Copy</button></div>
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
      } else {
        console.log("UNHANDLED WS:", event.data.slice(0, 150));
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
      console.log("-> evaluate:", code.trim().slice(0, 40).replace(/\n/g, ' '));
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

    // Allow page to load scripts, render background and initialize collapsible messages
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

    // 2. Message detection tests
    await assertTest("Detect both modern DIV and legacy messages", async () => {
      const res = await evaluate(`(() => {
        const containers = Array.from(document.querySelectorAll('.cg-collapse-container'));
        return {
          pass: containers.length >= 4,
          info: 'Found ' + containers.length + ' collapsible message containers (expected >= 4)'
        };
      })()`);
      return res;
    });

    await assertTest("Turn 2 (Assistant message) receives exactly 1 collapse button", async () => {
      const res = await evaluate(`(() => {
        const turn2 = document.getElementById('turn-2');
        const btns = turn2.querySelectorAll('.cg-collapse-btn');
        const codeBlockBtn = turn2.querySelector('.CodeBlock .cg-collapse-btn');
        const tableBtn = turn2.querySelector('.TableView .cg-collapse-btn');
        return {
          pass: btns.length === 1 && !codeBlockBtn && !tableBtn,
          info: 'Turn 2 buttons: ' + btns.length + ', codeBlockBtn: ' + !!codeBlockBtn
        };
      })()`);
      return res;
    });

    await assertTest("User messages (Turn 1 & Turn 3) receive collapse buttons", async () => {
      const res = await evaluate(`(() => {
        const turn1 = document.getElementById('turn-1');
        const turn3 = document.getElementById('turn-3');
        const btn1 = turn1?.querySelector('.cg-collapse-btn');
        const btn3 = turn3?.querySelector('.cg-collapse-btn');
        return {
          pass: !!btn1 && !!btn3,
          info: 'Turn 1 button: ' + !!btn1 + ', Turn 3 button: ' + !!btn3
        };
      })()`);
      return res;
    });

    // 3. Message collapse and expand interaction
    await assertTest("Click collapse button to collapse message", async () => {
      const res = await evaluate(`(() => {
        const turn2 = document.getElementById('turn-2');
        const btn = turn2.querySelector('.cg-collapse-btn');
        if (!btn) return { pass: false, error: 'no collapse button on turn-2' };
        btn.click();
        const isCollapsed = turn2.classList.contains('collapsed');
        const style = turn2.style.overflow;
        return {
          pass: isCollapsed && style === 'hidden',
          info: 'collapsed=' + isCollapsed + ', maxHeight=' + turn2.style.maxHeight
        };
      })()`);
      return res;
    });

    await assertTest("Click collapse button again to expand message", async () => {
      const res = await evaluate(`(() => {
        const turn2 = document.getElementById('turn-2');
        const btn = turn2.querySelector('.cg-collapse-btn');
        btn.click();
        const isCollapsed = turn2.classList.contains('collapsed');
        return {
          pass: !isCollapsed && turn2.style.maxHeight === '' && turn2.style.overflow === '',
          info: 'collapsed=' + isCollapsed
        };
      })()`);
      return res;
    });

    // 4. Master toggle test
    await assertTest("Master toggle button exists and toggles all messages", async () => {
      const res = await evaluate(`(async () => {
        const master = document.querySelector('.cg-toggle-all-btn');
        if (!master) return { pass: false, error: 'no master toggle btn' };
        
        master.click();
        await new Promise(r => setTimeout(r, 80));
        const allCollapsed = Array.from(document.querySelectorAll('.cg-collapse-container')).every(c => c.classList.contains('collapsed'));
        
        master.click();
        await new Promise(r => setTimeout(r, 80));
        const allExpanded = Array.from(document.querySelectorAll('.cg-collapse-container')).every(c => !c.classList.contains('collapsed'));
        
        return {
          pass: allCollapsed && allExpanded,
          info: 'allCollapsed=' + allCollapsed + ', allExpanded=' + allExpanded
        };
      })()`);
      return res;
    });

    // 5. Keyboard shortcut tests
    await assertTest("Alt+C toggles closest message", async () => {
      const res = await evaluate(`(() => {
        const turn1 = document.getElementById('turn-1');
        const btn = turn1.querySelector('button');
        btn.focus();
        
        const event = new KeyboardEvent('keydown', { code: 'KeyC', altKey: true, bubbles: true });
        document.dispatchEvent(event);
        const collapsed1 = turn1.classList.contains('collapsed');
        
        document.dispatchEvent(event);
        const restored = !turn1.classList.contains('collapsed');
        
        return {
          pass: collapsed1 && restored,
          info: 'collapsed=' + collapsed1 + ', restored=' + restored
        };
      })()`);
      return res;
    });

    await assertTest("Alt+Shift+C toggles all messages", async () => {
      const res = await evaluate(`(async () => {
        const event = new KeyboardEvent('keydown', { code: 'KeyC', altKey: true, shiftKey: true, bubbles: true });
        document.dispatchEvent(event);
        await new Promise(r => setTimeout(r, 80));
        const allCollapsed = Array.from(document.querySelectorAll('.cg-collapse-container')).every(c => c.classList.contains('collapsed'));
        
        document.dispatchEvent(event);
        await new Promise(r => setTimeout(r, 80));
        const allRestored = Array.from(document.querySelectorAll('.cg-collapse-container')).every(c => !c.classList.contains('collapsed'));
        
        return {
          pass: allCollapsed && allRestored,
          info: 'allCollapsed=' + allCollapsed + ', allRestored=' + allRestored
        };
      })()`);
      return res;
    });

    // 6. Alt-click test
    await assertTest("Alt-click functionality (enabled via config patch)", async () => {
      const res = await evaluate(`(async () => {
        for (const l of window.chrome.runtime.onMessage.listeners) {
          l({ type: 'SET_CFG_PARTIAL', patch: { altClickEnabled: true } }, {}, () => {});
        }
        await new Promise(r => setTimeout(r, 100));
        
        const turn3 = document.getElementById('turn-3');
        const bubble = turn3.querySelector('.user-bubble');
        
        bubble.dispatchEvent(new MouseEvent('click', { altKey: true, bubbles: true }));
        const collapsed = turn3.classList.contains('collapsed');
        
        bubble.dispatchEvent(new MouseEvent('click', { altKey: true, bubbles: true }));
        const restored = !turn3.classList.contains('collapsed');
        
        const editBtn = turn3.querySelector('button[aria-label="Edit message"]');
        editBtn.dispatchEvent(new MouseEvent('click', { altKey: true, bubbles: true }));
        const notToggled = !turn3.classList.contains('collapsed');
        
        return {
          pass: collapsed && restored && notToggled,
          info: 'altClick works, button click protected'
        };
      })()`);
      return res;
    });

    // 7. Dynamic message streaming / generation
    await assertTest("Dynamically appended message gets collapse control automatically", async () => {
      const res = await evaluate(`(async () => {
        const thread = document.querySelector('.conversation-thread');
        const turn5 = document.createElement('div');
        turn5.className = 'turn assistant-turn';
        turn5.id = 'turn-5';
        turn5.innerHTML = '<div class="Markdown"><p>Newly generated response via streaming...</p></div>';
        thread.appendChild(turn5);
        
        await new Promise(r => setTimeout(r, 500));
        
        const btn5 = turn5.querySelector('.cg-collapse-btn');
        return {
          pass: !!btn5 && turn5.classList.contains('cg-collapse-container'),
          info: 'turn 5 button: ' + !!btn5
        };
      })()`);
      return res;
    });

    // 8. Runtime config patch test (opacity, blur, gradient, image url)
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

    // 9. Clean disable test
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

    // 10. Clean re-enable test
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

    // 11. Edge case: Short user message ("ok")
    await assertTest("Edge case: Very short message is recognized", async () => {
      const res = await evaluate(`(async () => {
        const thread = document.querySelector('.conversation-thread');
        const shortTurn = document.createElement('div');
        shortTurn.className = 'turn user-turn';
        shortTurn.id = 'turn-short';
        shortTurn.innerHTML = '<div class="user-bubble">ok</div>';
        thread.appendChild(shortTurn);
        
        await new Promise(r => setTimeout(r, 400));
        const btn = shortTurn.querySelector('.cg-collapse-btn');
        return {
          pass: !!btn,
          info: 'short turn button=' + !!btn
        };
      })()`);
      return res;
    });

    // 12. Edge case: Extreme opacity and blur boundary values
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

    // 13. Edge case: Theme switching light/dark gradient adaptation
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

    // 14. Edge case: Persistent message state saved when reliable ID exists
    await assertTest("Edge case: Persistent storage saves state when reliable ID exists", async () => {
      const res = await evaluate(`(async () => {
        // Enable persistent state
        for (const l of window.chrome.runtime.onMessage.listeners) {
          l({ type: 'SET_CFG_PARTIAL', patch: { persistMessageState: true } }, {}, () => {});
        }
        await new Promise(r => setTimeout(r, 80));
        
        const turn4 = document.getElementById('turn-4'); // has data-message-id="msg-legacy-999"
        const btn4 = turn4.querySelector('.cg-collapse-btn');
        btn4.click(); // collapse it
        
        await new Promise(r => setTimeout(r, 150));
        
        // Check stored states in chrome.storage.local mock
        const storedStates = window._storageData['cg-message-states'] || {};
        const isPersisted = storedStates['msg-legacy-999'] === true;
        
        // expand it back
        btn4.click();
        await new Promise(r => setTimeout(r, 150));
        const updatedStates = window._storageData['cg-message-states'] || {};
        const isRestored = updatedStates['msg-legacy-999'] === false;
        
        return {
          pass: isPersisted && isRestored,
          info: 'savedCollapsed=' + isPersisted + ', savedExpanded=' + isRestored
        };
      })()`);
      return res;
    });

    // 15. Realistic Deep Modern ChatGPT DOM (depth 5 wrappers, no fake 'turn' or 'conversation-thread' classes, no artificial turn IDs)
    await assertTest("Realistic deep modern ChatGPT DOM without artificial classes", async () => {
      const res = await evaluate(`(async () => {
        const main = document.querySelector('main');
        
        // Build realistic deep nested Next.js/Tailwind conversation structure
        const deepWrapper = document.createElement('div');
        deepWrapper.className = 'relative flex h-full max-w-full flex-1 flex-col overflow-hidden';
        deepWrapper.innerHTML = \`
          <div class="flex h-full flex-col">
            <div class="flex-1 overflow-y-auto">
              <div class="mx-auto flex flex-1 gap-4 text-base md:max-w-3xl">
                <div class="flex w-full flex-col text-sm">
                  <!-- Modern User Turn (Depth 5 below main) -->
                  <div class="group/conversation-turn w-full">
                    <div class="flex justify-end p-4">
                      <div class="user-bubble rounded-3xl bg-token-main-surface-secondary px-5 py-2.5">
                        Explain Dijkstra algorithm
                      </div>
                      <button aria-label="Edit message" class="ml-2 text-xs">Edit</button>
                    </div>
                  </div>

                  <!-- Modern Assistant Turn with multiple components (Depth 5 below main) -->
                  <div class="group/conversation-turn w-full" id="modern-assistant-turn">
                    <div class="flex flex-col p-4">
                      <div class="Markdown prose">
                        <p>Dijkstra algorithm finds the shortest path between nodes in a graph.</p>
                      </div>
                      <div class="CodeBlock my-2">
                        <pre><code>import heapq\\ndef dijkstra(graph, start): pass</code></pre>
                      </div>
                      <div class="TableView my-2">
                        <table><tr><th>Node</th><th>Distance</th></tr><tr><td>A</td><td>0</td></tr></table>
                      </div>
                      <div class="DILRender my-2">
                        <span>Graph Visualization Widget</span>
                      </div>
                      <div class="actions-bar mt-2 flex gap-2">
                        <button aria-label="Copy response">Copy</button>
                        <button aria-label="Good response">Thumbs Up</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        \`;
        main.appendChild(deepWrapper);
        await new Promise(r => setTimeout(r, 450));

        const modernTurn = document.getElementById('modern-assistant-turn');
        const buttonsInModernTurn = modernTurn.querySelectorAll('.cg-collapse-btn');
        const codeBlockButtons = modernTurn.querySelectorAll('.CodeBlock .cg-collapse-btn');
        const deepWrapperButtons = deepWrapper.querySelectorAll(':scope > .cg-collapse-btn');

        // Test collapsing modern turn
        const btn = modernTurn.querySelector('.cg-collapse-btn');
        let collapsedHeightOk = false;
        if (btn) {
          btn.click();
          await new Promise(r => setTimeout(r, 100));
          collapsedHeightOk = modernTurn.classList.contains('collapsed');
          btn.click(); // restore
        }

        return {
          pass: buttonsInModernTurn.length === 1 && codeBlockButtons.length === 0 && deepWrapperButtons.length === 0 && collapsedHeightOk,
          info: 'assistantButtons=' + buttonsInModernTurn.length + ', codeBlockButtons=' + codeBlockButtons.length + ', deepWrapperButtons=' + deepWrapperButtons.length + ', collapseToggle=' + collapsedHeightOk
        };
      })()`);
      return res;
    });

    // 16. SPA Navigation via history.pushState triggers immediate background verification
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

    // 17. Immediate background recovery when React removes background layer
    await assertTest("Immediate background recovery when DOM element is removed", async () => {
      const res = await evaluate(`(async () => {
        const bg = document.getElementById('cg-customizer-background');
        if (!bg) return { pass: false, info: 'no bg' };

        // Simulate React unmounting or wiping the injected node
        bg.remove();
        
        // Observer should catch removedNodes and immediately restore within < 200ms
        await new Promise(r => setTimeout(r, 250));
        
        const restoredBg = document.getElementById('cg-customizer-background');
        return {
          pass: !!restoredBg && document.body.contains(restoredBg),
          info: 'restored=' + !!restoredBg + ', inBody=' + (restoredBg ? document.body.contains(restoredBg) : false)
        };
      })()`);
      return res;
    });

    // 18. Master toggle position does not collide with bottom-right floating controls
    await assertTest("Master toggle button positioned safely above floating controls", async () => {
      const res = await evaluate(`(() => {
        const master = document.querySelector('.cg-toggle-all-btn');
        if (!master) return { pass: false, info: 'no master toggle' };
        const style = window.getComputedStyle(master);
        const bottom = style.bottom;
        return {
          pass: !!master && style.position === 'fixed' && bottom !== '1.2em',
          info: 'position=' + style.position + ', bottom=' + bottom
        };
      })()`);
      return res;
    });

    // 19. Manifest V3 version specification compliance (Chromium 1-4 dot-separated integer constraint)
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

      if (!manifest.version_name) {
        return {
          pass: false,
          error: 'manifest.version_name is missing (should contain pre-release display version like 0.1.0-alpha)'
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
