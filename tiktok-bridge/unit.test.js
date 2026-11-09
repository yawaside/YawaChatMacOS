const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const {
  attachTikTokContentEvents,
  buildText,
  connectionErrorCode,
  giftInfoOf,
  likeTotalOf,
  normalizeUser,
  roomUserCount,
  roomInfoViewers,
  socialKindOf,
  safeErrorCode,
} = require("./bridge.js");

function harness() {
  const client = new EventEmitter();
  const events = [];
  attachTikTokContentEvents(client, (event) => events.push(event));
  return { client, events };
}

test("нормализует имя и ссылку канала", () => {
  assert.equal(normalizeUser(" @streamer/live "), "streamer");
  assert.equal(normalizeUser("https://www.tiktok.com/@creator/live?x=1"), "creator");
});

test("читает текущих зрителей из старой и новой схемы TikTok", () => {
  assert.equal(roomUserCount({ viewerCount: 7, totalUser: 700 }), 7);
  assert.equal(roomUserCount({ viewer_count: "8", total_user: "800" }), 8);
  // v3: поле 3 называется total, а не totalUser (поле 7).
  assert.equal(roomUserCount({ total: "42", totalUser: "4200" }), 42);
  assert.equal(roomUserCount({ data: { total: "13", totalUser: "1300" } }), 13);
  assert.equal(roomUserCount({ userCount: 9 }), 9);
  assert.equal(roomUserCount({ user_count: "10" }), 10);
  assert.equal(roomUserCount({}), null);
});

test("не подставляет totalUser вместо текущих зрителей", () => {
  assert.equal(roomUserCount({ totalUser: "4200" }), null);
  assert.equal(roomUserCount({ total_user: "1300" }), null);
  assert.equal(roomUserCount({ data: { totalUser: "1300" } }), null);
  assert.equal(roomUserCount({ total: "invalid", totalUser: "4200" }), null);
});

test("нулевой онлайн не заменяется другим счётчиком", () => {
  assert.equal(roomUserCount({ viewerCount: 0, totalUser: 700 }), 0);
  assert.equal(roomUserCount({ total: "0", totalUser: "4200" }), 0);
  assert.equal(roomInfoViewers({ liveRoomStats: { userCount: 0 }, userCount: 12 }), 0);
});

test("HTTP-информация комнаты содержит только текущий онлайн", () => {
  assert.equal(roomInfoViewers({ liveRoomStats: { userCount: 17, totalUser: 1700 } }), 17);
  assert.equal(roomInfoViewers({ live_room_stats: { user_count: "18" } }), 18);
  assert.equal(roomInfoViewers({ liveRoomStats: { viewerCount: "19" } }), 19);
  assert.equal(roomInfoViewers({ live_room_stats: { viewer_count: "20" } }), 20);
  assert.equal(roomInfoViewers({ userCount: "21", totalUser: "2100" }), 21);
  assert.equal(roomInfoViewers({ user_count: "22" }), 22);
  assert.equal(roomInfoViewers({ viewerCount: "23" }), 23);
  assert.equal(roomInfoViewers({ viewer_count: "24" }), 24);
  assert.equal(roomInfoViewers({ liveRoomStats: { totalUser: 1700 }, userCount: 17 }), 17);
  assert.equal(roomInfoViewers({ live_room_stats: { total_user: "1800" }, user_count: "18" }), 18);
  assert.equal(roomInfoViewers({ liveRoomStats: { totalUser: 1700 }, totalUser: 1700 }), null);
  assert.equal(roomInfoViewers({ live_room_stats: { total_user: "1800" }, total_user: "1800" }), null);
  // total имеет смысл текущих зрителей только в roomUser, не в HTTP-статистике.
  assert.equal(roomInfoViewers({ liveRoomStats: { total: "9999" } }), null);
  assert.equal(roomInfoViewers(undefined), null);
});

test("неверные счётчики зрителей игнорируются", () => {
  for (const value of [null, undefined, "", false, true, -1, "-1", "invalid", Infinity, NaN]) {
    assert.equal(roomUserCount({ total: value }), null);
    assert.equal(roomInfoViewers({ liveRoomStats: { userCount: value } }), null);
  }
});

test("ошибка подключения не передаёт в хост токены и адреса прокси", () => {
  assert.equal(connectionErrorCode({ response: { statusCode: 403 } }), "access-denied");
  assert.equal(connectionErrorCode({ code: "ETIMEDOUT" }), "network");
  assert.equal(
    connectionErrorCode({ message: "https://user:password@proxy.test/?token=secret" }),
    "connect-failed",
  );
  assert.equal(safeErrorCode({ code: "MODULE_NOT_FOUND" }), "MODULE_NOT_FOUND");
  assert.equal(
    safeErrorCode({ code: "Bearer proxy-password", message: "https://user:pass@proxy.test" }),
    "unknown",
  );
});

