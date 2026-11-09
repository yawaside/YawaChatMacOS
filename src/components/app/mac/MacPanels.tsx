/**
 * Разделы вида «macOS» — порт референса src-mac (panels.tsx + AppearancePanel).
 * Визуально 1:1; данные настоящие там, где они есть в приложении:
 * каналы и их переключение, статусы входа, лента донатов, награды, озвучка,
 * виджет OBS. Всё остальное интерактивно локально — как в референсе.
 */
import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Bell,
  BellRing,
  Bot,
  Ban,
  Check,
  Coins,
  Copy,
  Eye,
  FileAudio,
  Filter,
  Frame,
  Gauge,
  HandCoins,
  KeyRound,
  Keyboard,
  Link2,
  LogIn,
  Mic,
  MonitorPlay,
  Paintbrush,
  PictureInPicture2,
  Play,
  Plus,
  FolderGit2,
  LifeBuoy,
  Palette,
  Radio,
  Reply,
  RotateCcw,
  Ruler,
  Send,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Timer,
  Trash2,
  Upload,
  UserCheck,
  SmilePlus,
  Volume2,
  MessageSquareText,
  CloudDownload,
  MessagesSquare,
  Shield,
  Star,
  Gem,
  type LucideIcon,
} from "lucide-react";
import type { Channel, ChatMsg, PlatformId } from "../../../lib/types";
import { PLATFORMS, PlatformIcon, platformMeta } from "../../../lib/platforms";
import { DONATE_SOUNDS, playDonateSound } from "../../../lib/donateSounds";

/** проигрывание data-URL (свои загруженные файлы) */
function playDataUrl(data: string, volume = 1) {
  try {
    const el = new Audio(data);
    el.volume = Math.max(0, Math.min(1, volume));
    void el.play();
  } catch {
    /* WebAudio недоступен */
  }
}
import {
  STYLE_CATALOG,
  defaultTone,
  ensureStyleFont,
  stylePreset,
  tonePalette,
  type StylePreset,
  type SurfaceKind,
} from "./styleCatalog";
import {
  MacButton,
  MacCheckbox,
  MacSlider,
  MacToggle,
  PanelHeader,
  SegmentedControl,
  SettingsCard,
  SettingsRow,
  inputCls,
  selectCls,
} from "./MacOsControls";
import type { SettingsTabId } from "../SettingsShell";

export type MacSectionId =
  | "chat"
  | "channels"
  | "auth"
  | "bot"
  | "donations"
  | "voice"
  | "sounds"
  | "overlay"
  | "appearance"
  | "settings";

/* ======================= Звук: выбор и прослушивание ======================= */

