import { Storage } from "@plasmohq/storage";

import { clampNumber, isValidBackdropUrl } from "./media";
import { DEFAULT_PRESET_URL } from "./presets";
import type {
  CanvasConfig,
  ChatBackgroundEntry,
  EffectiveVisuals
} from "./types";

// Preserve existing storage key so upgrades from v1.x/v2.x retain saved backgrounds and per-chat wallpapers
export const CONFIG_STORAGE_KEY = "chatgpt-custom-bg:cfg";

export const DEFAULT_CONFIG: CanvasConfig = {
  enabled: true,
  backgroundImageUrl: DEFAULT_PRESET_URL,
  mainImageOpacity: 0.72,
  blurAmount: 0,
  gradientOpacity: 0.65,
  savedBackgrounds: [],
  chatBackgrounds: {}
};

const plasmoLocalStorage = new Storage({ area: "local" });

function tryParseJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}

function sanitizeChatEntry(
  rawEntry: unknown,
  fallbackUrl: string
): ChatBackgroundEntry | null {
  if (!rawEntry || typeof rawEntry !== "object") return null;
  const obj = rawEntry as Record<string, unknown>;
  const backgroundImageUrl =
    typeof obj.backgroundImageUrl === "string" &&
    isValidBackdropUrl(obj.backgroundImageUrl)
      ? obj.backgroundImageUrl.trim()
      : fallbackUrl;

  const entry: ChatBackgroundEntry = { backgroundImageUrl };
  if (typeof obj.title === "string" && obj.title.trim()) {
    entry.title = obj.title.trim();
  }
  if (typeof obj.mainImageOpacity === "number") {
    entry.mainImageOpacity = clampNumber(
      obj.mainImageOpacity,
      0,
      1,
      DEFAULT_CONFIG.mainImageOpacity
    );
  }
  if (typeof obj.blurAmount === "number") {
    entry.blurAmount = clampNumber(
      obj.blurAmount,
      0,
      100,
      DEFAULT_CONFIG.blurAmount
    );
  }
  if (typeof obj.gradientOpacity === "number") {
    entry.gradientOpacity = clampNumber(
      obj.gradientOpacity,
      0,
      1,
      DEFAULT_CONFIG.gradientOpacity
    );
  }
  if (typeof obj.updatedAt === "number" && Number.isFinite(obj.updatedAt)) {
    entry.updatedAt = obj.updatedAt;
  }
  return entry;
}

export function normalizeConfig(raw: unknown): CanvasConfig {
  const parsed = tryParseJson(raw);
  if (!parsed || typeof parsed !== "object") {
    return {
      ...DEFAULT_CONFIG,
      savedBackgrounds: [...DEFAULT_CONFIG.savedBackgrounds],
      chatBackgrounds: {}
    };
  }

  const obj = parsed as Record<string, unknown>;
  const backgroundImageUrl =
    typeof obj.backgroundImageUrl === "string" &&
    isValidBackdropUrl(obj.backgroundImageUrl)
      ? obj.backgroundImageUrl.trim()
      : DEFAULT_CONFIG.backgroundImageUrl;

  const savedSet = new Set<string>();
  if (Array.isArray(obj.savedBackgrounds)) {
    for (const item of obj.savedBackgrounds) {
      if (typeof item === "string" && isValidBackdropUrl(item)) {
        savedSet.add(item.trim());
      }
    }
  }

  const chatBackgrounds: Record<string, ChatBackgroundEntry> = {};
  if (obj.chatBackgrounds && typeof obj.chatBackgrounds === "object") {
    for (const [key, entryRaw] of Object.entries(
      obj.chatBackgrounds as Record<string, unknown>
    )) {
      if (!key) continue;
      const cleanEntry = sanitizeChatEntry(entryRaw, backgroundImageUrl);
      if (cleanEntry) {
        chatBackgrounds[key] = cleanEntry;
      }
    }
  }

  return {
    enabled:
      typeof obj.enabled === "boolean" ? obj.enabled : DEFAULT_CONFIG.enabled,
    backgroundImageUrl,
    mainImageOpacity: clampNumber(
      Number(obj.mainImageOpacity),
      0,
      1,
      DEFAULT_CONFIG.mainImageOpacity
    ),
    blurAmount: clampNumber(
      Number(obj.blurAmount),
      0,
      100,
      DEFAULT_CONFIG.blurAmount
    ),
    gradientOpacity: clampNumber(
      Number(obj.gradientOpacity),
      0,
      1,
      DEFAULT_CONFIG.gradientOpacity
    ),
    savedBackgrounds: Array.from(savedSet),
    chatBackgrounds
  };
}

