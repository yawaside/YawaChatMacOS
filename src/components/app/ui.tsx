import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Check, ChevronRight } from "lucide-react";
import { FONT_FAMILIES } from "../../lib/fonts";
import { EFFECTS } from "../../lib/effects";
import type { EffectId } from "../../lib/effects";
import type { FontId } from "../../lib/types";
import { useSettingFocus } from "../../lib/settingsFocus";

/* ---------- тумблер ---------- */
export function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative shrink-0 cursor-pointer rounded-full transition-all duration-200 disabled:opacity-40"
      style={{
        width: 34,
        height: 19,
        background: checked ? "var(--dw-accent)" : "var(--range-rest)",
        boxShadow: checked ? "0 0 10px color-mix(in srgb, var(--dw-accent) 45%, transparent)" : "none",
      }}
    >
      <span
        className="absolute top-[2.5px] rounded-full bg-white transition-all duration-200"
        style={{
          width: 14,
          height: 14,
          left: checked ? 17.5 : 2.5,
          boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
        }}
      />
    </button>
  );
}

/* ---------- строка настройки с тумблером ---------- */
export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  children,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div>
      <div
        className="flex cursor-pointer items-center justify-between gap-3 py-1"
        onClick={() => onChange(!checked)}
      >
        <div className="min-w-0">
          <div className="truncate text-[12px]" style={{ color: "var(--dw-text)" }}>
            {label}
          </div>
          {hint && (
            <div className="truncate text-[10.5px]" style={{ color: "var(--dw-dim)" }}>
              {hint}
            </div>
          )}
        </div>
        <Toggle checked={checked} onChange={onChange} />
      </div>
      {children}
    </div>
  );
}

