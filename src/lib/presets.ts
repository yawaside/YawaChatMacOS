import type { CSSProperties } from "react";
import type { ChatViewConfig, OverlayConfig, WidgetConfig } from "./types";

/**
 * СТИЛИ ОФОРМЛЕНИЯ — единый набор для всех трёх поверхностей:
 * лента чата, виджет OBS и игровой оверлей.
 *
 * Стиль — это ЦЕЛОСТНОЕ оформление: своя палитра, шрифт, форма плашек
 * и эффекты (свечение, стекло, сканлайны). Характер каждого стиля задают
 * CSS-классы `.style-<id>` в index.css — по одному сильному образу на
 * стиль, без «почти одинаковых» вариантов.
 *
 * Настройка (прозрачность, скругление, полоса, обводка) по-прежнему работает
 * поверх стиля: классы стилей берут пользовательские значения из переменных
 * строки `--y-*`, которые задаёт компонент.
 */

export interface StyleTone {
  id: string;
  name: string;
}

export interface Style<T> {
  id: string;
  name: string;
  desc: string;
  /** цвета для миниатюры в legacy-сетке */
  swatch: [string, string];
  /** шрифт темы: миниатюра и, если тема его навязывает, сами строки */
  font: string;
  /** параметры, которые стиль выставляет в настройках поверхности */
  patch: Partial<T>;
  /** готовые наборы цветов: тема помнит, какой выбран (styleTone в настройках) */
  tones?: StyleTone[];
  /** тема задаёт свою гарнитуру и не даёт заменить её набором шрифтов */
  forceFont?: boolean;
  /** тема умеет вид «только текст»: при выключенной подложке снимает плашки */
  bareText?: boolean;
}

const INTER = '"Inter", sans-serif';
const MONO = '"JetBrains Mono", monospace';
const NUNITO = '"Nunito", sans-serif';
const OSWALD = '"Oswald", "Roboto Condensed", sans-serif';
const GAMING = '"Segoe UI Semibold", "Arial Black", sans-serif';
const UNBOUNDED = '"Unbounded", "Exo 2", system-ui, sans-serif';
const BALSAMIQ = '"Balsamiq Sans", "Nunito", system-ui, sans-serif';
const PIXEL = '"Pixelify Sans", "JetBrains Mono", monospace';
const PHILO = '"Philosopher", Georgia, serif';
const CAVEAT = '"Caveat", "Comic Sans MS", cursive';

/* ========================= НОВЫЕ ТЕМЫ =========================
   Набор повторяет идею тем Satomi: у каждой темы свой характер окна и
   строк, 3 готовых набора цветов и вид «только текст», когда подложки
   выключены. Цвета наборов живут в index.css (атрибут data-tone),
   здесь — только метаданные и заводские настройки поверхности. */

const RETROWAVE_TONES: StyleTone[] = [
  { id: "sunset", name: "Закат" },
  { id: "ice", name: "Неон-лёд" },
  { id: "night", name: "Полночь" },
];
const COMIC_TONES: StyleTone[] = [
  { id: "classic", name: "Классика" },
  { id: "pop", name: "Поп" },
  { id: "night", name: "Ночь" },
];
const PIXEL_TONES: StyleTone[] = [
  { id: "classic", name: "Классика" },
  { id: "gameboy", name: "Game Boy" },
  { id: "acid", name: "Кислота" },
];
const VHS_TONES: StyleTone[] = [
  { id: "tape", name: "Кассета" },
  { id: "cold", name: "Холод" },
  { id: "sepia", name: "Сепия" },
];
const OUTLAW_TONES: StyleTone[] = [
  { id: "kraft", name: "Крафт" },
  { id: "aged", name: "Старина" },
  { id: "soot", name: "Копоть" },
];
const RAID_TONES: StyleTone[] = [
  { id: "khaki", name: "Хаки" },
  { id: "night", name: "Ночь" },
  { id: "sand", name: "Песок" },
];
const ASTRO_TONES: StyleTone[] = [
  { id: "night", name: "Ночь" },
  { id: "rose", name: "Роза" },
  { id: "jade", name: "Нефрит" },
];
const CYBER_TONES: StyleTone[] = [
  { id: "neon", name: "Неон" },
  { id: "matrix", name: "Матрица" },
  { id: "blood", name: "Кровь" },
];
const HUNTER_TONES: StyleTone[] = [
  { id: "leather", name: "Кожа" },
  { id: "parchment", name: "Пергамент" },
  { id: "ash", name: "Пепел" },
];
const PLATES_TONES: StyleTone[] = [
  { id: "dark", name: "Тёмные" },
  { id: "light", name: "Светлые" },
  { id: "color", name: "Цветные" },
];
const PINNED_TONES: StyleTone[] = [
  { id: "yellow", name: "Жёлтый" },
  { id: "mint", name: "Мята" },
  { id: "pink", name: "Розовый" },
];
const SKETCH_TONES: StyleTone[] = [
  { id: "paper", name: "Бумага" },
  { id: "kraft", name: "Крафт" },
  { id: "chalk", name: "Мел" },
];

/* ========================= ЛЕНТА ЧАТА ========================= */

