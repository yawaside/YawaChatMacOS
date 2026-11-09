import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AudioLines,
  Bell,
  Bot,
  ChartColumnBig,
  Check,
  ChevronDown,
  CircleDot,
  Coins,
  Copy,
  Disc3,
  Filter,
  Focus,
  HandCoins,
  MessageSquare,
  MessagesSquare,
  Mic2,
  CornerDownLeft,
  KeyRound,
  MonitorPlay,
  Paintbrush,
  PanelLeft,
  Palette,
  Pause,
  PictureInPicture2,
  Play,
  Plus,
  Radio,
  Search,
  Settings,
  Shield,
  Timer,
  Trash2,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import ShellFeed from "./ShellFeed";
import appIcon from "../../assets/app-icon.jpg";
import type { LucideIcon } from "lucide-react";
import type { SettingsTabId } from "./SettingsShell";
import { PlatformIcon, platformMeta } from "../../lib/platforms";
import type { Channel, ChatMsg, ChatViewConfig, ModerationRequest, PlatformId } from "../../lib/types";

/**
 * Раскладки окна «Воздух», «Студия» и «macOS» — по референсам из src/proto
 * и src-mac.
 *
 * Внутри настоящие блоки приложения: лента со строкой отправки, список
 * каналов, сводка эфира. Вид меняет только оправу окна; тема сообщений,
 * виджета OBS и оверлея выбирается в своих разделах и здесь не трогается.
 * «macOS» повторяет src-mac: светофоры в заголовке, вибрантные панели и
 * сгруппированные разделы слева.
 */
export type ShellKind = "air" | "studio" | "mac";

export type FeedFilter = "all" | "important" | "donate" | "reward";

export interface RewardRow {
  title: string;
  cost?: number;
  platform: PlatformId;
}

export interface ChatShellProps {
  kind: ShellKind;
  /** сообщения ленты и параметры её показа */
  feed: ChatMsg[];
  maxFeed: number;
  hideDeleted: boolean;
  mentionHL: boolean;
  botAuth: Partial<Record<PlatformId, string>>;
  onModerate: (req: ModerationRequest) => void;
  onSend: (
    platform: PlatformId,
    channel: string,
    text: string,
    pinDurationSeconds?: number | null,
  ) => Promise<void> | void;
  chatView: ChatViewConfig;
  onChatMode: (action: string, channel: string, platform: PlatformId, seconds?: number) => void;
  /** панель управления каналами: подключение, отключение, переподключение */
  channelsPanel: ReactNode;
  channels: Channel[];
  onlineCount: number;
  connectedCount: number;
  viewers: number;
  messages: number;
  donateTotal: number;
  donateCurrency: string;
  subs: number;
  rewards: RewardRow[];
  ttsOn: boolean;
  ttsVolume: number;
  onTtsVolume: (v: number) => void;
  onToggleTts: () => void;
  queueLength: number;
  focusMode: boolean;
  onToggleFocus: () => void;
  onOpenSettings: (tab?: SettingsTabId) => void;
  onAddChannel: () => void;
  widgetUrl: string | null;
  onCopyWidget: () => void;
  filter: FeedFilter;
  onFilter: (f: FeedFilter) => void;
  paused: boolean;
  onPause: () => void;
  search: string;
  onSearch: (value: string) => void;
  onClearFeed: () => void;
  viewersHistory: number[];
  windowButtons?: ReactNode;
  audioPanel?: ReactNode;
  updateBadge?: ReactNode;
  onHeaderDoubleClick?: () => void;
}

export default function ChatShell(p: ChatShellProps) {
  if (p.kind === "air") return <AirShell {...p} />;
  if (p.kind === "mac") return <MacShell {...p} />;
  return <StudioShell {...p} />;
}

/* ============================== «Воздух» ==============================
   Слева разделы и каналы, в центре чат, справа эфир, озвучка и награды. */

