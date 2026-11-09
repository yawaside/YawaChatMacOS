import type { ChatMessage, MessageKind, PlatformId } from "./types";

const CHAT_PLATFORMS: PlatformId[] = ["twitch", "youtube", "vkplay", "kick", "tiktok", "rutube", "boosty"];

const AUTHORS: Array<{ name: string; color: string; badges: string[]; platform?: PlatformId }> = [
  { name: "neon_foxx", color: "#FF9F5A", badges: ["sub"] },
  { name: "КиберАня", color: "#64D2FF", badges: ["mod"] },
  { name: "xX_ghost_Xx", color: "#BF5AF2", badges: [] },
  { name: "dj_sova", color: "#7ED957", badges: ["vip"] },
  { name: "mrrr_kt", color: "#FFD60A", badges: ["sub"] },
  { name: "ПиксельныйКот", color: "#FF6482", badges: [] },
  { name: "strwrld", color: "#0A84FF", badges: ["sub", "vip"] },
  { name: "лютик_yt", color: "#FF453A", badges: [] },
  { name: "ForevaYoung", color: "#30D158", badges: ["sub"] },
  { name: "ТихийОхотник", color: "#AC8E68", badges: [] },
  { name: "luna.wav", color: "#E0AFFF", badges: ["mod"] },
  { name: "tehmachine", color: "#66D4CF", badges: [] },
  { name: "МурMUR", color: "#FF9F0A", badges: ["sub"] },
  { name: "kira_desu", color: "#F470FF", badges: [] },
  { name: "Zero_Cool", color: "#98989D", badges: ["vip"] },
];

const TEXTS = [
  "привет всем, кто зашёл на стрим!",
  "этот момент надо было видеть, клип уже сделал",
  "стример, а во сколько завтра эфир?",
  "звук немного тихий, добавь на пару децибел",
  "ахахах, это было эпично",
  "кто с какой площадки смотрит? я с твича",
  "наконец-то прошёл этот уровень, красавчик",
  "LULULUL",
  "погнали дальше, не тяни!",
  "смотрю с VK, качество огонь",
  "а уведомление о подписке сработало дважды, проверь",
  "как настроение? у меня пятница, всё супер",
  "ор artifact: залетел случайно и не жалею",
  "какой сегодня план по играм?",
  "ты видел чат на ютубе? там свой маленький хаос",
  "модеры, вы лучшие, спасибо за порядок",
  "PogChamp PogChamp",
  "трек в фоне шикарный, что играет?",
  "будь здоров! это было мощное чихание",
  "с тиктока залетел, у тебя тут уютно",
  "поймал свой любимый момент стрима",
  "через минуту начну молиться за дроп лута",
  "кто-нибудь, запишите тайминг!",
  "сколько уже идёт стрим? только подключился",
  "можешь повторить последнее, не расслышал",
  "чат, вы видели этот финт?!",
];

const DONATION_TEXTS = [
  "на новый микрофон, твой голос того стоит",
  "спасибо за вчерашний розыгрыш!",
  "просто поддержать, ты топ",
  "не знаю как ты это делаешь, но продолжай",
  "на пиццу после стрима",
];

const EVENTS: Array<{ text: string; platform: PlatformId }> = [
  { text: "подписался на канал", platform: "twitch" },
  { text: "одарил(а) 3 подписки", platform: "twitch" },
  { text: "устроил(а) рейд на 42 зрителя", platform: "twitch" },
  { text: "стал(а) спонсором канала", platform: "youtube" },
  { text: "подарил(а) «Розу» x12", platform: "tiktok" },
  { text: "стал(а) подписчиком Boosty", platform: "boosty" },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomMessage(kind?: MessageKind): Omit<ChatMessage, "id" | "createdAt"> {
  const roll = kind ?? (Math.random() < 0.14 ? "donation" : Math.random() < 0.1 ? "event" : "message");

  if (roll === "donation") {
    const platform = pick(["donationalerts", "donatepay", "memealerts"] as PlatformId[]);
    const author = pick(AUTHORS);
    const amount = pick([50, 100, 150, 200, 250, 300, 500, 777, 1000]);
    return {
      platform,
      author: Math.random() < 0.15 ? "Аноним" : author.name,
      color: author.color,
      text: pick(DONATION_TEXTS),
      kind: "donation",
      badges: [],
      amount,
      currency: "RUB",
    };
  }

  if (roll === "event") {
    const ev = pick(EVENTS);
    const author = pick(AUTHORS);
    return {
      platform: ev.platform,
      author: author.name,
      color: author.color,
      text: ev.text,
      kind: "event",
      badges: [],
      amount: null,
      currency: null,
    };
  }

  const author = pick(AUTHORS);
  return {
    platform: pick(CHAT_PLATFORMS),
    author: author.name,
    color: author.color,
    text: pick(TEXTS),
    kind: "message",
    badges: author.badges,
    amount: null,
    currency: null,
  };
}

let seedCounter = 0;

/** Детерминированная пачка сообщений для первичного наполнения БД. */
export function seedMessages(count: number): Array<Omit<ChatMessage, "id" | "createdAt"> & { createdAt: string }> {
  const out: Array<Omit<ChatMessage, "id" | "createdAt"> & { createdAt: string }> = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    seedCounter += 1;
    const msg = randomMessage(seedCounter % 9 === 0 ? "donation" : seedCounter % 7 === 0 ? "event" : "message");
    out.push({
      ...msg,
      createdAt: new Date(now - (count - i) * 42_000 - Math.floor(Math.random() * 20_000)).toISOString(),
    });
  }
  return out;
}

export const DEFAULT_CHANNELS = [
  { platform: "twitch" as PlatformId, name: "yawaside", live: true, viewers: 1284, enabled: true },
  { platform: "youtube" as PlatformId, name: "@yawaside", live: true, viewers: 642, enabled: true },
  { platform: "vkplay" as PlatformId, name: "yawaside", live: true, viewers: 311, enabled: true },
  { platform: "tiktok" as PlatformId, name: "@yawa.side", live: true, viewers: 96, enabled: true },
  { platform: "kick" as PlatformId, name: "yawaside", live: false, viewers: 0, enabled: true },
  { platform: "rutube" as PlatformId, name: "Yawa", live: false, viewers: 0, enabled: false },
  { platform: "boosty" as PlatformId, name: "yawaside", live: false, viewers: 0, enabled: false },
];