export const FEED_STYLES: Style<ChatViewConfig>[] = [
  {
    id: "clean",
    name: "Чистый",
    desc: "мягкая тёмная плашка — спокойная база",
    swatch: ["#a78bfa", "#141625"],
    font: INTER,
    patch: {
      styleId: "clean", density: "standard", fontSize: 13, fontFamily: "inter", spacing: 5,
      radius: 10, stripe: false, separators: false, nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false,
    },
  },
  {
    id: "light",
    name: "Светлый",
    desc: "белые плашки — дневной светлый режим",
    swatch: ["#7c3aed", "#ffffff"],
    font: INTER,
    patch: {
      styleId: "light", density: "standard", fontSize: 13, fontFamily: "inter", spacing: 5,
      radius: 12, stripe: false, separators: false, nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false,
    },
  },
  {
    id: "glass",
    name: "Стекло",
    desc: "матовое стекло: за плашкой всё размыто",
    swatch: ["#f3f6ff", "rgba(255,255,255,0.18)"],
    font: INTER,
    patch: {
      styleId: "glass", density: "standard", fontSize: 13, fontFamily: "inter", spacing: 5,
      radius: 14, stripe: false, separators: false, nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false,
    },
  },
  {
    id: "kawaii",
    name: "Кьюти",
    desc: "розовые речевые пузыри, округлый шрифт",
    swatch: ["#ec4899", "#fff5f8"],
    font: NUNITO,
    patch: {
      styleId: "kawaii", density: "cozy", fontSize: 13, fontFamily: "rounded", spacing: 6,
      radius: 16, stripe: false, separators: false, nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false,
    },
  },
  {
    id: "rust",
    name: "Rust",
    desc: "как в игре: без плашек, плотный жирный текст с контуром",
    swatch: ["#f4f1ea", "transparent"],
    font: GAMING,
    patch: {
      styleId: "rust", density: "tight", fontSize: 14, fontFamily: "gaming", spacing: 1,
      radius: 0, stripe: false, separators: false, nickCase: "normal", backdrop: false, outlineWidth: 1.0, textShadow: true,
    },
  },
  {
    id: "terminal",
    name: "Терминал",
    desc: "консоль: моноширинный, зелёный, с промптом «>»",
    swatch: ["#4ade80", "#020503"],
    font: MONO,
    patch: {
      styleId: "terminal", density: "compact", fontSize: 13, fontFamily: "mono", spacing: 2,
      radius: 0, stripe: false, separators: true, nickCase: "normal", backdrop: false, outlineWidth: 0, textShadow: false,
    },
  },
  {
    id: "lofi",
    name: "Ло-фай",
    desc: "мягкий фиолетовый, тёплый округлый шрифт",
    swatch: ["#e8b6f2", "#241733"],
    font: NUNITO,
    patch: {
      styleId: "lofi", density: "cozy", fontSize: 14, fontFamily: "rounded", spacing: 7,
      radius: 14, stripe: false, separators: false, nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false,
    },
  },
  {
    id: "amoled",
    name: "AMOLED",
    desc: "чистый чёрный и белый, максимальный контраст",
    swatch: ["#ffffff", "#000000"],
    font: INTER,
    patch: {
      styleId: "amoled", density: "standard", fontSize: 13, fontFamily: "inter", spacing: 4,
      radius: 8, stripe: false, separators: false, nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false,
    },
  },
  /* ---------- темы с набором цветов ---------- */
  {
    id: "retrowave",
    name: "Ретровейв",
    desc: "закат, хром и неоновая сетка",
    swatch: ["#ff2e97", "#2c0c4a"],
    font: UNBOUNDED,
    tones: RETROWAVE_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "retrowave", styleTone: "sunset", density: "standard", fontSize: 13, fontFamily: "inter", spacing: 5, radius: 8, stripe: true, separators: false, nickCase: "normal", backdrop: true, outlineWidth: 0.6, textShadow: false },
  },
  {
    id: "comic",
    name: "Комикс",
    desc: "речевые пузыри с толстым контуром",
    swatch: ["#ffd93d", "#fffdf5"],
    font: BALSAMIQ,
    tones: COMIC_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "comic", styleTone: "classic", density: "cozy", fontSize: 13, fontFamily: "rounded", spacing: 5, radius: 14, stripe: false, separators: false, nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false },
  },
  {
    id: "pixel",
    name: "Пиксель",
    desc: "8-бит: двойная рамка и диттеринг",
    swatch: ["#6ea8ff", "#101438"],
    font: PIXEL,
    tones: PIXEL_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "pixel", styleTone: "classic", density: "compact", fontSize: 12, fontFamily: "mono", spacing: 5, radius: 0, stripe: true, separators: false, nickCase: "normal", backdrop: true, outlineWidth: 1.2, textShadow: false },
  },
  {
    id: "vhs",
    name: "Видеокассета",
    desc: "CRT, сканлайны, таймкод",
    swatch: ["#ff4d94", "#04121b"],
    font: MONO,
    tones: VHS_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "vhs", styleTone: "tape", density: "standard", fontSize: 13, fontFamily: "mono", spacing: 5, radius: 2, stripe: true, separators: false, nickCase: "normal", backdrop: true, outlineWidth: 0.8, textShadow: false },
  },
  {
    id: "outlaw",
    name: "Вне закона",
    desc: "бумажный постер, гвозди, штамп",
    swatch: ["#c19a5b", "#2a2018"],
    font: OSWALD,
    tones: OUTLAW_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "outlaw", styleTone: "kraft", density: "compact", fontSize: 13, fontFamily: "condensed", spacing: 5, radius: 2, stripe: true, separators: false, nickCase: "upper", backdrop: true, outlineWidth: 0, textShadow: false },
  },
  {
    id: "raid",
    name: "Вылазка",
    desc: "тактика: уголки, трафарет, хаки",
    swatch: ["#b7a06a", "#23261d"],
    font: OSWALD,
    tones: RAID_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "raid", styleTone: "khaki", density: "compact", fontSize: 13, fontFamily: "condensed", spacing: 5, radius: 2, stripe: true, separators: false, nickCase: "upper", backdrop: true, outlineWidth: 0.6, textShadow: false },
  },
  {
    id: "astro",
    name: "Звездочёт",
    desc: "ночное небо, золото, звёзды",
    swatch: ["#e9c877", "#2a2054"],
    font: PHILO,
    tones: ASTRO_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "astro", styleTone: "night", density: "cozy", fontSize: 13, fontFamily: "serif", spacing: 5, radius: 4, stripe: false, separators: false, nickCase: "normal", backdrop: true, outlineWidth: 0.5, textShadow: false },
  },
  {
    id: "cyber",
    name: "Кибер",
    desc: "HUD, срез угла, бирюза и маджента",
    swatch: ["#00e5ff", "#070a12"],
    font: MONO,
    tones: CYBER_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "cyber", styleTone: "neon", density: "compact", fontSize: 12, fontFamily: "mono", spacing: 5, radius: 0, stripe: true, separators: false, nickCase: "upper", backdrop: true, outlineWidth: 0.9, textShadow: false },
  },
  {
    id: "hunter",
    name: "Охотник",
    desc: "кожа, золото, следы когтей",
    swatch: ["#c9a227", "#2a221b"],
    font: PHILO,
    tones: HUNTER_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "hunter", styleTone: "leather", density: "compact", fontSize: 13, fontFamily: "serif", spacing: 5, radius: 2, stripe: true, separators: false, nickCase: "normal", backdrop: true, outlineWidth: 0.5, textShadow: false },
  },
  {
    id: "plates",
    name: "Плашки",
    desc: "простые плотные карточки без окна",
    swatch: ["#94a3b8", "#1b1f2e"],
    font: INTER,
    tones: PLATES_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "plates", styleTone: "dark", density: "standard", fontSize: 13, fontFamily: "inter", spacing: 5, radius: 10, stripe: true, separators: false, nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false },
  },
  {
    id: "pinned",
    name: "Приколото",
    desc: "пробковая доска и записки на кнопках",
    swatch: ["#f7eaa8", "#a8763f"],
    font: CAVEAT,
    tones: PINNED_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "pinned", styleTone: "yellow", density: "cozy", fontSize: 15, fontFamily: "rounded", spacing: 8, radius: 2, stripe: false, separators: false, nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false },
  },
  {
    id: "sketch",
    name: "Скетчбук",
    desc: "тетрадный лист, спираль, маркер",
    swatch: ["#1d4ed8", "#fdfcf7"],
    font: CAVEAT,
    tones: SKETCH_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "sketch", styleTone: "paper", density: "cozy", fontSize: 15, fontFamily: "rounded", spacing: 8, radius: 0, stripe: false, separators: false, nickCase: "normal", backdrop: true, outlineWidth: 0, textShadow: false },
  },
];

