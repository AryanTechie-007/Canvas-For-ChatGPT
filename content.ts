// content.ts

import { Storage } from "@plasmohq/storage"
import { CollapsibleMessages, type CollapsibleConfig } from "./collapsible-messages"

// ------------------------------
// Configuración del content script (Plasmo)
// ------------------------------
export const config = {
  matches: ["https://chatgpt.com/*", "https://chat.openai.com/*"],
  run_at: "document_idle"
}

// ------------------------------
// Tipos y defaults
// ------------------------------
type Cfg = {
  enabled: boolean
  backgroundImageUrl: string
  mainImageOpacity: number
  blurAmount: number
  gradientOpacity: number
  collapsibleMessages: boolean
  buttonOpacity: number
  collapsedHeight: string
  altClickEnabled: boolean
  persistMessageState: boolean
  savedBackgrounds: string[]
}

const DEFAULT_CFG: Cfg = {
  enabled: true,
  backgroundImageUrl: "https://persistent.oaistatic.com/burrito-nux/640.webp",
  mainImageOpacity: 0.5,
  blurAmount: 70,
  gradientOpacity: 1.0,
  collapsibleMessages: true,
  buttonOpacity: 0.4,
  collapsedHeight: "6.5em",
  altClickEnabled: false,
  persistMessageState: false,
  savedBackgrounds: []
}

// ------------------------------
// Estado y utilidades de storage (con fallback seguro para Brave/Chromium)
// ------------------------------
const storage = new Storage({ area: "local" })
let cfg: Cfg = DEFAULT_CFG
let collapsibleMessages: CollapsibleMessages | null = null

const readCfg = async (): Promise<Cfg> => {
  try {
    const data = await storage.get<Cfg>("chatgpt-custom-bg:cfg")
    if (data) return data
  } catch (e) {
    console.warn("Canvas for ChatGPT: storage.get error, using fallback", e)
  }
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const res = await chrome.storage.local.get("chatgpt-custom-bg:cfg")
      if (res?.["chatgpt-custom-bg:cfg"]) return res["chatgpt-custom-bg:cfg"]
    }
  } catch (e) {}
  return DEFAULT_CFG
}

const writeCfg = async (next: Cfg) => {
  try {
    await storage.set("chatgpt-custom-bg:cfg", next)
  } catch (e) {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        await chrome.storage.local.set({ "chatgpt-custom-bg:cfg": next })
      }
    } catch (e2) {}
  }
}

// ------------------------------
// Selectores resilientes para elementos de UI de ChatGPT
// ------------------------------
const sel = {
  mainWrapper: "main, [role='main']",
  sidebar: "nav, [aria-label='Chat history'], aside",
  chatListHeader: "nav > div:first-child",
  sidebarFooter: "nav > div:last-child",
  sidebarNav: "nav",
  pageHeader: "header, [data-testid='page-header']",
  mobileHeader: "header",
  stickyAsides: "aside",
  composerWrapper: "[data-composer-surface], form"
}

// ------------------------------
// Capa de fondo dedicada y estilos CSS
// ------------------------------
let backgroundEl: HTMLDivElement | null = null
let imgEl: HTMLImageElement | null = null
let gradEl: HTMLDivElement | null = null
const BACKGROUND_ID = "cg-customizer-background"
const BACKGROUND_STYLE_ID = "cg-customizer-background-style"

