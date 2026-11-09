export type PlatformId =
  | "twitch"
  | "youtube"
  | "vkplay"
  | "kick"
  | "tiktok"
  | "rutube"
  | "boosty"
  | "donationalerts"
  | "donatepay"
  | "memealerts";

export type MessageKind = "message" | "donation" | "event" | "system";

export interface ChatMessage {
  id: number;
  platform: PlatformId;
  author: string;
  color: string;
  text: string;
  kind: MessageKind;
  badges: string[];
  amount: number | null;
  currency: string | null;
  createdAt: string;
}

export interface Channel {
  id: number;
  platform: PlatformId;
  name: string;
  live: boolean;
  viewers: number;
  enabled: boolean;
}

export type SectionId =
  | "chat"
  | "channels"
  | "auth"
  | "bot"
  | "donations"
  | "voice"
  | "sounds"
  | "overlay"
  | "appearance"
  | "settings";

export type Density = "compact" | "normal" | "roomy";
export type AppearEffect = "none" | "fade" | "slide";
export type WindowStyle = "air" | "studio";

export interface Appearance {
  windowStyle: WindowStyle;
  /** стили по поверхностям — независимо друг от друга */
  feedStyle: string;
  feedTone?: string;
  widgetStyle: string;
  widgetTone?: string;
  overlayStyle: string;
  overlayTone?: string;
  /** 0 — размер по стилю */
  fontSize: number;
  density: Density;
  radius: number;
  effect: AppearEffect;
  onlyChat: boolean;
  chatFrame: boolean;
  /** лента: скрывать служебные события */
  hideEvents: boolean;
  /** лента: подсветка упоминаний канала */
  mentions: boolean;
  /** окно виджета OBS */
  widgetWin: boolean;
  widgetWinOpacity: number;
  widgetWinRadius: number;
  widgetWinBar: boolean;
  widgetTransparent: boolean;
  accent: string;
}
