using System.Diagnostics;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.WinForms;

namespace YawaChat;

/// <summary>
/// JSON-RPC мост рендерер ↔ хост. Заменяет electron/ipc: те же методы,
/// что вызывает src/lib/bridge.ts — settings.*, window.*, tts.*,
/// overlay.*, widget.info, hotkeys.apply, clipboard.set, shell.openExternal.
/// Настройки живут в %LOCALAPPDATA%\YawaChat\settings.json (как раньше у Electron).
/// Запись атомарная: рядом всегда лежит прежняя рабочая копия settings.json.bak,
/// из которой настройки восстанавливаются при повреждении основного файла.
/// </summary>
public sealed class HostApi : IDisposable
{
    private readonly MainWindow _win;
    private readonly WebView2 _web;
    private readonly SapiTts _tts = new();
    private readonly EdgeTts _edge = new();
    /* Очередь озвучки на стороне хоста: одна фраза за раз для любого движка,
       включая запасной системный голос. Счётчик поколения растёт по команде
       «стоп»/«очистить» — всё, что ещё не начало звучать, отменяется. */
    private readonly SemaphoreSlim _ttsFifo = new(1, 1);
    private int _ttsGeneration;
    private readonly WidgetServer _widget = new();
    private readonly ConnectorManager _connectors;
    private OverlayWindow? _overlay;
    private JsonNode? _overlayConfig;     // последний конфиг — применяется к новому окну
    private readonly string _settingsPath = Path.Combine(Program.AppDir, "settings.json");
    /// Прежняя рабочая копия настроек — страховка на случай повреждения
    /// основного файла (см. LoadSettings).
    private readonly string _settingsBackupPath = Path.Combine(Program.AppDir, "settings.json.bak");
    private JsonObject _settings = new();
    /// Основной файл настроек оказался повреждён и содержимое взято из копии:
    /// при старте его нужно зафиксировать заново.
    private bool _settingsRestoredFromBackup;

    /* ЗАПИСЬ НАСТРОЕК. Раньше каждое изменение — в том числе каждый шаг
       ползунка громкости — писало файл целиком: копия всего JSON, шифрование
       секретов, запись на диск. При перетаскивании ползунка это десятки
       записей в секунду, и интерфейс заметно подвисал. Теперь записи
       склеиваются: не чаще раза в 400 мс, плюс обязательная запись при
       закрытии приложения. Вход и токены сохраняются сразу, без задержки. */
    private const int SettingsSaveDelayMs = 400;
    /// Пауза до повторной попытки, если запись файла настроек не удалась.
    private const int SettingsRetryDelayMs = 4_000;
    /// Параметры сериализации создаются ОДИН раз: новый экземпляр на каждое
    /// сохранение каждый раз заново строил кэш метаданных типов.
    private static readonly JsonSerializerOptions SettingsJsonOptions = new() { WriteIndented = true };
    private readonly object _settingsGate = new();
    private System.Threading.Timer? _settingsSaveTimer;
    private int _settingsDirty;
    private bool _settingsWriteFailed;

    /* Облачный голос может быть недоступен (нет сети, сервис озвучки
       ограничивается провайдером в стране). Считаем отказы подряд: после двух
       переходим на системный голос, иначе КАЖДАЯ фраза ждала бы неудачных
       попыток подключения. Пауза растёт с каждым новым срывом, а в фоне идёт
       проверка доступности — как только сервис снова отвечает, нейроголос
       возвращается сам: ни ждать окончания паузы, ни задерживать фразу для
       проверки не приходится. */
    private const int EdgeFailureLimit = 2;
    private static readonly double[] EdgeBlockMinutes = { 0.5, 1, 2, 5 };
    private int _edgeFailures;
    private int _edgeBlockLevel;
    private DateTime _edgeBlockedUntil = DateTime.MinValue;
    private DateTime _lastEdgeProbe = DateTime.MinValue;
    private int _edgeProbing;
    private bool EdgeBlocked => DateTime.UtcNow < _edgeBlockedUntil;

    /// Озвучка сейчас идёт облачным (нейро) голосом. Ложь — значит сервис не
    /// отвечает и фразы читает запасной системный голос.
    private bool _cloudVoiceOk = true;
    /// Понятное имя и пол запасного системного голоса — то, что видит
    /// пользователь в статусе озвучки.
    private (string Title, string Gender) FallbackVoiceInfo(string voice)
    {
        var id = FallbackVoiceFor(voice);
        if (id.Length == 0) return ("", "");
        var found = SapiTts.ListSystemVoices()
            .FirstOrDefault(v => v.Id.Equals(id, StringComparison.OrdinalIgnoreCase));
        return (found?.Title ?? id, found?.Gender ?? "");
    }


    /// Запасной системный голос — под каждый пол облачного голоса свой:
    /// женский не должен сменяться мужским при срыве связи.
    private readonly Dictionary<string, string> _fallbackVoices = new();
    private readonly object _fallbackGate = new();