const BACKGROUND_CSS = `
  #${BACKGROUND_ID} {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    overflow: hidden !important;
    pointer-events: none !important;
    z-index: 0 !important;
    contain: strict;
  }
  #${BACKGROUND_ID} > img {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
    transform: scale(1.02);
    pointer-events: none !important;
    will-change: opacity, filter;
  }
  #${BACKGROUND_ID} > .cg-customizer-gradient {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    pointer-events: none !important;
  }

  /* Transparencia general cuando el fondo está activo */
  html.cg-customizer-background-enabled,
  html.cg-customizer-background-enabled body {
    background: transparent !important;
    background-color: transparent !important;
  }

  /* Sobrescritura de variables CSS de ChatGPT en html y body */
  html.cg-customizer-background-enabled,
  html.cg-customizer-background-enabled body {
    --bg-primary: transparent !important;
    --main-surface-primary: transparent !important;
    --main-surface-secondary: transparent !important;
    --main-surface-tertiary: transparent !important;
    --bg-elevated-secondary: transparent !important;
    --color-background-panel: transparent !important;
    --color-background-surface: transparent !important;
    --color-surface-primary: transparent !important;
    --color-surface-secondary: transparent !important;
    --color-surface-tertiary: transparent !important;
    --app-color-background-surface: transparent !important;
    --app-color-background-surface-under: transparent !important;
    --surface-primary: transparent !important;
    --surface-secondary: transparent !important;
    --surface-tertiary: transparent !important;
  }

  /* El contenido de React debe colocarse sobre el fondo (z-index: 1) sin taparlo */
  html.cg-customizer-background-enabled #__next,
  html.cg-customizer-background-enabled div#root,
  html.cg-customizer-background-enabled [data-testid="root"],
  html.cg-customizer-background-enabled body > div,
  html.cg-customizer-background-enabled body > div > div,
  html.cg-customizer-background-enabled body > div > div > div,
  html.cg-customizer-background-enabled body > div > div > div > div {
    background-color: transparent !important;
  }

  html.cg-customizer-background-enabled main {
    position: relative !important;
    z-index: 1 !important;
    background-color: transparent !important;
    background: transparent !important;
  }

  html.cg-customizer-background-enabled div[class*="main-surface"],
  html.cg-customizer-background-enabled div[class*="bg-token-main-surface"],
  html.cg-customizer-background-enabled div[class*="bg-token-surface"],
  html.cg-customizer-background-enabled div[class*="bg-surface-primary"],
  html.cg-customizer-background-enabled div[class*="bg-surface-secondary"],
  html.cg-customizer-background-enabled [class*="bg-token-bg-primary"]:not([data-composer-surface]):not([id="composer-background"]):not(form):not(form *),
  html.cg-customizer-background-enabled [class*="bg-token-bg-secondary"]:not([data-composer-surface]):not([id="composer-background"]):not(form):not(form *),
  html.cg-customizer-background-enabled [class*="bg-token-bg-elevated"]:not([data-composer-surface]):not([id="composer-background"]):not(form):not(form *) {
    background-color: transparent !important;
  }

  /* Barra lateral con efecto frosted glass */
  html.cg-customizer-background-enabled nav,
  html.cg-customizer-background-enabled aside,
  html.cg-customizer-background-enabled [aria-label="Chat history"] {
    background-color: rgba(255, 255, 255, 0.4) !important;
    backdrop-filter: blur(12px) !important;
    -webkit-backdrop-filter: blur(12px) !important;
  }

  html.dark.cg-customizer-background-enabled nav,
  html[data-theme="dark"].cg-customizer-background-enabled nav,
  html.dark.cg-customizer-background-enabled aside,
  html[data-theme="dark"].cg-customizer-background-enabled aside,
  html.dark.cg-customizer-background-enabled [aria-label="Chat history"],
  html[data-theme="dark"].cg-customizer-background-enabled [aria-label="Chat history"] {
    background-color: rgba(24, 24, 24, 0.4) !important;
  }

  /* Compositor: conservar fondo sólido y legible */
  html.cg-customizer-background-enabled [data-composer-surface],
  html.cg-customizer-background-enabled [id="composer-background"],
  html.cg-customizer-background-enabled form:has(textarea),
  html.cg-customizer-background-enabled form:has(#prompt-textarea),
  html.cg-customizer-background-enabled form:has([contenteditable="true"]),
  html.cg-customizer-background-enabled div:has(#prompt-textarea) {
    background-color: #ffffff !important;
  }

  html.dark.cg-customizer-background-enabled [data-composer-surface],
  html[data-theme="dark"].cg-customizer-background-enabled [data-composer-surface],
  html.dark.cg-customizer-background-enabled [id="composer-background"],
  html[data-theme="dark"].cg-customizer-background-enabled [id="composer-background"],
  html.dark.cg-customizer-background-enabled form:has(textarea),
  html[data-theme="dark"].cg-customizer-background-enabled form:has(textarea),
  html.dark.cg-customizer-background-enabled form:has(#prompt-textarea),
  html[data-theme="dark"].cg-customizer-background-enabled form:has(#prompt-textarea),
  html.dark.cg-customizer-background-enabled form:has([contenteditable="true"]),
  html[data-theme="dark"].cg-customizer-background-enabled form:has([contenteditable="true"]),
  html.dark.cg-customizer-background-enabled div:has(#prompt-textarea),
  html[data-theme="dark"].cg-customizer-background-enabled div:has(#prompt-textarea) {
    background-color: #303030 !important;
  }

  /* Dialogs, menus, popups and tooltips: solid background protection */
  html.cg-customizer-background-enabled [role="dialog"],
  html.cg-customizer-background-enabled [role="menu"],
  html.cg-customizer-background-enabled [role="alertdialog"],
  html.cg-customizer-background-enabled [role="tooltip"],
  html.cg-customizer-background-enabled [role="popover"] {
    /* Retain solid background */
  }
`

