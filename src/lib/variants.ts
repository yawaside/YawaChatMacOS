import { PanelLeft, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Виды окна YawaChat. Их два, и они заменяют прежние «Команду», «Терминал» и
 * «Бродкаст»: у каждого своя раскладка и палитра.
 *
 * Вид меняет только окно — шапку, панель каналов, ленту и сводку. Оформление
 * самих сообщений, виджета OBS и оверлея настраивается отдельно и от вида не
 * зависит: темы ленты остаются ровно такими, как их выбрали.
 */
export type VariantId = "air" | "studio";

export interface AppVariant {
  id: VariantId;
  name: string;
  desc: string;
  icon: LucideIcon;
  /** палитра окна */
  vars: Record<string, string>;
}

function v(base: Record<string, string>, a1: string, a2: string): Record<string, string> {
  return { ...base, "--dw-accent": a1, "--dw-accent-2": a2 };
}

export const APP_VARIANTS: AppVariant[] = [
  {
    id: "air",
    name: "Воздух",
    desc: "Графит · светлые плашки · разделы слева · сводка эфира справа",
    icon: Sparkles,
    vars: v(
      {
        "--dw-bg": "#14161b",
        "--dw-panel": "#1b1e25",
        "--dw-panel2": "#22262f",
        "--dw-line": "rgba(255,255,255,0.10)",
        "--dw-text": "#f2f4f8",
        "--dw-dim": "#9aa2b2",
        "--dw-hover": "rgba(255,255,255,0.07)",
        "--dw-input": "rgba(255,255,255,0.09)",
        "--dw-scroll": "rgba(255,255,255,0.22)",
        "--range-rest": "rgba(255,255,255,0.18)",
      },
      "#7c9cff",
      "#a5b8ff",
    ),
  },
  {
    id: "studio",
    name: "Студия",
    desc: "Плотная раскладка · разделы иконками · лента во всю ширину",
    icon: PanelLeft,
    vars: v(
      {
        "--dw-bg": "#0b0d10",
        "--dw-panel": "#11141a",
        "--dw-panel2": "#171c23",
        "--dw-line": "rgba(255,255,255,0.07)",
        "--dw-text": "#e8ecf2",
        "--dw-dim": "#7d8794",
        "--dw-hover": "rgba(255,255,255,0.05)",
        "--dw-input": "rgba(255,255,255,0.06)",
        "--dw-scroll": "rgba(255,255,255,0.18)",
        "--range-rest": "rgba(255,255,255,0.12)",
      },
      "#b6f24a",
      "#d3ff8a",
    ),
  },
];

/** Прежние виды: сохранённый выбор переводим на ближайший новый. */
const LEGACY: Record<string, VariantId> = {
  command: "air",
  terminal: "air",
  broadcast: "studio",
};

export function getVariant(id: string): AppVariant {
  const migrated = LEGACY[id] ?? id;
  return APP_VARIANTS.find((x) => x.id === migrated) ?? APP_VARIANTS[0];
}
