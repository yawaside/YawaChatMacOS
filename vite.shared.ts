import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type UserConfig } from "vite";
import { singleFile } from "./vite.singlefile.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Актуальная версия приложения из корневого файла VERSION.
 * Подставляется в бандл на этапе сборки как символ `__APP_VERSION__`,
 * чтобы интерфейс всегда показывал ту же версия, что уходит в релиз.
 */
const appVersion = readFileSync(path.resolve(__dirname, "VERSION"), "utf8").trim();

/**
 * Общая база продакшен-сборок интерфейса.
 *
 * Интерфейс — три самодостаточные single-file страницы: окно приложения,
 * оверлей и виджет OBS. Каждая собирается отдельно, чтобы окно приложения
 * парсило и компилировалось только свой код, а не общий бандл со всеми
 * тремя приложениями — это заметно сокращает время до первого кадра.
 */
export function buildConfig(entry: string): UserConfig {
  return defineConfig({
    plugins: [react(), tailwindcss(), singleFile()],
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    build: {
      // Три сборки делят одну папку dist: чистим её один раз перед
      // первой (scripts/clean-dist.mjs), а не перед каждой.
      emptyOutDir: false,
      rollupOptions: {
        input: path.resolve(__dirname, entry),
      },
    },
  });
}
