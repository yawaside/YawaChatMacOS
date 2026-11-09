// Конфигурация ESLint (flat config, ESLint 10).
//
// Область проверки — TypeScript/JavaScript рендерера, скрипты сборки и
// конфигурационные файлы. C#-хост (webview2/) проверяется компилятором и CI,
// а не линтером.
//
// Правила подобраны так, чтобы ловить настоящие ошибки, а не переписывать
// стиль: за оформление отвечает Prettier (см. .prettierrc.json), а
// eslint-config-prettier в конце отключает всё, что с ним конфликтует.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["dist/**", "**/node_modules/**", "webview2/**", "scripts/obfuscate.ps1", "release-notes.md"],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  /* Интерфейс приложения: браузерное окружение + правила React-хуков.
     Из набора react-hooks взяты только две проверенные временем правила —
     остальные (из компилятора React) на существующем коде дают шум и
     требуют отдельного решения. */
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      // нарушение порядка хуков — реальная причина падений интерфейса
      "react-hooks/rules-of-hooks": "error",
      // пропущенные зависимости useEffect/useMemo: предупреждение, потому что
      // в проекте есть осознанные отключения (см. src/lib/persist.ts)
      "react-hooks/exhaustive-deps": "warn",
      // JSON-протокол хоста не типизирован, поэтому any в мосту осознанный
      "@typescript-eslint/no-explicit-any": "warn",
      // пустые catch встречаются как осознанное «noop» — не ошибка
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },

  /* Скрипты сборки и конфиги: окружение Node. */
  {
    files: ["scripts/**/*.mjs", "*.config.ts", "*.config.mjs", "eslint.config.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },

  /* Мост TikTok LIVE: отдельный пакет на CommonJS. */
  {
    files: ["tiktok-bridge/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      // мост пишет в stdout протоколом JSON — console здесь штатный инструмент
      "no-console": "off",
      // мост — пакет на CommonJS: он запускается встроенным Node.js и не
      // собирается бандлером, поэтому require() здесь штатный способ импорта
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  prettier,
);
