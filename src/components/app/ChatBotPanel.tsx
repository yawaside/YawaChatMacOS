import { useState } from "react";
import { Bot, Plus, Timer, Trash2 } from "lucide-react";
import type { BotCommand, PlatformId, TwitchAutoPinConfig } from "../../lib/types";
import { PLATFORMS, PlatformIcon } from "../../lib/platforms";
import { usePersisted } from "../../lib/persist";
import { BotAuthCards } from "./BotAuth";
import { Box, TextInput, Toggle, ToggleRow } from "./ui";

export const DEFAULT_COMMANDS: BotCommand[] = [
  {
    id: "cmd1",
    trigger: "!команды",
    response: "Доступные команды: !вк, !розыгрыш, !song",
    cooldown: 30,
    enabled: true,
    platform: "all",
  },
  {
    id: "cmd2",
    trigger: "!вк",
    response: "Наша группа: vk.com/yawa",
    cooldown: 60,
    enabled: true,
    platform: "all",
  },
  {
    id: "cmd3",
    trigger: "!song",
    response: "Сейчас играет: lo-fi stream mix #12",
    cooldown: 15,
    enabled: false,
    platform: "twitch",
  },
];

interface Props {
  toast: (t: string) => void;
  commands?: BotCommand[];
  onUpdateCommands?: (cmds: BotCommand[] | ((p: BotCommand[]) => BotCommand[])) => void;
  autoPin?: TwitchAutoPinConfig;
  onUpdateAutoPin?: (patch: Partial<TwitchAutoPinConfig>) => void;
}

