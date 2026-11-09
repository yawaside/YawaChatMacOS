"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus,
  Radio,
  AudioLines,
  Settings as SettingsIcon,
  MessagesSquare as MessagesSquareIcon,
  HandCoins,
  Volume2,
  Bell,
  BellRing,
  Coins,
  Sparkles,
  Mic,
  Gauge,
  Filter,
  PictureInPicture2,
  Keyboard,
  Palette,
  ShieldCheck,
  CloudDownload,
  Trash2,
  Bot,
  Reply,
  Timer,
  UserCheck,
  SmilePlus,
  Ban,
  Eye,
  Link2,
  Check,
  Copy,
  Paintbrush,
  Type,
  Wand2,
  Frame,
  RotateCcw,
  Send,
  LifeBuoy,
  FolderGit2,
  Play,
  FileAudio,
  Upload,
  Package,
  MonitorPlay,
  MessageSquareText,
  KeyRound,
  LogIn,
  Ruler,
  type LucideIcon,
} from "lucide-react";
import type { Appearance, Channel, ChatMessage, Density } from "@/lib/types";
import { DONATE_PLATFORMS, PlatformIcon, STREAM_PLATFORMS, platformMeta } from "@/lib/platforms";
import {
  STYLE_CATALOG,
  defaultTone,
  ensureStyleFont,
  stylePreset,
  tonePalette,
  type StylePreset,
  type SurfaceKind,
} from "@/lib/styles";
import { BUILTIN_SOUNDS, playBuiltin, playDataUrl } from "@/lib/audio";
import {
  MacButton,
  MacCheckbox,
  MacSlider,
  MacToggle,
  SegmentedControl,
  SettingsCard,
  SettingsRow,
} from "@/components/macos/controls";
import { MessageRow, type FeedFx } from "./feed";

function PanelHeader({ title, subtitle, icon: Icon, tint }: { title: string; subtitle: string; icon: LucideIcon; tint: string }) {
  return (
    <div className="flex h-[68px] shrink-0 items-center gap-3.5 border-b border-white/[0.06] px-6">
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] text-white shadow-[0_6px_16px_rgba(0,0,0,0.35),inset_0_1px_1px_rgba(255,255,255,0.3)]"
        style={{ background: `linear-gradient(160deg, ${tint}, ${tint}BB)` }}
      >
        <Icon size={19} strokeWidth={1.9} />
      </span>
      <div className="min-w-0">
        <h2 className="truncate text-[16px] font-bold text-white/95">{title}</h2>
        <p className="truncate text-[12px] text-white/45">{subtitle}</p>
      </div>
    </div>
  );
}

const selectCls =
  "rounded-lg bg-white/[0.07] px-2.5 py-1.5 text-[12px] text-white/85 outline-none ring-1 ring-white/[0.1] focus:ring-2 ring-accent [&>option]:bg-[#232325]";
const inputCls =
  "rounded-[10px] bg-white/[0.07] px-3 py-2 text-[12.5px] text-white/90 placeholder-white/30 outline-none ring-1 ring-white/[0.1] focus:ring-2 ring-accent";

/* ======================= Библиотека звуков (свои файлы) ======================= */

interface CustomSound {
  id: number;
  name: string;
  scope: "alert" | "reward";
  data: string;
}

function useSoundLibrary() {
  const [custom, setCustom] = useState<CustomSound[]>([]);

  const refresh = useCallback(() => {
    fetch("/api/sounds")
      .then((r) => r.json())
      .then((d) => setCustom(d.sounds ?? []))
      .catch(() => {});
  }, []);

  useEffect(refresh, [refresh]);

  const upload = useCallback(
    async (file: File, scope: "alert" | "reward") => {
      if (file.size > 950_000) return alert("Файл больше 950 КБ — выберите короче");
      const data = await new Promise<string>((resolve, reject) => {
        const rd = new FileReader();
        rd.onload = () => resolve(String(rd.result));
        rd.onerror = reject;
        rd.readAsDataURL(file);
      });
      const r = await fetch("/api/sounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 60), scope, data }),
      });
      if (r.ok) refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: number) => {
      setCustom((c) => c.filter((s) => s.id !== id));
      await fetch(`/api/sounds?id=${id}`, { method: "DELETE" }).catch(() => {});
    },
    [],
  );

  return { custom, upload, remove };
}

/** Значение: имя встроенного звука или file:<id> */
function playSoundValue(value: string, custom: CustomSound[], volume = 1) {
  if (value.startsWith("file:")) {
    const id = Number(value.slice(5));
    const s = custom.find((c) => c.id === id);
    if (s) playDataUrl(s.data, volume);
    return;
  }
  playBuiltin(value, volume);
}

