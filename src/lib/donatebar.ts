/**
 * Полоса донатов — отдельный OBS-виджет: одна общая сумма денежных донатов
 * всех площадок, старт/цель, надпись и стиль оформления.
 *
 * Накопленный итог живёт в настройках хоста и сбрасывается только вручную
 * из вкладки «Донаты». Здесь — форма состояния, стили и чистые расчёты.
 */

/** Семь оформлений. Старые id (неон, терминал, аркада и т.д.) больше не
    используются: неизвестный id показывается стилем по умолчанию. */
export type DonateBarStyleId = "potion" | "ring" | "graffiti" | "scope" | "sakura" | "quest" | "ice";

export interface DonateBarStyle {
  id: DonateBarStyleId;
  /** название для списка стилей в настройках */
  name: string;
  /** короткая характеристика для подсказки */
  hint: string;
  /** класс-рецепт в index.css */
  cls: string;
}

export const DONATE_BAR_STYLES: DonateBarStyle[] = [
  {
    id: "potion",
    name: "Зелье",
    hint: "стеклянная колба: уровень наливается волной",
    cls: "ybar-potion",
  },
  {
    id: "ring",
    name: "Кольцо",
    hint: "круговой счётчик: процент в центре, сумма рядом",
    cls: "ybar-ring",
  },
  {
    id: "graffiti",
    name: "Граффити",
    hint: "уличная наклейка: скотч, краска в два прохода, потёк",
    cls: "ybar-graffiti",
  },
  {
    id: "scope",
    name: "Прицел",
    hint: "дальномер: деления, перекрестие, тонкий луч",
    cls: "ybar-scope",
  },
  {
    id: "sakura",
    name: "Сакура",
    hint: "ночная ветка: мягкая заливка и цветок на конце",
    cls: "ybar-sakura",
  },
  {
    id: "quest",
    name: "Квест",
    hint: "каменная шкала задания с тлеющими ячейками",
    cls: "ybar-quest",
  },
  {
    id: "ice",
    name: "Лёд",
    hint: "гранёный слиток с трещиной и кристаллом на конце",
    cls: "ybar-ice",
  },
];

const STYLE_IDS = new Set<string>(DONATE_BAR_STYLES.map((s) => s.id));

export function donateBarStyle(id: string): DonateBarStyle {
  return DONATE_BAR_STYLES.find((s) => s.id === id) ?? DONATE_BAR_STYLES[0];
}

export function isDonateBarStyle(id: string): id is DonateBarStyleId {
  return STYLE_IDS.has(id);
}

/** Надпись на полосе. Пустая строка на экране показывается как «Донаты». */
export const DONATE_BAR_TITLE_MAX = 40;
export const DEFAULT_DONATE_BAR_TITLE = "Донаты";

/** Обрезка надписи без trim: пробел в конце нужен, пока человек ещё печатает. */
export function clampDonateBarTitle(v: unknown): string {
  if (typeof v !== "string") return DEFAULT_DONATE_BAR_TITLE;
  return v.slice(0, DONATE_BAR_TITLE_MAX);
}

export function normalizeDonateBarTitle(v: unknown): string {
  if (typeof v !== "string") return DEFAULT_DONATE_BAR_TITLE;
  return v.trim().slice(0, DONATE_BAR_TITLE_MAX);
}

/** Настройки полосы (хранятся в ключе «donatebar»). Итог здесь НЕ лежит. */
export interface DonateBarConfig {
  /** стартовая сумма: с неё начинается полоса (по умолчанию 0) */
  start: number;
  /** цель; 0 — без цели (полоса просто показывает накопленное) */
  goal: number;
  /** валюта цели и основного счётчика */
  currency: string;
  /** стиль оформления */
  style: DonateBarStyleId;
  /** своя надпись вместо «Донаты»; пустая — снова «Донаты» */
  title: string;
  /** скрыть надпись, сумму и другие валюты — остаётся полоса и процент */
  barOnly: boolean;
}

