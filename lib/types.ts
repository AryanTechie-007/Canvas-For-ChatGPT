export interface ChatBackgroundEntry {
  backgroundImageUrl: string;
  title?: string;
  mainImageOpacity?: number;
  blurAmount?: number;
  gradientOpacity?: number;
  sidebarFrosting?: number;
  updatedAt?: number;
}

export interface CanvasConfig {
  enabled: boolean;
  backgroundImageUrl: string;
  mainImageOpacity: number;
  blurAmount: number;
  gradientOpacity: number;
  sidebarFrosting: number;
  savedBackgrounds: string[];
  chatBackgrounds: Record<string, ChatBackgroundEntry>;
}

export type RouteType = "chat" | "gpt" | "share" | "default";

export interface ChatContext {
  url: string;
  pathname: string;
  chatKey: string | null;
  title: string | null;
  routeType: RouteType;
  theme: "dark" | "light";
}

export interface EffectiveVisuals {
  backgroundImageUrl: string;
  mainImageOpacity: number;
  blurAmount: number;
  gradientOpacity: number;
  sidebarFrosting: number;
  hasOverride: boolean;
  entry: ChatBackgroundEntry | null;
}

export type RuntimeMessage =
  | { type: "GET_CHAT_CONTEXT" }
  | { type: "GET_CFG" }
  | {
      type: "SET_CFG_PARTIAL";
      payload?: Partial<CanvasConfig>;
      partial?: Partial<CanvasConfig>;
      patch?: Partial<CanvasConfig>;
      cfg?: Partial<CanvasConfig>;
    };

export interface GetChatContextResponse extends ChatContext {
  ok: true;
  context: ChatContext;
}

export interface GetConfigResponse {
  ok: true;
  cfg: CanvasConfig;
}
