import { Check } from "lucide-react";
import { APP_VARIANTS } from "../../lib/variants";
import type { AppVariant } from "../../lib/variants";
import { Box } from "./ui";

/**
 * Раздел «Вид приложения»: выбор раскладки окна.
 *
 * Меняется только оправа окна — палитра и расположение панелей. Оформление
 * ленты, виджета OBS и оверлея настраивается в своих разделах и на выбор
 * здесь не реагирует.
 */
export default function AppViewPanel({
  variantId,
  onVariant,
  toast,
}: {
  variantId: string;
  onVariant: (id: string) => void;
  toast: (t: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Box
        title="Вид приложения"
        hint="Раскладка и палитра окна. Применяется сразу и запоминается."
        defaultOpen
      >
        <div className="grid grid-cols-2 gap-2">
          {APP_VARIANTS.map((v) => {
            const on = variantId === v.id;
            const I = v.icon;
            return (
              <button
                key={v.id}
                onClick={() => {
                  onVariant(v.id);
                  toast(`Вид приложения: ${v.name}`);
                }}
                title={v.desc}
                className="cursor-pointer rounded-xl p-2 text-left transition-all hover:brightness-110"
                style={{
                  background: on
                    ? "color-mix(in srgb, var(--dw-accent) 14%, transparent)"
                    : "var(--dw-input)",
                  boxShadow: on ? "inset 0 0 0 1px var(--dw-accent)" : "inset 0 0 0 1px transparent",
                }}
              >
                <Swatch v={v} />
                <div className="mt-1.5 flex items-center gap-1.5">
                  <I size={12} style={{ color: on ? "var(--dw-accent-2)" : "var(--dw-dim)" }} />
                  <span className="truncate text-[12px] font-semibold">{v.name}</span>
                  {on && (
                    <Check size={12} className="ml-auto shrink-0" style={{ color: "var(--dw-accent)" }} />
                  )}
                </div>
                <p className="mt-0.5 text-[10px] leading-snug" style={{ color: "var(--dw-dim)" }}>
                  {v.desc}
                </p>
              </button>
            );
          })}
        </div>
      </Box>

      <Box title="Что меняется" hint="Вид окна не трогает оформление сообщений">
        <ul className="flex flex-col gap-1 text-[11.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
          <li>
            <span style={{ color: "var(--dw-text)" }}>Меняется:</span> палитра окна, расположение разделов,
            каналов, ленты и сводки эфира.
          </li>
          <li>
            <span style={{ color: "var(--dw-text)" }}>Не меняется:</span> тема ленты, виджета OBS и оверлея —
            они настраиваются в разделах «Лента чата», «Виджет OBS» и «Оверлей поверх игры».
          </li>
        </ul>
      </Box>
    </div>
  );
}

/** Миниатюра окна: шапка, панель каналов, лента и сводка. */
function Swatch({ v }: { v: AppVariant }) {
  const air = v.id === "air";
  return (
    <div
      className="flex h-[56px] gap-1 p-1"
      style={{
        background: v.vars["--dw-bg"],
        borderRadius: air ? 10 : 5,
        boxShadow: `inset 0 0 0 1px ${v.vars["--dw-line"]}`,
      }}
    >
      <div
        className="flex w-[34%] flex-col justify-center gap-1"
        style={{
          background: v.vars["--dw-panel"],
          borderRadius: air ? 6 : 3,
          margin: air ? 2 : 0,
          padding: 3,
        }}
      >
        {[0.9, 0.55, 0.42].map((w, i) => (
          <span
            key={i}
            className="block h-[3px] rounded-full"
            style={{
              width: `${w * 100}%`,
              background: i === 0 ? v.vars["--dw-accent"] : v.vars["--dw-dim"],
            }}
          />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-1" style={{ padding: air ? 2 : 0 }}>
        <span
          className="block h-[4px] rounded-full"
          style={{ background: v.vars["--dw-accent"], width: "45%" }}
        />
        {[0.85, 0.7, 0.78, 0.5].map((w, i) => (
          <span
            key={i}
            className="block h-[3px] rounded-full"
            style={{ width: `${w * 100}%`, background: v.vars["--dw-text"], opacity: 0.35 }}
          />
        ))}
      </div>
      <div
        className="flex w-[22%] flex-col gap-1"
        style={{ background: v.vars["--dw-panel2"], borderRadius: air ? 6 : 3, padding: 3 }}
      >
        {[1, 0.8, 0.6].map((w, i) => (
          <span
            key={i}
            className="block h-[3px] rounded-full"
            style={{ width: `${w * 100}%`, background: v.vars["--dw-dim"] }}
          />
        ))}
      </div>
    </div>
  );
}
