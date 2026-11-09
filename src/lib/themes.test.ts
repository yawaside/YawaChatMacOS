import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FEED_STYLES,
  OVERLAY_STYLES,
  WIDGET_STYLES,
  findStyle,
  isBareText,
  resolveStyleId,
  resolveTone,
  styleFont,
  toneName,
} from "./presets";

/* ---------- темы, наборы и режим «только текст» ---------- */

describe("resolveTone", () => {
  const retrowave = findStyle(WIDGET_STYLES, "retrowave");

  it("оставляет известный набор", () => {
    expect(resolveTone(retrowave, "ice")).toBe("ice");
  });

  it("неизвестный набор сводит к первому", () => {
    expect(resolveTone(retrowave, "нет-такого")).toBe("sunset");
    expect(resolveTone(retrowave, undefined)).toBe("sunset");
  });

  it("у темы без наборов возвращает undefined", () => {
    const plain = WIDGET_STYLES.find((s) => !s.tones?.length);
    expect(resolveTone(plain, "any")).toBeUndefined();
  });
});

describe("styleFont", () => {
  it("тема с forceFont навязывает свою гарнитуру", () => {
    const comic = findStyle(WIDGET_STYLES, "comic");
    expect(styleFont(WIDGET_STYLES, { styleId: "comic" })).toBe(comic?.font);
  });

  it("у обычной темы выбора нет — остаётся шрифт пользователя", () => {
    const plain = WIDGET_STYLES.find((s) => !s.forceFont);
    expect(plain).toBeDefined();
    expect(styleFont(WIDGET_STYLES, { styleId: plain?.id })).toBeNull();
  });
});

describe("isBareText", () => {
  it("включается только при выключенных плашках", () => {
    expect(isBareText(WIDGET_STYLES, { styleId: "retrowave" }, true)).toBe(true);
    expect(isBareText(WIDGET_STYLES, { styleId: "retrowave" }, false)).toBe(false);
  });

  it("у темы без bareText вид не меняется", () => {
    const plain = WIDGET_STYLES.find((s) => !s.bareText);
    expect(plain).toBeDefined();
    expect(isBareText(WIDGET_STYLES, { styleId: plain?.id }, true)).toBe(false);
  });
});

describe("галереи тем", () => {
  const surfaces = [
    ["лента", FEED_STYLES],
    ["виджет", WIDGET_STYLES],
    ["оверлей", OVERLAY_STYLES],
  ] as const;

  it("на всех трёх поверхностях одинаковый набор тем с наборами цветов", () => {
    for (const [, styles] of surfaces) {
      const themed = styles.filter((s) => s.tones?.length);
      expect(themed.length).toBe(12);
      for (const s of themed) expect(s.tones?.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("id совпадают между поверхностями", () => {
    const ids = FEED_STYLES.filter((s) => s.tones?.length).map((s) => s.id);
    for (const [, styles] of surfaces) {
      expect(styles.filter((s) => s.tones?.length).map((s) => s.id)).toEqual(ids);
    }
  });

  it("подпись набора берётся из темы", () => {
    const vhs = findStyle(OVERLAY_STYLES, "vhs");
    expect(toneName(vhs, "sepia")).toBe("Сепия");
  });
});

/* ---------- повторы, скругление плашек, обводка ---------- */

describe("набор без повторов", () => {
  const surfaces = [
    ["лента", FEED_STYLES],
    ["виджет", WIDGET_STYLES],
    ["оверлей", OVERLAY_STYLES],
  ] as const;

  it("убранные повторы исчезли из всех поверхностей", () => {
    for (const [name, styles] of surfaces) {
      const ids = styles.map((s) => s.id);
      for (const gone of ["neon", "hud", "wot", "tarkov"]) {
        expect(ids, `стиль ${gone} остался в ${name}`).not.toContain(gone);
      }
      expect(new Set(ids).size, `повтор id в ${name}`).toBe(ids.length);
    }
  });

  it("сохранённые id убранных стилей ведут на оставшиеся", () => {
    expect(resolveStyleId("neon")).toBe("cyber");
    expect(resolveStyleId("hud")).toBe("cyber");
    expect(resolveStyleId("wot")).toBe("raid");
    expect(resolveStyleId("tarkov")).toBe("raid");
    // поверхность умеет найти стиль по старому id
    expect(findStyle(WIDGET_STYLES, "wot")?.id).toBe("raid");
  });

  it("скругление плашки у каждой темы берёт значение настройки", () => {
    const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
    const plates = FEED_STYLES.filter((s) => (s.patch as { backdrop?: boolean }).backdrop !== false);
    for (const style of plates) {
      const rule = new RegExp(`\\.style-${style.id} \\.y-row \\{([^}]*)\\}`).exec(css);
      if (!rule) continue;
      const radius = /border-radius:\s*([^;]+);/.exec(rule[1])?.[1] ?? "";
      expect(radius, `тема ${style.id} не слушает скругление`).toContain("var(--y-r");
    }
  });

  it("у светлых тем обводка текста по умолчанию выключена", () => {
    for (const [name, styles] of surfaces) {
      for (const id of ["comic", "outlaw", "pinned", "sketch"]) {
        const patch = findStyle(styles, id)?.patch as { outlineWidth?: number };
        expect(patch?.outlineWidth, `обводка у ${id} в ${name}`).toBe(0);
      }
    }
  });
});
