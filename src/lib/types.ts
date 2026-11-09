/** Общие типы интерфейса приложения */
import type { EffectId } from "./effects";

export type PlatformId =
  | "twitch"
  | "youtube"
  | "vkplay"
  | "kick"
  | "tiktok"
  | "rutube"
  | "boosty"
  | "donationalerts"
  | "donatepay"
  | "memealerts";

/** Площадки, для которых в приложении настраиваются награды за баллы. */
export type RewardPlatform = Extract<PlatformId, "twitch" | "vkplay">;

/**
 * Чистые донатные площадки (без чата): карточка в списке показывает
 * «подключено + сумма», а не эфир. MemeAlerts принимает донаты только
 * по авторизованному аккаунту — как DonationAlerts по токену.
 */
export const DONATE_PLATFORMS: PlatformId[] = ["donationalerts", "donatepay", "memealerts"];
export const isDonatePlatform = (id: PlatformId) => DONATE_PLATFORMS.includes(id);

/**
 * Всё, что настраивается во вкладке «Донаты»: чистые донатные площадки +
 * Boosty (он и донаты принимает, и чат эфира читает — карточка его остаётся
 * «живой», а настройки живут там же, где и остальные донатные).
 */
export const DONATION_TAB_PLATFORMS: PlatformId[] = [...DONATE_PLATFORMS, "boosty"];

/**
 * Креды приложения MemeAlerts (выдаёт поддержка площадки при регистрации).
 * OAuth-токены аккаунта хост добавляет в то же хранилище после входа.
 */
export interface MemeAlertsConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Адрес возврата по умолчанию — его и регистрируют у поддержки площадки. */
export const DEFAULT_MEMEALERTS: MemeAlertsConfig = {
  clientId: "",
  clientSecret: "",
  redirectUri: "http://localhost:8580/yawachatma",
};

/**
 * connecting — идёт подключение
 * connected  — канал подключён (чат читается), но эфир не подтверждён
 * online     — подтверждена активная трансляция (есть данные о стриме/зрителях)
 * offline    — канал доступен, но трансляции нет
 * error      — не удалось подключиться
 */
export type ChannelStatus = "online" | "connected" | "offline" | "connecting" | "error";

export interface Channel {
  id: string;
  platform: PlatformId;
  username: string;
  /** Отображаемое имя канала: у Rutube канал адресуется номером,
   *  а в списке показывается название канала. */
  title?: string;
  status: ChannelStatus;
  viewers: number;
  /** накопленные лайки за текущий эфир (TikTok Live) */
  likes?: number;
  messages: number;
  /** Безопасное объяснение последнего сбоя от хоста; не сохраняется в профиль. */
  errorReason?: string;
  /** DonationAlerts: секретный токен + валюта; Boosty: токен аккаунта */
  token?: string;
  currency?: string;
  /** звук оповещения о донате для этой площадки (выбирается при добавлении) */
  donateSound?: string;
}

export type MsgKind =
  | "chat"
  | "system"
  | "reward"
  | "donate"
  | "sub"
  | "raid"
  | "gift"
  | "join"
  | "bits"
  | "reward"
  | "command"
  | "mod"
  | "status";

export interface ChatMsg {
  id: number;
  ts: number;
  platform: PlatformId;
  channel: string;
  author: string;
  color: string;
  text: string;
  kind: MsgKind;
  badges?: string[];
  /** ОРИГИНАЛЬНЫЕ значки площадки: картинка + подсказка */
  badgeIcons?: { url: string; title: string }[];
  /** ссылка на аватар автора (если площадка её передала) */
  avatar?: string;
  amount?: number;
  currency?: string;
  deleted?: boolean;
  /** идентификаторы площадки — нужны для настоящей модерации (Twitch Helix) */
  msgId?: string;
  userId?: string;
  roomId?: string;
  /**
   * Сквозной номер строки в потоке приложения (ставит хост).
   * По нему сообщение снимается с показа в виджете OBS и оверлее, когда
   * его скрыла автомодерация или фильтр: у площадок, кроме Twitch, своих
   * идентификаторов сообщений нет.
   */
  sid?: number;
  /**
   * Награда за баллы канала (kind === "reward").
   *
   * Название награды лежит и в тексте («активировал награду «Гонг»»), но
   * привязывать к нему звук разбором строки ненадёжно: правка формулировки
   * молча ломала бы настройки стримера. Поэтому хост дополнительно присылает
   * структурные поля, а текст остаётся только для показа.
   */
  reward?: {
    /** название награды на площадке */
    title?: string;
    /** идентификатор награды на площадке — устойчивее названия */
    id?: string;
    /** стоимость в баллах, если площадка её передаёт */
    cost?: number;
  };
}

