/** Смоук-тесты разделов вида «macOS»: каждый рендерится без падений. */
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import {
  MacAppearancePanel,
  MacAuthPanel,
  MacChannelsPanel,
  MacChatbotPanel,
  MacDonationsPanel,
  MacOverlayPanel,
  MacRewardsPanel,
  MacSettingsPanel,
  MacVoicePanel,
} from "./MacPanels";
import type { Channel, ChatMsg } from "../../../lib/types";

const channels: Channel[] = [
  {
    id: "1",
    platform: "twitch",
    username: "yawaside",
    title: "yawa.side",
    status: "online",
    viewers: 1234,
    messages: 42,
  },
  {
    id: "2",
    platform: "donationalerts",
    username: "yawaside",
    status: "connected",
    viewers: 0,
    messages: 0,
    token: "t",
  },
];

const feed: ChatMsg[] = [
  {
    id: 1,
    ts: Date.now(),
    platform: "twitch",
    channel: "yawaside",
    author: "neon_foxx",
    color: "#FF9F5A",
    text: "привет всем",
    kind: "chat",
    badges: ["sub"],
  },
  {
    id: 2,
    ts: Date.now() - 1000,
    platform: "donationalerts",
    channel: "yawaside",
    author: "Аноним",
    color: "#FFD60A",
    text: "за стрим!",
    kind: "donate",
    badges: [],
    amount: 300,
    currency: "₽",
  },
];

const noop = () => {};

describe("macOS: разделы рендерятся", () => {
  it("Каналы", () => {
    const html = renderToString(
      createElement(MacChannelsPanel, { channels, onToggleChannel: noop, onAddChannel: noop }),
    ).replace(/<!--.*?-->/g, "");
    expect(html).toContain("Каналы");
    expect(html).toContain("yawa.side");
    expect(html).toContain("в эфире · 1234 зрит.");
    /* донат-площадки подписываются «подключено», а не «не в эфире» */
    expect(html).toContain("подключено");
  });

  it("Авторизация — состояние входа настоящее", () => {
    const html = renderToString(
      createElement(MacAuthPanel, {
        botAuth: { twitch: "token" },
        channels,
        onOpenChatbot: noop,
        onOpenDonations: noop,
      }),
    );
    expect(html).toContain("Авторизация");
    expect(html).toContain("Twitch — чат-бот");
    /* Twitch вошёл, DonatePay — нет */
    expect(html).toContain("вошли");
    expect(html).toContain("не подключено");
  });

  it("Чат-бот", () => {
    const html = renderToString(createElement(MacChatbotPanel));
    expect(html).toContain("Чат-бот и модерация");
    expect(html).toContain("!discord");
  });

  it("Донаты — лента из настоящих сообщений", () => {
    const html = renderToString(
      createElement(MacDonationsPanel, { feed, channels, onOpenDonationSettings: noop }),
    );
    expect(html).toContain("Донаты");
    expect(html).toContain("Аноним");
    expect(html).toContain("300");
  });

  it("Озвучка", () => {
    const html = renderToString(
      createElement(MacVoicePanel, {
        ttsOn: true,
        onToggleTts: noop,
        ttsVolume: 0.9,
        onTtsVolume: noop,
        queueLength: 2,
        onOpenVoiceSettings: noop,
      }),
    );
    expect(html).toContain("Озвучка");
    expect(html).toContain("90%");
    expect(html).toContain("В очередь на озвучку: 2");
  });

  it("Звуки наград — строки из настоящих наград", () => {
    const html = renderToString(
      createElement(MacRewardsPanel, {
        rewards: [{ title: "Гонг", cost: 100, platform: "twitch" }],
        onOpenRewardSettings: noop,
      }),
    );
    expect(html).toContain("Звуки наград");
    expect(html).toContain("Гонг");
    expect(html).toContain("100 баллов");
  });

  it("Оверлей и OBS — превью из настоящей ленты", () => {
    const html = renderToString(
      createElement(MacOverlayPanel, {
        feed,
        viewers: 42,
        widgetUrl: "https://yawa.chat/widget/chat?k=test",
        onCopyWidget: noop,
        onOpenOverlaySettings: noop,
      }),
    );
    expect(html).toContain("Оверлей и виджет OBS");
    expect(html).toContain("neon_foxx");
  });

  it("Оформление", () => {
    const html = renderToString(createElement(MacAppearancePanel, { feedStyleId: "clean", onOpenTab: noop }));
    expect(html).toContain("Оформление");
    expect(html).toContain("Чистый");
    expect(html).toContain("Предпросмотр");
  });

  it("Настройки", () => {
    const html = renderToString(
      createElement(MacSettingsPanel, { accent: "#0A84FF", onAccent: noop, onOpenTab: noop }),
    );
    expect(html).toContain("Настройки");
    expect(html).toContain("Горячие клавиши");
  });
});
