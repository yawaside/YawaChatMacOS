import { describe, expect, it } from "vitest";
import { checkMessageFilters, normalizeFilterText, type FilterBlock } from "./filters";
import {
  isStickerOnly,
  parseMessage,
  parseSevenTvSet,
  resolveEmote,
  safeImageSrc,
  sanitizeForSpeech,
  setSevenTvGlobal,
  stripEmotes,
} from "./emotes";
import { createHideRegistry, matchesHide } from "./hide";
import { resolveStyleId, styleName } from "./presets";
import type { ChatHideRequest } from "./types";

describe("emotes and message text", () => {
  it("accepts only http and https image URLs", () => {
    expect(safeImageSrc("https://cdn.example/emote.png")).toBe("https://cdn.example/emote.png");
    expect(safeImageSrc("javascript:alert(1)")).toBe("");
    expect(safeImageSrc("data:image/svg+xml,<svg>")).toBe("");
  });

  it("parses multiple inline and dictionary emotes", () => {
    const parts = parseMessage("hi [[e|https://cdn.example/a.png|party]] :kappa: bye", "twitch");
    expect(parts.filter((part) => part.kind === "emote")).toHaveLength(2);
    expect(stripEmotes("hi [[e|https://cdn.example/a.png|party]] :kappa:", "twitch")).toBe("hi");
    expect(isStickerOnly("[[e|https://cdn.example/a.png|party]] :kappa:", "twitch")).toBe(true);
  });

  it("removes control and service characters before speech", () => {
    expect(sanitizeForSpeech("hello ___ \u0000 world!!!!!")).toBe("hello world!");
  });

  it("renders built-in TikTok bracket codes as emotes only for TikTok", () => {
    const parts = parseMessage("привет [smile] как дела [laughwithtears]", "tiktok");
    const emotes = parts.filter((part) => part.kind === "emote");
    expect(emotes).toHaveLength(2);
    expect(emotes[0]).toMatchObject({ code: "smile" });
    expect(emotes[0].kind === "emote" && emotes[0].url).toContain("1f60a.png");
    expect(stripEmotes("привет [smile] как дела [laughwithtears]", "tiktok")).toBe("привет как дела");
    expect(isStickerOnly("[cool] [wow]", "tiktok")).toBe(true);

    // неизвестный код и скобки без кода остаются текстом
    expect(parseMessage("[unknowncode] и [1+1]", "tiktok")).toEqual([
      { kind: "text", text: "[unknowncode] и [1+1]" },
    ]);
    // на других площадках квадратные скобки — обычный текст
    expect(parseMessage("[smile]", "twitch")).toEqual([{ kind: "text", text: "[smile]" }]);
    // смайл подписчика от коннектора и встроенный код живут вместе
    const mixed = parseMessage("[[e|https://cdn.example/a.webp|myemote]] [happy]", "tiktok");
    expect(
      mixed.filter((part) => part.kind === "emote").map((part) => part.kind === "emote" && part.code),
    ).toEqual(["myemote", "happy"]);

    // расширенные и персонажные коды смайлов TikTok LIVE
    const characterCodes = parseMessage(
      "[rockycool] [rosiecute] [jolliewow] [sagethink] [laughcry] [thumb] [thanks] [congrat]",
      "tiktok",
    );
    expect(characterCodes.filter((part) => part.kind === "emote")).toHaveLength(8);
  });

  it("renders Unicode TikTok emoji as images, including skin tones, bare pictographs, ZWJ and flags", () => {
    const parts = parseMessage("🙂 👍🏽 ❤️ \u2764 \u263A 🩷 ❤️‍🔥 🇷🇺", "tiktok");
    const emotes = parts.filter((part) => part.kind === "emote");
    expect(emotes).toHaveLength(8);
    expect(emotes.map((part) => (part.kind === "emote" ? part.url.split("/").pop() : ""))).toEqual([
      "1f642.png",
      "1f44d-1f3fd.png",
      "2764.png",
      "2764.png",
      "263a.png",
      "1fa77.png",
      "2764-fe0f-200d-1f525.png",
      "1f1f7-1f1fa.png",
    ]);
    expect(parseMessage("🙂", "twitch")).toEqual([{ kind: "text", text: "🙂" }]);
  });

  it("parses the 7tv global set and resolves its codes", () => {
    const sample = {
      emotes: [
        {
          name: "RainTime",
          data: {
            host: {
              url: "//cdn.7tv.app/emote/01FCY771D800007PQ2DF3GDTN6",
              files: [{ name: "3x.webp" }, { name: "2x.webp" }],
            },
          },
        },
        { name: "no-host", data: {} },
        { data: { host: { url: "//cdn.7tv.app/emote/skipped", files: [] } } },
      ],
    };
    expect(parseSevenTvSet(sample)).toEqual([
      { code: "RainTime", url: "https://cdn.7tv.app/emote/01FCY771D800007PQ2DF3GDTN6/3x.webp" },
    ]);
    expect(setSevenTvGlobal(parseSevenTvSet(sample))).toBe(1);

    expect(resolveEmote("raintime", "twitch")?.url).toContain("01FCY771D800007PQ2DF3GDTN6/3x.webp");
    const parts = parseMessage("смотри :RainTime: отлично", "twitch");
    expect(parts.some((p) => p.kind === "emote" && p.code === "RainTime")).toBe(true);
    expect(stripEmotes("смотри :RainTime: отлично", "twitch")).toBe("смотри отлично");

    // словарь площадки главнее набора 7TV
    expect(resolveEmote("kappa", "twitch")?.url).toContain("emoticons/v2/25");
    // небезопасные ссылки не внедряются
    expect(setSevenTvGlobal([{ code: "evil", url: "javascript:alert(1)" }])).toBe(0);
  });
});

