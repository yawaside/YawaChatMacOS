import type { CSSProperties } from "react";
import { Heart } from "lucide-react";
import type { Style } from "../../lib/presets";
import {
  FEED_STYLES,
  OVERLAY_STYLES,
  WIDGET_STYLES,
  findStyle,
  isBareText,
  isStyleActive,
  previewRowVars,
  resolveTone,
  styleClass,
  toneName,
} from "../../lib/presets";
import { PlatformIcon, nickColor, platformMeta } from "../../lib/platforms";
import { fontStack } from "../../lib/fonts";
import { composeTextShadow } from "../../lib/effects";
import type { ChatViewConfig, FontId, OverlayConfig, PlatformId, WidgetConfig } from "../../lib/types";

/* ---------------- сетка пресетов v1.2.4 ---------------- */
export function PresetGrid<T extends object>({
  presets,
  cfg,
  onApply,
}: {
  presets: Style<T>[];
  cfg: T;
  onApply: (patch: Partial<T>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {presets.map((p) => {
        const on = isStyleActive(p, cfg);
        return (
          <button
            key={p.id}
            onClick={() => onApply(p.patch)}
            title={p.desc}
            className="cursor-pointer rounded-xl border p-2 text-left transition-all hover:brightness-110"
            style={{
              background: on ? "color-mix(in srgb, var(--dw-accent) 14%, transparent)" : "var(--dw-input)",
              borderColor: on ? "var(--dw-accent)" : "transparent",
            }}
          >
            <div
              className="mb-1.5 flex h-9 flex-col justify-center gap-1 rounded-lg px-1.5"
              style={{
                background:
                  p.swatch[1] === "transparent"
                    ? "repeating-conic-gradient(#2a2e3d 0% 25%, #1b1e29 0% 50%) 50%/8px 8px"
                    : p.swatch[1],
                outline: "1px solid var(--dw-line)",
              }}
            >
              <span
                className="truncate text-[10px] font-bold"
                style={{ color: p.swatch[0], fontFamily: p.font }}
              >
                Аа Bb
              </span>
              <span
                className="h-1 rounded-full"
                style={{ background: p.swatch[0], opacity: 0.45, width: "80%" }}
              />
            </div>
            <p
              className="truncate text-[11.5px] font-semibold"
              style={{ color: on ? "var(--dw-accent-2)" : "var(--dw-text)", fontFamily: p.font }}
            >
              {p.name}
            </p>
            <p className="truncate text-[9.5px]" style={{ color: "var(--dw-dim)" }}>
              {p.desc}
            </p>
          </button>
        );
      })}
    </div>
  );
}

/* ================= галерея стилей ================= */

/**
 * Галерея стилей. Миниатюра — ЖИВОЙ образец: настоящий CSS стиля
 * (.style-<id> + .y-row) рисует плашку так же, как в реальном виде,
 * поэтому «свечение неона» и «сканлайны HUD» видны прямо здесь.
 */
export function StyleGallery<
  T extends { styleId?: string; styleTone?: string; fontFamily?: FontId; customFont?: string },
>({ styles, cfg, onApply }: { styles: Style<T>[]; cfg: T; onApply: (patch: Partial<T>) => void }) {
  /* наборы цветов выбираются у уже выбранной темы: у каждой темы их три,
     и тема помнит выбор, поэтому переключение не сбрасывает остальные
     настройки поверхности */
  const active = styles.find((s) => isStyleActive(s, cfg));
  const activeTone = resolveTone(active, cfg.styleTone);

  return (
    <>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {styles.map((s) => {
          const on = isStyleActive(s, cfg);
          return (
            <button
              key={s.id}
              onClick={() => onApply(s.patch)}
              title={s.desc}
              className="cursor-pointer rounded-xl border p-1.5 text-left transition-all hover:brightness-110"
              style={{
                background: on ? "color-mix(in srgb, var(--dw-accent) 14%, transparent)" : "var(--dw-input)",
                borderColor: on ? "var(--dw-accent)" : "transparent",
              }}
            >
              {/* живой образец: шрифт и переменные строк — из патча стиля */}
              <span
                className={`style-${s.id} mb-1.5 flex h-11 items-center overflow-hidden rounded-lg px-1.5`}
                data-tone={resolveTone(s, (s.patch as { styleTone?: string }).styleTone)}
                style={{
                  background: "radial-gradient(120% 140% at 20% 0%, #232a44 0%, #161a2b 55%, #10131f 100%)",
                }}
              >
                <span
                  className="y-row y-line w-full truncate py-0.5 pl-1 text-[9.5px] leading-snug"
                  style={{
                    ...previewRowVars(s.patch),
                    fontFamily: s.forceFont
                      ? s.font
                      : fontStack((s.patch.fontFamily as FontId | undefined) ?? "inter", cfg.customFont),
                  }}
                >
                  <span className="y-nick font-bold">nekto_san: </span>привет всем
                </span>
              </span>

              <span
                className="block truncate px-0.5 text-[11.5px] font-semibold"
                style={{ color: on ? "var(--dw-accent-2)" : "var(--dw-text)" }}
              >
                {s.name}
              </span>
              <span className="block truncate px-0.5 text-[9.5px]" style={{ color: "var(--dw-dim)" }}>
                {s.desc}
              </span>
            </button>
          );
        })}
      </div>

      {active?.tones?.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span
            className="text-[10px] font-bold tracking-[0.14em] uppercase"
            style={{ color: "var(--dw-dim)" }}
          >
            Набор
          </span>
          {active.tones.map((t) => (
            <button
              key={t.id}
              onClick={() => onApply({ styleTone: t.id } as Partial<T>)}
              className="cursor-pointer rounded-lg border px-2 py-0.5 text-[11px] transition-all hover:brightness-110"
              style={{
                background:
                  t.id === activeTone
                    ? "color-mix(in srgb, var(--dw-accent) 18%, transparent)"
                    : "var(--dw-input)",
                borderColor: t.id === activeTone ? "var(--dw-accent)" : "transparent",
                color: t.id === activeTone ? "var(--dw-accent-2)" : "var(--dw-text)",
              }}
            >
              {t.name}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

/* ================= демо-данные ================= */

const SAMPLE: { platform: PlatformId; author: string; text: string; kind?: string; amount?: number }[] = [
  { platform: "twitch", author: "nekto_san", text: "привет всем, погнали!" },
  { platform: "youtube", author: "wesna_life", text: "красиво затащил" },
  { platform: "donationalerts", author: "kot1k_tv", text: "на новый микрофон", kind: "donate", amount: 500 },
  { platform: "vkplay", author: "lazy_panda", text: "а какая катка следующая?" },
  { platform: "kick", author: "gg_wp_ez", text: "изи" },
];

const nick = (name: string, upper?: boolean) => (upper ? name.toUpperCase() : name);

/* ================= предпросмотр поверхностей =================
   Превью рисуют строки ТЕМ ЖЕ протоколом стилей (.y-row + переменные
   --y-*), что и реальные лента/виджет/оверлей, — поэтому выбранный стиль
   (палитра, свечение, стекло, сканлайны) виден здесь один в один. */

export function FeedPreview({ view }: { view: ChatViewConfig }) {
  const fStyle = findStyle(FEED_STYLES, view.styleId);
  return (
    <PreviewFrame title="Лента">
      <div
        data-tone={resolveTone(fStyle, view.styleTone)}
        data-bare={isBareText(FEED_STYLES, view, !view.backdrop) ? "1" : undefined}
        className={`flex flex-col ${styleClass(view.styleId)} ${
          view.density === "cozy"
            ? "feed-cozy"
            : view.density === "compact"
              ? "feed-compact"
              : view.density === "tight"
                ? "feed-tight"
                : "feed-standard"
        }`}
        style={{
          gap: view.spacing,
          fontSize: view.fontSize,
          fontFamily: fStyle?.forceFont ? fStyle.font : fontStack(view.fontFamily, view.customFont),
          background: "var(--dw-bg)",
        }}
      >
        {SAMPLE.slice(0, 4).map((m, i) => {
          const isEvent = !!m.kind;
          return (
            <div
              key={i}
              className={`y-row dw-msg leading-snug break-words ${isEvent ? "y-row--event " : ""}`}
              style={
                {
                  "--y-bg": view.backdrop
                    ? isEvent
                      ? "color-mix(in srgb, #f59e0b 9%, transparent)"
                      : "var(--dw-panel)"
                    : "transparent",
                  "--y-ink": "var(--dw-text)",
                  "--y-op": view.backdrop ? 1 : 0,
                  "--y-r": `${view.radius}px`,
                  "--y-sw": isEvent || view.stripe ? "3px" : "0px",
                  "--y-sc": isEvent ? "#f59e0b" : platformMeta(m.platform).color,
                  "--y-nc": view.accentNick
                    ? nickColor(m.author, platformMeta(m.platform).color)
                    : "var(--dw-text)",
                  "--y-ts": composeTextShadow(view.outlineWidth, view.textShadow ?? false),
                  "--y-tint": "#f59e0b",
                  borderBottom: view.separators ? "1px solid var(--dw-line)" : "none",
                } as CSSProperties
              }
            >
              <div className="y-line leading-snug break-words">
                {view.showTime && (
                  <span
                    className="inline-block mr-1 tabular-nums align-baseline"
                    style={{ fontSize: "0.78em", color: "var(--dw-dim)" }}
                  >
                    12:34
                  </span>
                )}
                {view.showPlatform && (
                  <span className="inline-flex mr-1 translate-y-[1.5px] align-baseline">
                    <PlatformIcon id={m.platform} size={Math.round(view.fontSize * 0.85)} />
                  </span>
                )}
                {view.showBadges && i === 0 && (
                  <span
                    className="inline-block mr-1 rounded px-1 font-bold uppercase align-baseline"
                    style={{ fontSize: "0.6em", background: "rgba(52,211,153,0.2)", color: "#34d399" }}
                  >
                    mod
                  </span>
                )}
                <span className="y-nick inline font-semibold mr-1">
                  {nick(m.author, view.nickCase === "upper") + ":"}
                </span>
                {m.amount && (
                  <span
                    className="inline-block mr-1 rounded px-1 font-bold align-baseline"
                    style={{ background: "#f59e0b22", color: "#fbbf24" }}
                  >
                    {m.amount} ₽
                  </span>
                )}
                <span className="inline">{m.text}</span>
              </div>
            </div>
          );
        })}
      </div>
    </PreviewFrame>
  );
}

/* ================= предпросмотр виджета ================= */

export function WidgetPreview({ cfg }: { cfg: WidgetConfig }) {
  const dark = cfg.theme !== "light";
  const shown = SAMPLE.slice(0, Math.min(cfg.max, 5));
  const size = Math.min(cfg.fontSize, 20);

  const rawOp = cfg.backdropOpacity ?? (cfg.transparent ? 0 : 0.7);
  const opacity = cfg.transparent ? 0 : Math.max(0, Math.min(1, rawOp > 1 ? rawOp / 100 : rawOp));
  const cardBg =
    opacity <= 0.001
      ? "transparent"
      : dark
        ? `rgba(10, 12, 20, ${opacity})`
        : `rgba(255, 255, 255, ${opacity})`;

  /* окно и вид «только текст» — те же флаги, что у настоящего виджета */
  const wStyle = findStyle(WIDGET_STYLES, cfg.styleId);
  const wWindowOp = Math.max(0, Math.min(1, cfg.windowOpacity ?? 1));
  const wWindow = !!cfg.windowBackdrop && wWindowOp > 0.001;

  return (
    <PreviewFrame title="Виджет OBS" scene>
      <div
        data-tone={resolveTone(wStyle, cfg.styleTone)}
        data-bare={isBareText(WIDGET_STYLES, cfg, opacity <= 0.001) ? "1" : undefined}
        className={`flex flex-col justify-end rounded-lg p-2 ${styleClass(cfg.styleId)}`}
        style={{
          fontSize: size,
          fontFamily: wStyle?.forceFont ? wStyle.font : fontStack(cfg.fontFamily, cfg.customFont),
          background: "transparent",
          minHeight: 110,
        }}
      >
        <div
          className={`y-win ${wWindow ? "" : "is-bare"} ${cfg.windowBar ? "" : "no-bar"} w-full`}
          style={
            {
              "--w-op": wWindowOp,
              "--w-r": `${Math.max(0, cfg.windowRadius ?? 16)}px`,
            } as CSSProperties
          }
        >
          <div className="y-win__bar">
            <span className="y-win__title">{wStyle?.name ?? "Чат"}</span>
            {toneName(wStyle, cfg.styleTone) && (
              <span className="y-win__meta">{toneName(wStyle, cfg.styleTone)}</span>
            )}
          </div>
          <div className="flex flex-col justify-end" style={{ gap: cfg.spacing }}>
            {shown.map((m, i) => (
              <div
                key={i}
                className="y-row y-line px-2 py-1 leading-snug break-words"
                style={
                  {
                    "--y-op": opacity,
                    "--y-r": `${cfg.radius ?? 10}px`,
                    "--y-sw": cfg.stripe ? "3px" : "0px",
                    "--y-sc": platformMeta(m.platform).color,
                    "--y-nc": nickColor(m.author, platformMeta(m.platform).color),
                    "--y-ts": composeTextShadow(cfg.outlineWidth, cfg.textShadow ?? cfg.outlines ?? true),
                    "--y-bg": cardBg,
                    "--y-ink": dark || opacity < 0.35 ? "#eef0f8" : "#121524",
                  } as CSSProperties
                }
              >
                <span className="inline-flex mr-1 translate-y-[1px] align-baseline">
                  <PlatformIcon id={m.platform} size={Math.round(size * 0.85)} />
                </span>
                <span className="y-nick inline font-bold mr-1">
                  {nick(m.author, cfg.nickCase === "upper") + ":"}
                </span>
                <span className="inline">{m.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="pt-1.5 text-[10px]" style={{ color: "var(--dw-dim)" }}>
        Шахматный фон — прозрачность в OBS. Показано {shown.length} из {cfg.max}.
      </p>
    </PreviewFrame>
  );
}

/* ================= предпросмотр оверлея ================= */

export function OverlayPreview({ cfg }: { cfg: OverlayConfig }) {
  const rawOp = cfg.backdropOpacity ?? 0;
  const op = Math.max(0, Math.min(1, rawOp > 1 ? rawOp / 100 : rawOp));
  const textShadow = composeTextShadow(cfg.outlineWidth, cfg.textShadow ?? cfg.shadowText ?? true);
  const list = (cfg.showEvents ? SAMPLE : SAMPLE.filter((s) => !s.kind)).slice(
    0,
    Math.min(cfg.maxMessages, 4),
  );

  const rowVars = (extra: number, stripe: number, stripeColor: string, nk: string) =>
    (() => {
      const finalOp = Math.min(1, Math.max(0, op + extra));
      return {
        "--y-op": finalOp,
        "--y-r": `${cfg.radius}px`,
        "--y-sw": `${stripe}px`,
        "--y-sc": stripeColor,
        "--y-nc": nk,
        "--y-ts": textShadow,
        "--y-bg": finalOp <= 0.001 ? "transparent" : `rgba(8, 10, 16, ${finalOp})`,
        "--y-ink": "#ffffff",
        "--y-blur": finalOp > 0.05 ? "blur(6px)" : "none",
      } as CSSProperties;
    })();

  const statsBar = cfg.showStats ? (
    <div
      className="y-row flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1"
      style={rowVars(0.06, 0, "transparent", "#fff")}
    >
      {cfg.showDonations && (
        <span className="font-bold" style={{ color: "#FFB454" }}>
          3 250 ₽
        </span>
      )}
      {(["twitch", "youtube", "vkplay", "tiktok"] as PlatformId[]).map((p) => (
        <span key={p} className="flex items-center gap-1">
          <PlatformIcon id={p} size={Math.round(cfg.fontSize * 0.9)} />
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#4ade80" }} />
          {cfg.showViewers && (
            <span className="tabular-nums" style={{ fontSize: "0.85em" }}>
              {p === "tiktok" ? "73" : "1.2k"}
            </span>
          )}
          {p === "tiktok" && cfg.showLikes && (
            <span
              className="flex items-center gap-0.5 tabular-nums"
              style={{ fontSize: "0.82em", color: "#fe2c55" }}
            >
              <Heart size={Math.round(cfg.fontSize * 0.65)} fill="currentColor" /> 12.8k
            </span>
          )}
        </span>
      ))}
    </div>
  ) : null;

  const oStyle = findStyle(OVERLAY_STYLES, cfg.styleId);
  const oWindowOp = Math.max(0, Math.min(1, cfg.windowOpacity ?? 1));
  const oWindow = !!cfg.windowBackdrop && oWindowOp > 0.001;

  return (
    <PreviewFrame title="Оверлей" scene>
      <div
        data-tone={resolveTone(oStyle, cfg.styleTone)}
        data-bare={isBareText(OVERLAY_STYLES, cfg, op <= 0.001) ? "1" : undefined}
        className={`flex flex-col ${styleClass(cfg.styleId)}`}
        style={{
          gap: cfg.spacing,
          fontSize: cfg.fontSize,
          fontFamily: oStyle?.forceFont ? oStyle.font : fontStack(cfg.fontFamily, cfg.customFont),
          opacity: cfg.textOpacity,
          minHeight: 110,
        }}
      >
        {cfg.statsPos === "top" && statsBar}
        <div
          className={`y-win ${oWindow ? "" : "is-bare"} ${cfg.windowBar ? "" : "no-bar"}`}
          style={
            {
              "--w-op": oWindowOp,
              "--w-r": `${Math.max(0, cfg.windowRadius ?? 14)}px`,
            } as CSSProperties
          }
        >
          <div className="y-win__bar">
            <span className="y-win__title">{oStyle?.name ?? "Чат"}</span>
            {toneName(oStyle, cfg.styleTone) && (
              <span className="y-win__meta">{toneName(oStyle, cfg.styleTone)}</span>
            )}
          </div>
          <div className="flex flex-col" style={{ gap: cfg.spacing }}>
            {list.map((m, i) => (
              <div
                key={i}
                className="y-row y-line px-2 py-1 leading-snug break-words"
                style={rowVars(
                  m.kind === "donate" ? 0.05 : 0,
                  cfg.accentBar ? 3 : 0,
                  m.kind === "donate" ? "#f59e0b" : platformMeta(m.platform).color,
                  nickColor(m.author, platformMeta(m.platform).color),
                )}
              >
                {cfg.showTime && (
                  <span className="inline-block mr-1 text-[0.78em] opacity-70 align-baseline">12:34</span>
                )}
                {cfg.showPlatform && (
                  <span className="inline-flex mr-1 translate-y-[1px] align-baseline">
                    <PlatformIcon id={m.platform} size={Math.round(cfg.fontSize * 0.85)} />
                  </span>
                )}
                <span className="y-nick inline font-bold mr-1">
                  {nick(m.author, cfg.nickCase === "upper") + ":"}
                </span>
                {m.amount && (
                  <span
                    className="inline-block mr-1 rounded px-1 font-bold align-baseline"
                    style={{ background: "rgba(245,158,11,0.28)", color: "#fde68a" }}
                  >
                    {m.amount} ₽
                  </span>
                )}
                <span className="inline">{m.text}</span>
              </div>
            ))}
          </div>
        </div>
        {cfg.statsPos === "bottom" && statsBar}
      </div>
    </PreviewFrame>
  );
}

/* ================= рамка ================= */

function PreviewFrame({
  title,
  children,
  scene,
}: {
  title: string;
  children: React.ReactNode;
  scene?: boolean;
}) {
  return (
    <div
      className="rounded-xl border p-2"
      style={{ background: "var(--dw-panel)", borderColor: "var(--dw-line)" }}
    >
      <p
        className="pb-1.5 text-[10px] font-bold tracking-[0.14em] uppercase"
        style={{ color: "var(--dw-dim)" }}
      >
        {title}
      </p>
      <div
        className="rounded-lg p-2"
        style={
          scene
            ? {
                background:
                  "linear-gradient(120deg, rgba(31,111,235,0.35), rgba(139,92,246,0.35)), repeating-conic-gradient(#2a2e3d 0% 25%, #1b1e29 0% 50%) 50%/14px 14px",
              }
            : { background: "var(--dw-bg)" }
        }
      >
        {children}
      </div>
    </div>
  );
}
