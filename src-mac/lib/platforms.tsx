import type { PlatformId } from "./types";

export interface PlatformMeta {
  id: PlatformId;
  name: string;
  short: string;
  color: string;
  hint: string;
  donation?: boolean;
}

export const PLATFORMS: PlatformMeta[] = [
  { id: "twitch", name: "Twitch", short: "TV", color: "#9146FF", hint: "username канала" },
  { id: "youtube", name: "YouTube Live", short: "YT", color: "#FF0033", hint: "@handle канала" },
  { id: "vkplay", name: "VK Видео Live", short: "VK", color: "#0077FF", hint: "username канала" },
  { id: "kick", name: "Kick", short: "KK", color: "#53FC18", hint: "username канала" },
  { id: "tiktok", name: "TikTok Live", short: "TT", color: "#FE2C55", hint: "@username" },
  { id: "rutube", name: "Rutube", short: "RT", color: "#8A94A6", hint: "ссылка на канал" },
  { id: "boosty", name: "Boosty", short: "BY", color: "#F15F2C", hint: "имя блога" },
  {
    id: "donationalerts",
    name: "DonationAlerts",
    short: "DA",
    color: "#F57D07",
    hint: "токен виджета алертов",
    donation: true,
  },
  {
    id: "donatepay",
    name: "DonatePay",
    short: "DP",
    color: "#44AB4F",
    hint: "API-ключ",
    donation: true,
  },
  {
    id: "memealerts",
    name: "MemeAlerts",
    short: "MA",
    color: "#A855F7",
    hint: "вход по аккаунту",
    donation: true,
  },
];

export const STREAM_PLATFORMS = PLATFORMS.filter((p) => !p.donation);
export const DONATE_PLATFORMS = PLATFORMS.filter((p) => p.donation);

export function platformMeta(id: PlatformId): PlatformMeta {
  return PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[0];
}

/* ---------- Брендовые иконки площадок (упрощённые логотипы) ---------- */

export function TwitchIcon({ size = 14, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M4.3 1 2 5v16h5v3h3l3-3h4l5-6V1H4.3Zm15.5 13-3 3h-4l-3 3v-3H6V3.5h13.8V14ZM16 6.5h1.8v5H16V6.5Zm-5 0h1.8v5H11V6.5Z" />
    </svg>
  );
}

export function YouTubeIcon({ size = 14, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M23 7.2s-.2-1.6-.9-2.3c-.9-1-1.9-1-2.4-1C16.4 3.6 12 3.6 12 3.6h0s-4.4 0-7.7.3c-.5.1-1.5.1-2.4 1-.7.7-.9 2.3-.9 2.3S.7 9.1.7 11v1.8c0 1.9.2 3.8.2 3.8s.2 1.6.9 2.3c.9 1 2 .9 2.6 1 .9.1 3.9.3 7.6.3s7.7-.3 7.7-.3c.5-.1 1.5-.1 2.4-1 .7-.7.9-2.3.9-2.3s.2-1.9.2-3.8V11c0-1.9-.2-3.8-.2-3.8Zm-13.3 6.5V8.2l6.1 2.8-6.1 2.7Z" />
    </svg>
  );
}

export function VkLiveIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <rect x="2" y="4" width="36" height="36" rx="11" fill="#0077FF" />
      <rect x="10" y="8" width="36" height="36" rx="11" fill="#FF2D55" />
      <text
        x="28"
        y="28.5"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#FFFFFF"
        fontFamily="Inter, Segoe UI, Arial, sans-serif"
        fontWeight="800"
        fontSize="15"
        letterSpacing="0.3"
      >
        LIVE
      </text>
    </svg>
  );
}

export function KickIcon({ size = 14, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M3 2h5v6h3V5h3V2h7v7h-3v3h-3v3h3v3h3v7h-7v-3h-3v-3H8v6H3V2Z" />
    </svg>
  );
}

export function TikTokIcon({ size = 14, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M16.6 2h3.1c.2 1.9 1.3 3.6 3.3 4.3v3.2c-1.2 0-2.4-.4-3.4-1v6.9c0 4.1-2.9 6.7-6.5 6.7-3.5 0-6.1-2.4-6.1-5.8 0-3.6 3-6 6.8-5.7v3.3c-.3-.1-.7-.2-1.1-.2-1.5 0-2.5 1-2.5 2.4 0 1.4 1.1 2.5 2.7 2.5 1.7 0 3-1.3 3-3.7V2Z" />
    </svg>
  );
}

export function RutubeIcon({ size = 14, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="none" stroke={color} strokeWidth="2.4" />
      <path d="M10 8.2v7.6L15.8 12 10 8.2Z" />
    </svg>
  );
}

export function BoostyIcon({ size = 14, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M13.2 2 4 13.5h5.4L8.6 22 20 10h-5.6L13.2 2Z" />
    </svg>
  );
}

export function CoinIcon({ size = 14, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M15.5 9.2c-.6-1-1.9-1.6-3.4-1.6-2 0-3.5 1-3.5 2.5 0 3.3 7.1 1.6 7.1 4.8 0 1.5-1.6 2.5-3.6 2.5-1.7 0-3-.7-3.6-1.9" strokeLinecap="round" />
    </svg>
  );
}

export function PlatformIcon({
  id,
  size = 14,
  color,
}: {
  id: PlatformId;
  size?: number;
  color?: string;
}) {
  const meta = platformMeta(id);
  const c = color ?? meta.color;
  switch (id) {
    case "twitch":
      return <TwitchIcon size={size} color={c} />;
    case "youtube":
      return <YouTubeIcon size={size} color={c} />;
    case "vkplay":
      return <VkLiveIcon size={size} />;
    case "kick":
      return <KickIcon size={size} color={c} />;
    case "tiktok":
      return <TikTokIcon size={size} color={c} />;
    case "rutube":
      return <RutubeIcon size={size} color={c} />;
    case "boosty":
      return <BoostyIcon size={size} color={c} />;
    default:
      return <CoinIcon size={size} color={c} />;
  }
}
