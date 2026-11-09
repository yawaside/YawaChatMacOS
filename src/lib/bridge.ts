/**
 * Мост между веб-рендерером и нативной оболочкой.
 *
 * В оригинальном репозитории это был Electron IPC. В WebView2-сборке роль
 * main-процесса выполняет C#-хост (см. папку webview2/): он регистрирует
 * host-объект `window.chrome.webview.hostObjects.yawa` и обрабатывает
 * асинхронные сообщения через `chrome.webview.postMessage`.
 *
 * В обычном браузере моста нет — включается демо-режим (localStorage +
 * speechSynthesis), точно как «сайт» в оригинале.
 */

import type { ChatHideRequest } from "./types";

export interface WidgetInfo {
  url: string;
  port: number;
  running: boolean;
}

/** подписка на канал: то, что хост подключает реальными коннекторами */
export interface ChannelSub {
  platform:
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
  username: string;
  token?: string;
  currency?: string;
  /** звук оповещения о донате (только для площадок донатов) */
  donateSound?: string;
}

interface PendingCall {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

declare global {
  interface Window {
    chrome?: {
      webview?: {
        postMessage: (msg: unknown) => void;
        addEventListener: (type: "message", cb: (e: { data: unknown }) => void) => void;
        hostObjects?: { yawa?: Record<string, unknown> };
      };
    };
  }
}

const wv = typeof window !== "undefined" ? window.chrome?.webview : undefined;

export function isDesktop(): boolean {
  return !!wv;
}

/** Сообщаем хосту о сбое интерфейса без текста ошибки/props: там могут быть секреты. */
export function reportRendererFailure(kind: string, component: string): void {
  if (!wv) return;
  try {
    wv.postMessage({ id: 0, method: "diagnostics.rendererError", args: [kind, component] });
  } catch {
    /* при закрытии окна мост уже мог исчезнуть */
  }
}

/* ---------------- асинхронный JSON-RPC поверх postMessage ---------------- */

let seq = 1;
const pending = new Map<number, PendingCall>();
const hostEventHandlers = new Set<(type: string, payload: unknown) => void>();

if (wv) {
  wv.addEventListener("message", (e) => {
    const d = e.data as {
      id?: number;
      ok?: boolean;
      result?: unknown;
      error?: string;
      event?: string;
      payload?: unknown;
    } | null;
    if (!d || typeof d !== "object") return;
    if (d.event) {
      // Хост объединяет плотный поток в один IPC-кадр. Распаковываем здесь:
      // компоненты продолжают получать обычные chat.message и не меняют логику.
      if (d.event === "chat.batch" && Array.isArray(d.payload)) {
        for (const item of d.payload) hostEventHandlers.forEach((h) => h("chat.message", item));
      } else {
        hostEventHandlers.forEach((h) => h(d.event!, d.payload));
      }
      return;
    }
    if (typeof d.id === "number" && pending.has(d.id)) {
      const p = pending.get(d.id)!;
      pending.delete(d.id);
      if (d.ok) p.resolve(d.result);
      else p.reject(new Error(d.error ?? "host error"));
    }
  });
}

function call<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
  if (!wv) return Promise.reject(new Error("no bridge"));
  const id = seq++;
  wv.postMessage({ id, method, args });
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    // Длительные операции: озвучка ждёт конца фразы, вход через браузер —
    // действий пользователя, запросы к VK Видео Live ходят в сеть.
    // Обычным вызовам хватает восьми секунд.
    const timeout =
      method === "tts.speak"
        ? 120_000
        : method === "bot.login" || method === "memealerts.authorize"
          ? 600_000
          : method === "moderation.run"
            ? 30_000
            : method === "rewards.list" || method.startsWith("vk.")
              ? 30_000
              : method === "diagnostics.export"
                ? 600_000
                : 8_000;
    window.setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error("bridge timeout"));
      }
    }, timeout);
  });
}