test("распознаёт follow/share в старой и новой схеме", () => {
  assert.equal(socialKindOf({ displayType: "pm_mt_guidance_viewer_1" }, "follow"), "follow");
  assert.equal(socialKindOf({ action: "share" }), "share");
  assert.equal(
    socialKindOf({ common: { displayText: { key: "pm_mt_msg_viewer_follow_anchor" } } }),
    "follow",
  );
});

test("передаёт подарок v3 отдельным событием с итогом в алмазах", () => {
  const { client, events } = harness();
  client.emit("gift", {
    user: {
      nickname: "Даритель",
      avatarThumb: { urlList: ["https://example.test/avatar.jpg"] },
    },
    gift: { name: "Роза", type: 0, diamondCount: 5 },
    repeatCount: 3,
  });

  assert.deepEqual(events, [
    {
      type: "event",
      kind: "gift",
      author: "Даритель",
      text: "отправил подарок «Роза» ×3",
      amount: 15,
      currency: "алм.",
      avatar: "https://example.test/avatar.jpg",
    },
  ]);
});

test("серийный подарок отправляется один раз после завершения серии", () => {
  const { client, events } = harness();
  client.emit("gift", {
    user: { displayId: "fan" },
    gift: { name: "Сердце", type: 1, diamondCount: 1 },
    repeatCount: 2,
    repeatEnd: 0,
  });
  client.emit("gift", {
    user: { displayId: "fan" },
    gift: { name: "Сердце", type: 1, diamondCount: 1 },
    repeatCount: 2,
    repeatEnd: 1,
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "gift");
  assert.equal(events[0].amount, 2);
});

test("decodedData страхует подписки и не дублирует обычное событие", () => {
  const { client, events } = harness();
  const data = { user: { nickname: "Подписчик" }, subMonth: "3" };
  client.emit("decodedData", "WebcastSubNotifyMessage", {
    type: "WebcastSubNotifyMessage",
    data,
  });
  client.emit("subNotify", data);

  assert.deepEqual(events, [
    {
      type: "event",
      kind: "sub",
      author: "Подписчик",
      text: "оформил подписку (3 мес.)",
      avatar: undefined,
    },
  ]);
});

test("follow из decodedData доходит один раз и запускает тип фолловера", () => {
  const { client, events } = harness();
  const data = {
    user: { displayId: "new_follower" },
    common: { displayText: { key: "pm_mt_msg_viewer_follow_anchor" } },
  };
  client.emit("decodedData", "WebcastSocialMessage", {
    type: "WebcastSocialMessage",
    data,
  });
  client.emit("follow", data);

  assert.deepEqual(events, [
    {
      type: "event",
      kind: "sub",
      author: "new_follower",
      text: "подписался на канал",
      avatar: undefined,
    },
  ]);
});

test("передаёт вход зрителя в эфир и не дублирует decodedData с member", () => {
  const { client, events } = harness();
  const data = { user: { nickname: "Новенький" }, action: 1 };
  client.emit("decodedData", "WebcastMemberMessage", {
    type: "WebcastMemberMessage",
    data,
  });
  client.emit("member", data);

  assert.deepEqual(events, [
    {
      type: "event",
      kind: "join",
      author: "Новенький",
      text: "присоединился к трансляции",
      avatar: undefined,
    },
  ]);
});

test("не принимает действие подписки за вход в эфир", () => {
  const { client, events } = harness();
  client.emit("member", { user: { nickname: "Подписчик" }, action: 3 });
  assert.deepEqual(events, []);
});

test("сумму лайков читает из старой схемы и v3", () => {
  assert.equal(likeTotalOf({ totalLikeCount: 17 }), 17);
  assert.equal(likeTotalOf({ total_like_count: "18" }), 18);
  assert.equal(likeTotalOf({ total: "1234" }), 1234);
});

test("обновляет счётчик лайков из v3, где итог называется total", () => {
  const { client, events } = harness();
  client.emit("like", { user: { nickname: "Зритель" }, count: 5, total: "120" });

  assert.deepEqual(events, [
    { type: "metrics", likes: 120 },
    {
      type: "event",
      kind: "like",
      author: "Зритель",
      text: "лайков на стриме: 120",
    },
  ]);
});

test("giftInfoOf поддерживает прежние имена полей", () => {
  assert.deepEqual(
    giftInfoOf({
      giftDetails: { giftName: "Старый подарок", diamondCount: 2, giftType: 0 },
      repeat_count: 4,
    }),
    {
      data: {
        giftDetails: { giftName: "Старый подарок", diamondCount: 2, giftType: 0 },
        repeat_count: 4,
      },
      name: "Старый подарок",
      repeat: 4,
      totalDiamonds: 8,
      shouldEmit: true,
    },
  );
});

test("смайл подписчика в новой схеме заменяет свой код в скобках картинкой", () => {
  const url = "https://example.test/emote.webp";
  const text = buildText(
    {
      content: "привет [myemote] всем",
      emotes: [{ index: 7, emote: { emoteId: "1", image: { urlList: [url] } } }],
    },
    "привет [myemote] всем",
  );
  assert.equal(text, `привет [[e|${url}|myemote]] всем`);
});

test("позиция смайла в байтах и кодовых точках приводится к позиции в строке", () => {
  const url = "https://example.test/emote.webp";
  const comment = "привет [myemote]";
  // «привет » — 7 символов, но 13 байт в UTF-8
  assert.equal(
    buildText({ emotes: [{ index: 13, emote: { image: { urlList: [url] } } }] }, comment),
    `привет [[e|${url}|myemote]]`,
  );
  // эмодзи из суррогатной пары: кодовых точек меньше, чем единиц строки
  const withEmoji = "😀 [myemote]";
  assert.equal(
    buildText({ emotes: [{ index: 2, emote: { image: { urlList: [url] } } }] }, withEmoji),
    `😀 [[e|${url}|myemote]]`,
  );
});

test("без кода в тексте смайл вставляется по позиции, а не теряется", () => {
  const url = "https://example.test/emote.webp";
  assert.equal(
    buildText({ emotes: [{ index: 3, emote: { image: { urlList: [url] } } }] }, "hi there"),
    `hi [[e|${url}|emote]]there`,
  );
  // позиция за концом строки — смайл в конце
  assert.equal(
    buildText({ emotes: [{ index: 99, emote: { image: { urlList: [url] } } }] }, "hi"),
    `hi[[e|${url}|emote]]`,
  );
});

test("смайл без позиции заменяет код в скобках, если схема не прислала index", () => {
  const url = "https://example.test/emote.webp";
  assert.equal(
    buildText({ emoteList: [{ emoteId: "1", image: { urlList: [url] } }] }, "hi [myemote] there"),
    `hi [[e|${url}|myemote]] there`,
  );
});

test("несколько смайлов подряд не сдвигают позиции друг друга", () => {
  const a = "https://example.test/a.webp";
  const b = "https://example.test/b.webp";
  const comment = "[one] text [two]";
  assert.equal(
    buildText(
      {
        emotes: [
          { index: 11, emote: { image: { urlList: [b] } } },
          { index: 0, emote: { image: { urlList: [a] } } },
        ],
      },
      comment,
    ),
    `[[e|${a}|one]] text [[e|${b}|two]]`,
  );
});

test("встроенный смайл площадки без картинки остаётся кодом в тексте", () => {
  assert.equal(buildText({ emotes: [] }, "ну [smile] ладно"), "ну [smile] ладно");
  // смайл без адреса картинки не портит текст
  assert.equal(buildText({ emotes: [{ index: 3, emote: {} }] }, "ну [smile] ладно"), "ну [smile] ладно");
});

test("смайл отдельным сообщением доходит до ленты один раз", () => {
  const { client, events } = harness();
  const url = "https://example.test/sticker.webp";
  const data = {
    user: { nickname: "Зритель" },
    emoteList: [{ emoteId: "7", image: { urlList: [url] } }],
  };
  client.emit("decodedData", "WebcastEmoteChatMessage", { type: "WebcastEmoteChatMessage", data });
  client.emit("emote", data);

  assert.deepEqual(events, [
    { type: "chat", author: "Зритель", text: `[[e|${url}|emote]]`, avatar: undefined },
  ]);
});

test("смайл подписчика без скобочного кода не затирает соседний системный смайл", () => {
  const url = "https://example.test/sub.webp";
  assert.equal(
    buildText({ emotes: [{ index: 11, emote: { image: { urlList: [url] } } }] }, "[smile] hi there"),
    `[smile] hi [[e|${url}|emote]]there`,
  );
  assert.equal(
    buildText({ emotes: [{ index: 0, emote: { image: { urlList: [url] } } }] }, "\uFFFC [wow]"),
    `[[e|${url}|emote]] [wow]`,
  );
});

test("сообщение чата без текста, но со смайлом подписчика не пропадает", () => {
  const { client, events } = harness();
  const url = "https://example.test/sticker.webp";
  client.emit("chat", {
    user: { nickname: "Зритель" },
    content: "",
    emotes: [{ index: 0, emote: { image: { urlList: [url] } } }],
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].text, `[[e|${url}|emote]]`);
});
