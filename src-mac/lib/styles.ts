/**
 * СИСТЕМА СТИЛЕЙ оформления YawaChat.
 * Один каталог стилей, три независимые поверхности: лента чата / виджет OBS / оверлей.
 * Каждый стиль задаёт целостный образ: палитру, шрифт, форму плашек, радиусы,
 * полосу, разделители и эффекты. Темы (12) несут тоны — готовые наборы цветов.
 */

export type SurfaceKind = "feed" | "widget" | "overlay";
export type Density4 = "tight" | "compact" | "standard" | "cozy";
export type Decor = "none" | "scanlines" | "grid" | "dots" | "paper";

export interface TonePalette {
  accent: string;
  msgBg: string;
  msgText: string;
  msgRing: string;
  chromeBg: string;
  chromeText: string;
  chromeRing: string;
}

export interface StyleTone {
  id: string;
  name: string;
  palette: Partial<TonePalette>;
}

export interface StylePreset {
  id: string;
  name: string;
  desc: string;
  swatch: [string, string];
  /** имя шрифта в Google Fonts (null — системный стек) */
  googleFont: string | null;
  cssFont: string;
  density: Density4;
  fontSize: number;
  /** зазор между строками, px */
  spacing: number;
  radius: number;
  /** цветная полоска слева у строки */
  stripe: boolean;
  /** разделители между строками */
  separators: boolean;
  nickCase: "normal" | "upper";
  /** есть ли подложка-плашка; false — «только текст» */
  backdrop: boolean;
  /** контур текста, px (0 — нет) */
  outlineWidth: number;
  textShadow: boolean;
  /** речевые пузыри (комикс/кьюти/записки) */
  bubble: boolean;
  /** префикс промпта «>» (терминал) */
  prompt: boolean;
  decor: Decor;
  base: TonePalette;
  tones?: StyleTone[];
}

const INTER = '"Inter", "SF Pro Text", sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';
const NUNITO = '"Nunito", "Inter", sans-serif';
const OSWALD = '"Oswald", "Roboto Condensed", sans-serif';
const GAMING = '"Segoe UI Semibold", "Arial Black", sans-serif';
const UNBOUNDED = '"Unbounded", "Exo 2", system-ui, sans-serif';
const BALSAMIQ = '"Balsamiq Sans", "Nunito", system-ui, sans-serif';
const PIXEL = '"Pixelify Sans", "JetBrains Mono", monospace';
const PHILO = '"Philosopher", Georgia, serif';
const CAVEAT = '"Caveat", cursive';

const DARK_CHROME = { chromeBg: "#15161B", chromeText: "#FFFFFF", chromeRing: "rgba(255,255,255,0.12)" };

