import {
  BadgeCheck,
  Bot,
  Crown,
  Gem,
  Gift,
  Heart,
  Shield,
  Star,
  Sword,
  Swords,
  Video,
  Zap,
} from "lucide-react";
import { safeImageSrc } from "./emotes";
import type { ChatMsg } from "./types";

/**
 * Значки полномочий в чате.
 *
 * ГЛАВНОЕ ПРАВИЛО: если площадка прислала СВОЮ картинку значка
 * (msg.badgeIcons) — показываем именно её, один в один как в чате площадки.
 * Наши иконки — только запасной вариант для площадок, которые картинок не
 * отдают. Текстом («mod», «sub») значки не выводятся нигде.
 */
export interface BadgeMeta {
  icon: React.ReactNode;
  color: string;
  title: string;
}

/** Иконка запасного значка. Размер задаётся снаружи. */
const glyph = (Comp: typeof Shield, size: number) => <Comp size={size} />;

export function badgeMeta(id: string, size = 10): BadgeMeta | null {
  switch (id) {
    // Владелец канала: у Twitch это камера — используем её же.
    case "broadcaster":
      return { icon: glyph(Video, size), color: "#ef4444", title: "Владелец канала" };
    case "mod":
      return { icon: glyph(Sword, size), color: "#00ad03", title: "Модератор" };
    case "vip":
      return { icon: glyph(Gem, size), color: "#e005b9", title: "VIP" };
    case "sub":
      return { icon: glyph(Star, size), color: "#a78bfa", title: "Подписчик" };
    case "founder":
      return { icon: glyph(Crown, size), color: "#fbbf24", title: "Основатель" };
    case "staff":
    case "admin":
      return { icon: glyph(Swords, size), color: "#38bdf8", title: "Сотрудник площадки" };
    case "verified":
      return { icon: glyph(BadgeCheck, size), color: "#38bdf8", title: "Подтверждённый аккаунт" };
    case "turbo":
      return { icon: glyph(Zap, size), color: "#9147ff", title: "Turbo" };
    case "bits":
      return { icon: glyph(Gem, size), color: "#8a2be2", title: "Биты" };
    case "gifter":
      return { icon: glyph(Gift, size), color: "#f472b6", title: "Дарил подписки" };
    case "artist":
      return { icon: glyph(Heart, size), color: "#f472b6", title: "Художник канала" };
    case "bot":
      return { icon: glyph(Bot, size), color: "#8b91a8", title: "Бот" };
    default:
      return null;
  }
}

/** Порядок значков: самые значимые полномочия — первыми. */
export const BADGE_ORDER = [
  "broadcaster",
  "staff",
  "admin",
  "mod",
  "vip",
  "founder",
  "verified",
  "sub",
  "gifter",
  "bits",
  "artist",
  "turbo",
  "bot",
];

/**
 * Список значков сообщения: сначала оригинальные картинки площадки,
 * иначе — запасные иконки. Никогда не возвращает текст.
 */
export function ChatBadges({
  msg,
  size,
  max = 6,
  tight = false,
}: {
  msg: Pick<ChatMsg, "badges" | "badgeIcons">;
  /** высота значка в пикселях */
  size: number;
  max?: number;
  /** без правого отступа у каждого значка: расстоянием управляет контейнер */
  tight?: boolean;
}) {
  // Картинки значков приходят из ответов площадок: показываем только
  // http/https (safeImageSrc), остальное пропускаем.
  const originals = (msg.badgeIcons ?? []).map((b) => ({ ...b, url: safeImageSrc(b.url) }));

  if (originals.length > 0) {
    return (
      <>
        {originals.slice(0, max).map((b, i) => (
          <img
            key={i}
            src={b.url}
            alt={b.title}
            title={b.title}
            draggable={false}
            className={`inline-block rounded-[3px] align-middle ${tight ? "" : "mr-1"}`}
            style={{ width: size, height: size }}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ))}
      </>
    );
  }

  const fallback = [...new Set(msg.badges ?? [])]
    .sort((a, b) => BADGE_ORDER.indexOf(a) - BADGE_ORDER.indexOf(b))
    .slice(0, max);

  return (
    <>
      {fallback.map((id, i) => {
        const meta = badgeMeta(id, Math.round(size * 0.72));
        if (!meta) return null;
        return (
          <span
            key={i}
            title={meta.title}
            className={`inline-flex items-center justify-center rounded-[3px] align-middle ${tight ? "" : "mr-1"}`}
            style={{
              width: size,
              height: size,
              background: `color-mix(in srgb, ${meta.color} 18%, transparent)`,
              /* значки рисуются на светлой и тёмной палитре: цвет подмешиваем
                 к цвету текста, чтобы жёлтый/зелёный не пропадал */
              color: `color-mix(in srgb, ${meta.color} 62%, var(--dw-text))`,
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${meta.color} 40%, transparent)`,
            }}
          >
            {meta.icon}
          </span>
        );
      })}
    </>
  );
}