/* ========================= ВИДЖЕТ OBS ========================= */

export const WIDGET_STYLES: Style<WidgetConfig>[] = [
  {
    id: "clean",
    name: "Чистый",
    desc: "мягкая полупрозрачная плашка — спокойная база",
    swatch: ["#0e0f18", "#a78bfa"],
    font: INTER,
    patch: {
      styleId: "clean", transparent: false, backdropOpacity: 0.7, outlines: true, outlineWidth: 0.8, textShadow: true, theme: "dark",
      fontSize: 18, fontFamily: "inter", spacing: 4, radius: 12, stripe: false, nickCase: "normal",
    },
  },
  {
    id: "light",
    name: "Светлый",
    desc: "белые плашки — для светлых сцен",
    swatch: ["#f8f9fc", "#7c3aed"],
    font: INTER,
    patch: {
      styleId: "light", transparent: false, backdropOpacity: 0.92, outlines: false, outlineWidth: 0, textShadow: false, theme: "light",
      fontSize: 18, fontFamily: "inter", spacing: 5, radius: 12, stripe: false, nickCase: "normal",
    },
  },
  {
    id: "glass",
    name: "Стекло",
    desc: "матовое стекло с белой кромкой",
    swatch: ["#e2efff", "rgba(37,99,235,0.35)"],
    font: INTER,
    patch: {
      styleId: "glass", transparent: false, backdropOpacity: 0.5, outlines: true, outlineWidth: 0.5, textShadow: true, theme: "dark",
      fontSize: 18, fontFamily: "inter", spacing: 4, radius: 14, stripe: false, nickCase: "normal",
    },
  },
  {
    id: "kawaii",
    name: "Кьюти",
    desc: "розовые речевые пузыри",
    swatch: ["#fff5f8", "#ec4899"],
    font: NUNITO,
    patch: {
      styleId: "kawaii", transparent: false, backdropOpacity: 0.95, outlines: true, outlineWidth: 0.5, textShadow: true, theme: "light",
      fontSize: 17, fontFamily: "rounded", spacing: 5, radius: 16, stripe: false, nickCase: "normal",
    },
  },
  {
    id: "rust",
    name: "Rust",
    desc: "как в игре: без фона, плотный текст с сильным контуром",
    swatch: ["#cd412b", "transparent"],
    font: GAMING,
    patch: {
      styleId: "rust", transparent: true, backdropOpacity: 0, outlines: true, outlineWidth: 1.2, textShadow: true, theme: "dark",
      fontSize: 20, fontFamily: "gaming", spacing: 1, radius: 0, stripe: false, nickCase: "normal",
    },
  },
  {
    id: "terminal",
    name: "Терминал",
    desc: "консольный зелёный моноширинный текст с промптом",
    swatch: ["#020a08", "#34d399"],
    font: MONO,
    patch: {
      styleId: "terminal", transparent: true, backdropOpacity: 0, outlines: true, outlineWidth: 0.8, textShadow: true, theme: "dark",
      fontSize: 17, fontFamily: "mono", spacing: 2, radius: 0, stripe: false, nickCase: "normal",
    },
  },
  {
    id: "lofi",
    name: "Ло-фай",
    desc: "мягкий фиолетовый, тёплый округлый шрифт",
    swatch: ["#1c1226", "#c9a0dc"],
    font: NUNITO,
    patch: {
      styleId: "lofi", transparent: false, backdropOpacity: 0.8, outlines: true, outlineWidth: 0.5, textShadow: true, theme: "dark",
      fontSize: 18, fontFamily: "rounded", spacing: 6, radius: 14, stripe: false, nickCase: "normal",
    },
  },
  {
    id: "amoled",
    name: "AMOLED",
    desc: "глубокий чёрный, белоснежный текст",
    swatch: ["#000000", "#a78bfa"],
    font: INTER,
    patch: {
      styleId: "amoled", transparent: false, backdropOpacity: 0.97, outlines: false, outlineWidth: 0, textShadow: false, theme: "dark",
      fontSize: 18, fontFamily: "inter", spacing: 4, radius: 8, stripe: false, nickCase: "normal",
    },
  },
  /* ---------- темы с набором цветов ---------- */
  {
    id: "retrowave",
    name: "Ретровейв",
    desc: "закат, хром и неоновая сетка",
    swatch: ["#ff2e97", "#2c0c4a"],
    font: UNBOUNDED,
    tones: RETROWAVE_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "retrowave", styleTone: "sunset", transparent: false, backdropOpacity: 0.9, outlines: true, outlineWidth: 0.6, textShadow: true, theme: "dark", fontSize: 18, fontFamily: "inter", spacing: 4, radius: 8, stripe: true, nickCase: "normal", windowBackdrop: true, windowOpacity: 1.0, windowRadius: 16, windowBar: true },
  },
  {
    id: "comic",
    name: "Комикс",
    desc: "речевые пузыри с толстым контуром",
    swatch: ["#ffd93d", "#fffdf5"],
    font: BALSAMIQ,
    tones: COMIC_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "comic", styleTone: "classic", transparent: false, backdropOpacity: 0.97, outlines: false, outlineWidth: 0, textShadow: false, theme: "dark", fontSize: 18, fontFamily: "rounded", spacing: 4, radius: 14, stripe: false, nickCase: "normal", windowBackdrop: true, windowOpacity: 1.0, windowRadius: 16, windowBar: true },
  },
  {
    id: "pixel",
    name: "Пиксель",
    desc: "8-бит: двойная рамка и диттеринг",
    swatch: ["#6ea8ff", "#101438"],
    font: PIXEL,
    tones: PIXEL_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "pixel", styleTone: "classic", transparent: false, backdropOpacity: 0.96, outlines: true, outlineWidth: 1.2, textShadow: true, theme: "dark", fontSize: 17, fontFamily: "mono", spacing: 4, radius: 0, stripe: true, nickCase: "normal", windowBackdrop: true, windowOpacity: 1.0, windowRadius: 16, windowBar: true },
  },
  {
    id: "vhs",
    name: "Видеокассета",
    desc: "CRT, сканлайны, таймкод",
    swatch: ["#ff4d94", "#04121b"],
    font: MONO,
    tones: VHS_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "vhs", styleTone: "tape", transparent: false, backdropOpacity: 0.85, outlines: true, outlineWidth: 0.8, textShadow: true, theme: "dark", fontSize: 18, fontFamily: "mono", spacing: 4, radius: 2, stripe: true, nickCase: "normal", windowBackdrop: true, windowOpacity: 1.0, windowRadius: 16, windowBar: true },
  },
  {
    id: "outlaw",
    name: "Вне закона",
    desc: "бумажный постер, гвозди, штамп",
    swatch: ["#c19a5b", "#2a2018"],
    font: OSWALD,
    tones: OUTLAW_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "outlaw", styleTone: "kraft", transparent: false, backdropOpacity: 0.98, outlines: false, outlineWidth: 0, textShadow: false, theme: "light", fontSize: 18, fontFamily: "condensed", spacing: 4, radius: 2, stripe: true, nickCase: "upper", windowBackdrop: true, windowOpacity: 1.0, windowRadius: 16, windowBar: true },
  },
  {
    id: "raid",
    name: "Вылазка",
    desc: "тактика: уголки, трафарет, хаки",
    swatch: ["#b7a06a", "#23261d"],
    font: OSWALD,
    tones: RAID_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "raid", styleTone: "khaki", transparent: false, backdropOpacity: 0.93, outlines: true, outlineWidth: 0.6, textShadow: true, theme: "dark", fontSize: 18, fontFamily: "condensed", spacing: 4, radius: 2, stripe: true, nickCase: "upper", windowBackdrop: true, windowOpacity: 1.0, windowRadius: 16, windowBar: true },
  },
  {
    id: "astro",
    name: "Звездочёт",
    desc: "ночное небо, золото, звёзды",
    swatch: ["#e9c877", "#2a2054"],
    font: PHILO,
    tones: ASTRO_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "astro", styleTone: "night", transparent: false, backdropOpacity: 0.92, outlines: true, outlineWidth: 0.5, textShadow: true, theme: "dark", fontSize: 18, fontFamily: "serif", spacing: 4, radius: 4, stripe: false, nickCase: "normal", windowBackdrop: true, windowOpacity: 1.0, windowRadius: 16, windowBar: true },
  },
  {
    id: "cyber",
    name: "Кибер",
    desc: "HUD, срез угла, бирюза и маджента",
    swatch: ["#00e5ff", "#070a12"],
    font: MONO,
    tones: CYBER_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "cyber", styleTone: "neon", transparent: false, backdropOpacity: 0.94, outlines: true, outlineWidth: 0.9, textShadow: true, theme: "dark", fontSize: 17, fontFamily: "mono", spacing: 4, radius: 0, stripe: true, nickCase: "upper", windowBackdrop: true, windowOpacity: 1.0, windowRadius: 16, windowBar: true },
  },
  {
    id: "hunter",
    name: "Охотник",
    desc: "кожа, золото, следы когтей",
    swatch: ["#c9a227", "#2a221b"],
    font: PHILO,
    tones: HUNTER_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "hunter", styleTone: "leather", transparent: false, backdropOpacity: 0.94, outlines: true, outlineWidth: 0.5, textShadow: true, theme: "dark", fontSize: 18, fontFamily: "serif", spacing: 4, radius: 2, stripe: true, nickCase: "normal", windowBackdrop: true, windowOpacity: 1.0, windowRadius: 16, windowBar: true },
  },
  {
    id: "plates",
    name: "Плашки",
    desc: "простые плотные карточки без окна",
    swatch: ["#94a3b8", "#1b1f2e"],
    font: INTER,
    tones: PLATES_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "plates", styleTone: "dark", transparent: false, backdropOpacity: 0.94, outlines: false, outlineWidth: 0, textShadow: false, theme: "dark", fontSize: 18, fontFamily: "inter", spacing: 4, radius: 10, stripe: true, nickCase: "normal", windowBackdrop: false, windowOpacity: 1.0, windowRadius: 16, windowBar: true },
  },
  {
    id: "pinned",
    name: "Приколото",
    desc: "пробковая доска и записки на кнопках",
    swatch: ["#f7eaa8", "#a8763f"],
    font: CAVEAT,
    tones: PINNED_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "pinned", styleTone: "yellow", transparent: false, backdropOpacity: 0.99, outlines: false, outlineWidth: 0, textShadow: false, theme: "dark", fontSize: 19, fontFamily: "rounded", spacing: 6, radius: 2, stripe: false, nickCase: "normal", windowBackdrop: true, windowOpacity: 1.0, windowRadius: 16, windowBar: true },
  },
  {
    id: "sketch",
    name: "Скетчбук",
    desc: "тетрадный лист, спираль, маркер",
    swatch: ["#1d4ed8", "#fdfcf7"],
    font: CAVEAT,
    tones: SKETCH_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "sketch", styleTone: "paper", transparent: false, backdropOpacity: 0.98, outlines: false, outlineWidth: 0, textShadow: false, theme: "light", fontSize: 18, fontFamily: "rounded", spacing: 6, radius: 0, stripe: false, nickCase: "normal", windowBackdrop: true, windowOpacity: 1.0, windowRadius: 16, windowBar: true },
  },
];

