import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Coins,
  Command,
  Filter,
  Hash,
  MessageSquare,
  Mic2,
  MoreHorizontal,
  Paperclip,
  Palette,
  Search,
  Send,
  Settings,
  Shield,
  Smile,
  Sparkles,
  Square,
  Timer,
  Users,
  Volume2,
  Zap,
} from "lucide-react";
import { CHANNELS, PLATFORM_META, REWARDS } from "./demoData";
import type { DemoMessage } from "./demoData";

/**
 * Вариант B — «Студия».
 *
 * Тёмная плотная раскладка для работы: узкая иконочная панель слева,
 * лента по центру, справа — сводка эфира и модерация. Всё на 1–2 тона
 * темнее стандартного «Команда», границы почти не видны, акцент — лайм.
 */

const B = {
  bg: "#0b0d10",
  rail: "#0e1116",
  panel: "#12161c",
  panel2: "#171c24",
  line: "rgba(255,255,255,0.06)",
  text: "#e8ecf2",
  dim: "#7d8794",
  accent: "#b6f24a",
  accentText: "#0b0d10",
  cyan: "#4cc9f0",
  pink: "#f72585",
  amber: "#ffb703",
};

type Rail = "chat" | "mod" | "rewards" | "voice" | "theme";

export default function StudioVariant({ messages }: { messages: DemoMessage[] }) {
  const [rail, setRail] = useState<Rail>("chat");
  const [channels, setChannels] = useState<string[]>(["nekto_san", "kra1n_38", "wesna_life", "gg_wp_ez"]);
  const [draft, setDraft] = useState("");
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const toggleChannel = (name: string) =>
    setChannels((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));

  return (
    <div className="flex h-full w-full" style={{ background: B.bg, color: B.text }}>
      {/* иконочная панель */}
      <nav
        className="flex w-[56px] shrink-0 flex-col items-center gap-1.5 border-r py-3"
        style={{ background: B.rail, borderColor: B.line }}
      >
        <span
          className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl text-[15px] font-black"
          style={{ background: B.accent, color: B.accentText }}
        >
          Y
        </span>
        {(
          [
            ["chat", <MessageSquare size={18} key="c" />, "Чат"],
            ["mod", <Shield size={18} key="m" />, "Модерация"],
            ["rewards", <Coins size={18} key="r" />, "Награды"],
            ["voice", <Mic2 size={18} key="v" />, "Озвучка"],
            ["theme", <Palette size={18} key="t" />, "Темы"],
          ] as [Rail, React.ReactNode, string][]
        ).map(([id, icon, title]) => {
          const on = rail === id;
          return (
            <button
              key={id}
              title={title}
              onClick={() => setRail(id)}
              className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl transition-colors"
              style={{
                background: on ? "rgba(182,242,74,0.12)" : "transparent",
                color: on ? B.accent : "#76808f",
              }}
            >
              {on && (
                <span
                  className="absolute top-1.5 -left-[7px] h-6 w-[3px] rounded-full"
                  style={{ background: B.accent }}
                />
              )}
              {icon}
            </button>
          );
        })}
        <div className="mt-auto flex flex-col items-center gap-1.5">
          <button
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl"
            style={{ background: "rgba(255,255,255,0.04)", color: "#76808f" }}
          >
            <Settings size={18} />
          </button>
          <span
            className="h-7 w-7 rounded-full"
            style={{ background: "linear-gradient(135deg,#4cc9f0,#b6f24a)" }}
          />
        </div>
      </nav>

      {/* основной столбец */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex items-center gap-2 px-4 py-2.5"
          style={{ borderBottom: `1px solid ${B.line}` }}
        >
          <Hash size={15} style={{ color: B.accent }} />
          <span className="text-[13px] font-bold">все каналы</span>
          <span
            className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
            style={{ background: "rgba(182,242,74,0.12)", color: B.accent }}
          >
            {channels.length}
          </span>
          <div
            className="ml-2 flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <Search size={13} style={{ color: "#6c7684" }} />
            <input
              placeholder="Поиск по сообщениям, @ник, «цитата»"
              className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#5d6672]"
              style={{ color: B.text }}
            />
            <kbd className="rounded bg-black/30 px-1 text-[9.5px] text-[#7d8794]">Ctrl+F</kbd>
          </div>
          <button
            className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium"
            style={{ background: "rgba(255,255,255,0.04)", color: "#98a2b0" }}
          >
            <Filter size={12} /> Фильтры
          </button>
        </header>

        {rail === "chat" && (
          <>
            <div
              ref={feedRef}
              className="min-h-0 flex-1 overflow-y-auto px-3 py-2"
              style={{ background: B.bg }}
            >
              <p
                className="sticky top-0 z-10 mx-auto mb-2 w-fit rounded-full px-2 py-0.5 text-[10px] backdrop-blur"
                style={{ background: "rgba(18,22,28,0.86)", color: "#7d8794" }}
              >
                сегодня · 21:04
              </p>
              {messages.map((m) => (
                <Row key={m.id} m={m} />
              ))}
            </div>

            <div className="px-3 pb-3">
              <div
                className="rounded-xl p-1.5"
                style={{ background: B.panel, boxShadow: `inset 0 0 0 1px ${B.line}` }}
              >
                <div className="flex items-center gap-1.5 px-1 pb-1.5">
                  {CHANNELS.filter((c) => c.live).map((c) => (
                    <button
                      key={c.name}
                      onClick={() => toggleChannel(c.name)}
                      className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium"
                      style={{
                        background: channels.includes(c.name)
                          ? `${PLATFORM_META[c.platform].color}22`
                          : "transparent",
                        color: channels.includes(c.name) ? PLATFORM_META[c.platform].color : "#5d6672",
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: PLATFORM_META[c.platform].color }}
                      />
                      {c.name}
                    </button>
                  ))}
                  <span className="ml-auto text-[10px]" style={{ color: "#5d6672" }}>
                    Shift+Enter — новая строка
                  </span>
                </div>
                <div className="flex items-center gap-2 px-1">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Сообщение во все выбранные каналы"
                    className="min-w-0 flex-1 bg-transparent py-1.5 text-[13px] outline-none placeholder:text-[#5d6672]"
                    style={{ color: B.text }}
                  />
                  <button className="cursor-pointer p-1" style={{ color: "#76808f" }} title="Смайлы">
                    <Smile size={16} />
                  </button>
                  <button className="cursor-pointer p-1" style={{ color: "#76808f" }} title="Вложение">
                    <Paperclip size={16} />
                  </button>
                  <button
                    className="flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold"
                    style={{ background: B.accent, color: B.accentText }}
                  >
                    <Send size={12} /> Отправить
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {rail === "mod" && <ModMock />}
        {rail === "rewards" && <RewardsMock />}
        {rail === "voice" && <VoiceMock />}
        {rail === "theme" && <ThemeMock />}
      </main>

      {/* правая колонка */}
      <aside
        className="hidden w-[268px] shrink-0 flex-col gap-2 border-l p-2.5 xl:flex"
        style={{ background: B.rail, borderColor: B.line }}
      >
        <div className="rounded-xl p-2.5" style={{ background: B.panel }}>
          <div className="flex items-center gap-1.5">
            <Activity size={13} style={{ color: B.accent }} />
            <span className="text-[10.5px] font-bold tracking-[0.1em] uppercase" style={{ color: "#8b95a3" }}>
              Эфир
            </span>
            <span
              className="ml-auto rounded px-1 py-0.5 text-[9px] font-bold"
              style={{ background: "rgba(247,37,133,0.16)", color: B.pink }}
            >
              1:42:08
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {[
              ["Зрители", "2 166"],
              ["Сообщений", "18 402"],
              ["Донаты", "4 250 ₽"],
              ["Подписки", "+18"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg px-2 py-1.5" style={{ background: B.panel2 }}>
                <p className="text-[9.5px]" style={{ color: "#7d8794" }}>
                  {k}
                </p>
                <p className="text-[13px] font-bold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-end gap-[2px]">
            {[18, 26, 22, 34, 30, 40, 36, 48, 44, 52, 46, 58, 62, 54, 66, 70, 62, 76, 72, 84].map((h, i) => (
              <span
                key={i}
                className="flex-1 rounded-sm"
                style={{
                  height: h * 0.42,
                  background: i > 16 ? B.accent : "rgba(182,242,74,0.32)",
                }}
              />
            ))}
          </div>
        </div>

        <div className="rounded-xl p-2.5" style={{ background: B.panel }}>
          <div className="flex items-center gap-1.5">
            <Users size={13} style={{ color: B.cyan }} />
            <span className="text-[10.5px] font-bold tracking-[0.1em] uppercase" style={{ color: "#8b95a3" }}>
              Каналы
            </span>
            <span className="ml-auto text-[10px]" style={{ color: "#6c7684" }}>
              {channels.length} вкл.
            </span>
          </div>
          <div className="mt-1.5 flex flex-col">
            {CHANNELS.map((c) => {
              const meta = PLATFORM_META[c.platform];
              const on = channels.includes(c.name);
              return (
                <button
                  key={`${c.platform}-${c.name}`}
                  onClick={() => toggleChannel(c.name)}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-white/[0.03]"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: c.live ? meta.color : "#3a4250" }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[11.5px]" style={{ opacity: on ? 1 : 0.4 }}>
                    {c.name}
                  </span>
                  <span className="text-[10px] tabular-nums" style={{ color: "#6c7684" }}>
                    {c.live ? c.viewers.toLocaleString("ru-RU") : "—"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl p-2.5" style={{ background: B.panel }}>
          <div className="flex items-center gap-1.5">
            <Zap size={13} style={{ color: B.amber }} />
            <span className="text-[10.5px] font-bold tracking-[0.1em] uppercase" style={{ color: "#8b95a3" }}>
              Быстрые действия
            </span>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {[
              ["Таймаут 10 мин", <Timer key="t" size={12} />],
              ["Скрыть спам", <Shield key="s" size={12} />],
              ["Пинг-бот", <Command key="c" size={12} />],
              ["Стоп-слово", <Square key="q" size={12} />],
            ].map(([label, icon]) => (
              <button
                key={String(label)}
                className="flex cursor-pointer items-center gap-1 rounded-lg px-1.5 py-1.5 text-[10.5px] font-medium"
                style={{ background: B.panel2, color: "#a9b3c0" }}
              >
                {icon}
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div
          className="mt-auto flex items-center gap-1.5 rounded-xl px-2 py-1.5"
          style={{ background: B.panel }}
        >
          <Volume2 size={13} style={{ color: B.accent }} />
          <span className="text-[11px]" style={{ color: "#a9b3c0" }}>
            Озвучка вкл.
          </span>
          <span className="ml-auto rounded bg-black/30 px-1 py-0.5 text-[9.5px]" style={{ color: "#7d8794" }}>
            Alt+V
          </span>
        </div>
      </aside>
    </div>
  );
}

function Row({ m }: { m: DemoMessage }) {
  const meta = PLATFORM_META[m.platform];
  const event = m.kind && m.kind !== "chat";
  const accent =
    m.kind === "donate" ? B.amber : m.kind === "sub" ? B.accent : m.kind === "reward" ? B.cyan : meta.color;

  return (
    <div
      className="group flex gap-2 rounded-md px-2 py-[5px] transition-colors hover:bg-white/[0.03]"
      style={event ? { background: `${accent}12`, boxShadow: `inset 2px 0 0 ${accent}` } : undefined}
    >
      <span
        className="w-[38px] shrink-0 pt-[1px] text-right text-[10px] tabular-nums"
        style={{ color: "#525b68" }}
      >
        {m.time}
      </span>
      <span
        className="mt-[3px] h-[13px] w-[13px] shrink-0 rounded-sm"
        style={{ background: meta.color, opacity: 0.85 }}
        title={meta.name}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-[1.42] break-words">
          <span className="font-bold" style={{ color: m.color }}>
            {m.author}
          </span>
          {m.kind === "sub" && (
            <span
              className="ml-1 rounded px-1 text-[9px] font-bold"
              style={{ background: `${B.accent}22`, color: B.accent }}
            >
              SUB
            </span>
          )}
          {m.kind === "donate" && (
            <span
              className="ml-1 rounded px-1 text-[9px] font-bold"
              style={{ background: `${B.amber}22`, color: B.amber }}
            >
              {m.amount}
            </span>
          )}
          {m.kind === "reward" && (
            <span
              className="ml-1 rounded px-1 text-[9px] font-bold"
              style={{ background: `${B.cyan}22`, color: B.cyan }}
            >
              {m.amount}
            </span>
          )}
          <span style={{ color: "#5d6672" }}>: </span>
          <span>{m.text}</span>
        </p>
      </div>
      <button
        className="mt-[2px] shrink-0 cursor-pointer self-start rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
        style={{ color: "#7d8794" }}
      >
        <MoreHorizontal size={14} />
      </button>
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-xl p-3"
      style={{ background: B.panel, boxShadow: `inset 0 0 0 1px ${B.line}` }}
    >
      <h2 className="text-[12.5px] font-bold">{title}</h2>
      {hint && (
        <p className="mt-0.5 text-[10.5px]" style={{ color: "#7d8794" }}>
          {hint}
        </p>
      )}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-medium" style={{ color: "#8b95a3" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  background: B.panel2,
  boxShadow: `inset 0 0 0 1px ${B.line}`,
  color: B.text,
};

function RewardsMock() {
  const [platforms, setPlatforms] = useState<string[]>(["twitch", "vkplay"]);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr]">
        <Card title="Новая награда" hint="Уходит сразу в выбранные площадки, баллы задаёте вы">
          <div className="flex flex-col gap-2">
            <Field label="Название · до 45 символов">
              <input
                className="w-full rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
                style={inputStyle}
                defaultValue="Сменить музыку"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Цена, баллов">
                <input
                  type="number"
                  className="w-full rounded-lg px-2.5 py-1.5 text-[12.5px] tabular-nums outline-none"
                  style={inputStyle}
                  defaultValue={500}
                />
              </Field>
              <Field label="Требовать сообщение">
                <div className="flex h-[30px] items-center gap-1.5">
                  <span
                    className="flex h-4 w-7 items-center rounded-full p-0.5"
                    style={{ background: B.accent, justifyContent: "flex-end" }}
                  >
                    <span className="h-3 w-3 rounded-full" style={{ background: B.accentText }} />
                  </span>
                  <span className="text-[11px]" style={{ color: "#8b95a3" }}>
                    да
                  </span>
                </div>
              </Field>
            </div>
            <Field label="Площадки">
              <div className="flex gap-1.5">
                {(["twitch", "vkplay", "youtube"] as const).map((p) => {
                  const meta = PLATFORM_META[p];
                  const on = platforms.includes(p);
                  const disabled = p === "youtube";
                  return (
                    <button
                      key={p}
                      disabled={disabled}
                      onClick={() =>
                        setPlatforms((prev) =>
                          prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
                        )
                      }
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11.5px] font-semibold"
                      style={{
                        background: on ? `${meta.color}1c` : B.panel2,
                        color: disabled ? "#4d5663" : on ? meta.color : "#8b95a3",
                        boxShadow: on ? `inset 0 0 0 1px ${meta.color}55` : `inset 0 0 0 1px ${B.line}`,
                        cursor: disabled ? "not-allowed" : "pointer",
                      }}
                    >
                      {meta.name}
                      {disabled && <span className="text-[9px]">скоро</span>}
                    </button>
                  );
                })}
              </div>
            </Field>
            <button
              className="mt-1 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold"
              style={{ background: B.accent, color: B.accentText }}
            >
              <Sparkles size={13} /> Создать награду
            </button>
          </div>
        </Card>

        <div className="flex flex-col gap-3">
          <Card title="Награды и звуки" hint="Клик по строке — выбрать звук">
            <div className="flex flex-col gap-1">
              {REWARDS.map((r) => (
                <div
                  key={r.title}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5"
                  style={{ background: B.panel2 }}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-sm"
                    style={{ background: PLATFORM_META[r.platform].color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px]">{r.title}</span>
                  <span
                    className="rounded px-1 text-[10px] font-bold tabular-nums"
                    style={{ background: "rgba(182,242,74,0.14)", color: B.accent }}
                  >
                    {r.cost}
                  </span>
                  <button className="cursor-pointer p-1" style={{ color: "#76808f" }}>
                    <Volume2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Нет звука">
            <div className="flex flex-wrap gap-1">
              {["Подписка Pro", "Реплай", "Гифка"].map((t) => (
                <span
                  key={t}
                  className="rounded-md px-1.5 py-0.5 text-[10.5px]"
                  style={{ background: B.panel2, color: "#8b95a3" }}
                >
                  {t}
                </span>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function VoiceMock() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Голос" hint="Светлана · нейро · запасной: Windows">
          <div className="flex flex-col gap-2">
            {[
              ["Скорость", 62],
              ["Тон", 48],
              ["Громкость", 74],
            ].map(([label, v]) => (
              <div key={String(label)}>
                <div className="flex items-center justify-between text-[10.5px]">
                  <span style={{ color: "#8b95a3" }}>{label}</span>
                  <span className="tabular-nums" style={{ color: B.accent }}>
                    {v}%
                  </span>
                </div>
                <div className="mt-1 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="h-full rounded-full" style={{ width: `${v}%`, background: B.accent }} />
                </div>
              </div>
            ))}
            <button
              className="mt-1 flex cursor-pointer items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11.5px] font-semibold"
              style={{ background: "rgba(182,242,74,0.12)", color: B.accent }}
            >
              <Volume2 size={13} /> Прослушать
            </button>
          </div>
        </Card>
        <Card title="Правила чтения" hint="Что попадает в озвучку">
          <div className="flex flex-col gap-1">
            {[
              ["Читать ник", true],
              ["Читать донаты", true],
              ["Читать награды", false],
              ["Пропускать команды «!»", true],
            ].map(([label, on]) => (
              <div
                key={String(label)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                style={{ background: B.panel2 }}
              >
                <span className="flex-1 text-[11.5px]">{label}</span>
                <span
                  className="flex h-4 w-7 items-center rounded-full p-0.5"
                  style={{
                    background: on ? B.accent : "rgba(255,255,255,0.12)",
                    justifyContent: on ? "flex-end" : "flex-start",
                  }}
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ background: on ? B.accentText : "#7d8794" }}
                  />
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ModMock() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Модерация" hint="Действует на все выбранные каналы">
          <div className="grid grid-cols-2 gap-1.5">
            {["Таймаут", "Бан", "Скрыть", "Разбан", "Очистить чат", "Режим подписчиков"].map((a) => (
              <button
                key={a}
                className="cursor-pointer rounded-lg px-2 py-1.5 text-[11px] font-medium"
                style={{ background: B.panel2, color: "#a9b3c0" }}
              >
                {a}
              </button>
            ))}
          </div>
        </Card>
        <Card title="Фильтры" hint="Слова, ссылки, капс">
          <div className="flex flex-wrap gap-1">
            {["капс", "ссылки", "спам-повторы", "стоп-слова (14)"].map((f) => (
              <span
                key={f}
                className="rounded-md px-1.5 py-0.5 text-[10.5px]"
                style={{ background: B.panel2, color: "#a9b3c0" }}
              >
                {f}
              </span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ThemeMock() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {[
          ["Кибер", "#00e5ff", "#070a12"],
          ["Графит", "#b6f24a", "#0b0d10"],
          ["Ретро", "#ff2e97", "#2c0c4a"],
          ["Полночь", "#7aa2ff", "#0d1220"],
        ].map(([n, a, b]) => (
          <div key={n} className="cursor-pointer rounded-lg p-1.5" style={{ background: B.panel }}>
            <div className="flex h-14 items-end rounded p-1.5" style={{ background: b }}>
              <span className="text-[10.5px] font-bold" style={{ color: a }}>
                Аа
              </span>
            </div>
            <p className="mt-1 text-[11px]">{n}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
