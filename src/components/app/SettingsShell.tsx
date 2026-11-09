import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Bell,
  Coins,
  Bot,
  Cpu,
  Download,
  Filter,
  Gamepad2,
  HandCoins,
  Heart,
  Keyboard,
  LayoutList,
  MonitorPlay,
  PanelLeft,
  Search,
  Send,
  X,
} from "lucide-react";
import AppViewPanel from "./AppViewPanel";
import SoundsPanel from "./SoundsPanel";
import RewardSoundsPanel from "./RewardSoundsPanel";
import { autostartBridge, exportDiagnostics, isDesktop, sendTestNotification } from "../../lib/bridge";
import type { BotPlatform, CreateRewardResult } from "../../lib/bridge";
import type { RewardDraft } from "../../lib/rewardSounds";
import { usePersisted } from "../../lib/persist";
import type {
  BotCommand,
  Channel,
  ChatViewConfig,
  DonateConfig,
  EventSoundsConfig,
  MemeAlertsConfig,
  PlatformId,
  OverlayConfig,
  RewardSoundsConfig,
  TtsConfig,
  TwitchAutoPinConfig,
  WidgetConfig,
} from "../../lib/types";
import type { CustomSound } from "../../lib/donateSounds";
import type { MemeAlertsStatus } from "../../lib/bridge";
import type { DonateBarConfig, DonateBarState } from "../../lib/donatebar";
import VoicePanel, { type QueueItem } from "./VoicePanel";
import FiltersPanel from "./FiltersPanel";
import DonationsPanel from "./DonationsPanel";
import ChatViewPanel from "./ChatViewPanel";
import WidgetPanel from "./WidgetPanel";
import OverlayPanel from "./OverlayPanel";
import HotkeysPanel from "./HotkeysPanel";
import ChatBotPanel from "./ChatBotPanel";
import SupportPanel from "./SupportPanel";
import { FeedPreview, OverlayPreview, WidgetPreview } from "./Presets";
import { Collapsible, IconBtn, ToggleRow } from "./ui";
import { clearSettingFocus, requestSettingFocus, useSettingFocus } from "../../lib/settingsFocus";
import { searchSettings, settingKey } from "../../lib/settingsIndex";
import type { SettingEntry } from "../../lib/settingsIndex";

export type SettingsTabId =
  | "voice"
  | "sounds"
  | "rewards"
  | "donations"
  | "filters"
  | "view"
  | "chatview"
  | "widget"
  | "overlay"
  | "hotkeys"
  | "system"
  | "chatbot"
  | "support"
  /* старые идентификаторы — открывают ближайший подходящий раздел */
  | "sound"
  | "donate"
  | "feed"
  | "output"
  | "interface";

const TABS: { id: SettingsTabId; name: string; icon: React.ReactNode; section: "look" | "app" }[] = [
  { id: "view", name: "Вид приложения", icon: <PanelLeft size={14} />, section: "look" },
  { id: "chatview", name: "Лента чата", icon: <LayoutList size={14} />, section: "look" },
  { id: "widget", name: "Виджет OBS", icon: <MonitorPlay size={14} />, section: "look" },
  { id: "overlay", name: "Оверлей поверх игры", icon: <Gamepad2 size={14} />, section: "look" },
  { id: "voice", name: "Озвучка", icon: <AudioLines size={14} />, section: "app" },
  { id: "sounds", name: "Звуки уведомлений", icon: <Bell size={14} />, section: "app" },
  { id: "rewards", name: "Награды за баллы", icon: <Coins size={14} />, section: "app" },
  { id: "donations", name: "Донаты", icon: <HandCoins size={14} />, section: "app" },
  { id: "filters", name: "Фильтры чата", icon: <Filter size={14} />, section: "app" },
  { id: "chatbot", name: "Чат-бот", icon: <Bot size={14} />, section: "app" },
  { id: "hotkeys", name: "Горячие клавиши", icon: <Keyboard size={14} />, section: "app" },
  { id: "system", name: "Приложение", icon: <Cpu size={14} />, section: "app" },
  { id: "support", name: "Поддержать", icon: <Heart size={14} />, section: "app" },
];