/** подписка на события хоста (глобальные горячие клавиши, трей и т.п.) */
export function onHostEvent(cb: (type: string, payload: unknown) => void): () => void {
  hostEventHandlers.add(cb);
  return () => hostEventHandlers.delete(cb);
}

export async function exportDiagnostics(channels: { platform: string; status: string }[]): Promise<boolean> {
  if (!wv) return false;
  return call<boolean>(
    "diagnostics.export",
    channels.map(({ platform, status }) => ({ platform, status })),
  );
}

/* ---------------- настройки ---------------- */

const LS_PREFIX = "yawa:";

export async function settingGet<T>(key: string, fallback: T): Promise<T> {
  // объекты склеиваем с умолчаниями: поля, добавленные в новых версиях
  // (напр. хоткей сквозного клика), не должны пропадать из-за старых сохранений
  const isObj = (x: unknown): x is Record<string, unknown> =>
    typeof x === "object" && x !== null && !Array.isArray(x);
  if (wv) {
    try {
      const v = await call<T | null>("settings.get", key);
      // Старые версии дублировали desktop-настройки в WebView localStorage,
      // где токены источников оставались открытыми. Хост — единственное
      // постоянное хранилище desktop-режима; удаляем старую копию по мере чтения.
      if (v !== null && v !== undefined) {
        try {
          localStorage.removeItem(LS_PREFIX + key);
        } catch {
          /* noop */
        }
        return (isObj(v) && isObj(fallback) ? { ...fallback, ...v } : v) as T;
      }

      // Совместимость с данными, которые старая версия могла сохранить только
      // в браузерном профиле: переносим их в хост прежде, чем удалить открытую копию.
      const legacy = localStorage.getItem(LS_PREFIX + key);
      if (legacy) {
        const parsed = JSON.parse(legacy) as T;
        await call("settings.set", key, parsed);
        localStorage.removeItem(LS_PREFIX + key);
        return (isObj(parsed) && isObj(fallback) ? { ...fallback, ...parsed } : parsed) as T;
      }
      try {
        localStorage.removeItem(LS_PREFIX + key);
      } catch {
        /* noop */
      }
      return fallback;
    } catch {
      // При ошибке моста оставляем прежнюю копию на месте: не теряем данные.
      try {
        const legacy = localStorage.getItem(LS_PREFIX + key);
        if (legacy) return JSON.parse(legacy) as T;
      } catch {
        /* noop */
      }
      return fallback;
    }
  }
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    // КРИТИЧНО: массивы (список команд бота, каналы) нельзя «склеивать»
    // с умолчаниями — иначе массив превращался в объект и падал .find(),
    // из-за чего команды не срабатывали вовсе.
    if (Array.isArray(parsed) || !isObj(parsed) || !isObj(fallback)) return parsed as T;
    return { ...fallback, ...parsed } as T;
  } catch {
    return fallback;
  }
}

export async function settingSet(key: string, value: unknown): Promise<void> {
  if (!wv) {
    try {
      localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
    } catch {
      /* noop */
    }
    return;
  }
  // В desktop-режиме не создаём вторую, незашифрованную копию настроек.
  // Старую копию удаляем только после подтверждённой записи в хост.
  try {
    await call("settings.set", key, value);
    try {
      localStorage.removeItem(LS_PREFIX + key);
    } catch {
      /* noop */
    }
  } catch {
    /* noop */
  }
}

/* ---------------- окно без рамки ---------------- */

export const windowCtl = {
  minimize() {
    if (wv) void call("window.minimize");
  },
  toggleMaximize() {
    if (wv) void call("window.toggleMaximize");
  },
  close(closeToTray: boolean) {
    if (wv) void call("window.close", closeToTray);
  },
  async isMaximized(): Promise<boolean> {
    if (!wv) return false;
    try {
      return await call<boolean>("window.isMaximized");
    } catch {
      return false;
    }
  },
};

/* ---------------- TTS (SAPI на хосте / speechSynthesis в браузере) */