/** Что нужно убрать из публичного потока (виджет OBS, оверлей). */
export interface ChatHideRequest {
  /** номера строк, скрытых целиком (одно сообщение) */
  sids?: number[];
  /** идентификаторы площадки (Twitch) */
  msgIds?: string[];
  /** площадка — вместе с author, userId или all */
  platform?: PlatformId;
  /** автор, все сообщения которого нужно убрать (бан, чёрный список) */
  author?: string;
  /** идентификатор автора на площадке (Twitch target-user-id) */
  userId?: string;
  /** убрать все сообщения площадки (очистка чата) */
  all?: boolean;
}

/** ------- озвучка ------- */
export interface TtsConfig {
  enabled: boolean;
  voice: string;
  rate: number; // 0.5 – 2
  volume: number; // 0 – 1
  speakAuthor: boolean;
  speakPlatform: boolean;
  donatesOnly: boolean;
  skipLinks: boolean;
  skipCommands: boolean;
  maxLen: number;
  capsLimit: number; // % заглавных
  stripEmoji: boolean;
  squashRepeats: boolean;
  linkPhrase: string;
  /** читать названия смайлов/стикеров (по умолчанию выключено) */
  speakEmotes: boolean;
  /** движок озвучки: системный SAPI или нейросетевой Edge TTS */
  engine: "sapi" | "edge";
  /**
   * Запасная озвучка: если нейроголос недоступен (провайдер ограничивает
   * сервис озвучки), фразу читает системный голос Windows того же пола.
   * Выключение оставляет только выбранный голос — фраза пропускается.
   */
  fallbackVoice: boolean;
  /**
   * Не воспроизводить озвучку на ПК (в окне приложения): звук уходит только
   * в виджет OBS и на трансляцию.
   */
  muteOnPc: boolean;
  /** звуковое уведомление о новом сообщении в чате */
  msgSoundEnabled: boolean;
  /** какой звук играть (набор общий со звуками донатов) */
  msgSound: string;
  /** громкость уведомления, 0–1 */
  msgSoundVolume: number;
  /** пауза между сигналами, сек: плотный чат не должен «трещать» */
  msgSoundCooldown: number;
  /** сигналить только на упоминания вашего ника */
  msgSoundMentionsOnly: boolean;
}

export const DEFAULT_TTS: TtsConfig = {
  // по умолчанию озвучка ВЫКЛЮЧЕНА — включается тумблером в шапке или F9
  enabled: false,
  voice: "",
  rate: 1,
  volume: 0.9,
  speakAuthor: true,
  speakPlatform: false,
  donatesOnly: false,
  skipLinks: true,
  skipCommands: true,
  maxLen: 220,
  capsLimit: 80,
  stripEmoji: true,
  squashRepeats: true,
  linkPhrase: "ссылка",
  speakEmotes: false, // смайлы не озвучиваются
  engine: "edge", // нейросетевые русские голоса Edge TTS
  fallbackVoice: true, // при сбое связи фразу дочитывает голос Windows того же пола
  muteOnPc: false, // по умолчанию озвучка слышна и на ПК, и в виджете OBS
  // звук уведомления о сообщении выключен по умолчанию
  msgSoundEnabled: false,
  msgSound: "bubble",
  msgSoundVolume: 0.5,
  msgSoundCooldown: 3,
  msgSoundMentionsOnly: false,
};

