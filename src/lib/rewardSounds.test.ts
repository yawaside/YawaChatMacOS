import { describe, expect, it } from "vitest";
import {
  emptyRewardRule,
  findRewardRule,
  mergeCreatedRewards,
  prepareRewardDraft,
  isRewardRuleReady,
  mergeRewardRules,
  normalizeRewardTitle,
  rewardDataOf,
  rewardEventKey,
  rewardRuleVolume,
  rewardTitleFromText,
  rewardTitleOf,
} from "./rewardSounds";
import type { ChannelReward } from "./rewardSounds";
import { MAX_REWARD_RULES } from "./types";
import type { RewardSoundRule } from "./types";

const rule = (title: string, sound = "bell", volume = 0.7): RewardSoundRule => ({ title, sound, volume });

describe("reward title", () => {
  it("normalizes case, extra and non-breaking spaces", () => {
    expect(normalizeRewardTitle("  Гонг ")).toBe("гонг");
    expect(normalizeRewardTitle("Highlight\u00a0 my   message")).toBe("highlight my message");
    expect(normalizeRewardTitle(undefined)).toBe("");
  });

  it("reads the title from the feed text as a fallback", () => {
    expect(rewardTitleFromText("ник активировал награду «Гонг»")).toBe("Гонг");
    expect(rewardTitleFromText("ник активировал награду «Гонг»: сделай громко")).toBe("Гонг");
    expect(rewardTitleFromText('ник активировал награду "Гонг"')).toBe("Гонг");
    expect(rewardTitleFromText("обычное сообщение")).toBe("");
  });

  it("prefers the structured title from the host over the text", () => {
    const msg = { text: "ник активировал награду «Гонг»", reward: { title: "Новое название" } };
    expect(rewardTitleOf(msg)).toBe("новое название");
    expect(rewardTitleOf({ text: "ник активировал награду «Гонг»" })).toBe("гонг");
    expect(rewardTitleOf(undefined)).toBe("");
  });

  it("normalizes the host's flat reward fields and preserves the platform id", () => {
    const fields = { rewardTitle: "VK награда", rewardId: "vk-1", rewardCost: 250 };
    expect(rewardDataOf(fields)).toEqual({ title: "VK награда", id: "vk-1", cost: 250 });
    expect(rewardTitleOf({ text: "активировал награду «другое»", ...fields })).toBe("vk награда");
    expect(rewardDataOf(undefined)).toBeUndefined();
  });

  it("deduplicates a repeated event, not every use of the same reward", () => {
    const activation = {
      platform: "vkplay" as const,
      sid: 101,
      msgId: "event-101",
      id: 1,
      ts: 1000,
      author: "viewer",
      text: "активировал награду",
    };
    const repeated = { ...activation };
    const nextActivation = { ...activation, sid: 102, msgId: "event-102", ts: 2000 };

    expect(rewardEventKey(activation)).toBe(rewardEventKey(repeated));
    expect(rewardEventKey(activation)).not.toBe(rewardEventKey(nextActivation));
  });
});

