import type { PlasmoCSConfig } from "plasmo";

import { isVideoUrl } from "./lib/media";
import { extractChatTitleFromDom, resolveChatKeyFromUrl } from "./lib/routing";
import {
  DEFAULT_CONFIG,
  loadConfig,
  resolveEffectiveVisuals,
  updateConfigPartial,
  watchConfig
} from "./lib/storage";
import {
  ANCESTOR_ATTR,
  BACKDROP_ELEMENT_ID,
  COMPOSER_ATTR,
  COMPOSER_BOUND_ATTR,
  COMPOSER_PSEUDO_ATTR,
  COMPOSER_WRAPPER_ATTR,
  GRADIENT_ELEMENT_ID,
  MEDIA_ELEMENT_ID,
  ROOT_DARK_CLASS,
  ROOT_ENABLED_CLASS,
  ROOT_LIGHT_CLASS,
  STYLE_ELEMENT_ID,
  buildContentCss
} from "./lib/styles";
import type {
  CanvasConfig,
  ChatContext,
  EffectiveVisuals,
  RuntimeMessage
} from "./lib/types";

export const config: PlasmoCSConfig = {
  matches: ["https://chatgpt.com/*", "https://chat.openai.com/*"],
  run_at: "document_idle"
};

const HOOKED_FLAG = "__canvasForChatGptHistoryHooked";

const COMPOSER_UNBOUND_SELECTOR =
  `textarea:not([${COMPOSER_BOUND_ATTR}]), #prompt-textarea:not([${COMPOSER_BOUND_ATTR}]), [contenteditable="true"]:not([${COMPOSER_BOUND_ATTR}])`;
const COMPOSER_SKIP_SELECTOR =
  "[role='dialog'], [role='menu'], [role='alertdialog'], [role='popover'], [role='tooltip'], article, [data-testid^='conversation-turn'], [data-message-author-role], #stage-slideover-sidebar, #stage-popover-sidebar, nav[aria-label='Chat history']";
const COMPOSER_STOP_SELECTOR =
  "main, [role='main'], [data-testid='ds-document-layout'], [data-app-shell], nav, aside, article, [data-testid^='conversation-turn'], [data-message-author-role], [role='dialog'], [role='menu'], [role='alertdialog'], [role='popover'], [role='tooltip']";
const STREAMING_IGNORE_SELECTOR =
  `#${BACKDROP_ELEMENT_ID}, [data-message-author-role], article, [data-testid^="conversation-turn"], .markdown, pre, code, [${COMPOSER_BOUND_ATTR}="true"]`;

const SIDEBAR_ROOT_SELECTOR =
  "#stage-slideover-sidebar, [data-testid='sidebar'], [data-testid='stage-sidebar'], nav[aria-label='Chat history']";

let currentConfig: CanvasConfig = {
  ...DEFAULT_CONFIG,
  savedBackgrounds: [],
  chatBackgrounds: {}
};

let lastKnownHref = typeof location !== "undefined" ? location.href : "";
let isReconciling = false;
let structuralSyncTimer: number | undefined;
let titleSyncTimeout: number | undefined;

// Cached DOM element references for O(1) integrity checks
let styleEl: HTMLStyleElement | null = null;
let backdropEl: HTMLDivElement | null = null;
let mediaEl: HTMLImageElement | HTMLVideoElement | null = null;
let gradientEl: HTMLDivElement | null = null;
let lastVisualSignature = "";

function detectTheme(): "dark" | "light" {
  const checkEl = (el: Element | null): "dark" | "light" | null => {
    if (!el) return null;
    if (
      el.classList.contains("dark") ||
      el.getAttribute("data-theme") === "dark" ||
      el.getAttribute("data-chat-theme") === "dark" ||
      el.getAttribute("data-mode") === "dark" ||
      el.getAttribute("data-color-mode") === "dark"
    ) {
      return "dark";
    }
    if (
      el.classList.contains("light") ||
      el.getAttribute("data-theme") === "light" ||
      el.getAttribute("data-chat-theme") === "light" ||
      el.getAttribute("data-mode") === "light" ||
      el.getAttribute("data-color-mode") === "light"
    ) {
      return "light";
    }
    return null;
  };

  const htmlTheme = checkEl(document.documentElement);
  if (htmlTheme) return htmlTheme;

  const bodyTheme = checkEl(document.body);
  if (bodyTheme) return bodyTheme;

  if (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches) {
    return "dark";
  }
  return "light";
}

