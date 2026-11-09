import { useEffect } from "react";
import { isGoogleFontsUrl } from "./fonts";

/**
 * Подключение пользовательского шрифта (ссылка Google Fonts) из настроек.
 *
 * Ссылка вставляется в <head> как обычный stylesheet — НЕ блокирующим
 * @import в CSS: страница уже нарисована базовым шрифтом, и когда пользовательский
 * докачается, текст сам подменится (font-display: swap в ответе Google Fonts).
 * Работает одинаково в окне приложения, в виджете OBS и в оверлее — там же,
 * где нужен шрифт, так как браузерная страница виджета умеет грузить внешние
 * стили.
 */
export function useWebFont(url: string | undefined) {
  const href = url && isGoogleFontsUrl(url) ? url : null;

  useEffect(() => {
    if (!href) return;
    const id = "yawa-custom-font";
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
    return () => {
      const el = document.getElementById(id) as HTMLLinkElement | null;
      if (el && el.href === href) el.remove();
    };
  }, [href]);
}