export const STYLE_CATALOG: StylePreset[] = [
  /* ===================== базовые стили ===================== */
  {
    id: "clean", name: "Чистый", desc: "мягкая тёмная плашка — спокойная база",
    swatch: ["#a78bfa", "#141625"], googleFont: null, cssFont: INTER,
    density: "standard", fontSize: 13, spacing: 5, radius: 10, stripe: false, separators: false,
    nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false, bubble: false, prompt: false, decor: "none",
    base: { accent: "#a78bfa", msgBg: "rgba(255,255,255,0.05)", msgText: "#F2F2F5", msgRing: "transparent", ...DARK_CHROME },
  },
  {
    id: "light", name: "Светлый", desc: "белые плашки — дневной светлый режим",
    swatch: ["#7c3aed", "#ffffff"], googleFont: null, cssFont: INTER,
    density: "standard", fontSize: 13, spacing: 5, radius: 12, stripe: false, separators: false,
    nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false, bubble: false, prompt: false, decor: "none",
    base: { accent: "#7c3aed", msgBg: "rgba(255,255,255,0.92)", msgText: "#1b1c22", msgRing: "transparent", chromeBg: "#EDEEF4", chromeText: "#1b1c22", chromeRing: "rgba(0,0,0,0.10)" },
  },
  {
    id: "glass", name: "Стекло", desc: "матовое стекло: за плашкой всё размыто",
    swatch: ["#f3f6ff", "#3d6fe0"], googleFont: null, cssFont: INTER,
    density: "standard", fontSize: 13, spacing: 5, radius: 14, stripe: false, separators: false,
    nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false, bubble: false, prompt: false, decor: "none",
    base: { accent: "#64D2FF", msgBg: "rgba(255,255,255,0.10)", msgText: "#FFFFFF", msgRing: "rgba(255,255,255,0.16)", chromeBg: "linear-gradient(160deg, rgba(70,110,200,0.35), rgba(120,60,180,0.30))", chromeText: "#FFFFFF", chromeRing: "rgba(255,255,255,0.22)" },
  },
  {
    id: "kawaii", name: "Кьюти", desc: "розовые речевые пузыри, округлый шрифт",
    swatch: ["#ec4899", "#fff5f8"], googleFont: "Nunito", cssFont: NUNITO,
    density: "cozy", fontSize: 13, spacing: 6, radius: 16, stripe: false, separators: false,
    nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false, bubble: true, prompt: false, decor: "dots",
    base: { accent: "#ec4899", msgBg: "#FFF1F6", msgText: "#5b2d43", msgRing: "rgba(236,72,153,0.25)", chromeBg: "#FFE0EC", chromeText: "#8a3a5e", chromeRing: "rgba(236,72,153,0.35)" },
  },
  {
    id: "rust", name: "Rust", desc: "как в игре: без плашек, жирный текст с контуром",
    swatch: ["#f4f1ea", "#cd412b"], googleFont: null, cssFont: GAMING,
    density: "tight", fontSize: 14, spacing: 1, radius: 0, stripe: false, separators: false,
    nickCase: "normal", backdrop: false, outlineWidth: 1, textShadow: true, bubble: false, prompt: false, decor: "none",
    base: { accent: "#cd412b", msgBg: "transparent", msgText: "#f4f1ea", msgRing: "transparent", chromeBg: "#221c17", chromeText: "#f4f1ea", chromeRing: "#cd412b66" },
  },
  {
    id: "terminal", name: "Терминал", desc: "консоль: моноширинный, зелёный, промпт «>»",
    swatch: ["#4ade80", "#020503"], googleFont: "JetBrains Mono", cssFont: MONO,
    density: "compact", fontSize: 13, spacing: 2, radius: 0, stripe: false, separators: true,
    nickCase: "normal", backdrop: false, outlineWidth: 0, textShadow: false, bubble: false, prompt: true, decor: "scanlines",
    base: { accent: "#4ade80", msgBg: "transparent", msgText: "#b8f7cf", msgRing: "transparent", chromeBg: "#04140b", chromeText: "#4ade80", chromeRing: "#4ade8044" },
  },
  {
    id: "lofi", name: "Ло-фай", desc: "мягкий фиолетовый, тёплый округлый шрифт",
    swatch: ["#e8b6f2", "#241733"], googleFont: "Nunito", cssFont: NUNITO,
    density: "cozy", fontSize: 14, spacing: 7, radius: 14, stripe: false, separators: false,
    nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false, bubble: false, prompt: false, decor: "none",
    base: { accent: "#c9a0dc", msgBg: "rgba(230,195,255,0.08)", msgText: "#efe2fa", msgRing: "transparent", chromeBg: "#241733", chromeText: "#e8b6f2", chromeRing: "rgba(232,182,242,0.25)" },
  },
  {
    id: "amoled", name: "AMOLED", desc: "чистый чёрный и белый, максимальный контраст",
    swatch: ["#ffffff", "#000000"], googleFont: null, cssFont: INTER,
    density: "standard", fontSize: 13, spacing: 4, radius: 8, stripe: false, separators: true,
    nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false, bubble: false, prompt: false, decor: "none",
    base: { accent: "#ffffff", msgBg: "#000000", msgText: "#FFFFFF", msgRing: "rgba(255,255,255,0.10)", chromeBg: "#000000", chromeText: "#FFFFFF", chromeRing: "rgba(255,255,255,0.30)" },
  },

  /* ===================== темы с тонами ===================== */
  {
    id: "retrowave", name: "Ретровейв", desc: "закат, хром и неоновая сетка",
    swatch: ["#ff2e97", "#2c0c4a"], googleFont: "Unbounded", cssFont: UNBOUNDED,
    density: "standard", fontSize: 13, spacing: 5, radius: 8, stripe: true, separators: false,
    nickCase: "normal", backdrop: true, outlineWidth: 0.6, textShadow: false, bubble: false, prompt: false, decor: "grid",
    base: { accent: "#ff2e97", msgBg: "rgba(255,46,151,0.10)", msgText: "#ffe6f4", msgRing: "rgba(255,46,151,0.28)", chromeBg: "linear-gradient(180deg,#3b0f5e,#2c0c4a)", chromeText: "#ffb3da", chromeRing: "#ff2e9766" },
    tones: [
      { id: "sunset", name: "Закат", palette: {} },
      { id: "ice", name: "Неон-лёд", palette: { accent: "#01CDFE", msgBg: "rgba(1,205,254,0.10)", msgText: "#e0f8ff", msgRing: "rgba(1,205,254,0.30)", chromeBg: "linear-gradient(180deg,#0b2b46,#071c31)", chromeText: "#9be9ff", chromeRing: "#01CDFE66" } },
      { id: "night", name: "Полночь", palette: { accent: "#9d6bff", msgBg: "rgba(157,107,255,0.10)", msgText: "#efe6ff", chromeBg: "linear-gradient(180deg,#14083a,#0d0526)", chromeText: "#c9b0ff", chromeRing: "#9d6bff66" } },
    ],
  },
  {
    id: "comic", name: "Комикс", desc: "речевые пузыри с толстым контуром",
    swatch: ["#ffd93d", "#fffdf5"], googleFont: "Balsamiq Sans", cssFont: BALSAMIQ,
    density: "cozy", fontSize: 13, spacing: 5, radius: 14, stripe: false, separators: false,
    nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false, bubble: true, prompt: false, decor: "dots",
    base: { accent: "#e0392f", msgBg: "#fffdf5", msgText: "#1f1f24", msgRing: "#1f1f24", chromeBg: "#ffd93d", chromeText: "#1f1f24", chromeRing: "#1f1f24" },
    tones: [
      { id: "classic", name: "Классика", palette: {} },
      { id: "pop", name: "Поп", palette: { accent: "#7c3aed", chromeBg: "#4cc3ff", chromeText: "#10233b" } },
      { id: "night", name: "Ночь", palette: { accent: "#ffd93d", msgBg: "#22222b", msgText: "#f4f4f8", msgRing: "#000000", chromeBg: "#16161d", chromeText: "#ffd93d" } },
    ],
  },
  {
    id: "pixel", name: "Пиксель", desc: "8-бит: двойная рамка и диттеринг",
    swatch: ["#6ea8ff", "#101438"], googleFont: "Pixelify Sans", cssFont: PIXEL,
    density: "compact", fontSize: 12, spacing: 5, radius: 0, stripe: true, separators: false,
    nickCase: "upper", backdrop: true, outlineWidth: 1.2, textShadow: false, bubble: false, prompt: false, decor: "dots",
    base: { accent: "#6ea8ff", msgBg: "rgba(110,168,255,0.10)", msgText: "#dbe7ff", msgRing: "#2a3f7a", chromeBg: "#101438", chromeText: "#6ea8ff", chromeRing: "#6ea8ff88" },
    tones: [
      { id: "classic", name: "Классика", palette: {} },
      { id: "gameboy", name: "Game Boy", palette: { accent: "#9bbc0f", msgBg: "rgba(155,188,15,0.10)", msgText: "#c4dc6e", msgRing: "#306230", chromeBg: "#0f380f", chromeText: "#9bbc0f", chromeRing: "#9bbc0f88" } },
      { id: "acid", name: "Кислота", palette: { accent: "#ccff00", msgBg: "rgba(204,255,0,0.08)", msgText: "#eaffc4", msgRing: "#5b7300", chromeBg: "#141a00", chromeText: "#ccff00", chromeRing: "#ccff0088" } },
    ],
  },
  {
    id: "vhs", name: "Видеокассета", desc: "CRT, сканлайны, таймкод",
    swatch: ["#ff4d94", "#04121b"], googleFont: "JetBrains Mono", cssFont: MONO,
    density: "standard", fontSize: 13, spacing: 5, radius: 2, stripe: true, separators: false,
    nickCase: "upper", backdrop: true, outlineWidth: 0.8, textShadow: true, bubble: false, prompt: false, decor: "scanlines",
    base: { accent: "#ff4d94", msgBg: "rgba(80,220,255,0.07)", msgText: "#d9f6ff", msgRing: "rgba(80,220,255,0.18)", chromeBg: "#04121b", chromeText: "#50dcff", chromeRing: "#ff4d9466" },
    tones: [
      { id: "tape", name: "Кассета", palette: {} },
      { id: "cold", name: "Холод", palette: { accent: "#50dcff", chromeText: "#d9f6ff" } },
      { id: "sepia", name: "Сепия", palette: { accent: "#e2b26b", msgBg: "rgba(226,178,107,0.08)", msgText: "#f2e3cc", chromeBg: "#171008", chromeText: "#e2b26b" } },
    ],
  },
  {
    id: "outlaw", name: "Вне закона", desc: "бумажный постер, гвозди, штамп",
    swatch: ["#c19a5b", "#2a2018"], googleFont: "Oswald", cssFont: OSWALD,
    density: "compact", fontSize: 13, spacing: 5, radius: 2, stripe: true, separators: false,
    nickCase: "upper", backdrop: true, outlineWidth: 0, textShadow: false, bubble: false, prompt: false, decor: "paper",
    base: { accent: "#7a4a1e", msgBg: "#e8d9b8", msgText: "#3a2b18", msgRing: "#b99a68", chromeBg: "#c19a5b", chromeText: "#2a2018", chromeRing: "#2a201866" },
    tones: [
      { id: "kraft", name: "Крафт", palette: {} },
      { id: "aged", name: "Старина", palette: { msgBg: "#d9c49a", chromeBg: "#a3814c" } },
      { id: "soot", name: "Копоть", palette: { accent: "#c19a5b", msgBg: "#2a2018", msgText: "#e8d9b8", msgRing: "#57452e", chromeBg: "#1c150e", chromeText: "#c19a5b" } },
    ],
  },
  {
    id: "raid", name: "Вылазка", desc: "тактика: уголки, трафарет, хаки",
    swatch: ["#b7a06a", "#23261d"], googleFont: "Oswald", cssFont: OSWALD,
    density: "compact", fontSize: 13, spacing: 5, radius: 2, stripe: true, separators: false,
    nickCase: "upper", backdrop: true, outlineWidth: 0.6, textShadow: true, bubble: false, prompt: false, decor: "none",
    base: { accent: "#b7a06a", msgBg: "rgba(183,160,106,0.10)", msgText: "#e5ddc4", msgRing: "rgba(183,160,106,0.30)", chromeBg: "#23261d", chromeText: "#b7a06a", chromeRing: "#b7a06a77" },
    tones: [
      { id: "khaki", name: "Хаки", palette: {} },
      { id: "night", name: "Ночь", palette: { accent: "#7ea66b", msgBg: "rgba(126,166,107,0.10)", msgText: "#d8e8cf", chromeBg: "#161a12", chromeText: "#7ea66b" } },
      { id: "sand", name: "Песок", palette: { accent: "#caa46a", msgBg: "rgba(202,164,106,0.12)", chromeBg: "#2b2419", chromeText: "#e2c896" } },
    ],
  },
  {
    id: "astro", name: "Звездочёт", desc: "ночное небо, золото, звёзды",
    swatch: ["#e9c877", "#2a2054"], googleFont: "Philosopher", cssFont: PHILO,
    density: "cozy", fontSize: 13, spacing: 5, radius: 4, stripe: false, separators: false,
    nickCase: "normal", backdrop: true, outlineWidth: 0.5, textShadow: false, bubble: false, prompt: false, decor: "dots",
    base: { accent: "#e9c877", msgBg: "rgba(233,200,119,0.08)", msgText: "#f6edd6", msgRing: "rgba(233,200,119,0.22)", chromeBg: "#2a2054", chromeText: "#e9c877", chromeRing: "#e9c87755" },
    tones: [
      { id: "night", name: "Ночь", palette: {} },
      { id: "rose", name: "Роза", palette: { accent: "#f0a5c0", msgBg: "rgba(240,165,192,0.08)", chromeBg: "#3d2050", chromeText: "#f5c4d8" } },
      { id: "jade", name: "Нефрит", palette: { accent: "#8fd6b4", msgBg: "rgba(143,214,180,0.08)", chromeBg: "#133c33", chromeText: "#c8ecd9" } },
    ],
  },
  {
    id: "cyber", name: "Кибер", desc: "HUD, срез угла, бирюза и маджента",
    swatch: ["#00e5ff", "#070a12"], googleFont: "JetBrains Mono", cssFont: MONO,
    density: "compact", fontSize: 12, spacing: 5, radius: 0, stripe: true, separators: false,
    nickCase: "upper", backdrop: true, outlineWidth: 0.9, textShadow: false, bubble: false, prompt: false, decor: "scanlines",
    base: { accent: "#00e5ff", msgBg: "rgba(0,229,255,0.07)", msgText: "#ccf6ff", msgRing: "rgba(0,229,255,0.30)", chromeBg: "#070a12", chromeText: "#00e5ff", chromeRing: "#00e5ff77" },
    tones: [
      { id: "neon", name: "Неон", palette: {} },
      { id: "matrix", name: "Матрица", palette: { accent: "#39ff6a", msgBg: "rgba(57,255,106,0.07)", msgText: "#d4ffdf", msgRing: "rgba(57,255,106,0.30)", chromeText: "#39ff6a", chromeRing: "#39ff6a77" } },
      { id: "blood", name: "Кровь", palette: { accent: "#ff3355", msgBg: "rgba(255,51,85,0.08)", msgText: "#ffd9df", msgRing: "rgba(255,51,85,0.32)", chromeText: "#ff3355", chromeRing: "#ff335577" } },
    ],
  },
  {
    id: "hunter", name: "Охотник", desc: "кожа, золото, следы когтей",
    swatch: ["#c9a227", "#2a221b"], googleFont: "Philosopher", cssFont: PHILO,
    density: "compact", fontSize: 13, spacing: 5, radius: 2, stripe: true, separators: false,
    nickCase: "normal", backdrop: true, outlineWidth: 0.5, textShadow: false, bubble: false, prompt: false, decor: "none",
    base: { accent: "#c9a227", msgBg: "rgba(201,162,39,0.10)", msgText: "#efe4c8", msgRing: "rgba(201,162,39,0.28)", chromeBg: "#2a221b", chromeText: "#c9a227", chromeRing: "#c9a22766" },
    tones: [
      { id: "leather", name: "Кожа", palette: {} },
      { id: "parchment", name: "Пергамент", palette: { accent: "#7a5a1e", msgBg: "#efe3c2", msgText: "#3f3011", msgRing: "#c9a227", chromeBg: "#dcc896", chromeText: "#3f3011" } },
      { id: "ash", name: "Пепел", palette: { accent: "#b8b2a4", msgBg: "rgba(184,178,164,0.09)", msgText: "#e8e4da", chromeBg: "#1d1b18", chromeText: "#b8b2a4" } },
    ],
  },
  {
    id: "plates", name: "Плашки", desc: "простые плотные карточки без окна",
    swatch: ["#94a3b8", "#1b1f2e"], googleFont: null, cssFont: INTER,
    density: "standard", fontSize: 13, spacing: 5, radius: 10, stripe: true, separators: false,
    nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false, bubble: false, prompt: false, decor: "none",
    base: { accent: "#94a3b8", msgBg: "#232838", msgText: "#e6eaf2", msgRing: "transparent", chromeBg: "#1b1f2e", chromeText: "#94a3b8", chromeRing: "#94a3b844" },
    tones: [
      { id: "dark", name: "Тёмные", palette: {} },
      { id: "light", name: "Светлые", palette: { accent: "#4762b8", msgBg: "#eef0f7", msgText: "#252a38", chromeBg: "#dde1ee", chromeText: "#2f3152", chromeRing: "#4762b844" } },
      { id: "color", name: "Цветные", palette: { accent: "#8b5cf6", msgBg: "#2c2150", msgText: "#efe9ff", chromeBg: "#241a42", chromeText: "#cbb8ff" } },
    ],
  },
  {
    id: "pinned", name: "Приколото", desc: "пробковая доска и записки на кнопках",
    swatch: ["#f7eaa8", "#a8763f"], googleFont: "Caveat", cssFont: CAVEAT,
    density: "cozy", fontSize: 15, spacing: 8, radius: 2, stripe: false, separators: false,
    nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false, bubble: true, prompt: false, decor: "dots",
    base: { accent: "#b4322a", msgBg: "#f7eaa8", msgText: "#4a3416", msgRing: "#d9c27c", chromeBg: "#a8763f", chromeText: "#fff3d6", chromeRing: "#7a5324" },
    tones: [
      { id: "yellow", name: "Жёлтый", palette: {} },
      { id: "mint", name: "Мята", palette: { accent: "#1e6e4e", msgBg: "#cdead9", msgText: "#1c4030", msgRing: "#93c9ab" } },
      { id: "pink", name: "Розовый", palette: { accent: "#a02a56", msgBg: "#f6c6da", msgText: "#5c2038", msgRing: "#e098ba" } },
    ],
  },
  {
    id: "sketch", name: "Скетчбук", desc: "тетрадный лист, спираль, маркер",
    swatch: ["#1d4ed8", "#fdfcf7"], googleFont: "Caveat", cssFont: CAVEAT,
    density: "cozy", fontSize: 15, spacing: 8, radius: 0, stripe: false, separators: true,
    nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false, bubble: false, prompt: false, decor: "paper",
    base: { accent: "#1d4ed8", msgBg: "#fdfcf7", msgText: "#2b2f3a", msgRing: "transparent", chromeBg: "#fdfcf7", chromeText: "#1d4ed8", chromeRing: "#1d4ed855" },
    tones: [
      { id: "paper", name: "Бумага", palette: {} },
      { id: "kraft", name: "Крафт", palette: { accent: "#6b4423", msgBg: "#e9dcc3", msgText: "#3a2a18", chromeBg: "#e0d1b2", chromeText: "#6b4423" } },
      { id: "chalk", name: "Мел", palette: { accent: "#9ad1ff", msgBg: "#2c3136", msgText: "#eef3f7", chromeBg: "#22262a", chromeText: "#9ad1ff" } },
    ],
  },
  {
    id: "macos", name: "macOS", desc: "вибрантное стекло, SF-типографика, капсулы",
    swatch: ["#0A84FF", "#1c1c1f"], googleFont: null, cssFont: '"SF Pro Text", "Inter", -apple-system, sans-serif',
    density: "standard", fontSize: 13, spacing: 5, radius: 12, stripe: false, separators: false,
    nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false, bubble: false, prompt: false, decor: "none",
    base: { accent: "#0A84FF", msgBg: "rgba(255,255,255,0.07)", msgText: "#f5f5f7", msgRing: "rgba(255,255,255,0.09)", chromeBg: "rgba(28,28,31,0.72)", chromeText: "#f5f5f7", chromeRing: "rgba(255,255,255,0.14)" },
    tones: [
      { id: "dark", name: "Тёмный", palette: {} },
      { id: "light", name: "Светлый", palette: { accent: "#007AFF", msgBg: "rgba(255,255,255,0.66)", msgText: "#1d1d1f", msgRing: "rgba(0,0,0,0.06)", chromeBg: "rgba(245,245,247,0.72)", chromeText: "#1d1d1f", chromeRing: "rgba(0,0,0,0.10)" } },
    ],
  },
];

export function stylePreset(id: string): StylePreset {
  return STYLE_CATALOG.find((s) => s.id === id) ?? STYLE_CATALOG[0];
}

export function tonePalette(preset: StylePreset, toneId?: string): TonePalette {
  const tone = preset.tones?.find((t) => t.id === toneId);
  return { ...preset.base, ...(tone?.palette ?? {}) };
}

export function defaultTone(preset: StylePreset): string | undefined {
  return preset.tones?.[0]?.id;
}

/** Подгрузить шрифт стиля из Google Fonts (один раз на имя). */
export function ensureStyleFont(preset: StylePreset) {
  if (!preset.googleFont || typeof document === "undefined") return;
  const id = `style-font-${preset.googleFont.replace(/\s+/g, "-")}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(preset.googleFont)}:wght@400;600;700&display=swap`;
  document.head.appendChild(link);
}

export const DENSITY_PAD: Record<Density4, string> = {
  tight: "py-[2px]",
  compact: "py-[4px]",
  standard: "py-[7px]",
  cozy: "py-[9px]",
};