function getChatContext(): ChatContext {
  const url = location.href;
  const route = resolveChatKeyFromUrl(url);
  const title = extractChatTitleFromDom(document, route.chatKey);
  const theme = detectTheme();

  return {
    url,
    pathname: route.pathname,
    chatKey: route.chatKey,
    title,
    routeType: route.routeType,
    theme
  };
}

function ensureStyleElement(): void {
  const targetParent = document.head || document.documentElement;
  if (!targetParent) return;

  if (styleEl && styleEl.isConnected) {
    return;
  }

  const existing = document.getElementById(STYLE_ELEMENT_ID);
  if (existing instanceof HTMLStyleElement) {
    styleEl = existing;
    if (!styleEl.isConnected) {
      targetParent.appendChild(styleEl);
    }
    return;
  }

  const created = document.createElement("style");
  created.id = STYLE_ELEMENT_ID;
  created.textContent = buildContentCss();
  targetParent.appendChild(created);
  styleEl = created;
}

function removeStyleElement(): void {
  (styleEl ?? document.getElementById(STYLE_ELEMENT_ID))?.remove();
  styleEl = null;
}

function ensureRootClasses(theme: "dark" | "light"): void {
  const html = document.documentElement;
  if (!html) return;
  if (!html.classList.contains(ROOT_ENABLED_CLASS)) {
    html.classList.add(ROOT_ENABLED_CLASS);
  }
  const wantDark = theme === "dark";
  if (html.classList.contains(ROOT_DARK_CLASS) !== wantDark) {
    html.classList.toggle(ROOT_DARK_CLASS, wantDark);
  }
  if (html.classList.contains(ROOT_LIGHT_CLASS) !== !wantDark) {
    html.classList.toggle(ROOT_LIGHT_CLASS, !wantDark);
  }
}

function removeRootClasses(): void {
  const html = document.documentElement;
  if (!html) return;
  html.classList.remove(ROOT_ENABLED_CLASS, ROOT_DARK_CLASS, ROOT_LIGHT_CLASS);
}

function tagAncestorChain(el: Element | null): void {
  let ancestor = el?.parentElement ?? null;
  while (
    ancestor &&
    ancestor !== document.body &&
    ancestor !== document.documentElement
  ) {
    // Stop before full-screen modal scrims or Radix portals that do not wrap main
    if (
      ancestor.matches("[role='dialog'], [data-radix-portal]") &&
      !ancestor.querySelector("main, [role='main']")
    ) {
      break;
    }
    if (!ancestor.hasAttribute(ANCESTOR_ATTR)) {
      ancestor.setAttribute(ANCESTOR_ATTR, "true");
    }
    ancestor = ancestor.parentElement;
  }
}

function hasRoundedCornersOnce(el: HTMLElement): boolean {
  const cs = window.getComputedStyle(el);
  const tl = parseFloat(cs.borderTopLeftRadius) || 0;
  const tr = parseFloat(cs.borderTopRightRadius) || 0;
  const bl = parseFloat(cs.borderBottomLeftRadius) || 0;
  const br = parseFloat(cs.borderBottomRightRadius) || 0;
  return Math.min(tl, tr, bl, br) >= 10;
}

/**
 * Binds each newly mounted prompt composer once so outer wrappers and backdrop strips
 * stay transparent while only the rounded pill surface retains its background.
 * Already-bound composers are marked and skipped in O(1) on subsequent ticks.
 */