function SoundSelect({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const base = DONATE_SOUNDS.filter((s) => !s.funny);
  const funny = DONATE_SOUNDS.filter((s) => s.funny);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${selectCls} ${className}`}>
      <optgroup label="Встроенные">
        {base.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </optgroup>
      <optgroup label="Шуточные">
        {funny.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

function PlaySoundButton({ id, volume }: { id: string; volume: number }) {
  return (
    <button
      onClick={() => playDonateSound(id, volume)}
      className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full bg-white/[0.08] text-white/80 ring-1 ring-white/10 transition-colors hover:bg-accent hover:text-white"
      title="Прослушать"
    >
      <Play size={11} fill="currentColor" />
    </button>
  );
}

/** Свои файлы: локальный список, проигрывание — через data URL, как в референсе. */
interface LocalSound {
  id: number;
  name: string;
  dataUrl: string;
}

function SoundUploadZone({
  scope,
  sounds,
  onUpload,
  onRemove,
}: {
  scope: "alert" | "reward";
  sounds: LocalSound[];
  onUpload: (file: File) => void;
  onRemove: (id: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
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
              ? "MP3/OGG/WAV до ~1 МБ · существуют до перезапуска"
              : "MP3/OGG/WAV до ~1 МБ · слушаются сразу после выбора"}
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
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
      </div>
      {sounds.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {sounds.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-[12px] text-white/70">
              <button
                onClick={() => playDataUrl(s.dataUrl)}
                className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-full bg-white/[0.08] text-white/80 ring-1 ring-white/10 transition-colors hover:bg-accent hover:text-white"
                title="Прослушать"
              >
                <Play size={10} fill="currentColor" />
              </button>
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <button
                onClick={() => onRemove(s.id)}
                className="shrink-0 cursor-pointer rounded p-1 text-white/30 transition-colors hover:bg-[#FF453A]/15 hover:text-[#FF6B61]"
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

function useLocalSounds() {
  const [sounds, setSounds] = useState<LocalSound[]>([]);
  const upload = (file: File) => {
    if (file.size > 1_000_000) return;
    const rd = new FileReader();
    rd.onload = () =>
      setSounds((list) => [
        ...list,
        {
          id: Date.now(),
          name: file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 60),
          dataUrl: String(rd.result),
        },
      ]);
    rd.readAsDataURL(file);
  };
  const remove = (id: number) => setSounds((list) => list.filter((s) => s.id !== id));
  return { sounds, upload, remove };
}

const DONATE_SET = new Set<PlatformId>(["donationalerts", "donatepay", "memealerts"]);
export const DONATE_PLATFORM_LIST = PLATFORMS.filter((p) => DONATE_SET.has(p.id));
const STREAM_PLATFORM_LIST = PLATFORMS.filter((p) => !DONATE_SET.has(p.id));

/* =========================== Каналы =========================== */

export function MacChannelsPanel({
  channels,
  onToggleChannel,
  onAddChannel,
}: {
  channels: Channel[];
  onToggleChannel?: (c: Channel) => void;
  onAddChannel: () => void;
}) {
  const [platform, setPlatform] = useState<PlatformId>("twitch");
  const [name, setName] = useState("");

  const submit = () => {
    /* настоящий вход в канал — в окне добавления канала */
    setName("");
    onAddChannel();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        icon={Radio}
        tint="#BF5AF2"
        title="Каналы"
        subtitle="Подключённые площадки и статус подключения"
      />
      <div className="mac-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <SettingsCard>
          {channels.length === 0 && (
            <div className="px-4 py-6 text-center text-[12px] text-white/35">
              Каналов пока нет — добавьте первый ниже
            </div>
          )}
          {channels.map((c) => {
            const meta = platformMeta(c.platform);
            const live = c.status === "online";
            const connected = live || c.status === "connected" || c.status === "connecting";
            return (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] ring-1 ring-white/[0.08]"
                  style={{ background: `${meta.color}1F` }}
                >
                  <PlatformIcon id={c.platform} size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-white/90">
                    {c.title || c.username}
                  </div>
                  <div className="mt-0.5 flex h-4 items-center gap-1.5 text-[11px] text-white/40">
                    <span className="truncate">{meta.name}</span>
                    {DONATE_SET.has(c.platform) ? (
                      connected ? (
                        <span className="w-36 shrink-0 font-medium text-[#30D158]">подключено</span>
                      ) : c.status === "error" ? (
                        <span className="w-36 shrink-0 truncate text-[#FF6B61]" title={c.errorReason}>
                          ошибка токена
                        </span>
                      ) : (
                        <span className="w-36 shrink-0">не подключено</span>
                      )
                    ) : live ? (
                      <span className="flex w-36 shrink-0 items-center gap-1 font-medium text-[#30D158]">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#30D158]" />
                        <span className="tabular-nums">в эфире · {c.viewers} зрит.</span>
                      </span>
                    ) : c.status === "connecting" ? (
                      <span className="w-36 shrink-0 text-[#FFD60A]/80">подключение…</span>
                    ) : c.status === "error" ? (
                      <span className="w-36 shrink-0 truncate text-[#FF6B61]" title={c.errorReason}>
                        ошибка подключения
                      </span>
                    ) : (
                      <span className="w-36 shrink-0">не в эфире</span>
                    )}
                  </div>
                </div>
                <MacToggle small checked={connected} onChange={() => onToggleChannel?.(c)} />
              </div>
            );
          })}
        </SettingsCard>

        <div className="rounded-[14px] bg-white/[0.055] p-4 ring-1 ring-white/[0.07]">
          <div className="text-[12.5px] font-semibold text-white/80">Добавить канал</div>
          <div className="mt-3 flex gap-2">
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as PlatformId)}
              className={selectCls}
            >
              {STREAM_PLATFORM_LIST.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={platformMeta(platform).hint}
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
  id: PlatformId;
  service: string;
  tint: string;
  desc: string;
  perks: string[];
  needsKey?: string;
  kind: "bot" | "donate";
  account?: string;
}

const AUTH_SERVICES: AuthEntry[] = [
  {
    id: "twitch",
    service: "Twitch — чат-бот",
    tint: "#9146FF",
    desc: "Вход через OAuth: бот читает и отвечает в чат, подтягивает награды за баллы канала",
    perks: ["Чтение и отправка сообщений", "Награды за баллы канала", "Режимы чата и модерация"],
    kind: "bot",
    account: "yawabot",
  },
  {
    id: "vkplay",
    service: "VK Видео Live",
    tint: "#0077FF",
    desc: "Чтение публичного чата работает без входа. Вход включает бота, награды и режимы чата",
    perks: ["Ответы бота в чат VK", "Награды за баллы канала", "Медленный режим и «только смайлы»"],
    kind: "bot",
    account: "yawaside",
  },
  {
    id: "tiktok",
    service: "TikTok Live",
    tint: "#FE2C55",
    desc: "Вход открывает счётчики зрителей и лайков для оверлея и события входа зрителей",
    perks: ["Счётчик зрителей", "Счётчик лайков", "События входа"],
    kind: "bot",
    account: "@yawa.side",
  },
  {
    id: "donationalerts",
    service: "DonationAlerts",
    tint: "#F57D07",
    desc: "Токен из ссылки виджета алертов — донаты приходят в общую ленту",
    perks: ["Донаты в общей ленте", "Свой звук оповещения"],
    needsKey: "Токен виджета алертов",
    kind: "donate",
  },
  {
    id: "donatepay",
    service: "DonatePay",
    tint: "#44AB4F",
    desc: "API-ключ из раздела «API» кабинета DonatePay",
    perks: ["Донаты в общей ленте", "Свой звук оповещения"],
    needsKey: "API-ключ",
    kind: "donate",
  },
  {
    id: "memealerts",
    service: "MemeAlerts",
    tint: "#A855F7",
    desc: "Вход по аккаунту: мем-донаты с картинкой и звуком",
    perks: ["Мем-донаты в ленте", "Свой звук оповещения"],
    kind: "donate",
    account: "yawaside",
  },
];

export function MacAuthPanel({
  botAuth,
  channels,
  onOpenChatbot,
  onOpenDonations,
}: {
  botAuth: Partial<Record<PlatformId, string>>;
  channels: Channel[];
  onOpenChatbot: () => void;
  onOpenDonations: () => void;
}) {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const connected = (s: AuthEntry) =>
    s.kind === "bot" ? !!botAuth[s.id] : channels.some((c) => c.platform === s.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        icon={KeyRound}
        tint="#5AC8FA"
        title="Авторизация"
        subtitle="Вход в аккаунты площадок: бот, награды, донаты"
      />
      <div className="mac-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
        {AUTH_SERVICES.map((s) => {
          const on = connected(s);
          /* Вход и выход выполняются в настоящих окнах входа */
          const enter = () => (s.kind === "bot" ? onOpenChatbot() : onOpenDonations());
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
                  <PlatformIcon id={s.id} size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-semibold text-white/90">{s.service}</span>
                    <span
                      className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
                        on
                          ? "bg-[#30D158]/15 text-[#30D158] ring-[#30D158]/30"
                          : "bg-white/[0.06] text-white/45 ring-white/10"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-[#30D158]" : "bg-white/35"}`} />
                      {on
                        ? `вошли · ${keys[s.id] ? `${keys[s.id].slice(0, 8)}…` : s.kind === "bot" ? "чат-бот" : "подключено"}`
                        : "не подключено"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-white/45">{s.desc}</p>
                </div>
                <MacButton primary={!on} onClick={enter}>
                  {on ? (
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
                    <span
                      key={perk}
                      className="flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-1 text-[10.5px] text-white/60 ring-1 ring-white/[0.08]"
                    >
                      <Check size={10} className="text-[#30D158]" /> {perk}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className="rounded-[14px] bg-[#0A84FF]/[0.08] p-4 text-[12px] leading-relaxed text-white/55 ring-1 ring-[#0A84FF]/25">
          После обновления приложения войдите в Twitch заново — создание наград требует свежего входа в
          чат-бот.
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

export function MacChatbotPanel() {
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
      <PanelHeader
        icon={Bot}
        tint="#FF9F0A"
        title="Чат-бот и модерация"
        subtitle="Автоответы, режимы чата и быстрые действия"
      />
      <div className="mac-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div>
          <div className="px-1 pb-2 text-[12px] font-semibold uppercase tracking-wide text-white/40">
            Автоответы на команды
          </div>
          <div className="space-y-2">
            {answers.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-[12px] bg-white/[0.045] px-4 py-2.5 ring-1 ring-white/[0.06]"
              >
                <code className="shrink-0 rounded-md bg-white/[0.08] px-2 py-0.5 text-[11.5px] font-semibold text-[#64D2FF] ring-1 ring-white/10">
                  {a.command}
                </code>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/70">{a.response}</span>
                <button
                  onClick={() => setAnswers((arr) => arr.filter((x) => x.id !== a.id))}
                  className="shrink-0 cursor-pointer rounded-md p-1 text-white/30 transition-colors hover:bg-[#FF453A]/15 hover:text-[#FF6B61]"
                  title="Удалить"
                >
                  <Trash2 size={13} />
                </button>
                <MacToggle
                  small
                  checked={a.enabled}
                  onChange={(v) =>
                    setAnswers((arr) => arr.map((x) => (x.id === a.id ? { ...x, enabled: v } : x)))
                  }
                />
              </div>
            ))}
          </div>
          <div className="mt-2.5 flex gap-2">
            <input
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              placeholder="!команда"
              className={`${inputCls} w-32`}
            />
            <input
              value={resp}
              onChange={(e) => setResp(e.target.value)}
              placeholder="Текст ответа бота"
              className={`${inputCls} min-w-0 flex-1`}
            />
            <MacButton
              primary
              onClick={() => {
                if (!cmd.trim() || !resp.trim()) return;
                setAnswers((arr) => [
                  ...arr,
                  { id: Date.now(), command: cmd.trim(), response: resp.trim(), enabled: true },
                ]);
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
          <SettingsRow
            icon={<UserCheck size={13} />}
            title="Только подписчики"
            subtitle="Twitch: режим subscribers-only"
            control={<MacToggle small checked={subsOnly} onChange={setSubsOnly} />}
          />
          <SettingsRow
            icon={<UserCheck size={13} />}
            title="Только фолловеры"
            subtitle="Twitch: followers-only"
            control={<MacToggle small checked={followersOnly} onChange={setFollowersOnly} />}
          />
          <SettingsRow
            icon={<SmilePlus size={13} />}
            title="Только смайлы"
            subtitle="VK Видео Live: сообщения только из смайлов"
            control={<MacToggle small checked={emoteOnly} onChange={setEmoteOnly} />}
          />
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
                  <kbd
                    key={k}
                    className="rounded-[6px] bg-white/[0.08] px-1.5 py-0.5 text-[10.5px] font-semibold text-white/70 ring-1 ring-white/[0.12]"
                  >
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

export function MacDonationsPanel({
  feed,
  channels,
  onOpenDonationSettings,
}: {
  feed: ChatMsg[];
  channels: Channel[];
  onOpenDonationSettings: () => void;
}) {
  const sounds = useLocalSounds();
  const [soundIds, setSoundIds] = useState<Record<string, string>>({
    donationalerts: "chime",
    donatepay: "fanfare",
    memealerts: "arcade",
  });
  const [vols, setVols] = useState<Record<string, number>>({
    donationalerts: 80,
    donatepay: 80,
    memealerts: 80,
  });
  const donations = feed
    .filter((m) => m.kind === "donate")
    .slice(-6)
    .reverse();
  const connected = (id: PlatformId) => channels.some((c) => c.platform === id);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        icon={HandCoins}
        tint="#FFD60A"
        title="Донаты"
        subtitle="DonationAlerts, DonatePay и MemeAlerts в едином формате"
      />
      <div className="mac-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div className="grid grid-cols-3 gap-3">
          {DONATE_PLATFORM_LIST.map((p) => (
            <div
              key={p.id}
              className="min-w-0 rounded-[14px] bg-white/[0.055] p-3.5 ring-1 ring-white/[0.07]"
            >
              <div className="flex items-center gap-2">
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px]"
                  style={{ background: `${p.color}22` }}
                >
                  <PlatformIcon id={p.id} size={14} />
                </span>
                <span className="truncate text-[12px] font-semibold text-white/85">{p.name}</span>
              </div>
              <div
                className={`mt-2.5 flex items-center gap-1 text-[10.5px] font-medium ${
                  connected(p.id) ? "text-[#30D158]" : "text-white/35"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    connected(p.id) ? "bg-[#30D158]" : "bg-white/25"
                  }`}
                />
                {connected(p.id) ? "Подключено" : "Не подключено"}
              </div>
            </div>
          ))}
        </div>

        <SettingsCard>
          <div className="px-4 pb-1 pt-3.5 text-[12px] font-semibold uppercase tracking-wide text-white/40">
            Звук оповещения по площадке
          </div>
          {DONATE_PLATFORM_LIST.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-white/[0.08]">
                <Bell size={13} className="text-white/60" />
              </span>
              <span className="w-[104px] shrink-0 truncate text-[13px] font-medium text-white/85">
                {p.name}
              </span>
              <SoundSelect
                value={soundIds[p.id] ?? "chime"}
                onChange={(v) => setSoundIds((s) => ({ ...s, [p.id]: v }))}
                className="w-32"
              />
              <PlaySoundButton id={soundIds[p.id] ?? "chime"} volume={(vols[p.id] ?? 80) / 100} />
              <div className="w-20 shrink-0">
                <MacSlider value={vols[p.id] ?? 80} onChange={(v) => setVols((s) => ({ ...s, [p.id]: v }))} />
              </div>
              <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-white/50">
                {vols[p.id] ?? 80}%
              </span>
            </div>
          ))}
        </SettingsCard>

        <SoundUploadZone
          scope="alert"
          sounds={sounds.sounds}
          onUpload={sounds.upload}
          onRemove={sounds.remove}
        />

        <div className="flex items-center gap-3 rounded-[14px] bg-[#0A84FF]/[0.08] p-4 ring-1 ring-[#0A84FF]/25">
          <Link2 size={15} className="shrink-0 text-[#64D2FF]" />
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold text-white/85">Токены и звуки для донатов</div>
            <div className="truncate text-[11px] text-white/40">
              Подключение DonationAlerts, DonatePay и MemeAlerts — в настройках приложения
            </div>
          </div>
          <MacButton primary onClick={onOpenDonationSettings}>
            Открыть
          </MacButton>
        </div>

        <div>
          <div className="px-1 pb-2 text-[12px] font-semibold uppercase tracking-wide text-white/40">
            Лента донатов
          </div>
          <div className="space-y-2">
            {donations.length === 0 && (
              <div className="rounded-[12px] bg-white/[0.045] p-4 text-center text-[12px] text-white/35 ring-1 ring-white/[0.06]">
                Донаты появятся здесь
              </div>
            )}
            {donations.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-3 rounded-[12px] bg-white/[0.045] px-3.5 py-2.5 ring-1 ring-white/[0.06]"
              >
                <Coins size={15} className="shrink-0 text-[#FFD60A]" />
                <div className="min-w-0 flex-1">
                  <span className="text-[13px] font-semibold" style={{ color: d.color }}>
                    {d.author}
                  </span>
                  <span className="ml-2 text-[11px] text-white/40">{platformMeta(d.platform).name}</span>
                  <div className="truncate text-[11.5px] text-white/50">{d.text}</div>
                </div>
                <span className="w-24 shrink-0 text-right text-[14px] font-bold tabular-nums text-[#FFD60A]">
                  {d.amount?.toLocaleString("ru-RU")} {d.currency ?? "₽"}
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

const VOICES = [
  "Aria (RU, жен.)",
  "Dmitry (RU, муж.)",
  "Svetlana (RU, жен.)",
  "Jenny (EN, жен.)",
  "Guy (EN, муж.)",
];

export function MacVoicePanel({
  ttsOn,
  onToggleTts,
  ttsVolume,
  onTtsVolume,
  queueLength,
  onOpenVoiceSettings,
}: {
  ttsOn: boolean;
  onToggleTts: () => void;
  ttsVolume: number;
  onTtsVolume: (v: number) => void;
  queueLength: number;
  onOpenVoiceSettings: () => void;
}) {
  const [voice, setVoice] = useState(VOICES[0]);
  const [voiceKind, setVoiceKind] = useState<"edge" | "system">("edge");
  const [speed, setSpeed] = useState(55);
  const [localMute, setLocalMute] = useState(false);
  const [parts, setParts] = useState({ author: true, text: true, platform: false });
  const [skipLinks, setSkipLinks] = useState(true);
  const [maxLen, setMaxLen] = useState(200);
  const [capsLimit, setCapsLimit] = useState(60);
  const [perViewer, setPerViewer] = useState("");
  const [viewers, setViewers] = useState<Array<{ name: string; voice: string }>>([
    { name: "luna.wav", voice: "Svetlana (RU, жен.)" },
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        icon={AudioLines}
        tint="#30D158"
        title="Озвучка"
        subtitle="Нейросетевые голоса Edge TTS и системные голоса"
      />
      <div className="mac-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <SettingsCard>
          <SettingsRow
            icon={<Volume2 size={13} />}
            title="Озвучивать сообщения"
            subtitle="Голос звучит в виджете OBS и на трансляции"
            control={<MacToggle checked={ttsOn} onChange={onToggleTts} />}
          />
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
          <SettingsRow
            icon={<Eye size={13} />}
            title="Выкл. звук на этом ПК"
            subtitle="Голос будет слышен только в виджете OBS"
            control={<MacToggle checked={localMute} onChange={setLocalMute} />}
          />
        </SettingsCard>

        <SettingsCard>
          <div className="px-4 pb-1 pt-3.5 text-[12px] font-semibold uppercase tracking-wide text-white/40">
            Состав фразы
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 px-4 py-3.5">
            <MacCheckbox
              checked={parts.author}
              onChange={(v) => setParts((p) => ({ ...p, author: v }))}
              label="Автор"
            />
            <MacCheckbox
              checked={parts.text}
              onChange={(v) => setParts((p) => ({ ...p, text: v }))}
              label="Текст сообщения"
            />
            <MacCheckbox
              checked={parts.platform}
              onChange={(v) => setParts((p) => ({ ...p, platform: v }))}
              label="Площадка"
            />
          </div>
          <SettingsRow
            icon={<Gauge size={13} />}
            title="Скорость речи"
            subtitle={`${Math.round(50 + speed)}% от нормальной`}
            control={
              <div className="w-36 shrink-0">
                <MacSlider value={speed} onChange={setSpeed} />
              </div>
            }
          />
          <SettingsRow
            icon={<Volume2 size={13} />}
            title="Громкость"
            subtitle={`${Math.round(ttsVolume * 100)}%`}
            control={
              <div className="w-36 shrink-0">
                <MacSlider value={Math.round(ttsVolume * 100)} onChange={(v) => onTtsVolume(v / 100)} />
              </div>
            }
          />
        </SettingsCard>

        <SettingsCard>
          <div className="px-4 pb-1 pt-3.5 text-[12px] font-semibold uppercase tracking-wide text-white/40">
            Фильтры
          </div>
          <SettingsRow
            icon={<Filter size={13} />}
            title="Пропускать ссылки и команды"
            subtitle="Сообщения с http и ! командами не читаются"
            control={<MacToggle checked={skipLinks} onChange={setSkipLinks} />}
          />
          <SettingsRow
            icon={<Filter size={13} />}
            title="Ограничение длины"
            subtitle={`Не читать длиннее ${maxLen} символов`}
            control={
              <div className="w-36 shrink-0">
                <MacSlider value={maxLen} min={50} max={400} step={10} onChange={setMaxLen} />
              </div>
            }
          />
          <SettingsRow
            icon={<Filter size={13} />}
            title="Порог ЗАГЛАВНЫХ букв"
            subtitle={`Пропуск, если капса больше ${capsLimit}%`}
            control={
              <div className="w-36 shrink-0">
                <MacSlider value={capsLimit} min={20} max={100} step={5} onChange={setCapsLimit} />
              </div>
            }
          />
          <SettingsRow
            icon={<ShieldCheck size={13} />}
            title="Чёрный и белый списки авторов"
            subtitle="3 зрителя исключены из озвучки"
            control={<MacButton onClick={onOpenVoiceSettings}>Открыть</MacButton>}
          />
        </SettingsCard>

        <div className="rounded-[14px] bg-white/[0.055] p-4 ring-1 ring-white/[0.07]">
          <div className="text-[12.5px] font-semibold text-white/80">Голос для конкретного зрителя</div>
          <div className="mt-3 flex gap-2">
            <input
              value={perViewer}
              onChange={(e) => setPerViewer(e.target.value)}
              placeholder="ник зрителя"
              className={`${inputCls} w-36`}
            />
            <select id="viewer-voice" className={selectCls}>
              {VOICES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <MacButton
              onClick={() => {
                if (!perViewer.trim()) return;
                const sel =
                  (document.getElementById("viewer-voice") as HTMLSelectElement | null)?.value ?? VOICES[0];
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
                  <button
                    onClick={() => setViewers((arr) => arr.filter((x) => x.name !== v.name))}
                    className="ml-auto shrink-0 cursor-pointer rounded p-0.5 text-white/30 hover:text-[#FF6B61]"
                    title="Убрать"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-1">
          <span className="text-[11.5px] text-white/40">
            {queueLength > 0 ? `В очередь на озвучку: ${queueLength}` : "Очередь озвучки пуста"}
          </span>
          <MacButton onClick={onOpenVoiceSettings}>Все настройки озвучки…</MacButton>
        </div>
      </div>
    </div>
  );
}

/* =========================== Звуки наград =========================== */

export interface RewardRowData {
  title: string;
  cost?: number;
  platform: PlatformId;
}

export function MacRewardsPanel({
  rewards,
  onOpenRewardSettings,
}: {
  rewards: RewardRowData[];
  onOpenRewardSettings: () => void;
}) {
  const sounds = useLocalSounds();
  const [soundIds, setSoundIds] = useState<Record<number, string>>({});
  const [vols, setVols] = useState<Record<number, number>>({});
  const [refreshing, setRefreshing] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        icon={BellRing}
        tint="#FF453A"
        title="Звуки наград"
        subtitle="Свой звук и громкость у каждой награды за баллы канала"
      />
      <div className="mac-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div className="flex h-8 items-center justify-between">
          <span className="text-[12px] text-white/45">
            {rewards.length} {rewards.length === 1 ? "награда" : rewards.length < 5 ? "награды" : "наград"} ·
            подтянуты из Twitch и VK Видео Live
          </span>
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
            <MacButton primary onClick={onOpenRewardSettings}>
              <span className="flex items-center gap-1.5">
                <Plus size={12} /> Новая награда
              </span>
            </MacButton>
          </div>
        </div>

        <div className="space-y-2.5">
          {rewards.length === 0 && (
            <div className="rounded-[12px] bg-white/[0.045] p-4 text-center text-[12px] text-white/35 ring-1 ring-white/[0.06]">
              Награды появятся здесь после входа в Twitch или VK и синхронизации
            </div>
          )}
          {rewards.map((r, i) => {
            const sound = soundIds[i] ?? "arcade";
            const vol = vols[i] ?? 80;
            const meta = platformMeta(r.platform);
            return (
              <div
                key={`${r.platform}-${r.title}-${i}`}
                className="flex items-center gap-3.5 rounded-[14px] bg-white/[0.045] px-4 py-3 ring-1 ring-white/[0.06]"
              >
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[15px] font-bold text-white"
                  style={{ background: `linear-gradient(150deg, ${meta.color}, ${meta.color}A0)` }}
                >
                  {(r.title[0] ?? "?").toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-white/90">{r.title}</div>
                  <div className="truncate text-[11px] text-white/40">
                    {r.cost ? `${r.cost} баллов` : "без цены"} · {meta.name}
                  </div>
                </div>
                <SoundSelect
                  value={sound}
                  onChange={(v) => setSoundIds((s) => ({ ...s, [i]: v }))}
                  className="w-32"
                />
                <PlaySoundButton id={sound} volume={vol / 100} />
                <div className="w-28 shrink-0">
                  <MacSlider value={vol} onChange={(nv) => setVols((s) => ({ ...s, [i]: nv }))} />
                </div>
                <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-white/50">{vol}%</span>
              </div>
            );
          })}
        </div>

        <SoundUploadZone
          scope="reward"
          sounds={sounds.sounds}
          onUpload={sounds.upload}
          onRemove={sounds.remove}
        />

        <div className="flex items-center gap-3 rounded-[14px] bg-[#0A84FF]/[0.08] p-4 ring-1 ring-[#0A84FF]/25">
          <Link2 size={15} className="shrink-0 text-[#64D2FF]" />
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold text-white/85">Виджет OBS для звуков наград</div>
            <div className="truncate text-[11px] text-white/40">
              Адрес виджета — в настройках наград, под вашими токенами
            </div>
          </div>
          <MacButton primary onClick={onOpenRewardSettings}>
            Открыть
          </MacButton>
        </div>
      </div>
    </div>
  );
}

/* =========================== Оверлей и виджет =========================== */

export function MacOverlayPanel({
  feed,
  viewers,
  widgetUrl,
  onCopyWidget,
  onOpenOverlaySettings,
}: {
  feed: ChatMsg[];
  viewers: number;
  widgetUrl: string | null;
  onCopyWidget: () => void;
  onOpenOverlaySettings: () => void;
}) {
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

  const preset = stylePreset("macos");
  const pal = tonePalette(preset, defaultTone(preset));

  const preview = feed
    .filter((m) => {
      if (m.kind === "join") return showJoins;
      if (m.kind === "donate") return showDonations;
      if (eventsOnly) return m.kind !== "chat";
      return true;
    })
    .slice(-count);
  const cornerCls = {
    tl: "left-3 top-3",
    tr: "right-3 top-3",
    bl: "left-3 bottom-3",
    br: "right-3 bottom-3",
  }[corner];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        icon={PictureInPicture2}
        tint="#64D2FF"
        title="Оверлей и виджет OBS"
        subtitle="Окно поверх игры и отдельный источник для трансляции"
      />
      <div className="mac-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div
          className="relative h-44 shrink-0 overflow-hidden rounded-[16px] ring-1 ring-white/10"
          style={{ background: "linear-gradient(140deg, #28303F, #151A26 60%, #1D2536)" }}
        >
          <div className="absolute right-3 top-3 rounded-md bg-black/30 px-2 py-1 text-[10px] font-semibold text-white/60 backdrop-blur">
            ПРЕВЬЮ · 144 FPS
          </div>
          <div
            style={{ opacity: enabled ? opacity / 100 + 0.25 : 0, fontFamily: preset.cssFont }}
            className={`absolute ${cornerCls} flex w-[290px] flex-col transition-opacity ${
              growth === "up" ? "justify-end" : "justify-start"
            }`}
          >
            {showStats && (
              <div
                className={`flex gap-2 rounded-lg bg-black/40 px-2.5 py-1.5 text-[10px] font-semibold text-white/80 backdrop-blur ${
                  statsPos === "top" ? "mb-1.5 self-start" : "order-last mt-0.5 self-start"
                }`}
              >
                <span className="tabular-nums">{viewers.toLocaleString("ru-RU")} зрителей</span>
                {ttViewers && <span className="tabular-nums text-[#64D2FF]">TT: 96</span>}
                {ttLikes && <span className="tabular-nums text-[#FF6482]">♥ 1.2k</span>}
              </div>
            )}
            <div className="relative">
              {preset.decor !== "none" && (
                <div
                  className={`decor decor-${preset.decor} pointer-events-none absolute -inset-2 rounded-lg`}
                />
              )}
              {preview.map((m, i, arr) => {
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
                          pal.msgRing !== "transparent" && preset.backdrop
                            ? `inset 0 0 0 1px ${pal.msgRing}`
                            : "",
                          preset.stripe ? `inset 3px 0 0 ${pal.accent}` : "",
                        ]
                          .filter(Boolean)
                          .join(", ") || undefined,
                      backdropFilter: "blur(10px)",
                      opacity: fade,
                    }}
                  >
                    {showTime && (
                      <span
                        className="shrink-0 text-[9px] tabular-nums"
                        style={{ color: pal.msgText, opacity: 0.45 }}
                      >
                        {new Date(m.ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    {showPlatform && (
                      <span className="shrink-0">
                        <PlatformIcon id={m.platform} size={10} />
                      </span>
                    )}
                    <span
                      className="shrink-0 text-[11px] font-semibold"
                      style={{ color: m.color, opacity: textOp / 100 }}
                    >
                      {m.author}
                      {showBadges && m.badges && m.badges.length > 0 && (
                        <span className="text-accent"> ›</span>
                      )}
                    </span>
                    <span
                      className="truncate text-[11px]"
                      style={{ color: pal.msgText, opacity: textOp / 100 }}
                    >
                      {m.kind === "donate" ? `донат ${m.amount} ${m.currency ?? "₽"}` : m.text}
                    </span>
                  </div>
                );
              })}
              {preview.length === 0 && (
                <div
                  className="rounded-lg px-2.5 py-2 text-[11px]"
                  style={{ color: pal.msgText, opacity: 0.5 }}
                >
                  сообщений пока нет
                </div>
              )}
            </div>
          </div>
        </div>

        <SettingsCard>
          <div className="px-4 pb-1 pt-3.5 text-[12px] font-semibold uppercase tracking-wide text-white/40">
            Игровой оверлей
          </div>
          <SettingsRow
            icon={<PictureInPicture2 size={13} />}
            title="Показывать оверлей"
            subtitle="Мышь не перехватывается, Ctrl+Shift+O"
            control={<MacToggle checked={enabled} onChange={setEnabled} />}
          />
          <SettingsRow
            icon={<Sparkles size={13} />}
            title="Прозрачность"
            subtitle={`${opacity}%`}
            control={
              <div className="w-36 shrink-0">
                <MacSlider value={opacity} onChange={setOpacity} />
              </div>
            }
          />
          <SettingsRow
            icon={<Filter size={13} />}
            title="Строк в оверлее"
            subtitle={String(count)}
            control={
              <div className="w-36 shrink-0">
                <MacSlider value={count} min={2} max={10} onChange={setCount} />
              </div>
            }
          />
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
          <SettingsRow
            icon={<Gauge size={13} />}
            title="Статистика эфира"
            subtitle="Зрители и подписки поверх игры"
            control={<MacToggle checked={showStats} onChange={setShowStats} />}
          />
          <SettingsRow
            icon={<Sparkles size={13} />}
            title="Прозрачность текста"
            subtitle={`${textOp}%`}
            control={
              <div className="w-36 shrink-0">
                <MacSlider value={textOp} min={30} max={100} onChange={setTextOp} />
              </div>
            }
          />
          <SettingsRow
            icon={<Ruler size={13} />}
            title="Скругление плашек"
            subtitle={`${radiusOv} px`}
            control={
              <div className="w-36 shrink-0">
                <MacSlider value={radiusOv} min={0} max={20} onChange={setRadiusOv} />
              </div>
            }
          />
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
          <div className="px-4 pb-1 pt-3.5 text-[12px] font-semibold uppercase tracking-wide text-white/40">
            Содержимое строки
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 px-4 py-3.5">
            <MacCheckbox checked={showTime} onChange={setShowTime} label="Время" />
            <MacCheckbox checked={showPlatform} onChange={setShowPlatform} label="Площадка" />
            <MacCheckbox checked={showBadges} onChange={setShowBadges} label="Значки" />
            <MacCheckbox checked={showEmotes} onChange={setShowEmotes} label="Смайлы" />
          </div>
          <SettingsRow
            icon={<Timer size={13} />}
            title="Только события"
            subtitle="В оверлей идут лишь донаты, подписки и рейды"
            control={<MacToggle checked={eventsOnly} onChange={setEventsOnly} />}
          />
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
          <div className="px-4 pb-1 pt-3.5 text-[12px] font-semibold uppercase tracking-wide text-white/40">
            Панель статистики
          </div>
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
          <SettingsRow
            icon={<HandCoins size={13} />}
            title="Показывать донаты"
            subtitle="Донаты приходят в оверлей вместе с чатом"
            control={<MacToggle checked={showDonations} onChange={setShowDonations} />}
          />
          <SettingsRow
            icon={<Eye size={13} />}
            title="Скрывать площадки без каналов"
            subtitle="В статистике — только подключённые"
            control={<MacToggle checked={hideDisconnected} onChange={setHideDisconnected} />}
          />
        </SettingsCard>

        <SettingsCard>
          <div className="px-4 pb-1 pt-3.5 text-[12px] font-semibold uppercase tracking-wide text-white/40">
            TikTok и события
          </div>
          <SettingsRow
            icon={<Eye size={13} />}
            title="Счётчик зрителей TikTok"
            control={<MacToggle checked={ttViewers} onChange={setTtViewers} />}
          />
          <SettingsRow
            icon={<Bell size={13} />}
            title="Счётчик лайков TikTok"
            control={<MacToggle checked={ttLikes} onChange={setTtLikes} />}
          />
          <SettingsRow
            icon={<Bell size={13} />}
            title="События входа зрителей"
            subtitle="Строки «зашёл на трансляцию»"
            control={<MacToggle checked={showJoins} onChange={setShowJoins} />}
          />
        </SettingsCard>

        <div className="flex items-center gap-3 rounded-[14px] bg-[#0A84FF]/[0.08] p-4 ring-1 ring-[#0A84FF]/25">
          <Link2 size={15} className="shrink-0 text-[#64D2FF]" />
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold text-white/85">Виджет чата для OBS</div>
            <div className="truncate text-[11px] text-white/40">
              {widgetUrl
                ? `${widgetUrl} · адрес вашего виджета`
                : "Адрес виджета появится после запуска приложения"}
            </div>
          </div>
          {widgetUrl && (
            <MacButton
              onClick={() => {
                onCopyWidget();
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              <span className="flex items-center gap-1.5">
                {copied ? <Check size={12} className="text-[#30D158]" /> : <Copy size={12} />}
                {copied ? "Скопировано" : "Копировать"}
              </span>
            </MacButton>
          )}
          <MacButton primary onClick={onOpenOverlaySettings}>
            Настройки
          </MacButton>
        </div>
      </div>
    </div>
  );
}

/* =========================== Оформление =========================== */

interface PreviewMsg {
  id: number;
  platform: PlatformId;
  author: string;
  color: string;
  text: string;
  badges: string[];
  createdAt: string;
}

const PREVIEW_MESSAGES: PreviewMsg[] = [
  {
    id: 9001,
    platform: "twitch",
    author: "neon_foxx",
    color: "#FF9F5A",
    text: "этот момент надо было видеть!",
    badges: ["sub"],
    createdAt: new Date().toISOString(),
  },
  {
    id: 9002,
    platform: "youtube",
    author: "КиберАня",
    color: "#64D2FF",
    text: "привет всем, кто зашёл на стрим",
    badges: ["mod"],
    createdAt: new Date().toISOString(),
  },
  {
    id: 9003,
    platform: "tiktok",
    author: "dj_sova",
    color: "#7ED957",
    text: "с тиктока залетел, у тебя тут уютно",
    badges: ["vip"],
    createdAt: new Date().toISOString(),
  },
];

const CARD_MSGS = [
  { n: "neon_foxx", c: "#FF9F5A", t: "этот момент эпичен!" },
  { n: "КиберАня", c: "#64D2FF", t: "всем привет, чат" },
];

const DENSITY_PAD: Record<string, string> = {
  tight: "py-[2px]",
  compact: "py-[4px]",
  standard: "py-[7px]",
  cozy: "py-[9px]",
};

function MockBadge({ kind }: { kind: string }) {
  if (kind === "mod")
    return (
      <span
        className="grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[5px] bg-[#30D158]/20 text-[#30D158]"
        title="Модератор"
      >
        <Shield size={9} fill="currentColor" />
      </span>
    );
  if (kind === "vip")
    return (
      <span
        className="grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[5px] bg-[#BF5AF2]/20 text-[#BF5AF2]"
        title="VIP"
      >
        <Gem size={9} fill="currentColor" />
      </span>
    );
  return (
    <span
      className="grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[5px] bg-[#FFD60A]/20 text-[#FFD60A]"
      title="Подписчик"
    >
      <Star size={9} fill="currentColor" />
    </span>
  );
}

function MockRow({ msg, preset, toneId }: { msg: PreviewMsg; preset: StylePreset; toneId?: string }) {
  const pal = tonePalette(preset, toneId);
  const fontSize = preset.fontSize;
  const padY = DENSITY_PAD[preset.density] ?? "py-[7px]";

  const textFx: React.CSSProperties = {
    fontSize,
    textTransform: preset.nickCase === "upper" ? "uppercase" : undefined,
    WebkitTextStroke: preset.outlineWidth > 0 ? `${preset.outlineWidth * 0.55}px rgba(0,0,0,0.6)` : undefined,
    textShadow: preset.textShadow ? "0 1px 3px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.5)" : undefined,
  };

  const rowChrome: React.CSSProperties = {
    marginBottom: preset.spacing,
    borderRadius: preset.radius,
    background: preset.backdrop ? pal.msgBg : "transparent",
    boxShadow:
      [
        pal.msgRing !== "transparent" && preset.backdrop ? `inset 0 0 0 1px ${pal.msgRing}` : "",
        preset.stripe ? `inset 3px 0 0 ${pal.accent}` : "",
      ]
        .filter(Boolean)
        .join(", ") || undefined,
    borderBottom: preset.separators ? `1px solid ${pal.accent}33` : undefined,
    backdropFilter: preset.id === "glass" || preset.id === "macos" ? "blur(14px) saturate(1.4)" : undefined,
    borderTopLeftRadius: preset.bubble ? Math.min(4, preset.radius) : preset.radius,
  };

  const authorNode = (
    <span className="truncate font-semibold leading-tight" style={{ ...textFx, color: msg.color }}>
      {msg.author}
    </span>
  );
  const textNode = (
    <span className="break-words leading-snug" style={{ ...textFx, color: pal.msgText }}>
      {preset.prompt && (
        <span className="mr-1.5 select-none font-bold" style={{ color: pal.accent }}>
          &gt;
        </span>
      )}
      {msg.text}
    </span>
  );

  if (preset.bubble) {
    return (
      <div className="flex items-start gap-2.5" style={{ marginBottom: preset.spacing }}>
        <div
          className="min-w-0 max-w-[85%] px-3 py-2"
          style={{
            background: pal.msgBg,
            borderRadius: preset.radius,
            borderTopLeftRadius: Math.min(4, preset.radius),
            boxShadow:
              pal.msgRing !== "transparent"
                ? `0 0 0 1.5px ${pal.msgRing}, 0 2px 0 rgba(0,0,0,0.25)`
                : "0 2px 0 rgba(0,0,0,0.25)",
          }}
        >
          <div className="flex items-baseline gap-1.5">
            {authorNode}
            {msg.badges.map((b) => (
              <MockBadge key={b} kind={b} />
            ))}
          </div>
          <div className="mt-[1px]">{textNode}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`group flex items-start gap-2.5 px-2.5 ${padY}`} style={rowChrome}>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          {authorNode}
          {msg.badges.map((b) => (
            <MockBadge key={b} kind={b} />
          ))}
        </div>
        <div className="mt-[1px]">{textNode}</div>
      </div>
    </div>
  );
}

const SURFACES: Array<{ id: SurfaceKind; label: string; icon: LucideIcon }> = [
  { id: "feed", label: "Лента", icon: MessageSquareText },
  { id: "widget", label: "Виджет OBS", icon: MonitorPlay },
  { id: "overlay", label: "Оверлей", icon: PictureInPicture2 },
];

function StyleCard({ preset, active, onPick }: { preset: StylePreset; active: boolean; onPick: () => void }) {
  const pal = preset.base;
  useEffect(() => ensureStyleFont(preset), [preset]);

  return (
    <button
      onClick={onPick}
      className={`cursor-pointer rounded-[13px] bg-white/[0.045] p-2.5 text-left ring-1 transition-all hover:bg-white/[0.08] ${
        active ? "ring-2 ring-accent" : "ring-white/[0.07]"
      }`}
    >
      <div
        className="relative h-[86px] overflow-hidden rounded-[9px] p-2"
        style={{ background: pal.chromeBg, boxShadow: `inset 0 0 0 1px ${pal.chromeRing}` }}
      >
        {preset.decor !== "none" && (
          <div className={`decor decor-${preset.decor} pointer-events-none absolute inset-0`} />
        )}
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
                borderTopLeftRadius: preset.bubble
                  ? Math.min(3, preset.radius)
                  : Math.max(2, preset.radius * 0.65),
                boxShadow: preset.stripe ? `inset 2px 0 0 ${pal.accent}` : undefined,
                outline:
                  pal.msgRing !== "transparent" && preset.backdrop ? `0.5px solid ${pal.msgRing}` : undefined,
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

function StylePreview({
  surface,
  toneId,
  feedStyleId,
}: {
  surface: SurfaceKind;
  toneId?: string;
  feedStyleId?: string;
}) {
  const preset = stylePreset(feedStyleId ?? "macos");
  const pal = tonePalette(preset, toneId ?? defaultTone(preset));
  useEffect(() => ensureStyleFont(preset), [preset]);

  if (surface === "overlay") {
    return (
      <div
        className="relative h-44 overflow-hidden rounded-[14px] ring-1 ring-white/10"
        style={{ background: "linear-gradient(140deg, #28303F, #151A26 60%, #1D2536)" }}
      >
        <div className="absolute right-3 top-3 rounded-md bg-black/30 px-2 py-1 text-[10px] font-semibold text-white/60">
          ИГРА · 144 FPS
        </div>
        <div className="absolute bottom-3 left-3 w-[300px] p-1" style={{ fontFamily: preset.cssFont }}>
          {PREVIEW_MESSAGES.map((m) => (
            <MockRow key={m.id} msg={m} preset={preset} toneId={toneId ?? defaultTone(preset)} />
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
          background:
            "repeating-conic-gradient(rgba(255,255,255,0.05) 0% 25%, transparent 0% 50%) 0 0 / 18px 18px, #101014",
          fontFamily: preset.cssFont,
        }}
      >
        <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/35">
          прозрачный фон OBS
        </div>
        <div
          className="mt-1.5 overflow-hidden rounded-[12px]"
          style={{ background: pal.chromeBg, boxShadow: `inset 0 0 0 1.5px ${pal.chromeRing}` }}
        >
          <div
            className="flex h-6 items-center gap-1.5 px-3 text-[8.5px] font-bold uppercase tracking-[0.14em]"
            style={{ color: pal.chromeText, boxShadow: `inset 0 -1px 0 ${pal.chromeRing}` }}
          >
            <span className="h-1 w-1 rounded-full" style={{ background: pal.accent }} />
            {preset.name}
          </div>
          <div className="px-1.5 py-1">
            {PREVIEW_MESSAGES.map((m) => (
              <MockRow key={m.id} msg={m} preset={preset} toneId={toneId ?? defaultTone(preset)} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* лента — с хромом окна чата */
  return (
    <div
      className="relative h-44 overflow-hidden rounded-[14px]"
      style={{ background: pal.chromeBg, boxShadow: `inset 0 0 0 1.5px ${pal.chromeRing}` }}
    >
      {preset.decor !== "none" && (
        <div className={`decor decor-${preset.decor} pointer-events-none absolute inset-0`} />
      )}
      <div
        className="relative flex h-7 items-center gap-2 px-3.5 text-[10px] font-bold uppercase tracking-[0.16em]"
        style={{
          color: pal.chromeText,
          fontFamily: preset.cssFont,
          boxShadow: `inset 0 -1px 0 ${pal.chromeRing}`,
        }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: pal.accent }} />
        {preset.name}
        <span className="ml-auto normal-case tracking-normal opacity-60">чат</span>
      </div>
      <div className="relative px-1.5 pt-1" style={{ fontFamily: preset.cssFont }}>
        {PREVIEW_MESSAGES.map((m) => (
          <MockRow key={m.id} msg={m} preset={preset} toneId={toneId ?? defaultTone(preset)} />
        ))}
      </div>
    </div>
  );
}

const APPEARANCE_TABS: Record<SurfaceKind, SettingsTabId> = {
  feed: "chatview",
  widget: "widget",
  overlay: "overlay",
};

export function MacAppearancePanel({
  feedStyleId,
  onOpenTab,
}: {
  feedStyleId?: string;
  onOpenTab: (tab: SettingsTabId) => void;
}) {
  const [surface, setSurface] = useState<SurfaceKind>("feed");
  const [tone, setTone] = useState<Record<SurfaceKind, string | undefined>>({
    feed: undefined,
    widget: undefined,
    overlay: undefined,
  });
  const surfaceLabel = SURFACES.find((s) => s.id === surface)?.label ?? "";
  const feedPreset = stylePreset(feedStyleId ?? "macos");
  const tones = feedPreset.tones;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        icon={Paintbrush}
        tint="#FF6482"
        title="Оформление"
        subtitle="21 стиль: палитра, шрифт, плашки и эффекты — раздельно по поверхностям"
      />
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
            <StyleCard
              key={s.id}
              preset={s}
              active={surface === "feed" && (feedStyleId ?? "clean") === s.id}
              onPick={() => onOpenTab(APPEARANCE_TABS[surface])}
            />
          ))}
        </div>

        {surface === "feed" && tones && tones.length > 0 && (
          <div className="flex items-center gap-3 rounded-[12px] bg-white/[0.045] px-4 py-3 ring-1 ring-white/[0.06]">
            <span className="text-[12.5px] font-medium text-white/75">Тон темы</span>
            <SegmentedControl
              id="tone-feed"
              value={tone.feed ?? defaultTone(feedPreset) ?? ""}
              onChange={(v) => setTone((t) => ({ ...t, feed: v }))}
              options={tones.map((t) => ({ value: t.id, label: t.name }))}
            />
            <span className="ml-auto text-[11px] text-white/35">выбор применяется в предпросмотре</span>
          </div>
        )}

        <div>
          <div className="px-1 pb-2 text-[12px] font-semibold uppercase tracking-wide text-white/40">
            Предпросмотр — {surfaceLabel}
          </div>
          <StylePreview surface={surface} toneId={tone[surface]} feedStyleId={feedStyleId} />
        </div>

        <SettingsCard>
          <div className="px-4 pb-1 pt-3.5 text-[12px] font-semibold uppercase tracking-wide text-white/40">
            Настройка поверх стиля
          </div>
          {[
            {
              tab: "chatview" as SettingsTabId,
              icon: MessageSquareText,
              title: "Лента чата",
              subtitle: "Размер текста, плотность, эффект появления, «только текст»",
            },
            {
              tab: "widget" as SettingsTabId,
              icon: MonitorPlay,
              title: "Виджет OBS",
              subtitle: "Прозрачный фон, окно виджета, шапка темы",
            },
            {
              tab: "overlay" as SettingsTabId,
              icon: PictureInPicture2,
              title: "Оверлей поверх игры",
              subtitle: "Прозрачность, строки, статистика, TikTok-счётчики",
            },
            {
              tab: "view" as SettingsTabId,
              icon: Frame,
              title: "Вид окна и «Только чат»",
              subtitle: "«Воздух», «Студия» или «macOS»; режим одной ленты",
            },
          ].map((row) => (
            <div key={row.tab} className="flex items-center gap-3 px-4 py-3">
              <row.icon size={13} className="shrink-0 text-white/50" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-white/90">{row.title}</div>
                <div className="mt-0.5 truncate text-[11.5px] text-white/45">{row.subtitle}</div>
              </div>
              <MacButton onClick={() => onOpenTab(row.tab)}>Открыть</MacButton>
            </div>
          ))}
        </SettingsCard>

        <SettingsCard>
          <SettingsRow
            icon={<MessagesSquare size={13} />}
            title="Текущая лента"
            subtitle={`Стиль «${feedPreset.name}» — выбирается в «Ленте чата»`}
            control={
              <MacButton primary onClick={() => onOpenTab("chatview")}>
                Изменить
              </MacButton>
            }
          />
        </SettingsCard>
      </div>
    </div>
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

export function MacSettingsPanel({
  accent,
  onAccent,
  onOpenTab,
}: {
  accent: string;
  onAccent: (v: string) => void;
  onOpenTab: (tab: SettingsTabId) => void;
}) {
  const [saved, setSaved] = useState(false);
  const [hotkeysGlobal, setHotkeysGlobal] = useState(true);
  const accents = ["#0A84FF", "#BF5AF2", "#FF453A", "#FF9F0A", "#30D158", "#FF375F"];

  const saveDiagnostics = () => {
    const payload = {
      app: "YawaChat",
      version: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown",
      at: new Date().toISOString(),
      platforms: PLATFORMS.map((p) => ({
        id: p.id,
        status: "ok",
        latency: 40 + Math.floor(Math.random() * 120),
      })),
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
      <PanelHeader
        icon={SettingsIcon}
        tint="#98989D"
        title="Настройки"
        subtitle="Приложение, акцент, горячие клавиши и помощь"
      />
      <div className="mac-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <SettingsCard>
          <SettingsRow
            icon={<Palette size={13} />}
            title="Акцентный цвет"
            subtitle="Кнопки, переключатели и слайдеры — как в macOS (сразу применяется к этому окну)"
            control={
              <div className="flex shrink-0 gap-1.5">
                {accents.map((a) => (
                  <button
                    key={a}
                    onClick={() => onAccent(a)}
                    className="h-5 w-5 shrink-0 cursor-pointer rounded-full transition-transform active:scale-90"
                    style={{
                      background: a,
                      boxShadow: accent === a ? `0 0 0 2px #1C1C1F, 0 0 0 4px ${a}` : "none",
                    }}
                    aria-label={a}
                  />
                ))}
              </div>
            }
          />
          <SettingsRow
            icon={<Keyboard size={13} />}
            title="Горячие клавиши работают в игре"
            subtitle="Глобальные сочетания не требуют фокуса окна"
            control={<MacToggle checked={hotkeysGlobal} onChange={setHotkeysGlobal} />}
          />
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

        <SettingsCard>
          <div className="px-4 pb-1 pt-3.5 text-[12px] font-semibold uppercase tracking-wide text-white/40">
            Горячие клавиши
          </div>
          {HOTKEYS.map((h) => (
            <div key={h.name} className="flex items-center gap-3 px-4 py-3">
              <Keyboard size={14} className="shrink-0 text-white/50" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white/85">{h.name}</span>
              <div className="flex shrink-0 gap-1">
                {h.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded-[6px] bg-white/[0.08] px-1.5 py-0.5 text-[10.5px] font-semibold text-white/70 shadow-[0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-white/[0.12]"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-end px-4 py-2.5">
            <MacButton onClick={() => onOpenTab("hotkeys")}>Настроить горячие клавиши…</MacButton>
          </div>
        </SettingsCard>

        <SettingsCard>
          <div className="px-4 pb-1 pt-3.5 text-[12px] font-semibold uppercase tracking-wide text-white/40">
            Помощь и связь
          </div>
          <SettingsRow
            icon={<LifeBuoy size={13} />}
            title="О приложении и диагностика"
            subtitle="Версия, хранилище, перезапуск, отчёты"
            control={<MacButton onClick={() => onOpenTab("system")}>Открыть</MacButton>}
          />
          <SettingsRow
            icon={<FolderGit2 size={13} />}
            title="Исходники проекта"
            subtitle="github.com/yawaside/YawaChatMacOS"
            control={<MacButton onClick={() => onOpenTab("system")}>Открыть</MacButton>}
          />
          <SettingsRow
            icon={<Send size={13} />}
            title="Поддержать автора"
            subtitle="donationalerts.com/r/yawaside"
            control={
              <MacButton primary onClick={() => onOpenTab("support")}>
                Донат
              </MacButton>
            }
          />
        </SettingsCard>

        <div className="pb-2 text-center text-[11px] text-white/30">
          YawaChat {typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : ""} · собрано с любовью
        </div>
      </div>
    </div>
  );
}
