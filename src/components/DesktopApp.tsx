import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Minus, Square, X } from "lucide-react";

import { ModerationMenu } from "./app/ChatFeed";
import { useBotAuth } from "./app/BotAuth";
import { DEFAULT_COMMANDS } from "./app/ChatBotPanel";
import ChannelsPanel, { AddChannelModal, type ChannelsStyle } from "./app/ChannelsPanel";
import type { QueueItem } from "./app/VoicePanel";
import HeaderAudioControl from "./app/HeaderAudioControl";

import SettingsShell from "./app/SettingsShell";
import type { SettingsTabId } from "./app/SettingsShell";
import { IconBtn, TrafficLights } from "./app/ui";

import { getVariant } from "../lib/variants";
import { DEFAULT_FILTER_BLOCKS, type FilterBlock, checkMessageFilters } from "../lib/filters";
import {
  DEFAULT_CHAT_VIEW,
  DEFAULT_HOTKEYS,
  DEFAULT_OVERLAY,
  DEFAULT_TTS,
  DEFAULT_WIDGET,
  DEFAULT_DONATE,
  DEFAULT_EVENT_SOUNDS,
  DEFAULT_REWARD_SOUNDS,
  DEFAULT_TWITCH_AUTO_PIN,
  DEFAULT_MEMEALERTS,
  DONATE_PLATFORMS,
  isDonatePlatform,
} from "../lib/types";
import type {
  BotCommand,
  ChatMsg,
  ChatViewConfig,
  Channel,
  EventSoundId,
  EventSoundsConfig,
  MemeAlertsConfig,
  ModerationRequest,
  OverlayConfig,
  PlatformId,
  RewardSoundsConfig,
  TwitchAutoPinConfig,
  TtsConfig,
  WidgetConfig,
  DonateConfig,
} from "../lib/types";
import {
  DEFAULT_DONATEBAR,
  clampDonateBarTitle,
  isDonateBarStyle,
  normalizeDonateBarConfig,
  normalizeDonateBarState,
  type DonateBarConfig,
  type DonateBarState,
} from "../lib/donatebar";
import {
  isDesktop,
  onHostEvent,
  ttsBridge,
  windowCtl,
  applyHotkeys,
  channelsApi,
  overlayBridge,
  runModerationOnPlatform,
  botApi,
  sendChatMessage,
  hideChatMessages,
  widgetInfo,
  widgetConfig,
  channelRewards,
  createChannelReward,
  widgetRewardSound,
  widgetRewardSounds,
  openExternal,
  memealertsBridge,
  donatebarBridge,
} from "../lib/bridge";
import type {
  BotPlatform,
  ChannelReward,
  ChannelSub,
  CreateRewardResult,
  MemeAlertsStatus,
} from "../lib/bridge";
import {
  markChannelReconnecting,
  updateChannelError,
  updateChannelLikes,
  updateChannelStatus,
} from "../lib/channelStatus";
import type { ChannelErrorEvent, ChannelLikesEvent, ChannelStatusEvent } from "../lib/channelStatus";
import { usePersisted } from "../lib/persist";
import {
  CUSTOM_SOUNDS_KEY,
  REWARD_CUSTOM_SOUNDS_KEY,
  playDonateSound,
  setCustomSounds as applyCustomSounds,
  setRewardCustomSounds as applyRewardCustomSounds,
} from "../lib/donateSounds";
import type { CustomSound } from "../lib/donateSounds";
import {
  findRewardRule,
  mergeCreatedRewards,
  mergeRewardRules,
  prepareRewardDraft,
  rewardDataOf,
  rewardEventKey,
  rewardRuleVolume,
  rewardTitleOf,
  seedRewardTitleCache,
  rememberRewardTitle,
} from "../lib/rewardSounds";
import type { RewardDraft } from "../lib/rewardSounds";
import ChatShell from "./app/ChatShell";
import { makeSystem, randomScheduleDelay, seedChannels, tickDemo } from "../lib/demoChat";
import { nickColor, platformMeta } from "../lib/platforms";
import { sanitizeForSpeech, stripEmotes } from "../lib/emotes";

type HotkeyMap = Record<string, string>;

/** Запас над выбранным лимитом показа: скрытие удалённых и фильтры не должны
    оставлять ленту пустой. 0 в настройке «без лимита» — запас не нужен. */
const FEED_HEADROOM = 100;

/** Обрезка истории по выбранному лимиту. `cap <= 0` — без ограничения: строки
    живут в памяти весь эфир, а размер DOM ограничивает окно виртуализации. */
function trimFeed(list: ChatMsg[], cap: number): ChatMsg[] {
  return cap > 0 ? list.slice(-cap) : list;
}

/** Повтор того же текста от зрителя не озвучивается это время. */
const TTS_REPEAT_MS = 30_000;

