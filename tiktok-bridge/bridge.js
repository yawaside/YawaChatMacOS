/**
 * Коннектор TikTok LIVE для YawaChat.
 *
 * Порт рабочей реализации из YawaChat_Hub (desktop/electron/connectors.js,
 * метод `_tiktok`). Там этот путь проверен на живых эфирах, поэтому логика
 * повторена один в один:
 *
 *   1. Комната ищется ЗАРАНЕЕ через api-live/user/room. Авторитетным считается
 *      data.user.roomId; liveRoom.roomId может остаться от прошлого эфира,
 *      поэтому берётся только если API не сказал status=4 (offline).
 *   2. Если roomId найден — fetchRoomInfoOnConnect выключается, подключаемся
 *      сразу (экономит один запрос и обходит частые 404 на room info).
 *   3. Мягкий TLS-агент и для got (webClientOptions), и для ws
 *      (wsClientOptions). На машинах с антивирусом/TLS-инспекцией без него
 *      комната находится (онлайн виден), но push-сокет молчит и чата нет.
 *   4. Чат принимается ДВУМЯ путями: `decodedData` и `chat`. В v2 библиотека
 *      всегда сначала отдаёт decodedData(method, decoded) и лишь затем
 *      сопоставляет method со стандартным событием. На части сборок
 *      сопоставление WebcastChatMessage не срабатывает, хотя protobuf уже
 *      декодирован. WeakSet исключает дубль.
 *   5. Composite-ошибка «Failed to retrieve Room ID» = «не в эфире», а не
 *      технический сбой: переподключаемся раз в 60 с, а не раз в 20 с.
 *
 * Протокол с хостом (stdin/stdout, одна JSON-строка на событие):
 *   → {"type":"connect","user":"nick"}
 *   → {"type":"disconnect"}
 *   ← {"type":"ready","user":..,"roomId":..}
 *   ← {"type":"status","status":"online|connected|offline|error","viewers":N}
 *   ← {"type":"chat","author":..,"text":..}
 *   ← {"type":"event","kind":"gift|sub|share|join|like","author":..,"text":..,"amount":N}
 *   ← {"type":"log","message":".."}
 */
const https = require("https");
// URL не импортируем: с Node 10 это глобальный объект, а мост запускается
// встроенным в приложение Node.js (версия сборки проекта).

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

let conn = null;
let currentTarget = null;
let retryTimer = null;
let cachedConnClass = null;
let connLoadError = "";

function send(obj) {
  try {
    process.stdout.write(JSON.stringify(obj) + "\n");
  } catch {
    /* пайп закрыт */
  }
}

function log(message) {
  send({ type: "log", message: String(message).slice(0, 400) });
}

// Ошибки пакета и сети могут включать пароль прокси/токен. В журнал хоста
// отправляем только безопасный код, а не произвольный текст исключения.
function safeErrorCode(error) {
  const code = error?.code;
  return typeof code === "string" && /^[A-Z0-9_]{2,30}$/.test(code) ? code : "unknown";
}

function clearRetry() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

/** Снятие таймера дочитывания онлайна текущего подключения (см. viewerPoll). */
let stopViewerPoll = () => {};

function disconnect() {
  clearRetry();
  stopViewerPoll();
  if (!conn) return;
  const c = conn;
  conn = null;
  try {
    const r = typeof c.disconnect === "function" ? c.disconnect() : null;
    if (r && typeof r.catch === "function") r.catch(() => undefined);
  } catch {
    /* noop */
  }
}

/**
 * Мягкий TLS-агент (аналог tlsOptionsFor из desktop/electron/net.js).
 * Антивирусы и корпоративные прокси подменяют сертификат webcast.tiktok.com;
 * со строгой проверкой ws-рукопожатие молча не проходит.
 */
function tlsOptions() {
  return {
    rejectUnauthorized: false,
    agent: new https.Agent({ rejectUnauthorized: false, keepAlive: true }),
    headers: { "User-Agent": UA },
  };
}

/** Автопоиск прокси из окружения — пользователь ничего не вводит. */
function detectProxy() {
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    null
  );
}

/**
 * Загрузка класса подключения. Имя класса менялось между версиями
 * (WebcastPushConnection → TikTokLiveConnection), поддерживаем оба —
 * ровно как resolveClass в референсной реализации.
 */
async function getConnectorClass() {
  if (cachedConnClass) return cachedConnClass;
  const resolveClass = (mod) =>
    mod?.TikTokLiveConnection ||
    mod?.default?.TikTokLiveConnection ||
    mod?.WebcastPushConnection ||
    mod?.default?.WebcastPushConnection ||
    null;

  const errors = [];
  try {
    const C = resolveClass(require("tiktok-live-connector"));
    if (C) {
      cachedConnClass = C;
      return C;
    }
  } catch (e) {
    errors.push("require: " + safeErrorCode(e));
  }

  try {
    const C = resolveClass(await import("tiktok-live-connector"));
    if (C) {
      cachedConnClass = C;
      return C;
    }
  } catch (e) {
    errors.push("import: " + safeErrorCode(e));
  }

  connLoadError = errors.join(" | ");
  log("библиотека не загрузилась: " + connLoadError);
  return null;
}