/* ========================= ОВЕРЛЕЙ ========================= */

export const OVERLAY_STYLES: Style<OverlayConfig>[] = [
  {
    id: "clean",
    name: "Чистый",
    desc: "полупрозрачные плашки с мягким контуром",
    swatch: ["#0e0f18", "#a78bfa"],
    font: INTER,
    patch: {
      styleId: "clean", backdropOpacity: 0.65, textOpacity: 1, radius: 10, accentBar: true,
      shadowText: true, outlineWidth: 0.8, fontFamily: "inter", fontSize: 14, spacing: 4, nickCase: "normal",
    },
  },
  {
    id: "light",
    name: "Светлый",
    desc: "светлые плашки с тёмным текстом",
    swatch: ["#f8f9fc", "#7c3aed"],
    font: INTER,
    patch: {
      styleId: "light", backdropOpacity: 0.9, textOpacity: 1, radius: 12, accentBar: true,
      shadowText: false, outlineWidth: 0, fontFamily: "inter", fontSize: 14, spacing: 5, nickCase: "normal",
    },
  },
  {
    id: "glass",
    name: "Стекло",
    desc: "размытая стеклянная подложка",
    swatch: ["#2563eb", "rgba(37,99,235,0.3)"],
    font: INTER,
    patch: {
      styleId: "glass", backdropOpacity: 0.5, textOpacity: 1, radius: 14, accentBar: true,
      shadowText: true, outlineWidth: 0.5, fontFamily: "inter", fontSize: 14, spacing: 4, nickCase: "normal",
    },
  },
  {
    id: "kawaii",
    name: "Кьюти",
    desc: "розовые речевые пузыри",
    swatch: ["#fff5f8", "#ec4899"],
    font: NUNITO,
    patch: {
      styleId: "kawaii", backdropOpacity: 0.9, textOpacity: 1, radius: 16, accentBar: false,
      shadowText: true, outlineWidth: 0.5, fontFamily: "rounded", fontSize: 14, spacing: 5, nickCase: "normal",
    },
  },
  {
    id: "rust",
    name: "Rust",
    desc: "как в игре: без подложки, жирный текст с контуром",
    swatch: ["#cd412b", "transparent"],
    font: GAMING,
    patch: {
      styleId: "rust", backdropOpacity: 0, textOpacity: 1, radius: 0, accentBar: false,
      shadowText: true, outlineWidth: 1.2, fontFamily: "gaming", fontSize: 16, spacing: 1, nickCase: "normal",
    },
  },
  {
    id: "terminal",
    name: "Терминал",
    desc: "зелёная консоль с промптом «>»",
    swatch: ["#34d399", "rgba(2,10,8,0.75)"],
    font: MONO,
    patch: {
      styleId: "terminal", backdropOpacity: 0, textOpacity: 1, radius: 0, accentBar: false,
      shadowText: false, outlineWidth: 0.8, fontFamily: "mono", fontSize: 13, spacing: 2, nickCase: "normal",
    },
  },
  {
    id: "lofi",
    name: "Ло-фай",
    desc: "мягкий фиолетовый, тёплый текст",
    swatch: ["#c9a0dc", "rgba(28,18,38,0.7)"],
    font: NUNITO,
    patch: {
      styleId: "lofi", backdropOpacity: 0.75, textOpacity: 1, radius: 14, accentBar: false,
      shadowText: true, outlineWidth: 0.5, fontFamily: "rounded", fontSize: 14, spacing: 6, nickCase: "normal",
    },
  },
  {
    id: "amoled",
    name: "AMOLED",
    desc: "глубокий чёрный, максимальный контраст",
    swatch: ["#a78bfa", "#000000"],
    font: INTER,
    patch: {
      styleId: "amoled", backdropOpacity: 0.95, textOpacity: 1, radius: 8, accentBar: false,
      shadowText: false, outlineWidth: 0, fontFamily: "inter", fontSize: 14, spacing: 4, nickCase: "normal",
    },
  },
  {
    id: "ghost",
    name: "Прозрачный",
    desc: "без подложки: только текст с тенью прямо над игрой",
    swatch: ["#ffffff", "transparent"],
    font: INTER,
    patch: {
      styleId: "ghost", backdropOpacity: 0, textOpacity: 1, radius: 0, accentBar: false,
      shadowText: true, outlineWidth: 0.8, fontFamily: "inter", fontSize: 15, spacing: 4, nickCase: "normal",
    },
  },
  /* ---------- темы с набором цветов ---------- */
  {
    id: "retrowave",
    name: "Ретровейв",
    desc: "закат, хром и неоновая сетка",
    swatch: ["#ff2e97", "#2c0c4a"],
    font: UNBOUNDED,
    tones: RETROWAVE_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "retrowave", styleTone: "sunset", backdropOpacity: 0.86, textOpacity: 1, radius: 8, accentBar: true, shadowText: true, outlineWidth: 0.6, fontFamily: "inter", fontSize: 14, spacing: 4, nickCase: "normal", windowBackdrop: false, windowOpacity: 1, windowRadius: 8, windowBar: false },
  },
  {
    id: "comic",
    name: "Комикс",
    desc: "речевые пузыри с толстым контуром",
    swatch: ["#ffd93d", "#fffdf5"],
    font: BALSAMIQ,
    tones: COMIC_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "comic", styleTone: "classic", backdropOpacity: 0.95, textOpacity: 1, radius: 14, accentBar: false, shadowText: false, outlineWidth: 0, fontFamily: "rounded", fontSize: 14, spacing: 4, nickCase: "normal", windowBackdrop: false, windowOpacity: 1, windowRadius: 14, windowBar: false },
  },
  {
    id: "pixel",
    name: "Пиксель",
    desc: "8-бит: двойная рамка и диттеринг",
    swatch: ["#6ea8ff", "#101438"],
    font: PIXEL,
    tones: PIXEL_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "pixel", styleTone: "classic", backdropOpacity: 0.94, textOpacity: 1, radius: 0, accentBar: true, shadowText: true, outlineWidth: 1.2, fontFamily: "mono", fontSize: 14, spacing: 4, nickCase: "normal", windowBackdrop: false, windowOpacity: 1, windowRadius: 0, windowBar: false },
  },
  {
    id: "vhs",
    name: "Видеокассета",
    desc: "CRT, сканлайны, таймкод",
    swatch: ["#ff4d94", "#04121b"],
    font: MONO,
    tones: VHS_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "vhs", styleTone: "tape", backdropOpacity: 0.8, textOpacity: 1, radius: 2, accentBar: false, shadowText: true, outlineWidth: 0.8, fontFamily: "mono", fontSize: 14, spacing: 4, nickCase: "normal", windowBackdrop: false, windowOpacity: 1, windowRadius: 2, windowBar: false },
  },
  {
    id: "outlaw",
    name: "Вне закона",
    desc: "бумажный постер, гвозди, штамп",
    swatch: ["#c19a5b", "#2a2018"],
    font: OSWALD,
    tones: OUTLAW_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "outlaw", styleTone: "kraft", backdropOpacity: 0.96, textOpacity: 1, radius: 2, accentBar: true, shadowText: false, outlineWidth: 0, fontFamily: "condensed", fontSize: 14, spacing: 4, nickCase: "upper", windowBackdrop: false, windowOpacity: 1, windowRadius: 2, windowBar: false },
  },
  {
    id: "raid",
    name: "Вылазка",
    desc: "тактика: уголки, трафарет, хаки",
    swatch: ["#b7a06a", "#23261d"],
    font: OSWALD,
    tones: RAID_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "raid", styleTone: "khaki", backdropOpacity: 0.9, textOpacity: 1, radius: 2, accentBar: true, shadowText: true, outlineWidth: 0.6, fontFamily: "condensed", fontSize: 14, spacing: 4, nickCase: "upper", windowBackdrop: false, windowOpacity: 1, windowRadius: 2, windowBar: false },
  },
  {
    id: "astro",
    name: "Звездочёт",
    desc: "ночное небо, золото, звёзды",
    swatch: ["#e9c877", "#2a2054"],
    font: PHILO,
    tones: ASTRO_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "astro", styleTone: "night", backdropOpacity: 0.88, textOpacity: 1, radius: 4, accentBar: false, shadowText: true, outlineWidth: 0.5, fontFamily: "serif", fontSize: 14, spacing: 4, nickCase: "normal", windowBackdrop: false, windowOpacity: 1, windowRadius: 4, windowBar: false },
  },
  {
    id: "cyber",
    name: "Кибер",
    desc: "HUD, срез угла, бирюза и маджента",
    swatch: ["#00e5ff", "#070a12"],
    font: MONO,
    tones: CYBER_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "cyber", styleTone: "neon", backdropOpacity: 0.9, textOpacity: 1, radius: 0, accentBar: true, shadowText: true, outlineWidth: 0.9, fontFamily: "mono", fontSize: 14, spacing: 4, nickCase: "upper", windowBackdrop: false, windowOpacity: 1, windowRadius: 0, windowBar: false },
  },
  {
    id: "hunter",
    name: "Охотник",
    desc: "кожа, золото, следы когтей",
    swatch: ["#c9a227", "#2a221b"],
    font: PHILO,
    tones: HUNTER_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "hunter", styleTone: "leather", backdropOpacity: 0.92, textOpacity: 1, radius: 2, accentBar: true, shadowText: true, outlineWidth: 0.5, fontFamily: "serif", fontSize: 14, spacing: 4, nickCase: "normal", windowBackdrop: false, windowOpacity: 1, windowRadius: 2, windowBar: false },
  },
  {
    id: "plates",
    name: "Плашки",
    desc: "простые плотные карточки без окна",
    swatch: ["#94a3b8", "#1b1f2e"],
    font: INTER,
    tones: PLATES_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "plates", styleTone: "dark", backdropOpacity: 0.94, textOpacity: 1, radius: 10, accentBar: true, shadowText: true, outlineWidth: 0, fontFamily: "inter", fontSize: 14, spacing: 4, nickCase: "normal", windowBackdrop: false, windowOpacity: 1, windowRadius: 10, windowBar: false },
  },
  {
    id: "pinned",
    name: "Приколото",
    desc: "пробковая доска и записки на кнопках",
    swatch: ["#f7eaa8", "#a8763f"],
    font: CAVEAT,
    tones: PINNED_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "pinned", styleTone: "yellow", backdropOpacity: 0.96, textOpacity: 1, radius: 2, accentBar: false, shadowText: false, outlineWidth: 0, fontFamily: "rounded", fontSize: 14, spacing: 4, nickCase: "normal", windowBackdrop: false, windowOpacity: 1, windowRadius: 2, windowBar: false },
  },
  {
    id: "sketch",
    name: "Скетчбук",
    desc: "тетрадный лист, спираль, маркер",
    swatch: ["#1d4ed8", "#fdfcf7"],
    font: CAVEAT,
    tones: SKETCH_TONES,
    forceFont: true,
    bareText: true,
    patch: { styleId: "sketch", styleTone: "paper", backdropOpacity: 0.95, textOpacity: 1, radius: 0, accentBar: false, shadowText: false, outlineWidth: 0, fontFamily: "rounded", fontSize: 14, spacing: 4, nickCase: "normal", windowBackdrop: false, windowOpacity: 1, windowRadius: 0, windowBar: false },
  },
];