function tagNewComposers(): void {
  const inputs = document.querySelectorAll<HTMLElement>(
    COMPOSER_UNBOUND_SELECTOR
  );
  if (inputs.length === 0) return;

  inputs.forEach((input) => {
    if (input.closest(COMPOSER_SKIP_SELECTOR)) {
      input.setAttribute(COMPOSER_BOUND_ATTR, "skip");
      return;
    }

    input.setAttribute(COMPOSER_BOUND_ATTR, "true");

    const chain: HTMLElement[] = [];
    let stopContainer: HTMLElement | null = null;
    let cur = input.parentElement;

    while (cur && cur !== document.body && cur !== document.documentElement) {
      if (cur.matches(COMPOSER_STOP_SELECTOR)) {
        stopContainer = cur;
        break;
      }
      chain.push(cur);
      cur = cur.parentElement;
    }

    let boundaryIdx = -1;
    for (let i = 0; i < chain.length; i++) {
      if (
        chain[i].matches("form, [data-composer-surface], [id='composer-background']")
      ) {
        boundaryIdx = i;
      }
    }
    if (boundaryIdx === -1) return;

    let pillIdx = -1;
    for (let i = 0; i <= boundaryIdx; i++) {
      if (
        chain[i].matches("[data-composer-surface], [id='composer-background']")
      ) {
        pillIdx = i;
      }
    }
    if (pillIdx === -1) {
      for (let i = 0; i <= boundaryIdx; i++) {
        if (hasRoundedCornersOnce(chain[i])) {
          pillIdx = i;
        }
      }
    }

    const pillEl = pillIdx >= 0 ? chain[pillIdx] : null;
    if (pillEl) {
      pillEl.removeAttribute(COMPOSER_WRAPPER_ATTR);
      if (
        !pillEl.matches("[data-composer-surface], [id='composer-background']") &&
        !pillEl.hasAttribute(COMPOSER_ATTR)
      ) {
        pillEl.setAttribute(COMPOSER_ATTR, "true");
      }
    }

    const wrapperStartIdx = (pillIdx >= 0 ? pillIdx : boundaryIdx) + 1;
    for (let i = wrapperStartIdx; i < chain.length; i++) {
      const wrapper = chain[i];
      if (!wrapper.hasAttribute(COMPOSER_WRAPPER_ATTR)) {
        wrapper.setAttribute(COMPOSER_WRAPPER_ATTR, "true");
      }
      if (!wrapper.hasAttribute(COMPOSER_PSEUDO_ATTR)) {
        wrapper.setAttribute(COMPOSER_PSEUDO_ATTR, "true");
      }
      if (wrapper.tagName === "FOOTER") {
        wrapper
          .querySelectorAll<HTMLElement>(
            ":scope > span[aria-hidden='true'], :scope > div[aria-hidden='true']"
          )
          .forEach((strip) => {
            if (!pillEl || !strip.contains(pillEl)) {
              strip.setAttribute(COMPOSER_WRAPPER_ATTR, "true");
            }
          });
      }
    }

    if (
      stopContainer &&
      !stopContainer.matches("main, [role='main']") &&
      !stopContainer.hasAttribute(COMPOSER_PSEUDO_ATTR)
    ) {
      stopContainer.setAttribute(COMPOSER_PSEUDO_ATTR, "true");
    }
  });
}

function syncLayoutAncestors(): void {
  const mainEl = document.querySelector("main, [role='main']");
  if (mainEl) {
    tagAncestorChain(mainEl);
  }
  document.querySelectorAll(SIDEBAR_ROOT_SELECTOR).forEach((sidebar) => {
    if (!sidebar.closest("[role='dialog'], [data-radix-portal]")) {
      tagAncestorChain(sidebar);
    }
  });
}