export interface HostVoice {
  id: string;
  title: string;
  gender?: string;
}

/** каким голосом идёт озвучка прямо сейчас: нейроголосом или запасным системным */
export interface TtsStatus {
  /** нейроголос отвечает и озвучка идёт им */
  cloud: boolean;
  /** сейчас звучит запасной системный голос */
  fallback: boolean;
  /** имя голоса, который звучит (пусто — если озвучка пропускается) */
  voice: string;
  /** пол голоса: "Female" | "Male" | "" */
  gender?: string;
  /** включена ли запасная озвучка в настройках */
  fallbackEnabled?: boolean;
}

/** что записано в edge-tts.json: адрес сервиса и версия протокола */
export interface TtsConfigInfo {
  /** подпись рабочего адреса: «основной», «прежний» */
  endpoint: string;
  /** сам адрес websocket */
  address: string;
  /** версия браузера в токене подключения */
  version: string;
  /** версия протокола токена (префикс Sec-MS-GEC-Version) */
  tokenVersion: string;
  /** путь к файлу настроек — его можно поправить вручную */
  path: string;
  /** когда проверяли в последний раз */
  checkedAt: string;
  /** итог последней проверки словами */
  result: string;
  endpoints: { name: string; address: string; backup: boolean }[];
}

/** итог ручной проверки адресов и протокола */
export interface TtsConfigCheck {
  ok: boolean;
  /** рабочим оказался другой адрес или версия — файл обновлён */
  updated: boolean;
  endpoint: string;
  version: string;
  detail: string;
  info?: TtsConfigInfo;
}

export const ttsBridge = {
  /**
   * Озвучка фразы. Параметр speaker — ник автора сообщения: если за ним
   * закреплён персональный голос, он важнее выбранного по умолчанию.
   */
  speak(
    text: string,
    voice: string,
    rate: number,
    volume: number,
    engine: "edge" | "sapi" = "edge",
    speaker = "",
    muteOnPc = false,
  ) {
    if (wv)
      return call(
        "tts.speak",
        text,
        voice,
        Math.round(rate * 10 - 10),
        Math.round(volume * 100),
        engine,
        speaker,
        muteOnPc,
      );
    return Promise.reject(new Error("no bridge"));
  },
  /** русские голоса хоста: нейросетевые Edge + системные SAPI */
  async voices(): Promise<{ edge: HostVoice[]; sapi: HostVoice[] }> {
    if (!wv) return { edge: [], sapi: [] };
    try {
      return await call<{ edge: HostVoice[]; sapi: HostVoice[] }>("tts.voices");
    } catch {
      return { edge: [], sapi: [] };
    }
  },
  /** персональный голос пользователя чата (пустая строка = сбросить) */
  setUserVoice(user: string, voice: string) {
    if (wv) return call("userVoice.set", { user, voice });
    return Promise.reject(new Error("no bridge"));
  },
  /** карта закреплённых голосов + список всех доступных голосов */
  async userVoices(): Promise<{
    voices: HostVoice[];
    assigned: { user: string; voice: string; title: string }[];
  }> {
    if (wv) {
      try {
        return await call("userVoice.get");
      } catch {
        return { voices: [], assigned: [] };
      }
    }
    return { voices: [], assigned: [] };
  },
  /** текущее состояние озвучки (нейроголос или запасной системный голос) */
  async status(): Promise<TtsStatus | null> {
    if (!wv) return null;
    try {
      return await call<TtsStatus>("tts.status");
    } catch {
      return null;
    }
  },
  /** что записано в файле настроек подключения edge-tts.json */
  async config(): Promise<TtsConfigInfo | null> {
    if (!wv) return null;
    try {
      return await call<TtsConfigInfo>("tts.config");
    } catch {
      return null;
    }
  },
  /**
   * Ручная проверка адреса и версии протокола Edge. Рабочая связка
   * записывается в edge-tts.json — пересобирать приложение не нужно.
   */
  async checkConfig(): Promise<TtsConfigCheck | null> {
    if (!wv) return null;
    try {
      return await call<TtsConfigCheck>("tts.configCheck");
    } catch {
      return null;
    }
  },
  pause() {
    if (wv) void call("tts.pause");
  },
  resume() {
    if (wv) void call("tts.resume");
  },
  clear() {
    if (wv) void call("tts.clear");
  },
};