/** Нормализация: @name, name, name/live, https://www.tiktok.com/@name/live. */
function normalizeUser(raw) {
  let username = String(raw || "").trim();
  const fromUrl = username.match(/tiktok\.com\/@([^/?#]+)/i);
  username = (fromUrl ? fromUrl[1] : username)
    .replace(/^@/, "")
    .split(/[/?&#]/)[0]
    .trim();
  return username;
}

/** GET JSON через мягкий TLS — тот же путь, что у остальных площадок. */
function getJson(url, headers = {}) {
  return new Promise((resolve) => {
    let req;
    const done = (v) => {
      try {
        req?.destroy();
      } catch {
        /* noop */
      }
      resolve(v);
    };
    try {
      const u = new URL(url);
      req = https.request(
        {
          hostname: u.hostname,
          path: u.pathname + u.search,
          method: "GET",
          rejectUnauthorized: false,
          timeout: 15000,
          headers: { "User-Agent": UA, accept: "application/json", ...headers },
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (c) => {
            body += c;
            if (body.length > 4e6) done(null);
          });
          res.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve(null);
            }
          });
        },
      );
      req.on("error", () => done(null));
      req.on("timeout", () => done(null));
      req.end();
    } catch {
      resolve(null);
    }
  });
}

/**
 * Поиск активной комнаты и стартового онлайна.
 * Повторяет referenced-логику: data.user.roomId авторитетнее liveRoom.roomId,
 * status=4 означает, что эфира нет.
 */
async function discoverRoom(username) {
  const room = await getJson(
    `https://www.tiktok.com/api-live/user/room?aid=1988&sourceType=54&uniqueId=${encodeURIComponent(username)}`,
    { referer: `https://www.tiktok.com/@${username}` },
  );

  const liveRoom = room?.data?.liveRoom;
  const userObj = room?.data?.user;
  const status = userObj?.status ?? liveRoom?.status;
  const rid = userObj?.roomId || liveRoom?.roomId || room?.data?.roomId;
  const stats = liveRoom?.liveRoomStats ?? liveRoom?.live_room_stats ?? {};
  const viewers = roomInfoViewers(liveRoom);
  const likes = countOf(
    stats.totalLikeCount,
    stats.total_like_count,
    stats.likeCount,
    stats.like_count,
    stats.likes,
    stats.total,
    liveRoom?.totalLikeCount,
    liveRoom?.total_like_count,
    liveRoom?.likeCount,
    liveRoom?.like_count,
  );

  return {
    roomId: status !== 4 && rid && String(rid) !== "0" ? String(rid) : null,
    viewers,
    likes,
  };
}

/** Адрес картинки смайла: поле менялось от поколения к поколению схемы. */
function emoteUrlOf(e) {
  const image = e?.emote?.image ?? e?.image ?? e?.emoteImage ?? null;
  const candidates = [
    image?.imageUrl,
    image?.url,
    e?.emoteImageUrl,
    e?.emote?.imageUrl,
    ...(Array.isArray(image?.urlList) ? image.urlList : []),
    ...(Array.isArray(image?.url_list) ? image.url_list : []),
  ];
  for (const url of candidates) {
    if (typeof url === "string" && /^https?:\/\//i.test(url)) return url;
  }
  return null;
}

/** Имя смайла для подписи под картинкой; схема v3 имени не присылает. */
function emoteNameOf(e, fallback = "emote") {
  const name = e?.name ?? e?.emoteName ?? e?.emoji ?? e?.emote?.name ?? e?.emote?.emoteName;
  return typeof name === "string" && name.trim() ? name.trim() : fallback;
}

/** Токен картиночного смайла в формате рендерера: [[e|URL|имя]]. */
function emoteToken(url, name) {
  return `[[e|${url}|${String(name).replace(/[|[\]]/g, "") || "emote"}]]`;
}

/**
 * Позиция смайла, присланная сервером, переведённая в индекс строки.
 * Единица измерения у площадки не задокументирована: встречаются позиция
 * в символах, в кодовых точках и в байтах. Пробуем по порядку и берём ту,
 * где в тексте действительно стоит код смайла в скобках; иначе — первую,
 * которая попадает внутрь строки.
 */
function emoteIndexCandidates(comment, index) {
  const out = [];
  const push = (value) => {
    if (Number.isInteger(value) && value >= 0 && value <= comment.length && !out.includes(value))
      out.push(value);
  };
  push(index);
  // позиция в кодовых точках → в единицах UTF-16
  let units = 0;
  let points = 0;
  for (const ch of comment) {
    if (points === index) break;
    units += ch.length;
    points += 1;
  }
  if (points === index) push(units);
  // позиция в байтах UTF-8 → в единицах UTF-16
  units = 0;
  let bytes = 0;
  for (const ch of comment) {
    if (bytes >= index) break;
    bytes += Buffer.byteLength(ch, "utf8");
    units += ch.length;
  }
  if (bytes === index) push(units);
  return out;
}

/**
 * Коды встроенных смайлов TikTok LIVE (например, [smile], [wow], [rockycool]).
 * У них нет своего URL в d.emotes — их рисует сам рендерер из словаря.
 * При резервном поиске кода в скобках для эмоута подписчика эти коды
 * не должны «съедаться» чужой картинкой.
 */
const BUILTIN_TIKTOK_BRACKET_CODES = new Set([
  "smile",
  "happy",
  "angry",
  "cry",
  "embarrassed",
  "surprised",
  "wronged",
  "shout",
  "flushed",
  "yummy",
  "yum",
  "complacent",
  "drool",
  "scream",
  "shocked",
  "weep",
  "speechless",
  "funnyface",
  "silly",
  "tongue",
  "laughwithtears",
  "wicked",
  "facewithrollingeyes",
  "eyeroll",
  "boring",
  "sulk",
  "sulky",
  "thinking",
  "lovely",
  "lovely2",
  "kiss",
  "greedy",
  "greedy2",
  "wow",
  "joyful",
  "grin",
  "hehe",
  "chuckle",
  "giggle",
  "slap",
  "facepalm",
  "dizzy",
  "tears",
  "sob",
  "stun",
  "cute",
  "blink",
  "wink",
  "blinkeyes",
  "disdain",
  "astonish",
  "rage",
  "curse",
  "swear",
  "frown",
  "sad",
  "disappointed",
  "sigh",
  "pain",
  "cool",
  "excited",
  "proud",
  "smirk",
  "smileface",
  "evil",
  "angel",
  "halo",
  "laugh",
  "laughcry",
  "rofl",
  "lol",
  "pride",
  "nap",
  "sleepy",
  "drowsy",
  "yawn",
  "silent",
  "shutup",
  "shh",
  "loveface",
  "awkward",
  "sweat",
  "shock",
  "allgood",
  "relieved",
  "mask",
  "sick",
  "vomit",
  "puke",
  "freeze",
  "hot",
  "explode",
  "mindblown",
  "clown",
  "skull",
  "ghost",
  "poop",
  "heart",
  "brokenheart",
  "thumbsup",
  "thumb",
  "thumbsdown",
  "clap",
  "pray",
  "thanks",
  "hi",
  "wave",
  "ok",
  "muscle",
  "fire",
  "party",
  "congrat",
  "rose",
  "gift",
  "crown",
  "star",
  "sparkles",
  "money",
  "eyes",
  "100",
  "rockyserious",
  "rockyloveit",
  "rockyproud",
  "rockycool",
  "rosiedislike",
  "rosiekisskiss",
  "rosieawkward",
  "rosiecute",
  "jolliekissingface",
  "jolliewow",
  "jolliesatisfied",
  "jolliespeechless",
  "sagethink",
  "sagefulfilled",
  "sageclever",
  "sagemoney",
]);

/** Код смайла в скобках («[name]») или маркер замены U+FFFC на позиции at. */
function bracketTokenAt(comment, at) {
  if (comment[at] === "\uFFFC") return { name: "emote", length: 1 };
  if (comment[at] !== "[" || comment[at + 1] === "[") return null;
  const end = comment.indexOf("]", at + 1);
  if (end < 0 || end - at > 40) return null;
  const name = comment.slice(at + 1, end);
  return /^[\w-]+$/.test(name) ? { name, length: end - at + 1 } : null;
}

/**
 * Собирает текст с инлайн-смайлами в формате рендерера: [[e|URL|имя]].
 * Смайлы подписчиков приходят отдельным списком с позицией в тексте:
 * в старой схеме — placeInComment, в новой (v3) — index. Если на этой
 * позиции в тексте стоит код смайла в скобках или символ U+FFFC, он заменяется
 * картинкой, иначе картинка вставляется в текст на этом месте. Встроенные смайлы
 * площадки вида [smile], у которых нет картинки, в тексте остаются как есть —
 * их распознаёт лента.
 */
function buildText(d, comment) {
  const emotes = Array.isArray(d.emotes)
    ? [...d.emotes]
    : Array.isArray(d.emoteList)
      ? [...d.emoteList]
      : d.emote
        ? [d.emote]
        : [];
  if (!emotes.length || typeof comment !== "string") {
    return typeof comment === "string" ? comment.replace(/\uFFFC/g, "") : comment;
  }

  const positionOf = (e) => {
    const value = e?.placeInComment ?? e?.place_in_comment ?? e?.emoteIndex ?? e?.index ?? e?.position;
    const n = typeof value === "string" ? Number(value) : value;
    return Number.isInteger(n) && n >= 0 ? n : null;
  };

  // Основной путь: смайл вставляется (или заменяет свой код) по позиции.
  const positional = emotes
    .map((e) => ({ emote: e, at: positionOf(e), url: emoteUrlOf(e) }))
    .filter((e) => e.at !== null && e.url);
  if (positional.length) {
    positional.sort((x, y) => x.at - y.at);
    // Сначала находим, что именно стоит на позиции каждого смайла, и только
    // потом собираем строку: замены не должны сдвигать позиции соседей.
    const claimed = new Set();
    const places = [];
    for (const item of positional) {
      const candidates = emoteIndexCandidates(comment, item.at);
      const explicitName = emoteNameOf(item.emote, "");
      let chosen = null;
      for (const at of candidates) {
        const token = bracketTokenAt(comment, at);
        if (token && !claimed.has(at)) {
          chosen = {
            at,
            length: token.length,
            name: token.name === "emote" && explicitName ? explicitName : token.name,
          };
          break;
        }
      }
      if (!chosen) {
        // Если в комментарии есть незанятый символ замены U+FFFC — берём его.
        for (let at = comment.indexOf("\uFFFC"); at >= 0; at = comment.indexOf("\uFFFC", at + 1)) {
          if (!claimed.has(at)) {
            chosen = { at, length: 1, name: explicitName || "emote" };
            break;
          }
        }
      }
      if (!chosen) {
        // Позиция не совпала ни в одной единице измерения: берём первый ещё
        // не занятый код в скобках, кроме встроенных смайлов площадки ([smile], [wow] и т.д.),
        // чтобы смайл подписчика без скобочного кода не затирал соседний системный смайл.
        for (let at = comment.indexOf("["); at >= 0; at = comment.indexOf("[", at + 1)) {
          const token = bracketTokenAt(comment, at);
          if (!token || claimed.has(at)) continue;
          const lower = token.name.toLowerCase();
          if (BUILTIN_TIKTOK_BRACKET_CODES.has(lower) && explicitName.toLowerCase() !== lower) continue;
          chosen = { at, length: token.length, name: token.name };
          break;
        }
      }
      if (!chosen) {
        const at = candidates.length ? candidates[0] : Math.min(item.at, comment.length);
        chosen = { at, length: 0, name: emoteNameOf(item.emote) };
      }
      if (chosen.length > 0) claimed.add(chosen.at);
      places.push({ ...chosen, url: item.url });
    }
    places.sort((x, y) => x.at - y.at || y.length - x.length);

    let out = "";
    let lastIdx = 0;
    for (const place of places) {
      if (place.at < lastIdx) {
        // Две позиции указывают на один и тот же код — вторую просто вставляем.
        out += emoteToken(place.url, place.name);
        continue;
      }
      out += comment.slice(lastIdx, place.at);
      out += emoteToken(place.url, place.name);
      lastIdx = place.at + place.length;
    }
    out += comment.slice(lastIdx);
    return out.replace(/\uFFFC/g, "");
  }

  // Запасной путь для схем без позиции: сначала ищем код смайла, а если его
  // нет — заменяем очередной код в скобках (список смайлов приходит в том же порядке).
  let text = comment;
  let searchFrom = 0;
  for (const em of emotes) {
    const url = emoteUrlOf(em);
    if (!url) continue;

    const emoji = typeof em?.emoji === "string" ? em.emoji : "";
    if (emoji && text.includes(emoji)) {
      text = text.split(emoji).join(emoteToken(url, emoji));
      continue;
    }

    const name = emoteNameOf(em, "");
    const bracketName = name ? `[${name}]` : "";
    if (bracketName && text.includes(bracketName)) {
      text = text.split(bracketName).join(emoteToken(url, name));
      continue;
    }

    const fffcAt = text.indexOf("\uFFFC", searchFrom);
    if (fffcAt >= 0) {
      const tok = emoteToken(url, name || "emote");
      text = text.slice(0, fffcAt) + tok + text.slice(fffcAt + 1);
      searchFrom = fffcAt + tok.length;
      continue;
    }

    let foundAt = -1;
    let foundToken = null;
    for (let at = text.indexOf("[", searchFrom); at >= 0; at = text.indexOf("[", at + 1)) {
      const token = bracketTokenAt(text, at);
      if (!token) continue;
      if (BUILTIN_TIKTOK_BRACKET_CODES.has(token.name.toLowerCase())) continue;
      foundAt = at;
      foundToken = token;
      break;
    }
    if (!foundToken) continue;
    const tok = emoteToken(url, foundToken.name);
    text = text.slice(0, foundAt) + tok + text.slice(foundAt + foundToken.length);
    searchFrom = foundAt + tok.length;
  }
  return text.replace(/\uFFFC/g, "");
}

/** Сообщение, состоящее только из смайлов подписчиков (отдельный тип). */
function emoteOnlyText(d) {
  const list = Array.isArray(d?.emoteList)
    ? d.emoteList
    : Array.isArray(d?.emotes)
      ? d.emotes
      : d?.emote
        ? [d.emote]
        : [];
  const tokens = [];
  for (const item of list) {
    const url = emoteUrlOf(item);
    if (url) tokens.push(emoteToken(url, emoteNameOf(item)));
  }
  return tokens.join(" ");
}

/** Аватар автора: библиотека отдаёт его в нескольких возможных полях. */
function avatarOf(d) {
  const user = d?.user || d?.userInfo || d?.message?.user || {};
  const pic = user.profilePicture || user.profile_picture || user.avatarThumb || d?.profilePictureUrl;
  if (typeof pic === "string") return pic;
  const list = pic?.urls || pic?.url_list || pic?.urlList;
  return Array.isArray(list) && typeof list[0] === "string" ? list[0] : undefined;
}

function authorOf(d) {
  const user = d?.user || d?.userInfo || d?.message?.user || {};
  return (
    user.nickname ||
    user.uniqueId ||
    user.unique_id ||
    user.displayId ||
    user.display_id ||
    d?.nickname ||
    d?.uniqueId ||
    d?.unique_id ||
    d?.displayId ||
    d?.display_id ||
    "зритель"
  );
}

/** В decodedData новых версий данные завёрнуты в { type, data }. */
function unwrapEvent(payload) {
  return payload?.data && typeof payload.data === "object" ? payload.data : payload;
}

/** Число из разных поколений схемы; некорректное значение превращаем в 0. */
function numberOf(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** Счётчик из protobuf может быть числом или десятичной строкой. */
function countOf(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "" || typeof value === "boolean") continue;
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return null;
}

/**
 * WebcastRoomUserSeqMessage: поле 3 — текущие зрители (viewerCount в v1/v2,
 * total в v3). totalUser — ДРУГОЕ поле 7, не текущий онлайн.
 * Не подставляем его даже при отсутствии счётчика: сохраняем последний онлайн.
 */
function roomUserCount(payload) {
  const d = unwrapEvent(payload) || {};
  return countOf(d.viewerCount, d.viewer_count, d.total, d.userCount, d.user_count);
}

/** В HTTP-информации комнаты текущий онлайн — userCount, не totalUser. */
function roomInfoViewers(roomInfo) {
  const stats = roomInfo?.liveRoomStats ?? roomInfo?.live_room_stats ?? {};
  return countOf(
    stats.userCount,
    stats.user_count,
    stats.viewerCount,
    stats.viewer_count,
    roomInfo?.userCount,
    roomInfo?.user_count,
    roomInfo?.viewerCount,
    roomInfo?.viewer_count,
  );
}

/** Накопительные лайки в v3 лежат в `total`, в старой схеме — totalLikeCount. */
function likeTotalOf(payload) {
  const d = unwrapEvent(payload) || {};
  return countOf(d.totalLikeCount, d.total_like_count, d.total);
}

/** Поля подарка менялись в v2/v3: поддерживаем обе формы. */
function giftInfoOf(payload) {
  const d = unwrapEvent(payload) || {};
  const gift = d.giftDetails || d.gift || d.extendedGiftInfo || {};
  const repeat = Math.max(1, numberOf(d.repeatCount, d.repeat_count, d.comboCount, 1));
  const unitDiamonds = Math.max(
    0,
    numberOf(
      gift.diamondCount,
      gift.diamond_count,
      gift.diamondCost,
      gift.diamond_cost,
      d.diamondCount,
      d.diamond_count,
    ),
  );
  const giftType = numberOf(gift.giftType, gift.gift_type, gift.type, d.giftType, d.gift_type);
  const isStreak = giftType === 1 || gift.combo === true || d.isStreak === true;
  const repeatEnded =
    d.repeatEnd === true || d.repeat_end === true || numberOf(d.repeatEnd, d.repeat_end) > 0;

  return {
    data: d,
    name: gift.giftName || gift.gift_name || gift.name || d.giftName || d.gift_name || "подарок",
    repeat,
    totalDiamonds: unitDiamonds > 0 ? unitDiamonds * repeat : 0,
    // Серийный подарок приходит на каждом шаге и ещё раз в конце. В ленту
    // отправляем только итог, иначе один подарок превращается в несколько.
    shouldEmit: !isStreak || repeatEnded,
  };
}

/** follow/share больше не обязаны иметь displayType — в v3 действие лежит
 * в common.displayText.key и action, а прямые события дают подсказку hint. */
function socialKindOf(payload, hint = "") {
  const d = unwrapEvent(payload) || {};
  const token = [
    hint,
    d.action,
    d.displayType,
    d.display_type,
    d.common?.displayText?.key,
    d.common?.display_text?.key,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/follow|фолл|подпис/.test(token)) return "follow";
  if (/share|репост|подел/.test(token)) return "share";
  return null;
}

/**
 * Подключает пользовательские события TikTok. Обычные события библиотеки
 * дублируются страховочным decodedData: TikTok и схема коннектора меняются
 * независимо, и после перехода на v3 follow/sub перестали доходить через
 * старые имена. WeakSet убирает дубль, когда сработали оба пути.
 */
function attachTikTokContentEvents(client, emit = send) {
  const seen = {
    chat: new WeakSet(),
    emote: new WeakSet(),
    gift: new WeakSet(),
    member: new WeakSet(),
    follow: new WeakSet(),
    share: new WeakSet(),
    sub: new WeakSet(),
    like: new WeakSet(),
  };

  const first = (kind, payload) => {
    const d = unwrapEvent(payload);
    if (!d || typeof d !== "object") return null;
    if (seen[kind].has(d)) return null;
    seen[kind].add(d);
    return d;
  };

  const emitChat = (payload) => {
    const d = first("chat", payload);
    if (!d) return;
    const comment = d.comment ?? d.text ?? d.content ?? d.message?.comment ?? d.chatMessage?.comment ?? "";
    // Сообщение без текста, но со смайлами подписчика — это стикер, не пустота.
    const text = String(comment).trim() ? String(buildText(d, String(comment))) : emoteOnlyText(d);
    if (!text.trim()) return;
    emit({
      type: "chat",
      author: authorOf(d),
      text: text.slice(0, 1000),
      avatar: avatarOf(d),
    });
  };

  // Смайл подписчика, отправленный отдельным сообщением (без текста), приходит
  // другим типом события. Раньше он терялся: в ленте не появлялось ничего.
  const emitEmote = (payload) => {
    const d = first("emote", payload);
    if (!d) return;
    const text = emoteOnlyText(d);
    if (!text) return;
    emit({
      type: "chat",
      author: authorOf(d),
      text: text.slice(0, 1000),
      avatar: avatarOf(d),
    });
  };

  const emitGift = (payload) => {
    const info = giftInfoOf(payload);
    if (!info.shouldEmit) return;
    const d = first("gift", info.data);
    if (!d) return;
    emit({
      type: "event",
      kind: "gift",
      author: authorOf(d),
      text:
        info.repeat > 1
          ? `отправил подарок «${info.name}» ×${info.repeat}`
          : `отправил подарок «${info.name}»`,
      amount: info.totalDiamonds > 0 ? info.totalDiamonds : undefined,
      currency: info.totalDiamonds > 0 ? "алм." : undefined,
      avatar: avatarOf(d),
    });
  };

  const emitJoin = (payload) => {
    const d = first("member", payload);
    if (!d) return;
    // WebcastMemberMessage also carries subscription actions; show only actual joins.
    const action = countOf(d.action);
    if (action !== null && action !== 0 && action !== 1) return;
    emit({
      type: "event",
      kind: "join",
      author: authorOf(d),
      text: "присоединился к трансляции",
      avatar: avatarOf(d),
    });
  };

  const emitSocial = (payload, hint = "") => {
    const kind = socialKindOf(payload, hint);
    if (!kind) return;
    const d = first(kind, payload);
    if (!d) return;
    emit({
      type: "event",
      // Фолловер остаётся sub для совместимости интерфейса; там он отделяется
      // от платной подписки по понятному пользовательскому тексту.
      kind: kind === "follow" ? "sub" : "share",
      author: authorOf(d),
      text: kind === "follow" ? "подписался на канал" : "поделился трансляцией",
      avatar: avatarOf(d),
    });
  };

  const emitSubscription = (payload) => {
    const d = first("sub", payload);
    if (!d) return;
    const months = numberOf(d.subMonth, d.sub_month);
    emit({
      type: "event",
      kind: "sub",
      author: authorOf(d),
      text: months > 1 ? `оформил подписку (${months} мес.)` : "оформил подписку",
      avatar: avatarOf(d),
    });
  };

  let lastLikeTotal = 0;
  let lastLikeMetric = 0;
  let lastLikeSentAt = 0;
  const emitLike = (payload) => {
    const d = first("like", payload);
    if (!d) return;
    const total = likeTotalOf(d);
    if (total === null || total <= 0) return;

    // Обновляем отдельный счётчик каждый раз, когда меняется итог за эфир.
    if (total > lastLikeMetric) {
      lastLikeMetric = total;
      emit({ type: "metrics", likes: total });
    }

    // Старое уведомление в ленте оставляем редким, чтобы не спамить чатом.
    if (total <= lastLikeTotal) return;
    const now = Date.now();
    if (lastLikeSentAt && now - lastLikeSentAt < 120000) {
      lastLikeTotal = total;
      return;
    }
    lastLikeTotal = total;
    lastLikeSentAt = now;
    emit({ type: "event", kind: "like", author: authorOf(d), text: `лайков на стриме: ${total}` });
  };

  // Страховочный низкоуровневый путь. В 2.4.x второй аргумент —
  // { type: "Webcast…", data }, в старых версиях — сразу декодированный объект.
  client.on("decodedData", (method, decoded) => {
    const type = String(decoded?.type || method || "");
    if (type === "WebcastChatMessage") emitChat(decoded);
    else if (type === "WebcastEmoteChatMessage") emitEmote(decoded);
    else if (type === "WebcastGiftMessage") emitGift(decoded);
    else if (type === "WebcastMemberMessage") emitJoin(decoded);
    else if (type === "WebcastSocialMessage") emitSocial(decoded);
    else if (type === "WebcastSubNotifyMessage" || type === "WebcastSubscribeMessage")
      emitSubscription(decoded);
    else if (type === "WebcastLikeMessage") emitLike(decoded);
  });

  client.on("chat", emitChat);
  client.on("emote", emitEmote);
  client.on("gift", emitGift);
  client.on("member", emitJoin);
  client.on("follow", (d) => emitSocial(d, "follow"));
  client.on("share", (d) => emitSocial(d, "share"));
  client.on("social", emitSocial);
  client.on("subNotify", emitSubscription);
  // Старые выпуски коннектора называли это событие subscribe.
  client.on("subscribe", emitSubscription);
  client.on("like", emitLike);
}

function scheduleRetry(user, delay, note) {
  clearRetry();
  if (note) log(note);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (currentTarget === user) connect(user);
  }, delay);
}

