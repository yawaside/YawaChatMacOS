import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowDownToLine,
  Check,
  Eraser,
  Eye,
  EyeOff,
  ShieldAlert,
  HandCoins,
  Crown,
  Gift,
  LogIn,
  MoreHorizontal,
  Paperclip,
  Send,
  SendHorizontal,
  Smile,
  Zap,
} from "lucide-react";
import { Avatar, ChatModerationBar, MsgText } from "./ChatFeed";
import { ChatBadges } from "../../lib/badges";
import { fontStack } from "../../lib/fonts";
import { isStickerOnly } from "../../lib/emotes";
import { PlatformIcon, platformMeta } from "../../lib/platforms";
import type { ChatMsg, ChatViewConfig, Channel, ModerationRequest, PlatformId } from "../../lib/types";

/**
 * Лента нового интерфейса: крупные строки с аватаром и меткой площадки,
 * отдельные полосы для событий (донат, подписка, награда) и своя строка
 * отправки с выбором канала.
 *
 * Данные и действия прежние: сообщения приходят из коннекторов, ник открывает
 * меню модерации, отправка идёт через тот же мост. Меняется только вид.
 */

const EVENT_KINDS = new Set(["donate", "sub", "reward", "gift", "raid", "join"]);

const KIND: Record<string, { icon: React.ReactNode; tint: string }> = {
  donate: { icon: <HandCoins size={12} />, tint: "#fbbf24" },
  sub: { icon: <Crown size={12} />, tint: "#a78bfa" },
  gift: { icon: <Gift size={12} />, tint: "#f472b6" },
  raid: { icon: <Zap size={12} />, tint: "#38bdf8" },
  join: { icon: <LogIn size={12} />, tint: "#60a5fa" },
  reward: { icon: <Zap size={12} />, tint: "#7c9cff" },
};

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export interface ShellFeedProps {
  feed: ChatMsg[];
  channels: Channel[];
  botAuth: Partial<Record<PlatformId, string>>;
  maxFeed: number;
  hideDeleted?: boolean;
  mentionHL?: boolean;
  /** «Воздух» показывает время в строке, «Студия» — слева колонкой */
  layout: "air" | "studio" | "mac";
  composer?: boolean;
  view?: ChatViewConfig;
  onClear?: () => void;
  onChatMode?: (action: string, channel: string, platform: PlatformId, seconds?: number) => void;
  onModerate: (req: ModerationRequest) => void;
  onSend?: (
    platform: PlatformId,
    channel: string,
    text: string,
    pinDurationSeconds?: number | null,
  ) => Promise<void> | void;
  emptyHint?: string;
}