describe("message filters", () => {
  const block: FilterBlock = {
    id: "custom",
    name: "Custom",
    desc: "",
    category: "common",
    enabled: true,
    words: ["собака"],
    customWords: [],
    disabledWords: [],
  };

  it("normalizes homoglyphs and separators", () => {
    expect(normalizeFilterText("с о б а к а").compact).toBe("собака");
    expect(checkMessageFilters("с 0 б а к а", "twitch", [block]).matched).toBe(true);
  });

  it("honors white and ignored authors", () => {
    expect(checkMessageFilters("собака", "twitch", [block], "Admin", ["admin"]).matched).toBe(false);
    expect(checkMessageFilters("hello", "twitch", [block], "Spammer", [], ["spammer"]).blockId).toBe(
      "authors",
    );
  });
});

describe("hide registry", () => {
  const message = { sid: 7, userId: "42", platform: "twitch" as const, author: "Alice" };

  it("matches exact, author, userId and platform hide requests", () => {
    expect(matchesHide(message, { sids: [7] })).toBe(true);
    expect(matchesHide(message, { author: "alice", platform: "twitch" })).toBe(true);
    expect(matchesHide(message, { userId: "42", platform: "twitch" })).toBe(true);
    expect(matchesHide(message, { all: true, platform: "youtube" })).toBe(false);
  });

  it("remembers hide requests for messages arriving later", () => {
    const registry = createHideRegistry();
    const request: ChatHideRequest = { author: "Alice", platform: "twitch" };
    registry.recall(request);
    expect(registry.isHidden(message)).toBe(true);
    expect(registry.apply([message], request)).toEqual([]);
  });
});

describe("style aliases", () => {
  it("resolves legacy style ids and finds display names", () => {
    expect(resolveStyleId("classic")).toBe("clean");
    expect(
      styleName(
        [
          {
            id: "clean",
            name: "Clean",
            desc: "",
            swatch: ["#000", "#fff"],
            font: "sans-serif",
            patch: {},
          },
        ],
        "classic",
      ),
    ).toBe("Clean");
  });
});
