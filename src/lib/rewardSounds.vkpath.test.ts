/**
 * Проверка полного пути события активации награды VK Видео Live:
 * сырой кадр хоста → нормализация → выбор правила → звук.
 *
 * Сценарии повторяют реальную работу окна приложения (DesktopApp):
 * rewardDataOf для плоских полей хоста, rewardTitleOf как источник названия,
 * findRewardRule с платформой vkplay, защита от дублей rewardEventKey.
 */
import { describe, expect, it } from "vitest";
import {
  findRewardRule,
  mergeRewardRules,
  rewardDataOf,
  rewardEventKey,
  rewardRuleVolume,
  rewardTitleFromText,
  rewardTitleOf,
  seedRewardTitleCache,
} from "./rewardSounds";
import type { ChannelReward } from "./rewardSounds";
import type { ChatMsg, RewardSoundRule } from "./types";

/** Сырой кадр хоста: ChatEvent из webview2/Connectors.cs (cp_reward_demand).
 * id и цена могут приходить числом — VK Video Live шлёт их именно так. */
interface HostRewardEvent {
  platform: "vkplay";
  kind: "reward";
  text: string;
  rewardTitle?: string | null | number;
  rewardId?: string | null | number;
  rewardCost?: number | null;
  sid?: number;
  author: string;
  reward?: { title?: string | number; id?: string | number; cost?: number };
}

/** Нормализация, как в DesktopApp (norm.reward = rewardDataOf(m)).
 * Приводим к any, чтобы передавать в rewardDataOf кадры с числовыми полями
 * (как они приходят от VK Video Live до сериализации хостом). */
function normalize(m: HostRewardEvent): ChatMsg {
  const reward = rewardDataOf(m as unknown as Parameters<typeof rewardDataOf>[0]);
  return {
    id: 1,
    ts: 1000,
    platform: m.platform,
    channel: "chan",
    author: m.author,
    color: "",
    text: m.text,
    kind: m.kind,
    sid: m.sid,
    reward: reward,
  } as ChatMsg;
}

/** Логика notifyRewardSound из DesktopApp — без звука, только решение. */
function decideSound(
  m: ChatMsg,
  cfg: { enabled: boolean; rules: RewardSoundRule[]; cooldown: number },
  alreadyPlayed: Set<string>,
  lastPlayedAt: { value: number },
  now = 10_000,
): { played: boolean; sound?: string; volume?: number } {
  if (m.deleted || m.kind !== "reward") return { played: false };
  const eventKey = rewardEventKey(m);
  if (alreadyPlayed.has(eventKey)) return { played: false };
  alreadyPlayed.add(eventKey);
  if (!cfg.enabled) return { played: false };
  const rewardPlatform = m.platform === "twitch" || m.platform === "vkplay" ? m.platform : undefined;
  const rule = findRewardRule(cfg.rules, rewardTitleOf(m), m.reward?.id, rewardPlatform);
  if (!rule || !String(rule.sound)) return { played: false };
  const gap = Math.max(0, cfg.cooldown) * 1000;
  if (gap > 0 && now - lastPlayedAt.value < gap) return { played: false };
  lastPlayedAt.value = now;
  return { played: true, sound: rule.sound, volume: rewardRuleVolume(rule) };
}

