import type { Channel, ChannelStatus, PlatformId } from "./types";

/** События одного подключения от хоста. Причина не сохраняется в настройках. */
export interface ChannelStatusEvent {
  platform: PlatformId;
  username: string;
  status: ChannelStatus;
  viewers: number;
}

export interface ChannelErrorEvent {
  platform: PlatformId;
  username: string;
  reason: string;
}

export interface ChannelLikesEvent {
  platform: PlatformId;
  username: string;
  likes: number;
}

const matches = (c: Channel, event: { platform: PlatformId; username: string }) =>
  c.platform === event.platform && c.username.toLowerCase() === event.username.toLowerCase();

export function updateChannelStatus(channels: Channel[], event: ChannelStatusEvent): Channel[] {
  let changed = false;
  const next = channels.map((c) => {
    if (!matches(c, event)) return c;
    const nextErrorReason = ["online", "connected", "offline"].includes(event.status)
      ? undefined
      : c.errorReason;
    const nextLikes = c.platform === "tiktok" && event.status !== "online" ? 0 : c.likes;
    if (
      c.status === event.status &&
      c.viewers === event.viewers &&
      c.errorReason === nextErrorReason &&
      c.likes === nextLikes
    ) {
      return c;
    }
    changed = true;
    return {
      ...c,
      status: event.status,
      viewers: event.viewers,
      likes: nextLikes,
      // При автоматической повторной попытке причина остаётся видна.
      // Убираем её только когда канал действительно снова доступен.
      errorReason: nextErrorReason,
    };
  });
  return changed ? next : channels;
}

export function updateChannelError(channels: Channel[], event: ChannelErrorEvent): Channel[] {
  let changed = false;
  const expectedReason = event.reason?.trim() || "Не удалось подключить канал. Попробуйте переподключиться.";
  const next = channels.map((c) => {
    if (!matches(c, event)) return c;
    const nextLikes = c.platform === "tiktok" ? 0 : c.likes;
    if (
      c.status === "error" &&
      c.viewers === 0 &&
      c.errorReason === expectedReason &&
      c.likes === nextLikes
    ) {
      return c;
    }
    changed = true;
    return {
      ...c,
      status: "error" as const,
      viewers: 0,
      likes: nextLikes,
      errorReason: expectedReason,
    };
  });
  return changed ? next : channels;
}

/** Применить обновлённый счётчик лайков от подключённого канала. */
export function updateChannelLikes(channels: Channel[], event: ChannelLikesEvent): Channel[] {
  if (!Number.isFinite(event.likes) || event.likes < 0) return channels;
  const likes = Math.floor(event.likes);
  let changed = false;
  const next = channels.map((c) => {
    if (!matches(c, event) || c.likes === likes) return c;
    changed = true;
    return { ...c, likes };
  });
  return changed ? next : channels;
}

export function markChannelReconnecting(channels: Channel[], id: string): Channel[] {
  return channels.map((c) =>
    c.id === id
      ? {
          ...c,
          status: "connecting" as const,
          viewers: 0,
          likes: c.platform === "tiktok" ? 0 : c.likes,
          errorReason: undefined,
        }
      : c,
  );
}
