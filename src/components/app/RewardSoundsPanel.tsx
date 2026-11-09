import { useEffect, useRef, useState } from "react";
import {
  Check,
  Coins,
  Copy,
  ExternalLink,
  Globe2,
  Loader2,
  MonitorPlay,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import type { RewardPlatform, RewardSoundRule, RewardSoundsConfig } from "../../lib/types";
import { PlatformIcon, platformMeta } from "../../lib/platforms";
import { CUSTOM_SOUND_MAX_BYTES, playDonateSound } from "../../lib/donateSounds";
import type { CustomSound } from "../../lib/donateSounds";
import { copyText, openExternal, widgetInfo, widgetRewardSound } from "../../lib/bridge";
import type { CreateRewardResult } from "../../lib/bridge";
import {
  EMPTY_REWARD_DRAFT,
  REWARD_CREATE_PLATFORMS,
  REWARD_PRICE_LIMITS,
  prepareRewardDraft,
  rewardRuleVolume,
} from "../../lib/rewardSounds";
import type { RewardDraft } from "../../lib/rewardSounds";
import { Box, IconBtn, Slider, TextInput, ToggleRow } from "./ui";
import CustomSoundCard from "./SoundEditor";

interface Props {
  rewards: RewardSoundsConfig;
  /** создание награды на площадках: хост отправляет её в Twitch и VK */
  onCreateReward: (draft: RewardDraft) => Promise<CreateRewardResult>;
  patchRewards: (p: Partial<RewardSoundsConfig>) => void;
  rewardCustom: CustomSound[];
  setRewardCustom: (list: CustomSound[]) => void;
  onRefreshRewards: () => void;
  rewardsSyncing: boolean;
  toast: (t: string) => void;
}

export default function RewardSoundsPanel({
  rewards,
  onCreateReward,
  patchRewards,
  rewardCustom,
  setRewardCustom,
  onRefreshRewards,
  rewardsSyncing,
  toast,
}: Props) {
  const rules = Array.isArray(rewards.rules) ? rewards.rules : [];
  const rewardFiles = Array.isArray(rewardCustom) ? rewardCustom : [];
  const rewardFileRef = useRef<HTMLInputElement>(null);
  const [freshRewardId, setFreshRewardId] = useState<string | null>(null);

  /* Черновик новой награды: название, цена и площадки. Награду создаёт
     приложение в каналах, куда выполнен вход, — переходить в кабинеты
     площадок не нужно. */
  const [draft, setDraft] = useState<RewardDraft>(EMPTY_REWARD_DRAFT);
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<CreateRewardResult | null>(null);
  const draftCheck = prepareRewardDraft(draft);

  const toggleDraftPlatform = (platform: RewardPlatform) => {
    setDraft((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter((p) => p !== platform)
        : [...prev.platforms, platform],
    }));
  };

  const submitReward = async () => {
    const check = prepareRewardDraft(draft);
    if (!check.ok) {
      toast(check.error);
      return;
    }
    setCreating(true);
    setCreateResult(null);
    try {
      const result = await onCreateReward(draft);
      setCreateResult(result);
      if (result.created.length > 0) setDraft((prev) => ({ ...prev, title: "", description: "" }));
    } finally {
      setCreating(false);
    }
  };

  /* Отдельный источник звука наград для OBS. Ссылка постоянная: звуки
     доставляются живыми событиями, пересоздавать источник не нужно. */
  const [widgetUrl, setWidgetUrl] = useState("http://127.0.0.1:8085/widget?mode=rewards");
  const [copiedWidgetUrl, setCopiedWidgetUrl] = useState(false);
  useEffect(() => {
    void widgetInfo().then((info) => setWidgetUrl(`${info.url}?mode=rewards`));
  }, []);

  const ruleEntries = rules.map((rule, index) => ({ rule, index }));
  const ruleGroups: {
    id: string;
    platform?: RewardPlatform;
    label: string;
    entries: { rule: RewardSoundRule; index: number }[];
  }[] = [
    {
      id: "twitch",
      platform: "twitch" as const,
      label: "Награды Twitch",
      entries: ruleEntries.filter(({ rule }) => rule.platform === "twitch"),
    },
    {
      id: "vkplay",
      platform: "vkplay" as const,
      label: "Награды VK Видео Live",
      entries: ruleEntries.filter(({ rule }) => rule.platform === "vkplay"),
    },
    {
      id: "shared",
      label: "Общие и не привязанные к площадке",
      entries: ruleEntries.filter(({ rule }) => rule.platform !== "twitch" && rule.platform !== "vkplay"),
    },
  ].filter((group) => group.entries.length > 0);
  const twitchRules = rules.filter((rule) => rule.platform === "twitch").length;
  const vkRules = rules.filter((rule) => rule.platform === "vkplay").length;

  /** Загрузка файла в отдельную библиотеку звуков наград. */
  const addRewardCustom = (file?: File) => {
    if (!file) return;
    if (file.size > CUSTOM_SOUND_MAX_BYTES) {
      toast("Файл больше 2 МБ — выберите короткий звук");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      if (!dataUrl.startsWith("data:")) return;
      const item: CustomSound = {
        id: `custom:${Date.now()}`,
        name: file.name.replace(/\.[^.]+$/, "").slice(0, 28) || "Звук награды",
        dataUrl,
        trimStart: 0,
        trimEnd: 0,
      };
      setRewardCustom([...rewardFiles, item]);
      setFreshRewardId(item.id);
      toast(`Звук «${item.name}» добавлен в звуки наград — выделите фрагмент и нажмите «Сохранить»`);
    };
    reader.onerror = () => toast("Не удалось прочитать файл");
    reader.readAsDataURL(file);
  };

  /** Правка одной строки «награда → звук». */
  const patchRewardRule = (index: number, patch: Partial<RewardSoundRule>) => {
    const next = (Array.isArray(rewards.rules) ? rewards.rules : []).map((rule, i) =>
      i === index ? { ...rule, ...patch } : rule,
    );
    // Если пользователь назначил звук награде, а общий переключатель ещё
    // оставался выключенным с первого запуска — включаем его сразу.
    if (patch.sound && !rewards.enabled) {
      patchRewards({ enabled: true, rules: next });
    } else {
      patchRewards({ rules: next });
    }
  };

  const removeRewardRule = (index: number) => {
    patchRewards({ rules: rules.filter((_, i) => i !== index) });
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Отдельный источник звука наград для OBS: в окне приложения звук и
          так есть, а на трансляцию он уходит только через этот виджет. */}
      <Box
        title="Звук наград в OBS"
        icon={<MonitorPlay size={14} style={{ color: "var(--dw-dim)" }} />}
        hint="ссылка для Browser Source"
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <span className="block truncate font-mono text-[11px]" style={{ color: "var(--dw-accent-2)" }}>
              {widgetUrl}
            </span>
            <p className="mt-1 text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
              Отдельный виджет только под награды за баллы: добавьте ссылку в OBS как Browser Source и
              включите «Управлять аудио через OBS» — тогда награды слышны на трансляции, а не только в окне
              приложения. Ленты чата и других уведомлений в этом источнике нет.
            </p>
          </div>
          <button
            className="shrink-0 cursor-pointer"
            title="Скопировать ссылку"
            onClick={async () => {
              if (await copyText(widgetUrl)) {
                setCopiedWidgetUrl(true);
                window.setTimeout(() => setCopiedWidgetUrl(false), 1600);
                toast("Ссылка на виджет наград скопирована");
              }
            }}
            style={{ color: copiedWidgetUrl ? "#4ade80" : "var(--dw-dim)" }}
          >
            <Copy size={14} />
          </button>
          <button
            className="shrink-0 cursor-pointer"
            title="Открыть"
            onClick={() => openExternal(widgetUrl)}
            style={{ color: "var(--dw-dim)" }}
          >
            <ExternalLink size={14} />
          </button>
        </div>
      </Box>

      {/* Создание награды: название, цена и площадки. Награда отправляется
          в каналы площадок, куда выполнен вход, и сразу появляется в списке
          ниже — переход в кабинеты площадок не нужен. */}
      <Box
        title="Новая награда"
        icon={<Coins size={14} style={{ color: "var(--dw-dim)" }} />}
        className="xl:col-span-2"
        defaultOpen={false}
        hint={draft.platforms.length ? `${draft.platforms.length} площадк(и)` : "не выбрана площадка"}
      >
        <div className="flex flex-col gap-3">
          <p className="text-[11px] leading-snug" style={{ color: "var(--dw-dim)" }}>
            Награда создаётся в вашем канале: для Twitch нужен вход с доступом к наградам, для VK Видео Live —
            обычный вход в разделе «Чат-бот». Цена — в баллах канала, обе площадки принимают от 1 до 1 000
            000.
          </p>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px]">
            <div>
              <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
                Название награды
              </label>
              <TextInput
                value={draft.title}
                maxLength={45}
                placeholder="Например: сменить музыку"
                onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
                Цена, баллов
              </label>
              <TextInput
                type="number"
                min={REWARD_PRICE_LIMITS.twitch.min}
                max={REWARD_PRICE_LIMITS.twitch.max}
                value={String(draft.cost)}
                onChange={(e) => setDraft((prev) => ({ ...prev, cost: Number(e.target.value) }))}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[100, 500, 1000, 5000, 10000].map((cost) => (
              <button
                key={cost}
                onClick={() => setDraft((prev) => ({ ...prev, cost }))}
                className="cursor-pointer rounded-lg border px-2 py-0.5 text-[11px] transition-all hover:brightness-110"
                style={{
                  background:
                    draft.cost === cost
                      ? "color-mix(in srgb, var(--dw-accent) 18%, transparent)"
                      : "var(--dw-input)",
                  borderColor: draft.cost === cost ? "var(--dw-accent)" : "transparent",
                  color: draft.cost === cost ? "var(--dw-accent-2)" : "var(--dw-text)",
                }}
              >
                {cost.toLocaleString("ru-RU")}
              </button>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Площадки
            </label>
            <div className="flex flex-wrap gap-1.5">
              {REWARD_CREATE_PLATFORMS.map((platform) => {
                const meta = platformMeta(platform);
                const on = draft.platforms.includes(platform);
                return (
                  <button
                    key={platform}
                    onClick={() => toggleDraftPlatform(platform)}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition-all hover:brightness-110"
                    style={{
                      background: on
                        ? `color-mix(in srgb, ${meta.color} 18%, transparent)`
                        : "var(--dw-input)",
                      color: on ? meta.color : "var(--dw-dim)",
                      boxShadow: on ? `inset 0 0 0 1px ${meta.color}66` : "none",
                    }}
                  >
                    <PlatformIcon id={platform} size={12} />
                    {meta.name}
                    {on ? <Check size={11} /> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Описание для зрителя (необязательно)
            </label>
            <TextInput
              value={draft.description}
              maxLength={200}
              placeholder="Что произойдёт после активации"
              onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>

          <ToggleRow
            label="Требовать сообщение от зрителя"
            hint="без текста награда недоступна — удобно, когда нужен запрос"
            checked={draft.messageRequired}
            onChange={(v) => setDraft((prev) => ({ ...prev, messageRequired: v }))}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void submitReward()}
              disabled={creating || !draftCheck.ok}
              title={draftCheck.ok ? "Создать награду на выбранных площадках" : draftCheck.error}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-[var(--dw-accent-ink)] transition-all hover:brightness-110 disabled:cursor-default disabled:opacity-50"
              style={{ background: "var(--dw-accent)" }}
            >
              {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              {creating ? "Создаём…" : "Создать награду"}
            </button>
            {!draftCheck.ok ? (
              <span className="text-[11px]" style={{ color: "var(--dw-dim)" }}>
                {draftCheck.error}
              </span>
            ) : (
              <span className="text-[11px]" style={{ color: "var(--dw-dim)" }}>
                {draft.title.trim() || "без названия"} · {draft.cost.toLocaleString("ru-RU")} б.
              </span>
            )}
          </div>

          {createResult ? (
            <div className="flex flex-col gap-1">
              {createResult.created.map((reward) => (
                <p
                  key={`${reward.platform}-${reward.id}`}
                  className="flex items-center gap-1.5 text-[11px]"
                  style={{ color: "#4ade80" }}
                >
                  <Check size={12} />
                  Создана на {platformMeta(reward.platform).name} · {reward.title} ·{" "}
                  {reward.cost.toLocaleString("ru-RU")} б.
                </p>
              ))}
              {createResult.failed.map((fail) => (
                <p
                  key={`fail-${fail.platform}`}
                  className="flex items-start gap-1.5 text-[11px]"
                  style={{ color: "#fbbf24" }}
                >
                  <X size={12} className="mt-0.5 shrink-0" />
                  {fail.platform ? `${platformMeta(fail.platform).name}: ` : ""}
                  {fail.error}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </Box>

      {/* Настройки наград не сворачиваются: список наград и выбранные звуки
          должны быть видны сразу, без поиска скрытого блока. */}
      <Box
        title="Звуки наград за баллы канала"
        icon={<Coins size={14} style={{ color: "var(--dw-dim)" }} />}
        className="xl:col-span-2"
        collapsible={false}
        hint={rewards.enabled ? `Twitch: ${twitchRules} · VK: ${vkRules}` : "выключено"}
        actions={
          <>
            <button
              onClick={onRefreshRewards}
              disabled={rewardsSyncing}
              title="Загрузить награды Twitch и VK Видео Live"
              className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition-colors hover:bg-[var(--dw-hover)] disabled:cursor-default disabled:opacity-60"
              style={{ color: "var(--dw-accent-2)", border: "1px dashed var(--dw-line)" }}
            >
              {rewardsSyncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Обновить
            </button>
            <button
              onClick={() => rewardFileRef.current?.click()}
              className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11.5px] font-semibold text-[var(--dw-accent-ink)] transition-all hover:brightness-110"
              style={{ background: "var(--dw-accent)" }}
            >
              <Plus size={12} /> Свой звук
            </button>
          </>
        }
      >
        <input
          ref={rewardFileRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            addRewardCustom(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        <ToggleRow
          label="Сигнал при активации награды"
          hint="Общий выключатель для всех назначенных звуков наград."
          checked={rewards.enabled}
          onChange={(v) => patchRewards({ enabled: v })}
        />

        <p className="pb-1 text-[11px] leading-snug" style={{ color: "var(--dw-dim)" }}>
          Переключатель выше только включает или выключает уже настроенные звуки. Чтобы озвучить VK-награду,
          загрузите файл кнопкой «Свой звук» и выберите его в списке напротив этой награды. «— без звука —»
          оставляет её беззвучной: файл автоматически не назначается. Выбранный звук слышен в окне приложения;
          чтобы он звучал и на трансляции, добавьте в OBS виджет из блока «Звук наград в OBS» выше.
        </p>
        <p className="pb-1 text-[11px] leading-snug" style={{ color: "var(--dw-dim)" }}>
          После входа в Twitch или VK Видео Live награды можно загрузить кнопкой «Обновить» — они появятся в
          своих группах. Награды без привязки к площадке останутся общими; источник можно выбрать иконками в
          строке.
        </p>

        {/* Список наград и звуки показаны всегда: общий тумблер только
            включает и выключает сигналы, а не прячет настройки. */}
        <div className="flex flex-col gap-2 pt-1">
          {rewards.enabled && (
            <div className="max-w-[320px]">
              <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
                Пауза между сигналами
              </label>
              <Slider
                value={rewards.cooldown ?? 1}
                min={0}
                max={10}
                step={1}
                onChange={(v) => patchRewards({ cooldown: v })}
                format={(v) => (v === 0 ? "без паузы" : `${v} сек`)}
              />
            </div>
          )}

          <div className="flex flex-col gap-2 border-t pt-2" style={{ borderColor: "var(--dw-line)" }}>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold" style={{ color: "var(--dw-text)" }}>
                Свои звуки у наград
              </span>
            </div>

            {rules.length === 0 ? (
              <p className="py-1 text-[11px] leading-snug" style={{ color: "var(--dw-dim)" }}>
                Пока ни одной награды не настроено. Создайте её в блоке «Новая награда» выше или загрузите
                список Twitch и VK Видео Live кнопкой «Обновить».
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {ruleGroups.map((group) => (
                  <section key={group.id} className="flex flex-col gap-1.5">
                    <div
                      className="flex items-center gap-2 border-b pb-1"
                      style={{ borderColor: "var(--dw-line)" }}
                    >
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-md"
                        style={{
                          color: group.platform ? platformMeta(group.platform).color : "var(--dw-accent-2)",
                          background: group.platform
                            ? `color-mix(in srgb, ${platformMeta(group.platform).color} 16%, var(--dw-panel2))`
                            : "var(--dw-input)",
                        }}
                      >
                        {group.platform ? (
                          <PlatformIcon id={group.platform} size={13} />
                        ) : (
                          <Globe2 size={13} />
                        )}
                      </span>
                      <span className="text-[11px] font-semibold" style={{ color: "var(--dw-text)" }}>
                        {group.label}
                      </span>
                      <span className="text-[10px]" style={{ color: "var(--dw-dim)" }}>
                        {group.entries.length}
                      </span>
                    </div>

                    {group.entries.map(({ rule, index }) => (
                      <div
                        key={`${rule.platform ?? "shared"}-${rule.id ?? index}-${index}`}
                        className="flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5"
                        style={{ borderColor: "var(--dw-line)", background: "var(--dw-panel2)" }}
                      >
                        <RewardPlatformPicker
                          platform={rule.platform}
                          onChange={(platform) => patchRewardRule(index, { platform })}
                        />
                        <input
                          value={rule.title}
                          onChange={(e) => patchRewardRule(index, { title: e.target.value })}
                          placeholder="Название награды"
                          className="min-w-[150px] flex-1 rounded-lg border border-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--dw-accent)]"
                          style={{ background: "var(--dw-input)", color: "var(--dw-text)" }}
                        />
                        {rule.cost ? (
                          <span
                            className="w-[62px] shrink-0 text-right text-[11px]"
                            style={{ color: "var(--dw-dim)" }}
                            title={`Стоимость награды на площадке: ${rule.cost} баллов`}
                          >
                            {rule.cost} б.
                          </span>
                        ) : null}
                        <select
                          value={rule.sound}
                          onChange={(e) => patchRewardRule(index, { sound: e.target.value })}
                          title="Звук этой награды"
                          className="w-[170px] shrink-0 cursor-pointer rounded-lg border border-transparent px-2 py-1.5 text-[11.5px] outline-none"
                          style={{ background: "var(--dw-input)", color: "var(--dw-text)" }}
                        >
                          <option value="" style={{ color: "#000" }}>
                            — без звука —
                          </option>
                          {rewardFiles.map((sound) => (
                            <option key={sound.id} value={sound.id} style={{ color: "#000" }}>
                              {sound.name} · награда
                            </option>
                          ))}
                        </select>
                        <div className="w-[150px] shrink-0">
                          <Slider
                            value={Math.round(rewardRuleVolume(rule) * 100)}
                            min={0}
                            max={100}
                            step={5}
                            onChange={(v) => patchRewardRule(index, { volume: v / 100 })}
                            format={(v) => `${v}%`}
                          />
                        </div>
                        <IconBtn
                          icon={<Play size={13} />}
                          title="Прослушать эту награду"
                          onClick={() => {
                            if (!rule.sound) {
                              toast("Сначала выберите звук этой награды");
                              return;
                            }
                            const vol = rewardRuleVolume(rule);
                            playDonateSound(rule.sound, vol);
                            widgetRewardSound(rule.sound, vol);
                          }}
                        />
                        <IconBtn
                          icon={<Trash2 size={13} />}
                          title="Удалить правило"
                          danger
                          onClick={() => removeRewardRule(index)}
                        />
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t pt-2" style={{ borderColor: "var(--dw-line)" }}>
            <span className="text-[11px] font-semibold" style={{ color: "var(--dw-text)" }}>
              Файлы звуков наград
            </span>
            {rewardFiles.length === 0 ? (
              <p className="text-[11px] leading-snug" style={{ color: "var(--dw-dim)" }}>
                Свои файлы для наград — кнопкой «Свой звук» выше. Они доступны только здесь: в донатах,
                сообщениях и событиях эфира такие звуки не появляются.
              </p>
            ) : (
              rewardFiles.map((sound) => (
                <CustomSoundCard
                  key={sound.id}
                  sound={sound}
                  defaultOpen={sound.id === freshRewardId}
                  onPreview={(id, vol) => widgetRewardSound(id, vol)}
                  onSave={(patch) =>
                    setRewardCustom(
                      rewardFiles.map((item) => (item.id === sound.id ? { ...item, ...patch } : item)),
                    )
                  }
                  onDelete={() => {
                    setRewardCustom(rewardFiles.filter((item) => item.id !== sound.id));
                    // Ссылки на удалённый файл убираем, чтобы награда не молчала незаметно.
                    patchRewards({ rules: rules.filter((rule) => rule.sound !== sound.id) });
                    toast(`Звук «${sound.name}» удалён из звуков наград`);
                  }}
                  toast={toast}
                />
              ))
            )}
          </div>
        </div>
      </Box>
    </div>
  );
}

function RewardPlatformPicker({
  platform,
  onChange,
}: {
  platform?: RewardPlatform;
  onChange: (platform?: RewardPlatform) => void;
}) {
  const options: { id: "twitch" | "vkplay" | "shared"; label: string }[] = [
    { id: "twitch", label: platformMeta("twitch").name },
    { id: "vkplay", label: platformMeta("vkplay").name },
    { id: "shared", label: "Общая награда" },
  ];
  const selected = platform ?? "shared";

  return (
    <div
      role="group"
      aria-label="Площадка награды"
      className="flex shrink-0 items-center gap-0.5 rounded-lg p-0.5"
      style={{ background: "var(--dw-input)" }}
    >
      {options.map(({ id, label }) => {
        const active = selected === id;
        const color = id === "shared" ? "var(--dw-accent-2)" : platformMeta(id).color;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id === "shared" ? undefined : id)}
            title={label}
            aria-label={label}
            aria-pressed={active}
            className="flex h-6 w-7 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-[var(--dw-hover)]"
            style={{
              background: active ? "var(--dw-panel2)" : "transparent",
              color,
              boxShadow: active ? "0 1px 4px rgba(0,0,0,.2)" : "none",
            }}
          >
            {id === "shared" ? <Globe2 size={12} /> : <PlatformIcon id={id} size={13} />}
          </button>
        );
      })}
    </div>
  );
}
