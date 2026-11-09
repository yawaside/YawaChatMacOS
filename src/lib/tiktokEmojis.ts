/**
 * Встроенные смайлы TikTok. В чате площадки они пишутся кодом в квадратных
 * скобках — [smile], [laughwithtears], [cool], [wow], [rockycool] — и именно
 * так, текстом, приходят от сервера трансляции: картинок у них нет, их рисует
 * само приложение TikTok. Поэтому коды превращаются в картинки на стороне ленты.
 * Собственных изображений площадка не отдаёт, поэтому используются
 * Twemoji с тем же смыслом — как и для остальных эмодзи ленты.
 * Смайлы подписчиков (эмоуты канала) сюда не входят: у них есть адрес
 * картинки, и они приходят отдельными токенами от коннектора.
 */

// Актуальный набор Twemoji (Unicode 15/16/17, включая 🩷🩵🩶🫨🫷🫸🫎🫏🪽🐦‍⬛🪿🪼🪻 и др.).
const TW = (cp: string) => `https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/72x72/${cp}.png`;

const TIKTOK_EMOTES: Record<string, string> = {
  // базовый набор панели комментариев TikTok
  smile: TW("1f60a"),
  happy: TW("1f604"),
  angry: TW("1f620"),
  cry: TW("1f62d"),
  embarrassed: TW("1f630"),
  surprised: TW("1f62e"),
  wronged: TW("1f97a"),
  shout: TW("1f92c"),
  flushed: TW("263a"),
  yummy: TW("1f60b"),
  yum: TW("1f60b"),
  complacent: TW("1f60c"),
  drool: TW("1f924"),
  scream: TW("1f631"),
  shocked: TW("1f631"),
  weep: TW("1f622"),
  speechless: TW("1f636"),
  funnyface: TW("1f61c"),
  silly: TW("1f61c"),
  tongue: TW("1f61b"),
  laughwithtears: TW("1f602"),
  wicked: TW("1f608"),
  facewithrollingeyes: TW("1f644"),
  eyeroll: TW("1f644"),
  boring: TW("1f644"),
  sulk: TW("1f612"),
  sulky: TW("1f612"),
  thinking: TW("1f914"),
  lovely: TW("1f618"),
  lovely2: TW("1f618"),
  kiss: TW("1f618"),
  greedy: TW("1f911"),
  greedy2: TW("1f924"),
  wow: TW("1f632"),
  joyful: TW("1f601"),
  grin: TW("1f601"),
  hehe: TW("1f92d"),
  chuckle: TW("1f92d"),
  giggle: TW("1f92d"),
  slap: TW("1f635"),
  facepalm: TW("1f926"),
  dizzy: TW("1f635"),
  tears: TW("1f62d"),
  sob: TW("1f62d"),
  stun: TW("1f628"),
  cute: TW("1f970"),
  blink: TW("1f609"),
  wink: TW("1f609"),
  blinkeyes: TW("1f97a"),
  disdain: TW("1f611"),
  astonish: TW("1f627"),
  rage: TW("1f621"),
  curse: TW("1f92c"),
  swear: TW("1f92c"),
  frown: TW("2639"),
  sad: TW("1f641"),
  disappointed: TW("1f61e"),
  sigh: TW("1f614"),
  pain: TW("1f623"),
  cool: TW("1f60e"),
  excited: TW("1f606"),
  proud: TW("1f60f"),
  smirk: TW("1f60f"),
  smileface: TW("1f642"),
  evil: TW("1f47f"),
  angel: TW("1f607"),
  halo: TW("1f607"),
  laugh: TW("1f923"),
  laughcry: TW("1f923"),
  rofl: TW("1f923"),
  lol: TW("1f602"),
  pride: TW("1f617"),
  nap: TW("1f634"),
  sleepy: TW("1f62a"),
  drowsy: TW("1f62a"),
  yawn: TW("1f971"),
  silent: TW("1f910"),
  shutup: TW("1f92b"),
  shh: TW("1f92b"),
  loveface: TW("1f60d"),
  awkward: TW("1f605"),
  sweat: TW("1f613"),
  shock: TW("1f633"),
  allgood: TW("1f60c"),
  relieved: TW("1f60c"),
  mask: TW("1f637"),
  sick: TW("1f912"),
  vomit: TW("1f92e"),
  puke: TW("1f92e"),
  freeze: TW("1f976"),
  hot: TW("1f975"),
  explode: TW("1f92f"),
  mindblown: TW("1f92f"),
  clown: TW("1f921"),
  skull: TW("1f480"),
  ghost: TW("1f47b"),
  poop: TW("1f4a9"),
  // жесты и символы панели смайлов TikTok LIVE
  heart: TW("2764"),
  brokenheart: TW("1f494"),
  thumbsup: TW("1f44d"),
  thumb: TW("1f44d"),
  thumbsdown: TW("1f44e"),
  clap: TW("1f44f"),
  pray: TW("1f64f"),
  thanks: TW("1f64f"),
  hi: TW("1f44b"),
  wave: TW("1f44b"),
  ok: TW("1f44c"),
  muscle: TW("1f4aa"),
  fire: TW("1f525"),
  party: TW("1f389"),
  congrat: TW("1f389"),
  rose: TW("1f339"),
  gift: TW("1f381"),
  crown: TW("1f451"),
  star: TW("2b50"),
  sparkles: TW("2728"),
  money: TW("1f4b0"),
  eyes: TW("1f440"),
  "100": TW("1f4af"),
  // серия Rocky (системные смайлы TikTok)
  rockyserious: TW("1f610"),
  rockyloveit: TW("1f60d"),
  rockyproud: TW("1f60e"),
  rockycool: TW("1f60e"),
  // серия Rosie
  rosiedislike: TW("1f612"),
  rosiekisskiss: TW("1f618"),
  rosieawkward: TW("1f605"),
  rosiecute: TW("1f97a"),
  // серия Jollie
  jolliekissingface: TW("1f617"),
  jolliewow: TW("1f62e"),
  jolliesatisfied: TW("1f60c"),
  jolliespeechless: TW("1f636"),
  // серия Sage
  sagethink: TW("1f914"),
  sagefulfilled: TW("1f60a"),
  sageclever: TW("1f9d0"),
  sagemoney: TW("1f911"),
};

