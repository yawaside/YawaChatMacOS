import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SETTINGS_INDEX, searchSettings, settingKey } from "./settingsIndex";

/** панели настроек и раздел, в котором они живут */
const PANEL_TABS: Record<string, string> = {
  "src/components/app/AppViewPanel.tsx": "view",
  "src/components/app/ChatViewPanel.tsx": "chatview",
  "src/components/app/WidgetPanel.tsx": "widget",
  "src/components/app/OverlayPanel.tsx": "overlay",
  "src/components/app/VoicePanel.tsx": "voice",
  "src/components/app/SoundsPanel.tsx": "sounds",
  "src/components/app/RewardSoundsPanel.tsx": "rewards",
  "src/components/app/DonationsPanel.tsx": "donations",
  "src/components/app/FiltersPanel.tsx": "filters",
  "src/components/app/ChatBotPanel.tsx": "chatbot",
  "src/components/app/HotkeysPanel.tsx": "hotkeys",
  "src/components/app/SupportPanel.tsx": "support",
  "src/components/app/SettingsShell.tsx": "system",
};

describe("поиск по настройкам", () => {
  it("находит пункт по части названия, без учёта регистра и «ё»", () => {
    expect(searchSettings("неподключенные").map((e) => e.label)).toContain(
      "Скрывать неподключённые площадки",
    );
    expect(searchSettings("ТЕНЬ").map((e) => e.label)).toContain(
      "Мягкая тень текста (читаемость на светлом фоне)",
    );
    expect(searchSettings("скорость").map((e) => e.label)).toContain("Скорость речи");
  });

  it("находит пункт по названию блока", () => {
    const boxes = searchSettings("озвучка").map((e) => e.box);
    expect(boxes.length).toBeGreaterThan(0);
    expect(searchSettings("наград").some((e) => e.tab === "rewards")).toBe(true);
  });

  it("совпадения с начала названия идут первыми", () => {
    const hits = searchSettings("звук");
    expect(settingKey(hits[0].label).startsWith("звук")).toBe(true);
  });

  it("пустой запрос ничего не ищет", () => {
    expect(searchSettings("   ")).toEqual([]);
  });

  it("каждый пункт знает свой раздел", () => {
    const tabs = new Set(Object.values(PANEL_TABS));
    for (const e of SETTINGS_INDEX) {
      expect(e.label.trim().length).toBeGreaterThan(0);
      expect(tabs.has(e.tab)).toBe(true);
    }
  });

  /* Страховка от расхождения: добавили переключатель в панель — он должен
     находиться поиском. Проверяем по исходникам, а не по разметке: панели
     рендерятся только по одной. */
  it("все пункты и блоки из панелей есть в списке поиска", () => {
    const missing: string[] = [];
    for (const [file, tab] of Object.entries(PANEL_TABS)) {
      const src = readFileSync(file, "utf8");
      /* оболочка держит не только системные пункты: в ней же живёт блок
         «Устройство вывода звука» из раздела «Озвучка» */
      const known = new Set(
        SETTINGS_INDEX.filter((e) => tab === "system" || e.tab === tab).map((e) => settingKey(e.label)),
      );

      const labels = [...src.matchAll(/\blabel="([^"]+)"/g)].map((m) => m[1]);
      const titles = [...src.matchAll(/<(?:Box|Collapsible)\b[\s\S]{0,400}?title="([^"]+)"/g)].map(
        (m) => m[1],
      );
      for (const label of [...labels, ...titles]) {
        if (!known.has(settingKey(label))) missing.push(`${tab}: ${label}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