/** ------- донаты: только звуковое уведомление, озвучка убрана ------- */
export interface DonateConfig {
  /** проигрывать звук при получении доната */
  soundEnabled: boolean;
  /** звук по умолчанию — если у площадки не выбран свой */
  sound: string;
  /** громкость звука 0–1 */
  soundVolume: number;
  /**
   * @deprecated Озвучка донатов удалена по запросу — оставляем поле для
   * совместимости со старыми сохранениями, чтобы при обновлении не падало.
   */
  speak?: boolean;
  /** @deprecated */
  speakAuthor?: boolean;
  /** @deprecated */
  speakAmount?: boolean;
  /** @deprecated */
  speakMessage?: boolean;
  /** @deprecated озвучивать от суммы больше не используется */
  minAmount?: number;
  /**
   * Не показывать в чате донаты меньше этой суммы (0 — показывать все).
   * Нужно из-за площадок вроде DonationAlerts: подписки и фолловы приходят
   * туда «донатом» на 0 рублей и засоряли ленту лишними оповещениями.
   */
  minShowAmount: number;
}

/**
 * ------- звуки уведомлений о событиях эфира -------
 * Наград за баллы канала здесь нет: у каждой награды свой звук, они
 * настраиваются отдельным блоком (RewardSoundsConfig).
 */
export type EventSoundId = "sub" | "gift" | "follow" | "raid";

export interface EventSoundRule {
  enabled: boolean;
  /** идентификатор звука (встроенный или `custom:<id>`) */
  sound: string;
  /** громкость 0–1 */
  volume: number;
}

export type EventSoundsConfig = Record<EventSoundId, EventSoundRule>;

/** Названия событий для настроек — по одному на строку списка. */
export const EVENT_SOUND_LABELS: { id: EventSoundId; name: string; hint: string }[] = [
  { id: "sub", name: "Подписка", hint: "новый подписчик канала" },
  { id: "gift", name: "Подарок", hint: "подарочные подписки и подарки TikTok" },
  { id: "follow", name: "Фолловер", hint: "новая подписка на канал" },
  { id: "raid", name: "Рейд", hint: "к вам пришли с другого канала" },
];

export const DEFAULT_EVENT_SOUNDS: EventSoundsConfig = {
  sub: { enabled: false, sound: "fanfare", volume: 0.7 },
  gift: { enabled: false, sound: "arcade", volume: 0.7 },
  follow: { enabled: false, sound: "pop", volume: 0.6 },
  raid: { enabled: false, sound: "siren", volume: 0.7 },
};

/** ------- звуки наград за баллы канала ------- */

/** Свой звук для конкретной награды за баллы канала. */
export interface RewardSoundRule {
  /**
   * Площадка награды. Старые и добавленные вручную правила могут не иметь
   * площадки — тогда они остаются общими для совместимости.
   */
  platform?: RewardPlatform;
  /**
   * Название награды, как оно указано на площадке. Сравнение идёт по
   * нормализованному названию (регистр и лишние пробелы не важны) — стример
   * должен понимать, почему звук сработал именно так.
   */
  title: string;
  /** идентификатор звука: встроенный или `custom:<id>` из библиотеки наград */
  sound: string;
  /** громкость 0–1: у каждой награды своя */
  volume: number;
  /** идентификатор награды на площадке: звук не теряется при переименовании */
  id?: string;
  /** стоимость награды в баллах — показываем в настройках */
  cost?: number;
}

/**
 * Звуки наград за баллы канала. Звука «по умолчанию для всех наград» здесь
 * нет намеренно: у награды без правила звук не играет, иначе индивидуальные
 * настройки превращаются в лотерею.
 */
export interface RewardSoundsConfig {
  /** играть звук при активации награды за баллы */
  enabled: boolean;
  /** по правилу на каждую награду */
  rules: RewardSoundRule[];
  /** минимальная пауза между сигналами, сек: серия наград не сливается в кашу */
  cooldown: number;
}

