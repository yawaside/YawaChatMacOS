import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePersisted } from "../../lib/persist";
import {
  ArrowDown,
  ArrowDownToLine,
  Ban,
  Check,
  ChevronDown,
  Crown,
  Eraser,
  Funnel,
  Gift,
  Gavel,
  HandCoins,
  Heart,
  Loader2,
  LogIn,
  MessageSquareX,
  Search,
  Send,
  ShieldAlert,
  Timer,
  UserX,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { isDesktop, ttsBridge } from "../../lib/bridge";
import type { HostVoice } from "../../lib/bridge";
import type { ChatMsg, ChatViewConfig, Channel, ModerationRequest, PlatformId } from "../../lib/types";
import { PLATFORMS, PlatformIcon, platformMeta } from "../../lib/platforms";
import { ChatBadges } from "../../lib/badges";
import { isStickerOnly, parseMessage, safeImageSrc } from "../../lib/emotes";
import { fontStack } from "../../lib/fonts";
import { useWebFont } from "../../lib/webfont";
import { composeTextShadow, effectClass, effectVars } from "../../lib/effects";
import { FEED_STYLES, findStyle, isBareText, resolveTone, styleClass } from "../../lib/presets";
import { IconBtn } from "./ui";

/* ============ общая модерация канала (не привязана к пользователю) ============ */

export function ChatModerationBar({
  channels,
  botAuth,
  onAction,
}: {
  channels: Channel[];
  botAuth: Partial<Record<PlatformId, string>>;
  onAction: (action: string, channel: string, platform: PlatformId, seconds?: number) => void;
}) {
  /* Twitch поддерживает модерацию сообщений и режимы; VK Видео Live через
     DevAPI меняет общие режимы чата. Для отдельного зрителя оставлена только
     отправка /ban; факт выполнения команда автоматически не подтверждает. */
  const targets = channels.filter(
    (c) => (c.platform === "twitch" || c.platform === "vkplay") && !!botAuth[c.platform]?.trim(),
  );
  const [channelId, setChannelId] = useState(targets[0]?.id ?? "");
  const [slow, setSlow] = useState(10);

  const active = targets.find((c) => c.id === channelId) ?? targets[0];

  const run = (action: string, seconds?: number) => {
    if (!active) return;
    onAction(action, active.username, active.platform, seconds);
  };

  if (targets.length === 0) {
    const hasSupportedChannel = channels.some((c) => c.platform === "twitch" || c.platform === "vkplay");
    return (
      <div
        className="border-b px-3 py-2 text-[11px]"
        style={{ borderColor: "var(--dw-line)", color: "var(--dw-dim)" }}
      >
        {hasSupportedChannel
          ? "Войдите в чат-бот для Twitch или VK Видео Live, чтобы управлять режимами чата."
          : "Добавьте канал Twitch или VK Видео Live, чтобы управлять режимами чата."}
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2"
      style={{ borderColor: "var(--dw-line)" }}
    >
      <span className="text-[11px]" style={{ color: "var(--dw-dim)" }}>
        Канал:
      </span>
      <div className="flex items-center gap-1 rounded-lg px-1.5" style={{ background: "var(--dw-input)" }}>
        {active && <PlatformIcon id={active.platform} size={12} />}
        <select
          value={active?.id ?? ""}
          onChange={(e) => setChannelId(e.target.value)}
          className="max-w-[220px] cursor-pointer rounded-lg bg-transparent px-1 py-1 text-[11.5px] outline-none"
          style={{ color: "var(--dw-text)" }}
          title="Канал для управления режимами чата"
        >
          {targets.map((c) => (
            <option key={c.id} value={c.id}>
              {platformMeta(c.platform).name} · {c.title || c.username}
            </option>
          ))}
        </select>
      </div>

      <span className="mx-1 h-4 w-px" style={{ background: "var(--dw-line)" }} />

      <div className="flex items-center gap-1">
        <Timer size={12} style={{ color: "var(--dw-dim)" }} />
        <input
          type="number"
          min={1}
          max={1800}
          value={slow}
          onChange={(e) => setSlow(Math.max(1, Math.min(1800, Number(e.target.value) || 1)))}
          className="w-16 rounded-lg px-2 py-1 text-[11.5px] outline-none"
          style={{ background: "var(--dw-input)", color: "var(--dw-text)" }}
        />
        <ModeBtn label="Медленный" onClick={() => run("mode-slow", slow)} />
        <ModeBtn label="Выключить" onClick={() => run("mode-slow-off")} />
      </div>

      <span className="mx-1 h-4 w-px" style={{ background: "var(--dw-line)" }} />

      <ModeBtn icon={<Zap size={11} />} label="Только смайлы" onClick={() => run("mode-emote")} />
      <ModeBtn label="Выкл" onClick={() => run("mode-emote-off")} />
      <ModeBtn icon={<Heart size={11} />} label="Фолловеры" onClick={() => run("mode-followers")} />
      <ModeBtn label="Выкл" onClick={() => run("mode-followers-off")} />
      <ModeBtn icon={<Crown size={11} />} label="Только сабы" onClick={() => run("mode-subs")} />
      <ModeBtn label="Выкл" onClick={() => run("mode-subs-off")} />

      {/* Очистка чата доступна только в Twitch: для VK Видео Live такая
          операция не описана в публичном DevAPI, поэтому кнопку не показываем. */}
      {active?.platform === "twitch" && (
        <>
          <span className="mx-1 h-4 w-px" style={{ background: "var(--dw-line)" }} />
          <ModeBtn
            icon={<Eraser size={11} />}
            label="Очистить чат канала"
            danger
            onClick={() => run("mode-clear")}
          />
        </>
      )}
    </div>
  );
}

function ModeBtn({
  icon,
  label,
  danger,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition-colors hover:brightness-125"
      style={{ background: "var(--dw-input)", color: danger ? "#f87171" : "var(--dw-text)" }}
    >
      {icon}
      {label}
    </button>
  );
}

/** Полномочия показываем ЗНАЧКАМИ, а не текстом: цвет + иконка + подсказка. */
/* Значки полномочий живут в общем модуле lib/badges: одинаковые в ленте,
   оверлее и виджете. */

/**
 * Аватар автора. Если площадка прислала картинку — показываем её,
 * иначе рисуем кружок с первой буквой ника в его же цвете.
 */
export const Avatar = React.memo(function Avatar({
  src,
  name,
  color,
  size = 20,
  square = false,
  eager = false,
}: {
  src?: string;
  name: string;
  color: string;
  size?: number;
  /** квадратная плашка вместо круга (новые раскладки) */
  square?: boolean;
  /** грузить сразу, без ожидания прокрутки (свежие сообщения) */
  eager?: boolean;
}) {
  const radius = square ? Math.max(3, Math.round(size * 0.26)) : 9999;
  const [failed, setFailed] = useState(false);
  // Аватар приходит из ответа площадки: грузим только http/https
  // (см. safeImageSrc). Непонятный адрес или ошибка загрузки — буква-заглушка.
  const safeSrc = safeImageSrc(src);

  if (safeSrc && !failed) {
    return (
      <img
        src={safeSrc}
        alt=""
        draggable={false}
        onError={() => setFailed(true)}
        /* Вне экрана аватары не тянем и не декодируем; свежие сообщения
           (они у нижней кромки) грузим сразу — иначе лицо «появляется»
           через секунду после текста. */
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className="fade-in-img inline-block shrink-0 object-cover align-baseline"
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          boxShadow: `0 0 0 1.5px ${color}66`,
        }}
      />
    );
  }
  return <LetterAvatar name={name} color={color} size={size} radius={radius} />;
});

