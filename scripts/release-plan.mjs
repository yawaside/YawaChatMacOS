#!/usr/bin/env node
/**
 * Релиз возможен только для ещё не выпущенного VERSION с новым пользовательским
 * разделом в CHANGELOG. Тег НИКОГДА не «перескакиваем»: это превращало
 * обновления Dependabot и повторный запуск workflow в новые версии.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function releaseVersion(versionText, changelog, tagExists = false) {
  const version = versionText.trim();
  if (!/^\d+\.[0-9]\.[0-9]$/.test(version)) {
    throw new Error(`Некорректный VERSION: "${version}"`);
  }

  const sections = [...changelog.matchAll(/^## \[([^\]]+)\][ \t]*$/gm)];
  if (!sections.length || sections[0][1] !== version) {
    throw new Error(`Верхний раздел CHANGELOG должен быть [${version}] — иначе релиз не выпускаем`);
  }
  const notes = changelog.slice(sections[0].index + sections[0][0].length, sections[1]?.index).trim();
  if (!/^-[ \t]+\S/m.test(notes)) {
    throw new Error(`В разделе [${version}] нет описания изменений для пользователей`);
  }
  if (tagExists) {
    throw new Error(`Версия v${version} уже выпущена — нельзя создавать следующую версию автоматически`);
  }
  return version;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.env.GITHUB_ACTIONS && process.env.GITHUB_REF !== "refs/heads/main") {
    throw new Error("Выпускать приложение можно только из main");
  }
  const version = readFileSync("VERSION", "utf8").trim();
  // В workflow checkout имеет fetch-depth: 0; перед вызовом получаем все теги.
  const tagExists = execFileSync("git", ["tag", "--list", `v${version}`], { encoding: "utf8" }).trim() !== "";
  releaseVersion(version, readFileSync("CHANGELOG.md", "utf8"), tagExists);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  console.log(`Релиз v${version}: изменения описаны, тег свободен`);
}