export const DEFAULT_REWARD_SOUNDS: RewardSoundsConfig = {
  enabled: false,
  rules: [],
  cooldown: 1,
};

/** Сколько правил «награда → звук» держим в настройках. */
export const MAX_REWARD_RULES = 50;

export const DEFAULT_DONATE: DonateConfig = {
  soundEnabled: true,
  sound: "chime",
  soundVolume: 0.8,
  // Озвучка донатов отключена по умолчанию (функция убрана из интерфейса).
  speak: false,
  speakAuthor: false,
  speakAmount: false,
  speakMessage: false,
  minAmount: 0,
  minShowAmount: 10,
};

/** ------- вид ленты ------- */
export type FeedDensity = "cozy" | "standard" | "compact" | "tight";

/** идентификатор шрифтового набора (см. FONT_FAMILIES в lib/fonts.ts) */
export type FontId = "inter" | "mono" | "rounded" | "condensed" | "gaming" | "serif" | "system";

/** написание ников: как есть или капсом */
export type NickCase = "normal" | "upper";

export interface ChatViewConfig {
  /** выбранный стиль оформления (см. lib/presets.ts) */
  styleId: string;
  density: FeedDensity;
  fontSize: number;
  fontFamily: FontId;
  /** свой шрифт: ссылка Google Fonts или имя (см. lib/fonts.ts) */
  customFont?: string;
  spacing: number;
  /** скругление плашки сообщения */
  radius: number;
  /** цветная полоса площадки слева */
  stripe: boolean;
  /** тонкая линия-разделитель между сообщениями */
  separators: boolean;
  nickCase: NickCase;
  backdrop: boolean;
  animations: boolean;
  showTime: boolean;
  showBadges: boolean;
  /** кружок с аватаром автора слева от ника */
  showAvatars: boolean;
  showPlatform: boolean;
  accentNick: boolean;
  /** мягкая тень текста для читаемости */
  textShadow?: boolean;
  /** толщина обводки текста: 0 = без обводки, дробный шаг */
  outlineWidth?: number;
  /** эффект появления сообщений и его скорость */
  effect?: EffectId;
  effectSpeed?: number;
  /** готовый набор цветов внутри темы (см. lib/presets.ts) */
  styleTone?: string;
}

export const DEFAULT_CHAT_VIEW: ChatViewConfig = {
  styleId: "clean",
  density: "standard",
  fontSize: 13,
  fontFamily: "inter",
  spacing: 6,
  radius: 10,
  stripe: false,
  separators: false,
  nickCase: "normal",
  backdrop: true,
  animations: true,
  showTime: true,
  showBadges: true,
  showAvatars: true,
  showPlatform: true,
  accentNick: true,
  textShadow: false,
  outlineWidth: 0,
  effect: "fade",
  effectSpeed: 1,
};

/** ------- виджет OBS / оверлей ------- */
export interface WidgetConfig {
  styleId: string;
  max: number;
  fontSize: number;
  fontFamily: FontId;
  /** свой шрифт: ссылка Google Fonts или имя (см. lib/fonts.ts) */
  customFont?: string;
  spacing: number;
  radius: number;
  stripe: boolean;
  nickCase: NickCase;
  /** показывать донаты, сабы и рейды (по умолчанию выключено) */
  showEvents: boolean;
  transparent: boolean;
  /** прозрачность подложки сообщений, 0..1 (0 = 100% прозрачный фон) */
  backdropOpacity?: number;
  /** пользовательский цвет фона (hex/rgb) */
  bgColor?: string;
  /** пользовательский цвет текста */
  textColor?: string;
  /** пользовательский цвет ника */
  nameColor?: string;
  outlines: boolean;
  /** мягкая тень текста позади плашек */
  textShadow?: boolean;
  theme: "dark" | "light";
  /** скрывать старые сообщения через заданное время */
  autoFade?: boolean;
  fadeAfterSec?: number;
  /** толщина обводки текста: 0 = без обводки, дробный шаг */
  outlineWidth?: number;
  /** компактные строки (минимальные поля плашки) */
  compactRows?: boolean;
  /** звук новых сообщений прямо в источнике OBS (для «Управлять аудио через OBS») */
  sound?: boolean;
  soundVolume?: number;
  /** звук только для донатов и событий */
  soundEventsOnly?: boolean;
  /** эффект появления сообщений и его скорость */
  effect?: EffectId;
  effectSpeed?: number;
  /** формат виджета: столбец сообщений или полоска во всю ширину холста */
  layout?: "vertical" | "horizontal";
  /** готовый набор цветов внутри темы */
  styleTone?: string;
  /** слой окна чата: подложка под всеми сообщениями (рамка, шапка, декор темы) */
  windowBackdrop?: boolean;
  /** прозрачность окна, 0..1 */
  windowOpacity?: number;
  /** скругление окна, px */
  windowRadius?: number;
  /** шапка окна: название и подпись из темы */
  windowBar?: boolean;
}

