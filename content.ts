// content.ts

import { Storage } from "@plasmohq/storage"

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
  savedBackgrounds: string[]
}

const DEFAULT_CFG: Cfg = {
  enabled: true,
  backgroundImageUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80",
  mainImageOpacity: 0.5,
  blurAmount: 70,
  gradientOpacity: 1.0,
  savedBackgrounds: []
}

// ------------------------------
// Estado y utilidades de storage (con fallback seguro para Brave/Chromium)
// ------------------------------
const storage = new Storage({ area: "local" })
let cfg: Cfg = DEFAULT_CFG

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
  composerWrapper: "[data-composer-surface], [id='composer-background']"
}

// ------------------------------
// Capa de fondo dedicada y estilos CSS
// ------------------------------
let backgroundEl: HTMLDivElement | null = null
let imgEl: HTMLImageElement | null = null
let videoEl: HTMLVideoElement | null = null
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
  #${BACKGROUND_ID} > img,
  #${BACKGROUND_ID} > video {
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
    --x1qg12x5: transparent !important;
    --xxsqvjy: transparent !important;
  }

  /* El contenido de React debe colocarse sobre el fondo (z-index: 1) sin taparlo */
  html.cg-customizer-background-enabled #__next,
  html.cg-customizer-background-enabled div#root,
  html.cg-customizer-background-enabled [data-testid="root"],
  html.cg-customizer-background-enabled [data-testid="ds-document-layout"],
  html.cg-customizer-background-enabled [data-app-shell],
  html.cg-customizer-background-enabled #web-mobile-root,
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

  html.cg-customizer-background-enabled footer[data-ds-composer],
  html.cg-customizer-background-enabled footer[data-ds-composer] > span[aria-hidden="true"],
  html.cg-customizer-background-enabled footer:has(form, [data-composer-surface], [id="composer-background"]):not([role="dialog"] *) {
    background: transparent !important;
    background-color: transparent !important;
    background-image: none !important;
  }

  html.cg-customizer-background-enabled div[class*="main-surface"]:not([data-composer-surface]):not([id="composer-background"]):not([data-cg-composer-pill]),
  html.cg-customizer-background-enabled div[class*="bg-token-main-surface"]:not([data-composer-surface]):not([id="composer-background"]):not([data-cg-composer-pill]),
  html.cg-customizer-background-enabled div[class*="bg-token-surface"]:not([data-composer-surface]):not([id="composer-background"]):not([data-cg-composer-pill]),
  html.cg-customizer-background-enabled div[class*="bg-surface-primary"]:not([data-composer-surface]):not([id="composer-background"]):not([data-cg-composer-pill]),
  html.cg-customizer-background-enabled div[class*="bg-surface-secondary"]:not([data-composer-surface]):not([id="composer-background"]):not([data-cg-composer-pill]),
  html.cg-customizer-background-enabled [class*="bg-token-bg-primary"]:not([data-composer-surface]):not([id="composer-background"]):not([data-cg-composer-pill]):not(form *),
  html.cg-customizer-background-enabled [class*="bg-token-bg-secondary"]:not([data-composer-surface]):not([id="composer-background"]):not([data-cg-composer-pill]):not(form *),
  html.cg-customizer-background-enabled [class*="bg-token-bg-elevated"]:not([data-composer-surface]):not([id="composer-background"]):not([data-cg-composer-pill]):not(form *) {
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
  html[data-chat-theme="dark"].cg-customizer-background-enabled nav,
  html[data-cg-theme="dark"].cg-customizer-background-enabled nav,
  html.dark.cg-customizer-background-enabled aside,
  html[data-theme="dark"].cg-customizer-background-enabled aside,
  html[data-chat-theme="dark"].cg-customizer-background-enabled aside,
  html[data-cg-theme="dark"].cg-customizer-background-enabled aside,
  html.dark.cg-customizer-background-enabled [aria-label="Chat history"],
  html[data-theme="dark"].cg-customizer-background-enabled [aria-label="Chat history"],
  html[data-chat-theme="dark"].cg-customizer-background-enabled [aria-label="Chat history"],
  html[data-cg-theme="dark"].cg-customizer-background-enabled [aria-label="Chat history"] {
    background-color: rgba(24, 24, 24, 0.4) !important;
  }

  /* Compositor: conservar fondo sólido únicamente en la superficie del input (sin pintar wrappers rectangulares) */
  html.cg-customizer-background-enabled [data-composer-surface]:not([data-cg-composer-wrapper="true"]),
  html.cg-customizer-background-enabled [id="composer-background"]:not([data-cg-composer-wrapper="true"]),
  html.cg-customizer-background-enabled [data-cg-composer-pill="fallback"] {
    background-color: #ffffff !important;
  }

  html.dark.cg-customizer-background-enabled [data-composer-surface]:not([data-cg-composer-wrapper="true"]),
  html[data-theme="dark"].cg-customizer-background-enabled [data-composer-surface]:not([data-cg-composer-wrapper="true"]),
  html[data-chat-theme="dark"].cg-customizer-background-enabled [data-composer-surface]:not([data-cg-composer-wrapper="true"]),
  html[data-cg-theme="dark"].cg-customizer-background-enabled [data-composer-surface]:not([data-cg-composer-wrapper="true"]),
  html.dark.cg-customizer-background-enabled [id="composer-background"]:not([data-cg-composer-wrapper="true"]),
  html[data-theme="dark"].cg-customizer-background-enabled [id="composer-background"]:not([data-cg-composer-wrapper="true"]),
  html[data-chat-theme="dark"].cg-customizer-background-enabled [id="composer-background"]:not([data-cg-composer-wrapper="true"]),
  html[data-cg-theme="dark"].cg-customizer-background-enabled [id="composer-background"]:not([data-cg-composer-wrapper="true"]),
  html.dark.cg-customizer-background-enabled [data-cg-composer-pill="fallback"],
  html[data-theme="dark"].cg-customizer-background-enabled [data-cg-composer-pill="fallback"],
  html[data-chat-theme="dark"].cg-customizer-background-enabled [data-cg-composer-pill="fallback"],
  html[data-cg-theme="dark"].cg-customizer-background-enabled [data-cg-composer-pill="fallback"] {
    background-color: #303030 !important;
  }

  /* Evitar recuadros rectangulares en <form> y envoltorios alrededor de la píldora redondeada */
  html.cg-customizer-background-enabled form:has([data-composer-surface]):not([data-composer-surface]),
  html.cg-customizer-background-enabled form:has([id="composer-background"]):not([id="composer-background"]),
  html.cg-customizer-background-enabled [data-cg-composer-wrapper="true"] {
    background: transparent !important;
    background-color: transparent !important;
    background-image: none !important;
  }

  html.cg-customizer-background-enabled form[data-cg-composer-wrapper="true"] {
    border-color: transparent !important;
    box-shadow: none !important;
  }

  html.cg-customizer-background-enabled [data-cg-composer-pseudo-bg="true"]::before,
  html.cg-customizer-background-enabled [data-cg-composer-pseudo-bg="true"]::after {
    background: transparent !important;
    background-color: transparent !important;
    background-image: none !important;
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

    videoEl = document.createElement("video")
    videoEl.autoplay = true
    videoEl.loop = true
    videoEl.muted = true
    videoEl.playsInline = true
    videoEl.setAttribute("playsinline", "")
    videoEl.setAttribute("muted", "")
    videoEl.setAttribute("autoplay", "")
    videoEl.setAttribute("loop", "")
    videoEl.style.display = "none"

    gradEl = document.createElement("div")
    gradEl.className = "cg-customizer-gradient"

    backgroundEl.append(imgEl, videoEl, gradEl)

    if (document.body) {
      document.body.prepend(backgroundEl)
    } else {
      document.documentElement.appendChild(backgroundEl)
    }
  } else {
    backgroundEl = existing
    imgEl = existing.querySelector("img")
    videoEl = existing.querySelector("video")
    if (!videoEl && backgroundEl) {
      videoEl = document.createElement("video")
      videoEl.autoplay = true
      videoEl.loop = true
      videoEl.muted = true
      videoEl.playsInline = true
      videoEl.setAttribute("playsinline", "")
      videoEl.setAttribute("muted", "")
      videoEl.setAttribute("autoplay", "")
      videoEl.setAttribute("loop", "")
      videoEl.style.display = "none"
      backgroundEl.insertBefore(videoEl, existing.querySelector(".cg-customizer-gradient"))
    }
    gradEl = existing.querySelector(".cg-customizer-gradient") as HTMLDivElement | null
  }
}