function ttsRepeatKey(m: ChatMsg): string {
  const text = String(m.text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return `${m.platform}:${String(m.author).toLowerCase()}:${text}`;
}

/* «Воздух»: графит со светом — тёмная основа и лавандовый акцент.
   Белого в окне нет: плашки и линии на тон светлее основы. */
const AIR_TOKENS = {
  "--dw-bg": "#14151c",
  "--dw-panel": "#1b1d26",
  "--dw-panel2": "#22252f",
  "--dw-line": "#2e3240",
  "--dw-text": "#e9e8f4",
  "--dw-dim": "#9b9eb2",
  "--dw-hover": "#262a35",
  "--dw-input": "#20232c",
  "--dw-scroll": "#3b4050",
  "--dw-range-rest": "#333849",
  "--dw-accent": "#8b7cf6",
  "--dw-accent-2": "#b3a6ff",
  "--dw-accent-ink": "#12131a",
} as React.CSSProperties;

/* «Студия»: почти чёрная основа и лаймовый акцент из референса.
   На акценте пишем тёмным — белый по лайму не читается. */
const STUDIO_TOKENS = {
  "--dw-bg": "#0b0d10",
  "--dw-panel": "#101318",
  "--dw-panel2": "#161a20",
  "--dw-line": "#262c36",
  "--dw-text": "#eef1f6",
  "--dw-dim": "#98a1b2",
  "--dw-hover": "#1b2029",
  "--dw-input": "#191d24",
  "--dw-scroll": "#39404c",
  "--dw-range-rest": "#2c333e",
  "--dw-accent": "#b6f24a",
  "--dw-accent-2": "#d3ff85",
  "--dw-accent-ink": "#0b0d10",
} as React.CSSProperties;

/* «macOS»: вибрантное окно — тёмная основа, стеклянные панели,
   системный синий акцент. По мотивам src-mac. */
const MAC_TOKENS = {
  "--dw-bg": "#131316",
  "--dw-panel": "#1c1c1f",
  "--dw-panel2": "#242428",
  "--dw-line": "rgba(255,255,255,0.10)",
  "--dw-text": "#f5f5f7",
  "--dw-dim": "#98989d",
  "--dw-hover": "rgba(255,255,255,0.07)",
  "--dw-input": "rgba(255,255,255,0.08)",
  "--dw-scroll": "rgba(255,255,255,0.22)",
  "--dw-range-rest": "rgba(255,255,255,0.18)",
  "--dw-accent": "#0A84FF",
  "--dw-accent-2": "#409CFF",
  "--dw-accent-ink": "#ffffff",
} as React.CSSProperties;

/** Палитра окна по виду: ключи совпадают с VariantId из lib/variants. */
const VARIANT_TOKENS: Record<string, React.CSSProperties> = {
  air: AIR_TOKENS,
  studio: STUDIO_TOKENS,
  mac: MAC_TOKENS,
};

let qSeq = 100;

export default function DesktopApp() {
  // Не монтируем окно с раскладкой «Команда», пока не прочитан выбор пользователя.
  // Иначе после первого кадра меняются и палитра, и расположение панелей.
  const [variantId, setVariantId, variantLoaded] = usePersisted<string>("variant", "air");
  /* Демо-ссылки: ?view=studio&tab=rewards открывают нужный вид и раздел.
     Применяем один раз, после того как прочитаны сохранённые настройки. */
  useEffect(() => {
    if (!variantLoaded) return;
    const view = new URLSearchParams(window.location.search).get("view");
    if (view && view !== variantId) setVariantId(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantLoaded]);
  if (!variantLoaded) {
    return <div className="dw-startup" role="status" aria-label="Загрузка интерфейса" />;
  }
  return <DesktopWindow variantId={variantId} setVariantId={setVariantId} />;
}

function DesktopWindow({
  variantId,
  setVariantId,
}: {
  variantId: string;
  setVariantId: (v: string | ((previous: string) => string)) => void;
}) {
  const desktop = isDesktop();
  const [feed, setFeed] = useState<ChatMsg[]>([]);
  /** Новая версия приложения (хост проверил релизы): «Доступна версия X» */
  const [updateInfo, setUpdateInfo] = useState<{ version: string; download: string } | null>(null);
  // в приложении каналы стартуют пустыми и наполняются реальными коннекторами хоста;
  // в браузере — демо-витрина
  const [channels, setChannels] = useState<Channel[]>(() => (isDesktop() ? [] : seedChannels()));
  /* «Воздух»: быстрый фильтр ленты и пауза. Оба влияют только на показ —
     сама лента и звуки продолжают работать. */
  const [airFilter, setAirFilter] = useState<"all" | "important" | "donate" | "reward">("all");
  const [feedPaused, setFeedPaused] = useState(false);
  const [feedSnapshot, setFeedSnapshot] = useState<ChatMsg[] | null>(null);
  const [feedSearch, setFeedSearch] = useState("");
  /* история зрителей для графиков во всех видах окна */
  const [viewersHistory, setViewersHistory] = useState<number[]>([]);
  const [subs, setSubs, subsLoaded] = usePersisted<ChannelSub[]>("subscriptions", []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>("voice");
  const [addChannelOpen, setAddChannelOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);

  /* ----- уведомления ----- */
  const [toastText, setToastText] = useState("");
  const toastTimer = useRef(0);
  const toast = useCallback((t: string) => {
    setToastText(t);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastText(""), 2400);
  }, []);

  /* ----- настройки ----- */
  const [tts, setTts] = usePersisted<TtsConfig>("tts", DEFAULT_TTS);
  /** ники в нижнем регистре, чьи сообщения не озвучиваются («чёрный список» озвучки) */
  const [ttsMuted, setTtsMuted] = usePersisted<string[]>("ttsMutedUsers", []);
  const [donateCfg, setDonateCfg] = usePersisted<DonateConfig>("donate", DEFAULT_DONATE);
  const [chatView, setChatView] = usePersisted<ChatViewConfig>("chatView", DEFAULT_CHAT_VIEW);
  const [widgetCfg, setWidgetCfg, widgetLoaded] = usePersisted<WidgetConfig>("widget", DEFAULT_WIDGET);
  const [overlayCfg, setOverlayCfg, overlayLoaded] = usePersisted<OverlayConfig>("overlay", DEFAULT_OVERLAY);
  /* звуки уведомлений: события эфира и свои файлы пользователя */
  const [eventSounds, setEventSounds] = usePersisted<EventSoundsConfig>("eventSounds", DEFAULT_EVENT_SOUNDS);
  const [customSounds, setCustomSoundList] = usePersisted<CustomSound[]>(CUSTOM_SOUNDS_KEY, []);
  /* Звуки наград за баллы канала: отдельный блок настроек и отдельная
     библиотека файлов — в обычных уведомлениях они не предлагаются. */
  /* Третий элемент — «настройки прочитаны». Пока он false, список правил в
     памяти пуст, и слияние с наградами площадки стёрло бы уже настроенные
     звуки. Все обновления списка наград ждут загрузки. */
  const [rewardSounds, setRewardSounds, rewardSoundsLoaded] = usePersisted<RewardSoundsConfig>(
    "rewardSounds",
    DEFAULT_REWARD_SOUNDS,
  );
  const [rewardCustom, setRewardCustomList] = usePersisted<CustomSound[]>(REWARD_CUSTOM_SOUNDS_KEY, []);
  const [hotkeys, setHotkeys, hotkeysLoaded] = usePersisted<HotkeyMap>("hotkeys", DEFAULT_HOTKEYS);
  const [maxFeed, setMaxFeed] = usePersisted<number>("maxFeed", 300);
  /* Текущий предел истории в памяти. Держим ещё и ссылкой: обновления ленты
     живут в долгих эффектах и замыканиях, которые не должны пересоздаваться
     при смене настройки. 0 = без ограничения. */
  const feedCapRef = useRef(FEED_HEADROOM + 300);
  useEffect(() => {
    feedCapRef.current = maxFeed > 0 ? maxFeed + FEED_HEADROOM : 0;
  }, [maxFeed]);
  const [closeToTray, setCloseToTray] = usePersisted<boolean>("closeToTray", false);
  const [minimizeToTray, setMinimizeToTray] = usePersisted<boolean>("minimizeToTray", false);
  const [startHidden, setStartHidden] = usePersisted<boolean>("startHidden", false);
  /* Защита от «обрезанного» окна: приложение всегда стартует развёрнутым.
     Отключается только вручную в настройках. */
  const [startMaximized, setStartMaximized] = usePersisted<boolean>("startMaximized", true);
  const [channelsCollapsed, setChannelsCollapsed] = usePersisted<boolean>("channelsCollapsed", false);
  /* Режим «Только чат» (UI-1.3): сайдбар каналов, панель фильтров и строка
     ввода скрыты — лента занимает всё окно. Как и свёрнутые каналы,
     запоминается между запусками. */
  const [focusMode, setFocusMode] = usePersisted<boolean>("focusMode", false);
  const [hideDeleted, setHideDeleted] = usePersisted<boolean>("feedHideDeleted", false);
  const [mentionHL, setMentionHL] = usePersisted<boolean>("feedMentionHL", true);

  /* правила фильтрации чата (банворды Twitch, троллинг, спам) */
  const [filterBlocks] = usePersisted<FilterBlock[]>("filterBlocksConfig", DEFAULT_FILTER_BLOCKS);
  const filterBlocksRef = useRef(filterBlocks);
  filterBlocksRef.current = filterBlocks;

  const [whiteAuthors] = usePersisted<string[]>("whiteAuthors", []);
  const whiteAuthorsRef = useRef(whiteAuthors);
  whiteAuthorsRef.current = whiteAuthors;

  const [ignoreAuthors] = usePersisted<string[]>("ignoreAuthors", []);
  const ignoreAuthorsRef = useRef(ignoreAuthors);
  ignoreAuthorsRef.current = ignoreAuthors;

  const variant = useMemo(() => getVariant(variantId), [variantId]);

  /* ----- «сохранено» ----- */
  const [savedAt, setSavedAt] = useState(0);
  const savedTimer = useRef(0);
  const markSaved = useCallback(
    (label?: string) => {
      setSavedAt(Date.now());
      window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setSavedAt(0), 1900);
      if (label) toast(label);
    },
    [toast],
  );

  const patchDonate = useCallback(
    (p: Partial<DonateConfig>) => {
      setDonateCfg((prev) => ({ ...prev, ...p }));
      markSaved();
    },
    [setDonateCfg, markSaved],
  );

  /* ---------- донаты: MemeAlerts (OAuth) и полоса донатов ----------
     Настройки полосы и креды MemeAlerts сохраняются как обычные настройки;
     накопленный ИТОГ полосы и OAuth-токены живут в хосте — поэтому и сумма,
     и вход переживают закрытие приложения. Живые снимки приходят событиями. */
  const [donatebarCfg, setDonatebarCfg, donatebarLoaded] = usePersisted<DonateBarConfig>(
    "donatebar",
    DEFAULT_DONATEBAR,
  );
  const [donatebarState, setDonatebarState] = useState<DonateBarState | null>(null);
  const [memealertsCfg, setMemealertsCfg] = usePersisted<MemeAlertsConfig>("memealerts", DEFAULT_MEMEALERTS);
  const [memealertsStatus, setMemealertsStatus] = useState<MemeAlertsStatus | null>(null);
  /* Базовый URL виджета (для ссылки OBS полосы донатов) */
  const [widgetBase, setWidgetBase] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void widgetInfo().then((info) => {
      if (alive && info.running) setWidgetBase(info.url);
    });
    return () => {
      alive = false;
    };
  }, []);

  const patchDonatebar = useCallback(
    (p: Partial<DonateBarConfig>) => {
      setDonatebarCfg((prev) => {
        const next = { ...DEFAULT_DONATEBAR, ...prev, ...p };
        return {
          ...next,
          style: isDonateBarStyle(next.style) ? next.style : DEFAULT_DONATEBAR.style,
          title: clampDonateBarTitle(next.title),
          barOnly: next.barOnly === true,
        };
      });
      markSaved();
    },
    [setDonatebarCfg, markSaved],
  );
  /* Старый стиль и настройки без новых полей один раз приводятся к текущему виду.
     Пока человек печатает надпись, повторно её не трогаем — иначе съедается пробел. */
  useEffect(() => {
    if (!donatebarLoaded) return;
    if (
      isDonateBarStyle(donatebarCfg.style) &&
      typeof donatebarCfg.title === "string" &&
      typeof donatebarCfg.barOnly === "boolean"
    )
      return;
    setDonatebarCfg(normalizeDonateBarConfig(donatebarCfg));
  }, [donatebarLoaded, donatebarCfg, setDonatebarCfg]);
  const patchMemealerts = useCallback(
    (p: Partial<MemeAlertsConfig>) => {
      setMemealertsCfg((prev) => ({ ...DEFAULT_MEMEALERTS, ...prev, ...p }));
      markSaved();
    },
    [setMemealertsCfg, markSaved],
  );

  /* Первый снимок полосы и статус MemeAlerts берём при старте; далее —
     событиями. В браузере (без хоста) живой суммы нет, показываем настройки. */
  const refreshMemealertsStatus = useCallback(async () => {
    const s = await memealertsBridge.status();
    setMemealertsStatus(s);
    return s;
  }, []);

  useEffect(() => {
    let alive = true;
    void refreshMemealertsStatus();
    if (isDesktop())
      void donatebarBridge.info().then((s) => {
        if (alive && s) setDonatebarState(normalizeDonateBarState(s));
      });
    const unsub = onHostEvent((type, payload) => {
      if (!alive || type !== "donatebar.update") return;
      const s = normalizeDonateBarState(payload);
      if (s) setDonatebarState(s);
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [refreshMemealertsStatus]);

  const onMemealertsAuthorize = useCallback(async () => {
    try {
      const r = await memealertsBridge.authorize();
      await refreshMemealertsStatus();
      toast(`MemeAlerts подключён${r.name ? `: ${r.name}` : ""}`);
    } catch (e) {
      await refreshMemealertsStatus();
      toast(e instanceof Error ? e.message : "Не удалось подключиться к MemeAlerts");
    }
  }, [refreshMemealertsStatus, toast]);

  const onMemealertsLogout = useCallback(async () => {
    memealertsBridge.logout();
    await refreshMemealertsStatus();
    toast("MemeAlerts отключён");
  }, [refreshMemealertsStatus, toast]);

  const onDonatebarReset = useCallback(() => {
    donatebarBridge.reset();
    toast("Сумма полосы сброшена к стартовой");
  }, [toast]);

  /* Смена токена площадки из вкладки «Донаты»: обновляем подписку и
     переподключаем канал, чтобы новый токен сразу забрал донаты. */
  const onUpdateChannelToken = useCallback(
    (id: string, token: string) => {
      const c = channelsRef.current.find((x) => x.id === id);
      if (!c) return;
      setChannels((prev) => prev.map((x) => (x.id === id ? { ...x, token } : x)));
      setSubs((prev) =>
        prev.map((s) =>
          s.platform === c.platform && s.username === c.username ? { ...s, token: token || undefined } : s,
        ),
      );
      if (desktop)
        channelsApi.reconnect({
          platform: c.platform,
          username: c.username,
          token,
          currency: c.currency,
          donateSound: c.donateSound,
        });
    },
    [desktop, setChannels, setSubs],
  );

  const patchTts = useCallback(
    (p: Partial<TtsConfig>) => {
      setTts((prev) => ({ ...prev, ...p }));
      markSaved();
    },
    [setTts, markSaved],
  );
  const patchChatView = useCallback(
    (c: ChatViewConfig) => {
      setChatView(c);
      markSaved();
    },
    [setChatView, markSaved],
  );
  const patchWidget = useCallback(
    (c: WidgetConfig) => {
      setWidgetCfg(c);
      markSaved();
    },
    [setWidgetCfg, markSaved],
  );

  /* Оформление виджета OBS уходит хосту сразу после чтения настроек и при
     каждом изменении — независимо от того, открыта ли вкладка «Виджет».
     Раньше оно отправлялось только из самой вкладки: пока её не открывали,
     источник в OBS работал с умолчаниями (например, не скрывал старые
     сообщения, хотя исчезновение было включено), и настройка «оживала»
     лишь после изменения времени. До загрузки настроек ничего не шлём:
     иначе в OBS на мгновение уехали бы умолчания поверх сохранённого. */
  useEffect(() => {
    if (!desktop || !widgetLoaded) return;
    widgetConfig(widgetCfg);
  }, [desktop, widgetLoaded, widgetCfg]);
  const patchOverlay = useCallback(
    (c: OverlayConfig) => {
      setOverlayCfg(c);
      markSaved();
    },
    [setOverlayCfg, markSaved],
  );

  const patchEventSounds = useCallback(
    (p: Partial<EventSoundsConfig>) => {
      setEventSounds((prev) => ({ ...prev, ...p }));
      markSaved();
    },
    [setEventSounds, markSaved],
  );

  /* Свои звуки держим и в проигрывателе: он берёт их без пропсов. */
  const eventSoundsRef = useRef(eventSounds);
  eventSoundsRef.current = eventSounds;
  useEffect(() => {
    applyCustomSounds(customSounds);
  }, [customSounds]);

  const setCustomSoundsList = useCallback(
    (list: CustomSound[]) => {
      setCustomSoundList(list);
      applyCustomSounds(list);
      markSaved();
    },
    [setCustomSoundList, markSaved],
  );

  /* Звуки наград: своя библиотека файлов в проигрывателе + кэш в источнике
     OBS, чтобы награда была слышна на трансляции, а не только в окне. */
  const rewardSoundsRef = useRef(rewardSounds);
  rewardSoundsRef.current = rewardSounds;
  useEffect(() => {
    applyRewardCustomSounds(rewardCustom);
    if (desktop) widgetRewardSounds(rewardCustom);
  }, [rewardCustom, desktop]);

  const setRewardCustomSoundsList = useCallback(
    (list: CustomSound[]) => {
      setRewardCustomList(list);
      applyRewardCustomSounds(list);
      if (desktop) widgetRewardSounds(list);
      markSaved();
    },
    [setRewardCustomList, desktop, markSaved],
  );

  const patchRewardSounds = useCallback(
    (p: Partial<RewardSoundsConfig>) => {
      setRewardSounds((prev) => ({ ...prev, ...p }));
      markSaved();
    },
    [setRewardSounds, markSaved],
  );

  /* Загрузка наград авторизованных каналов Twitch и VK Видео Live. Стримеру
     не нужно вписывать названия руками — после входа или кнопкой «Обновить»
     приложение создаёт отдельные строки, остаётся выбрать звук. Уже
     настроенные строки и награды, удалённые на площадке, сохраняются. */
  const [rewardsSyncing, setRewardsSyncing] = useState(false);
  /* Признак «загрузка идёт» держим ещё и ссылкой: событие входа приходит в
     обработчик, собранный один раз, и по состоянию он видел бы устаревшее
     значение — повторный запрос уходил бы поверх первого. */
  const rewardsSyncingRef = useRef(false);
  /* Запрос на обновление наград, пришедший до чтения настроек: выполним его
     сразу после загрузки — слияние по пустому списку потеряло бы уже
     настроенные звуки. */
  const pendingRewardSyncRef = useRef<{
    quiet: boolean;
    account?: string;
    platform?: BotPlatform;
  } | null>(null);
  const syncRewardRules = useCallback(
    async (quiet = false, accountFromEvent?: string, platformFromEvent?: BotPlatform) => {
      if (!rewardSoundsLoaded) {
        pendingRewardSyncRef.current = { quiet, account: accountFromEvent, platform: platformFromEvent };
        return;
      }
      /* Канал берём из события входа, а не из состояния: на ПЕРВОМ входе
         состояние ещё не успело обновиться, и без этого загрузка наград
         отваливалась бы с «сначала войдите в Twitch».
         Награды отдают обе площадки со входом — Twitch и VK Видео Live, —
         поэтому кнопка обновления собирает их со всех авторизованных. */
      const targets: { platform: BotPlatform; account: string }[] = platformFromEvent
        ? [{ platform: platformFromEvent, account: (accountFromEvent ?? "").trim() }]
        : (["twitch", "vkplay"] as BotPlatform[])
            .map((platform) => ({ platform, account: (botAuthRef.current[platform] ?? "").trim() }))
            .filter((t) => !!t.account);

      const usable = targets.filter((t) => !!t.account);
      if (usable.length === 0) {
        if (!quiet) {
          toast(
            "Сначала войдите в Twitch или VK Видео Live в разделе «Чат-бот» — награды берутся из вашего канала",
          );
        }
        return;
      }
      if (rewardsSyncingRef.current) return;
      rewardsSyncingRef.current = true;
      setRewardsSyncing(true);
      try {
        const collected: ChannelReward[] = [];
        const problems: string[] = [];
        for (const target of usable) {
          const res = await channelRewards(target.platform, target.account);
          if (!res.ok) {
            problems.push(res.error ?? "Не удалось загрузить награды");
            continue;
          }
          collected.push(...res.rewards.map((reward) => ({ ...reward, platform: target.platform })));
        }
        if (collected.length === 0) {
          if (!quiet) toast(problems[0] ?? "На канале пока нет наград за баллы");
          return;
        }
        /* Заполняем кэш id → название. Если первая активация VK придёт до
           того как площадка сообщит название, звук всё равно найдётся по id,
           а в рендерере будет настоящее имя для отладки и кэша. */
        seedRewardTitleCache(collected);
        // и уже настроенные правила дополняют кэш (у них могут быть свои id
        // из более ранней синхронизации или ручного ввода)
        seedRewardTitleCache(rewardSoundsRef.current.rules);
        const found = mergeRewardRules(rewardSoundsRef.current.rules, collected);
        // слияние могло привязать id к старым правилам без площадки — кэш
        // тоже обновляем, чтобы поиск для конкретной площадки не промахивался
        seedRewardTitleCache(found.rules);
        setRewardSounds((prev) => {
          const merged = mergeRewardRules(prev.rules, collected);
          return merged.changed ? { ...prev, rules: merged.rules } : prev;
        });
        if (found.changed) markSaved();
        if (found.added.length === 0) {
          if (!quiet) {
            toast(
              found.changed
                ? "Разделение наград по площадкам обновлено"
                : "Все награды канала уже есть в настройках",
            );
          }
          return;
        }
        const names = found.added.slice(0, 3).join(", ");
        const more = found.added.length > 3 ? " и ещё " + (found.added.length - 3) : "";
        const over = found.skipped > 0 ? ` Не влезло в лимит: ${found.skipped}.` : "";
        toast(`Добавлено наград: ${found.added.length} (${names}${more}) — выберите звук.${over}`);
      } finally {
        rewardsSyncingRef.current = false;
        setRewardsSyncing(false);
      }
    },
    [setRewardSounds, markSaved, toast, rewardSoundsLoaded],
  );

  /* Создание награды прямо из приложения: цена и площадки выбираются в
     настройках, хост отправляет награду в Twitch и VK Видео Live. После
     ответа площадки строка награды появляется в списке звуков сразу —
     стримеру остаётся выбрать звук, а не жать «Обновить». */
  const createReward = useCallback(
    async (draft: RewardDraft): Promise<CreateRewardResult> => {
      const check = prepareRewardDraft(draft);
      if (!check.ok) {
        return {
          ok: false,
          created: [],
          failed: draft.platforms.map((platform) => ({ platform, error: check.error })),
        };
      }

      const result = await createChannelReward(check.reward);
      if (result.created.length > 0) {
        const merged = mergeCreatedRewards(rewardSoundsRef.current.rules, result.created);
        if (merged.changed) {
          setRewardSounds((prev) => ({ ...prev, rules: merged.rules }));
          seedRewardTitleCache(merged.rules);
          markSaved();
        }
        const names = result.created
          .map((r) => (r.platform === "twitch" ? "Twitch" : "VK Видео Live"))
          .join(" и ");
        toast(`Награда «${check.reward.title}» создана: ${names}`);
      }
      if (result.created.length === 0 && result.failed.length > 0) {
        toast(result.failed[0].error);
      }
      return result;
    },
    [setRewardSounds, markSaved, toast],
  );

  /* Настройки звуков наград прочитаны — заполняем кэш id → название из
     уже сохранённых правил. Без этого первая активация VK без названия
     не смогла бы найти правило по id до нажатия «Обновить». */
  useEffect(() => {
    if (!rewardSoundsLoaded) return;
    seedRewardTitleCache(rewardSoundsRef.current.rules);
  }, [rewardSoundsLoaded, rewardSounds.rules]);

  /* Настройки звуков наград прочитаны — выполняем отложенное обновление
     списка наград (его запросили вход в площадку или запуск приложения). */
  useEffect(() => {
    if (!rewardSoundsLoaded) return;
    const pending = pendingRewardSyncRef.current;
    if (!pending) return;
    pendingRewardSyncRef.current = null;
    void syncRewardRules(pending.quiet, pending.account, pending.platform);
  }, [rewardSoundsLoaded, syncRewardRules]);

  /* Свободное перемещение оверлея теперь включено ВСЕГДА (настройка убрана
     из интерфейса). У тех, кто раньше её не включал, включаем автоматически.
     Само перемещение доступно, только когда выключен сквозной клик. */
  const overlayMigratedRef = useRef(false);
  useEffect(() => {
    if (!overlayLoaded || overlayMigratedRef.current) return;
    overlayMigratedRef.current = true;
    if (!overlayCfg.freePosition || overlayCfg.corner !== "free") {
      setOverlayCfg((prev) => ({ ...prev, freePosition: true, corner: "free" }));
    }
  }, [overlayLoaded, overlayCfg.freePosition, overlayCfg.corner, setOverlayCfg]);
  const patchHotkeys = useCallback(
    (map: HotkeyMap) => {
      // регистрацию выполняет эффект выше — здесь только сохраняем
      setHotkeys(map);
      markSaved();
    },
    [setHotkeys, markSaved],
  );

  /* ГЛАВНОЕ: регистрируем горячие клавиши при СТАРТЕ приложения.
     Раньше applyHotkeys вызывался только при изменении настроек, поэтому
     после перезапуска сохранённые клавиши не регистрировались в системе —
     они «оживали» лишь после ручной перенастройки. */
  useEffect(() => {
    if (!desktop || !hotkeysLoaded) return;
    applyHotkeys(hotkeys);
  }, [desktop, hotkeysLoaded, hotkeys]);

  /* Реальное состояние окна при запуске интерфейса: кнопка «во весь экран»
     должна соответствовать окну, даже если его развернуло само приложение. */
  useEffect(() => {
    if (!desktop) return;
    void windowCtl.isMaximized().then(setMaximized);
  }, [desktop]);

  /** быстрое вкл/выкл озвучки: кнопка в шапке новых видов */
  const toggleTts = useCallback(() => {
    patchTts({ enabled: !tts.enabled });
    toast(tts.enabled ? "Озвучка выключена" : "Озвучка включена");
  }, [patchTts, tts.enabled, toast]);

  /** открыть «шестерёнку» на конкретной вкладке */
  const openSettings = useCallback((tab?: SettingsTabId) => {
    if (tab) setSettingsTab(tab);
    setSettingsOpen(true);
  }, []);

  /* ?tab=... из адреса демо-страницы: открыть нужный раздел настроек */
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab) openSettings(tab as SettingsTabId);
  }, [openSettings]);

  /* ----- очередь озвучки ----- */
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [paused, setPaused] = useState(false);
  const speakingRef = useRef(false);
  const ttsRef = useRef(tts);
  ttsRef.current = tts;
  const ttsMutedRef = useRef(ttsMuted);
  ttsMutedRef.current = ttsMuted;
  /** когда этот зритель последний раз озвучивал этот же текст */
  const ttsRepeatAtRef = useRef(new Map<string, number>());
  const donateRef = useRef(donateCfg);
  donateRef.current = donateCfg;

  const buildPhrase = useCallback((m: ChatMsg): string | null => {
    const t = ttsRef.current;

    // Чёрный список озвучки: сообщения этого зрителя не проговариваются.
    if (
      ttsMutedRef.current.includes(
        String(m.author ?? "")
          .trim()
          .toLowerCase(),
      )
    )
      return null;

    // ----- донаты, подписки, подарки, рейды, награды — ТОЛЬКО звук, без озвучки -----
    // По запросу: все события из блока «Звуки уведомлений» не проговариваются.
    if (
      m.kind === "donate" ||
      m.kind === "sub" ||
      m.kind === "gift" ||
      m.kind === "raid" ||
      m.kind === "reward"
    ) {
      return null;
    }

    if (t.donatesOnly) return null;
    if (m.kind !== "chat" && m.kind !== "command") return null;

    // смайлы и стикеры по умолчанию не озвучиваются
    const source = t.speakEmotes ? String(m.text ?? "") : stripEmotes(String(m.text ?? ""), m.platform);
    if (!source) return null;

    if (t.skipCommands && source.startsWith("!")) return null;
    if (t.skipLinks && /(https?:\/\/|\b\w+\.(ru|com|gg|tv)\b)/i.test(source)) return null;
    if (source.length > t.maxLen) return null;
    const caps = (source.match(/[А-ЯA-ZЁ]/g) ?? []).length;
    const letters = (source.match(/[А-Яа-яA-Za-zЁё]/g) ?? []).length;
    if (letters > 8 && (caps / letters) * 100 > t.capsLimit) return null;

    let text = source;
    // @упоминания не озвучиваются — читаем только текст без @ника
    text = text
      .replace(/(^|\s)@\S+/gu, "$1")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (t.squashRepeats) text = text.replace(/(.)\1{2,}/g, "$1$1");
    if (t.stripEmoji) text = text.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "");
    text = text.replace(/https?:\/\/\S+/gi, t.linkPhrase);
    // постоянное правило: служебные символы («\», «|», «~» и пр.) не озвучиваются
    text = sanitizeForSpeech(text);
    if (!text) return null;

    const parts: string[] = [];
    if (t.speakPlatform) parts.push(`С площадки ${m.platform}.`);
    if (t.speakAuthor) parts.push(`${m.author}:`);
    parts.push(text);
    return parts.join(" ");
  }, []);

  /* id фразы, которая озвучивается прямо сейчас. После «пропустить» /
     «очистить очередь» отменённый запрос ещё может завершиться — по id
     понимаем, что он уже не актуален, и не даём ему снять СЛЕДУЮЩУЮ фразу
     (раньше завершение любого старого запроса делало slice(1) вслепую:
     озвучка «путалась» — фразы пропадали, удваивались или шли не по порядку). */
  const currentSpeakIdRef = useRef<number | null>(null);

  /** Убрать из очереди конкретную фразу: звучащую сейчас, иначе первую. */
  const dropQueueItem = useCallback((id: number | null) => {
    setQueue((q) => {
      if (q.length === 0) return q;
      const idx = id === null ? -1 : q.findIndex((x) => x.id === id);
      return q.filter((_, i) => i !== (idx >= 0 ? idx : 0));
    });
  }, []);

  /* Пауза доходит и до приложения: нейроголос теперь замолкает на середине
     фразы, а не просто перестаёт начинать новые. */
  useEffect(() => {
    if (!desktop) return;
    if (paused) ttsBridge.pause();
    else ttsBridge.resume();
  }, [paused, desktop]);

  /* проигрывание: WebView2 → SAPI через мост, браузер → speechSynthesis */
  useEffect(() => {
    if (paused || speakingRef.current || !queue.length) return;
    const item = queue[0];
    // Раньше здесь был лишний цикл: сначала помечали «speaking», ждали
    // повторный рендер и только потом озвучивали — это добавляло задержку
    // к каждой фразе. Стартуем сразу, статус обновляем параллельно.
    speakingRef.current = true;
    currentSpeakIdRef.current = item.id;
    if (item.status !== "speaking") {
      setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "speaking" } : x)));
    }
    const done = () => {
      // убираем из очереди ИМЕННО эту фразу, а не «первую попавшуюся»
      setQueue((q) => (q.some((x) => x.id === item.id) ? q.filter((x) => x.id !== item.id) : q));
      // завершился отменённый запрос — очередь уже озвучивает другую фразу,
      // флаг не трогаем
      if (currentSpeakIdRef.current === item.id) {
        currentSpeakIdRef.current = null;
        speakingRef.current = false;
      }
    };
    const t = ttsRef.current;
    if (desktop) {
      ttsBridge
        .speak(item.text, t.voice, t.rate, t.volume, t.engine ?? "edge", item.author, Boolean(t.muteOnPc))
        .then(done)
        .catch((error) => {
          const message = error instanceof Error ? error.message : "неизвестная ошибка";
          toast(`${t.engine === "edge" ? "Edge TTS" : "SAPI"}: ${message}`);
          done();
        });
    } else if (!t.muteOnPc && typeof window.speechSynthesis !== "undefined") {
      // Браузер после длинной серии фраз «засыпает» и больше не говорит,
      // пока его не разбудить. resume перед каждой фразой это снимает.
      try {
        window.speechSynthesis.resume();
      } catch {
        /* нет синтезатора */
      }
      const u = new SpeechSynthesisUtterance(item.text);
      const vs = window.speechSynthesis.getVoices();
      const v = vs.find((x) => x.name === t.voice) ?? vs.find((x) => x.lang.startsWith("ru"));
      if (v) u.voice = v;
      u.rate = t.rate;
      u.volume = t.volume;
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.speak(u);
    } else {
      window.setTimeout(done, 900);
    }
  }, [queue, paused, desktop, toast]);

  /** Свой звук доната для площадки — сохраняется вместе с каналом. */
  const setChannelDonateSound = useCallback(
    (channelId: string, sound: string) => {
      const target = channelsRef.current.find((c) => c.id === channelId);
      setChannels((cur) => cur.map((c) => (c.id === channelId ? { ...c, donateSound: sound } : c)));
      if (target) {
        setSubs((prev) =>
          prev.map((sub) =>
            sub.platform === target.platform && sub.username === target.username
              ? { ...sub, donateSound: sound }
              : sub,
          ),
        );
      }
      markSaved();
    },
    [setChannels, setSubs, markSaved],
  );

  /* Звук уведомления о новом сообщении. Набор звуков общий со звуками
     донатов. Частота ограничена паузой из настроек, иначе плотный чат
     превращается в непрерывный треск. */
  const msgSoundAtRef = useRef(0);
  const notifyMessageSound = useCallback((m: ChatMsg) => {
    if (m.deleted) return;
    const t = ttsRef.current;
    if (!t.msgSoundEnabled) return;
    if (m.kind !== "chat") return; // только обычные сообщения

    if (t.msgSoundMentionsOnly) {
      const me = Object.values(botAuthRef.current)
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());
      const text = String(m.text ?? "").toLowerCase();
      if (!me.some((nick) => nick && text.includes("@" + nick))) return;
    }

    const now = Date.now();
    const gap = Math.max(0, t.msgSoundCooldown ?? 0) * 1000;
    if (now - msgSoundAtRef.current < gap) return;
    msgSoundAtRef.current = now;
    playDonateSound(t.msgSound, t.msgSoundVolume ?? 0.5);
  }, []);

  /* Звук события эфира: подписка, подарок, фолловер, рейд.
     У каждого события свой сигнал и своя громкость.
     Награды за баллы канала сюда не входят: у каждой награды свой звук,
     его выбирает notifyRewardSound. */
  const notifyEventSound = useCallback((m: ChatMsg) => {
    if (m.deleted) return;
    const map = eventSoundsRef.current;
    if (!map) return;
    // Фолловер приходит тем же типом, что и подписка: различаем по тексту
    // («подписался на канал» — это фолл, «оформил подписку» — платная).
    const isFollow = m.kind === "sub" && /подписал(ся|ась) на канал|фолл/i.test(String(m.text ?? ""));
    const key: EventSoundId | null = isFollow
      ? "follow"
      : m.kind === "sub"
        ? "sub"
        : m.kind === "gift"
          ? "gift"
          : m.kind === "raid"
            ? "raid"
            : null;
    if (!key) return;
    const rule = map[key];
    if (!rule?.enabled) return;
    playDonateSound(rule.sound, rule.volume ?? 0.7);
  }, []);

  /* Звук награды за баллы канала: свой звук у каждой награды.
     Награды без правила молчат — звука «по умолчанию для всех» здесь нет,
     иначе индивидуальные настройки превращаются в лотерею. */
  const rewardSoundAtRef = useRef(0);
  const rewardNotificationsRef = useRef(new Set<string>());
  const notifyRewardSound = useCallback(
    (m: ChatMsg) => {
      if (m.deleted || m.kind !== "reward") return;
      // id награды — это id шаблона награды, а не конкретной активации.
      // Для защиты от дубля используем сквозной id события, иначе после
      // первого выкупа все следующие активации той же награды замолкали.
      const eventKey = rewardEventKey(m);
      if (rewardNotificationsRef.current.has(eventKey)) return;
      rewardNotificationsRef.current.add(eventKey);
      if (rewardNotificationsRef.current.size > 500) {
        const first = rewardNotificationsRef.current.values().next().value;
        if (first) rewardNotificationsRef.current.delete(first);
      }
      const cfg = rewardSoundsRef.current;
      if (!cfg?.enabled) return;
      // id награды надёжнее названия, но уникален только внутри площадки.
      // Для старых настроек без площадки остаётся безопасный запасной поиск.
      const rewardPlatform = m.platform === "twitch" || m.platform === "vkplay" ? m.platform : undefined;
      const rule = findRewardRule(cfg.rules, rewardTitleOf(m), m.reward?.id, rewardPlatform);
      /* Играем ровно то, что выбрано в настройках этой награды. Раньше
         звук награды считался «своим файлом» и правило со встроенным
         сигналом молчало — теперь такие настройки не теряются. */
      if (!rule || !String(rule.sound)) return;

      /* Правило нашлось — запомним его название по id награды. Следующие
         активации VK без названия (cp_reward_demand_update, где площадка
         шлёт только id и статус заявки) уже не останутся с заглушкой
         «награда», даже если каталог наград в этой сессии не загружался. */
      if (rule.id) rememberRewardTitle(rewardPlatform, rule.id, rule.title);

      /* Пауза между сигналами: серия наград (рейд зрителей с баллами) иначе
       сливается в непрерывный треск. Пропускаем, а не обрываем — звук,
       который уже начался, должен доиграть. */
      const now = Date.now();
      const gap = Math.max(0, cfg.cooldown ?? 0) * 1000;
      if (gap > 0 && now - rewardSoundAtRef.current < gap) return;
      rewardSoundAtRef.current = now;

      const volume = rewardRuleVolume(rule);
      playDonateSound(rule.sound, volume);
      // Звук награды слышен и на трансляции: страница виджета OBS играет его
      // сама (встроенные — синтезом, свои файлы — из своего кэша).
      if (desktop) widgetRewardSound(rule.sound, volume);
    },
    [desktop],
  );

  const speakNow = useCallback(
    (m: ChatMsg) => {
      if (m.deleted) return;
      const t = ttsRef.current;
      const d = donateRef.current;
      const isDonate = m.kind === "donate";
      // Звуковые сигналы играют ВСЕГДА (если включены в настройках) — это
      // только уведомление, не привязанное к тумблеру озвучки.
      notifyMessageSound(m);
      notifyEventSound(m);
      notifyRewardSound(m);

      // Сигнал доната — свой путь (звук по умолчанию или назначенный площадке).
      if (isDonate && d.soundEnabled) {
        const own = channelsRef.current.find((c) => c.platform === m.platform)?.donateSound;
        playDonateSound(own ?? d.sound, d.soundVolume);
      }

      // Озвучка голосом — только обычные сообщения чата (и команды бота),
      // управляется тумблером «Озвучка». События (сабы, подарки, донаты,
      // рейды, награды) в очередь больше не попадают.
      if (!t.enabled) return;

      const phrase = buildPhrase(m);
      if (!phrase) return;

      // Спам: одно и то же сообщение от зрителя в течение 30 сек не озвучивается.
      const now = Date.now();
      const spamKey = ttsRepeatKey(m);
      const prevAt = ttsRepeatAtRef.current.get(spamKey) ?? 0;
      if (now - prevAt < TTS_REPEAT_MS) return;
      ttsRepeatAtRef.current.set(spamKey, now);
      if (ttsRepeatAtRef.current.size > 300) {
        for (const [k, at] of ttsRepeatAtRef.current) {
          if (now - at >= TTS_REPEAT_MS) ttsRepeatAtRef.current.delete(k);
        }
      }

      setQueue((q) => {
        const next = [...q, { id: ++qSeq, author: m.author, text: phrase, status: "waiting" as const }];
        if (next.length <= 25) return next;
        // Очередь переполнена — убираем САМЫЕ СТАРЫЕ ожидающие фразы, но
        // никогда ту, что звучит прямо сейчас.
        const speakingId = currentSpeakIdRef.current;
        const head = next.filter((x) => x.id === speakingId);
        const rest = next.filter((x) => x.id !== speakingId);
        return [...head, ...rest.slice(-(25 - head.length))];
      });
    },
    // notifyEventSound и notifyRewardSound обязательны в списке: без них
    // замыкание держало старые карты звуков, и сигналы событий играли по
    // устаревшим настройкам.
    [buildPhrase, notifyMessageSound, notifyEventSound, notifyRewardSound],
  );

  const skipQueueItem = useCallback(() => {
    if (desktop) ttsBridge.clear();
    else window.speechSynthesis?.cancel();
    /* Убираем ИМЕННО ту фразу, что звучит сейчас. Раньше срезался первый
       элемент очереди: если звучащая фраза уже ушла из списка, «пропустить»
       выбрасывало следующее сообщение, а текущее продолжало звучать. */
    dropQueueItem(currentSpeakIdRef.current);
    speakingRef.current = false;
    currentSpeakIdRef.current = null;
  }, [desktop, dropQueueItem]);

  const clearQueue = useCallback(() => {
    if (desktop) ttsBridge.clear();
    else window.speechSynthesis?.cancel();
    speakingRef.current = false;
    currentSpeakIdRef.current = null;
    setQueue([]);
  }, [desktop]);

  const testSpeak = useCallback((text: string) => {
    setQueue((q) => [...q, { id: ++qSeq, author: "тест", text, status: "waiting" }]);
    setPaused(false);
  }, []);

  /* авторизованные аккаунты бота: канал и вход живут вместе */
  const [botAuth, setBotAuth, botAuthLoaded] = useBotAuth();
  const botAuthRef = useRef(botAuth);
  useEffect(() => {
    botAuthRef.current = botAuth;
  }, [botAuth]);

  /* При запуске загрузка сохранённых аккаунтов не создаёт событие
     bot.authorized. Синхронизируем награды один раз после чтения настроек,
     чтобы правила VK/Twitch обновлялись и без повторного входа. */
  const initialRewardSyncRef = useRef(false);
  useEffect(() => {
    /* Ждём и вход чат-бота, и чтение настроек звуков: до этого список правил
       в памяти пуст, и обновление наград стёрло бы настроенные звуки. */
    if (!botAuthLoaded || !rewardSoundsLoaded || initialRewardSyncRef.current) return;
    initialRewardSyncRef.current = true;
    if (botAuth.twitch?.trim() || botAuth.vkplay?.trim()) void syncRewardRules(true);
  }, [botAuthLoaded, rewardSoundsLoaded, botAuth.twitch, botAuth.vkplay, syncRewardRules]);

  /* ----- команды чат-бота ----- */
  const [botCommands, setBotCommands] = usePersisted<BotCommand[]>("botCommands", DEFAULT_COMMANDS);
  const [twitchAutoPin, setTwitchAutoPin] = usePersisted<TwitchAutoPinConfig>(
    "twitchAutoPin",
    DEFAULT_TWITCH_AUTO_PIN,
  );
  const twitchAutoPinRef = useRef(twitchAutoPin);
  twitchAutoPinRef.current = twitchAutoPin;
  const autoPinStartedRef = useRef(new Set<string>());
  const botCommandsRef = useRef(botCommands);
  useEffect(() => {
    botCommandsRef.current = botCommands;
  }, [botCommands]);
  const cmdCooldownRef = useRef<Record<string, number>>({});
  /** последний отправленный ботом ответ на канал — защита от эха */
  const sentRepliesRef = useRef<Record<string, string>>({});

  const runBotCommand = useCallback(
    (msg: ChatMsg) => {
      if (msg.deleted) return;
      // Ответы можно отправлять через те площадки, для которых настроен
      // авторизованный бот. Публичное чтение чата само по себе входа не требует.
      const botPlatform: BotPlatform | undefined =
        msg.platform === "twitch" || msg.platform === "vkplay" ? msg.platform : undefined;
      if (!desktop || msg.kind !== "chat" || !botPlatform || !botAuthRef.current[botPlatform]?.trim()) return;
      const text = (msg.text ?? "").trim();
      if (!text.startsWith("!")) return;

      // Защита от зацикливания — ТОЛЬКО по тексту ответа бота.
      // Раньше сравнивался автор с авторизованным аккаунтом, но у стримера
      // ник совпадает с именем канала, поэтому его собственные команды
      // («!вк» в своём чате) молча игнорировались.
      const echoKey = `${msg.platform}:${(msg.channel ?? "").toLowerCase()}`;
      if (sentRepliesRef.current[echoKey] === text) return;

      // триггер сравниваем без «!» — его часто сохраняют по-разному
      const norm = (v: string) => v.trim().toLowerCase().replace(/^!+/, "");
      const trigger = norm(text.split(/\s+/)[0]);
      const list = Array.isArray(botCommandsRef.current) ? botCommandsRef.current : [];
      const cmd = list.find(
        (c) =>
          c.enabled && norm(c.trigger) === trigger && (c.platform === "all" || c.platform === msg.platform),
      );
      if (!cmd) return;

      // кулдаун на команду и канал
      const key = `${cmd.id}:${msg.platform}:${msg.channel}`;
      const now = Date.now();
      const readyAt = cmdCooldownRef.current[key] ?? 0;
      if (now < readyAt) return;
      cmdCooldownRef.current[key] = now + Math.max(0, cmd.cooldown) * 1000;

      const answer = cmd.response.replace(/\{user\}/gi, msg.author);
      // канал ответа = канал, откуда пришла команда; если коннектор его не
      // передал, берём подключённый канал этой площадки
      const target =
        (msg.channel ?? "").trim() ||
        channelsRef.current.find((c) => c.platform === msg.platform)?.username ||
        "";
      if (!target) {
        setFeed((f) => trimFeed([...f, makeSystem("Бот: неизвестен канал для ответа")], feedCapRef.current));
        return;
      }
      sentRepliesRef.current[`${msg.platform}:${target.toLowerCase()}`] = answer;
      void sendChatMessage(msg.platform, target, answer)
        .then(() => {
          // ответ реально ушёл в чат площадки — показываем его и в ленте
          setFeed((f) => trimFeed([...f, makeSystem(`Бот → ${target}: ${answer}`)], feedCapRef.current));
        })
        .catch((e: unknown) => {
          const err = e instanceof Error ? e.message : "не удалось отправить ответ";
          setFeed((f) => trimFeed([...f, makeSystem(`Бот: ${err}`)], feedCapRef.current));
        });
    },
    [desktop],
  );

  /* ----- каналы ----- */
  const subKey = useCallback(
    (platform: PlatformId, username: string) => `${platform}:${username.toLowerCase()}`,
    [],
  );

  const connectChannel = useCallback(
    (
      platform: PlatformId,
      username: string,
      opts?: { token?: string; currency?: string; donateSound?: string },
    ) => {
      const sub: ChannelSub = { platform, username, ...opts };
      if (desktop) {
        // реальное подключение через коннектор хоста
        setSubs((prev) => [
          ...prev.filter((s) => subKey(s.platform, s.username) !== subKey(platform, username)),
          sub,
        ]);
        channelsApi.connect(sub);
        setChannels((prev) => [
          ...prev.filter((c) => !(c.platform === platform && c.username === username)),
          {
            id: `c-${subKey(platform, username)}`,
            platform,
            username,
            status: "connecting",
            viewers: 0,
            messages: 0,
            ...opts,
          },
        ]);
        setFeed((f) =>
          trimFeed([...f, makeSystem(`Подключение: ${platform}/${username}…`)], feedCapRef.current),
        );
        toast(`Подключаем ${username}…`);
        return;
      }
      // браузерная демо-витрина
      const id = `c${Date.now()}`;
      setChannels((prev) => [
        ...prev.filter((c) => !(c.platform === platform && c.username === username)),
        { id, platform, username, status: "connecting", viewers: 0, messages: 0, ...opts },
      ]);
      setFeed((f) =>
        trimFeed([...f, makeSystem(`Подключение: ${platform}/${username}…`)], feedCapRef.current),
      );
      window.setTimeout(
        () => {
          const online = Math.random() > 0.25;
          setChannels((prev) =>
            prev.map((c) =>
              c.id === id
                ? {
                    ...c,
                    status: online ? "online" : "offline",
                    viewers: online ? 120 + Math.floor(Math.random() * 4000) : 0,
                  }
                : c,
            ),
          );
          setFeed((f) =>
            trimFeed(
              [
                ...f,
                makeSystem(
                  online
                    ? `Подключено: ${platform}/${username}`
                    : `${platform}/${username} сейчас офлайн — чат ждёт эфир`,
                ),
              ],
              feedCapRef.current,
            ),
          );
        },
        900 + Math.random() * 1400,
      );
      toast(`Подключаем ${username}…`);
    },
    [desktop, setSubs, subKey, toast],
  );

  const disconnectChannel = useCallback(
    (id: string) => {
      const c = channelsRef.current.find((x) => x.id === id);
      if (c && desktop) {
        channelsApi.disconnect({ platform: c.platform, username: c.username });
        setSubs((prev) => prev.filter((s) => !(s.platform === c.platform && s.username === c.username)));

        // Канал авторизованного аккаунта удалён → сбрасываем и саму авторизацию
        const authPlatform: BotPlatform | undefined =
          c.platform === "twitch" || c.platform === "vkplay" ? c.platform : undefined;
        const account = authPlatform ? botAuthRef.current[authPlatform] : undefined;
        if (authPlatform && account && account.toLowerCase() === c.username.toLowerCase()) {
          const name = authPlatform === "twitch" ? "Twitch" : "VK Видео Live";
          botApi.logout(authPlatform);
          setBotAuth((prev) => {
            const next = { ...prev };
            delete next[authPlatform];
            return next;
          });
          setFeed((f) =>
            trimFeed([...f, makeSystem(`Авторизация ${name} сброшена вместе с каналом`)], feedCapRef.current),
          );
        }
      }
      if (c)
        setFeed((f) =>
          trimFeed([...f, makeSystem(`Отключено: ${c.platform}/${c.username}`)], feedCapRef.current),
        );
      setChannels((prev) => prev.filter((x) => x.id !== id));
    },
    [desktop, setSubs, setBotAuth],
  );

  const reconnectChannel = useCallback(
    (id: string) => {
      const c = channelsRef.current.find((x) => x.id === id);
      setChannels((prev) => markChannelReconnecting(prev, id));
      if (desktop && c) {
        channelsApi.reconnect({
          platform: c.platform,
          username: c.username,
          token: c.token,
          currency: c.currency,
        });
        return;
      }
      window.setTimeout(() => {
        setChannels((prev) =>
          prev.map((x) =>
            x.id === id
              ? {
                  ...x,
                  status: "online" as const,
                  viewers: x.viewers || 300 + Math.floor(Math.random() * 2000),
                }
              : x,
          ),
        );
      }, 1000);
    },
    [desktop],
  );

  /* ----- демо-симуляция (в WebView2 события приходят от хоста) ----- */
  const channelsRef = useRef(channels);
  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);

  /* Время последней служебной строки по каждому каналу: одинаковые статусы
     (офлайн/ошибка/подключено) не должны дублироваться в ленте при каждой
     фоновой перепроверке эфира — раньше офлайн-каналы спамили повторами. */
  const statusLineRef = useRef(new Map<string, number>());

  useEffect(() => {
    if (desktop) return; // хост присылает реальные события
    let alive = true;
    let timer = 0;

    // приветствие
    setFeed([makeSystem("YawaChat · демо-режим — в приложении здесь живой чат со всех площадок")]);
    const t0 = window.setTimeout(() => {
      setChannels((prev) =>
        prev.map((c) => (c.username === "kra1n_38" ? { ...c, status: "online" as const, viewers: 486 } : c)),
      );
      setFeed((f) => [...f, makeSystem("Подключено: vkplay/kra1n_38")]);
    }, 2600);

    const schedule = () => {
      timer = window.setTimeout(() => {
        if (!alive) return;
        const { msg, drift } = tickDemo(channelsRef.current);
        if (msg) {
          if (msg.kind === "chat" && msg.text) {
            const filterCheck = checkMessageFilters(
              msg.text,
              msg.platform,
              filterBlocksRef.current,
              msg.author,
              whiteAuthorsRef.current,
              ignoreAuthorsRef.current,
            );
            if (filterCheck.matched) {
              msg.deleted = true;
              if (msg.platform === "twitch") {
                toast(`Демо Twitch: автомодерация скрыла запрещённое слово («${filterCheck.word}»)`);
              } else if (filterCheck.blockId === "trolling") {
                toast(`Демо «Троллинг»: скрыто сообщение («${filterCheck.word}»)`);
              }
            }
          }
          setFeed((f) => trimFeed([...f, msg], feedCapRef.current));
          if (!msg.deleted) {
            speakNow(msg);
          }
        }
        if (drift.size) {
          setChannels((cur) => cur.map((c) => (drift.has(c.id) ? { ...c, viewers: drift.get(c.id)! } : c)));
        }
        schedule();
      }, randomScheduleDelay());
    };
    schedule();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.clearTimeout(t0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktop]);

  /* При запуске сообщаем, что виджет для OBS жив: раньше единственным
     признаком был сам источник в OBS, и когда он молчал, приходилось
     передобавлять его или обновлять кэш браузера. */
  const reportWidgetAlive = useCallback(() => {
    void widgetInfo().then((info) => {
      setFeed((f) =>
        trimFeed(
          [
            ...f,
            makeSystem(
              info.running
                ? `Виджет для OBS работает · ${info.url}`
                : "Виджет для OBS не запустился — проверьте порт в настройках виджета",
            ),
          ],
          feedCapRef.current,
        ),
      );
    });
  }, []);

  /* при старте приложения: восстановить сохранённые подписки и подключить их реальными коннекторами */
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!desktop || hydratedRef.current || !subsLoaded) return;
    hydratedRef.current = true;
    if (!subs.length) {
      setFeed([
        makeSystem(`YawaChat ${__APP_VERSION__} · подключите канал — лента наполнится реальным чатом`),
      ]);
      reportWidgetAlive();
      return;
    }
    setFeed([makeSystem(`Восстановлен профиль: ${subs.length} кан. — подключаем…`)]);
    reportWidgetAlive();
    setChannels(
      subs.map((s) => ({
        id: `c-${subKey(s.platform, s.username)}`,
        platform: s.platform,
        username: s.username,
        status: "connecting" as const,
        viewers: 0,
        messages: 0,
        token: s.token,
        currency: s.currency,
        // звук доната выбран при подключении — восстанавливаем вместе с каналом
        donateSound: s.donateSound,
      })),
    );
    // Не запускаем все сетевые коннекторы в одну миллисекунду: TLS/WebSocket
    // рукопожатия распределены по 250 мс — старт без пика CPU/сети.
    const timers = subs.map((s, i) => window.setTimeout(() => channelsApi.connect(s), i * 250));
    return () => timers.forEach(window.clearTimeout);
    // reportWidgetAlive — useCallback с пустыми зависимостями, поэтому его
    // добавление не меняет число запусков эффекта; от повторного входа
    // дополнительно страхует hydratedRef.
  }, [desktop, subsLoaded, subs, subKey, reportWidgetAlive]);

  /* Сторож подключений: если канал застрял в «подключение», переподключаем
     его сами — то же действие, что кнопка «обновить» в карточке канала,
     только без участия пользователя. Раньше при неудачном стартовом
     подключении (сеть ещё не поднялась, первый запрос потерян в пути)
     канал так и висел в «подключение» до ручного «обновить». */
  const connectWatchRef = useRef(new Map<string, { since: number; tries: number }>());
  useEffect(() => {
    if (!desktop) return;
    // Порог с запасом: поиск эфира на YouTube штатно занимает до десятка
    // секунд, и прежние 15 секунд успевали оборвать нормальное подключение
    // на полпути — канал перезапускался по кругу и не подключался вовсе.
    const WATCHDOG_AFTER_MS = 45_000; // сколько ждём статус от площадки
    const MAX_TRIES = 2; // затем оставляем канал в покое
    const timer = window.setInterval(() => {
      const now = Date.now();
      const alive = new Set<string>();
      for (const c of channelsRef.current) {
        if (c.status !== "connecting") continue;
        alive.add(c.id);
        const entry = connectWatchRef.current.get(c.id) ?? { since: now, tries: 0 };
        if (entry.tries < MAX_TRIES && now - entry.since >= WATCHDOG_AFTER_MS) {
          entry.tries += 1;
          entry.since = now;
          channelsApi.reconnect({
            platform: c.platform,
            username: c.username,
            token: c.token,
            currency: c.currency,
            donateSound: c.donateSound,
          });
          setFeed((f) =>
            trimFeed(
              [...f, makeSystem(`Повторное подключение: ${c.platform}/${c.username}…`)],
              feedCapRef.current,
            ),
          );
        }
        connectWatchRef.current.set(c.id, entry);
      }
      // записи подключённых и удалённых каналов больше не нужны
      for (const id of Array.from(connectWatchRef.current.keys()))
        if (!alive.has(id)) connectWatchRef.current.delete(id);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [desktop]);

  /* Буфер входящих сообщений: копим кадр (~120 мс) и добавляем одной
     операцией. Так частота перерисовок не зависит от плотности чата. */
  const feedBufferRef = useRef<ChatMsg[]>([]);
  const feedFlushRef = useRef<number | null>(null);

  const pushToFeed = useCallback((msg: ChatMsg) => {
    feedBufferRef.current.push(msg);
    if (feedFlushRef.current !== null) return;
    feedFlushRef.current = window.setTimeout(() => {
      feedFlushRef.current = null;
      const batch = feedBufferRef.current;
      feedBufferRef.current = [];
      if (batch.length === 0) return;
      setFeed((f) => trimFeed([...f, ...batch], feedCapRef.current));
    }, 120);
  }, []);

  useEffect(
    () => () => {
      if (feedFlushRef.current !== null) window.clearTimeout(feedFlushRef.current);
    },
    [],
  );

  /* Сообщения, скрытые автомодерацией и фильтрами, должны исчезнуть и из
     виджета OBS, и из оверлея: они получают тот же поток сообщений, что и
     лента. Номера строк копим кадром — при спаме запрос на каждую строку
     был бы лишним. */
  const hideQueueRef = useRef<number[]>([]);
  const hideFlushRef = useRef<number | null>(null);
  const hideInPublic = useCallback(
    (sid?: number) => {
      if (!desktop || !sid) return;
      hideQueueRef.current.push(sid);
      if (hideFlushRef.current !== null) return;
      hideFlushRef.current = window.setTimeout(() => {
        hideFlushRef.current = null;
        const sids = hideQueueRef.current;
        hideQueueRef.current = [];
        if (sids.length) hideChatMessages({ sids });
      }, 60);
    },
    [desktop],
  );

  useEffect(
    () => () => {
      if (hideFlushRef.current !== null) window.clearTimeout(hideFlushRef.current);
    },
    [],
  );

  /* Стабильная ссылка не даёт обработчику глобального хоткея замкнуть
     устаревшее состояние режима «Только чат». */
  const runHotkeyActionRef = useRef<(action: string) => void>(() => undefined);

  /* события хоста WebView2: реальные сообщения, статусы каналов, хоткеи */
  useEffect(() => {
    if (!desktop) return;
    return onHostEvent((type, payload) => {
      if (type === "chat.message") {
        const m = (payload ?? {}) as Partial<ChatMsg> & {
          rewardTitle?: unknown;
          rewardId?: unknown;
          rewardCost?: unknown;
        };
        // защитная нормализация: коннекторы площадок могут прислать
        // неполные поля, а падение здесь гасило всё окно
        const platform = (m.platform ?? "twitch") as PlatformId;
        const author = String(m.author ?? "");

        // События модерации ОТ площадки: сообщение удалили/забанили в другом
        // клиенте — лента должна это отразить, а не жить своей жизнью.
        const kindRaw = String(m.kind ?? "chat");
        if (kindRaw.startsWith("moderation.")) {
          if (kindRaw === "moderation.delete" && m.msgId) {
            setFeed((f) => f.map((x) => (x.msgId === m.msgId ? { ...x, deleted: true } : x)));
          } else if (kindRaw === "moderation.ban") {
            const login = author.toLowerCase();
            const targetUserId = m.userId ? String(m.userId) : "";
            if (!login && !targetUserId) return;
            setFeed((f) =>
              f.map((x) =>
                x.platform === platform &&
                ((targetUserId && x.userId === targetUserId) || (login && x.author.toLowerCase() === login))
                  ? { ...x, deleted: true }
                  : x,
              ),
            );
          } else if (kindRaw === "moderation.clear") {
            setFeed((f) => f.filter((x) => x.platform !== platform));
          }
          return;
        }
        const norm: ChatMsg = {
          id: Date.now() + Math.random(),
          ts: typeof m.ts === "number" && m.ts > 0 ? m.ts : Date.now(),
          platform,
          channel: String(m.channel ?? ""),
          author,
          color: m.color || nickColor(author, platformMeta(platform).color),
          text: String(m.text ?? ""),
          kind: m.kind ?? "chat",
          badges: Array.isArray(m.badges) ? m.badges : undefined,
          badgeIcons: Array.isArray(m.badgeIcons) ? m.badgeIcons : undefined,
          avatar: typeof m.avatar === "string" && m.avatar.length > 0 ? m.avatar : undefined,
          amount: typeof m.amount === "number" ? m.amount : undefined,
          currency: m.currency,
          msgId: m.msgId,
          userId: m.userId,
          roomId: m.roomId,
          sid: typeof m.sid === "number" && m.sid > 0 ? m.sid : undefined,
          // Хост присылает поля награды плоскими, а новые источники могут
          // передавать вложенный reward — приводим оба варианта к одной форме.
          reward: rewardDataOf(m),
        };

        // Пустое сообщение чата показывать нечего (площадки присылают пустые
        // события при удалении/скрытии сообщений модератором).
        if (!norm.text && norm.kind === "chat") return;

        /* Мелкие «донаты» отсекаем полностью: DonationAlerts присылает
           подписки и фолловы как донат на 0 рублей, и в ленту сыпались
           лишние оповещения. Порог настраивается в «Звуках уведомлений». */
        if (norm.kind === "donate") {
          const floor = donateRef.current.minShowAmount ?? 0;
          if (floor > 0 && (norm.amount ?? 0) < floor) return;
        }

        // Фильтрация чата: банворды Twitch, блок «Троллинг», спам
        if (norm.kind === "chat" && norm.text) {
          const filterCheck = checkMessageFilters(
            norm.text,
            norm.platform,
            filterBlocksRef.current,
            norm.author,
            whiteAuthorsRef.current,
            ignoreAuthorsRef.current,
          );
          if (filterCheck.matched) {
            norm.deleted = true;
            // в виджете OBS и оверлее строка не должна остаться
            hideInPublic(norm.sid);
            const isTwitch = norm.platform === "twitch";
            const hasTwitchAuth = Boolean(botAuthRef.current?.twitch?.trim());

            // Если пришло сообщение из Twitch и авторизован бот Twitch —
            // автоматически удаляем сообщение на площадке через Twitch API
            if (isTwitch && hasTwitchAuth && desktop && norm.msgId) {
              void runModerationOnPlatform({
                action: "delete",
                platform: "twitch",
                channel: norm.channel,
                author: norm.author,
                msgId: norm.msgId,
                userId: norm.userId,
                roomId: norm.roomId,
              }).catch((err) => {
                console.warn("Twitch auto-delete failed:", err);
              });
            }

            if (filterCheck.blockId === "twitch" || filterCheck.isTwitchBanword) {
              if (isTwitch && hasTwitchAuth && desktop && norm.msgId) {
                toast(
                  `Twitch: автомодерация удалила запрещённое слово («${filterCheck.word}») от ${norm.author}`,
                );
              } else {
                toast(`Фильтр Twitch: скрыто сообщение с запрещённым словом («${filterCheck.word}»)`);
              }
            } else if (filterCheck.blockId === "trolling") {
              if (isTwitch && hasTwitchAuth && desktop && norm.msgId) {
                toast(`Фильтр «Троллинг»: удалено из чата Twitch («${filterCheck.word}»)`);
              } else {
                toast(`Фильтр «Троллинг»: скрыто сообщение от ${norm.author} («${filterCheck.word}»)`);
              }
            } else {
              toast(`Фильтр [${filterCheck.blockName}]: скрыто сообщение от ${norm.author}`);
            }
          }
        }

        // ПАКЕТНАЯ вставка: при плотном чате обновление состояния на каждое
        // сообщение вызывало перерисовку всего окна и грузило процессор.
        pushToFeed(norm);
        if (!norm.deleted) {
          speakNow(norm);
          runBotCommand(norm);
        }
      } else if (type === "bot.authorized") {
        // Вход выполнен → канал этого аккаунта добавляется автоматически
        const b = payload as { platform: PlatformId; account: string; channel?: string };
        if (b?.platform !== "twitch" && b?.platform !== "vkplay") return;
        // Награды этого канала сразу заводим в настройки звуков
        void syncRewardRules(false, b?.channel || b?.account, b.platform);
        const channelName = (b?.channel || b?.account || "").trim();
        if (b?.account && channelName) {
          setBotAuth((prev) => ({ ...prev, [b.platform]: channelName }));
          const exists = channelsRef.current.some(
            (c) => c.platform === b.platform && c.username.toLowerCase() === channelName.toLowerCase(),
          );
          if (!exists) connectChannel(b.platform, channelName);
        } else if (b?.account) {
          setBotAuth((prev) => ({ ...prev, [b.platform]: b.account }));
          setFeed((f) =>
            trimFeed(
              [...f, makeSystem(`${b.platform}: вход выполнен, но канал не найден — добавьте его вручную`)],
              feedCapRef.current,
            ),
          );
        }
      } else if (type === "hotkeys.failed") {
        // Клавишу занял другой процесс — раньше это было незаметно,
        // и пользователь считал, что хоткеи «не работают».
        const list = Array.isArray(payload) ? (payload as string[]) : [];
        const combos = list
          .map((x) => x.split(":").slice(1).join(":"))
          .filter(Boolean)
          .join(", ");
        if (combos) {
          toast(`Горячие клавиши заняты другой программой: ${combos}`);
          setFeed((f) =>
            trimFeed(
              [...f, makeSystem(`Не удалось назначить клавиши: ${combos}. Выберите другое сочетание.`)],
              feedCapRef.current,
            ),
          );
        }
      } else if (type === "moderation.result") {
        const r = payload as {
          action: string;
          platform: PlatformId;
          channel: string;
          msgId?: string;
          userId?: string;
          author?: string;
        };
        const platformName = platformMeta(r.platform).name;
        // Лента меняется ТОЛЬКО после успешного ответа площадки.
        if (r.action === "delete" && r.msgId) {
          setFeed((f) => f.map((x) => (x.msgId === r.msgId ? { ...x, deleted: true } : x)));
        } else if (r.action === "ban" || r.action === "timeout") {
          const login = (r.author ?? "").toLowerCase();
          const targetUserId = r.userId ? String(r.userId) : "";
          setFeed((f) =>
            f.map((x) =>
              x.platform === r.platform &&
              ((targetUserId && x.userId === targetUserId) || (login && x.author.toLowerCase() === login))
                ? { ...x, deleted: true }
                : x,
            ),
          );
        } else if (r.action === "mode-clear") {
          setFeed((f) => f.filter((x) => x.platform !== r.platform));
        }
        const actionName =
          r.action === "timeout"
            ? "таймаут"
            : r.action === "unban"
              ? "разбан"
              : r.action === "ban"
                ? "бан"
                : r.action === "delete"
                  ? "удаление"
                  : r.action;
        toast(`${platformName} подтвердил: ${actionName}`);
        setFeed((f) =>
          trimFeed(
            [...f, makeSystem(`${platformName}: ${actionName} выполнено в ${r.channel}`)],
            feedCapRef.current,
          ),
        );
      } else if (type === "channel.title") {
        // Площадка сообщила название канала — показываем его вместо номера
        const t = payload as { platform: PlatformId; username: string; title: string };
        if (t?.title) {
          setChannels((cur) =>
            cur.map((c) =>
              c.platform === t.platform && c.username.toLowerCase() === t.username.toLowerCase()
                ? { ...c, title: t.title }
                : c,
            ),
          );
        }
      } else if (type === "channel.error") {
        const error = payload as ChannelErrorEvent;
        if (error?.username && error?.platform) setChannels((cur) => updateChannelError(cur, error));
      } else if (type === "channel.likes") {
        const likes = payload as ChannelLikesEvent;
        if (likes?.username && likes?.platform) setChannels((cur) => updateChannelLikes(cur, likes));
      } else if (type === "channel.status") {
        const s = payload as ChannelStatusEvent;
        if (!s?.username || !s?.platform) return;
        const prev = channelsRef.current.find(
          (c) => c.platform === s.platform && c.username.toLowerCase() === s.username.toLowerCase(),
        );
        setChannels((cur) => updateChannelStatus(cur, s));
        if (s.platform === "twitch" && s.status === "online" && prev && prev.status !== "online") {
          const cfg = twitchAutoPinRef.current;
          const key = `${s.platform}:${s.username.toLowerCase()}`;
          if (cfg.enabled && cfg.message.trim() && !autoPinStartedRef.current.has(key)) {
            autoPinStartedRef.current.add(key);
            void sendChatMessage("twitch", s.username, cfg.message.trim(), cfg.durationSeconds)
              .then(() => {
                toast("Сообщение старта стрима отправлено и закреплено");
              })
              .catch((e: unknown) => {
                autoPinStartedRef.current.delete(key);
                toast(
                  `Автозакрепление: ${e instanceof Error ? e.message : "не удалось отправить сообщение"}`,
                );
              });
          }
        }
        // Не повторяем сообщение после краткого переподключения чата;
        // новый автозапуск разрешаем только после явного завершения эфира.
        if (s.status === "offline" || s.status === "error") {
          autoPinStartedRef.current.delete(`${s.platform}:${s.username.toLowerCase()}`);
        }
        if (prev && prev.status !== s.status) {
          const line =
            s.status === "online"
              ? `Подключено: ${s.platform}/${s.username}`
              : s.status === "offline"
                ? `${s.platform}/${s.username} офлайн — чат ждёт эфир`
                : s.status === "error"
                  ? `Ошибка подключения: ${s.platform}/${s.username}`
                  : "";
          if (line) {
            // Повтор той же строки того же канала — не чаще раза в 90 секунд:
            // офлайн-каналы перепроверяются в фоне, и без этого лента
            // заполнялась десятками одинаковых «офлайн — чат ждёт эфир».
            const key = `${s.platform}:${s.username.toLowerCase()}:${line}`;
            const lastAt = statusLineRef.current.get(key) ?? 0;
            if (Date.now() - lastAt > 90_000) {
              statusLineRef.current.set(key, Date.now());
              setFeed((f) => trimFeed([...f, makeSystem(line)], feedCapRef.current));
            }
          }
        }
      } else if (type === "overlay.moved") {
        // оверлей перетащили мышью — запоминаем позицию в настройках
        const pos = payload as { x: number; y: number };
        setOverlayCfg((prev) => ({ ...prev, posX: pos.x, posY: pos.y }));
      } else if (type === "overlay.resized") {
        // оверлей растянули за край — фиксируем новый размер в React,
        // иначе при следующем обновлении окно сбрасывалось в старый размер
        const sz = payload as { width: number; height: number };
        setOverlayCfg((prev) => ({ ...prev, width: sz.width, height: sz.height }));
      } else if (type === "window.state") {
        // Реальное состояние окна от приложения: кнопка «во весь экран»
        // всегда показывает то, что происходит на самом деле.
        const w = payload as { maximized?: boolean };
        setMaximized(!!w?.maximized);
      } else if (type === "tts.status") {
        /* Нейроголос пропал или вернулся: сообщаем один раз на смену состояния,
           чтобы пользователь понимал, почему звучит другой голос. */
        const s = payload as {
          cloud?: boolean;
          fallback?: boolean;
          voice?: string;
          fallbackEnabled?: boolean;
        } | null;
        if (!s || !ttsRef.current.enabled) return;
        if (s.cloud) {
          toast("Озвучка: нейроголос снова работает");
        } else if (s.fallbackEnabled === false) {
          toast("Озвучка: нейроголос недоступен, запасная озвучка выключена");
        } else if (!s.voice) {
          toast("Озвучка: нейроголос недоступен, а русского голоса в Windows нет");
        } else {
          toast("Озвучка: нейроголос недоступен — фразы читает голос Windows");
        }
      } else if (type === "hotkey") {
        runHotkeyActionRef.current(String(payload));
      } else if (type === "update.available") {
        // Хост проверил свежие релизы: показываем «Доступна версия X»
        // (чип в шапке, скрывается до следующего запуска).
        const p = (payload ?? {}) as { version?: unknown; download?: unknown };
        const version = String(p.version ?? "").trim();
        if (version) setUpdateInfo({ version, download: String(p.download ?? "") });
      }
    });
    // Обработчик использует стабильные ref-обёртки для событий хоста.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktop, hotkeys]);

  /** Очистка ленты НЕ трогает донаты: суммы по площадкам и общая сумма в
     оверлее считаются по ленте, поэтому раньше очистка обнуляла и их.
     Теперь убираются только сообщения и служебные строки. */
  const clearFeedKeepDonations = useCallback(() => {
    setFeed((f) => f.filter((m) => m.kind === "donate"));
    toast("Лента очищена");
  }, [toast]);

  /** Режим «Только чат» (UI-1.3): переключается кнопкой в шапке и хоткеем.
      Возврат — тем же способом или клавишей Esc. */
  const toggleFocus = useCallback(() => {
    // Значение, а не функция-обновление: сеттер настройки сам вызывает
    // побочные эффекты (сохранение и шину), их нельзя держать внутри
    // updater'а React.
    const next = !focusMode;
    setFocusMode(next);
    toast(next ? "Режим «Только чат»: панели скрыты" : "Режим «Только чат» выключен");
  }, [focusMode, setFocusMode, toast]);

  /* Esc снимает режим «Только чат»: в нём спрятаны все панели, и клавиша —
     самый быстрый способ вернуть управление, не ища кнопку в шапке. */
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      // в поле ввода Esc сначала снимает фокус, режим не трогаем
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      toggleFocus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode, toggleFocus]);

  /** действие по id (хоткеи хоста приходят уже как id действия) */
  const runHotkeyAction = useCallback(
    (action: string) => {
      switch (action) {
        case "toggleFocus":
          toggleFocus();
          break;
        case "toggleSpeech":
          patchTts({ enabled: !ttsRef.current.enabled });
          toast(ttsRef.current.enabled ? "Озвучка выключена" : "Озвучка включена");
          break;
        case "pauseQueue":
          setPaused((p) => !p);
          break;
        case "skipQueue":
          skipQueueItem();
          break;
        case "stopSpeech": {
          // Мгновенная тишина: оборвать текущую фразу и поставить очередь
          // на паузу. Продолжить — клавишей «пауза» (она же снимет паузу).
          const wasSpeaking = speakingRef.current;
          const speakingId = currentSpeakIdRef.current;
          if (desktop) void ttsBridge.clear();
          else window.speechSynthesis?.cancel();
          speakingRef.current = false;
          currentSpeakIdRef.current = null;
          // Убираем именно прерванную фразу, а не первую в списке.
          if (wasSpeaking) dropQueueItem(speakingId);
          setPaused(true);
          toast("Озвучка остановлена");
          break;
        }
        case "clearQueue":
          clearQueue();
          toast("Очередь очищена");
          break;
        case "clearFeed":
          clearFeedKeepDonations();
          break;
        case "toggleOverlay":
          if (desktop) {
            void overlayBridge.toggle().then((v) => toast(v ? "Оверлей показан" : "Оверлей скрыт"));
          } else {
            openSettings("overlay");
          }
          break;
        case "toggleClickThrough":
          setOverlayCfg((prev) => {
            // В свободном режиме прозрачность возвращается после фиксации;
            // в угловом режиме достаточно переключить сквозной клик.
            const enable = prev.freePosition ? !(prev.locked && prev.clickThrough) : !prev.clickThrough;
            toast(enable ? "Прозрачность оверлея включена" : "Прозрачность оверлея выключена");
            return prev.freePosition
              ? { ...prev, locked: enable, clickThrough: enable }
              : { ...prev, clickThrough: enable };
          });
          break;
      }
    },
    [
      desktop,
      patchTts,
      toast,
      skipQueueItem,
      clearQueue,
      openSettings,
      setOverlayCfg,
      clearFeedKeepDonations,
      dropQueueItem,
      toggleFocus,
    ],
  );

  runHotkeyActionRef.current = runHotkeyAction;

  /** комбинация клавиш → действие по текущей карте хоткеев */
  const handleHotkey = useCallback(
    (combo: string) => {
      const entry = Object.entries(hotkeys).find(([, v]) => v === combo);
      if (entry) runHotkeyAction(entry[0]);
    },
    [hotkeys, runHotkeyAction],
  );

  /* Локальные клавиши — ТОЛЬКО вне приложения.
     В WebView2 хоткеи регистрирует хост (RegisterHotKey) и присылает событие
     "hotkey". Раньше срабатывали оба обработчика сразу, и оверлей
     переключался дважды — визуально «через раз». */
  useEffect(() => {
    if (desktop) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      parts.push(e.code); // физический код — независимо от раскладки
      const combo = parts.join("+");
      if (Object.values(hotkeys).includes(combo)) {
        e.preventDefault();
        handleHotkey(combo);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkeys, handleHotkey, desktop]);

  /* ----- модерация ----- */
  const [modReq, setModReq] = useState<ModerationRequest | null>(null);
  /* Выключить/включить озвучку конкретного зрителя — переключатель живёт
     в меню по клику на ник в ленте чата. */
  const toggleTtsMute = useCallback(
    (author: string) => {
      const nick = String(author ?? "")
        .trim()
        .toLowerCase();
      if (!nick) return;
      const muted = ttsMutedRef.current.includes(nick);
      setTtsMuted(muted ? ttsMutedRef.current.filter((u) => u !== nick) : [...ttsMutedRef.current, nick]);
      toast(muted ? `Озвучка ${author} включена` : `Озвучка ${author} выключена`);
    },
    [setTtsMuted, toast],
  );

  const runModeration = useCallback(
    (action: string, msg: ChatMsg, arg?: number) => {
      setModReq(null);
      const platformName = platformMeta(msg.platform).name;

      if (!desktop) {
        toast("Модерация площадки доступна только в приложении");
        return;
      }
      if (msg.kind === "system") return;

      const experimentalVk = msg.platform === "vkplay" && action === "ban";
      if (msg.platform !== "twitch" && !experimentalVk) {
        toast(`Для ${platformName} доступен только бан зрителя`);
        return;
      }

      toast(experimentalVk ? "Отправляем команду бана в VK…" : `Отправляем действие в ${platformName}…`);
      void runModerationOnPlatform({
        action,
        platform: msg.platform,
        channel: msg.channel,
        author: msg.author,
        msgId: msg.msgId,
        userId: msg.userId,
        roomId: msg.roomId,
        seconds: typeof arg === "number" ? arg : undefined,
      })
        .then(() => {
          // Отправка в VK подтверждает только доставку текста в чат, не модерацию.
          if (experimentalVk) toast("VK: /ban отправлена в чат; выполнение площадкой не подтверждено.");
        })
        .catch((e: unknown) => {
          const text = e instanceof Error ? e.message : "не удалось выполнить на площадке";
          // Ничего локально не скрываем: площадка действие НЕ подтвердила.
          toast(`${platformName}: ${text}`);
          setFeed((f) => trimFeed([...f, makeSystem(`Ошибка ${platformName}: ${text}`)], feedCapRef.current));
        });
    },
    [toast, desktop],
  );

  /* Отправка сообщений в чаты авторизованных ботов Twitch и VK Видео Live.
     Остальные подключённые площадки пока доступны только для чтения. */
  const sendFromApp = useCallback(
    async (platform: PlatformId, channel: string, text: string, pinDurationSeconds?: number | null) => {
      const body = text.trim();
      if (!body) return;
      if (platform !== "twitch" && platform !== "vkplay") {
        toast(`Отправка сообщений в ${platformMeta(platform).name} пока не поддерживается`);
        return;
      }
      const platformName = platformMeta(platform).name;
      try {
        /* Своё сообщение показываем в ленте сразу и просим площадку не
           возвращать его копию: VK присылает отправленный текст обратно в
           чат, а Twitch — когда сообщение ушло ради закрепления. Без этого
           в ленте появлялись две одинаковые строки. */
        await sendChatMessage(platform, channel, body, pinDurationSeconds, true);
        const author = botAuthRef.current[platform] || "вы";
        pushToFeed({
          id: Date.now() + Math.random(),
          ts: Date.now(),
          platform,
          channel,
          author,
          color: nickColor(author, platformMeta(platform).color),
          text: body,
          kind: "chat",
          badges: ["broadcaster"],
        });
      } catch (e) {
        const err = e instanceof Error ? e.message : "не удалось отправить сообщение";
        toast(`${platformName}: ${err}`);
        throw e;
      }
    },
    [pushToFeed, toast],
  );

  /** Общая модерация канала: режимы чата, не связанные с пользователем. */
  const runChatMode = useCallback(
    (action: string, channel: string, platform: PlatformId, seconds?: number) => {
      if (platform !== "twitch" && platform !== "vkplay") {
        toast(`Режимы чата для ${platformMeta(platform).name} пока не поддерживаются`);
        return;
      }
      if (!desktop) {
        toast("Модерация доступна только в приложении");
        return;
      }
      const platformName = platformMeta(platform).name;
      toast(`Отправляем в ${platformName}…`);
      void runModerationOnPlatform({ action, platform, channel, seconds }).catch((e: unknown) => {
        const text = e instanceof Error ? e.message : "не удалось применить режим";
        toast(`${platformName}: ${text}`);
        setFeed((f) => trimFeed([...f, makeSystem(`Ошибка ${platformName}: ${text}`)], feedCapRef.current));
      });
    },
    [desktop, toast],
  );

  const onlineCount = channels.filter((c) => c.status === "online").length;
  const connectedCount = channels.filter((c) => c.status === "online" || c.status === "connected").length;
  const onlineViewers = channels.reduce((s, c) => s + (c.status === "online" ? c.viewers : 0), 0);

  /* Сводка по ленте одним проходом. Раньше на каждое сообщение лента
     обходилась многократно (общий счётчик + донаты + счётчик на площадку),
     что и давало основную нагрузку при плотном чате. */
  const feedSummary = useMemo(() => {
    let total = 0;
    let donateTotal = 0;
    let donateCount = 0;
    let donateCurrency: string | undefined;
    const perPlatform = new Map<PlatformId, number>();
    // Суммы донатов ОТДЕЛЬНО по каждой площадке: в списке каналов у
    // DonationAlerts и DonatePay своя сумма. Складываются они только в оверлее.
    const donatePerPlatform = new Map<PlatformId, { total: number; count: number; currency?: string }>();

    for (const m of feed) {
      if (m.kind === "system") continue;
      total++;
      perPlatform.set(m.platform, (perPlatform.get(m.platform) ?? 0) + 1);
      if (m.kind === "donate" && typeof m.amount === "number") {
        donateTotal += m.amount;
        donateCount++;
        donateCurrency = m.currency ?? donateCurrency;

        const own = donatePerPlatform.get(m.platform) ?? { total: 0, count: 0, currency: undefined };
        own.total += m.amount;
        own.count++;
        own.currency = m.currency ?? own.currency;
        donatePerPlatform.set(m.platform, own);
      }
    }
    return { total, donateTotal, donateCount, donateCurrency, perPlatform, donatePerPlatform };
  }, [feed]);

  const feedTotal = feedSummary.total;

  /* ----- статистика для панели оверлея: донаты первыми ----- */
  const overlayStats = useMemo(() => {
    const currency = feedSummary.donateCurrency ?? channels.find((c) => c.currency)?.currency ?? "₽";

    // ВАЖНО: площадки донатов (DonationAlerts, DonatePay) отдельными иконками
    // в оверлее не показываются — они идут одним блоком «донаты», где суммы
    // обеих площадок складываются. Иначе при двух подключённых сервисах
    // в оверлее дублировались бы иконки и суммы.
    const order: PlatformId[] = ["twitch", "youtube", "vkplay", "kick", "tiktok", "rutube", "boosty"];
    const platforms = order
      .filter((p) => !isDonatePlatform(p) && channels.some((c) => c.platform === p))
      .map((p) => {
        const list = channels.filter((c) => c.platform === p);
        return {
          platform: p,
          // «в эфире» только при подтверждённой трансляции, иначе просто подключено
          online: list.some((c) => c.status === "online"),
          connected: list.some((c) => c.status === "online" || c.status === "connected"),
          viewers: list.reduce((s, c) => s + (c.status === "online" ? c.viewers : 0), 0),
          likes:
            p === "tiktok"
              ? list.reduce((s, c) => s + (c.status === "online" ? (c.likes ?? 0) : 0), 0)
              : undefined,
          messages: feedSummary.perPlatform.get(p) ?? 0,
        };
      });

    return {
      donations: {
        total: feedSummary.donateTotal,
        currency,
        count: feedSummary.donateCount,
        // подключённые сервисы донатов: по ним оверлей выбирает одну иконку
        sources: DONATE_PLATFORMS.filter((p) => channels.some((c) => c.platform === p)),
      },
      platforms,
    };
  }, [feedSummary, channels]);

  /* отправляем статистику оверлею (не чаще раза в секунду) */
  const statsRef = useRef("");
  useEffect(() => {
    if (!desktop) return;
    const json = JSON.stringify(overlayStats);
    if (json === statsRef.current) return;
    const t = window.setTimeout(() => {
      statsRef.current = json;
      overlayBridge.stats(overlayStats);
    }, 700);
    return () => window.clearTimeout(t);
  }, [overlayStats, desktop]);

  /* конфиг оверлея — сразу в окно оверлея при изменении */
  useEffect(() => {
    if (desktop) overlayBridge.set(overlayCfg);
  }, [overlayCfg, desktop]);

  /* ----- применение палитры варианта к :root ----- */
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(variant.vars).forEach(([k, v]) => root.style.setProperty(k, v));
  }, [variant]);

  /* история зрителей: точка раз в 15 секунд, храним последние 20 */
  useEffect(() => {
    const push = () => setViewersHistory((prev) => [...prev.slice(-19), onlineViewers]);
    push();
    const timer = window.setInterval(push, 15000);
    return () => window.clearInterval(timer);
  }, [onlineViewers]);

  /* Показ ленты в новых видах: фильтр по типу события, поиск по тексту и
     «Пауза». На реальную ленту, озвучку и события это не влияет — только
     на то, что видно на экране. */
  const visibleFeed = useMemo(() => {
    const source = feedPaused && feedSnapshot ? feedSnapshot : feed;
    const byKind =
      airFilter === "all"
        ? source
        : source.filter((m) => {
            if (m.kind === "system") return false;
            if (airFilter === "important") return m.kind !== "chat";
            return m.kind === airFilter;
          });
    const q = feedSearch.trim().toLowerCase();
    if (!q) return byKind;
    return byKind.filter(
      (m) => m.author.toLowerCase().includes(q) || (m.text ?? "").toLowerCase().includes(q),
    );
  }, [feed, feedPaused, feedSnapshot, airFilter, feedSearch]);

  /* Общие действия окна: кнопки разные (обычные или «светофоры»), поведение одно. */
  const windowMinimize = () => {
    windowCtl.minimize();
    if (!desktop) toast("В приложении окно сворачивается на панель задач");
  };
  const windowToggleMaximize = () => {
    windowCtl.toggleMaximize();
    // В приложении состояние придёт событием окна (window.state):
    // сами его не выставляем, иначе кнопка может «залипнуть» в
    // неверном положении, если развернуть окно не получилось.
    if (!desktop) setMaximized((v) => !v);
  };
  const windowClose = () => {
    windowCtl.close(closeToTray);
    if (!desktop) toast(closeToTray ? "Окно ушло бы в трей" : "В приложении окно закрывается");
  };

  const winBtns =
    variant.id === "mac" ? (
      <TrafficLights
        onClose={windowClose}
        onMinimize={windowMinimize}
        onToggleMaximize={windowToggleMaximize}
        maximized={maximized}
        minimizeToTray={minimizeToTray}
        closeToTray={closeToTray}
      />
    ) : (
      <>
        <IconBtn
          icon={<Minus size={14} />}
          title={minimizeToTray ? "Свернуть в трей" : "Свернуть"}
          onClick={windowMinimize}
        />
        <IconBtn
          icon={maximized ? <Copy size={12} style={{ transform: "rotate(180deg)" }} /> : <Square size={12} />}
          title={maximized ? "Оконный режим" : "Во весь экран"}
          onClick={windowToggleMaximize}
        />
        <IconBtn
          icon={<X size={15} />}
          title={closeToTray ? "Скрыть в трей" : "Закрыть"}
          danger
          onClick={windowClose}
        />
      </>
    );

  const channelsBody = (
    <ChannelsPanel
      channels={channels}
      collapsed={channelsCollapsed}
      style={"command" as ChannelsStyle}
      donationByPlatform={feedSummary.donatePerPlatform}
      onToggleCollapsed={() => setChannelsCollapsed(!channelsCollapsed)}
      onConnect={connectChannel}
      onDisconnect={disconnectChannel}
      onReconnect={reconnectChannel}
      toast={toast}
    />
  );

  const rewardRows = rewardSounds.rules.map((r) => ({
    title: r.title,
    cost: r.cost,
    platform: r.platform as PlatformId,
  }));
  const subsCount = feed.filter((m) => m.kind === "sub").length;

  /* ============ РАСКЛАДКА ============ */
  return (
    <div
      className="dw-window flex h-screen w-screen flex-col overflow-hidden"
      style={{ background: "var(--dw-bg)", color: "var(--dw-text)", fontSize: 13 }}
    >
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{
          ...VARIANT_TOKENS[variant.id],
          /* цвет и фон задаём здесь же: элементы без своего цвета
             наследуют их от окна, иначе светлая палитра получала
             белый текст от тёмных значений по умолчанию */
          background: "var(--dw-bg)",
          color: "var(--dw-text)",
        }}
      >
        <ChatShell
          kind={variant.id}
          channels={channels}
          channelsPanel={channelsBody}
          onToggleChannel={(ch) => {
            /* «macOS» → раздел «Каналы»: включённый канал отключаем, отключённый — переподключаем */
            if (ch.status === "online" || ch.status === "connected" || ch.status === "connecting") {
              disconnectChannel(ch.id);
            } else {
              reconnectChannel(ch.id);
            }
          }}
          feed={visibleFeed}
          maxFeed={maxFeed}
          hideDeleted={hideDeleted}
          mentionHL={mentionHL}
          botAuth={botAuth}
          onModerate={setModReq}
          onSend={sendFromApp}
          chatView={chatView}
          onChatMode={runChatMode}
          onlineCount={onlineCount}
          connectedCount={connectedCount}
          viewers={onlineViewers}
          messages={feedTotal}
          donateTotal={feedSummary.donateTotal}
          donateCurrency={feedSummary.donateCurrency ?? "₽"}
          subs={subsCount}
          rewards={rewardRows}
          ttsOn={tts.enabled}
          ttsVolume={tts.volume ?? 0.9}
          onTtsVolume={(v) => patchTts({ volume: v })}
          onToggleTts={toggleTts}
          queueLength={queue.length}
          focusMode={focusMode}
          onToggleFocus={toggleFocus}
          onOpenSettings={openSettings}
          onAddChannel={() => setAddChannelOpen(true)}
          widgetUrl={widgetBase}
          onCopyWidget={() => {
            if (!widgetBase) return;
            void navigator.clipboard?.writeText(widgetBase).catch(() => undefined);
            toast("Ссылка на виджет скопирована");
          }}
          filter={airFilter}
          onFilter={setAirFilter}
          paused={feedPaused}
          onPause={() => {
            if (feedPaused) {
              setFeedPaused(false);
              setFeedSnapshot(null);
              toast("Лента продолжена");
            } else {
              setFeedSnapshot(feed);
              setFeedPaused(true);
              toast("Лента на паузе: новые сообщения не подмешиваются");
            }
          }}
          search={feedSearch}
          onSearch={setFeedSearch}
          onClearFeed={clearFeedKeepDonations}
          viewersHistory={viewersHistory}
          windowButtons={winBtns}
          audioPanel={
            <HeaderAudioControl
              queueLength={queue.length}
              ttsVolume={tts.volume ?? 0.9}
              msgVolume={tts.msgSoundVolume ?? 0.5}
              onTtsVolume={(v) => patchTts({ volume: v })}
              onMsgVolume={(v) => patchTts({ msgSoundVolume: v })}
              onPanic={() => {
                clearQueue();
                toast("Озвучка прервана, очередь очищена");
              }}
            />
          }
          updateBadge={
            updateInfo ? (
              <div
                className="no-drag flex items-center gap-0.5 rounded-full py-0.5 pr-0.5 pl-1 text-[10.5px] font-semibold"
                style={{ background: "rgba(251,191,36,0.14)", color: "#fbbf24" }}
              >
                <button
                  className="flex cursor-pointer items-center gap-1 rounded-full px-1.5 py-0.5 transition-all hover:brightness-125"
                  title="Открыть страницу скачивания"
                  onClick={() => openExternal(updateInfo.download)}
                >
                  <Download size={11} />
                  Версия {updateInfo.version}
                </button>
                <button
                  className="cursor-pointer rounded-full px-1 py-0.5 transition-all hover:brightness-150"
                  title="Скрыть до следующего запуска"
                  onClick={() => setUpdateInfo(null)}
                >
                  <X size={11} />
                </button>
              </div>
            ) : undefined
          }
          onHeaderDoubleClick={() => {
            windowCtl.toggleMaximize();
            if (!desktop) setMaximized((v) => !v);
          }}
        />
      </div>

      {/* модерация */}
      {modReq && (
        <ModerationMenu
          req={modReq}
          onAction={runModeration}
          onClose={() => setModReq(null)}
          ttsMuted={ttsMuted}
          onToggleTtsMute={toggleTtsMute}
          voicePicker={desktop && (tts.engine ?? "edge") === "edge"}
          onVoiceToast={toast}
        />
      )}

      {/* добавление канала (терминал-полоса) */}
      {addChannelOpen && (
        <AddChannelModal onClose={() => setAddChannelOpen(false)} onConnect={connectChannel} toast={toast} />
      )}

      {/* все настройки — под шестерёнкой */}
      <div style={VARIANT_TOKENS[variant.id]}>
        <SettingsShell
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          initialTab={settingsTab}
          tts={tts}
          patchTts={patchTts}
          donate={donateCfg}
          patchDonate={patchDonate}
          channels={channels}
          onChannelDonateSound={setChannelDonateSound}
          onConnectChannel={connectChannel}
          onDisconnectChannel={disconnectChannel}
          onReconnectChannel={reconnectChannel}
          onUpdateChannelToken={onUpdateChannelToken}
          memealerts={memealertsCfg}
          patchMemealerts={patchMemealerts}
          memealertsStatus={memealertsStatus}
          onMemealertsAuthorize={onMemealertsAuthorize}
          onMemealertsLogout={onMemealertsLogout}
          donatebar={donatebarCfg}
          patchDonatebar={patchDonatebar}
          donatebarState={donatebarState}
          onDonatebarReset={onDonatebarReset}
          widgetUrl={widgetBase}
          queue={queue}
          paused={paused}
          onPauseToggle={() => setPaused(!paused)}
          onSkipQueue={skipQueueItem}
          onClearQueue={clearQueue}
          onTestVoice={testSpeak}
          chatView={chatView}
          patchChatView={patchChatView}
          widgetCfg={widgetCfg}
          patchWidget={patchWidget}
          overlayCfg={overlayCfg}
          patchOverlay={patchOverlay}
          hotkeys={hotkeys}
          onApplyHotkeys={patchHotkeys}
          botCommands={botCommands}
          onUpdateCommands={setBotCommands}
          botAuth={botAuth}
          twitchAutoPin={twitchAutoPin}
          patchTwitchAutoPin={(patch) => {
            setTwitchAutoPin((prev) => ({ ...prev, ...patch }));
            markSaved();
          }}
          variantId={variant.id}
          onVariant={(id) => setVariantId(id)}
          maxFeed={maxFeed}
          onMaxFeed={(v) => {
            setMaxFeed(v);
            markSaved("Лимит ленты обновлён");
          }}
          closeToTray={closeToTray}
          setCloseToTray={setCloseToTray}
          minimizeToTray={minimizeToTray}
          setMinimizeToTray={setMinimizeToTray}
          startHidden={startHidden}
          setStartHidden={setStartHidden}
          startMaximized={startMaximized}
          setStartMaximized={setStartMaximized}
          eventSounds={eventSounds}
          patchEventSounds={patchEventSounds}
          customSounds={customSounds}
          setCustomSounds={setCustomSoundsList}
          rewardSounds={rewardSounds}
          patchRewardSounds={patchRewardSounds}
          rewardCustomSounds={rewardCustom}
          setRewardCustomSounds={setRewardCustomSoundsList}
          syncRewardRules={syncRewardRules}
          onCreateReward={createReward}
          rewardsSyncing={rewardsSyncing}
          hideDeleted={hideDeleted}
          setHideDeleted={setHideDeleted}
          mentionHL={mentionHL}
          setMentionHL={setMentionHL}
          focusMode={focusMode}
          setFocusMode={(v) => setFocusMode(v)}
          savedAt={savedAt}
          toast={toast}
          markSaved={markSaved}
        />
      </div>

      {/* тост */}
      {toastText && (
        <div
          className="toast-anim fixed bottom-5 left-1/2 z-[80] -translate-x-1/2 rounded-full px-4 py-2 text-[12px] font-medium whitespace-nowrap shadow-2xl"
          style={{
            background: "var(--dw-panel2)",
            color: "var(--dw-text)",
            outline: "1px solid var(--dw-line)",
          }}
        >
          {toastText}
        </div>
      )}
    </div>
  );
}
