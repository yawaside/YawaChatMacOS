import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IconBtn, Slider } from "./ui";

/**
 * Звуковой пульт в шапке (UI-4.1): кнопка экстренного глушения «Panic Mute»
 * и выпадающий регулятор громкости озвучки и уведомлений.
 *
 * Panic прерывает текущую фразу и чистит очередь одной кнопкой — прямо
 * во время эфира, без открытия настроек.
 */
export default function HeaderAudioControl({
  queueLength,
  ttsVolume,
  msgVolume,
  onTtsVolume,
  onMsgVolume,
  onPanic,
}: {
  /** сколько фраз ждёт в очереди чтения — для подсказки на кнопке */
  queueLength: number;
  /** громкость озвучки, 0–1 */
  ttsVolume: number;
  /** громкость звука уведомлений, 0–1 */
  msgVolume: number;
  onTtsVolume: (v: number) => void;
  onMsgVolume: (v: number) => void;
  onPanic: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  /* Закрытие кликом мимо панели и по Escape — как у панели здоровья эфира. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div ref={rootRef} className="no-drag relative flex items-center gap-0.5">
      <IconBtn
        icon={<VolumeX size={14} />}
        danger
        title={
          queueLength > 0
            ? `Прервать озвучку и очистить очередь (Panic Mute) — в очереди ${queueLength}`
            : "Прервать озвучку (Panic Mute)"
        }
        onClick={() => onPanic()}
      />
      <IconBtn
        icon={<Volume2 size={14} />}
        active={open}
        title="Громкость озвучки и уведомлений"
        onClick={() => setOpen((v) => !v)}
      />

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1.5 w-[248px] rounded-xl border p-3 shadow-2xl"
          style={{ background: "var(--dw-panel2)", borderColor: "var(--dw-line)" }}
        >
          <div
            className="flex items-center gap-1.5 text-[11.5px] font-semibold"
            style={{ color: "var(--dw-text)" }}
          >
            <Volume2 size={13} style={{ color: "var(--dw-accent-2)" }} />
            Громкость звука
          </div>

          <div className="mt-2.5">
            <div
              className="text-[9px] font-semibold tracking-wider uppercase"
              style={{ color: "var(--dw-dim)" }}
            >
              Озвучка (TTS)
            </div>
            <div className="mt-1">
              <Slider value={ttsVolume} min={0} max={1} step={0.05} onChange={onTtsVolume} format={pct} />
            </div>
          </div>

          <div className="mt-2.5 border-t pt-2.5" style={{ borderColor: "var(--dw-line)" }}>
            <div
              className="text-[9px] font-semibold tracking-wider uppercase"
              style={{ color: "var(--dw-dim)" }}
            >
              Уведомления о сообщениях
            </div>
            <div className="mt-1">
              <Slider value={msgVolume} min={0} max={1} step={0.05} onChange={onMsgVolume} format={pct} />
            </div>
          </div>

          <div
            className="mt-2.5 border-t pt-2 text-[9.5px]"
            style={{ borderColor: "var(--dw-line)", color: "var(--dw-dim)" }}
          >
            Красная кнопка рядом мгновенно прерывает чтение и очищает очередь.
          </div>
        </div>
      )}
    </div>
  );
}
