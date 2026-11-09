/**
 * Дымовой тест раскладок окна: все три вида рендерятся без ошибок и
 * показывают реальные блоки приложения (лента, сводка, заголовок).
 */
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import ChatShell, { type ChatShellProps } from "./ChatShell";
import { DEFAULT_CHAT_VIEW, type ChatMsg, type Channel } from "../../lib/types";

const channels: Channel[] = [
  {
    id: "c1",
    platform: "twitch",
    username: "yawaside",
    status: "online",
    viewers: 123,
    messages: 42,
  },
];

const feed: ChatMsg[] = [
  {
    id: 1,
    ts: Date.now(),
    platform: "twitch",
    channel: "yawaside",
    author: "зритель",
    color: "#9146FF",
    text: "привет",
    kind: "chat",
  },
];

function makeProps(kind: ChatShellProps["kind"]): ChatShellProps {
  return {
    kind,
    feed,
    maxFeed: 300,
    hideDeleted: false,
    mentionHL: true,
    botAuth: {},
    onModerate: () => {},
    onSend: () => {},
    chatView: DEFAULT_CHAT_VIEW,
    onChatMode: () => {},
    channelsPanel: createElement("div", null, "панель каналов"),
    channels,
    onlineCount: 1,
    connectedCount: 1,
    viewers: 123,
    messages: 42,
    donateTotal: 500,
    donateCurrency: "₽",
    subs: 3,
    rewards: [{ title: "Гонг", cost: 100, platform: "twitch" }],
    ttsOn: true,
    ttsVolume: 0.9,
    onTtsVolume: () => {},
    onToggleTts: () => {},
    queueLength: 0,
    focusMode: false,
    onToggleFocus: () => {},
    onOpenSettings: () => {},
    onAddChannel: () => {},
    widgetUrl: null,
    onCopyWidget: () => {},
    filter: "all",
    onFilter: () => {},
    paused: false,
    onPause: () => {},
    search: "",
    onSearch: () => {},
    onClearFeed: () => {},
    viewersHistory: [10, 20, 15, 123],
    windowButtons: createElement("span", null, "окно"),
    audioPanel: createElement("span", null, "звук"),
  };
}

describe("ChatShell", () => {
  it.each(["air", "studio", "mac"] as const)("вид «%s» рендерится", (kind) => {
    const html = renderToString(createElement(ChatShell, makeProps(kind)));
    expect(html).toContain("привет");
    expect(html.length).toBeGreaterThan(500);
  });

  it("«macOS» показывает заголовок, светофоры и сводку эфира", () => {
    const html = renderToString(createElement(ChatShell, makeProps("mac")));
    expect(html).toContain("YawaChat");
    expect(html).toContain("Сводка эфира");
    expect(html).toContain("Основное");
    expect(html).toContain("Приложение");
    expect(html).toContain("Оверлей и OBS");
    expect(html).toContain("Авторизация");
    expect(html).toContain("yawaside");
    /* Spotlight закрыт по умолчанию (кнопка быстрого перехода в заголовке есть) */
    expect(html).not.toContain("Быстрый переход · разделы YawaChat");
  });

  it("«macOS» прячет панели в режиме «только чат»", () => {
    const props = { ...makeProps("mac"), focusMode: true };
    const html = renderToString(createElement(ChatShell, props));
    expect(html).not.toContain("Сводка эфира");
    expect(html).not.toContain("Основное");
    expect(html).toContain("привет");
  });
});
