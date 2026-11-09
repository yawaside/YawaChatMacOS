import { describe, expect, it } from "vitest";
import {
  DEFAULT_DONATEBAR,
  DEFAULT_DONATEBAR_STATE,
  donateBarLabel,
  donateBarMainTotal,
  donateBarOtherCurrencies,
  donateBarProgress,
  formatDonateAmount,
  normalizeDonateBarConfig,
  normalizeDonateBarState,
  type DonateBarState,
} from "./donatebar";

function state(p: Partial<DonateBarState> = {}): DonateBarState {
  return { ...DEFAULT_DONATEBAR_STATE, ...p };
}

describe("donateBarMainTotal", () => {
  it("берёт сумму в основной валюте", () => {
    const s = state({ currency: "₽", totals: { "₽": 250, $: 50 } });
    expect(donateBarMainTotal(s)).toBe(250);
  });

  it("возвращает стартовую сумму, если валюты ещё нет", () => {
    const s = state({ start: 100, currency: "₽", totals: {} });
    expect(donateBarMainTotal(s)).toBe(100);
  });

  it("игнорирует битые значения (NaN/не-число)", () => {
    const s = state({ start: 7, totals: { "₽": NaN } });
    expect(donateBarMainTotal(s)).toBe(7);
  });
});

describe("donateBarOtherCurrencies", () => {
  it("показывает только чужие валюты с деньгами, по убыванию", () => {
    const s = state({
      currency: "₽",
      totals: { "₽": 250, $: 50, "€": 120, "₸": 0 },
    });
    expect(donateBarOtherCurrencies(s)).toEqual([
      { currency: "€", amount: 120 },
      { currency: "$", amount: 50 },
    ]);
  });

  it("не показывает основную валюту и нулевые суммы", () => {
    const s = state({ currency: "$", totals: { $: 10, "₽": 0 } });
    expect(donateBarOtherCurrencies(s)).toEqual([]);
  });
});

describe("donateBarProgress", () => {
  it("0..1 к цели от стартовой суммы", () => {
    const s = state({ start: 0, goal: 500, currency: "₽", totals: { "₽": 250 } });
    expect(donateBarProgress(s)).toBeCloseTo(0.5);
  });

  it("не уходит за единицу и не уходит в минус", () => {
    expect(donateBarProgress(state({ start: 0, goal: 100, currency: "₽", totals: { "₽": 999 } }))).toBe(1);
    expect(donateBarProgress(state({ start: 100, goal: 200, currency: "₽", totals: { "₽": 50 } }))).toBe(0);
  });

  it("без цели — полоса полная", () => {
    expect(donateBarProgress(state({ goal: 0, totals: { "₽": 0 } }))).toBe(1);
    expect(donateBarProgress(state({ start: 100, goal: 100 }))).toBe(1);
  });

  it("учитывает стартовую сумму (базу)", () => {
    // старт 100, цель 200, накоплено 150 → половина пути
    const s = state({ start: 100, goal: 200, currency: "₽", totals: { "₽": 150 } });
    expect(donateBarProgress(s)).toBeCloseTo(0.5);
  });
});

describe("formatDonateAmount", () => {
  it("округляет в плюс до целых и ставит разделители", () => {
    expect(formatDonateAmount(1234.4)).toBe("1\u00a0234");
    expect(formatDonateAmount(1234.6)).toBe("1\u00a0235");
    expect(formatDonateAmount(0)).toBe("0");
  });

  it("битое значение — 0", () => {
    expect(formatDonateAmount(NaN)).toBe("0");
  });
});

describe("donateBarLabel", () => {
  it("пустая надпись не оставляет дыру", () => {
    expect(donateBarLabel("")).toBe("Донаты");
    expect(donateBarLabel("  ")).toBe("Донаты");
    expect(donateBarLabel("На микрофон")).toBe("На микрофон");
  });
});

describe("normalizeDonateBarConfig", () => {
  it("старый стиль заменяется на стиль по умолчанию, недостающие поля дописываются", () => {
    expect(normalizeDonateBarConfig({ style: "broadcast", start: 20 })).toEqual({
      ...DEFAULT_DONATEBAR,
      start: 20,
    });
  });

  it("сохраняет свою надпись и режим «только полоса»", () => {
    expect(normalizeDonateBarConfig({ title: "  На камеру  ", barOnly: true, style: "ice" })).toMatchObject({
      title: "На камеру",
      barOnly: true,
      style: "ice",
    });
  });

  it("обрезает слишком длинную надпись", () => {
    expect(normalizeDonateBarConfig({ title: "я".repeat(80) }).title).toHaveLength(40);
  });
});

describe("normalizeDonateBarState", () => {
  it("пропускает валидный снимок", () => {
    const s = normalizeDonateBarState({
      start: 10,
      goal: 500,
      currency: "$",
      style: "sakura",
      title: "Сакура",
      barOnly: true,
      totals: { $: 120, "₽": 40 },
    });
    expect(s).toEqual({
      start: 10,
      goal: 500,
      currency: "$",
      style: "sakura",
      title: "Сакура",
      barOnly: true,
      totals: { $: 120, "₽": 40 },
    });
  });

  it("чинит битые поля и выбрасывает мусор из totals", () => {
    const s = normalizeDonateBarState({
      start: "10",
      currency: "",
      totals: { $: 5, "₽": NaN, x: "y" },
    });
    expect(s).toEqual({ ...DEFAULT_DONATEBAR, totals: { $: 5 } });
  });

  it("неизвестный id стиля (из старой версии) → стиль по умолчанию", () => {
    expect(normalizeDonateBarState({ style: "classic" })?.style).toBe(DEFAULT_DONATEBAR.style);
    expect(normalizeDonateBarState({ style: "neon" })?.style).toBe(DEFAULT_DONATEBAR.style);
  });

  it("пустой/несуществующий вход — значения по умолчанию", () => {
    expect(normalizeDonateBarState(null)).toEqual(DEFAULT_DONATEBAR_STATE);
    expect(normalizeDonateBarState(undefined)).toEqual(DEFAULT_DONATEBAR_STATE);
  });
});
