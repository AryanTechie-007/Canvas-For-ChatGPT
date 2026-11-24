// collapsible-messages.ts

export type CollapsibleConfig = {
  enabled: boolean
  buttonOpacity: number
  collapsedHeight: string
  altClickEnabled: boolean
  persistMessageState: boolean
}

export class CollapsibleMessages {
  private config: CollapsibleConfig
  private allCollapsed = false
  private styleId = 'cg-collapse-styles'
  private keyboardListenerAdded = false
  private altClickListenerAdded = false
  private storageKey = 'cg-message-states'
  private boundKeyDownHandler: ((event: KeyboardEvent) => void) | null = null
  private boundAltClickHandler: ((event: MouseEvent) => void) | null = null

  constructor(config: CollapsibleConfig) {
    this.config = config
    console.log('CollapsibleMessages: Initialized with config', config)

    if (config.enabled) {
      setTimeout(() => {
        console.log('CollapsibleMessages: Auto-enabling after construction')
        this.enable()
      }, 50)
    }
  }

  updateConfig(config: CollapsibleConfig) {
    console.log('CollapsibleMessages: Updating config', config)
    const wasAltClickEnabled = this.config.altClickEnabled
    this.config = config

    if (config.enabled) {
      if (wasAltClickEnabled !== config.altClickEnabled) {
        if (config.altClickEnabled) {
          this.setupAltClickListeners()
        } else {
          this.removeAltClickListeners()
        }
      }
      this.enable()
    } else {
      this.disable()
    }
  }

  enable() {
    console.log('CollapsibleMessages: Enabling')
    this.removeAllButtons()

    this.addStyles()
    this.setupKeyboardShortcuts()
    this.setupAltClickListeners()

    this.addButtonsToExistingMessages()
    this.addMasterToggle()

    setTimeout(() => {
      this.addButtonsToExistingMessages()
      this.addMasterToggle()
    }, 300)
  }

  disable() {
    console.log('CollapsibleMessages: Disabling')
    this.removeStyles()
    this.removeAllButtons()
    this.removeKeyboardShortcuts()
    this.removeAltClickListeners()
  }

  private addStyles() {
    const existingStyle = document.getElementById(this.styleId)
    if (existingStyle) {
      existingStyle.remove()
    }

    const style = document.createElement('style')
    style.id = this.styleId
    style.textContent = `
      .cg-collapse-btn {
        position: absolute !important;
        top: 0.4em !important;
        right: 0.4em !important;
        z-index: 100 !important;
        width: 22px !important;
        height: 22px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: rgba(128, 128, 128, 0.18) !important;
        border: 1px solid rgba(128, 128, 128, 0.28) !important;
        border-radius: 4px !important;
        cursor: pointer !important;
        opacity: ${Math.max(0.25, this.config.buttonOpacity)} !important;
        transition: transform 0.2s ease, opacity 0.2s ease, background-color 0.2s ease !important;
        color: inherit !important;
        font-size: 11px !important;
        line-height: 1 !important;
        padding: 0 !important;
        user-select: none !important;
      }

      .cg-collapse-btn:hover {
        opacity: 1 !important;
        transform: scale(1.1) !important;
        background: rgba(128, 128, 128, 0.35) !important;
      }

      .cg-collapse-btn.collapsed {
        transform: rotate(-90deg) !important;
      }

      .cg-collapse-btn.collapsed:hover {
        transform: rotate(-90deg) scale(1.1) !important;
      }

      .cg-toggle-all-btn {
        position: fixed !important;
        bottom: 5.5em !important;
        right: 1.2em !important;
        z-index: 1000 !important;
        width: 32px !important;
        height: 32px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: rgba(40, 40, 40, 0.88) !important;
        border: 1px solid rgba(255, 255, 255, 0.25) !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
        border-radius: 6px !important;
        cursor: pointer !important;
        transition: transform 0.2s ease, opacity 0.2s ease, background-color 0.2s ease !important;
        opacity: ${Math.max(0.4, this.config.buttonOpacity)} !important;
        color: #ffffff !important;
        font-size: 13px !important;
        line-height: 1 !important;
        user-select: none !important;
      }

      html:not(.dark):not([data-theme="dark"]) .cg-toggle-all-btn {
        background: rgba(255, 255, 255, 0.92) !important;
        color: #111111 !important;
        border: 1px solid rgba(0, 0, 0, 0.2) !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15) !important;
      }

      .cg-toggle-all-btn:hover {
        opacity: 1 !important;
        transform: scale(1.1) !important;
      }

      .cg-toggle-all-btn.collapsed {
        transform: rotate(-90deg) !important;
      }

      .cg-toggle-all-btn.collapsed:hover {
        transform: rotate(-90deg) scale(1.1) !important;
      }

      .cg-collapse-container.collapsed {
        max-height: ${this.config.collapsedHeight || '6.5em'} !important;
        overflow: hidden !important;
        position: relative !important;
      }

      .cg-collapse-container.collapsed::after {
        content: '' !important;
        position: absolute !important;
        bottom: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 2.2em !important;
        pointer-events: none !important;
        background: linear-gradient(to top, rgba(255, 255, 255, 0.95), transparent) !important;
        z-index: 20 !important;
      }

      html.dark .cg-collapse-container.collapsed::after,
      html[data-theme="dark"] .cg-collapse-container.collapsed::after {
        background: linear-gradient(to top, rgba(24, 24, 24, 0.95), transparent) !important;
      }
    `
    document.head.appendChild(style)
    console.log('CollapsibleMessages: Styles added')
  }

