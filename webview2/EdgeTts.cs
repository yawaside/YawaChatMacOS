using System.Net;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;

namespace YawaChat;

/// <summary>
/// Microsoft Edge Read Aloud TTS. Реализация актуального протокола edge-tts:
/// токен Sec-MS-GEC версии 2 (см. SecMsGec), MUID, заголовки настоящего
/// браузера Edge и новое соединение на каждую фразу. Короткие сообщения чата синтезируются целиком
/// и сразу проигрываются из памяти через NAudio, без временных файлов и
/// запуска внешнего плеера.
///
/// Основной упор — устойчивость связи. Сервис озвучки в ряде стран отвечает
/// нестабильно: провайдер ограничивает соединение, обрывает его на середине
/// фразы или отклоняет подключение из-за устаревшей версии браузера в токене.
/// Поэтому:
///   • версия браузера берётся из установленных в системе Edge/WebView2 —
///     она обновляется вместе с Windows и не устаревает, как зашитая строка;
///   • каждая фраза проходит короткую «лестницу» попыток: свежее соединение →
///     другая версия токена → другой сетевой маршрут → запасной адрес сервиса;
///   • молчание потока дольше нескольких секунд считается обрывом и ведёт к
///     повтору, а не к ожиданию общего timeout;
///   • длинный текст режется на куски — обрыв не теряет всю фразу.
///
/// Никаких VPN, прокси и средств обхода приложение НЕ содержит и не ставит:
/// используются только адреса Microsoft, а из сетевых настроек — те, что
/// пользователь сам задал в своей Windows (их .NET применяет по умолчанию).
/// </summary>
public sealed class EdgeTts : IDisposable
{
    public sealed record Voice(string Id, string Title, string Gender);

    /// <summary>
    /// Все голоса Edge TTS для приложения. Названия — просто имена на русском:
    /// пользователь выбирает знакомое имя, технический id скрыт.
    /// Multilingual-голоса озвучивают русский текст без акцента.
    /// </summary>
    public static readonly Voice[] AllVoices =
    {
        // базовые русские
        new("ru-RU-SvetlanaNeural", "Светлана", "Female"),
        new("ru-RU-DmitryNeural", "Дмитрий", "Male"),

        // Multilingual — свободно говорят по-русски
        new("en-US-AvaMultilingualNeural", "Ава", "Female"),
        new("en-US-EmmaMultilingualNeural", "Эмма", "Female"),
        new("en-US-AndrewMultilingualNeural", "Эндрю", "Male"),
        new("en-US-BrianMultilingualNeural", "Брайан", "Male"),
        new("en-AU-WilliamMultilingualNeural", "Уильям", "Male"),
        new("fr-FR-VivienneMultilingualNeural", "Вивьен", "Female"),
        new("fr-FR-RemyMultilingualNeural", "Реми", "Male"),
        new("de-DE-SeraphinaMultilingualNeural", "Серафина", "Female"),
        new("de-DE-FlorianMultilingualNeural", "Флориан", "Male"),
        new("it-IT-GiuseppeMultilingualNeural", "Джузеппе", "Male"),
        new("ko-KR-HyunsuMultilingualNeural", "Хёнсу", "Male"),
        new("pt-BR-ThalitaMultilingualNeural", "Талита", "Female"),
    };

    public const string DefaultVoice = "ru-RU-SvetlanaNeural";

    /// <summary>Понятное имя голоса по его техническому id.</summary>
    public static string TitleOf(string? voiceId)
    {
        if (string.IsNullOrWhiteSpace(voiceId)) return "Светлана";
        var found = Array.Find(AllVoices, v => v.Id.Equals(voiceId, StringComparison.OrdinalIgnoreCase));
        return found?.Title ?? "Светлана";
    }

    /// <summary>
    /// Пол облачного голоса («Female»/«Male»). По нему подбирается запасной
    /// системный голос: когда связь с сервисом пропадает, фразу читает голос
    /// Windows — и он обязан быть того же пола, иначе во время эфира голос
    /// «прыгал» с женского на мужской и обратно.
    /// </summary>
    public static string GenderOf(string? voiceId)
    {
        if (string.IsNullOrWhiteSpace(voiceId)) return "Female";
        var found = Array.Find(AllVoices, v => v.Id.Equals(voiceId, StringComparison.OrdinalIgnoreCase));
        return found?.Gender ?? "Female";
    }

    private const string TrustedToken = SecMsGec.TrustedClientToken;
    private const string ExtensionOrigin = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold";

    /* ---------- точки входа сервиса ---------- */

    /// <summary>
    /// Адрес сервиса. Основной — тот, которым синтезирует сам Edge на рубеже
    /// 2026 года: 12 октября Microsoft перевёл озвучку на него, а прежний
    /// домен стал отвечать отказом 403. Прежний адрес остаётся запасным — на
    /// случай, когда основной недоступен у провайдера.
    ///
    /// Значения приходят из edge-tts.json (см. EdgeTtsConfig): сменившийся
    /// адрес или версию протокола можно поправить без пересборки приложения.
    /// Оба адреса принадлежат Microsoft; сторонних серверов приложение не
    /// использует.
    /// </summary>
    private sealed record Endpoint(
        string Name,
        string WsBase,
        string TokenParam,
        string VoicesUrl,
        string? SubProtocol,
        bool Backup)
    {
        public static Endpoint From(EdgeEndpointConfig e) =>
            new(e.Name, e.WsBase, e.TokenParam, e.VoicesUrl, e.SubProtocol, e.Backup);
    }

    /* ---------- файл настроек подключения ---------- */

    /// <summary>Путь к edge-tts.json — рядом с settings.json.</summary>
    private readonly string _configPath = Path.Combine(Program.AppDir, "edge-tts.json");
    private EdgeTtsConfig _config = new();
    private DateTime _configStamp = DateTime.MinValue;
    private readonly object _configGate = new();