/** Адрес картинки по коду из скобок ([smile] → smile); null — не смайл площадки. */
export function tiktokEmoteUrl(code: string): string | null {
  const key = String(code ?? "")
    .trim()
    .replace(/^\[+|\]+$/g, "")
    .toLowerCase();
  if (!key) return null;
  return TIKTOK_EMOTES[key] ?? null;
}

/**
 * Базовые коды, после которых в ZWJ-последовательностях (с `200d`) файлы
 * Twemoji сохраняют суффикс `-fe0f` (если сразу за базой не идёт тон кожи).
 * В одиночных эмодзи без `200d` Twemoji всегда опускает `fe0f`.
 */
const TWEMOJI_ZWJ_FE0F_BASES = new Set([
  "2640",
  "27a1",
  "2642",
  "1f3cb",
  "1f3cc",
  "1f3f3",
  "26a7",
  "2620",
  "2744",
  "2695",
  "2696",
  "2708",
  "2764",
  "1f574",
  "1f575",
  "1f32b",
  "2194",
  "2195",
  "26d3",
  "26f9",
]);

const SKIN_TONE_HEX = new Set(["1f3fb", "1f3fc", "1f3fd", "1f3fe", "1f3ff"]);

/**
 * Переводит захваченный Unicode-эмодзи в имя файла Twemoji:
 * кодпоинты в hex через дефис в точном соответствии с деревом файлов Twemoji.
 */
function twemojiCodepoints(raw: string): string {
  const cps: string[] = [];
  for (const ch of raw) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined) cps.push(cp.toString(16));
  }
  if (!cps.includes("200d")) {
    return cps.filter((c) => c !== "fe0f").join("-");
  }
  const withoutFe0f = cps.filter((c) => c !== "fe0f");
  const out: string[] = [];
  for (let i = 0; i < withoutFe0f.length; i++) {
    const cur = withoutFe0f[i];
    out.push(cur);
    const next = withoutFe0f[i + 1];
    if (TWEMOJI_ZWJ_FE0F_BASES.has(cur) && next && !SKIN_TONE_HEX.has(next)) {
      out.push("fe0f");
    }
  }
  return out.join("-");
}

/*
 * В разных версиях TikTok LIVE смайлы и эмодзи с телефонов зрителей
 * приходят как скобочным кодом ([smile]), так и любым Unicode-эмодзи
 * (включая текстовые пиктограммы ❤️/☀️/✨/☝️/☺️ بدون или с FE0F, флаги,
 * клавиши 0️⃣-9️⃣/#️⃣/*️⃣, тона кожи, составные ZWJ-цепочки и новые эмодзи
 * Unicode 15/16/17). Любой такой символ переводим в картинку Twemoji.
 */
const EMOJI_HEAD =
  /^(?:[0-9#*]\uFE0F?\u20E3|[\u{1F1E6}-\u{1F1FF}]{2}|\u{1F3F4}[\u{E0060}-\u{E007E}]+\u{E007F}|[\u00A9\u00AE\u2122]\uFE0F|(?!['"*0-9#\u00A9\u00AE\u2122])(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}))/u;
const EMOJI_PART =
  /^(?:\uFE0F|\u20E3|[\u{1F3FB}-\u{1F3FF}]|[\u{E0020}-\u{E007F}]|\u200D(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}|[\u2640\u2642\u2695\u2696\u2708\u2764\u27A1]))/u;

export function tiktokUnicodeEmojiAt(
  text: string,
  offset: number,
): { length: number; code: string; url: string } | null {
  const rest = text.slice(offset);
  const head = EMOJI_HEAD.exec(rest);
  if (!head) return null;

  let len = head[0].length;
  while (len < rest.length) {
    const tail = EMOJI_PART.exec(rest.slice(len));
    if (!tail) break;
    len += tail[0].length;
  }

  const emoji = rest.slice(0, len);
  const imageCode = twemojiCodepoints(emoji);
  if (!imageCode) return null;
  return { length: len, code: emoji, url: TW(imageCode) };
}
