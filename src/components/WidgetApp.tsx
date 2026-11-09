import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { ChatMsg, WidgetConfig } from "../lib/types";
import { DEFAULT_WIDGET } from "../lib/types";
import { donatebarBridge, isDesktop, onHostEvent } from "../lib/bridge";
import { usePersisted } from "../lib/persist";
import {
  DEFAULT_DONATEBAR_STATE,
  DONATE_BAR_STYLES,
  normalizeDonateBarState,
  type DonateBarState,
} from "../lib/donatebar";
import DonateBar from "./DonateBar";
import { PlatformIcon, nickColor, platformMeta } from "../lib/platforms";
import { ChatBadges } from "../lib/badges";
import { fontStack } from "../lib/fonts";
import { useWebFont } from "../lib/webfont";
import { parseMessage } from "../lib/emotes";
import {
  WIDGET_STYLES,
  findStyle,
  isBareText,
  resolveTone,
  styleClass,
  styleFont,
  toneName,
} from "../lib/presets";
import StylePreviewBar from "./StylePreviewBar";
import { playDonateSound, setRewardCustomSounds } from "../lib/donateSounds";
import type { CustomSound } from "../lib/donateSounds";
import { composeTextShadow, effectClass, effectVars } from "../lib/effects";
import { createHideRegistry, hideFromModeration } from "../lib/hide";
import type { ChatHideRequest } from "../lib/types";

/** Строка виджета: сообщение + момент появления. */
type WidgetItem = ChatMsg & { born: number };

/**
 * Страница виджета для OBS Browser Source (#/widget).
 *
 * ССЫЛКА В OBS ПОСТОЯННАЯ: http://127.0.0.1:8085/widget
 * Оформление НЕ зашито в адрес, а приходит живым событием "widget.config"
 * по SSE — поэтому изменения настроек применяются в OBS сразу и Browser
 * Source не нужно пересоздавать.
 *
 * Режимы (параметр ?mode=):
 *   (нет)     — лента сообщений чата (как раньше);
 *   rewards   — звуки наград за баллы канала: отдельный аудиоканал OBS,
 *               без ленты и без остальных уведомлений;
 *   donatebar — полоса донатов: общая сумма всех донат-площадок.
 */
export default function WidgetApp() {
  const mode = new URLSearchParams(window.location.search).get("mode");
  if (mode === "donatebar") return <DonateBarPage />;
  if (mode === "rewards") return <RewardSoundsPage />;
  /* Звуковой виджет уведомлений (?mode=sounds) убран. Старый источник в OBS
     оставляем пустым и невидимым: лента чата в нём была бы сюрпризом на
     трансляции, а звука у уведомлений в OBS больше нет. */
  if (mode === "sounds") return null;
  return <ChatWidget />;
}

/* ================= полоса донатов (?mode=donatebar) ================= */

/** Демо-состояние для предпросмотра в обычном браузере (без приложения). */
const DEMO_BAR_STATE: DonateBarState = {
  start: 0,
  goal: 1000,
  currency: "₽",
  style: "potion",
  title: "Донаты",
  barOnly: false,
  totals: { "₽": 250, $: 50 },
};

