import { useEffect, useRef, useState } from "react";
import {
  Bell,
  ChevronDown,
  Coins,
  Copy,
  Gamepad2,
  MessageCircle,
  Mic,
  MonitorPlay,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Volume2,
} from "lucide-react";
import { CHANNELS, PLATFORM_META, REWARDS, STATS } from "./demoData";
import type { DemoMessage } from "./demoData";

/**
 * Вариант A — «Воздух».
 *
 * Графитовая спокойная тема: много свободного места, крупная типографика,
 * один акцент и мягкие плашки вместо рамок. Сообщение — карточка с
 * аватаром и площадкой, события (донат, подписка, награда) — цветная полоса
 * слева, чтобы их было видно боковым зрением.
 */

const A = {
  bg: "#14161b",
  panel: "#1b1e25",
  soft: "#171a20",
  card: "#22262f",
  line: "rgba(255, 255, 255, 0.09)",
  text: "#f2f4f8",
  dim: "#9aa2b2",
  accent: "#7c9cff",
  accentSoft: "rgba(124, 156, 255, 0.14)",
  mint: "#4ade80",
  amber: "#fbbf24",
};

type Tab = "chat" | "rewards" | "voice" | "look";

const NAV: { id: Tab; name: string; icon: React.ReactNode }[] = [
  { id: "chat", name: "Чат", icon: <MessageCircle size={17} /> },
  { id: "rewards", name: "Награды", icon: <Coins size={17} /> },
  { id: "voice", name: "Озвучка", icon: <Mic size={17} /> },
  { id: "look", name: "Оформление", icon: <Sparkles size={17} /> },
];