  private removeStyles() {
    const style = document.getElementById(this.styleId)
    if (style) {
      style.remove()
      console.log('CollapsibleMessages: Styles removed')
    }
  }

  /**
   * Find candidate message elements across legacy, standard, and modern ChatGPT DOMs.
   */
  findMessages(): HTMLElement[] {
    const candidates: HTMLElement[] = []
    const seen = new Set<HTMLElement>()

    // Priority 1: Semantic attributes / explicit role markers
    const explicitSelectors = [
      '[data-message-author-role]',
      'article',
      '[data-testid^="conversation-turn-"]',
      'div[data-message-id]',
      '[class*="conversation-turn"]',
      '[class*="agent-turn"]'
    ]

    for (const sel of explicitSelectors) {
      try {
        const elements = document.querySelectorAll<HTMLElement>(sel)
        elements.forEach((el) => {
          const resolved = this.resolveMessageContainer(el)
          if (resolved && !seen.has(resolved) && this.isValidMessage(resolved)) {
            seen.add(resolved)
            candidates.push(resolved)
          }
        })
      } catch (e) {}
    }

    // Priority 2: Modern DIV-based components inside <main>
    const main = document.querySelector<HTMLElement>('main, [role="main"]') || document.body
    if (main) {
      // Content anchors representing rendered message blocks
      const contentAnchors = main.querySelectorAll<HTMLElement>(
        '[class*="markdown" i], [class*="Markdown" i], [class*="prose" i], [class*="DILRender" i], [class*="CodeBlock" i], [class*="TableView" i], button[aria-label*="Copy" i], button[data-testid*="copy" i], button[aria-label*="Edit" i], [data-message-author-role]'
      )

      contentAnchors.forEach((anchor) => {
        const turnContainer = this.resolveTurnBoundary(anchor, main)
        if (turnContainer && !seen.has(turnContainer) && this.isValidMessage(turnContainer)) {
          seen.add(turnContainer)
          candidates.push(turnContainer)
        }
      })

      // Discover conversation turns as siblings in the thread container
      for (const msg of Array.from(candidates)) {
        const parent = msg.parentElement
        if (parent && parent !== main && parent !== document.body && parent.children.length > 1) {
          Array.from(parent.children).forEach((child) => {
            const childEl = child as HTMLElement
            if (childEl && !seen.has(childEl) && this.isValidMessage(childEl)) {
              seen.add(childEl)
              candidates.push(childEl)
            }
          })
        }
      }
    }

    // Filter out any containers that are descendants of another selected container
    return candidates.filter((item) => {
      let current = item.parentElement
      while (current && current !== document.body && current !== document.documentElement) {
        if (seen.has(current)) {
          return false
        }
        current = current.parentElement
      }
      return true
    })
  }

