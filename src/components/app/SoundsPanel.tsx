import { useRef, useState } from "react";
import { Bell, Plus, MessageSquare, Music4 } from "lucide-react";
import type { EventSoundsConfig, TtsConfig } from "../../lib/types";
import { EVENT_SOUND_LABELS } from "../../lib/types";
import { CUSTOM_SOUND_MAX_BYTES, DONATE_SOUNDS, playDonateSound } from "../../lib/donateSounds";
import type { CustomSound } from "../../lib/donateSounds";
import { Box, Slider, ToggleRow } from "./ui";
import CustomSoundCard from "./SoundEditor";

interface Props {
  tts: TtsConfig;
  patchTts: (p: Partial<TtsConfig>) => void;
  events: EventSoundsConfig;
  patchEvents: (p: Partial<EventSoundsConfig>) => void;
  custom: CustomSound[];
  setCustom: (list: CustomSound[]) => void;
  toast: (t: string) => void;
}

/**
 * Единый раздел «Звуки уведомлений».
 * ЗДЕСЬ — ТОЛЬКО ЗВУКОВЫЕ сигналы (без озвучки голосом), и звучат они в окне
 * приложения. Озвучка чата настраивается в разделе «Озвучка»; озвучка
 * подписок/подарков/донатов убрана по запросу — эти события теперь только
 * сигналят выбранным звуком. Звуки наград за баллы уходят ещё и на трансляцию
 * — для них есть отдельный виджет в разделе «Награды за баллы».
 */
