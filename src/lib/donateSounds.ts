/**
 * Звуки уведомлений: донаты, сообщения и события эфира.
 *
 * Встроенные звуки синтезируются на лету, без внешних файлов: приложение
 * остаётся одним exe, а набор сигналов не зависит от наличия аудиофайлов.
 * Дополнительно поддерживаются СВОИ звуки — файл с компьютера пользователя
 * (идентификатор вида `custom:<id>`).
 */

export type DonateSoundId =
  | "none"
  | "chime"
  | "coins"
  | "fanfare"
  | "bell"
  | "arcade"
  | "pop"
  /* шуточные */
  | "boing"
  | "duck"
  | "trombone"
  | "wow"
  | "siren";

export interface DonateSound {
  id: DonateSoundId;
  name: string;
  hint: string;
  /** шуточный звук — показывается отдельной группой */
  funny?: boolean;
}

export const DONATE_SOUNDS: DonateSound[] = [
  { id: "chime", name: "Колокольчик", hint: "мягкий двойной сигнал" },
  { id: "coins", name: "Монетки", hint: "звон падающих монет" },
  { id: "fanfare", name: "Фанфары", hint: "торжественный аккорд" },
  { id: "bell", name: "Звонок", hint: "короткий чистый удар" },
  { id: "arcade", name: "Аркада", hint: "игровой сигнал вверх" },
  { id: "pop", name: "Пузырёк", hint: "лёгкий короткий хлопок" },
  /* шуточные */
  { id: "boing", name: "Пружина", hint: "мультяшный прыжок", funny: true },
  { id: "duck", name: "Утка", hint: "кряканье", funny: true },
  { id: "trombone", name: "Грустный тромбон", hint: "классическое «ну вот»", funny: true },
  { id: "wow", name: "Вау", hint: "удивлённый возглас", funny: true },
  { id: "siren", name: "Сирена", hint: "шуточная тревога", funny: true },
  { id: "none", name: "Без звука", hint: "оповещение отключено" },
];

export const DEFAULT_DONATE_SOUND: DonateSoundId = "chime";

/* ---------------- свои звуки пользователя ---------------- */

export interface CustomSound {
  /** идентификатор вида `custom:1712345678901` */
  id: string;
  name: string;
  /** файл, сохранённый как data-URL — работает и без доступа к диску */
  dataUrl: string;
  /** вырезанный фрагмент (секунды): start >= 0, end > start или 0 = до конца */
  trimStart?: number;
  trimEnd?: number;
}

/** Ключ настройки со списком своих звуков. */
export const CUSTOM_SOUNDS_KEY = "customSounds";

/**
 * Ключ настройки со списком своих звуков НАГРАД за баллы канала.
 * Отдельный список: такие файлы не предлагаются в обычных уведомлениях.
 */
export const REWARD_CUSTOM_SOUNDS_KEY = "customRewardSounds";

/** Максимальный размер своего звука: 2 МБ — хватает на короткий сигнал. */
export const CUSTOM_SOUND_MAX_BYTES = 2 * 1024 * 1024;

export const isCustomSound = (id: string | undefined): boolean => !!id?.startsWith("custom:");

/** Список своих звуков доступен проигрывателю без прокидывания через пропсы. */
let customSounds: CustomSound[] = [];
export function setCustomSounds(list: CustomSound[]) {
  customSounds = Array.isArray(list) ? list : [];
}
export function getCustomSounds(): CustomSound[] {
  return customSounds;
}

/* ---------------- отдельная библиотека звуков наград за баллы ----------------
   Файлы, добавленные как звуки наград, живут отдельно и в обычных
   уведомлениях (донаты, сообщения, события эфира) не предлагаются: стример
   добавляет их осознанно под конкретные награды канала. */
let rewardCustomSounds: CustomSound[] = [];
export function setRewardCustomSounds(list: CustomSound[]) {
  rewardCustomSounds = Array.isArray(list) ? list : [];
}
export function getRewardCustomSounds(): CustomSound[] {
  return rewardCustomSounds;
}

