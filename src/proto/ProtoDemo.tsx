import { useEffect, useState } from "react";
import AirVariant from "./AirVariant";
import StudioVariant from "./StudioVariant";
import { INCOMING, INITIAL_MESSAGES } from "./demoData";
import type { DemoMessage } from "./demoData";

/**
 * Витрина вариантов интерфейса. Открывается по «/proto.html» на dev-сервере
 * и в сборку приложения не попадает: это макет на подставных данных.
 */

const VARIANTS = [
  { id: "air", name: "Воздух", note: "графит, светлые плашки, много воздуха" },
  { id: "studio", name: "Студия", note: "тёмная, плотная, всё рабочее под рукой" },
] as const;

type VariantId = (typeof VARIANTS)[number]["id"];

export default function ProtoDemo() {
  const [variant, setVariant] = useState<VariantId>("air");
  const [messages, setMessages] = useState<DemoMessage[]>(INITIAL_MESSAGES);
  const [live, setLive] = useState(true);
  const [chrome, setChrome] = useState(true);

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => {
      setMessages((prev) => {
        const next = INCOMING[prev.length % INCOMING.length];
        const now = new Date();
        const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        return [...prev.slice(-40), { ...next, id: prev[prev.length - 1].id + 1, time }];
      });
    }, 2600);
    return () => window.clearInterval(timer);
  }, [live]);

  return (
    <div
      className="flex h-full flex-col bg-[#0b0d10] text-[#e8ecf2]"
      style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-white/8 px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-[12.5px] font-bold">Переработанный интерфейс · два варианта</p>
          <p className="truncate text-[10.5px] text-white/45">
            макет на подставных данных: кнопки переключают экраны, но ничего не сохраняют
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-white/5 p-0.5">
          {VARIANTS.map((v) => (
            <button
              key={v.id}
              onClick={() => setVariant(v.id)}
              className="cursor-pointer rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition-colors"
              style={{
                background: variant === v.id ? "#b6f24a" : "transparent",
                color: variant === v.id ? "#0b0d10" : "rgba(255,255,255,0.6)",
              }}
              title={v.note}
            >
              {v.name}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setChrome((v) => !v)}
            className="cursor-pointer rounded-lg bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/65"
          >
            {chrome ? "Развернуть" : "В окне"}
          </button>
          <button
            onClick={() => setLive((v) => !v)}
            className="cursor-pointer rounded-lg bg-white/5 px-2.5 py-1 text-[11px] font-medium"
            style={{ color: live ? "#b6f24a" : "rgba(255,255,255,0.65)" }}
          >
            {live ? "Приём сообщений вкл." : "Приём выключен"}
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 p-3">
        <div
          className="mx-auto flex h-full flex-col overflow-hidden bg-[#101318] shadow-2xl transition-all"
          style={{
            maxWidth: chrome ? 1240 : "100%",
            borderRadius: chrome ? 14 : 10,
            boxShadow: chrome ? "0 18px 50px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.07)" : "none",
          }}
        >
          {chrome && (
            <div className="flex items-center gap-2 border-b border-white/6 px-3 py-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-2 text-[10.5px] text-white/40">YawaChatHub — макет</span>
            </div>
          )}
          <div className="min-h-0 flex-1">
            {variant === "air" ? <AirVariant messages={messages} /> : <StudioVariant messages={messages} />}
          </div>
        </div>
      </main>
    </div>
  );
}
