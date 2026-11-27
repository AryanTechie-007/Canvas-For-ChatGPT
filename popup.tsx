import React, { useEffect, useMemo, useRef, useState } from "react";

import "./popup.css";
import {
  ACCEPTED_MEDIA_INPUT,
  isAcceptedMediaFile,
  isValidBackdropUrl,
  isVideoUrl,
  readFileAsDataUrl
} from "./lib/media";
import { PRESET_BACKDROPS } from "./lib/presets";
import { formatChatLabel, resolveChatKeyFromUrl } from "./lib/routing";
import {
  DEFAULT_CONFIG,
  loadConfig,
  mergeConfigPartial,
  resolveEffectiveVisuals,
  updateConfigPartial,
  watchConfig
} from "./lib/storage";
import type {
  CanvasConfig,
  ChatContext,
  GetChatContextResponse,
  GetConfigResponse
} from "./lib/types";

type ScopeMode = "chat" | "global";

function sendTabMessage<T>(
  tabId: number,
  message: Record<string, unknown>
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(response as T);
    });
  });
}

function queryActiveTab(): Promise<chrome.tabs.Tab | null> {
  return new Promise((resolve) => {
    if (!chrome.tabs?.query) {
      resolve(null);
      return;
    }
    const checkTabs = (selfTab?: chrome.tabs.Tab) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const current = tabs?.[0] ?? null;
        if (selfTab && current && current.id === selfTab.id) {
          // Opened directly as a tab (e.g., debugging or browser tests): target most recent ChatGPT tab
          chrome.tabs.query(
            { url: ["https://chatgpt.com/*", "https://chat.openai.com/*"] },
            (chatTabs) => {
              const sorted = [...(chatTabs || [])].sort(
                (a, b) =>
                  ((b as chrome.tabs.Tab & { lastAccessed?: number })
                    .lastAccessed ?? 0) -
                  ((a as chrome.tabs.Tab & { lastAccessed?: number })
                    .lastAccessed ?? 0)
              );
              resolve(sorted[0] ?? current);
            }
          );
          return;
        }
        resolve(current);
      });
    };

    if (chrome.tabs.getCurrent) {
      chrome.tabs.getCurrent((selfTab) => checkTabs(selfTab));
    } else {
      checkTabs(undefined);
    }
  });
}

function MediaPreview({
  url,
  className
}: {
  url: string;
  className: string;
}) {
  if (isVideoUrl(url)) {
    return (
      <video
        className={className}
        src={url}
        muted
        loop
        autoPlay
        playsInline
      />
    );
  }
  return <img className={className} src={url} alt="" />;
}

