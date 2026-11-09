/**
 * Набор компонентов в духе macOS (System Settings) — порт src-mac/components/macos/controls.tsx.
 * Используется разделом-«панелями» вида «macOS». Акцент — из --accent,
 * который ставит корень окна (по умолчанию #0A84FF).
 */
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/* ---------------- macOS toggle ---------------- */

export function MacToggle({
  checked,
  onChange,
  small,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  small?: boolean;
}) {
  const w = small ? "h-[22px] w-9" : "h-[26px] w-11";
  const travel = small ? 14 : 18;
  const knob = small ? "h-[18px] w-[18px]" : "h-[22px] w-[22px]";
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative ${w} shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
        checked ? "bg-accent" : "bg-white/[0.16]"
      } shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)]`}
    >
      <span
        className={`absolute left-[2px] top-[2px] ${knob} rounded-full bg-white shadow-[0_2px_5px_rgba(0,0,0,0.35),0_0_1px_rgba(0,0,0,0.3)] transition-transform duration-200 ease-[cubic-bezier(0.34,1.4,0.44,1)]`}
        style={{ transform: `translateX(${checked ? travel : 0}px)` }}
      />
    </button>
  );
}

/* ---------------- macOS checkbox ---------------- */

export function MacCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex cursor-pointer items-center gap-2 text-left"
      role="checkbox"
      aria-checked={checked}
    >
      <span
        className={`grid h-[16px] w-[16px] shrink-0 place-items-center rounded-[5px] transition-colors ${
          checked
            ? "bg-accent"
            : "bg-white/[0.12] shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)] ring-1 ring-white/15"
        }`}
      >
        {checked && <Check size={11} strokeWidth={3.5} className="text-white" />}
      </span>
      {label && <span className="text-[12.5px] text-white/80">{label}</span>}
    </button>
  );
}

/* ---------------- macOS segmented control ---------------- */

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  id?: string;
}) {
  return (
    <div className="inline-flex rounded-lg bg-white/[0.08] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)]">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`relative cursor-pointer rounded-[7px] px-3 py-1 text-[12px] font-medium transition-colors ${
            value === opt.value
              ? "bg-white/[0.16] text-white shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
              : "text-white/55 hover:text-white/80"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- macOS slider ---------------- */

export function MacSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="group relative flex h-5 w-full items-center">
      <div className="relative h-[5px] w-full overflow-hidden rounded-full bg-white/[0.14]">
        <div className="bg-accent absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label="Громкость"
      />
      <div
        className="pointer-events-none absolute h-[17px] w-[17px] rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.4),0_0_1px_rgba(0,0,0,0.3)]"
        style={{ left: `calc(${pct}% - ${pct * 0.17}px)` }}
      />
    </div>
  );
}

/* ---------------- Плашка-панель в стиле System Settings ---------------- */

export function SettingsCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[14px] bg-white/[0.055] p-[1px] shadow-[0_1px_2px_rgba(0,0,0,0.25)] ring-1 ring-white/[0.07] ${className}`}
    >
      <div className="flex flex-col divide-y divide-white/[0.07] rounded-[13px]">{children}</div>
    </div>
  );
}

export function SettingsRow({
  title,
  subtitle,
  control,
  icon,
}: {
  title: string;
  subtitle?: string;
  control?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {icon && (
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-white/[0.08] text-white/80">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-white/90">{title}</div>
        {subtitle && <div className="mt-0.5 text-[11.5px] leading-snug text-white/45">{subtitle}</div>}
      </div>
      {control}
    </div>
  );
}

/* Небольшая «кнопка-таблетка» в стиле macOS */
export function MacButton({
  children,
  onClick,
  primary,
}: {
  children: ReactNode;
  onClick?: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-7 shrink-0 cursor-pointer rounded-md px-3 text-[12px] font-medium transition-all active:scale-[0.96] ${
        primary
          ? "bg-accent text-white shadow-[0_2px_8px_rgba(0,0,0,0.35)] hover:brightness-110"
          : "bg-white/[0.08] text-white/80 ring-1 ring-white/[0.12] hover:bg-white/[0.14]"
      }`}
    >
      {children}
    </button>
  );
}

/* ---------------- Шапка раздела (PanelHeader) ---------------- */

export function PanelHeader({
  title,
  subtitle,
  icon: Icon,
  tint,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  tint: string;
}) {
  return (
    <div className="flex h-[68px] shrink-0 items-center gap-3.5 border-b border-white/[0.06] px-6">
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] text-white shadow-[0_6px_16px_rgba(0,0,0,0.35),inset_0_1px_1px_rgba(255,255,255,0.3)]"
        style={{ background: `linear-gradient(160deg, ${tint}, ${tint}BB)` }}
      >
        <Icon size={19} strokeWidth={1.9} />
      </span>
      <div className="min-w-0">
        <h2 className="truncate text-[16px] font-bold text-white/95">{title}</h2>
        <p className="truncate text-[12px] text-white/45">{subtitle}</p>
      </div>
    </div>
  );
}

/* Общие классы полей (как в референсе) */
export const selectCls =
  "rounded-lg bg-white/[0.07] px-2.5 py-1.5 text-[12px] text-white/85 outline-none ring-1 ring-white/[0.1] focus:ring-2 ring-accent [&>option]:bg-[#232325]";
export const inputCls =
  "rounded-[10px] bg-white/[0.07] px-3 py-2 text-[12.5px] text-white/90 placeholder-white/30 outline-none ring-1 ring-white/[0.1] focus:ring-2 ring-accent";
