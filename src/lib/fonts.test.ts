import { describe, expect, it } from "vitest";
import { fontStack, googleFontFamily, isGoogleFontsUrl } from "./fonts";
import { FEED_STYLES, OVERLAY_STYLES, STYLE_IDS, resolveStyleId, styleClass } from "./presets";

/* ---------- разбор ссылок Google Fonts ---------- */

describe("googleFontFamily", () => {
  it("берёт имя первого шрифта из ссылки css2", () => {
    expect(
      googleFontFamily("https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap"),
    ).toBe("Montserrat");
  });

  it("раскрывает + в пробел (Roboto Condensed)", () => {
    expect(googleFontFamily("https://fonts.googleapis.com/css2?family=Roboto+Condensed&display=swap")).toBe(
      "Roboto Condensed",
    );
  });

  it("из нескольких семей берёт первое", () => {
    expect(
      googleFontFamily(
        "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400&family=Inter&display=swap",
      ),
    ).toBe("Playfair Display");
  });

  it("принимает просто имя шрифта", () => {
    expect(googleFontFamily("Unbounded")).toBe("Unbounded");
    expect(googleFontFamily("Рубик")).toBe("Рубик");
  });

  it("отклоняет мусор", () => {
    expect(googleFontFamily("")).toBeNull();
    expect(googleFontFamily(undefined)).toBeNull();
    expect(googleFontFamily("   ")).toBeNull();
    expect(googleFontFamily("http://evil.example/style.css")).toBeNull();
    expect(googleFontFamily("https://fonts.googleapis.com/css2?nope=1")).toBeNull();
    expect(googleFontFamily("a".repeat(200))).toBeNull();
  });
});

describe("isGoogleFontsUrl", () => {
  it("только проверенная ссылка css2 с family", () => {
    expect(isGoogleFontsUrl("https://fonts.googleapis.com/css2?family=Unbounded:wght@400")).toBe(true);
    expect(isGoogleFontsUrl("https://fonts.gstatic.com/css2?family=Unbounded")).toBe(false);
    expect(isGoogleFontsUrl("http://fonts.googleapis.com/css2?family=Unbounded")).toBe(false);
    expect(isGoogleFontsUrl("https://fonts.googleapis.com/css2?display=swap")).toBe(false);
    expect(isGoogleFontsUrl(undefined)).toBe(false);
  });
});

describe("fontStack со своим шрифтом", () => {
  it("ставит свой шрифт перед стеком, системные запасные остаются", () => {
    expect(fontStack("mono", "https://fonts.googleapis.com/css2?family=Space+Mono&display=swap")).toBe(
      '"Space Mono", "JetBrains Mono", "Cascadia Mono", Consolas, ui-monospace, monospace',
    );
  });

  it("без своей ссылки — обычный стек", () => {
    expect(fontStack("inter")).toBe('"Inter", "Segoe UI", system-ui, -apple-system, sans-serif');
  });
});

/* ---------- переезд старых стилей на новый набор ---------- */

describe("миграция стилей", () => {
  it("все старые алиасы указывают НАПРЯМУЮ на существующий стиль (без цепочек)", () => {
    const ids = new Set([...FEED_STYLES, ...OVERLAY_STYLES].map((s) => s.id));
    for (const id of STYLE_IDS) {
      const target = resolveStyleId(id) ?? id;
      expect(ids.has(target), `стиль ${id} уехал на несуществующий ${target}`).toBe(true);
      // раз разрешение однопроходное, второй проход должен давать то же самое
      expect(resolveStyleId(target) ?? target).toBe(target);
    }
  });

  it("styleClass нормализует неизвестный id на custom", () => {
    expect(styleClass("retrowave")).toBe("style-retrowave");
    expect(styleClass("ocean")).toBe("style-clean");
    expect(styleClass("")).toBe("style-custom");
    expect(styleClass(undefined)).toBe("style-custom");
  });
});