/** Поиск своего звука в обеих библиотеках: обычной и наград. */
function findCustomSound(id: string | undefined): CustomSound | undefined {
  if (!id) return undefined;
  return customSounds.find((s) => s.id === id) ?? rewardCustomSounds.find((s) => s.id === id);
}

export function donateSoundName(id: string | undefined): string {
  if (isCustomSound(id)) return findCustomSound(id)?.name ?? "Свой звук";
  return DONATE_SOUNDS.find((s) => s.id === id)?.name ?? "Колокольчик";
}

/* ---------------- синтез ---------------- */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    // Браузер/движок мог приостановить контекст до действия пользователя
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Одна нота с мягким затуханием. */
function tone(
  ac: AudioContext,
  opts: {
    freq: number;
    start: number;
    dur: number;
    gain: number;
    type?: OscillatorType;
    slideTo?: number;
    /** дрожание высоты — «мультяшность» */
    wobble?: number;
  }
) {
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  const t = ac.currentTime + opts.start;

  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, t);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t + opts.dur);

  if (opts.wobble) {
    const lfo = ac.createOscillator();
    const depth = ac.createGain();
    lfo.frequency.setValueAtTime(opts.wobble, t);
    depth.gain.setValueAtTime(opts.freq * 0.16, t);
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + opts.dur + 0.03);
  }

  // короткая атака убирает щелчок в начале звука
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), t + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);

  osc.connect(amp).connect(ac.destination);
  osc.start(t);
  osc.stop(t + opts.dur + 0.03);
}

/** Проигрывание своего звука пользователя (файл с компьютера).
 *  Учитывает обрезку trimStart/trimEnd, выбранную в мини-редакторе. */
function playCustom(id: string, volume: number, retried = false) {
  const item = findCustomSound(id);
  if (!item?.dataUrl) {
    if (!retried && typeof window !== "undefined") {
      window.setTimeout(() => playCustom(id, volume, true), 150);
    }
    return;
  }
  try {
    const el = new Audio(item.dataUrl);
    el.volume = Math.min(1, Math.max(0, volume));
    const start = Math.max(0, Number(item.trimStart) || 0);
    const end = Number(item.trimEnd) || 0;
    const stopAt = end > start ? end : 0;
    let stopTimer: number | undefined;
    el.addEventListener("loadedmetadata", () => {
      try {
        el.currentTime = Math.min(start, Math.max(0, (el.duration || 0) - 0.05));
      } catch {
        /* некоторые форматы не позволяют seek до загрузки — проиграем с начала */
      }
    });
    el.addEventListener("play", () => {
      if (stopAt > 0) {
        const remain = Math.max(0.05, stopAt - start) * 1000;
        stopTimer = window.setTimeout(() => {
          try { el.pause(); } catch { /* noop */ }
        }, remain);
      }
    });
    el.addEventListener("ended", () => { if (stopTimer) window.clearTimeout(stopTimer); });
    el.addEventListener("error", () => { if (stopTimer) window.clearTimeout(stopTimer); });
    /* Автозапуск звука браузерный движок иногда отклоняет: в окне приложения
       до первого клика, в браузерном источнике OBS — на самой первой фразе.
       Раньше такой звук просто терялся, поэтому пробуем ещё раз чуть позже. */
    void el.play().catch(() => {
      window.setTimeout(() => {
        void el.play().catch(() => undefined);
      }, 400);
    });
  } catch {
    /* файл повреждён — тишина вместо ошибки */
  }
}

/**
 * Проиграть сигнал уведомления.
 * @param id     вариант звука (встроенный или `custom:<id>`)
 * @param volume громкость 0…1
 */