// В хост отправляется только код: исключения библиотеки могут содержать
// токен, URL прокси с паролем или данные ответа площадки.
function connectionErrorCode(error) {
  const status = error?.statusCode ?? error?.response?.statusCode;
  if (status === 401 || status === 403) return "access-denied";
  if (["ETIMEDOUT", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN"].includes(error?.code))
    return "network";
  return "connect-failed";
}

async function connect(rawUser) {
  disconnect();
  const username = normalizeUser(rawUser);
  currentTarget = username;

  if (!username) {
    log("TikTok: не указан username канала");
    send({ type: "status", status: "error", viewers: 0, code: "missing-user" });
    return;
  }

  const Conn = await getConnectorClass();
  if (!Conn) {
    send({ type: "status", status: "error", viewers: 0, code: "module-unavailable" });
    scheduleRetry(
      username,
      60000,
      "TikTok: библиотека не загрузилась" + (connLoadError ? " — " + connLoadError.slice(0, 90) : ""),
    );
    return;
  }

  // 1) ищем комнату заранее — это и проверка «в эфире ли канал»
  let discoveredRoomId = null;
  let initialViewers = null;
  let initialLikes = null;
  try {
    const found = await discoverRoom(username);
    discoveredRoomId = found.roomId;
    initialViewers = found.viewers;
    initialLikes = found.likes;
  } catch {
    /* noop */
  }

  if (currentTarget !== username) return;

  const proxy = detectProxy();
  const wsClientOptions = { ...tlsOptions(), handshakeTimeout: 20000 };
  const webClientOptions = {
    // got: при TLS-перехвате не роняем запрос подписанного сокета
    https: { rejectUnauthorized: false },
    timeout: { request: 20000 },
    retry: { limit: 2 },
  };

  if (proxy) {
    log("используется прокси из окружения");
    try {
      const { HttpsProxyAgent } = require("https-proxy-agent");
      const agent = new HttpsProxyAgent(proxy, { rejectUnauthorized: false });
      webClientOptions.agent = { http: agent, https: agent };
      wsClientOptions.agent = agent;
    } catch (e) {
      log("прокси-агент не создан: " + safeErrorCode(e));
    }
  }

  let client;
  try {
    client = new Conn(username, {
      // Критично: при переподключении/переоткрытии TikTok присылает ИСТОРИЮ
      // последних сообщений/подарков чата (initialData). Если её обработать —
      // они озвучатся повторно, как новые. Отключаем разбор истории:
      // озвучиваются ТОЛЬКО события, пришедшие ПОСЛЕ подключения.
      processInitialData: false,
      // если roomId уже найден, не тратим время на повторный запрос инфо
      fetchRoomInfoOnConnect: !discoveredRoomId,
      enableExtendedGiftInfo: false,
      webClientOptions,
      wsClientOptions,
    });
  } catch {
    send({ type: "status", status: "error", viewers: 0, code: "create-failed" });
    scheduleRetry(username, 60000, `TikTok: не удалось создать подключение к @${username}`);
    return;
  }
  conn = client;
  let streamEnded = false;
  // Защитное окно: после успешного websocket-рукопожатия первые секунды
  // TikTok может прислать накопившуюся историю чата/подарков даже при
  // processInitialData=false. События в этом окне игнорируем — они
  // не являются «новыми» и не должны озвучиваться.
  let connectedAt = 0;
  const GRACE_MS = 2500;
  const fresh = () => connectedAt > 0 && Date.now() - connectedAt > GRACE_MS;

  /* ---------- диагностика push-сокета ----------
     Если «онлайн виден, но чат молчит» — по этому логу сразу понятно,
     дошли ли мы до websocket-рукопожатия. */
  client.on("websocketConnected", () => {
    connectedAt = Date.now();
    log(`TikTok: чат-сокет подключён / @${username}`);
  });

  // без error-обработчика EventEmitter роняет процесс на любой сетевой ошибке
  client.on("error", (payload) => {
    log("TikTok сокет: " + connectionErrorCode(payload?.exception ?? payload));
  });

  // Онлайн приходит push-событием roomUser — это основной и самый быстрый путь.
  // В protobuf v3 viewerCount называется total и может быть строкой.
  let lastViewerPush = 0;
  let pushedViewers = null;
  let viewerPushRevision = 0;
  client.on("roomUser", (d) => {
    if (currentTarget !== username || streamEnded || conn !== client) return;
    const count = roomUserCount(d);
    if (count !== null) {
      lastViewerPush = Date.now();
      pushedViewers = count;
      viewerPushRevision++;
      send({ type: "status", status: "online", viewers: count });
    }
  });

  // Страховка: если TikTok редко присылает roomUser, дочитываем онлайн через
  // API. Лайки периодически сверяем независимо: like-события на больших
  // трансляциях площадка может присылать не на каждый прирост счётчика.
  let lastLikesPoll = 0;
  const viewerPoll = setInterval(async () => {
    if (currentTarget !== username || streamEnded || conn !== client) return;
    const now = Date.now();
    const pollViewers = now - lastViewerPush >= 20000;
    const pollLikes = now - lastLikesPoll >= 30000;
    if (!pollViewers && !pollLikes) return;
    if (pollLikes) lastLikesPoll = now;
    const pushRevision = viewerPushRevision;
    try {
      const info = await discoverRoom(username);
      if (currentTarget !== username || streamEnded || conn !== client) return;
      // Пока HTTP-запрос был в пути, сокет мог прислать более свежий онлайн.
      if (pollViewers && pushRevision === viewerPushRevision && info?.viewers !== null && info?.roomId)
        send({ type: "status", status: "online", viewers: info.viewers });
      if (info?.likes !== null && info?.likes !== undefined) send({ type: "metrics", likes: info.likes });
    } catch {
      /* сеть подведёт — повторим на следующем круге */
    }
  }, 15000);
  if (typeof viewerPoll.unref === "function") viewerPoll.unref();
  // старый таймер предыдущего подключения снимаем, свой — публикуем наружу,
  // чтобы disconnect() мог его остановить при смене канала
  stopViewerPoll();
  stopViewerPoll = () => clearInterval(viewerPoll);

  /* Чат и события подключаются одним нормализатором. Он слушает и обычные
     события библиотеки, и decodedData: после перехода TikTok на новую схему
     часть уведомлений доступна только в одном из этих путей.
     Оборачиваем отправку, чтобы отбросить «исторические» события, которые
     TikTok шлёт в первые секунды после подключения. */
  const safeEmit = (evt) => {
    // статус/ready/log идут всегда — это не контент чата
    if (evt.type === "chat" || evt.type === "event" || evt.type === "metrics") {
      if (!fresh()) return;
    }
    send(evt);
  };
  attachTikTokContentEvents(client, safeEmit);

  client.on("streamEnd", () => {
    if (currentTarget !== username) return;
    streamEnded = true;
    stopViewerPoll();
    send({ type: "status", status: "offline", viewers: 0 });
    scheduleRetry(username, 60000, `TikTok: трансляция @${username} завершена`);
  });

  client.on("disconnected", () => {
    if (currentTarget !== username || streamEnded) return;
    conn = null;
    stopViewerPoll();
    send({ type: "status", status: "connected", viewers: 0 });
    scheduleRetry(username, 20000, `TikTok: сокет @${username} отключён, переподключаемся`);
  });

  /* ---------- подключение ---------- */
  client
    .connect(discoveredRoomId || undefined)
    .then((state) => {
      if (currentTarget !== username || streamEnded || conn !== client) return;
      log(`TikTok: подключено / @${username}`);
      send({ type: "ready", user: username, roomId: String(state?.roomId || discoveredRoomId || "") });
      const stats = state?.roomInfo?.liveRoomStats ?? state?.roomInfo?.live_room_stats ?? {};
      // roomUser может прийти ещё до завершения connect: стартовые данные
      // не должны перезаписывать уже полученный текущий онлайн (включая 0).
      const viewers = pushedViewers ?? roomInfoViewers(state?.roomInfo) ?? initialViewers ?? 0;
      const likes =
        countOf(
          stats.totalLikeCount,
          stats.total_like_count,
          stats.likeCount,
          stats.like_count,
          stats.likes,
          stats.total,
          state?.roomInfo?.totalLikeCount,
          state?.roomInfo?.total_like_count,
          state?.roomInfo?.likeCount,
          state?.roomInfo?.like_count,
        ) ?? initialLikes;
      send({ type: "status", status: "online", viewers });
      if (likes !== null) send({ type: "metrics", likes });
    })
    .catch((e) => {
      if (currentTarget !== username) return;
      const offline = e?.name === "UserOfflineError" || e?.constructor?.name === "UserOfflineError";
      // composite = комнату не нашли ни одним источником → канал просто не в эфире,
      // а не технический сбой: не дёргаем переподключение каждые 20 секунд
      const composite = /Failed to retrieve Room ID|retrieve Room ID from all sources/i.test(
        String(e?.message || ""),
      );
      const isOffline = offline || composite;

      conn = null;
      stopViewerPoll();
      send({
        type: "status",
        status: isOffline ? "offline" : "error",
        viewers: 0,
        ...(!isOffline && { code: connectionErrorCode(e) }),
      });
      scheduleRetry(
        username,
        isOffline ? 60000 : 20000,
        isOffline
          ? `TikTok: @${username} сейчас не в эфире`
          : `TikTok: @${username} — ${connectionErrorCode(e)}`,
      );
    });
}

/* ---------- команды от хоста ---------- */

function startBridge() {
  let buffer = "";
  process.stdin.setEncoding("utf8");

  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;

      let cmd;
      try {
        cmd = JSON.parse(line);
      } catch {
        continue;
      }

      if (cmd.type === "connect") {
        log("подключение: " + normalizeUser(cmd.user));
        connect(String(cmd.user || "").trim());
      } else if (cmd.type === "disconnect") {
        currentTarget = null;
        disconnect();
        send({ type: "status", status: "connected", viewers: 0 });
      }
    }
  });

  process.stdin.on("end", () => {
    currentTarget = null;
    disconnect();
    process.exit(0);
  });
  process.on("uncaughtException", (err) => log("uncaught: " + safeErrorCode(err)));
  process.on("unhandledRejection", (err) => log("unhandled: " + safeErrorCode(err)));
  log("мост TikTok запущен");
}

if (require.main === module) startBridge();

module.exports = {
  normalizeUser,
  buildText,
  authorOf,
  discoverRoom,
  roomUserCount,
  roomInfoViewers,
  likeTotalOf,
  giftInfoOf,
  socialKindOf,
  connectionErrorCode,
  safeErrorCode,
  attachTikTokContentEvents,
};