/**
 * Переезд старых стилей на новый набор. Каждый старый id обязан указывать
 * НАПРЯМУЮ на существующий стиль (разрешение — в один проход, цепочек нет).
 *
 * Здесь же — стили, убранные как повторы: «Неон» и «HUD» повторяли «Кибер»,
 * «World of Tanks» и «Tarkov» — «Вылазку». Сохранённые настройки с их id
 * продолжают работать: id переводится на оставшийся стиль.
 */
const STYLE_ALIAS: Record<string, string> = {
  classic: "clean", cards: "clean", focus: "clean", broadcast: "clean",
  console: "terminal", lines: "terminal", dense: "rust", minimal: "clean",
  journal: "clean", book: "clean",
  ticker: "terminal", "dark-card": "clean", "light-card": "light",
  bubbles: "lofi", stripe: "raid", solid: "amoled",
  compact: "terminal", events: "clean", stealth: "ghost", spotlight: "raid",
  // ушедшие в новую систему
  valorant: "clean", "minimal-light": "light", ocean: "clean",
  // убранные повторы
  neon: "cyber", hud: "cyber", wot: "raid", tarkov: "raid",
};

/** все старые id, которые переносятся на новый набор (для миграции и тестов) */
export const STYLE_IDS = Object.keys(STYLE_ALIAS);

