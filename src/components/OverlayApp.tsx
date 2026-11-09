import { useEffect, useMemo, useRef, useState } from "react";
import { Heart } from "lucide-react";
import type { ChatHideRequest, ChatMsg, OverlayConfig, OverlayStats, PlatformId } from "../lib/types";
import { DEFAULT_OVERLAY } from "../lib/types";
import { isDesktop, onHostEvent, overlayBridge } from "../lib/bridge";
import { usePersisted } from "../lib/persist";
import { DonatePayIcon, DonationAlertsIcon, PlatformIcon, nickColor, platformMeta } from "../lib/platforms";
import { ChatBadges } from "../lib/badges";
import { parseMessage } from "../lib/emotes";
import { fontStack } from "../lib/fonts";
import { useWebFont } from "../lib/webfont";
import { composeTextShadow, effectClass, effectVars } from "../lib/effects";
import {
  OVERLAY_STYLES,
  findStyle,
  isBareText,
  resolveTone,
  styleClass,
  styleFont,
  toneName,
} from "../lib/presets";
import { createHideRegistry, hideFromModeration } from "../lib/hide";
import StylePreviewBar from "./StylePreviewBar";

/**
 * Одна иконка для общего блока донатов.
 * Подключён один сервис — показываем его фирменный знак; подключены оба
 * (или ни одного) — нейтральный значок, чтобы не выделять одну площадку.
 */
function DonateStatIcon({ sources, size }: { sources?: PlatformId[]; size: number }) {
  const list = sources ?? [];
  if (list.length === 1 && list[0] === "donatepay") return <DonatePayIcon size={size} />;
  if (list.length === 1 && list[0] === "donationalerts") return <DonationAlertsIcon size={size} />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.6c-1 0-1.8.8-1.8 1.8v.3C7.3 5.3 5 7.9 5 11v4.2l-1.3 2.1c-.5.8.1 1.8 1 1.8h14.6c.9 0 1.5-1 1-1.8L19 15.2V11c0-3.1-2.3-5.7-5.2-6.3v-.3c0-1-.8-1.8-1.8-1.8Z" />
      <path d="M9.6 20.4h4.8c-.3 1.2-1.3 2-2.4 2s-2.1-.8-2.4-2Z" />
    </svg>
  );
}

/**
 * Оверлей поверх игры (#/overlay).
 * • Прозрачность применяется ТОЛЬКО к подложке — текст всегда чёткий.
 * • Панель площадок по умолчанию СНИЗУ ленты; донаты — первый элемент.
 * • Показываются только подключённые площадки.
 * • Свободное размещение: окно можно перетащить мышью в любую точку экрана.
 */