// ------------------------------
// Detección de tema y estilos dinámicos de UI
// ------------------------------
const COMPOSER_INPUT_SELECTOR = "textarea, #prompt-textarea, [contenteditable='true']"
const COMPOSER_STOP_SELECTOR =
  "main, [role='main'], [data-testid='ds-document-layout'], [data-app-shell], nav, aside, article, [data-testid^='conversation-turn'], [data-message-author-role], [role='dialog'], [role='menu'], [role='alertdialog'], [role='popover'], [role='tooltip']"
const COMPOSER_SKIP_SELECTOR =
  "[role='dialog'], [role='menu'], [role='alertdialog'], [role='popover'], [role='tooltip'], article, [data-testid^='conversation-turn'], [data-message-author-role]"

function isDarkTheme(): boolean {
  const html = document.documentElement
  if (
    html.classList.contains("dark") ||
    html.getAttribute("data-theme") === "dark" ||
    html.getAttribute("data-chat-theme") === "dark"
  ) {
    return true
  }
  if (
    html.classList.contains("light") ||
    html.getAttribute("data-theme") === "light" ||
    html.getAttribute("data-chat-theme") === "light"
  ) {
    return false
  }
  try {
    const cs = window.getComputedStyle(html).colorScheme
    if (cs && cs.includes("dark") && !cs.includes("light")) return true
  } catch {}
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
}

