export const ROOT_ENABLED_CLASS = "canvas-for-chatgpt-enabled";
export const ROOT_DARK_CLASS = "canvas-for-chatgpt-dark";
export const ROOT_LIGHT_CLASS = "canvas-for-chatgpt-light";

export const STYLE_ELEMENT_ID = "canvas-for-chatgpt-styles";
export const BACKDROP_ELEMENT_ID = "canvas-for-chatgpt-backdrop";
export const MEDIA_ELEMENT_ID = "canvas-for-chatgpt-media";
export const GRADIENT_ELEMENT_ID = "canvas-for-chatgpt-gradient";

export const COMPOSER_ATTR = "data-canvas-chatgpt-composer";
export const COMPOSER_BOUND_ATTR = "data-canvas-chatgpt-composer-bound";
export const COMPOSER_WRAPPER_ATTR = "data-canvas-chatgpt-composer-wrapper";
export const COMPOSER_PSEUDO_ATTR = "data-canvas-chatgpt-composer-pseudo";
export const ANCESTOR_ATTR = "data-canvas-chatgpt-ancestor";

export function buildContentCss(): string {
  return `
/* Canvas for ChatGPT v3.0 - Zero-Lag Pure-CSS Workspace Engine */
html.${ROOT_ENABLED_CLASS} {
  --bg-primary: transparent !important;
  --main-surface-primary: transparent !important;
  --main-surface-secondary: transparent !important;
  --main-surface-tertiary: transparent !important;
  --bg-elevated-primary: transparent !important;
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

html.${ROOT_ENABLED_CLASS},
html.${ROOT_ENABLED_CLASS} body {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
}

#${BACKDROP_ELEMENT_ID} {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 0 !important;
  pointer-events: none !important;
  overflow: hidden !important;
  contain: strict;
}

#${MEDIA_ELEMENT_ID} {
  position: absolute !important;
  inset: -24px !important;
  width: calc(100% + 48px) !important;
  height: calc(100% + 48px) !important;
  max-width: none !important;
  max-height: none !important;
  object-fit: cover !important;
  transform: scale(1.03);
  pointer-events: none !important;
  user-select: none !important;
}

#${GRADIENT_ELEMENT_ID} {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  pointer-events: none !important;
}

html.${ROOT_ENABLED_CLASS}.${ROOT_DARK_CLASS} #${GRADIENT_ELEMENT_ID} {
  background: radial-gradient(
    ellipse at 50% 25%,
    rgba(18, 19, 24, 0.36) 0%,
    rgba(12, 13, 18, 0.72) 62%,
    rgba(8, 9, 13, 0.88) 100%
  ) !important;
}

html.${ROOT_ENABLED_CLASS}.${ROOT_LIGHT_CLASS} #${GRADIENT_ELEMENT_ID} {
  background: radial-gradient(
    ellipse at 50% 25%,
    rgba(255, 255, 255, 0.42) 0%,
    rgba(246, 247, 250, 0.76) 62%,
    rgba(236, 239, 245, 0.90) 100%
  ) !important;
}

/* Keep React shell above backdrop without trapping Radix portals or modals */
html.${ROOT_ENABLED_CLASS} body > div:not(#${BACKDROP_ELEMENT_ID}):not([data-radix-portal]):not([role="dialog"]),
html.${ROOT_ENABLED_CLASS} body > main,
html.${ROOT_ENABLED_CLASS} body > section {
  position: relative;
  z-index: 1;
}

/* Transparent structural layout shells and traced layout ancestors (no heavy :has() scans) */
html.${ROOT_ENABLED_CLASS} :where(
  #__next,
  #root,
  [data-testid="root"],
  [data-testid="ds-document-layout"],
  [data-app-shell],
  #web-mobile-root,
  main,
  [role="main"],
  [${ANCESTOR_ATTR}="true"]
) {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
}

html.${ROOT_ENABLED_CLASS} :where(
  body > div,
  #__next > div,
  div#root > div,
  [data-app-shell] > div,
  [data-testid="ds-document-layout"] > div
):not(
  #${BACKDROP_ELEMENT_ID},
  #stage-slideover-sidebar,
  #stage-popover-sidebar,
  [data-testid="sidebar"],
  [data-testid="stage-sidebar"],
  [role="dialog"],
  [role="menu"],
  [role="alertdialog"],
  [role="tooltip"],
  [data-radix-popper-content-wrapper],
  [data-radix-portal]
) {
  background-color: transparent !important;
}

html.${ROOT_ENABLED_CLASS} :where(header, [data-testid="page-header"]):not([role="dialog"] *):not([role="menu"] *):not([role="alertdialog"] *) {
  background-color: transparent !important;
  background-image: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

html.${ROOT_ENABLED_CLASS} footer[data-ds-composer],
html.${ROOT_ENABLED_CLASS} footer[data-ds-composer] > span[aria-hidden="true"],
html.${ROOT_ENABLED_CLASS} footer[data-ds-composer] > div[aria-hidden="true"] {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
}

/* Clear ChatGPT background surface tokens while preserving pills, buttons, code blocks, and dialogs */
html.${ROOT_ENABLED_CLASS} :where(
  [class*="main-surface"],
  [class*="bg-token-main-surface"],
  [class*="bg-token-surface"],
  [class*="bg-surface-primary"],
  [class*="bg-surface-secondary"],
  [class*="bg-token-bg-primary"],
  [class*="bg-token-bg-secondary"],
  [class*="bg-token-bg-elevated"],
  [class*="bg-token-sidebar-surface"]
):not(
  [data-composer-surface],
  [id="composer-background"],
  [${COMPOSER_ATTR}="true"],
  #stage-slideover-sidebar,
  #stage-popover-sidebar,
  [data-testid="sidebar"],
  [data-testid="stage-sidebar"],
  [role="dialog"],
  [role="dialog"] *,
  [role="alertdialog"],
  [role="alertdialog"] *,
  [role="menu"],
  [role="menu"] *,
  [role="listbox"],
  [role="listbox"] *,
  [role="tooltip"],
  [data-radix-popper-content-wrapper],
  [data-radix-popper-content-wrapper] *,
  pre,
  pre *,
  code,
  a,
  a *,
  button,
  button *
) {
  background-color: transparent !important;
  background-image: none !important;
}

/* Unified frosted-glass sidebar (desktop slide-over, mobile popover, and fallback nav) */
html.${ROOT_ENABLED_CLASS} :where(
  #stage-slideover-sidebar,
  #stage-popover-sidebar,
  [data-testid="sidebar"],
  [data-testid="stage-sidebar"]
),
html.${ROOT_ENABLED_CLASS} :where(nav[aria-label="Chat history"]):not(#stage-slideover-sidebar *):not(#stage-popover-sidebar *):not([data-testid="sidebar"] *):not([data-testid="stage-sidebar"] *) {
  --sidebar-surface-primary: transparent !important;
  --sidebar-surface: transparent !important;
  --sidebar-bg: transparent !important;
  --bg-elevated-secondary: transparent !important;
  --bg-elevated-primary: transparent !important;
  --bg-secondary: transparent !important;
  background: none !important;
  background-image: none !important;
  background-color: rgba(255, 255, 255, 0.42) !important;
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
}

html.${ROOT_ENABLED_CLASS}.${ROOT_DARK_CLASS} :where(
  #stage-slideover-sidebar,
  #stage-popover-sidebar,
  [data-testid="sidebar"],
  [data-testid="stage-sidebar"]
),
html.${ROOT_ENABLED_CLASS}.${ROOT_DARK_CLASS} :where(nav[aria-label="Chat history"]):not(#stage-slideover-sidebar *):not(#stage-popover-sidebar *):not([data-testid="sidebar"] *):not([data-testid="stage-sidebar"] *) {
  background-color: rgba(24, 24, 28, 0.42) !important;
}

/* Inner structural sidebar layers stay transparent (no opaque slabs, header seams, or nested blur) */
html.${ROOT_ENABLED_CLASS} :where(
  #stage-slideover-sidebar,
  #stage-popover-sidebar,
  [data-testid="sidebar"],
  [data-testid="stage-sidebar"],
  nav[aria-label="Chat history"]
) :where(
  nav,
  aside,
  header,
  #sidebar-header,
  #history,
  #stage-sidebar-tiny-bar,
  [class*="sidebar-"],
  [class*="sticky"]
):not(a):not(button):not([role="menu"]):not([role="dialog"]) {
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

html.${ROOT_ENABLED_CLASS} :where(
  #stage-slideover-sidebar > div,
  #stage-slideover-sidebar > div > div,
  #stage-popover-sidebar > div,
  nav[aria-label="Chat history"] > div
):not([role="menu"]):not([role="dialog"]):not(a):not(button) {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

html.${ROOT_ENABLED_CLASS} :where(
  #stage-slideover-sidebar,
  #stage-popover-sidebar,
  nav[aria-label="Chat history"]
) :where([class*="scroll"], [class*="fade"])::before,
html.${ROOT_ENABLED_CLASS} :where(
  #stage-slideover-sidebar,
  #stage-popover-sidebar,
  nav[aria-label="Chat history"]
) :where([class*="scroll"], [class*="fade"])::after {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
}

/* Prompt composer: readable rounded pill surface without rectangular outer wrapper boxes */
html.${ROOT_ENABLED_CLASS} :where(
  [data-composer-surface],
  [id="composer-background"],
  [${COMPOSER_ATTR}="true"]
):not([${COMPOSER_WRAPPER_ATTR}="true"]) {
  background-color: #ffffff !important;
}

html.${ROOT_ENABLED_CLASS}.${ROOT_DARK_CLASS} :where(
  [data-composer-surface],
  [id="composer-background"],
  [${COMPOSER_ATTR}="true"]
):not([${COMPOSER_WRAPPER_ATTR}="true"]) {
  background-color: #303030 !important;
}

html.${ROOT_ENABLED_CLASS} [${COMPOSER_WRAPPER_ATTR}="true"] {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
}

html.${ROOT_ENABLED_CLASS} form[${COMPOSER_WRAPPER_ATTR}="true"] {
  border-color: transparent !important;
  box-shadow: none !important;
}

html.${ROOT_ENABLED_CLASS} [${COMPOSER_PSEUDO_ATTR}="true"]::before,
html.${ROOT_ENABLED_CLASS} [${COMPOSER_PSEUDO_ATTR}="true"]::after {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
}

html.${ROOT_ENABLED_CLASS} :where(
  #prompt-textarea,
  [data-composer-surface] textarea,
  [${COMPOSER_ATTR}="true"] textarea,
  [data-composer-surface] [contenteditable="true"],
  [${COMPOSER_ATTR}="true"] [contenteditable="true"]
) {
  background-color: transparent !important;
}
`.trim();
}
