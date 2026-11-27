const VIDEO_EXTENSION_RE = /\.(mp4|webm|ogg|mov)(?:$|[?#])/i;

export const ACCEPTED_MEDIA_INPUT =
  "image/*,video/mp4,video/webm,video/ogg,video/quicktime,.gif,.mp4,.webm,.ogg,.mov";

const ALLOWED_MEDIA_EXTENSIONS =
  /\.(png|jpe?g|webp|gif|svg|avif|bmp|ico|mp4|webm|ogg|mov)$/i;

export function clampNumber(
  value: number,
  min: number,
  max: number,
  fallback: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

export function isVideoUrl(url: string): boolean {
  const normalized = (url || "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith("data:video/")) return true;
  return VIDEO_EXTENSION_RE.test(normalized);
}

export function isValidBackdropUrl(rawUrl: string): boolean {
  const trimmed = (rawUrl || "").trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("https://") ||
    lower.startsWith("http://") ||
    lower.startsWith("data:image/") ||
    lower.startsWith("data:video/") ||
    lower.startsWith("chrome-extension://")
  ) {
    return true;
  }
  return false;
}

export function isAcceptedMediaFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  if (
    mime.startsWith("image/") ||
    mime === "video/mp4" ||
    mime === "video/webm" ||
    mime === "video/ogg" ||
    mime === "video/quicktime"
  ) {
    return true;
  }
  return ALLOWED_MEDIA_EXTENSIONS.test(file.name || "");
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        let dataUrl = reader.result;
        // Browsers sometimes label .mov uploads as application/octet-stream
        if (
          dataUrl.startsWith("data:application/octet-stream") &&
          /\.mov$/i.test(file.name)
        ) {
          dataUrl = dataUrl.replace(
            "data:application/octet-stream",
            "data:video/quicktime"
          );
        }
        resolve(dataUrl);
      } else {
        reject(new Error("Failed to read file as data URL"));
      }
    };
    reader.onerror = () => {
      reject(reader.error || new Error("Failed to read local media file"));
    };
    reader.readAsDataURL(file);
  });
}