export default function ShellFeed({
  feed,
  channels,
  botAuth,
  maxFeed,
  hideDeleted,
  mentionHL = true,
  layout,
  composer = true,
  view,
  onClear,
  onChatMode,
  onModerate,
  onSend,
  emptyHint,
}: ShellFeedProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  /** автопрокрутка: пока включена, лента держится за последним сообщением */
  const [follow, setFollow] = useState(true);
  const [unread, setUnread] = useState(0);
  const [hideSystem, setHideSystem] = useState(false);
  const [modOpen, setModOpen] = useState(false);

  const visible = useMemo(() => {
    let out = feed;
    if (hideDeleted) out = out.filter((m) => !m.deleted);
    if (hideSystem) out = out.filter((m) => m.kind !== "system" && m.kind !== "status");
    return maxFeed > 0 ? out.slice(-maxFeed) : out;
  }, [feed, hideDeleted, hideSystem, maxFeed]);

  const lastId = visible.length ? visible[visible.length - 1].id : 0;

  useEffect(() => {
    if (!follow) {
      setUnread((n) => n + 1);
      return;
    }
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    setAtBottom(true);
    setUnread(0);
  }, [lastId, follow]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAtBottom(near);
    if (!near) setFollow(false);
    if (near) setUnread(0);
  };

  const jump = () => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    setAtBottom(true);
    setFollow(true);
    setUnread(0);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={`flex items-center gap-1 px-2 pb-1 opacity-55 transition-opacity hover:opacity-100 ${
          layout === "studio" ? "" : "px-4"
        }`}
      >
        <FeedTool
          icon={hideSystem ? <Eye size={12} /> : <EyeOff size={12} />}
          title={hideSystem ? "Показать системные события" : "Скрыть системные события"}
          on={hideSystem}
          onClick={() => setHideSystem((v) => !v)}
        />
        <FeedTool
          icon={<ShieldAlert size={12} />}
          title="Режимы модерации канала"
          on={modOpen}
          onClick={() => setModOpen((v) => !v)}
        />
        <FeedTool
          icon={<ArrowDownToLine size={12} />}
          title={follow ? "Автопрокрутка включена" : "Автопрокрутка выключена"}
          on={!follow}
          onClick={() => {
            if (follow) {
              setFollow(false);
            } else {
              setFollow(true);
              jump();
            }
          }}
        />
        {onClear && <FeedTool icon={<Eraser size={12} />} title="Очистить ленту" onClick={onClear} />}
        <span className="ml-auto text-[10px] tabular-nums" style={{ color: "var(--dw-dim)" }}>
          {visible.length}
        </span>
      </div>

      {modOpen && (
        <div className="px-2 pb-1">
          <ChatModerationBar
            channels={channels}
            botAuth={botAuth}
            onAction={(action, channel, platform, seconds) =>
              onChatMode?.(action, channel, platform, seconds)
            }
          />
        </div>
      )}

      <div
        ref={scroller}
        onScroll={onScroll}
        className="relative min-h-0 flex-1 overflow-y-auto"
        style={{
          overflowAnchor: "none",
          fontFamily: view ? fontStack(view.fontFamily, view.customFont) : undefined,
        }}
      >
        <div
          className="flex flex-col"
          style={{ gap: view?.spacing ?? (layout === "studio" ? 3 : layout === "mac" ? 5 : 4) }}
        >
          {visible.length === 0 && (
            <p className="px-3 py-6 text-center text-[12px]" style={{ color: "var(--dw-dim)" }}>
              {emptyHint ?? "сообщений пока нет"}
            </p>
          )}
          {visible.map((m, i) => (
            <ShellRow
              key={m.id}
              m={m}
              layout={layout}
              fontSize={view?.fontSize}
              mentionHL={mentionHL}
              eager={i >= visible.length - 20}
              onModerate={onModerate}
            />
          ))}
        </div>
      </div>

      {(!atBottom || !follow) && (
        <div className="pointer-events-none relative h-0">
          <button
            onClick={jump}
            className="pointer-events-auto absolute bottom-2 left-1/2 flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold shadow-xl"
            style={{ background: "var(--dw-accent)", color: "var(--dw-accent-ink)" }}
          >
            <ArrowDown size={13} />
            {unread > 0 ? `${unread} новых` : "К последним"}
          </button>
        </div>
      )}

      {composer && (
        <ShellComposer
          channels={channels}
          botAuth={botAuth}
          onSend={onSend}
          compact={layout === "studio"}
          mac={layout === "mac"}
        />
      )}
    </div>
  );
}

function FeedTool({
  icon,
  title,
  on,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  on?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex h-5 w-5 cursor-pointer items-center justify-center rounded transition-colors hover:bg-[var(--dw-hover)]"
      style={{ color: on ? "var(--dw-accent)" : "var(--dw-dim)" }}
    >
      {icon}
    </button>
  );
}