export function playDonateSound(id: DonateSoundId | string | undefined, volume = 1) {
  const sound = (id ?? DEFAULT_DONATE_SOUND) as DonateSoundId;
  if (sound === "none") return;

  const v = Math.min(1, Math.max(0, volume));
  if (v <= 0) return;

  if (isCustomSound(sound)) {
    playCustom(sound, v);
    return;
  }

  const ac = audio();
  if (!ac) return;

  switch (sound) {
    case "coins":
      // частые высокие призвуки — «сыплются монеты»
      [0, 0.06, 0.12, 0.19, 0.26].forEach((s, i) =>
        tone(ac, { freq: 1750 + i * 180, start: s, dur: 0.16, gain: 0.1 * v, type: "triangle" })
      );
      break;

    case "fanfare":
      // восходящее трезвучие с удержанием последней ноты
      tone(ac, { freq: 523, start: 0, dur: 0.18, gain: 0.13 * v, type: "square" });
      tone(ac, { freq: 659, start: 0.14, dur: 0.18, gain: 0.13 * v, type: "square" });
      tone(ac, { freq: 784, start: 0.28, dur: 0.42, gain: 0.15 * v, type: "square" });
      break;

    case "bell":
      // основной тон + обертон, как у настоящего звонка
      tone(ac, { freq: 1046, start: 0, dur: 0.75, gain: 0.16 * v });
      tone(ac, { freq: 2637, start: 0, dur: 0.45, gain: 0.05 * v });
      break;

    case "arcade":
      tone(ac, { freq: 440, start: 0, dur: 0.1, gain: 0.12 * v, type: "square", slideTo: 880 });
      tone(ac, { freq: 880, start: 0.1, dur: 0.16, gain: 0.12 * v, type: "square", slideTo: 1320 });
      break;

    case "pop":
      tone(ac, { freq: 620, start: 0, dur: 0.14, gain: 0.16 * v, type: "sine", slideTo: 1180 });
      break;

    /* ---------------- шуточные ---------------- */

    case "boing":
      // пружина: резкий подскок вверх и «дребезг» вниз
      tone(ac, { freq: 180, start: 0, dur: 0.12, gain: 0.18 * v, type: "triangle", slideTo: 900 });
      tone(ac, { freq: 900, start: 0.1, dur: 0.38, gain: 0.15 * v, type: "triangle", slideTo: 150, wobble: 18 });
      break;

    case "duck":
      // кряканье: пила с быстрым дрожанием высоты, два «слога»
      tone(ac, { freq: 300, start: 0, dur: 0.16, gain: 0.13 * v, type: "sawtooth", slideTo: 210, wobble: 32 });
      tone(ac, { freq: 280, start: 0.2, dur: 0.2, gain: 0.13 * v, type: "sawtooth", slideTo: 170, wobble: 28 });
      break;

    case "trombone":
      // грустный тромбон: четыре нисходящие ноты «ва-ва-ва-вааа»
      tone(ac, { freq: 392, start: 0, dur: 0.22, gain: 0.15 * v, type: "sawtooth", slideTo: 349, wobble: 7 });
      tone(ac, { freq: 349, start: 0.22, dur: 0.22, gain: 0.15 * v, type: "sawtooth", slideTo: 311, wobble: 7 });
      tone(ac, { freq: 311, start: 0.44, dur: 0.24, gain: 0.15 * v, type: "sawtooth", slideTo: 262, wobble: 7 });
      tone(ac, { freq: 262, start: 0.68, dur: 0.6, gain: 0.16 * v, type: "sawtooth", slideTo: 196, wobble: 5 });
      break;

    case "wow":
      // удивлённое «вау»: вверх и мягко вниз
      tone(ac, { freq: 330, start: 0, dur: 0.26, gain: 0.15 * v, type: "triangle", slideTo: 760 });
      tone(ac, { freq: 760, start: 0.24, dur: 0.34, gain: 0.13 * v, type: "triangle", slideTo: 420 });
      break;

    case "siren":
      // шуточная тревога: две «волны» вверх-вниз
      tone(ac, { freq: 520, start: 0, dur: 0.26, gain: 0.12 * v, type: "square", slideTo: 980 });
      tone(ac, { freq: 980, start: 0.26, dur: 0.26, gain: 0.12 * v, type: "square", slideTo: 520 });
      tone(ac, { freq: 520, start: 0.52, dur: 0.26, gain: 0.12 * v, type: "square", slideTo: 980 });
      break;

    case "chime":
    default:
      tone(ac, { freq: 880, start: 0, dur: 0.22, gain: 0.14 * v });
      tone(ac, { freq: 1320, start: 0.13, dur: 0.38, gain: 0.13 * v });
      break;
  }
}