export default function ChatBotPanel({
  toast,
  commands: propCommands,
  onUpdateCommands,
  autoPin,
  onUpdateAutoPin,
}: Props) {
  const [localCommands, setLocalCommands] = usePersisted<BotCommand[]>("botCommands", DEFAULT_COMMANDS);
  const commands = propCommands ?? localCommands;
  const setCommands = onUpdateCommands ?? setLocalCommands;

  const [trigger, setTrigger] = useState("");
  const [response, setResponse] = useState("");
  const [cooldown, setCooldown] = useState(30);
  const [platform, setPlatform] = useState<PlatformId | "all">("all");

  const add = () => {
    const t = trigger.trim();
    const r = response.trim();
    if (!t || !r) return;
    if (!t.startsWith("!")) {
      toast("Команда должна начинаться с «!»");
      return;
    }
    if (commands.some((c) => c.trigger.toLowerCase() === t.toLowerCase())) {
      toast("Такая команда уже есть");
      return;
    }
    setCommands((p) => [
      ...p,
      { id: `cmd${Date.now()}`, trigger: t, response: r, cooldown, enabled: true, platform },
    ]);
    setTrigger("");
    setResponse("");
    toast("Команда добавлена");
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto">
      {/* Авторизация — без сворачиваемого блока: вход виден сразу.
          Отправка ответов доступна для аккаунтов Twitch и VK Видео Live. */}
      <div className="flex flex-col gap-2">
        <h3 className="text-[13px] font-bold" style={{ color: "var(--dw-text)" }}>
          Авторизация
        </h3>
        <BotAuthCards toast={toast} />
        <p className="text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
          Вход в Twitch или VK Видео Live нужен для отправки ответов на команды. Публичный чат обеих площадок
          приложение может читать без авторизации.
        </p>
      </div>

      {autoPin && onUpdateAutoPin && (
        <Box
          title="Сообщение при старте стрима"
          icon={<Bot size={14} style={{ color: "var(--dw-dim)" }} />}
          hint={autoPin?.enabled ? "включено" : "выключено"}
        >
          <div className="flex flex-col gap-2">
            <ToggleRow
              label="Автоматически отправлять и закреплять"
              hint="только для Twitch и только при переходе канала в эфир"
              checked={autoPin.enabled}
              onChange={(v) => onUpdateAutoPin({ enabled: v })}
            />
            <p className="text-[10.5px]" style={{ color: "var(--dw-dim)" }}>
              После перехода вашего Twitch-канала в эфир бот отправит сообщение и закрепит его.
            </p>
            {autoPin.enabled && (
              <>
                <textarea
                  value={autoPin.message}
                  maxLength={480}
                  onChange={(e) => onUpdateAutoPin({ message: e.target.value })}
                  placeholder="Сообщение для старта стрима…"
                  className="min-h-[70px] w-full resize-y rounded-lg border border-transparent px-2.5 py-2 text-[12px] outline-none focus:border-[var(--dw-accent)]"
                  style={{ background: "var(--dw-input)", color: "var(--dw-text)" }}
                />
                <label className="flex items-center gap-2 text-[11px]" style={{ color: "var(--dw-dim)" }}>
                  <span>Закрепление:</span>
                  <select
                    value={autoPin.durationSeconds === null ? "end" : String(autoPin.durationSeconds)}
                    onChange={(e) =>
                      onUpdateAutoPin({
                        durationSeconds: e.target.value === "end" ? null : Number(e.target.value),
                      })
                    }
                    className="rounded-lg px-2 py-1.5 outline-none"
                    style={{ background: "var(--dw-input)", color: "var(--dw-text)" }}
                  >
                    <option value="end" style={{ color: "#000" }}>
                      До конца трансляции
                    </option>
                    <option value="30" style={{ color: "#000" }}>
                      30 секунд
                    </option>
                    <option value="60" style={{ color: "#000" }}>
                      1 минута
                    </option>
                    <option value="300" style={{ color: "#000" }}>
                      5 минут
                    </option>
                    <option value="600" style={{ color: "#000" }}>
                      10 минут
                    </option>
                    <option value="1800" style={{ color: "#000" }}>
                      30 минут
                    </option>
                  </select>
                </label>
              </>
            )}
          </div>
        </Box>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {/* форма создания */}
        <Box
          title="Новая команда"
          icon={<Bot size={14} style={{ color: "var(--dw-dim)" }} />}
          hint={`команд: ${commands.length}`}
        >
          <div className="flex flex-col gap-2">
            <div className="flex gap-1.5">
              <TextInput
                value={trigger}
                onChange={(e) => setTrigger(e.target.value)}
                placeholder="!команда"
                className="w-32"
              />
              <div
                className="flex flex-1 items-center gap-1 rounded-lg px-2"
                style={{ background: "var(--dw-input)" }}
              >
                <Timer size={12} style={{ color: "var(--dw-dim)" }} />
                <input
                  type="number"
                  min={0}
                  max={3600}
                  value={cooldown}
                  onChange={(e) => setCooldown(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-transparent py-1.5 text-[12px] outline-none"
                  style={{ color: "var(--dw-text)" }}
                />
                <span className="text-[10px]" style={{ color: "var(--dw-dim)" }}>
                  сек
                </span>
              </div>
            </div>
            <TextInput
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder="текст ответа бота…"
            />
            <div className="flex flex-wrap gap-1 pb-1">
              <ScopeBtn id="all" name="Все" current={platform} set={setPlatform} />
              {PLATFORMS.filter((p) => p.id === "twitch" || p.id === "vkplay").map((p) => (
                <ScopeBtn key={p.id} id={p.id} name={p.short} current={platform} set={setPlatform} />
              ))}
            </div>
            <button
              onClick={add}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-lg py-2 text-[12.5px] font-semibold text-[var(--dw-accent-ink)] transition-all hover:brightness-110"
              style={{ background: "var(--dw-accent)" }}
            >
              <Plus size={14} /> Добавить команду
            </button>
          </div>
        </Box>

        {/* список */}
        <Box
          title={`Команды · ${commands.length}`}
          icon={<Bot size={14} style={{ color: "var(--dw-dim)" }} />}
        >
          <div className="flex max-h-[380px] flex-col gap-1.5 overflow-y-auto">
            {commands.length === 0 && (
              <p className="py-2 text-center text-[12px]" style={{ color: "var(--dw-dim)" }}>
                Команд пока нет — форма «команда → результат» слева
              </p>
            )}
            {commands.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border px-3 py-2"
                style={{
                  background: "var(--dw-panel2)",
                  borderColor: "var(--dw-line)",
                  opacity: c.enabled ? 1 : 0.5,
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-md px-1.5 py-0.5 text-[11.5px] font-bold"
                    style={{
                      background: "color-mix(in srgb, var(--dw-accent) 18%, transparent)",
                      color: "var(--dw-accent-2)",
                    }}
                  >
                    {c.trigger}
                  </span>
                  <span className="flex items-center gap-0.5 text-[10px]" style={{ color: "var(--dw-dim)" }}>
                    <Timer size={9} /> {c.cooldown}с
                  </span>
                  {c.platform !== "all" && <PlatformIcon id={c.platform} size={11} />}
                  <div className="ml-auto flex items-center gap-1.5">
                    <Toggle
                      checked={c.enabled}
                      onChange={(v) =>
                        setCommands((p) => p.map((x) => (x.id === c.id ? { ...x, enabled: v } : x)))
                      }
                    />
                    <button
                      className="cursor-pointer text-red-400"
                      onClick={() => setCommands((p) => p.filter((x) => x.id !== c.id))}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <p className="truncate pt-1 text-[11.5px]" style={{ color: "var(--dw-dim)" }}>
                  → {c.response}
                </p>
              </div>
            ))}
          </div>
        </Box>
      </div>
    </div>
  );
}

function ScopeBtn({
  id,
  name,
  current,
  set,
}: {
  id: PlatformId | "all";
  name: string;
  current: PlatformId | "all";
  set: (v: PlatformId | "all") => void;
}) {
  const on = current === id;
  return (
    <button
      onClick={() => set(id)}
      className="cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-medium transition-all"
      style={{
        background: on ? "color-mix(in srgb, var(--dw-accent) 18%, transparent)" : "var(--dw-input)",
        color: on ? "var(--dw-accent-2)" : "var(--dw-dim)",
        outline: on ? "1px solid var(--dw-accent)" : "none",
      }}
    >
      {name}
    </button>
  );
}
