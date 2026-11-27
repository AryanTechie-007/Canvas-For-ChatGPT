import { Storage } from "@plasmohq/storage";

import { clampNumber, isValidBackdropUrl } from "./media";
import { DEFAULT_PRESET_URL } from "./presets";
import type { CanvasConfig } from "./types";

// Preserve existing storage key so upgrades retain saved backgrounds and visual settings
export const CONFIG_STORAGE_KEY = "chatgpt-custom-bg:cfg";

export const DEFAULT_CONFIG: CanvasConfig = {
  enabled: true,
  backgroundImageUrl: DEFAULT_PRESET_URL,
  mainImageOpacity: 0.72,
  blurAmount: 0,
  gradientOpacity: 0.65,
  sidebarFrosting: 45,
  savedBackgrounds: []
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

export function normalizeConfig(raw: unknown): CanvasConfig {
  const parsed = tryParseJson(raw);
  if (!parsed || typeof parsed !== "object") {
    return {
      ...DEFAULT_CONFIG,
      savedBackgrounds: [...DEFAULT_CONFIG.savedBackgrounds]
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
    sidebarFrosting: clampNumber(
      Number(obj.sidebarFrosting),
      0,
      100,
      DEFAULT_CONFIG.sidebarFrosting
    ),
    savedBackgrounds: Array.from(savedSet)
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
        : current.savedBackgrounds
  });
}

export async function updateConfigPartial(
  partial: Partial<CanvasConfig>
): Promise<CanvasConfig> {
  const current = await loadConfig();
  const merged = mergeConfigPartial(current, partial);
  return saveConfig(merged);
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