describe("reward rules", () => {
  it("matches the rule by normalized title", () => {
    const rules = [rule("Гонг", "bell"), rule("Highlight my message", "custom:1", 0.3)];
    expect(findRewardRule(rules, "  гОНГ ")?.sound).toBe("bell");
    expect(findRewardRule(rules, "highlight my message")?.sound).toBe("custom:1");
  });

  it("returns the first rule when titles repeat without a platform", () => {
    const rules = [rule("Гонг", "bell"), rule("ГОНГ", "siren")];
    expect(findRewardRule(rules, "Гонг")?.sound).toBe("bell");
  });

  it("matches identical ids and titles only within the reward's platform", () => {
    const rules: RewardSoundRule[] = [
      { ...rule("Гонг", "bell"), platform: "twitch", id: "same-id" },
      { ...rule("Гонг", "siren"), platform: "vkplay", id: "same-id" },
    ];

    expect(findRewardRule(rules, "Переименован", "same-id", "twitch")?.sound).toBe("bell");
    expect(findRewardRule(rules, "Переименован", "same-id", "vkplay")?.sound).toBe("siren");
  });

  it("uses a legacy shared rule only when no platform-specific match exists", () => {
    const rules: RewardSoundRule[] = [
      { ...rule("Общая награда", "bell"), platform: "twitch" },
      rule("Общая награда", "siren"),
    ];

    expect(findRewardRule(rules, "Общая награда", undefined, "vkplay")?.sound).toBe("siren");
    expect(findRewardRule(rules, "Общая награда", undefined, "twitch")?.sound).toBe("bell");
  });

  it("finds nothing without a title, a rule or an empty list", () => {
    expect(findRewardRule([rule("Гонг")], "")).toBeUndefined();
    expect(findRewardRule([rule("Гонг")], "Другая награда")).toBeUndefined();
    expect(findRewardRule(undefined, "Гонг")).toBeUndefined();
  });

  it("ignores broken rules instead of throwing", () => {
    const broken = [{ title: "Гонг" }, { sound: "bell" }] as unknown as RewardSoundRule[];
    expect(findRewardRule(broken, "Гонг")).toBeUndefined();
    expect(findRewardRule(broken, "bell")).toBeUndefined();
  });

  it("prefers the platform id over the title after a rename", () => {
    const rules = [rule("Гонг", "bell"), rule("смех", "boing")];
    rules[0].id = "r-1";
    // награду переименовали на Twitch: звук обязан остаться прикреплён к ней
    expect(findRewardRule(rules, "Гонг 2026", "r-1")?.sound).toBe("bell");
    // идентификатор чужой — совпадение только по названию
    expect(findRewardRule(rules, "смех", "другая")?.sound).toBe("boing");
    // без совпадения по id и по названию — тишина
    expect(findRewardRule(rules, "Новая награда", "r-9")).toBeUndefined();
  });

  it("validates rules and volumes", () => {
    expect(isRewardRuleReady(emptyRewardRule())).toBe(false);
    expect(isRewardRuleReady({ title: "Гонг", sound: "bell", volume: 0.5 })).toBe(true);
    expect(isRewardRuleReady({ title: "  ", sound: "bell", volume: 0.5 })).toBe(false);
    expect(rewardRuleVolume({ title: "Гонг", sound: "bell", volume: 5 })).toBe(1);
    expect(rewardRuleVolume({ title: "Гонг", sound: "bell", volume: -2 })).toBe(0);
    expect(rewardRuleVolume({ title: "Гонг", sound: "bell", volume: Number.NaN })).toBe(0.7);
    expect(rewardRuleVolume(undefined)).toBe(0.7);
  });
});