/** Нормализация снимка состояния от хоста/моста с умолчаниями. */
function DonateBarPage() {
  const [live, setLive] = useState<DonateBarState | null>(null);
  const realData = useRef(false);
  /* «Виджет жив»: новый признак запуска приложения после перезапуска —
     страницу обновляем, иначе в OBS остаётся старая копия полосы. */
  const aliveSessionRef = useRef("");
  /* Предпросмотр в обычном браузере (как у ленты): демо-состояние и
     переключатель стилей; в OBS и внутри приложения — живые данные. */
  const preview =
    !isDesktop() &&
    !/^(127\.0\.0\.1|localhost|\[::1\])$/.test(typeof location !== "undefined" ? location.hostname : "");

  useEffect(() => {
    const apply = (p: unknown) => {
      const s = normalizeDonateBarState(p);
      if (!s) return;
      realData.current = true;
      setLive(s);
    };

    // мост приложения (страница открыта внутри WebView2)
    const unsub = onHostEvent((type, payload) => {
      if (type === "donatebar.config" || type === "donatebar.update") apply(payload);
    });

    // SSE от сервера приложения — основной канал для OBS
    let es: EventSource | null = null;
    try {
      es = new EventSource("widget/events");
      es.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data) as { event?: string; payload?: unknown };
          if (d.event === "donatebar.config" || d.event === "donatebar.update") apply(d.payload);
          else if (d.event === "widget.alive") {
            realData.current = true;
            const session = String((d.payload as { session?: string })?.session ?? "");
            if (session && aliveSessionRef.current && aliveSessionRef.current !== session) {
              window.setTimeout(() => window.location.reload(), 50);
              return;
            }
            if (session) aliveSessionRef.current = session;
          }
        } catch {
          /* битый фрейм */
        }
      };
    } catch {
      /* открыто вне приложения */
    }

    // Внутри приложения первый снимок берём напрямую (SSE может не быть)
    if (isDesktop())
      void donatebarBridge.info().then((s) => {
        if (s) {
          realData.current = true;
          setLive(normalizeDonateBarState(s));
        }
      });

    return () => {
      unsub();
      try {
        es?.close();
      } catch {
        /* noop */
      }
    };
  }, []);

  /* Холст Browser Source всегда прозрачный: рисует только сама полоса. */
  useEffect(() => {
    document.documentElement.style.setProperty("background", "transparent", "important");
    document.body.style.setProperty("background", "transparent", "important");
  }, []);

  /* Галерея (?mode=donatebar&gallery=1, только браузер): все стили
     списком на «фальшивом стриме», чтобы сравнить их одним взглядом. */
  const gallery = new URLSearchParams(window.location.search).get("gallery") === "1";
  if (gallery && preview) return <BarGallery />;

  const state: DonateBarState = live ?? (preview ? DEMO_BAR_STATE : DEFAULT_DONATEBAR_STATE);

  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ background: "transparent", padding: "0 10px 10px" }}
    >
      {preview && (
        <div
          className="fixed top-2 left-1/2 z-50 flex max-w-[96%] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-full px-3 py-1.5"
          style={{
            background: "rgba(10, 10, 18, 0.88)",
            border: "1px solid rgba(255,255,255,0.16)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          }}
        >
          <span
            className="pr-1 text-[10px] font-bold tracking-wider uppercase"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            Стиль
          </span>
          {DONATE_BAR_STYLES.map((s) => {
            const on = state.style === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setLive({ ...state, style: s.id })}
                title={s.hint}
                className="cursor-pointer rounded-full px-2 py-0.5 text-[10.5px] font-semibold transition-colors"
                style={{
                  background: on ? "#8b5cf6" : "rgba(255,255,255,0.09)",
                  color: on ? "#fff" : "rgba(255,255,255,0.78)",
                }}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      )}
      <div className="w-full" style={{ maxWidth: 900 }}>
        <DonateBar state={state} />
      </div>
    </div>
  );
}

/** Галерея всех стилей полосы — предпросмотр в браузере (не OBS). */
function BarGallery() {
  /* «Фальшивый стрим» позади: цветные пятна, чтобы видеть, как прозрачные
     стили (зелье, кольцо) будут выглядеть на настоящем эфире. */
  const streamBg: CSSProperties = {
    background:
      "radial-gradient(45% 60% at 18% 22%, rgba(168, 85, 247, 0.5), transparent 70%)," +
      "radial-gradient(40% 55% at 82% 30%, rgba(236, 72, 153, 0.45), transparent 70%)," +
      "radial-gradient(50% 60% at 55% 85%, rgba(37, 99, 235, 0.5), transparent 70%)," +
      "linear-gradient(160deg, #1a1030, #0d1424 55%, #170d24)",
  };
  return (
    <div style={{ minHeight: "100vh", ...streamBg, padding: "30px 14px 60px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1
          style={{
            margin: "0 0 6px",
            fontSize: 20,
            fontWeight: 800,
            color: "#fff",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          Полоса донатов — все стили
        </h1>
        <p
          style={{
            margin: "0 0 22px",
            fontSize: 12.5,
            color: "rgba(255,255,255,0.65)",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          Фон — имитация эфира. Выберите один — и он будет в OBS и в настройках.
        </p>
        {DONATE_BAR_STYLES.map((s) => (
          <div key={s.id} style={{ marginBottom: 26 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.85)",
                marginBottom: 7,
                fontFamily: "Inter, system-ui, sans-serif",
              }}
            >
              {s.name}
              <span
                style={{
                  color: "rgba(255,255,255,0.45)",
                  fontWeight: 500,
                  marginLeft: 8,
                  textTransform: "none",
                  letterSpacing: 0,
                }}
              >
                — {s.hint}
              </span>
            </div>
            <DonateBar state={{ ...DEMO_BAR_STATE, style: s.id }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============ награды за баллы (?mode=rewards) ============ */

/**
 * Отдельный источник звука наград за баллы канала для OBS.
 *
 * Окно приложения играет сигнал награды само — раньше только там награду и
 * было слышно. Эта страница играет её ещё раз уже в аудиопоток OBS: браузерный
 * источник с включённой опцией «Управлять аудио через OBS» отдаёт звук в
 * микшер и на трансляцию. Кроме звука наград здесь ничего нет: ни ленты чата,
 * ни остальных уведомлений — источник создаётся именно под награды.
 */
function RewardSoundsPage() {
  /* «Виджет жив»: новый признак запуска приложения после перезапуска —
     страницу обновляем, иначе в OBS остаётся старая копия. */
  const aliveSessionRef = useRef("");

  /* Предпросмотр в обычном браузере (не в OBS и не внутри приложения):
     подсказка подключения и кнопка проверки звука. В самом источнике OBS
     страница невидима — слышно только звук. */
  const preview =
    !isDesktop() &&
    !/^(127\.0\.0\.1|localhost|\[::1\])$/.test(typeof location !== "undefined" ? location.hostname : "");

  /* Событие «награда активирована»: играем назначенный ей звук. Встроенные
     сигналы синтезируются на месте, свои файлы берутся из библиотеки,
     которая приходит событием widget.rewardSounds. */
  const playReward = useCallback((payload: unknown) => {
    const p = payload as { sound?: string; volume?: number } | null;
    if (p?.sound) playDonateSound(p.sound, p.volume ?? 0.7);
  }, []);

  useEffect(() => {
    // мост приложения (страница открыта внутри WebView2)
    const unsub = onHostEvent((type, payload) => {
      if (type === "widget.rewardSounds" && Array.isArray(payload))
        setRewardCustomSounds(payload as CustomSound[]);
      else if (type === "reward.sound") playReward(payload);
    });

    // SSE от сервера приложения — основной канал для OBS
    let es: EventSource | null = null;
    try {
      es = new EventSource("widget/events");
      es.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data) as { event?: string; payload?: unknown };
          if (d.event === "widget.rewardSounds" && Array.isArray(d.payload)) {
            /* Библиотека звуков наград приходит один раз списком: байты не
               гоняем по SSE на каждую награду. */
            setRewardCustomSounds(d.payload as CustomSound[]);
          } else if (d.event === "reward.sound") {
            playReward(d.payload);
          } else if (d.event === "widget.alive") {
            const session = String((d.payload as { session?: string })?.session ?? "");
            if (session && aliveSessionRef.current && aliveSessionRef.current !== session) {
              window.setTimeout(() => window.location.reload(), 50);
              return;
            }
            if (session) aliveSessionRef.current = session;
          }
        } catch {
          /* битый фрейм */
        }
      };
    } catch {
      /* открыто вне приложения */
    }

    return () => {
      unsub();
      try {
        es?.close();
      } catch {
        /* noop */
      }
    };
  }, [playReward]);

  /* Холст Browser Source всегда прозрачный: рисуется только предпросмотр,
     в источнике OBS страница не занимает ни пикселя. */
  useEffect(() => {
    document.documentElement.style.setProperty("background", "transparent", "important");
    document.body.style.setProperty("background", "transparent", "important");
  }, []);

  if (!preview) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "transparent" }}>
      <div
        className="max-w-[440px] rounded-2xl p-5"
        style={{
          background: "rgba(10, 10, 18, 0.88)",
          border: "1px solid rgba(255,255,255,0.16)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          color: "#eef0f8",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div className="text-[15px] font-bold">Награды за баллы — звук в OBS</div>
        <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "rgba(255,255,255,0.72)" }}>
          Это отдельный источник для звука наград за баллы канала. Добавьте ссылку в OBS как Browser Source и
          включите «Управлять аудио через OBS» — награды станут слышны на трансляции. Ленты и других
          уведомлений здесь нет, источник только звучит.
        </p>
        <button
          onClick={() => playDonateSound("coins", 0.8)}
          className="mt-3 cursor-pointer rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition-all hover:brightness-110"
          style={{ background: "#8b5cf6" }}
        >
          Проверить звук
        </button>
      </div>
    </div>
  );
}

/* ================= лента сообщений (основной режим) ================= */

function ChatWidget() {
  const [stored, setStored] = usePersisted<WidgetConfig>("widget", DEFAULT_WIDGET);
  const [live, setLive] = useState<WidgetConfig | null>(null);
  const [items, setItems] = useState<WidgetItem[]>([]);
  const seq = useRef(1);
  const realData = useRef(false);
  /* Строка горизонтального формата. По её положению виджет понимает, что
     уже уехало за правый край окна, а что ещё видно (хотя бы частично). */
  const stripRef = useRef<HTMLDivElement | null>(null);
  /* «Виджет жив»: время последнего сигнала от приложения и признак его
     запуска. По ним страница понимает, что приложение перезапустилось, и
     обновляет себя — иначе в OBS приходилось передобавлять источник. */
  const aliveAtRef = useRef(0);
  const aliveSessionRef = useRef("");

  const c: WidgetConfig = { ...DEFAULT_WIDGET, ...stored, ...(live ?? {}) };
  const cfgRef = useRef(c);
  cfgRef.current = c;

  const dark = c.theme !== "light";

  /* Предпросмотр в обычном браузере: страница не внутри приложения и не
     отдана локальным сервером приложения (в OBS hostname — 127.0.0.1).
     Только в этом режиме показываем переключатель стилей и демо-строки. */
  const preview =
    !isDesktop() &&
    !/^(127\.0\.0\.1|localhost|\[::1\])$/.test(typeof location !== "undefined" ? location.hostname : "");

  /* Свой шрифт пользователя (ссылка Google Fonts) — подключается тем же
     <link>, что и базовые шрифты страницы. */
  useWebFont(c.customFont);

  /* Звук прямо в источнике OBS. Браузерный источник считается «медиа», поэтому
     при включённой опции «Управлять аудио через OBS» этот звук попадает и в
     микшер OBS, и на локальные колонки — раньше виджет вообще ничего не
     воспроизводил, и захватывать было нечего. */
  const audioRef = useRef<AudioContext | null>(null);
  const playPing = useCallback((isEvent: boolean) => {
    const cur = cfgRef.current;
    if (!cur.sound) return;
    if (cur.soundEventsOnly && !isEvent) return;
    try {
      audioRef.current ??= new AudioContext();
      const ctx = audioRef.current;
      // автозапуск аудио в браузере разрешён после жеста; в OBS контекст
      // стартует сразу, но на всякий случай пробуем возобновить
      if (ctx.state === "suspended") void ctx.resume();

      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const vol = Math.min(1, Math.max(0, cur.soundVolume ?? 0.5));
      osc.type = "sine";
      osc.frequency.setValueAtTime(isEvent ? 880 : 660, t);
      osc.frequency.setValueAtTime(isEvent ? 1320 : 880, t + 0.1);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * 0.3), t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    } catch {
      /* аудио недоступно — виджет продолжает работать */
    }
  }, []);

  /* MP3 озвучки приходит коротким URL с локального сервера приложения.
     HTMLAudioElement передаёт его в аудиопоток CEF/OBS без Base64 и
     декодированного PCM-кэша в памяти. */
  const activeTtsRef = useRef<Set<HTMLAudioElement>>(new Set());
  const playTts = useCallback((url: string, volume: number) => {
    try {
      const audio = new Audio(new URL(url, location.origin).href);
      audio.preload = "auto";
      audio.volume = Math.min(1, Math.max(0, volume));
      activeTtsRef.current.add(audio);
      const cleanup = () => {
        activeTtsRef.current.delete(audio);
        audio.removeAttribute("src");
        audio.load();
      };
      audio.onended = cleanup;
      audio.onerror = cleanup;
      // Автозапуск в браузерном источнике OBS иногда отклоняет первый вызов
      // play() — раньше такая фраза просто терялась и озвучка «доходила не
      // всегда». Пробуем ещё раз после короткой паузы.
      void audio.play().catch(() => {
        window.setTimeout(() => {
          void audio.play().catch(cleanup);
        }, 400);
      });
    } catch {
      /* аудио недоступно */
    }
  }, []);

  /* Холст Browser Source всегда прозрачный: фон рисуют только карточки
     сообщений, иначе OBS показывает сплошной прямоугольник. */
  useEffect(() => {
    document.documentElement.style.setProperty("background", "transparent", "important");
    document.body.style.setProperty("background", "transparent", "important");
  }, []);

  /* Сторож связи с приложением. Пульс «виджет жив» приходит раз в десять
     секунд; если он пропал больше чем на полминуты, страница в OBS зависла
     (приложение закрыли, источник потерял соединение) — перезагружаем себя.
     Сторож включается только после первого сигнала: без приложения страница
     не должна перезагружаться по кругу. */
  useEffect(() => {
    const t = window.setInterval(() => {
      if (aliveAtRef.current > 0 && Date.now() - aliveAtRef.current > 30_000) {
        aliveAtRef.current = 0; // не перезагружаемся повторно, пока нет связи
        window.location.reload();
      }
    }, 5000);
    return () => window.clearInterval(t);
  }, []);

  /* Реально удаляем истёкшие элементы; пустой виджет больше не тикает. */
  useEffect(() => {
    if (!c.autoFade || items.length === 0) return;
    const t = window.setInterval(() => {
      const cutoff = Date.now() - Math.max(1, c.fadeAfterSec ?? 30) * 1000;
      setItems((prev) => {
        const next = prev.filter((m) => m.born >= cutoff);
        return next.length === prev.length ? prev : next;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [c.autoFade, c.fadeAfterSec, items.length]);

  useEffect(() => {
    /* Пакетная обработка: и одиночные сообщения, и chat.batch попадают
       в состояние ОДНИМ обновлением — при плотном чате это радикально
       снижает число ре-рендеров в OBS Browser Source. */
    let pending: WidgetItem[] = [];
    let flushTimer: number | null = null;

    /* Уборка строк горизонтального формата. Поток идёт слева направо: новое
       сообщение встаёт у левого края, прежние вытесняются вправо. Строку,
       которая уходит за край, виджет обязан показывать, пока видна хоть её
       часть — у самого виджета границ нет, край задаёт только окно источника.
       Поэтому строки убираются не «по счётчику», а по положению: как только
       строка целиком скрылась за краем, она больше не нужна. */
    let pruneFrame: number | null = null;
    const prune = () => {
      pruneFrame = null;
      const strip = stripRef.current;
      if (!strip) return;
      const limit = window.innerWidth || document.documentElement.clientWidth || 0;
      if (limit <= 0) return;
      /* Строки стоят слева направо по порядку появления, поэтому за краем
         оказывается ХВОСТ списка детей — оттуда и начинаем. Первая строка,
         у которой видна хоть часть, обрывает проверку. */
      const kids = strip.children;
      const gone: number[] = [];
      for (let i = kids.length - 1; i >= 0 && gone.length < 200; i--) {
        const el = kids[i] as HTMLElement;
        if (el.getBoundingClientRect().left < limit) break;
        const id = Number(el.dataset.mid);
        if (id > 0) gone.push(id);
      }
      if (!gone.length) return;
      // убираем ровно те строки, что уже не видны: частично видимые остаются
      const ids = new Set(gone);
      setItems((prev) => {
        const next = prev.filter((m) => !ids.has(m.id));
        return next.length === prev.length ? prev : next;
      });
      if (gone.length >= 200) schedulePrune(); // хвост длиннее кадра — дочистим следующим
    };
    const schedulePrune = () => {
      if (pruneFrame === null) pruneFrame = window.requestAnimationFrame(prune);
    };

    const flush = () => {
      flushTimer = null;
      if (!pending.length) return;
      const batch = pending;
      pending = [];
      const horizontal = cfgRef.current.layout === "horizontal";
      setItems((prev) => {
        const next = [...prev, ...batch];
        return horizontal ? next : next.slice(-cfgRef.current.max);
      });
      if (horizontal) schedulePrune();
    };

    // память о скрытых строках: сообщение и команда «убрать его» приходят
    // разными кадрами потока
    const hidden = createHideRegistry();
    const hide = (h: ChatHideRequest) => {
      hidden.recall(h);
      pending = hidden.apply(pending, h);
      setItems((prev) => {
        const next = hidden.apply(prev, h);
        return next.length === prev.length ? prev : next;
      });
    };

    const pushMany = (list: unknown[]) => {
      const cur = cfgRef.current;
      let fresh: WidgetItem[] = [];
      let hasEvent = false;

      for (const item of list) {
        const raw = (item ?? {}) as Partial<ChatMsg>;
        const kindRaw = String(raw.kind ?? "chat");
        const kind = kindRaw as ChatMsg["kind"];

        /* Служебные события площадки — не сообщения, а команды виджету:
           сообщение удалили, зрителя забанили, чат очистили. Раньше они
           рисовались пустой плашкой, а само удалённое сообщение оставалось
           в OBS навсегда. */
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

        if (kind !== "chat" && kind !== "system" && !cur.showEvents) continue;
        const platform = raw.platform ?? "twitch";
        const author = String(raw.author ?? "");
        const message: WidgetItem = {
          id: seq.current++,
          ts: typeof raw.ts === "number" && raw.ts > 0 ? raw.ts : Date.now(),
          platform,
          channel: String(raw.channel ?? ""),
          author,
          color: String(raw.color || nickColor(author, platformMeta(platform).color)),
          text: String(raw.text ?? ""),
          kind,
          badges: Array.isArray(raw.badges) ? raw.badges.map(String) : undefined,
          // оригинальные значки площадки нужны и в OBS-виджете
          badgeIcons: Array.isArray(raw.badgeIcons) ? raw.badgeIcons : undefined,
          amount: typeof raw.amount === "number" ? raw.amount : undefined,
          currency: raw.currency,
          // идентификаторы строки: по ним сообщение снимается с показа
          msgId: raw.msgId ? String(raw.msgId) : undefined,
          userId: raw.userId ? String(raw.userId) : undefined,
          sid: typeof raw.sid === "number" ? raw.sid : undefined,
          born: Date.now(),
        };
        if (hidden.isHidden(message)) continue; // строка уже скрыта
        if (kind !== "chat") hasEvent = true;
        fresh.push(message);
      }

      if (fresh.length) {
        if (hasEvent) playPing(true);
        pending.push(...fresh);
        if (flushTimer === null) flushTimer = window.setTimeout(flush, 80);
      }
    };

    // мост приложения (когда страница открыта внутри WebView2)
    const unsub = onHostEvent((type, payload) => {
      if (type === "chat.batch" && Array.isArray(payload)) pushMany(payload);
      else if (type === "chat.message") pushMany([payload]);
      else if (type === "chat.hide" && payload) hide(payload as ChatHideRequest);
      else if (type === "widget.config") setLive(payload as WidgetConfig);
    });

    // SSE от сервера приложения — основной канал для OBS
    let es: EventSource | null = null;
    try {
      es = new EventSource("widget/events");
      es.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data) as { event?: string; payload?: unknown };
          if (d.event === "chat.batch" && Array.isArray(d.payload)) {
            realData.current = true;
            pushMany(d.payload);
          } else if (d.event === "chat.message" && d.payload) {
            realData.current = true;
            pushMany([d.payload]);
          } else if (d.event === "chat.hide" && d.payload) {
            realData.current = true;
            hide(d.payload as ChatHideRequest);
          } else if (d.event === "widget.config" && d.payload) {
            realData.current = true;
            setLive(d.payload as WidgetConfig);
          } else if (d.event === "widget.alive") {
            /* Приложение отвечает: пульс раз в десять секунд и сразу после
               подключения источника. Новый признак запуска означает, что
               приложение перезапустили — страницу обновляем целиком, иначе
               в OBS остаётся старая копия и её приходится обновлять вручную. */
            realData.current = true;
            aliveAtRef.current = Date.now();
            const session = String((d.payload as { session?: string })?.session ?? "");
            if (session && aliveSessionRef.current && aliveSessionRef.current !== session) {
              window.setTimeout(() => window.location.reload(), 50);
              return;
            }
            if (session) aliveSessionRef.current = session;
          } else if (d.event === "tts.audio" && d.payload) {
            // MP3 читается напрямую с локального сервера в аудиопоток OBS.
            const p = d.payload as { url?: string; volume?: number };
            if (p?.url) playTts(p.url, p.volume ?? 1);
          }
          /* Звуки наград за баллы здесь больше не играются: у них отдельный
             источник (?mode=rewards), чтобы лента чата их не дублировала. */
        } catch {
          /* битый фрейм */
        }
      };
    } catch {
      /* открыто вне приложения */
    }

    // Демо-строки нужны ТОЛЬКО для предпросмотра в обычном браузере.
    // В OBS страницу отдаёт сервер приложения (порт 8085) и SSE ещё может
    // не успеть подключиться — раньше из-за этого в источник попадало
    // случайное демо-сообщение. Определяем среду по адресу страницы.
    // Страницу виджета отдаёт локальный сервер приложения (любой порт),
    // поэтому демо в OBS не нужно ни при каком стечении обстоятельств.
    let alive = true;
    const demo = () => {
      if (!alive) return;
      // приложение подключено — демо больше не нужно, цикл останавливаем
      if (realData.current || isDesktop() || !preview) return;
      const names = ["nekto_san", "wesna_life", "shadow_walker", "no_scope_anna"];
      const texts = ["привет из чата!", "красиво затащил", "клипую", "Ф в чат", "лучший контент"];
      const plats: ChatMsg["platform"][] = ["twitch", "youtube", "kick", "vkplay"];
      pushMany([
        {
          platform: plats[Math.floor(Math.random() * plats.length)],
          author: names[Math.floor(Math.random() * names.length)],
          text: texts[Math.floor(Math.random() * texts.length)],
          kind: "chat",
        },
      ]);
      window.setTimeout(demo, 900 + Math.random() * 2000);
    };
    const demoStart = window.setTimeout(demo, 2500);
    // Первый кадр предпросмотра не пустой: несколько строк уже есть,
    // чтобы стиль видно было сразу, а не через пару секунд демо-цикла.
    if (preview) {
      pushMany([
        { platform: "twitch", author: "nekto_san", text: "привет из чата!", kind: "chat" },
        { platform: "youtube", author: "wesna_life", text: "красиво затащил", kind: "chat" },
        { platform: "kick", author: "shadow_walker", text: "клипую", kind: "chat" },
        { platform: "vkplay", author: "no_scope_anna", text: "лучший контент", kind: "chat" },
      ]);
    }

    /* Значение ref берём до очистки: к моменту cleanup activeTtsRef.current
       теоретически мог бы указывать уже на другой объект. Само множество
       не пересоздаётся (только add/delete/clear), поэтому поведение то же. */
    const activeTts = activeTtsRef.current;

    return () => {
      alive = false;
      window.clearTimeout(demoStart);
      if (flushTimer !== null) window.clearTimeout(flushTimer);
      if (pruneFrame !== null) window.cancelAnimationFrame(pruneFrame);
      pending = [];
      try {
        void audioRef.current?.close();
      } catch {
        /* уже закрыт */
      }
      for (const audio of activeTts) {
        try {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        } catch {}
      }
      activeTts.clear();
      unsub();
      es?.close();
    };
    // playPing и playTts — useCallback с пустыми зависимостями: добавление
    // сохраняет эффект одноразовым (при монтировании), как и задумано
    // (preview стабилен: от адресной строки и среды запуска зависит раз и навсегда).
  }, [playPing, playTts, preview]);

  /* Горизонтальный формат идёт слева направо: новое сообщение встаёт у левого
     края, а прежние вытесняются вправо. Поэтому на экран строки выводятся
     в обратном порядке — свежие первыми. Полоска растёт по ширине текста, без
     сжатия карточек и переносов: у самого виджета границ нет, край задаёт
     только окно источника, и сообщение, которое уходит за этот край, остаётся
     видимым — хотя бы частично (убирает его только проверка видимости). */
  const horizontal = c.layout === "horizontal";
  /* В столбце число строк задаёт настройка; в полоске строк ровно столько,
     сколько видно на экране. */
  const visible = horizontal ? items : items.slice(-Math.max(1, c.max));
  const ordered = horizontal ? [...visible].reverse() : visible;

  /* Тема виджета: набор цветов, окно под строками и вид «только текст»,
     когда подложек нет совсем. Плашки выключает либо прозрачный фон, либо
     нулевая прозрачность подложки — оба случая дают голый текст. */
  const wStyle = findStyle(WIDGET_STYLES, c.styleId);
  const wTone = resolveTone(wStyle, c.styleTone);
  const wBackdropOp = c.backdropOpacity ?? (c.transparent ? 0 : 0.7);
  const platesOff = c.transparent || wBackdropOp <= 0.001;
  const wBare = isBareText(WIDGET_STYLES, c, platesOff);
  const wWindowOp = Math.max(0, Math.min(1, c.windowOpacity ?? 1));
  /* окно рисуем, если тема его включает и у него есть хоть какая-то подложка */
  const wWindow = !!c.windowBackdrop && wWindowOp > 0.001;

  return (
    <div
      data-tone={wTone}
      data-bare={wBare ? "1" : undefined}
      className={`fixed right-0 bottom-0 left-0 flex ${styleClass(c.styleId)} ${
        horizontal ? "justify-start overflow-hidden" : "p-2"
      }`}
      style={{
        fontSize: c.fontSize,
        fontFamily: styleFont(WIDGET_STYLES, c) ?? fontStack(c.fontFamily, c.customFont),
        background: "transparent",
      }}
    >
      {/* переключатель стилей — только в предпросмотре в обычном браузере */}
      {preview && (
        <StylePreviewBar
          title="Стиль"
          styles={WIDGET_STYLES}
          activeId={c.styleId}
          onApply={(p) => setStored((prev) => ({ ...DEFAULT_WIDGET, ...prev, ...p }))}
        />
      )}
      <div
        className={`y-win ${wWindow ? "" : "is-bare"} ${c.windowBar ? "" : "no-bar"} ${
          horizontal ? "shrink-0" : "w-full min-w-0"
        }`}
        style={
          {
            "--w-op": wWindowOp,
            "--w-r": `${Math.max(0, c.windowRadius ?? 16)}px`,
          } as CSSProperties
        }
      >
        <div className="y-win__bar">
          <span className="y-win__title">{wStyle?.name ?? "Чат"}</span>
          {toneName(wStyle, c.styleTone) && (
            <span className="y-win__meta">{toneName(wStyle, c.styleTone)}</span>
          )}
        </div>
        <div
          ref={stripRef}
          className={
            horizontal
              ? "flex w-max min-w-full shrink-0 items-baseline"
              : "flex w-full min-w-0 flex-col justify-end"
          }
          style={{ gap: horizontal ? Math.min(c.spacing, 1) : c.spacing }}
        >
          {ordered.map((m) => {
            const rawOp = c.backdropOpacity ?? (c.transparent ? 0 : 0.7);
            const opacity = c.transparent ? 0 : Math.max(0, Math.min(1, rawOp > 1 ? rawOp / 100 : rawOp));
            const cardBg =
              opacity <= 0.001
                ? "transparent"
                : dark
                  ? `rgba(10, 12, 20, ${opacity})`
                  : `rgba(255, 255, 255, ${opacity})`;

            return (
              <div
                key={m.id}
                data-mid={m.id}
                className={`y-row y-line leading-snug ${
                  horizontal ? "shrink-0 whitespace-nowrap px-0.5 py-0.5" : "px-2.5 py-1 break-words"
                } ${effectClass(c.effect)}`}
                style={
                  {
                    ...effectVars(c.effectSpeed),
                    /* Протокол стилей: базовое правило .y-row даёт прежний «ручной»
                   вид (--y-bg), рецепт стиля перекрашивает плашку по своему
                   характеру и берёт настройки из этих же переменных. */
                    "--y-op": opacity,
                    "--y-r": `${c.radius ?? 10}px`,
                    "--y-sw": c.stripe ? "3px" : "0px",
                    "--y-sc": platformMeta(m.platform).color,
                    "--y-nc": m.color,
                    "--y-ts": composeTextShadow(c.outlineWidth, c.textShadow ?? c.outlines ?? true),
                    "--y-bg": cardBg,
                    "--y-ink": dark || opacity < 0.35 ? "#eef0f8" : "#121524",
                  } as CSSProperties
                }
              >
                <span className="inline-flex mr-1 align-middle">
                  <PlatformIcon id={m.platform} size={Math.round(c.fontSize * 0.85)} />
                </span>
                {/* значки полномочий картинками, как в чате площадки */}
                <ChatBadges msg={m} size={Math.round(c.fontSize * 0.95)} max={3} />
                <span className="y-nick inline font-bold mr-1">
                  {(c.nickCase === "upper" ? m.author.toUpperCase() : m.author) + ":"}
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
                  {/* картиночные смайлы */}
                  {parseMessage(String(m.text ?? ""), m.platform).map((part, i) =>
                    part.kind === "emote" ? (
                      <img
                        key={i}
                        src={part.url}
                        alt={`:${part.code}:`}
                        draggable={false}
                        className="mx-px inline-block align-[-0.28em]"
                        style={{ height: "1.4em", width: "auto" }}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <span key={i}>{part.text}</span>
                    ),
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