  /**
   * Ascend from an anchor to the logical message boundary.
   */
  private resolveTurnBoundary(anchor: HTMLElement, boundary: HTMLElement): HTMLElement | null {
    if (!boundary.contains(anchor)) return null

    // If anchor is already a top-level message container
    if (
      anchor.tagName.toLowerCase() === 'article' ||
      anchor.hasAttribute('data-message-author-role') ||
      anchor.hasAttribute('data-message-id') ||
      (anchor.getAttribute('data-testid') || '').includes('turn') ||
      anchor.classList.contains('turn') ||
      anchor.classList.contains('conversation-turn')
    ) {
      return anchor
    }

    let current: HTMLElement = anchor
    let bestCandidate: HTMLElement = anchor

    while (current.parentElement && current.parentElement !== boundary) {
      const parent: HTMLElement = current.parentElement

      // Stop ascending if parent is or contains composer/textarea
      if (
        parent.matches?.('form, [data-composer-surface], [id="composer-background"]') ||
        parent.querySelector?.('textarea, [id="prompt-textarea"]')
      ) {
        if (this.isValidMessage(current)) return current
        break
      }

      // If current explicitly marks a turn
      if (
        current.tagName.toLowerCase() === 'article' ||
        current.hasAttribute('data-message-author-role') ||
        current.hasAttribute('data-message-id') ||
        (current.getAttribute('data-testid') || '').includes('turn') ||
        current.classList.contains('turn') ||
        current.classList.contains('conversation-turn') ||
        current.classList.contains('agent-turn') ||
        (current.getAttribute('class') || '').includes('conversation-turn')
      ) {
        return current
      }

      // If parent has sibling message turns (e.g. multiple children where another child has turns/bubbles)
      const hasSiblingTurns = Array.from(parent.children).some(
        (child) =>
          child !== current &&
          child instanceof HTMLElement &&
          (child.classList.contains('turn') ||
            child.hasAttribute('data-message-author-role') ||
            (child.getAttribute('class') || '').includes('turn') ||
            child.querySelector('[class*="user-bubble" i], button[aria-label*="Edit" i], button[aria-label*="Copy" i]'))
      )

      if (hasSiblingTurns && this.isValidMessage(current)) {
        return current
      }

      // Check if parent is the conversation thread container
      const isParentThread =
        parent.parentElement === boundary ||
        parent.parentElement?.parentElement === boundary ||
        parent.classList.contains('conversation-thread') ||
        (parent.getAttribute('class') || '').includes('thread') ||
        parent.getAttribute('role') === 'presentation'

      if (isParentThread && parent.children.length > 1 && this.isValidMessage(current)) {
        return current
      }

      if (this.isValidMessage(current)) {
        bestCandidate = current
      }

      current = parent
    }

    if (this.isValidMessage(current)) {
      return current
    }

    return this.isValidMessage(bestCandidate) ? bestCandidate : null
  }

  /**
   * Normalize an element reference to its enclosing message wrapper if needed.
   */
  private resolveMessageContainer(element: HTMLElement): HTMLElement {
    if (
      element.tagName.toLowerCase() === 'article' ||
      element.hasAttribute('data-message-author-role') ||
      element.hasAttribute('data-message-id') ||
      (element.getAttribute('data-testid') || '').includes('turn')
    ) {
      return element
    }

    const turnParent = element.closest<HTMLElement>(
      'article, [data-message-author-role], [data-testid*="conversation-turn"]'
    )
    return turnParent || element
  }

