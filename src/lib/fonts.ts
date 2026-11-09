import type { FontId } from "./types";

/**
 * Шрифтовые наборы для оформления ленты, виджета и оверлея.
 * Первым идёт веб-шрифт, дальше — системные запасные варианты,
 * поэтому оформление не ломается без интернета.
 */
export interface FontDef {
  id: FontId;
  name: string;
  desc: string;
  stack: string;
}

export const FONT_FAMILIES: FontDef[] = [
  {
    id: "inter",
    name: "Inter",
    desc: "нейтральный гротеск",
    stack: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
  },
  {
    id: "mono",
    name: "JetBrains Mono",
    desc: "моноширинный, кибер",
    stack: '"JetBrains Mono", "Cascadia Mono", Consolas, ui-monospace, monospace',
  },
  {
    id: "rounded",
    name: "Nunito",
    desc: "округлый и дружелюбный",
    stack: '"Nunito", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
  },
  {
    id: "gaming",
    name: "Игровой",
    desc: "плотный рубленый, как в игровых чатах",
    // Bebas/Anton отсутствуют в Windows — опираемся на системные аналоги
    stack: '"Segoe UI Semibold", "Arial Black", "Roboto Condensed", Impact, sans-serif',
  },
  {
    id: "condensed",
    name: "Oswald",
    desc: "узкий, много текста в строке",
    stack: '"Oswald", "Arial Narrow", "Segoe UI", sans-serif',
  },
  {
    id: "serif",
    name: "Georgia",
    desc: "с засечками, книжный",
    stack: 'Georgia, "Times New Roman", ui-serif, serif',
  },
  {
    id: "system",
    name: "Системный",
    desc: "шрифт оформления Windows",
    stack: 'system-ui, "Segoe UI", Tahoma, sans-serif',
  },
];

/**
 * Сторонний сервис шрифтов: пользователь может добавить СВОЙ шрифт ссылкой
 * Google Fonts (fonts.google.com → «Скопировать в CSS»). Из ссылки берётся
 * ИМЯ ПЕРВОГО шрифта — им подменяется начало стека выбранного набора,
 * системные запасные варианты остаются позади.
 */
export function googleFontFamily(input: string | undefined): string | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/[?&]family=([^&]+)/);
  if (m) {
    const fam = decodeURIComponent(m[1]).split(";")[0].split(",")[0].split(":")[0].trim().replace(/\+/g, " ");
    return fam || null;
  }
  // допустимо просто имя шрифта
  if (/^[\p{L}\p{N} _&-]{2,60}$/u.test(s)) return s;
  return null;
}

/** только проверенная ссылка Google Fonts (css2) — иначе не подключаем */
export function isGoogleFontsUrl(url: string | undefined): boolean {
  return !!url && /^https:\/\/fonts\.googleapis\.com\/css2\?/.test(url) && url.includes("family=");
}

export function fontStack(id: FontId | undefined, customFont?: string): string {
  const base = (FONT_FAMILIES.find((f) => f.id === id) ?? FONT_FAMILIES[0]).stack;
  const fam = googleFontFamily(customFont);
  return fam ? `"${fam}", ${base}` : base;
}