/* ---------- слайдер ---------- */
export function Slider({
  value,
  min,
  max,
  step = 0.01,
  onChange,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        className="w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--fill": `${fill}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span
        className="w-12 shrink-0 text-right text-[11.5px] tabular-nums"
        style={{ color: "var(--dw-dim)" }}
      >
        {format ? format(value) : String(value)}
      </span>
    </div>
  );
}

/* ---------- карточка панели ---------- */
export function Box({
  title,
  icon,
  children,
  actions,
  className = "",
  collapsible = true,
  defaultOpen = false,
  hint,
}: {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** блок можно свернуть (по умолчанию да) */
  collapsible?: boolean;
  /** раскрыт ли блок сразу (по умолчанию нет) */
  defaultOpen?: boolean;
  /** краткая подсказка справа в заголовке свёрнутого блока */
  hint?: string;
}) {
  const canCollapse = collapsible && !!title;
  const [open, setOpen] = useState(canCollapse ? defaultOpen : true);
  const shown = canCollapse ? open : true;
  const focus = useSettingFocus();

  /* поиск в настройках просит показать пункт — раскрываем свой блок */
  useEffect(() => {
    if (focus?.box && title && focus.box === title) setOpen(true);
  }, [focus, title]);

  return (
    <section
      className={`rounded-xl border ${className}`}
      style={{ background: "var(--dw-panel)", borderColor: "var(--dw-line)" }}
    >
      {title && (
        <header
          className={`flex items-center gap-2 px-3 py-1.5 ${shown ? "border-b" : ""}`}
          style={{ borderColor: "var(--dw-line)" }}
        >
          {canCollapse ? (
            <button
              onClick={() => setOpen((v) => !v)}
              className="-mx-1 flex flex-1 cursor-pointer items-center gap-2 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-[var(--dw-hover)]"
            >
              <ChevronRight
                size={13}
                style={{
                  color: "var(--dw-dim)",
                  transform: shown ? "rotate(90deg)" : "none",
                  transition: "transform 0.15s ease",
                }}
              />
              {icon}
              {/* min-w-0 + truncate: на узком окне длинный заголовок не
                  выпирает за блок, а обрезается многоточием */}
              <h3
                className="min-w-0 truncate text-[12px] font-semibold tracking-wide"
                style={{ color: "var(--dw-text)" }}
              >
                {title}
              </h3>
              {hint && !shown && (
                <span className="ml-auto truncate text-[10.5px]" style={{ color: "var(--dw-dim)" }}>
                  {hint}
                </span>
              )}
            </button>
          ) : (
            <>
              {icon}
              <h3 className="text-[12px] font-semibold tracking-wide" style={{ color: "var(--dw-text)" }}>
                {title}
              </h3>
            </>
          )}
          {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
        </header>
      )}
      {shown && <div className="p-3">{children}</div>}
    </section>
  );
}

/* ---------- текстовое поле ---------- */
export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      type={props.type ?? "text"}
      className={`w-full rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors outline-none ${props.className ?? ""}`}
      style={{
        background: "var(--dw-input)",
        borderColor: "transparent",
        color: "var(--dw-text)",
        ...props.style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--dw-accent)";
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "transparent";
        props.onBlur?.(e);
      }}
    />
  );
}

/* ---------- пилюля-кнопка ---------- */
export function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap transition-all"
      style={{
        background: active ? "color-mix(in srgb, var(--dw-accent) 18%, transparent)" : "var(--dw-input)",
        borderColor: active ? "var(--dw-accent)" : "transparent",
        color: active ? "var(--dw-accent-2)" : "var(--dw-dim)",
      }}
    >
      {children}
    </button>
  );
}

/* ---------- маленькая кнопка-иконка ---------- */
export function IconBtn({
  icon,
  title,
  onClick,
  active,
  danger,
  size = 26,
}: {
  icon: ReactNode;
  title?: string;
  onClick?: (e: React.MouseEvent) => void;
  active?: boolean;
  danger?: boolean;
  size?: number;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-[var(--dw-hover)]"
      style={{
        width: size,
        height: size,
        color: danger ? "#f87171" : active ? "var(--dw-accent-2)" : "var(--dw-dim)",
        background: active ? "color-mix(in srgb, var(--dw-accent) 15%, transparent)" : "transparent",
      }}
    >
      {icon}
    </button>
  );
}

/* ---------- кнопки-светофоры в стиле macOS (вид «macOS») ----------
   Красная — закрыть окно, жёлтая — свернуть, зелёная — развернуть.
   Глифы проявляются при наведении, как в macOS; кнопки сами по себе
   маленькие, область нажатия больше гибкая за счёт паддинга снаружи. */
export function TrafficLights({
  onClose,
  onMinimize,
  onToggleMaximize,
  maximized,
  minimizeToTray,
  closeToTray,
}: {
  onClose: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  maximized?: boolean;
  minimizeToTray?: boolean;
  closeToTray?: boolean;
}) {
  const glyph =
    "pointer-events-none opacity-0 transition-opacity duration-150 group-hover:opacity-100 text-black/60";
  const btn =
    "group relative grid h-3 w-3 shrink-0 cursor-pointer place-items-center rounded-full border border-black/20 shadow-[inset_0_-1px_1px_rgba(0,0,0,0.15)] transition-transform duration-100 active:scale-90 no-drag";
  return (
    <div className="flex shrink-0 items-center gap-2 no-drag" aria-label="Окно">
      <button
        type="button"
        className={btn}
        style={{ background: "#FF5F57" }}
        title={closeToTray ? "Скрыть в трей" : "Закрыть"}
        aria-label={closeToTray ? "Скрыть в трей" : "Закрыть"}
        onClick={onClose}
      >
        <svg className={glyph} width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
          <path
            d="M1.6 1.6 6.4 6.4M6.4 1.6 1.6 6.4"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <button
        type="button"
        className={btn}
        style={{ background: "#FEBC2E" }}
        title={minimizeToTray ? "Свернуть в трей" : "Свернуть"}
        aria-label={minimizeToTray ? "Свернуть в трей" : "Свернуть"}
        onClick={onMinimize}
      >
        <svg className={glyph} width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
          <path d="M1.6 4h4.8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        className={btn}
        style={{ background: "#28C840" }}
        title={maximized ? "Оконный режим" : "Во весь экран"}
        aria-label={maximized ? "Оконный режим" : "Во весь экран"}
        onClick={onToggleMaximize}
      >
        <svg className={glyph} width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
          <path
            d="M2 3.6V2h1.6M6 4.4V6H4.4"
            stroke="currentColor"
            strokeWidth="1.15"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </button>
    </div>
  );
}

/* ---------- чекбокс ---------- */
export function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className="flex cursor-pointer items-center gap-2 py-1 text-[12px] select-none"
      style={{ color: "var(--dw-text)" }}
      onClick={() => onChange(!checked)}
    >
      <span
        className="flex h-[15px] w-[15px] items-center justify-center rounded border transition-colors"
        style={{
          background: checked ? "var(--dw-accent)" : "var(--dw-input)",
          borderColor: checked ? "var(--dw-accent)" : "var(--range-rest)",
        }}
      >
        {checked && <Check size={11} strokeWidth={3.5} color="#fff" />}
      </span>
      {label}
    </label>
  );
}

/* ---------- разделитель ---------- */
export function Divider() {
  return <div className="my-3 border-t" style={{ borderColor: "var(--dw-line)" }} />;
}

export const accentText: CSSProperties = { color: "var(--dw-accent-2)" };

/* ---------- сворачиваемый блок: прячет редкие настройки ---------- */
/* ---------- выбор эффекта появления и его скорости ---------- */
export function EffectPicker({
  effect,
  speed,
  onChange,
}: {
  effect: EffectId | undefined;
  speed: number | undefined;
  onChange: (patch: { effect?: EffectId; effectSpeed?: number }) => void;
}) {
  const current = effect ?? "fade";
  return (
    <div className="flex flex-col gap-2">
      <div>
        <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
          Эффект появления
        </label>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {EFFECTS.map((e) => {
            const on = current === e.id;
            return (
              <button
                key={e.id}
                onClick={() => onChange({ effect: e.id })}
                title={e.desc}
                className="cursor-pointer rounded-lg border px-2 py-1.5 text-left transition-all"
                style={{
                  background: on
                    ? "color-mix(in srgb, var(--dw-accent) 14%, transparent)"
                    : "var(--dw-input)",
                  borderColor: on ? "var(--dw-accent)" : "transparent",
                  color: on ? "var(--dw-accent-2)" : "var(--dw-text)",
                }}
              >
                <span className="block truncate text-[11.5px] font-semibold">{e.name}</span>
                <span className="block truncate text-[9.5px]" style={{ color: "var(--dw-dim)" }}>
                  {e.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {current !== "none" && (
        <div>
          <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
            Скорость эффекта
          </label>
          <Slider
            value={speed ?? 1}
            min={0.2}
            max={3}
            step={0.1}
            onChange={(v) => onChange({ effectSpeed: v })}
            format={(v) =>
              v < 0.8
                ? `быстро · ${v.toFixed(1)}x`
                : v > 1.5
                  ? `медленно · ${v.toFixed(1)}x`
                  : `${v.toFixed(1)}x`
            }
          />
        </div>
      )}
    </div>
  );
}

/* ---------- выбор шрифта (v1.2.4) ---------- */
export function FontPicker({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (id: FontId) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
        Шрифт
      </label>
      <div className="grid grid-cols-3 gap-1">
        {FONT_FAMILIES.map((f) => {
          const on = (value ?? "inter") === f.id;
          return (
            <button
              key={f.id}
              onClick={() => onChange(f.id)}
              title={f.desc}
              className="cursor-pointer rounded-lg border px-2 py-1.5 transition-all"
              style={{
                background: on ? "color-mix(in srgb, var(--dw-accent) 14%, transparent)" : "var(--dw-input)",
                borderColor: on ? "var(--dw-accent)" : "transparent",
                fontFamily: f.stack,
                color: on ? "var(--dw-accent-2)" : "var(--dw-text)",
              }}
            >
              <span className="block truncate text-[12px] font-semibold">Аа</span>
              <span className="block truncate text-[9.5px] opacity-70">{f.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- свой шрифт: ссылка Google Fonts (v2.4.0) ---------- */
export function CustomFontInput({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <div className="pt-1">
      <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
        Свой шрифт — ссылка Google Fonts
      </label>
      <TextInput
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://fonts.googleapis.com/css2?family=Montserrat&display=swap"
        spellCheck={false}
      />
      <p className="mt-1 text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
        Откройте fonts.google.com, выберите шрифт и скопируйте ссылку из правой панели. Примется первый шрифт
        из ссылки; без интернета останется обычный шрифт.
      </p>
    </div>
  );
}

/* ---------- интервал между сообщениями (v1.2.4) ---------- */
export function SpacingSlider({
  value,
  onChange,
  max = 20,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  max?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
        Интервал между сообщениями
      </label>
      <Slider
        value={value ?? 4}
        min={0}
        max={max}
        step={1}
        onChange={onChange}
        format={(v) => (v === 0 ? "вплотную" : `${v}px`)}
      />
    </div>
  );
}

export function Collapsible({
  title,
  hint,
  children,
  defaultOpen = false,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const focus = useSettingFocus();

  /* поиск в настройках просит показать пункт — раскрываем свой блок */
  useEffect(() => {
    if (focus?.box && focus.box === title) setOpen(true);
  }, [focus, title]);

  return (
    <div
      className="rounded-xl border"
      style={{ background: "var(--dw-panel)", borderColor: "var(--dw-line)" }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left"
      >
        <ChevronRight
          size={13}
          style={{
            color: "var(--dw-dim)",
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform .15s ease",
          }}
        />
        <span className="text-[12px] font-semibold" style={{ color: "var(--dw-text)" }}>
          {title}
        </span>
        {hint && !open && (
          <span className="ml-auto truncate text-[10.5px]" style={{ color: "var(--dw-dim)" }}>
            {hint}
          </span>
        )}
      </button>
      {open && (
        <div className="border-t px-3 py-2.5" style={{ borderColor: "var(--dw-line)" }}>
          {children}
        </div>
      )}
    </div>
  );
}