/* ---------------- автозапуск с Windows (1.9) ---------------- */

export const autostartBridge = {
  /** текущий ключ автозапуска; null — хост недоступен (браузер) */
  async get(): Promise<boolean | null> {
    if (!wv) return null;
    try {
      return await call<boolean>("system.getAutostart");
    } catch {
      return null;
    }
  },
  /** записать или удалить ключ автозапуска; false — не удалось */
  async set(enabled: boolean): Promise<boolean> {
    if (!wv) return false;
    try {
      await call("system.setAutostart", enabled);
      return true;
    } catch {
      return false;
    }
  },
};

/* ---------------- оверлей / виджет / хоткеи ---------------- */

export const overlayBridge = {
  open() {
    if (wv) void call("overlay.open");
  },
  close() {
    if (wv) void call("overlay.close");
  },
  /** переключить видимость окна оверлея; возвращает новое состояние */
  async toggle(): Promise<boolean> {
    if (!wv) return false;
    try {
      return await call<boolean>("overlay.toggle");
    } catch {
      return false;
    }
  },
  async isVisible(): Promise<boolean> {
    if (!wv) return false;
    try {
      return await call<boolean>("overlay.isVisible");
    } catch {
      return false;
    }
  },
  set(cfg: unknown) {
    if (wv) void call("overlay.set", cfg);
  },
  /** статистика площадок для панели оверлея */
  stats(stats: unknown) {
    if (wv) void call("overlay.stats", stats);
  },
  /** начать перетаскивание окна оверлея мышью (свободное размещение) */
  beginDrag() {
    if (wv) void call("overlay.beginDrag");
  },
  /** начать изменение размера окна за край: "e" | "s" | "se" */
  beginResize(dir: "e" | "s" | "se") {
    if (wv) void call("overlay.beginResize", dir);
  },
  /** вернуть оверлей в центр экрана */
  center() {
    if (wv) void call("overlay.center");
  },
};

/**
 * Тестовое уведомление в оверлей и/или виджет OBS: набор демо-сообщений
 * (обычное, донат, подписка), чтобы проверить оформление «вживую».
 */
export function sendTestNotification(target: "overlay" | "widget" | "both") {
  if (wv) void call("test.notify", target);
}

/** живое применение настроек виджета: хост рассылает их всем OBS-источникам */
export function widgetConfig(cfg: unknown) {
  if (wv) void call("widget.config", cfg);
}

/**
 * Звук награды за баллы канала → в источник OBS.
 *
 * Окно приложения играет звук само, но стримеру нужно слышать его и на
 * трансляции: браузерный источник OBS считается медиа, поэтому при включённой
 * опции «Управлять аудио через OBS» звук попадает и в микшер, и на стрим.
 * Встроенные звуки страница синтезирует сама, свои файлы берёт из кэша,
 * который приходит событием widgetRewardSounds, — байты не гоняем по SSE
 * на каждую награду.
 */
export function widgetRewardSound(sound: string, volume: number) {
  if (wv) void call("widget.sound", { sound, volume });
}

/** Библиотека своих звуков наград → в источник OBS (кэш страницы виджета). */
export function widgetRewardSounds(list: unknown) {
  if (wv) void call("widget.rewardSounds", list);
}

/** Награда за баллы канала, как её отдаёт площадка. */
export interface ChannelReward {
  /** идентификатор награды на площадке */
  id: string;
  /** название, как его видит стример */
  title: string;
  /** стоимость в баллах */
  cost: number;
}

export interface ChannelRewardsResult {
  ok: boolean;
  /** причина отказа — её показываем пользователю как есть */
  error?: string;
  rewards: ChannelReward[];
}

