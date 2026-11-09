/**
 * Модуль фильтрации чата YawaChat v2.1.8
 * Интерактивные блоки площадок, банворды Twitch, блок «Троллинг» и автомодерация.
 */

export interface FilterBlock {
  id: string;
  name: string;
  desc: string;
  category: "twitch" | "trolling" | "platform" | "common";
  enabled: boolean;
  words: string[];
  customWords: string[];
  disabledWords?: string[];
  autoDeleteOnTwitch?: boolean;
}

/**
 * Запрещённые слова и фразы согласно официальной политике Twitch
 * (Hateful Conduct and Harassment Policy, дискриминация, эйблизм, расизм, гомофобия).
 */
export const TWITCH_POLICY_BANWORDS: string[] = [
  // Гомофобные и трансфобные оскорбления
  "пидор", "пидорас", "пидарас", "пидрила", "пидорок", "педик", "гомик", "петух",
  "faggot", "fag", "трансуха", "shemale", "tranny",
  // Расистские, ксенофобные и националистические оскорбления
  "нигер", "ниггер", "нига", "нигга", "нага", "nigger", "nigga", "neger",
  "чурка", "хач", "хачик", "жид", "жидяра", "хохол", "москаль", "узкоглазый",
  "черномазый", "крэкер", "kike", "chink", "coon",
  // Эйблистские оскорбления (оскорбления по состоянию здоровья/инвалидности)
  "даун", "дауненок", "даунич", "аутист", "аутизм", "ретард", "retard",
  "дебил", "кретин", "олигофрен", "шизофреник", "шизик", "калека", "дцп",
  // Харассмент, уничижительные ярлыки сексуального контекста
  "куколд", "cuckold", "симп", "simp", "инцел", "incel", "девственник", "virgin", "cunt",
  // Призывы к причинению себе вреда и угрозы
  "убейся", "вскройся", "суициднись", "умри от рака", "kys"
];

/**
 * Слова и фразы блока «Троллинг» — стримерские раздражители,
 * провокации, байты на тильт и спам.
 */
export const TROLLING_TRIGGER_WORDS: string[] = [
  "собака", "сабака", "@", "пёс", "пес", "псина", "шавка",
  "0iq", "0 iq", "нолик", "бот", "ботяра", "рачина", "рачелла", "рак",
  "бездарь", "бездарность", "криворукий", "руки из жопы",
  "скучно", "душный", "духота", "дропни игру", "удали игру", "удали", "закрой стрим",
  "ливни", "ливни с позором", "слился", "сливной", "помойка", "позорище",
  "кринж", "кринжатина", "не стримь", "иди работай", "завод ждет",
  "бездарный стример", "включи нормальную игру", "играть не умеешь", "днище", "нуб", "нубяра"
];

export const YOUTUBE_TRIGGER_WORDS: string[] = [
  "взаимка", "го взаимку", "подпишись на меня", "зайди на канал",
  "sub4sub", "check my channel", "накрутка", "бесплатные робуксы",
  "free robux", "чит на", "скачать чит", "стримлю тут"
];

export const KICK_TRIGGER_WORDS: string[] = [
  "stake code", "deposit bonus", "free promo", "казино бонус",
  "промокод на депозит", "депни", "выигрыш тут", "t.me/", "crypto airdrop"
];

export const TIKTOK_TRIGGER_WORDS: string[] = [
  "тапайте", "тап тап", "го в топ", "скиньте подарок", "подари панду",
  "взаимные тапы", "прожмите лайки"
];

export const VKPLAY_TRIGGER_WORDS: string[] = [
  "переходи по ссылке", "раздача в тг", "деньги за клики",
  "вступи в группу", "подпишись на паблик", "бесплатные голоса"
];

export const COMMON_TRIGGER_WORDS: string[] = [
  "http://", "https://", ".ru/", ".com/", ".gg/", ".xyz", ".top"
];

export const DEFAULT_FILTER_BLOCKS: FilterBlock[] = [
  {
    id: "twitch",
    name: "Twitch ToS и банворды",
    desc: "Политика Twitch: хейт-спич, расизм, гомофобия, эйблизм, харассмент. Автоудаление нарушений из чата при авторизации.",
    category: "twitch",
    enabled: true,
    words: TWITCH_POLICY_BANWORDS,
    customWords: [],
    disabledWords: [],
    autoDeleteOnTwitch: true,
  },
  {
    id: "trolling",
    name: "Троллинг",
    desc: "Слова-раздражители стримера: «Собака», «Сабака», спам «@», провокации, байты на тильт и токсичные фразы.",
    category: "trolling",
    enabled: true,
    words: TROLLING_TRIGGER_WORDS,
    customWords: [],
    disabledWords: [],
    autoDeleteOnTwitch: true,
  },
  {
    id: "youtube",
    name: "YouTube Live",
    desc: "Спам взаимоподписок («го взаимку»), накрутка просмотров, читы и реклама сторонних каналов.",
    category: "platform",
    enabled: false,
    words: YOUTUBE_TRIGGER_WORDS,
    customWords: [],
    disabledWords: [],
  },
  {
    id: "kick",
    name: "Kick",
    desc: "Спам казино, промокоды на депозит, крипто-боты и реферальные ссылки.",
    category: "platform",
    enabled: false,
    words: KICK_TRIGGER_WORDS,
    customWords: [],
    disabledWords: [],
  },
  {
    id: "vkplay",
    name: "VK Видео Live",
    desc: "Реклама сторонних ресурсов, спам-боты и накрутка подписчиков.",
    category: "platform",
    enabled: false,
    words: VKPLAY_TRIGGER_WORDS,
    customWords: [],
    disabledWords: [],
  },
  {
    id: "tiktok",
    name: "TikTok Live",
    desc: "Попрошайничество подарков, спам тапами и накрутка лайков.",
    category: "platform",
    enabled: false,
    words: TIKTOK_TRIGGER_WORDS,
    customWords: [],
    disabledWords: [],
  },
  {
    id: "common",
    name: "Общие ссылки и спам",
    desc: "Подозрительные домены, фишинговые ссылки и сетевой спам.",
    category: "common",
    enabled: false,
    words: COMMON_TRIGGER_WORDS,
    customWords: [],
    disabledWords: [],
  },
];