describe("merge of channel rewards", () => {
  const reward = (id: string, title: string, cost = 500): ChannelReward => ({ id, title, cost });

  it("adds new rewards as empty rules", () => {
    const out = mergeRewardRules([], [reward("r-1", "Гонг", 100), reward("r-2", "смех")]);
    expect(out.added).toEqual(["Гонг", "смех"]);
    expect(out.skipped).toBe(0);
    expect(out.rules).toEqual([
      { title: "Гонг", sound: "", volume: 0.7, id: "r-1", cost: 100 },
      { title: "смех", sound: "", volume: 0.7, id: "r-2", cost: 500 },
    ]);
  });

  it("keeps identical Twitch and VK rewards in separate rules", () => {
    const out = mergeRewardRules(
      [],
      [
        { ...reward("same", "Гонг"), platform: "twitch" },
        { ...reward("same", "Гонг"), platform: "vkplay" },
      ],
    );

    expect(out.rules).toHaveLength(2);
    expect(out.rules.map((item) => item.platform)).toEqual(["twitch", "vkplay"]);
    expect(out.added).toEqual(["Гонг", "Гонг"]);
  });

  it("copies a legacy configured rule to every platform claiming it", () => {
    // До разделения площадок правило было общим. Если награда «Гонг» есть и
    // на Twitch, и на VK, настроенный звук должен остаться у ОБЕИХ площадок:
    // раньше VK-строка создавалась пустой и активации VK молчали.
    const oldRule = { ...rule("Гонг", "custom:bell"), id: "same" };
    const out = mergeRewardRules(
      [oldRule],
      [
        { ...reward("same", "Гонг"), platform: "twitch" },
        { ...reward("same", "Гонг"), platform: "vkplay" },
      ],
    );

    expect(out.changed).toBe(true);
    expect(out.rules).toHaveLength(2);
    expect(out.rules[0]).toMatchObject({ platform: "twitch", sound: "custom:bell", id: "same" });
    expect(out.rules[1]).toMatchObject({ platform: "vkplay", sound: "custom:bell", id: "same" });
    // активация VK находит настроенный звук
    expect(findRewardRule(out.rules, "Переименован", "same", "vkplay")?.sound).toBe("custom:bell");
    // копия — не «новая награда»: пользователю не нужно ничего настраивать
    expect(out.added).toEqual([]);
  });

  it("keeps a legacy configured rule for the platform that claimed it alone", () => {
    const oldRule = { ...rule("Гонг", "custom:bell") };
    const out = mergeRewardRules([oldRule], [{ ...reward("v-1", "Гонг"), platform: "vkplay" }]);
    expect(out.rules).toHaveLength(1);
    expect(out.rules[0]).toMatchObject({ platform: "vkplay", sound: "custom:bell", id: "v-1" });
  });

  it("copies the sound of a legacy rule matched by different ids and titles", () => {
    // Twitch-награда совпала по названию, VK-награда — по id из старых
    // настроек: обе площадки должны получить настроенный звук.
    const oldRule = { ...rule("Гонг", "custom:bell", 0.4), id: "v-9" };
    const out = mergeRewardRules(
      [oldRule],
      [
        { ...reward("t-1", "Гонг"), platform: "twitch" },
        { ...reward("v-9", "Гонг 2026"), platform: "vkplay" },
      ],
    );
    expect(out.rules).toHaveLength(2);
    expect(out.rules[0]).toMatchObject({ platform: "twitch", sound: "custom:bell", id: "t-1" });
    expect(out.rules[1]).toMatchObject({ platform: "vkplay", sound: "custom:bell", volume: 0.4, id: "v-9" });
  });

  it("keeps configured rules and their order untouched", () => {
    const current = [
      { title: "Гонг", sound: "bell", volume: 0.25, id: "r-1" },
      { title: "смех", sound: "boing", volume: 0.8 },
    ];
    const out = mergeRewardRules(current, [reward("r-1", "Гонг"), reward("r-2", "громкий звук")]);
    expect(out.rules[0]).toEqual({ title: "Гонг", sound: "bell", volume: 0.25, id: "r-1", cost: 500 });
    // «смех» нет в списке площадки: строка остаётся ровно такой, какой была
    expect(out.rules[1]).toEqual({ title: "смех", sound: "boing", volume: 0.8 });
    expect(out.rules[2]).toEqual({
      title: "громкий звук",
      sound: "",
      volume: 0.7,
      id: "r-2",
      cost: 500,
    });
    expect(out.added).toEqual(["громкий звук"]);
    // исходный массив правил не мутируем — React сравнивает ссылки
    expect(current[0]).toEqual({ title: "Гонг", sound: "bell", volume: 0.25, id: "r-1" });
  });

  it("matches a renamed reward by id and renames unconfigured rows", () => {
    const configured = { title: "Гонг", sound: "bell", volume: 0.7, id: "r-1" };
    const out = mergeRewardRules([configured], [reward("r-1", "Гонг-2026")]);
    // настроенная строка: название не переписываем, звук на месте
    expect(out.rules).toHaveLength(1);
    expect(out.rules[0]).toEqual({ title: "Гонг", sound: "bell", volume: 0.7, id: "r-1", cost: 500 });
    // ещё не настроенная строка (звука нет) — приводим к названию площадки
    const out2 = mergeRewardRules(
      [{ title: "Гонг", sound: "", volume: 0.7, id: "r-1" }],
      [reward("r-1", "Гонг-2026")],
    );
    expect(out2.rules).toHaveLength(1);
    expect(out2.rules[0].title).toBe("Гонг-2026");
    expect(out2.rules[0].sound).toBe("");
  });

  it("keeps rules for rewards deleted on the platform", () => {
    const out = mergeRewardRules([rule("Старая награда", "bell")], [reward("r-1", "Гонг")]);
    expect(out.rules).toHaveLength(2);
    expect(out.rules[0].sound).toBe("bell");
  });

  it("keeps the configured sound when the platform re-created the reward", () => {
    // Награду на площадке удалили и создали заново: id новый, название прежнее.
    const configured: RewardSoundRule[] = [
      { title: "Гонг", sound: "custom:bell", volume: 0.4, platform: "vkplay", id: "old-id" },
    ];
    const out = mergeRewardRules(configured, [{ ...reward("new-id", "Гонг", 300), platform: "vkplay" }]);

    expect(out.rules).toHaveLength(1);
    expect(out.rules[0]).toMatchObject({ sound: "custom:bell", volume: 0.4, id: "new-id" });
    expect(out.added).toEqual([]);
    // После переподключения звук находится и по новому id, и по названию.
    const vkRules = out.rules;
    expect(findRewardRule(vkRules, "Гонг", "new-id", "vkplay")?.sound).toBe("custom:bell");
    expect(findRewardRule(vkRules, "гонг", undefined, "vkplay")?.sound).toBe("custom:bell");
  });

  it("does not touch the id of a rule matched by the same id", () => {
    const configured: RewardSoundRule[] = [
      { title: "Гонг", sound: "bell", volume: 0.7, platform: "twitch", id: "r-1" },
    ];
    const out = mergeRewardRules(configured, [{ ...reward("r-1", "Гонг", 500), platform: "twitch" }]);
    expect(out.rules[0]).toMatchObject({ id: "r-1", sound: "bell" });
  });

  it("does not exceed the rule limit", () => {
    const current: RewardSoundRule[] = Array.from({ length: MAX_REWARD_RULES }, (_, i) =>
      rule(`награда ${i}`, "bell"),
    );
    const out = mergeRewardRules(current, [reward("r-1", "лишняя 1"), reward("r-2", "лишняя 2")]);
    expect(out.added).toEqual([]);
    expect(out.skipped).toBe(2);
    expect(out.rules).toHaveLength(MAX_REWARD_RULES);
  });

  it("survives an empty or broken list", () => {
    expect(mergeRewardRules(undefined, undefined).rules).toEqual([]);
    expect(mergeRewardRules(undefined, []).added).toEqual([]);
    expect(mergeRewardRules([rule("Гонг")], [reward("", "  ")]).rules).toEqual([
      { title: "Гонг", sound: "bell", volume: 0.7 },
    ]);
  });
});