  isValidMessage(element: HTMLElement): boolean {
    if (!element || !(element instanceof HTMLElement)) {
      return false
    }

    // Reject UI elements outside of the main conversation area
    if (
      element.closest(
        '[role="dialog"], [role="menu"], [role="combobox"], [role="tooltip"], .popup, .dropdown, nav, header, footer'
      )
    ) {
      return false
    }

    // Reject composer / input surfaces
    if (
      element.matches?.('form, [data-composer-surface], [id="composer-background"], textarea, [contenteditable="true"]') ||
      element.querySelector?.('textarea, [contenteditable="true"], [data-composer-surface], [id="composer-background"]')
    ) {
      return false
    }

    // Reject background and extension controls
    if (
      element.id === 'cg-customizer-background' ||
      element.classList.contains('cg-toggle-all-btn') ||
      element.classList.contains('cg-collapse-btn')
    ) {
      return false
    }

    // Reject multi-turn thread containers or wrappers that enclose multiple messages
    const editButtons = element.querySelectorAll('button[aria-label*="Edit" i]')
    const copyButtons = element.querySelectorAll('button[aria-label*="Copy" i], button[data-testid*="copy" i]')
    if (editButtons.length > 0 && copyButtons.length > 0) {
      return false
    }
    if (editButtons.length > 1) {
      return false
    }
    if (copyButtons.length > 2) {
      return false
    }

    // Reject small atomic tags that should never be entire messages
    const tag = element.tagName.toLowerCase()
    if (
      [
        'button',
        'svg',
        'path',
        'span',
        'input',
        'img',
        'a',
        'p',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'pre',
        'code',
        'table'
      ].includes(tag)
    ) {
      return false
    }

    // Reject nested rendering components if their parent container is already a message
    if (
      element.classList.contains('CodeBlock') ||
      element.classList.contains('TableView') ||
      element.classList.contains('DILRender')
    ) {
      const ancestor = element.closest('.cg-collapse-container')
      if (ancestor && ancestor !== element) {
        return false
      }
    }

    // Must contain some textual or meaningful child content
    const textContent = element.textContent?.trim() || ''
    if (textContent.length === 0) {
      return false
    }

    return true
  }

  /**
   * Extract a stable, non-invented identifier if one exists in the DOM.
   * If none exists, returns null rather than creating synthetic IDs.
   */
  getMessageIdentifier(msg: HTMLElement): string | null {
    const dataId = msg.getAttribute('data-message-id') || msg.getAttribute('id')
    if (
      dataId &&
      dataId !== 'cg-customizer-background' &&
      !dataId.startsWith('turn-') &&
      !dataId.startsWith('cg-')
    ) {
      return dataId
    }

    const authorRole = msg.getAttribute('data-message-author-role')
    const testId = msg.getAttribute('data-testid')
    if (testId && testId.startsWith('conversation-turn-')) {
      return authorRole ? `${testId}-${authorRole}` : testId
    }

    const childId = msg.querySelector('[data-message-id]')?.getAttribute('data-message-id')
    if (childId) {
      return childId
    }

    return null
  }

  addButtonsToExistingMessages() {
    if (!this.config.enabled) return

    const messages = this.findMessages()
    let processedCount = 0

    messages.forEach((msg) => {
      if (!msg.querySelector('.cg-collapse-btn')) {
        this.addButtonToMessage(msg)
        processedCount++
      }
    })

    if (processedCount > 0) {
      console.log(`CollapsibleMessages: Added collapse controls to ${processedCount} messages`)
    }
  }

  private async addButtonToMessage(msg: HTMLElement) {
    if (msg.querySelector('.cg-collapse-btn')) {
      return
    }

    if (!this.isValidMessage(msg)) {
      return
    }

    msg.classList.add('cg-collapse-container')
    const computedPosition = window.getComputedStyle(msg).position
    if (!computedPosition || computedPosition === 'static') {
      msg.style.position = 'relative'
    }

    const btn = document.createElement('button')
    btn.className = 'cg-collapse-btn'
    btn.title = 'Collapse/Expand Message (Alt+C)'
    btn.setAttribute('aria-label', 'Collapse or expand message')
    btn.innerHTML = '▼'

    const messageId = this.getMessageIdentifier(msg)
    if (messageId) {
      btn.setAttribute('data-cg-button-id', messageId)
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      this.toggleMessage(msg, btn)
    })

    msg.prepend(btn)

