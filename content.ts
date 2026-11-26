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
type ChatCanvasCfg = {
  backgroundImageUrl: string
  title?: string
  mainImageOpacity?: number
  blurAmount?: number
  gradientOpacity?: number
  updatedAt?: number
}

type Cfg = {
  enabled: boolean
  backgroundImageUrl: string
  mainImageOpacity: number
  blurAmount: number
  gradientOpacity: number
  savedBackgrounds: string[]
  chatBackgrounds?: Record<string, ChatCanvasCfg>
}

const DEFAULT_CFG: Cfg = {
  enabled: true,
  backgroundImageUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80",
  mainImageOpacity: 0.5,
  blurAmount: 70,
  gradientOpacity: 1.0,
  savedBackgrounds: [],
  chatBackgrounds: {}
}

function getChatKeyFromUrl(urlStr: string = window.location.href): string | null {
  try {
    const url = new URL(urlStr, window.location.origin)
    const path = url.pathname

    const convMatch = path.match(/\/c\/([a-zA-Z0-9_-]+)/)
    if (convMatch?.[1]) {
      return `c:${convMatch[1]}`
    }

    const shareMatch = path.match(/\/share\/([a-zA-Z0-9_-]+)/)
    if (shareMatch?.[1]) {
      return `share:${shareMatch[1]}`
    }

    const gptMatch = path.match(/^\/g\/([a-zA-Z0-9_-]+)\/?$/)
    if (gptMatch?.[1]) {
      return `g:${gptMatch[1]}`
    }
  } catch {}
  return null
}

function getCurrentChatTitle(chatKey: string | null): string | undefined {
  if (!chatKey) return undefined
  if (chatKey.startsWith("c:")) {
    const id = chatKey.slice(2)
    const link = document.querySelector<HTMLElement>(`nav a[href*="/c/${id}"]`)
    const linkText = link?.textContent?.trim()
    if (linkText) return linkText
  }

  const rawTitle = (document.title || "").trim()
  const cleaned = rawTitle.replace(/^(?:ChatGPT\s*[-–—]\s*)|(?:\s*[-–—]\s*ChatGPT)$/i, "").trim()
  if (cleaned && !/^(ChatGPT|New chat)$/i.test(cleaned)) {
    return cleaned
  }

  return undefined
}

