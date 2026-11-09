import { useState } from "react";
import {
  Copy,
  HandCoins,
  KeyRound,
  Link2,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { Channel, DonateConfig, PlatformId } from "../../lib/types";
import { DONATION_TAB_PLATFORMS, isDonatePlatform } from "../../lib/types";
import { PlatformIcon, platformMeta } from "../../lib/platforms";
import { DONATE_SOUNDS, playDonateSound } from "../../lib/donateSounds";
import type { CustomSound } from "../../lib/donateSounds";
import type { MemeAlertsStatus } from "../../lib/bridge";
import { copyText } from "../../lib/bridge";
import type { DonateBarConfig, DonateBarState } from "../../lib/donatebar";
import { DONATE_BAR_STYLES, donateBarStyle, formatDonateAmount } from "../../lib/donatebar";
import { Box, Collapsible, IconBtn, Slider, TextInput, ToggleRow } from "./ui";
import DonateBar from "../DonateBar";
import { AddChannelModal } from "./ChannelsPanel";
import ChannelErrorDetails from "./ChannelErrorDetails";

/**
 * Вкладка «Донаты»: ВСЕ настройки донатных площадок (DonationAlerts,
 * DonatePay, MemeAlerts, Boosty), звук оповещения и отдельный OBS-виджет
 * «полоса донатов» — общая сумма денег по всем площадкам.
 */
export default function DonationsPanel({
  channels,
  onConnect,
  onDisconnect,
  onReconnect,
  onUpdateChannelToken,
  donate,
  patchDonate,
  customSounds,
  ma,
  onMaChange,
  maStatus,
  onMaAuthorize,
  onMaLogout,
  barCfg,
  patchBar,
  barState,
  onBarReset,
  widgetUrl,
  toast,
}: {
  channels: Channel[];
  onConnect: (
    platform: PlatformId,
    username: string,
    opts?: { token?: string; currency?: string; donateSound?: string },
  ) => void;
  onDisconnect: (id: string) => void;
  onReconnect: (id: string) => void;
  /** сохранить новый токен канала и переподключить его */
  onUpdateChannelToken: (id: string, token: string) => void;
  donate: DonateConfig;
  patchDonate: (p: Partial<DonateConfig>) => void;
  /** своя библиотека звуков — доступна в пикере звука доната */
  customSounds: CustomSound[];
  /* MemeAlerts: креды приложения и состояние входа по OAuth */
  ma: { clientId: string; clientSecret: string; redirectUri: string };
  onMaChange: (p: Partial<{ clientId: string; clientSecret: string; redirectUri: string }>) => void;
  maStatus: MemeAlertsStatus | null;
  onMaAuthorize: () => void;
  onMaLogout: () => void;
  /* полоса донатов */
  barCfg: DonateBarConfig;
  patchBar: (p: Partial<DonateBarConfig>) => void;
  /** живое состояние от хоста (итог накоплен на хосте); null — браузер */
  barState: DonateBarState | null;
  onBarReset: () => void;
  widgetUrl: string | null;
  toast: (t: string) => void;
}) {
  const [addOpen, setAddOpen] = useState<PlatformId | null>(null);
  const [tokenDrafts, setTokenDrafts] = useState<Record<string, string>>({});
  const [barCopied, setBarCopied] = useState(false);
  const [maAuthorizing, setMaAuthorizing] = useState(false);

  const authorize = async () => {
    setMaAuthorizing(true);
    try {
      await onMaAuthorize();
    } finally {
      setMaAuthorizing(false);
    }
  };

  /* Живой снимок от хоста. Без хоста (браузерный предпросмотр) показываем
     демо-сумму, чтобы стиль было видно на реальных цифрах, а не на нуле. */
  const barPreview: DonateBarState = {
    start: barState ? barCfg.start : 0,
    goal: barState ? barCfg.goal : barCfg.goal > barCfg.start ? barCfg.goal : 1000,
    currency: barCfg.currency,
    style: donateBarStyle(barCfg.style).id,
    title: barCfg.title,
    barOnly: barCfg.barOnly === true,
    totals:
      barState?.totals ?? (barCfg.currency === "$" ? { $: 250, "₽": 50 } : { [barCfg.currency]: 250, $: 50 }),
  };
  const barLink = widgetUrl ? `${widgetUrl}?mode=donatebar` : null;

  return (
    <div className="flex flex-col gap-2">
      {/* ================= площадки ================= */}
      <Box
        title="Площадки"
        icon={<HandCoins size={14} style={{ color: "var(--dw-dim)" }} />}
        hint={`подключено: ${channels.length}`}
      >
        <p className="mb-2 text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
          Откуда принимаются донаты. Денежные донаты всех площадок складываются в ленту, звук и полосу
          донатов.
        </p>
        <div className="flex flex-col gap-2">
          {DONATION_TAB_PLATFORMS.map((pid) => (
            <PlatformSection
              key={pid}
              pid={pid}
              channels={channels}
              tokenDrafts={tokenDrafts}
              setTokenDraft={(id, v) => setTokenDrafts((p) => ({ ...p, [id]: v }))}
              onDisconnect={onDisconnect}
              onReconnect={onReconnect}
              onUpdateChannelToken={onUpdateChannelToken}
              onAdd={() => setAddOpen(pid)}
              ma={pid === "memealerts" ? ma : undefined}
              onMaChange={onMaChange}
              maStatus={maStatus}
              maAuthorizing={maAuthorizing}
              onMaAuthorize={authorize}
              onMaLogout={onMaLogout}
              toast={toast}
            />
          ))}
        </div>
      </Box>

      {/* ================= звук доната (переехал из «Звуков уведомлений») ================= */}
      <Box
        title="Звук доната"
        icon={<HandCoins size={14} style={{ color: "var(--dw-dim)" }} />}
        hint={donate.soundEnabled ? "включено" : "выключено"}
      >
        <div className="flex flex-col">
          <ToggleRow
            label="Сигнал при донате"
            hint="каждый донат сопровождается звуковым сигналом"
            checked={donate.soundEnabled}
            onChange={(v) => patchDonate({ soundEnabled: v })}
          />
          {donate.soundEnabled && (
            <>
              <div className="border-t pt-2" style={{ borderColor: "var(--dw-line)" }}>
                <label className="mb-1.5 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
                  Звук по умолчанию
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[...DONATE_SOUNDS, ...customSounds].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        patchDonate({ sound: s.id });
                        playDonateSound(s.id, donate.soundVolume);
                      }}
                      title="Нажмите, чтобы выбрать и прослушать"
                      className="cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all"
                      style={{
                        background: donate.sound === s.id ? "var(--dw-accent)" : "var(--dw-input)",
                        color: donate.sound === s.id ? "#fff" : "var(--dw-dim)",
                      }}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="border-t pt-2" style={{ borderColor: "var(--dw-line)" }}>
                <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
                  Громкость
                </label>
                <Slider
                  value={Math.round(donate.soundVolume * 100)}
                  min={0}
                  max={100}
                  step={5}
                  onChange={(v) => patchDonate({ soundVolume: v / 100 })}
                  format={(v) => `${v}%`}
                />
              </div>
              <div className="border-t pt-2" style={{ borderColor: "var(--dw-line)" }}>
                <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
                  Не показывать донаты меньше
                </label>
                <Slider
                  value={donate.minShowAmount ?? 10}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(v) => patchDonate({ minShowAmount: v })}
                  format={(v) => (v === 0 ? "показывать все" : `${v} ₽`)}
                />
                <p className="mt-1 text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
                  Подписки и фолловеры приходят с DonationAlerts как донат на 0 ₽ — порог убирает их из ленты.
                  На сумму полосы донатов порог не влияет: реальные деньги считаются всегда.
                </p>
              </div>
            </>
          )}
        </div>
      </Box>

      {/* ================= полоса донатов ================= */}
      <Box
        title="Полоса донатов — виджет OBS"
        icon={<Link2 size={14} style={{ color: "var(--dw-dim)" }} />}
        hint={barCfg.barOnly ? "только полоса и процент" : "надпись, сумма, валюта"}
      >
        <div className="flex flex-col gap-2">
          <p className="text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
            Отдельный источник OBS: одна общая сумма денежных донатов всех площадок. Сумма сохраняется в
            приложении — закрытие его ничего не сбрасывает, только кнопка «Сбросить».
          </p>

          {/* живой предпросмотр выбранного стиля (с запасом по высоте) */}
          <div className="rounded-xl p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
            <DonateBar state={barPreview} />
          </div>

          <div>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Стиль полосы
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DONATE_BAR_STYLES.map((s) => (
                <button
                  key={s.id}
                  title={s.hint}
                  onClick={() => patchBar({ style: s.id })}
                  className="cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all"
                  style={{
                    background: barCfg.style === s.id ? "var(--dw-accent)" : "var(--dw-input)",
                    color: barCfg.style === s.id ? "#fff" : "var(--dw-dim)",
                  }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {/* при «только полоса» надписи нет — поле ей не нужно */}
          {!barCfg.barOnly && (
            <div className="border-t pt-2" style={{ borderColor: "var(--dw-line)" }}>
              <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
                Надпись
              </label>
              <TextInput
                value={barCfg.title ?? ""}
                maxLength={40}
                placeholder="Донаты"
                onChange={(e) => patchBar({ title: e.target.value })}
              />
              <p className="mt-1 text-[10px] leading-snug" style={{ color: "var(--dw-dim)" }}>
                Вместо слова «Донаты». Пустое поле снова покажет «Донаты».
              </p>
            </div>
          )}

          <ToggleRow
            label="Только полоса и процент"
            hint="скрыть надпись, сумму и другие валюты"
            checked={barCfg.barOnly === true}
            onChange={(v) => patchBar({ barOnly: v })}
          />

          <div className="grid grid-cols-2 gap-2 border-t pt-2" style={{ borderColor: "var(--dw-line)" }}>
            <div>
              <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
                Стартовая сумма ({barCfg.currency})
              </label>
              <TextInput
                type="number"
                min={0}
                step={1}
                value={String(barCfg.start)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  patchBar({ start: Number.isFinite(v) && v >= 0 ? v : 0 });
                }}
              />
              <p className="mt-1 text-[10px] leading-snug" style={{ color: "var(--dw-dim)" }}>
                С этой суммы начинается полоса — например, если собрано уже «до» эфира.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
                Цель ({barCfg.currency})
              </label>
              <TextInput
                type="number"
                min={0}
                step={1}
                value={String(barCfg.goal)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  patchBar({ goal: Number.isFinite(v) && v >= 0 ? v : 0 });
                }}
              />
              <p className="mt-1 text-[10px] leading-snug" style={{ color: "var(--dw-dim)" }}>
                0 — без цели: полоса полная, показывается только накопленная сумма.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 border-t pt-2" style={{ borderColor: "var(--dw-line)" }}>
            <span className="text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Валюта:
            </span>
            {["₽", "$", "€"].map((cur) => (
              <button
                key={cur}
                onClick={() => patchBar({ currency: cur })}
                className="cursor-pointer rounded-lg px-3 py-1 text-[13px] font-bold transition-all"
                style={{
                  background: barCfg.currency === cur ? "var(--dw-accent)" : "var(--dw-input)",
                  color: barCfg.currency === cur ? "#fff" : "var(--dw-dim)",
                }}
              >
                {cur}
              </button>
            ))}
          </div>

          <div
            className="flex items-center justify-between gap-2 rounded-xl px-3 py-2"
            style={{ background: "var(--dw-panel2)", border: "1px solid var(--dw-line)" }}
          >
            <div className="min-w-0">
              <p
                className="text-[10px] font-bold tracking-[0.14em] uppercase"
                style={{ color: "var(--dw-dim)" }}
              >
                Накоплено
              </p>
              <p className="text-[15px] font-bold tabular-nums" style={{ color: "#FFB454" }}>
                {barState
                  ? `${formatDonateAmount(
                      barState.totals[barState.currency] ?? barState.start,
                    )} ${barState.currency}`
                  : "— в браузере недоступно"}
              </p>
            </div>
            <button
              onClick={onBarReset}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition-all hover:brightness-110"
              style={{ background: "var(--dw-input)", color: "var(--dw-text)" }}
            >
              <RotateCcw size={12} /> Сбросить к стартовой
            </button>
          </div>

          {/* ссылка для OBS */}
          <div className="border-t pt-2" style={{ borderColor: "var(--dw-line)" }}>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
              Ссылка для OBS Browser Source
            </label>
            <div className="flex items-center gap-1.5">
              <code
                className="min-w-0 flex-1 truncate rounded-lg px-2.5 py-1.5 text-[11px]"
                style={{ background: "var(--dw-input)", color: "var(--dw-text)" }}
                title={barLink ?? ""}
              >
                {barLink ?? "доступно в приложении"}
              </code>
              <IconBtn
                icon={<Copy size={13} />}
                title="Копировать ссылку"
                onClick={async () => {
                  if (barLink && (await copyText(barLink))) {
                    setBarCopied(true);
                    window.setTimeout(() => setBarCopied(false), 1500);
                    toast("Ссылка скопирована");
                  }
                }}
              />
            </div>
            {barCopied && <p className="mt-1 text-[10.5px] text-emerald-400">Скопировано</p>}
          </div>
        </div>
      </Box>

      {/* добавление площадки */}
      {addOpen && (
        <AddChannelModal
          platforms={[addOpen]}
          onClose={() => setAddOpen(null)}
          onConnect={onConnect}
          toast={toast}
        />
      )}
    </div>
  );
}

