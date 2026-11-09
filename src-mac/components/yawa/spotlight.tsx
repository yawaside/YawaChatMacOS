"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AudioLines,
  Bot,
  CornerDownLeft,
  Disc3,
  HandCoins,
  KeyRound,
  MessagesSquare,
  Paintbrush,
  PictureInPicture2,
  Radio,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { SectionId } from "@/lib/types";

const ITEMS: Array<{ id: SectionId; label: string; hint: string; icon: LucideIcon }> = [
  { id: "chat", label: "Чат", hint: "Единая лента всех площадок", icon: MessagesSquare },
  { id: "channels", label: "Каналы", hint: "Подключённые стримы и статусы", icon: Radio },
  { id: "auth", label: "Авторизация", hint: "Вход в аккаунты площадок", icon: KeyRound },
  { id: "bot", label: "Чат-бот", hint: "Автоответы, режимы чата, модерация", icon: Bot },
  { id: "donations", label: "Донаты", hint: "DonationAlerts · DonatePay · MemeAlerts", icon: HandCoins },
  { id: "voice", label: "Озвучка", hint: "Edge TTS и фильтры сообщений", icon: AudioLines },
  { id: "sounds", label: "Звуки наград", hint: "Награды за баллы канала", icon: Disc3 },
  { id: "overlay", label: "Оверлей и OBS", hint: "Окно поверх игры, виджет чата", icon: PictureInPicture2 },
  { id: "appearance", label: "Оформление", hint: "Стили ленты, шрифты, плотность", icon: Paintbrush },
  { id: "settings", label: "Настройки", hint: "Акцент, горячие клавиши, диагностика", icon: Settings },
];

export function Spotlight({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (s: SectionId) => void;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
    }
  }, [open]);

  const results = useMemo(
    () => ITEMS.filter((i) => (i.label + i.hint).toLowerCase().includes(query.toLowerCase())),
    [query],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 grid place-items-start pt-[18vh] bg-black/20"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, y: -8, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.97, y: -6, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="w-[560px] max-w-[92vw] overflow-hidden rounded-[18px] bg-[#232326]/[0.92] shadow-[0_30px_90px_rgba(0,0,0,0.6)] ring-1 ring-white/[0.15] backdrop-blur-3xl"
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
                    onPick(results[cursor].id);
                    onClose();
                  }
                  if (e.key === "Escape") onClose();
                }}
                placeholder="Быстрый переход · разделы YawaChat"
                className="w-full bg-transparent text-[19px] font-light text-white/95 placeholder-white/30 outline-none"
              />
            </div>
            {results.length > 0 && (
              <div className="border-t border-white/[0.08] p-2">
                {results.map((r, i) => (
                  <button
                    key={r.id}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => {
                      onPick(r.id);
                      onClose();
                    }}
                    className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left transition-colors ${
                      i === cursor ? "bg-[#0A84FF]" : "hover:bg-white/[0.06]"
                    }`}
                  >
                    <r.icon size={17} className={i === cursor ? "text-white" : "text-white/60"} />
                    <span className="flex-1">
                      <span className={`block text-[14px] font-medium ${i === cursor ? "text-white" : "text-white/85"}`}>
                        {r.label}
                      </span>
                      <span className={`block text-[11.5px] ${i === cursor ? "text-white/75" : "text-white/40"}`}>
                        {r.hint}
                      </span>
                    </span>
                    {i === cursor && <CornerDownLeft size={13} className="text-white/80" />}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
