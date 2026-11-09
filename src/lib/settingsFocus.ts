import { useEffect, useState } from "react";

/**
 * Переход из поиска к конкретному пункту настроек.
 *
 * Панели настроек рендерятся по одной, поэтому «показать пункт X» нельзя
 * передать пропом: поиск живёт в оболочке, а блоки — внутри панелей.
 * Здесь общий канал: оболочка просит раскрыть блок, блоки на это
 * подписываются, а подсветку строки делает сама оболочка после отрисовки.
 */
export interface SettingFocus {
  /** заголовок блока, который нужно раскрыть */
  box?: string;
  /** название пункта, который нужно подсветить */
  label: string;
  /** растёт с каждым запросом: повторный поиск того же пункта срабатывает снова */
  token: number;
}

let current: SettingFocus | null = null;
let seq = 0;
const listeners = new Set<(f: SettingFocus | null) => void>();

/** Попросить настройки открыть блок и показать пункт */
export function requestSettingFocus(box: string | undefined, label: string) {
  const next: SettingFocus = { box, label, token: ++seq };
  current = next;
  listeners.forEach((fn) => fn(next));
}

/** Запрос отработан (блок раскрыт, строка подсвечена) — больше никого не трогаем */
export function clearSettingFocus() {
  if (!current) return;
  current = null;
  listeners.forEach((fn) => fn(null));
}

/** Последний запрос (мгновенный, без состояния) */
export function getSettingFocus(): SettingFocus | null {
  return current;
}

/** Подписка на запросы: блок сам раскрывается, если просили его */
export function useSettingFocus(): SettingFocus | null {
  const [focus, setFocus] = useState<SettingFocus | null>(current);
  useEffect(() => {
    listeners.add(setFocus);
    setFocus(current);
    return () => {
      listeners.delete(setFocus);
    };
  }, []);
  return focus;
}
