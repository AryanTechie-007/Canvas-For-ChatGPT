export interface CanvasConfig {
  enabled: boolean;
  backgroundImageUrl: string;
  mainImageOpacity: number;
  blurAmount: number;
  gradientOpacity: number;
  sidebarFrosting: number;
  savedBackgrounds: string[];
}

export type RuntimeMessage =
  | { type: "GET_CFG" }
  | {
      type: "SET_CFG_PARTIAL";
      payload?: Partial<CanvasConfig>;
      partial?: Partial<CanvasConfig>;
      patch?: Partial<CanvasConfig>;
      cfg?: Partial<CanvasConfig>;
    };

export interface GetConfigResponse {
  ok: true;
  cfg: CanvasConfig;
}