export default function SoundsPanel({ tts, patchTts, events, patchEvents, custom, setCustom, toast }: Props) {
  /* Настройки правил и файлов могли прийти испорченными (ручная правка
     settings.json, старая версия): панель не должна падать из-за этого. */
  const fileRef = useRef<HTMLInputElement>(null);
  /** только что добавленный звук сразу открывается в редакторе */
  const [freshId, setFreshId] = useState<string | null>(null);

  /** Выбор звука: встроенные и свои — единым списком плиток. */
  const SoundPicker = ({
    value,
    onPick,
    volume,
  }: {
    value: string;
    onPick: (id: string) => void;
    volume: number;
  }) => {
    const chip = (id: string, name: string, on: boolean, funny?: boolean) => (
      <button
        key={id}
        onClick={() => {
          onPick(id);
          playDonateSound(id, volume);
        }}
        title="Нажмите, чтобы выбрать и прослушать"
        className="cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all"
        style={{
          background: on ? "var(--dw-accent)" : "var(--dw-input)",
          color: on ? "#fff" : funny ? "var(--dw-accent-2)" : "var(--dw-dim)",
        }}
      >
        {funny && "🙂 "}
        {name}
      </button>
    );

    return (
      <div className="flex flex-wrap gap-1.5">
        {DONATE_SOUNDS.filter((s) => !s.funny).map((s) => chip(s.id, s.name, value === s.id))}
        {DONATE_SOUNDS.filter((s) => s.funny).map((s) => chip(s.id, s.name, value === s.id, true))}
        {custom.map((s) => chip(s.id, s.name, value === s.id))}
      </div>
    );
  };

  /** Загрузка своего звука с компьютера. */
  const addCustom = (file?: File) => {
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
        name: file.name.replace(/\.[^.]+$/, "").slice(0, 28) || "Свой звук",
        dataUrl,
        trimStart: 0,
        trimEnd: 0,
      };
      setCustom([...custom, item]);
      setFreshId(item.id);
      toast(`Звук «${item.name}» добавлен — выделите фрагмент и нажмите «Сохранить»`);
    };
    reader.onerror = () => toast("Не удалось прочитать файл");
    reader.readAsDataURL(file);
  };

  /** Обновление параметров обрезки конкретного своего звука. */
  const updateCustomTrim = (id: string, patch: Partial<CustomSound>) => {
    setCustom(custom.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  return (
    <div className="grid grid-cols-1 gap-3 overflow-y-auto xl:grid-cols-2">
      {/* Звук доната настраивается во вкладке «Донаты» — вместе с
          площадками и полосой донатов. */}

      {/* ---------- сообщения чата ---------- */}
      <Box
        title="Звук сообщения"
        icon={<MessageSquare size={14} style={{ color: "var(--dw-dim)" }} />}
        hint={tts.msgSoundEnabled ? "включено" : "выключено"}
      >
        <div className="flex flex-col">
          <ToggleRow
            label="Сигнал о новом сообщении"
            checked={tts.msgSoundEnabled ?? false}
            onChange={(v) => patchTts({ msgSoundEnabled: v })}
          />
          {(tts.msgSoundEnabled ?? false) && (
            <>
              <ToggleRow
                label="Только упоминания"
                hint="сигналить, если обратились к вам через @ник"
                checked={tts.msgSoundMentionsOnly ?? false}
                onChange={(v) => patchTts({ msgSoundMentionsOnly: v })}
              />
              <div className="border-t pt-2" style={{ borderColor: "var(--dw-line)" }}>
                <label className="mb-1.5 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
                  Звук
                </label>
                <SoundPicker
                  value={tts.msgSound ?? "pop"}
                  onPick={(id) => patchTts({ msgSound: id })}
                  volume={tts.msgSoundVolume ?? 0.5}
                />
              </div>
              <div className="border-t pt-2" style={{ borderColor: "var(--dw-line)" }}>
                <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
                  Громкость
                </label>
                <Slider
                  value={Math.round((tts.msgSoundVolume ?? 0.5) * 100)}
                  min={0}
                  max={100}
                  step={5}
                  onChange={(v) => patchTts({ msgSoundVolume: v / 100 })}
                  format={(v) => `${v}%`}
                />
              </div>
              <div className="border-t pt-2" style={{ borderColor: "var(--dw-line)" }}>
                <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
                  Пауза между сигналами
                </label>
                <Slider
                  value={tts.msgSoundCooldown ?? 3}
                  min={0}
                  max={30}
                  step={1}
                  onChange={(v) => patchTts({ msgSoundCooldown: v })}
                  format={(v) => (v === 0 ? "без паузы" : `${v} сек`)}
                />
              </div>
            </>
          )}
        </div>
      </Box>

      {/* ---------- события эфира (подписки, подарки и т.п. — ТОЛЬКО звук, без озвучки) ---------- */}
      <Box
        title="Звуки событий"
        icon={<Bell size={14} style={{ color: "var(--dw-dim)" }} />}
        className="xl:col-span-2"
        hint="у каждого события свой сигнал, озвучка голосом отключена"
      >
        <p className="-mt-1 mb-2 text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
          Подписки, подарки, фолловеры и рейды — только звуковой сигнал. Текст этих событий не проговаривается
          голосом. Звуки наград за баллы настраиваются отдельно — в разделе «Награды за баллы».
        </p>
        <div className="flex flex-col gap-1">
          {EVENT_SOUND_LABELS.map(({ id, name, hint }) => {
            const rule = events[id];
            return (
              <div
                key={id}
                className="border-b pb-1.5 last:border-b-0"
                style={{ borderColor: "var(--dw-line)" }}
              >
                <ToggleRow
                  label={name}
                  hint={hint}
                  checked={rule.enabled}
                  onChange={(v) =>
                    patchEvents({ [id]: { ...rule, enabled: v } } as Partial<EventSoundsConfig>)
                  }
                />
                {rule.enabled && (
                  <div className="flex flex-col gap-2 pt-1 pb-1">
                    <SoundPicker
                      value={rule.sound}
                      onPick={(sound) =>
                        patchEvents({ [id]: { ...rule, sound } } as Partial<EventSoundsConfig>)
                      }
                      volume={rule.volume}
                    />
                    <div className="max-w-[320px]">
                      <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
                        Громкость
                      </label>
                      <Slider
                        value={Math.round(rule.volume * 100)}
                        min={0}
                        max={100}
                        step={5}
                        onChange={(v) =>
                          patchEvents({ [id]: { ...rule, volume: v / 100 } } as Partial<EventSoundsConfig>)
                        }
                        format={(v) => `${v}%`}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Box>

      {/* ---------- свои звуки с редактором фрагмента ---------- */}
      <Box
        title="Свои звуки"
        icon={<Music4 size={14} style={{ color: "var(--dw-dim)" }} />}
        className="xl:col-span-2"
        hint={`${custom.length} добавлено`}
        actions={
          <button
            onClick={() => fileRef.current?.click()}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold text-[var(--dw-accent-ink)] transition-all hover:brightness-110"
            style={{ background: "var(--dw-accent)" }}
          >
            <Plus size={12} /> Добавить файл
          </button>
        }
      >
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            addCustom(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        {custom.length === 0 ? (
          <p className="py-1 text-[11.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
            Добавьте свой звук с компьютера — он появится в списке выбора у донатов, сообщений и событий.
            Подойдёт короткий файл до 2 МБ (MP3, WAV, OGG). Фрагмент выбирается на волне, как в обычном
            редакторе, и записывается кнопкой «Сохранить».
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {custom.map((s) => (
              <CustomSoundCard
                key={s.id}
                sound={s}
                defaultOpen={s.id === freshId}
                onSave={(patch) => updateCustomTrim(s.id, patch)}
                onDelete={() => {
                  setCustom(custom.filter((x) => x.id !== s.id));
                  toast(`Звук «${s.name}» удалён`);
                }}
                toast={toast}
              />
            ))}
          </div>
        )}
      </Box>
    </div>
  );
}