describe("VK: полный путь события награды до звука", () => {
  const cfg = { enabled: true, cooldown: 0, rules: [] as RewardSoundRule[] };

  /** Правила после синхронизации наград VK и выбора звука пользователем. */
  const vkRewards: ChannelReward[] = [
    { id: "42", title: "Гонг", cost: 100, platform: "vkplay" },
    { id: "43", title: "Смех", cost: 200, platform: "vkplay" },
  ];
  const synced = mergeRewardRules([], vkRewards).rules.map((r) =>
    r.title === "Гонг" ? { ...r, sound: "custom:bell", volume: 0.6 } : r,
  );
  const rulesCfg = { ...cfg, rules: synced };

  it("событие с названием и id: звук играется", () => {
    const m = normalize({
      platform: "vkplay",
      kind: "reward",
      author: "viewer",
      text: "активировал награду «Гонг»",
      rewardTitle: "Гонг",
      rewardId: "42",
      rewardCost: 100,
      sid: 101,
    });
    const out = decideSound(m, rulesCfg, new Set(), { value: 0 });
    expect(out).toEqual({ played: true, sound: "custom:bell", volume: 0.6 });
  });

  it("событие только с id (названия нет, каталог помог): звук играется", () => {
    const m = normalize({
      platform: "vkplay",
      kind: "reward",
      author: "viewer",
      text: "активировал награду «Гонг»",
      // хост взял название из каталога и прислал rewardTitle
      rewardTitle: "Гонг",
      rewardId: "42",
      rewardCost: 100,
      sid: 102,
    });
    const out = decideSound(m, rulesCfg, new Set(), { value: 0 });
    expect(out.played).toBe(true);
  });

  it("событие без названия и без каталога: правило всё равно находится по id", () => {
    const m = normalize({
      platform: "vkplay",
      kind: "reward",
      author: "viewer",
      text: "активировал награду «награда»",
      rewardTitle: null,
      rewardId: "42",
      rewardCost: null,
      sid: 103,
    });
    const out = decideSound(m, rulesCfg, new Set(), { value: 0 });
    expect(out.played).toBe(true);
  });

  it("повтор того же события (тот же sid) не звучит дважды", () => {
    const mk = () =>
      normalize({
        platform: "vkplay",
        kind: "reward",
        author: "viewer",
        text: "активировал награду «Гонг»",
        rewardTitle: "Гонг",
        rewardId: "42",
        rewardCost: 100,
        sid: 104,
      });
    const played = new Set<string>();
    const first = decideSound(mk(), rulesCfg, played, { value: 0 });
    const second = decideSound(mk(), rulesCfg, played, { value: 0 });
    expect(first.played).toBe(true);
    expect(second.played).toBe(false);
  });

  it("обновление заявки (cp_reward_demand_update) — новый sid: звук звучит ПОВТОРНО", () => {
    // Хост не различает создание заявки и смену её статуса: обе приходят
    // как отдельные события с разными сквозными sid. Это двойной сигнал.
    const played = new Set<string>();
    const first = decideSound(
      normalize({
        platform: "vkplay",
        kind: "reward",
        author: "viewer",
        text: "активировал награду «Гонг»",
        rewardTitle: "Гонг",
        rewardId: "42",
        rewardCost: 100,
        sid: 105,
      }),
      rulesCfg,
      played,
      { value: 0 },
    );
    const second = decideSound(
      normalize({
        platform: "vkplay",
        kind: "reward",
        author: "viewer",
        text: "активировал награду «Гонг»",
        rewardTitle: "Гонг",
        rewardId: "42",
        rewardCost: 100,
        sid: 106,
      }),
      rulesCfg,
      played,
      { value: 20_000 },
    );
    expect(first.played).toBe(true);
    // фиксируем текущее поведение: дубликата нет защиты по demandId
    expect(second.played).toBe(true);
  });

  it("правило Twitch с тем же id не перехватывает активацию VK", () => {
    const mixed: RewardSoundRule[] = [
      { title: "Гонг", sound: "siren", volume: 0.5, platform: "twitch", id: "42" },
      { title: "Гонг", sound: "custom:bell", volume: 0.6, platform: "vkplay", id: "42" },
    ];
    const m = normalize({
      platform: "vkplay",
      kind: "reward",
      author: "viewer",
      text: "активировал награду «Гонг»",
      rewardTitle: "Гонг",
      rewardId: "42",
      rewardCost: 100,
      sid: 107,
    });
    const out = decideSound(m, { ...cfg, rules: mixed }, new Set(), { value: 0 });
    expect(out.sound).toBe("custom:bell");
  });

  it("правило без площадки (старые настройки) остаётся запасным для VK", () => {
    const legacy: RewardSoundRule[] = [{ title: "Гонг", sound: "custom:bell", volume: 0.6 }];
    const m = normalize({
      platform: "vkplay",
      kind: "reward",
      author: "viewer",
      text: "активировал награду «Гонг»",
      rewardTitle: "Гонг",
      rewardId: "42",
      rewardCost: 100,
      sid: 108,
    });
    const out = decideSound(m, { ...cfg, rules: legacy }, new Set(), { value: 0 });
    expect(out.played).toBe(true);
  });
});