function clearDynamicAttributes(): void {
  document
    .querySelectorAll(
      `[${COMPOSER_ATTR}], [${COMPOSER_BOUND_ATTR}], [${COMPOSER_WRAPPER_ATTR}], [${COMPOSER_PSEUDO_ATTR}], [${ANCESTOR_ATTR}]`
    )
    .forEach((el) => {
      el.removeAttribute(COMPOSER_ATTR);
      el.removeAttribute(COMPOSER_BOUND_ATTR);
      el.removeAttribute(COMPOSER_WRAPPER_ATTR);
      el.removeAttribute(COMPOSER_PSEUDO_ATTR);
      el.removeAttribute(ANCESTOR_ATTR);
    });
}

function ensureBackdropElement(): HTMLDivElement | null {
  const host = document.body || document.documentElement;
  if (!host) return null;

  if (backdropEl && backdropEl.isConnected) {
    return backdropEl;
  }

  const existing = document.getElementById(BACKDROP_ELEMENT_ID);
  if (existing instanceof HTMLDivElement) {
    backdropEl = existing;
  } else {
    existing?.remove();
    const created = document.createElement("div");
    created.id = BACKDROP_ELEMENT_ID;
    created.setAttribute("aria-hidden", "true");
    backdropEl = created;
  }

  if (backdropEl.parentElement !== host) {
    host.insertBefore(backdropEl, host.firstChild);
  }

  return backdropEl;
}

function applyVisualsToBackdrop(
  backdrop: HTMLDivElement,
  visuals: EffectiveVisuals,
  theme: "dark" | "light"
): void {
  const wantVideo = isVideoUrl(visuals.backgroundImageUrl);
  const signature = `${wantVideo ? "v" : "i"}|${visuals.backgroundImageUrl}|${visuals.mainImageOpacity}|${visuals.blurAmount}|${visuals.gradientOpacity}|${theme}`;

  if (
    signature === lastVisualSignature &&
    mediaEl?.isConnected &&
    gradientEl?.isConnected
  ) {
    return;
  }

  const existingMedia =
    mediaEl && mediaEl.isConnected
      ? mediaEl
      : (document.getElementById(MEDIA_ELEMENT_ID) as
          | HTMLImageElement
          | HTMLVideoElement
          | null);

  const tagMatches =
    (wantVideo && existingMedia instanceof HTMLVideoElement) ||
    (!wantVideo && existingMedia instanceof HTMLImageElement);

  if (tagMatches && existingMedia) {
    mediaEl = existingMedia;
  } else {
    existingMedia?.remove();
    if (wantVideo) {
      const video = document.createElement("video");
      video.id = MEDIA_ELEMENT_ID;
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("autoplay", "");
      video.setAttribute("loop", "");
      video.setAttribute("muted", "");
      video.setAttribute("playsinline", "");
      mediaEl = video;
    } else {
      const img = document.createElement("img");
      img.id = MEDIA_ELEMENT_ID;
      img.alt = "";
      img.draggable = false;
      img.decoding = "async";
      mediaEl = img;
    }
    backdrop.insertBefore(mediaEl, backdrop.firstChild);
  }

  if (mediaEl.getAttribute("src") !== visuals.backgroundImageUrl) {
    mediaEl.setAttribute("src", visuals.backgroundImageUrl);
    if (mediaEl instanceof HTMLVideoElement) {
      mediaEl.muted = true;
      void mediaEl.play().catch(() => {
        // Ignore autoplay rejection in restricted frames
      });
    }
  }

  const opacityStr = String(visuals.mainImageOpacity);
  if (mediaEl.style.opacity !== opacityStr) {
    mediaEl.style.opacity = opacityStr;
  }

  const filterStr =
    visuals.blurAmount > 0 ? `blur(${visuals.blurAmount}px)` : "none";
  if (mediaEl.style.filter !== filterStr) {
    mediaEl.style.filter = filterStr;
  }

  if (!gradientEl || !gradientEl.isConnected) {
    const existingGrad = document.getElementById(GRADIENT_ELEMENT_ID);
    if (existingGrad instanceof HTMLDivElement) {
      gradientEl = existingGrad;
    } else {
      existingGrad?.remove();
      const createdGrad = document.createElement("div");
      createdGrad.id = GRADIENT_ELEMENT_ID;
      gradientEl = createdGrad;
    }
  }
  if (gradientEl.parentElement !== backdrop) {
    backdrop.appendChild(gradientEl);
  }

  const gradOpacityStr = String(visuals.gradientOpacity);
  if (gradientEl.style.opacity !== gradOpacityStr) {
    gradientEl.style.opacity = gradOpacityStr;
  }

  lastVisualSignature = signature;
}

