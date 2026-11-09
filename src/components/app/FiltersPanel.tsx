import { useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  X,
  Zap,
} from "lucide-react";
import type { TtsConfig } from "../../lib/types";
import { PlatformIcon } from "../../lib/platforms";
import { usePersisted } from "../../lib/persist";
import { DEFAULT_FILTER_BLOCKS, type FilterBlock, checkMessageFilters } from "../../lib/filters";
import { Box, Slider, TextInput, ToggleRow } from "./ui";

interface Props {
  tts: TtsConfig;
  patch: (p: Partial<TtsConfig>) => void;
  botAuth?: Record<string, string>;
}

export default function FiltersPanel({ tts, patch, botAuth }: Props) {
  const [filterBlocks, setFilterBlocks] = usePersisted<FilterBlock[]>(
    "filterBlocksConfig",
    DEFAULT_FILTER_BLOCKS,
  );
  const [ignoreAuthors, setIgnoreAuthors] = usePersisted<string[]>("ignoreAuthors", []);
  const [whiteAuthors, setWhiteAuthors] = usePersisted<string[]>("whiteAuthors", []);
  const [storedBotAuth] = usePersisted<Record<string, string>>("botAuth", {});

  // Текущая авторизация Twitch (из props или persisted)
  const currentBotAuth = botAuth ?? storedBotAuth;
  const isTwitchAuth = Boolean(currentBotAuth?.twitch?.trim());

  // Локальные состояния
  const [expandedBlockId, setExpandedBlockId] = useState<string | null>("twitch");
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [newWordInputs, setNewWordInputs] = useState<Record<string, string>>({});
  const [authorInput, setAuthorInput] = useState("");
  const [testText, setTestText] = useState("привет! зацени собака @стример заходи на spam.ru");
  const [testResult, setTestResult] = useState<null | {
    ok: boolean;
    reason: string;
    blockName?: string;
    word?: string;
    autoDeleteTwitch?: boolean;
  }>(null);

  /** Переключение статуса активности блока */
  const toggleBlock = (blockId: string) => {
    setFilterBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, enabled: !b.enabled } : b)));
  };

  /** Добавить своё слово в блок */
  const addWordToBlock = (blockId: string) => {
    const word = (newWordInputs[blockId] ?? "").trim();
    if (!word) return;

    setFilterBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        const exists =
          b.words.some((w) => w.toLowerCase() === word.toLowerCase()) ||
          b.customWords.some((w) => w.toLowerCase() === word.toLowerCase());
        if (exists) {
          // Если слово было в выключенных — возвращаем его
          const nextDisabled = (b.disabledWords ?? []).filter((w) => w.toLowerCase() !== word.toLowerCase());
          return { ...b, disabledWords: nextDisabled };
        }
        return {
          ...b,
          customWords: [...b.customWords, word],
        };
      }),
    );
    setNewWordInputs((p) => ({ ...p, [blockId]: "" }));
  };

  /** Удалить или отключить слово из блока */
  const removeWordFromBlock = (blockId: string, word: string) => {
    setFilterBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        // Если это пользовательское слово — удаляем полностью
        if (b.customWords.some((w) => w.toLowerCase() === word.toLowerCase())) {
          return {
            ...b,
            customWords: b.customWords.filter((w) => w.toLowerCase() !== word.toLowerCase()),
          };
        }
        // Если встроенное — заносим в disabledWords
        const disabled = new Set(b.disabledWords ?? []);
        disabled.add(word);
        return {
          ...b,
          disabledWords: Array.from(disabled),
        };
      }),
    );
  };

  /** Сброс слов блока к исходным значениям по умолчанию */
  const resetBlockToDefaults = (blockId: string) => {
    const defaultBlock = DEFAULT_FILTER_BLOCKS.find((b) => b.id === blockId);
    if (!defaultBlock) return;
    setFilterBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? {
              ...b,
              words: defaultBlock.words,
              customWords: [],
              disabledWords: [],
            }
          : b,
      ),
    );
  };

  /** Прогон тестового сообщения по активным правилам */
  const runTest = () => {
    const res = checkMessageFilters(testText, "twitch", filterBlocks, undefined, whiteAuthors, ignoreAuthors);

    if (res.matched) {
      setTestResult({
        ok: false,
        reason: res.reason ?? "Сообщение заблокировано правилом",
        blockName: res.blockName,
        word: res.word,
        autoDeleteTwitch: (res.isTwitchBanword || res.blockId === "twitch") && isTwitchAuth,
      });
    } else {
      setTestResult({
        ok: true,
        reason: "Сообщение полностью чистое и пройдёт все фильтры",
      });
    }
  };

  const getBlockIcon = (block: FilterBlock) => {
    if (block.id === "twitch") return <PlatformIcon id="twitch" size={15} />;
    if (block.id === "trolling") return <ShieldAlert size={15} className="text-amber-400" />;
    if (block.id === "youtube") return <PlatformIcon id="youtube" size={15} />;
    if (block.id === "kick") return <PlatformIcon id="kick" size={15} />;
    if (block.id === "vkplay") return <PlatformIcon id="vkplay" size={15} />;
    if (block.id === "tiktok") return <PlatformIcon id="tiktok" size={15} />;
    return <ShieldCheck size={15} style={{ color: "var(--dw-accent)" }} />;
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3.5 overflow-y-auto pr-1">
      {/* Верхний баннер статуса автомодерации Twitch */}
      <div
        className="flex items-center gap-3 rounded-xl border p-2.5 transition-all"
        style={{
          borderColor: isTwitchAuth ? "rgba(34, 197, 94, 0.3)" : "rgba(245, 158, 11, 0.3)",
          background: isTwitchAuth
            ? "linear-gradient(135deg, rgba(34, 197, 94, 0.08), var(--dw-panel2))"
            : "linear-gradient(135deg, rgba(245, 158, 11, 0.06), var(--dw-panel2))",
        }}
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{
            background: isTwitchAuth ? "rgba(34, 197, 94, 0.15)" : "rgba(245, 158, 11, 0.15)",
            color: isTwitchAuth ? "#4ade80" : "#fbbf24",
          }}
        >
          <Bot size={15} />
        </span>
        <div className="min-w-0 flex-1 text-[11.5px] leading-snug">
          {isTwitchAuth ? (
            <p style={{ color: "var(--dw-text)" }}>
              <span className="font-semibold text-emerald-400">Автомодерация Twitch активна:</span> аккаунт{" "}
              <span className="font-semibold text-white">@{currentBotAuth.twitch}</span> подключён. Сообщения
              с запрещёнными словами ToS удаляются из чата Twitch автоматически.
            </p>
          ) : (
            <p style={{ color: "var(--dw-dim)" }}>
              <span className="font-semibold text-amber-400">Twitch-бот не авторизован:</span> чтобы сообщения
              с запретками удалялись на самом Twitch автоматически, выполните вход во вкладке «Чат-бот». В
              ленте YawaChat и озвучке фильтрация работает в любом случае.
            </p>
          )}
        </div>
      </div>

      {/* Интерактивные блоки площадок и правил */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between px-0.5">
          <p className="text-[11px] font-bold tracking-[0.12em] uppercase" style={{ color: "var(--dw-dim)" }}>
            Интерактивные правила площадок
          </p>
          <span className="text-[11px]" style={{ color: "var(--dw-dim)" }}>
            Активно: {filterBlocks.filter((b) => b.enabled).length} из {filterBlocks.length}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          {filterBlocks.map((block) => {
            const isHovered = hoveredBlockId === block.id;
            const isExpanded = expandedBlockId === block.id;
            const activeWords = [...block.words, ...block.customWords].filter(
              (w) => !(block.disabledWords ?? []).includes(w),
            );
            const query = (searchQueries[block.id] ?? "").toLowerCase().trim();
            const filteredWords = query
              ? activeWords.filter((w) => w.toLowerCase().includes(query))
              : activeWords;

            return (
              <div
                key={block.id}
                onMouseEnter={() => setHoveredBlockId(block.id)}
                onMouseLeave={() => setHoveredBlockId(null)}
                className="overflow-hidden rounded-xl border transition-all duration-200"
                style={{
                  borderColor: block.enabled ? "#22c55e" : isHovered ? "var(--dw-accent)" : "var(--dw-line)",
                  background: block.enabled
                    ? "linear-gradient(135deg, rgba(34, 197, 94, 0.12) 0%, var(--dw-panel2) 65%)"
                    : "var(--dw-panel2)",
                  boxShadow: block.enabled
                    ? "0 0 16px rgba(34, 197, 94, 0.22), inset 0 0 10px rgba(34, 197, 94, 0.05)"
                    : "none",
                }}
              >
                {/* Шапка блока — интерактивная строка управления */}
                <div className="flex items-center gap-3 p-3">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      background: block.enabled ? "rgba(34, 197, 94, 0.2)" : "var(--dw-input)",
                    }}
                  >
                    {getBlockIcon(block)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-[13px] font-bold" style={{ color: "var(--dw-text)" }}>
                        {block.name}
                      </h4>
                      {block.enabled ? (
                        <span
                          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-emerald-400"
                          style={{ background: "rgba(34, 197, 94, 0.18)" }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Активно · {activeWords.length} правил
                        </span>
                      ) : (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ background: "var(--dw-input)", color: "var(--dw-dim)" }}
                        >
                          Не активно
                        </span>
                      )}
                    </div>
                    <p
                      className="mt-0.5 text-[11px] leading-snug line-clamp-1"
                      style={{ color: "var(--dw-dim)" }}
                    >
                      {block.desc}
                    </p>
                  </div>

                  {/* Интерактивная кнопка: При наведении Применить / Отменить */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleBlock(block.id);
                      }}
                      className="cursor-pointer rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition-all hover:scale-105"
                      style={{
                        background: block.enabled
                          ? isHovered
                            ? "rgba(239, 68, 68, 0.15)"
                            : "rgba(34, 197, 94, 0.2)"
                          : "rgba(34, 197, 94, 0.15)",
                        color: block.enabled ? (isHovered ? "#f87171" : "#4ade80") : "#4ade80",
                        border: block.enabled
                          ? isHovered
                            ? "1px solid rgba(239, 68, 68, 0.3)"
                            : "1px solid rgba(34, 197, 94, 0.4)"
                          : "1px solid rgba(34, 197, 94, 0.4)",
                      }}
                      title={
                        block.enabled
                          ? "Отменить действие правил этого блока"
                          : "Применить правила этого блока"
                      }
                    >
                      {block.enabled ? (isHovered ? "Отменить" : "Включено") : "Применить"}
                    </button>

                    <button
                      onClick={() => setExpandedBlockId(isExpanded ? null : block.id)}
                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-[var(--dw-hover)]"
                      style={{ color: "var(--dw-dim)" }}
                      title={isExpanded ? "Свернуть список слов" : "Показать слова блока"}
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {/* Развёрнутый список правил / банвордов */}
                {isExpanded && (
                  <div
                    className="border-t p-3 transition-all"
                    style={{
                      borderColor: block.enabled ? "rgba(34, 197, 94, 0.2)" : "var(--dw-line)",
                      background: "rgba(0, 0, 0, 0.2)",
                    }}
                  >
                    {/* Строка поиска и добавления нового слова */}
                    <div className="mb-2.5 flex flex-wrap items-center gap-2">
                      <div className="relative min-w-[160px] flex-1">
                        <Search
                          size={12}
                          className="absolute top-1/2 left-2.5 -translate-y-1/2"
                          style={{ color: "var(--dw-dim)" }}
                        />
                        <TextInput
                          value={searchQueries[block.id] ?? ""}
                          onChange={(e) => setSearchQueries((p) => ({ ...p, [block.id]: e.target.value }))}
                          placeholder="Поиск по словам блока…"
                          style={{ paddingLeft: 28 }}
                        />
                      </div>

                      <div className="flex flex-1 items-center gap-1.5">
                        <TextInput
                          value={newWordInputs[block.id] ?? ""}
                          onChange={(e) => setNewWordInputs((p) => ({ ...p, [block.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addWordToBlock(block.id);
                            }
                          }}
                          placeholder="Добавить своё слово…"
                        />
                        <button
                          onClick={() => addWordToBlock(block.id)}
                          className="flex h-[32px] cursor-pointer items-center gap-1 rounded-lg px-2.5 text-[11.5px] font-semibold text-[var(--dw-accent-ink)] transition-all hover:brightness-110"
                          style={{ background: "var(--dw-accent)" }}
                        >
                          <Plus size={13} /> Добавить
                        </button>
                        <button
                          onClick={() => resetBlockToDefaults(block.id)}
                          title="Сбросить к исходным банвордам"
                          className="flex h-[32px] w-[32px] cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-[var(--dw-hover)]"
                          style={{ color: "var(--dw-dim)", border: "1px solid var(--dw-line)" }}
                        >
                          <RotateCcw size={12} />
                        </button>
                      </div>
                    </div>

                    {/* Чипы слов */}
                    <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto pr-1">
                      {filteredWords.length === 0 ? (
                        <p className="py-2 text-[11px]" style={{ color: "var(--dw-dim)" }}>
                          {query ? "Ничего не найдено по запросу" : "Список пуст"}
                        </p>
                      ) : (
                        filteredWords.map((word) => {
                          const isCustom = block.customWords.includes(word);
                          return (
                            <span
                              key={word}
                              className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-mono transition-colors"
                              style={{
                                background: isCustom ? "rgba(139, 92, 246, 0.15)" : "var(--dw-input)",
                                color: isCustom ? "var(--dw-accent-2)" : "var(--dw-text)",
                                border: isCustom
                                  ? "1px solid rgba(139, 92, 246, 0.3)"
                                  : "1px solid var(--dw-line)",
                              }}
                            >
                              <span>{word}</span>
                              <button
                                onClick={() => removeWordFromBlock(block.id, word)}
                                className="cursor-pointer text-[var(--dw-dim)] opacity-70 transition-opacity hover:opacity-100 hover:text-red-400"
                                title="Исключить слово из фильтра"
                              >
                                <X size={11} />
                              </button>
                            </span>
                          );
                        })
                      )}
                    </div>

                    {/* Подсказка внизу блока */}
                    {block.id === "twitch" && (
                      <p className="mt-2 text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
                        ✦ Запрещённые слова согласно Hateful Conduct & Harassment ToS. При активной
                        авторизации бота сообщения с этими словами удаляются на Twitch мгновенно без ручных
                        действий.
                      </p>
                    )}
                    {block.id === "trolling" && (
                      <p className="mt-2 text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
                        ✦ Защита от тильта и спама: фильтрует провокации, слова-раздражители и спам
                        упоминаниями.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Интерактивная проверка фильтров */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Box
          title="Интерактивная проверка фильтров"
          icon={<FlaskConical size={14} style={{ color: "var(--dw-accent-2)" }} />}
          className="xl:col-span-2"
          hint="проверить слово или фразу"
        >
          <div className="flex gap-2">
            <TextInput
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runTest();
              }}
              placeholder="Введите тестовое сообщение для проверки фильтрации…"
            />
            <button
              onClick={runTest}
              className="shrink-0 cursor-pointer rounded-lg px-4 text-[12px] font-bold text-[var(--dw-accent-ink)] transition-all hover:brightness-110"
              style={{ background: "var(--dw-accent)" }}
            >
              Проверить
            </button>
          </div>

          {testResult && (
            <div
              className="pop-anim mt-2.5 rounded-xl border p-3 text-[12px]"
              style={{
                borderColor: testResult.ok ? "rgba(34, 197, 94, 0.4)" : "rgba(248, 113, 113, 0.4)",
                background: testResult.ok ? "rgba(34, 197, 94, 0.08)" : "rgba(248, 113, 113, 0.08)",
                color: testResult.ok ? "#4ade80" : "#f87171",
              }}
            >
              <div className="flex items-center gap-1.5 font-bold">
                {testResult.ok ? <Check size={14} /> : <AlertTriangle size={14} />}
                <span>
                  {testResult.ok ? "Тест успешно пройден" : "Фильтр сработал: сообщение заблокировано"}
                </span>
              </div>
              <p className="mt-1 text-[11.5px] text-[var(--dw-text)]">{testResult.reason}</p>
              {!testResult.ok && testResult.blockName && (
                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  <span
                    className="rounded px-2 py-0.5"
                    style={{ background: "var(--dw-input)", color: "var(--dw-dim)" }}
                  >
                    Блок: <strong className="text-white">{testResult.blockName}</strong>
                  </span>
                  {testResult.word && (
                    <span
                      className="rounded px-2 py-0.5"
                      style={{ background: "var(--dw-input)", color: "var(--dw-dim)" }}
                    >
                      Слово-триггер: <strong className="text-red-400">«{testResult.word}»</strong>
                    </span>
                  )}
                  {testResult.autoDeleteTwitch && (
                    <span
                      className="rounded px-2 py-0.5 font-semibold text-emerald-400"
                      style={{ background: "rgba(34, 197, 94, 0.15)" }}
                    >
                      ✓ Будет автоматически удалено из чата Twitch
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </Box>

        {/* Белый и чёрный списки авторов */}
        <Box
          title="Белый список авторов (исключения)"
          icon={<UserCheck size={14} style={{ color: "var(--dw-dim)" }} />}
          hint={`авторов: ${whiteAuthors.length}`}
        >
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const a = authorInput.trim().replace(/^@/, "").toLowerCase();
              if (!a) return;
              setWhiteAuthors((p) => [...new Set([...p, a])]);
              setAuthorInput("");
            }}
          >
            <TextInput
              value={authorInput}
              onChange={(e) => setAuthorInput(e.target.value)}
              placeholder="никнейм автора…"
            />
            <button
              type="submit"
              className="cursor-pointer rounded-lg px-3 text-[var(--dw-accent-ink)] transition-all hover:brightness-110"
              style={{ background: "var(--dw-accent)" }}
            >
              <Plus size={14} />
            </button>
          </form>

          <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto pt-2">
            {whiteAuthors.length === 0 && (
              <p className="py-1 text-[11px]" style={{ color: "var(--dw-dim)" }}>
                Сообщения авторов из белого списка пропускаются без блокировки.
              </p>
            )}
            {whiteAuthors.map((a) => (
              <span
                key={a}
                className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px]"
                style={{ background: "rgba(74, 222, 128, 0.12)", color: "#4ade80" }}
              >
                @{a}
                <button
                  className="cursor-pointer hover:text-white"
                  onClick={() => setWhiteAuthors((p) => p.filter((x) => x !== a))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </Box>

        {/* Чёрный список авторов */}
        <Box
          title="Чёрный список (игнор)"
          icon={<UserX size={14} style={{ color: "var(--dw-dim)" }} />}
          hint={`авторов: ${ignoreAuthors.length}`}
        >
          <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto pt-1">
            {ignoreAuthors.length === 0 && (
              <p className="py-1 text-[11px]" style={{ color: "var(--dw-dim)" }}>
                Список пуст. Добавлять авторов в игнор можно прямо из контекстного меню в чате.
              </p>
            )}
            {ignoreAuthors.map((a) => (
              <span
                key={a}
                className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px]"
                style={{ background: "rgba(248, 113, 113, 0.12)", color: "#f87171" }}
              >
                @{a}
                <button
                  className="cursor-pointer hover:text-white"
                  onClick={() => setIgnoreAuthors((p) => p.filter((x) => x !== a))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </Box>

        {/* Дополнительные параметры обработки текста */}
        <Box
          title="Параметры нормализации текста"
          icon={<Zap size={14} style={{ color: "var(--dw-dim)" }} />}
          className="xl:col-span-2"
          hint={
            [
              tts.skipLinks && "ссылки",
              tts.skipCommands && "команды",
              tts.stripEmoji && "смайлы",
              tts.squashRepeats && "повторы",
            ]
              .filter(Boolean)
              .join(" · ") || "без фильтров"
          }
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ToggleRow
              label="Ссылки заменять на «ссылка»"
              checked={tts.skipLinks}
              onChange={(v) => patch({ skipLinks: v })}
            />
            <ToggleRow
              label="Пропускать команды (!...)"
              checked={tts.skipCommands}
              onChange={(v) => patch({ skipCommands: v })}
            />
            <ToggleRow
              label="Убирать смайлы и эмодзи"
              checked={tts.stripEmoji}
              onChange={(v) => patch({ stripEmoji: v })}
            />
            <ToggleRow
              label="Сжимать повторы букв («аааа» → «аа»)"
              checked={tts.squashRepeats}
              onChange={(v) => patch({ squashRepeats: v })}
            />
          </div>
          <div className="pt-2">
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Порог ЗАГЛАВНЫХ букв (капс)
            </label>
            <Slider
              value={tts.capsLimit}
              min={20}
              max={100}
              step={5}
              onChange={(v) => patch({ capsLimit: v })}
              format={(v) => `${v}%`}
            />
          </div>
        </Box>
      </div>
    </div>
  );
}