export const DEFAULT_DONATEBAR: DonateBarConfig = {
  start: 0,
  goal: 0,
  currency: "₽",
  style: "potion",
  title: DEFAULT_DONATE_BAR_TITLE,
  barOnly: false,
};

/**
 * Снимок состояния, который хост шлёт виджету и настройкам:
 * totals — накопленные суммы по валютам ({"₽": 250, "$": 50}).
 */
export interface DonateBarState {
  start: number;
  goal: number;
  currency: string;
  style: DonateBarStyleId;
  title: string;
  barOnly: boolean;
  totals: Record<string, number>;
}

export const DEFAULT_DONATEBAR_STATE: DonateBarState = {
  start: 0,
  goal: 0,
  currency: "₽",
  style: "potion",
  title: DEFAULT_DONATE_BAR_TITLE,
  barOnly: false,
  totals: {},
};

/** Текст, который реально рисуется. Пустая надпись не оставляет дыру. */
export function donateBarLabel(title: string | undefined, fallback = DEFAULT_DONATE_BAR_TITLE): string {
  const t = (title ?? "").trim();
  return t || fallback;
}

/** Сумма в основной валюте полосы (то, что считается к цели). */
export function donateBarMainTotal(state: DonateBarState): number {
  const v = state.totals[state.currency];
  return typeof v === "number" && isFinite(v) ? v : state.start;
}

/** Другие валюты с ненулевой суммой — показываются отдельной строкой. */
export function donateBarOtherCurrencies(state: DonateBarState): { currency: string; amount: number }[] {
  return Object.entries(state.totals)
    .filter(([cur, v]) => cur !== state.currency && typeof v === "number" && v > 0)
    .map(([currency, amount]) => ({ currency, amount: amount as number }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Прогресс к цели, 0..1. Без цели (goal <= start) полоса рисуется полной:
 * счётчик идёт, а «недостача» не нарисовывается.
 */
export function donateBarProgress(state: DonateBarState): number {
  const total = donateBarMainTotal(state);
  const { start, goal } = state;
  if (goal <= start) return 1;
  return Math.min(1, Math.max(0, (total - start) / (goal - start)));
}

/** Целые деньги — без копеек; дробные суммы площадок округляем в плюс. */
export function formatDonateAmount(v: number): string {
  if (!isFinite(v)) return "0";
  return Math.round(v).toLocaleString("ru-RU");
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && isFinite(v) && v >= 0 ? v : fallback;
}

/** Настройки из хранилища: старый стиль и пустые поля не ломают полосу. */
export function normalizeDonateBarConfig(p: unknown): DonateBarConfig {
  const raw = (p ?? {}) as Partial<DonateBarConfig>;
  const currency =
    typeof raw.currency === "string" && raw.currency ? raw.currency : DEFAULT_DONATEBAR.currency;
  return {
    start: num(raw.start),
    goal: num(raw.goal),
    currency,
    style: typeof raw.style === "string" && isDonateBarStyle(raw.style) ? raw.style : DEFAULT_DONATEBAR.style,
    title: raw.title === undefined ? DEFAULT_DONATE_BAR_TITLE : normalizeDonateBarTitle(raw.title),
    barOnly: raw.barOnly === true,
  };
}

/**
 * Нормализация снимка состояния от хоста (SSE/мост) с защитой от битых
 * полей: приложение и виджет получают один и тот же формат.
 */
export function normalizeDonateBarState(p: unknown): DonateBarState | null {
  const raw = (p ?? {}) as Partial<DonateBarState>;
  if (typeof raw !== "object") return null;
  const totals: Record<string, number> = {};
  if (raw.totals && typeof raw.totals === "object")
    for (const [k, v] of Object.entries(raw.totals)) if (typeof v === "number" && isFinite(v)) totals[k] = v;
  const cfg = normalizeDonateBarConfig(raw);
  return { ...cfg, totals };
}