function maybeSyncChatTitle(chatKey: string | null, title: string | null): void {
  if (!chatKey || !title) return;
  const existing = currentConfig.chatBackgrounds[chatKey];
  if (!existing || existing.title === title) return;

  if (titleSyncTimeout !== undefined) {
    window.clearTimeout(titleSyncTimeout);
  }
  titleSyncTimeout = window.setTimeout(() => {
    const latestEntry = currentConfig.chatBackgrounds[chatKey];
    if (!latestEntry || latestEntry.title === title) return;
    void updateConfigPartial({
      chatBackgrounds: {
        ...currentConfig.chatBackgrounds,
        [chatKey]: {
          ...latestEntry,
          title
        }
      }
    }).then((saved) => {
      currentConfig = saved;
    });
  }, 250);
}

function reconcileDom(): void {
  if (isReconciling) return;
  isReconciling = true;

  try {
    lastKnownHref = location.href;

    if (!currentConfig.enabled) {
      removeRootClasses();
      (backdropEl ?? document.getElementById(BACKDROP_ELEMENT_ID))?.remove();
      removeStyleElement();
      clearDynamicAttributes();
      backdropEl = null;
      mediaEl = null;
      gradientEl = null;
      lastVisualSignature = "";
      return;
    }

    const ctx = getChatContext();
    const visuals = resolveEffectiveVisuals(currentConfig, ctx.chatKey);

    ensureStyleElement();
    ensureRootClasses(ctx.theme);

    const backdrop = ensureBackdropElement();
    if (backdrop) {
      applyVisualsToBackdrop(backdrop, visuals, ctx.theme);
    }

    syncLayoutAncestors();
    tagNewComposers();
    maybeSyncChatTitle(ctx.chatKey, ctx.title);
  } finally {
    isReconciling = false;
  }
}

function scheduleStructuralSync(): void {
  if (structuralSyncTimer !== undefined) return;
  structuralSyncTimer = window.setTimeout(() => {
    structuralSyncTimer = undefined;
    if (!currentConfig.enabled) return;
    if (
      !backdropEl?.isConnected ||
      !mediaEl?.isConnected ||
      !gradientEl?.isConnected ||
      !styleEl?.isConnected ||
      !document.documentElement.classList.contains(ROOT_ENABLED_CLASS)
    ) {
      reconcileDom();
      return;
    }
    syncLayoutAncestors();
    tagNewComposers();
  }, 120);
}

function handleLocationChange(): void {
  if (location.href !== lastKnownHref) {
    lastKnownHref = location.href;
  }
  reconcileDom();
}

function installNavigationHooks(): void {
  const win = window as unknown as Record<string, unknown>;
  if (!win[HOOKED_FLAG]) {
    win[HOOKED_FLAG] = true;

    const origPushState = history.pushState.bind(history);
    history.pushState = function (
      data: unknown,
      unused: string,
      url?: string | URL | null
    ) {
      const result = origPushState(data, unused, url);
      window.dispatchEvent(new Event("cg-spa-navigate"));
      handleLocationChange();
      return result;
    };

    const origReplaceState = history.replaceState.bind(history);
    history.replaceState = function (
      data: unknown,
      unused: string,
      url?: string | URL | null
    ) {
      const result = origReplaceState(data, unused, url);
      window.dispatchEvent(new Event("cg-spa-navigate"));
      handleLocationChange();
      return result;
    };
  }

  window.addEventListener("popstate", handleLocationChange);
  window.addEventListener("hashchange", handleLocationChange);

  const navApi = (
    window as unknown as {
      navigation?: {
        addEventListener?: (type: string, listener: () => void) => void;
      };
    }
  ).navigation;
  navApi?.addEventListener?.("navigatesuccess", handleLocationChange);

  // Lightweight URL string comparison for isolated-world SPA route switches
  window.setInterval(() => {
    if (location.href !== lastKnownHref) {
      handleLocationChange();
    }
  }, 400);
}

