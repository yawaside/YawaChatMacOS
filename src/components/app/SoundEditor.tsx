import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Pause, Play, RotateCcw, Save, Scissors, Sparkles, Trash2 } from "lucide-react";
import type { CustomSound } from "../../lib/donateSounds";
import { playDonateSound } from "../../lib/donateSounds";

/** Минимальная длина выбранного фрагмента — короче уже не слышно. */
const MIN_CLIP = 0.08;

function fmt(v: number): string {
  if (!Number.isFinite(v) || v < 0) return "0:00.0";
  const m = Math.floor(v / 60);
  const s = v % 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Пики волны: по каждому столбику берём максимум амплитуды. */
function computePeaks(buffer: AudioBuffer, bars: number): Float32Array {
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const peaks = new Float32Array(bars);
  const total = ch0.length;
  const perBar = total / bars;
  let peakMax = 0;
  for (let i = 0; i < bars; i++) {
    const from = Math.floor(i * perBar);
    const to = Math.min(total, Math.floor((i + 1) * perBar));
    let max = 0;
    const step = Math.max(1, Math.floor((to - from) / 80));
    for (let j = from; j < to; j += step) {
      let a = Math.abs(ch0[j]);
      if (ch1) a = Math.max(a, Math.abs(ch1[j]));
      if (a > max) max = a;
    }
    peaks[i] = max;
    if (max > peakMax) peakMax = max;
  }
  if (peakMax > 0) {
    for (let i = 0; i < bars; i++) peaks[i] /= peakMax;
  }
  return peaks;
}

type DragKind = "start" | "end" | "move" | "create";

interface Props {
  sound: CustomSound;
  onSave: (patch: Partial<CustomSound>) => void;
  onDelete: () => void;
  toast: (t: string) => void;
  /** сразу раскрыть редактор — для только что добавленного файла */
  defaultOpen?: boolean;
  /** дублировать прослушивание во внешний приёмник (например, виджет наград OBS) */
  onPreview?: (id: string, volume: number) => void;
}

/**
 * Карточка своего звука с панелью обрезки, как в обычных аудиоредакторах:
 * волна, выделенный фрагмент, маркеры начала/конца, прослушивание и
 * явная кнопка «Сохранить». Пока не нажали — в уведомлениях играет старое.
 */
export default function CustomSoundCard({
  sound,
  onSave,
  onDelete,
  toast,
  defaultOpen = false,
  onPreview,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [duration, setDuration] = useState(0);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [draftStart, setDraftStart] = useState(() => Math.max(0, Number(sound.trimStart) || 0));
  const [draftEnd, setDraftEnd] = useState(() => Number(sound.trimEnd) || 0);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [cursor, setCursor] = useState<"default" | "ew-resize" | "grab" | "crosshair">("crosshair");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const dragRef = useRef<{
    kind: DragKind;
    originT: number;
    originStart: number;
    originEnd: number;
  } | null>(null);
  const selRef = useRef({ start: 0, end: 0 });

  const start = Math.max(0, draftStart);
  const endAbs = draftEnd > start ? draftEnd : duration;
  const clipEnd = duration > 0 ? clamp(endAbs, start + MIN_CLIP, duration) : endAbs;
  selRef.current = { start, end: clipEnd };

  const savedStart = Math.max(0, Number(sound.trimStart) || 0);
  const savedEnd = Number(sound.trimEnd) || 0;
  const savedEndAbs = savedEnd > savedStart ? savedEnd : duration;
  const dirty =
    duration > 0 && (Math.abs(start - savedStart) > 0.02 || Math.abs(clipEnd - savedEndAbs) > 0.02);

  // подхватить сохранённые границы, если их поменяли снаружи (после «Сохранить»)
  useEffect(() => {
    setDraftStart(Math.max(0, Number(sound.trimStart) || 0));
    setDraftEnd(Number(sound.trimEnd) || 0);
  }, [sound.id, sound.trimStart, sound.trimEnd]);

  // элемент для прослушивания + длительность из метаданных
  useEffect(() => {
    const el = new Audio(sound.dataUrl);
    el.preload = "auto";
    audioRef.current = el;
    const onMeta = () => {
      const d = Number(el.duration);
      if (Number.isFinite(d) && d > 0) setDuration(d);
    };
    el.addEventListener("loadedmetadata", onMeta);
    return () => {
      el.removeEventListener("loadedmetadata", onMeta);
      try {
        el.pause();
      } catch {
        /* noop */
      }
      audioRef.current = null;
    };
  }, [sound.dataUrl]);

  // волна — только когда редактор открыт
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(sound.dataUrl);
        const raw = await res.arrayBuffer();
        const ac = new AudioContext();
        try {
          const buf = await ac.decodeAudioData(raw.slice(0));
          if (cancelled) return;
          if (Number.isFinite(buf.duration) && buf.duration > 0) setDuration(buf.duration);
          setPeaks(computePeaks(buf, 280));
        } finally {
          void ac.close();
        }
      } catch {
        if (!cancelled) setPeaks(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [open, sound.dataUrl]);

  const stopPlay = useCallback(() => {
    window.cancelAnimationFrame(rafRef.current);
    try {
      audioRef.current?.pause();
    } catch {
      /* noop */
    }
    setPlaying(false);
    setPlayhead(null);
  }, []);

  useEffect(() => () => stopPlay(), [stopPlay]);
  useEffect(() => {
    if (!open) stopPlay();
  }, [open, stopPlay]);

  const tick = useCallback(() => {
    const el = audioRef.current;
    if (!el || el.paused) {
      setPlaying(false);
      setPlayhead(null);
      return;
    }
    const t = el.currentTime;
    setPlayhead(t);
    if (t >= selRef.current.end - 0.03) {
      try {
        el.pause();
      } catch {
        /* noop */
      }
      setPlaying(false);
      setPlayhead(null);
      return;
    }
    rafRef.current = window.requestAnimationFrame(tick);
  }, []);

  const playDraft = () => {
    const el = audioRef.current;
    if (!el || duration <= 0) return;
    if (playing) {
      stopPlay();
      return;
    }
    try {
      el.pause();
      el.currentTime = Math.min(start, Math.max(0, duration - 0.05));
      onPreview?.(sound.id, 0.8);
      void el
        .play()
        .then(() => {
          setPlaying(true);
          setPlayhead(start);
          window.cancelAnimationFrame(rafRef.current);
          rafRef.current = window.requestAnimationFrame(tick);
        })
        .catch(() => undefined);
    } catch {
      /* noop */
    }
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;
    const dpr = window.devicePixelRatio || 1;
    const w = box.clientWidth;
    const h = box.clientHeight;
    if (w < 2 || h < 2) return;
    const pw = Math.floor(w * dpr);
    const ph = Math.floor(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const styles = getComputedStyle(canvas);
    const accent = styles.getPropertyValue("--dw-accent-2").trim() || "#a78bfa";
    const dim = styles.getPropertyValue("--dw-dim").trim() || "#8b91a8";
    const mid = h / 2;
    const dur = duration || 1;
    const startX = (start / dur) * w;
    const endX = (clipEnd / dur) * w;

    if (peaks && peaks.length > 0) {
      const n = peaks.length;
      const barW = w / n;
      for (let i = 0; i < n; i++) {
        const x = i * barW;
        const amp = Math.max(0.05, peaks[i]);
        const bh = amp * (h * 0.84);
        const cx = x + barW * 0.5;
        const inSel = cx >= startX && cx <= endX;
        ctx.globalAlpha = inSel ? 0.95 : 0.32;
        ctx.fillStyle = inSel ? accent : dim;
        ctx.fillRect(x + 0.35, mid - bh / 2, Math.max(1, barW - 0.7), bh);
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = dim;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(w, mid);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }, [peaks, duration, start, clipEnd]);

  useEffect(() => {
    if (!open) return;
    draw();
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(box);
    return () => ro.disconnect();
  }, [open, draw]);

  const timeAt = (clientX: number): number => {
    const box = boxRef.current;
    if (!box || duration <= 0) return 0;
    const rect = box.getBoundingClientRect();
    const x = clamp(clientX - rect.left, 0, rect.width);
    return (x / rect.width) * duration;
  };

  const hitKind = (t: number): DragKind => {
    if (duration <= 0) return "create";
    const box = boxRef.current;
    const w = box?.clientWidth ?? 1;
    const px = (dt: number) => (Math.abs(dt) / duration) * w;
    if (px(t - start) <= 10) return "start";
    if (px(t - clipEnd) <= 10) return "end";
    if (t > start && t < clipEnd) return "move";
    return "create";
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    stopPlay();
    const t = timeAt(e.clientX);
    const kind = hitKind(t);
    dragRef.current = { kind, originT: t, originStart: start, originEnd: clipEnd };
    if (kind === "create") {
      setDraftStart(clamp(t, 0, Math.max(0, duration - MIN_CLIP)));
      setDraftEnd(clamp(t + MIN_CLIP, MIN_CLIP, duration));
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const t = timeAt(e.clientX);
    if (!dragRef.current) {
      const kind = hitKind(t);
      setCursor(kind === "start" || kind === "end" ? "ew-resize" : kind === "move" ? "grab" : "crosshair");
      return;
    }
    const d = dragRef.current;
    const maxStart = Math.max(0, duration - MIN_CLIP);
    if (d.kind === "start") {
      setDraftStart(clamp(t, 0, d.originEnd - MIN_CLIP));
    } else if (d.kind === "end") {
      const next = clamp(t, d.originStart + MIN_CLIP, duration);
      setDraftEnd(next >= duration - 0.04 ? 0 : next);
    } else if (d.kind === "move") {
      const span = d.originEnd - d.originStart;
      const delta = t - d.originT;
      const ns = clamp(d.originStart + delta, 0, duration - span);
      setDraftStart(ns);
      setDraftEnd(ns + span >= duration - 0.04 ? 0 : ns + span);
    } else {
      const a = d.originT;
      const lo = clamp(Math.min(a, t), 0, maxStart);
      const hi = clamp(Math.max(a, t), lo + MIN_CLIP, duration);
      setDraftStart(lo);
      setDraftEnd(hi >= duration - 0.04 ? 0 : hi);
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    dragRef.current = null;
  };

  const save = () => {
    if (!dirty || duration <= 0) return;
    const trimStart = Math.round(start * 100) / 100;
    const trimEnd = clipEnd >= duration - 0.04 ? 0 : Math.round(clipEnd * 100) / 100;
    onSave({ trimStart, trimEnd });
    toast("Фрагмент сохранён");
  };

  const reset = () => {
    stopPlay();
    setDraftStart(0);
    setDraftEnd(0);
  };

  const hasTrim = savedEnd > savedStart || savedStart > 0;
  const ticks = duration > 0 ? [0, 0.25, 0.5, 0.75, 1].map((p) => p * duration) : [];
  const startPct = duration > 0 ? (start / duration) * 100 : 0;
  const endPct = duration > 0 ? (clipEnd / duration) * 100 : 100;
  const playPct = duration > 0 && playhead != null ? (playhead / duration) * 100 : 0;

  return (
    <div
      className="rounded-lg border px-2 py-1.5"
      style={{ background: "var(--dw-input)", borderColor: open ? "var(--dw-accent)" : "transparent" }}
    >
      <div className="flex items-center gap-2">
        <Sparkles size={13} style={{ color: "var(--dw-accent-2)" }} />
        <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: "var(--dw-text)" }}>
          {sound.name}
        </span>
        <span className="shrink-0 text-[10.5px] tabular-nums" style={{ color: "var(--dw-dim)" }}>
          {hasTrim
            ? `${fmt(savedStart)}–${fmt(savedEndAbs || duration)}`
            : duration > 0
              ? fmt(duration)
              : "…"}
        </span>
        {dirty && (
          <span className="shrink-0 text-[10px] font-semibold" style={{ color: "#fbbf24" }}>
            не сохранено
          </span>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          title="Открыть редактор фрагмента"
          className="cursor-pointer rounded-md p-1 transition-colors hover:bg-[var(--dw-hover)]"
          style={{ color: open ? "var(--dw-accent-2)" : "var(--dw-dim)" }}
        >
          <Scissors size={13} />
        </button>
        <button
          onClick={() => playDonateSound(sound.id, 0.85)}
          title="Прослушать сохранённый фрагмент"
          className="cursor-pointer rounded-md p-1 transition-colors hover:bg-[var(--dw-hover)]"
          style={{ color: "var(--dw-dim)" }}
        >
          <Play size={13} />
        </button>
        <button
          onClick={onDelete}
          title="Удалить"
          className="cursor-pointer rounded-md p-1 transition-colors hover:bg-[var(--dw-hover)]"
          style={{ color: "#f87171" }}
        >
          <Trash2 size={13} />
        </button>
      </div>

      {open && (
        <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--dw-line)" }}>
          <div
            className="mb-1.5 flex items-center justify-between gap-2 text-[11px]"
            style={{ color: "var(--dw-dim)" }}
          >
            <span>Выделите фрагмент на волне — как в обычном редакторе звука</span>
            <span className="tabular-nums" style={{ color: "var(--dw-text)" }}>
              {fmt(start)} → {fmt(clipEnd)} · {fmt(Math.max(0, clipEnd - start))}
            </span>
          </div>

          <div
            className="mb-0.5 flex justify-between text-[9.5px] tabular-nums"
            style={{ color: "var(--dw-dim)" }}
          >
            {ticks.map((t, i) => (
              <span key={i}>{fmt(t)}</span>
            ))}
          </div>

          <div
            ref={boxRef}
            className="relative h-[92px] overflow-hidden rounded-lg"
            style={{ background: "var(--dw-bg)", cursor, touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

            {/* затемнение за пределами выделения */}
            <div
              className="pointer-events-none absolute inset-y-0 left-0"
              style={{ width: `${startPct}%`, background: "rgba(0,0,0,0.45)" }}
            />
            <div
              className="pointer-events-none absolute inset-y-0"
              style={{ left: `${endPct}%`, right: 0, background: "rgba(0,0,0,0.45)" }}
            />

            {/* рамка выделения */}
            <div
              className="pointer-events-none absolute inset-y-0"
              style={{
                left: `${startPct}%`,
                width: `${Math.max(0, endPct - startPct)}%`,
                boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--dw-accent) 70%, transparent)",
                background: "color-mix(in srgb, var(--dw-accent) 12%, transparent)",
              }}
            />

            {/* маркеры in / out */}
            <Handle pct={startPct} label="in" />
            <Handle pct={endPct} label="out" />

            {playing && playhead != null && (
              <div
                className="pointer-events-none absolute top-0 bottom-0 w-px"
                style={{
                  left: `${playPct}%`,
                  background: "#fff",
                  boxShadow: "0 0 8px rgba(255,255,255,0.85)",
                }}
              />
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={playDraft}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--dw-accent-ink)] transition-all hover:brightness-110"
              style={{ background: "var(--dw-accent)" }}
            >
              {playing ? <Pause size={12} /> : <Play size={12} />}
              {playing ? "Стоп" : "Прослушать"}
            </button>
            <button
              onClick={reset}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] font-semibold transition-colors hover:bg-[var(--dw-hover)]"
              style={{ color: "var(--dw-dim)" }}
            >
              <RotateCcw size={12} /> Сбросить
            </button>
            <span className="ml-auto" />
            <button
              onClick={save}
              disabled={!dirty}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold text-[var(--dw-accent-ink)] transition-all hover:brightness-110 disabled:cursor-default disabled:opacity-40"
              style={{ background: dirty ? "var(--dw-accent)" : "var(--range-rest)" }}
              title={dirty ? "Записать фрагмент для уведомлений" : "Нет изменений"}
            >
              <Save size={12} /> Сохранить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Handle({ pct, label }: { pct: number; label: string }) {
  return (
    <div className="pointer-events-none absolute top-0 bottom-0" style={{ left: `${pct}%`, width: 0 }}>
      <div className="absolute top-0 bottom-0" style={{ left: -1, width: 2, background: "#fff" }} />
      <div
        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[var(--dw-accent-ink)]"
        style={{ background: "var(--dw-accent)", boxShadow: "0 1px 4px rgba(0,0,0,0.45)" }}
      >
        {label}
      </div>
    </div>
  );
}