export function resolveStyleId(id: string | undefined): string | undefined {
  if (!id) return id;
  return STYLE_ALIAS[id] ?? id;
}

/** CSS-класс стиля для корня поверхности: лента, виджет, оверлей. */
export function styleClass(styleId: string | undefined): string {
  const id = resolveStyleId(styleId)?.trim();
  return `style-${id ? id : "custom"}`;
}

export function isStyleActive<T extends { styleId?: string }>(style: Style<T>, cfg: T): boolean {
  return resolveStyleId(cfg.styleId) === style.id;
}

/** название выбранного стиля — для заголовка свёрнутого блока */
export function styleName<T>(styles: Style<T>[], id: string | undefined): string {
  const resolved = resolveStyleId(id);
  return styles.find((s) => s.id === resolved)?.name ?? "свой";
}

/** описание темы: по нему видно, есть ли у неё наборы и окно */
export function findStyle<T>(styles: Style<T>[], id: string | undefined): Style<T> | undefined {
  const resolved = resolveStyleId(id);
  return styles.find((s) => s.id === resolved);
}

/**
 * Набор цветов темы. Хранится в настройках строкой, а неизвестное значение
 * (старые настройки, чужая тема) сводится к первому набору — так у темы
 * всегда есть рабочий вид.
 */