function chromeStorageLocalGet(key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const localArea = globalThis.chrome?.storage?.local;
    if (!localArea) {
      reject(new Error("chrome.storage.local is unavailable"));
      return;
    }
    localArea.get([key], (items) => {
      const err = globalThis.chrome?.runtime?.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(items?.[key]);
    });
  });
}

function chromeStorageLocalSet(key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const localArea = globalThis.chrome?.storage?.local;
    if (!localArea) {
      reject(new Error("chrome.storage.local is unavailable"));
      return;
    }
    localArea.set({ [key]: value }, () => {
      const err = globalThis.chrome?.runtime?.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve();
    });
  });
}

export async function loadConfig(): Promise<CanvasConfig> {
  try {
    const value = await plasmoLocalStorage.get<unknown>(CONFIG_STORAGE_KEY);
    if (value !== undefined) {
      return normalizeConfig(value);
    }
  } catch {
    // Fall back to chrome.storage.local directly when @plasmohq/storage fails
  }

  try {
    const raw = await chromeStorageLocalGet(CONFIG_STORAGE_KEY);
    return normalizeConfig(raw);
  } catch {
    return normalizeConfig(undefined);
  }
}

export async function saveConfig(next: CanvasConfig): Promise<CanvasConfig> {
  const normalized = normalizeConfig(next);
  try {
    await plasmoLocalStorage.set(CONFIG_STORAGE_KEY, normalized);
    return normalized;
  } catch {
    await chromeStorageLocalSet(CONFIG_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }
}

export function mergeConfigPartial(
  current: CanvasConfig,
  partial: Partial<CanvasConfig>
): CanvasConfig {
  return normalizeConfig({
    ...current,
    ...partial,
    savedBackgrounds:
      partial.savedBackgrounds !== undefined
        ? partial.savedBackgrounds
        : current.savedBackgrounds,
    chatBackgrounds:
      partial.chatBackgrounds !== undefined
        ? partial.chatBackgrounds
        : current.chatBackgrounds
  });
}

export async function updateConfigPartial(
  partial: Partial<CanvasConfig>
): Promise<CanvasConfig> {
  const current = await loadConfig();
  const merged = mergeConfigPartial(current, partial);
  return saveConfig(merged);
}

export function resolveEffectiveVisuals(
  cfg: CanvasConfig,
  chatKey: string | null
): EffectiveVisuals {
  const entry = chatKey ? cfg.chatBackgrounds[chatKey] ?? null : null;
  if (!entry) {
    return {
      backgroundImageUrl: cfg.backgroundImageUrl,
      mainImageOpacity: cfg.mainImageOpacity,
      blurAmount: cfg.blurAmount,
      gradientOpacity: cfg.gradientOpacity,
      hasOverride: false,
      entry: null
    };
  }

  return {
    backgroundImageUrl: entry.backgroundImageUrl || cfg.backgroundImageUrl,
    mainImageOpacity:
      typeof entry.mainImageOpacity === "number"
        ? clampNumber(entry.mainImageOpacity, 0, 1, cfg.mainImageOpacity)
        : cfg.mainImageOpacity,
    blurAmount:
      typeof entry.blurAmount === "number"
        ? clampNumber(entry.blurAmount, 0, 100, cfg.blurAmount)
        : cfg.blurAmount,
    gradientOpacity:
      typeof entry.gradientOpacity === "number"
        ? clampNumber(entry.gradientOpacity, 0, 1, cfg.gradientOpacity)
        : cfg.gradientOpacity,
    hasOverride: true,
    entry
  };
}

export function watchConfig(onChange: (cfg: CanvasConfig) => void): () => void {
  let active = true;
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ) => {
    if (!active || areaName !== "local") return;
    if (!(CONFIG_STORAGE_KEY in changes)) return;
    onChange(normalizeConfig(changes[CONFIG_STORAGE_KEY]?.newValue));
  };

  try {
    globalThis.chrome?.storage?.onChanged?.addListener(listener);
  } catch {
    // Ignore in non-extension contexts
  }

  return () => {
    active = false;
    try {
      globalThis.chrome?.storage?.onChanged?.removeListener(listener);
    } catch {
      // Ignore cleanup errors
    }
  };
}
