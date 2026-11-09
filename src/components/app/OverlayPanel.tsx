import { useEffect, useState } from "react";
import { AlignLeft, Blend, Gamepad2, LayoutPanelTop, MousePointerClick, Power, Timer } from "lucide-react";
import type { Channel, OverlayConfig } from "../../lib/types";
import { isDesktop, openExternal, overlayBridge } from "../../lib/bridge";

import { OVERLAY_STYLES, styleName } from "../../lib/presets";
import { effectName } from "../../lib/effects";
import { StyleGallery } from "./Presets";
import {
  Box,
  CheckRow,
  Chip,
  CustomFontInput,
  EffectPicker,
  FontPicker,
  Slider,
  SpacingSlider,
  ToggleRow,
} from "./ui";

interface Props {
  cfg: OverlayConfig;
  patch: (c: OverlayConfig) => void;
  toast: (t: string) => void;
  hotkey?: string;
  /** подключённые каналы: по ним видно, нужны ли настройки конкретной площадки */
  channels?: Channel[];
}

export default function OverlayPanel({ cfg, patch, toast, hotkey, channels }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isDesktop()) void overlayBridge.isVisible().then(setVisible);
  }, []);

  /* лайки есть только у TikTok: без подключённого канала пункт не нужен */
  const tiktokConnected = (channels ?? []).some((c) => c.platform === "tiktok");

  const apply = (c: OverlayConfig) => {
    patch(c);
    overlayBridge.set(c);
  };

  const toggleOverlay = async () => {
    if (isDesktop()) {
      const v = await overlayBridge.toggle();
      setVisible(v);
      toast(v ? "Оверлей показан поверх игры" : "Оверлей скрыт");
    } else {
      openExternal(`${location.origin}${location.pathname}#/overlay`);
      toast("Оверлей открыт в новой вкладке (предпросмотр)");
    }
  };

  return (
    <div className="grid grid-cols-1 gap-3 overflow-y-auto xl:grid-cols-2">
      {/* ---------- состояние и активация ---------- */}
      <Box
        title="Оверлей поверх игры"
        icon={<Gamepad2 size={14} style={{ color: "var(--dw-dim)" }} />}
        className="xl:col-span-2"
        defaultOpen={false}
        hint={visible ? "показан" : "скрыт"}
        actions={
          <button
            onClick={toggleOverlay}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold text-white transition-all hover:brightness-110"
            style={{ background: visible ? "#ef4444" : "var(--dw-accent)" }}
          >
            <Power size={12} /> {visible ? "Скрыть" : "Показать"}
          </button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={toggleOverlay}
            className="flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-[12.5px] font-bold text-white transition-all hover:brightness-110"
            style={{ background: visible ? "#ef4444" : "var(--dw-accent)" }}
          >
            <Power size={14} /> {visible ? "Скрыть оверлей" : "Показать оверлей"}
          </button>
          <span
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px]"
            style={{ background: "var(--dw-input)", color: "var(--dw-dim)" }}
          >
            Горячая клавиша:
            <b className="font-mono" style={{ color: "var(--dw-accent-2)" }}>
              {hotkey || "не назначена"}
            </b>
            <span className="opacity-70">— работает и поверх игры</span>
          </span>
          <ToggleRow
            label=""
            checked={cfg.enabled}
            onChange={(v) => {
              apply({ ...cfg, enabled: v });
              if (!v && isDesktop()) {
                overlayBridge.close();
                setVisible(false);
              }
            }}
          />
          <span className="-ml-1 text-[11.5px]" style={{ color: "var(--dw-dim)" }}>
            автозапуск вместе с приложением
          </span>
        </div>

        {/* Сквозной клик — главный переключатель режима оверлея.
            Включён: мышь проходит сквозь окно в игру, перемещение недоступно.
            Выключен: окно ловит мышь, его можно двигать и менять размер. */}
        <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--dw-line)" }}>
          <ToggleRow
            label="Сквозной клик"
            hint={
              cfg.clickThrough
                ? "нажатия проходят сквозь оверлей в игру; перемещение выключено"
                : "оверлей ловит мышь — его можно перетаскивать и менять размер"
            }
            checked={cfg.clickThrough}
            onChange={(v) => {
              // Сквозной клик и перемещение — взаимоисключающие режимы:
              // выключили сквозной клик → окно сразу можно двигать.
              apply({ ...cfg, clickThrough: v, freePosition: true, corner: "free", locked: v });
              toast(v ? "Сквозной клик включён" : "Оверлей можно перетаскивать мышью");
            }}
          />
        </div>
      </Box>

      {/* ---------- готовые варианты оформления ---------- */}
      <Box
        title="Стиль оформления"
        icon={<Blend size={14} style={{ color: "var(--dw-dim)" }} />}
        className="xl:col-span-2"
        hint={styleName(OVERLAY_STYLES, cfg.styleId)}
      >
        <StyleGallery styles={OVERLAY_STYLES} cfg={cfg} onApply={(p) => apply({ ...cfg, ...p })} />
      </Box>

      {/* ---------- окно чата: второй слой темы ---------- */}
      <Box
        title="Окно чата"
        icon={<LayoutPanelTop size={14} style={{ color: "var(--dw-dim)" }} />}
        hint={
          cfg.windowBackdrop
            ? `${Math.round((cfg.windowOpacity ?? 1) * 100)}% · скругление ${cfg.windowRadius ?? 14}px`
            : "выключено"
        }
      >
        <div className="flex flex-col gap-3">
          <CheckRow
            label="Подложка окна под сообщениями"
            checked={cfg.windowBackdrop ?? false}
            onChange={(v) => apply({ ...cfg, windowBackdrop: v })}
          />
          <p className="text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
            Выключите окно — останутся только плашки. Прозрачная подложка вместе с окном даёт вид «только
            текст»: цвета и тень темы сохраняются.
          </p>
          {cfg.windowBackdrop && (
            <>
              <CheckRow
                label="Шапка окна: название темы и набор"
                checked={cfg.windowBar ?? false}
                onChange={(v) => apply({ ...cfg, windowBar: v })}
              />
              <div>
                <label
                  className="mb-1 flex items-center justify-between text-[11px]"
                  style={{ color: "var(--dw-dim)" }}
                >
                  <span>Прозрачность окна</span>
                  <span>{Math.round((cfg.windowOpacity ?? 1) * 100)}%</span>
                </label>
                <Slider
                  value={cfg.windowOpacity ?? 1}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => apply({ ...cfg, windowOpacity: Number(v.toFixed(2)) })}
                  format={(v) => (v === 0 ? "0% (без окна)" : `${Math.round(v * 100)}%`)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
                  Скругление окна
                </label>
                <Slider
                  value={cfg.windowRadius ?? 14}
                  min={0}
                  max={32}
                  step={1}
                  onChange={(v) => apply({ ...cfg, windowRadius: v })}
                  format={(v) => `${v}px`}
                />
              </div>
            </>
          )}
        </div>
      </Box>

      {/* ---------- шрифт ---------- */}
      <Box
        title="Шрифт"
        icon={<Blend size={14} style={{ color: "var(--dw-dim)" }} />}
        hint={cfg.customFont ? "свой (Google Fonts)" : "набор из списка"}
      >
        <FontPicker value={cfg.fontFamily} onChange={(id) => apply({ ...cfg, fontFamily: id })} />
        <CustomFontInput
          value={cfg.customFont}
          onChange={(v) => apply({ ...cfg, customFont: v.trim() || undefined })}
        />
      </Box>

      {/* ---------- подложка и читаемость ---------- */}
      <Box
        title="Фон и читаемость"
        icon={<Blend size={14} style={{ color: "var(--dw-dim)" }} />}
        hint={`подложка ${Math.round((cfg.backdropOpacity ?? 0) * 100)}%`}
      >
        <div className="flex flex-col gap-3">
          <div>
            <label
              className="mb-1 flex items-center justify-between text-[11px]"
              style={{ color: "var(--dw-dim)" }}
            >
              <span>Прозрачность подложки</span>
              <span>{cfg.backdropOpacity === 0 ? "полностью прозрачная" : "текст не затрагивается"}</span>
            </label>
            <Slider
              value={cfg.backdropOpacity}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => apply({ ...cfg, backdropOpacity: v })}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Прозрачность текста (отдельно)
            </label>
            <Slider
              value={cfg.textOpacity}
              min={0.3}
              max={1}
              step={0.01}
              onChange={(v) => apply({ ...cfg, textOpacity: v })}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Скругление подложки
            </label>
            <Slider
              value={cfg.radius}
              min={0}
              max={20}
              step={1}
              onChange={(v) => apply({ ...cfg, radius: v })}
              format={(v) => `${v}px`}
            />
          </div>
          <div>
            <label
              className="mb-1 flex items-center justify-between text-[11px]"
              style={{ color: "var(--dw-dim)" }}
            >
              <span>Обводка текста (тонкий контур)</span>
              <span>
                {(cfg.outlineWidth ?? 0.8) === 0
                  ? "без обводки"
                  : `${(cfg.outlineWidth ?? 0.8).toFixed(1)}px`}
              </span>
            </label>
            <Slider
              value={cfg.outlineWidth ?? 0.8}
              min={0}
              max={4}
              step={0.2}
              onChange={(v) => apply({ ...cfg, outlineWidth: v })}
              format={(v) => (v === 0 ? "без обводки" : `${v.toFixed(1)}px`)}
            />
          </div>
          <CheckRow
            label="Тень текста (мягкое свечение для читаемости)"
            checked={cfg.textShadow ?? cfg.shadowText ?? true}
            onChange={(v) => apply({ ...cfg, textShadow: v, shadowText: v })}
          />
          <CheckRow
            label="Цветная полоса площадки слева"
            checked={cfg.accentBar}
            onChange={(v) => apply({ ...cfg, accentBar: v })}
          />
          {/* предпросмотр — в правой колонке настроек, здесь не дублируем */}
        </div>
      </Box>

      {/* ---------- эффект появления ---------- */}
      <Box
        title="Эффект появления"
        icon={<Blend size={14} style={{ color: "var(--dw-dim)" }} />}
        hint={effectName(cfg.effect)}
      >
        <EffectPicker effect={cfg.effect} speed={cfg.effectSpeed} onChange={(v) => apply({ ...cfg, ...v })} />
      </Box>

      {/* Блок «Положение окна» скрыт из настроек: окно по-прежнему двигается
          мышью, когда выключен сквозной клик (см. блок «Оверлей поверх игры»). */}

      {/* ---------- панель площадок ---------- */}
      <Box
        title="Панель площадок"
        icon={<LayoutPanelTop size={14} style={{ color: "var(--dw-dim)" }} />}
        hint={
          !cfg.showStats
            ? "выключена"
            : [
                cfg.statsPos === "top" ? "сверху" : "снизу",
                cfg.showDonations ? "с донатами" : null,
                cfg.showViewers ? "со зрителями" : null,
              ]
                .filter(Boolean)
                .join(" · ")
        }
      >
        <div className="flex flex-col gap-1">
          <ToggleRow
            label="Показывать панель"
            hint="донаты и статусы подключённых площадок"
            checked={cfg.showStats}
            onChange={(v) => apply({ ...cfg, showStats: v })}
          />

          {/* Остальные пункты относятся к самой панели: пока она выключена,
              они только занимают место. Значения при этом сохраняются. */}
          {cfg.showStats && (
            <>
              <div className="flex items-center gap-1.5 py-1.5">
                <span className="text-[11px]" style={{ color: "var(--dw-dim)" }}>
                  Расположение:
                </span>
                <Chip
                  active={cfg.statsPos === "bottom"}
                  onClick={() => apply({ ...cfg, statsPos: "bottom" })}
                >
                  снизу ↓
                </Chip>
                <Chip active={cfg.statsPos === "top"} onClick={() => apply({ ...cfg, statsPos: "top" })}>
                  сверху ↑
                </Chip>
              </div>

              <ToggleRow
                label="Сумма донатов первым элементом"
                hint="оригинальная иконка DonationAlerts, сумма за сессию"
                checked={cfg.showDonations}
                onChange={(v) => apply({ ...cfg, showDonations: v })}
              />
              <ToggleRow
                label="Скрывать неподключённые площадки"
                hint="в панели остаются только реально подключённые каналы"
                checked={cfg.hideDisconnected}
                onChange={(v) => apply({ ...cfg, hideDisconnected: v })}
              />
              <ToggleRow
                label="Счётчик зрителей у площадок"
                checked={cfg.showViewers}
                onChange={(v) => apply({ ...cfg, showViewers: v })}
              />
              {tiktokConnected && (
                <ToggleRow
                  label="Счётчик лайков TikTok"
                  hint="лайки за текущую трансляцию рядом со зрителями"
                  checked={cfg.showLikes}
                  onChange={(v) => apply({ ...cfg, showLikes: v })}
                />
              )}
            </>
          )}
          <p className="pt-1 text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
            У каждой подключённой площадки показываются иконка и индикатор эфира: зелёная точка — в эфире,
            приглушённая — офлайн. Данные обновляются из коннекторов в реальном времени.
          </p>
        </div>
      </Box>

      {/* ---------- содержимое строки ---------- */}
      <Box
        title="Содержимое строки"
        icon={<AlignLeft size={14} style={{ color: "var(--dw-dim)" }} />}
        hint="размер, время, значки, события"
      >
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Размер текста
            </label>
            <Slider
              value={cfg.fontSize}
              min={10}
              max={30}
              step={1}
              onChange={(v) => apply({ ...cfg, fontSize: v })}
              format={(v) => `${v}px`}
            />
          </div>
          <SpacingSlider value={cfg.spacing} onChange={(v) => apply({ ...cfg, spacing: v })} />
          <div>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Сообщений видно
            </label>
            <Slider
              value={cfg.maxMessages}
              min={1}
              max={20}
              step={1}
              onChange={(v) => apply({ ...cfg, maxMessages: v })}
              format={(v) => `${v}`}
            />
          </div>
          <div className="border-t pt-2" style={{ borderColor: "var(--dw-line)" }}>
            <CheckRow
              label="Иконка площадки"
              checked={cfg.showPlatform}
              onChange={(v) => apply({ ...cfg, showPlatform: v })}
            />
            <CheckRow
              label="Время сообщения"
              checked={cfg.showTime}
              onChange={(v) => apply({ ...cfg, showTime: v })}
            />
            <CheckRow
              label="Значки (мод, саб, vip)"
              checked={cfg.showBadges}
              onChange={(v) => apply({ ...cfg, showBadges: v })}
            />
            <CheckRow
              label="Стикеры и эмоуты"
              checked={cfg.showEmotes}
              onChange={(v) => apply({ ...cfg, showEmotes: v })}
            />
          </div>
          <ToggleRow
            label="Присоединения зрителей"
            hint="показывать событие «присоединился к трансляции» TikTok"
            checked={cfg.showJoinEvents}
            onChange={(v) => apply({ ...cfg, showJoinEvents: v })}
          />
          <ToggleRow
            label="Только события"
            hint="донаты, сабы, рейды и входы зрителей — без обычного чата"
            checked={cfg.eventsOnly}
            onChange={(v) => apply({ ...cfg, eventsOnly: v })}
          />
        </div>
      </Box>

      {/* ---------- авто-скрытие ---------- */}
      <Box
        title="Исчезновение сообщений"
        icon={<Timer size={14} style={{ color: "var(--dw-dim)" }} />}
        hint={cfg.autoFade ? `через ${cfg.fadeAfterSec} сек` : "выключено"}
      >
        <ToggleRow
          label="Скрывать старые сообщения"
          hint="строка исчезает через заданное время"
          checked={cfg.autoFade}
          onChange={(v) => apply({ ...cfg, autoFade: v })}
        />
        {cfg.autoFade && (
          <div className="pt-2">
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Время жизни строки
            </label>
            <Slider
              value={cfg.fadeAfterSec}
              min={5}
              max={180}
              step={5}
              onChange={(v) => apply({ ...cfg, fadeAfterSec: v })}
              format={(v) => `${v} сек`}
            />
          </div>
        )}
        <div
          className="mt-3 flex items-start gap-2 rounded-lg p-2.5"
          style={{ background: "var(--dw-input)" }}
        >
          <MousePointerClick size={13} className="mt-0.5 shrink-0" style={{ color: "var(--dw-dim)" }} />
          <p className="text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
            В WebView2-сборке оверлей — отдельное окно поверх всех окон. Все настройки применяются мгновенно,
            без перезапуска. Показ/скрытие — кнопкой выше или горячей клавишей.
          </p>
        </div>
      </Box>
    </div>
  );
}