function hasRoundedCorners(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect()
  if (rect.height < 32) return false
  const cs = window.getComputedStyle(el)
  const tl = parseFloat(cs.borderTopLeftRadius) || 0
  const tr = parseFloat(cs.borderTopRightRadius) || 0
  const bl = parseFloat(cs.borderBottomLeftRadius) || 0
  const br = parseFloat(cs.borderBottomRightRadius) || 0
  return Math.min(tl, tr, bl, br) >= 10
}

function styleHasBackground(cs: CSSStyleDeclaration): boolean {
  const bg = cs.backgroundColor
  const img = cs.backgroundImage
  const hasColor = !!bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent"
  const hasImg = !!img && img !== "none"
  return hasColor || hasImg
}

function hasVisibleBackground(el: HTMLElement): boolean {
  return styleHasBackground(window.getComputedStyle(el))
}

function hasPseudoBackground(el: HTMLElement): boolean {
  for (const pseudo of ["::before", "::after"] as const) {
    const cs = window.getComputedStyle(el, pseudo)
    if (cs.content && cs.content !== "none" && cs.content !== "normal" && styleHasBackground(cs)) {
      return true
    }
  }
  return false
}

function syncAttributeSet(attr: string, desired: Map<HTMLElement, string>) {
  document.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((el) => {
    if (!desired.has(el)) {
      el.removeAttribute(attr)
    }
  })
  desired.forEach((val, el) => {
    if (el.getAttribute(attr) !== val) {
      el.setAttribute(attr, val)
    }
  })
}

/**
 * Ensures outer composer wrappers (<form>, wrapper <div>s, backdrop strips, and pseudo-elements)
 * remain transparent while only the rounded prompt surface retains a readable solid background.
 */
function syncComposerStyles() {
  const desiredWrappers = new Map<HTMLElement, string>()
  const desiredPseudoBgs = new Map<HTMLElement, string>()
  const desiredPills = new Map<HTMLElement, string>()

  const inputs = document.querySelectorAll<HTMLElement>(COMPOSER_INPUT_SELECTOR)
  inputs.forEach((input) => {
    if (input.closest(COMPOSER_SKIP_SELECTOR)) return

    const chain: HTMLElement[] = []
    let cur = input.parentElement
    while (cur && cur !== document.body && cur !== document.documentElement) {
      if (cur.matches(COMPOSER_STOP_SELECTOR)) {
        if (hasPseudoBackground(cur)) {
          desiredPseudoBgs.set(cur, "true")
        }
        break
      }
      chain.push(cur)
      cur = cur.parentElement
    }

    let boundaryIdx = -1
    for (let i = 0; i < chain.length; i++) {
      if (chain[i].matches("form, [data-composer-surface], [id='composer-background']")) {
        boundaryIdx = i
      }
    }
    if (boundaryIdx === -1) return

    let pillIdx = -1
    for (let i = 0; i <= boundaryIdx; i++) {
      if (hasRoundedCorners(chain[i])) {
        pillIdx = i
      }
    }

    if (pillIdx === -1) {
      for (let i = 0; i <= boundaryIdx; i++) {
        if (chain[i].matches("[data-composer-surface], [id='composer-background']")) {
          pillIdx = i
        }
      }
    }

    const pillEl = pillIdx >= 0 ? chain[pillIdx] : null
    if (pillEl) {
      pillEl.removeAttribute("data-cg-composer-wrapper")
      if (pillEl.matches("[data-composer-surface], [id='composer-background']")) {
        desiredPills.set(pillEl, "native")
      } else {
        const prevPillAttr = pillEl.getAttribute("data-cg-composer-pill")
        if (prevPillAttr === "fallback") {
          pillEl.removeAttribute("data-cg-composer-pill")
        }
        const needsFallback = !hasVisibleBackground(pillEl)
        if (prevPillAttr === "fallback" && needsFallback) {
          pillEl.setAttribute("data-cg-composer-pill", "fallback")
        }
        desiredPills.set(pillEl, needsFallback ? "fallback" : "native")
      }
    }

    const wrapperStartIdx = (pillIdx >= 0 ? pillIdx : boundaryIdx) + 1
    for (let i = wrapperStartIdx; i < chain.length; i++) {
      const wrapper = chain[i]
      desiredWrappers.set(wrapper, "true")
      if (hasPseudoBackground(wrapper)) {
        desiredPseudoBgs.set(wrapper, "true")
      }
      if (wrapper.tagName === "FOOTER") {
        wrapper
          .querySelectorAll<HTMLElement>(":scope > span[aria-hidden='true'], :scope > div[aria-hidden='true']")
          .forEach((strip) => {
            if (!pillEl || !strip.contains(pillEl)) {
              desiredWrappers.set(strip, "true")
            }
          })
      }
    }
  })

  syncAttributeSet("data-cg-composer-wrapper", desiredWrappers)
  syncAttributeSet("data-cg-composer-pseudo-bg", desiredPseudoBgs)
  syncAttributeSet("data-cg-composer-pill", desiredPills)
}

