"use client";

/** Встроенные звуки оповещений — синтез через WebAudio, внешние файлы не нужны. */

export const BUILTIN_SOUNDS = ["Колокольчик", "Монетки", "Фанфары", "Звонок", "Аркада", "Пузырёк"] as const;
export type BuiltinSound = (typeof BUILTIN_SOUNDS)[number];

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function audio(): { ctx: AudioContext; master: GainNode } {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return { ctx, master: master! };
}

interface Note {
  f: number;
  t: number; // старт, сек
  d: number; // длительность
  type?: OscillatorType;
  gain?: number;
}

function playNotes(notes: Note[], volume = 1) {
  const { ctx: c, master } = audio();
  const t0 = c.currentTime;
  for (const n of notes) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = n.type ?? "sine";
    osc.frequency.value = n.f;
    g.gain.setValueAtTime(0, t0 + n.t);
    g.gain.linearRampToValueAtTime((n.gain ?? 0.5) * volume, t0 + n.t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + n.t + n.d);
    osc.connect(g);
    g.connect(master);
    osc.start(t0 + n.t);
    osc.stop(t0 + n.t + n.d + 0.05);
  }
}

const SEQUENCES: Record<BuiltinSound, Note[]> = {
  Колокольчик: [
    { f: 1568, t: 0, d: 0.7, gain: 0.4 },
    { f: 2093, t: 0.02, d: 0.5, gain: 0.18 },
    { f: 1568, t: 0.28, d: 0.9, gain: 0.3 },
  ],
  Монетки: [
    { f: 1319, t: 0, d: 0.1, type: "square", gain: 0.22 },
    { f: 1760, t: 0.09, d: 0.12, type: "square", gain: 0.22 },
    { f: 2349, t: 0.19, d: 0.45, type: "square", gain: 0.2 },
  ],
  Фанфары: [
    { f: 523, t: 0, d: 0.14, type: "triangle", gain: 0.4 },
    { f: 659, t: 0.13, d: 0.14, type: "triangle", gain: 0.4 },
    { f: 784, t: 0.26, d: 0.16, type: "triangle", gain: 0.4 },
    { f: 1047, t: 0.42, d: 0.55, type: "triangle", gain: 0.42 },
  ],
  Звонок: [
    { f: 880, t: 0, d: 0.28, type: "square", gain: 0.14 },
    { f: 880, t: 0.34, d: 0.28, type: "square", gain: 0.14 },
  ],
  Аркада: [
    { f: 660, t: 0, d: 0.09, type: "square", gain: 0.2 },
    { f: 880, t: 0.08, d: 0.09, type: "square", gain: 0.2 },
    { f: 1100, t: 0.16, d: 0.09, type: "square", gain: 0.2 },
    { f: 1320, t: 0.24, d: 0.22, type: "square", gain: 0.2 },
  ],
  Пузырёк: [
    { f: 300, t: 0, d: 0.16, type: "sine", gain: 0.45 },
    { f: 520, t: 0.08, d: 0.2, type: "sine", gain: 0.4 },
    { f: 780, t: 0.18, d: 0.3, type: "sine", gain: 0.35 },
  ],
};

/** Проиграть встроенный звук. */
export function playBuiltin(name: string, volume = 1) {
  const seq = SEQUENCES[name as BuiltinSound];
  if (!seq) return;
  try {
    playNotes(seq, volume);
  } catch {
    /* WebAudio недоступен */
  }
}

/** Проиграть пользовательский файл из dataURL. */
export function playDataUrl(data: string, volume = 1) {
  try {
    const el = new Audio(data);
    el.volume = Math.max(0, Math.min(1, volume));
    void el.play();
  } catch {
    /* noop */
  }
}