export const DEFAULT_WIDGET: WidgetConfig = {
  styleId: "clean",
  max: 8,
  fontSize: 18,
  fontFamily: "inter",
  spacing: 4,
  radius: 10,
  stripe: false,
  nickCase: "normal",
  showEvents: false,
  transparent: false,
  backdropOpacity: 0.7,
  outlines: true,
  textShadow: true,
  theme: "dark",
  autoFade: false,
  fadeAfterSec: 30,
  outlineWidth: 0.8,
  sound: false,
  soundVolume: 0.5,
  soundEventsOnly: true,
  effect: "fade",
  effectSpeed: 1,
  layout: "vertical",
  // окно чата по умолчанию выключено: старые стили выглядят как раньше
  windowBackdrop: false,
  windowOpacity: 1,
  windowRadius: 16,
  windowBar: true,
};

export type OverlayCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "free";
export type OverlayGrowth = "down" | "up";
/** где расположена панель статистики относительно ленты */
export type OverlayStatsPos = "bottom" | "top";

export interface OverlayConfig {
  enabled: boolean;
  /** прозрачность ПОДЛОЖКИ (0 = полностью прозрачная, текст остаётся чётким) */
  backdropOpacity: number;
  /** прозрачность самого текста — отдельная, по умолчанию 1 */
  textOpacity: number;
  fontSize: number;
  fontFamily: FontId;
  /** свой шрифт: ссылка Google Fonts или имя (см. lib/fonts.ts) */
  customFont?: string;
  /** интервал между сообщениями, px */
  spacing: number;
  clickThrough: boolean;
  maxMessages: number;
  /** высота окна оверлея (px) — не зависит от шрифта и числа строк */
  height?: number;
  /* размещение */
  corner: OverlayCorner;
  width: number;
  offsetX: number;
  offsetY: number;
  growth: OverlayGrowth;
  /* содержимое строки */
  showTime: boolean;
  showPlatform: boolean;
  showBadges: boolean;
  showEmotes: boolean;
  /** показывать события входа зрителей в трансляцию */
  showJoinEvents: boolean;
  eventsOnly: boolean;
  /* исчезновение старых сообщений */
  autoFade: boolean;
  fadeAfterSec: number;
  /* Свободное размещение ВСЕГДА включено: настройка скрыта из интерфейса.
     Управляет им сквозной клик — он и есть единственный переключатель. */
  freePosition: boolean;
  posX: number;
  posY: number;
  locked: boolean;
  /* панель статистики площадок */
  showStats: boolean;
  /** снизу (по умолчанию) или сверху ленты */
  statsPos: OverlayStatsPos;
  showDonations: boolean;
  showViewers: boolean;
  /** счётчик накопленных лайков TikTok Live в панели статистики */
  showLikes: boolean;
  /** скрывать площадки без подключённых каналов */
  hideDisconnected: boolean;
  /* оформление */
  radius: number;
  accentBar: boolean;
  shadowText: boolean;
  /** мягкая тень текста для читаемости на игре */
  textShadow?: boolean;
  /** толщина обводки текста: 0 = без обводки, дробный шаг */
  outlineWidth?: number;
  /** эффект появления сообщений и его скорость */
  effect?: EffectId;
  effectSpeed?: number;
  /** совместимость только с современным предпросмотром; логика v1.2.4 не использует */
  styleId?: string;
  nickCase?: NickCase;
  showEvents?: boolean;
  /** готовый набор цветов внутри темы */
  styleTone?: string;
  /** слой окна чата под сообщениями (для оверлея по умолчанию выключен) */
  windowBackdrop?: boolean;
  windowOpacity?: number;
  windowRadius?: number;
  windowBar?: boolean;
}