/* ================= секция одной площадки ================= */

function PlatformSection({
  pid,
  channels,
  tokenDrafts,
  setTokenDraft,
  onDisconnect,
  onReconnect,
  onUpdateChannelToken,
  onAdd,
  ma,
  onMaChange,
  maStatus,
  maAuthorizing,
  onMaAuthorize,
  onMaLogout,
  toast,
}: {
  pid: PlatformId;
  channels: Channel[];
  tokenDrafts: Record<string, string>;
  setTokenDraft: (id: string, v: string) => void;
  onDisconnect: (id: string) => void;
  onReconnect: (id: string) => void;
  onUpdateChannelToken: (id: string, token: string) => void;
  onAdd: () => void;
  ma?: { clientId: string; clientSecret: string; redirectUri: string };
  onMaChange: (p: Partial<{ clientId: string; clientSecret: string; redirectUri: string }>) => void;
  maStatus?: MemeAlertsStatus | null;
  maAuthorizing?: boolean;
  onMaAuthorize?: () => void;
  onMaLogout?: () => void;
  toast: (t: string) => void;
}) {
  const meta = platformMeta(pid);
  const isMA = pid === "memealerts";
  const list = channels.filter((c) => c.platform === pid);

  return (
    <div
      className="rounded-xl p-2.5"
      style={{
        background: "var(--dw-panel2)",
        border: `1px solid ${list.length ? `${meta.color}55` : "var(--dw-line)"}`,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center"
          style={{ borderRadius: 9, background: `${meta.color}22` }}
        >
          <PlatformIcon id={pid} size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold" style={{ color: "var(--dw-text)" }}>
            {meta.name}
          </p>
          <p className="text-[10px]" style={{ color: "var(--dw-dim)" }}>
            {isMA
              ? maStatus?.connected
                ? `подключено: ${maStatus.name || maStatus.code || "аккаунт"}`
                : "вход по аккаунту"
              : list.length
                ? list[0].status === "error"
                  ? "ошибка подключения"
                  : "подключено"
                : "не подключено"}
          </p>
        </div>
        {/* действия */}
        {isMA ? (
          maStatus?.connected ? (
            <button
              onClick={onMaLogout}
              className="flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-red-400 transition-all hover:bg-[var(--dw-hover)]"
            >
              <Trash2 size={12} /> Отключить
            </button>
          ) : (
            <button
              onClick={onMaAuthorize}
              disabled={maAuthorizing}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold text-white transition-all hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
              style={{ background: meta.color }}
            >
              {maAuthorizing ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}
              {maAuthorizing ? "Ожидание…" : "Подключить"}
            </button>
          )
        ) : list.length ? (
          <div className="flex items-center gap-0.5">
            <IconBtn
              icon={<RotateCcw size={12} />}
              size={24}
              title="Переподключить"
              onClick={() => onReconnect(list[0].id)}
            />
            <button
              onClick={() => onDisconnect(list[0].id)}
              className="cursor-pointer rounded-md p-1.5 text-red-400 transition-colors hover:bg-[var(--dw-hover)]"
              title="Удалить площадку"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={onAdd}
            className="flex cursor-pointer items-center gap-1 rounded-lg border border-dashed px-2.5 py-1.5 text-[11px] font-semibold transition-all hover:border-[var(--dw-accent)]"
            style={{ borderColor: "var(--range-rest)", color: "var(--dw-dim)" }}
          >
            <Plus size={12} /> Добавить
          </button>
        )}
      </div>

      {/* MemeAlerts: креды приложения + подсказка */}
      {isMA && !maStatus?.connected && ma && (
        <div className="mt-2 flex flex-col gap-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="mb-0.5 block text-[10px]" style={{ color: "var(--dw-dim)" }}>
                Client ID
              </label>
              <TextInput
                value={ma.clientId}
                onChange={(e) => onMaChange({ clientId: e.target.value })}
                placeholder="uuid приложения"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px]" style={{ color: "var(--dw-dim)" }}>
                Client Secret
              </label>
              <TextInput
                type="password"
                value={ma.clientSecret}
                onChange={(e) => onMaChange({ clientSecret: e.target.value })}
                placeholder="секрет приложения"
              />
            </div>
          </div>
          <Collapsible title="Дополнительно" hint="адрес возврата для авторизации">
            <div>
              <label className="mb-0.5 block text-[10px]" style={{ color: "var(--dw-dim)" }}>
                Адрес возврата (redirect URI)
              </label>
              <TextInput
                value={ma.redirectUri}
                onChange={(e) => onMaChange({ redirectUri: e.target.value })}
                placeholder="http://localhost:8580/yawachatma"
              />
            </div>
          </Collapsible>
          <p className="text-[10px] leading-snug" style={{ color: "var(--dw-dim)" }}>
            MemeAlerts выдаёт Client ID и Secret при регистрации приложения через поддержку
            (support@memealerts.com). Укажите адрес возврата{" "}
            <code style={{ color: "var(--dw-accent-2)" }}>http://localhost:8580/yawachatma</code>. После
            нажатия «Подключить» откроется браузер — подтвердите доступ, и донаты пойдут в приложение.
          </p>
        </div>
      )}

      {/* токен / ключ площадки (DA, DP, Boosty) */}
      {list.map((c) => (
        <div key={c.id} className="mt-2">
          {isDonatePlatform(pid) || pid === "boosty" ? (
            <div className="flex items-center gap-1.5">
              <TextInput
                type="password"
                value={tokenDrafts[c.id] ?? c.token ?? ""}
                onChange={(e) => setTokenDraft(c.id, e.target.value)}
                placeholder={
                  pid === "donatepay"
                    ? "API-ключ из раздела «API»"
                    : pid === "boosty"
                      ? "токен аккаунта (необязательно)"
                      : "секретный токен"
                }
              />
              <button
                onClick={() => {
                  onUpdateChannelToken(c.id, (tokenDrafts[c.id] ?? c.token ?? "").trim());
                  setTokenDraft(c.id, "");
                  toast(`Токен ${meta.name} сохранён — переподключаем`);
                }}
                className="shrink-0 cursor-pointer rounded-lg px-3 py-1.5 text-[11.5px] font-bold text-[var(--dw-accent-ink)] transition-all hover:brightness-110"
                style={{ background: "var(--dw-accent)" }}
              >
                Сохранить
              </button>
            </div>
          ) : null}
          {(c.status === "error" || c.errorReason) && (
            <div
              className="mt-1.5 flex items-start gap-1.5 rounded-lg px-2.5 py-2"
              style={{ background: "rgba(248,113,113,0.08)" }}
            >
              <TriangleAlert size={12} className="mt-0.5 shrink-0 text-red-400" />
              <div className="min-w-0 flex-1">
                <ChannelErrorDetails channel={c} onReconnect={() => onReconnect(c.id)} />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