export function resolveTone<T>(style: Style<T> | undefined, tone: string | undefined): string | undefined {
  if (!style?.tones?.length) return undefined;
  return style.tones.some((t) => t.id === tone) ? tone : style.tones[0].id;
}

/** подпись набора для галереи и заголовков */
export function toneName<T>(style: Style<T> | undefined, tone: string | undefined): string | undefined {
  const id = resolveTone(style, tone);
  return style?.tones?.find((t) => t.id === id)?.name;
}

/**
 * Шрифт строк. Темы с forceFont задают гарнитуру сами (иначе Unbounded,
 * Pixelify или Caveat просто не появятся), у остальных побеждает выбор
 * пользователя из набора шрифтов.
 */
export function styleFont<T>(styles: Style<T>[], cfg: { styleId?: string }): string | null {
  const style = findStyle(styles, cfg.styleId);
  return style?.forceFont ? style.font : null;
}

/**
 * Вид «только текст»: подложки выключены, и тема умеет снимать плашки.
 * Тогда корень получает data-bare, а строкам достаются цвета темы для
 * жизни на голом фоне.
 */
export function isBareText<T>(
  styles: Style<T>[],
  cfg: { styleId?: string },
  platesOff: boolean,
): boolean {
  return platesOff && !!findStyle(styles, cfg.styleId)?.bareText;
}

/**
 * Переменные строки для ЖИВОГО образца в галерее стилей: образец рендерится
 * настоящими CSS-классами стиля, а переменные берутся из патча стиля,
 * поэтому миниатюра совпадает с реальным видом (прозрачность, полоса,
 * скругление).
 */
export function previewRowVars(patch: Record<string, unknown>): CSSProperties {
  const p = patch as Record<string, unknown>;
  const isFeed = typeof p.backdrop === "boolean";
  const op = isFeed
    ? p.backdrop
      ? 1
      : 0
    : p.transparent
      ? 0
      : typeof p.backdropOpacity === "number"
        ? p.backdropOpacity
        : 0.7;
  const r = typeof p.radius === "number" ? p.radius : 10;
  const stripe = !!(p.stripe ?? p.accentBar ?? false);
  return {
    "--y-op": op,
    "--y-r": `${r}px`,
    "--y-sw": stripe ? "3px" : "0px",
    "--y-sc": "#9a6cf0",
    "--y-nc": "#6cb2ff",
    "--y-ts": "none",
    "--y-bg": "transparent",
    "--y-ink": "#eef0f8",
    "--y-blur": "none",
  } as CSSProperties;
}

export const OVERLAY_PRESETS = OVERLAY_STYLES;