function installObservers(): void {
  const root = document.documentElement;
  if (!root) return;

  // Observer 1: Root theme attribute changes only (subtree: false -> zero streaming noise)
  const themeObserver = new MutationObserver(() => {
    if (!currentConfig.enabled || isReconciling) return;
    const theme = detectTheme();
    const wantDark = theme === "dark";
    if (
      root.classList.contains(ROOT_DARK_CLASS) !== wantDark ||
      !root.classList.contains(ROOT_ENABLED_CLASS)
    ) {
      reconcileDom();
    }
  });

  themeObserver.observe(root, {
    attributes: true,
    attributeFilter: [
      "class",
      "data-theme",
      "data-chat-theme",
      "data-mode",
      "data-color-mode"
    ]
  });

  if (document.body) {
    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-chat-theme"]
    });
  }

  // Observer 2: Structural DOM additions/removals (no attribute observation; ignores streaming turns & typing)
  const domObserver = new MutationObserver((mutations) => {
    if (isReconciling) return;

    if (location.href !== lastKnownHref) {
      handleLocationChange();
      return;
    }

    if (!currentConfig.enabled) return;

    if (
      !backdropEl?.isConnected ||
      !mediaEl?.isConnected ||
      !gradientEl?.isConnected ||
      !styleEl?.isConnected ||
      !root.classList.contains(ROOT_ENABLED_CLASS)
    ) {
      reconcileDom();
      return;
    }

    let needsSync = false;
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i];
      if (m.addedNodes.length === 0) continue;

      const target = m.target;
      if (
        target instanceof Element &&
        target.closest(STREAMING_IGNORE_SELECTOR)
      ) {
        continue;
      }

      for (let j = 0; j < m.addedNodes.length; j++) {
        const added = m.addedNodes[j];
        if (
          added instanceof Element &&
          added.id !== BACKDROP_ELEMENT_ID &&
          added.id !== STYLE_ELEMENT_ID
        ) {
          needsSync = true;
          break;
        }
      }
      if (needsSync) break;
    }

    if (needsSync) {
      scheduleStructuralSync();
    }
  });

  domObserver.observe(root, {
    childList: true,
    subtree: true
  });
}

function installMessageListener(): void {
  globalThis.chrome?.runtime?.onMessage?.addListener(
    (message: RuntimeMessage, _sender, sendResponse) => {
      if (!message || typeof message.type !== "string") {
        return false;
      }

      if (message.type === "GET_CHAT_CONTEXT") {
        const ctx = getChatContext();
        sendResponse({
          ok: true,
          ...ctx,
          context: ctx
        });
        return false;
      }

      if (message.type === "GET_CFG") {
        void loadConfig()
          .then((cfg) => {
            currentConfig = cfg;
            reconcileDom();
            sendResponse({ ok: true, cfg });
          })
          .catch((error) => {
            sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : String(error)
            });
          });
        return true;
      }

      if (message.type === "SET_CFG_PARTIAL") {
        const partial =
          message.payload ??
          message.partial ??
          message.patch ??
          message.cfg ??
          {};
        void updateConfigPartial(partial)
          .then((saved) => {
            currentConfig = saved;
            reconcileDom();
            sendResponse({ ok: true, cfg: saved });
          })
          .catch((error) => {
            sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : String(error)
            });
          });
        return true;
      }

      return false;
    }
  );
}

async function bootstrap(): Promise<void> {
  installNavigationHooks();
  installMessageListener();

  currentConfig = await loadConfig();
  reconcileDom();

  installObservers();

  watchConfig((nextCfg) => {
    currentConfig = nextCfg;
    reconcileDom();
  });
}

void bootstrap();
