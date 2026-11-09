import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { releaseVersion } from "./release-plan.mjs";

const notes = `# Изменения

## [2.2.6]

### Каналы

- Каналы показывают причину ошибки.

## [2.2.3]

- Старые изменения.
`;

test("публикует только новую версию с пользовательским описанием", () => {
  assert.equal(releaseVersion("2.2.6\n", notes), "2.2.6");
});

test("зависимости без нового раздела не создают версию", () => {
  assert.throws(() => releaseVersion("2.2.6", notes.replace("## [2.2.6]", "## [2.2.3]")), /Верхний раздел/);
});

test("не выпускает пустой релиз и не поднимает занятую версию", () => {
  assert.throws(() => releaseVersion("2.2.6", "## [2.2.6]\n\n### Каналы\n"), /нет описания/);
  assert.throws(() => releaseVersion("2.2.6", notes, true), /уже выпущена/);
});

test("отклоняет неверный формат VERSION", () => {
  assert.throws(() => releaseVersion("2.2.10", notes), /Некорректный VERSION/);
});

test("слияние зависимостей без CHANGELOG не запускает релизную сборку", () => {
  const workflow = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
  assert.match(workflow, /push:\s*\n\s*branches: \[main\]\s*\n\s*paths: \[CHANGELOG\.md\]/);
  assert.match(workflow, /run: npm ci/);
  assert.doesNotMatch(workflow, /while \(git tag -l/);
});
