"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, SendHorizonal, Eye, MessagesSquare, HandCoins, Users, ChartColumnBig, X } from "lucide-react";
import type { Appearance, Channel, ChatMessage, PlatformId } from "@/lib/types";
import { PlatformIcon, platformMeta } from "@/lib/platforms";
import {
  DENSITY_PAD,
  defaultTone,
  ensureStyleFont,
  stylePreset,
  tonePalette,
  type Density4,
} from "@/lib/styles";
import { MessageRow, type FeedFx } from "./feed";

function Stats({ messages, channels }: { messages: ChatMessage[]; channels: Channel[] }) {
  const donations = messages.filter((m) => m.kind === "donation");
  const sum = donations.reduce((acc, m) => acc + (m.amount ?? 0), 0);
  const viewers = channels.filter((c) => c.live).reduce((a, c) => a + c.viewers, 0);
  const recent = messages.slice(-20);
  const bars = Array.from({ length: 14 }, (_, i) => {
    const v = recent.filter((_, idx) => idx % 14 === i).length;
    return 20 + Math.min(80, v * 26 + ((i * 37 + recent.length * 7) % 30));
  });

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 236, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      className="shrink-0 overflow-hidden border-l border-white/[0.06] bg-white/[0.03]"
    >
      <div className="mac-scroll flex h-full w-[236px] flex-col gap-3 overflow-y-auto p-3.5 backdrop-blur-xl">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-white/35">Сводка эфира</div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: Users, label: "Зрители", value: viewers.toLocaleString("ru-RU"), tint: "#30D158" },
            { icon: MessagesSquare, label: "Сообщений", value: String(messages.length), tint: "#0A84FF" },
            { icon: HandCoins, label: "Донаты", value: `${sum.toLocaleString("ru-RU")} ₽`, tint: "#FFD60A" },
            { icon: Eye, label: "Площадки", value: String(channels.filter((c) => c.live).length), tint: "#BF5AF2" },
          ].map((s) => (
            <div key={s.label} className="min-w-0 rounded-[12px] bg-white/[0.05] p-2.5 ring-1 ring-white/[0.06]">
              <s.icon size={13} style={{ color: s.tint }} />
              <div className="mt-1.5 truncate text-[15px] font-bold tabular-nums text-white/90">{s.value}</div>
              <div className="truncate text-[10px] text-white/40">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="rounded-[12px] bg-white/[0.05] p-3 ring-1 ring-white/[0.06]">
          <div className="flex h-4 items-center justify-between">
            <span className="text-[11px] font-medium text-white/50">Активность чата</span>
            <span className="text-[10px] tabular-nums text-[#30D158]">live</span>
          </div>
          <div className="mt-2 flex h-12 items-end gap-[3px]">
            {bars.map((h, i) => (
              <motion.div
                key={i}
                initial={false}
                animate={{ height: `${h}%` }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="flex-1 rounded-sm bg-gradient-to-t from-[#0A84FF]/40 to-[#64D2FF]"
              />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

const DENSITY_MAP: Record<Appearance["density"], Density4 | undefined> = {
  compact: "compact",
  normal: undefined,
  roomy: "cozy",
};

export function ChatPanel({
  messages,
  channels,
  onSend,
  appearance,
}: {
  messages: ChatMessage[];
  channels: Channel[];
  onSend: (text: string, platform: PlatformId) => void;
  appearance: Appearance;
}) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [target, setTarget] = useState<PlatformId>("twitch");
  const [showStats, setShowStats] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const preset = stylePreset(appearance.feedStyle);
  const toneId = appearance.feedTone ?? defaultTone(preset);
  const pal = tonePalette(preset, toneId);
  const tone = preset.tones?.find((t) => t.id === toneId);

  useEffect(() => {
    ensureStyleFont(preset);
  }, [preset]);

  const fx: FeedFx = {
    preset,
    tone,
    effect: appearance.effect,
    fontSize: appearance.fontSize,
    densityPad: DENSITY_MAP[appearance.density] ? DENSITY_PAD[DENSITY_MAP[appearance.density]!] : undefined,
    mentions: appearance.mentions,
  };

  const visible = messages.filter(
    (m) =>
      !(appearance.hideEvents && m.kind === "event") &&
      (!query ||
        m.text.toLowerCase().includes(query.toLowerCase()) ||
        m.author.toLowerCase().includes(query.toLowerCase())),
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [visible]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text, target);
    setDraft("");
    stick.current = true;
  };

  const feedFont = preset.cssFont;

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[46px] shrink-0 items-center gap-3 border-b border-white/[0.06] px-4">
          <div className="relative w-full max-w-xs shrink-0">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/35" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по ленте"
              className="ring-accent w-full rounded-lg bg-white/[0.07] py-1.5 pl-8 pr-3 text-[12px] text-white/90 placeholder-white/30 outline-none ring-1 ring-white/[0.08] transition-shadow focus:ring-2"
            />
          </div>
          <button
            onClick={() => setShowStats((s) => !s)}
            title="Сводка эфира"
            className={`ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1 transition-colors ${
              showStats
                ? "bg-accent text-white ring-transparent"
                : "bg-white/[0.06] text-white/55 ring-white/10 hover:bg-white/[0.12] hover:text-white/85"
            }`}
          >
            {showStats ? <X size={14} /> : <ChartColumnBig size={14} />}
          </button>
        </div>

        <div className={`min-h-0 flex-1 ${appearance.chatFrame ? "p-3" : ""}`}>
          <div
            className={`relative flex h-full min-h-0 flex-col ${appearance.chatFrame ? "overflow-hidden rounded-[16px]" : ""}`}
            style={
              appearance.chatFrame
                ? { background: pal.chromeBg, boxShadow: `inset 0 0 0 1.5px ${pal.chromeRing}` }
                : undefined
            }
          >
            {appearance.chatFrame && (
              <>
                <div className={`decor decor-${preset.decor} pointer-events-none absolute inset-0`} />
                <div
                  className="relative flex h-8 shrink-0 items-center gap-2 px-3.5 text-[10px] font-bold uppercase tracking-[0.16em]"
                  style={{
                    color: pal.chromeText,
                    fontFamily: feedFont,
                    boxShadow: `inset 0 -1px 0 ${pal.chromeRing}`,
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: pal.accent }} />
                  {preset.name}
                  {tone ? ` · ${tone.name}` : ""}
                  <span className="ml-auto normal-case tracking-normal opacity-60">чат</span>
                </div>
              </>
            )}
            <div
              ref={scrollRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
              }}
              className="mac-scroll relative min-h-0 flex-1 overflow-y-auto px-2 py-2"
              style={{ fontFamily: feedFont }}
            >
              {!appearance.chatFrame && preset.decor !== "none" && (
                <div className={`decor decor-${preset.decor} pointer-events-none absolute inset-0`} />
              )}
              <AnimatePresence initial={false}>
                {visible.map((m) => (
                  <MessageRow key={m.id} msg={m} fx={fx} />
                ))}
              </AnimatePresence>
              {visible.length === 0 && (
                <div className="grid h-full place-items-center text-[12px] text-white/35">Ничего не найдено</div>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-white/[0.06] p-3">
          <div className="mb-2 flex h-6 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {channels
              .filter((c) => c.enabled && c.live)
              .map((c) => {
                const meta = platformMeta(c.platform);
                const active = target === c.platform;
                return (
                  <button
                    key={c.id}
                    onClick={() => setTarget(c.platform)}
                    className={`flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium ring-1 transition-colors ${
                      active
                        ? "text-white ring-transparent"
                        : "bg-white/[0.05] text-white/50 ring-white/[0.08] hover:text-white/80"
                    }`}
                    style={active ? { background: `linear-gradient(150deg, ${meta.color}, ${meta.color}B8)` } : undefined}
                  >
                    <PlatformIcon id={c.platform} size={11} color={active ? "#fff" : undefined} />
                    {c.name}
                  </button>
                );
              })}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={`Сообщение в ${platformMeta(target).name}…`}
              className="ring-accent h-9 flex-1 rounded-[10px] bg-white/[0.07] px-3.5 text-[13px] text-white/90 placeholder-white/30 outline-none ring-1 ring-white/[0.08] transition-shadow focus:ring-2"
            />
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={send}
              className="bg-accent grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-white shadow-[0_4px_14px_rgba(0,0,0,0.4)] transition-[filter] hover:brightness-110"
              aria-label="Отправить"
            >
              <SendHorizonal size={16} />
            </motion.button>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>{showStats && <Stats messages={messages} channels={channels} />}</AnimatePresence>
    </div>
  );
}
