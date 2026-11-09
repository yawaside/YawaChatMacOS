/**
 * Данные для демонстрации переработанного интерфейса.
 * Демо живёт отдельной страницей (proto.html) и не использует мост:
 * задача — показать вид и раскладку, а не рабочие функции.
 */

export type DemoPlatform = "twitch" | "vkplay" | "youtube" | "kick";

export interface DemoMessage {
  id: number;
  platform: DemoPlatform;
  author: string;
  text: string;
  time: string;
  color: string;
  kind?: "chat" | "donate" | "sub" | "reward";
  amount?: string;
}

export const PLATFORM_META: Record<DemoPlatform, { name: string; short: string; color: string }> = {
  twitch: { name: "Twitch", short: "TV", color: "#a970ff" },
  vkplay: { name: "VK Видео", short: "VK", color: "#5ba4ff" },
  youtube: { name: "YouTube", short: "YT", color: "#ff5e5e" },
  kick: { name: "Kick", short: "KK", color: "#6ee7a0" },
};

export const CHANNELS = [
  { platform: "twitch" as const, name: "nekto_san", viewers: 1240, live: true },
  { platform: "vkplay" as const, name: "kra1n_38", viewers: 486, live: true },
  { platform: "youtube" as const, name: "wesna_life", viewers: 312, live: true },
  { platform: "kick" as const, name: "gg_wp_ez", viewers: 128, live: true },
  { platform: "twitch" as const, name: "lazy_panda", viewers: 0, live: false },
];

export const INITIAL_MESSAGES: DemoMessage[] = [
  {
    id: 1,
    platform: "twitch",
    author: "nekto_san",
    text: "привет всем, погнали сегодня на легендарку",
    time: "21:04",
    color: "#a970ff",
  },
  {
    id: 2,
    platform: "vkplay",
    author: "kra1n_38",
    text: "звук норм слышно? проверял микрофон",
    time: "21:04",
    color: "#5ba4ff",
  },
  {
    id: 3,
    platform: "youtube",
    author: "wesna_life",
    text: "красиво затащил в прошлом раунде",
    time: "21:05",
    color: "#ff5e5e",
  },
  {
    id: 4,
    platform: "twitch",
    author: "kot1k_tv",
    text: "на новый микрофон",
    time: "21:05",
    color: "#f5b45c",
    kind: "donate",
    amount: "500 ₽",
  },
  {
    id: 5,
    platform: "kick",
    author: "gg_wp_ez",
    text: "изи катка",
    time: "21:06",
    color: "#6ee7a0",
  },
  {
    id: 6,
    platform: "vkplay",
    author: "lazy_panda",
    text: "сменил музыку, спасибо!",
    time: "21:06",
    color: "#7c5cff",
    kind: "reward",
    amount: "1 000 б.",
  },
  {
    id: 7,
    platform: "twitch",
    author: "new_sub",
    text: "оформил подписку на 3 месяца",
    time: "21:07",
    color: "#8fe388",
    kind: "sub",
  },
];

/** Сообщения, которые «приходят» в демо, чтобы было видно движение ленты. */
export const INCOMING: Omit<DemoMessage, "id" | "time">[] = [
  { platform: "twitch", author: "momento_mori", text: "какой сетап на графике?", color: "#a970ff" },
  { platform: "vkplay", author: "kirill_tt", text: "передай привет из Ярославля", color: "#5ba4ff" },
  { platform: "youtube", author: "den4ik", text: "залетел на стрим впервые", color: "#ff5e5e" },
  { platform: "kick", author: "s1mple_way", text: "играй на б сайт плиз", color: "#6ee7a0" },
  {
    platform: "twitch",
    author: "kot1k_tv",
    text: "на кофе стримеру",
    color: "#f5b45c",
    kind: "donate",
    amount: "150 ₽",
  },
  {
    platform: "vkplay",
    author: "lazy_panda",
    text: "врубил саундтрек",
    color: "#7c5cff",
    kind: "reward",
    amount: "500 б.",
  },
];

export const REWARDS = [
  { title: "Сменить музыку", cost: 500, platform: "vkplay" as const },
  { title: "Гифка на экран", cost: 300, platform: "twitch" as const },
  { title: "TTS-сообщение", cost: 1000, platform: "twitch" as const },
];

export const STATS = {
  viewers: 2166,
  peak: 3120,
  donations: "4 250 ₽",
  subs: 18,
};
