/**
 * Глобальные горячие клавиши: читаемые подписи действий и оформление
 * комбинаций.
 *
 * Живут отдельно от панели настроек, потому что те же подписи нужны и в
 * интерфейсе: кнопка в шапке подписывает клавишу ровно так, как её показывает
 * раздел «Горячие клавиши», и подписи не расходятся после правок.
 */

/** действие хоткея → название и пояснение для настроек */
export interface HotkeyAction {
  id: string;
  name: string;
  hint: string;
}

/** Порядок разделов в панели настроек и в подсказках интерфейса. */
export const HOTKEY_ACTIONS: HotkeyAction[] = [
  { id: "toggleSpeech", name: "Озвучка вкл/выкл", hint: "глобально, из любого приложения" },
  { id: "pauseQueue", name: "Пауза очереди", hint: "останавливает текущее сообщение" },
  { id: "skipQueue", name: "Пропустить сообщение", hint: "следующее в очереди" },
  {
    id: "stopSpeech",
    name: "Остановить озвучку",
    hint: "мгновенно обрывает фразу, очередь на паузе (продолжить — клавишей «пауза»)",
  },
  { id: "clearQueue", name: "Очистить очередь", hint: "обрывает текущее и убирает все ожидающие фразы" },
  {
    id: "toggleFocus",
    name: "Режим «Только чат»",
    hint: "скрыть каналы, фильтры и строку ввода — одна лента на весь экран",
  },
  { id: "toggleOverlay", name: "Показать/скрыть оверлей", hint: "окно поверх игры" },
  {
    id: "toggleClickThrough",
    name: "Прозрачность оверлея",
    hint: "зафиксировать/разблокировать и переключить сквозной клик",
  },
  { id: "clearFeed", name: "Очистить ленту", hint: "без подтверждения" },
];

/** физический код → читаемая подпись: "Ctrl+Shift+KeyG" → "Ctrl + Shift + G" */
export function prettyCombo(combo: string): string {
  if (!combo) return "—";
  return combo
    .split("+")
    .map((part) => {
      if (/^Key.$/.test(part)) return part[3];
      if (/^Digit.$/.test(part)) return part[5];
      if (/^Numpad(\d)$/.test(part)) return `Num ${part[6]}`;
      const named: Record<string, string> = {
        Space: "Пробел",
        Enter: "Enter",
        Tab: "Tab",
        Escape: "Esc",
        ArrowUp: "↑",
        ArrowDown: "↓",
        ArrowLeft: "←",
        ArrowRight: "→",
        Backquote: "`",
        Minus: "−",
        Equal: "=",
        BracketLeft: "[",
        BracketRight: "]",
        Semicolon: ";",
        Quote: "'",
        Comma: ",",
        Period: ".",
        Slash: "/",
        Backslash: "\\",
      };
      return named[part] ?? part;
    })
    .join(" + ");
}

/** Название действия хоткея — для подсказок в интерфейсе (кнопка в шапке). */
export function hotkeyName(actionId: string): string {
  return HOTKEY_ACTIONS.find((a) => a.id === actionId)?.name ?? actionId;
}