/** Таблица подстановки похожих символов для обнаружения замаскированных слов */
const HOMOGLYPHS: Record<string, string> = {
  "0": "о",
  "1": "i",
  "!": "i",
  "|": "i",
  "@": "а",
  "3": "е",
  "4": "ч",
  "$": "с",
  "a": "а",
  "c": "с",
  "e": "е",
  "o": "о",
  "p": "р",
  "x": "х",
  "y": "у",
  "k": "к",
  "m": "м",
  "t": "т",
  "b": "в",
};

/**
 * Нормализует текст для сопоставления: заменяет похожие буквы (leet/homoglyphs)
 * и удаляет разделяющие знаки препинания.
 */
export function normalizeFilterText(text: string): { raw: string; normalized: string; compact: string } {
  const raw = text.toLowerCase();
  let normalized = "";
  for (const ch of raw) {
    normalized += HOMOGLYPHS[ch] ?? ch;
  }
  // Версия без пробелов и знаков препинания (для обнаружения «с о б а к а», «п-и-д-о-р»)
  const compact = normalized.replace(/[\s\-_.,/\\*#+=~`'"!?()[\]{}<>:;^%$]+/g, "");
  return { raw, normalized, compact };
}

export interface FilterCheckResult {
  matched: boolean;
  blockId?: string;
  blockName?: string;
  word?: string;
  reason?: string;
  isTwitchBanword?: boolean;
}

/**
 * Проверяет сообщение по списку активных блоков фильтров.
 */
export function checkMessageFilters(
  text: string,
  platform: string,
  blocks: FilterBlock[],
  author?: string,
  whiteAuthors: string[] = [],
  ignoreAuthors: string[] = []
): FilterCheckResult {
  if (!text) return { matched: false };

  const normAuthor = (author ?? "").trim().replace(/^@/, "").toLowerCase();
  if (normAuthor && whiteAuthors.map((a) => a.toLowerCase()).includes(normAuthor)) {
    return { matched: false };
  }
  if (normAuthor && ignoreAuthors.map((a) => a.toLowerCase()).includes(normAuthor)) {
    return {
      matched: true,
      blockId: "authors",
      blockName: "Чёрный список",
      word: `@${author}`,
      reason: `Автор @${author} находится в чёрном списке`,
    };
  }

  const { raw, normalized, compact } = normalizeFilterText(text);

  for (const block of blocks) {
    if (!block.enabled) continue;

    // Объединяем встроенные и пользовательские слова блока, исключая выключенные
    const disabled = new Set(block.disabledWords ?? []);
    const activeWords = [...block.words, ...block.customWords].filter((w) => !disabled.has(w));

    for (const pattern of activeWords) {
      const p = pattern.trim().toLowerCase();
      if (!p) continue;

      // Особая обработка правила "@" (спам упоминаниями)
      if (p === "@") {
        if (raw.includes("@")) {
          return {
            matched: true,
            blockId: block.id,
            blockName: block.name,
            word: "@",
            reason: `Сработало правило «@» (${block.name})`,
            isTwitchBanword: block.id === "twitch",
          };
        }
        continue;
      }

      // Прямое совпадение в исходном тексте
      if (raw.includes(p)) {
        return {
          matched: true,
          blockId: block.id,
          blockName: block.name,
          word: pattern,
          reason: `Совпадение со словом «${pattern}» (${block.name})`,
          isTwitchBanword: block.id === "twitch",
        };
      }

      // Проверка нормализованного текста (с учётом замены похожих букв)
      const normPattern = normalizeFilterText(p).normalized;
      if (normalized.includes(normPattern)) {
        return {
          matched: true,
          blockId: block.id,
          blockName: block.name,
          word: pattern,
          reason: `Совпадение со словом «${pattern}» (${block.name})`,
          isTwitchBanword: block.id === "twitch",
        };
      }

      // Проверка сжатого текста без пробелов (для «с о б а к а», «п и д о р»)
      const compactPattern = normalizeFilterText(p).compact;
      if (compactPattern.length >= 3 && compact.includes(compactPattern)) {
        return {
          matched: true,
          blockId: block.id,
          blockName: block.name,
          word: pattern,
          reason: `Обнаружено скрытое слово «${pattern}» (${block.name})`,
          isTwitchBanword: block.id === "twitch",
        };
      }
    }
  }

  return { matched: false };
}