function AirShell(p: ChatShellProps) {
  const live = p.onlineCount > 0;
  const [searchOpen, setSearchOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const peak = Math.max(p.viewers, ...p.viewersHistory);

  return (
    <div className="flex min-h-0 flex-1 items-stretch" style={{ background: "var(--dw-panel)" }}>
      {!p.focusMode && (
        <aside
          className="flex w-[238px] shrink-0 flex-col gap-3 border-r px-3 py-3"
          style={{ borderColor: "var(--dw-line)", background: "var(--dw-panel2)" }}
        >
          <div className="flex items-center gap-2 px-1">
            <img
              src={appIcon}
              alt="YawaChat"
              draggable={false}
              className="h-8 w-8 shrink-0 rounded-[10px] object-cover"
              style={{ boxShadow: "0 0 0 1px color-mix(in srgb, var(--dw-line) 80%, transparent)" }}
            />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13.5px] font-bold">YawaChat</p>
              <p className="truncate text-[10.5px]" style={{ color: "var(--dw-dim)" }}>
                чат всех стримов
              </p>
            </div>
            <div className="ml-auto flex items-center gap-0.5">{p.windowButtons}</div>
          </div>

          <nav className="flex flex-col gap-0.5">
            <button
              className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold"
              style={{
                background: "color-mix(in srgb, var(--dw-accent) 14%, transparent)",
                color: "var(--dw-accent-2)",
              }}
              title="Чат — текущий экран"
            >
              <MessageSquare size={16} /> Чат
            </button>
            {AIR_NAV.map((item) => (
              <button
                key={item.name}
                onClick={() => p.onOpenSettings(item.tab)}
                className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold transition-colors hover:bg-[var(--dw-hover)]"
                style={{ color: "var(--dw-dim)" }}
              >
                {item.icon}
                {item.name}
              </button>
            ))}
          </nav>

          <div className="flex items-center justify-between px-1">
            <span
              className="text-[10.5px] font-bold tracking-[0.12em] uppercase"
              style={{ color: "var(--dw-dim)" }}
            >
              Каналы
            </span>
            <span className="flex items-center gap-0.5">
              <button
                onClick={() => setManageOpen(true)}
                className="cursor-pointer rounded-lg px-1.5 py-1 text-[10px] font-medium transition-colors hover:bg-[var(--dw-hover)]"
                style={{ color: "var(--dw-dim)" }}
                title="Управление каналами: отключить, переподключить"
              >
                управление
              </button>
              <button
                onClick={p.onAddChannel}
                className="cursor-pointer rounded-lg p-1 transition-colors hover:bg-[var(--dw-hover)]"
                title="Добавить канал"
              >
                <Plus size={14} style={{ color: "var(--dw-dim)" }} />
              </button>
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-0.5">
              {p.channels.length === 0 && (
                <button
                  onClick={p.onAddChannel}
                  className="rounded-xl border border-dashed px-2 py-2 text-[11.5px]"
                  style={{ borderColor: "var(--dw-line)", color: "var(--dw-dim)" }}
                >
                  подключить канал
                </button>
              )}
              {p.channels.map((c) => {
                const meta = platformMeta(c.platform);
                const on = c.status === "online";
                return (
                  <div
                    key={c.id}
                    className="group flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-[var(--dw-hover)]"
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: `${meta.color}20` }}
                      title={meta.name}
                    >
                      <PlatformIcon id={c.platform} size={13} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{c.username}</span>
                    {on ? (
                      <span
                        className="shrink-0 text-[10.5px] tabular-nums"
                        style={{ color: "var(--dw-dim)" }}
                      >
                        {c.viewers.toLocaleString("ru-RU")}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[10px]" style={{ color: "var(--dw-dim)" }}>
                        офлайн
                      </span>
                    )}
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: on ? "#4ade80" : "var(--dw-line)" }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl p-3" style={{ background: "var(--dw-panel)" }}>
            <div className="flex items-center gap-2">
              <MonitorPlay size={15} style={{ color: "var(--dw-accent)" }} />
              <span className="text-[11.5px] font-semibold">
                {p.widgetUrl ? "OBS подключён" : "Виджет OBS"}
              </span>
            </div>
            <p className="mt-1 truncate text-[10.5px]" style={{ color: "var(--dw-dim)" }}>
              {p.widgetUrl ?? "ссылка появится после запуска"}
            </p>
            <button
              onClick={p.onCopyWidget}
              disabled={!p.widgetUrl}
              className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-semibold transition-colors hover:brightness-110 disabled:opacity-50"
              style={{
                background: "color-mix(in srgb, var(--dw-accent) 16%, transparent)",
                color: "var(--dw-accent-2)",
              }}
            >
              <Copy size={12} /> Скопировать ссылку
            </button>
          </div>

          <button
            onClick={() => p.onOpenSettings("hotkeys")}
            className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[11px] transition-colors"
            style={{ color: "var(--dw-dim)" }}
          >
            <Settings size={13} />
            Настройки и горячие клавиши
          </button>
        </aside>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <div
          className="drag-region flex items-start gap-3 px-5 pt-3 pb-2"
          onDoubleClick={p.onHeaderDoubleClick}
        >
          <div className="min-w-0">
            <h1 className="truncate text-[19px] leading-tight font-bold">Чат</h1>
            <p className="truncate text-[11.5px]" style={{ color: "var(--dw-dim)" }}>
              {p.onlineCount} каналов · {p.viewers.toLocaleString("ru-RU")} зрителей ·{" "}
              {p.messages.toLocaleString("ru-RU")} сообщений
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setSearchOpen((v) => !v)}
              className="flex cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-medium transition-colors"
              style={{ background: "var(--dw-panel2)", color: "var(--dw-dim)" }}
              title="Поиск по ленте"
            >
              <Search size={13} /> Поиск
            </button>
            <button
              onClick={() => p.onOpenSettings("sounds")}
              className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-xl transition-colors"
              style={{ background: "var(--dw-panel2)", color: "var(--dw-dim)" }}
              title="Звуки и уведомления"
            >
              <Bell size={13} />
            </button>
            <FocusChip p={p} />
            {p.updateBadge}
            {p.audioPanel}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 px-5 pb-2">
          {searchOpen && (
            <div
              className="flex w-full items-center gap-1.5 rounded-xl px-2.5 py-1.5"
              style={{ background: "var(--dw-panel2)" }}
            >
              <Search size={13} style={{ color: "var(--dw-dim)" }} />
              <input
                autoFocus
                value={p.search}
                onChange={(e) => p.onSearch(e.target.value)}
                placeholder="Поиск по сообщениям и авторам"
                className="min-w-0 flex-1 bg-transparent text-[12px] outline-none"
                style={{ color: "var(--dw-text)" }}
              />
              <button
                onClick={() => {
                  p.onSearch("");
                  setSearchOpen(false);
                }}
                className="cursor-pointer rounded px-1"
                title="Закрыть поиск"
              >
                <X size={12} style={{ color: "var(--dw-dim)" }} />
              </button>
            </div>
          )}
          {AIR_FILTERS.map((f) => {
            const on = p.filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => p.onFilter(f.id)}
                className="cursor-pointer rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors"
                style={{
                  background: on ? "var(--dw-accent)" : "var(--dw-panel2)",
                  color: on ? "var(--dw-accent-ink)" : "var(--dw-dim)",
                }}
              >
                {f.name}
              </button>
            );
          })}
          <button
            onClick={p.onPause}
            className="ml-auto cursor-pointer rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors"
            style={{
              background: p.paused ? "rgba(251,191,36,0.16)" : "var(--dw-panel2)",
              color: p.paused ? "#fbbf24" : "var(--dw-dim)",
            }}
          >
            {p.paused ? "Продолжить" : "Пауза"}
          </button>
          <TtsChip p={p} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col pb-3">
          <ShellFeed
            feed={p.feed}
            channels={p.channels}
            botAuth={p.botAuth}
            maxFeed={p.maxFeed}
            hideDeleted={p.hideDeleted}
            mentionHL={p.mentionHL}
            layout="air"
            view={p.chatView}
            onClear={p.onClearFeed}
            onChatMode={p.onChatMode}
            onModerate={p.onModerate}
            onSend={p.onSend}
            emptyHint="сообщений пока нет — подключите канал"
          />
        </div>
      </main>

      {!p.focusMode && (
        <aside
          className="flex w-[292px] shrink-0 flex-col gap-2.5 border-l px-3 py-3"
          style={{ borderColor: "var(--dw-line)", background: "var(--dw-panel2)" }}
        >
          <section className="rounded-2xl p-3.5" style={{ background: "var(--dw-panel)" }}>
            <div className="flex items-center gap-1.5">
              <span
                className="text-[10.5px] font-bold tracking-[0.12em] uppercase"
                style={{ color: "var(--dw-dim)" }}
              >
                Эфир
              </span>
              <span
                className="ml-auto rounded px-1.5 py-0.5 text-[9.5px] font-bold"
                style={{
                  background: live ? "rgba(74,222,128,0.14)" : "var(--dw-input)",
                  color: live ? "#4ade80" : "var(--dw-dim)",
                }}
              >
                {live ? "LIVE" : "офлайн"}
              </span>
            </div>
            <p className="mt-2 text-[26px] leading-none font-bold tabular-nums">
              {p.viewers.toLocaleString("ru-RU")}
            </p>
            <p className="text-[11px]" style={{ color: "var(--dw-dim)" }}>
              зрителей · пик {peak.toLocaleString("ru-RU")}
            </p>
            <Sparkline values={p.viewersHistory} />
            <div
              className="mt-2 grid grid-cols-3 gap-2 border-t pt-2"
              style={{ borderColor: "var(--dw-line)" }}
            >
              {[
                ["Донаты", `${p.donateTotal.toLocaleString("ru-RU")} ${p.donateCurrency}`],
                ["Подписки", `+${p.subs}`],
                ["Награды", String(p.rewards.length)],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-[10px]" style={{ color: "var(--dw-dim)" }}>
                    {label}
                  </p>
                  <p className="truncate text-[12.5px] font-bold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl p-3.5" style={{ background: "var(--dw-panel)" }}>
            <div className="flex items-center gap-2">
              <Mic2 size={15} style={{ color: "var(--dw-accent)" }} />
              <span className="text-[12.5px] font-semibold">Озвучка</span>
              <button
                onClick={p.onToggleTts}
                title={p.ttsOn ? "Выключить озвучку" : "Включить озвучку"}
                className="ml-auto flex h-5 w-9 cursor-pointer items-center rounded-full p-0.5 transition-colors"
                style={{
                  background: p.ttsOn ? "var(--dw-accent)" : "var(--dw-input)",
                  justifyContent: p.ttsOn ? "flex-end" : "flex-start",
                }}
              >
                <span className="h-4 w-4 rounded-full bg-white shadow" />
              </button>
            </div>
            <button
              onClick={() => p.onOpenSettings("voice")}
              className="mt-2.5 flex w-full cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-left text-[12px]"
              style={{ background: "var(--dw-panel2)" }}
            >
              Голос и скорость
              <ChevronDown size={13} style={{ color: "var(--dw-dim)" }} />
            </button>
            <div className="mt-2 flex items-center gap-2">
              <Volume2 size={14} style={{ color: "var(--dw-dim)" }} />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={p.ttsVolume}
                onChange={(e) => p.onTtsVolume(Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer"
                /* --fill задаёт закрашенную часть дорожки: без него полоска
                   стоит на месте, хотя ползунок двигается */
                style={
                  {
                    "--fill": `${Math.round(p.ttsVolume * 100)}%`,
                  } as React.CSSProperties
                }
                title="Громкость озвучки"
              />
              <span className="text-[10.5px] tabular-nums" style={{ color: "var(--dw-dim)" }}>
                {Math.round(p.ttsVolume * 100)}%
              </span>
            </div>
            {p.queueLength > 0 && (
              <p className="mt-1 text-[10.5px]" style={{ color: "var(--dw-dim)" }}>
                в очереди: {p.queueLength}
              </p>
            )}
          </section>

          <section
            className="flex min-h-0 flex-1 flex-col rounded-2xl p-3.5"
            style={{ background: "var(--dw-panel)" }}
          >
            <div className="flex items-center gap-2">
              <Coins size={15} style={{ color: "var(--dw-accent)" }} />
              <span className="text-[12.5px] font-semibold">Награды</span>
              <span className="ml-auto text-[10.5px]" style={{ color: "var(--dw-dim)" }}>
                {p.rewards.length}
              </span>
            </div>
            <div className="mt-2 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
              {p.rewards.length === 0 && (
                <p className="text-[11px]" style={{ color: "var(--dw-dim)" }}>
                  пока нет наград
                </p>
              )}
              {p.rewards.slice(0, 8).map((r) => (
                <div key={`${r.platform}-${r.title}`} className="flex items-center gap-2 text-[11.5px]">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: platformMeta(r.platform).color }}
                  />
                  <span className="min-w-0 flex-1 truncate">{r.title}</span>
                  <span className="shrink-0 tabular-nums" style={{ color: "var(--dw-dim)" }}>
                    {r.cost ? `${r.cost} б.` : "—"}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={() => p.onOpenSettings("rewards")}
              className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold transition-colors hover:brightness-110"
              style={{
                background: "color-mix(in srgb, var(--dw-accent) 16%, transparent)",
                color: "var(--dw-accent-2)",
              }}
            >
              <Plus size={12} /> Новая награда
            </button>
          </section>

          <button
            onClick={() => p.onOpenSettings()}
            className="flex cursor-pointer items-center gap-2 rounded-2xl px-3 py-2 text-left text-[11.5px] transition-colors hover:brightness-110"
            style={{ background: "var(--dw-panel)", color: "var(--dw-dim)" }}
          >
            <Settings size={13} />
            Настройки и горячие клавиши
          </button>
        </aside>
      )}

      <ChannelsDialog open={manageOpen} onClose={() => setManageOpen(false)}>
        {p.channelsPanel}
      </ChannelsDialog>
    </div>
  );
}

const AIR_NAV: { name: string; icon: ReactNode; tab: SettingsTabId }[] = [
  { name: "Награды", icon: <Coins size={16} />, tab: "rewards" },
  { name: "Озвучка", icon: <Mic2 size={16} />, tab: "voice" },
  { name: "Оформление", icon: <Palette size={16} />, tab: "view" },
];

const AIR_FILTERS: { id: FeedFilter; name: string }[] = [
  { id: "all", name: "все" },
  { id: "important", name: "важные" },
  { id: "donate", name: "донаты" },
  { id: "reward", name: "награды" },
];

function Sparkline({ values }: { values: number[] }) {
  const points = values.length > 1 ? values : [0, 0];
  const max = Math.max(1, ...points);
  const d = points
    .map((v, i) => {
      const x = (i / Math.max(1, points.length - 1)) * 100;
      const y = 100 - (v / max) * 82 - 9;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-2 h-11 w-full">
      <polyline
        points={d}
        fill="none"
        stroke="var(--dw-accent)"
        strokeWidth="1.6"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ============================== «Студия» ============================== */

function StudioShell(p: ChatShellProps) {
  const [query, setQuery] = useState(p.search);
  const [manageOpen, setManageOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const live = p.onlineCount > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-0 flex-1" style={{ background: "var(--dw-bg)" }}>
      {!p.focusMode && (
        <nav
          className="flex w-[56px] shrink-0 flex-col items-center gap-1.5 border-r py-3"
          style={{ background: "var(--dw-panel)", borderColor: "var(--dw-line)" }}
        >
          <img
            src={appIcon}
            alt="YawaChat"
            draggable={false}
            className="mb-2 h-9 w-9 shrink-0 rounded-[11px] object-cover"
            title="YawaChat"
          />
          <button
            title="Чат — текущий экран"
            className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl"
            style={{
              background: "color-mix(in srgb, var(--dw-accent) 14%, transparent)",
              color: "var(--dw-accent)",
            }}
          >
            <span
              className="absolute top-1.5 -left-1.5 h-6 w-[3px] rounded-full"
              style={{ background: "var(--dw-accent)" }}
            />
            <MessageSquare size={18} />
          </button>
          {STUDIO_NAV.map((item) => (
            <button
              key={item.name}
              onClick={() => p.onOpenSettings(item.tab)}
              title={item.name}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl transition-colors hover:bg-[var(--dw-hover)]"
              style={{ color: "var(--dw-dim)" }}
            >
              {item.icon}
            </button>
          ))}
          <div className="mt-auto flex flex-col items-center gap-1.5">
            <button
              onClick={() => p.onOpenSettings()}
              title="Настройки"
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl transition-colors hover:bg-[var(--dw-hover)]"
              style={{ color: "var(--dw-dim)" }}
            >
              <Settings size={18} />
            </button>
          </div>
        </nav>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          className="drag-region flex shrink-0 items-center gap-2 px-3 py-1"
          style={{ color: "var(--dw-dim)" }}
          onDoubleClick={p.onHeaderDoubleClick}
        >
          <span className="text-[10.5px] font-bold" style={{ color: "var(--dw-text)" }}>
            YawaChat
          </span>
          <span
            className={`h-1.5 w-1.5 rounded-full ${live ? "pulse-dot" : ""}`}
            style={{ background: live ? "#4ade80" : "var(--dw-dim)" }}
          />
          <div className="ml-auto flex items-center gap-1">
            <TtsChip p={p} />
            <FocusChip p={p} />
            {p.updateBadge}
            {p.audioPanel}
            {p.windowButtons}
          </div>
        </div>

        {!p.focusMode && (
          <header
            className="flex shrink-0 flex-wrap items-center gap-2 border-y px-3 py-2.5"
            style={{ borderColor: "var(--dw-line)" }}
          >
            <span className="text-[13px] font-bold" style={{ color: "var(--dw-accent)" }}>
              #
            </span>
            <span className="text-[13px] font-bold">все каналы</span>
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-bold"
              style={{
                background: "color-mix(in srgb, var(--dw-accent) 14%, transparent)",
                color: "var(--dw-accent)",
              }}
            >
              {p.channels.length}
            </span>

            <div
              className="ml-2 flex min-w-[220px] flex-1 items-center gap-1.5 rounded-lg px-2.5 py-1.5"
              style={{ background: "var(--dw-input)" }}
            >
              <Search size={13} style={{ color: "var(--dw-dim)" }} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  p.onSearch(e.target.value);
                }}
                placeholder="Поиск по сообщениям, @ник, «цитата»"
                className="min-w-0 flex-1 bg-transparent text-[12px] outline-none"
                style={{ color: "var(--dw-text)" }}
              />
              {query ? (
                <button
                  onClick={() => {
                    setQuery("");
                    p.onSearch("");
                  }}
                  className="cursor-pointer rounded px-1"
                  title="Очистить поиск"
                >
                  <X size={12} style={{ color: "var(--dw-dim)" }} />
                </button>
              ) : (
                <kbd
                  className="rounded px-1 text-[9.5px]"
                  style={{ background: "var(--dw-input)", color: "var(--dw-dim)" }}
                >
                  Ctrl+F
                </kbd>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setFilterOpen((v) => !v)}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-colors"
                style={{
                  background: p.filter === "all" ? "var(--dw-input)" : "var(--dw-accent)",
                  color: p.filter === "all" ? "var(--dw-text)" : "var(--dw-accent-ink)",
                }}
                title="Фильтр ленты и настройки фильтров"
              >
                <Filter size={13} /> Фильтры
              </button>
              {filterOpen && (
                <div
                  className="absolute top-full left-0 z-40 mt-1 flex w-[168px] flex-col gap-0.5 rounded-xl border p-1 shadow-2xl"
                  style={{ background: "var(--dw-panel)", borderColor: "var(--dw-line)" }}
                >
                  {AIR_FILTERS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => {
                        p.onFilter(f.id);
                        setFilterOpen(false);
                      }}
                      className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[11.5px] transition-colors hover:bg-[var(--dw-hover)]"
                      style={{ color: p.filter === f.id ? "var(--dw-accent)" : "var(--dw-text)" }}
                    >
                      {p.filter === f.id ? <Check size={11} /> : <span className="w-[11px]" />}
                      {f.name}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setFilterOpen(false);
                      p.onOpenSettings("filters");
                    }}
                    className="mt-0.5 cursor-pointer rounded-lg border-t px-2 py-1.5 text-left text-[10.5px] transition-colors hover:bg-[var(--dw-hover)]"
                    style={{ borderColor: "var(--dw-line)", color: "var(--dw-dim)" }}
                  >
                    Настройки фильтров…
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => setManageOpen(true)}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-colors"
              style={{ background: "var(--dw-input)", color: "var(--dw-dim)" }}
              title="Управление каналами: отключить, переподключить"
            >
              <Users size={13} /> каналы
            </button>
            <button
              onClick={p.onAddChannel}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-bold transition-all hover:brightness-110"
              style={{ background: "var(--dw-accent)", color: "var(--dw-accent-ink)" }}
              title="Добавить канал"
            >
              <Plus size={13} /> канал
            </button>
          </header>
        )}

        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <ShellFeed
              feed={p.feed}
              channels={p.channels}
              botAuth={p.botAuth}
              maxFeed={p.maxFeed}
              hideDeleted={p.hideDeleted}
              mentionHL={p.mentionHL}
              layout="studio"
              view={p.chatView}
              onClear={p.onClearFeed}
              onChatMode={p.onChatMode}
              onModerate={p.onModerate}
              onSend={p.onSend}
              emptyHint="сообщений пока нет — подключите канал"
            />
          </div>

          {!p.focusMode && (
            <aside
              className="hidden w-[252px] shrink-0 flex-col gap-2 border-l p-2.5 xl:flex"
              style={{ borderColor: "var(--dw-line)", background: "var(--dw-panel)" }}
            >
              <div className="rounded-xl p-2.5" style={{ background: "var(--dw-panel2)" }}>
                <div className="flex items-center gap-1.5">
                  <Timer size={13} style={{ color: "var(--dw-accent)" }} />
                  <span
                    className="text-[10.5px] font-bold tracking-[0.1em] uppercase"
                    style={{ color: "var(--dw-dim)" }}
                  >
                    Эфир
                  </span>
                  <span
                    className="ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold"
                    style={{
                      background: live ? "rgba(74,222,128,0.14)" : "var(--dw-input)",
                      color: live ? "#4ade80" : "var(--dw-dim)",
                    }}
                  >
                    {live ? "LIVE" : "офлайн"}
                  </span>
                </div>
                <p className="mt-1.5 text-[20px] leading-none font-bold tabular-nums">
                  {p.viewers.toLocaleString("ru-RU")}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {[
                    ["Сообщений", p.messages.toLocaleString("ru-RU")],
                    ["Донаты", `${p.donateTotal.toLocaleString("ru-RU")} ${p.donateCurrency}`],
                    ["Подписки", `+${p.subs}`],
                    ["Награды", String(p.rewards.length)],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg px-2 py-1.5" style={{ background: "var(--dw-input)" }}>
                      <p className="text-[9.5px]" style={{ color: "var(--dw-dim)" }}>
                        {k}
                      </p>
                      <p className="truncate text-[12px] font-bold tabular-nums">{v}</p>
                    </div>
                  ))}
                </div>
                <SparkBars values={p.viewersHistory} />
              </div>

              <div
                className="min-h-0 flex-1 overflow-y-auto rounded-xl p-2.5"
                style={{ background: "var(--dw-panel2)" }}
              >
                <div className="flex items-center gap-1.5">
                  <Coins size={13} style={{ color: "#fbbf24" }} />
                  <span
                    className="text-[10.5px] font-bold tracking-[0.1em] uppercase"
                    style={{ color: "var(--dw-dim)" }}
                  >
                    Награды
                  </span>
                  <button
                    onClick={() => p.onOpenSettings("rewards")}
                    className="ml-auto cursor-pointer rounded p-0.5 hover:bg-[var(--dw-hover)]"
                    title="Награды и звуки"
                  >
                    <Plus size={12} style={{ color: "var(--dw-dim)" }} />
                  </button>
                </div>
                <div className="mt-1.5 flex flex-col gap-1">
                  {p.rewards.length === 0 && (
                    <p className="text-[11px]" style={{ color: "var(--dw-dim)" }}>
                      пока нет наград
                    </p>
                  )}
                  {p.rewards.slice(0, 8).map((r) => (
                    <div key={`${r.platform}-${r.title}`} className="flex items-center gap-1.5 text-[11.5px]">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: platformMeta(r.platform).color }}
                      />
                      <span className="min-w-0 flex-1 truncate">{r.title}</span>
                      <span className="tabular-nums" style={{ color: "var(--dw-dim)" }}>
                        {r.cost ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl p-2.5" style={{ background: "var(--dw-panel2)" }}>
                <div className="flex items-center gap-1.5">
                  <Zap size={13} style={{ color: "var(--dw-accent)" }} />
                  <span
                    className="text-[10.5px] font-bold tracking-[0.1em] uppercase"
                    style={{ color: "var(--dw-dim)" }}
                  >
                    Быстрые действия
                  </span>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <QuickAction
                    icon={<Shield size={12} />}
                    label="Фильтры"
                    onClick={() => p.onOpenSettings("filters")}
                  />
                  <QuickAction
                    icon={<Mic2 size={12} />}
                    label="Озвучка"
                    onClick={() => p.onOpenSettings("voice")}
                  />
                  <QuickAction icon={<Trash2 size={12} />} label="Очистить" onClick={p.onClearFeed} />
                  <QuickAction
                    icon={p.paused ? <Play size={12} /> : <Pause size={12} />}
                    label={p.paused ? "Продолжить" : "Пауза"}
                    onClick={p.onPause}
                  />
                </div>
              </div>

              <button
                onClick={p.onToggleTts}
                className="flex cursor-pointer items-center gap-1.5 rounded-xl px-2 py-1.5 text-[11px] transition-colors hover:brightness-110"
                style={{ background: "var(--dw-panel2)" }}
              >
                <AudioLines size={13} style={{ color: p.ttsOn ? "var(--dw-accent)" : "var(--dw-dim)" }} />
                Озвучка {p.ttsOn ? "вкл." : "выкл."}
                <kbd
                  className="ml-auto rounded px-1 py-0.5 text-[9.5px]"
                  style={{ background: "var(--dw-input)" }}
                >
                  F9
                </kbd>
              </button>
            </aside>
          )}
        </div>
      </div>

      <ChannelsDialog open={manageOpen} onClose={() => setManageOpen(false)}>
        {p.channelsPanel}
      </ChannelsDialog>
    </div>
  );
}

const STUDIO_NAV: { name: string; icon: ReactNode; tab: SettingsTabId }[] = [
  { name: "Фильтры и модерация", icon: <Shield size={18} />, tab: "filters" },
  { name: "Награды и звуки", icon: <Coins size={18} />, tab: "rewards" },
  { name: "Озвучка", icon: <Mic2 size={18} />, tab: "voice" },
  { name: "Вид и оформление", icon: <Palette size={18} />, tab: "view" },
];

function QuickAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex cursor-pointer items-center gap-1 rounded-lg px-1.5 py-1.5 text-[10.5px] font-medium transition-colors hover:brightness-110"
      style={{ background: "var(--dw-input)" }}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function SparkBars({ values }: { values: number[] }) {
  const list = values.length > 0 ? values.slice(-20) : [0];
  const max = Math.max(1, ...list);
  return (
    <div className="mt-2 flex h-8 items-end gap-[2px]">
      {list.map((v, i) => (
        <span
          key={i}
          className="flex-1 rounded-sm"
          style={{
            height: `${Math.max(6, (v / max) * 100)}%`,
            background:
              i === list.length - 1
                ? "var(--dw-accent)"
                : "color-mix(in srgb, var(--dw-accent) 30%, transparent)",
          }}
        />
      ))}
    </div>
  );
}

/* ============================== «macOS» ==============================
   Референс — src-mac: окно macOS со светофорами, вибрантные панели,
   сгруппированные разделы слева, Spotlight по Ctrl/Cmd+K и сводка эфира
   справа. Внутри — настоящие блоки приложения: лента и строка отправки,
   окно каналов, вкладки настроек — всё работает, как и в других видах. */

interface MacSection {
  id: string;
  name: string;
  hint: string;
  icon: LucideIcon;
  tint: string;
  group: string;
  /** текущий раздел: кнопка подсвечена, перехода нет */
  current?: boolean;
  /** открыть окно каналов */
  dialog?: boolean;
  /** открыть вкладку настроек */
  tab?: SettingsTabId;
}

const MAC_SECTIONS: MacSection[] = [
  {
    id: "chat",
    name: "Чат",
    hint: "Единая лента всех площадок",
    icon: MessagesSquare,
    tint: "#0A84FF",
    group: "Основное",
    current: true,
  },
  {
    id: "channels",
    name: "Каналы",
    hint: "Подключённые стримы и статусы",
    icon: Radio,
    tint: "#BF5AF2",
    group: "Основное",
    dialog: true,
  },
  {
    id: "auth",
    name: "Авторизация",
    hint: "Вход в аккаунты площадок и чат-бота",
    icon: KeyRound,
    tint: "#5AC8FA",
    group: "Основное",
    tab: "chatbot",
  },
  {
    id: "bot",
    name: "Чат-бот",
    hint: "Автоответы, режимы чата, модерация",
    icon: Bot,
    tint: "#FF9F0A",
    group: "Основное",
    tab: "chatbot",
  },
  {
    id: "donations",
    name: "Донаты",
    hint: "DonationAlerts · DonatePay · MemeAlerts",
    icon: HandCoins,
    tint: "#FFD60A",
    group: "Основное",
    tab: "donations",
  },
  {
    id: "voice",
    name: "Озвучка",
    hint: "Edge TTS, голос и громкость",
    icon: AudioLines,
    tint: "#30D158",
    group: "Звук",
    tab: "voice",
  },
  {
    id: "sounds",
    name: "Звуки наград",
    hint: "Награды за баллы канала",
    icon: Disc3,
    tint: "#FF453A",
    group: "Звук",
    tab: "rewards",
  },
  {
    id: "overlay",
    name: "Оверлей и OBS",
    hint: "Окно поверх игры, виджет чата",
    icon: PictureInPicture2,
    tint: "#64D2FF",
    group: "Эфир",
    tab: "overlay",
  },
  {
    id: "appearance",
    name: "Оформление",
    hint: "Вид окна и оформление ленты",
    icon: Paintbrush,
    tint: "#FF6482",
    group: "Приложение",
    tab: "view",
  },
  {
    id: "settings",
    name: "Настройки",
    hint: "Приложение, горячие клавиши, диагностика",
    icon: Settings,
    tint: "#98989D",
    group: "Приложение",
    tab: "system",
  },
];

const MAC_GROUPS: { title: string; items: MacSection[] }[] = ["Основное", "Звук", "Эфир", "Приложение"].map(
  (title) => ({ title, items: MAC_SECTIONS.filter((s) => s.group === title) }),
);

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function MacShell(p: ChatShellProps) {
  const [manageOpen, setManageOpen] = useState(false);
  const [showStats, setShowStats] = useState(true);
  const [spotlight, setSpotlight] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const live = p.onlineCount > 0;
  const liveLabel = `${p.onlineCount} ${pluralRu(p.onlineCount, "площадка", "площадки", "площадок")}`;

  const pick = (s: MacSection) => {
    if (s.current) return;
    if (s.dialog) {
      setManageOpen(true);
      return;
    }
    if (s.tab) p.onOpenSettings(s.tab);
  };

  /* Spotlight: Ctrl/Cmd+K открывает быстрый переход, Esc закрывает. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSpotlight((s) => !s);
      }
      if (e.key === "Escape") setSpotlight(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="relative flex min-h-0 flex-1"
      style={{ background: "linear-gradient(165deg, #1D1D21 0%, #171719 45%, #131316 100%)" }}
    >
      {!p.focusMode && (
        <aside className="flex w-[224px] shrink-0 flex-col border-r border-white/[0.06] bg-white/[0.045]">
          <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 pt-2 pb-3" aria-label="Разделы">
            {MAC_GROUPS.map((g) => (
              <div key={g.title} className="mb-3">
                <div className="px-2 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/35">
                  {g.title}
                </div>
                <div className="flex flex-col gap-[3px]">
                  {g.items.map((item) => {
                    const active = !!item.current;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => pick(item)}
                        aria-current={active ? "page" : undefined}
                        className={`relative flex h-[34px] w-full cursor-pointer items-center gap-2 rounded-[8px] px-2 text-left text-[13px] transition-colors ${
                          active ? "text-white" : "text-white/65 hover:bg-white/[0.06] hover:text-white/90"
                        }`}
                      >
                        {active && (
                          <span className="mac-pill pointer-events-none absolute inset-0 rounded-[8px] bg-white/[0.12] shadow-[0_1px_2px_rgba(0,0,0,0.35)] ring-1 ring-white/[0.06]" />
                        )}
                        <span
                          className="relative grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[6px] text-white shadow-sm"
                          style={{ background: `linear-gradient(160deg, ${item.tint}, ${item.tint}CC)` }}
                        >
                          <Icon size={13} strokeWidth={2} />
                        </span>
                        <span className="relative min-w-0 flex-1 truncate font-medium">{item.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="shrink-0 border-t border-white/[0.06] p-3">
            <div className="flex items-center gap-2.5 rounded-[10px] bg-white/[0.05] p-2.5 ring-1 ring-white/[0.06]">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#5E5CE6] to-[#BF5AF2] text-[13px] font-bold text-white shadow">
                Y
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[12.5px] font-semibold text-white/90">yawaside</div>
                <div
                  className={`flex items-center gap-1 text-[10.5px] ${
                    live ? "text-[#30D158]" : "text-white/35"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${live ? "bg-[#30D158]" : "bg-white/35"}`}
                  />
                  <span className="truncate">{live ? `В эфире · ${liveLabel}` : "Офлайн"}</span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Заголовок окна: светофоры, название по центру, звук */}
        <div
          className="drag-region relative flex h-[52px] shrink-0 items-center border-b border-white/[0.06] bg-white/[0.03] px-3"
          onDoubleClick={p.onHeaderDoubleClick}
        >
          <div className="flex w-[220px] shrink-0 items-center gap-2">
            {p.windowButtons}
            <button
              onClick={p.onToggleFocus}
              className="no-drag ml-1 cursor-pointer rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white/85"
              title={p.focusMode ? "Вернуть панели" : "Скрыть панели (только чат)"}
              aria-label={p.focusMode ? "Вернуть панели" : "Скрыть панели"}
              aria-pressed={p.focusMode}
            >
              <PanelLeft size={15} />
            </button>
          </div>

          <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
            <div className="text-[13px] font-semibold text-white/90">
              YawaChat{p.focusMode ? "" : " — Чат"}
            </div>
            <div
              className={`flex h-3.5 items-center justify-center gap-1 text-[10px] ${
                live ? "text-[#30D158]" : "text-white/35"
              }`}
            >
              {live && <CircleDot size={7} fill="currentColor" />}
              {live ? `В эфире · ${liveLabel}` : "Офлайн"}
            </div>
          </div>

          <div className="ml-auto flex w-[220px] shrink-0 items-center justify-end gap-1.5">
            <button
              onClick={() => setSpotlight((s) => !s)}
              title="Быстрый переход (Ctrl+K)"
              aria-label="Быстрый переход"
              className="no-drag flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white/[0.06] text-white/60 ring-1 ring-white/10 transition-colors hover:bg-white/[0.12] hover:text-white/90"
            >
              <Search size={13} />
            </button>
            <button
              onClick={p.onToggleTts}
              title={p.ttsOn ? "Выключить озвучку (F9)" : "Включить озвучку (F9)"}
              aria-pressed={p.ttsOn}
              className={`no-drag flex h-7 w-[104px] cursor-pointer items-center justify-center gap-1.5 rounded-full text-[11px] font-medium ring-1 transition-colors ${
                p.ttsOn
                  ? "bg-white/[0.06] text-white/70 ring-white/10 hover:bg-white/10"
                  : "bg-[#FF453A]/15 text-[#FF6B61] ring-[#FF453A]/30 hover:bg-[#FF453A]/20"
              }`}
            >
              {p.ttsOn ? <Volume2 size={12} /> : <VolumeX size={12} />}
              {p.ttsOn ? "Звук вкл" : "Звук выкл"}
            </button>
            {p.updateBadge}
            {p.audioPanel}
          </div>
        </div>

        {/* Поиск по ленте и переключатель сводки — узкая полоса, как в референсе */}
        <div className="flex min-h-[46px] shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 py-1">
          <div className="relative w-[260px] max-w-[46vw]">
            <Search
              size={12}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-white/35"
            />
            <input
              value={p.search}
              onChange={(e) => p.onSearch(e.target.value)}
              placeholder="Поиск по ленте"
              aria-label="Поиск по ленте"
              className="w-full rounded-lg bg-white/[0.07] py-1.5 pr-3 pl-8 text-[12px] text-white/90 outline-none ring-1 ring-white/[0.08] ring-inset transition-shadow placeholder-white/30 focus:ring-2 focus:ring-[#0A84FF]/70"
            />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="relative">
              <button
                onClick={() => setFilterOpen((v) => !v)}
                title="Фильтр ленты"
                aria-pressed={p.filter !== "all" || p.paused}
                className={`grid h-8 w-8 cursor-pointer place-items-center rounded-lg ring-1 transition-colors ${
                  p.filter !== "all" || p.paused
                    ? "bg-[#0A84FF]/20 text-[#409CFF] ring-[#0A84FF]/40"
                    : "bg-white/[0.06] text-white/55 ring-white/10 hover:bg-white/[0.12] hover:text-white/85"
                }`}
              >
                <Filter size={14} />
              </button>
              {filterOpen && (
                <div className="mac-pop absolute right-0 z-40 mt-1.5 w-[192px] overflow-hidden rounded-[12px] bg-[#26262B]/95 p-1 shadow-2xl ring-1 ring-white/[0.12] backdrop-blur-2xl">
                  {AIR_FILTERS.map((f) => {
                    const on = p.filter === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => {
                          p.onFilter(f.id);
                          setFilterOpen(false);
                        }}
                        className="flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12px] capitalize text-white/80 transition-colors hover:bg-white/[0.08]"
                      >
                        {on ? <Check size={12} className="text-[#409CFF]" /> : <span className="w-3" />}
                        {f.name}
                      </button>
                    );
                  })}
                  <div className="my-1 border-t border-white/[0.08]" />
                  <button
                    onClick={() => {
                      p.onPause();
                      setFilterOpen(false);
                    }}
                    className="flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12px] text-white/80 transition-colors hover:bg-white/[0.08]"
                  >
                    {p.paused ? <Play size={12} /> : <Pause size={12} />}
                    {p.paused ? "Продолжить ленту" : "Пауза ленты"}
                  </button>
                  <button
                    onClick={() => {
                      setFilterOpen(false);
                      p.onOpenSettings("filters");
                    }}
                    className="flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/70"
                  >
                    Настройки фильтров…
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => setShowStats((s) => !s)}
              title={showStats ? "Скрыть сводку эфира" : "Показать сводку эфира"}
              aria-pressed={showStats}
              className={`grid h-8 w-8 cursor-pointer place-items-center rounded-lg ring-1 transition-colors ${
                showStats
                  ? "bg-[#0A84FF] text-white ring-transparent"
                  : "bg-white/[0.06] text-white/55 ring-white/10 hover:bg-white/[0.12] hover:text-white/85"
              }`}
            >
              <ChartColumnBig size={15} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <ShellFeed
              feed={p.feed}
              channels={p.channels}
              botAuth={p.botAuth}
              maxFeed={p.maxFeed}
              hideDeleted={p.hideDeleted}
              mentionHL={p.mentionHL}
              layout="mac"
              view={p.chatView}
              onClear={p.onClearFeed}
              onChatMode={p.onChatMode}
              onModerate={p.onModerate}
              onSend={p.onSend}
              emptyHint="сообщений пока нет — подключите канал"
            />
          </div>

          {showStats && !p.focusMode && <MacStats p={p} live={live} />}
        </div>
      </div>

      <ChannelsDialog open={manageOpen} onClose={() => setManageOpen(false)}>
        {p.channelsPanel}
      </ChannelsDialog>

      <MacSpotlight
        open={spotlight}
        onClose={() => setSpotlight(false)}
        onPick={(s) => {
          setSpotlight(false);
          pick(s);
        }}
      />
    </div>
  );
}

/** Быстрый переход по разделам (Spotlight): Ctrl/Cmd+K, стрелки и Enter. */
function MacSpotlight({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (s: MacSection) => void;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MAC_SECTIONS;
    return MAC_SECTIONS.filter((s) => `${s.name} ${s.hint}`.toLowerCase().includes(q));
  }, [query]);

  if (!open) return null;

  return (
    <div
      className="mac-fade absolute inset-0 z-50 flex items-start justify-center bg-black/25 pt-[18vh]"
      onMouseDown={onClose}
      role="dialog"
      aria-label="Быстрый переход"
    >
      <div
        className="mac-pop w-[560px] max-w-[92vw] overflow-hidden rounded-[18px] bg-[#232326]/[0.92] shadow-[0_30px_90px_rgba(0,0,0,0.6)] ring-1 ring-white/[0.15] backdrop-blur-3xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4">
          <Search size={20} className="shrink-0 text-white/40" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, results.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              }
              if (e.key === "Enter" && results[cursor]) {
                onPick(results[cursor]);
              }
              if (e.key === "Escape") onClose();
            }}
            placeholder="Быстрый переход · разделы YawaChat"
            aria-label="Быстрый переход по разделам"
            className="w-full bg-transparent text-[19px] font-light text-white/95 outline-none placeholder-white/30"
          />
        </div>
        {results.length > 0 && (
          <div className="border-t border-white/[0.08] p-2">
            {results.map((r, i) => {
              const on = i === cursor;
              const Icon = r.icon;
              return (
                <button
                  key={r.id}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => onPick(r)}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2 text-left transition-colors ${
                    on ? "bg-[#0A84FF]" : "hover:bg-white/[0.06]"
                  }`}
                >
                  <Icon size={17} className={on ? "text-white" : "text-white/60"} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[14px] font-medium ${on ? "text-white" : "text-white/85"}`}>
                      {r.name}
                    </span>
                    <span
                      className={`block truncate text-[11.5px] ${on ? "text-white/75" : "text-white/40"}`}
                    >
                      {r.hint}
                    </span>
                  </span>
                  {on && <CornerDownLeft size={13} className="shrink-0 text-white/80" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** «Сводка эфира» в духе macOS: плитки показателей, активность, озвучка и награды. */
function MacStats({ p, live }: { p: ChatShellProps; live: boolean }) {
  const peak = Math.max(p.viewers, ...p.viewersHistory, 0);
  const bars = p.viewersHistory.length > 1 ? p.viewersHistory.slice(-14) : [0, 0];
  const max = Math.max(1, peak);

  return (
    <aside className="mac-panel hidden w-[236px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-white/[0.06] bg-white/[0.03] p-3 backdrop-blur-xl xl:flex">
      <div className="flex h-5 items-center justify-between px-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-white/35">Сводка эфира</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold ${
            live ? "bg-[#30D158]/15 text-[#30D158]" : "bg-white/[0.06] text-white/35"
          }`}
        >
          {live ? "LIVE" : "ОФЛАЙН"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[
          {
            icon: <Users size={13} />,
            tint: "#30D158",
            label: "Зрители",
            value: p.viewers.toLocaleString("ru-RU"),
          },
          {
            icon: <MessageSquare size={13} />,
            tint: "#0A84FF",
            label: "Сообщений",
            value: p.messages.toLocaleString("ru-RU"),
          },
          {
            icon: <Coins size={13} />,
            tint: "#FFD60A",
            label: "Донаты",
            value: `${p.donateTotal.toLocaleString("ru-RU")} ${p.donateCurrency}`,
          },
          {
            icon: <Radio size={13} />,
            tint: "#BF5AF2",
            label: "Площадки",
            value: String(p.onlineCount),
          },
        ].map((s) => (
          <div
            key={s.label}
            className="min-w-0 rounded-[12px] bg-white/[0.05] p-2.5 ring-1 ring-white/[0.06]"
          >
            <span style={{ color: s.tint }}>{s.icon}</span>
            <div className="mt-1.5 truncate text-[15px] font-bold tabular-nums text-white/90">{s.value}</div>
            <div className="truncate text-[10px] text-white/40">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-[12px] bg-white/[0.05] p-3 ring-1 ring-white/[0.06]">
        <div className="flex h-4 items-center justify-between">
          <span className="text-[11px] font-medium text-white/50">Активность чата</span>
          <span className="text-[10px] tabular-nums text-white/35">пик {peak.toLocaleString("ru-RU")}</span>
        </div>
        <div className="mt-2 flex h-12 items-end gap-[3px]">
          {bars.map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm bg-gradient-to-t from-[#0A84FF]/35 to-[#64D2FF] transition-all duration-500"
              style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
            />
          ))}
        </div>
      </div>

      <div className="rounded-[12px] bg-white/[0.05] p-3 ring-1 ring-white/[0.06]">
        <div className="flex items-center gap-2">
          <Mic2 size={13} className="text-[#30D158]" />
          <span className="text-[11.5px] font-semibold text-white/85">Озвучка</span>
          <button
            role="switch"
            aria-checked={p.ttsOn}
            aria-label="Озвучка"
            onClick={p.onToggleTts}
            className={`ml-auto flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors ${
              p.ttsOn ? "justify-end bg-[#30D158]" : "bg-white/[0.16]"
            }`}
          >
            <span className="h-[18px] w-[18px] rounded-full bg-white shadow" />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Volume2 size={13} className="shrink-0 text-white/40" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={p.ttsVolume}
            onChange={(e) => p.onTtsVolume(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer"
            /* --fill задаёт закрашенную часть дорожки, как в остальных видах */
            style={{ "--fill": `${Math.round(p.ttsVolume * 100)}%` } as React.CSSProperties}
            title="Громкость озвучки"
            aria-label="Громкость озвучки"
          />
          <span className="w-8 text-right text-[10.5px] tabular-nums text-white/45">
            {Math.round(p.ttsVolume * 100)}%
          </span>
        </div>
        {p.queueLength > 0 && <p className="mt-1 text-[10.5px] text-white/40">в очереди: {p.queueLength}</p>}
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-[12px] bg-white/[0.05] p-3 ring-1 ring-white/[0.06]">
        <div className="flex items-center gap-2">
          <Coins size={13} className="text-[#FFD60A]" />
          <span className="text-[11.5px] font-semibold text-white/85">Награды</span>
          <span className="ml-auto text-[10.5px] tabular-nums text-white/40">{p.rewards.length}</span>
        </div>
        <div className="mt-2 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
          {p.rewards.length === 0 && <p className="text-[11px] text-white/35">пока нет наград</p>}
          {p.rewards.slice(0, 8).map((r) => (
            <div key={`${r.platform}-${r.title}`} className="flex items-center gap-2 text-[11.5px]">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: platformMeta(r.platform).color }}
              />
              <span className="min-w-0 flex-1 truncate text-white/80">{r.title}</span>
              <span className="shrink-0 tabular-nums text-white/40">{r.cost ? `${r.cost} б.` : "—"}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => p.onOpenSettings("rewards")}
          className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1 rounded-[10px] bg-[#0A84FF] py-1.5 text-[11px] font-semibold text-white transition-all hover:brightness-110"
        >
          <Plus size={12} /> Новая награда
        </button>
      </div>
    </aside>
  );
}

/** Управление каналами: та же панель, что была в прежней раскладке. */
function ChannelsDialog({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fade-anim fixed inset-0 z-[75] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onMouseDown={onClose}
    >
      <div
        className="pop-anim flex max-h-[80vh] w-full max-w-[380px] flex-col overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: "var(--dw-panel)", borderColor: "var(--dw-line)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: "var(--dw-line)" }}>
          <span className="text-[13px] font-semibold">Каналы</span>
          <button
            onClick={onClose}
            className="ml-auto cursor-pointer rounded-lg p-1 hover:bg-[var(--dw-hover)]"
          >
            <X size={14} style={{ color: "var(--dw-dim)" }} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">{children}</div>
      </div>
    </div>
  );
}

function TtsChip({ p }: { p: ChatShellProps }) {
  return (
    <button
      onClick={p.onToggleTts}
      title={`Озвучка: ${p.ttsOn ? "включена" : "выключена"} (F9)`}
      className="no-drag flex h-[26px] cursor-pointer items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold transition-all"
      style={{
        background: p.ttsOn ? "color-mix(in srgb, var(--dw-accent) 18%, transparent)" : "var(--dw-input)",
        color: p.ttsOn ? "var(--dw-accent-2)" : "var(--dw-dim)",
      }}
    >
      <AudioLines size={13} />
      <span className="hidden lg:inline">
        {p.ttsOn ? (p.queueLength > 0 ? `TTS · ${p.queueLength}` : "TTS вкл") : "TTS выкл"}
      </span>
    </button>
  );
}

function FocusChip({ p }: { p: ChatShellProps }) {
  return (
    <button
      onClick={p.onToggleFocus}
      title={p.focusMode ? "Вернуть панели (Esc)" : "Режим «Только чат»"}
      aria-pressed={p.focusMode}
      className="no-drag flex h-[30px] cursor-pointer items-center gap-1.5 rounded-xl px-2 text-[11px] font-semibold transition-all"
      style={{
        background: p.focusMode
          ? "color-mix(in srgb, var(--dw-accent) 22%, transparent)"
          : "var(--dw-panel2)",
        color: p.focusMode ? "var(--dw-accent-2)" : "var(--dw-dim)",
      }}
    >
      <Focus size={13} />
      <span className="hidden lg:inline">{p.focusMode ? "Только чат" : "Панели"}</span>
    </button>
  );
}
