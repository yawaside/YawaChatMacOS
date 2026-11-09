/**
 * Замеры запуска (задача 2.7): после первого кадра рендерер шлёт хосту
 * свои отметки времени — когда страница была готова и когда интерфейс
 * отрисовал первый кадр. Хост пишет их в журнал рядом со своими этапами,
 * поэтому в app.log видна полная цепочка: процесс → движок → навигация →
 * страница → первая отрисовка.
 */
export function reportStartup(app: string): void {
  // Двойной кадр: к моменту второго rAF React уже отрисовал первый кадр.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      try {
        const w = window as unknown as {
          chrome?: { webview?: { postMessage: (msg: unknown) => void } };
        };
        const wv = w.chrome?.webview;
        if (!wv) return; // браузерная витрина — хоста нет, отчёт не нужен
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        wv.postMessage({
          id: 0,
          method: "startup.report",
          args: [
            {
              app,
              firstRender: Math.round(performance.now()),
              domReady: nav ? Math.round(nav.domContentLoadedEventEnd) : 0,
            },
          ],
        });
      } catch {
        /* отчёт не обязателен для работы приложения */
      }
    }),
  );
}
