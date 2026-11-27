import auroraGifDataUrl from "data-base64:../assets/presets/aurora.gif";
import forestWebpDataUrl from "data-base64:../assets/presets/forest.webp";
import mountainWebpDataUrl from "data-base64:../assets/presets/mountain.webp";
import spaceWebpDataUrl from "data-base64:../assets/presets/space.webp";

export interface PresetBackdrop {
  id: string;
  name: string;
  kind: "image" | "gif";
  url: string;
}

function normalizeParcelDataUrl(raw: string): string {
  const commaIndex = raw.indexOf(",");
  if (commaIndex === -1) return raw;
  const prefix = raw.slice(0, commaIndex + 1);
  const encodedBody = raw.slice(commaIndex + 1);
  try {
    return prefix + decodeURIComponent(encodedBody);
  } catch {
    return raw;
  }
}

export const PRESET_BACKDROPS: PresetBackdrop[] = [
  {
    id: "mountain",
    name: "Twilight Peaks",
    kind: "image",
    url: normalizeParcelDataUrl(mountainWebpDataUrl)
  },
  {
    id: "space",
    name: "Cosmic Nebula",
    kind: "image",
    url: normalizeParcelDataUrl(spaceWebpDataUrl)
  },
  {
    id: "forest",
    name: "Misty Pines",
    kind: "image",
    url: normalizeParcelDataUrl(forestWebpDataUrl)
  },
  {
    id: "aurora",
    name: "Northern Aurora (GIF)",
    kind: "gif",
    url: normalizeParcelDataUrl(auroraGifDataUrl)
  }
];

export const DEFAULT_PRESET_URL = PRESET_BACKDROPS[0].url;