function ensureBackground() {
  if (!cfg.enabled) return

  // Inyectar o asegurar estilos CSS
  let style = document.getElementById(BACKGROUND_STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement("style")
    style.id = BACKGROUND_STYLE_ID
    style.textContent = BACKGROUND_CSS
    const targetHead = document.head || document.documentElement
    targetHead.appendChild(style)
  }

  // Asegurar elemento de fondo en document.body (o document.documentElement)
  const existing = document.getElementById(BACKGROUND_ID) as HTMLDivElement | null
  if (!existing || !existing.isConnected) {
    if (existing) existing.remove()

    backgroundEl = document.createElement("div")
    backgroundEl.id = BACKGROUND_ID
    backgroundEl.setAttribute("aria-hidden", "true")

    imgEl = document.createElement("img")
    imgEl.alt = ""
    imgEl.draggable = false
    imgEl.decoding = "async"
    imgEl.loading = "eager"

    gradEl = document.createElement("div")
    gradEl.className = "cg-customizer-gradient"

    backgroundEl.append(imgEl, gradEl)

    if (document.body) {
      document.body.prepend(backgroundEl)
    } else {
      document.documentElement.appendChild(backgroundEl)
    }
  } else {
    backgroundEl = existing
    imgEl = existing.querySelector("img")
    gradEl = existing.querySelector(".cg-customizer-gradient") as HTMLDivElement | null
  }
}

// ------------------------------
// Estilos dinámicos de UI
// ------------------------------
function applyUIStyles() {
  const isDark =
    document.documentElement.classList.contains("dark") ||
    document.documentElement.getAttribute("data-theme") === "dark"
  const blurBG = isDark ? "rgba(24, 24, 24, 0.4)" : "rgba(255, 255, 255, 0.4)"
  const blurFx = "blur(12px)"

  // Variables de color de superficie
  document.documentElement.style.setProperty("--bg-primary", "transparent")
  document.documentElement.style.setProperty("--main-surface-primary", "transparent")
  document.documentElement.style.setProperty("--bg-elevated-secondary", "transparent")

  // Contenedor principal y ancestros hacia body
  const mainWrapper = document.querySelector<HTMLElement>(sel.mainWrapper)
  if (mainWrapper) {
    mainWrapper.style.backgroundColor = "transparent"
    let ancestor = mainWrapper.parentElement
    while (ancestor && ancestor !== document.body && ancestor !== document.documentElement) {
      ancestor.style.backgroundColor = "transparent"
      ancestor = ancestor.parentElement
    }
  }

  // Sidebar
  const sidebar = document.querySelector<HTMLElement>(sel.sidebar)
  if (sidebar) sidebar.style.backgroundColor = "transparent"

  // Encabezado sticky de la lista de chats
  const chatListHeader = document.querySelector<HTMLElement>(sel.chatListHeader)
  if (chatListHeader) {
    chatListHeader.style.backgroundColor = blurBG
    chatListHeader.style.backdropFilter = blurFx
    ;(chatListHeader.style as any).webkitBackdropFilter = blurFx
  }

  // Footer sticky de la sidebar
  const sidebarFooter = document.querySelector<HTMLElement>(sel.sidebarFooter)
  if (sidebarFooter) {
    sidebarFooter.style.backgroundColor = blurBG
    sidebarFooter.style.backdropFilter = blurFx
    ;(sidebarFooter.style as any).webkitBackdropFilter = blurFx
  }

  // Header de página
  const pageHeader = document.querySelector<HTMLElement>(sel.pageHeader)
  if (pageHeader) {
    pageHeader.style.backgroundColor = "transparent"
    pageHeader.style.backdropFilter = "none"
    ;(pageHeader.style as any).webkitBackdropFilter = "none"
  }

  // Asides sticky
  document.querySelectorAll<HTMLElement>(sel.stickyAsides).forEach((aside) => {
    aside.style.backgroundColor = blurBG
    aside.style.backdropFilter = blurFx
    ;(aside.style as any).webkitBackdropFilter = blurFx
  })

  // Compositor
  const composerWrapper = document.querySelector<HTMLElement>(sel.composerWrapper)
  if (composerWrapper) {
    composerWrapper.style.backgroundColor = isDark ? "#303030" : "#ffffff"
  }
}