/**
 * Заглушка аватара, когда фотографии нет: первая буква ника на градиентной
 * плашке в цвете автора. Цвет буквы выбирается по яркости фона, поэтому
 * читается и на лаймовом, и на тёмно-синем.
 */
const LetterAvatar = React.memo(function LetterAvatar({
  name,
  color,
  size,
  radius,
}: {
  name: string;
  color: string;
  size: number;
  radius: number;
}) {
  const letter = (name.trim()[0] ?? "?").toUpperCase();

  /* яркость цвета автора: 0 — тёмный, 1 — светлый */
  const rgb = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  let light = 0.25;
  if (rgb) {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(rgb[1].slice(i, i + 2), 16) / 255);
    light = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center align-baseline font-bold select-none"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize: Math.round(size * 0.46),
        color: light > 0.55 ? "#14151c" : "#ffffff",
        background: `linear-gradient(145deg, color-mix(in srgb, ${color} 92%, #ffffff), ${color})`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 60%, #000)`,
        lineHeight: 1,
      }}
    >
      {letter}
    </span>
  );
});

const KIND_STYLE: Record<string, { icon: React.ReactNode; tint: string }> = {
  donate: { icon: <HandCoins size={11} />, tint: "#f59e0b" },
  sub: { icon: <Crown size={11} />, tint: "#a78bfa" },
  gift: { icon: <Gift size={11} />, tint: "#f472b6" },
  raid: { icon: <Zap size={11} />, tint: "#38bdf8" },
  join: { icon: <LogIn size={11} />, tint: "#60a5fa" },
};

interface Props {
  feed: ChatMsg[];
  channels: Channel[];
  view: ChatViewConfig;
  maxFeed: number;
  hideDeleted?: boolean;
  mentionHL?: boolean;
  /**
   * Режим «Только чат» (UI-1.3): из ленты убираются всё, что не сообщение —
   * панель инструментов, вкладки фильтра и строка отправки. Остаётся только
   * поток сообщений, поэтому лента занимает всю полезную площадь окна.
   */
  focus?: boolean;
  onModerate: (req: ModerationRequest) => void;
  onClear: () => void;
  /** общие режимы чата площадки (не привязаны к пользователю) */
  onChatMode?: (action: string, channel: string, platform: PlatformId, seconds?: number) => void;
  /** авторизованные аккаунты: определяют, куда можно писать из приложения */
  botAuth?: Partial<Record<PlatformId, string>>;
  /** отправка сообщения в чат площадки */
  onSend?: (platform: PlatformId, channel: string, text: string) => Promise<void> | void;
}

/* ============ окно рендеринга длинной ленты ============
   Короткий список (до VIRTUALIZE_AT строк) рендерится целиком — как раньше.
   Долгий — только окно WINDOW_SIZE последних строк, сверху — заполнитель
   по среднему росту строки. При прокрутке к началу окно расширяется вверх
   порциями; при возвращении к последним сообщениям сжимается обратно.
   В DOM одновременно живёт не больше окна (плюс порции, пока читается
   история), а не вся лента на 400 строк. */
const VIRTUALIZE_AT = 200;
const WINDOW_SIZE = 120;
const EXTEND_SIZE = 120;
const TOP_BUFFER_PX = 160;
/** Средний рост строки по плотности (при шрифте 14 px) — для заполнителя. */
const ROW_ESTIMATE: Record<string, number> = { cozy: 40, standard: 34, compact: 26, tight: 20 };

/* ---------- воронка ленты: типы сообщений (бывшие быстрые вкладки UI-2.2) ---------- */

type FeedTab = "all" | "events" | "mentions" | "questions";

const FEED_TABS: { id: FeedTab; label: string; hint: string }[] = [
  { id: "all", label: "Все", hint: "Все сообщения ленты" },
  { id: "events", label: "Донаты и события", hint: "Донаты, подписки, подарки, рейды, входы и награды" },
  { id: "mentions", label: "@ Упоминания", hint: "Сообщения, где упоминают ваш ник" },
  { id: "questions", label: "? Вопросы", hint: "Сообщения со знаком вопроса" },
];

/**
 * Кнопка «Воронка» с выпадающим списком типов сообщений. Раньше те же
 * фильтры лежали отдельной строкой вкладок под панелью поиска и занимали
 * место над лентой; теперь это одна кнопка справа, рядом с «Очистить ленту».
 * Список оформлен как остальные выпадающие списки приложения.
 */