/** переезд старых вкладок на новые */
const TAB_ALIAS: Partial<Record<SettingsTabId, SettingsTabId>> = {
  sound: "voice",
  feed: "chatview",
  output: "widget",
  interface: "chatview",
  // старый идентификатор «Донаты» — теперь это полноценная вкладка
  donate: "donations",
};

interface Props {
  open: boolean;
  onClose: () => void;
  initialTab?: SettingsTabId;
  /* озвучка / фильтры */
  tts: TtsConfig;
  patchTts: (p: Partial<TtsConfig>) => void;
  /* донаты: звук оповещения (озвучка донатов убрана) */
  donate: DonateConfig;
  patchDonate: (p: Partial<DonateConfig>) => void;
  channels: Channel[];
  onChannelDonateSound: (channelId: string, sound: string) => void;
  /* донаты: подключение площадок, MemeAlerts (OAuth) и полоса донатов */
  onConnectChannel: (
    platform: PlatformId,
    username: string,
    opts?: { token?: string; currency?: string; donateSound?: string },
  ) => void;
  onDisconnectChannel: (id: string) => void;
  onReconnectChannel: (id: string) => void;
  onUpdateChannelToken: (id: string, token: string) => void;
  memealerts: MemeAlertsConfig;
  patchMemealerts: (p: Partial<MemeAlertsConfig>) => void;
  memealertsStatus: MemeAlertsStatus | null;
  onMemealertsAuthorize: () => void;
  onMemealertsLogout: () => void;
  donatebar: DonateBarConfig;
  patchDonatebar: (p: Partial<DonateBarConfig>) => void;
  donatebarState: DonateBarState | null;
  onDonatebarReset: () => void;
  widgetUrl: string | null;
  queue: QueueItem[];
  paused: boolean;
  onPauseToggle: () => void;
  onSkipQueue: () => void;
  onClearQueue: () => void;
  onTestVoice: (text: string) => void;
  /* остальные панели */
  chatView: ChatViewConfig;
  patchChatView: (c: ChatViewConfig) => void;
  widgetCfg: WidgetConfig;
  patchWidget: (c: WidgetConfig) => void;
  overlayCfg: OverlayConfig;
  patchOverlay: (c: OverlayConfig) => void;
  hotkeys: Record<string, string>;
  onApplyHotkeys: (m: Record<string, string>) => void;
  /* команды бота */
  botCommands?: BotCommand[];
  onUpdateCommands?: (cmds: BotCommand[] | ((p: BotCommand[]) => BotCommand[])) => void;
  botAuth?: Record<string, string>;
  twitchAutoPin: TwitchAutoPinConfig;
  patchTwitchAutoPin: (p: Partial<TwitchAutoPinConfig>) => void;
  /* интерфейс / лента / система */
  variantId: string;
  onVariant: (id: string) => void;
  maxFeed: number;
  onMaxFeed: (v: number) => void;
  closeToTray: boolean;
  setCloseToTray: (v: boolean) => void;
  minimizeToTray: boolean;
  setMinimizeToTray: (v: boolean) => void;
  startHidden: boolean;
  setStartHidden: (v: boolean) => void;
  startMaximized: boolean;
  setStartMaximized: (v: boolean) => void;
  /* звуки уведомлений */
  eventSounds: EventSoundsConfig;
  patchEventSounds: (p: Partial<EventSoundsConfig>) => void;
  customSounds: CustomSound[];
  setCustomSounds: (list: CustomSound[]) => void;
  /* звуки наград за баллы канала: свой блок и своя библиотека файлов */
  rewardSounds: RewardSoundsConfig;
  patchRewardSounds: (p: Partial<RewardSoundsConfig>) => void;
  rewardCustomSounds: CustomSound[];
  setRewardCustomSounds: (list: CustomSound[]) => void;
  /** загрузка списка наград канала (кнопка «Обновить» и вход в Twitch/VK) */
  syncRewardRules: (quiet?: boolean, account?: string, platform?: BotPlatform) => void;
  /** создание награды на выбранных площадках (кнопка в разделе «Награды») */
  onCreateReward: (draft: RewardDraft) => Promise<CreateRewardResult>;
  rewardsSyncing: boolean;
  hideDeleted: boolean;
  setHideDeleted: (v: boolean) => void;
  mentionHL: boolean;
  setMentionHL: (v: boolean) => void;
  /* режим «Только чат» (UI-1.3) */
  focusMode?: boolean;
  setFocusMode?: (v: boolean) => void;
  savedAt: number;
  toast: (t: string) => void;
  markSaved: (label?: string) => void;
}