// ------------------------------
// Limpieza de estilos al desactivar
// ------------------------------
function clearUIStyles() {
  document.documentElement.style.removeProperty("--bg-primary")
  document.documentElement.style.removeProperty("--main-surface-primary")
  document.documentElement.style.removeProperty("--bg-elevated-secondary")

  const reset = (q: string, props: Array<keyof CSSStyleDeclaration | string>) => {
    try {
      const el = document.querySelector<HTMLElement>(q)
      if (!el) return
      props.forEach((p) => ((el.style as any)[p] = ""))
    } catch {}
  }

  reset(sel.pageHeader, ["backgroundColor", "backdropFilter", "webkitBackdropFilter"])
  reset(sel.mobileHeader, ["backgroundColor", "backdropFilter", "webkitBackdropFilter"])
  reset(sel.sidebar, ["backgroundColor"])
  reset(sel.mainWrapper, ["backgroundColor"])
  reset(sel.chatListHeader, ["backgroundColor", "backdropFilter", "webkitBackdropFilter"])
  reset(sel.sidebarFooter, ["backgroundColor", "backdropFilter", "webkitBackdropFilter"])

  try {
    document.querySelectorAll<HTMLElement>(sel.stickyAsides).forEach((aside) => {
      aside.style.backgroundColor = ""
      aside.style.backdropFilter = ""
      ;(aside.style as any).webkitBackdropFilter = ""
    })
  } catch {}

  reset(sel.composerWrapper, ["backgroundColor"])
}

// ------------------------------
// Aplicación de imagen de fondo + opacidades y blur
// ------------------------------
function applyBackground() {
  ensureBackground()
  if (!imgEl || !gradEl) return

  const isDark =
    document.documentElement.classList.contains("dark") ||
    document.documentElement.getAttribute("data-theme") === "dark"

  imgEl.src = cfg.backgroundImageUrl
  imgEl.style.opacity = String(Math.max(0, Math.min(1, cfg.mainImageOpacity)))
  imgEl.style.filter = `blur(${Math.max(0, cfg.blurAmount)}px)`

  gradEl.style.opacity = String(Math.max(0, Math.min(1, cfg.gradientOpacity)))
  gradEl.style.background = isDark
    ? "linear-gradient(to bottom, transparent, #000000)"
    : "linear-gradient(to bottom, transparent, #ffffff)"

  if (!document.documentElement.classList.contains("cg-customizer-background-enabled")) {
    document.documentElement.classList.add("cg-customizer-background-enabled")
  }

  applyUIStyles()
}

// ------------------------------
// Render global y persistencia
// ------------------------------
async function render() {
  console.log("Canvas for ChatGPT: Rendering with config", cfg)

  if (cfg.enabled) {
    applyBackground()
  } else {
    document.getElementById(BACKGROUND_ID)?.remove()
    document.getElementById(BACKGROUND_STYLE_ID)?.remove()
    document.documentElement.classList.remove("cg-customizer-background-enabled")
    backgroundEl = imgEl = gradEl = null
    clearUIStyles()
  }

  setupCollapsibleMessages()
  await writeCfg(cfg)
}

// ------------------------------
// Setup de mensajes colapsables
// ------------------------------
function setupCollapsibleMessages() {
  const collapsibleConfig: CollapsibleConfig = {
    enabled: cfg.collapsibleMessages,
    buttonOpacity: cfg.buttonOpacity,
    collapsedHeight: cfg.collapsedHeight,
    altClickEnabled: cfg.altClickEnabled,
    persistMessageState: cfg.persistMessageState
  }

  if (!collapsibleMessages) {
    console.log("Canvas for ChatGPT: Creating new CollapsibleMessages instance")
    collapsibleMessages = new CollapsibleMessages(collapsibleConfig)
  } else {
    console.log("Canvas for ChatGPT: Updating existing CollapsibleMessages instance")
    collapsibleMessages.updateConfig(collapsibleConfig)
  }
}

// ------------------------------
// Reaccionar a cambios de tema (claro/oscuro) sin bucles infinitos
// ------------------------------
let lastThemeState = ""