/* ---------- создание награды на площадках ---------- */

describe("prepareRewardDraft", () => {
  const base = {
    title: "Сменить музыку",
    cost: 500,
    platforms: ["twitch" as const],
    description: "",
    messageRequired: true,
  };

  it("пропускает заполненный черновик и чистит название", () => {
    const out = prepareRewardDraft({ ...base, title: "  Сменить\u00a0  музыку  " });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.reward.title).toBe("Сменить музыку");
  });

  it("требует название и площадку", () => {
    expect(prepareRewardDraft({ ...base, title: "   " })).toEqual({
      ok: false,
      error: "Укажите название награды",
    });
    expect(prepareRewardDraft({ ...base, platforms: [] }).ok).toBe(false);
  });

  it("не пропускает цену вне пределов площадки", () => {
    expect(prepareRewardDraft({ ...base, cost: 0 }).ok).toBe(false);
    expect(prepareRewardDraft({ ...base, cost: 1_000_001 }).ok).toBe(false);
    expect(prepareRewardDraft({ ...base, cost: Number.NaN }).ok).toBe(false);
    expect(prepareRewardDraft({ ...base, cost: 1 }).ok).toBe(true);
  });

  it("называет площадку в причине отказа", () => {
    const out = prepareRewardDraft({ ...base, platforms: ["twitch", "vkplay"], cost: 1_000_001 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("Twitch");
  });

  it("длинное название не обрезается молча, а отклоняется", () => {
    const out = prepareRewardDraft({ ...base, title: "x".repeat(46) });
    expect(out.ok).toBe(false);
  });
});

describe("mergeCreatedRewards", () => {
  const created = { platform: "twitch" as const, id: "abc", title: "Сменить музыку", cost: 500 };

  it("добавляет строку награды без звука", () => {
    const out = mergeCreatedRewards([], [created]);
    expect(out.changed).toBe(true);
    expect(out.rules).toEqual([
      { platform: "twitch", id: "abc", title: "Сменить музыку", cost: 500, sound: "", volume: 0.7 },
    ]);
  });

  it("не плодит дубли и обновляет цену", () => {
    const current: RewardSoundRule[] = [
      { title: "Сменить музыку", sound: "bell", volume: 0.7, platform: "twitch" },
    ];
    const out = mergeCreatedRewards(current, [{ ...created, cost: 750 }]);
    expect(out.rules).toHaveLength(1);
    expect(out.rules[0].id).toBe("abc");
    expect(out.rules[0].cost).toBe(750);
    expect(out.rules[0].sound).toBe("bell");
  });

  it("различает одинаковые названия на разных площадках", () => {
    const out = mergeCreatedRewards(
      [{ title: "Сменить музыку", sound: "bell", volume: 0.7, platform: "twitch" }],
      [{ ...created, platform: "vkplay", id: "vk-1" }],
    );
    expect(out.rules).toHaveLength(2);
  });

  it("не выходит за лимит правил", () => {
    const full: RewardSoundRule[] = Array.from({ length: MAX_REWARD_RULES }, (_, i) => rule(`н${i}`));
    const out = mergeCreatedRewards(full, [created]);
    expect(out.rules).toHaveLength(MAX_REWARD_RULES);
    expect(out.changed).toBe(false);
  });
});