function SoundSelect({
  value,
  onChange,
  custom,
  scope,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  custom: CustomSound[];
  scope: "alert" | "reward";
  className?: string;
}) {
  const mine = custom.filter((c) => c.scope === scope);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${selectCls} ${className}`}>
      <optgroup label="Встроенные">
        {BUILTIN_SOUNDS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </optgroup>
      {mine.length > 0 && (
        <optgroup label="Свои файлы">
          {mine.map((s) => (
            <option key={s.id} value={`file:${s.id}`}>
              {s.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

function SoundUploadZone({ scope, upload, custom, remove }: { scope: "alert" | "reward"; upload: (f: File, s: "alert" | "reward") => void; custom: CustomSound[]; remove: (id: number) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mine = custom.filter((c) => c.scope === scope);
  return (
    <div className="rounded-[14px] bg-white/[0.045] p-4 ring-1 ring-white/[0.06]">
      <div className="flex items-center gap-3">
        <FileAudio size={15} className="shrink-0 text-white/50" />
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold text-white/85">
            {scope === "reward" ? "Свои файлы для наград" : "Свой файл оповещения"}
          </div>
          <div className="text-[11px] text-white/40">
            {scope === "reward"
              ? "MP3/OGG/WAV до 950 КБ · в обычных уведомлениях не предлагаются"
              : "MP3/OGG/WAV до 950 КБ · появятся в списке звуков площадок"}
          </div>
        </div>
        <MacButton onClick={() => inputRef.current?.click()}>
          <span className="flex items-center gap-1.5">
            <Upload size={12} /> Загрузить
          </span>
        </MacButton>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f, scope);
            e.target.value = "";
          }}
        />
      </div>
      {mine.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {mine.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-[12px] text-white/70">
              <button
                onClick={() => playDataUrl(s.data)}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/[0.08] text-white/80 ring-1 ring-white/10 transition-colors hover:bg-accent hover:text-white"
                title="Прослушать"
              >
                <Play size={10} fill="currentColor" />
              </button>
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <button
                onClick={() => remove(s.id)}
                className="shrink-0 rounded p-1 text-white/30 transition-colors hover:bg-[#FF453A]/15 hover:text-[#FF6B61]"
                title="Удалить"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================== Каналы =========================== */

export function ChannelsPanel({
  channels,
  onToggle,
  onAdd,
}: {
  channels: Channel[];
  onToggle: (c: Channel) => void;
  onAdd: (platform: string, name: string) => void;
}) {
  const [platform, setPlatform] = useState("twitch");
  const [name, setName] = useState("");

  const submit = () => {
    if (!name.trim()) return;
    onAdd(platform, name.trim());
    setName("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader icon={Radio} tint="#BF5AF2" title="Каналы" subtitle="Подключённые площадки и статус подключения" />
      <div className="mac-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <SettingsCard>
          {channels.map((c) => {
            const meta = platformMeta(c.platform);
            return (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] ring-1 ring-white/[0.08]"
                  style={{ background: `${meta.color}1F` }}
                >
                  <PlatformIcon id={c.platform} size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-white/90">{c.name}</div>
                  <div className="mt-0.5 flex h-4 items-center gap-1.5 text-[11px] text-white/40">
                    <span className="truncate">{meta.name}</span>
                    {c.live ? (
                      <span className="flex w-32 shrink-0 items-center gap-1 font-medium text-[#30D158]">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#30D158]" />
                        <span className="tabular-nums">в эфире · {c.viewers} зрит.</span>
                      </span>
                    ) : (
                      <span className="w-32 shrink-0">не в эфире</span>
                    )}
                  </div>
                </div>
                <MacToggle small checked={c.enabled} onChange={() => onToggle(c)} />
              </div>
            );
          })}
        </SettingsCard>

        <div className="rounded-[14px] bg-white/[0.055] p-4 ring-1 ring-white/[0.07]">
          <div className="text-[12.5px] font-semibold text-white/80">Добавить канал</div>
          <div className="mt-3 flex gap-2">
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={selectCls}>
              {STREAM_PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={platformMeta(platform as Channel["platform"]).hint}
              className={`${inputCls} flex-1`}
            />
            <MacButton primary onClick={submit}>
              <span className="flex items-center gap-1">
                <Plus size={13} /> Добавить
              </span>
            </MacButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================== Авторизация =========================== */

interface AuthEntry {
  id: string;
  service: string;
  tint: string;
  icon: "twitch" | "vkplay" | "tiktok" | "donationalerts" | "donatepay" | "memealerts";
  desc: string;
  perks: string[];
  needsKey?: string;
  account?: string;
}

const AUTH_SERVICES: AuthEntry[] = [
  {
    id: "twitch",
    service: "Twitch — чат-бот",
    tint: "#9146FF",
    icon: "twitch",
    desc: "Вход через OAuth: бот читает и отвечает в чат, подтягивает награды за баллы канала",
    perks: ["Чтение и отправка сообщений", "Награды за баллы канала", "Режимы чата и модерация"],
    account: "yawabot",
  },
  {
    id: "vkplay",
    service: "VK Видео Live",
    tint: "#0077FF",
    icon: "vkplay",
    desc: "Чтение публичного чата работает без входа. Вход включает бота, награды и режимы чата",
    perks: ["Ответы бота в чат VK", "Награды за баллы канала", "Медленный режим и «только смайлы»"],
    account: "yawaside",
  },
  {
    id: "tiktok",
    service: "TikTok Live",
    tint: "#FE2C55",
    icon: "tiktok",
    desc: "Вход открывает счётчики зрителей и лайков для оверлея и события входа зрителей",
    perks: ["Счётчик зрителей", "Счётчик лайков", "События входа"],
    account: "@yawa.side",
  },
  {
    id: "donationalerts",
    service: "DonationAlerts",
    tint: "#F57D07",
    icon: "donationalerts",
    desc: "Токен из ссылки виджета алертов — донаты приходят в общую ленту",
    perks: ["Донаты в общей ленте", "Свой звук оповещения"],
    needsKey: "Токен виджета алертов",
  },
  {
    id: "donatepay",
    service: "DonatePay",
    tint: "#44AB4F",
    icon: "donatepay",
    desc: "API-ключ из раздела «API» кабинета DonatePay",
    perks: ["Донаты в общей ленте", "Свой звук оповещения"],
    needsKey: "API-ключ",
  },
  {
    id: "memealerts",
    service: "MemeAlerts",
    tint: "#A855F7",
    icon: "memealerts",
    desc: "Вход по аккаунту: мем-донаты с картинкой и звуком",
    perks: ["Мем-донаты в ленте", "Свой звук оповещения"],
    account: "yawaside",
  },
];

export function AuthPanel() {
  const [connected, setConnected] = useState<Record<string, boolean>>({ twitch: true });
  const [busy, setBusy] = useState<string | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});

  const toggle = (s: AuthEntry) => {
    if (connected[s.id]) {
      setConnected((c) => ({ ...c, [s.id]: false }));
      return;
    }
    setBusy(s.id);
    /* Имитация OAuth-окна площадки */
    setTimeout(() => {
      setConnected((c) => ({ ...c, [s.id]: true }));
      setBusy(null);
    }, 900);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader icon={KeyRound} tint="#5AC8FA" title="Авторизация" subtitle="Вход в аккаунты площадок: бот, награды, донаты" />
      <div className="mac-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
        {AUTH_SERVICES.map((s) => {
          const on = !!connected[s.id];
          const loading = busy === s.id;
          return (
            <div
              key={s.id}
              className={`rounded-[14px] p-4 ring-1 transition-colors ${
                on ? "bg-white/[0.07] ring-white/[0.14]" : "bg-white/[0.045] ring-white/[0.06]"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] ring-1 ring-white/[0.08]"
                  style={{ background: `${s.tint}22` }}
                >
                  <PlatformIcon id={s.icon as Channel["platform"]} size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-semibold text-white/90">{s.service}</span>
                    <span
                      className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
                        on ? "bg-[#30D158]/15 text-[#30D158] ring-[#30D158]/30" : "bg-white/[0.06] text-white/45 ring-white/10"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-[#30D158]" : "bg-white/35"}`} />
                      {on ? `вошли · ${s.account ?? keys[s.id]?.slice(0, 8) + "…"}` : "не подключено"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-white/45">{s.desc}</p>
                </div>
                <MacButton primary={!on} onClick={() => toggle(s)}>
                  {loading ? (
                    <span className="flex items-center gap-1.5">
                      <RotateCcw size={12} className="animate-spin" /> Окно входа…
                    </span>
                  ) : on ? (
                    "Выйти"
                  ) : s.needsKey ? (
                    "Подключить"
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <LogIn size={12} /> Войти
                    </span>
                  )}
                </MacButton>
              </div>
              {s.needsKey && !on && (
                <div className="mt-3 flex gap-2">
                  <input
                    type="password"
                    value={keys[s.id] ?? ""}
                    onChange={(e) => setKeys((k) => ({ ...k, [s.id]: e.target.value }))}
                    placeholder={s.needsKey}
                    className={`${inputCls} min-w-0 flex-1 font-mono`}
                  />
                </div>
              )}
              {on && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {s.perks.map((perk) => (
                    <span key={perk} className="flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-1 text-[10.5px] text-white/60 ring-1 ring-white/[0.08]">
                      <Check size={10} className="text-[#30D158]" /> {perk}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className="rounded-[14px] bg-[#0A84FF]/[0.08] p-4 text-[12px] leading-relaxed text-white/55 ring-1 ring-[#0A84FF]/25">
          После обновления приложения войдите в Twitch заново — создание наград требует свежего входа в чат-бот.
        </div>
      </div>
    </div>
  );
}

/* =========================== Чат-бот =========================== */

interface AutoAnswer {
  id: number;
  command: string;
  response: string;
  enabled: boolean;
}

const DEFAULT_ANSWERS: AutoAnswer[] = [
  { id: 1, command: "!discord", response: "Наш Discord: discord.gg/yawa", enabled: true },
  { id: 2, command: "!tg", response: "Телеграм-канал: t.me/yawaside", enabled: true },
  { id: 3, command: "!розыгрыш", response: "Розыгрыш каждую пятницу в 20:00 МСК", enabled: false },
];

export function ChatbotPanel() {
  const [answers, setAnswers] = useState<AutoAnswer[]>(DEFAULT_ANSWERS);
  const [cmd, setCmd] = useState("");
  const [resp, setResp] = useState("");
  const [slowMode, setSlowMode] = useState(false);
  const [slowSec, setSlowSec] = useState(10);
  const [subsOnly, setSubsOnly] = useState(false);
  const [followersOnly, setFollowersOnly] = useState(false);
  const [emoteOnly, setEmoteOnly] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader icon={Bot} tint="#FF9F0A" title="Чат-бот и модерация" subtitle="Автоответы, режимы чата и быстрые действия" />
      <div className="mac-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div>
          <div className="px-1 pb-2 text-[12px] font-semibold uppercase tracking-wide text-white/40">Автоответы на команды</div>
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {answers.map((a) => (
                <motion.div
                  key={a.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginTop: -8 }}
                  className="flex items-center gap-3 rounded-[12px] bg-white/[0.045] px-4 py-2.5 ring-1 ring-white/[0.06]"
                >
                  <code className="shrink-0 rounded-md bg-white/[0.08] px-2 py-0.5 text-[11.5px] font-semibold text-[#64D2FF] ring-1 ring-white/10">
                    {a.command}
                  </code>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/70">{a.response}</span>
                  <button
                    onClick={() => setAnswers((arr) => arr.filter((x) => x.id !== a.id))}
                    className="shrink-0 rounded-md p-1 text-white/30 transition-colors hover:bg-[#FF453A]/15 hover:text-[#FF6B61]"
                    title="Удалить"
                  >
                    <Trash2 size={13} />
                  </button>
                  <MacToggle
                    small
                    checked={a.enabled}
                    onChange={(v) => setAnswers((arr) => arr.map((x) => (x.id === a.id ? { ...x, enabled: v } : x)))}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <div className="mt-2.5 flex gap-2">
            <input value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="!команда" className={`${inputCls} w-32`} />
            <input value={resp} onChange={(e) => setResp(e.target.value)} placeholder="Текст ответа бота" className={`${inputCls} min-w-0 flex-1`} />
            <MacButton
              primary
              onClick={() => {
                if (!cmd.trim() || !resp.trim()) return;
                setAnswers((arr) => [...arr, { id: Date.now(), command: cmd.trim(), response: resp.trim(), enabled: true }]);
                setCmd("");
                setResp("");
              }}
            >
              <span className="flex items-center gap-1">
                <Plus size={13} /> Добавить
              </span>
            </MacButton>
          </div>
        </div>

        <SettingsCard>
          <div className="px-4 pb-1 pt-3.5 text-[12px] font-semibold uppercase tracking-wide text-white/40">
            Режимы чата Twitch и VK
          </div>
          <SettingsRow
            icon={<Timer size={13} />}
            title="Медленный режим"
            subtitle={`Сообщение раз в ${slowSec} сек`}
            control={
              <div className="flex w-40 shrink-0 items-center gap-2">
                {slowMode && <MacSlider value={slowSec} min={3} max={120} onChange={setSlowSec} />}
                <MacToggle small checked={slowMode} onChange={setSlowMode} />
              </div>
            }
          />
          <SettingsRow icon={<UserCheck size={13} />} title="Только подписчики" subtitle="Twitch: режим subscribers-only" control={<MacToggle small checked={subsOnly} onChange={setSubsOnly} />} />
          <SettingsRow icon={<UserCheck size={13} />} title="Только фолловеры" subtitle="Twitch: followers-only" control={<MacToggle small checked={followersOnly} onChange={setFollowersOnly} />} />
          <SettingsRow icon={<SmilePlus size={13} />} title="Только смайлы" subtitle="VK Видео Live: сообщения только из смайлов" control={<MacToggle small checked={emoteOnly} onChange={setEmoteOnly} />} />
        </SettingsCard>

        <SettingsCard>
          <div className="px-4 pb-1 pt-3.5 text-[12px] font-semibold uppercase tracking-wide text-white/40">
            Модерация из ленты
          </div>
          {[
            { icon: Ban, name: "Бан / таймаут на 10 минут", keys: ["Клик по нику", "Бан"] },
            { icon: Trash2, name: "Удалить сообщение", keys: ["Клик по нику", "Удалить"] },
            { icon: Reply, name: "Ответить как стример", keys: ["Клик по нику", "Ответить"] },
          ].map((h) => (
            <div key={h.name} className="flex items-center gap-3 px-4 py-3">
              <h.icon size={14} className="shrink-0 text-white/50" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white/85">{h.name}</span>
              <div className="flex shrink-0 gap-1">
                {h.keys.map((k) => (
                  <kbd key={k} className="rounded-[6px] bg-white/[0.08] px-1.5 py-0.5 text-[10.5px] font-semibold text-white/70 ring-1 ring-white/[0.12]">
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </SettingsCard>
      </div>
    </div>
  );
}

/* =========================== Донаты =========================== */

export function DonationsPanel({ messages }: { messages: ChatMessage[] }) {
  const lib = useSoundLibrary();
  const [sounds, setSounds] = useState<Record<string, string>>({
    donationalerts: "Монетки",
    donatepay: "Фанфары",
    memealerts: "Аркада",
  });
  const [vols, setVols] = useState<Record<string, number>>({ donationalerts: 80, donatepay: 80, memealerts: 80 });
  const [ttsDonations, setTtsDonations] = useState(true);
  const [saySender, setSaySender] = useState(true);
  const [minAmount, setMinAmount] = useState(100);
  const donations = messages.filter((m) => m.kind === "donation").slice(-6).reverse();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader icon={HandCoins} tint="#FFD60A" title="Донаты" subtitle="DonationAlerts, DonatePay и MemeAlerts в едином формате" />
      <div className="mac-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div className="grid grid-cols-3 gap-3">
          {DONATE_PLATFORMS.map((p) => (
            <div key={p.id} className="min-w-0 rounded-[14px] bg-white/[0.055] p-3.5 ring-1 ring-white/[0.07]">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px]" style={{ background: `${p.color}22` }}>
                  <PlatformIcon id={p.id} size={14} />
                </span>
                <span className="truncate text-[12px] font-semibold text-white/85">{p.name}</span>
              </div>
              <div className="mt-2.5 flex items-center gap-1 text-[10.5px] font-medium text-[#30D158]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#30D158]" /> Подключено
              </div>
            </div>
          ))}
        </div>

        <SettingsCard>
          <div className="px-4 pb-1 pt-3.5 text-[12px] font-semibold uppercase tracking-wide text-white/40">
            Звук оповещения по площадке
          </div>
          {DONATE_PLATFORMS.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-white/[0.08]">
                <Bell size={13} className="text-white/60" />
              </span>
              <span className="w-[104px] shrink-0 truncate text-[13px] font-medium text-white/85">{p.name}</span>
              <SoundSelect
                value={sounds[p.id]}
                onChange={(v) => setSounds((s) => ({ ...s, [p.id]: v }))}
                custom={lib.custom}
                scope="alert"
                className="w-32"
              />
              <button
                onClick={() => playSoundValue(sounds[p.id], lib.custom, vols[p.id] / 100)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/[0.08] text-white/80 ring-1 ring-white/10 transition-colors hover:bg-accent hover:text-white"
                title="Прослушать"
              >
                <Play size={11} fill="currentColor" />
              </button>
              <div className="w-20 shrink-0">
                <MacSlider value={vols[p.id]} onChange={(v) => setVols((s) => ({ ...s, [p.id]: v }))} />
              </div>
              <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-white/50">{vols[p.id]}%</span>
            </div>
          ))}
        </SettingsCard>

        <SoundUploadZone scope="alert" upload={lib.upload} custom={lib.custom} remove={lib.remove} />

        <SettingsCard>
          <div className="px-4 pb-1 pt-3.5 text-[12px] font-semibold uppercase tracking-wide text-white/40">
            Озвучка донатов — независимо от чата
          </div>
          <SettingsRow icon={<AudioLines size={13} />} title="Читать донаты вслух" subtitle="Работает, даже если озвучка чата выключена" control={<MacToggle small checked={ttsDonations} onChange={setTtsDonations} />} />
          <SettingsRow icon={<Mic size={13} />} title="Называть отправителя и сумму" subtitle="«Аноним отправил 300 рублей: …»" control={<MacToggle small checked={saySender} onChange={setSaySender} />} />
          <SettingsRow icon={<Coins size={13} />} title="Озвучивать начиная с суммы" subtitle={`${minAmount} ₽ и выше`} control={<div className="w-36 shrink-0"><MacSlider value={minAmount} max={500} step={10} onChange={setMinAmount} /></div>} />
        </SettingsCard>

        <div>
          <div className="px-1 pb-2 text-[12px] font-semibold uppercase tracking-wide text-white/40">Лента донатов</div>
          <div className="space-y-2">
            {donations.length === 0 && (
              <div className="rounded-[12px] bg-white/[0.045] p-4 text-center text-[12px] text-white/35 ring-1 ring-white/[0.06]">
                Донаты появятся здесь
              </div>
            )}
            {donations.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-[12px] bg-white/[0.045] px-3.5 py-2.5 ring-1 ring-white/[0.06]">
                <Coins size={15} className="shrink-0 text-[#FFD60A]" />
                <div className="min-w-0 flex-1">
                  <span className="text-[13px] font-semibold" style={{ color: d.color }}>
                    {d.author}
                  </span>
                  <span className="ml-2 text-[11px] text-white/40">{platformMeta(d.platform).name}</span>
                  <div className="truncate text-[11.5px] text-white/50">{d.text}</div>
                </div>
                <span className="w-20 shrink-0 text-right text-[14px] font-bold tabular-nums text-[#FFD60A]">
                  {d.amount?.toLocaleString("ru-RU")} ₽
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================== Озвучка =========================== */

const VOICES = ["Aria (RU, жен.)", "Dmitry (RU, муж.)", "Svetlana (RU, жен.)", "Jenny (EN, жен.)", "Guy (EN, муж.)"];

export function VoicePanel() {
  const [enabled, setEnabled] = useState(true);
  const [voice, setVoice] = useState(VOICES[0]);
  const [voiceKind, setVoiceKind] = useState<"edge" | "system">("edge");
  const [speed, setSpeed] = useState(55);
  const [volume, setVolume] = useState(70);
  const [localMute, setLocalMute] = useState(false);
  const [parts, setParts] = useState({ author: true, text: true, platform: false });
  const [skipLinks, setSkipLinks] = useState(true);
  const [maxLen, setMaxLen] = useState(200);
  const [capsLimit, setCapsLimit] = useState(60);
  const [perViewer, setPerViewer] = useState("");
  const [viewers, setViewers] = useState<Array<{ name: string; voice: string }>>([{ name: "luna.wav", voice: "Svetlana (RU, жен.)" }]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader icon={AudioLines} tint="#30D158" title="Озвучка" subtitle="Нейросетевые голоса Edge TTS и системные голоса" />
      <div className="mac-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <SettingsCard>
          <SettingsRow icon={<Volume2 size={13} />} title="Озвучивать сообщения" subtitle="Голос звучит в виджете OBS и на трансляции" control={<MacToggle checked={enabled} onChange={setEnabled} />} />
          <SettingsRow
            icon={<AudioLines size={13} />}
            title="Источник голосов"
            control={
              <SegmentedControl
                id="voice-src"
                value={voiceKind}
                onChange={setVoiceKind}
                options={[
                  { value: "edge", label: "Edge TTS" },
                  { value: "system", label: "Системные" },
                ]}
              />
            }
          />
          <SettingsRow
            icon={<Mic size={13} />}
            title="Голос по умолчанию"
            control={
              <select value={voice} onChange={(e) => setVoice(e.target.value)} className={selectCls}>
                {VOICES.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            }
          />
          <SettingsRow icon={<Eye size={13} />} title="Выкл. звук на этом ПК" subtitle="Голос будет слышен только в виджете OBS" control={<MacToggle checked={localMute} onChange={setLocalMute} />} />
        </SettingsCard>

        <SettingsCard>
          <div className="px-4 pb-1 pt-3.5 text-[12px] font-semibold uppercase tracking-wide text-white/40">Состав фразы</div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 px-4 py-3.5">
            <MacCheckbox checked={parts.author} onChange={(v) => setParts((p) => ({ ...p, author: v }))} label="Автор" />
            <MacCheckbox checked={parts.text} onChange={(v) => setParts((p) => ({ ...p, text: v }))} label="Текст сообщения" />
            <MacCheckbox checked={parts.platform} onChange={(v) => setParts((p) => ({ ...p, platform: v }))} label="Площадка" />
          </div>
          <SettingsRow icon={<Gauge size={13} />} title="Скорость речи" subtitle={`${Math.round(50 + speed)}% от нормальной`} control={<div className="w-36 shrink-0"><MacSlider value={speed} onChange={setSpeed} /></div>} />
          <SettingsRow icon={<Volume2 size={13} />} title="Громкость" subtitle={`${volume}%`} control={<div className="w-36 shrink-0"><MacSlider value={volume} onChange={setVolume} /></div>} />
        </SettingsCard>

        <SettingsCard>
          <div className="px-4 pb-1 pt-3.5 text-[12px] font-semibold uppercase tracking-wide text-white/40">Фильтры</div>
          <SettingsRow icon={<Filter size={13} />} title="Пропускать ссылки и команды" subtitle="Сообщения с http и ! командами не читаются" control={<MacToggle checked={skipLinks} onChange={setSkipLinks} />} />
          <SettingsRow icon={<Filter size={13} />} title="Ограничение длины" subtitle={`Не читать длиннее ${maxLen} символов`} control={<div className="w-36 shrink-0"><MacSlider value={maxLen} min={50} max={400} step={10} onChange={setMaxLen} /></div>} />
          <SettingsRow icon={<Filter size={13} />} title="Порог ЗАГЛАВНЫХ букв" subtitle={`Пропуск, если капса больше ${capsLimit}%`} control={<div className="w-36 shrink-0"><MacSlider value={capsLimit} min={20} max={100} step={5} onChange={setCapsLimit} /></div>} />
          <SettingsRow icon={<ShieldCheck size={13} />} title="Чёрный и белый списки авторов" subtitle="3 зрителя исключены из озвучки" control={<MacButton>Открыть</MacButton>} />
        </SettingsCard>

        <div className="rounded-[14px] bg-white/[0.055] p-4 ring-1 ring-white/[0.07]">
          <div className="text-[12.5px] font-semibold text-white/80">Голос для конкретного зрителя</div>
          <div className="mt-3 flex gap-2">
            <input value={perViewer} onChange={(e) => setPerViewer(e.target.value)} placeholder="ник зрителя" className={`${inputCls} w-36`} />
            <select id="viewer-voice" className={selectCls}>
              {VOICES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <MacButton
              onClick={() => {
                if (!perViewer.trim()) return;
                const sel = (document.getElementById("viewer-voice") as HTMLSelectElement)?.value ?? VOICES[0];
                setViewers((v) => [...v, { name: perViewer.trim(), voice: sel }]);
                setPerViewer("");
              }}
            >
              <span className="flex items-center gap-1">
                <Plus size={13} /> Назначить
              </span>
            </MacButton>
          </div>
          {viewers.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {viewers.map((v) => (
                <div key={v.name} className="flex items-center gap-2 text-[12px] text-white/60">
                  <Mic size={11} className="shrink-0 text-[#30D158]" />
                  <span className="truncate font-medium text-white/85">{v.name}</span>
                  <span className="truncate">→ {v.voice}</span>
                  <button onClick={() => setViewers((arr) => arr.filter((x) => x.name !== v.name))} className="ml-auto shrink-0 rounded p-0.5 text-white/30 hover:text-[#FF6B61]" title="Убрать">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================== Звуки наград =========================== */

interface Reward {
  id: number;
  name: string;
  price: number;
  desc: string;
  sound: string;
  volume: number;
  color: string;
  requireMessage: boolean;
  platforms: { twitch: boolean; vk: boolean };
}

const INITIAL_REWARDS: Reward[] = [
  { id: 1, name: "Hydrate!", price: 100, desc: "Напомнить попить воды", sound: "Пузырёк", volume: 80, color: "#64D2FF", requireMessage: false, platforms: { twitch: true, vk: true } },
  { id: 2, name: "Показать экран", price: 1500, desc: "", sound: "Аркада", volume: 100, color: "#FF453A", requireMessage: false, platforms: { twitch: true, vk: false } },
  { id: 3, name: "Клип момента", price: 500, desc: "Сохранить последние 30 секунд", sound: "Фанфары", volume: 90, color: "#BF5AF2", requireMessage: false, platforms: { twitch: true, vk: true } },
  { id: 4, name: "Удачи в луте", price: 300, desc: "", sound: "Монетки", volume: 70, color: "#FFD60A", requireMessage: true, platforms: { twitch: true, vk: true } },
  { id: 5, name: "Съесть лайм", price: 2500, desc: "", sound: "Колокольчик", volume: 100, color: "#53FC18", requireMessage: false, platforms: { twitch: false, vk: true } },
];

const REWARD_COLORS = ["#FF9F0A", "#30D158", "#0A84FF", "#BF5AF2", "#FF6482", "#FFD60A"];

export function SoundsPanel() {
  const lib = useSoundLibrary();
  const [rewards, setRewards] = useState<Reward[]>(INITIAL_REWARDS);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [nName, setNName] = useState("");
  const [nPrice, setNPrice] = useState(200);
  const [nDesc, setNDesc] = useState("");
  const [nMsg, setNMsg] = useState(false);
  const [nTw, setNTw] = useState(true);
  const [nVk, setNVk] = useState(true);

  const widgetUrl = "https://yawa.chat/widget/rewards?k=8f3a…d2";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader icon={BellRing} tint="#FF453A" title="Звуки наград" subtitle="Свой звук и громкость у каждой награды за баллы канала" />
      <div className="mac-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div className="flex h-8 items-center justify-between">
          <span className="text-[12px] text-white/45">{rewards.length} наград · подтянуты из Twitch и VK Видео Live</span>
          <div className="flex gap-2">
            <MacButton
              onClick={() => {
                setRefreshing(true);
                setTimeout(() => setRefreshing(false), 900);
              }}
            >
              <span className="flex items-center gap-1.5">
                <RotateCcw size={12} className={refreshing ? "animate-spin" : ""} /> Обновить
              </span>
            </MacButton>
            <MacButton primary onClick={() => setCreating((c) => !c)}>
              <span className="flex items-center gap-1.5">
                <Plus size={12} /> Новая награда
              </span>
            </MacButton>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {creating && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="rounded-[14px] bg-white/[0.055] p-4 ring-1 ring-white/[0.07]">
                <div className="text-[12.5px] font-semibold text-white/85">Создать награду прямо здесь</div>
                <p className="mt-0.5 text-[11px] text-white/40">Не открывая кабинеты площадок — награда появится в каналах сама</p>
                <div className="mt-3 grid grid-cols-[1fr_110px] gap-2">
                  <input value={nName} onChange={(e) => setNName(e.target.value)} placeholder="Название награды" className={inputCls} />
                  <input value={nPrice} onChange={(e) => setNPrice(Number(e.target.value) || 0)} type="number" min={1} placeholder="Цена" className={inputCls} />
                </div>
                <input value={nDesc} onChange={(e) => setNDesc(e.target.value)} placeholder="Описание (необязательно)" className={`${inputCls} mt-2 w-full`} />
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2.5">
                  <MacCheckbox checked={nMsg} onChange={setNMsg} label="Требовать сообщение" />
                  <MacCheckbox checked={nTw} onChange={setNTw} label="Twitch" />
                  <MacCheckbox checked={nVk} onChange={setNVk} label="VK Видео Live" />
                  <div className="ml-auto">
                    <MacButton
                      primary
                      onClick={() => {
                        if (!nName.trim()) return;
                        setRewards((r) => [
                          ...r,
                          {
                            id: Date.now(),
                            name: nName.trim(),
                            price: nPrice,
                            desc: nDesc.trim(),
                            sound: "Колокольчик",
                            volume: 80,
                            color: REWARD_COLORS[r.length % REWARD_COLORS.length],
                            requireMessage: nMsg,
                            platforms: { twitch: nTw, vk: nVk },
                          },
                        ]);
                        setNName("");
                        setNDesc("");
                        setCreating(false);
                      }}
                    >
                      Создать
                    </MacButton>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-2.5">
          {rewards.map((r) => (
            <div key={r.id} className="flex items-center gap-3.5 rounded-[14px] bg-white/[0.045] px-4 py-3 ring-1 ring-white/[0.06]">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[15px] font-bold text-white" style={{ background: `linear-gradient(150deg, ${r.color}, ${r.color}A0)` }}>
                {r.name[0]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-white/90">{r.name}</div>
                <div className="truncate text-[11px] text-white/40">
                  {r.price} баллов{r.requireMessage ? " · с сообщением" : ""} · {[r.platforms.twitch && "Twitch", r.platforms.vk && "VK"].filter(Boolean).join(" + ")}
                </div>
              </div>
              <SoundSelect
                value={r.sound}
                onChange={(v) => setRewards((arr) => arr.map((x) => (x.id === r.id ? { ...x, sound: v } : x)))}
                custom={lib.custom}
                scope="reward"
                className="w-32"
              />
              <button
                onClick={() => playSoundValue(r.sound, lib.custom, r.volume / 100)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/[0.08] text-white/80 ring-1 ring-white/10 transition-colors hover:bg-accent hover:text-white"
                title="Прослушать"
              >
                <Play size={11} fill="currentColor" />
              </button>
              <div className="w-28 shrink-0">
                <MacSlider value={r.volume} onChange={(nv) => setRewards((arr) => arr.map((x) => (x.id === r.id ? { ...x, volume: nv } : x)))} />
              </div>
              <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-white/50">{r.volume}%</span>
            </div>
          ))}
        </div>

        <SoundUploadZone scope="reward" upload={lib.upload} custom={lib.custom} remove={lib.remove} />

        <div className="flex items-center gap-3 rounded-[14px] bg-[#0A84FF]/[0.08] p-4 ring-1 ring-[#0A84FF]/25">
          <Link2 size={15} className="shrink-0 text-[#64D2FF]" />
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold text-white/85">Виджет OBS для звуков наград</div>
            <div className="truncate text-[11px] text-white/40">{widgetUrl} · звук слышен на трансляции</div>
          </div>
          <MacButton
            onClick={() => {
              navigator.clipboard?.writeText(widgetUrl).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <span className="flex items-center gap-1.5">
              {copied ? <Check size={12} className="text-[#30D158]" /> : <Copy size={12} />}
              {copied ? "Скопировано" : "Копировать"}
            </span>
          </MacButton>
        </div>
      </div>
    </div>
  );
}

/* =========================== Оверлей и виджет =========================== */

export function OverlayPanel({ messages, ap }: { messages: ChatMessage[]; ap: Appearance }) {
  const [enabled, setEnabled] = useState(true);
  const [opacity, setOpacity] = useState(72);
  const [radiusOv, setRadiusOv] = useState(12);
  const [textOp, setTextOp] = useState(100);
  const [count, setCount] = useState(5);
  const [showJoins, setShowJoins] = useState(false);
  const [eventsOnly, setEventsOnly] = useState(false);
  const [showTime, setShowTime] = useState(true);
  const [showPlatform, setShowPlatform] = useState(true);
  const [showBadges, setShowBadges] = useState(true);
  const [showEmotes, setShowEmotes] = useState(true);
  const [autoFade, setAutoFade] = useState(false);
  const [fadeSec, setFadeSec] = useState(30);
  const [growth, setGrowth] = useState<"up" | "down">("up");
  const [showStats, setShowStats] = useState(true);
  const [statsPos, setStatsPos] = useState<"top" | "bottom">("top");
  const [showDonations, setShowDonations] = useState(true);
  const [ttViewers, setTtViewers] = useState(true);
  const [ttLikes, setTtLikes] = useState(false);
  const [hideDisconnected, setHideDisconnected] = useState(true);
  const [corner, setCorner] = useState<"tl" | "tr" | "bl" | "br">("bl");
  const [copied, setCopied] = useState(false);

  const preset = stylePreset(ap.overlayStyle);
  const pal = tonePalette(preset, ap.overlayTone ?? defaultTone(preset));
  useEffect(() => ensureStyleFont(preset), [preset]);

  const preview = messages
    .filter((m) => {
      if (m.kind === "event") return showJoins;
      if (m.kind === "donation") return showDonations;
      return !eventsOnly;
    })
    .slice(-count);
  const cornerCls = { tl: "left-3 top-3", tr: "right-3 top-3", bl: "left-3 bottom-3", br: "right-3 bottom-3" }[corner];
  const widgetUrl = "https://yawa.chat/widget/chat?k=c41e…9b";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader icon={PictureInPicture2} tint="#64D2FF" title="Оверлей и виджет OBS" subtitle="Окно поверх игры и отдельный источник для трансляции" />
      <div className="mac-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div className="relative h-44 shrink-0 overflow-hidden rounded-[16px] ring-1 ring-white/10" style={{ background: "linear-gradient(140deg, #28303F, #151A26 60%, #1D2536)" }}>
          <div className="absolute right-3 top-3 rounded-md bg-black/30 px-2 py-1 text-[10px] font-semibold text-white/60 backdrop-blur">ПРЕВЬЮ · 144 FPS</div>
          <div
            style={{ opacity: enabled ? opacity / 100 + 0.25 : 0, fontFamily: preset.cssFont }}
            className={`absolute ${cornerCls} flex w-[290px] flex-col transition-opacity ${growth === "up" ? "justify-end" : "justify-start"}`}
          >
            {showStats && (
              <div
                className={`flex gap-2 rounded-lg bg-black/40 px-2.5 py-1.5 text-[10px] font-semibold text-white/80 backdrop-blur ${
                  statsPos === "top" ? "mb-1.5 self-start" : "order-last mt-0.5 self-start"
                }`}
              >
                <span className="tabular-nums">2 333 зрителя</span>
                {ttViewers && <span className="tabular-nums text-[#64D2FF]">TT: 96</span>}
                {ttLikes && <span className="tabular-nums text-[#FF6482]">♥ 1.2k</span>}
              </div>
            )}
            <div className="relative">
              {preset.decor !== "none" && <div className={`decor decor-${preset.decor} pointer-events-none absolute -inset-2 rounded-lg`} />}
              {preview.slice(-4).map((m, i, arr) => {
                const fade = autoFade ? Math.max(0.25, (i + 1) / arr.length) : 1;
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 px-2.5 py-1.5"
                    style={{
                      marginBottom: preset.spacing,
                      borderRadius: radiusOv,
                      background: preset.backdrop ? pal.msgBg : "transparent",
                      boxShadow:
                        [
                          pal.msgRing !== "transparent" && preset.backdrop ? `inset 0 0 0 1px ${pal.msgRing}` : "",
                          preset.stripe ? `inset 3px 0 0 ${pal.accent}` : "",
                        ]
                          .filter(Boolean)
                          .join(", ") || undefined,
                      backdropFilter: preset.id === "glass" || preset.id === "macos" ? "blur(10px)" : undefined,
                      opacity: fade,
                    }}
                  >
                    {showTime && (
                      <span className="shrink-0 text-[9px] tabular-nums" style={{ color: pal.msgText, opacity: 0.45 }}>
                        {new Date(m.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    {showPlatform && (
                      <span className="shrink-0">
                        <PlatformIcon id={m.platform} size={10} />
                      </span>
                    )}
                    <span
                      className="shrink-0 text-[11px] font-semibold"
                      style={{
                        color: m.color,
                        opacity: textOp / 100,
                        textTransform: preset.nickCase === "upper" ? "uppercase" : undefined,
                        textShadow: preset.textShadow ? "0 1px 3px rgba(0,0,0,0.85)" : undefined,
                        WebkitTextStroke: preset.outlineWidth > 0 ? `${preset.outlineWidth * 0.5}px rgba(0,0,0,0.6)` : undefined,
                      }}
                    >
                      {m.author}
                      {showBadges && m.badges.length > 0 && <span className="text-accent"> ›</span>}
                    </span>
                    <span
                      className="truncate text-[11px]"
                      style={{
                        color: pal.msgText,
                        opacity: textOp / 100,
                        textShadow: preset.textShadow ? "0 1px 3px rgba(0,0,0,0.85)" : undefined,
                        WebkitTextStroke: preset.outlineWidth > 0 ? `${preset.outlineWidth * 0.5}px rgba(0,0,0,0.6)` : undefined,
                      }}
                    >
                      {m.kind === "donation" ? `донат ${m.amount} ₽` : showEmotes ? m.text : m.text.replace(/LULULUL|PogChamp/g, "…")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <SettingsCard>
          <div className="px-4 pb-1 pt-3.5 text-[12px] font-semibold uppercase tracking-wide text-white/40">Игровой оверлей</div>
          <SettingsRow icon={<PictureInPicture2 size={13} />} title="Показывать оверлей" subtitle="Мышь не перехватывается, Ctrl+Shift+O" control={<MacToggle checked={enabled} onChange={setEnabled} />} />
          <SettingsRow icon={<Sparkles size={13} />} title="Прозрачность" subtitle={`${opacity}%`} control={<div className="w-36 shrink-0"><MacSlider value={opacity} onChange={setOpacity} /></div>} />
          <SettingsRow icon={<Filter size={13} />} title="Строк в оверлее" subtitle={String(count)} control={<div className="w-36 shrink-0"><MacSlider value={count} min={2} max={10} onChange={setCount} /></div>} />
          <SettingsRow
            icon={<Frame size={13} />}
            title="Положение на экране"
            control={
              <SegmentedControl
                id="corner"
                value={corner}
                onChange={setCorner}
                options={[
                  { value: "tl", label: "↖" },
                  { value: "tr", label: "↗" },
                  { value: "bl", label: "↙" },
                  { value: "br", label: "↘" },
                ]}
              />
            }
          />
          <SettingsRow icon={<Gauge size={13} />} title="Статистика эфира" subtitle="Зрители и подписки поверх игры" control={<MacToggle checked={showStats} onChange={setShowStats} />} />
          <SettingsRow icon={<Sparkles size={13} />} title="Прозрачность текста" subtitle={`${textOp}%`} control={<div className="w-36 shrink-0"><MacSlider value={textOp} min={30} max={100} onChange={setTextOp} /></div>} />
          <SettingsRow icon={<Ruler size={13} />} title="Скругление плашек" subtitle={`${radiusOv} px`} control={<div className="w-36 shrink-0"><MacSlider value={radiusOv} min={0} max={20} onChange={setRadiusOv} /></div>} />
          <SettingsRow
            icon={<Frame size={13} />}
            title="Рост ленты"
            subtitle="Новые сообщения "
            control={
              <SegmentedControl
                id="growth"
                value={growth}
                onChange={setGrowth}
                options={[
                  { value: "up", label: "Снизу вверх" },
                  { value: "down", label: "Сверху вниз" },
                ]}
              />
            }
          />
        </SettingsCard>

        <SettingsCard>
          <div className="px-4 pb-1 pt-3.5 text-[12px] font-semibold uppercase tracking-wide text-white/40">Содержимое строки</div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 px-4 py-3.5">
            <MacCheckbox checked={showTime} onChange={setShowTime} label="Время" />
            <MacCheckbox checked={showPlatform} onChange={setShowPlatform} label="Площадка" />
            <MacCheckbox checked={showBadges} onChange={setShowBadges} label="Значки" />
            <MacCheckbox checked={showEmotes} onChange={setShowEmotes} label="Смайлы" />
          </div>
          <SettingsRow icon={<Timer size={13} />} title="Только события" subtitle="В оверлей идут лишь донаты, подписки и рейды" control={<MacToggle checked={eventsOnly} onChange={setEventsOnly} />} />
          <SettingsRow
            icon={<Timer size={13} />}
            title="Исчезновение старых сообщений"
            subtitle={autoFade ? `Плавно гаснут за ${fadeSec} сек` : "Отключено"}
            control={
              <div className="flex w-40 shrink-0 items-center gap-2">
                {autoFade && <MacSlider value={fadeSec} min={10} max={120} step={5} onChange={setFadeSec} />}
                <MacToggle small checked={autoFade} onChange={setAutoFade} />
              </div>
            }
          />
        </SettingsCard>

        <SettingsCard>
          <div className="px-4 pb-1 pt-3.5 text-[12px] font-semibold uppercase tracking-wide text-white/40">Панель статистики</div>
          <SettingsRow
            icon={<Gauge size={13} />}
            title="Позиция панели"
            control={
              <SegmentedControl
                id="statspos"
                value={statsPos}
                onChange={setStatsPos}
                options={[
                  { value: "top", label: "Сверху" },
                  { value: "bottom", label: "Снизу" },
                ]}
              />
            }
          />
          <SettingsRow icon={<HandCoins size={13} />} title="Показывать донаты" subtitle="Донаты приходят в оверлей вместе с чатом" control={<MacToggle checked={showDonations} onChange={setShowDonations} />} />
          <SettingsRow icon={<Eye size={13} />} title="Скрывать площадки без каналов" subtitle="В статистике — только подключённые" control={<MacToggle checked={hideDisconnected} onChange={setHideDisconnected} />} />
        </SettingsCard>

        <SettingsCard>
          <div className="px-4 pb-1 pt-3.5 text-[12px] font-semibold uppercase tracking-wide text-white/40">TikTok и события</div>
          <SettingsRow icon={<Eye size={13} />} title="Счётчик зрителей TikTok" control={<MacToggle checked={ttViewers} onChange={setTtViewers} />} />
          <SettingsRow icon={<Bell size={13} />} title="Счётчик лайков TikTok" control={<MacToggle checked={ttLikes} onChange={setTtLikes} />} />
          <SettingsRow icon={<Bell size={13} />} title="События входа зрителей" subtitle="Строки «зашёл на трансляцию»" control={<MacToggle checked={showJoins} onChange={setShowJoins} />} />
        </SettingsCard>

        <div className="flex items-center gap-3 rounded-[14px] bg-[#0A84FF]/[0.08] p-4 ring-1 ring-[#0A84FF]/25">
          <Link2 size={15} className="shrink-0 text-[#64D2FF]" />
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold text-white/85">Виджет чата для OBS</div>
            <div className="truncate text-[11px] text-white/40">{widgetUrl} · свой стиль выбирается в «Оформлении», вкладка «Виджет»</div>
          </div>
          <MacButton
            onClick={() => {
              navigator.clipboard?.writeText(widgetUrl).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <span className="flex items-center gap-1.5">
              {copied ? <Check size={12} className="text-[#30D158]" /> : <Copy size={12} />}
              {copied ? "Скопировано" : "Копировать"}
            </span>
          </MacButton>
        </div>
      </div>
    </div>
  );
}

/* =========================== Оформление =========================== */

const PREVIEW_MESSAGES: ChatMessage[] = [
  { id: 9001, platform: "twitch", author: "neon_foxx", color: "#FF9F5A", text: "этот момент надо было видеть!", kind: "message", badges: ["sub"], amount: null, currency: null, createdAt: new Date().toISOString() },
  { id: 9002, platform: "youtube", author: "КиберАня", color: "#64D2FF", text: "привет всем, кто зашёл на стрим", kind: "message", badges: ["mod"], amount: null, currency: null, createdAt: new Date().toISOString() },
  { id: 9003, platform: "tiktok", author: "dj_sova", color: "#7ED957", text: "с тиктока залетел, у тебя тут уютно", kind: "message", badges: ["vip"], amount: null, currency: null, createdAt: new Date().toISOString() },
];

const SURFACES: Array<{ id: SurfaceKind; label: string; icon: LucideIcon }> = [
  { id: "feed", label: "Лента", icon: MessageSquareText },
  { id: "widget", label: "Виджет OBS", icon: MonitorPlay },
  { id: "overlay", label: "Оверлей", icon: PictureInPicture2 },
];

const CARD_MSGS = [
  { n: "neon_foxx", c: "#FF9F5A", t: "этот момент эпичен!" },
  { n: "КиберАня", c: "#64D2FF", t: "всем привет, чат" },
];

function StyleCard({ preset, active, onPick }: { preset: StylePreset; active: boolean; onPick: () => void }) {
  const pal = preset.base;
  useEffect(() => ensureStyleFont(preset), [preset]);

  return (
    <button
      onClick={onPick}
      className={`rounded-[13px] bg-white/[0.045] p-2.5 text-left ring-1 transition-all hover:bg-white/[0.08] ${
        active ? "ring-2 ring-accent" : "ring-white/[0.07]"
      }`}
    >
      {/* Мини-мок чата в настоящем оформлении стиля */}
      <div
        className="relative h-[86px] overflow-hidden rounded-[9px] p-2"
        style={{ background: pal.chromeBg, boxShadow: `inset 0 0 0 1px ${pal.chromeRing}` }}
      >
        {preset.decor !== "none" && <div className={`decor decor-${preset.decor} pointer-events-none absolute inset-0`} />}
        <div className="relative mb-1.5 flex items-center gap-1">
          <span className="h-1 w-1 shrink-0 rounded-full" style={{ background: pal.accent }} />
          <span
            className="truncate text-[7.5px] font-bold uppercase tracking-[0.12em]"
            style={{ color: pal.chromeText, fontFamily: preset.cssFont }}
          >
            {preset.name}
          </span>
        </div>
        <div className="relative space-y-1">
          {CARD_MSGS.map((m) => (
            <div
              key={m.n}
              className="truncate px-1.5 py-[3.5px]"
              style={{
                background: preset.backdrop ? pal.msgBg : "transparent",
                borderRadius: Math.max(2, preset.radius * 0.65),
                borderTopLeftRadius: preset.bubble ? Math.min(3, preset.radius) : Math.max(2, preset.radius * 0.65),
                boxShadow: preset.stripe ? `inset 2px 0 0 ${pal.accent}` : undefined,
                outline: pal.msgRing !== "transparent" && preset.backdrop ? `0.5px solid ${pal.msgRing}` : undefined,
                textShadow: preset.textShadow ? "0 1px 2px rgba(0,0,0,0.8)" : undefined,
              }}
            >
              <span
                className="mr-1 text-[8.5px] font-bold"
                style={{
                  color: m.c,
                  fontFamily: preset.cssFont,
                  textTransform: preset.nickCase === "upper" ? "uppercase" : undefined,
                }}
              >
                {preset.prompt && <span style={{ color: pal.accent }}>&gt; </span>}
                {m.n}
              </span>
              <span className="text-[8.5px]" style={{ color: pal.msgText, fontFamily: preset.cssFont }}>
                {m.t}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 px-0.5 text-[12px] font-semibold text-white/90">
        <span className="truncate">{preset.name}</span>
        {active && <Check size={13} className="text-accent shrink-0" />}
      </div>
      <div className="mt-0.5 line-clamp-1 truncate px-0.5 text-[10px] text-white/40">{preset.desc}</div>
    </button>
  );
}

function StylePreview({ surface, ap }: { surface: SurfaceKind; ap: Appearance }) {
  const styleId = surface === "feed" ? ap.feedStyle : surface === "widget" ? ap.widgetStyle : ap.overlayStyle;
  const toneId = surface === "feed" ? ap.feedTone : surface === "widget" ? ap.widgetTone : ap.overlayTone;
  const preset = stylePreset(styleId);
  const tone = preset.tones?.find((t) => t.id === (toneId ?? defaultTone(preset)));
  const pal = tonePalette(preset, tone?.id);

  useEffect(() => ensureStyleFont(preset), [preset]);

  const fx: FeedFx = { preset, tone, effect: "fade", fontSize: surface === "widget" ? preset.fontSize + 4 : surface === "overlay" ? preset.fontSize + 2 : 0 };

  if (surface === "overlay") {
    return (
      <div className="relative h-44 overflow-hidden rounded-[14px] ring-1 ring-white/10" style={{ background: "linear-gradient(140deg, #28303F, #151A26 60%, #1D2536)" }}>
        <div className="absolute right-3 top-3 rounded-md bg-black/30 px-2 py-1 text-[10px] font-semibold text-white/60">ИГРА · 144 FPS</div>
        <div className="absolute bottom-3 left-3 w-[300px] p-1" style={{ fontFamily: preset.cssFont }}>
          {PREVIEW_MESSAGES.map((m) => (
            <MessageRow key={m.id} msg={m} fx={fx} />
          ))}
        </div>
      </div>
    );
  }

  if (surface === "widget") {
    return (
      <div
        className="h-48 overflow-hidden rounded-[14px] p-3 ring-1 ring-white/10"
        style={{
          background: ap.widgetTransparent
            ? "repeating-conic-gradient(rgba(255,255,255,0.05) 0% 25%, transparent 0% 50%) 0 0 / 18px 18px, #101014"
            : pal.chromeBg,
          fontFamily: preset.cssFont,
        }}
      >
        <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/35">
          {ap.widgetTransparent ? "прозрачный фон OBS" : "фоновая сцена OBS"}
        </div>
        <div
          className="mt-1.5 overflow-hidden"
          style={
            ap.widgetWin
              ? {
                  background: pal.chromeBg,
                  opacity: Math.max(0.2, ap.widgetWinOpacity / 100 + 0.35),
                  borderRadius: ap.widgetWinRadius,
                  boxShadow: `inset 0 0 0 1.5px ${pal.chromeRing}`,
                }
              : undefined
          }
        >
          {ap.widgetWin && ap.widgetWinBar && (
            <div
              className="flex h-6 items-center gap-1.5 px-3 text-[8.5px] font-bold uppercase tracking-[0.14em]"
              style={{ color: pal.chromeText, boxShadow: `inset 0 -1px 0 ${pal.chromeRing}` }}
            >
              <span className="h-1 w-1 rounded-full" style={{ background: pal.accent }} />
              {preset.name}
              {tone ? ` · ${tone.name}` : ""}
            </div>
          )}
          <div className={ap.widgetWin ? "px-1.5 py-1" : ""}>
            {PREVIEW_MESSAGES.map((m) => (
              <MessageRow key={m.id} msg={m} fx={fx} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* лента — с хромом окна чата */
  return (
    <div className="relative h-44 overflow-hidden rounded-[14px]" style={{ background: pal.chromeBg, boxShadow: `inset 0 0 0 1.5px ${pal.chromeRing}` }}>
      <div className={`decor decor-${preset.decor} pointer-events-none absolute inset-0`} />
      <div
        className="relative flex h-7 items-center gap-2 px-3.5 text-[10px] font-bold uppercase tracking-[0.16em]"
        style={{ color: pal.chromeText, fontFamily: preset.cssFont, boxShadow: `inset 0 -1px 0 ${pal.chromeRing}` }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: pal.accent }} />
        {preset.name}
        {tone ? ` · ${tone.name}` : ""}
      </div>
      <div className="relative px-1.5 pt-1" style={{ fontFamily: preset.cssFont }}>
        {PREVIEW_MESSAGES.map((m) => (
          <MessageRow key={m.id} msg={m} fx={fx} />
        ))}
      </div>
    </div>
  );
}

export function AppearancePanel({ ap, setAp }: { ap: Appearance; setAp: (patch: Partial<Appearance>) => void }) {
  const [surface, setSurface] = useState<SurfaceKind>("feed");
  const styleId = surface === "feed" ? ap.feedStyle : surface === "widget" ? ap.widgetStyle : ap.overlayStyle;
  const toneId = surface === "feed" ? ap.feedTone : surface === "widget" ? ap.widgetTone : ap.overlayTone;
  const preset = stylePreset(styleId);
  const tone = toneId ?? defaultTone(preset);

  const pickStyle = (id: string) => {
    const next = stylePreset(id);
    const patch: Partial<Appearance> =
      surface === "feed" ? { feedStyle: id, feedTone: defaultTone(next) } : surface === "widget" ? { widgetStyle: id, widgetTone: defaultTone(next) } : { overlayStyle: id, overlayTone: defaultTone(next) };
    setAp(patch);
  };

  const pickTone = (v: string) => {
    setAp(surface === "feed" ? { feedTone: v } : surface === "widget" ? { widgetTone: v } : { overlayTone: v });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader icon={Paintbrush} tint="#FF6482" title="Оформление" subtitle="21 стиль: палитра, шрифт, плашки и эффекты — раздельно по поверхностям" />
      <div className="mac-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div className="flex items-center justify-between gap-3">
          <SegmentedControl
            id="surface"
            value={surface}
            onChange={setSurface}
            options={SURFACES.map((s) => ({ value: s.id, label: s.label }))}
          />
          <span className="text-[11px] text-white/35">у каждой поверхности свой стиль</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-3 2xl:grid-cols-4">
          {STYLE_CATALOG.map((s) => (
            <StyleCard key={s.id} preset={s} active={styleId === s.id} onPick={() => pickStyle(s.id)} />
          ))}
        </div>

        {preset.tones && preset.tones.length > 0 && (
          <div className="flex items-center gap-3 rounded-[12px] bg-white/[0.045] px-4 py-3 ring-1 ring-white/[0.06]">
            <span className="text-[12.5px] font-medium text-white/75">Тон темы</span>
            <SegmentedControl id={`tone-${surface}`} value={tone ?? ""} onChange={pickTone} options={preset.tones.map((t) => ({ value: t.id, label: t.name }))} />
            <span className="ml-auto text-[11px] text-white/35">готовые наборы цветов — тема запоминает выбранный</span>
          </div>
        )}

        <div>
          <div className="px-1 pb-2 text-[12px] font-semibold uppercase tracking-wide text-white/40">
            Предпросмотр — {SURFACES.find((s) => s.id === surface)?.label}
          </div>
          <StylePreview surface={surface} ap={ap} />
        </div>

        <SettingsCard>
          <div className="px-4 pb-1 pt-3.5 text-[12px] font-semibold uppercase tracking-wide text-white/40">Настройка поверх стиля (лента)</div>
          <SettingsRow
            icon={<Type size={13} />}
            title="Размер текста"
            subtitle={ap.fontSize === 0 ? "по стилю" : `${ap.fontSize} px`}
            control={<div className="w-36 shrink-0"><MacSlider value={ap.fontSize} min={0} max={17} onChange={(v) => setAp({ fontSize: v })} /></div>}
          />
          <SettingsRow
            icon={<Rows3Icon />}
            title="Плотность ленты"
            control={
              <SegmentedControl<Density>
                id="density"
                value={ap.density}
                onChange={(v) => setAp({ density: v })}
                options={[
                  { value: "compact", label: "Плотно" },
                  { value: "normal", label: "По стилю" },
                  { value: "roomy", label: "Просторно" },
                ]}
              />
            }
          />
          <SettingsRow
            icon={<Wand2 size={13} />}
            title="Эффект появления сообщений"
            control={
              <SegmentedControl
                id="effect"
                value={ap.effect}
                onChange={(v) => setAp({ effect: v })}
                options={[
                  { value: "none", label: "Нет" },
                  { value: "fade", label: "Плавно" },
                  { value: "slide", label: "Выезд" },
                ]}
              />
            }
          />
          <SettingsRow icon={<Frame size={13} />} title="Окно чата" subtitle="Подложка-рамка темы поверх ленты; выключите, чтобы оставить только текст" control={<MacToggle checked={ap.chatFrame} onChange={(v) => setAp({ chatFrame: v })} />} />
          {surface === "feed" && (
            <>
              <SettingsRow icon={<Filter size={13} />} title="Скрывать служебные события" subtitle="Подписки, рейды и подарки не показываются в ленте" control={<MacToggle checked={ap.hideEvents} onChange={(v) => setAp({ hideEvents: v })} />} />
              <SettingsRow icon={<Bell size={13} />} title="Подсветка упоминаний" subtitle="Сообщения с @yawa выделяются акцентом" control={<MacToggle checked={ap.mentions} onChange={(v) => setAp({ mentions: v })} />} />
            </>
          )}
          {surface === "widget" && (
            <>
              <SettingsRow icon={<PictureInPicture2 size={13} />} title="Прозрачный фон виджета" subtitle="Подложка только под сообщениями — для сцен OBS" control={<MacToggle checked={ap.widgetTransparent} onChange={(v) => setAp({ widgetTransparent: v })} />} />
              <SettingsRow icon={<Frame size={13} />} title="Окно виджета" subtitle="Подложка под всей лентой с шапкой темы" control={<MacToggle checked={ap.widgetWin} onChange={(v) => setAp({ widgetWin: v })} />} />
              {ap.widgetWin && (
                <>
                  <SettingsRow icon={<Sparkles size={13} />} title="Прозрачность окна" subtitle={`${ap.widgetWinOpacity}%`} control={<div className="w-36 shrink-0"><MacSlider value={ap.widgetWinOpacity} min={20} max={100} onChange={(v) => setAp({ widgetWinOpacity: v })} /></div>} />
                  <SettingsRow icon={<Ruler size={13} />} title="Скругление окна" subtitle={`${ap.widgetWinRadius} px`} control={<div className="w-36 shrink-0"><MacSlider value={ap.widgetWinRadius} min={0} max={24} onChange={(v) => setAp({ widgetWinRadius: v })} /></div>} />
                  <SettingsRow icon={<Type size={13} />} title="Шапка окна" subtitle="Название темы над лентой" control={<MacToggle checked={ap.widgetWinBar} onChange={(v) => setAp({ widgetWinBar: v })} />} />
                </>
              )}
            </>
          )}
          {surface === "overlay" && (
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-white/[0.08] text-white/80">
                <ShieldCheck size={13} />
              </div>
              <div className="min-w-0 flex-1 text-[11.5px] leading-snug text-white/45">
                Стиль меняет только внешний вид оверлея: подложку, шрифт и цвета. Поведение — строки, прозрачность,
                статистика, события — настраивается в разделе «Оверлей и OBS» и от стиля не зависит.
              </div>
            </div>
          )}
        </SettingsCard>

        <SettingsCard>
          <SettingsRow
            icon={<MessagesSquareIcon size={13} />}
            title="Вид окна"
            subtitle="«Воздух» — светлее и просторнее, «Студия» — компактнее и темнее"
            control={
              <SegmentedControl
                id="winstyle"
                value={ap.windowStyle}
                onChange={(v) => setAp({ windowStyle: v })}
                options={[
                  { value: "air", label: "Воздух" },
                  { value: "studio", label: "Студия" },
                ]}
              />
            }
          />
          <SettingsRow icon={<Eye size={13} />} title="Режим «Только чат»" subtitle="Убирает всё, кроме ленты — для вертикального монитора" control={<MacToggle checked={ap.onlyChat} onChange={(v) => setAp({ onlyChat: v })} />} />
        </SettingsCard>
      </div>
    </div>
  );
}

function Rows3Icon() {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-white/[0.08] text-white/80">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </span>
  );
}

/* =========================== Настройки приложения =========================== */

const HOTKEYS = [
  { name: "Включить / выключить озвучку", keys: ["Ctrl", "Shift", "T"] },
  { name: "Пауза очереди озвучки", keys: ["Ctrl", "Shift", "P"] },
  { name: "Пропустить очередь озвучки", keys: ["Ctrl", "Shift", "S"] },
  { name: "Режим «Только чат»", keys: ["Ctrl", "Shift", "C"] },
  { name: "Показать / скрыть оверлей", keys: ["Ctrl", "Shift", "O"] },
  { name: "Быстрый переход по разделам", keys: ["Ctrl", "K"] },
];

export function SettingsPanel({ accent, setAccent }: { accent: string; setAccent: (v: string) => void }) {
  const [saved, setSaved] = useState(false);
  const accents = ["#0A84FF", "#BF5AF2", "#FF453A", "#FF9F0A", "#30D158", "#FF375F"];

  const saveDiagnostics = () => {
    const payload = {
      app: "YawaChat",
      version: "10.4.2",
      at: new Date().toISOString(),
      platforms: STREAM_PLATFORMS.map((p) => ({ id: p.id, status: "ok", latency: 40 + Math.floor(Math.random() * 120) })),
      note: "Имена каналов, сообщения и данные входа не включены",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "yawachat-diagnostics.json";
    a.click();
    URL.revokeObjectURL(url);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader icon={SettingsIcon} tint="#98989D" title="Настройки" subtitle="Приложение, акцент, горячие клавиши и помощь" />
      <div className="mac-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <SettingsCard>
          <SettingsRow
            icon={<Palette size={13} />}
            title="Акцентный цвет"
            subtitle="Кнопки, переключатели и слайдеры — как в macOS"
            control={
              <div className="flex shrink-0 gap-1.5">
                {accents.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAccent(a)}
                    className="h-5 w-5 shrink-0 rounded-full transition-transform active:scale-90"
                    style={{ background: a, boxShadow: accent === a ? `0 0 0 2px #1C1C1F, 0 0 0 4px ${a}` : "none" }}
                    aria-label={a}
                  />
                ))}
              </div>
            }
          />
          <SettingsRow icon={<Keyboard size={13} />} title="Горячие клавиши работают в игре" subtitle="Глобальные сочетания не требуют фокуса окна" control={<MacToggle checked onChange={() => {}} />} />
          <SettingsRow
            icon={<CloudDownload size={13} />}
            title="Диагностический пакет"
            subtitle="Сведения о сбоях и площадках без личных данных"
            control={
              <MacButton onClick={saveDiagnostics}>
                <span className="flex items-center gap-1.5">
                  {saved ? <Check size={12} className="text-[#30D158]" /> : <CloudDownload size={12} />}
                  {saved ? "Сохранён" : "Сохранить"}
                </span>
              </MacButton>
            }
          />
        </SettingsCard>

        <div className="flex items-center gap-3 rounded-[14px] bg-white/[0.045] p-4 ring-1 ring-white/[0.07]">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-gradient-to-b from-[#5E5CE6] to-[#3838A7] text-white shadow">
            <Package size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-white/90">Библиотека стиля</div>
            <div className="text-[11px] text-white/40">
              Одна папка yawa-style-macos: index.ts + styles.css + README — распакуйте в src/ вашего проекта
            </div>
          </div>
          <a href="/library/yawa-style-macos.zip" download className="inline-flex shrink-0">
            <MacButton primary>
              <span className="flex items-center gap-1.5">
                <CloudDownload size={12} /> Скачать .zip
              </span>
            </MacButton>
          </a>
        </div>

        <SettingsCard>
          <div className="px-4 pb-1 pt-3.5 text-[12px] font-semibold uppercase tracking-wide text-white/40">Горячие клавиши</div>
          {HOTKEYS.map((h) => (
            <div key={h.name} className="flex items-center gap-3 px-4 py-3">
              <Keyboard size={14} className="shrink-0 text-white/50" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white/85">{h.name}</span>
              <div className="flex shrink-0 gap-1">
                {h.keys.map((k) => (
                  <kbd key={k} className="rounded-[6px] bg-white/[0.08] px-1.5 py-0.5 text-[10.5px] font-semibold text-white/70 ring-1 ring-white/[0.12] shadow-[0_1px_0_rgba(255,255,255,0.08)]">
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </SettingsCard>

        <SettingsCard>
          <div className="px-4 pb-1 pt-3.5 text-[12px] font-semibold uppercase tracking-wide text-white/40">Помощь и связь</div>
          <SettingsRow icon={<LifeBuoy size={13} />} title="Telegram-группа приложения" subtitle="t.me/+pk1zIbjQle01NWEy — вопросы и новости" control={<MacButton>Открыть</MacButton>} />
          <SettingsRow icon={<FolderGit2 size={13} />} title="Репозиторий проекта" subtitle="github.com/yawaside/YawaChatHub" control={<MacButton>Открыть</MacButton>} />
          <SettingsRow icon={<Send size={13} />} title="Поддержать автора" subtitle="donationalerts.com/r/yawaside" control={<MacButton>Донат</MacButton>} />
        </SettingsCard>

        <div className="pb-2 text-center text-[11px] text-white/30">YawaChat 10.4.2 · собрано с любовью</div>
      </div>
    </div>
  );
}