    /// Тёзки облачных голосов среди системных: с ними запасная озвучка звучит
    /// почти так же, как основная, а не просто «другим голосом».
    private static readonly Dictionary<string, string> SystemNameOfEdgeVoice =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["ru-RU-SvetlanaNeural"] = "Svetlana",
            ["ru-RU-DmitryNeural"] = "Dmitry",
        };

    /// Запасной системный голос под выбранный облачный: тот же пол, а если в
    /// Windows есть тёзка — то и то же имя. Пустая строка — русского голоса
    /// в системе нет.
    private string FallbackVoiceFor(string? edgeVoiceId)
    {
        var key = edgeVoiceId ?? "";
        lock (_fallbackGate)
        {
            if (_fallbackVoices.TryGetValue(key, out var cached) && cached.Length > 0) return cached;
        }

        var gender = EdgeTts.GenderOf(edgeVoiceId);
        SystemNameOfEdgeVoice.TryGetValue(key, out var preferred);
        var picked = SapiTts.PickRussianVoice(gender, preferred);
        // Пустой результат не запоминаем: русские голоса могут появиться
        // в системе позже (языковой пакет ставится отдельно).
        if (picked.Length > 0)
            lock (_fallbackGate) _fallbackVoices[key] = picked;
        return picked;
    }

    /// Голос для системной озвучки, если пользователь выбрал её сам.
    /// Сохранённое имя может не найтись (настройки перенесены с другого
    /// компьютера) — тогда берём русский голос того же пола, а не голос
    /// Windows по умолчанию, который читал бы русский текст по-английски.
    private static string ResolveSystemVoice(string voice)
    {
        if (voice.Length > 0 &&
            SapiTts.ListSystemVoices().Any(v => v.Id.Contains(voice, StringComparison.OrdinalIgnoreCase)))
            return voice;

        var gender = SapiTts.GenderOfDescription(voice);
        if (gender.Length == 0) gender = EdgeTts.GenderOf(voice);
        var picked = SapiTts.PickRussianVoice(gender);
        return picked.Length > 0 ? picked : voice;
    }

    /// Включена ли запасная озвучка (настройка пользователя).
    private bool FallbackVoiceEnabled => TtsBoolSetting("fallbackVoice", true);

    private bool TtsBoolSetting(string key, bool fallback)
    {
        try
        {
            if (_settings["tts"] is JsonObject tts &&
                tts[key] is JsonValue value && value.TryGetValue<bool>(out var b))
                return b;
        }
        catch { /* настройка ещё не сохранена */ }
        return fallback;
    }

    /// Голос, выбранный в настройках озвучки.
    private string SettingVoice()
    {
        try
        {
            if (_settings["tts"] is JsonObject tts &&
                tts["voice"]?.GetValue<string>() is { Length: > 0 } voice)
                return voice;
        }
        catch { /* настройка ещё не сохранена */ }
        return EdgeTts.DefaultVoice;
    }

    /// Считает отказ облачного голоса и при повторяющихся сбоях ставит паузу:
    /// фразы в это время сразу читаются системным голосом, без ожидания сети.
    private void NoteCloudFailure()
    {
        _edgeFailures++;
        if (_edgeFailures < EdgeFailureLimit) return;
        _edgeFailures = 0;
        _edgeBlockLevel = Math.Min(_edgeBlockLevel + 1, EdgeBlockMinutes.Length);
        _edgeBlockedUntil = DateTime.UtcNow.AddMinutes(EdgeBlockMinutes[_edgeBlockLevel - 1]);
    }

    private void NoteCloudSuccess()
    {
        _edgeFailures = 0;
        _edgeBlockLevel = 0;
        _edgeBlockedUntil = DateTime.MinValue;
    }

    /// Фоновая проверка доступности сервиса, пока озвучка идёт системным
    /// голосом: возвращает нейроголос сразу, как только связь ожила.
    private void MaybeProbeCloud()
    {
        if (DateTime.UtcNow - _lastEdgeProbe < TimeSpan.FromSeconds(45)) return;
        if (Interlocked.CompareExchange(ref _edgeProbing, 1, 0) != 0) return;
        _lastEdgeProbe = DateTime.UtcNow;

        _ = Task.Run(async () =>
        {
            try
            {
                if (!await _edge.CheckHealthAsync()) return;
                NoteCloudSuccess();
                PublishVoiceStatus(true);
            }
            catch { /* проверим в следующий раз */ }
            finally { Interlocked.Exchange(ref _edgeProbing, 0); }
        });
    }

    /// Сообщает интерфейсу, каким голосом сейчас идёт озвучка: облачным или
    /// запасным системным. Пользователь должен видеть причину, по которой
    /// звучание изменилось, а не гадать, «что случилось с голосом».
    private void PublishVoiceStatus(bool cloudOk)
    {
        if (_cloudVoiceOk == cloudOk) return;
        _cloudVoiceOk = cloudOk;

        var voice = SettingVoice();
        var fallbackEnabled = FallbackVoiceEnabled;
        string title;
        string gender;
        if (cloudOk)
        {
            title = EdgeTts.TitleOf(voice);
            gender = EdgeTts.GenderOf(voice);
        }
        else if (fallbackEnabled)
        {
            (title, gender) = FallbackVoiceInfo(voice);
        }
        else
        {
            title = "";
            gender = "";
        }

        _win.SendEvent("tts.status", new
        {
            cloud = cloudOk,
            fallback = !cloudOk && fallbackEnabled,
            voice = title,
            gender,
            fallbackEnabled,
        });
    }

    /// Текущее состояние озвучки для интерфейса (запрашивается при открытии
    /// настроек, чтобы статус не зависел от того, было ли событие раньше).
    private object VoiceStatus()
    {
        var voice = SettingVoice();
        var cloudOk = _cloudVoiceOk && !EdgeBlocked;
        var fallbackEnabled = FallbackVoiceEnabled;
        string title;
        string gender;
        if (cloudOk)
        {
            title = EdgeTts.TitleOf(voice);
            gender = EdgeTts.GenderOf(voice);
        }
        else if (fallbackEnabled)
        {
            (title, gender) = FallbackVoiceInfo(voice);
        }
        else
        {
            title = "";
            gender = "";
        }

        return new
        {
            cloud = cloudOk,
            fallback = !cloudOk && fallbackEnabled,
            voice = title,
            gender,
            fallbackEnabled,
        };
    }

    /// Создаёт окно оверлея при первом обращении и сразу применяет сохранённые настройки.
    private OverlayWindow EnsureOverlay()
    {
        if (_overlay == null || _overlay.IsDisposed)
        {
            _overlay = new OverlayWindow(this);
            // перетащили окно → сохраняем posX/posY в settings.json (и в конфиг оверлея)
            _overlay.PositionChanged += (x, y) =>
            {
                if (_overlayConfig is JsonObject cfgObj)
                {
                    cfgObj["posX"] = x;
                    cfgObj["posY"] = y;
                }
                if (_settings["overlay"] is JsonObject savedObj)
                {
                    savedObj["posX"] = x;
                    savedObj["posY"] = y;
                    SaveSettings();
                }
                _win.SendEvent("overlay.moved", new { x, y });
            };
            // размер, заданный перетаскиванием краёв, тоже запоминаем
            _overlay.SizeChangedByUser += (w, h) =>
            {
                if (_overlayConfig is JsonObject sizeCfg)
                {
                    sizeCfg["width"] = w;
                    sizeCfg["height"] = h;
                }
                if (_settings["overlay"] is JsonObject savedSize)
                {
                    savedSize["width"] = w;
                    savedSize["height"] = h;
                    SaveSettings();
                }
                _win.SendEvent("overlay.resized", new { width = w, height = h });
            };
            var cfg = _overlayConfig
                ?? (_settings.TryGetPropertyValue("overlay", out var saved) ? saved?.DeepClone() : null);
            if (cfg != null) _overlay.Apply(cfg);
        }
        return _overlay;
    }

    public HostApi(MainWindow win, WebView2 web)
    {
        _win = win;
        _web = web;
        // Отложенная запись настроек: таймер взводится при изменении и пишет
        // файл один раз, а не на каждое движение ползунка.
        _settingsSaveTimer = new System.Threading.Timer(
            _ => WriteSettings(), null, Timeout.Infinite, Timeout.Infinite);
        LoadSettings();
        // Настройки прочитаны из рабочей копии после повреждения основного
        // файла — фиксируем их сразу, чтобы следующий запуск читал основной
        // файл, а копия осталась страховкой.
        if (SettingsMigrations.Apply(_settings) || _settingsRestoredFromBackup)
            SaveSettings(immediate: true);

        /* Ярлык на рабочем столе: приложение portable, установщика нет.
           Создаём его один раз — со значком приложения и прежней заменой
           ярлыка старого имени. Путь программы запоминаем: если пользователь
           ярлык удалит, он не вернётся сам.
           Создание — COM-операция, на медленных машинах с антивирусом она
           заметно тормозит, поэтому идёт в фоне: окно стартует, ярлык
           подтянется сам (это разовая работа, не критичная для запуска). */
        var previousShortcut = _settings["desktopShortcut"]?.GetValue<string>() ?? "";
        _ = Task.Run(() =>
        {
            try
            {
                var shortcut = DesktopShortcut.TryEnsure(previousShortcut);
                if (shortcut == null) return;
                // Настройка меняется из фонового потока: защищаем сам объект
                // от одновременной записи, а WriteSettings возьмёт общую
                // блокировку (она реентерабельна для этого потока).
                lock (_settingsGate) _settings["desktopShortcut"] = shortcut;
                SaveSettings();
            }
            catch { /* ярлык не создался — приложение работает как обычно */ }
        });
        // Twitch: device-код кладём в буфер — пользователю остаётся только вставить
        AppAuth.ClipboardWriter = text =>
        {
            try { _win.BeginInvoke(() => Clipboard.SetText(text)); } catch { }
        };
        // Токен бота включает права модерации и отправки в Twitch-коннекторе
        ConnectorManager.BotToken = (_settings["botToken:twitch"]?.GetValue<string>() ?? "")
            .Replace("oauth:", "", StringComparison.OrdinalIgnoreCase);
        ConnectorManager.BotLogin = (_settings["botAuth"] is JsonObject ba
            ? ba["twitch"]?.GetValue<string>() : null) ?? "";

        /* АВТОПРОДЛЕНИЕ ВХОДА TWITCH. Токен доступа живёт считаные часы:
           раньше примерно через сутки он истекал, коннектор терял права и
           бесконечно повторял «не удалось определить id канала». Теперь
           коннектор сообщает об истечении сюда, а мы молча продлеваем вход
           по сохранённому токену продления. */
        ConnectorManager.RenewTwitchAuth = async () =>
        {
            var refresh = _settings["botRefresh:twitch"]?.GetValue<string>() ?? "";
            if (string.IsNullOrWhiteSpace(refresh)) return false;

            var renewed = await AppAuth.RefreshTwitchAsync(refresh);
            if (renewed == null)
            {
                // Продлить не вышло — доступ отозван. Сообщаем интерфейсу
                // ОДИН раз, вместо потока одинаковых ошибок в ленте.
                _win.SendEvent("bot.expired", new { platform = "twitch" });
                return false;
            }

            ConnectorManager.BotToken = renewed.Token;
            ConnectorManager.BotLogin = renewed.Account;
            _settings["botToken:twitch"] = renewed.Token;
            _settings["botRefresh:twitch"] = renewed.Refresh;
            SaveSettings(immediate: true);   // токен нельзя потерять
            _win.SendEvent("bot.authorized", new
            {
                platform = "twitch",
                account = renewed.Account,
                channel = renewed.Channel,
            });
            return true;
        };
        // Для VK вход используется только чтобы получить подпись приватной
        // websocket-подписки на активации наград. Анонимное чтение чата остаётся
        // доступным даже когда токена нет или он истёк.
        ConnectorManager.VkAccessTokenProvider = VkAccessTokenForConnectorAsync;
        ConnectorManager.VkChannelProvider = () => _settings["botChannel:vkplay"]?.GetValue<string>() ?? "";

        // MemeAlerts: коннектору нужен действующий access token — хост берёт
        // его из настроек и при необходимости молча продлевает.
        ConnectorManager.MemeAlertsAuthProvider = MemeAlertsAuthAsync;

        // Предзаполняем каталог наград VK из сохранённых настроек, чтобы
        // активации сразу знали названия наград даже до открытия настроек.
        SeedVkRewardCatalogFromSettings();

        // TikTok подключается сам (TikTokConnector → tiktok-bridge/bridge.js,
        // модуль tiktok-live-connector) и не требует хуков из HostApi:
        // ни скрытого окна WebView2, ни cookies, ни логина.

        // Сервер виджета поднимается СРАЗУ при старте: иначе OBS не мог
        // подключиться, пока пользователь не откроет настройки виджета,
        // и озвучка/сообщения в Browser Source не приходили.
        try { _widget.Start(IntSetting("widgetPort", 8085)); }
        catch (Exception ex) { AppLog.Warning("widget", $"Виджет не запустился: {ex.GetType().Name}"); }

        // Сохранённое оформление виджета источник OBS должен получать сразу
        // при подключении. Раньше оно уходило в OBS только после открытия
        // вкладки «Виджет» в настройках: до этого источник работал с
        // умолчаниями — например, не скрывал старые сообщения, хотя
        // исчезновение было включено, — и «оживал» лишь после изменения
        // любой настройки.
        try
        {
            if (_settings.TryGetPropertyValue("widget", out var savedWidget) && savedWidget is JsonObject)
                _widget.BroadcastConfig(savedWidget.DeepClone());
        }
        catch { /* оформление придёт от интерфейса при загрузке настроек */ }

        try
        {
            if (_settings.TryGetPropertyValue("customRewardSounds", out var savedRewardSounds) && savedRewardSounds is JsonArray)
                _widget.BroadcastRewardSounds(savedRewardSounds.DeepClone());
        }
        catch { /* звуки наград придут от интерфейса при загрузке */ }

        // Полоса донатов: новый источник OBS получает накопленный итог сразу
        // при подключении (сумма переживает перезапуск приложения).
        try { _widget.BroadcastDonateBar(DonateBarSnapshot()); } catch { }

        // System.Threading.Timer работает из фоновых потоков коннекторов
        // (в отличие от ранее сломанного WinForms.Timer без message loop).
        _chatFlushTimer = new System.Threading.Timer(
            _ => FlushChatBatch(), null, Timeout.Infinite, Timeout.Infinite);

        // Прогрев Edge TTS после появления интерфейса: не конкурирует с
        // запуском WebView2 и восстановлением каналов за CPU/сеть.
        _ = Task.Run(async () =>
        {
            await Task.Delay(1500);
            _edge.Warmup();
        });

        /* ПРОВЕРКА НОВОЙ ВЕРСИИ (1.5). В фоне, с паузой: не конкурирует со
           стартом и подключением каналов. Раз за запуск; без сети — тихо.
           Интерфейс покажет «Доступна версия X» с кнопкой скачивания. */
        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(6));
                var current = Application.ProductVersion;
                var latest = await VersionCheck.GetLatestAsync();
                if (latest == null) return;
                if (VersionCheck.Compare(latest.Value.Version, current) <= 0) return;
                AppLog.Info("update",
                    $"Доступна новая версия {latest.Value.Version} (текущая {current})");
                _win.SendEvent("update.available", new
                {
                    version = latest.Value.Version,
                    download = latest.Value.DownloadUrl,
                    current,
                });
            }
            catch { /* проверка — необязательный сервис */ }
        });

        /* ИНДИКАТОР ЗДОРОВЬЯ ЭФИРА (1.4): снимок раз в 10 секунд —
           переподключения за сессию + состояние виджета OBS. Задержка
           сообщений считается в интерфейсе по времени приёма сообщений. */
        _healthTimer = new System.Threading.Timer(
            _ => SendStreamHealth(), null, 10_000, 10_000);

        _connectors = new ConnectorManager(
            msg => PushChatMessage(msg),
            (platform, username, status, viewers) =>
            {
                _win.SendEvent("channel.status", new { platform, username, status, viewers });
                NoteHealthStatus(platform, username, status);
            },
            (platform, username, title) =>
                _win.SendEvent("channel.title", new { platform, username, title }),
            (platform, username, reason) =>
                _win.SendEvent("channel.error", new { platform, username, reason }),
            (platform, username, likes) =>
                _win.SendEvent("channel.likes", new { platform, username, likes }));
    }

    /// <param name="reply">
    /// Куда отправить ответ. По умолчанию — главное окно; окно оверлея
    /// передаёт свой Reply, чтобы получать собственные настройки.
    /// </param>
    public async Task DispatchAsync(
        int id,
        string method,
        object?[] args,
        Action<int, bool, object?, string?>? reply = null)
    {
        reply ??= (i, ok, res, err) => _win.Reply(i, ok, res, err);
        try
        {
            object? result = await Route(method, args);
            if (id != 0) reply(id, true, result, null);
        }
        catch (Exception ex)
        {
            if (id != 0) reply(id, false, null, ex.Message);
        }
    }

    private async Task<object?> Route(string method, object?[] a)
    {
        switch (method)
        {
            /* ---------- настройки ---------- */
            case "settings.get":
            {
                var key = Str(a, 0) ?? "";
                return _settings.TryGetPropertyValue(key, out var node) ? node?.DeepClone() : null;
            }
            case "settings.set":
            {
                var key = Str(a, 0) ?? "";
                _settings[key] = a.Length > 1 ? ToNode(a[1]) : null;
                // Учётные данные фиксируются сразу: задержанная запись не должна
                // потерять их при аварийном завершении приложения.
                SaveSettings(immediate: SettingsCrypto.IsSensitiveKey(key));
                if (key == "closeToTray") _win.SetCloseToTray(a.Length > 1 && Bool(a, 1));
                // Полоса донатов: настройки (старт/цель/стиль) поменялись —
                // обновляем источники OBS, не дожидаясь следующего доната.
                if (key == "donatebar")
                {
                    try { _widget.BroadcastDonateBar(DonateBarSnapshot()); } catch { }
                    try { _win.SendEvent("donatebar.update", DonateBarSnapshot()); } catch { }
                }
                else if (key == "customRewardSounds")
                {
                    try { _widget.BroadcastRewardSounds(_settings[key]?.DeepClone()); } catch { }
                }
                else if (key == "rewardSounds")
                {
                    SeedVkRewardCatalogFromSettings();
                }
                return null;
            }

            /* ---------- окно ---------- */
            case "window.minimize": _win.BeginInvoke(() => _win.WindowState = FormWindowState.Minimized); return null;
            case "window.toggleMaximize": _win.BeginInvoke(_win.ToggleMaximize); return null;
            case "window.isMaximized": return _win.WindowState == FormWindowState.Maximized;
            case "window.close":
            {
                bool toTray = Bool(a, 0);
                _win.BeginInvoke(() =>
                {
                    if (toTray) _win.Hide();
                    else { _win.SetCloseToTray(false); _win.Close(); }
                });
                return null;
            }
            case "window.drag": _win.BeginInvoke(_win.BeginDrag); return null;

            /* ---------- замеры запуска (2.7) ---------- */
            case "startup.report":
            {
                // Отметки рендерера: когда страница была готова и когда
                // отрисован первый кадр. В паре с хостовыми этапами
                // (StartupClock) даёт полную цепочку запуска в app.log.
                var node = ToNode(a.ElementAtOrDefault(0)) as JsonObject;
                string Field(string key) =>
                    node?[key] is JsonValue v ? v.ToString() : "—";
                AppLog.Info("startup",
                    $"Запуск: интерфейс «{Field("app")}» — страница готова {Field("domReady")} мс, " +
                    $"первый кадр {Field("firstRender")} мс");
                return null;
            }

            /* ---------- озвучка: Edge TTS (нейро, только русский) или системный SAPI ---------- */
            case "tts.voices":
                // список доступных голосов для панели «Озвучка»
                return new
                {
                    edge = EdgeTts.AllVoices.Select(v => new { id = v.Id, title = v.Title, gender = v.Gender }),
                    sapi = SapiTts.ListRussianVoices(),
                };

            case "tts.status":
                // каким голосом идёт озвучка прямо сейчас: облачным или запасным
                return VoiceStatus();

            /* ---------- создание награды на площадках ---------- */
            case "rewards.create":
            {
                var title = (Str(a, 0) ?? "").Trim();
                var cost = Int(a, 1);
                var description = (Str(a, 2) ?? "").Trim();
                var messageRequired = a.Length > 3 ? Bool(a, 3) : true;
                var platforms = a.ElementAtOrDefault(4) is JsonElement pl && pl.ValueKind == JsonValueKind.Array
                    ? pl.EnumerateArray()
                        .Where(x => x.ValueKind == JsonValueKind.String)
                        .Select(x => (x.GetString() ?? "").Trim().ToLowerInvariant())
                        .Where(x => x is "twitch" or "vkplay")
                        .Distinct()
                        .ToArray()
                    : Array.Empty<string>();

                if (title.Length == 0)
                    return new { ok = false, created = Array.Empty<object>(),
                        failed = new[] { new { platform = "", error = "Укажите название награды" } } };
                if (platforms.Length == 0)
                    return new { ok = false, created = Array.Empty<object>(),
                        failed = new[] { new { platform = "", error = "Выберите площадку: Twitch или VK Видео Live" } } };

                var created = new List<object>();
                var failed = new List<object>();

                foreach (var platform in platforms)
                {
                    if (platform == "twitch")
                    {
                        // Канал берём из входа в Twitch: чужие награды создать нельзя.
                        var twitchChannel = (_settings["botAuth"] is JsonObject bauth
                            ? bauth["twitch"]?.GetValue<string>() : null) ?? "";
                        if (twitchChannel.Length == 0)
                        {
                            failed.Add(new { platform, error = "Сначала войдите в Twitch в разделе «Чат-бот»" });
                            continue;
                        }

                        var made = await TwitchRewards.CreateAsync(twitchChannel, title, cost, description);
                        if (made.ok)
                            created.Add(new { platform, id = made.id, title, cost });
                        else
                            failed.Add(new { platform, error = made.error });

                        continue;
                    }

                    // VK Видео Live: создаём в собственном канале аккаунта.
                    try
                    {
                        var vkChannel = VkChannel(null);
                        var id = await VkApiAsync(token => VkLiveApi.CreateRewardAsync(
                            vkChannel, title, cost, description, messageRequired, token));
                        // Событие активации может прийти без названия — запоминаем.
                        RewardCatalog.RememberVk(id, title, cost);
                        created.Add(new { platform, id, title, cost });
                    }
                    catch (Exception ex)
                    {
                        failed.Add(new { platform, error = ex.Message });
                        AppLog.Warning("rewards", $"Создание награды VK: {ex.GetType().Name}");
                    }
                }

                if (created.Count > 0)
                    AppLog.Info("rewards", $"Создана награда «{title}» ({cost} б.) на {created.Count} площадк(ах)");

                return new { ok = created.Count > 0, created = created.ToArray(), failed = failed.ToArray() };
            }

            case "tts.config":
                // что записано в edge-tts.json: адрес, версия протокола, итог проверки
                return _edge.ConfigInfo();

            case "tts.configCheck":
            {
                /* Ручная проверка адресов и версии протокола — кнопка «Обновить»
                   в настройках озвучки. Рабочий адрес записывается в
                   edge-tts.json первым: пересобирать приложение не нужно. */
                var result = await _edge.CheckConfigAsync();
                if (result.Ok)
                {
                    NoteCloudSuccess();
                    PublishVoiceStatus(true);
                }

                var payload = new
                {
                    ok = result.Ok,
                    updated = result.Updated,
                    endpoint = result.Endpoint,
                    version = result.Version,
                    detail = result.Detail,
                    info = _edge.ConfigInfo(),
                };
                _win.SendEvent("tts.config", payload);
                return payload;
            }

            case "tts.speak":
            {
                var text = Str(a, 0) ?? "";
                var voice = Str(a, 1) ?? "";
                var rate = a.Length > 2 ? Int(a, 2) : 0;      // -10..10 (SAPI) / проценты (Edge)
                var volume = a.Length > 3 ? Int(a, 3) : 100;  // 0..100
                var engine = a.Length > 4 ? Str(a, 4) ?? "edge" : "edge";
                var speaker = a.Length > 5 ? Str(a, 5) ?? "" : "";   // ник автора для персонального голоса
                var muteOnPc = a.Length > 6 ? Bool(a, 6) : TtsBoolSetting("muteOnPc", false);
                var playLocally = !muteOnPc;

                // Персональный голос автора важнее выбранного по умолчанию
                if (speaker.Trim().Length > 0
                    && _settings["userVoices"] is JsonObject perUser
                    && perUser[speaker.Trim().ToLowerInvariant()] is JsonValue personal
                    && EdgeTts.AllVoices.Any(v => v.Id.Equals(personal.GetValue<string>(), StringComparison.OrdinalIgnoreCase)))
                {
                    voice = personal.GetValue<string>();
                }

                /* ОДНА ФРАЗА ЗА РАЗ — на уровне хоста. Иначе проверка голоса из
                   настроек, нажатие «прослушать» и очередь чата могли звучать
                   внахлёст: фразы обрывались, накладывались или пропадали.
                   Запасной системный голос тоже внутри этой очереди, поэтому
                   переход «облако → система» больше не рвёт текущую реплику. */
                var generation = Volatile.Read(ref _ttsGeneration);
                await _ttsFifo.WaitAsync();
                try
                {
                    // Очередь очистили, пока фраза ждала, — озвучивать нечего.
                    if (Volatile.Read(ref _ttsGeneration) != generation) return null;

                    // Жёсткий потолок на фразу: если движок или драйвер завис,
                    // очередь не должна молчать до перезапуска приложения.
                    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(90));

                    if (engine == "sapi")
                    {
                        var systemVoice = ResolveSystemVoice(voice);
                        Action<byte[]>? onObsWav = _widget.Running
                            ? wav => { if (wav.Length > 0) try { _widget.BroadcastTts(wav, volume); } catch { } }
                            : null;
                        await _tts.SpeakAsync(text, systemVoice, rate, volume, onObsWav, playLocally);
                    }
                    else
                    {
                        var handled = false;

                        if (!EdgeBlocked)
                        {
                            try
                            {
                                // Аудио уходит в OBS Browser Source МГНОВЕННО при готовности синтеза (0 задержки).
                                // Если сервис уже срывался, на подбор подключения
                                // отводится меньше времени: фраза быстрее уходит
                                // запасному голосу, очередь озвучки не копится.
                                var budget = _edgeFailures > 0 || _edgeBlockLevel > 0
                                    ? TimeSpan.FromSeconds(8)
                                    : TimeSpan.FromSeconds(16);
                                await _edge.SpeakAsync(text, voice, rate * 10, volume, mp3 =>
                                {
                                    if (mp3.Length > 0 && _widget.Running)
                                    {
                                        try { _widget.BroadcastTts(mp3, volume); } catch { }
                                    }
                                }, timeout.Token, budget, playLocally);
                                NoteCloudSuccess();
                                PublishVoiceStatus(true);
                                handled = true;
                            }
                            catch (OperationCanceledException)
                            {
                                // Фразу отменили («стоп» или «очистить очередь»)
                                // либо истёк потолок ожидания. Запасным голосом
                                // её озвучивать нельзя — она прозвучала бы дважды
                                // или уже после остановки.
                                handled = true;
                            }
                            catch (Exception ex)
                            {
                                // Облачный голос не ответил: сеть, ограничение
                                // сервиса провайдером или отказ самого сервиса.
                                // Считаем срыв — после нескольких подряд фразы
                                // сразу идут запасным голосом, без ожидания сети.
                                AppLog.Warning("tts", $"Облачная озвучка недоступна, перешли на системную: {ex.GetType().Name}");
                                NoteCloudFailure();
                            }
                        }
                        else
                        {
                            // Облачный голос уже срывался подряд: не тратим на
                            // него время каждой фразы. В фоне проверяем, не
                            // вернулся ли сервис, — и возвращаем нейроголос
                            // сразу, как только он ответит.
                            MaybeProbeCloud();
                        }

                        if (!handled)
                        {
                            PublishVoiceStatus(false);
                            if (!FallbackVoiceEnabled) return null;   // запасная озвучка выключена

                            // Фраза НЕ должна пропадать: её читает системный
                            // голос Windows — русский и того же пола, что
                            // выбранный облачный голос. Русского голоса в
                            // системе может не быть вовсе — тогда фраза
                            // пропускается: английский голос читал бы русский
                            // текст нечитаемым, и это звучало хуже молчания.
                            var fallbackVoice = FallbackVoiceFor(voice);
                            if (fallbackVoice.Length > 0)
                            {
                                Action<byte[]>? onObsWav = _widget.Running
                                    ? wav => { if (wav.Length > 0) try { _widget.BroadcastTts(wav, volume); } catch { } }
                                    : null;
                                await _tts.SpeakAsync(text, fallbackVoice, rate, volume, onObsWav, playLocally);
                            }
                        }
                    }
                    return null;
                }
                finally
                {
                    _ttsFifo.Release();
                }
            }
            /* ---------- закрепление голоса за пользователем чата ---------- */
            case "userVoice.set":
            {
                // userVoice.set { user: "ник", voice: "id голоса" }
                var node = ToNode(a.ElementAtOrDefault(0));
                var user = node?["user"]?.GetValue<string>()?.Trim().ToLowerInvariant() ?? "";
                var voice = node?["voice"]?.GetValue<string>()?.Trim() ?? "";
                if (user.Length == 0) throw new InvalidOperationException("Не указан пользователь");
                if (voice.Length == 0)
                {
                    if (_settings["userVoices"] is JsonObject map1) map1.Remove(user);
                }
                else
                {
                    if (!EdgeTts.AllVoices.Any(v => v.Id.Equals(voice, StringComparison.OrdinalIgnoreCase)))
                        throw new InvalidOperationException("Неизвестный голос");
                    if (_settings["userVoices"] is not JsonObject map2) _settings["userVoices"] = map2 = new JsonObject();
                    map2[user] = voice;
                }
                SaveSettings();
                return new { ok = true };
            }
            case "userVoice.get":
            {
                // карта «ник → голос» с русскими названиями
                var result = new List<object>();
                if (_settings["userVoices"] is JsonObject map)
                    foreach (var kv in map)
                        result.Add(new { user = kv.Key, voice = kv.Value?.GetValue<string>() ?? "", title = EdgeTts.TitleOf(kv.Value?.GetValue<string>()) });
                return new { voices = EdgeTts.AllVoices.Select(v => new { id = v.Id, title = v.Title, gender = v.Gender }), assigned = result };
            }

            case "tts.pause":
                _tts.Pause();
                _edge.Pause();
                return null;
            case "tts.resume":
                _tts.Resume();
                _edge.Resume();
                return null;
            case "tts.clear":
                // Снимаем с очереди всё, что ещё не зазвучало, и глушим текущую фразу.
                Interlocked.Increment(ref _ttsGeneration);
                _tts.Clear();
                _edge.Cancel();
                return null;

            /* ---------- оверлей поверх игры ---------- */
            case "overlay.open":
                _win.Invoke(() => EnsureOverlay().Show());
                return null;
            case "overlay.close":
                _win.Invoke(() => _overlay?.Hide());
                return null;
            case "overlay.isVisible":
                return _win.Invoke(() => _overlay?.Visible == true);
            case "overlay.toggle":
                // показать/скрыть окно оверлея (вызывается кнопкой и глобальным хоткеем)
                return _win.Invoke(() =>
                {
                    var ov = EnsureOverlay();
                    if (ov.Visible) { ov.Hide(); return false; }
                    ov.Show();
                    ov.BringToFront();
                    return true;
                });
            case "overlay.set":
            {
                var cfg = ToNode(a.ElementAtOrDefault(0));
                _overlayConfig = cfg?.DeepClone();
                _win.BeginInvoke(() => _overlay?.Apply(cfg));
                return null;
            }
            case "overlay.stats":
            {
                var stats = ToNode(a.ElementAtOrDefault(0));
                _win.BeginInvoke(() => _overlay?.SetStats(stats));
                return null;
            }
            case "overlay.beginDrag":
                _win.BeginInvoke(() => _overlay?.BeginDrag());
                return null;
            case "overlay.beginResize":
            {
                // страница сообщает, за какой край тянут: "e" | "s" | "se"
                var dir = Str(a, 0) ?? "se";
                _win.BeginInvoke(() => _overlay?.BeginResize(dir));
                return null;
            }
            case "overlay.center":
                _win.BeginInvoke(() => EnsureOverlay().CenterOnScreen());
                return null;

            /* ---------- каналы: реальные коннекторы площадок ---------- */
            case "channels.connect":
            {
                var sub = ToNode(a.ElementAtOrDefault(0))?.Deserialize<ChannelSubInput>()
                    ?? throw new InvalidOperationException("channels.connect: нет параметров");
                _connectors.Connect(sub);
                return null;
            }
            case "channels.disconnect":
            {
                var sub = ToNode(a.ElementAtOrDefault(0))?.Deserialize<ChannelSubInput>()
                    ?? throw new InvalidOperationException("channels.disconnect: нет параметров");
                _connectors.Disconnect(sub.platform, sub.username);
                return null;
            }
            case "channels.reconnect":
            {
                var sub = ToNode(a.ElementAtOrDefault(0))?.Deserialize<ChannelSubInput>()
                    ?? throw new InvalidOperationException("channels.reconnect: нет параметров");
                _connectors.Connect(sub); // Connect сам гасит предыдущий экземпляр
                return null;
            }

            /* ---------- виджет OBS ---------- */
            case "widget.config":
            {
                // ссылка в OBS постоянная — оформление доставляется по SSE
                var cfg = ToNode(a.ElementAtOrDefault(0));
                if (!_widget.Running) _widget.Start(IntSetting("widgetPort", 8085));
                _widget.BroadcastConfig(cfg);
                return null;
            }
            /* ---------- звуки наград за баллы канала → в источник OBS ---------- */
            case "widget.sound":
            {
                // Окно приложения уже играет звук само; здесь он уходит в OBS,
                // чтобы награда была слышна на трансляции.
                var node = ToNode(a.ElementAtOrDefault(0));
                var sound = node?["sound"]?.GetValue<string>() ?? "";
                // JsonNode, а не JsonElement: мост приносит объект уже
                // разобранным, и шаблон JsonElement здесь не компилируется.
                var volume = node?["volume"] is JsonValue volVal && volVal.TryGetValue<double>(out var volNum)
                    ? volNum
                    : 0.7;
                if (!_widget.Running) _widget.Start(IntSetting("widgetPort", 8085));
                _widget.BroadcastSound(sound, volume);
                return null;
            }
            case "widget.rewardSounds":
            {
                // Библиотека своих файлов звуков наград: страница виджета играет
                // их сама, поэтому список передаём целиком, а не байты на
                // каждую награду.
                var list = ToNode(a.ElementAtOrDefault(0));
                if (!_widget.Running) _widget.Start(IntSetting("widgetPort", 8085));
                _widget.BroadcastRewardSounds(list);
                return null;
            }

            /* ---------- полоса донатов: OBS-виджет ---------- */
            case "donatebar.info":
            {
                // Текущее состояние полосы (старт/цель/итог/стиль) — для
                // раздела «Донаты»: итог показывает живой, сброс — по кнопке.
                if (!_widget.Running) _widget.Start(IntSetting("widgetPort", 8085));
                return DonateBarSnapshot();
            }
            case "donatebar.reset":
            {
                // Ручной сброс: итог возвращается к стартовой сумме (по
                // умолчанию 0). Счётчик живёт в настройках хоста, поэтому
                // закрытие приложения сумму не трогает — только этот вызов.
                lock (_donateBarGate)
                {
                    var bar = _settings["donatebar"] as JsonObject;
                    var currency = DonateBarCur(bar);
                    var start = DonateBarNum(bar, "start");
                    _settings["donatebarTotal"] = new JsonObject { [currency] = start };
                    SaveSettings(immediate: true);
                }
                var snapshot = DonateBarSnapshot();
                try { _widget.BroadcastDonateBar(snapshot); } catch { }
                try { _win.SendEvent("donatebar.update", snapshot); } catch { }
                return null;
            }

            /* ---------- MemeAlerts: вход по OAuth (раздел «Донаты») ---------- */
            case "memealerts.status":
                return MaStatusPayload(ReadMaSettings());

            case "memealerts.authorize":
            {
                // Полный Authorization Code flow: браузер открывает страницу
                // согласия, редирект с кодом ловит одноразовый локальный
                // слушатель (тот же паттерн, что вход в VK Видео Live).
                var cfg = ReadMaSettings();
                if (cfg == null || cfg.ClientId.Length == 0 || cfg.ClientSecret.Length == 0)
                    throw new InvalidOperationException(
                        "Сначала впишите Client ID и Client Secret приложения MemeAlerts");
                var uri = new Uri(cfg.RedirectUri);
                if (!uri.IsLoopback)
                    throw new InvalidOperationException(
                        "Адрес возврата MemeAlerts должен указывать на этот компьютер (localhost)");

                var state = Guid.NewGuid().ToString("N");
                const string scopes = "oauth-user-show oauth-donation-subscribe";
                var authorize = "https://memealerts.com/oauth/authorize"
                    + "?client_id=" + Uri.EscapeDataString(cfg.ClientId)
                    + "&redirect_uri=" + Uri.EscapeDataString(cfg.RedirectUri)
                    + "&response_type=code"
                    + "&scope=" + Uri.EscapeDataString(scopes)
                    + "&state=" + state;

                try
                {
                    System.Diagnostics.Process.Start(
                        new System.Diagnostics.ProcessStartInfo(authorize) { UseShellExecute = true });
                }
                catch { throw new InvalidOperationException("Не удалось открыть браузер"); }

                using var listener = new MaCallbackListener(uri.Port);
                string cbCode = "", cbState = "", cbError = "";
                try
                {
                    (cbCode, cbState, cbError) =
                        await listener.WaitAsync(uri.AbsolutePath, TimeSpan.FromMinutes(10));
                }
                catch (InvalidOperationException)
                {
                    // Таймаут или закрытый слушатель — человек просто не
                    // успел подтвердить вход в браузере.
                    throw new InvalidOperationException(
                        "Вход в MemeAlerts не подтверждён вовремя — нажмите «Подключить» ещё раз");
                }
                if (cbError.Length > 0)
                    throw new InvalidOperationException($"MemeAlerts отклонил вход: {cbError}");
                if (!string.Equals(cbState, state, StringComparison.Ordinal))
                    throw new InvalidOperationException("Код подтверждения не совпал — повторите попытку");
                if (cbCode.Length == 0)
                    throw new InvalidOperationException("MemeAlerts не вернул код доступа");

                var (access, refresh, expires) = await MaTokenAsync(cfg,
                    new Dictionary<string, string>
                    {
                        ["grant_type"] = "authorization_code",
                        ["code"] = cbCode,
                    }, CancellationToken.None);

                // Кто подключён — для статуса в «Донатах» (поле необязательное:
                // без имени аккаунт всё равно работает).
                string name = "", code = "";
                try
                {
                    using var http = Net.Http(TimeSpan.FromSeconds(20));
                    http.DefaultRequestHeaders.Authorization =
                        new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", access);
                    var resp = await http.GetAsync(
                        "https://memealerts.com/api/v1/user/oauth", CancellationToken.None);
                    if (resp.IsSuccessStatusCode)
                    {
                        using var doc = JsonDocument.Parse(
                            await resp.Content.ReadAsStringAsync(CancellationToken.None));
                        if (doc.RootElement.TryGetProperty("data", out var data))
                        {
                            name = MaStrProp(data, "name");
                            code = MaStrProp(data, "code");
                        }
                    }
                }
                catch { /* имя не критично */ }

                cfg.AccessToken = access;
                cfg.RefreshToken = refresh;
                cfg.ExpiresAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + expires * 1000;
                cfg.Name = name;
                cfg.Code = code;
                WriteMaSettings(cfg);
                AppLog.Info("memealerts", $"Аккаунт подключён: {name} ({code})");
                // Подключённый канал подхватит новые токены сразу.
                _connectors.RefreshAuth("memealerts");
                return new { ok = true, name, code };
            }
            case "memealerts.logout":
            {
                var cfg = ReadMaSettings();
                if (cfg != null)
                {
                    cfg.AccessToken = "";
                    cfg.RefreshToken = "";
                    cfg.ExpiresAtMs = 0;
                    cfg.Name = "";
                    cfg.Code = "";
                    WriteMaSettings(cfg);
                    AppLog.Info("memealerts", "Аккаунт отключён");
                    _connectors.RefreshAuth("memealerts");
                }
                return new { ok = true };
            }

            /* ---------- список наград за баллы канала (Twitch и VK) ---------- */
            case "rewards.list":
            {
                // Награды авторизованного канала: интерфейс заранее создаёт
                // строки правил, пользователю остаётся выбрать звук.
                var platform = (Str(a, 0) ?? "").Trim();
                var channel = (Str(a, 1) ?? "").Trim().TrimStart('@');
                if (platform == "vkplay")
                {
                    // Награды VK отдаются владельцу канала по тому же входу,
                    // что и отправка сообщений, — отдельной настройки не нужно.
                    try
                    {
                        var vkChannel = VkChannel(channel);
                        IReadOnlyList<VkLiveApi.Reward> vkRewards;
                        try
                        {
                            vkRewards = await VkApiAsync(t => VkLiveApi.RewardsAsync(vkChannel, t));
                        }
                        catch
                        {
                            var fallbackChannel = VkLiveApi.NormalizeChannel(_settings["botChannel:vkplay"]?.GetValue<string>() ?? "");
                            if (fallbackChannel.Length > 0 && !string.Equals(fallbackChannel, vkChannel, StringComparison.OrdinalIgnoreCase))
                                vkRewards = await VkApiAsync(t => VkLiveApi.RewardsAsync(fallbackChannel, t));
                            else
                                throw;
                        }
                        // id → название и цена: событие активации награды может прийти
                        // без названия, и тогда звук выбирался бы неверно.
                        foreach (var reward in vkRewards)
                            RewardCatalog.RememberVk(reward.Id, reward.Name, reward.Price);
                        return new
                        {
                            ok = true,
                            error = "",
                            rewards = vkRewards
                                .Select(r => new { id = r.Id, title = r.Name, cost = r.Price })
                                .ToArray(),
                        };
                    }
                    catch (Exception ex)
                    {
                        return new { ok = false, error = ex.Message, rewards = Array.Empty<object>() };
                    }
                }
                if (platform != "twitch")
                    return new
                    {
                        ok = false,
                        error = "Список наград загружается с Twitch и VK Видео Live — награды других площадок добавляются вручную",
                        rewards = Array.Empty<object>(),
                    };
                var list = await TwitchRewards.ListAsync(channel);
                return new
                {
                    ok = list.ok,
                    error = list.error,
                    rewards = list.rewards
                        .Select(r => new { id = r.Id, title = r.Title, cost = r.Cost })
                        .ToArray(),
                };
            }
            /* ---------- тестовое уведомление в оверлей и виджет ---------- */
            case "test.notify":
            {
                var target = (Str(a, 0) ?? "both").ToLowerInvariant();
                var toOverlay = target is "overlay" or "both";
                var toWidget = target is "widget" or "both";
                if (toWidget && !_widget.Running) _widget.Start(IntSetting("widgetPort", 8085));

                var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                // Показываем сразу три вида сообщений: обычное, донат и
                // подписку — так видно оформление всех типов событий.
                var demo = new object[]
                {
                    new { platform = "twitch", channel = "test", author = "YawaChat",
                          color = "#a78bfa", text = "Проверка оформления — обычное сообщение",
                          kind = "chat", ts = now },
                    new { platform = "donationalerts", channel = "test", author = "Тестовый зритель",
                          color = "#FFB454", text = "Тестовый донат — спасибо за стрим!",
                          kind = "donate", amount = 250.0, currency = "₽", ts = now + 1 },
                    new { platform = "twitch", channel = "test", author = "Новый подписчик",
                          color = "#4ade80", text = "оформил подписку", kind = "sub", ts = now + 2 },
                };

                if (toOverlay) { try { _overlay?.Forward("chat.batch", demo); } catch { } }
                if (toWidget) { try { _widget.Push("chat.batch", demo); } catch { } }
                return null;
            }

            case "widget.info":
            {
                if (!_widget.Running) _widget.Start(IntSetting("widgetPort", 8085));
                return new { url = $"http://127.0.0.1:{_widget.Port}/widget", port = _widget.Port, running = _widget.Running };
            }

            /* ---------- снятие строк с показа в виджете OBS и оверлее ---------- */
            case "chat.hide":
            {
                // Сообщение скрыто фильтром или автомодерацией в окне приложения —
                // в публичном потоке его быть не должно.
                if (a.Length > 0 && a[0] != null) HideFromPublic(a[0]!);
                return null;
            }

            /* ---------- глобальные хоткеи ---------- */
            case "hotkeys.apply":
            {
                var map = new Dictionary<string, string>();
                if (a.Length > 0 && ToNode(a[0]) is JsonObject o)
                    foreach (var kv in o) map[kv.Key] = kv.Value?.GetValue<string>() ?? "";
                _win.BeginInvoke(() => _win.ApplyHotkeys(map));
                return null;
            }

            /* ---------- отправка сообщения в чат (приложение и команды бота) ---------- */
            case "chat.send":
            {
                var platform = Str(a, 0) ?? "";
                var channel = (Str(a, 1) ?? "").Trim().TrimStart('@', '#');
                var text = Str(a, 2) ?? "";
                var pin = a.Length > 3 ? Int(a, 3) : 0;
                // Окно приложения уже показало это сообщение само (флаг в
                // вызове). Площадка вернёт его обратно в поток чата — такое
                // эхо в ленту окна не отправляем, иначе строка дублируется.
                // Twitch присылает копию только когда сообщение ушло ради
                // закрепления; VK — всегда. Для обычной отправки в Twitch
                // ничего не запоминаем: копии не будет, а лишняя запись могла
                // бы скрыть похожее сообщение зрителя.
                var echoShownInApp = a.Length > 4 && Bool(a, 4)
                    && (platform.Equals("vkplay", StringComparison.OrdinalIgnoreCase) || pin != 0);
                if (text.Length == 0) return null;
                if (echoShownInApp) SelfEchoGuard.Remember(platform, channel, text);
                try
                {
                    await SendChatAsync(platform, channel, text, pin == 0 ? null : pin == -1 ? null : pin, pin == -1);
                }
                catch
                {
                    // Отправка не удалась — снимаем ожидание эха, чтобы оно не
                    // «съело» чужое сообщение с таким же текстом.
                    if (echoShownInApp) SelfEchoGuard.Forget(platform, channel, text);
                    throw;
                }
                return new { ok = true };
            }

            /* ---------- реальная модерация на площадке ---------- */
            case "moderation.run":
            {
                var req = ToNode(a.ElementAtOrDefault(0))
                    ?? throw new InvalidOperationException("moderation.run: нет параметров");
                return await RunModerationAsync(req);
            }

            /* ---------- авторизация чат-бота (Twitch, VK Видео Live) ---------- */
            case "bot.login":
            {
                var platform = Str(a, 0) ?? "";
                if (platform == "vkplay") return await VkLoginAsync();
                if (platform != "twitch")
                    throw new InvalidOperationException("Авторизация чат-бота доступна для Twitch и VK Видео Live");
                var res = await AppAuth.AuthorizeAsync(platform);
                return CompleteLogin(platform, res);
            }
            case "bot.verify":
            {
                var platform = Str(a, 0) ?? "";
                var token = (Str(a, 1) ?? "").Trim();
                if (token.Length == 0) throw new InvalidOperationException("Пустой токен");
                if (platform == "vkplay") return await VkVerifyAsync(token);
                if (platform != "twitch")
                    throw new InvalidOperationException("Авторизация чат-бота доступна для Twitch и VK Видео Live");
                var account = await AppAuth.VerifyAsync(platform, token);
                _settings[$"botToken:{platform}"] = token;
                _settings.Remove($"botUserId:{platform}");
                SaveSettings(immediate: true);
                ConnectorManager.BotToken = token.Replace("oauth:", "", StringComparison.OrdinalIgnoreCase);
                ConnectorManager.BotLogin = account;
                _connectors.RefreshTwitchAuth();
                _win.SendEvent("bot.authorized", new { platform, account, channel = account });
                return new { account, token };
            }
            case "bot.logout":
            {
                var platform = Str(a, 0) ?? "";
                if (platform == "vkplay")
                {
                    await VkLogoutAsync();
                    return null;
                }
                if (platform != "twitch") return null;
                _settings.Remove("botToken:twitch");
                _settings.Remove("botUserId:twitch");
                _settings.Remove("botRefresh:twitch");
                SaveSettings(immediate: true);
                ConnectorManager.BotToken = "";
                ConnectorManager.BotLogin = "";
                _connectors.RefreshTwitchAuth();
                return null;
            }

            /* ---------- баллы канала и роли VK Видео Live ----------
               Полный набор действий официального API: интерфейсу сейчас нужен
               только список наград, остальное доступно сценариям пользователя
               через этот же мост. */
            case "vk.rewards":
            {
                var channel = VkChannel(Str(a, 0));
                var rewards = await VkApiAsync(token => VkLiveApi.RewardsAsync(channel, token));
                return rewards
                    .Select(r => new { id = r.Id, title = r.Name, cost = r.Price, disabled = r.Disabled })
                    .ToArray();
            }
            case "vk.reward.enable":
            case "vk.reward.disable":
            {
                var channel = VkChannel(Str(a, 0));
                var reward = await VkRewardIdAsync(channel, Str(a, 1) ?? "");
                var enable = method == "vk.reward.enable";
                await VkApiAsync(token => enable
                    ? VkLiveApi.EnableRewardAsync(channel, reward, token)
                    : VkLiveApi.DisableRewardAsync(channel, reward, token));
                return new { ok = true };
            }
            case "vk.reward.activate":
            {
                var channel = VkChannel(Str(a, 0));
                var reward = await VkRewardIdAsync(channel, Str(a, 1) ?? "");
                var message = Str(a, 2) ?? "";
                await VkApiAsync(token => VkLiveApi.ActivateRewardAsync(channel, reward, message, token));
                return new { ok = true };
            }
            case "vk.reward.demands":
            {
                var channel = VkChannel(Str(a, 0));
                var page = await VkApiAsync(token => VkLiveApi.DemandsAsync(channel, token));
                return new
                {
                    isLast = page.IsLast,
                    demands = page.Demands
                        .Select(d => new
                        {
                            id = d.Id, rewardId = d.RewardId,
                            userId = d.UserId, user = d.UserNick, status = d.Status,
                        })
                        .ToArray(),
                };
            }
            case "vk.reward.accept":
            case "vk.reward.reject":
            {
                var channel = VkChannel(Str(a, 0));
                var demandId = Long(a, 1);
                if (demandId <= 0) throw new InvalidOperationException("Не передан id заявки на награду");
                var accept = method == "vk.reward.accept";
                await VkApiAsync(token => accept
                    ? VkLiveApi.AcceptDemandAsync(channel, demandId, token)
                    : VkLiveApi.RejectDemandAsync(channel, demandId, token));
                return new { ok = true };
            }
            case "vk.members":
            {
                var channel = VkChannel(Str(a, 0));
                var members = await VkApiAsync(token => VkLiveApi.MembersAsync(channel, token));
                return members
                    .Select(m => new
                    {
                        id = m.Id, nick = m.Nick, avatar = m.AvatarUrl,
                        moderator = m.IsModerator, owner = m.IsOwner,
                    })
                    .ToArray();
            }
            case "vk.roles":
            {
                var channel = VkChannel(Str(a, 0));
                var roles = await VkApiAsync(token => VkLiveApi.RolesAsync(channel, token));
                return roles.Select(r => new { id = r.Id, name = r.Name }).ToArray();
            }
            case "vk.roles.set":
            {
                var channel = VkChannel(Str(a, 0));
                var userId = Long(a, 1);
                if (userId <= 0) throw new InvalidOperationException("Не передан id зрителя");
                var ids = new List<string>();
                if (a.ElementAtOrDefault(2) is JsonElement list && list.ValueKind == JsonValueKind.Array)
                    foreach (var item in list.EnumerateArray().Take(50))
                        if (item.ValueKind == JsonValueKind.String)
                            ids.Add(item.GetString() ?? "");
                await VkApiAsync(token => VkLiveApi.SetUserRolesAsync(channel, userId, ids, token));
                return new { ok = true };
            }

            /* ---------- диагностический пакет ---------- */
            case "diagnostics.export":
            {
                var channels = new List<(string platform, string status)>();
                if (a.Length > 0 && a[0] is JsonElement items && items.ValueKind == JsonValueKind.Array)
                    foreach (var item in items.EnumerateArray().Take(100))
                    {
                        if (item.ValueKind != JsonValueKind.Object) continue;
                        if (item.TryGetProperty("platform", out var p) && p.ValueKind == JsonValueKind.String &&
                            item.TryGetProperty("status", out var s) && s.ValueKind == JsonValueKind.String)
                            channels.Add((p.GetString() ?? "", s.GetString() ?? ""));
                    }
                using var dialog = new SaveFileDialog
                {
                    Filter = "Архив ZIP (*.zip)|*.zip",
                    DefaultExt = "zip",
                    AddExtension = true,
                    FileName = $"YawaChat-diagnostics-{DateTime.Now:yyyyMMdd-HHmmss}.zip",
                    Title = "Сохранить диагностический пакет",
                };
                if (dialog.ShowDialog(_win) != DialogResult.OK) return false;
                DiagnosticPackage.Create(dialog.FileName, AppLog.DirectoryPath,
                    System.Windows.Forms.Application.ProductVersion, channels);
                return true;
            }

            /* ---------- сбои интерфейса ---------- */
            case "diagnostics.rendererError":
            {
                // Только подтверждённая страница приложения может вызвать
                // мост. Даже ей не доверяем произвольный текст исключения.
                var kind = Str(a, 0);
                if (kind is not ("Error" or "TypeError" or "RangeError" or "ReferenceError" or "SyntaxError"))
                    kind = "Error";
                var component = Str(a, 1) ?? "unknown";
                if (component.Length is < 1 or > 64 ||
                    component.Any(ch => !char.IsAsciiLetterOrDigit(ch) && ch != '_'))
                    component = "unknown";
                AppLog.Error("renderer", $"Сбой интерфейса: {kind} ({component})");
                return null;
            }

            /* ---------- система ---------- */
            case "clipboard.set":
                _win.BeginInvoke(() => { try { Clipboard.SetText(Str(a, 0) ?? ""); } catch { } });
                return null;
            case "shell.openExternal":
            {
                // Только http/https в браузере по умолчанию. Мост вызывается
                // из интерфейса, поэтому любые другие схемы (file:, ms-,
                // javascript:, «powershell» как путь к файлу и т.п.)
                // запускать нельзя.
                var extUrl = Str(a, 0) ?? "";
                if (IsWebUrl(extUrl))
                    try { Process.Start(new ProcessStartInfo(extUrl) { UseShellExecute = true }); } catch { }
                return null;
            }

            /* ---------- автозапуск с Windows (1.9) ---------- */
            case "system.getAutostart":
                return DesktopShortcut.GetAutostart();
            case "system.setAutostart":
                DesktopShortcut.SetAutostart(Bool(a, 0));
                return null;

            default:
                throw new InvalidOperationException($"unknown method {method}");
        }
    }

    /* ==================== VK ВИДЕО LIVE: ВХОД И ДОСТУП ====================
       Схема повторяет рабочую авторизацию расширения VkLiveService: вход в
       браузере по коду, затем пара токенов приложения. Данные приложения
       (ClientId/ClientSecret/RedirectUri) лежат в одном месте — VkLiveAuth.cs. */

    /// Продление токена выполняется строго по одному: иначе два параллельных
    /// ответа бота обменяли бы один и тот же refresh дважды и второй сломался.
    private readonly SemaphoreSlim _vkTokenGate = new(1, 1);

    private async Task<object> VkLoginAsync()
    {
        var session = await VkLiveAuth.AuthorizeAsync();
        StoreVkSession(session.Tokens, session.Profile);
        return new { account = session.Profile.Nick, channel = session.Profile.Channel };
    }

    /// Запасной путь: пользователь вставил токен доступа руками.
    private async Task<object> VkVerifyAsync(string token)
    {
        var profile = await VkLiveAuth.ProfileAsync(token);
        // Такой токен приложение не продлевает — срок жизни задаёт площадка.
        StoreVkSession(new VkLiveAuth.Tokens(token, "", DateTime.UtcNow.AddYears(1)), profile);
        return new { account = profile.Nick, channel = profile.Channel, token };
    }

    private async Task VkLogoutAsync()
    {
        var access = _settings["botToken:vkplay"]?.GetValue<string>() ?? "";
        var refresh = _settings["botRefresh:vkplay"]?.GetValue<string>() ?? "";

        // Сначала отзываем доступ у площадки, потом забываем локально:
        // так в кабинете VK не остаётся висящих разрешений.
        await VkLiveAuth.RevokeAsync(access, "access_token");
        await VkLiveAuth.RevokeAsync(refresh, "refresh_token");

        foreach (var key in new[]
                 {
                     "botToken:vkplay", "botRefresh:vkplay", "botExpires:vkplay",
                     "botChannel:vkplay", "botNick:vkplay", "botAvatar:vkplay",
                 })
            _settings.Remove(key);
        SaveSettings(immediate: true);
        _connectors.RefreshAuth("vkplay");
    }

    private void StoreVkSession(VkLiveAuth.Tokens tokens, VkLiveAuth.Profile? profile)
    {
        var previousAccess = _settings["botToken:vkplay"]?.GetValue<string>() ?? "";
        _settings["botToken:vkplay"] = tokens.Access;
        _settings["botRefresh:vkplay"] = tokens.Refresh;
        _settings["botExpires:vkplay"] = tokens.ExpiresAtUtc.ToString("o");
        if (profile != null)
        {
            _settings["botChannel:vkplay"] = profile.Channel;
            _settings["botNick:vkplay"] = profile.Nick;
            _settings["botAvatar:vkplay"] = profile.AvatarUrl;
        }
        SaveSettings(immediate: true);   // вход нельзя потерять при закрытии

        // Если пользователь только что вошёл/переавторизовался, уже открытые
        // публичные чаты нужно переподключить с новым токеном подписки наград.
        // При фоновом refresh этого не делаем: активный сокет не следует дёргать.
        if (profile != null && !string.Equals(previousAccess, tokens.Access, StringComparison.Ordinal))
            _connectors.RefreshAuth("vkplay");

        if (profile != null)
            _win.SendEvent("bot.authorized", new
            {
                platform = "vkplay",
                account = profile.Nick,
                channel = profile.Channel,
            });
    }

    /// <summary>
    /// Действующий токен VK: при необходимости молча продлевает вход по
    /// сохранённому refresh-токену, как это делает Twitch.
    /// </summary>
    private async Task<string> VkAccessTokenAsync(bool forceRefresh = false)
    {
        await _vkTokenGate.WaitAsync();
        try
        {
            var access = _settings["botToken:vkplay"]?.GetValue<string>() ?? "";
            var refresh = _settings["botRefresh:vkplay"]?.GetValue<string>() ?? "";
            if (access.Length == 0 && refresh.Length == 0)
                throw new InvalidOperationException(
                    "Войдите в VK Видео Live в разделе «Чат-бот»");

            var expires = DateTime.MaxValue;
            if (_settings["botExpires:vkplay"]?.GetValue<string>() is { Length: > 0 } raw
                && DateTime.TryParse(
                    raw,
                    System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.AdjustToUniversal
                    | System.Globalization.DateTimeStyles.AssumeUniversal,
                    out var parsed))
                expires = parsed;

            var stale = forceRefresh
                || access.Length == 0
                || DateTime.UtcNow >= expires.AddMinutes(-1);
            if (!stale) return access;

            if (refresh.Length == 0)
            {
                // Токен вставляли вручную — продлевать нечем.
                if (!forceRefresh && access.Length > 0) return access;
                _win.SendEvent("bot.expired", new { platform = "vkplay" });
                throw new InvalidOperationException(
                    "Доступ к VK Видео Live истёк — войдите заново в разделе «Чат-бот»");
            }

            var renewed = await VkLiveAuth.RefreshAsync(refresh);
            if (renewed == null)
            {
                // Сообщаем интерфейсу ОДИН раз, вместо потока одинаковых ошибок.
                _win.SendEvent("bot.expired", new { platform = "vkplay" });
                throw new InvalidOperationException(
                    "Доступ к VK Видео Live отозван — войдите заново в разделе «Чат-бот»");
            }

            StoreVkSession(renewed, null);
            return renewed.Access;
        }
        finally
        {
            _vkTokenGate.Release();
        }
    }

    /// Получает актуальный токен только для VK-коннектора. Ошибка входа не
    /// должна мешать анонимному чтению публичного чата.
    private async Task<string> VkAccessTokenForConnectorAsync()
    {
        var access = _settings["botToken:vkplay"]?.GetValue<string>() ?? "";
        var refresh = _settings["botRefresh:vkplay"]?.GetValue<string>() ?? "";
        if (access.Length == 0 && refresh.Length == 0) return "";
        try { return await VkAccessTokenAsync(); }
        catch (Exception ex)
        {
            AppLog.Warning("vk", $"Не удалось обновить вход для событий наград ({ex.GetType().Name})");
            return "";
        }
    }

    /// Вызов API с одной повторной попыткой: если площадка отвергла токен,
    /// продлеваем вход и повторяем — пользователь ничего не замечает.
    private async Task<T> VkApiAsync<T>(Func<string, Task<T>> call)
    {
        var token = await VkAccessTokenAsync();
        try
        {
            return await call(token);
        }
        catch (VkLiveApi.UnauthorizedException)
        {
            return await call(await VkAccessTokenAsync(forceRefresh: true));
        }
    }

    private async Task VkApiAsync(Func<string, Task> call) =>
        await VkApiAsync<bool>(async token =>
        {
            await call(token);
            return true;
        });

    /// Канал VK: из аргумента, иначе собственный канал вошедшего аккаунта.
    private string VkChannel(string? requested)
    {
        var ownChannel = VkLiveApi.NormalizeChannel(_settings["botChannel:vkplay"]?.GetValue<string>() ?? "");
        var ownNick = VkLiveApi.NormalizeChannel(_settings["botNick:vkplay"]?.GetValue<string>() ?? "");
        var channel = VkLiveApi.NormalizeChannel(requested ?? "");
        // Если передано отображаемое имя аккаунта (nick), а канонический URL
        // собственного канала отличается — используем URL канала.
        if (channel.Length == 0
            || (ownChannel.Length > 0 && string.Equals(channel, ownNick, StringComparison.OrdinalIgnoreCase)))
        {
            if (ownChannel.Length > 0) channel = ownChannel;
        }
        if (channel.Length == 0)
            throw new InvalidOperationException("Не указан канал VK Видео Live");
        return channel;
    }

    /// Предзаполняет справочник наград VK из сохранённых правил rewardSounds,
    /// чтобы события активации знали названия наград сразу после старта приложения.
    private void SeedVkRewardCatalogFromSettings()
    {
        try
        {
            if (_settings["rewardSounds"] is not JsonObject rs) return;
            if (rs["rules"] is not JsonArray rules) return;
            foreach (var node in rules)
            {
                if (node is not JsonObject rule) continue;
                var platform = rule["platform"]?.GetValue<string>() ?? "";
                if (platform.Length > 0 && !string.Equals(platform, "vkplay", StringComparison.OrdinalIgnoreCase))
                    continue;
                var id = rule["id"]?.ToString() ?? "";
                var title = rule["title"]?.GetValue<string>() ?? "";
                int? cost = rule["cost"] is JsonValue cv && cv.TryGetValue<int>(out var ci) ? ci : null;
                if (id.Length > 0 && title.Length > 0)
                    RewardCatalog.RememberVk(id, title, cost);
            }
        }
        catch { }
    }

    /// Награду можно задавать и названием, как её видит зритель.
    private async Task<string> VkRewardIdAsync(string channel, string rewardIdOrName)
    {
        var value = rewardIdOrName.Trim();
        if (value.Length == 0) throw new InvalidOperationException("Не указана награда VK Видео Live");

        var byName = await VkApiAsync(token => VkLiveApi.RewardIdByNameAsync(channel, value, token));
        return byName.Length > 0 ? byName : value;
    }

    /// <summary>
    /// Настройки чата VK идут через DevAPI. Для индивидуальной модерации
    /// оставлена только отправка /ban; API подтверждает приём сообщения,
    /// но не результат выполнения команды на площадке.
    /// </summary>
    private async Task<object> RunVkModerationAsync(
        string action, string channel, string author, int seconds)
    {
        var name = VkChannel(channel);

        void Log(LogLevel level, string line) =>
            AppLog.Write(LogFile.Moderation, level, "vk", line);

        if (action == "ban")
        {
            var target = (author ?? "").Trim().TrimStart('@');
            if (target.Length == 0 || target.Length > 64
                || target.Any(ch => char.IsControl(ch) || char.IsWhiteSpace(ch) || ch == '/'))
                throw new InvalidOperationException("У сообщения VK нет корректного ника зрителя для команды бана");

            // Обычная отправка сообщения поддерживается API; выполнение /ban
            // зависит от распознавания команды площадкой, поэтому не шлём moderation.result.
            await SendChatAsync("vkplay", name, $"/ban {target}");
            Log(LogLevel.Warning, $"ban канал={name}: команда /ban отправлена; выполнение автоматически не подтверждено");
            return new { ok = true, sent = true, experimental = true };
        }

        switch (action)
        {
            case "mode-slow":
            case "mode-slow-off":
            {
                var pause = action == "mode-slow-off" ? 0 : Math.Clamp(seconds <= 0 ? 10 : seconds, 1, 1800);
                await VkApiAsync(token => VkLiveApi.EditChatSettingsAsync(
                    name, token, settings => settings["any_message_timeout"] = pause));
                break;
            }

            case "mode-emote":
            case "mode-emote-off":
            {
                var onlySmiles = action == "mode-emote";
                await VkApiAsync(token => VkLiveApi.EditChatSettingsAsync(
                    name, token, settings => settings["mode"] = onlySmiles
                        ? new Dictionary<string, object?> { ["only_smiles"] = new Dictionary<string, object?>() }
                        : new Dictionary<string, object?>
                        {
                            ["general"] = new Dictionary<string, object?>
                            {
                                ["is_caps_prohibited"] = false,
                                ["is_links_prohibited"] = false,
                                ["is_ru_en_numbers"] = false,
                            },
                        }));
                break;
            }

            case "mode-followers":
            case "mode-subs":
            case "mode-followers-off":
            case "mode-subs-off":
            {
                var access = action switch
                {
                    "mode-followers" => "followers",
                    "mode-subs" => "subscribers",
                    _ => "all",
                };
                await VkApiAsync(token => VkLiveApi.EditChatSettingsAsync(
                    name, token, settings => settings["allow_access"] = access));
                break;
            }

            case "mode-clear":
                throw new InvalidOperationException(
                    "Очистка чата VK через публичный DevAPI не подтверждена — используйте интерфейс площадки");

            default:
                throw new InvalidOperationException($"Неизвестное действие модерации {action}");
        }

        Log(LogLevel.Info, $"{action} канал={name}: применено");
        _win.SendEvent("moderation.result", new
        {
            ok = true, action, platform = "vkplay", channel = name,
            msgId = (string?)null, userId = (string?)null, author = "",
        });
        return new { ok = true };
    }

    /// <summary>
    /// Завершение входа Twitch: сохраняем токен и включаем бота в уже
    /// работающих коннекторах.
    /// </summary>
    private object CompleteLogin(string platform, AppAuth.AuthResult res)
    {
        if (platform != "twitch")
            throw new InvalidOperationException("Авторизация чат-бота доступна только для Twitch");

        _settings["botToken:twitch"] = res.Token;
        _settings.Remove("botUserId:twitch");
        if (!string.IsNullOrWhiteSpace(res.Refresh))
            _settings["botRefresh:twitch"] = res.Refresh;
        SaveSettings(immediate: true);

        ConnectorManager.BotToken = res.Token;
        ConnectorManager.BotLogin = res.Account;
        _connectors.RefreshTwitchAuth();
        _win.SendEvent("bot.authorized", new
        {
            platform = "twitch",
            account = res.Account,
            channel = res.Account,
        });
        return new { account = res.Account };
    }

    /// Реальные коннекторы (Twitch IRC, Kick pusher, VK/TikTok WS) вызывают это —
    /// сообщение уходит в ленту, оверлей и виджет, как electron-канал "chat".
    /// <summary>
    /// Единая точка входа реального чата. ВАЖНО: вызывается из фоновых потоков
    /// коннекторов, поэтому обращение к WebView2 обязано быть потокобезопасным
    /// и полностью защищённым — иначе исключение убивало коннектор
    /// (Twitch «переподключался» на каждом сообщении) и ломало доставку в оверлей.
    /// </summary>
    /* Потокобезопасный транспорт сообщений. Один JSON/PostMessage на пачку
       вместо трёх сериализаций каждого сообщения (главное окно/оверлей/OBS).
       Очередь ограничена: при лавине сообщений (спам-канал, зависший UI)
       старые отбрасываются, а память не раздувается бесконечно. */
    private readonly System.Collections.Concurrent.ConcurrentQueue<object> _chatPending = new();
    private readonly System.Threading.Timer _chatFlushTimer;
    private int _chatFlushScheduled;
    private int _chatQueueCount;
    private long _chatSeq;
    private const int MaxChatQueue = 4000;

    /* ---------- здоровье эфира (1.4) ----------
       Счётчики переподключений за сессию: площадка, которая была онлайн
       в этой сессии и снова появилась после обрыва, — переподключение.
       Задержка сообщений меряется в интерфейсе (там и ts приёма, и момент,
       когда строка добралась до ленты). Снимок уходит событием
       stream.health раз в 10 секунд и сразу при переподключении. */
    private readonly object _healthLock = new();
    private readonly Dictionary<string, int> _healthReconnects = new();
    /// Каналы, сейчас «в эфире» (online) или с подключённым чатом (connected).
    private readonly Dictionary<string, bool> _healthChannelUp = new();
    /// Каналы, уже бывшие подключёнными в этой сессии: повторное
    /// подключение после обрыва — переподключение, а не первый вход.
    private readonly Dictionary<string, bool> _healthEverUp = new();
    private readonly DateTimeOffset _healthStarted = DateTimeOffset.Now;
    private readonly System.Threading.Timer _healthTimer;

    /// <summary>
    /// Минимальная сумма доната для показа. DonationAlerts присылает подписки
    /// и фолловы как «донат на 0», поэтому мелочь отсекается до попадания в
    /// ленту, оверлей и виджет. Значение берётся из настроек раздела «Донаты».
    /// </summary>
    private double MinDonateShow =>
        _settings["donate"] is JsonObject d && d["minShowAmount"] is JsonValue v
            && v.TryGetValue<double>(out var min) ? min : 10;

    /* ---------- MemeAlerts (раздел «Донаты»): OAuth 2.0 + Centrifugo ------
       Креды приложения (Client ID/Secret — выдаёт поддержка MemeAlerts при
       регистрации) и OAuth-токены аккаунта живут в секции настроек
       «memealerts» и шифруются как subscriptions. Коннектору через провайдер
       отдаётся действующий access token: просроченный молча продлевают по
       refresh token. Токены у площадки ОДНОРАЗОВЫЕ (ротация): каждый
       успешный refresh возвращает новую пару, и её сразу сохраняем —
       повторный запрос старым refresh после grace-периода (60 с) уже даёт
       invalid_grant и сессию придётся авторизовать заново. */

    /// Адрес возврата по умолчанию. Пользователь регистрирует приложение у
    /// поддержки MemeAlerts именно с этим redirect URI.
    public const string MaDefaultRedirectUri = "http://localhost:8580/yawachatma";

    /// Продление и обмен токенов — под блокировкой: refresh у MemeAlerts
    /// одноразовый, и два параллельных запроса одной парой рвут сессию.
    private readonly SemaphoreSlim _maSem = new(1, 1);

    private static string MaStr(JsonObject? obj, string key) =>
        obj?[key] is JsonValue v && v.TryGetValue<string>(out var s) ? s : "";

    private MemeAlertsAuth? ReadMaSettings()
    {
        if (_settings["memealerts"] is not JsonObject obj) return null;
        var redirect = MaStr(obj, "redirectUri");
        return new MemeAlertsAuth
        {
            ClientId = MaStr(obj, "clientId"),
            ClientSecret = MaStr(obj, "clientSecret"),
            RedirectUri = redirect.Length > 0 ? redirect : MaDefaultRedirectUri,
            AccessToken = MaStr(obj, "accessToken"),
            RefreshToken = MaStr(obj, "refreshToken"),
            ExpiresAtMs = obj["expiresAtMs"] is JsonValue ev && ev.TryGetValue<long>(out var e) ? e : 0,
            Name = MaStr(obj, "name"),
            Code = MaStr(obj, "code"),
        };
    }

    private void WriteMaSettings(MemeAlertsAuth cfg, bool immediate = true)
    {
        _settings["memealerts"] = new JsonObject
        {
            ["clientId"] = cfg.ClientId,
            ["clientSecret"] = cfg.ClientSecret,
            ["redirectUri"] = cfg.RedirectUri,
            ["accessToken"] = cfg.AccessToken,
            ["refreshToken"] = cfg.RefreshToken,
            ["expiresAtMs"] = cfg.ExpiresAtMs,
            ["name"] = cfg.Name,
            ["code"] = cfg.Code,
        };
        SaveSettings(immediate);
    }

    /// Токен-эндпоинт MemeAlerts: exchange authorization code и refresh.
    private static async Task<(string access, string refresh, long expiresSec)> MaTokenAsync(
        MemeAlertsAuth cfg, Dictionary<string, string> extra, CancellationToken ct)
    {
        using var http = Net.Http(TimeSpan.FromSeconds(20));
        var form = new Dictionary<string, string>
        {
            ["grant_type"] = extra["grant_type"],
            ["client_id"] = cfg.ClientId,
            ["client_secret"] = cfg.ClientSecret,
        };
        foreach (var kv in extra)
            if (kv.Key != "grant_type") form[kv.Key] = kv.Value;
        if (extra["grant_type"] == "authorization_code") form["redirect_uri"] = cfg.RedirectUri;

        using var response = await http.PostAsync(
            "https://memealerts.com/oauth/token", new FormUrlEncodedContent(form), ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            var err = MaStrProp(JsonDocument.Parse(body).RootElement, "error");
            throw new InvalidOperationException(
                $"MemeAlerts: токен-запрос отклонён ({(int)response.StatusCode}"
                    + (err.Length > 0 ? $", {err}" : "") + ")");
        }

        using var doc = JsonDocument.Parse(body);
        var access = MaStrProp(doc.RootElement, "access_token");
        var refresh = MaStrProp(doc.RootElement, "refresh_token");
        long expires = 3600;
        if (doc.RootElement.TryGetProperty("expires_in", out var ei) && ei.TryGetInt64(out var e))
            expires = e;
        if (access.Length == 0)
            throw new InvalidOperationException("MemeAlerts: в ответе нет access_token");
        return (access, refresh, expires);
    }

    private static string MaStrProp(JsonElement el, string name) =>
        el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString() ?? ""
            : "";

    /// Действующая авторизация MemeAlerts: просроченный access token
    /// продлевают по refresh (новая пара сразу в настройки). Null — аккаунт
    /// не подключён либо нужен повторный «Подключить» (refresh отозван/сгорел).
    private async Task<MemeAlertsAuth?> MemeAlertsAuthAsync(CancellationToken ct)
    {
        await _maSem.WaitAsync(ct);
        try
        {
            var cfg = ReadMaSettings();
            if (cfg == null || cfg.AccessToken.Length == 0) return null;

            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (cfg.ExpiresAtMs - 60_000 > now) return cfg;   // ещё жив
            if (cfg.RefreshToken.Length == 0)
                return cfg.ExpiresAtMs > now ? cfg : null;   // grace-период

            try
            {
                var (access, refresh, expires) = await MaTokenAsync(cfg,
                    new Dictionary<string, string>
                    {
                        ["grant_type"] = "refresh_token",
                        ["refresh_token"] = cfg.RefreshToken,
                    }, ct);
                cfg.AccessToken = access;
                cfg.RefreshToken = refresh.Length > 0 ? refresh : cfg.RefreshToken;
                cfg.ExpiresAtMs = now + expires * 1000;
                WriteMaSettings(cfg);
                AppLog.Info("memealerts", "Access token продлён");
                return cfg;
            }
            catch (Exception ex)
            {
                AppLog.Warning("memealerts", $"Не удалось продлить токен: {ex.Message}");
                return cfg.ExpiresAtMs > now ? cfg : null;
            }
        }
        finally
        {
            _maSem.Release();
        }
    }

    /// Статус для раздела «Донаты» без самих секретов.
    private static object MaStatusPayload(MemeAlertsAuth? cfg) => new
    {
        configured = cfg != null && cfg.ClientId.Length > 0 && cfg.ClientSecret.Length > 0,
        connected = cfg != null && cfg.AccessToken.Length > 0,
        name = cfg?.Name ?? "",
        code = cfg?.Code ?? "",
    };

    /* ---------- полоса донатов (OBS-виджет) ----------
       Общая сумма ДЕНЕЖНЫХ донатов всех площадок: счётчик живёт в настройках
       хоста (ключ donatebarTotal) и переживает закрытие приложения — сброс
       только ручной, из раздела «Донаты». Состояние донатится всем
       Browser Source событием donatebar.config при подключении источника и
       обновляется событием donatebar.update на каждый донат/сброс. */

    /// Валюты, которые считаются «деньгами» полосы (знаки, как их
    /// нормализуют коннекторы). Мемкоины/биты — нет: у них своя валюта.
    private static readonly HashSet<string> MoneyCurrencies =
        new(StringComparer.Ordinal) { "₽", "$", "€", "₴", "₸" };

    private readonly object _donateBarGate = new();

    private static double DonateBarNum(JsonObject? bar, string key) =>
        bar?[key] is JsonValue v && v.TryGetValue<double>(out var d) ? d : 0;

    private static string DonateBarCur(JsonObject? bar)
    {
        var c = bar?["currency"] is JsonValue v && v.TryGetValue<string>(out var s) ? s : "₽";
        return MoneyCurrencies.Contains(c) ? c : "₽";
    }

    private static readonly HashSet<string> DonateBarStyleIds =
        new(StringComparer.Ordinal) { "potion", "ring", "graffiti", "scope", "sakura", "quest", "ice" };

    private static string DonateBarStyle(JsonObject? bar)
    {
        var s = bar?["style"] is JsonValue v && v.TryGetValue<string>(out var id) ? id : "";
        return DonateBarStyleIds.Contains(s) ? s : "potion";
    }

    private static string DonateBarTitle(JsonObject? bar)
    {
        var t = bar?["title"] is JsonValue v && v.TryGetValue<string>(out var s) ? s.Trim() : "";
        if (t.Length == 0) return "Донаты";
        return t.Length > 40 ? t.Substring(0, 40) : t;
    }

    private static bool DonateBarOnly(JsonObject? bar) =>
        bar?["barOnly"] is JsonValue v && v.TryGetValue<bool>(out var b) && b;

    /// Снимок состояния полосы для интерфейса и виджета.
    private object DonateBarSnapshot()
    {
        lock (_donateBarGate)
        {
            var bar = _settings["donatebar"] as JsonObject;
            var start = DonateBarNum(bar, "start");
            var goal = DonateBarNum(bar, "goal");
            var currency = DonateBarCur(bar);
            var style = DonateBarStyle(bar);
            var title = DonateBarTitle(bar);
            var barOnly = DonateBarOnly(bar);

            var totals = _settings["donatebarTotal"] as JsonObject ?? new JsonObject();
            // Повышение стартовой суммы поднимает текущий итог: полоса не
            // уходит «до нуля» от правки настроек.
            double main = totals[currency] is JsonValue mv && mv.TryGetValue<double>(out var m) ? m : 0;
            if (main < start)
            {
                totals[currency] = start;
                _settings["donatebarTotal"] = totals;
                SaveSettings();
            }
            return new
            {
                start,
                goal,
                currency,
                style,
                title,
                barOnly,
                totals = totals.DeepClone(),
            };
        }
    }

    /// Денежный донат → в суммарный счётчик полосы.
    private void DonateBarAdd(double amount, string currency)
    {
        if (amount <= 0 || !MoneyCurrencies.Contains(currency)) return;

        lock (_donateBarGate)
        {
            var totals = _settings["donatebarTotal"] as JsonObject ?? new JsonObject();
            double cur = totals[currency] is JsonValue v && v.TryGetValue<double>(out var d) ? d : 0;
            totals[currency] = Math.Round(cur + amount, 2);
            _settings["donatebarTotal"] = totals;
            SaveSettings();
        }

        var snapshot = DonateBarSnapshot();
        try { _widget.BroadcastDonateBar(snapshot); } catch { }
        try { _win.SendEvent("donatebar.update", snapshot); } catch { }
    }

    public void PushChatMessage(object message)
    {
        // Сквозной номер строки: по нему окно приложения сообщает, что
        // сообщение скрыто фильтром, и публичный поток (виджет OBS, оверлей)
        // убирает его из показа.
        if (message is ChatEvent numbered && numbered.sid == 0)
            numbered.sid = Interlocked.Increment(ref _chatSeq);

        // Полоса донатов: ДЕНЕЖНЫЕ донаты любой площадки прибавляются в
        // суммарный счётчик ДО порога «не показывать мелкие» — порог скрывает
        // строку из ленты, но реальные деньги в цели считаются всегда.
        if (message is ChatEvent bar && bar.kind == "donate" && (bar.amount ?? 0) > 0)
            DonateBarAdd(bar.amount!.Value, bar.currency ?? "");

        if (message is ChatEvent ev && ev.kind == "donate")
        {
            var floor = MinDonateShow;
            if (floor > 0 && (ev.amount ?? 0) < floor) return;
        }

        Interlocked.Increment(ref _chatQueueCount);
        _chatPending.Enqueue(message);
        while (_chatQueueCount > MaxChatQueue && _chatPending.TryDequeue(out _))
            Interlocked.Decrement(ref _chatQueueCount);
        if (Interlocked.CompareExchange(ref _chatFlushScheduled, 1, 0) == 0)
            _chatFlushTimer.Change(80, Timeout.Infinite);
    }

    /// <summary>
    /// Убрать строки из публичного потока — виджета OBS и оверлея.
    ///
    /// Окно приложения показывает удалённые сообщения перечёркнутыми, а на
    /// стрим они попадать не должны: раньше сообщение, снятое автомодерацией
    /// или удалённое модератором, оставалось в виджете навсегда.
    ///
    /// payload: { sids: [номера строк], msgIds: [id у площадки],
    ///            platform, author, all }
    /// </summary>
    public void HideFromPublic(object payload)
    {
        try { _widget.Push("chat.hide", payload); } catch { }
        try { _overlay?.Forward("chat.hide", payload); } catch { }
    }

    private void FlushChatBatch()
    {
        var list = new List<object>(32);
        while (list.Count < 256 && _chatPending.TryDequeue(out var item))
        {
            list.Add(item);
            Interlocked.Decrement(ref _chatQueueCount);
        }

        Interlocked.Exchange(ref _chatFlushScheduled, 0);
        if (list.Count > 0)
        {
            var batch = list.ToArray();
            // Свои сообщения окно уже показало в момент отправки: в ленту окна
            // копия от площадки не идёт (иначе дубль), а в виджет OBS и оверлей
            // кадр уходит как обычно — там нужен полный чат.
            var toApp = batch;
            var hasOwnEcho = false;
            foreach (var item in batch)
            {
                if (item is ChatEvent e && e.echoOfOwn) { hasOwnEcho = true; break; }
            }
            if (hasOwnEcho)
            {
                var filtered = new List<object>(batch.Length);
                foreach (var item in batch)
                {
                    if (item is ChatEvent e && e.echoOfOwn) continue;
                    filtered.Add(item);
                }
                toApp = filtered.ToArray();
            }
            try { _win.SendEvent("chat.batch", toApp); } catch { }
            try { _overlay?.Forward("chat.batch", batch); } catch { }
            try { _widget.Push("chat.batch", batch); } catch { }
        }

        // Сообщения могли прийти ровно во время сброса — запускаем следующий кадр.
        if (!_chatPending.IsEmpty && Interlocked.CompareExchange(ref _chatFlushScheduled, 1, 0) == 0)
            _chatFlushTimer.Change(80, Timeout.Infinite);
    }

    /* ---------- здоровье эфира (1.4) ---------- */

    /// Считает переподключения по сменам статуса каналов. Переподключение —
    /// когда канал, уже подключённый в этой сессии, снова стал online или
    /// connected после обрыва (connecting/offline/error). Смена «эфир
    /// закончился» (online → connected) переподключением не считается:
    /// коннектор при этом не рвётся, а продолжает ждать новый эфир.
    private void NoteHealthStatus(string platform, string username, string status)
    {
        bool reconnected = false;
        lock (_healthLock)
        {
            bool up = status == "online" || status == "connected";
            string key = platform + "/" + username.ToLowerInvariant();
            if (up && !_healthChannelUp.ContainsKey(key))
            {
                if (_healthEverUp.ContainsKey(key))
                {
                    int c = _healthReconnects.GetValueOrDefault(platform);
                    _healthReconnects[platform] = c + 1;
                    reconnected = true;
                }
                _healthEverUp[key] = true;
            }
            if (up) _healthChannelUp[key] = true;
            else _healthChannelUp.Remove(key);
        }
        if (reconnected)
        {
            AppLog.Info("health", $"Переподключение: {platform}/{username}");
            SendStreamHealth(force: true);
        }
    }

    /// Текущий снимок: переподключения за сессию, виджет OBS, начало сессии.
    /// Задержку сообщений интерфейс меряет сам — у него и момент приёма
    /// (ts), и момент показа строки.
    private object BuildStreamHealth()
    {
        var per = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        DateTimeOffset started;
        lock (_healthLock)
        {
            foreach (var (p, c) in _healthReconnects)
                if (c > 0) per[p] = c;
            started = _healthStarted;
        }
        return new
        {
            at = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            startedAt = started.ToUnixTimeMilliseconds(),
            reconnects = per,
            obs = new
            {
                running = _widget.Running,
                sources = _widget.SourceCount,
                port = _widget.Port,
            },
        };
    }

    private int _lastHealthReconnectsHash;
    private bool _lastObsRunning;
    private int _lastObsSources;
    private int _lastObsPort;
    private int _healthHeartbeatTicks;

    private void SendStreamHealth(bool force = false)
    {
        try
        {
            int recHash = 17;
            lock (_healthLock)
            {
                foreach (var (p, c) in _healthReconnects)
                    recHash = HashCode.Combine(recHash, p, c);
            }
            bool changed = recHash != _lastHealthReconnectsHash ||
                           _widget.Running != _lastObsRunning ||
                           _widget.SourceCount != _lastObsSources ||
                           _widget.Port != _lastObsPort;

            // Не спамим событием в WebView2 каждые 10 секунд, если данные
            // не изменились: редкий пульс (раз в 60 с) сохраняем.
            if (!force && !changed && ++_healthHeartbeatTicks < 6) return;

            _healthHeartbeatTicks = 0;
            _lastHealthReconnectsHash = recHash;
            _lastObsRunning = _widget.Running;
            _lastObsSources = _widget.SourceCount;
            _lastObsPort = _widget.Port;

            _win.SendEvent("stream.health", BuildStreamHealth());
        }
        catch { /* снимок — необязательный сервис */ }
    }

    /* ---------- общие ресурсы Twitch API (без пересоздания на каждый вызов) ---------- */
    private static HttpClient? _twitchHttp;
    private static string _twitchHttpToken = "";
    private static readonly object _twitchHttpGate = new();
    private static readonly Dictionary<string, string> _twitchUserIds = new(StringComparer.OrdinalIgnoreCase);
    private static (string modId, string login, HashSet<string> scopes) _twitchIdentity;
    private static string _twitchIdentityToken = "";
    private static DateTime _twitchIdentityAt;

    private static HttpClient TwitchHttp(string token)
    {
        lock (_twitchHttpGate)
        {
            if (_twitchHttp != null && _twitchHttpToken == token) return _twitchHttp;
            _twitchHttp?.Dispose();
            var http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
            http.DefaultRequestHeaders.UserAgent.ParseAdd(Net.UA);
            http.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");
            http.DefaultRequestHeaders.Add("Client-Id", AppAuth.TwitchClientId);
            _twitchHttp = http;
            _twitchHttpToken = token;
            return http;
        }
    }

    /// user_id, login и scope токена. Кэш на 5 минут — /validate больше
    /// не вызывается на каждое действие модерации.
    /// Метод вызывается с потоков нескольких каналов, поэтому кэш под
    /// блокировкой: без неё два запроса могли одновременно перезаписать
    /// поля кэша и один из них увидел бы смешанное состояние.
    private static readonly object _identityGate = new();

    private static async Task<(string, string, HashSet<string>)> TwitchIdentityAsync(string token)
    {
        lock (_identityGate)
        {
            if (_twitchIdentityToken == token && (DateTime.UtcNow - _twitchIdentityAt).TotalMinutes < 5)
                return _twitchIdentity;
        }

        using var vh = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        vh.DefaultRequestHeaders.Add("Authorization", $"OAuth {token}");
        var res = await vh.GetAsync("https://id.twitch.tv/oauth2/validate");
        var body = await res.Content.ReadAsStringAsync();
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException("Токен Twitch истёк — выйдите и войдите заново");

        using var doc = JsonDocument.Parse(body);
        var modId = Net.FindString(doc.RootElement, "user_id") ?? "";
        var login = (Net.FindString(doc.RootElement, "login") ?? "").ToLowerInvariant();
        var scopes = doc.RootElement.TryGetProperty("scopes", out var sa) && sa.ValueKind == JsonValueKind.Array
            ? sa.EnumerateArray().Select(x => x.GetString() ?? "").ToHashSet(StringComparer.Ordinal)
            : new HashSet<string>(StringComparer.Ordinal);

        // Результат фиксируем ВНУТРИ блокировки: иначе параллельное
        // обновление для другого токена могло подменить кэш до return,
        // и этот вызов вернул бы чужие данные.
        (string, string, HashSet<string>) identity;
        lock (_identityGate)
        {
            identity = (modId, login, scopes);
            _twitchIdentity = identity;
            _twitchIdentityToken = token;
            _twitchIdentityAt = DateTime.UtcNow;
        }
        return identity;
    }

    /// <summary>
    /// Отправка сообщения в Twitch или VK Видео Live от имени авторизованного
    /// аккаунта. Twitch использует Helix/IRC; VK — официальный метод отправки
    /// сообщения в чат.
    /// </summary>
    private async Task SendChatAsync(string platform, string channel, string text, int? pinDurationSeconds = null, bool pinUntilStreamEnd = false)
    {
        if (platform == "vkplay")
        {
            // Закрепление сообщений официальное API VK не предусматривает.
            if (pinDurationSeconds.HasValue || pinUntilStreamEnd)
                throw new InvalidOperationException(
                    "VK Видео Live не умеет закреплять сообщения — отправьте ответ без закрепления");
            await VkApiAsync(token => VkLiveApi.SendMessageAsync(channel, text, token));
            return;
        }
        if (platform != "twitch")
            throw new InvalidOperationException("Отправка сообщений поддержана для Twitch и VK Видео Live");
        var needsPin = pinDurationSeconds.HasValue || pinUntilStreamEnd;

        var token = (_settings["botToken:twitch"]?.GetValue<string>() ?? "")
            .Replace("oauth:", "", StringComparison.OrdinalIgnoreCase).Trim();
        if (token.Length == 0)
            throw new InvalidOperationException("Войдите через Twitch в разделе «Чат-бот»");

        void Log(LogLevel level, string line)
        {
            AppLog.Write(LogFile.Bot, level, "twitch", line);
        }

        // 1) ОСНОВНОЙ путь — IRC: тому же соединению, что читает чат, достаточно
        // права chat:edit, которое есть и у старых токенов. Helix требует
        // user:write:chat, из-за чего ответы молча не отправлялись.
        if (!needsPin && await TwitchIrcConnector.TrySendAsync(channel, text))
        {
            // Закрепление требует ID сообщения, поэтому для него используется
            // Helix, а обычные ответы по-прежнему идут быстрым IRC-путём.
            Log(LogLevel.Info, $"IRC -> #{channel}: сообщение отправлено");
            return;
        }

        // 2) Запасной путь — Helix (если IRC-подключение ещё не поднялось)
        var http = TwitchHttp(token);
        var (senderId, _, scopes) = await TwitchIdentityAsync(token);
        if (!scopes.Contains("user:write:chat"))
        {
            Log(LogLevel.Warning, $"IRC недоступен, нет прав на отправку через API (канал {channel})");
            throw new InvalidOperationException(
                "Бот не подключён к чату канала. Переподключите канал или войдите в Twitch заново");
        }

        var broadcasterId = await TwitchUserIdAsync(http, channel);
        if (broadcasterId.Length == 0)
            throw new InvalidOperationException($"Twitch не нашёл канал «{channel}»");

        var payload = JsonSerializer.Serialize(new
        {
            broadcaster_id = broadcasterId,
            sender_id = senderId,
            message = text.Length > 500 ? text[..500] : text,
        });
        using var content = new StringContent(payload, System.Text.Encoding.UTF8, "application/json");
        var res = await http.PostAsync("https://api.twitch.tv/helix/chat/messages", content);
        var body = await res.Content.ReadAsStringAsync();
        Log(res.IsSuccessStatusCode ? LogLevel.Info : LogLevel.Warning,
            $"Helix -> #{channel}: код {(int)res.StatusCode}");
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException($"Twitch ({(int)res.StatusCode}): {body}");

        if (!needsPin) return;
        using var responseDoc = JsonDocument.Parse(body);
        var messageId = responseDoc.RootElement.TryGetProperty("data", out var sentData)
            && sentData.GetArrayLength() > 0
            ? Net.FindString(sentData[0], "message_id") ?? ""
            : "";
        if (messageId.Length == 0)
            throw new InvalidOperationException("Twitch не вернул ID отправленного сообщения для закрепления");
        await PinChatMessageAsync(http, broadcasterId, senderId, messageId, pinUntilStreamEnd ? null : pinDurationSeconds);
    }

    private static async Task PinChatMessageAsync(HttpClient http, string broadcasterId, string moderatorId, string messageId, int? durationSeconds)
    {
        var url = $"https://api.twitch.tv/helix/chat/pins?broadcaster_id={Uri.EscapeDataString(broadcasterId)}&moderator_id={Uri.EscapeDataString(moderatorId)}&message_id={Uri.EscapeDataString(messageId)}";
        if (durationSeconds.HasValue) url += $"&duration_seconds={Math.Clamp(durationSeconds.Value, 30, 1800)}";
        using var response = await http.PutAsync(url, null);
        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadAsStringAsync();
            throw new InvalidOperationException($"Сообщение отправлено, но Twitch не закрепил его ({(int)response.StatusCode}): {error}");
        }
    }

    /// ID пользователя Twitch по логину (с общим кэшем).
    private static async Task<string> TwitchUserIdAsync(HttpClient http, string login)
    {
        login = login.Trim().ToLowerInvariant();
        if (login.Length == 0) return "";
        lock (_twitchUserIds)
            if (_twitchUserIds.TryGetValue(login, out var cached)) return cached;

        var r = await http.GetAsync($"https://api.twitch.tv/helix/users?login={Uri.EscapeDataString(login)}");
        var body = await r.Content.ReadAsStringAsync();
        if (!r.IsSuccessStatusCode)
            throw new InvalidOperationException($"Twitch users API ({(int)r.StatusCode}): {body}");
        using var d = JsonDocument.Parse(body);
        if (!d.RootElement.TryGetProperty("data", out var arr) || arr.GetArrayLength() == 0) return "";
        var id = Net.FindString(arr[0], "id") ?? "";
        if (id.Length > 0) lock (_twitchUserIds) _twitchUserIds[login] = id;
        return id;
    }

    /// <summary>
    /// Настоящая модерация Twitch через Helix API. Не доверяем IRC-тегам:
    /// broadcaster_id, moderator_id и target user_id проверяются/получаются
    /// через Helix. В moderation.log пишем действие и HTTP-статус,
    /// но не тело ответа сервера и не токен.
    /// </summary>
    private async Task<object?> RunModerationAsync(JsonNode req)
    {
        var action = req["action"]?.GetValue<string>() ?? "";
        var platform = req["platform"]?.GetValue<string>() ?? "";
        var channel = (req["channel"]?.GetValue<string>() ?? "").Trim().TrimStart('@', '#').ToLowerInvariant();
        var authorRaw = (req["author"]?.GetValue<string>() ?? "").Trim();
        var author = authorRaw.ToLowerInvariant();
        var msgId = req["msgId"]?.GetValue<string>();
        var userId = req["userId"]?.GetValue<string>();
        var seconds = req["seconds"] is JsonValue sv && sv.TryGetValue<double>(out var sd) ? (int)sd : 0;

        if (platform == "vkplay")
            return await RunVkModerationAsync(action, channel, authorRaw, seconds);

        if (platform != "twitch")
            throw new InvalidOperationException("Модерация поддержана для Twitch и VK Видео Live");

        var token = _settings["botToken:twitch"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(token))
            throw new InvalidOperationException("Сначала войдите через Twitch в разделе «Чат-бот»");

        void Log(LogLevel level, string line)
        {
            AppLog.Write(LogFile.Moderation, level, "twitch", line);
        }

        // ОДИН переиспользуемый HttpClient на процесс: раньше на каждое
        // действие создавались новые клиенты и три подряд сетевых запроса —
        // отсюда «работает через раз» и http timeout.
        var http = TwitchHttp(token!);

        // 1) Валидация токена и scope кэшируется на 5 минут для того же токена.
        var (modId, tokenLogin, scopes) = await TwitchIdentityAsync(token!);

        string requiredScope = action switch
        {
            "delete" or "mode-clear" => "moderator:manage:chat_messages",
            "ban" or "timeout" or "unban" => "moderator:manage:banned_users",
            var m when m.StartsWith("mode-") => "moderator:manage:chat_settings",
            _ => "",
        };
        if (requiredScope.Length > 0 && !scopes.Contains(requiredScope))
            throw new InvalidOperationException($"В токене нет права {requiredScope} — выйдите из Twitch и войдите заново");

        // 2) ID пользователя по login через Helix (с кэшем, чтобы не ходить
        // в сеть на каждое действие).
        async Task<string> UserIdByLogin(string login)
        {
            login = login.Trim().ToLowerInvariant();
            if (login.Length == 0) return "";
            lock (_twitchUserIds)
                if (_twitchUserIds.TryGetValue(login, out var cached)) return cached;

            var r = await http.GetAsync($"https://api.twitch.tv/helix/users?login={Uri.EscapeDataString(login)}");
            var body = await r.Content.ReadAsStringAsync();
            if (!r.IsSuccessStatusCode)
                throw new InvalidOperationException($"Twitch users API ({(int)r.StatusCode}): {body}");
            using var d = JsonDocument.Parse(body);
            if (!d.RootElement.TryGetProperty("data", out var arr) || arr.GetArrayLength() == 0) return "";
            var id = Net.FindString(arr[0], "id") ?? "";
            if (id.Length > 0) lock (_twitchUserIds) _twitchUserIds[login] = id;
            return id;
        }

        var broadcasterId = await UserIdByLogin(channel);
        if (broadcasterId.Length == 0)
            throw new InvalidOperationException($"Twitch не нашёл канал «{channel}»");
        if (modId.Length == 0)
            throw new InvalidOperationException("Twitch не вернул id авторизованного аккаунта");

        // Владелец канала — допустимый moderator_id. Для чужого канала аккаунт
        // должен быть модератором. Этот факт проверит сам Helix точным 403.
        if (string.IsNullOrWhiteSpace(userId) && author.Length > 0)
            userId = await UserIdByLogin(author);

        // Ограничение Twitch API: даже владелец НЕ МОЖЕТ удалить собственное
        // сообщение через Delete Chat Messages. Это не баг приложения.
        if (action == "delete" && userId == broadcasterId)
            throw new InvalidOperationException("Twitch запрещает удалять собственные сообщения владельца — проверьте на сообщении зрителя");

        var baseQuery =
            $"broadcaster_id={Uri.EscapeDataString(broadcasterId)}&moderator_id={Uri.EscapeDataString(modId)}";
        HttpResponseMessage res;
        string requestDesc;

        switch (action)
        {
            case "delete":
                if (string.IsNullOrWhiteSpace(msgId))
                    throw new InvalidOperationException("У сообщения нет id Twitch — переподключите канал и проверьте новое сообщение");
                requestDesc = $"DELETE chat message={msgId} channel={channel} moderator={tokenLogin}";
                res = await http.DeleteAsync(
                    $"https://api.twitch.tv/helix/moderation/chat?{baseQuery}&message_id={Uri.EscapeDataString(msgId)}");
                break;

            case "mode-clear":
                requestDesc = $"DELETE all chat channel={channel} moderator={tokenLogin}";
                res = await http.DeleteAsync($"https://api.twitch.tv/helix/moderation/chat?{baseQuery}");
                break;

            case "ban":
            case "timeout":
            {
                if (string.IsNullOrWhiteSpace(userId))
                    throw new InvalidOperationException($"Twitch не нашёл пользователя «{author}»");
                if (userId == broadcasterId)
                    throw new InvalidOperationException("Нельзя забанить владельца канала");
                var payload = action == "timeout"
                    ? $"{{\"data\":{{\"user_id\":\"{userId}\",\"duration\":{Math.Clamp(seconds, 1, 1_209_600)}}}}}"
                    : $"{{\"data\":{{\"user_id\":\"{userId}\"}}}}";
                requestDesc = $"POST {action} user={author} channel={channel} moderator={tokenLogin}";
                res = await http.PostAsync($"https://api.twitch.tv/helix/moderation/bans?{baseQuery}",
                    new StringContent(payload, System.Text.Encoding.UTF8, "application/json"));
                break;
            }

            case "unban":
                if (string.IsNullOrWhiteSpace(userId)) userId = await UserIdByLogin(author);
                if (string.IsNullOrWhiteSpace(userId))
                    throw new InvalidOperationException($"Twitch не нашёл пользователя «{author}»");
                requestDesc = $"DELETE unban user={author} channel={channel} moderator={tokenLogin}";
                res = await http.DeleteAsync(
                    $"https://api.twitch.tv/helix/moderation/bans?{baseQuery}&user_id={Uri.EscapeDataString(userId)}");
                break;

            case "mode-slow":
            case "mode-emote":
            case "mode-followers":
            case "mode-subs":
            case "mode-slow-off":
            case "mode-emote-off":
            case "mode-followers-off":
            case "mode-subs-off":
            {
                var body = action switch
                {
                    "mode-slow" => $"{{\"slow_mode\":true,\"slow_mode_wait_time\":{Math.Clamp(seconds <= 0 ? 10 : seconds, 3, 1800)}}}",
                    "mode-slow-off" => "{\"slow_mode\":false}",
                    "mode-emote" => "{\"emote_mode\":true}",
                    "mode-emote-off" => "{\"emote_mode\":false}",
                    "mode-followers" => "{\"follower_mode\":true}",
                    "mode-followers-off" => "{\"follower_mode\":false}",
                    "mode-subs" => "{\"subscriber_mode\":true}",
                    _ => "{\"subscriber_mode\":false}",
                };
                requestDesc = $"PATCH {action} channel={channel} moderator={tokenLogin}";
                var patch = new HttpRequestMessage(HttpMethod.Patch,
                    $"https://api.twitch.tv/helix/chat/settings?{baseQuery}")
                {
                    Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json"),
                };
                res = await http.SendAsync(patch);
                break;
            }

            default:
                throw new InvalidOperationException($"Неизвестное действие модерации {action}");
        }

        var responseBody = await res.Content.ReadAsStringAsync();
        Log(res.IsSuccessStatusCode ? LogLevel.Info : LogLevel.Warning,
            $"{requestDesc} -> код {(int)res.StatusCode}");
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException($"Twitch ({(int)res.StatusCode}): {responseBody}");

        // Это событие подтверждено реальным успешным HTTP-ответом Twitch (204/200).
        _win.SendEvent("moderation.result", new
        {
            ok = true, action, platform, channel, msgId, userId, author,
        });

        // В виджете OBS и оверлее строка должна исчезнуть сразу после
        // подтверждения площадки, а не ждать эха события из чата (оно
        // приходит не на каждое действие и не на каждый канал).
        if (string.Equals(action, "delete", StringComparison.OrdinalIgnoreCase))
        {
            if (!string.IsNullOrEmpty(msgId)) HideFromPublic(new { msgIds = new[] { msgId } });
        }
        else if (string.Equals(action, "ban", StringComparison.OrdinalIgnoreCase)
              || string.Equals(action, "timeout", StringComparison.OrdinalIgnoreCase))
        {
            HideFromPublic(new { platform, author, userId });
        }
        else if (string.Equals(action, "mode-clear", StringComparison.OrdinalIgnoreCase))
        {
            HideFromPublic(new { platform, all = true });
        }
        return new { ok = true, status = (int)res.StatusCode };
    }

    /* ---------- settings.json ---------- */

    /// Чтение файла настроек. Null — файла нет, он пуст или не читается как
    /// JSON-объект (обрезан при записи, повреждён диск, занят другим процессом).
    private static JsonObject? TryReadSettings(string path)
    {
        try
        {
            if (!File.Exists(path)) return null;
            var text = File.ReadAllText(path);
            if (string.IsNullOrWhiteSpace(text) || JsonNode.Parse(text) is not JsonObject parsed) return null;
            // Повреждённая версия схемы — тоже повреждённый профиль: пробуем
            // резервную копию вместо сброса приложения при миграции.
            if (parsed["schemaVersion"] != null)
            {
                var version = parsed["schemaVersion"]!.GetValue<int>();
                if (version < 0) return null;
            }
            return parsed;
        }
        catch { return null; }
    }

    private void LoadSettings()
    {
        /* ЦЕЛОСТНОСТЬ НАСТРОЕК. Основной файл может оказаться повреждённым:
           прежние версии писали его напрямую, и обрыв записи (выключение
           питания, аварийное завершение, кончившееся место на диске) оставлял
           обрезанный JSON. Для пользователя это означало потерю ВСЕХ каналов,
           входов и настроек — приложение стартовало пустым. Теперь вместо
           повреждённого файла берётся предыдущая рабочая копия. */
        bool mainExists;
        try { mainExists = File.Exists(_settingsPath); }
        catch { mainExists = false; }

        var parsed = mainExists ? TryReadSettings(_settingsPath) : null;
        if (parsed == null)
        {
            var backup = TryReadSettings(_settingsBackupPath);
            if (backup != null)
            {
                parsed = backup;
                if (mainExists)
                {
                    _settingsRestoredFromBackup = true;
                    AppLog.Warning("settings", "Основные настройки повреждены: восстановлены из резервной копии");
                    // Повреждённый основной файл убираем: иначе первое же
                    // сохранение положит его в копию вместо рабочей версии.
                    try { File.Delete(_settingsPath); } catch { }
                }
            }
            else if (mainExists)
            {
                AppLog.Error("settings", "Основные настройки не читаются, резервной копии нет");
            }
        }
        _settings = parsed ?? new JsonObject();

        // Секреты (токены чат-бота) в файле шифруются DPAPI — для работы
        // хосту нужны обычные строки, поэтому раскрываем их в памяти.
        // Старые записи (открытый текст) так же проходят без изменений.
        // ВАЖНО: не писать в _settings во время его перечисления — в .NET 8
        // JsonObject хранит свойства во внутреннем List, и запись «на лету»
        // роняет InvalidOperationException («Collection was modified»).
        // Поэтому два прохода: сначала копируем ключи, потом меняем значения.
        var keys = new List<string>(_settings.Count);
        foreach (var kv in _settings)
            keys.Add(kv.Key);
        foreach (var key in keys)
        {
            if (!SettingsCrypto.IsSensitiveKey(key)
                || _settings[key] is not JsonValue v
                || !v.TryGetValue<string>(out var s)) continue;

            var plain = SettingsCrypto.DecryptValue(s);
            if (key.Equals("subscriptions", StringComparison.OrdinalIgnoreCase) ||
                key.Equals("memealerts", StringComparison.OrdinalIgnoreCase))
            {
                // Новые версии сохраняют весь список как защищённую JSON-строку.
                // Старые версии уже хранили список массивом — он остаётся без изменений.
                try { _settings[key] = JsonNode.Parse(plain ?? "null"); }
                catch { _settings[key] = key.Equals("memealerts", StringComparison.OrdinalIgnoreCase)
                    ? new JsonObject()
                    : new JsonArray(); }
            }
            else
            {
                _settings[key] = plain;
            }
        }
    }

    /// Запланировать сохранение настроек. <paramref name="immediate"/> — для
    /// токенов входа: их нельзя потерять, если приложение закроют в эту же секунду.
    private void SaveSettings(bool immediate = false)
    {
        Interlocked.Exchange(ref _settingsDirty, 1);
        if (immediate)
        {
            WriteSettings();
            return;
        }
        try
        {
            _settingsSaveTimer?.Change(SettingsSaveDelayMs, Timeout.Infinite);
        }
        catch
        {
            WriteSettings();   // таймер уже закрыт — пишем сразу
        }
    }

    /// Реальная запись файла настроек (склеенные изменения пишутся одним разом).
    private void WriteSettings()
    {
        Interlocked.Exchange(ref _settingsDirty, 0);
        lock (_settingsGate)
        {
            try
            {
                WriteSettingsAtomic(BuildSettingsJson());
                if (_settingsWriteFailed)
                {
                    _settingsWriteFailed = false;
                    AppLog.Info("settings", "Сохранение настроек восстановилось");
                }
            }
            catch (Exception ex)
            {
                if (!_settingsWriteFailed)
                    AppLog.Error("settings", $"Не удалось сохранить настройки: {ex.GetType().Name}");
                _settingsWriteFailed = true;
                /* Запись не удалась: диск полон, файл держит антивирус, папка
                   только для чтения. Признак изменений возвращаем и взводим
                   таймер заново — иначе сохранение терялось до следующей
                   правки настроек (а при выходе приложения и вовсе). */
                Interlocked.Exchange(ref _settingsDirty, 1);
                try { _settingsSaveTimer?.Change(SettingsRetryDelayMs, Timeout.Infinite); }
                catch { /* таймер уже закрыт — повторит запись при выходе */ }
            }
        }
    }

    /// Содержимое файла настроек: копия текущего состояния с зашифрованными
    /// секретами.
    private string BuildSettingsJson()
    {
        // Шифруем КОПИЮ: живые значения в памяти хоста остаются
        // открытыми строками, иначе каждое следующее сохранение
        // шифровало бы уже зашифрованное значение.
        // Как и в LoadSettings: ключи сначала в List, потом запись —
        // JsonObject нельзя менять во время собственного перечисления.
        var toWrite = _settings.DeepClone() as JsonObject ?? new JsonObject();
        var keys = new List<string>(toWrite.Count);
        foreach (var kv in toWrite)
            keys.Add(kv.Key);
        foreach (var key in keys)
        {
            if (!SettingsCrypto.IsSensitiveKey(key) || toWrite[key] == null) continue;
            var node = toWrite[key]!;
            var plain = key.Equals("subscriptions", StringComparison.OrdinalIgnoreCase) ||
                        key.Equals("memealerts", StringComparison.OrdinalIgnoreCase)
                ? node.ToJsonString()
                : node is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;
            if (plain != null)
                toWrite[key] = SettingsCrypto.EncryptValue(plain);
        }
        return toWrite.ToJsonString(SettingsJsonOptions);
    }

    /// <summary>
    /// АТОМАРНАЯ запись настроек: содержимое сначала уходит целиком во
    /// временный файл в той же папке, сбрасывается на диск и только затем
    /// заменяет основной файл, а прежняя версия остаётся рабочей копией
    /// (settings.json.bak).
    ///
    /// Раньше писали прямо в settings.json: обрыв на середине записи оставлял
    /// обрезанный JSON, и при следующем запуске пропадали все каналы, входы и
    /// настройки. Теперь на диске не бывает промежуточного состояния —
    /// читатель видит либо прежний полный файл, либо новый полный файл.
    /// </summary>
    private void WriteSettingsAtomic(string json)
    {
        var dir = Path.GetDirectoryName(_settingsPath);
        if (string.IsNullOrEmpty(dir)) dir = Program.AppDir;
        Directory.CreateDirectory(dir);

        // Временный файл обязан лежать на том же томе, что и основной:
        // замена файла между томами не работает. Имя постоянное — записи
        // идут под общей блокировкой _settingsGate.
        var tmp = Path.Combine(dir, "settings.json.tmp");

        using (var fs = new FileStream(
                   tmp, FileMode.Create, FileAccess.Write, FileShare.None,
                   bufferSize: 4096, options: FileOptions.WriteThrough))
        using (var writer = new StreamWriter(fs, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false)))
        {
            writer.Write(json);
            writer.Flush();
            // Данные — на диск, а не в кэш системы: иначе обрыв питания
            // оставил бы на месте настроек пустой или обрезанный файл.
            fs.Flush(flushToDisk: true);
        }

        try
        {
            if (File.Exists(_settingsPath))
                File.Replace(tmp, _settingsPath, _settingsBackupPath, ignoreMetadataErrors: true);
            else
                File.Move(tmp, _settingsPath);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // Замена файла не удалась (его держит антивирус или индексатор) —
            // пишем напрямую и убираем временный файл. Хуже прежнего поведения
            // это не делает: содержимое уже собрано целиком.
            File.Copy(tmp, _settingsPath, overwrite: true);
            try { File.Delete(tmp); } catch { }
        }
    }

    /// Булева настройка из settings.json (нужна окну при запуске).
    public bool BoolSetting(string key, bool fallback) =>
        _settings.TryGetPropertyValue(key, out var b) && b is JsonValue bv && bv.TryGetValue<bool>(out var r)
            ? r
            : fallback;

    private int IntSetting(string key, int fallback) =>
        _settings.TryGetPropertyValue(key, out var n) && n is JsonValue v && v.TryGetValue<int>(out var i) ? i : fallback;

    /* ---------- утилиты аргументов ---------- */
    /// <summary>
    /// http/https-адрес: только такие можно открывать в системном браузере
    /// (защита от запуска произвольных схем/файлов через мост).
    /// </summary>
    private static bool IsWebUrl(string? url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var u)
        && (u.Scheme == Uri.UriSchemeHttp || u.Scheme == Uri.UriSchemeHttps);

    private static JsonNode? ToNode(object? v)
    {
        if (v is JsonElement el) return el.ValueKind == JsonValueKind.Undefined || el.ValueKind == JsonValueKind.Null ? null : JsonNode.Parse(el.GetRawText());
        if (v is JsonNode n) return n;
        return v == null ? null : JsonValue.Create(v);
    }
    private static string? Str(object?[] a, int i) =>
        a.ElementAtOrDefault(i) is JsonElement el && el.ValueKind == JsonValueKind.String ? el.GetString() : null;
    private static bool Bool(object?[] a, int i) =>
        a.ElementAtOrDefault(i) is JsonElement el && el.ValueKind == JsonValueKind.True;
    private static int Int(object?[] a, int i) =>
        a.ElementAtOrDefault(i) is JsonElement el && el.ValueKind == JsonValueKind.Number && el.TryGetInt32(out var n) ? n : 0;
    /// Длинные идентификаторы VK Видео Live (заявки на награды, зрители) в int не помещаются.
    private static long Long(object?[] a, int i) =>
        a.ElementAtOrDefault(i) is JsonElement el
        && el.ValueKind == JsonValueKind.Number && el.TryGetInt64(out var n) ? n : 0;

    /// Одноразовый HTTP-слушатель на время «Подключить» MemeAlerts: ловит
    /// редирект ?code=…&state=…, отдаёт браузеру страницу «можно закрыть»
    /// и закрывается. Живёт секунды, порт не занимает в остальное время.
    private sealed class MaCallbackListener : IDisposable
    {
        private readonly HttpListener _listener = new();

        public MaCallbackListener(int port)
        {
            _listener.Prefixes.Add($"http://localhost:{port}/");
            try
            {
                _listener.Start();
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException(
                    $"Порт {port} недоступен для подтверждения входа ({ex.GetType().Name}) — "
                    + "проверьте, что адрес возврата совпадает с зарегистрированным");
            }
        }

        public async Task<(string Code, string State, string Error)> WaitAsync(string path, TimeSpan timeout)
        {
            using var limit = new CancellationTokenSource(timeout);
            while (true)
            {
                HttpListenerContext ctx;
                try
                {
                    ctx = await _listener.GetContextAsync().WaitAsync(limit.Token);
                }
                catch (OperationCanceledException)
                {
                    throw new InvalidOperationException("подтверждение не получено вовремя");
                }
                catch
                {
                    throw new InvalidOperationException("слушатель подтверждения закрыт");
                }

                var url = ctx.Request.Url!;
                // Браузер заодно спросит /favicon.ico — такие запросы
                // закрываем молча и ждём настоящий редирект площадки.
                if (!string.Equals(url.AbsolutePath, path, StringComparison.OrdinalIgnoreCase))
                {
                    await RespondAsync(ctx, "Страница не найдена");
                    continue;
                }

                var code = QueryValue(url, "code");
                var state = QueryValue(url, "state");
                var error = QueryValue(url, "error");
                var description = QueryValue(url, "error_description");
                await RespondAsync(ctx, code.Length > 0
                    ? "Готово! Авторизация MemeAlerts завершена — можно закрыть это окно."
                    : "Вход не завершён. Вернитесь в YawaChat и попробуйте ещё раз.");
                return (code, state, (description.Length > 0 ? description : error).Trim());
            }
        }

        private static async Task RespondAsync(HttpListenerContext ctx, string message)
        {
            var page =
                "<!doctype html><html lang=\"ru\"><head><meta charset=\"utf-8\">"
                + "<title>YawaChat · MemeAlerts</title></head>"
                + "<body style=\"font-family:system-ui;background:#14161c;color:#e8eaf0;"
                + "display:flex;align-items:center;justify-content:center;height:100vh;margin:0\">"
                + $"<p style=\"font-size:18px\">{System.Net.WebUtility.HtmlEncode(message)}</p>"
                + "</body></html>";
            var bytes = Encoding.UTF8.GetBytes(page);
            ctx.Response.StatusCode = 200;
            ctx.Response.ContentType = "text/html; charset=utf-8";
            ctx.Response.ContentLength64 = bytes.Length;
            try
            {
                await ctx.Response.OutputStream.WriteAsync(bytes);
                ctx.Response.Close();
            }
            catch { /* браузер уже ушёл — неважно */ }
        }

        private static string QueryValue(Uri url, string name)
        {
            foreach (var pair in url.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
            {
                var eq = pair.IndexOf('=');
                var key = eq < 0 ? pair : pair[..eq];
                if (!string.Equals(key, name, StringComparison.OrdinalIgnoreCase)) continue;
                var value = eq < 0 ? "" : pair[(eq + 1)..];
                return Uri.UnescapeDataString(value.Replace('+', ' '));
            }
            return "";
        }

        public void Dispose()
        {
            try { _listener.Stop(); } catch { }
            try { _listener.Close(); } catch { }
        }
    }

    public void Dispose()
    {
        if (ConnectorManager.VkAccessTokenProvider?.Target == this)
            ConnectorManager.VkAccessTokenProvider = null;
        if (ConnectorManager.MemeAlertsAuthProvider?.Target == this)
            ConnectorManager.MemeAlertsAuthProvider = null;
        try { _chatFlushTimer.Dispose(); } catch { }
        while (_chatPending.TryDequeue(out _)) { }
        // Отложенные настройки обязаны попасть в файл до закрытия приложения.
        try { _settingsSaveTimer?.Dispose(); } catch { }
        if (Volatile.Read(ref _settingsDirty) == 1) WriteSettings();
        try { _ttsFifo.Dispose(); } catch { }
        try { _vkTokenGate.Dispose(); } catch { }
        try { _maSem.Dispose(); } catch { }
        _connectors.Dispose();
        _tts.Dispose();
        _edge.Dispose();
        _widget.Dispose();
        _overlay?.ForceClose();
        lock (_twitchHttpGate)
        {
            try { _twitchHttp?.Dispose(); } catch { }
            _twitchHttp = null;
            _twitchHttpToken = "";
        }
        lock (_twitchUserIds) _twitchUserIds.Clear();
    }
}
