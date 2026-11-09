import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, RotateCw, X } from "lucide-react";
import type { Channel } from "../../lib/types";
import { CHANNEL_HELP } from "../../lib/channelHelp";
import { platformMeta } from "../../lib/platforms";

/** Одно и то же объяснение для боковой панели и нижнего дока «Бродкаст». */
export default function ChannelErrorDetails({
  channel,
  onReconnect,
}: {
  channel: Channel;
  onReconnect: (id: string) => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const helpRef = useRef<HTMLButtonElement>(null);
  const showError = channel.status === "error" || (channel.status === "connecting" && !!channel.errorReason);
  const meta = platformMeta(channel.platform);
  const closeHelp = useCallback(() => {
    setHelpOpen(false);
    helpRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!helpOpen) return;
    closeRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeHelp();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [helpOpen, closeHelp]);

  if (!showError) return null;

  return (
    <>
      <div className="border-t px-2.5 py-2" style={{ borderColor: "rgba(248,113,113,0.28)" }}>
        <p className="break-words text-[11px] leading-snug text-red-300" aria-live="polite">
          {channel.status === "connecting" && "Повторяем подключение. Последняя ошибка: "}
          {channel.errorReason ?? "Не удалось подключить канал. Проверьте имя или сеть."}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-semibold transition-colors hover:brightness-125"
            style={{ background: "var(--dw-accent)", color: "#fff" }}
            onClick={() => onReconnect(channel.id)}
          >
            <RotateCw size={11} /> Переподключить
          </button>
          <button
            type="button"
            ref={helpRef}
            className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-semibold transition-colors hover:brightness-125"
            style={{ background: "var(--dw-input)", color: "var(--dw-text)" }}
            onClick={() => setHelpOpen(true)}
          >
            <BookOpen size={11} /> Открыть инструкцию
          </button>
        </div>
      </div>
      {helpOpen &&
        createPortal(
          <div
            className="fade-anim fixed inset-0 z-[90] flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.7)" }}
            onMouseDown={closeHelp}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Инструкция по подключению ${meta.name}`}
              className="w-full max-w-[430px] rounded-xl border p-4 shadow-2xl"
              style={{
                background: "var(--dw-panel)",
                borderColor: "var(--dw-line)",
                color: "var(--dw-text)",
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[14px] font-bold">Как подключить {meta.name}</h2>
                <button
                  type="button"
                  ref={closeRef}
                  title="Закрыть инструкцию"
                  aria-label="Закрыть инструкцию"
                  className="cursor-pointer rounded-md p-1 hover:bg-[var(--dw-hover)]"
                  onClick={closeHelp}
                >
                  <X size={16} />
                </button>
              </div>
              <ol className="mt-3 list-inside list-decimal space-y-2 text-[12px] leading-relaxed">
                {CHANNEL_HELP[channel.platform].map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className="mt-3 text-[11px] leading-snug" style={{ color: "var(--dw-dim)" }}>
                Если причина связана с сетью, проверьте доступность площадки в браузере и попробуйте
                переподключиться. Канал без эфира может оставаться офлайн — это нормально.
              </p>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
