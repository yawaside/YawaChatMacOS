"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Volume2, VolumeX, PanelLeft, CircleDot } from "lucide-react";
import type { Appearance, Channel, ChatMessage, PlatformId, SectionId } from "@/lib/types";
import { randomMessage } from "@/lib/demo";
import { TrafficLights } from "@/components/macos/controls";
import { Sidebar } from "./sidebar";
import { ChatPanel } from "./chat-panel";
import {
  AppearancePanel,
  AuthPanel,
  ChannelsPanel,
  ChatbotPanel,
  DonationsPanel,
  OverlayPanel,
  SettingsPanel,
  SoundsPanel,
  VoicePanel,
} from "./panels";

const SECTION_TITLES: Record<SectionId, string> = {
  chat: "Чат",
  channels: "Каналы",
  auth: "Авторизация",
  bot: "Чат-бот",
  donations: "Донаты",
  voice: "Озвучка",
  sounds: "Звуки наград",
  overlay: "Оверлей и OBS",
  appearance: "Оформление",
  settings: "Настройки",
};

const DEFAULT_APPEARANCE: Appearance = {
  windowStyle: "studio",
  feedStyle: "macos",
  feedTone: "dark",
  widgetStyle: "macos",
  widgetTone: "dark",
  overlayStyle: "macos",
  overlayTone: "dark",
  fontSize: 0,
  density: "normal",
  radius: 12,
  effect: "slide",
  onlyChat: false,
  chatFrame: false,
  hideEvents: false,
  mentions: true,
  widgetWin: true,
  widgetWinOpacity: 62,
  widgetWinRadius: 16,
  widgetWinBar: true,
  widgetTransparent: true,
  accent: "#0A84FF",
};

