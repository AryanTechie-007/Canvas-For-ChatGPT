import type { ChatBackgroundEntry, RouteType } from "./types";

export interface ResolvedChatRoute {
  chatKey: string | null;
  routeType: RouteType;
  id: string | null;
  pathname: string;
}

const GENERIC_TITLES = new Set([
  "",
  "chatgpt",
  "new chat",
  "chats",
  "library",
  "explore gpts",
  "gpts"
]);

export function resolveChatKeyFromUrl(urlOrPath: string): ResolvedChatRoute {
  let pathname = "/";
  try {
    const parsed = new URL(urlOrPath, "https://chatgpt.com");
    pathname = parsed.pathname || "/";
  } catch {
    pathname = urlOrPath.split(/[?#]/)[0] || "/";
  }

  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  // Match /c/<id> and /g/<gpt-id>/c/<id>
  const convMatch = pathname.match(/\/c\/([^/?#]+)(?:\/.*)?$/);
  if (convMatch?.[1]) {
    const id = decodeURIComponent(convMatch[1]);
    return {
      chatKey: `c:${id}`,
      routeType: "chat",
      id,
      pathname
    };
  }

  const shareMatch = pathname.match(/^\/share\/([^/?#]+)(?:\/.*)?$/);
  if (shareMatch?.[1]) {
    const id = decodeURIComponent(shareMatch[1]);
    return {
      chatKey: `share:${id}`,
      routeType: "share",
      id,
      pathname
    };
  }

  const gptMatch = pathname.match(/^\/g\/([^/?#]+)(?:\/project)?\/?$/);
  if (gptMatch?.[1]) {
    const id = decodeURIComponent(gptMatch[1]);
    return {
      chatKey: `g:${id}`,
      routeType: "gpt",
      id,
      pathname
    };
  }

  return {
    chatKey: null,
    routeType: "default",
    id: null,
    pathname
  };
}

function cleanCandidateTitle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/\s+/g, " ")
    .replace(/^(?:ChatGPT\s*[-|–—]\s*)|(?:\s*[-|–—]\s*ChatGPT\s*$)/gi, "")
    .trim();

  if (!cleaned || GENERIC_TITLES.has(cleaned.toLowerCase())) {
    return null;
  }
  return cleaned;
}

export function extractChatTitleFromDom(
  doc: Document,
  chatKey: string | null
): string | null {
  if (!doc) return null;

  if (chatKey) {
    if (chatKey.startsWith("c:")) {
      const id = chatKey.slice(2);
      const links = Array.from(
        doc.querySelectorAll<HTMLAnchorElement>(
          `nav a[href*="/c/${id}"], aside a[href*="/c/${id}"], a[href="/c/${id}"]`
        )
      );
      for (const link of links) {
        const candidate = cleanCandidateTitle(
          link.getAttribute("aria-label") || link.textContent
        );
        if (candidate) return candidate;
      }
    } else if (chatKey.startsWith("g:")) {
      const id = chatKey.slice(2);
      const links = Array.from(
        doc.querySelectorAll<HTMLAnchorElement>(
          `nav a[href*="/g/${id}"], aside a[href*="/g/${id}"]`
        )
      );
      for (const link of links) {
        const candidate = cleanCandidateTitle(
          link.getAttribute("aria-label") || link.textContent
        );
        if (candidate) return candidate;
      }
    }

    const activeSelectors = [
      'nav a[aria-current="page"]',
      'aside a[aria-current="page"]',
      '[data-testid="conversation-title"]',
      '[data-testid="chat-title"]'
    ];
    for (const selector of activeSelectors) {
      const el = doc.querySelector(selector);
      const candidate = cleanCandidateTitle(el?.textContent);
      if (candidate) return candidate;
    }
  }

  return cleanCandidateTitle(doc.title);
}

export function formatChatLabel(
  chatKey: string,
  entry?: ChatBackgroundEntry | null
): string {
  const title = entry?.title?.trim();
  if (title) return title;
  if (chatKey.startsWith("c:")) return `Chat ${chatKey.slice(2, 10)}`;
  if (chatKey.startsWith("g:")) return `GPT ${chatKey.slice(2, 12)}`;
  if (chatKey.startsWith("share:")) return `Shared ${chatKey.slice(6, 14)}`;
  return chatKey;
}
