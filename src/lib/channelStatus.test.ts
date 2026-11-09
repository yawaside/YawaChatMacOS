import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ChannelErrorDetails from "../components/app/ChannelErrorDetails";
import { CHANNEL_HELP } from "./channelHelp";
import {
  markChannelReconnecting,
  updateChannelError,
  updateChannelLikes,
  updateChannelStatus,
} from "./channelStatus";
import type { Channel } from "./types";

const channels: Channel[] = [
  { id: "twitch", platform: "twitch", username: "Streamer", status: "connecting", viewers: 0, messages: 0 },
  { id: "kick", platform: "kick", username: "Streamer", status: "online", viewers: 10, messages: 0 },
];

describe("ошибки каналов", () => {
  it("обновляет только нужный канал и не создаёт удалённый заново", () => {
    const error = { platform: "twitch" as const, username: "streamer", reason: "Нет связи с площадкой." };
    const updated = updateChannelError(channels, error);
    expect(updated[0]).toMatchObject({ status: "error", errorReason: error.reason, viewers: 0 });
    expect(updated[1]).toEqual(channels[1]);
    expect(updateChannelError([], error)).toEqual([]);
  });

  it("сохраняет причину во время автоматической попытки и убирает после успеха или офлайна", () => {
    const error = updateChannelError(channels, {
      platform: "twitch",
      username: "Streamer",
      reason: "Токен истёк.",
    });
    const connecting = updateChannelStatus(error, {
      platform: "twitch",
      username: "Streamer",
      status: "connecting",
      viewers: 0,
    });
    expect(connecting[0].errorReason).toBe("Токен истёк.");
    expect(markChannelReconnecting(error, "twitch")[0]).toMatchObject({
      status: "connecting",
      viewers: 0,
      errorReason: undefined,
    });
    const online = updateChannelStatus(connecting, {
      platform: "twitch",
      username: "Streamer",
      status: "online",
      viewers: 12,
    });
    expect(online[0]).toMatchObject({ status: "online", viewers: 12 });
    expect(online[0].errorReason).toBeUndefined();
    expect(
      updateChannelStatus(connecting, {
        platform: "twitch",
        username: "Streamer",
        status: "offline",
        viewers: 0,
      })[0].errorReason,
    ).toBeUndefined();
  });

  it("не создаёт новый массив, если статус и зрители не изменились", () => {
    const same = updateChannelStatus(channels, {
      platform: "kick",
      username: "Streamer",
      status: "online",
      viewers: 10,
    });
    expect(same).toBe(channels);
  });

  it("обновляет счётчик лайков только у нужного канала и сбрасывает перед новым эфиром", () => {
    const tiktok: Channel = {
      id: "tiktok",
      platform: "tiktok",
      username: "Creator",
      status: "online",
      viewers: 12,
      likes: 120,
      messages: 0,
    };
    const event = { platform: "tiktok" as const, username: "creator", likes: 345 };
    const updated = updateChannelLikes([tiktok], event);
    expect(updated[0].likes).toBe(345);
    expect(updateChannelLikes(updated, event)).toBe(updated);
    expect(
      updateChannelStatus(updated, {
        platform: "tiktok",
        username: "Creator",
        status: "connecting",
        viewers: 0,
      })[0].likes,
    ).toBe(0);
    expect(markChannelReconnecting(updated, "tiktok")[0].likes).toBe(0);
    expect(updateChannelLikes(updated, { ...event, likes: -1 })).toBe(updated);
  });

  it("показывает безопасную причину и действия только у проблемного канала", () => {
    const failed = updateChannelError(channels, {
      platform: "twitch",
      username: "Streamer",
      reason: "Площадка не ответила вовремя.",
    });
    const markup = renderToStaticMarkup(
      createElement(ChannelErrorDetails, { channel: failed[0], onReconnect: () => {} }),
    );
    expect(markup).toContain("Площадка не ответила вовремя.");
    expect(markup).toContain("Переподключить");
    expect(markup).toContain("Открыть инструкцию");
    expect(
      renderToStaticMarkup(
        createElement(ChannelErrorDetails, { channel: channels[1], onReconnect: () => {} }),
      ),
    ).toBe("");
  });

  it("содержит инструкцию по подключению для каждой площадки", () => {
    expect(Object.values(CHANNEL_HELP)).toHaveLength(10);
    expect(CHANNEL_HELP.boosty.join(" ")).toContain("токен");
    expect(CHANNEL_HELP.donatepay.join(" ")).toContain("API-ключ");
    expect(CHANNEL_HELP.memealerts.join(" ")).toContain("support@memealerts.com");
  });
});