export function AppWindow() {
  const [section, setSection] = useState<SectionId>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [unread, setUnread] = useState(0);
  const [muted, setMuted] = useState(false);
  const [ap, setApState] = useState<Appearance>(DEFAULT_APPEARANCE);

  const setAp = useCallback((patch: Partial<Appearance>) => setApState((a) => ({ ...a, ...patch })), []);

  const sectionRef = useRef(section);
  sectionRef.current = section;

  /* -------- загрузка данных -------- */
  useEffect(() => {
    fetch("/api/messages")
      .then((r) => r.json())
      .then((d) => setMessages(d.messages ?? []))
      .catch(() => {});
    fetch("/api/channels")
      .then((r) => r.json())
      .then((d) => setChannels(d.channels ?? []))
      .catch(() => {});
  }, []);

  /* -------- живой поток: новое сообщение каждые 2.4–5 c -------- */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const draft = randomMessage();
        const r = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        const d = await r.json();
        if (d.message) {
          setMessages((m) => [...m.slice(-160), d.message]);
          if (sectionRef.current !== "chat") setUnread((u) => u + 1);
        }
      } catch {
        /* игнорируем сетевые ошибки демо-потока */
      }
      timer = setTimeout(tick, 2400 + Math.random() * 2600);
    };
    timer = setTimeout(tick, 2000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  const selectSection = useCallback((s: SectionId) => {
    setSection(s);
    if (s === "chat") setUnread(0);
  }, []);

  /* -------- переход из Spotlight -------- */
  useEffect(() => {
    const onPick = (e: Event) => selectSection((e as CustomEvent<SectionId>).detail);
    window.addEventListener("yawa:section", onPick);
    return () => window.removeEventListener("yawa:section", onPick);
  }, [selectSection]);

  /* -------- горячая клавиша «Только чат»: Ctrl+Shift+C -------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        setApState((a) => ({ ...a, onlyChat: !a.onlyChat }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const send = useCallback(async (text: string, platform: PlatformId) => {
    try {
      const r = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, text, author: "yawaside", color: "#0A84FF", kind: "message", badges: [] }),
      });
      const d = await r.json();
      if (d.message) setMessages((m) => [...m, d.message]);
    } catch {
      /* noop */
    }
  }, []);

  const toggleChannel = useCallback(async (c: Channel) => {
    setChannels((chs) => chs.map((x) => (x.id === c.id ? { ...x, enabled: !x.enabled } : x)));
    await fetch("/api/channels", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, enabled: !c.enabled }),
    }).catch(() => {});
  }, []);

  const addChannel = useCallback(async (platform: string, name: string) => {
    try {
      const r = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, name }),
      });
      const d = await r.json();
      if (d.channel) setChannels((chs) => [...chs, d.channel]);
    } catch {
      /* noop */
    }
  }, []);

  const resetView = useCallback(() => {
    setSidebarOpen(true);
    setSection("chat");
    setUnread(0);
    setApState((a) => ({ ...a, onlyChat: false }));
  }, []);

  const liveCount = channels.filter((c) => c.live && c.enabled).length;
  const onlyChat = ap.onlyChat;
  const air = ap.windowStyle === "air";

  return (
    <div
      className="flex h-full flex-col text-white transition-colors duration-300"
      style={{
        ["--accent" as string]: ap.accent,
        background: air
          ? "linear-gradient(165deg, #2B2738 0%, #221F2E 45%, #1B1926 100%)"
          : "linear-gradient(165deg, #1D1D21 0%, #171719 45%, #131316 100%)",
      }}
    >
      {/* Заголовок окна в стиле macOS */}
      <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-white/[0.06] bg-white/[0.03] px-4">
        <div className="flex w-[180px] items-center gap-3">
          <TrafficLights
            onClose={resetView}
            onMinimize={() => setSidebarOpen((s) => !s)}
            onZoom={() => setApState((a) => ({ ...a, onlyChat: !a.onlyChat }))}
          />
          {!onlyChat && (
            <button
              onClick={() => setSidebarOpen((s) => !s)}
              className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white/85"
              title="Боковая панель"
              aria-label="Боковая панель"
            >
              <PanelLeft size={15} />
            </button>
          )}
        </div>

        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-center">
          <div className="text-[13px] font-semibold text-white/90">
            YawaChat{onlyChat ? "" : ` — ${SECTION_TITLES[section]}`}
          </div>
          <div className="flex h-3.5 items-center justify-center gap-1 text-[10px] text-[#30D158]">
            <CircleDot size={7} fill="currentColor" />
            В эфире · {liveCount} площадки подключены
          </div>
        </div>

        <div className="flex w-[180px] items-center justify-end">
          <button
            onClick={() => setMuted((m) => !m)}
            className={`flex h-7 w-[104px] items-center justify-center gap-1.5 rounded-full text-[11px] font-medium ring-1 transition-colors ${
              muted
                ? "bg-[#FF453A]/15 text-[#FF6B61] ring-[#FF453A]/30"
                : "bg-white/[0.06] text-white/70 ring-white/10 hover:bg-white/10"
            }`}
          >
            {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
            {muted ? "Звук выкл" : "Звук вкл"}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {!onlyChat && sidebarOpen && (
          <Sidebar
            section={section}
            onSection={selectSection}
            unread={unread}
            liveCount={channels.filter((c) => c.live && c.enabled).length}
          />
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={onlyChat ? "only-chat" : section}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
              className="flex min-h-0 flex-1 flex-col"
            >
              {(onlyChat || section === "chat") && (
                <ChatPanel messages={messages} channels={channels} onSend={send} appearance={ap} />
              )}
              {!onlyChat && section === "channels" && (
                <ChannelsPanel channels={channels} onToggle={toggleChannel} onAdd={addChannel} />
              )}
              {!onlyChat && section === "auth" && <AuthPanel />}
              {!onlyChat && section === "bot" && <ChatbotPanel />}
              {!onlyChat && section === "donations" && <DonationsPanel messages={messages} />}
              {!onlyChat && section === "voice" && <VoicePanel />}
              {!onlyChat && section === "sounds" && <SoundsPanel />}
              {!onlyChat && section === "overlay" && <OverlayPanel messages={messages} ap={ap} />}
              {!onlyChat && section === "appearance" && <AppearancePanel ap={ap} setAp={setAp} />}
              {!onlyChat && section === "settings" && <SettingsPanel accent={ap.accent} setAccent={(v) => setAp({ accent: v })} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