/**
 * Список наград за баллы авторизованного канала.
 *
 * Нужен, чтобы не вписывать названия наград руками: после входа приложение
 * получает все награды канала и сразу заводит под ними строки настроек — от
 * пользователя остаётся выбрать звук. Список наград отдают Twitch и VK Видео
 * Live — обе площадки после входа в разделе «Чат-бот»; у остальных нет
 * публичного доступа без cookies владельца, поэтому они добавляются вручную.
 */
export async function channelRewards(platform: string, channel: string): Promise<ChannelRewardsResult> {
  if (!wv) {
    return {
      ok: false,
      error: "Список наград загружается в приложении — здесь награды добавляются вручную",
      rewards: [],
    };
  }
  try {
    return await call<ChannelRewardsResult>("rewards.list", platform, channel);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось загрузить награды", rewards: [] };
  }
}

/** Награда, созданная на площадке: id, название и цена, как их вернула площадка. */
export interface CreatedChannelReward {
  platform: "twitch" | "vkplay";
  id: string;
  title: string;
  cost: number;
}

export interface CreateRewardResult {
  /** хотя бы на одной площадке награда создана */
  ok: boolean;
  created: CreatedChannelReward[];
  /** площадки, где создать не удалось, и причина словами площадки */
  failed: { platform: "twitch" | "vkplay"; error: string }[];
}

/**
 * Создать награду за баллы сразу на выбранных площадках.
 *
 * Награда заводится в канале авторизованного аккаунта: для Twitch нужен
 * вход с правом управления наградами, для VK Видео Live — обычный вход.
 * Ответ площадки возвращается как есть: интерфейс показывает и удачные
 * создания, и причины отказа, а не общее «не получилось».
 */
export async function createChannelReward(req: {
  title: string;
  cost: number;
  description: string;
  messageRequired: boolean;
  platforms: ("twitch" | "vkplay")[];
}): Promise<CreateRewardResult> {
  if (!wv) {
    return {
      ok: false,
      created: [],
      failed: req.platforms.map((platform) => ({
        platform,
        error: "Награды создаются в приложении — здесь можно только настроить звук",
      })),
    };
  }
  try {
    return await call<CreateRewardResult>(
      "rewards.create",
      req.title,
      req.cost,
      req.description,
      req.messageRequired,
      req.platforms,
    );
  } catch (e) {
    const error = e instanceof Error ? e.message : "Не удалось создать награду";
    return { ok: false, created: [], failed: req.platforms.map((platform) => ({ platform, error })) };
  }
}

/**
 * Снять сообщения с показа в виджете OBS и оверлее.
 *
 * Окно приложения показывает скрытые фильтром строки перечёркнутыми, а
 * публичный поток (OBS, оверлей) обязан их не показывать: сообщение
 * уходит туда тем же каналом, что и лента, поэтому хост убирает его из
 * виджета сразу, как только автомодерация скрыла строку.
 */
export function hideChatMessages(req: ChatHideRequest) {
  if (wv) void call("chat.hide", req);
}

export async function widgetInfo(): Promise<WidgetInfo> {
  if (wv) {
    try {
      return await call<WidgetInfo>("widget.info");
    } catch {
      /* fallthrough */
    }
  }
  return { url: `${location.origin}${location.pathname}#/widget`, port: 0, running: false };
}

export function applyHotkeys(map: Record<string, string>) {
  if (wv) void call("hotkeys.apply", map);
}