export const DEFAULT_OVERLAY: OverlayConfig = {
  // по умолчанию оверлей ВЫКЛЮЧЕН — включается кнопкой или хоткеем
  enabled: false,
  // по умолчанию полностью прозрачный: подложки нет, виден только текст
  backdropOpacity: 0,
  textOpacity: 1,
  fontSize: 14,
  fontFamily: "inter",
  spacing: 4,
  // сквозной клик работает ТОЛЬКО когда пользователь его включил
  clickThrough: false,
  maxMessages: 6,
  height: 320,
  corner: "free",
  width: 400,
  offsetX: 16,
  offsetY: 16,
  growth: "down",
  showTime: false,
  showPlatform: true,
  showBadges: false,
  showEmotes: true,
  showJoinEvents: true,
  eventsOnly: false,
  autoFade: false,
  fadeAfterSec: 30,
  freePosition: true,
  posX: 24,
  posY: 24,
  locked: false,
  showStats: true,
  statsPos: "bottom",
  showDonations: true,
  showViewers: true,
  showLikes: true,
  hideDisconnected: true,
  radius: 10,
  accentBar: true,
  shadowText: true,
  outlineWidth: 2,
  effect: "fade",
  effectSpeed: 1,
  styleId: "ghost",
  // окно чата: у оверлея по умолчанию только текст поверх игры
  windowBackdrop: false,
  windowOpacity: 1,
  windowRadius: 14,
  windowBar: false,
};

/** статистика площадок для шапки оверлея (донаты идут первыми) */
export interface OverlayStats {
  donations: {
    total: number;
    currency: string;
    count: number;
    /** какие площадки донатов подключены — сумма по ним общая */
    sources?: PlatformId[];
  };
  platforms: {
    platform: PlatformId;
    /** подтверждённый эфир */
    online: boolean;
    /** канал подключён (чат читается) */
    connected?: boolean;
    viewers: number;
    /** накопленные лайки за эфир (TikTok Live) */
    likes?: number;
    messages: number;
  }[];
}

/** Клавиши хранятся физическими кодами — не зависят от раскладки. */
export const DEFAULT_HOTKEYS: Record<string, string> = {
  toggleSpeech: "F9",
  pauseQueue: "F7",
  skipQueue: "F8",
  stopSpeech: "F10",
  clearQueue: "F11",
  toggleOverlay: "Ctrl+Shift+O",
  toggleClickThrough: "Ctrl+Shift+KeyT",
  clearFeed: "Ctrl+Shift+X",
  // UI-1.3: режим «Только чат» — своя клавиша, так как F11 занят очередью
  toggleFocus: "F6",
};

export interface BotCommand {
  id: string;
  trigger: string;
  response: string;
  cooldown: number;
  enabled: boolean;
  platform: PlatformId | "all";
}

/** Настройки автоматического сообщения и закрепления при старте Twitch-эфира. */
export interface TwitchAutoPinConfig {
  enabled: boolean;
  message: string;
  /** null — до конца трансляции, число — секунд (30–1800) */
  durationSeconds: number | null;
}

export const DEFAULT_TWITCH_AUTO_PIN: TwitchAutoPinConfig = {
  enabled: false,
  message: "Стрим начался! Добро пожаловать в чат 👋",
  durationSeconds: null,
};

/** команда модерации из ленты */
export interface ModerationRequest {
  msg: ChatMsg;
  x: number;
  y: number;
}
