import { resolveStyleId } from "../lib/presets";
import type { Style } from "../lib/presets";

/**
 * Плавающая строка переключения стилей — видна ТОЛЬКО в предпросмотре
 * страницы в обычном браузере (виджет и оверлей вне приложения).
 * Внутри OBS и в окне приложения её нет: там стиль выбирается в настройках
 * и приходит по SSE/мосту.
 */
export default function StylePreviewBar<T extends { styleId?: string }>({
  title,
  styles,
  activeId,
  onApply,
}: {
  title: string;
  styles: Style<T>[];
  activeId?: string;
  onApply: (patch: Partial<T>) => void;
}) {
  return (
    <div
      className="fixed top-2 left-1/2 z-50 flex max-w-[96%] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-full px-3 py-1.5"
      style={{
        background: "rgba(10, 10, 18, 0.88)",
        border: "1px solid rgba(255,255,255,0.16)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
      }}
    >
      <span
        className="pr-1 text-[10px] font-bold tracking-wider uppercase"
        style={{ color: "rgba(255,255,255,0.55)" }}
      >
        {title}
      </span>
      {styles.map((s) => {
        const on = resolveStyleId(activeId) === s.id;
        return (
          <button
            key={s.id}
            onClick={() => onApply(s.patch)}
            title={s.desc}
            className="cursor-pointer rounded-full px-2 py-0.5 text-[10.5px] font-semibold transition-colors"
            style={{
              background: on ? "#8b5cf6" : "rgba(255,255,255,0.09)",
              color: on ? "#fff" : "rgba(255,255,255,0.78)",
            }}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}