function checkThemeChange() {
  const isDark =
    document.documentElement.classList.contains("dark") ||
    document.documentElement.getAttribute("data-theme") === "dark" ||
    document.documentElement.getAttribute("data-chat-theme") === "dark"
  const themeState = isDark ? "dark" : "light"
  if (themeState !== lastThemeState) {
    lastThemeState = themeState
    if (cfg.enabled) {
      applyBackground()
    }
  }
}

new MutationObserver(() => checkThemeChange()).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["class", "data-theme", "data-chat-theme"]
})

// ------------------------------
// Mensajería con el popup
// ------------------------------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "GET_CFG") {
    sendResponse(cfg)
    return true
  }
  if (msg?.type === "SET_CFG_PARTIAL") {
    cfg = { ...cfg, ...msg.patch }
    render()
    sendResponse({ ok: true })
    return true
  }
})

// ------------------------------
// Debounced observer para nuevos mensajes y SPA DOM updates
// ------------------------------
let processTimer: ReturnType<typeof setTimeout> | null = null

function queueProcess() {
  if (processTimer) clearTimeout(processTimer)
  processTimer = setTimeout(() => {
    if (cfg.collapsibleMessages && collapsibleMessages) {
      collapsibleMessages.processNewMessages()
    }
    if (cfg.enabled) {
      const existing = document.getElementById(BACKGROUND_ID)
      if (!existing || !existing.isConnected) {
        applyBackground()
      }
    }
  }, 250)
}

// ------------------------------
// Boot
// ------------------------------
;(async () => {
  try {
    cfg = { ...DEFAULT_CFG, ...(await readCfg()) }
    console.log("Canvas for ChatGPT: Initial config loaded", cfg)
    await render()
  } catch (error) {
    console.error("Canvas for ChatGPT: startup failed", error)
    return
  }

  // Observador para modificaciones del DOM (filtra elementos propios de la extensión para evitar bucles)
  const observer = new MutationObserver((mutations) => {
    let hasRelevantChange = false
    for (const mutation of mutations) {
      // Ignorar mutaciones dentro de la propia capa de fondo
      const targetEl = mutation.target as HTMLElement
      if (targetEl && (targetEl.id === BACKGROUND_ID || targetEl.closest?.(`#${BACKGROUND_ID}`))) {
        continue
      }

      if (mutation.type === "childList") {
        // Detectar si la capa de fondo fue removida para restaurarla inmediatamente
        for (let i = 0; i < mutation.removedNodes.length; i++) {
          const node = mutation.removedNodes[i] as HTMLElement
          if (node.id === BACKGROUND_ID) {
            hasRelevantChange = true
            if (cfg.enabled) {
              ensureBackground()
              applyBackground()
            }
            break
          }
        }

        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i] as HTMLElement
          if (
            node.nodeType === Node.ELEMENT_NODE &&
            !node.classList?.contains("cg-collapse-btn") &&
            !node.classList?.contains("cg-toggle-all-btn") &&
            node.id !== BACKGROUND_ID
          ) {
            hasRelevantChange = true
            break
          }
        }
      }
      if (hasRelevantChange) break
    }
    if (hasRelevantChange) {
      queueProcess()
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true
  })

  // Escuchar navegación SPA mediante pushState, replaceState y popstate
  const originalPushState = history.pushState
  history.pushState = function (...args) {
    const res = originalPushState.apply(this, args)
    window.dispatchEvent(new Event("cg-spa-navigate"))
    return res
  }

  const originalReplaceState = history.replaceState
  history.replaceState = function (...args) {
    const res = originalReplaceState.apply(this, args)
    window.dispatchEvent(new Event("cg-spa-navigate"))
    return res
  }

  const handleNavigation = () => {
    queueProcess()
    if (cfg.enabled) {
      setTimeout(() => applyBackground(), 100)
    }
  }

  window.addEventListener("popstate", handleNavigation)
  window.addEventListener("cg-spa-navigate", handleNavigation)

  // Verificación periódica cada 6 segundos como fallback
  setInterval(() => {
    if (cfg.collapsibleMessages && collapsibleMessages) {
      collapsibleMessages.processNewMessages()
    }
    if (cfg.enabled) {
      const existing = document.getElementById(BACKGROUND_ID)
      if (!existing || !existing.isConnected) {
        applyBackground()
      }
    }
  }, 6000)
})()