export default function AirVariant({ messages }: { messages: DemoMessage[] }) {
  const [tab, setTab] = useState<Tab>("chat");
  const [voiceOn, setVoiceOn] = useState(true);
  const [paused, setPaused] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paused) feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, paused]);

  return (
    <div
      className="flex h-full w-full items-stretch"
      style={{ background: A.panel, color: A.text, ["--air-card" as string]: A.card }}
    >
      {/* ---------- левая колонка ---------- */}
      <aside
        className="flex w-[238px] shrink-0 flex-col gap-4 border-r px-3 py-4"
        style={{ borderColor: A.line, background: A.soft }}
      >
        <div className="flex items-center gap-2 px-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-xl text-[15px] font-black text-white"
            style={{ background: `linear-gradient(135deg, ${A.accent}, #9b8bff)` }}
          >
            Y
          </span>
          <div className="leading-tight">
            <p className="text-[13.5px] font-bold">YawaChat</p>
            <p className="text-[10.5px]" style={{ color: A.dim }}>
              чат всех стримов
            </p>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5">
          {NAV.map((item) => {
            const on = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-semibold transition-colors"
                style={{
                  background: on ? A.accentSoft : "transparent",
                  color: on ? A.accent : A.dim,
                }}
              >
                {item.icon}
                {item.name}
              </button>
            );
          })}
        </nav>

        <div className="mt-1 flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-2">
            <span className="text-[10.5px] font-bold tracking-[0.12em] uppercase" style={{ color: A.dim }}>
              Каналы
            </span>
            <button
              className="cursor-pointer rounded-lg p-1 transition-colors hover:bg-white/5"
              title="Добавить канал"
            >
              <Plus size={14} style={{ color: A.dim }} />
            </button>
          </div>

          {CHANNELS.map((c) => {
            const meta = PLATFORM_META[c.platform];
            return (
              <div
                key={`${c.platform}-${c.name}`}
                className="group flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/[0.04]"
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[9px] font-bold"
                  style={{ background: `${meta.color}1f`, color: meta.color }}
                >
                  {meta.short}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{c.name}</span>
                {c.live ? (
                  <span className="shrink-0 text-[10.5px] tabular-nums" style={{ color: A.dim }}>
                    {c.viewers.toLocaleString("ru-RU")}
                  </span>
                ) : (
                  <span className="shrink-0 text-[10px]" style={{ color: A.dim }}>
                    офлайн
                  </span>
                )}
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: c.live ? A.mint : "rgba(19,24,44,0.18)" }}
                />
              </div>
            );
          })}
        </div>

        <div
          className="mt-auto rounded-2xl p-3"
          style={{ background: A.panel, boxShadow: `0 1px 0 ${A.line}` }}
        >
          <div className="flex items-center gap-2">
            <MonitorPlay size={15} style={{ color: A.accent }} />
            <span className="text-[11.5px] font-semibold">OBS подключён</span>
          </div>
          <p className="mt-1 truncate text-[10.5px]" style={{ color: A.dim }}>
            localhost:8085/widget
          </p>
          <button
            className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-semibold"
            style={{ background: A.accentSoft, color: A.accent }}
          >
            <Copy size={12} /> Скопировать ссылку
          </button>
        </div>
      </aside>

      {/* ---------- центр ---------- */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 px-6 pt-5 pb-3">
          <div className="min-w-0">
            <h1 className="truncate text-[19px] leading-tight font-bold">
              {tab === "chat" && "Чат"}
              {tab === "rewards" && "Награды за баллы"}
              {tab === "voice" && "Озвучка"}
              {tab === "look" && "Оформление"}
            </h1>
            <p className="text-[11.5px]" style={{ color: A.dim }}>
              {tab === "chat" && "4 канала · 2 166 зрителей · эфир 1 ч 42 мин"}
              {tab === "rewards" && "создаются сразу в Twitch и VK Видео Live"}
              {tab === "voice" && "Светлана · ×1.00 · запасной голос Windows"}
              {tab === "look" && "темы, шрифты и скругление плашек"}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              className="flex cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-medium"
              style={{ background: A.soft, color: A.dim }}
            >
              <Search size={13} /> Поиск
            </button>
            <button
              className="flex cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-medium"
              style={{ background: A.soft, color: A.dim }}
            >
              <Bell size={13} />
            </button>
          </div>
        </header>

        {tab === "chat" && (
          <>
            <div className="flex items-center gap-1.5 px-6 pb-2">
              {["все", "важные", "донаты", "награды"].map((chip, i) => (
                <button
                  key={chip}
                  className="cursor-pointer rounded-full px-2.5 py-1 text-[11.5px] font-medium"
                  style={{
                    background: i === 0 ? A.accent : A.soft,
                    color: i === 0 ? "#fff" : A.dim,
                  }}
                >
                  {chip}
                </button>
              ))}
              <button
                onClick={() => setPaused((v) => !v)}
                className="ml-auto cursor-pointer rounded-full px-2.5 py-1 text-[11.5px] font-medium"
                style={{ background: A.soft, color: paused ? A.amber : A.dim }}
              >
                {paused ? "Продолжить" : "Пауза"}
              </button>
            </div>

            <div ref={feedRef} className="min-h-0 flex-1 overflow-y-auto px-6 pb-3">
              <div className="flex flex-col gap-1.5">
                {messages.map((m) => (
                  <MessageCard key={m.id} m={m} />
                ))}
              </div>
            </div>

            <div className="px-6 pb-5">
              <div
                className="flex items-center gap-2 rounded-2xl px-3 py-2"
                style={{ background: A.soft, boxShadow: `inset 0 0 0 1px ${A.line}` }}
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-[9px] font-bold"
                  style={{ background: `${A.accent}18`, color: A.accent }}
                >
                  TV
                </span>
                <input
                  placeholder="Написать в чат от имени nekto_san…"
                  className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
                  style={{ color: A.text }}
                />
                <button className="cursor-pointer rounded-lg p-1.5" style={{ color: A.dim }}>
                  <Gamepad2 size={15} />
                </button>
                <button
                  className="cursor-pointer rounded-xl px-3 py-1.5 text-[12px] font-semibold text-white"
                  style={{ background: A.accent }}
                >
                  Отправить
                </button>
              </div>
            </div>
          </>
        )}

        {tab === "rewards" && <RewardsMock />}
        {tab === "voice" && <VoiceMock on={voiceOn} setOn={setVoiceOn} />}
        {tab === "look" && <LookMock />}
      </main>

      {/* ---------- правая колонка ---------- */}
      <aside
        className="flex w-[292px] shrink-0 flex-col gap-2.5 border-l px-3 py-4"
        style={{ borderColor: A.line, background: A.soft }}
      >
        <div className="rounded-2xl p-3.5" style={{ background: A.panel, boxShadow: `0 1px 0 ${A.line}` }}>
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-bold tracking-[0.12em] uppercase" style={{ color: A.dim }}>
              Эфир
            </span>
            <span
              className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              style={{ background: "rgba(15,157,132,0.12)", color: A.mint }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: A.mint }} /> LIVE
            </span>
          </div>
          <p className="mt-2 text-[26px] leading-none font-bold tabular-nums">
            {STATS.viewers.toLocaleString("ru-RU")}
          </p>
          <p className="text-[11px]" style={{ color: A.dim }}>
            зрителей · пик {STATS.peak.toLocaleString("ru-RU")}
          </p>
          <Sparkline />
          <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-2.5" style={{ borderColor: A.line }}>
            {[
              ["Донаты", STATS.donations],
              ["Подписки", `+${STATS.subs}`],
              ["Награды", "27"],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-[10px]" style={{ color: A.dim }}>
                  {label}
                </p>
                <p className="text-[12.5px] font-bold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl p-3.5" style={{ background: A.panel, boxShadow: `0 1px 0 ${A.line}` }}>
          <div className="flex items-center gap-2">
            <Mic size={15} style={{ color: A.accent }} />
            <span className="text-[12.5px] font-semibold">Озвучка</span>
            <button
              onClick={() => setVoiceOn((v) => !v)}
              className="ml-auto flex h-5 w-9 cursor-pointer items-center rounded-full p-0.5 transition-colors"
              style={{
                background: voiceOn ? A.accent : "rgba(19,24,44,0.15)",
                justifyContent: voiceOn ? "flex-end" : "flex-start",
              }}
            >
              <span className="h-4 w-4 rounded-full bg-white shadow" />
            </button>
          </div>
          <button
            className="mt-2.5 flex w-full cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-[12px]"
            style={{ background: A.soft }}
          >
            Светлана · нейро <ChevronDown size={13} style={{ color: A.dim }} />
          </button>
          <div className="mt-2 flex items-center gap-2">
            <Volume2 size={14} style={{ color: A.dim }} />
            <div className="h-1.5 flex-1 rounded-full" style={{ background: "rgba(19,24,44,0.09)" }}>
              <div className="h-full w-[72%] rounded-full" style={{ background: A.accent }} />
            </div>
            <span className="text-[10.5px] tabular-nums" style={{ color: A.dim }}>
              72%
            </span>
          </div>
        </div>

        <div className="rounded-2xl p-3.5" style={{ background: A.panel, boxShadow: `0 1px 0 ${A.line}` }}>
          <div className="flex items-center gap-2">
            <Coins size={15} style={{ color: A.accent }} />
            <span className="text-[12.5px] font-semibold">Награды</span>
            <span className="ml-auto text-[10.5px]" style={{ color: A.dim }}>
              {REWARDS.length}
            </span>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            {REWARDS.map((r) => (
              <div key={r.title} className="flex items-center gap-2 rounded-lg px-1 py-1 text-[11.5px]">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: PLATFORM_META[r.platform].color }}
                />
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                <span className="shrink-0 tabular-nums" style={{ color: A.dim }}>
                  {r.cost} б.
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={() => setTab("rewards")}
            className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold"
            style={{ background: A.accentSoft, color: A.accent }}
          >
            <Plus size={12} /> Новая награда
          </button>
        </div>

        <div
          className="mt-auto flex items-center gap-2 rounded-2xl px-3 py-2"
          style={{ background: A.panel }}
        >
          <Settings2 size={15} style={{ color: A.dim }} />
          <span className="text-[11.5px]" style={{ color: A.dim }}>
            Настройки и горячие клавиши
          </span>
          <span
            className="ml-auto rounded-md px-1.5 py-0.5 text-[9.5px] font-bold"
            style={{ background: A.soft, color: A.dim }}
          >
            F9
          </span>
        </div>
      </aside>
    </div>
  );
}

function MessageCard({ m }: { m: DemoMessage }) {
  const meta = PLATFORM_META[m.platform];
  const event = m.kind && m.kind !== "chat";
  const accent =
    m.kind === "donate" ? A.amber : m.kind === "sub" ? A.mint : m.kind === "reward" ? A.accent : meta.color;

  return (
    <article
      className="flex gap-2.5 rounded-2xl px-2.5 py-2 transition-colors hover:bg-white/[0.03]"
      style={
        event
          ? { background: `${accent}0d`, boxShadow: `inset 3px 0 0 ${accent}` }
          : { background: "transparent" }
      }
    >
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
        style={{ background: `${m.color}22`, color: m.color }}
      >
        {m.author.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12.5px] font-bold" style={{ color: m.color }}>
            {m.author}
          </span>
          <span
            className="rounded-md px-1 py-[1px] text-[9px] font-bold tracking-wide uppercase"
            style={{ background: `${meta.color}18`, color: meta.color }}
          >
            {meta.short}
          </span>
          {m.amount ? (
            <span className="text-[11px] font-bold tabular-nums" style={{ color: accent }}>
              {m.amount}
            </span>
          ) : null}
          <span className="ml-auto text-[10px] tabular-nums" style={{ color: A.dim }}>
            {m.time}
          </span>
        </div>
        <p className="text-[13.5px] leading-[1.45] break-words">{m.text}</p>
      </div>
    </article>
  );
}

function Sparkline() {
  return (
    <svg viewBox="0 0 200 44" className="mt-2.5 h-11 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="air-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={A.accent} stopOpacity="0.28" />
          <stop offset="100%" stopColor={A.accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0 34 L18 30 L36 33 L54 24 L72 27 L90 18 L108 21 L126 14 L144 17 L162 9 L180 12 L200 6 L200 44 L0 44 Z"
        fill="url(#air-spark)"
      />
      <path
        d="M0 34 L18 30 L36 33 L54 24 L72 27 L90 18 L108 21 L126 14 L144 17 L162 9 L180 12 L200 6"
        fill="none"
        stroke={A.accent}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ---------- макеты внутренних экранов ---------- */

function RewardsMock() {
  const [title, setTitle] = useState("Сменить музыку");
  const [cost, setCost] = useState(500);
  const [platforms, setPlatforms] = useState<("twitch" | "vkplay")[]>(["twitch", "vkplay"]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.15fr_0.85fr]">
        <div
          className="rounded-2xl p-4"
          style={{ background: A.soft, boxShadow: `inset 0 0 0 1px ${A.line}` }}
        >
          <h2 className="text-[13.5px] font-bold">Новая награда</h2>
          <p className="mt-0.5 text-[11.5px]" style={{ color: A.dim }}>
            Создаётся в ваших каналах — переходить в кабинеты площадок не нужно.
          </p>

          <label className="mt-3 mb-1 block text-[11px] font-medium" style={{ color: A.dim }}>
            Название
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-[13px] outline-none"
            style={{ background: A.card, boxShadow: `inset 0 0 0 1px ${A.line}` }}
          />

          <div className="mt-3 grid grid-cols-[1fr_120px] gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium" style={{ color: A.dim }}>
                Площадки
              </label>
              <div className="flex gap-1.5">
                {(["twitch", "vkplay"] as const).map((p) => {
                  const on = platforms.includes(p);
                  const meta = PLATFORM_META[p];
                  return (
                    <button
                      key={p}
                      onClick={() =>
                        setPlatforms((prev) =>
                          prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
                        )
                      }
                      className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[12px] font-semibold"
                      style={{
                        background: on ? `${meta.color}18` : "#fff",
                        color: on ? meta.color : A.dim,
                        boxShadow: on ? `inset 0 0 0 1px ${meta.color}55` : `inset 0 0 0 1px ${A.line}`,
                      }}
                    >
                      {meta.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium" style={{ color: A.dim }}>
                Цена, баллов
              </label>
              <input
                type="number"
                value={cost}
                onChange={(e) => setCost(Number(e.target.value))}
                className="w-full rounded-xl px-3 py-2 text-[13px] tabular-nums outline-none"
                style={{ background: A.card, boxShadow: `inset 0 0 0 1px ${A.line}` }}
              />
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {[100, 500, 1000, 5000].map((v) => (
              <button
                key={v}
                onClick={() => setCost(v)}
                className="cursor-pointer rounded-lg px-2 py-0.5 text-[11px] font-medium tabular-nums"
                style={{
                  background: cost === v ? A.accent : A.card,
                  color: cost === v ? "#0b0d10" : A.dim,
                }}
              >
                {v.toLocaleString("ru-RU")}
              </button>
            ))}
          </div>

          <button
            className="mt-4 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12.5px] font-semibold text-white transition-all hover:brightness-110"
            style={{ background: A.accent }}
          >
            <Plus size={14} /> Создать награду
          </button>
          <p className="mt-2 text-center text-[10.5px]" style={{ color: A.dim }}>
            После создания награда сразу появится в списке и её можно озвучить
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {REWARDS.map((r) => (
            <div
              key={r.title}
              className="rounded-2xl p-3"
              style={{ background: A.card, boxShadow: `0 1px 0 ${A.line}` }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: PLATFORM_META[r.platform].color }}
                />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{r.title}</span>
                <span className="text-[11.5px] font-bold tabular-nums" style={{ color: A.accent }}>
                  {r.cost} б.
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10.5px]" style={{ color: A.dim }}>
                  звук
                </span>
                <div className="flex-1 rounded-lg bg-white/[0.05] px-2 py-1 text-[11px]">Бубен · награда</div>
                <button
                  className="cursor-pointer rounded-lg p-1.5"
                  style={{ background: A.accentSoft, color: A.accent }}
                >
                  <Volume2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VoiceMock({ on, setOn }: { on: boolean; setOn: (v: boolean) => void }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-2xl p-4" style={{ background: A.soft }}>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold">Озвучивать чат</span>
            <button
              onClick={() => setOn(!on)}
              className="ml-auto flex h-6 w-11 cursor-pointer items-center rounded-full p-0.5"
              style={{
                background: on ? A.accent : "rgba(19,24,44,0.15)",
                justifyContent: on ? "flex-end" : "flex-start",
              }}
            >
              <span className="h-5 w-5 rounded-full bg-white shadow" />
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {[
              ["Голос", "Светлана · нейро"],
              ["Скорость", "×1.00"],
              ["Громкость", "72%"],
              ["Запасной голос", "Windows, женский"],
            ].map(([k, v]) => (
              <div
                key={k}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-[12px]"
                style={{ background: A.card }}
              >
                <span style={{ color: A.dim }}>{k}</span>
                <span className="font-medium">{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl p-4" style={{ background: A.soft }}>
          <span className="text-[13px] font-bold">Что читать</span>
          <div className="mt-2 flex flex-col gap-1.5">
            {[
              ["Ник автора", true],
              ["Площадку", false],
              ["Только донаты", false],
              ["Смайлы словами", false],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-[12px]"
                style={{ background: A.card }}
              >
                <span>{label}</span>
                <span
                  className="h-4 w-7 rounded-full"
                  style={{ background: value ? A.accent : "rgba(255,255,255,0.16)", position: "relative" }}
                >
                  <span
                    className="absolute top-0.5 h-3 w-3 rounded-full bg-white"
                    style={{ left: value ? 14 : 2 }}
                  />
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl p-3" style={{ background: A.card }}>
            <p className="text-[11px]" style={{ color: A.dim }}>
              Проверка
            </p>
            <p className="text-[12.5px]">«nekto_san: привет всем, погнали»</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function LookMock() {
  const themes = [
    ["Кибер", "#00e5ff", "#070a12"],
    ["Ретровейв", "#ff2e97", "#2c0c4a"],
    ["Плашки", "#94a3b8", "#1b1f2e"],
    ["Комикс", "#ffd93d", "#fffdf5"],
    ["Скетчбук", "#1d4ed8", "#fdfcf7"],
    ["Охотник", "#c9a227", "#2a221b"],
  ];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {themes.map(([name, a, b]) => (
          <div
            key={name}
            className="cursor-pointer rounded-2xl p-2 transition-transform hover:-translate-y-0.5"
            style={{ background: A.card, boxShadow: `0 1px 0 ${A.line}` }}
          >
            <div className="flex h-16 items-end rounded-xl p-2" style={{ background: b }}>
              <span className="text-[11px] font-bold" style={{ color: a }}>
                Аа Bb
              </span>
            </div>
            <p className="mt-1.5 px-1 text-[12px] font-semibold">{name}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-2xl p-4" style={{ background: A.soft }}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="text-[12px] font-semibold">Скругление плашек</p>
            <div className="mt-2 h-1.5 rounded-full" style={{ background: "rgba(19,24,44,0.09)" }}>
              <div className="h-full w-1/2 rounded-full" style={{ background: A.accent }} />
            </div>
          </div>
          <div>
            <p className="text-[12px] font-semibold">Набор цветов</p>
            <div className="mt-2 flex gap-1.5">
              {["Закат", "Неон-лёд", "Полночь"].map((t, i) => (
                <span
                  key={t}
                  className="rounded-lg px-2 py-0.5 text-[11px]"
                  style={{ background: i === 0 ? A.accent : A.card, color: i === 0 ? "#0b0d10" : A.dim }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