/** копирование в буфер: через хост надёжнее, в браузере — clipboard API */
export async function copyText(text: string): Promise<boolean> {
  if (wv) {
    try {
      await call("clipboard.set", text);
      return true;
    } catch {
      /* fallthrough */
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/* ---------------- каналы: реальные коннекторы хоста ----------------
 * В ответ хост шлёт события:
 *  "channel.status" → {platform, username, status, viewers}
 *  "channel.likes"  → {platform, username, likes}
 *  "channel.error"  → {platform, username, reason} (без токенов и ответов площадки)
 *  "chat.message"   → ChatMsg
 */
export const channelsApi = {
  connect(sub: ChannelSub) {
    if (wv) void call("channels.connect", sub);
  },
  disconnect(sub: Pick<ChannelSub, "platform" | "username">) {
    if (wv) void call("channels.disconnect", sub);
  },
  reconnect(sub: ChannelSub) {
    if (wv) void call("channels.reconnect", sub);
  },
};

/**
 * Отправка сообщения в чат площадки из приложения и по команде бота.
 *
 * `echoShownInApp` — окно уже показало это сообщение в ленте само. Площадка
 * возвращает отправленный текст в поток чата (VK — всегда, Twitch — когда
 * сообщение ушло ради закрепления), и без флага такая копия попала бы в ленту
 * второй раз.
 */
export async function sendChatMessage(
  platform: string,
  channel: string,
  text: string,
  pinDurationSeconds?: number | null,
  echoShownInApp = false,
): Promise<void> {
  if (!wv) throw new Error("Отправка доступна только в приложении");
  // -1 — закрепить до конца трансляции, положительное число — секунд.
  const pin = pinDurationSeconds === undefined ? 0 : pinDurationSeconds === null ? -1 : pinDurationSeconds;
  await call("chat.send", platform, channel, text, pin, echoShownInApp);
}

/** Twitch: прямые действия модерации; VK: режимы чата и отправка /ban (результат команды не подтверждается). */
export interface ModerationCall {
  action: string;
  platform: string;
  channel: string;
  author?: string;
  msgId?: string;
  userId?: string;
  roomId?: string;
  seconds?: number;
}

export async function runModerationOnPlatform(req: ModerationCall): Promise<void> {
  if (!wv) throw new Error("Модерация доступна только в приложении");
  await call("moderation.run", req);
}

/** площадки, на которых приложение умеет авторизовать чат-бота */
export type BotPlatform = "twitch" | "vkplay";

/**
 * Авторизация чат-бота.
 *
 * Twitch входит по device-коду, VK Видео Live — по коду возврата: браузер
 * открывает страницу разрешений, а приложение ловит ответ на локальном адресе
 * и меняет код на токены. Для пользователя обе кнопки работают одинаково.
 */
export const botApi = {
  /** вход в аккаунт бота через браузер */
  async login(platform: BotPlatform): Promise<{ account: string; channel?: string }> {
    if (!wv) throw new Error("Авторизация доступна только в приложении");
    return await call<{ account: string; channel?: string }>("bot.login", platform);
  },
  /** запасной путь: токен вставлен вручную */
  async verify(
    platform: BotPlatform,
    token: string,
  ): Promise<{ account: string; channel?: string; token: string }> {
    if (!wv) throw new Error("Авторизация доступна только в приложении");
    return await call<{ account: string; channel?: string; token: string }>("bot.verify", platform, token);
  },
  logout(platform: BotPlatform) {
    if (wv) void call("bot.logout", platform);
  },
};

/* ================= баллы канала и роли VK Видео Live =================
   Полный набор возможностей официального API площадки: интерфейсу нужен
   список наград, остальное доступно по тому же входу в «Чат-боте». */

export interface VkDemand {
  id: number;
  rewardId: string;
  userId: number;
  user: string;
  status: string;
}

export interface VkMember {
  id: number;
  nick: string;
  avatar: string;
  moderator: boolean;
  owner: boolean;
}

export const vkLiveApi = {
  /** награды канала: id, название и цена в баллах */
  async rewards(channel = ""): Promise<ChannelReward[]> {
    if (!wv) throw new Error("Награды VK Видео Live доступны только в приложении");
    return await call<ChannelReward[]>("vk.rewards", channel);
  },
  /** включить награду (по id или названию) */
  async enableReward(reward: string, channel = ""): Promise<void> {
    if (wv) await call("vk.reward.enable", channel, reward);
  },
  /** выключить награду (по id или названию) */
  async disableReward(reward: string, channel = ""): Promise<void> {
    if (wv) await call("vk.reward.disable", channel, reward);
  },
  /** активировать награду от своего имени */
  async activateReward(reward: string, message = "", channel = ""): Promise<void> {
    if (wv) await call("vk.reward.activate", channel, reward, message);
  },
  /** очередь заявок зрителей на награды */
  async demands(channel = ""): Promise<{ demands: VkDemand[]; isLast: boolean }> {
    if (!wv) throw new Error("Заявки VK Видео Live доступны только в приложении");
    return await call<{ demands: VkDemand[]; isLast: boolean }>("vk.reward.demands", channel);
  },
  async acceptDemand(demandId: number, channel = ""): Promise<void> {
    if (wv) await call("vk.reward.accept", channel, demandId);
  },
  async rejectDemand(demandId: number, channel = ""): Promise<void> {
    if (wv) await call("vk.reward.reject", channel, demandId);
  },
  /** зрители, которые сейчас в чате (не более 200 — ограничение площадки) */
  async members(channel = ""): Promise<VkMember[]> {
    if (!wv) throw new Error("Список зрителей доступен только в приложении");
    return await call<VkMember[]>("vk.members", channel);
  },
  /** роли канала и их выдача зрителю */
  async roles(channel = ""): Promise<{ id: string; name: string }[]> {
    if (!wv) throw new Error("Роли канала доступны только в приложении");
    return await call<{ id: string; name: string }[]>("vk.roles", channel);
  },
  async setUserRoles(userId: number, roleIds: string[], channel = ""): Promise<void> {
    if (wv) await call("vk.roles.set", channel, userId, roleIds);
  },
};

/** открыть ссылку в браузере по умолчанию (авторизация чат-бота и пр.) */
export function openExternal(url: string) {
  if (wv) void call("shell.openExternal", url);
  else window.open(url, "_blank", "noopener");
}

/* ---------------- MemeAlerts: вход по OAuth (раздел «Донаты») ---------------- */

export interface MemeAlertsStatus {
  /** вписаны Client ID / Secret приложения */
  configured: boolean;
  /** аккаунт авторизован (есть access token) */
  connected: boolean;
  name: string;
  code: string;
}

export const memealertsBridge = {
  /** статус авторизации (без секретов) */
  async status(): Promise<MemeAlertsStatus | null> {
    if (!wv) return null;
    try {
      return await call<MemeAlertsStatus>("memealerts.status");
    } catch {
      return null;
    }
  },
  /**
   * Полный вход: браузер открывается на странице согласия MemeAlerts,
   * редирект с кодом ловит хост. Ждёт до 10 минут — как вход в VK.
   */
  async authorize(): Promise<{ ok: true; name: string; code: string }> {
    if (!wv) throw new Error("Вход в MemeAlerts доступен только в приложении");
    return await call<{ ok: true; name: string; code: string }>("memealerts.authorize");
  },
  /** отозвать доступ (токены удаляются, канал перестаёт получать донаты) */
  logout() {
    if (wv) void call("memealerts.logout");
  },
};

/* ---------------- полоса донатов (OBS-виджет) ---------------- */

/** Снимок состояния полосы: старт/цель/стиль + накопленные суммы по валютам. */
export interface DonateBarBridgeState {
  start: number;
  goal: number;
  currency: string;
  style: string;
  title?: string;
  barOnly?: boolean;
  totals: Record<string, number>;
}

export const donatebarBridge = {
  /** текущее состояние (итог накоплен хостом и переживает перезапуски) */
  async info(): Promise<DonateBarBridgeState | null> {
    if (!wv) return null;
    try {
      return await call<DonateBarBridgeState>("donatebar.info");
    } catch {
      return null;
    }
  },
  /** ручное сбрасывание итога к стартовой сумме */
  reset() {
    if (wv) void call("donatebar.reset");
  },
};
