import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import type { WidgetConfig } from "../../lib/types";
import { copyText, openExternal, widgetInfo } from "../../lib/bridge";
import { WIDGET_STYLES, styleName } from "../../lib/presets";
import { effectName } from "../../lib/effects";
import { StyleGallery } from "./Presets";
import { CheckRow, Chip, Collapsible, CustomFontInput, EffectPicker, FontPicker, Slider } from "./ui";

interface Props {
  cfg: WidgetConfig;
  patch: (c: WidgetConfig) => void;
  toast: (t: string) => void;
}

export default function WidgetPanel({ cfg, patch, toast }: Props) {
  const [copied, setCopied] = useState(false);
  const [info, setInfo] = useState({ url: "http://127.0.0.1:8085/widget", port: 8085, running: false });

  useEffect(() => {
    void widgetInfo().then(setInfo);
  }, []);

  // ССЫЛКА ПОСТОЯННАЯ: оформление уходит в OBS живым событием по SSE.
  // Само событие отправляет главное окно при загрузке настроек и при каждом
  // изменении — вкладка здесь ни при чём, OBS получает оформление всегда.
  const url = info.url;

  const copy = async () => {
    if (await copyText(url)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      toast("Ссылка на виджет скопирована");
    }
  };

  const rawOp = cfg.backdropOpacity ?? (cfg.transparent ? 0 : 0.7);
  const currentOpacity = rawOp > 1 ? rawOp / 100 : rawOp;

  return (
    <div className="flex flex-col gap-2">
      <Collapsible
        title="Формат виджета"
        hint={
          (cfg.layout ?? "vertical") === "horizontal" ? "горизонтальный · полоска" : "вертикальный · столбец"
        }
      >
        <div className="flex flex-col gap-2">
          <div className="flex gap-1.5">
            <Chip
              active={(cfg.layout ?? "vertical") === "vertical"}
              onClick={() => patch({ ...cfg, layout: "vertical" })}
            >
              Вертикальный
            </Chip>
            <Chip
              active={cfg.layout === "horizontal"}
              onClick={() => patch({ ...cfg, layout: "horizontal" })}
            >
              Горизонтальный
            </Chip>
          </div>
          <p className="text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
            {(cfg.layout ?? "vertical") === "horizontal"
              ? "Поток идёт слева направо: новое сообщение появляется у левого края, старые уезжают вправо за край окна и остаются видимыми, пока видны хотя бы частично."
              : "Классический столбец: новые сообщения появляются снизу."}
          </p>
        </div>
      </Collapsible>

      <Collapsible title="Стиль оформления" hint={styleName(WIDGET_STYLES, cfg.styleId)}>
        <StyleGallery styles={WIDGET_STYLES} cfg={cfg} onApply={(s) => patch({ ...cfg, ...s })} />
      </Collapsible>

      {/* Окно чата — второй слой темы: подложка под всеми сообщениями со
          своей рамкой, декором и шапкой. Выключено — остаются только плашки
          сообщений; вместе с прозрачной подложкой сообщений — только текст. */}
      <Collapsible
        title="Окно чата"
        hint={
          cfg.windowBackdrop
            ? `${Math.round((cfg.windowOpacity ?? 1) * 100)}% · скругление ${cfg.windowRadius ?? 16}px`
            : "выключено"
        }
      >
        <div className="flex flex-col gap-2">
          <CheckRow
            label="Подложка окна под сообщениями"
            checked={cfg.windowBackdrop ?? false}
            onChange={(v) => patch({ ...cfg, windowBackdrop: v })}
          />
          <p className="text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
            Выключите окно — останутся только плашки. Выключите ещё и подложку сообщений — останется только
            текст в цветах темы.
          </p>
          {cfg.windowBackdrop && (
            <>
              <CheckRow
                label="Шапка окна: название темы и набор"
                checked={cfg.windowBar ?? true}
                onChange={(v) => patch({ ...cfg, windowBar: v })}
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
                  onChange={(v) => patch({ ...cfg, windowOpacity: Number(v.toFixed(2)) })}
                  format={(v) => (v === 0 ? "0% (без окна)" : `${Math.round(v * 100)}%`)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
                  Скругление окна
                </label>
                <Slider
                  value={cfg.windowRadius ?? 16}
                  min={0}
                  max={32}
                  step={1}
                  onChange={(v) => patch({ ...cfg, windowRadius: v })}
                  format={(v) => `${v}px`}
                />
              </div>
            </>
          )}
        </div>
      </Collapsible>

      <Collapsible title="Шрифт" hint={cfg.customFont ? "свой (Google Fonts)" : "набор из списка"}>
        <FontPicker value={cfg.fontFamily} onChange={(id) => patch({ ...cfg, fontFamily: id })} />
        <CustomFontInput
          value={cfg.customFont}
          onChange={(v) => patch({ ...cfg, customFont: v.trim() || undefined })}
        />
      </Collapsible>

      {/* ссылка для OBS — главное действие раздела */}
      <div
        className="flex items-center gap-2 rounded-xl border px-3 py-2"
        style={{ background: "var(--dw-panel)", borderColor: "var(--dw-line)" }}
      >
        <div className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[11px]" style={{ color: "var(--dw-accent-2)" }}>
            {url}
          </span>
          <span className="block text-[10px]" style={{ color: "var(--dw-dim)" }}>
            постоянная ссылка — добавьте в OBS один раз, оформление меняется на лету
          </span>
        </div>
        <button
          onClick={copy}
          className="shrink-0 cursor-pointer"
          title="Скопировать"
          style={{ color: copied ? "#4ade80" : "var(--dw-dim)" }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <button
          onClick={() => openExternal(url)}
          className="shrink-0 cursor-pointer"
          title="Открыть"
          style={{ color: "var(--dw-dim)" }}
        >
          <ExternalLink size={14} />
        </button>
      </div>

      <Collapsible
        title="Фон и подложка"
        hint={`${Math.round(currentOpacity * 100)}% прозрачность · скругление ${cfg.radius ?? 10}px`}
      >
        <div className="flex flex-col gap-2">
          <div>
            <label
              className="mb-1 flex items-center justify-between text-[11px]"
              style={{ color: "var(--dw-dim)" }}
            >
              <span>Прозрачность подложки сообщений</span>
              <span>
                {currentOpacity === 0 ? "полностью прозрачный фон" : `${Math.round(currentOpacity * 100)}%`}
              </span>
            </label>
            <Slider
              value={currentOpacity}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => patch({ ...cfg, transparent: v === 0, backdropOpacity: Number(v.toFixed(2)) })}
              format={(v) => (v === 0 ? "0% (полностью прозрачно)" : `${Math.round(v * 100)}%`)}
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Скругление плашек сообщений
            </label>
            <Slider
              value={cfg.radius ?? 10}
              min={0}
              max={24}
              step={1}
              onChange={(v) => patch({ ...cfg, radius: v })}
              format={(v) => `${v}px`}
            />
          </div>

          <CheckRow
            label="Цветная полоса площадки слева"
            checked={cfg.stripe ?? false}
            onChange={(v) => patch({ ...cfg, stripe: v })}
          />

          <div className="flex items-center gap-1.5 pt-0.5">
            <span className="text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Тема оформления:
            </span>
            <Chip active={cfg.theme === "dark"} onClick={() => patch({ ...cfg, theme: "dark" })}>
              тёмная
            </Chip>
            <Chip active={cfg.theme === "light"} onClick={() => patch({ ...cfg, theme: "light" })}>
              светлая
            </Chip>
          </div>
        </div>
      </Collapsible>

      <Collapsible
        title="Размер и плотность"
        hint={`${cfg.fontSize}px · интервал ${cfg.layout === "horizontal" ? Math.min(cfg.spacing, 1) : cfg.spacing}px`}
      >
        <div className="flex flex-col gap-2">
          <div>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Размер текста
            </label>
            <Slider
              value={cfg.fontSize}
              min={11}
              max={34}
              step={1}
              onChange={(v) => patch({ ...cfg, fontSize: v })}
              format={(v) => `${v}px`}
            />
          </div>
          {/* «Сообщений на экране» относится к столбцу: в горизонтальной
              полоске строк ровно столько, сколько помещается в окне —
              уезжающие за правый край убираются сами. */}
          {(cfg.layout ?? "vertical") !== "horizontal" && (
            <div>
              <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
                Сообщений на экране
              </label>
              <Slider
                value={cfg.max}
                min={2}
                max={20}
                step={1}
                onChange={(v) => patch({ ...cfg, max: v })}
                format={(v) => `${v}`}
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Интервал между сообщениями
            </label>
            <Slider
              value={cfg.layout === "horizontal" ? Math.min(cfg.spacing, 1) : cfg.spacing}
              min={0}
              max={cfg.layout === "horizontal" ? 1 : 16}
              step={1}
              onChange={(v) => patch({ ...cfg, spacing: v })}
              format={(v) => (v === 0 ? "вплотную" : `${v}px`)}
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
              onChange={(v) => patch({ ...cfg, outlineWidth: v, outlines: v > 0 })}
              format={(v) => (v === 0 ? "без обводки" : `${v.toFixed(1)}px`)}
            />
          </div>
          <CheckRow
            label="Мягкая тень текста (читаемость поверх игры)"
            checked={cfg.textShadow ?? cfg.outlines ?? true}
            onChange={(v) => patch({ ...cfg, textShadow: v })}
          />
        </div>
      </Collapsible>

      <Collapsible
        title="Исчезновение сообщений"
        hint={cfg.autoFade ? `через ${cfg.fadeAfterSec ?? 30} сек` : "выключено"}
      >
        <div className="flex flex-col gap-2">
          <CheckRow
            label="Скрывать старые сообщения"
            checked={cfg.autoFade ?? false}
            onChange={(v) => patch({ ...cfg, autoFade: v })}
          />
          {cfg.autoFade && (
            <div>
              <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
                Время жизни сообщения
              </label>
              <Slider
                value={cfg.fadeAfterSec ?? 30}
                min={5}
                max={180}
                step={5}
                onChange={(v) => patch({ ...cfg, fadeAfterSec: v })}
                format={(v) => `${v} сек`}
              />
            </div>
          )}
        </div>
      </Collapsible>

      {/* Раздел «Звук в OBS» скрыт из настроек: сам звук виджета продолжает
          работать с ранее сохранёнными значениями. */}
      <Collapsible title="Эффект появления" hint={effectName(cfg.effect)}>
        <EffectPicker effect={cfg.effect} speed={cfg.effectSpeed} onChange={(v) => patch({ ...cfg, ...v })} />
      </Collapsible>

      {/* Раздел «Подключение к OBS» скрыт из настроек: порт и режим виджета
          продолжают работать с ранее сохранёнными значениями. */}
    </div>
  );
}