export default function SettingsShell(p: Props) {
  const [tab, setTab] = useState<SettingsTabId>(p.initialTab ?? "voice");
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!p.open) return;
    const wanted = p.initialTab ?? "chatview";
    setTab(TAB_ALIAS[wanted] ?? wanted);
  }, [p.open, p.initialTab]);

  /* локальные системно-звуковые настройки (все сохраняются) */
  const [soundDevice, setSoundDevice] = usePersisted("soundDevice", "default");
  const [autostart, setAutostart] = usePersisted("autostart", false);

  /* 1.9: тумблер читает настоящее состояние ключа автозапуска у хоста;
     в браузере остаётся просто сохранённое значение. */
  useEffect(() => {
    let alive = true;
    void autostartBridge.get().then((v) => {
      if (alive && typeof v === "boolean") setAutostart(v);
    });
    return () => {
      alive = false;
    };
  }, [setAutostart]);

  const q = settingKey(query);
  const match = useMemo(() => (label: string) => !q || settingKey(label).includes(q), [q]);

  /* поиск по пунктам, а не только по названиям разделов: «тень», «пауза»,
     «скорость» находятся там, где лежат, — в любом разделе */
  const settingHits = useMemo(() => searchSettings(query), [query]);

  const matchedTabs = useMemo(() => TABS.filter((t) => match(t.name)), [match]);

  /* переход к пункту: раздел открыт, блок раскрывается сам (см. ui.tsx),
     строка подсвечивается после отрисовки */
  const focus = useSettingFocus();
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!focus) return;
    const timer = window.setTimeout(() => {
      const root = bodyRef.current;
      if (!root) return;
      const want = focus.label.trim().toLowerCase();
      const nodes = Array.from(root.querySelectorAll<HTMLElement>("div, span, label, h3, button"));
      /* подпись может быть и голым текстом в строке-переключателе, и отдельным
         span — берём самый маленький элемент с точным совпадением */
      const target = nodes
        .filter((n) => (n.textContent ?? "").trim().toLowerCase() === want)
        .sort((a, b) => a.querySelectorAll("*").length - b.querySelectorAll("*").length)[0];
      if (!target) return;
      target.scrollIntoView?.({ block: "center" });
      target.classList.add("y-set-flash");
      window.setTimeout(() => target.classList.remove("y-set-flash"), 1600);
      /* переход отработан: иначе блок сам раскроется при следующем заходе
         в тот же раздел уже без поиска */
      clearSettingFocus();
    }, 140);
    return () => window.clearTimeout(timer);
  }, [focus]);

  if (!p.open) return null;

  const tabName = TABS.find((t) => t.id === tab)?.name ?? "";

  const navBtn = (t: (typeof TABS)[number]) => (
    <button
      key={t.id}
      onClick={() => setTab(t.id)}
      title={t.name}
      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors"
      style={{
        background: tab === t.id ? "color-mix(in srgb, var(--dw-accent) 14%, transparent)" : "transparent",
        color: tab === t.id ? "var(--dw-accent-2)" : "var(--dw-dim)",
      }}
    >
      {t.icon}
      <span className="truncate">{t.name}</span>
    </button>
  );

  const hitBtn = (e: SettingEntry) => {
    const tabTitle = TABS.find((t) => t.id === e.tab)?.name ?? "";
    return (
      <button
        key={`${e.tab}-${e.box ?? ""}-${e.label}`}
        onClick={() => {
          setTab((TAB_ALIAS[e.tab as SettingsTabId] ?? e.tab) as SettingsTabId);
          setQuery("");
          requestSettingFocus(e.box, e.label);
        }}
        title={`${e.label} — ${tabTitle}${e.box && e.box !== e.label ? ` · ${e.box}` : ""}`}
        className="flex cursor-pointer flex-col rounded-lg px-2 py-1 text-left transition-colors hover:bg-[var(--dw-hover)]"
      >
        <span className="w-full truncate text-[11.5px]" style={{ color: "var(--dw-text)" }}>
          {e.label}
        </span>
        <span className="w-full truncate text-[10px]" style={{ color: "var(--dw-dim)" }}>
          {tabTitle}
          {e.box && e.box !== e.label ? ` · ${e.box}` : ""}
        </span>
      </button>
    );
  };

  /** предпросмотр справа — единственное место, где он показывается */
  const preview =
    tab === "chatview" ? (
      <FeedPreview view={p.chatView} />
    ) : tab === "overlay" ? (
      <OverlayPreview cfg={p.overlayCfg} />
    ) : tab === "widget" ? (
      <WidgetPreview cfg={p.widgetCfg} />
    ) : null;

  return (
    <div
      className="fade-anim fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onMouseDown={p.onClose}
    >
      <div
        className="pop-anim flex w-full max-w-[1180px] overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: "var(--dw-panel)", borderColor: "var(--dw-line)", height: "min(640px, 90vh)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* левая колонка */}
        <div
          className="flex w-[172px] shrink-0 flex-col border-r"
          style={{ borderColor: "var(--dw-line)", background: "var(--dw-bg)" }}
        >
          <div className="p-3 pb-2">
            <div className="relative">
              <Search
                size={13}
                className="absolute top-1/2 left-2.5 -translate-y-1/2"
                style={{ color: "var(--dw-dim)" }}
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск…"
                className="w-full rounded-lg border border-transparent py-1.5 pr-2 pl-7 text-[12px] outline-none focus:border-[var(--dw-accent)]"
                style={{ background: "var(--dw-input)", color: "var(--dw-text)" }}
              />
            </div>
          </div>
          <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
            <p
              className="px-2.5 pt-1 pb-1 text-[9.5px] font-bold tracking-[0.14em] uppercase"
              style={{ color: "var(--dw-dim)" }}
            >
              Оформление
            </p>
            {matchedTabs.filter((t) => t.section === "look").map(navBtn)}
            {(!q || matchedTabs.some((t) => t.section === "app")) && (
              <p
                className="px-2.5 pt-2.5 pb-1 text-[9.5px] font-bold tracking-[0.14em] uppercase"
                style={{ color: "var(--dw-dim)" }}
              >
                Приложение
              </p>
            )}
            {matchedTabs.filter((t) => t.section === "app").map(navBtn)}
            {q && (
              <>
                <p
                  className="px-2.5 pt-2.5 pb-1 text-[9.5px] font-bold tracking-[0.14em] uppercase"
                  style={{ color: "var(--dw-dim)" }}
                >
                  Настройки
                </p>
                {settingHits.length === 0 ? (
                  <p className="px-2.5 pb-1 text-[10.5px]" style={{ color: "var(--dw-dim)" }}>
                    Ничего не нашлось
                  </p>
                ) : (
                  <div className="flex flex-col gap-0.5">{settingHits.slice(0, 40).map(hitBtn)}</div>
                )}
              </>
            )}
          </nav>
          <div
            className="flex items-center gap-2 border-t p-3 text-[10.5px]"
            style={{ borderColor: "var(--dw-line)", color: "var(--dw-dim)" }}
          >
            {p.savedAt > 0 && (
              <span className="pop-anim flex items-center gap-1 text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Сохранено
              </span>
            )}
            <span className="ml-auto">v{__APP_VERSION__}</span>
          </div>
        </div>

        {/* содержимое */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header
            className="flex shrink-0 items-center justify-between border-b px-4 py-2"
            style={{ borderColor: "var(--dw-line)" }}
          >
            <h2 className="text-[13px] font-semibold" style={{ color: "var(--dw-text)" }}>
              {tabName}
            </h2>
            <IconBtn icon={<X size={15} />} onClick={p.onClose} title="Закрыть настройки" />
          </header>

          <div className="flex min-h-0 flex-1">
            <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto p-3">
              {tab === "voice" && (
                <div className="flex flex-col gap-2">
                  <VoicePanel
                    tts={p.tts}
                    patch={p.patchTts}
                    queue={p.queue}
                    paused={p.paused}
                    onPauseToggle={p.onPauseToggle}
                    onSkip={p.onSkipQueue}
                    onClearQueue={p.onClearQueue}
                    onTest={p.onTestVoice}
                  />
                  <Collapsible
                    title="Устройство вывода звука"
                    hint={soundDevice === "default" ? "системное" : "своё устройство"}
                  >
                    <div className="flex flex-col gap-2">
                      <div>
                        <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
                          Устройство вывода
                        </label>
                        <select
                          value={soundDevice}
                          onChange={(e) => {
                            setSoundDevice(e.target.value);
                            p.markSaved();
                          }}
                          className="w-full cursor-pointer rounded-lg border border-transparent px-2.5 py-1.5 text-[12.5px] outline-none"
                          style={{ background: "var(--dw-input)", color: "var(--dw-text)" }}
                        >
                          <option value="default" style={{ color: "#000" }}>
                            По умолчанию (системное)
                          </option>
                          <option value="headset" style={{ color: "#000" }}>
                            Наушники / стрим-микс
                          </option>
                          <option value="vb-cable" style={{ color: "#000" }}>
                            Виртуальный кабель (VB-Audio)
                          </option>
                        </select>
                      </div>
                      <p className="text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
                        Все звуки уведомлений настраиваются в разделе «Звуки уведомлений».
                      </p>
                    </div>
                  </Collapsible>
                </div>
              )}
              {tab === "sounds" && (
                <SoundsPanel
                  tts={p.tts}
                  patchTts={p.patchTts}
                  events={p.eventSounds}
                  patchEvents={p.patchEventSounds}
                  custom={p.customSounds}
                  setCustom={p.setCustomSounds}
                  toast={p.toast}
                />
              )}
              {tab === "rewards" && (
                <RewardSoundsPanel
                  rewards={p.rewardSounds}
                  patchRewards={p.patchRewardSounds}
                  rewardCustom={p.rewardCustomSounds}
                  setRewardCustom={p.setRewardCustomSounds}
                  onRefreshRewards={() => p.syncRewardRules()}
                  onCreateReward={p.onCreateReward}
                  rewardsSyncing={p.rewardsSyncing}
                  toast={p.toast}
                />
              )}
              {tab === "donations" && (
                <DonationsPanel
                  channels={p.channels}
                  onConnect={p.onConnectChannel}
                  onDisconnect={p.onDisconnectChannel}
                  onReconnect={p.onReconnectChannel}
                  onUpdateChannelToken={p.onUpdateChannelToken}
                  donate={p.donate}
                  patchDonate={p.patchDonate}
                  customSounds={p.customSounds}
                  ma={p.memealerts}
                  onMaChange={p.patchMemealerts}
                  maStatus={p.memealertsStatus}
                  onMaAuthorize={p.onMemealertsAuthorize}
                  onMaLogout={p.onMemealertsLogout}
                  barCfg={p.donatebar}
                  patchBar={p.patchDonatebar}
                  barState={p.donatebarState}
                  onBarReset={p.onDonatebarReset}
                  widgetUrl={p.widgetUrl}
                  toast={p.toast}
                />
              )}
              {tab === "filters" && <FiltersPanel tts={p.tts} patch={p.patchTts} botAuth={p.botAuth} />}
              {tab === "view" && (
                <AppViewPanel variantId={p.variantId} onVariant={p.onVariant} toast={p.toast} />
              )}
              {tab === "chatview" && (
                <ChatViewPanel
                  view={p.chatView}
                  patch={p.patchChatView}
                  maxFeed={p.maxFeed}
                  onMaxFeed={p.onMaxFeed}
                  hideDeleted={p.hideDeleted}
                  setHideDeleted={p.setHideDeleted}
                  mentionHL={p.mentionHL}
                  setMentionHL={p.setMentionHL}
                  focusMode={p.focusMode}
                  setFocusMode={p.setFocusMode}
                />
              )}
              {tab === "widget" && <WidgetPanel cfg={p.widgetCfg} patch={p.patchWidget} toast={p.toast} />}
              {tab === "overlay" && (
                <OverlayPanel
                  cfg={p.overlayCfg}
                  patch={p.patchOverlay}
                  toast={p.toast}
                  hotkey={p.hotkeys.toggleOverlay}
                  channels={p.channels}
                />
              )}
              {tab === "support" && <SupportPanel />}
              {tab === "chatbot" && (
                <ChatBotPanel
                  toast={p.toast}
                  commands={p.botCommands}
                  onUpdateCommands={p.onUpdateCommands}
                  autoPin={p.twitchAutoPin}
                  onUpdateAutoPin={p.patchTwitchAutoPin}
                />
              )}
              {tab === "hotkeys" && (
                <HotkeysPanel hotkeys={p.hotkeys} onApply={p.onApplyHotkeys} toast={p.toast} />
              )}

              {tab === "system" && (
                <div className="flex max-w-[480px] flex-col gap-1">
                  <ToggleRow
                    label="Сворачивать окно в трей"
                    checked={p.minimizeToTray}
                    onChange={(v) => {
                      p.setMinimizeToTray(v);
                      p.markSaved();
                    }}
                  />
                  <ToggleRow
                    label="«Крестик» сворачивает в трей"
                    hint="реальное закрытие — через меню трея"
                    checked={p.closeToTray}
                    onChange={(v) => {
                      p.setCloseToTray(v);
                      p.markSaved();
                    }}
                  />
                  <ToggleRow
                    label="Запускать свёрнутым в трей"
                    checked={p.startHidden}
                    onChange={(v) => {
                      p.setStartHidden(v);
                      p.markSaved();
                    }}
                  />
                  <ToggleRow
                    label="Разворачивать окно на весь экран при запуске"
                    hint="интерфейс гарантированно виден целиком на любом экране"
                    checked={p.startMaximized}
                    onChange={(v) => {
                      p.setStartMaximized(v);
                      p.markSaved();
                    }}
                  />
                  {isDesktop() && (
                    <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--dw-line)" }}>
                      <button
                        type="button"
                        disabled={exporting}
                        onClick={async () => {
                          setExporting(true);
                          try {
                            const saved = await exportDiagnostics(p.channels);
                            if (saved) p.toast("Диагностический пакет сохранён");
                          } catch {
                            p.toast("Не удалось сохранить диагностический пакет");
                          } finally {
                            setExporting(false);
                          }
                        }}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
                        style={{ background: "var(--dw-panel2)", color: "var(--dw-text)" }}
                      >
                        <Download size={14} /> {exporting ? "Сохранение…" : "Собрать диагностический пакет"}
                      </button>
                      <p className="mt-2 text-[11px]" style={{ color: "var(--dw-dim)" }}>
                        Архив с версией, статусами площадок и временем событий. Без текстов сообщений, имён
                        каналов и токенов. Никуда не отправляется автоматически.
                      </p>
                    </div>
                  )}
                  <ToggleRow
                    label="Автозапуск с Windows"
                    checked={autostart}
                    onChange={(v) => {
                      setAutostart(v);
                      p.markSaved();
                      /* 1.9: в приложении это настоящий ключ HKCU\...\Run;
                         если хост отказал — возвращаем тумблер как был. */
                      void autostartBridge.set(v).then((ok) => {
                        if (isDesktop() && !ok) {
                          setAutostart(!v);
                          p.toast("Не удалось изменить автозапуск");
                        }
                      });
                    }}
                  />
                </div>
              )}
            </div>

            {/* колонка предпросмотра — справа, для вкладок оформления */}
            {preview && (
              <aside
                className="hidden w-[320px] shrink-0 overflow-y-auto border-l p-3 lg:block"
                style={{ borderColor: "var(--dw-line)", background: "var(--dw-bg)" }}
              >
                {preview}

                {/* Тестовое уведомление — прямо под предпросмотром */}
                {(tab === "overlay" || tab === "widget") && (
                  <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--dw-line)" }}>
                    <button
                      onClick={() => {
                        const target = tab === "overlay" ? "overlay" : "widget";
                        sendTestNotification(target);
                        p.toast(
                          isDesktop()
                            ? tab === "overlay"
                              ? "Тестовые сообщения отправлены в оверлей"
                              : "Тестовые сообщения отправлены в виджет OBS"
                            : "Отправка доступна только в приложении",
                        );
                      }}
                      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2 text-[12px] font-bold text-[var(--dw-accent-ink)] transition-all hover:brightness-110"
                      style={{ background: "var(--dw-accent)" }}
                    >
                      <Send size={13} />
                      {tab === "overlay" ? "Отправить тест в оверлей" : "Отправить тест в виджет"}
                    </button>
                    <p
                      className="mt-1.5 text-center text-[10.5px] leading-snug"
                      style={{ color: "var(--dw-dim)" }}
                    >
                      придут сообщение, донат и подписка
                    </p>
                  </div>
                )}
              </aside>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
