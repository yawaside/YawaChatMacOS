"use client";

import { motion } from "framer-motion";
import {
  MessagesSquare,
  Radio,
  KeyRound,
  Bot,
  HandCoins,
  AudioLines,
  Disc3,
  PictureInPicture2,
  Paintbrush,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { SectionId } from "@/lib/types";

const GROUPS: Array<{
  title: string;
  items: Array<{ id: SectionId; label: string; icon: LucideIcon; tint: string }>;
}> = [
  {
    title: "Основное",
    items: [
      { id: "chat", label: "Чат", icon: MessagesSquare, tint: "#0A84FF" },
      { id: "channels", label: "Каналы", icon: Radio, tint: "#BF5AF2" },
      { id: "auth", label: "Авторизация", icon: KeyRound, tint: "#5AC8FA" },
      { id: "bot", label: "Чат-бот", icon: Bot, tint: "#FF9F0A" },
      { id: "donations", label: "Донаты", icon: HandCoins, tint: "#FFD60A" },
    ],
  },
  {
    title: "Звук",
    items: [
      { id: "voice", label: "Озвучка", icon: AudioLines, tint: "#30D158" },
      { id: "sounds", label: "Звуки наград", icon: Disc3, tint: "#FF453A" },
    ],
  },
  {
    title: "Эфир",
    items: [{ id: "overlay", label: "Оверлей и OBS", icon: PictureInPicture2, tint: "#64D2FF" }],
  },
  {
    title: "Приложение",
    items: [
      { id: "appearance", label: "Оформление", icon: Paintbrush, tint: "#FF6482" },
      { id: "settings", label: "Настройки", icon: Settings, tint: "#98989D" },
    ],
  },
];

export function Sidebar({
  section,
  onSection,
  unread,
  liveCount,
}: {
  section: SectionId;
  onSection: (s: SectionId) => void;
  unread: number;
  liveCount: number;
}) {
  return (
    <aside className="flex w-[224px] shrink-0 flex-col border-r border-white/[0.06] bg-white/[0.045]">
      <nav className="mac-scroll min-h-0 flex-1 overflow-y-auto px-2.5 pb-3 pt-4">
        {GROUPS.map((g) => (
          <div key={g.title} className="mb-4">
            <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/35">{g.title}</div>
            <div className="flex flex-col gap-[3px]">
              {g.items.map((s) => {
                const active = section === s.id;
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    onClick={() => onSection(s.id)}
                    className={`relative flex h-[34px] items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] transition-colors ${
                      active ? "text-white" : "text-white/65 hover:bg-white/[0.06] hover:text-white/90"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="sb-active"
                        transition={{ type: "spring", stiffness: 480, damping: 38 }}
                        className="absolute inset-0 rounded-[8px] bg-white/[0.12] shadow-[0_1px_2px_rgba(0,0,0,0.3)] ring-1 ring-white/[0.06]"
                      />
                    )}
                    <span
                      className="relative grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[6px] text-white shadow-sm"
                      style={{ background: `linear-gradient(160deg, ${s.tint}, ${s.tint}CC)` }}
                    >
                      <Icon size={13} strokeWidth={2} />
                    </span>
                    <span className="relative min-w-0 flex-1 truncate font-medium">{s.label}</span>
                    {s.id === "chat" && unread > 0 && !active && (
                      <span className="relative shrink-0 rounded-full bg-[#FF453A] px-1.5 py-px text-[10px] font-bold tabular-nums text-white">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-2.5 rounded-[10px] bg-white/[0.05] p-2.5 ring-1 ring-white/[0.06]">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#5E5CE6] to-[#BF5AF2] text-[13px] font-bold text-white shadow">
            Y
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[12.5px] font-semibold text-white/90">yawaside</div>
            <div className="flex items-center gap-1 text-[10.5px] text-[#30D158]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#30D158]" />
              <span className="truncate">В эфире · {liveCount} площадки</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
