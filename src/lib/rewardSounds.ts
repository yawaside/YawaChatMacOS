/**
 * Награды за баллы канала: своя звуковая библиотека и правило «награда → звук».
 *
 * Модуль намеренно чистый: без React, без звука и без обращений к настройкам.
 * Так логику выбора звука можно покрыть юнит-тестами, а окно приложения и
 * страница виджета OBS решают одинаково.
 */
import { MAX_REWARD_RULES } from "./types";
import type { ChatMsg, RewardPlatform, RewardSoundRule } from "./types";

/**
 * Нормализация названия награды: регистр, неразрывные и лишние пробелы.
 * Точное сравнение нормализованных строк — без «похожести»: стример должен
 * понимать, почему звук сработал именно так.
 */
export function normalizeRewardTitle(title: string | undefined): string {
  return String(title ?? "")
    .replace(/[\u00a0\u200b\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Поля награды в старом формате события от хоста. */
export interface HostRewardFields {
  rewardTitle?: unknown;
  rewardId?: unknown;
  rewardCost?: unknown;
}

/**
 * Вспомогательное: значение строкой. Площадки шлют идентификаторы и цены то
 * строкой, то числом (VK Видео Live особенно часто), и раньше числовой id
 * просто терялся — правило «награда → звук» не находилось и активация
 * проходила молча.
 */
function asTextReward(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}
function asFiniteNumberReward(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Приводит награду к единой форме. Хост присылает награды отдельными плоскими
 * полями, а браузерные события могут уже содержать вложенный объект reward
 * (в т.ч. с числовыми id/ценой, как это делает VK Видео Live).
 */
export function rewardDataOf(
  message: (Pick<ChatMsg, "reward"> & HostRewardFields) | undefined,
): ChatMsg["reward"] {
  if (!message) return undefined;
  const nested = message.reward;
  const title = asTextReward(nested?.title) ?? asTextReward(message.rewardTitle) ?? undefined;
  const id = asTextReward(nested?.id) ?? asTextReward(message.rewardId) ?? undefined;
  const cost = asFiniteNumberReward(nested?.cost) ?? asFiniteNumberReward(message.rewardCost) ?? undefined;

  if (title === undefined && id === undefined && cost === undefined) return undefined;
  return { title, id, cost };
}

/**
 * Запасной путь: вытащить название награды из текста строки ленты
 * «… активировал награду «Гонг»: текст зрителя».
 *
 * Нужен для хоста, который ещё не присылает структурное поле reward.title:
 * звук по правилам работает и без него. Заглушку «награда» (которую хост или
 * сама площадка вставляют, когда настоящее название им неизвестно) НЕ
 * считаем названием — иначе поиск по такому псевдо-имени ничего не найдёт,
 * а поиск по id в findRewardRule стоит ПЕРВЫМ, но фальшивое «награда» затыкало
 * цепочку `||` раньше, чем до него доходило.
 */
const REWARD_NAME_PLACEHOLDER = "награда";
export function rewardTitleFromText(text: string | undefined): string {
  const m = /активировал[^«"'[]*[«"'[]([^»"'\]]+)[»"'\]]/i.exec(String(text ?? ""));
  const raw = m ? m[1] : "";
  if (normalizeRewardTitle(raw) === REWARD_NAME_PLACEHOLDER) return "";
  return raw;
}

/**
 * Кэш «(platform, rewardId) → название» на стороне рендерера.
 *
 * Событие активации VK может прийти с одним лишь id (без названия): cp_reward_demand_update
 * шлёт только id и новый статус заявки, а хост в таких случаях подставляет
 * «награда». Без кэша название оставалось «наградой» и правило звука не
 * находилось — даже если синхронизация уже знает настоящее имя или это не
 * первая активация той же награды.
 *
 * Кэш пополняется:
 * - после синхронизации списка наград (seedRewardTitleCache);
 * - каждой активацией, где название таки было.
 * Живёт только в рамках сессии, в настройки не сохраняется.
 */
const rewardTitleCache = new Map<string, string>();
const rewardCacheKey = (platform: string | undefined, id: string) => `${platform ?? ""}\u0000${id}`;

/** Запомнить название награды по её id на конкретной площадке. */
export function rememberRewardTitle(
  platform: string | undefined,
  id: string | undefined,
  title: string | undefined,
): void {
  const rid = String(id ?? "").trim();
  const name = normalizeRewardTitle(title);
  if (!rid || !name || name === REWARD_NAME_PLACEHOLDER) return;
  rewardTitleCache.set(rewardCacheKey(platform, rid), name);
}

/** Вспомнить название награды по id (если раньше уже видели его). */
export function recallRewardTitle(platform: string | undefined, id: string | undefined): string | undefined {
  const rid = String(id ?? "").trim();
  if (!rid) return undefined;
  const hit = rewardTitleCache.get(rewardCacheKey(platform, rid));
  if (hit) return hit;
  // запас: видели такую награду как «общую», до разделения по площадкам
  if (platform) return rewardTitleCache.get(rewardCacheKey(undefined, rid));
  return undefined;
}

/** Название награды: структурное поле хоста → кэш по id → разбор текста. */
export function rewardTitleOf(
  m: (Pick<ChatMsg, "text" | "reward"> & Partial<Pick<ChatMsg, "platform">> & HostRewardFields) | undefined,
): string {
  if (!m) return "";
  const data = rewardDataOf(m);
  const direct = normalizeRewardTitle(data?.title);
  if (direct && direct !== REWARD_NAME_PLACEHOLDER) {
    if (data?.id) rememberRewardTitle(m.platform, data.id, direct);
    return direct;
  }
  // Названия в событии нет — достаём из кэша (он наполняется синхронизацией
  // наград и прошлыми событиями той же награды).
  if (data?.id) {
    const cached = recallRewardTitle(m.platform, data.id);
    if (cached) return cached;
  }
  return normalizeRewardTitle(rewardTitleFromText(m.text));
}

/**
 * Разовое заполнение кэша названий по списку наград площадки — после
 * rewards.list и после mergeRewardRules. Без этого первая активация VK,
 * пришедшая до синхронизации с одним id, остаётся с заглушкой «награда».
 */
export function seedRewardTitleCache(
  rewards: Iterable<
    { platform?: { toString?: () => string } | string | undefined; id?: unknown; title?: unknown } | undefined
  >,
): void {
  if (!rewards) return;
  for (const r of rewards) {
    if (!r) continue;
    const platform = typeof r.platform === "string" ? r.platform : undefined;
    rememberRewardTitle(platform, asTextReward(r.id), asTextReward(r.title));
  }
}

/** Ключ конкретной активации: id самой награды не уникален для событий. */
export function rewardEventKey(
  message: Pick<ChatMsg, "platform" | "sid" | "msgId" | "id" | "ts" | "author" | "text">,
): string {
  if (message.sid !== undefined) return `${message.platform}:sid:${message.sid}`;
  if (message.msgId) return `${message.platform}:msg:${message.msgId}`;
  return `${message.platform}:event:${message.id}:${message.ts}:${message.author}:${message.text}`;
}

/** Правило для награды: сначала площадка и id, затем площадка и название. */
export function findRewardRule(
  rules: RewardSoundRule[] | undefined,
  title: string,
  id?: string | undefined,
  platform?: RewardPlatform,
): RewardSoundRule | undefined {
  const want = normalizeRewardTitle(title);
  if (!Array.isArray(rules)) return undefined;
  // Незаполненные и испорченные строки (без названия или без звука)
  // пропускаем: правило без звука не должно «съедать» совпадение и молчать.
  const ready = rules.filter((r) => isRewardRuleReady(r));
  const scoped = platform ? ready.filter((r) => r.platform === platform) : ready;
  // Старые и ручные правила без площадки остаются запасным вариантом.
  const shared = platform ? ready.filter((r) => !r.platform) : [];

  /* id уникален только внутри площадки. Не ищем его в правилах другой
     платформы: у Twitch и VK идентификаторы могут совпасть. */
  const wantId = String(id ?? "").trim();
  if (wantId) {
    const byId = scoped.find((r) => String(r.id ?? "").trim() === wantId);
    if (byId) return byId;
    const sharedById = shared.find((r) => String(r.id ?? "").trim() === wantId);
    if (sharedById) return sharedById;
  }

  if (!want) return undefined;
  return (
    scoped.find((r) => normalizeRewardTitle(r.title) === want) ??
    shared.find((r) => normalizeRewardTitle(r.title) === want)
  );
}

/** Новая пустая строка правила — для кнопки «Добавить награду». */
export function emptyRewardRule(platform?: RewardPlatform): RewardSoundRule {
  return { title: "", sound: "", volume: 0.7, ...(platform ? { platform } : {}) };
}

/**
 * Пригодное ли правило к сохранению: без названия звук не с чем связать,
 * без звука правило молча ничего не делает.
 */
export function isRewardRuleReady(rule: RewardSoundRule | undefined): boolean {
  return !!normalizeRewardTitle(rule?.title) && !!String(rule?.sound ?? "");
}

/** Громкость правила в пределах 0…1 — настройки могли прийти испорченными. */
export function rewardRuleVolume(rule: RewardSoundRule | undefined): number {
  const v = Number(rule?.volume);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.7;
}

/** Награда за баллы канала, как её отдаёт площадка. */
export interface ChannelReward {
  /** площадка, чтобы одинаковые названия и id не смешивались */
  platform?: RewardPlatform;
  /** идентификатор награды на площадке */
  id: string;
  /** название, как его видит стример */
  title: string;
  /** стоимость в баллах */
  cost: number;
}

/** Результат слияния списка наград площадки с настроенными правилами. */
export interface RewardMergeResult {
  rules: RewardSoundRule[];
  /** названия добавленных наград — для сообщения пользователю */
  added: string[];
  /** сколько наград не влезло из-за лимита правил */
  skipped: number;
  /** менялись ли правила (включая привязку старых строк к площадке) */
  changed: boolean;
}

/**
 * Слияние списка наград площадки с правилами звуков.
 *
 * Задача: пользователю остаётся только выбрать звук. Поэтому:
 * - новые награды получают пустую строку `{ title, id, cost, sound: "" }`;
 * - уже настроенные правила не трогаем — звук и громкость остаются свои;
 * - награды Twitch и VK сохраняются раздельно, даже если их id или названия
 *   совпадают;
 * - старые правила без площадки привязываются к источнику при первом
 *   совпадении, а не теряются после обновления;
 * - настройки удалённых на площадке наград остаются на месте: стример мог
 *   удалить награду случайно и вернуть её позже.
 */
export function mergeRewardRules(
  current: RewardSoundRule[] | undefined,
  rewards: ChannelReward[] | undefined,
): RewardMergeResult {
  const rules: RewardSoundRule[] = (Array.isArray(current) ? current : []).map((r) => ({ ...r }));
  const added: string[] = [];
  let skipped = 0;
  let changed = false;
  if (!Array.isArray(rewards)) return { rules, added, skipped, changed };

  const byId = new Map<string, RewardSoundRule>();
  const byTitle = new Map<string, RewardSoundRule>();
  const indexKey = (platform: RewardPlatform | undefined, value: string) => `${platform ?? ""}\u0000${value}`;
  const register = (rule: RewardSoundRule) => {
    const platform = rule.platform;
    const id = String(rule.id ?? "").trim();
    if (id) {
      const key = indexKey(platform, id);
      if (!byId.has(key)) byId.set(key, rule);
    }
    const title = normalizeRewardTitle(rule.title);
    if (title) {
      const key = indexKey(platform, title);
      if (!byTitle.has(key)) byTitle.set(key, rule);
    }
  };
  const unindex = (rule: RewardSoundRule) => {
    const id = String(rule.id ?? "").trim();
    if (id) {
      const key = indexKey(rule.platform, id);
      if (byId.get(key) === rule) byId.delete(key);
    }
    const title = normalizeRewardTitle(rule.title);
    if (title) {
      const key = indexKey(rule.platform, title);
      if (byTitle.get(key) === rule) byTitle.delete(key);
    }
  };

  for (const rule of rules) register(rule);

  /* Старые правила без площадки были общими для всех площадок. Если награда
     с таким названием или id есть сразу и на Twitch, и на VK Видео Live, то
     при первом обновлении настроенное правило доставалось только первой
     площадке, а строка второй создавалась пустой — звук для неё пропадал.
     Заранее находим такие правила: настроенный звук скопируется на каждую
     площадку, которая на него претендует. */
  interface MultiPlatformRule {
    rule: RewardSoundRule;
    id: string;
    title: string;
    platforms: Set<RewardPlatform>;
    taken: Set<RewardPlatform>;
  }
  const multiPlatformRules: MultiPlatformRule[] = [];
  for (const rule of rules) {
    if (rule.platform || !isRewardRuleReady(rule)) continue;
    const id = String(rule.id ?? "").trim();
    const title = normalizeRewardTitle(rule.title);
    if (!id && !title) continue;
    const platforms = new Set<RewardPlatform>();
    for (const reward of rewards) {
      const platform = reward?.platform;
      if (!platform) continue;
      const wantId = String(reward?.id ?? "").trim();
      const want = normalizeRewardTitle(String(reward?.title ?? ""));
      if ((id && wantId && id === wantId) || (title && want && title === want)) platforms.add(platform);
    }
    if (platforms.size > 1) multiPlatformRules.push({ rule, id, title, platforms, taken: new Set() });
  }

  for (const reward of rewards) {
    const title = String(reward?.title ?? "").trim();
    const want = normalizeRewardTitle(title);
    const wantId = String(reward?.id ?? "").trim();
    const platform = reward?.platform;
    if (!want) continue;

    const scopeId = indexKey(platform, wantId);
    const scopeTitle = indexKey(platform, want);
    let existing = (wantId && byId.get(scopeId)) || byTitle.get(scopeTitle);
    let legacyMatch = false;

    // Совместимость с настройками, созданными до разделения Twitch и VK.
    if (!existing && platform) {
      existing = (wantId && byId.get(indexKey(undefined, wantId))) || byTitle.get(indexKey(undefined, want));
      legacyMatch = !!existing;
    }

    if (existing) {
      unindex(existing);
      if (legacyMatch && platform) {
        const shared = multiPlatformRules.find((m) => m.rule === existing);
        if (shared) shared.taken.add(platform);
        existing.platform = platform;
        changed = true;
      }
      // ещё не настроенную строку приводим к актуальному виду площадки,
      // настроенную не трогаем
      if (!isRewardRuleReady(existing) && title && existing.title !== title) {
        existing.title = title;
        changed = true;
      }
      if (wantId && !String(existing.id ?? "").trim()) {
        existing.id = wantId;
        changed = true;
      }
      /* Награду на площадке могли удалить и создать заново: после
         переподключения у неё другой id, но прежнее название. Совпадение по
         названию — это та же награда, поэтому обновляем id. Иначе после
         следующего переименования звук потерялся бы: строка искалась бы
         только по названию, а его уже нет. */
      if (wantId && String(existing.id ?? "").trim() && String(existing.id ?? "").trim() !== wantId) {
        existing.id = wantId;
        changed = true;
      }
      if (typeof reward.cost === "number" && existing.cost !== reward.cost) {
        existing.cost = reward.cost;
        changed = true;
      }
      register(existing);
      continue;
    }

    /* Награда второй площадки совпала со старым общим правилом, которое уже
       забрала первая площадка: копируем настроенные звук и громкость, а не
       создаём пустую строку. Без этого после обновления звук награды VK
       молчал, хотя стример настраивал его раньше. */
    if (platform) {
      const source = multiPlatformRules.find(
        (m) =>
          m.platforms.has(platform) &&
          !m.taken.has(platform) &&
          ((m.id && wantId && m.id === wantId) || (m.title && m.title === want)),
      );
      if (source) {
        source.taken.add(platform);
        if (rules.length >= MAX_REWARD_RULES) {
          skipped++;
          continue;
        }
        const copy: RewardSoundRule = { title, sound: source.rule.sound, volume: source.rule.volume };
        copy.platform = platform;
        if (wantId) copy.id = wantId;
        if (typeof reward.cost === "number") copy.cost = reward.cost;
        rules.push(copy);
        register(copy);
        changed = true;
        continue;
      }
    }

    if (rules.length >= MAX_REWARD_RULES) {
      skipped++;
      continue;
    }
    const rule: RewardSoundRule = { title, sound: "", volume: 0.7 };
    if (platform) rule.platform = platform;
    if (wantId) rule.id = wantId;
    if (typeof reward.cost === "number") rule.cost = reward.cost;
    rules.push(rule);
    register(rule);
    added.push(title);
    changed = true;
  }

  return { rules, added, skipped, changed };
}

/* ================= создание награды на площадке =================
   Награду можно завести прямо в приложении: название, цена и площадки.
   Хост отправляет её в Twitch и VK Видео Live, а ответ площадки говорит,
   что получилось. Здесь — только то, что можно проверить до запроса:
   название и цена в допустимых пределах площадки. */

/** Допустимая стоимость награды на каждой площадке — по правилам площадок. */
export const REWARD_PRICE_LIMITS: Record<RewardPlatform, { min: number; max: number }> = {
  twitch: { min: 1, max: 1_000_000 },
  vkplay: { min: 1, max: 1_000_000 },
};

/** Площадки, на которые приложение умеет отправлять награду. */
export const REWARD_CREATE_PLATFORMS: RewardPlatform[] = ["twitch", "vkplay"];

/** Черновик новой награды: то, что заполняет стример перед созданием. */
export interface RewardDraft {
  title: string;
  cost: number;
  platforms: RewardPlatform[];
  description: string;
  /** награда требует сообщение от зрителя */
  messageRequired: boolean;
}

export const EMPTY_REWARD_DRAFT: RewardDraft = {
  title: "",
  cost: 500,
  platforms: ["twitch"],
  description: "",
  messageRequired: true,
};

/** Проверенный черновик: ровно то, что уйдёт на площадки. */
export interface PreparedReward {
  title: string;
  cost: number;
  platforms: RewardPlatform[];
  description: string;
  messageRequired: boolean;
}

export type RewardDraftCheck = { ok: true; reward: PreparedReward } | { ok: false; error: string };

/**
 * Проверка черновика до запроса. Площадки отвечают на такое невнятными
 * ошибками, поэтому название и цену проверяем сами и говорим словами,
 * что именно поправить.
 */
export function prepareRewardDraft(draft: RewardDraft): RewardDraftCheck {
  const title = String(draft?.title ?? "")
    .replace(/[\u00a0\u200b\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (title.length === 0) return { ok: false, error: "Укажите название награды" };
  if (title.length > 45) return { ok: false, error: "Название длиннее 45 символов — площадки его не примут" };

  const platforms = REWARD_CREATE_PLATFORMS.filter((p) => draft?.platforms?.includes(p));
  if (platforms.length === 0) return { ok: false, error: "Выберите площадку: Twitch или VK Видео Live" };

  const cost = Math.round(Number(draft?.cost));
  if (!Number.isFinite(cost)) return { ok: false, error: "Укажите цену награды в баллах" };
  for (const platform of platforms) {
    const limit = REWARD_PRICE_LIMITS[platform];
    if (cost < limit.min || cost > limit.max) {
      const name = platform === "twitch" ? "Twitch" : "VK Видео Live";
      return {
        ok: false,
        error: `Для ${name} цена должна быть от ${limit.min} до ${limit.max} баллов`,
      };
    }
  }

  const description = String(draft?.description ?? "")
    .trim()
    .slice(0, 200);
  return {
    ok: true,
    reward: { title, cost, platforms, description, messageRequired: draft?.messageRequired !== false },
  };
}

/** Созданная на площадке награда — как её вернул хост. */
export interface CreatedReward {
  platform: RewardPlatform;
  id: string;
  title: string;
  cost: number;
}

/**
 * Дополнить правила наградами, созданными только что. Строка появляется
 * сразу после создания — стримеру остаётся выбрать звук, а не нажимать
 * «Обновить». Совпадение ищем по площадке и id, затем по названию: повторное
 * создание награды не должно плодить дубли правил.
 */
export function mergeCreatedRewards(
  rules: RewardSoundRule[],
  created: CreatedReward[],
): { rules: RewardSoundRule[]; changed: boolean } {
  const list = Array.isArray(rules) ? rules.map((r) => ({ ...r })) : [];
  let changed = false;

  for (const reward of created) {
    const title = normalizeRewardTitle(reward.title);
    if (!title) continue;
    const existing = list.find(
      (r) =>
        r.platform === reward.platform &&
        ((reward.id && String(r.id ?? "") === String(reward.id)) || normalizeRewardTitle(r.title) === title),
    );
    if (existing) {
      if (!existing.id && reward.id) {
        existing.id = reward.id;
        changed = true;
      }
      if (existing.cost !== reward.cost) {
        existing.cost = reward.cost;
        changed = true;
      }
      continue;
    }
    if (list.length >= MAX_REWARD_RULES) break;
    list.push({
      platform: reward.platform,
      id: reward.id,
      title: reward.title,
      cost: reward.cost,
      sound: "",
      volume: 0.7,
    });
    changed = true;
  }

  return { rules: list, changed };
}
