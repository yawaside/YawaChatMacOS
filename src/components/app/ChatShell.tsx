import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AudioLines,
  Bell,
  Check,
  ChevronDown,
  Coins,
  Copy,
  Filter,
  Focus,
  MessageSquare,
  Mic2,
  MonitorPlay,
  Palette,
  Pause,
  Play,
  Plus,
  Search,
  Settings,
  Shield,
  Timer,
  Trash2,
  Users,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import ShellFeed from "./ShellFeed";
import appIcon from "../../assets/app-icon.jpg";
import type { SettingsTabId } from "./SettingsShell";
import { PlatformIcon, platformMeta } from "../../lib/platforms";
import type { Channel, ChatMsg, ChatViewConfig, ModerationRequest, PlatformId } from "../../lib/types";

/**
 * Раскладки окна «Воздух» и «Студия» — по референсу из src/proto.
 *
 * Внутри настоящие блоки приложения: лента со строкой отправки, список
 * каналов, сводка эфира. Вид меняет только оправу окна; тема сообщений,
 * виджета OBS и оверлея выбирается в своих разделах и здесь не трогается.
 */
export type ShellKind = "air" | "studio";

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
  return p.kind === "air" ? <AirShell {...p} /> : <StudioShell {...p} />;
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
