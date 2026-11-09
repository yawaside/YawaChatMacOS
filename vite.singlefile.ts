import { version as viteVersion } from "vite";
import type { Plugin, Rolldown } from "vite";

const JS_FILE = /\.[mc]?js$/;
const CSS_FILE = /\.css$/;
const HTML_FILE = /\.html?$/;

/** Вставляет содержимое JS-файла в тег `<script>` на его месте. */
function inlineScript(html: string, fileName: string, code: string): string {
  const escaped = fileName.replaceAll(".", "\\.");
  const scriptTag = new RegExp(`<script([^>]*?) src="(?:[^"]*?/)?${escaped}"([^>]*)></script>`);
  // Маркер предзагрузки и закрывающий тег внутри кода не должны разорвать HTML.
  const body = code.replace(/"?__VITE_PRELOAD__"?/g, "void 0").replace(/<(\/script>|!--)/g, "\\x3C$1");
  return html.replace(
    scriptTag,
    (_match, before: string, after: string) => `<script${before}${after}>${body.trim()}</script>`,
  );
}

/** Вставляет содержимое CSS-файла в тег `<style>` на месте ссылки. */
function inlineCss(html: string, fileName: string, code: string): string {
  const escaped = fileName.replaceAll(".", "\\.");
  const linkTag = new RegExp(`<link([^>]*?) href="(?:[^"]*?/)?${escaped}"([^>]*)>`);
  const body = code.replace(`@charset "UTF-8";`, "");
  return html.replace(
    linkTag,
    (_match, before: string, after: string) => `<style${before}${after}>${body.trim()}</style>`,
  );
}

/**
 * Сборка интерфейса в один самодостаточный HTML-файл.
 *
 * Своя реализация вместо внешнего плагина: интерфейсу нужны три отдельные
 * страницы (окно приложения, оверлей, виджет), каждая из которых обязана
 * работать без папки с ресурсами. Внешний пакет тянул ради этого транзитную
 * зависимость, у которой нет исправленной версии, поэтому встраивание
 * ресурсов делается здесь и без лишних зависимостей.
 *
 * Поведение прежнее: та же подготовка конфигурации сборки, та же вставка
 * кода и стилей внутрь HTML и то же удаление уже встроенных файлов.
 */
export function singleFile(): Plugin {
  const viteMajor = Number.parseInt(viteVersion.split(".")[0] ?? "0", 10);

  // Vite 8 собирает Rolldown и отключает разбиение на куски своим именем
  // опции, прежние версии — через опцию Rollup.
  const output = viteMajor >= 8 ? { codeSplitting: false } : { inlineDynamicImports: true };

  return {
    name: "yawa:single-file",
    enforce: "post",

    // Без этих настроек Vite вынесет часть кода и картинок в отдельные файлы.
    config: () => ({
      base: "./",
      build: {
        assetsInlineLimit: () => true,
        chunkSizeWarningLimit: 100_000_000,
        cssCodeSplit: false,
        assetsDir: "",
        rollupOptions: { output: output as Rolldown.OutputOptions },
      },
    }),

    generateBundle(_options, bundle) {
      const html: string[] = [];
      const css: string[] = [];
      const js: string[] = [];

      for (const name of Object.keys(bundle)) {
        if (HTML_FILE.test(name)) html.push(name);
        else if (CSS_FILE.test(name)) css.push(name);
        else if (JS_FILE.test(name)) js.push(name);
      }

      const inlined: string[] = [];

      for (const htmlName of html) {
        const page = bundle[htmlName];
        if (!page || page.type !== "asset" || typeof page.source !== "string") continue;

        let source = page.source;

        for (const jsName of js) {
          const chunk = bundle[jsName];
          if (!chunk || chunk.type !== "chunk") continue;
          this.info(`Inlining: ${chunk.fileName}`);
          inlined.push(jsName);
          source = inlineScript(source, chunk.fileName, chunk.code);
        }

        for (const cssName of css) {
          const sheet = bundle[cssName];
          if (!sheet || sheet.type !== "asset") continue;
          this.info(`Inlining: ${sheet.fileName}`);
          inlined.push(cssName);
          source = inlineCss(source, sheet.fileName, String(sheet.source));
        }

        page.source = source;
      }

      for (const name of inlined) {
        delete bundle[name];
      }
    },
  };
}