function applyUIStyles() {
  const isDark = isDarkTheme()
  document.documentElement.setAttribute("data-cg-theme", isDark ? "dark" : "light")
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

  // Compositor y envoltorios externos
  syncComposerStyles()
}

// ------------------------------
// Limpieza de estilos al desactivar
// ------------------------------
function clearUIStyles() {
  document.documentElement.removeAttribute("data-cg-theme")
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

  document
    .querySelectorAll<HTMLElement>("[data-cg-composer-wrapper], [data-cg-composer-pseudo-bg], [data-cg-composer-pill]")
    .forEach((el) => {
      el.removeAttribute("data-cg-composer-wrapper")
      el.removeAttribute("data-cg-composer-pseudo-bg")
      el.removeAttribute("data-cg-composer-pill")
    })
}

// ------------------------------
// Aplicación de imagen de fondo + opacidades y blur
// ------------------------------
function isVideoSource(url: string): boolean {
  if (!url) return false
  return url.startsWith("data:video/") || /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url)
}

function applyBackground() {
  ensureBackground()
  if (!gradEl) return

  const isDark = isDarkTheme()

  const opacityStr = String(Math.max(0, Math.min(1, cfg.mainImageOpacity)))
  const blurStr = `blur(${Math.max(0, cfg.blurAmount)}px)`

  if (cfg.backgroundImageUrl) {
    if (isVideoSource(cfg.backgroundImageUrl)) {
      if (imgEl) {
        imgEl.style.display = "none"
        imgEl.src = ""
      }
      if (videoEl) {
        videoEl.style.display = ""
        if (videoEl.src !== cfg.backgroundImageUrl) {
          videoEl.src = cfg.backgroundImageUrl
          videoEl.load()
          videoEl.play().catch(() => {})
        }
        videoEl.style.opacity = opacityStr
        videoEl.style.filter = blurStr
      }
    } else {
      if (videoEl) {
        videoEl.style.display = "none"
        videoEl.pause()
        videoEl.src = ""
      }
      if (imgEl) {
        imgEl.style.display = ""
        imgEl.src = cfg.backgroundImageUrl
        imgEl.style.opacity = opacityStr
        imgEl.style.filter = blurStr
      }
    }
  } else {
    if (imgEl) {
      imgEl.src = ""
      imgEl.style.display = "none"
    }
    if (videoEl) {
      videoEl.src = ""
      videoEl.style.display = "none"
      videoEl.pause()
    }
  }

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
    backgroundEl = imgEl = videoEl = gradEl = null
    clearUIStyles()
  }

  await writeCfg(cfg)
}

// ------------------------------
// Reaccionar a cambios de tema (claro/oscuro) sin bucles infinitos
// ------------------------------
let lastThemeState = ""

function checkThemeChange() {
  const themeState = isDarkTheme() ? "dark" : "light"
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
// Debounced observer para SPA DOM updates
// ------------------------------
let processTimer: ReturnType<typeof setTimeout> | null = null

function queueProcess() {
  if (processTimer) clearTimeout(processTimer)
  processTimer = setTimeout(() => {
    if (cfg.enabled) {
      const existing = document.getElementById(BACKGROUND_ID)
      if (!existing || !existing.isConnected) {
        applyBackground()
      } else {
        syncComposerStyles()
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
    if (cfg.enabled) {
      const existing = document.getElementById(BACKGROUND_ID)
      if (!existing || !existing.isConnected) {
        applyBackground()
      } else {
        syncComposerStyles()
      }
    }
  }, 6000)
})()