export default function OverlayApp() {
  const [stored, setStored] = usePersisted<OverlayConfig>("overlay", DEFAULT_OVERLAY);
  const [live, setLive] = useState<OverlayConfig | null>(null);
  const [items, setItems] = useState<(ChatMsg & { born: number })[]>([]);
  const [stats, setStats] = useState<OverlayStats | null>(null);
  const [dragging, setDragging] = useState(false);
  const seq = useRef(1);

  const c: OverlayConfig = { ...DEFAULT_OVERLAY, ...stored, ...(live ?? {}) };
  const cfgRef = useRef(c);
  cfgRef.current = c;

  /* Предпросмотр в обычном браузере: демо-сообщения и строка переключения
     стилей. В окне приложения (WebView2) — всегда выключено. */
  const preview = !isDesktop();

  /* Свой шрифт пользователя (ссылка Google Fonts). */
  useWebFont(c.customFont);

  useEffect(() => {
    document.documentElement.style.setProperty("--dw-bg", "transparent");
    document.body.style.background = "transparent";
  }, []);

  /* ---------- события приложения ----------
     Одиночные сообщения и пакеты (chat.batch) обрабатываются одним
     обновлением состояния — при плотном чате это единицы ре-рендеров
     в секунду вместо десятков. */
  useEffect(() => {
    let pending: (ChatMsg & { born: number })[] = [];
    let flushTimer: number | null = null;

    const flush = () => {
      flushTimer = null;
      if (!pending.length) return;
      const batch = pending;
      pending = [];
      const limit = cfgRef.current.maxMessages;
      setItems((p) => [...p, ...batch].slice(-limit));
    };

    /* Снятие с показа (удаление, бан, очистка чата, скрытое фильтром
       сообщение): строка не должна оставаться в оверлее поверх игры. */
    const hidden = createHideRegistry();
    const hide = (h: ChatHideRequest) => {
      hidden.recall(h);
      pending = hidden.apply(pending, h);
      setItems((prev) => {
        const next = hidden.apply(prev, h);
        return next.length === prev.length ? prev : next;
      });
    };

    const ingest = (list: unknown[]) => {
      const cur = cfgRef.current;
      const validPlatforms: PlatformId[] = [
        "twitch",
        "youtube",
        "vkplay",
        "kick",
        "tiktok",
        "rutube",
        "boosty",
        "donationalerts",
        "donatepay",
        "memealerts",
      ];
      let fresh: (ChatMsg & { born: number })[] = [];

      for (const item of list) {
        const raw = (item ?? {}) as Partial<ChatMsg>;
        const platform = validPlatforms.includes(raw.platform as PlatformId)
          ? (raw.platform as PlatformId)
          : "twitch";
        const author = String(raw.author ?? "");
        const kindRaw = String(raw.kind ?? "chat");

        // Служебные события площадки — команды оверлею, а не контент эфира:
        // сообщение удалили, зрителя забанили, чат очистили.
        if (kindRaw.startsWith("moderation.")) {
          const request = hideFromModeration(kindRaw, raw);
          if (request) {
            fresh = hidden.apply(fresh, request);
            if (kindRaw === "moderation.delete") {
              hide(request);
            } else {
              pending = hidden.apply(pending, request);
              setItems((prev) => {
                const next = hidden.apply(prev, request);
                return next.length === prev.length ? prev : next;
              });
            }
          }
          continue;
        }

        const m: ChatMsg = {
          id: typeof raw.id === "number" ? raw.id : Date.now(),
          ts: typeof raw.ts === "number" && raw.ts > 0 ? raw.ts : Date.now(),
          platform,
          channel: String(raw.channel ?? ""),
          author,
          color: String(raw.color || nickColor(author, platformMeta(platform).color)),
          text: String(raw.text ?? ""),
          kind: raw.kind ?? "chat",
          badges: Array.isArray(raw.badges) ? raw.badges.map(String) : undefined,
          // оригинальные значки площадки должны доходить и до оверлея
          badgeIcons: Array.isArray(raw.badgeIcons) ? raw.badgeIcons : undefined,
          avatar: typeof raw.avatar === "string" ? raw.avatar : undefined,
          amount: typeof raw.amount === "number" ? raw.amount : undefined,
          currency: raw.currency ? String(raw.currency) : undefined,
          msgId: raw.msgId ? String(raw.msgId) : undefined,
          userId: raw.userId ? String(raw.userId) : undefined,
          sid: typeof raw.sid === "number" ? raw.sid : undefined,
        };
        // Служебная диагностика не попадает в оверлей. Входы зрителей TikTok
        // показываются по отдельному переключателю в «Содержимом строки».
        const kind = m.kind as string;
        if (!m.text && kind === "chat") continue;
        if (kind === "system") continue;
        if (kind === "join" && !cur.showJoinEvents) continue;
        if (cur.eventsOnly && kind === "chat") continue;
        const line: ChatMsg & { born: number } = {
          ...m,
          id: seq.current++,
          born: Date.now(),
          ts: m.ts || Date.now(),
          color: m.color || nickColor(m.author, platformMeta(m.platform).color),
        };
        if (hidden.isHidden(line)) continue; // строка уже скрыта
        fresh.push(line);
      }
      if (fresh.length) {
        pending.push(...fresh);
        if (flushTimer === null) flushTimer = window.setTimeout(flush, 80);
      }
    };

    const unsub = onHostEvent((type, payload) => {
      if (type === "chat.batch" && Array.isArray(payload)) ingest(payload);
      else if (type === "chat.message") ingest([payload]);
      else if (type === "chat.hide" && payload) hide(payload as ChatHideRequest);
      else if (type === "overlay.stats") {
        setStats(payload as OverlayStats);
      } else if (type === "overlay.config") {
        setLive(payload as OverlayConfig);
      }
    });

    /* демо только вне приложения (предпросмотр в браузере) */
    let alive = !isDesktop();
    const demo = () => {
      if (!alive) return;
      const names = ["nekto_san", "kot1k_tv", "lazy_panda", "ultra_nagibator", "chill_guy"];
      const texts = [
        "красиво!",
        "ГГ :fire:",
        "изи катка",
        "клипую",
        "а это как?",
        "лучший стрим :100:",
        "Ф",
        "погнали",
      ];
      const plats: PlatformId[] = ["twitch", "youtube", "kick"];
      const p = plats[Math.floor(Math.random() * plats.length)];
      const a = names[Math.floor(Math.random() * names.length)];
      setItems((prev) =>
        [
          ...prev,
          {
            id: seq.current++,
            born: Date.now(),
            ts: Date.now(),
            platform: p,
            channel: "",
            author: a,
            color: nickColor(a, platformMeta(p).color),
            text: texts[Math.floor(Math.random() * texts.length)],
            kind: "chat" as const,
          },
        ].slice(-cfgRef.current.maxMessages),
      );
      setStats({
        donations: { total: 3250, currency: "₽", count: 7 },
        platforms: [
          { platform: "twitch", online: true, viewers: 2213, messages: 148 },
          { platform: "youtube", online: true, viewers: 1042, messages: 61 },
          { platform: "tiktok", online: true, viewers: 73, likes: 12845, messages: 24 },
          { platform: "kick", online: false, viewers: 0, messages: 0 },
        ],
      });
      window.setTimeout(demo, 900 + Math.random() * 2200);
    };
    demo();

    return () => {
      alive = false;
      if (flushTimer !== null) window.clearTimeout(flushTimer);
      pending = [];
      unsub();
    };
  }, []);

  /* ---------- перетаскивание окна мышью ---------- */
  useEffect(() => {
    if (!c.freePosition || c.locked) return;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      // Клик по краю окна — это изменение размера, а не перетаскивание.
      // Обработчик висит на window, поэтому проверяем цель явно.
      if ((e.target as HTMLElement | null)?.closest?.("[data-resize]")) return;
      setDragging(true);
      overlayBridge.beginDrag();
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
    };
  }, [c.freePosition, c.locked]);

  /* Реально удаляем истёкшие элементы. Если изменений нет — возвращаем тот же
     массив (React не рендерит), после удаления последнего таймер выключается. */
  useEffect(() => {
    if (!c.autoFade || items.length === 0) return;
    const t = window.setInterval(() => {
      const cutoff = Date.now() - c.fadeAfterSec * 1000;
      setItems((prev) => {
        const next = prev.filter((m) => m.born >= cutoff);
        return next.length === prev.length ? prev : next;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [c.autoFade, c.fadeAfterSec, items.length]);

  const visible = items;

  /* только подключённые площадки (по желанию — все) */
  const shownPlatforms = useMemo(() => {
    const list = stats?.platforms ?? [];
    return c.hideDisconnected ? list.filter((p) => p.online || p.connected || p.messages > 0) : list;
  }, [stats, c.hideDisconnected]);

  /* Блок донатов показываем ТОЛЬКО когда сервис донатов реально подключён
     (или донаты уже приходили). Раньше он висел в оверлее всегда — даже
     если ни DonationAlerts, ни DonatePay не подключены. */
  const donationsConnected = (stats?.donations.sources?.length ?? 0) > 0 || (stats?.donations.total ?? 0) > 0;
  const hasDonations = c.showDonations && donationsConnected;
  const statsVisible = c.showStats && (shownPlatforms.length > 0 || hasDonations);

  const op = (c.backdropOpacity ?? 0) > 1 ? (c.backdropOpacity ?? 0) / 100 : (c.backdropOpacity ?? 0);
  const textShadow = composeTextShadow(c.outlineWidth, c.textShadow ?? c.shadowText ?? true);

  /* Переменные протокола стилей для карточки: рецепт стиля (.style-<id>
     .y-row в index.css) строится на них, а базовое правило .y-row даёт
     прежний «ручной» вид (--y-bg). */
  const rowVars = (extra: number, stripe: number, stripeColor: string, nick: string): React.CSSProperties => {
    const finalOp = Math.min(1, Math.max(0, op + extra));
    return {
      "--y-op": finalOp,
      "--y-r": `${c.radius}px`,
      "--y-sw": `${stripe}px`,
      "--y-sc": stripeColor,
      "--y-nc": nick,
      "--y-ts": textShadow,
      "--y-bg": finalOp <= 0.001 ? "transparent" : `rgba(8, 10, 16, ${finalOp})`,
      "--y-ink": "#ffffff",
      "--y-blur": finalOp > 0.05 ? "blur(6px)" : "none",
    } as React.CSSProperties;
  };

  /* Позицию и размер задаёт нативное окно. Внутри WebView страница всегда
     занимает 100% его площади, иначе экранные отступы применялись дважды,
     а flex-область сообщений схлопывалась до нулевой высоты. */
  const placement: React.CSSProperties = { inset: 0, width: "100%", height: "100%" };

  /* ---------- панель статистики ---------- */
  const statsBar = statsVisible ? (
    <div
      className="y-row flex flex-wrap items-center gap-x-2.5 gap-y-1 px-2.5 py-1.5"
      style={rowVars(0.06, 0, "transparent", "#ffffff")}
    >
      {/* Донаты — всегда первым элементом и ВСЕГДА одним блоком: суммы
          DonationAlerts и DonatePay складываются, иконка показывается одна. */}
      {hasDonations && (
        <span className="flex items-center gap-1.5 font-bold" style={{ color: "#FFB454" }}>
          <DonateStatIcon sources={stats?.donations.sources} size={Math.round(c.fontSize * 1.1)} />
          {/* только сумма: количество донатов не выводится */}
          {(stats?.donations.total ?? 0).toLocaleString("ru-RU")} {stats?.donations.currency ?? "₽"}
        </span>
      )}

      {hasDonations && shownPlatforms.length > 0 && (
        <span className="h-3 w-px" style={{ background: "rgba(255,255,255,0.25)" }} />
      )}

      {shownPlatforms.map((p) => (
        <span
          key={p.platform}
          className="flex items-center gap-1"
          style={{ opacity: p.online ? 1 : 0.72 }}
          title={`${platformMeta(p.platform).name}: ${p.online ? "в эфире" : "подключено"}`}
        >
          <PlatformIcon id={p.platform} size={Math.round(c.fontSize * 0.95)} />
          {/* зелёный — подтверждённый эфир, синий — просто подключено */}
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: p.online ? "#4ade80" : "#60a5fa",
              boxShadow: p.online ? "0 0 6px rgba(74,222,128,0.9)" : "none",
            }}
          />
          {c.showViewers && p.online && (
            <span className="font-semibold tabular-nums" style={{ fontSize: "0.86em" }}>
              {(p.viewers ?? 0).toLocaleString("ru-RU")}
            </span>
          )}
          {c.showLikes && p.platform === "tiktok" && p.online && (
            <span
              className="inline-flex items-center gap-0.5 font-semibold tabular-nums"
              style={{ fontSize: "0.82em", color: "#fe2c55" }}
              title={`${(p.likes ?? 0).toLocaleString("ru-RU")} лайков за эфир`}
            >
              <Heart size={Math.round(c.fontSize * 0.72)} fill="currentColor" />
              {(p.likes ?? 0).toLocaleString("ru-RU")}
            </span>
          )}
        </span>
      ))}
    </div>
  ) : null;

  /* ---------- лента ---------- */
  const feedList = (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{
        gap: c.spacing ?? 4,
        justifyContent: c.growth === "up" ? "flex-start" : "flex-end",
        flexDirection: c.growth === "up" ? "column-reverse" : "column",
      }}
    >
      {visible.map((m) => {
        const tint =
          m.kind === "donate"
            ? "#f59e0b"
            : m.kind === "sub"
              ? "#a78bfa"
              : m.kind === "raid"
                ? "#38bdf8"
                : m.kind === "gift"
                  ? "#f472b6"
                  : null;
        // Донат в оверлее: площадка · имя (или «Аноним») · сумма · сообщение
        const isDonate = m.kind === "donate";
        const donateAuthor = m.author?.trim() ? m.author : "Аноним";
        return (
          <div
            key={m.id}
            className={`y-row y-line px-2.5 py-1.5 leading-snug break-words ${effectClass(c.effect)}`}
            style={{
              ...effectVars(c.effectSpeed),
              ...rowVars(
                tint ? 0.05 : 0,
                c.accentBar ? 3 : 0,
                tint ?? platformMeta(m.platform).color,
                m.color,
              ),
            }}
          >
            {c.showTime && (
              <span
                className="inline-block mr-1 tabular-nums align-baseline"
                style={{ fontSize: "0.78em", opacity: 0.7 }}
              >
                {new Date(m.ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            {(c.showPlatform || isDonate) && (
              <span className="inline-flex mr-1 translate-y-[1px] align-baseline">
                <PlatformIcon id={m.platform} size={Math.round(c.fontSize * 0.85)} />
              </span>
            )}
            {/* Значки картинками площадки (для Twitch — оригинальные),
                а не словами «mod»/«sub», как было раньше. */}
            {c.showBadges && <ChatBadges msg={m} size={Math.round(c.fontSize * 0.95)} max={3} />}
            <span className="y-nick inline font-bold mr-1">
              {(c.nickCase === "upper" ? donateAuthor.toUpperCase() : donateAuthor) + ":"}
            </span>
            {m.amount !== undefined && (
              <span
                className="inline-block mr-1 rounded px-1 font-bold align-baseline"
                style={{ background: "rgba(245,158,11,0.28)", color: "#fde68a" }}
              >
                {m.amount.toLocaleString("ru-RU")} {m.currency}
              </span>
            )}
            <span className="inline">
              {c.showEmotes
                ? parseMessage(String(m.text ?? ""), m.platform).map((part, i) =>
                    part.kind === "emote" ? (
                      <img
                        key={i}
                        src={part.url}
                        alt={`:${part.code}:`}
                        draggable={false}
                        className="mx-px inline-block align-[-0.28em]"
                        style={{ height: "1.45em", width: "auto" }}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <span key={i}>{part.text}</span>
                    ),
                  )
                : String(m.text ?? "")}
            </span>
          </div>
        );
      })}
    </div>
  );

  /* Тема оверлея: набор цветов, окно под лентой и вид «только текст».
     Окно выключено по умолчанию — в OBS подложка часто лишняя, — но тема
     умеет включить его сама, и тогда лента живёт внутри рамки. */
  const ovStyle = findStyle(OVERLAY_STYLES, c.styleId);
  const ovTone = resolveTone(ovStyle, c.styleTone);
  const ovBare = isBareText(OVERLAY_STYLES, c, (c.backdropOpacity ?? 0) <= 0.001);
  const ovWindowOp = Math.max(0, Math.min(1, c.windowOpacity ?? 1));
  const ovWindow = !!c.windowBackdrop && ovWindowOp > 0.001;
  const ovFeed = ovWindow ? (
    <div
      className={`y-win flex min-h-0 flex-1 flex-col ${c.windowBar ? "" : "no-bar"}`}
      style={
        {
          "--w-op": ovWindowOp,
          "--w-r": `${Math.max(0, c.windowRadius ?? 14)}px`,
        } as React.CSSProperties
      }
    >
      <div className="y-win__bar">
        <span className="y-win__title">{ovStyle?.name ?? "Чат"}</span>
        {toneName(ovStyle, c.styleTone) && (
          <span className="y-win__meta">{toneName(ovStyle, c.styleTone)}</span>
        )}
      </div>
      {feedList}
    </div>
  ) : (
    feedList
  );

  // рамка и захват краёв — ТОЛЬКО в интерактивном режиме:
  // при сквозном клике оверлей полностью прозрачен для мыши и визуально чист
  const movable = c.freePosition && !c.locked && !c.clickThrough;

  /* Сквозной клик ВЫКЛЮЧЕН — оверлей перехватывает мышь. Подсвечиваем это
     явно: окно заметно затемняется и получает рамку, чтобы сразу было видно,
     где он находится и что клики сейчас уходят в него, а не в игру. */
  const interactive = !c.clickThrough;

  return (
    <div
      data-tone={ovTone}
      data-bare={ovBare ? "1" : undefined}
      className={`fixed flex min-h-0 flex-col overflow-hidden p-1 ${styleClass(c.styleId)}`}
      style={{
        ...placement,
        gap: c.spacing ?? 4,
        fontSize: c.fontSize,
        fontFamily: styleFont(OVERLAY_STYLES, c) ?? fontStack(c.fontFamily, c.customFont),
        opacity: c.textOpacity,
        cursor: movable ? (dragging ? "grabbing" : "grab") : "default",
        // Сквозной клик выключен → затемнённая подложка: оверлей явно виден.
        // Включён → фон полностью прозрачный, поверх игры ничего лишнего.
        background: interactive ? "rgba(8,10,16,0.55)" : "transparent",
        outline: movable
          ? "1px solid rgba(255,255,255,0.45)"
          : interactive
            ? "1px solid rgba(255,255,255,0.28)"
            : "none",
        outlineOffset: 0,
        borderRadius: c.radius,
      }}
    >
      {/* панель статистики сверху — если выбрано */}
      {c.statsPos === "top" && statsBar}

      {ovFeed}

      {/* панель статистики снизу — вариант по умолчанию */}
      {c.statsPos === "bottom" && statsBar}

      {preview && (
        <StylePreviewBar
          title="Стиль"
          styles={OVERLAY_STYLES}
          activeId={c.styleId}
          onApply={(p) => setStored((prev) => ({ ...DEFAULT_OVERLAY, ...prev, ...p }))}
        />
      )}

      {visible.length === 0 && !statsVisible && (
        <div
          className="y-row px-2.5 py-1.5"
          style={{ ...rowVars(0, 0, "transparent", "#fff"), fontSize: "0.85em" }}
        >
          оверлей активен — сообщения появятся здесь
        </div>
      )}

      {movable && (
        <div
          className="pointer-events-none absolute -top-6 left-0 rounded px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap"
          style={{ background: "rgba(8,10,16,0.8)", color: "#fff" }}
        >
          перетаскивание мышью · за края — размер
        </div>
      )}

      {/* Зоны изменения размера окна: правый край, нижний край и угол.
          Показываются только в интерактивном режиме — при сквозном клике
          оверлей полностью чист, а ресайз определяет хост по позиции курсора. */}
      {movable && (
        <>
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              overlayBridge.beginResize("e");
            }}
            data-resize
            className="absolute top-0 right-0 h-full"
            style={{ width: 8, cursor: "ew-resize" }}
          />
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              overlayBridge.beginResize("s");
            }}
            data-resize
            className="absolute bottom-0 left-0 w-full"
            style={{ height: 8, cursor: "ns-resize" }}
          />
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              overlayBridge.beginResize("se");
            }}
            data-resize
            className="absolute right-0 bottom-0"
            style={{
              width: 14,
              height: 14,
              cursor: "nwse-resize",
              background:
                "linear-gradient(135deg, transparent 45%, rgba(255,255,255,0.55) 45%, rgba(255,255,255,0.55) 60%, transparent 60%)",
            }}
          />
        </>
      )}
    </div>
  );
}