export default function IndexPopup() {
  const [cfg, setCfg] = useState<CanvasConfig>(DEFAULT_CONFIG);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [chatContext, setChatContext] = useState<ChatContext | null>(null);
  const [scope, setScope] = useState<ScopeMode>("global");
  const [customUrl, setCustomUrl] = useState("");
  const [statusMsg, setStatusMsg] = useState<{
    text: string;
    isError?: boolean;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingPartialRef = useRef<Partial<CanvasConfig> | null>(null);
  const isFlushingRef = useRef(false);
  const activeTabIdRef = useRef<number | null>(null);
  const lastFrostingRef = useRef<number>(DEFAULT_CONFIG.sidebarFrosting);
  const cfgRef = useRef<CanvasConfig>(DEFAULT_CONFIG);
  cfgRef.current = cfg;
  activeTabIdRef.current = activeTabId;

  useEffect(() => {
    let mounted = true;

    async function init() {
      const initialCfg = await loadConfig();
      if (!mounted) return;
      setCfg(initialCfg);

      const tab = await queryActiveTab();
      if (!mounted) return;

      if (tab?.id != null) {
        setActiveTabId(tab.id);
        activeTabIdRef.current = tab.id;
        try {
          const ctxRes = await sendTabMessage<GetChatContextResponse>(tab.id, {
            type: "GET_CHAT_CONTEXT"
          });
          const cfgRes = await sendTabMessage<GetConfigResponse>(tab.id, {
            type: "GET_CFG"
          });
          if (!mounted) return;

          if (cfgRes?.ok && cfgRes.cfg) {
            setCfg(cfgRes.cfg);
          }
          if (ctxRes?.ok) {
            const ctx: ChatContext = ctxRes.context ?? {
              url: ctxRes.url,
              pathname: ctxRes.pathname,
              chatKey: ctxRes.chatKey,
              title: ctxRes.title,
              routeType: ctxRes.routeType,
              theme: ctxRes.theme
            };
            setChatContext(ctx);
            setScope(ctx.chatKey ? "chat" : "global");
            return;
          }
        } catch {
          // Active tab may not be chatgpt.com or content script is not injected
        }
      }

      const url = tab?.url || "";
      const fallbackRoute = resolveChatKeyFromUrl(url);
      if (fallbackRoute.chatKey) {
        setChatContext({
          url,
          pathname: fallbackRoute.pathname,
          chatKey: fallbackRoute.chatKey,
          title:
            tab?.title
              ?.replace(
                /^(?:ChatGPT\s*[-|–—]\s*)|(?:\s*[-|–—]\s*ChatGPT\s*$)/gi,
                ""
              )
              .trim() || null,
          routeType: fallbackRoute.routeType,
          theme: "dark"
        });
        setScope("chat");
      } else {
        setChatContext(null);
        setScope("global");
      }
    }

    void init();

    const unwatch = watchConfig((nextCfg) => {
      if (mounted && !isFlushingRef.current && !pendingPartialRef.current) {
        setCfg(nextCfg);
      }
    });

    return () => {
      mounted = false;
      unwatch();
    };
  }, []);

  const currentChatKey = chatContext?.chatKey ?? null;
  const effectiveScope: ScopeMode =
    scope === "chat" && currentChatKey ? "chat" : "global";

  const activeVisuals = useMemo(() => {
    if (effectiveScope === "chat" && currentChatKey) {
      return resolveEffectiveVisuals(cfg, currentChatKey);
    }
    return {
      backgroundImageUrl: cfg.backgroundImageUrl,
      mainImageOpacity: cfg.mainImageOpacity,
      blurAmount: cfg.blurAmount,
      gradientOpacity: cfg.gradientOpacity,
      sidebarFrosting: cfg.sidebarFrosting,
      hasOverride: Boolean(
        currentChatKey && cfg.chatBackgrounds[currentChatKey]
      ),
      entry: null
    };
  }, [cfg, currentChatKey, effectiveScope]);

  if (activeVisuals.sidebarFrosting > 0) {
    lastFrostingRef.current = activeVisuals.sidebarFrosting;
  }

  const isSidebarClean = activeVisuals.sidebarFrosting <= 0;

  const currentChatHasOverride = Boolean(
    currentChatKey && cfg.chatBackgrounds[currentChatKey]
  );

  async function flushPendingPartials() {
    if (isFlushingRef.current) return;
    isFlushingRef.current = true;

    try {
      while (pendingPartialRef.current) {
        const partial = pendingPartialRef.current;
        pendingPartialRef.current = null;
        const tabId = activeTabIdRef.current;
        let saved: CanvasConfig | null = null;

        if (tabId != null) {
          try {
            const res = await sendTabMessage<GetConfigResponse>(tabId, {
              type: "SET_CFG_PARTIAL",
              payload: partial
            });
            if (res?.ok && res.cfg) {
              saved = res.cfg;
            }
          } catch {
            // Fall through to local storage write if content script isn't reachable
          }
        }

        if (!saved) {
          saved = await updateConfigPartial(partial);
        }

        if (!pendingPartialRef.current) {
          cfgRef.current = saved;
          setCfg(saved);
        }
      }
    } catch {
      // Keep popup responsive even if an individual flush fails
    } finally {
      isFlushingRef.current = false;
      if (pendingPartialRef.current) {
        void flushPendingPartials();
      }
    }
  }

  function commitPartial(partial: Partial<CanvasConfig>) {
    const optimistic = mergeConfigPartial(cfgRef.current, partial);
    cfgRef.current = optimistic;
    setCfg(optimistic);

    pendingPartialRef.current = pendingPartialRef.current
      ? { ...pendingPartialRef.current, ...partial }
      : partial;

    void flushPendingPartials();
  }

  function applyWallpaperToActiveScope(
    url: string,
    extraSavedUrl?: string
  ): void {
    const latest = cfgRef.current;
    const nextSaved = extraSavedUrl
      ? [
          extraSavedUrl,
          ...latest.savedBackgrounds.filter((item) => item !== extraSavedUrl)
        ]
      : latest.savedBackgrounds;

    if (effectiveScope === "chat" && currentChatKey) {
      const prevEntry = latest.chatBackgrounds[currentChatKey];
      const visuals = resolveEffectiveVisuals(latest, currentChatKey);
      commitPartial({
        savedBackgrounds: nextSaved,
        chatBackgrounds: {
          ...latest.chatBackgrounds,
          [currentChatKey]: {
            backgroundImageUrl: url,
            title: chatContext?.title ?? prevEntry?.title,
            mainImageOpacity:
              prevEntry?.mainImageOpacity ?? visuals.mainImageOpacity,
            blurAmount: prevEntry?.blurAmount ?? visuals.blurAmount,
            gradientOpacity:
              prevEntry?.gradientOpacity ?? visuals.gradientOpacity,
            sidebarFrosting:
              prevEntry?.sidebarFrosting ?? visuals.sidebarFrosting,
            updatedAt: Date.now()
          }
        }
      });
    } else {
      commitPartial({
        backgroundImageUrl: url,
        savedBackgrounds: nextSaved
      });
    }
  }

  function updateSliderInActiveScope(
    field:
      | "mainImageOpacity"
      | "blurAmount"
      | "gradientOpacity"
      | "sidebarFrosting",
    value: number
  ) {
    const latest = cfgRef.current;
    if (effectiveScope === "chat" && currentChatKey) {
      const prevEntry = latest.chatBackgrounds[currentChatKey];
      const visuals = resolveEffectiveVisuals(latest, currentChatKey);
      commitPartial({
        chatBackgrounds: {
          ...latest.chatBackgrounds,
          [currentChatKey]: {
            backgroundImageUrl:
              prevEntry?.backgroundImageUrl ?? visuals.backgroundImageUrl,
            title: chatContext?.title ?? prevEntry?.title,
            mainImageOpacity:
              field === "mainImageOpacity"
                ? value
                : prevEntry?.mainImageOpacity ?? visuals.mainImageOpacity,
            blurAmount:
              field === "blurAmount"
                ? value
                : prevEntry?.blurAmount ?? visuals.blurAmount,
            gradientOpacity:
              field === "gradientOpacity"
                ? value
                : prevEntry?.gradientOpacity ?? visuals.gradientOpacity,
            sidebarFrosting:
              field === "sidebarFrosting"
                ? value
                : prevEntry?.sidebarFrosting ?? visuals.sidebarFrosting,
            updatedAt: Date.now()
          }
        }
      });
    } else {
      commitPartial({ [field]: value } as Partial<CanvasConfig>);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!isAcceptedMediaFile(file)) {
      setStatusMsg({
        text: "Unsupported file. Choose an image, GIF, or MP4/WEBM/OGG/MOV video.",
        isError: true
      });
      return;
    }

    try {
      setStatusMsg({ text: `Importing ${file.name}...` });
      const dataUrl = await readFileAsDataUrl(file);
      applyWallpaperToActiveScope(dataUrl, dataUrl);
      setStatusMsg({ text: `Applied & saved "${file.name}".` });
    } catch (error) {
      setStatusMsg({
        text:
          error instanceof Error
            ? error.message
            : "Could not read selected media file.",
        isError: true
      });
    }
  }

  function handleApplyCustomUrl(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = customUrl.trim();
    if (!isValidBackdropUrl(trimmed)) {
      setStatusMsg({
        text: "Enter a valid http(s)://, data:, or chrome-extension:// media URL.",
        isError: true
      });
      return;
    }

    applyWallpaperToActiveScope(trimmed, trimmed);
    setCustomUrl("");
    setStatusMsg({ text: "Custom URL applied and saved." });
  }

  function handleDeleteSaved(urlToRemove: string) {
    const nextSaved = cfgRef.current.savedBackgrounds.filter(
      (item) => item !== urlToRemove
    );
    commitPartial({ savedBackgrounds: nextSaved });
    setStatusMsg({ text: "Removed from saved backgrounds." });
  }

  function handleRemoveChatOverride(chatKey: string) {
    const nextChatBackgrounds = { ...cfgRef.current.chatBackgrounds };
    delete nextChatBackgrounds[chatKey];
    commitPartial({ chatBackgrounds: nextChatBackgrounds });
  }

  function handleClearAllChats() {
    commitPartial({ chatBackgrounds: {} });
    setStatusMsg({ text: "Cleared all per-chat overrides." });
  }

  function handleOpenOptions() {
    if (chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
      return;
    }
    window.open(chrome.runtime.getURL("options.html"), "_blank");
  }

  const chatEntries = useMemo(() => {
    return Object.entries(cfg.chatBackgrounds).sort(
      ([, a], [, b]) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
    );
  }, [cfg.chatBackgrounds]);

  return (
    <div className="popup-shell">
      <header className="popup-header">
        <div className="brand-group">
          <div className="brand-dot" aria-hidden="true">
            C
          </div>
          <div className="brand-titles">
            <h1 className="brand-title">Canvas for ChatGPT</h1>
            <span className="brand-subtitle">
              {cfg.enabled ? "Active on chatgpt.com" : "Paused"}
            </span>
          </div>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="icon-link-btn"
            data-testid="options-link"
            onClick={handleOpenOptions}
            title="Open help & documentation">
            Help
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={cfg.enabled}
            aria-label={
              cfg.enabled
                ? "Disable Canvas for ChatGPT"
                : "Enable Canvas for ChatGPT"
            }
            data-testid="enable-toggle"
            className="switch-btn"
            onClick={() => commitPartial({ enabled: !cfg.enabled })}>
            <span className="switch-thumb" />
          </button>
        </div>
      </header>

      <div className="scope-tabs" role="tablist" aria-label="Wallpaper scope">
        <button
          type="button"
          role="tab"
          aria-selected={effectiveScope === "chat"}
          data-testid="scope-tab-chat"
          className={`scope-tab ${effectiveScope === "chat" ? "active" : ""}`}
          disabled={!currentChatKey}
          onClick={() => setScope("chat")}>
          This Chat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={effectiveScope === "global"}
          data-testid="scope-tab-global"
          className={`scope-tab ${effectiveScope === "global" ? "active" : ""}`}
          onClick={() => setScope("global")}>
          Global Default
        </button>
      </div>

      <div className="context-banner" data-testid="context-banner">
        <span className="context-label">
          {currentChatKey ? (
            <>
              Target:{" "}
              <strong>{chatContext?.title || currentChatKey}</strong>
            </>
          ) : (
            "Editing Global Default (open a ChatGPT chat to customize per-chat)"
          )}
        </span>
        <span
          className={`context-pill ${
            effectiveScope === "chat" && currentChatHasOverride ? "custom" : ""
          }`}>
          {effectiveScope === "chat"
            ? currentChatHasOverride
              ? "Custom Chat"
              : "Using Default"
            : "Global"}
        </span>
      </div>

      <section className="panel-section">
        <div className="section-header">
          <h2 className="section-title">Backdrop Picker</h2>
          <span className="section-hint">
            {effectiveScope === "chat" ? "Applies to this chat" : "Global fallback"}
          </span>
        </div>

        <div className="preset-grid">
          {PRESET_BACKDROPS.map((preset) => {
            const isSelected = activeVisuals.backgroundImageUrl === preset.url;
            return (
              <button
                key={preset.id}
                type="button"
                data-testid={`preset-${preset.id}`}
                className={`preset-card ${isSelected ? "selected" : ""}`}
                onClick={() => applyWallpaperToActiveScope(preset.url)}>
                <img
                  className="preset-thumb"
                  src={preset.url}
                  alt={preset.name}
                />
                <div className="preset-meta">
                  <span>{preset.name}</span>
                  {preset.kind === "gif" && (
                    <span className="badge-gif">GIF</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="upload-row">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_MEDIA_INPUT}
            data-testid="upload-media-input"
            style={{ display: "none" }}
            onChange={handleFileUpload}
          />
          <button
            type="button"
            className="btn btn-full"
            data-testid="upload-media-btn"
            onClick={() => fileInputRef.current?.click()}>
            Upload Local Media (Image, GIF, MP4/WEBM/OGG/MOV)
          </button>
        </div>

        <form className="url-form" onSubmit={handleApplyCustomUrl}>
          <input
            type="text"
            className="url-input"
            data-testid="custom-url-input"
            placeholder="Custom Web URL (image, GIF, or video)..."
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary"
            data-testid="custom-url-apply">
            Apply
          </button>
        </form>

        {statusMsg && (
          <div
            className={`status-msg ${statusMsg.isError ? "error" : ""}`}
            data-testid="status-message">
            {statusMsg.text}
          </div>
        )}

        {cfg.savedBackgrounds.length > 0 && (
          <>
            <div className="section-header" style={{ marginTop: 4 }}>
              <span className="section-title">Saved Backgrounds</span>
              <span className="section-hint">
                {cfg.savedBackgrounds.length} saved
              </span>
            </div>
            <div className="saved-grid" data-testid="saved-backgrounds-list">
              {cfg.savedBackgrounds.map((url, idx) => {
                const isSelected = activeVisuals.backgroundImageUrl === url;
                return (
                  <div
                    key={url}
                    className={`saved-item ${isSelected ? "selected" : ""}`}
                    data-testid={`saved-item-${idx}`}>
                    <button
                      type="button"
                      className="saved-apply-btn"
                      title="Apply saved background"
                      onClick={() => applyWallpaperToActiveScope(url)}>
                      <MediaPreview url={url} className="saved-media" />
                    </button>
                    <button
                      type="button"
                      className="saved-delete-btn"
                      data-testid={`saved-delete-${idx}`}
                      aria-label="Delete saved background"
                      title="Delete saved background"
                      onClick={() => handleDeleteSaved(url)}>
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="panel-section">
        <div className="section-header">
          <h2 className="section-title">Visual Controls</h2>
          <span className="section-hint">Real-time</span>
        </div>

        <label className="slider-row">
          <div className="slider-meta">
            <span>Image Opacity</span>
            <span className="slider-value">
              {activeVisuals.mainImageOpacity.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            className="range-input"
            data-testid="slider-opacity"
            min={0}
            max={1}
            step={0.01}
            value={activeVisuals.mainImageOpacity}
            onChange={(e) =>
              updateSliderInActiveScope(
                "mainImageOpacity",
                parseFloat(e.target.value)
              )
            }
          />
        </label>

        <label className="slider-row">
          <div className="slider-meta">
            <span>Image Blur</span>
            <span className="slider-value">{activeVisuals.blurAmount}px</span>
          </div>
          <input
            type="range"
            className="range-input"
            data-testid="slider-blur"
            min={0}
            max={100}
            step={1}
            value={activeVisuals.blurAmount}
            onChange={(e) =>
              updateSliderInActiveScope("blurAmount", parseInt(e.target.value, 10))
            }
          />
        </label>

        <label className="slider-row">
          <div className="slider-meta">
            <span>Gradient Opacity</span>
            <span className="slider-value">
              {activeVisuals.gradientOpacity.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            className="range-input"
            data-testid="slider-gradient"
            min={0}
            max={1}
            step={0.01}
            value={activeVisuals.gradientOpacity}
            onChange={(e) =>
              updateSliderInActiveScope(
                "gradientOpacity",
                parseFloat(e.target.value)
              )
            }
          />
        </label>

        <div className="sidebar-control-group">
          <div className="slider-meta">
            <span>Sidebar Style</span>
            <div className="sidebar-mode-pills" role="group" aria-label="Sidebar style">
              <button
                type="button"
                data-testid="sidebar-mode-clean"
                className={`sidebar-mode-btn ${isSidebarClean ? "active" : ""}`}
                onClick={() => updateSliderInActiveScope("sidebarFrosting", 0)}>
                Clean
              </button>
              <button
                type="button"
                data-testid="sidebar-mode-frosted"
                className={`sidebar-mode-btn ${!isSidebarClean ? "active" : ""}`}
                onClick={() =>
                  updateSliderInActiveScope(
                    "sidebarFrosting",
                    lastFrostingRef.current > 0
                      ? lastFrostingRef.current
                      : DEFAULT_CONFIG.sidebarFrosting
                  )
                }>
                Frosted
              </button>
            </div>
          </div>

          <label className="slider-row">
            <div className="slider-meta">
              <span>Sidebar Frosting</span>
              <span
                className="slider-value"
                data-testid="sidebar-frosting-value">
                {isSidebarClean
                  ? "Clean (0%)"
                  : `${activeVisuals.sidebarFrosting}%`}
              </span>
            </div>
            <input
              type="range"
              className="range-input"
              data-testid="slider-sidebar-frosting"
              min={0}
              max={100}
              step={1}
              value={activeVisuals.sidebarFrosting}
              onChange={(e) =>
                updateSliderInActiveScope(
                  "sidebarFrosting",
                  parseInt(e.target.value, 10)
                )
              }
            />
          </label>
        </div>
      </section>

      <section className="panel-section">
        <div className="section-header">
          <h2 className="section-title">Per-Chat Wallpapers</h2>
          <span className="section-hint">{chatEntries.length} custom</span>
        </div>

        <div className="manager-actions">
          <button
            type="button"
            className="btn"
            style={{ flex: 1 }}
            data-testid="reset-this-chat-btn"
            disabled={!currentChatKey || !currentChatHasOverride}
            onClick={() => {
              if (currentChatKey) {
                handleRemoveChatOverride(currentChatKey);
              }
            }}>
            Reset This Chat to Default
          </button>
          <button
            type="button"
            className="btn btn-danger"
            data-testid="clear-all-chats-btn"
            disabled={chatEntries.length === 0}
            onClick={handleClearAllChats}>
            Clear All
          </button>
        </div>

        {chatEntries.length === 0 ? (
          <p className="empty-note">
            No custom per-chat wallpapers yet. Select a backdrop while in{" "}
            <strong>This Chat</strong> mode to pin one.
          </p>
        ) : (
          <div className="chat-list" data-testid="per-chat-list">
            {chatEntries.map(([key, entry]) => {
              const isCurrent = key === currentChatKey;
              return (
                <div
                  key={key}
                  className={`chat-row ${isCurrent ? "current" : ""}`}
                  data-testid={`chat-override-${key}`}>
                  <MediaPreview
                    url={entry.backgroundImageUrl}
                    className="chat-thumb"
                  />
                  <div className="chat-info">
                    <span className="chat-title">
                      {formatChatLabel(key, entry)}
                    </span>
                    <span className="chat-key">{key}</span>
                  </div>
                  <button
                    type="button"
                    className="chat-remove-btn"
                    data-testid={`remove-chat-${key}`}
                    aria-label={`Remove custom wallpaper for ${formatChatLabel(
                      key,
                      entry
                    )}`}
                    title="Reset chat to Global Default"
                    onClick={() => handleRemoveChatOverride(key)}>
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