function resolveEffectiveVisuals(config: Cfg, chatKey: string | null) {
  const override = chatKey ? config.chatBackgrounds?.[chatKey] : undefined
  return {
    backgroundImageUrl: override?.backgroundImageUrl ?? config.backgroundImageUrl,
    mainImageOpacity: override?.mainImageOpacity ?? config.mainImageOpacity,
    blurAmount: override?.blurAmount ?? config.blurAmount,
    gradientOpacity: override?.gradientOpacity ?? config.gradientOpacity
  }
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
  pageHeader: "header, [data-testid='page-header']"
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
    --sidebar-surface-primary: transparent !important;
    --sidebar-surface: transparent !important;
    --sidebar-bg: transparent !important;
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
  html.cg-customizer-background-enabled [data-cg-sidebar-ancestor="true"],
  html.cg-customizer-background-enabled :where(body > div, body > div > div, body > div > div > div, body > div > div > div > div):not(:where([data-cg-sidebar-surface="true"], [data-cg-sidebar-sticky="true"], [role="dialog"], [role="menu"], [role="alertdialog"], [role="popover"], [role="tooltip"], [data-radix-popper-content-wrapper], [data-radix-portal] *, :has([role="dialog"]):not(:has(main)))) {
    background-color: transparent !important;
  }

  html.cg-customizer-background-enabled [data-cg-sidebar-ancestor="true"] {
    background: transparent !important;
    background-color: transparent !important;
    background-image: none !important;
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

  html.cg-customizer-background-enabled div[class*="main-surface"]:not(:where([data-composer-surface], [id="composer-background"], [data-cg-composer-pill], [data-cg-sidebar-surface="true"], [role="dialog"], [role="dialog"] *, [role="menu"], [role="menu"] *)),
  html.cg-customizer-background-enabled div[class*="bg-token-main-surface"]:not(:where([data-composer-surface], [id="composer-background"], [data-cg-composer-pill], [data-cg-sidebar-surface="true"], [role="dialog"], [role="dialog"] *, [role="menu"], [role="menu"] *)),
  html.cg-customizer-background-enabled div[class*="bg-token-surface"]:not(:where([data-composer-surface], [id="composer-background"], [data-cg-composer-pill], [data-cg-sidebar-surface="true"], [role="dialog"], [role="dialog"] *, [role="menu"], [role="menu"] *)),
  html.cg-customizer-background-enabled div[class*="bg-surface-primary"]:not(:where([data-composer-surface], [id="composer-background"], [data-cg-composer-pill], [data-cg-sidebar-surface="true"], [role="dialog"], [role="dialog"] *, [role="menu"], [role="menu"] *)),
  html.cg-customizer-background-enabled div[class*="bg-surface-secondary"]:not(:where([data-composer-surface], [id="composer-background"], [data-cg-composer-pill], [data-cg-sidebar-surface="true"], [role="dialog"], [role="dialog"] *, [role="menu"], [role="menu"] *)),
  html.cg-customizer-background-enabled [class*="bg-token-sidebar-surface-primary"]:not(:where(a, a *, button, button *, [data-cg-sidebar-surface="true"], [role="menu"], [role="menu"] *, [role="dialog"]:not(#stage-popover-sidebar), [role="dialog"]:not(#stage-popover-sidebar) *)),
  html.cg-customizer-background-enabled [class*="bg-token-bg-primary"]:not(:where([data-composer-surface], [id="composer-background"], [data-cg-composer-pill], [data-cg-sidebar-surface="true"], form *, [role="dialog"], [role="dialog"] *, [role="menu"], [role="menu"] *)),
  html.cg-customizer-background-enabled [class*="bg-token-bg-secondary"]:not(:where([data-composer-surface], [id="composer-background"], [data-cg-composer-pill], [data-cg-sidebar-surface="true"], form *, [role="dialog"], [role="dialog"] *, [role="menu"], [role="menu"] *)),
  html.cg-customizer-background-enabled [class*="bg-token-bg-elevated"]:not(:where([data-composer-surface], [id="composer-background"], [data-cg-composer-pill], [data-cg-sidebar-surface="true"], form *, [role="dialog"], [role="dialog"] *, [role="menu"], [role="menu"] *)) {
    background-color: transparent !important;
  }

  /* Barra lateral con efecto frosted glass unificado */
  html.cg-customizer-background-enabled :where(#stage-slideover-sidebar, #stage-popover-sidebar, [data-testid="sidebar"], [data-testid="stage-sidebar"], [aria-label="Chat history"]):not([data-cg-sidebar-transparent="true"]),
  html.cg-customizer-background-enabled [data-cg-sidebar-surface="true"] {
    --sidebar-surface-primary: transparent !important;
    --sidebar-surface: transparent !important;
    --sidebar-bg: transparent !important;
    --bg-elevated-secondary: transparent !important;
    --bg-elevated-primary: transparent !important;
    --bg-secondary: transparent !important;
    background: none !important;
    background-image: none !important;
    background-color: rgba(255, 255, 255, 0.4) !important;
    backdrop-filter: blur(12px) !important;
    -webkit-backdrop-filter: blur(12px) !important;
  }

  html.dark.cg-customizer-background-enabled :where(#stage-slideover-sidebar, #stage-popover-sidebar, [data-testid="sidebar"], [data-testid="stage-sidebar"], [aria-label="Chat history"]):not([data-cg-sidebar-transparent="true"]),
  html[data-theme="dark"].cg-customizer-background-enabled :where(#stage-slideover-sidebar, #stage-popover-sidebar, [data-testid="sidebar"], [data-testid="stage-sidebar"], [aria-label="Chat history"]):not([data-cg-sidebar-transparent="true"]),
  html[data-chat-theme="dark"].cg-customizer-background-enabled :where(#stage-slideover-sidebar, #stage-popover-sidebar, [data-testid="sidebar"], [data-testid="stage-sidebar"], [aria-label="Chat history"]):not([data-cg-sidebar-transparent="true"]),
  html[data-cg-theme="dark"].cg-customizer-background-enabled :where(#stage-slideover-sidebar, #stage-popover-sidebar, [data-testid="sidebar"], [data-testid="stage-sidebar"], [aria-label="Chat history"]):not([data-cg-sidebar-transparent="true"]),
  html.dark.cg-customizer-background-enabled [data-cg-sidebar-surface="true"],
  html[data-theme="dark"].cg-customizer-background-enabled [data-cg-sidebar-surface="true"],
  html[data-chat-theme="dark"].cg-customizer-background-enabled [data-cg-sidebar-surface="true"],
  html[data-cg-theme="dark"].cg-customizer-background-enabled [data-cg-sidebar-surface="true"] {
    background-color: rgba(24, 24, 24, 0.4) !important;
  }

  /* Capas estructurales internas de la barra lateral: transparentes para evitar paneles opacos o doble glass */
  html.cg-customizer-background-enabled [data-cg-sidebar-transparent="true"] {
    --sidebar-surface-primary: transparent !important;
    --sidebar-surface: transparent !important;
    --sidebar-bg: transparent !important;
    --bg-elevated-secondary: transparent !important;
    --bg-elevated-primary: transparent !important;
    --bg-secondary: transparent !important;
    background: transparent !important;
    background-color: transparent !important;
    background-image: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }

  /* Elementos sticky dentro de una lista desplazable: mantienen desenfoque sin oscurecerse en reposo */
  html.cg-customizer-background-enabled [data-cg-sidebar-sticky="true"] {
    --sidebar-surface-primary: transparent !important;
    --sidebar-surface: transparent !important;
    --sidebar-bg: transparent !important;
    --bg-elevated-secondary: transparent !important;
    --bg-elevated-primary: transparent !important;
    --bg-secondary: transparent !important;
    background: transparent !important;
    background-color: transparent !important;
    background-image: none !important;
    backdrop-filter: blur(12px) !important;
    -webkit-backdrop-filter: blur(12px) !important;
  }

  html.cg-customizer-background-enabled [data-cg-sidebar-pseudo-bg="true"]::before,
  html.cg-customizer-background-enabled [data-cg-sidebar-pseudo-bg="true"]::after {
    background: transparent !important;
    background-color: transparent !important;
    background-image: none !important;
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
  "[role='dialog'], [role='menu'], [role='alertdialog'], [role='popover'], [role='tooltip'], article, [data-testid^='conversation-turn'], [data-message-author-role], #stage-slideover-sidebar, #stage-popover-sidebar, nav[aria-label='Chat history']"

const SIDEBAR_EXPLICIT_SELECTOR =
  "#stage-slideover-sidebar, #stage-popover-sidebar, [data-testid='sidebar'], [data-testid='stage-sidebar']"
const SIDEBAR_FALLBACK_SELECTOR = "nav, [aria-label='Chat history'], aside"
const SIDEBAR_SKIP_ANCESTOR_SELECTOR =
  "main, [role='main'], article, [role='menu'], [role='alertdialog'], [role='tooltip'], [role='popover']"
const SIDEBAR_DESCENDANT_PRUNE_SELECTOR =
  "a, button, input, textarea, select, label, svg, img, video, canvas, [role='menuitem'], [role='option'], [role='menu'], [role='alertdialog'], [role='tooltip'], [role='popover'], [data-radix-popper-content-wrapper]"
const SIDEBAR_STRUCTURAL_TAG_SELECTOR =
  "nav, aside, header, footer, section, ul, ol, #sidebar-header, #history, #stage-sidebar-tiny-bar"

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
  const body = document.body
  if (
    body?.classList.contains("dark") ||
    body?.getAttribute("data-theme") === "dark" ||
    body?.getAttribute("data-chat-theme") === "dark"
  ) {
    return true
  }
  if (
    body?.classList.contains("light") ||
    body?.getAttribute("data-theme") === "light" ||
    body?.getAttribute("data-chat-theme") === "light"
  ) {
    return false
  }
  try {
    const cs = window.getComputedStyle(html).colorScheme
    if (cs && cs.includes("dark") && !cs.includes("light")) return true
  } catch {}
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
}

function hasRoundedCorners(el: HTMLElement, minRadius = 10, minHeight = 32): boolean {
  const rect = el.getBoundingClientRect()
  if (rect.height < minHeight) return false
  const cs = window.getComputedStyle(el)
  const tl = parseFloat(cs.borderTopLeftRadius) || 0
  const tr = parseFloat(cs.borderTopRightRadius) || 0
  const bl = parseFloat(cs.borderBottomLeftRadius) || 0
  const br = parseFloat(cs.borderBottomRightRadius) || 0
  return Math.min(tl, tr, bl, br) >= minRadius
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

function findSidebarRoots(): HTMLElement[] {
  const candidates = new Set<HTMLElement>()
  document.querySelectorAll<HTMLElement>(SIDEBAR_EXPLICIT_SELECTOR).forEach((el) => {
    if (!el.closest(SIDEBAR_SKIP_ANCESTOR_SELECTOR)) {
      candidates.add(el)
    }
  })
  document.querySelectorAll<HTMLElement>(SIDEBAR_FALLBACK_SELECTOR).forEach((el) => {
    if (
      el.closest(SIDEBAR_SKIP_ANCESTOR_SELECTOR) ||
      el.closest("[role='dialog']:not(#stage-popover-sidebar)") ||
      el.querySelector("main, [role='main']")
    ) {
      return
    }
    candidates.add(el)
  })
  const all = Array.from(candidates)
  return all.filter((el) => !all.some((other) => other !== el && other.contains(el)))
}

/**
 * Unifies the sidebar into a single frosted-glass panel by clearing opaque backgrounds
 * on layout ancestors and inner structural wrappers while preserving interactive pills, avatars, and menus.
 */
function syncSidebarStyles() {
  const desiredSurfaces = new Map<HTMLElement, string>()
  const desiredAncestors = new Map<HTMLElement, string>()
  const desiredTransparent = new Map<HTMLElement, string>()
  const desiredSticky = new Map<HTMLElement, string>()
  const desiredPseudoBgs = new Map<HTMLElement, string>()

  const sidebarRoots = findSidebarRoots()
  sidebarRoots.forEach((root) => {
    desiredSurfaces.set(root, "true")

    // Clear opaque backgrounds on layout ancestors up to body (preserving modal backdrop scrims)
    let ancestor = root.parentElement
    while (ancestor && ancestor !== document.body && ancestor !== document.documentElement) {
      const ancestorCs = window.getComputedStyle(ancestor)
      const isFullscreenScrim =
        (ancestor.matches("[role='dialog'], [data-radix-portal]") ||
          (ancestorCs.position === "fixed" && ancestor.getBoundingClientRect().width >= window.innerWidth * 0.9)) &&
        !ancestor.querySelector("main, [role='main']")
      if (isFullscreenScrim) break
      desiredAncestors.set(ancestor, "true")
      ancestor = ancestor.parentElement
    }

    // Temporarily clear prior sidebar descendant markers in a batch so computed background checks stay accurate
    root
      .querySelectorAll<HTMLElement>("[data-cg-sidebar-transparent], [data-cg-sidebar-sticky], [data-cg-sidebar-pseudo-bg]")
      .forEach((el) => {
        el.removeAttribute("data-cg-sidebar-transparent")
        el.removeAttribute("data-cg-sidebar-sticky")
        el.removeAttribute("data-cg-sidebar-pseudo-bg")
      })
    root.removeAttribute("data-cg-sidebar-pseudo-bg")

    if (hasPseudoBackground(root)) {
      desiredPseudoBgs.set(root, "true")
    }

    const rootCs = window.getComputedStyle(root)
    const rootScrollable = rootCs.overflowY === "auto" || rootCs.overflowY === "scroll"

    const walkChildren = (parent: HTMLElement, hasScrollableAncestor: boolean) => {
      const children = parent.children
      for (let i = 0; i < children.length; i++) {
        const el = children[i] as HTMLElement
        if (el.id === BACKGROUND_ID) continue
        if (el.matches(SIDEBAR_DESCENDANT_PRUNE_SELECTOR)) continue
        if (el.matches("[role='dialog']") && el.id !== "stage-popover-sidebar") continue
        if (el.matches("[role='button'], [role='link']") && !el.querySelector("nav, aside, ul, ol")) continue

        const cs = window.getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        const hasBox = rect.width > 0 && rect.height > 0
        if (hasBox && (rect.width <= 4 || rect.height <= 4)) continue

        const isStructuralTag = el.matches(SIDEBAR_STRUCTURAL_TAG_SELECTOR)
        const isAriaHidden = el.getAttribute("aria-hidden") === "true"
        if (!isStructuralTag && !isAriaHidden && hasBox && rect.width < 44 && rect.height < 44) continue

        const isSticky = cs.position === "sticky" || cs.position === "fixed"
        const isCompactItemPill =
          !isStructuralTag &&
          !isSticky &&
          !isAriaHidden &&
          el.querySelectorAll("a").length <= 1 &&
          !el.querySelector("nav, aside, ul, ol, h2, h3, h4") &&
          ((hasBox && rect.height < 68 && hasRoundedCorners(el, 6, 24)) ||
            (!hasBox && el.matches("li, [data-testid*='history-item']")))
        if (isCompactItemPill) continue

        if (isSticky && hasScrollableAncestor) {
          desiredSticky.set(el, "true")
        } else if (
          isStructuralTag ||
          isSticky ||
          isAriaHidden ||
          cs.overflowY === "auto" ||
          cs.overflowY === "scroll" ||
          hasVisibleBackground(el)
        ) {
          desiredTransparent.set(el, "true")
        }

        if (hasPseudoBackground(el)) {
          desiredPseudoBgs.set(el, "true")
        }

        walkChildren(el, hasScrollableAncestor || cs.overflowY === "auto" || cs.overflowY === "scroll")
      }
    }

    walkChildren(root, rootScrollable)
  })

  syncAttributeSet("data-cg-sidebar-surface", desiredSurfaces)
  syncAttributeSet("data-cg-sidebar-ancestor", desiredAncestors)
  syncAttributeSet("data-cg-sidebar-transparent", desiredTransparent)
  syncAttributeSet("data-cg-sidebar-sticky", desiredSticky)
  syncAttributeSet("data-cg-sidebar-pseudo-bg", desiredPseudoBgs)
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

function syncDynamicUIStyles() {
  syncSidebarStyles()
  syncComposerStyles()
}

function applyUIStyles() {
  const isDark = isDarkTheme()
  document.documentElement.setAttribute("data-cg-theme", isDark ? "dark" : "light")

  // Variables de color de superficie
  document.documentElement.style.setProperty("--bg-primary", "transparent")
  document.documentElement.style.setProperty("--main-surface-primary", "transparent")
  document.documentElement.style.setProperty("--bg-elevated-secondary", "transparent")
  document.documentElement.style.setProperty("--sidebar-surface-primary", "transparent")
  document.documentElement.style.setProperty("--sidebar-surface", "transparent")
  document.documentElement.style.setProperty("--sidebar-bg", "transparent")

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

  // Header de página (fuera de diálogos/menús)
  document.querySelectorAll<HTMLElement>(sel.pageHeader).forEach((pageHeader) => {
    if (pageHeader.closest("[role='dialog']:not(#stage-popover-sidebar), [role='menu']")) return
    pageHeader.style.backgroundColor = "transparent"
    pageHeader.style.backdropFilter = "none"
    ;(pageHeader.style as any).webkitBackdropFilter = "none"
  })

  // Barra lateral y compositor
  syncDynamicUIStyles()
}

// ------------------------------
// Limpieza de estilos al desactivar
// ------------------------------
function clearUIStyles() {
  document.documentElement.removeAttribute("data-cg-theme")
  document.documentElement.style.removeProperty("--bg-primary")
  document.documentElement.style.removeProperty("--main-surface-primary")
  document.documentElement.style.removeProperty("--bg-elevated-secondary")
  document.documentElement.style.removeProperty("--sidebar-surface-primary")
  document.documentElement.style.removeProperty("--sidebar-surface")
  document.documentElement.style.removeProperty("--sidebar-bg")

  document.querySelectorAll<HTMLElement>(sel.pageHeader).forEach((pageHeader) => {
    if (pageHeader.closest("[role='dialog']:not(#stage-popover-sidebar), [role='menu']")) return
    pageHeader.style.backgroundColor = ""
    pageHeader.style.backdropFilter = ""
    ;(pageHeader.style as any).webkitBackdropFilter = ""
  })
  const mainWrapper = document.querySelector<HTMLElement>(sel.mainWrapper)
  if (mainWrapper) {
    mainWrapper.style.backgroundColor = ""
    let ancestor = mainWrapper.parentElement
    while (ancestor && ancestor !== document.body && ancestor !== document.documentElement) {
      ancestor.style.backgroundColor = ""
      ancestor = ancestor.parentElement
    }
  }

  document
    .querySelectorAll<HTMLElement>(
      "[data-cg-composer-wrapper], [data-cg-composer-pseudo-bg], [data-cg-composer-pill], [data-cg-sidebar-surface], [data-cg-sidebar-ancestor], [data-cg-sidebar-transparent], [data-cg-sidebar-sticky], [data-cg-sidebar-pseudo-bg]"
    )
    .forEach((el) => {
      el.removeAttribute("data-cg-composer-wrapper")
      el.removeAttribute("data-cg-composer-pseudo-bg")
      el.removeAttribute("data-cg-composer-pill")
      el.removeAttribute("data-cg-sidebar-surface")
      el.removeAttribute("data-cg-sidebar-ancestor")
      el.removeAttribute("data-cg-sidebar-transparent")
      el.removeAttribute("data-cg-sidebar-sticky")
      el.removeAttribute("data-cg-sidebar-pseudo-bg")
    })
}

// ------------------------------
// Aplicación de imagen de fondo + opacidades y blur
// ------------------------------
function isVideoSource(url: string): boolean {
  if (!url) return false
  return url.startsWith("data:video/") || /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url)
}

let lastRenderedUrl = window.location.href

function applyBackground() {
  ensureBackground()
  if (!gradEl) return

  lastRenderedUrl = window.location.href
  const isDark = isDarkTheme()
  const effective = resolveEffectiveVisuals(cfg, getChatKeyFromUrl(lastRenderedUrl))

  const opacityStr = String(Math.max(0, Math.min(1, effective.mainImageOpacity)))
  const blurStr = `blur(${Math.max(0, effective.blurAmount)}px)`

  if (effective.backgroundImageUrl) {
    if (isVideoSource(effective.backgroundImageUrl)) {
      if (imgEl) {
        imgEl.style.display = "none"
        imgEl.removeAttribute("src")
      }
      if (videoEl) {
        videoEl.style.display = ""
        if (videoEl.getAttribute("src") !== effective.backgroundImageUrl) {
          videoEl.src = effective.backgroundImageUrl
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
        videoEl.removeAttribute("src")
      }
      if (imgEl) {
        imgEl.style.display = ""
        if (imgEl.getAttribute("src") !== effective.backgroundImageUrl) {
          imgEl.src = effective.backgroundImageUrl
        }
        imgEl.style.opacity = opacityStr
        imgEl.style.filter = blurStr
      }
    }
  } else {
    if (imgEl) {
      imgEl.removeAttribute("src")
      imgEl.style.display = "none"
    }
    if (videoEl) {
      videoEl.removeAttribute("src")
      videoEl.style.display = "none"
      videoEl.pause()
    }
  }

  gradEl.style.opacity = String(Math.max(0, Math.min(1, effective.gradientOpacity)))
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
function applyVisualState() {
  if (cfg.enabled) {
    applyBackground()
  } else {
    document.getElementById(BACKGROUND_ID)?.remove()
    document.getElementById(BACKGROUND_STYLE_ID)?.remove()
    document.documentElement.classList.remove("cg-customizer-background-enabled")
    backgroundEl = imgEl = videoEl = gradEl = null
    clearUIStyles()
  }
}

async function render() {
  console.log("Canvas for ChatGPT: Rendering with config", cfg)
  applyVisualState()
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
// Mensajería con el popup y sincronización de storage
// ------------------------------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "GET_CFG") {
    sendResponse(cfg)
    return true
  }
  if (msg?.type === "GET_CHAT_CONTEXT") {
    const chatKey = getChatKeyFromUrl()
    sendResponse({
      chatKey,
      chatTitle: getCurrentChatTitle(chatKey),
      url: window.location.href
    })
    return true
  }
  if (msg?.type === "SET_CFG_PARTIAL") {
    cfg = { ...cfg, ...msg.patch }
    render()
    sendResponse({ ok: true })
    return true
  }
})

if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes["chatgpt-custom-bg:cfg"]?.newValue) {
      cfg = { ...DEFAULT_CFG, ...changes["chatgpt-custom-bg:cfg"].newValue }
      applyVisualState()
    }
  })
}

// ------------------------------
// Debounced observer para SPA DOM updates
// ------------------------------
let processTimer: ReturnType<typeof setTimeout> | null = null

function queueProcess() {
  if (processTimer) clearTimeout(processTimer)
  processTimer = setTimeout(() => {
    if (cfg.enabled) {
      const existing = document.getElementById(BACKGROUND_ID)
      if (!existing || !existing.isConnected || window.location.href !== lastRenderedUrl) {
        applyBackground()
      } else {
        syncDynamicUIStyles()
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
    if (cfg.enabled) {
      applyBackground()
      setTimeout(() => applyBackground(), 120)
    }
    queueProcess()
  }

  window.addEventListener("popstate", handleNavigation)
  window.addEventListener("cg-spa-navigate", handleNavigation)
  if (typeof (window as any).navigation?.addEventListener === "function") {
    ;(window as any).navigation.addEventListener("navigatesuccess", handleNavigation)
  }

  // Verificación periódica cada 6 segundos como fallback (también detecta cambios de URL SPA)
  setInterval(() => {
    if (cfg.enabled) {
      const existing = document.getElementById(BACKGROUND_ID)
      if (!existing || !existing.isConnected || window.location.href !== lastRenderedUrl) {
        applyBackground()
      } else {
        syncDynamicUIStyles()
      }
    }
  }, 6000)
})()