function ShellRow({
  m,
  layout,
  fontSize,
  mentionHL,
  eager,
  onModerate,
}: {
  m: ChatMsg;
  layout: "air" | "studio" | "mac";
  fontSize?: number;
  /** свежая строка: картинки грузим сразу */
  eager?: boolean;
  mentionHL: boolean;
  onModerate: (req: ModerationRequest) => void;
}) {
  const meta = platformMeta(m.platform);
  const isEvent = !!m.kind && EVENT_KINDS.has(m.kind);
  const ks = isEvent ? KIND[m.kind as string] : undefined;
  const tint = ks?.tint ?? meta.color;
  const mentioned = mentionHL && !m.deleted && /@\w+/.test(String(m.text ?? ""));
  const openMenu = (e: React.MouseEvent<HTMLElement>) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onModerate({ msg: m, x: r.left, y: r.bottom + 4 });
  };
  const size = fontSize ?? (layout === "studio" ? 13 : 13.5);

  /* системные события — тихая пилюля по центру, без автора */
  if (m.kind === "system" || m.kind === "status") {
    return (
      <div className="flex justify-center px-3 py-[3px]">
        <span
          className="max-w-[85%] truncate rounded-full px-2.5 py-[3px] text-[10.5px]"
          style={{ background: "var(--dw-panel2)", color: "var(--dw-dim)" }}
          title={m.text}
        >
          {m.text || fmtTime(m.ts)}
        </span>
      </div>
    );
  }

  const amountLabel =
    m.kind === "donate" && m.amount !== undefined
      ? `${m.amount.toLocaleString("ru-RU")} ${m.currency ?? ""}`.trim()
      : m.kind === "sub"
        ? "подписка"
        : m.kind === "reward"
          ? "награда"
          : m.kind === "gift"
            ? "подарок"
            : m.kind === "raid"
              ? "рейд"
              : null;

  /* ---------- «macOS»: круглая аватарка с бейджем площадки ---------- */
  if (layout === "mac") {
    const stickerOnly = isStickerOnly(String(m.text ?? ""), m.platform);
    const stickerEm = 3.9;
    return (
      <div
        className="mac-msg group relative mx-1 flex items-start gap-2.5 rounded-[12px] px-2.5 py-[7px] ring-1 ring-white/[0.08] ring-inset transition-colors hover:bg-white/[0.09]"
        style={{
          background: mentioned
            ? "color-mix(in srgb, var(--dw-accent) 16%, rgba(255,255,255,0.07))"
            : isEvent && !m.deleted
              ? `color-mix(in srgb, ${tint} 13%, rgba(255,255,255,0.07))`
              : "rgba(255,255,255,0.07)",
          boxShadow: isEvent && !m.deleted ? `inset 3px 0 0 ${tint}` : undefined,
          opacity: m.deleted ? 0.5 : 1,
          /* вибрантность: полупрозрачная плашка на размытии */
          backdropFilter: "blur(14px) saturate(1.4)",
          WebkitBackdropFilter: "blur(14px) saturate(1.4)",
          /* стикер растёт вверх: даём строке воздух */
          paddingTop: stickerOnly && !m.deleted ? 8 : undefined,
        }}
        onDoubleClick={openMenu}
      >
        <span className="relative inline-block shrink-0 align-middle">
          <Avatar
            src={m.avatar}
            name={m.author}
            color={m.color || meta.color}
            size={26}
            square={false}
            eager={eager}
          />
          <span
            className="absolute -right-1 -bottom-1 grid h-[15px] w-[15px] place-items-center rounded-full bg-[#1C1C1F] ring-1 ring-black/50"
            title={meta.name}
          >
            <PlatformIcon id={m.platform} size={9} />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <button
              onClick={openMenu}
              className="cursor-pointer truncate font-semibold hover:underline"
              style={{
                color: `color-mix(in srgb, ${m.color || meta.color} 74%, var(--dw-text))`,
                fontSize: size,
              }}
              title="Меню модерации"
            >
              {m.author}
            </button>
            <ChatBadges msg={m} size={13} max={4} />
            <span
              className="ml-auto w-8 shrink-0 text-right text-[10px] leading-none tabular-nums opacity-0 transition-opacity select-none group-hover:opacity-50"
              style={{ color: "var(--dw-dim)" }}
              title={new Date(m.ts).toLocaleString("ru-RU")}
            >
              {fmtTime(m.ts)}
            </span>
          </div>
          <div
            className="mt-[1px] leading-snug"
            style={{
              fontSize: size,
              textDecoration: m.deleted ? "line-through" : "none",
              color: "var(--dw-text)",
            }}
          >
            {amountLabel && (
              <span
                className="mr-1 inline-flex items-center gap-1 rounded-md px-1.5 align-middle text-[9.5px] leading-[1.4] font-bold"
                style={{
                  background: `color-mix(in srgb, ${tint} 18%, transparent)`,
                  color: `color-mix(in srgb, ${tint} 62%, var(--dw-text))`,
                }}
              >
                {ks?.icon}
                {amountLabel}
              </span>
            )}
            {m.deleted ? (
              <span style={{ color: "var(--dw-dim)" }}>сообщение удалено</span>
            ) : (
              <span className="whitespace-pre-wrap">
                <MsgText
                  text={String(m.text ?? "")}
                  platform={m.platform}
                  eager={eager}
                  emoteSize={stickerOnly ? stickerEm : undefined}
                />
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* --------------------------- строка сообщения ---------------------------
     Всё одной строкой, как в обычном чате: время, аватар, значки, ник и
     текст. Элементы встроенные (inline), поэтому перенос текста идёт под
     ником, а межстрочный интервал остаётся ровным при любой длине.
     Стикер-сообщение: сначала крупный стикер, под ним — подпись строкой. */
  const studio = layout === "studio";
  const avatarSize = studio ? 15 : 17;
  /* сообщение только из смайлов — «стикер»: картинка крупная и растёт
     вверх от базовой линии (см. MsgText), поэтому соседние сообщения не
     перекрываются. Размер разный у видов: «Воздух» просторнее. */
  const stickerOnly = isStickerOnly(String(m.text ?? ""), m.platform);
  const stickerEm = studio ? 3.3 : 3.9;

  const caption = (
    <p
      className="m-0 break-words"
      style={{
        fontSize: size,
        /* единый интервал у всех строк: его задаёт только текст, поэтому
           высокий аватар или значки его не растягивают */
        lineHeight: 1.6,
        textDecoration: m.deleted ? "line-through" : "none",
        color: "var(--dw-text)",
      }}
    >
      <span
        className="mr-1.5 inline-block w-[30px] text-right align-middle text-[10px] leading-none tabular-nums"
        style={{ color: "var(--dw-dim)" }}
        title={new Date(m.ts).toLocaleString("ru-RU")}
      >
        {fmtTime(m.ts)}
      </span>
      <span className="mr-1 inline-block align-middle">
        <Avatar
          src={m.avatar}
          name={m.author}
          color={m.color || meta.color}
          size={avatarSize}
          square={studio}
          eager={eager}
        />
      </span>
      {/* цвет площадки подмешиваем к цвету текста: тёмные логотипы
          (Rutube) на тёмной палитре иначе пропадают */}
      <span className="mr-1 inline-block align-middle" title={meta.name}>
        <PlatformIcon
          id={m.platform}
          size={studio ? 12 : 13}
          color={`color-mix(in srgb, ${meta.color} 62%, var(--dw-text))`}
        />
      </span>
      <ChatBadges msg={m} size={studio ? 12 : 14} max={studio ? 4 : 5} />
      <button
        onClick={openMenu}
        className="cursor-pointer font-bold hover:underline"
        style={{ color: `color-mix(in srgb, ${m.color || meta.color} 58%, var(--dw-text))` }}
        title="Меню модерации"
      >
        {m.author}
      </button>
      <span style={{ color: "var(--dw-dim)" }}>:</span>{" "}
      {amountLabel && (
        <span
          className="mr-1 inline-flex items-center gap-1 rounded px-1.5 align-middle text-[9.5px] leading-[1.4] font-bold"
          style={{
            background: `color-mix(in srgb, ${tint} 16%, transparent)`,
            color: `color-mix(in srgb, ${tint} 55%, var(--dw-text))`,
          }}
        >
          {ks?.icon}
          {amountLabel}
        </span>
      )}
      {m.deleted ? (
        <span style={{ color: "var(--dw-dim)" }}>сообщение удалено</span>
      ) : (
        <span className="whitespace-pre-wrap">
          {/* смайлы остаются в строке после ника; у сообщения-стикера они
              крупнее и растут вверх от базовой линии (см. MsgText) */}
          <MsgText
            text={String(m.text ?? "")}
            platform={m.platform}
            eager={eager}
            emoteSize={stickerOnly ? stickerEm : undefined}
          />
        </span>
      )}
    </p>
  );

  return (
    <div
      className={`group relative cursor-default transition-colors hover:bg-[var(--dw-hover)] ${
        studio ? "rounded-md px-2 py-[2px]" : "rounded-2xl px-3 py-1.5"
      }`}
      style={{
        background: mentioned
          ? `color-mix(in srgb, var(--dw-accent) ${studio ? 11 : 12}%, transparent)`
          : isEvent && !m.deleted
            ? `color-mix(in srgb, ${tint} 10%, transparent)`
            : "transparent",
        boxShadow: isEvent && !m.deleted ? `inset ${studio ? 2 : 3}px 0 0 ${tint}` : "none",
        opacity: m.deleted ? (studio ? 0.5 : 0.55) : 1,
        /* стикер растёт вверх: даём строке воздух, чтобы картинка не
           упиралась в сообщение выше */
        paddingTop: stickerOnly && !m.deleted ? 8 : undefined,
      }}
      onDoubleClick={openMenu}
    >
      {caption}

      {studio && (
        <button
          onClick={openMenu}
          className="pointer-events-none absolute top-0 right-0 cursor-pointer rounded p-0.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100"
          title="Модерация"
          style={{ color: "var(--dw-dim)" }}
        >
          <MoreHorizontal size={13} />
        </button>
      )}
    </div>
  );
}

/* --------------------------- строка отправки --------------------------- */

type Target = { platform: PlatformId; name: string; combined?: boolean; ready: boolean };

const BOTH = "both";

function ShellComposer({
  channels,
  botAuth,
  onSend,
  compact,
  mac = false,
}: {
  channels: Channel[];
  botAuth: Partial<Record<PlatformId, string>>;
  onSend?: ShellFeedProps["onSend"];
  compact: boolean;
  /** «macOS»: композер без карточки, с градиентными пилюлями и кнопкой-кружком */
  mac?: boolean;
}) {
  const [text, setText] = useState("");
  const [target, setTarget] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /* Пилюли — подключённые каналы двух площадок, куда умеет писать мост.
     Канал без сохранённого аккаунта чат-бота показываем приглушённо:
     видно, что канал есть, но отправка в него пока недоступна. */
  const targets = useMemo<Target[]>(() => {
    const list: Target[] = [];
    const seen = new Set<string>();
    for (const c of channels) {
      if (c.platform !== "twitch" && c.platform !== "vkplay") continue;
      const key = `${c.platform}:${c.username.toLowerCase()}`;
      if (!c.username.trim() || seen.has(key)) continue;
      seen.add(key);
      list.push({
        platform: c.platform,
        name: c.username.trim(),
        ready: !!botAuth[c.platform]?.trim(),
      });
    }
    const both = list.filter((t) => t.ready);
    if (both.some((t) => t.platform === "twitch") && both.some((t) => t.platform === "vkplay")) {
      list.push({ platform: "twitch", name: "оба канала", combined: true, ready: true });
    }
    return list;
  }, [channels, botAuth]);

  const keyOf = (t: Target) => (t.combined ? BOTH : `${t.platform}:${t.name}`);
  const current = targets.find((t) => keyOf(t) === target) ?? targets[0];
  const ready = !!current && current.ready && !!onSend;

  const send = async () => {
    const body = text.trim();
    if (!body || !ready || sending || !current) return;
    setSending(true);
    try {
      if (current.combined) {
        const each = targets.filter((t) => t.ready && !t.combined);
        await Promise.allSettled(each.map((t) => Promise.resolve(onSend?.(t.platform, t.name, body))));
      } else {
        await onSend?.(current.platform, current.name, body);
      }
      setText("");
    } catch {
      /* причина уже показана отправителем — текст остаётся для повтора */
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const insert = (s: string) => {
    setText((prev) => prev + s);
    inputRef.current?.focus();
  };

  return (
    <div
      className={
        mac
          ? "shrink-0 border-t border-white/[0.06] bg-transparent px-3 py-2.5"
          : `shrink-0 rounded-2xl border ${compact ? "mx-1.5 mb-1.5 p-1.5" : "mx-5 mb-3 p-2"}`
      }
      style={mac ? undefined : { borderColor: "var(--dw-line)", background: "var(--dw-panel2)" }}
    >
      <div className="flex flex-wrap items-center gap-1.5 px-1 pb-1.5">
        {targets.length === 0 && (
          <span className="text-[10.5px]" style={{ color: "var(--dw-dim)" }}>
            войдите в чат-бот, чтобы писать в чат
          </span>
        )}
        {targets.map((t) => {
          const meta = platformMeta(t.platform);
          const key = keyOf(t);
          const on = key === (current ? keyOf(current) : "");
          return (
            <button
              key={key}
              onClick={() => setTarget(key)}
              className={
                mac
                  ? "flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all"
                  : "flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium transition-colors"
              }
              style={
                mac
                  ? on
                    ? {
                        background: `linear-gradient(150deg, ${meta.color}, ${meta.color}B8)`,
                        color: "#fff",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
                        opacity: t.ready ? 1 : 0.55,
                      }
                    : {
                        background: "rgba(255,255,255,0.06)",
                        color: "rgba(255,255,255,0.55)",
                        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
                        opacity: t.ready ? 1 : 0.55,
                      }
                  : {
                      background: on ? `${meta.color}26` : "transparent",
                      color: on ? meta.color : "var(--dw-dim)",
                      boxShadow: on ? `inset 0 0 0 1px ${meta.color}55` : "none",
                      opacity: t.ready ? 1 : 0.6,
                    }
              }
              title={
                t.combined
                  ? "Одно сообщение сразу в Twitch и VK Видео Live"
                  : t.ready
                    ? `${meta.name}: ${t.name}`
                    : `${meta.name}: подключите аккаунт чат-бота в настройках`
              }
            >
              {mac ? (
                <PlatformIcon id={t.platform} size={11} color={on ? "#fff" : undefined} />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
              )}
              {t.combined ? "оба" : t.name}
            </button>
          );
        })}
        {!mac && (
          <span className="ml-auto text-[10px]" style={{ color: "var(--dw-dim)" }}>
            Shift+Enter — новая строка
          </span>
        )}
      </div>

      {!targets.some((t) => t.ready) && (
        <p className="px-1 pb-1 text-[10px]" style={{ color: "var(--dw-dim)" }}>
          Отправка включится после входа в аккаунт чат-бота: Настройки → Каналы.
        </p>
      )}

      <div className="flex items-end gap-1.5 px-1">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={480}
          placeholder={
            ready
              ? current?.combined
                ? "Сообщение во все выбранные каналы"
                : `Сообщение в ${current?.name ?? ""}`
              : "Войдите в чат-бот в настройках, чтобы писать в чат"
          }
          className={
            mac
              ? "h-9 min-h-9 min-w-0 flex-1 resize-none rounded-[10px] bg-white/[0.07] px-3.5 py-2 text-[13px] outline-none ring-1 ring-white/[0.08] ring-inset transition-shadow placeholder-white/30 focus:ring-2 focus:ring-[#0A84FF]/60"
              : "min-h-[28px] max-h-24 min-w-0 flex-1 resize-none bg-transparent py-1 text-[12.5px] outline-none"
          }
          style={mac ? { color: "#f5f5f7" } : { color: "var(--dw-text)" }}
          disabled={!ready}
        />

        {!mac && emojiOpen && (
          <div className="relative">
            <div
              className="absolute right-0 bottom-8 flex w-[150px] flex-wrap gap-1 rounded-xl p-1.5 shadow-xl"
              style={{ background: "var(--dw-panel)", boxShadow: "0 8px 26px rgba(0,0,0,0.45)" }}
            >
              {["😀", "😂", "🔥", "❤️", "👍", "🎉", "😮", "💀"].map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    insert(e);
                    setEmojiOpen(false);
                  }}
                  className="cursor-pointer rounded p-1 text-[15px] hover:bg-[var(--dw-hover)]"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {!mac && (
          <>
            <button
              onClick={() => setEmojiOpen((v) => !v)}
              className="cursor-pointer rounded p-1 transition-colors hover:bg-[var(--dw-hover)]"
              title="Смайлы"
              disabled={!ready}
            >
              <Smile size={15} style={{ color: "var(--dw-dim)" }} />
            </button>
            <button
              className="cursor-pointer rounded p-1 transition-colors hover:bg-[var(--dw-hover)]"
              title="Площадки принимают только текст — вложение отправить нельзя"
              onClick={() => inputRef.current?.focus()}
            >
              <Paperclip size={15} style={{ color: "var(--dw-dim)" }} />
            </button>
          </>
        )}
        <button
          onClick={() => void send()}
          disabled={!ready || !text.trim() || sending}
          className={
            mac
              ? "grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-[10px] bg-[#0A84FF] text-white shadow-[0_4px_14px_rgba(0,0,0,0.45)] transition-all hover:brightness-110 active:scale-95 disabled:cursor-default disabled:opacity-40"
              : "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold transition-all hover:brightness-110 disabled:cursor-default disabled:opacity-45"
          }
          style={mac ? undefined : { background: "var(--dw-accent)", color: "var(--dw-accent-ink)" }}
          title="Отправить (Enter)"
          aria-label="Отправить"
        >
          {sending ? (
            <Check size={mac ? 16 : 13} />
          ) : mac ? (
            <SendHorizontal size={16} className="translate-x-[1px]" />
          ) : (
            <Send size={13} />
          )}
          {!mac && "Отправить"}
        </button>
      </div>
    </div>
  );
}
