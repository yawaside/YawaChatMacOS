import { describe, expect, it } from "vitest";
import { HOTKEY_ACTIONS, hotkeyName, prettyCombo } from "./hotkeys";
import { DEFAULT_HOTKEYS } from "./types";

describe("hotkey combos", () => {
  it("renders modifier and key codes as readable labels", () => {
    expect(prettyCombo("Ctrl+Shift+KeyG")).toBe("Ctrl + Shift + G");
    expect(prettyCombo("F9")).toBe("F9");
    expect(prettyCombo("Ctrl+Shift+Numpad4")).toBe("Ctrl + Shift + Num 4");
    expect(prettyCombo("")).toBe("—");
  });

  it("keeps every default action described for the settings panel", () => {
    for (const action of Object.keys(DEFAULT_HOTKEYS)) {
      expect(HOTKEY_ACTIONS.some((a) => a.id === action)).toBe(true);
      expect(hotkeyName(action)).not.toBe(action);
    }
  });

  it("does not assign one combo to two actions", () => {
    const combos = Object.values(DEFAULT_HOTKEYS);
    expect(new Set(combos).size).toBe(combos.length);
  });
});