    /// <summary>
    /// Перечитать файл, если он изменился с прошлого раза: пользователь может
    /// поправить адрес вручную, не перезапуская приложение.
    /// </summary>
    private void ReloadConfig(bool force)
    {
        lock (_configGate)
        {
            var stamp = DateTime.MinValue;
            try { stamp = File.GetLastWriteTimeUtc(_configPath); } catch { }
            if (!force && stamp == _configStamp) return;

            var config = EdgeTtsConfig.Load(_configPath, out var problem);
            if (problem != null)
            {
                AppLog.Warning("tts", $"Настройки подключения озвучки: {problem}");
                EdgeTtsConfig.KeepBroken(_configPath);
            }

            _config = config;
            _configStamp = stamp;
            _chromiumCandidates = null;

            // Файла нет — создаём из встроенных значений, чтобы у пользователя
            // был образец для правки.
            if (!File.Exists(_configPath))
            {
                try { _config.Save(_configPath); }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                    AppLog.Warning("tts", $"Не удалось записать edge-tts.json: {ex.GetType().Name}");
                }
            }
        }
    }

    /// <summary>Снимок настроек для чтения: файл мог измениться на диске.</summary>
    private EdgeTtsConfig Config
    {
        get
        {
            ReloadConfig(force: false);
            lock (_configGate) return _config;
        }
    }

    /// <summary>Основной адрес: им говорят, пока он отвечает.</summary>
    private Endpoint PrimaryEndpoint
    {
        get
        {
            var config = Config;
            var primary = config.Primary ?? config.Endpoints[0];
            return Endpoint.From(primary);
        }
    }

    /// <summary>Адреса сервиса в порядке файла: основные, затем запасные.</summary>
    private List<Endpoint> ConfigEndpoints()
    {
        var list = Config.Usable.Select(Endpoint.From).ToList();
        if (list.Count == 0) list.Add(Endpoint.From(EdgeTtsConfig.DefaultEndpoints()[0]));
        return list;
    }

    /// <summary>Версия токена подключения (префикс Sec-MS-GEC-Version).</summary>
    private string TokenVersion => Config.TokenVersion;

    /// <summary>Путь к файлу настроек подключения — его показывает окно настроек.</summary>
    public string ConfigPath => _configPath;

    /* ---------- версия браузера в токене подключения ---------- */

    /// Сервис сверяет версию Chromium в токене и в User-Agent с версией
    /// настоящего Edge. Устаревшее значение — причина волн отказов «вчера
    /// работало, сегодня нет», поэтому версия берётся из установленных в
    /// системе Edge/WebView2 (обновляются вместе с Windows), а зашитые
    /// значения остаются запасными.
    private const string PinnedChromiumVersion = "143.0.3650.75";
    private static readonly string[] ReserveChromiumVersions = { "143.0.3650.75", "140.0.3485.14" };

    /// Версии, которые сервис недавно отклонил: не тратим на них попытки.
    /// Отметка живёт шесть часов, потом версия пробуется снова.
    private readonly Dictionary<string, DateTime> _rejectedVersions = new();
    private readonly object _stateGate = new();
    /// Версия, которой удалось синтезировать аудио, — становится первой.
    private string? _workingVersion;
    /// Последняя удачная комбинация «адрес + маршрут + версия».
    private Plan? _lastGood;
    private int _reserveFailures;
    private DateTime _reserveDisabledUntil = DateTime.MinValue;
    /// С какого варианта продолжает фоновая проверка доступности.
    private int _probeOffset;

    private string[]? _chromiumCandidates;
    private readonly object _candidatesGate = new();

    /// Версии для токена: сначала те, что записаны в edge-tts.json, затем
    /// установленные в системе Edge и WebView2. Порядок берётся из файла,
    /// поэтому новую версию можно добавить правкой файла, без пересборки.
    private string[] ChromiumCandidates
    {
        get
        {
            lock (_candidatesGate)
            {
                if (_chromiumCandidates != null) return _chromiumCandidates;
                var list = new List<string>();
                foreach (var v in Config.ChromiumVersions)
                    if (IsUsableVersion(v) && !list.Contains(v)) list.Add(v);
                foreach (var v in
                         new[] { DetectEdgeVersion(), DetectWebView2Version(), PinnedChromiumVersion })
                    if (IsUsableVersion(v) && !list.Contains(v)) list.Add(v);
                foreach (var v in ReserveChromiumVersions)
                    if (!list.Contains(v)) list.Add(v);
                return _chromiumCandidates = list.ToArray();
            }
        }
    }

    private static bool IsUsableVersion(string? v)
    {
        if (string.IsNullOrWhiteSpace(v)) return false;
        var parts = v!.Trim().Split('.');
        // Совсем старые сборки сервис уже не принимает — их не предлагаем.
        return parts.Length >= 3 && int.TryParse(parts[0], out var major) && major >= 130;
    }

    /// Версия установленного браузера Edge (стабильный канал).
    private static string DetectEdgeVersion()
    {
        string[] keys =
        {
            @"SOFTWARE\Microsoft\Edge\BLBeacon",
            @"SOFTWARE\WOW6432Node\Microsoft\Edge\BLBeacon",
        };
        foreach (var hive in new[] { Registry.LocalMachine, Registry.CurrentUser })
        {
            foreach (var sub in keys)
            {
                try
                {
                    using var key = hive.OpenSubKey(sub);
                    if (key?.GetValue("version") is string v && IsUsableVersion(v)) return v.Trim();
                }
                catch { /* ветки может не быть — пробуем следующую */ }
            }
        }
        return "";
    }

    /// Версия компонента WebView2, на котором работает само приложение:
    /// совпадает с версией Edge и обновляется вместе с системой.
    private static string DetectWebView2Version()
    {
        try
        {
            var v = Prerequisites.Detect().Version;
            return IsUsableVersion(v) ? v.Trim() : "";
        }
        catch { return ""; }
    }

    private static string MajorOf(string chromium) => chromium.Split('.')[0];

    private static string UserAgentFor(string chromium)
    {
        var major = MajorOf(chromium);
        return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
               $"(KHTML, like Gecko) Chrome/{major}.0.0.0 Safari/537.36 Edg/{major}.0.0.0";
    }

    /* ---------- сетевые маршруты ---------- */

    /// Два маршрута: сетевые параметры Windows (то, что пользователь настроил
    /// сам, — .NET применяет их по умолчанию) и прямое подключение. Пробуем
    /// оба: на части машин озвучку ломает неверный системный маршрут, на
    /// других без него нет выхода в сеть.
    private const bool ViaSystemSettings = true;

    private static bool? _systemRouteExists;
    private static DateTime _systemRouteCheckedAt = DateTime.MinValue;
    private static readonly object RouteGate = new();

    /// Задан ли в Windows собственный сетевой маршрут. Значение кэшируется:
    /// на машинах с автоопределением параметров сети такой запрос бывает
    /// небыстрым, а на каждую фразу его тратить нельзя. Устаревший кэш
    /// обновляется в фоне — фраза всегда идёт с уже известным ответом.
    private static bool HasSystemRoute()
    {
        lock (RouteGate)
        {
            var fresh = _systemRouteExists.HasValue &&
                        DateTime.UtcNow - _systemRouteCheckedAt < TimeSpan.FromMinutes(5);
            if (fresh) return _systemRouteExists!.Value;

            if (_systemRouteExists is { } known)
            {
                // Значение есть, но устарело: пользуемся им, а обновление
                // запускаем отдельно — не задерживая озвучку.
                if (Interlocked.CompareExchange(ref _routeRefreshing, 1, 0) == 0)
                {
                    _ = Task.Run(() =>
                    {
                        try { DetectSystemRoute(); }
                        finally { Interlocked.Exchange(ref _routeRefreshing, 0); }
                    });
                }
                return known;
            }

            return DetectSystemRoute();
        }
    }

    private static int _routeRefreshing;

    /// Определяет маршрут и запоминает результат.
    private static bool DetectSystemRoute()
    {
        lock (RouteGate)
        {
            var exists = false;
            try
            {
                if (WebRequest.DefaultWebProxy is { } proxy)
                {
                    var target = new Uri("https://speech.platform.bing.com/");
                    var via = proxy.GetProxy(target);
                    exists = via != null && via != target;
                }
            }
            catch { exists = false; }

            _systemRouteExists = exists;
            _systemRouteCheckedAt = DateTime.UtcNow;
            return exists;
        }
    }

    /* ---------- план одной попытки ---------- */

    /// Одна попытка подключения: адрес сервиса + сетевой маршрут + версия токена.
    private sealed record Plan(
        Endpoint Endpoint,
        bool UseSystemRoute,
        string Chromium,
        bool ReuseWarm,
        bool UseSubProtocol = true)
    {
        public override string ToString() =>
            $"{Endpoint.Name}/{(UseSystemRoute ? "система" : "напрямую")}/{Chromium}" +
            $"{(UseSubProtocol ? "" : "/без подпротокола")}{(ReuseWarm ? "/прогретое" : "")}";
    }

    /* ---------- тайминги ---------- */

    /// Сколько ждём ответа сервиса на подключение.
    private static readonly TimeSpan ConnectTimeout = TimeSpan.FromSeconds(6);
    /// Сколько ждём ПЕРВЫЕ байты аудио: дальше считаем подключение неудачным.
    private static readonly TimeSpan FirstAudioTimeout = TimeSpan.FromSeconds(8);
    /// Молчание в потоке дольше этого — обрыв. Типичная картина при
    /// ограничении соединения провайдером: «прочитал полслова и замолк».
    private static readonly TimeSpan StreamStallTimeout = TimeSpan.FromSeconds(7);
    /// Общий потолок на подбор рабочего маршрута для одной фразы: дольше
    /// тянуть нельзя, иначе очередь озвучки встаёт.
    private static readonly TimeSpan RouteBudget = TimeSpan.FromSeconds(16);
    /// Живое соединение старше этого возраста не переиспользуем: сервис и
    /// промежуточные узлы рвут простаивающие каналы, а отправка в «мёртвый»
    /// сокет стоила бы лишней секунды ожидания.
    private static readonly TimeSpan MaxSocketAge = TimeSpan.FromSeconds(45);
    /// Максимальная длина куска текста на одно обращение к сервису.
    private const int MaxChunkChars = 1800;
    /// Максимум попыток на одну фразу (ограничены ещё и общим временем).
    private const int MaxAttempts = 8;

    private readonly SemaphoreSlim _gate = new(1, 1);
    /* ОЧЕРЕДЬ ФРАЗ. Раньше новый запрос отменял предыдущий (Cancel) — если два
       вызова приходили рядом (проверка голоса из настроек + очередь чата),
       первая фраза обрывалась на полуслове или пропадала совсем. Теперь
       запросы выстраиваются в очередь и звучат по порядку, а отменяет их
       только явная команда «стоп» (счётчик поколения). */
    private readonly SemaphoreSlim _fifo = new(1, 1);
    private int _generation;
    /// Создание сокета идёт под своим замком: прогрев следующей фразы может
    /// работать параллельно с обычным путём, и два сокета разом — утечка.
    private readonly SemaphoreSlim _wsLock = new(1, 1);
    private int _prewarming;
    private CancellationTokenSource? _current;
    private WaveOutEvent? _output;

    private ClientWebSocket? _ws;
    private Plan? _wsPlan;
    private DateTime _wsOpenedAt = DateTime.MinValue;

    /// Разница «время сервера минус локальные часы». Токен подключения строится
    /// на метке времени: если часы ПК спешат или отстают, сервис отклоняет
    /// КАЖДОЕ подключение (HTTP 403). Сдвиг измеряем по заголовку Date.
    private static TimeSpan _clockSkew = TimeSpan.Zero;
    private static DateTime _skewLearnedAt = DateTime.MinValue;

    /// Два клиента: через сетевые параметры Windows и напрямую. Оба держат
    /// соединения недолго — иначе .NET продолжал бы ходить на адрес, который
    /// провайдер или сам сервис уже перестали обслуживать.
    private readonly HttpClient _systemHttp;
    private readonly HttpClient _directHttp;

    public EdgeTts()
    {
        _systemHttp = CreateHttp(useSystemRoute: true);
        _directHttp = CreateHttp(useSystemRoute: false);
    }

    private static HttpClient CreateHttp(bool useSystemRoute)
    {
        var handler = new SocketsHttpHandler
        {
            PooledConnectionLifetime = TimeSpan.FromMinutes(2),
            PooledConnectionIdleTimeout = TimeSpan.FromSeconds(45),
            ConnectTimeout = TimeSpan.FromSeconds(6),
            UseProxy = useSystemRoute,
            AllowAutoRedirect = false,
        };
        var http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(8) };
        // Версия в User-Agent здесь не критична (это вспомогательный запрос
        // за временем сервера), поэтому определение версии Edge не выполняем
        // в конструкторе — оно не должно задерживать запуск окна.
        http.DefaultRequestHeaders.UserAgent.ParseAdd(UserAgentFor(PinnedChromiumVersion));
        http.DefaultRequestHeaders.AcceptLanguage.ParseAdd("ru-RU");
        return http;
    }

    private HttpClient HttpFor(bool useSystemRoute) => useSystemRoute ? _systemHttp : _directHttp;

    /// <summary>
    /// Прогрев при старте: определяем маршрут и версию, сверяем часы с
    /// сервером и поднимаем первое соединение — до первого сообщения чата.
    /// </summary>
    public void Warmup()
    {
        _ = Task.Run(async () =>
        {
            // Версию браузера и сетевой маршрут определяем заранее и в фоне:
            // первой фразе не придётся платить за это временем.
            _ = Task.Run(() =>
            {
                try { _ = ChromiumCandidates; } catch { }
                try { HasSystemRoute(); } catch { }
            });

            try { await RefreshClockSkewAsync(PrimaryEndpoint, ViaSystemSettings, force: true, CancellationToken.None); }
            catch { }

            // Поднимаем И СОХРАНЯЕМ первое соединение: первая фраза не тратит
            // время на TLS. Делаем это в общей очереди озвучки, чтобы не
            // поменять соединение под фразой, которая уже звучит.
            var warmed = false;
            try
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
                await _gate.WaitAsync(cts.Token);
                try
                {
                    await PrewarmSocketAsync(cts.Token);
                    warmed = _ws != null;
                }
                finally { _gate.Release(); }
            }
            catch { }

            /* Соединение не поднялось — возможно, Microsoft сменила адрес или
               версию протокола. Проверяем настройки подключения при запуске:
               если рабочим оказался другой адрес, он записывается в
               edge-tts.json первым, и озвучка продолжает работать без
               пересборки приложения. */
            if (!warmed)
            {
                try { await CheckConfigAsync(); }
                catch { /* проверим позже, по кнопке в настройках */ }
            }
        });
    }

    /// <summary>
    /// Быстрая проверка доступности сервиса. Нужна, чтобы вернуться к
    /// нейроголосу сразу, как только связь ожила: проверка идёт в фоне и не
    /// задерживает фразу, которая звучит системным голосом.
    /// </summary>
    public async Task<bool> CheckHealthAsync()
    {
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(14));

            var plans = BuildPlans();
            if (plans.Count == 0) return false;

            /* Проверяем не всегда одни и те же варианты, а по кругу: за
               несколько проверок приложение переберёт и другие маршруты, и
               запасной адрес, и другие версии токена. Как только что-то из
               этого отвечает, вариант запоминается и дальше озвучка идёт им —
               так связь восстанавливается сама, без действий пользователя. */
            const int probeAttempts = 2;
            var start = ((_probeOffset % plans.Count) + plans.Count) % plans.Count;
            _probeOffset = start + probeAttempts;

            for (var i = 0; i < probeAttempts; i++)
            {
                var plan = plans[(start + i) % plans.Count];
                // Сокет создаём свой и сразу закрываем: рабочее соединение
                // фраз трогать нельзя, иначе проверка оборвала бы озвучку.
                ClientWebSocket? ws = null;
                try
                {
                    // Часы сверяем тем адресом и маршрутом, которым пробуем
                    // говорить: иначе при недоступном основном адресе сдвиг
                    // остался бы несверенным и отказал бы запасному.
                    await RefreshClockSkewAsync(plan.Endpoint, plan.UseSystemRoute, force: i > 0, cts.Token);
                    ws = await OpenSocketAsync(plan with { ReuseWarm = false }, cts.Token);
                    RememberGoodPlan(plan);
                    return true;
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    NoteFailure(plan, ex);
                    AppLog.Debug("tts", $"Проверка голоса через {plan.Endpoint.Name} маршрут: {ex.GetType().Name}");
                }
                finally
                {
                    if (ws != null)
                    {
                        try { ws.Abort(); } catch { }
                        try { ws.Dispose(); } catch { }
                    }
                }
            }
            return false;
        }
        catch { return false; }
    }

    /* ---------- проверка адресов и версии протокола ---------- */

    /// <summary>Итог проверки настроек подключения — его показывает окно настроек.</summary>
    public sealed record ConfigCheckResult(
        bool Ok,
        bool Updated,
        string Endpoint,
        string Version,
        string Detail);

    /// <summary>
    /// Проверка того, что адрес и версия протокола в edge-tts.json ещё рабочие.
    ///
    /// Перебираем адреса из файла по порядку и версии браузера для токена:
    ///   • первый адрес с первой версией ответил — «успех», ничего не меняем;
    ///   • ответил другой адрес или другая версия — записываем их в файл
    ///     первыми, следующая фраза пойдёт уже по ним, пересборка не нужна;
    ///   • не ответил никто — сообщаем об этом, файл оставляем как есть.
    ///
    /// Проверка идёт своим сокетом и не трогает соединение звучащей фразы.
    /// </summary>
    public async Task<ConfigCheckResult> CheckConfigAsync(CancellationToken outer = default)
    {
        // Файл мог быть исправлен вручную — читаем заново.
        ReloadConfig(force: true);

        var endpoints = ConfigEndpoints();
        var versions = ChromiumCandidates.Take(3).ToArray();
        var routes = HasSystemRoute()
            ? new[] { ViaSystemSettings, !ViaSystemSettings }
            : new[] { ViaSystemSettings };

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(outer);
        // Общий потолок: проверка не должна превращаться в ожидание.
        cts.CancelAfter(TimeSpan.FromSeconds(30));
        var ct = cts.Token;

        Plan? working = null;
        string? failure = null;

        foreach (var endpoint in endpoints)
        {
            foreach (var version in versions)
            {
                foreach (var route in routes)
                {
                    if (ct.IsCancellationRequested) break;
                    var plan = new Plan(endpoint, route, version, ReuseWarm: false);
                    ClientWebSocket? ws = null;
                    try
                    {
                        await RefreshClockSkewAsync(endpoint, route, force: false, ct);
                        ws = await OpenSocketAsync(plan, ct);
                        working = plan;
                        break;
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        failure = $"{endpoint.Name}: {ex.GetType().Name}";
                        AppLog.Debug("tts", $"Проверка настроек озвучки, {plan}: {ex.GetType().Name}");
                    }
                    finally
                    {
                        if (ws != null)
                        {
                            try { ws.Abort(); } catch { }
                            try { ws.Dispose(); } catch { }
                        }
                    }
                }
                if (working != null) break;
            }
            if (working != null) break;
        }

        var checkedUtc = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ");
        if (working == null)
        {
            var detail = failure == null
                ? "сервис не ответил: нет сети"
                : $"сервис не ответил ни на один адрес ({failure})";
            SaveConfigState(checkedUtc, "не удалось: " + detail);
            AppLog.Warning("tts", $"Проверка настроек озвучки: {detail}");
            return new ConfigCheckResult(false, false, "", "", detail);
        }

        RememberGoodPlan(working);

        var config = Config;
        var wasFirst = config.Primary is { } primary &&
                       string.Equals(primary.WsBase, working.Endpoint.WsBase, StringComparison.OrdinalIgnoreCase);
        var versionFirst = config.ChromiumVersions.Count > 0 &&
                            string.Equals(config.ChromiumVersions[0], working.Chromium, StringComparison.Ordinal);
        var updated = !wasFirst || !versionFirst;

        if (updated)
        {
            lock (_configGate)
            {
                // Рабочий адрес — первым, рабочий порядок версий — тоже.
                var moved = _config.Endpoints.Find(e =>
                    string.Equals(e.WsBase, working.Endpoint.WsBase, StringComparison.OrdinalIgnoreCase));
                if (moved != null)
                {
                    _config.Endpoints.Remove(moved);
                    _config.Endpoints.Insert(0, moved);
                }
                _config.ChromiumVersions.RemoveAll(v => string.Equals(v, working.Chromium, StringComparison.Ordinal));
                _config.ChromiumVersions.Insert(0, working.Chromium);
                _chromiumCandidates = null;
            }
        }

        var detailText = updated
            ? $"{working.Endpoint.Name} адрес и версия {working.Chromium}"
            : "адрес и версия протокола в порядке";
        SaveConfigState(checkedUtc, detailText);

        AppLog.Info("tts", updated
            ? $"Настройки озвучки обновлены: {detailText}"
            : $"Настройки озвучки проверены: {detailText}");

        return new ConfigCheckResult(true, updated, working.Endpoint.Name, working.Chromium, detailText);
    }

    /// <summary>Записать итог проверки в файл — окно настроек показывает его и после перезапуска.</summary>
    private void SaveConfigState(string checkedUtc, string result)
    {
        lock (_configGate)
        {
            _config.CheckedUtc = checkedUtc;
            _config.LastResult = result;
            try { _config.Save(_configPath); }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                AppLog.Warning("tts", $"Не удалось сохранить edge-tts.json: {ex.GetType().Name}");
            }
        }
    }

    /// <summary>Что сейчас записано в настройках подключения — для окна настроек.</summary>
    public object ConfigInfo()
    {
        var config = Config;
        return new
        {
            endpoint = config.Primary?.Name ?? "",
            address = config.Primary?.WsBase ?? "",
            version = config.ChromiumVersions.FirstOrDefault() ?? "",
            tokenVersion = config.TokenVersion,
            path = _configPath,
            checkedAt = config.CheckedUtc ?? "",
            result = config.LastResult ?? "",
            endpoints = config.Usable
                .Select(e => new { name = e.Name, address = e.WsBase, backup = e.Backup })
                .ToArray(),
        };
    }

    public async Task<byte[]> SpeakAsync(
        string text,
        string voice,
        int ratePercent,
        int volumePercent,
        Action<byte[]>? onAudioReady = null,
        CancellationToken outer = default,
        TimeSpan? routeBudget = null,
        bool playLocally = true)
    {
        if (string.IsNullOrWhiteSpace(text)) return Array.Empty<byte>();
        if (!AllVoices.Any(v => v.Id.Equals(voice, StringComparison.OrdinalIgnoreCase)))
            voice = DefaultVoice;

        /* Фраза встаёт В ОЧЕРЕДЬ: если предыдущая ещё звучит, эта ждёт её
           окончания, а не обрывает. Именно обрыв и давал «озвучка глотает
           слова» и «часть сообщений не озвучилась». */
        var generation = Volatile.Read(ref _generation);
        await _fifo.WaitAsync(outer);
        try
        {
            // Пока фраза стояла в очереди, нажали «стоп»/«очистить» — озвучивать нечего.
            if (Volatile.Read(ref _generation) != generation) return Array.Empty<byte>();

            // Этот запрос теперь «текущий»: только его отменяет Cancel().
            var cts = CancellationTokenSource.CreateLinkedTokenSource(outer);
            _current = cts;
            var ct = cts.Token;
            try
            {
                await _gate.WaitAsync(ct);
                try
                {
                    /* ВАЖНО: ограничение по времени действует ТОЛЬКО на обращение к
                       сервису. Раньше общий лимит в 20 секунд накрывал и синтез, и
                       воспроизведение — длинная реплика (донат с большим текстом)
                       обрывалась на полуслове или пропадала совсем. Это и была
                       «озвучка периодически пропадает». Проигрывание теперь
                       ограничено лишь отменой пользователем. */
                    byte[] audio;
                    using (var synthCts = CancellationTokenSource.CreateLinkedTokenSource(ct))
                    {
                        synthCts.CancelAfter(TimeSpan.FromSeconds(90));
                        audio = await TrySynthesizeAsync(
                            text, voice, ratePercent, synthCts.Token, routeBudget ?? RouteBudget);
                    }
                    if (audio.Length == 0)
                        throw new InvalidOperationException("Сервис озвучки не вернул аудио");

                    // OBS и локальное воспроизведение стартуют ПАРАЛЛЕЛЬНО. Запись
                    // большого MP3 в SSE не должна блокировать начало звука на ПК.
                    if (onAudioReady != null)
                        _ = Task.Run(() => { try { onAudioReady(audio); } catch { } });

                    // Сервис требует новый сокет на каждую фразу. Пока эта звучит,
                    // поднимаем соединение для следующей — пауза между репликами
                    // перестала быть слышной.
                    var playing = playLocally
                        ? PlayAsync(audio, volumePercent, ct)
                        : WaitAudioDurationAsync(audio, ct);
                    PrewarmNextConnection();
                    await playing;
                    return audio;
                }
                finally
                {
                    _gate.Release();
                }
            }
            finally
            {
                if (ReferenceEquals(_current, cts)) _current = null;
                try { cts.Dispose(); } catch { }
            }
        }
        finally
        {
            _fifo.Release();
        }
    }

    /// Готовит сокет для следующей фразы, пока текущая звучит. Одна попытка
    /// за раз: параллельные прогревы дали бы лишние соединения.
    private void PrewarmNextConnection()
    {
        if (Interlocked.CompareExchange(ref _prewarming, 1, 0) != 0) return;
        _ = Task.Run(async () =>
        {
            try
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
                await PrewarmSocketAsync(cts.Token);
            }
            catch { /* следующая фраза поднимет соединение сама */ }
            finally { Interlocked.Exchange(ref _prewarming, 0); }
        });
    }

    private async Task PrewarmSocketAsync(CancellationToken ct)
    {
        var plan = BuildPlans().FirstOrDefault();
        if (plan == null) return;

        await _wsLock.WaitAsync(ct);
        try
        {
            if (IsSocketUsable(plan)) return;
            try
            {
                var ws = await OpenSocketAsync(plan with { ReuseWarm = false }, ct);
                DropSocketNoLock();
                _ws = ws;
                _wsPlan = plan;
                _wsOpenedAt = DateTime.UtcNow;
                RememberGoodPlan(plan);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                NoteFailure(plan, ex);
            }
        }
        finally
        {
            _wsLock.Release();
        }
    }

    /// <summary>
    /// Только синтез для OBS (без локального воспроизведения). Используется,
    /// когда на ПК выбран системный голос: OBS всё равно получает озвученный текст.
    /// </summary>
    public async Task<byte[]> SynthesizeForObsAsync(string text, int ratePercent, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(text)) return Array.Empty<byte>();
        await _gate.WaitAsync(ct);
        try { return await TrySynthesizeAsync(text, DefaultVoice, ratePercent, ct, RouteBudget); }
        finally { _gate.Release(); }
    }

    /* ================= часы и подключение ================= */

    private static DateTimeOffset ServerNowUtc() => DateTimeOffset.UtcNow + _clockSkew;

    private static void LearnClockSkew(DateTimeOffset? serverDate)
    {
        if (serverDate is not { } srv) return;
        _clockSkew = srv.ToUniversalTime() - DateTimeOffset.UtcNow;
        _skewLearnedAt = DateTime.UtcNow;
    }

    /// Токен подключения живёт пять минут, поэтому часы сверяем не только при
    /// старте: ушедшее за долгий эфир время снова начинает давать отказы.
    /// Обновляем не чаще раза в три минуты — тем адресом и тем маршрутом,
    /// которым собираемся говорить (иначе при недоступном основном адресе
    /// часы остались бы несверенными и запасной отклонял бы подключение).
    private async Task RefreshClockSkewAsync(
        Endpoint endpoint, bool useSystemRoute, bool force, CancellationToken ct)
    {
        if (!force && _skewLearnedAt != DateTime.MinValue &&
            DateTime.UtcNow - _skewLearnedAt < TimeSpan.FromMinutes(3))
            return;

        try
        {
            using var resp = await HttpFor(useSystemRoute).GetAsync(
                endpoint.VoicesUrl, HttpCompletionOption.ResponseHeadersRead, ct);
            LearnClockSkew(resp.Headers.Date);
            return;
        }
        catch { /* маршрут не ответил — пробуем прямой */ }

        if (useSystemRoute)
        {
            try
            {
                using var resp = await _directHttp.GetAsync(
                    endpoint.VoicesUrl, HttpCompletionOption.ResponseHeadersRead, ct);
                LearnClockSkew(resp.Headers.Date);
            }
            catch { /* сети нет — оставляем прежний сдвиг */ }
        }
    }

    private Uri BuildUri(Plan plan)
    {
        var e = plan.Endpoint;
        return new Uri(
            $"{e.WsBase}?{e.TokenParam}={TrustedToken}" +
            $"&Sec-MS-GEC={SecMsGec.Generate(ServerNowUtc().ToUnixTimeMilliseconds() / 1000d)}" +
            $"&Sec-MS-GEC-Version={TokenVersion}-{plan.Chromium}" +
            $"&ConnectionId={Guid.NewGuid():N}");
    }

    /// После неудачного ConnectAsync экземпляр переиспользовать нельзя —
    /// каждая попытка идёт новым сокетом с теми же заголовками.
    private static ClientWebSocket CreateSocket(Plan plan)
    {
        var ws = new ClientWebSocket();
        ws.Options.SetRequestHeader("Origin", ExtensionOrigin);
        ws.Options.SetRequestHeader("User-Agent", UserAgentFor(plan.Chromium));
        ws.Options.SetRequestHeader("Pragma", "no-cache");
        ws.Options.SetRequestHeader("Cache-Control", "no-cache");
        // Заголовки настоящего Edge: подключение, неотличимое от браузерного,
        // сервис принимает охотнее.
        ws.Options.SetRequestHeader("Accept-Language", "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7");
        ws.Options.SetRequestHeader("Sec-CH-UA",
            $"\" Not;A Brand\";v=\"99\", \"Microsoft Edge\";v=\"{MajorOf(plan.Chromium)}\", " +
            $"\"Chromium\";v=\"{MajorOf(plan.Chromium)}\"");
        ws.Options.SetRequestHeader("Sec-CH-UA-Mobile", "?0");
        ws.Options.SetRequestHeader("Sec-CH-UA-Platform", "\"Windows\"");
        ws.Options.KeepAliveInterval = TimeSpan.FromSeconds(10);

        // Прямое подключение — пустой прокси. Системные параметры Windows
        // .NET подставляет сам (Options.Proxy по умолчанию): если пользователь
        // настроил у себя собственный сетевой маршрут, озвучка пойдёт через
        // него, ничего своего приложение не добавляет.
        if (!plan.UseSystemRoute) ws.Options.Proxy = new WebProxy();

        // Запасной адрес встречается в двух вариантах рукопожатия: с заявленным
        // подпротоколом и без него — пробуем оба, если первый не приняли.
        if (plan.UseSubProtocol && plan.Endpoint.SubProtocol is { } sub)
            ws.Options.AddSubProtocol(sub);

        var cookies = new CookieContainer();
        cookies.SetCookies(new Uri(plan.Endpoint.WsBase.Replace("wss://", "https://")),
            $"muid={Convert.ToHexString(RandomNumberGenerator.GetBytes(16))};");
        ws.Options.Cookies = cookies;
        return ws;
    }

    /// Открывает НОВОЕ соединение и отправляет конфигурацию формата.
    /// Состояние класса не меняет: результат забирает себе вызывающий код
    /// (прогрев — в рабочее соединение, проверка доступности — сразу закрывает).
    private async Task<ClientWebSocket> OpenSocketAsync(Plan plan, CancellationToken ct)
    {
        var ws = CreateSocket(plan);
        try
        {
            // ConnectAsync на части систем игнорирует отмену: без своего лимита
            // сокет мог висеть минутами и останавливать озвучку всех фраз.
            using var connectCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            connectCts.CancelAfter(ConnectTimeout);
            var connect = ws.ConnectAsync(BuildUri(plan), connectCts.Token);
            if (await Task.WhenAny(connect, Task.Delay(ConnectTimeout + TimeSpan.FromMilliseconds(500))) != connect)
            {
                try { ws.Abort(); } catch { }
                try { await connect; } catch { }
                throw new TimeoutException("Сервис озвучки не ответил на подключение");
            }
            await connect;
        }
        catch
        {
            try { ws.Dispose(); } catch { }
            throw;
        }

        try
        {
            // конфигурация формата отправляется ОДИН раз на соединение
            var config =
                $"X-Timestamp:{Timestamp()}\r\n" +
                "Content-Type:application/json; charset=utf-8\r\n" +
                "Path:speech.config\r\n\r\n" +
                "{\"context\":{\"synthesis\":{\"audio\":{\"metadataoptions\":" +
                "{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"false\"}," +
                "\"outputFormat\":\"audio-24khz-96kbitrate-mono-mp3\"}}}}\r\n";
            await SendText(ws, config, ct);
            return ws;
        }
        catch
        {
            try { ws.Abort(); } catch { }
            try { ws.Dispose(); } catch { }
            throw;
        }
    }

    private bool IsSocketUsable(Plan plan) =>
        _ws is { State: WebSocketState.Open } &&
        DateTime.UtcNow - _wsOpenedAt < MaxSocketAge &&
        _wsPlan != null &&
        _wsPlan.Endpoint == plan.Endpoint &&
        _wsPlan.UseSystemRoute == plan.UseSystemRoute &&
        _wsPlan.Chromium == plan.Chromium &&
        _wsPlan.UseSubProtocol == plan.UseSubProtocol;

    /// Возвращает рабочее соединение: заранее прогретое или новое. В обоих
    /// случаях сокет числится в состоянии класса — после ошибки его убирает
    /// следующая попытка.
    private async Task<ClientWebSocket> AcquireSocketAsync(Plan plan, CancellationToken ct)
    {
        await _wsLock.WaitAsync(ct);
        try
        {
            if (plan.ReuseWarm && IsSocketUsable(plan)) return _ws!;

            var ws = await OpenSocketAsync(plan with { ReuseWarm = false }, ct);
            DropSocketNoLock();
            _ws = ws;
            _wsPlan = plan;
            _wsOpenedAt = DateTime.UtcNow;
            return ws;
        }
        finally
        {
            _wsLock.Release();
        }
    }

    private void DropSocketNoLock()
    {
        if (_ws == null) return;
        try { _ws.Abort(); } catch { }
        try { _ws.Dispose(); } catch { }
        _ws = null;
        _wsPlan = null;
    }

    /// Убирает соединение, дождавшись замка (используется при выходе).
    private void KillSocket()
    {
        bool taken;
        try { taken = _wsLock.Wait(TimeSpan.FromSeconds(5)); }
        catch { return; }
        if (!taken) return;
        try { DropSocketNoLock(); }
        finally { _wsLock.Release(); }
    }

    /// Фраза получила аудио: соединение своё отработало, сервис требует новое
    /// на каждую реплику. Рвём сразу, не дожидаясь закрытия рукопожатием —
    /// оно добавляло паузу ПЕРЕД началом звука.
    private void ConsumeSocket(ClientWebSocket ws)
    {
        try { ws.Abort(); } catch { }
        _ = Task.Run(async () =>
        {
            try
            {
                await _wsLock.WaitAsync();
                try { if (ReferenceEquals(_ws, ws)) DropSocketNoLock(); }
                finally { _wsLock.Release(); }
            }
            catch { }
        });
    }

    /* ---------- лестница попыток ---------- */

    private void RememberGoodPlan(Plan plan)
    {
        lock (_stateGate)
        {
            _lastGood = plan with { ReuseWarm = true };
            // Рабочую версию запоминаем только для основного адреса: запасной
            // принимает другую версию, и она основному не подходит.
            if (!plan.Endpoint.Backup)
            {
                _workingVersion = plan.Chromium;
                _rejectedVersions.Remove(plan.Chromium);
                _reserveFailures = 0;
            }
        }
    }

    private void NoteFailure(Plan plan, Exception ex)
    {
        var rejected = IsRejectedToken(ex);
        lock (_stateGate)
        {
            // Сервис отклонил токен подключения — версия браузера не подошла.
            // Учитываем только основной адрес: на прежнем домене отказ чаще
            // связан с самим адресом, а не с версией браузера.
            if (rejected && !plan.Endpoint.Backup)
            {
                _rejectedVersions[plan.Chromium] = DateTime.UtcNow;
                if (_workingVersion == plan.Chromium) _workingVersion = null;
            }

            if (plan.Endpoint.Backup)
            {
                _reserveFailures++;
                // Прежний домен не отвечает (так и должно быть после перевода
                // сервиса) — выключаем его на полчаса, чтобы не тратить на
                // него время каждой фразы.
                if (_reserveFailures >= 3)
                {
                    _reserveDisabledUntil = DateTime.UtcNow.AddMinutes(30);
                    _reserveFailures = 0;
                }
            }

            if (_lastGood is { } good &&
                good.Endpoint == plan.Endpoint &&
                good.UseSystemRoute == plan.UseSystemRoute &&
                good.Chromium == plan.Chromium)
                _lastGood = null;
        }
    }

    /// Лестница попыток для одной фразы: от самого вероятного рабочего
    /// варианта к запасным (см. комментарии внутри). Адреса берутся из
    /// edge-tts.json: первый рабочий — основной, остальные — запасные.
    private List<Plan> BuildPlans()
    {
        var versions = VersionCandidates().ToList();
        var routes = HasSystemRoute()
            ? new[] { ViaSystemSettings, !ViaSystemSettings }
            : new[] { ViaSystemSettings };
        var current = versions[0];
        var endpoints = ConfigEndpoints();
        var primary = endpoints.FirstOrDefault(e => !e.Backup) ?? endpoints[0];
        var reserves = endpoints.Where(e => e.Backup).ToList();

        bool reserveAllowed;
        Plan? lastGood;
        lock (_stateGate)
        {
            reserveAllowed = DateTime.UtcNow >= _reserveDisabledUntil;
            lastGood = _lastGood;
        }

        /* Порядок подобран по вероятности причины сбоя:
             1) то, что работало в прошлый раз (прогретое соединение);
             2) свежее соединение тем же путём — сокет мог умереть;
             3) тот же адрес, другой сетевой маршрут;
             4) запасной адрес сервиса — помогает, когда провайдер
                ограничивает основной домен;
             5) другая версия токена — на случай, когда сервис перестал
                принимать прежнюю версию браузера (отказ 403);
             6) запасной адрес без заявленного подпротокола. */
        var plans = new List<Plan>();

        if (lastGood is { } good && (!good.Endpoint.Backup || reserveAllowed))
        {
            plans.Add(good);                              // прогретое соединение
            plans.Add(good with { ReuseWarm = false });    // то же, но новое
        }

        foreach (var route in routes)
            plans.Add(new Plan(primary, route, current, ReuseWarm: false));

        foreach (var route in routes)
            plans.Add(new Plan(primary, route, current, ReuseWarm: false, UseSubProtocol: false));

        if (reserveAllowed)
            foreach (var reserve in reserves)
                foreach (var route in routes)
                    plans.Add(new Plan(reserve, route, current, ReuseWarm: false));

        foreach (var version in versions.Skip(1))
            foreach (var route in routes)
                plans.Add(new Plan(primary, route, version, ReuseWarm: false));

        if (reserveAllowed)
            foreach (var reserve in reserves)
                foreach (var route in routes)
                    plans.Add(new Plan(reserve, route, current, ReuseWarm: false, UseSubProtocol: false));

        var seen = new HashSet<string>();
        return plans.Where(p => seen.Add(p.ToString())).ToList();
    }

    private IEnumerable<string> VersionCandidates()
    {
        // Список версий читаем до своего замка: вложенные блокировки не нужны.
        var all = ChromiumCandidates;
        lock (_stateGate)
        {
            var ordered = new List<string>();
            if (_workingVersion is { } working && all.Contains(working)) ordered.Add(working);
            foreach (var v in all) if (!ordered.Contains(v)) ordered.Add(v);

            var fresh = ordered
                .Where(v => !_rejectedVersions.TryGetValue(v, out var at) ||
                            DateTime.UtcNow - at > TimeSpan.FromHours(6))
                .ToList();

            // Все версии недавно отклонены — пробуем заново с основной.
            return fresh.Count > 0 ? fresh : ordered;
        }
    }

    /// Сервис отклонил рукопожатие (403/401): значит, не подошёл токен
    /// подключения, а не сеть. По сообщению об ошибке — других признаков
    /// статуса ClientWebSocket не даёт.
    private static bool IsRejectedToken(Exception ex)
    {
        for (var e = ex; e != null; e = e.InnerException)
        {
            var m = e.Message;
            if (m.Contains("'403'") || m.Contains("'401'") ||
                m.Contains("403 Forbidden") || m.Contains("401 Unauthorized"))
                return true;
        }
        return false;
    }

    /* ================= синтез ================= */

    /// Синтез фразы: длинный текст режется на куски (на короткие обращения
    /// сервис отвечает устойчивее), каждый кусок — со своей лестницей попыток.
    private async Task<byte[]> TrySynthesizeAsync(
        string text, string voice, int ratePercent, CancellationToken ct, TimeSpan routeBudget)
    {
        var chunks = SplitForService(text).ToArray();
        if (chunks.Length == 0) throw new InvalidOperationException("Нечего озвучивать");
        if (chunks.Length == 1)
            return await SynthesizeChunkAsync(chunks[0], voice, ratePercent, ct, routeBudget);

        using var whole = new MemoryStream();
        foreach (var chunk in chunks)
        {
            ct.ThrowIfCancellationRequested();
            var part = await SynthesizeChunkAsync(chunk, voice, ratePercent, ct, routeBudget);
            if (part.Length == 0) throw new InvalidOperationException("Сервис озвучки не вернул аудио");
            await whole.WriteAsync(part, ct);
        }
        return whole.ToArray();
    }

    private async Task<byte[]> SynthesizeChunkAsync(
        string text, string voice, int ratePercent, CancellationToken ct, TimeSpan routeBudget)
    {
        using var chunkCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        // Запас на несколько попыток и на сам поток аудио.
        chunkCts.CancelAfter(TimeSpan.FromSeconds(Math.Clamp(20 + text.Length * 0.08, 25, 60)));
        var token = chunkCts.Token;

        var started = DateTime.UtcNow;
        Exception? last = null;
        var attempt = 0;

        foreach (var plan in BuildPlans())
        {
            ct.ThrowIfCancellationRequested();
            attempt++;
            // На подбор маршрута отведён короткий бюджет: если связь лежит,
            // фраза должна быстро уйти на запасной голос, а не ждать минуту.
            if (attempt > 1 && DateTime.UtcNow - started > routeBudget) break;
            if (attempt > MaxAttempts) break;

            ClientWebSocket? ws = null;
            try
            {
                // После отказа заново сверяем часы: расхождение времени —
                // самая частая причина отклонённого подключения.
                if (attempt > 1)
                    await RefreshClockSkewAsync(
                        plan.Endpoint,
                        plan.UseSystemRoute,
                        force: last != null && IsRejectedToken(last),
                        token);

                ws = await AcquireSocketAsync(plan, token);
                var audio = await SynthesizeOnceAsync(ws, text, voice, ratePercent, token);
                RememberGoodPlan(plan);
                return audio;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;   // отмена пользователем («стоп»/«очистить») — не ошибка связи
            }
            catch (OperationCanceledException)
            {
                // Истёк внутренний потолок времени на этот кусок. Это ошибка
                // связи, а не команда «стоп»: фраза должна уйти на запасной
                // голос, а не пропасть молча.
                throw new TimeoutException("Сервис озвучки не успел отдать аудио");
            }
            catch (Exception ex)
            {
                last = ex;
                NoteFailure(plan, ex);
                // Соединение после ошибки непригодно. Из состояния класса его
                // уберёт следующая попытка — она же создаёт своё.
                if (ws != null)
                {
                    try { ws.Abort(); } catch { }
                    try { ws.Dispose(); } catch { }
                }
                AppLog.Debug("tts",
                    $"Озвучка: попытка {attempt}, {plan.Endpoint.Name} маршрут: {ex.GetType().Name}");
            }

            // Короткая пауза между попытками: частые повторные подключения
            // сервис расценивает как злоупотребление и отвечает отказом.
            if (attempt < MaxAttempts)
            {
                try { await Task.Delay(120 * attempt, token); }
                catch (OperationCanceledException) { break; }
            }
        }

        throw last ?? new InvalidOperationException("Не удалось получить аудио от сервиса озвучки");
    }

    private async Task<byte[]> SynthesizeOnceAsync(
        ClientWebSocket ws,
        string text,
        string voice,
        int ratePercent,
        CancellationToken ct)
    {
        var rate = Math.Clamp(ratePercent, -50, 100);
        var escaped = EscapeXml(CleanText(text));
        var ssml =
            "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='ru-RU'>" +
            $"<voice name='{voice}'><prosody pitch='+0Hz' rate='{(rate >= 0 ? "+" : "")}{rate}%' volume='+0%'>" +
            $"{escaped}</prosody></voice></speak>";
        var request =
            $"X-RequestId:{Guid.NewGuid():N}\r\n" +
            "Content-Type:application/ssml+xml\r\n" +
            $"X-Timestamp:{Timestamp()}Z\r\n" +
            "Path:ssml\r\n\r\n" + ssml;
        await SendText(ws, request, ct);

        using var audio = new MemoryStream();
        var buffer = new byte[32768];
        var gotAudio = false;
        var firstAudioDeadline = DateTime.UtcNow + FirstAudioTimeout;

        while (!ct.IsCancellationRequested)
        {
            /* Контроль зависания. Без него оборванное провайдером соединение
               выглядело как «сервис думает»: фраза молча ждала общего предела
               времени и пропадала. Теперь молчание в потоке дольше нескольких
               секунд считается обрывом — пробуем другое соединение. */
            var timeout = gotAudio ? StreamStallTimeout : firstAudioDeadline - DateTime.UtcNow;
            if (timeout <= TimeSpan.Zero)
                throw new TimeoutException("Сервис озвучки не начал передачу аудио");

            using var frame = new MemoryStream();
            WebSocketReceiveResult result;
            do
            {
                var (r, count) = await ReceiveWithTimeoutAsync(ws, buffer, timeout, ct);
                result = r;
                if (result.MessageType == WebSocketMessageType.Close)
                    throw new InvalidOperationException("Сервис озвучки закрыл соединение");
                frame.Write(buffer, 0, count);
                timeout = StreamStallTimeout;   // дальше — внутри одного сообщения
            } while (!result.EndOfMessage);

            var bytes = frame.ToArray();

            if (result.MessageType == WebSocketMessageType.Text)
            {
                var path = HeaderPath(Encoding.UTF8.GetString(bytes));
                if (path.Equals("turn.end", StringComparison.OrdinalIgnoreCase)) break;
                if (path.Equals("error", StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException(
                        "Сервис озвучки отклонил запрос: " + Short(Encoding.UTF8.GetString(bytes)));
                continue;   // turn.start, response, audio.metadata — не звук
            }

            // Двоичный кадр: два байта длины заголовка, затем служебный
            // заголовок и сами данные MP3.
            if (bytes.Length < 2) continue;
            var headerLength = (bytes[0] << 8) | bytes[1];
            var payloadStart = headerLength + 2;
            if (payloadStart > bytes.Length)
                throw new InvalidOperationException("Сервис озвучки вернул повреждённый аудиофрейм");
            if (payloadStart == bytes.Length) continue;

            await audio.WriteAsync(bytes.AsMemory(payloadStart), ct);
            gotAudio = true;
        }

        ConsumeSocket(ws);

        if (!gotAudio) throw new InvalidOperationException("Сервис озвучки не вернул аудио");
        return audio.ToArray();
    }

    /// Приём одного кадра с контролем молчания. Если за отведённое время сервис
    /// ничего не прислал, приём прерывается: сокет после этого непригоден, и
    /// вызывающий код пробует другое соединение.
    private static async Task<(WebSocketReceiveResult Result, int Count)> ReceiveWithTimeoutAsync(
        ClientWebSocket ws, byte[] buffer, TimeSpan timeout, CancellationToken ct)
    {
        var receive = ws.ReceiveAsync(new ArraySegment<byte>(buffer), ct);
        using var timer = new CancellationTokenSource();
        var winner = await Task.WhenAny(receive, Task.Delay(timeout, timer.Token));
        // Гасим таймер: иначе на каждый принятый кадр оставалась бы
        // отложенная задача ожидания.
        try { timer.Cancel(); } catch { }
        if (winner != receive)
        {
            // Приём остаётся незавершённым: «наблюдаем» его исключение, чтобы
            // оно не всплыло как необработанное, и сообщаем о зависании.
            _ = receive.ContinueWith(static t => _ = t.Exception, TaskContinuationOptions.OnlyOnFaulted);
            throw new TimeoutException("Сервис озвучки замолчал на середине фразы");
        }
        var result = await receive;
        return (result, result.Count);
    }

    private static string Short(string response)
    {
        var text = response.Replace("\r\n", " ").Replace("\n", " ");
        return text.Length <= 180 ? text : text[..180];
    }

    /// <summary>
    /// Режет длинный текст на куски по границам предложений и слов. Обрыв
    /// связи на длинной фразе (донат с большим сообщением) не теряет весь
    /// текст: куски синтезируются по очереди и склеиваются в один поток MP3.
    /// </summary>
    internal static IEnumerable<string> SplitForService(string text)
    {
        var clean = CleanText(text).Trim();
        if (clean.Length <= MaxChunkChars)
            return clean.Length > 0 ? new[] { clean } : Array.Empty<string>();

        var chunks = new List<string>();
        var current = new StringBuilder();

        foreach (var sentence in SplitSentences(clean))
        {
            foreach (var word in sentence.Split(' ', '\t', '\r', '\n'))
            {
                if (word.Length == 0) continue;
                if (current.Length > 0 && current.Length + word.Length + 1 > MaxChunkChars)
                {
                    chunks.Add(current.ToString().Trim());
                    current.Clear();
                }
                if (current.Length > 0) current.Append(' ');
                current.Append(word);
            }
        }
        if (current.Length > 0) chunks.Add(current.ToString().Trim());
        return chunks.Where(c => c.Length > 0);
    }

    private static IEnumerable<string> SplitSentences(string text)
    {
        var start = 0;
        for (var i = 0; i < text.Length; i++)
        {
            if (text[i] is not ('.' or '!' or '?' or '\n' or '…')) continue;
            yield return text[start..(i + 1)];
            start = i + 1;
        }
        if (start < text.Length) yield return text[start..];
    }

    /// <summary>
    /// MP3 из памяти → PCM. Сначала штатный путь через системный ACM-кодек
    /// Windows. На «чистых» ПК без медиакомпонентов (редакции Windows N/KN,
    /// сборки без Media Feature Pack) ACM-декодера MP3 нет, и конструктор
    /// падает ещё до воспроизведения — тогда включается полностью управляемый
    /// декодер NLayer, встроенный в exe и не требующий ничего в системе.
    /// </summary>
    private static WaveStream CreateMp3Reader(byte[] mp3)
    {
        try
        {
            return new Mp3FileReader(new MemoryStream(mp3, writable: false));
        }
        catch
        {
            return DecodeManaged(mp3);
        }
    }

    /// <summary>
    /// Полностью управляемый декод MP3 встроенным NLayer → float PCM →
    /// RawSourceWaveStream. В NAudio 2.2 тип Mp3FileReaderBase удалён, а
    /// конструктора с пользовательским декодером у Mp3FileReader нет,
    /// поэтому обёртка пишется напрямую поверх NLayer.MpegFile.
    /// ReadSamples работает с интерливнутыми сэмплами (count — всего float'ов).
    /// </summary>
    private static RawSourceWaveStream DecodeManaged(byte[] mp3)
    {
        using var mpeg = new NLayer.MpegFile(new MemoryStream(mp3, writable: false));
        var format = WaveFormat.CreateIeeeFloatWaveFormat(mpeg.SampleRate, mpeg.Channels);

        var floats = new float[16384];
        var chunk = new byte[floats.Length * sizeof(float)];
        var pcm = new MemoryStream();
        int read;
        while ((read = mpeg.ReadSamples(floats, 0, floats.Length)) > 0)
        {
            Buffer.BlockCopy(floats, 0, chunk, 0, read * sizeof(float));
            pcm.Write(chunk, 0, read * sizeof(float));
        }
        if (pcm.Length == 0)
            throw new InvalidDataException("Не удалось разобрать полученный аудиофайл");
        pcm.Position = 0;
        return new RawSourceWaveStream(pcm, format);
    }

    /// Проигрывание из памяти. Три вещи, из-за которых озвучка раньше
    /// «заикалась» или меняла громкость всей системы:
    ///  1) два буфера по 60 мс — при загрузке процессора звук не успевал
    ///     подкачиваться и рвался. Теперь три буфера по 200 мс;
    ///  2) громкость задавалась свойством звукового устройства, а оно у
    ///     части драйверов меняет ОБЩУЮ громкость Windows. Теперь уровень
    ///     применяется к самим сэмплам;
    ///  3) окончание ждали опросом каждые 20 мс — теперь по событию.
    private async Task PlayAsync(byte[] mp3, int volumePercent, CancellationToken ct)
    {
        using var reader = CreateMp3Reader(mp3);
        var limit = EstimatePlayLimit(mp3, reader);

        WaveOutEvent output;
        try { output = new WaveOutEvent { DesiredLatency = 200, NumberOfBuffers = 3 }; }
        catch { return; } // устройство занято — не держим очередь озвучки

        using (output)
        {
            var done = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            output.PlaybackStopped += (_, _) => done.TrySetResult();
            _output = output;
            try
            {
                output.Init(WithVolume(reader, volumePercent));
                using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                timeoutCts.CancelAfter(limit);
                using var cancel = timeoutCts.Token.Register(() => { try { output.Stop(); } catch { } });
                // Отмена могла прийти до старта — иначе начали бы играть фразу,
                // которую уже отменили.
                if (ct.IsCancellationRequested) return;

                output.Play();

                /* Страховка от зависания очереди: если драйвер звука не пришлёт
                   событие окончания ИЛИ застрянет в состоянии «играет», фраза
                   держала бы очередь озвучки вечно и все следующие сообщения
                   замолчали бы. Ждём не дольше длительности аудио + запас. */
                _ = Task.Run(async () =>
                {
                    try
                    {
                        var deadline = DateTime.UtcNow + limit;
                        while (!done.Task.IsCompleted && DateTime.UtcNow < deadline)
                        {
                            if (timeoutCts.IsCancellationRequested) break;
                            if (output.PlaybackState == PlaybackState.Stopped) break;
                            await Task.Delay(100);
                        }
                        done.TrySetResult();
                    }
                    catch { done.TrySetResult(); }
                });

                await done.Task;
            }
            finally
            {
                if (ReferenceEquals(_output, output)) _output = null;
            }
        }
    }

    private volatile bool _paused;

    /// Ожидание окончания фразы в виджете OBS, когда воспроизведение на ПК выключено.
    private async Task WaitAudioDurationAsync(byte[] mp3, CancellationToken ct)
    {
        TimeSpan duration;
        try
        {
            using var reader = CreateMp3Reader(mp3);
            var t = reader.TotalTime;
            duration = t > TimeSpan.Zero && t < TimeSpan.FromMinutes(10)
                ? t
                : TimeSpan.FromSeconds(Math.Clamp(mp3.Length / 12_000.0, 0.4, 300));
        }
        catch
        {
            duration = TimeSpan.FromSeconds(Math.Clamp(mp3.Length / 12_000.0, 0.4, 300));
        }

        var remainingMs = (int)Math.Ceiling(duration.TotalMilliseconds) + 150;
        const int stepMs = 100;
        while (remainingMs > 0 && !ct.IsCancellationRequested)
        {
            var chunk = Math.Min(stepMs, remainingMs);
            try { await Task.Delay(chunk, ct); }
            catch (OperationCanceledException) { break; }
            if (!_paused) remainingMs -= chunk;
        }
    }

    /// Верхняя граница ожидания воспроизведения: длина трека + 4 с запаса.
    /// 24 kHz / 96 kbps mono ≈ 12 КБ/с, если контейнер не отдаёт TotalTime.
    private static TimeSpan EstimatePlayLimit(byte[] mp3, WaveStream reader)
    {
        try
        {
            var t = reader.TotalTime;
            if (t > TimeSpan.Zero && t < TimeSpan.FromMinutes(10))
                return t + TimeSpan.FromSeconds(4);
        }
        catch { }
        var seconds = Math.Clamp(mp3.Length / 12_000.0, 1, 300);
        return TimeSpan.FromSeconds(seconds + 4);
    }

    /// Громкость фразы: меняем сами сэмплы, а не устройство вывода.
    private static IWaveProvider WithVolume(WaveStream reader, int volumePercent)
    {
        var level = Math.Clamp(volumePercent, 0, 100) / 100f;
        if (level >= 0.999f) return reader;   // 100% — без лишнего преобразования
        var volume = new VolumeSampleProvider(reader.ToSampleProvider()) { Volume = level };
        return new SampleToWaveProvider16(volume);
    }

    public void Pause()
    {
        _paused = true;
        try { _output?.Pause(); } catch { }
    }

    public void Resume()
    {
        _paused = false;
        try { _output?.Play(); } catch { }
    }

    public void Cancel()
    {
        _paused = false;
        // Всё, что стоит в очереди, озвучивать уже не нужно.
        Interlocked.Increment(ref _generation);
        try { _current?.Cancel(); } catch { }
        try { _output?.Stop(); } catch { }
    }

    /// <summary>
    /// Sec-MS-GEC: Windows FILETIME, округлённый вниз до 5 минут,
    /// + trusted token, SHA-256 в верхнем регистре.
    /// ВАЖНО: время берём СЕРВЕРНОЕ (локальное + измеренный сдвиг часов) —
    /// иначе при неточных часах на ПК сервис отклоняет каждое подключение.
    /// </summary>
    private static string HeaderPath(string response)
    {
        foreach (var line in response.Split("\r\n"))
            if (line.StartsWith("Path:", StringComparison.OrdinalIgnoreCase))
                return line[5..].Trim();
        return "";
    }

    private static string Timestamp() =>
        DateTime.UtcNow.ToString("ddd MMM dd yyyy HH:mm:ss 'GMT+0000 (Coordinated Universal Time)'");

    private static Task SendText(ClientWebSocket ws, string text, CancellationToken ct) =>
        ws.SendAsync(Encoding.UTF8.GetBytes(text), WebSocketMessageType.Text, true, ct);

    private static string CleanText(string text)
    {
        var chars = text.Where(c => c is not '\v' and not '\f' && (c >= ' ' || c is '\n' or '\r' or '\t'));
        return new string(chars.ToArray());
    }

    private static string EscapeXml(string text) =>
        text.Replace("&", "&amp;")
            .Replace("<", "&lt;")
            .Replace(">", "&gt;")
            .Replace("\"", "&quot;")
            .Replace("'", "&apos;");

    public void Dispose()
    {
        Cancel();
        try { _output?.Dispose(); } catch { }
        KillSocket();
        _current?.Dispose();
        _systemHttp.Dispose();
        _directHttp.Dispose();
        try { _gate.Dispose(); } catch { }
        try { _fifo.Dispose(); } catch { }
        try { _wsLock.Dispose(); } catch { }
    }
}
