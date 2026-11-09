/**
 * Снятие сообщений с показа в публичном потоке — виджете OBS и оверлее.
 *
 * Лента приложения и публичный поток получают одни и те же сообщения, а
 * решение «эту строку показывать нельзя» принимается в окне приложения
 * (автомодерация, фильтры) или приходит от площадки (удаление, бан,
 * очистка чата). Запрос на снятие уходит по тому же потоку, поэтому модуль
 * хранит память о скрытых строках: сообщение и команда могут прийти разными
 * кадрами, и скрытая строка не должна мелькнуть в эфире.
 */
import type { ChatHideRequest, ChatMsg, PlatformId } from "./types";

/** Строка публичного потока: чем её можно опознать при снятии с показа. */
export interface HideTarget {
  /** сквозной номер строки, который ставит приложение */
  sid?: number;
  /** идентификатор сообщения на площадке (Twitch) */
  msgId?: string;
  /** идентификатор автора на площадке (Twitch user-id) */
  userId?: string;
  platform: PlatformId;
  author: string;
}

/** Подходит ли строка под запрос «убрать с показа». */
export function matchesHide(m: HideTarget, h: ChatHideRequest): boolean {
  if (Array.isArray(h.sids) && typeof m.sid === "number" && h.sids.includes(m.sid)) return true;
  if (Array.isArray(h.msgIds) && m.msgId && h.msgIds.includes(m.msgId)) return true;
  if (h.userId && m.userId) {
    if (h.platform && h.platform !== m.platform) return false;
    if (m.userId === h.userId) return true;
  }
  if (h.author) {
    if (h.platform && h.platform !== m.platform) return false;
    return m.author.toLowerCase() === h.author.toLowerCase();
  }
  if (h.all && h.platform) return m.platform === h.platform;
  if (h.all) return true;
  return false;
}

/**
 * Память о скрытых строках в рамках одной страницы (виджет OBS или оверлей).
 * Хранит последние запросы: этого хватает, чтобы поймать строку, пришедшую
 * следом, и память не растёт бесконечно в долгом эфире.
 */
export function createHideRegistry() {
  const hidden: { req: ChatHideRequest; at: number }[] = [];
  const limit = 50;
  /** «Убрать все сообщения автора или площадки» — запрос не на одну строку. */
  const broad = (h: ChatHideRequest) => Boolean(h.author) || Boolean(h.userId) || Boolean(h.all);
  /** Окно удержания общих запросов (1 с — перекрывает пакетную доставку 80 мс,
   *  но не глушит сообщения зрителя после короткого таймаута или разбана). */
  const broadWindowMs = 1_000;

  return {
    /** запомнить запрос — он продолжит действовать и для следующих кадров */
    recall(h: ChatHideRequest) {
      hidden.push({ req: h, at: Date.now() });
      if (hidden.length > limit) hidden.shift();
    },
    /** скрыта ли строка одним из запомненных запросов */
    isHidden(m: HideTarget): boolean {
      const now = Date.now();
      return hidden.some(({ req, at }) => {
        if (!matchesHide(m, req)) return false;
        // Точный запрос (номер строки, id сообщения) действует до конца
        // эфира, а «все сообщения автора/площадки» — только на время
        // доставки текущего пакета: иначе зритель после временного таймаута
        // или разбана оставался бы невидимым в оверлее и виджете.
        return !broad(req) || now - at <= broadWindowMs;
      });
    },
    /** убрать из списка всё, что попало под запрос */
    apply<T extends HideTarget>(list: T[], h: ChatHideRequest): T[] {
      return list.filter((m) => !matchesHide(m, h));
    },
  };
}

/** Событие площадки «строку убрать» → запрос на снятие с показа. */
export function hideFromModeration(
  kind: string,
  raw: { platform?: string; author?: string; msgId?: string; userId?: string },
): ChatHideRequest | null {
  if (kind === "moderation.delete") return raw.msgId ? { msgIds: [String(raw.msgId)] } : null;
  if (kind === "moderation.ban") {
    const author = String(raw.author ?? "").trim();
    const userId = raw.userId ? String(raw.userId).trim() : "";
    if (!author && !userId) return null;
    return {
      platform: raw.platform as ChatMsg["platform"],
      author: author || undefined,
      userId: userId || undefined,
    };
  }
  if (kind === "moderation.clear") return { platform: raw.platform as ChatMsg["platform"], all: true };
  return null;
}