describe("VK: синхронизация наград и миграция старых правил", () => {
  it("старое настроенное правило, общее для Twitch и VK, сохраняет звук для ОБЕИХ площадок", () => {
    // Сценарий обновления 2.3.4: до разделения по площадкам правило было
    // общим. Раньше настроенный звук доставался только Twitch-строке,
    // а VK-строка создавалась пустой — активации VK молчали.
    const legacy: RewardSoundRule[] = [{ title: "Гонг", sound: "custom:bell", volume: 0.6, id: "same" }];
    const out = mergeRewardRules(legacy, [
      { id: "same", title: "Гонг", cost: 100, platform: "twitch" },
      { id: "same", title: "Гонг", cost: 100, platform: "vkplay" },
    ]);
    const vkRule = out.rules.find((r) => r.platform === "vkplay");
    expect(vkRule?.sound).toBe("custom:bell");
    // и активация VK по id находит настроенный звук
    const found = findRewardRule(out.rules, "Гонг", "same", "vkplay");
    expect(found?.sound).toBe("custom:bell");
  });
});

describe("VK: регрессии 2.3.7 — звук не пропадает на числовых id и заглушке «награда»", () => {
  it("числовой rewardId и числовой rewardCost не теряются в рендерере", () => {
    // VK Video Live шлёт id и цену числами внутри вложенного reward:
    // раньше TS принимал только строки и терял id — правило не находилось.
    const data = rewardDataOf({
      text: "активировал награду «Гонг»",
      reward: { id: 42, title: "Гонг", cost: 100 },
    } as unknown as Parameters<typeof rewardDataOf>[0]);
    expect(data?.id).toBe("42");
    expect(data?.cost).toBe(100);
    expect(data?.title).toBe("Гонг");
  });

  it("плоские поля с числовым rewardId тоже читаются", () => {
    const data = rewardDataOf({
      text: "",
      rewardId: 777,
      rewardTitle: "Смех",
      rewardCost: "250",
    } as unknown as Parameters<typeof rewardDataOf>[0]);
    expect(data?.id).toBe("777");
    expect(data?.title).toBe("Смех");
    expect(data?.cost).toBe(250);
  });

  it("заглушка «награда» из текста не подменяет настоящее название", () => {
    // Когда хост не знает настоящее имя, он шлёт «активировал награду «награда»».
    // Такой текст не должен давать название «награда»: тогда findRewardRule
    // сначала ищет по id и находит правило.
    expect(rewardTitleFromText("активировал награду «награда»")).toBe("");
    expect(rewardTitleFromText("активировал награду «награда»: привет")).toBe("");
    // настоящее название по-прежнему извлекается
    expect(rewardTitleFromText("активировал награду «Гонг»")).toBe("Гонг");
  });

  it("событие VK БЕЗ названия и БЕЗ текста — звук всё равно играется по id после сида кэша", () => {
    // Сценарий: cp_reward_demand_update приходит только с id (без названия),
    // в тексте — заглушка «награда». После синхронизации кэш знает имя,
    // и правило срабатывает.
    const rules: RewardSoundRule[] = [
      { platform: "vkplay", id: "99", title: "Гонг", sound: "custom:bell", volume: 0.6 },
    ];
    seedRewardTitleCache(rules);
    const m = normalize({
      platform: "vkplay",
      kind: "reward",
      author: "viewer",
      text: "активировал награду «награда»",
      rewardTitle: null,
      rewardId: "99",
      sid: 201,
    });
    const out = decideSound(m, { enabled: true, cooldown: 0, rules }, new Set(), { value: 0 });
    expect(out.played).toBe(true);
    expect(out.sound).toBe("custom:bell");
  });

  it("вложенный reward с числовым id: правило находится и без названия в тексте", () => {
    // Настоящий формат VK Video Live: { reward: { id: 42 } } без title.
    const rules: RewardSoundRule[] = [
      { platform: "vkplay", id: "42", title: "Гонг", sound: "custom:bell", volume: 0.6 },
    ];
    seedRewardTitleCache(rules);
    const ev = {
      platform: "vkplay" as const,
      kind: "reward" as const,
      author: "viewer",
      text: "активировал награду «награда»",
      rewardId: undefined,
      rewardTitle: null,
      rewardCost: null,
      reward: { id: 42 },
      sid: 202,
    };
    const data = rewardDataOf(ev as unknown as Parameters<typeof rewardDataOf>[0]);
    expect(data?.id).toBe("42");
    const title = rewardTitleOf({ ...ev, reward: data } as unknown as Parameters<typeof rewardTitleOf>[0]);
    // заглушка не использована — название из кэша
    expect(title).toBe("гонг");
    const found = findRewardRule(rules, title, data?.id, "vkplay");
    expect(found?.sound).toBe("custom:bell");
  });
});