    if (messageId && this.config.persistMessageState) {
      const savedState = await this.getMessageState(messageId)
      if (savedState !== null) {
        this.applyMessageState(msg, btn, savedState)
      }
    }
  }

  private toggleMessage(msg: HTMLElement, btn: HTMLElement) {
    const isCollapsed = msg.classList.contains('collapsed')
    const nextCollapsed = !isCollapsed

    this.applyMessageState(msg, btn, nextCollapsed)

    const messageId = this.getMessageIdentifier(msg)
    if (messageId && this.config.persistMessageState) {
      this.saveMessageState(messageId, nextCollapsed)
    }
  }

  applyMessageState(msg: HTMLElement, btn: HTMLElement, isCollapsed: boolean) {
    if (isCollapsed) {
      msg.classList.add('collapsed')
      btn.classList.add('collapsed')
      msg.style.maxHeight = this.config.collapsedHeight || '6.5em'
      msg.style.overflow = 'hidden'
      btn.innerHTML = '▼'
    } else {
      msg.classList.remove('collapsed')
      btn.classList.remove('collapsed')
      msg.style.maxHeight = ''
      msg.style.overflow = ''
      btn.innerHTML = '▼'
    }
  }

  private addMasterToggle() {
    if (!this.config.enabled) return

    if (document.querySelector('.cg-toggle-all-btn')) {
      return
    }

    const master = document.createElement('button')
    master.className = 'cg-toggle-all-btn'
    master.title = 'Toggle All Messages (Alt+Shift+C)'
    master.setAttribute('aria-label', 'Toggle all messages')
    master.innerHTML = '▼'

    master.addEventListener('click', async (e) => {
      e.stopPropagation()
      e.preventDefault()
      await this.toggleAll()
    })

    document.body.appendChild(master)
  }

  async toggleAll() {
    this.allCollapsed = !this.allCollapsed

    const containers = document.querySelectorAll<HTMLElement>('.cg-collapse-container')
    const validContainers = Array.from(containers).filter((container) => this.isValidMessage(container))

    const newStates: Record<string, boolean> = {}

    validContainers.forEach((container) => {
      const btn = container.querySelector<HTMLElement>('.cg-collapse-btn')
      if (!btn) return

      this.applyMessageState(container, btn, this.allCollapsed)

      const messageId = this.getMessageIdentifier(container)
      if (messageId) {
        newStates[messageId] = this.allCollapsed
      }
    })

    if (this.config.persistMessageState && Object.keys(newStates).length > 0) {
      await this.saveMessageStates(newStates)
    }

    const master = document.querySelector<HTMLElement>('.cg-toggle-all-btn')
    if (master) {
      master.classList.toggle('collapsed', this.allCollapsed)
      master.innerHTML = '▼'
    }
  }

  private removeAllButtons() {
    document.querySelectorAll('.cg-collapse-btn').forEach((btn) => btn.remove())
    document.querySelectorAll('.cg-toggle-all-btn').forEach((btn) => btn.remove())

    document.querySelectorAll<HTMLElement>('.cg-collapse-container').forEach((container) => {
      container.classList.remove('cg-collapse-container', 'collapsed')
      container.style.maxHeight = ''
      container.style.overflow = ''
    })
  }

  processNewMessages() {
    if (!this.config.enabled) return
    this.addButtonsToExistingMessages()
    this.addMasterToggle()
  }

  private setupKeyboardShortcuts() {
    if (this.keyboardListenerAdded) return

    this.boundKeyDownHandler = this.handleKeyDown.bind(this)
    document.addEventListener('keydown', this.boundKeyDownHandler)
    this.keyboardListenerAdded = true
  }

  private removeKeyboardShortcuts() {
    if (!this.keyboardListenerAdded || !this.boundKeyDownHandler) return

    document.removeEventListener('keydown', this.boundKeyDownHandler)
    this.boundKeyDownHandler = null
    this.keyboardListenerAdded = false
  }

  private async handleKeyDown(event: KeyboardEvent) {
    if (!this.config.enabled) return

    // Do not intercept if user is typing in composer/input/editor
    const active = document.activeElement
    if (
      active &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.getAttribute('contenteditable') === 'true')
    ) {
      return
    }

    if (event.altKey && event.code === 'KeyC' && !event.shiftKey) {
      event.preventDefault()
      this.toggleClosestMessage()
      return
    }

    if (event.altKey && event.shiftKey && event.code === 'KeyC') {
      event.preventDefault()
      await this.toggleAll()
      return
    }
  }

  private toggleClosestMessage() {
    const activeElement = document.activeElement
    let targetMessage: HTMLElement | null = null

    if (activeElement) {
      targetMessage = activeElement.closest<HTMLElement>('.cg-collapse-container')
    }

    if (!targetMessage) {
      const allMessages = document.querySelectorAll<HTMLElement>('.cg-collapse-container')
      if (allMessages.length > 0) {
        targetMessage = allMessages[allMessages.length - 1]
      }
    }

    if (targetMessage && this.isValidMessage(targetMessage)) {
      const btn = targetMessage.querySelector<HTMLElement>('.cg-collapse-btn')
      if (btn) {
        this.toggleMessage(targetMessage, btn)
      }
    }
  }

  private setupAltClickListeners() {
    if (this.altClickListenerAdded || !this.config.altClickEnabled) return

    this.boundAltClickHandler = this.handleAltClick.bind(this)
    document.addEventListener('click', this.boundAltClickHandler, true)
    this.altClickListenerAdded = true
  }

  private removeAltClickListeners() {
    if (!this.altClickListenerAdded || !this.boundAltClickHandler) return

    document.removeEventListener('click', this.boundAltClickHandler, true)
    this.boundAltClickHandler = null
    this.altClickListenerAdded = false
  }

  private handleAltClick(event: MouseEvent) {
    if (!event.altKey || !this.config.altClickEnabled || !this.config.enabled) return

    const target = event.target as HTMLElement
    if (!target) return

    // Prevent collapsing when alt-clicking buttons, links, inputs, or code blocks controls
    if (target.closest('button, a, input, textarea, [contenteditable="true"]')) return

    const messageContainer = target.closest<HTMLElement>('.cg-collapse-container')
    if (messageContainer && this.isValidMessage(messageContainer)) {
      event.preventDefault()
      event.stopPropagation()

      const btn = messageContainer.querySelector<HTMLElement>('.cg-collapse-btn')
      if (btn) {
        this.toggleMessage(messageContainer, btn)
      }
    }
  }

  // Storage persistence
  private async saveMessageState(messageId: string, isCollapsed: boolean) {
    if (!this.config.persistMessageState || !messageId) return

    try {
      const states = await this.getMessageStates()
      states[messageId] = isCollapsed

      const entries = Object.entries(states)
      if (entries.length > 1000) {
        const recentStates = Object.fromEntries(entries.slice(-1000))
        await chrome.storage.local.set({ [this.storageKey]: recentStates })
      } else {
        await chrome.storage.local.set({ [this.storageKey]: states })
      }
    } catch (error) {
      console.error('CollapsibleMessages: Error saving message state:', error)
    }
  }

  private async getMessageStates(): Promise<Record<string, boolean>> {
    try {
      const result = await chrome.storage.local.get(this.storageKey)
      return result[this.storageKey] || {}
    } catch (error) {
      console.error('CollapsibleMessages: Error getting message states:', error)
      return {}
    }
  }

  private async getMessageState(messageId: string): Promise<boolean | null> {
    if (!this.config.persistMessageState || !messageId) return null

    try {
      const states = await this.getMessageStates()
      return states[messageId] ?? null
    } catch (error) {
      console.error('CollapsibleMessages: Error getting message state:', error)
      return null
    }
  }

  private async saveMessageStates(newStates: Record<string, boolean>) {
    if (!this.config.persistMessageState) return

    try {
      const existingStates = await this.getMessageStates()
      const updatedStates = { ...existingStates, ...newStates }

      const entries = Object.entries(updatedStates)
      if (entries.length > 1000) {
        const recentStates = Object.fromEntries(entries.slice(-1000))
        await chrome.storage.local.set({ [this.storageKey]: recentStates })
      } else {
        await chrome.storage.local.set({ [this.storageKey]: updatedStates })
      }
    } catch (error) {
      console.error('CollapsibleMessages: Error saving message states:', error)
    }
  }
}