function FeedFunnel({ tab, onSelect }: { tab: FeedTab; onSelect: (tab: FeedTab) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = FEED_TABS.find((t) => t.id === tab) ?? FEED_TABS[0];

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative z-20 shrink-0">
      <IconBtn
        icon={<Funnel size={14} />}
        title={tab === "all" ? "Воронка: какие сообщения показывать" : `Воронка: ${current.label}`}
        active={open || tab !== "all"}
        onClick={() => setOpen((v) => !v)}
      />

      {open && (
        <div
          role="menu"
          aria-label="Воронка ленты"
          className="absolute top-full right-0 z-30 mt-1 w-[250px] max-w-[calc(100vw-24px)] rounded-xl border p-1 shadow-2xl"
          style={{ background: "var(--dw-panel2)", borderColor: "var(--dw-line)" }}
        >
          <div
            className="px-2 pt-1.5 pb-1 text-[10px] font-semibold tracking-wide uppercase"
            style={{ color: "var(--dw-dim)" }}
          >
            Типы сообщений
          </div>
          {FEED_TABS.map((t) => {
            const selected = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  onSelect(t.id);
                  setOpen(false);
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--dw-hover)]"
                style={{
                  background: selected
                    ? "color-mix(in srgb, var(--dw-accent) 15%, var(--dw-panel2))"
                    : "transparent",
                  color: "var(--dw-text)",
                }}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[11.5px] font-semibold">{t.label}</span>
                  <span className="truncate text-[10px]" style={{ color: "var(--dw-dim)" }}>
                    {t.hint}
                  </span>
                </span>
                {selected && <Check size={13} className="shrink-0" style={{ color: "var(--dw-accent-2)" }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Вкладка «Донаты и события»: всё, что важнее обычного чата. */
const EVENT_KINDS: ReadonlySet<ChatMsg["kind"]> = new Set([
  "donate",
  "sub",
  "gift",
  "raid",
  "join",
  "reward",
  "bits",
]);

/* Форматтер времени создаётся один раз: toLocaleTimeString собирает новый
   Intl.DateTimeFormat на каждый вызов, а он вызывается для каждой строки и
   при каждой перерисовке — на длинной ленте это заметная работа впустую. */
const TIME_FMT = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const fmtTime = (ts: number) => TIME_FMT.format(ts);

/* Одна строка ленты в мемоизированном компоненте: без этого каждое новое
   сообщение перерисовывало ВЕСЬ список (сотни узлов) и грузило процессор. */
const FeedRow = React.memo(function FeedRow({
  m,
  view,
  anim,
  mentionHL,
  onModerate,
}: {
  m: ChatMsg;
  view: ChatViewConfig;
  anim: boolean;
  mentionHL: boolean;
  onModerate: (req: ModerationRequest) => void;
}) {
  if (m.kind === "system" || m.kind === "status") {
    return (
      <div
        key={m.id}
        data-cf-row=""
        className={`dw-msg flex items-center gap-2 justify-center text-center ${anim ? effectClass(view.effect) : ""}`}
        style={{ ...effectVars(view.effectSpeed), color: "var(--dw-dim)", fontSize: "0.85em" }}
      >
        <span className="h-px w-8" style={{ background: "var(--dw-line)" }} />
        {m.text}
        <span className="h-px w-8" style={{ background: "var(--dw-line)" }} />
      </div>
    );
  }
  const ks = KIND_STYLE[m.kind];
  const isEvent = !!ks || m.kind === "command";
  // Донат показывается единым форматом: площадка · имя (или «Аноним») ·
  // сумма · сообщение. Площадка видна всегда — иначе непонятно, откуда донат.
  const isDonate = m.kind === "donate";
  const donateAuthor = m.author?.trim() ? m.author : "Аноним";
  const mentioned = mentionHL && !m.deleted && m.kind === "chat" && /@/.test(m.text);
  const sticker = !m.deleted && m.kind === "chat" && isStickerOnly(m.text, m.platform);
  return (
    <div
      key={m.id}
      data-cf-row=""
      className={`y-row dw-msg group selectable leading-snug ${
        isEvent && !m.deleted ? "y-row--event " : ""
      }${mentioned && !m.deleted ? "y-row--mention " : ""}${anim ? effectClass(view.effect) : ""}`}
      style={
        {
          ...effectVars(view.effectSpeed),
          /* Протокол стилей: рецепт стиля (.style-<id> .y-row в index.css)
           строится на этих переменных; в «ручном» виде базовое правило
           .y-row точно воспроизводит прежний вид (--y-bg — тот же фон, что
           раньше стоял инлайном). */
          "--y-bg": m.deleted
            ? "transparent"
            : mentioned
              ? "color-mix(in srgb, var(--dw-accent) 10%, transparent)"
              : view.backdrop
                ? isEvent
                  ? `color-mix(in srgb, ${ks?.tint ?? "#f59e0b"} ${m.kind === "command" ? 6 : 9}%, transparent)`
                  : "var(--dw-panel)"
                : "transparent",
          "--y-ink": "var(--dw-text)",
          "--y-op": view.backdrop && !m.deleted ? 1 : 0,
          "--y-r": `${view.radius}px`,
          "--y-sw": (isEvent || mentioned || view.stripe) && !m.deleted ? "3px" : "0px",
          "--y-sc": isEvent
            ? (ks?.tint ?? "var(--dw-accent)")
            : mentioned
              ? "var(--dw-accent)"
              : platformMeta(m.platform).color,
          "--y-nc": view.accentNick ? m.color : "var(--dw-text)",
          "--y-ts": composeTextShadow(view.outlineWidth, view.textShadow ?? false),
          "--y-tint": ks?.tint ?? "var(--dw-accent)",
          borderBottom: view.separators ? "1px solid var(--dw-line)" : "none",
          opacity: m.deleted ? 0.45 : 1,
        } as React.CSSProperties
      }
    >
      <div
        className="y-line leading-snug break-words"
        style={{ textDecoration: m.deleted ? "line-through" : "none" }}
      >
        {view.showTime && (
          <span
            className="inline-block mr-1 text-[0.78em] tabular-nums align-middle"
            style={{ color: "var(--dw-dim)" }}
          >
            {fmtTime(m.ts)}
          </span>
        )}
        {ks && (
          <span className="inline-flex mr-1 align-middle" style={{ color: ks.tint }}>
            {ks.icon}
          </span>
        )}
        {(view.showPlatform || isDonate) && (
          <span className="inline-flex mr-1 align-middle">
            <PlatformIcon id={m.platform} size={12} />
          </span>
        )}
        {/* Порядок строки: время → площадка → АВАТАР → значки → ник → текст.
              Выравнивание по середине строки (align-middle), а не по базовой
              линии — именно из-за неё аватар раньше съезжал вниз. */}
        {view.showAvatars !== false && !m.deleted && (
          <span className="mr-1.5 inline-flex align-middle">
            <Avatar
              src={m.avatar}
              name={donateAuthor}
              color={m.color}
              size={Math.round(view.fontSize * 1.35)}
            />
          </span>
        )}
        {/* Значки: оригинальные картинки площадки, иначе наши иконки */}
        {view.showBadges && !m.deleted && <ChatBadges msg={m} size={Math.round(view.fontSize * 1.15)} />}
        {/* цвет ника — из протокола стилей (--y-nc + .y-nick в index.css) */}
        <button
          className="y-nick inline cursor-pointer font-semibold hover:underline mr-1"
          onClick={(e) => {
            const r = (e.target as HTMLElement).getBoundingClientRect();
            onModerate({ msg: m, x: r.left, y: r.bottom + 4 });
          }}
          title="Меню модерации"
        >
          {(view.nickCase === "upper" ? donateAuthor.toUpperCase() : donateAuthor) + ":"}
        </button>
        {m.amount !== undefined && (
          <span
            className="inline-block mr-1 rounded px-1 py-px text-[0.85em] font-bold align-baseline"
            style={{ background: "#f59e0b22", color: "#fbbf24" }}
          >
            {m.amount.toLocaleString("ru-RU")} {m.currency}
          </span>
        )}
        <span className="inline">
          {m.deleted ? (
            "сообщение удалено"
          ) : (
            <MsgText text={m.text} platform={m.platform} sticker={sticker} />
          )}
        </span>
      </div>
    </div>
  );
});

/** Сравнение пропсов ленты: статистика каналов не должна её перерисовывать. */
function areFeedPropsEqual(prev: Props, next: Props): boolean {
  return (
    prev.feed === next.feed &&
    prev.view === next.view &&
    prev.maxFeed === next.maxFeed &&
    prev.hideDeleted === next.hideDeleted &&
    prev.mentionHL === next.mentionHL &&
    prev.focus === next.focus &&
    prev.botAuth === next.botAuth &&
    prev.onModerate === next.onModerate &&
    prev.onClear === next.onClear &&
    prev.onChatMode === next.onChatMode &&
    prev.onSend === next.onSend &&
    sameChannelsForFeed(prev.channels, next.channels)
  );
}

/**
 * Равенство каналов «по сути»: для ленты важно, какие площадки подключены,
 * как называется канал и в каком он состоянии. Зрители и число сообщений
 * обновляются у хоста регулярно (и при демо-режиме — постоянно), но лента от
 * них не зависит: без этой проверки каждое обновление статистики заново
 * собирало весь список строк — а их до 120 и больше.
 */
function sameChannelsForFeed(a: Channel[], b: Channel[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    if (
      x.id !== y.id ||
      x.platform !== y.platform ||
      x.username !== y.username ||
      x.status !== y.status ||
      x.title !== y.title ||
      x.currency !== y.currency ||
      x.errorReason !== y.errorReason
    ) {
      return false;
    }
  }
  return true;
}

const ChatFeed = React.memo(function ChatFeed({
  feed,
  channels,
  view,
  maxFeed,
  hideDeleted = false,
  mentionHL = true,
  focus = false,
  onModerate,
  onClear,
  onChatMode,
  botAuth = {},
  onSend,
}: Props) {
  /* Тема ленты: набор цветов из настроек и вид «только текст», когда
     подложка выключена. Шрифт темы подменяет выбранный набор — иначе
     Unbounded или Caveat просто не появятся. */
  const feedStyle = findStyle(FEED_STYLES, view.styleId);
  const feedTone = resolveTone(feedStyle, view.styleTone);
  const feedBare = isBareText(FEED_STYLES, view, !view.backdrop);

  const [modOpen, setModOpen] = useState(false);
  /* Пользовательский шрифт (ссылка Google Fonts) подключается неблокирующим
     <link> — лента на нём появляется, как только шрифт докачается. */
  useWebFont(view.customFont);
  // системные события (подключения, статусы) можно спрятать кнопкой в шапке
  const [hideSystem, setHideSystem] = usePersisted<boolean>("feedHideSystem", false);
  const [query, setQuery] = useState("");
  const [platforms, setPlatforms] = useState<Set<PlatformId>>(new Set());
  const [tab, setTab] = useState<FeedTab>("all");
  const [pinned, setPinned] = useState(true);
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // ref меняется сразу в onScroll и не страдает от задержки React state:
  // это убирает гонку между вставкой сообщения и автопрокруткой.
  const followingBottomRef = useRef(true);

  /* Режим «Только чат» (UI-1.3): панель режимов чата живёт внутри скрытой
     панели инструментов, поэтому в фокусе она закрывается — иначе она
     осталась бы висеть поверх ленты без возможности убрать её кнопкой. */
  useEffect(() => {
    if (focus) setModOpen(false);
  }, [focus]);

  /* Ники, под которыми вы авторизованы: вкладка «@ Упоминания» ищет их.
     Пока входа нет — берём любые упоминания, как подсветка в строке. */
  const meNicks = useMemo(
    () =>
      Object.values(botAuth)
        .map((v) =>
          String(v ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    [botAuth],
  );

  const visible = useMemo(() => {
    let out = feed;
    if (hideSystem) out = out.filter((m) => m.kind !== "system" && m.kind !== "status");
    if (hideDeleted) out = out.filter((m) => !m.deleted);
    if (platforms.size) out = out.filter((m) => m.kind === "system" || platforms.has(m.platform));
    if (tab === "events") {
      out = out.filter((m) => EVENT_KINDS.has(m.kind));
    } else if (tab === "mentions") {
      out = out.filter((m) => {
        if (m.kind !== "chat" || m.deleted) return false;
        const t = String(m.text ?? "").toLowerCase();
        return meNicks.length ? meNicks.some((n) => t.includes("@" + n)) : t.includes("@");
      });
    } else if (tab === "questions") {
      out = out.filter((m) => m.kind === "chat" && !m.deleted && /[?？]/.test(String(m.text ?? "")));
    }
    const q = query.trim().toLowerCase();
    if (q)
      out = out.filter(
        (m) =>
          String(m.text ?? "")
            .toLowerCase()
            .includes(q) ||
          String(m.author ?? "")
            .toLowerCase()
            .includes(q),
      );
    // 0 в настройке — «без ограничения»: лента показывает всю историю, а
    // размер DOM ограничивает окно виртуализации ниже.
    return maxFeed > 0 ? out.slice(-maxFeed) : out;
  }, [feed, query, platforms, tab, meNicks, maxFeed, hideDeleted, hideSystem]);

  /* Окно рендеринга (см. VIRTUALIZE_AT): короткую ленту рендерим целиком,
     длинную — порциями, чтобы в DOM не жила вся история на 400 строк. */
  const end = visible.length;
  const virtualized = end > VIRTUALIZE_AT;
  const bottomStart = Math.max(0, end - WINDOW_SIZE);
  // null = окно следует за последними сообщениями; число = индекс первой
  // отрисованной строки (пользователь читает историю)
  const [winStart, setWinStart] = useState<number | null>(null);
  const s = !virtualized ? 0 : winStart == null ? bottomStart : Math.min(winStart, bottomStart);
  const slice = s > 0 ? visible.slice(s) : visible;
  // Средний рост строки для заполнителя выше окна: плотность × масштаб шрифта
  const rowEstimate = Math.round((ROW_ESTIMATE[view.density] ?? 34) * (view.fontSize / 14));

  /* Лента очищена — окно сбрасываем, чтобы следующий эфир стартовал с хвоста */
  useEffect(() => {
    if (end === 0) setWinStart(null);
  }, [end]);

  /* автопрокрутка: зависим от id последнего сообщения — при лимите ленты
     длина массива не меняется и скролл должен срабатывать всё равно */
  const lastId = visible.length ? visible[visible.length - 1].id : 0;
  const [unread, setUnread] = useState(0);
  /* Когда последняя строка обновилась: только после этого имеет смысл
     догонять низ (эмоуты и картинки подгружаются следом за строкой). */
  const lastMsgAtRef = useRef(0);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !lastId) return;
    lastMsgAtRef.current = Date.now();
    if (pinned && followingBottomRef.current) {
      // До paint: последняя строка сразу целиком внутри viewport, без кадра,
      // где её нижняя часть уже ушла за рамку.
      el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      setAtBottom(true);
      setUnread(0);
    } else {
      // Пользователь прокрутил вверх или выключил автопрокрутку.
      setUnread((n) => Math.min(999, n + 1));
    }
  }, [lastId, pinned]);

  /* Догон низа при изменении высоты содержимого (загрузились эмоуты,
     пришла картинка аватара). ВАЖНО: писать scrollTop на каждое уведомление
     нельзя. Строки с content-visibility при сдвиге прокрутки переключаются
     между «отрисовано» и «пропущено», их высота меняется — наблюдатель
     срабатывает снова, и получается петля: 120+ перерасчётов layout в
     секунду в простое, даже без новых сообщений. Поэтому:
       • реакция не чаще PIN_COOLDOWN_MS;
       • только если высота реально изменилась заметно;
       • только когда низ уже почти в поле зрения. */
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content || typeof ResizeObserver === "undefined") return;

    let frame = 0;
    let lastPinnedAt = 0;
    let lastHeight = 0;
    const mountedAt = Date.now();
    const observer = new ResizeObserver(() => {
      if (!pinned || !followingBottomRef.current) return;
      const now = Date.now();
      /* Новых строк давно нет — значит высота «дышит» из-за переключения
         видимости строк. Это не повод двигать прокрутку. */
      if (now - Math.max(lastMsgAtRef.current, mountedAt) > 2500) return;
      const height = content.scrollHeight;
      if (now - lastPinnedAt < 220) return;
      if (Math.abs(height - lastHeight) < 2) return;
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (gap < 0 || gap > 40) return; // пользователь читает историю — не трогаем
      lastHeight = height;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        lastPinnedAt = Date.now();
        const box = scrollRef.current;
        if (!box) return;
        box.scrollTop = Math.max(0, box.scrollHeight - box.clientHeight);
        setAtBottom(true);
        setUnread(0);
      });
    });
    observer.observe(content);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pinned, view.fontSize, view.spacing, view.density]);

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    followingBottomRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setAtBottom(true);
    setUnread(0);
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    followingBottomRef.current = bottom;
    // Состояние меняем ТОЛЬКО при реальном переключении: раньше setState
    // вызывался на каждое событие прокрутки (в т.ч. при автоскролле)
    // и перерисовывал всю ленту — это давало заметную нагрузку на CPU.
    setAtBottom((prev) => (prev === bottom ? prev : bottom));
    if (bottom) setUnread((n) => (n === 0 ? n : 0));

    /* Окно рендеринга: читая историю и подходя к её верху — расширяем окно
       вверх порцией; вернувшись к последним сообщениям — сжимаем обратно. */
    if (!virtualized) return;
    if (bottom && winStart != null) {
      setWinStart(null);
      return;
    }
    if (
      !bottom &&
      winStart != null &&
      winStart > 0 &&
      !extendingRef.current &&
      el.scrollTop < TOP_BUFFER_PX
    ) {
      const firstRow = contentRef.current?.querySelector<HTMLElement>("[data-cf-row]");
      if (firstRow) {
        // Якорь: верхняя строка текущего окна. После расширения измеряем
        // смещение её позиции и корректируем scrollTop (см. useLayoutEffect).
        extendingRef.current = true;
        extendAnchorRef.current = { el: firstRow, top: firstRow.offsetTop };
        setWinStart(Math.max(0, winStart - EXTEND_SIZE));
      }
    }
  };

  /* Коррекция позиции после расширения окна вверх: новые строки встали над
     текущим содержимым, заполнитель сверху уменьшился — сдвигаем прокрутку
     на разницу, чтобы картинка перед глазами не прыгнула. */
  const extendAnchorRef = useRef<{ el: HTMLElement; top: number } | null>(null);
  const extendingRef = useRef(false);
  useLayoutEffect(() => {
    const anchor = extendAnchorRef.current;
    if (!anchor) return;
    extendAnchorRef.current = null;
    extendingRef.current = false;
    const el = scrollRef.current;
    if (!el || !anchor.el.isConnected) return;
    el.scrollTop += anchor.el.offsetTop - anchor.top;
  }, [s]);

  const onlineSet = useMemo(
    () => new Set(channels.filter((c) => c.status === "online").map((c) => c.platform)),
    [channels],
  );

  /* Кнопки площадок в панели поиска — только те, что реально подключены:
     раньше список был фиксированным и показывал все девять площадок, даже
     если из них подключена одна. Выбранный фильтр остаётся в списке, чтобы
     его всегда можно было снять. */
  const platformChips = useMemo(() => {
    const list = PLATFORMS.map((p) => p.id).filter((id) => channels.some((c) => c.platform === id));
    for (const id of platforms) if (!list.includes(id)) list.push(id);
    return list;
  }, [channels, platforms]);

  const togglePlatform = (id: PlatformId) => {
    setPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* панель инструментов ленты — в режиме «Только чат» её нет (UI-1.3) */}
      {!focus && (
        <div
          className="flex items-center gap-1.5 rounded-xl border px-2 py-1.5"
          style={{ background: "var(--dw-panel)", borderColor: "var(--dw-line)" }}
        >
          <div className="relative min-w-32 flex-1">
            <Search
              size={13}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
              style={{ color: "var(--dw-dim)" }}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по ленте…"
              className="w-full rounded-lg border border-transparent py-1.5 pr-2 pl-7.5 text-[12px] outline-none focus:border-[var(--dw-accent)]"
              style={{ background: "var(--dw-input)", color: "var(--dw-text)" }}
            />
          </div>
          <div className="mx-1 hidden items-center gap-1 md:flex">
            {platformChips.map((id) => {
              const on = platforms.size === 0 || platforms.has(id);
              const live = onlineSet.has(id);

              return (
                <button
                  key={id}
                  onClick={() => togglePlatform(id)}
                  title={platformMeta(id).name}
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-all"
                  style={{
                    background: on ? "var(--dw-input)" : "transparent",
                    opacity: on ? 1 : 0.35,
                    outline: on && platforms.size ? `1px solid ${platformMeta(id).color}55` : "none",
                  }}
                >
                  <span className="relative">
                    <PlatformIcon id={id} size={14} />
                    {live && (
                      <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <IconBtn
              icon={<MessageSquareX size={14} />}
              title={
                hideSystem
                  ? "Системные события скрыты — нажмите, чтобы показать"
                  : "Скрыть системные события (подключения, статусы)"
              }
              active={hideSystem}
              onClick={() => setHideSystem(!hideSystem)}
            />
            <IconBtn
              icon={<ShieldAlert size={14} />}
              title="Модерация чата: режимы канала"
              active={modOpen}
              onClick={() => setModOpen((v) => !v)}
            />
            <IconBtn
              icon={<ArrowDownToLine size={14} />}
              title={pinned ? "Автопрокрутка включена" : "Автопрокрутка выключена"}
              active={pinned}
              onClick={() => {
                const next = !pinned;
                setPinned(next);
                if (next) scrollToBottom();
              }}
            />
            <IconBtn icon={<Eraser size={14} />} title="Очистить ленту" onClick={onClear} />
            {/* воронка: фильтр текущего списка по типу сообщений, без перезагрузки истории */}
            <FeedFunnel tab={tab} onSelect={setTab} />
          </div>
        </div>
      )}

      {modOpen && !focus && (
        <ChatModerationBar
          channels={channels}
          botAuth={botAuth}
          onAction={(action, channel, platform, seconds) => onChatMode?.(action, channel, platform, seconds)}
        />
      )}

      {/* лента */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        data-tone={feedTone}
        data-bare={feedBare ? "1" : undefined}
        className={`min-h-0 flex-1 overflow-y-auto px-1 ${styleClass(view.styleId)} ${
          view.density === "cozy"
            ? "feed-cozy"
            : view.density === "compact"
              ? "feed-compact"
              : view.density === "tight"
                ? "feed-tight"
                : "feed-standard"
        }`}
        style={{
          fontSize: view.fontSize,
          fontFamily: feedStyle?.forceFont ? feedStyle.font : fontStack(view.fontFamily, view.customFont),
          overflowAnchor: "none",
          /* Фон области ленты задаёт стиль (у каждого — свой), в «ручном»
             виде совпадает с фоном приложения, поэтому базово ничего не
             меняется. */
          background: "var(--dw-bg)",
        }}
      >
        <div
          ref={contentRef}
          className="flex min-h-full flex-col"
          style={{
            gap: view.spacing ?? 6,
            paddingTop: (view.spacing ?? 6) === 0 ? 0 : 4,
            // Запас ниже последней строки: текст/outline/эмоут не упирается
            // в границу viewport и всегда отображается целиком.
            paddingBottom: Math.max(8, (view.spacing ?? 6) + 4),
          }}
        >
          {visible.length === 0 && (
            <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-2 opacity-50">
              <MessageSquareX size={28} style={{ color: "var(--dw-dim)" }} />
              <p className="text-[12px]" style={{ color: "var(--dw-dim)" }}>
                {feed.length === 0
                  ? focus
                    ? "Лента пуста — выключите режим «Только чат», чтобы подключить канал"
                    : "Лента пуста — подключите канал слева"
                  : "Нет сообщений по текущим фильтрам"}
              </p>
            </div>
          )}
          {/* Заполнитель под строками, которые не отрисованы (окно длинной
              ленты): держит высоту прокрутки, строки довернутся при
              прокрутке вверх. */}
          {s > 0 && <div aria-hidden="true" style={{ height: s * rowEstimate, flexShrink: 0 }} />}
          {slice.map((m, i) => (
            <FeedRow
              key={m.id}
              m={m}
              view={view}
              anim={view.animations && s + i >= end - 12}
              mentionHL={mentionHL}
              onModerate={onModerate}
            />
          ))}
        </div>
      </div>

      {/* возврат к последним сообщениям — виден всегда, когда лента прокручена */}
      {!atBottom && (
        <div className="pointer-events-none relative h-0">
          <button
            onClick={scrollToBottom}
            className="pop-anim pointer-events-auto absolute bottom-2 left-1/2 flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold shadow-xl transition-all hover:brightness-110"
            style={{
              background: "var(--dw-accent)",
              color: "#fff",
              boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
            }}
          >
            <ArrowDown size={13} />
            {unread > 0 ? `${unread} новых` : "К последним сообщениям"}
          </button>
        </div>
      )}

      {/* строка отправки сообщений в чаты авторизованных каналов */}
      {!focus && <ChatSendBar channels={channels} botAuth={botAuth} onSend={onSend} />}
    </div>
  );
}, areFeedPropsEqual);

export default ChatFeed;

/* ================== отправка сообщения в чат площадки ==================
   Показывается только когда есть каналы с выполненной авторизацией.
   Без авторизации блок просто скрыт — никаких системных сообщений. */

/** Канал отправки. `combined` — строка «Оба канала»: одно сообщение в Twitch и VK. */
type SendTarget = Channel & { combined?: boolean };

/** Идентификатор строки «Оба канала» в списке каналов отправки. */
const BOTH_CHANNELS_ID = "both-channels";

function ChatSendBar({
  channels,
  botAuth,
  onSend,
}: {
  channels: Channel[];
  botAuth: Partial<Record<PlatformId, string>>;
  onSend?: (
    platform: PlatformId,
    channel: string,
    text: string,
    pinDurationSeconds?: number | null,
  ) => Promise<void> | void;
}) {
  const [text, setText] = useState("");
  const [pinDuration, setPinDuration] = useState<number | null | undefined>(undefined);
  const [customPinDuration, setCustomPinDuration] = useState(300);
  const [customPinSelected, setCustomPinSelected] = useState(false);
  const [target, setTarget] = useState<string>("");
  const [sending, setSending] = useState(false);

  /* Показываем все каналы, куда приложение умеет отправлять сообщения и для
     которых выполнен вход: Twitch и VK Видео Live. Статус эфира не важен для
     списка; VK сообщит, если отправка невозможна вне трансляции. */
  const targets = useMemo<SendTarget[]>(() => {
    const list: SendTarget[] = channels.filter(
      (c) => (c.platform === "twitch" || c.platform === "vkplay") && !!botAuth[c.platform]?.trim(),
    );
    for (const [platform, account] of Object.entries(botAuth)) {
      if (platform !== "twitch" && platform !== "vkplay") continue;
      const name = String(account ?? "").trim();
      if (!name) continue;
      const exists = list.some(
        (c) => c.platform === platform && c.username.toLowerCase() === name.toLowerCase(),
      );
      if (!exists) {
        list.push({
          id: `auth-${platform}-${name}`,
          platform,
          username: name,
          status: "connected",
          viewers: 0,
          messages: 0,
        });
      }
    }
    /* Оба чата есть — добавляем выбор «Оба канала»: одно сообщение уходит и в
       Twitch, и в VK Видео Live. Строка стоит первой в списке, но выбор по
       умолчанию остаётся за конкретным каналом, как и раньше. */
    const hasTwitch = list.some((c) => c.platform === "twitch");
    const hasVk = list.some((c) => c.platform === "vkplay");
    if (hasTwitch && hasVk) {
      list.unshift({
        id: BOTH_CHANNELS_ID,
        platform: "twitch",
        username: "Twitch + VK Видео Live",
        title: "Оба канала",
        status: "connected",
        viewers: 0,
        messages: 0,
        combined: true,
      });
    }
    return list;
  }, [channels, botAuth]);

  /* Первый канал площадки — один адрес на площадку: в «Оба канала» уходит по
     одному сообщению в Twitch и в VK, а не во все подключённые чаты сразу. */
  const channelFor = (platform: "twitch" | "vkplay") =>
    targets.find((t) => !t.combined && t.platform === platform);

  const current = targets.find((t) => t.id === target) ?? targets.find((t) => !t.combined) ?? targets[0];
  /* Строка ввода видна ВСЕГДА. Без авторизации она просто заблокирована и
     подсказывает, что нужно войти — в ленту при этом ничего не пишется. */
  const ready = !!current && !!onSend;

  useEffect(() => {
    if (current && current.id !== target) setTarget(current.id);
  }, [current, target]);

  const submit = async () => {
    const body = text.trim();
    if (!body || !current || sending || !onSend) return;
    setSending(true);
    try {
      if (current.combined) {
        /* «Оба канала»: по одному сообщению в Twitch и в VK Видео Live.
           Закрепление — только у Twitch: VK его не поддерживает. */
        const listed = [channelFor("twitch"), channelFor("vkplay")].filter((t): t is SendTarget => !!t);
        const results = await Promise.allSettled(
          listed.map((t) =>
            Promise.resolve(
              onSend(t.platform, t.username, body, t.platform === "twitch" ? pinDuration : undefined),
            ),
          ),
        );
        const failed = results.filter((r) => r.status === "rejected");
        if (results.length > 0 && failed.length === results.length && failed[0]) {
          throw (failed[0] as PromiseRejectedResult).reason;
        }
        setText("");
        return;
      }
      await onSend(current.platform, current.username, body, pinDuration);
      setText("");
    } catch {
      // Отправитель уже показал причину ошибки; оставляем текст для повтора.
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="flex shrink-0 items-center gap-1.5 border-t px-2 py-1.5"
      style={{ borderColor: "var(--dw-line)", background: "var(--dw-panel)" }}
    >
      <ChatTargetPicker
        targets={targets}
        current={current}
        onSelect={setTarget}
        disabled={!ready || sending}
      />

      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        maxLength={480}
        disabled={!ready}
        placeholder={
          ready
            ? current?.combined
              ? "Сообщение сразу в Twitch и VK Видео Live…"
              : `Сообщение в чат ${current?.username ?? ""}…`
            : "Войдите в чат-бот в настройках, чтобы писать в чат"
        }
        className="min-w-0 flex-1 rounded-lg border border-transparent px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[var(--dw-accent)] disabled:cursor-not-allowed disabled:opacity-60"
        style={{ background: "var(--dw-input)", color: "var(--dw-text)" }}
      />

      {(current?.platform === "twitch" || current?.combined) && (
        <>
          <select
            value={
              customPinSelected
                ? "custom"
                : pinDuration === undefined
                  ? "none"
                  : pinDuration === null
                    ? "end"
                    : String(pinDuration)
            }
            onChange={(e) => {
              const value = e.target.value;
              setCustomPinSelected(value === "custom");
              setPinDuration(
                value === "none"
                  ? undefined
                  : value === "end"
                    ? null
                    : value === "custom"
                      ? customPinDuration
                      : Number(value),
              );
            }}
            disabled={!ready || sending}
            title="Закрепить отправленное сообщение в Twitch"
            className="max-w-[150px] shrink-0 cursor-pointer rounded-lg border border-transparent px-2 py-1.5 text-[11px] outline-none disabled:opacity-50"
            style={{ background: "var(--dw-input)", color: "var(--dw-text)" }}
          >
            <option value="none" style={{ color: "#000" }}>
              Без закрепления
            </option>
            <option value="end" style={{ color: "#000" }}>
              Закрепить до конца эфира
            </option>
            <option value="30" style={{ color: "#000" }}>
              Закрепить на 30 секунд
            </option>
            <option value="60" style={{ color: "#000" }}>
              Закрепить на 1 минуту
            </option>
            <option value="300" style={{ color: "#000" }}>
              Закрепить на 5 минут
            </option>
            <option value="600" style={{ color: "#000" }}>
              Закрепить на 10 минут
            </option>
            <option value="1800" style={{ color: "#000" }}>
              Закрепить на 30 минут
            </option>
            <option value="custom" style={{ color: "#000" }}>
              Выбрать время…
            </option>
          </select>
          {customPinSelected && (
            <input
              type="number"
              min={30}
              max={1800}
              value={customPinDuration}
              onChange={(e) => {
                const value = Math.min(1800, Math.max(30, Number(e.target.value) || 30));
                setCustomPinDuration(value);
                setPinDuration(value);
              }}
              title="Время закрепления в секундах"
              className="w-[72px] rounded-lg px-2 py-1.5 text-[11px] outline-none"
              style={{ background: "var(--dw-input)", color: "var(--dw-text)" }}
            />
          )}
        </>
      )}

      <button
        onClick={() => void submit()}
        disabled={!ready || !text.trim() || sending}
        title="Отправить (Enter)"
        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold text-[var(--dw-accent-ink)] transition-all hover:brightness-110 disabled:cursor-default disabled:opacity-45"
        style={{ background: "var(--dw-accent)" }}
      >
        <Send size={13} />
        <span className="hidden sm:inline">{sending ? "Отправка…" : "Отправить"}</span>
      </button>
    </div>
  );
}

/** Кастомный список каналов: наследует тему приложения и показывает иконки. */
function ChatTargetPicker({
  targets,
  current,
  onSelect,
  disabled,
}: {
  targets: SendTarget[];
  current?: SendTarget;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  /** Значок площадки: у строки «Оба канала» — обе иконки рядом. */
  const targetIcon = (target: SendTarget, size: number) =>
    target.combined ? (
      <span className="flex items-center -space-x-1">
        <PlatformIcon id="twitch" size={size} />
        <PlatformIcon id="vkplay" size={size} />
      </span>
    ) : (
      <PlatformIcon id={target.platform} size={size} />
    );
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative z-20 shrink-0">
      <button
        type="button"
        onClick={() => {
          if (targets.length > 1 && !disabled) setOpen((value) => !value);
        }}
        disabled={disabled || targets.length === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={
          current
            ? current.combined
              ? "Куда отправить: оба канала — Twitch и VK Видео Live"
              : `Куда отправить: ${platformMeta(current.platform).name} · ${current.title || current.username}`
            : "Войдите в чат-бот, чтобы писать в чат"
        }
        className={`flex max-w-[210px] items-center gap-1.5 rounded-lg border border-transparent px-2 py-1 transition-colors hover:bg-[var(--dw-hover)] disabled:cursor-default disabled:opacity-70 ${
          targets.length > 1 && !disabled ? "cursor-pointer" : "cursor-default"
        }`}
        style={{ background: "var(--dw-input)", color: "var(--dw-text)" }}
      >
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
          style={{
            background: current
              ? current.combined
                ? "color-mix(in srgb, var(--dw-accent) 18%, var(--dw-panel2))"
                : `${platformMeta(current.platform).color}1f`
              : "var(--dw-panel2)",
            color: current
              ? current.combined
                ? "var(--dw-text)"
                : platformMeta(current.platform).color
              : "var(--dw-dim)",
          }}
        >
          {current ? targetIcon(current, 12) : <Send size={12} />}
        </span>
        <span className="flex min-w-0 flex-col items-start leading-tight">
          <span className="max-w-[150px] truncate text-[9px]" style={{ color: "var(--dw-dim)" }}>
            {current
              ? current.combined
                ? "Оба канала"
                : platformMeta(current.platform).name
              : "Канал отправки"}
          </span>
          <span className="max-w-[150px] truncate text-[11px] font-semibold">
            {current?.combined
              ? "Twitch + VK Видео Live"
              : current?.title || current?.username || "нет входа"}
          </span>
        </span>
        {targets.length > 1 && (
          <ChevronDown size={12} className="shrink-0" style={{ color: "var(--dw-dim)" }} />
        )}
      </button>

      {open && targets.length > 1 && (
        <div
          role="listbox"
          aria-label="Канал для отправки сообщения"
          className="absolute bottom-full left-0 mb-1 max-h-64 min-w-[230px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl border p-1 shadow-2xl"
          style={{ background: "var(--dw-panel2)", borderColor: "var(--dw-line)" }}
        >
          {targets.map((target) => {
            const selected = target.id === current?.id;
            const meta = platformMeta(target.platform);
            return (
              <button
                key={target.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onSelect(target.id);
                  setOpen(false);
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--dw-hover)]"
                style={{
                  background: selected
                    ? "color-mix(in srgb, var(--dw-accent) 15%, var(--dw-panel2))"
                    : "transparent",
                  color: "var(--dw-text)",
                }}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: target.combined
                      ? "color-mix(in srgb, var(--dw-accent) 18%, var(--dw-panel2))"
                      : `${meta.color}1f`,
                  }}
                >
                  {targetIcon(target, 13)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className="text-[10px]"
                    style={{ color: target.combined ? "var(--dw-accent-2)" : meta.color }}
                  >
                    {target.combined ? "Оба канала" : meta.name}
                  </span>
                  <span className="truncate text-[11.5px] font-semibold">
                    {target.combined ? "Twitch + VK Видео Live" : target.title || target.username}
                  </span>
                </span>
                {selected && <Check size={13} className="shrink-0" style={{ color: "var(--dw-accent-2)" }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- текст сообщения с эмоутами/стикерами площадки ---------- */
export function MsgText({
  text,
  platform,
  sticker,
  eager,
  emoteSize,
}: {
  text: string;
  platform: PlatformId;
  sticker?: boolean;
  /** свежее сообщение: смайлы грузим сразу, не дожидаясь прокрутки */
  eager?: boolean;
  /** высота смайла в em: переопределяет обычную и «стикерную» */
  emoteSize?: number;
}) {
  // если картинка эмоута не загрузилась — показываем его код текстом.
  // ВАЖНО: только через состояние React. Прямая мутация DOM (replaceWith)
  // ломала дерево и роняла всё окно в белый экран.
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const parts = parseMessage(String(text ?? ""), platform);

  return (
    <>
      {parts.map((p, i) =>
        p.kind === "emote" ? (
          broken[p.url] ? (
            <span key={i}>:{p.code}:</span>
          ) : (
            <img
              key={i}
              src={p.url}
              alt={`:${p.code}:`}
              title={`:${p.code}:`}
              loading={eager || sticker ? "eager" : "lazy"}
              decoding="async"
              draggable={false}
              className="mx-px inline-block select-none"
              style={{
                height: emoteSize ? `${emoteSize}em` : sticker ? "2.3em" : "1.45em",
                width: "auto",
                /* Крупный смайл растёт ТОЛЬКО вверх: низ картинки стоит на
                   базовой линии текста. Отрицательных отступов нет, поэтому
                   соседние сообщения не перекрываются. */
                verticalAlign: emoteSize ? "baseline" : "-0.28em",
              }}
              onError={() => setBroken((prev) => (prev[p.url] ? prev : { ...prev, [p.url]: true }))}
            />
          )
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/* ---------- всплывающее меню модерации ---------- */
export function ModerationMenu({
  req,
  onAction,
  onClose,
  ttsMuted = [],
  onToggleTtsMute,
  voicePicker = false,
  onVoiceToast,
}: {
  req: ModerationRequest;
  onAction: (action: string, msg: ChatMsg, arg?: number) => void;
  onClose: () => void;
  /** ники в нижнем регистре, чья озвучка выключена */
  ttsMuted?: string[];
  onToggleTtsMute?: (author: string) => void;
  /** показать выбор персонального голоса (десктоп + движок Edge) */
  voicePicker?: boolean;
  onVoiceToast?: (text: string) => void;
}) {
  const { msg } = req;
  const canModerate = msg.platform === "twitch" || (msg.platform === "vkplay" && msg.kind === "chat");
  const muted = ttsMuted.includes(
    String(msg.author ?? "")
      .trim()
      .toLowerCase(),
  );

  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);

  const w = 218;
  const x = Math.min(req.x, window.innerWidth - w - 10);
  const y = Math.min(req.y, window.innerHeight - 320);

  const Item = ({
    icon,
    label,
    danger,
    onClick,
  }: {
    icon: React.ReactNode;
    label: string;
    danger?: boolean;
    onClick?: () => void;
  }) => (
    <button
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--dw-hover)]"
      style={{ color: danger ? "#f87171" : "var(--dw-text)" }}
    >
      <span style={{ color: danger ? "#f87171" : "var(--dw-dim)" }}>{icon}</span>
      {label}
    </button>
  );

  return (
    <div
      className="pop-anim fixed z-[90] rounded-xl border p-1.5 shadow-2xl"
      style={{ background: "var(--dw-panel2)", borderColor: "var(--dw-line)", width: w, left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: msg.color }} />
        <span className="truncate text-[12px] font-semibold" style={{ color: "var(--dw-text)" }}>
          {msg.author}
        </span>
        <span className="ml-auto opacity-70">
          <PlatformIcon id={msg.platform} size={11} />
        </span>
      </div>
      {msg.platform === "vkplay" && canModerate && (
        <p
          className="mx-1.5 mb-1 rounded-lg px-2 py-1.5 text-[10.5px] leading-snug"
          style={{
            color: "#fbbf24",
            background: "color-mix(in srgb, #f59e0b 12%, transparent)",
          }}
        >
          Для VK оставлена команда «Забанить». Она отправляется через чат API; если VK не распознает /ban,
          команда появится как обычное сообщение. Результат автоматически не подтверждается.
        </p>
      )}
      {canModerate ? (
        <>
          {msg.platform === "twitch" && (
            <>
              <div
                className="px-2.5 pt-1 pb-0.5 text-[10px] font-semibold tracking-wider uppercase"
                style={{ color: "var(--dw-dim)" }}
              >
                Таймаут
              </div>
              <div className="flex gap-1 px-1 pb-1">
                {[
                  ["60с", 60],
                  ["10м", 600],
                  ["1ч", 3600],
                ].map(([l, s]) => (
                  <button
                    key={String(l)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => onAction("timeout", msg, s as number)}
                    className="flex-1 cursor-pointer rounded-lg py-1 text-[11px] font-medium transition-colors hover:bg-[var(--dw-hover)]"
                    style={{ background: "var(--dw-input)", color: "var(--dw-text)" }}
                  >
                    <Timer size={10} className="mr-0.5 inline" /> {l}
                  </button>
                ))}
              </div>
            </>
          )}
          <Item icon={<Ban size={13} />} label="Забанить" danger onClick={() => onAction("ban", msg)} />
          {msg.platform === "twitch" && (
            <>
              <Item icon={<UserX size={13} />} label="Разбанить" onClick={() => onAction("unban", msg)} />
              <Item
                icon={<Gavel size={13} />}
                label="Удалить сообщение"
                danger
                onClick={() => onAction("delete", msg)}
              />
            </>
          )}
        </>
      ) : (
        <p className="px-2.5 py-2 text-[11.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
          Отдельные действия модерации для этой площадки пока недоступны. Общие режимы чата — в панели над
          лентой.
        </p>
      )}
      {/* ---------- озвучка: доступна для всех площадок ---------- */}
      <div
        className="mt-1 border-t px-2.5 pt-1.5 pb-0.5 text-[10px] font-semibold tracking-wider uppercase"
        style={{ borderColor: "var(--dw-line)", color: "var(--dw-dim)" }}
      >
        Озвучка
      </div>
      <Item
        icon={muted ? <Volume2 size={13} /> : <VolumeX size={13} />}
        label={muted ? "Включить озвучку" : "Выключить озвучку"}
        onClick={() => onToggleTtsMute?.(msg.author)}
      />
      {voicePicker && <VoiceAssignRow user={msg.author} onToast={onVoiceToast} />}
    </div>
  );
}

/* ---------- персональный голос зрителя прямо из ленты ---------- */
function VoiceAssignRow({ user, onToast }: { user: string; onToast?: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [voices, setVoices] = useState<HostVoice[]>([]);
  const [assigned, setAssigned] = useState<{ user: string; voice: string; title: string }[]>([]);
  const [loaded, setLoaded] = useState(false);

  const key = String(user ?? "")
    .trim()
    .toLowerCase();
  const current = assigned.find((a) => a.user === key);

  const toggle = () => {
    if (!open && !loaded && isDesktop()) {
      void ttsBridge
        .userVoices()
        .then((r) => {
          setVoices(r.voices ?? []);
          setAssigned(r.assigned ?? []);
        })
        .catch(() => undefined)
        .finally(() => setLoaded(true));
    }
    setOpen(!open);
  };

  const assign = (voiceId: string, title: string) => {
    void ttsBridge
      .setUserVoice(user, voiceId)
      .then(() => {
        if (!voiceId) {
          setAssigned((p) => p.filter((a) => a.user !== key));
          onToast?.(`Голос ${user} сброшен к обычному`);
        } else {
          setAssigned((p) => [...p.filter((a) => a.user !== key), { user: key, voice: voiceId, title }]);
          onToast?.(`${user}: голос «${title}»`);
        }
        setOpen(false);
      })
      .catch(() => onToast?.("Не удалось назначить голос"));
  };

  return (
    <div className="pb-1">
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={toggle}
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--dw-hover)]"
        style={{ color: "var(--dw-text)" }}
      >
        <span style={{ color: "var(--dw-dim)" }}>
          <ChevronDown
            size={13}
            className={open ? "rotate-180 transition-transform" : "transition-transform"}
          />
        </span>
        <span className="min-w-0 flex-1 truncate">Голос: {current ? current.title : "обычный"}</span>
      </button>
      {open && (
        <div
          className="mx-1 mt-0.5 max-h-44 overflow-y-auto rounded-lg p-1"
          style={{ background: "var(--dw-input)" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {!loaded ? (
            <p
              className="flex items-center gap-1.5 px-2 py-1.5 text-[11.5px]"
              style={{ color: "var(--dw-dim)" }}
            >
              <Loader2 size={12} className="animate-spin" /> Загружаем голоса…
            </p>
          ) : (
            <>
              {current && (
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => assign("", "")}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] transition-colors hover:bg-[var(--dw-hover)]"
                  style={{ color: "var(--dw-dim)" }}
                >
                  Сбросить к обычному
                </button>
              )}
              {voices.map((v) => (
                <button
                  key={v.id}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => assign(v.id, v.title)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] transition-colors hover:bg-[var(--dw-hover)]"
                  style={{ color: "var(--dw-text)" }}
                >
                  <span className="min-w-0 flex-1 truncate">{v.title}</span>
                  {current?.voice === v.id && <Check size={12} style={{ color: "var(--dw-accent-2)" }} />}
                </button>
              ))}
              {voices.length === 0 && (
                <p className="px-2 py-1.5 text-[11.5px]" style={{ color: "var(--dw-dim)" }}>
                  Голоса недоступны
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
