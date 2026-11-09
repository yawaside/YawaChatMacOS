using System.Text.Json;
using System.Text.Json.Serialization;

namespace YawaChat;

/// <summary>Адрес сервиса озвучки: точка входа, параметр токена и список голосов.</summary>
internal sealed class EdgeEndpointConfig
{
    /// <summary>Подпись для журнала и настроек: «основной», «прежний».</summary>
    [JsonPropertyName("name")] public string Name { get; set; } = "";

    /// <summary>Адрес websocket. Проверка подключается к нему и отправляет конфигурацию формата.</summary>
    [JsonPropertyName("wsBase")] public string WsBase { get; set; } = "";

    /// <summary>Имя параметра с доверенным токеном клиента в строке подключения.</summary>
    [JsonPropertyName("tokenParam")] public string TokenParam { get; set; } = "";

    /// <summary>Адрес списка голосов. По заголовку Date этого ответа сверяются часы.</summary>
    [JsonPropertyName("voicesUrl")] public string VoicesUrl { get; set; } = "";

    /// <summary>Подпротокол рукопожатия, если сервис его ждёт.</summary>
    [JsonPropertyName("subProtocol")] public string? SubProtocol { get; set; }

    /// <summary>Запасной адрес: пробуется после основных.</summary>
    [JsonPropertyName("backup")] public bool Backup { get; set; }

    public bool IsUsable =>
        // Поля в файле мог править человек: пустые и null здесь обычное дело,
        // поэтому проверяем их как строки, а не как «точно заполненные».
        !string.IsNullOrWhiteSpace(Name) &&
        !string.IsNullOrWhiteSpace(TokenParam) &&
        Uri.TryCreate(WsBase, UriKind.Absolute, out var ws) &&
        (ws.Scheme == "wss" || ws.Scheme == "ws") &&
        !string.IsNullOrWhiteSpace(VoicesUrl) &&
        Uri.TryCreate(VoicesUrl, UriKind.Absolute, out var voices) &&
        (voices.Scheme == "https" || voices.Scheme == "http");
}

/// <summary>
/// Настройки подключения к сервису озвучки Edge. Лежат отдельным файлом
/// edge-tts.json рядом с settings.json (%LOCALAPPDATA%\YawaChat), поэтому
/// адреса и версию протокола можно поправить без пересборки приложения:
/// файл читается при запуске и перед каждой проверкой из настроек.
///
/// Файла нет — он создаётся из встроенных значений. Файл повреждён или в нём
/// не осталось ни одного рабочего адреса — берутся встроенные значения, а
/// испорченная копия сохраняется рядом с расширением .broken, чтобы её можно
/// было посмотреть, а не потерять молча.
/// </summary>
internal sealed class EdgeTtsConfig
{
    /// <summary>Версия самого файла настроек: по ней видно, что формат менялся.</summary>
    public const int FormatVersion = 1;

    /// <summary>С какого времени файл считается свежим; меняется при записи.</summary>
    [JsonPropertyName("version")] public int Version { get; set; } = FormatVersion;

    /// <summary>Префикс версии токена подключения в Sec-MS-GEC-Version.</summary>
    [JsonPropertyName("tokenVersion")] public string TokenVersion { get; set; } = "2";

    /// <summary>Версии браузера для токена: первая — предпочтительная.</summary>
    [JsonPropertyName("chromiumVersions")] public List<string> ChromiumVersions { get; set; } = DefaultChromiumVersions();

    /// <summary>Адреса сервиса: первый — основной, остальные пробуются по порядку.</summary>
    [JsonPropertyName("endpoints")] public List<EdgeEndpointConfig> Endpoints { get; set; } = DefaultEndpoints();

    /// <summary>Когда последний раз проверяли адреса и протокол.</summary>
    [JsonPropertyName("checkedUtc")] public string? CheckedUtc { get; set; }

    /// <summary>Итог последней проверки словами — его показывает окно настроек.</summary>
    [JsonPropertyName("lastResult")] public string? LastResult { get; set; }

    /// <summary>Встроенные адреса: тот, которым синтезирует Edge, и прежний домен.</summary>
    public static List<EdgeEndpointConfig> DefaultEndpoints() =>
    [
        new()
        {
            Name = "основной",
            WsBase = "wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1",
            TokenParam = "Ocp-Apim-Subscription-Key",
            // Список голосов пока отдаёт прежний домен: этот запрос Microsoft
            // не переводила, поэтому берём его оттуда.
            VoicesUrl = "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list" +
                        "?trustedclienttoken=" + SecMsGec.TrustedClientToken,
            SubProtocol = "synthesize",
            Backup = false,
        },
        new()
        {
            Name = "прежний",
            WsBase = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1",
            TokenParam = "TrustedClientToken",
            VoicesUrl = "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list" +
                        "?trustedclienttoken=" + SecMsGec.TrustedClientToken,
            SubProtocol = null,
            Backup = true,
        },
    ];

    /// <summary>Встроенные версии браузера: 143 — текущая стабильная, 140 — на случай отката.</summary>
    public static List<string> DefaultChromiumVersions() => ["143.0.3650.75", "140.0.3485.14"];

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        // Файл правят и руками: имена полей принимаем в любом регистре.
        PropertyNameCaseInsensitive = true,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    /// <summary>Первый рабочий адрес: им говорят по умолчанию.</summary>
    public EdgeEndpointConfig? Primary => Endpoints.Find(e => e.IsUsable && !e.Backup) ?? Endpoints.Find(e => e.IsUsable);

    /// <summary>Запасные адреса в порядке файла.</summary>
    public IEnumerable<EdgeEndpointConfig> Reserves =>
        Endpoints.Where(e => e.IsUsable && e.Backup);

    /// <summary>Все рабочие адреса в порядке файла — для перебора при проверке.</summary>
    public IEnumerable<EdgeEndpointConfig> Usable => Endpoints.Where(e => e.IsUsable);

    /// <summary>
    /// Чтение файла. Любая проблема с содержимым не оставляет приложение без
    /// озвучки: берутся встроенные значения, а файл перезаписывается при
    /// следующем сохранении.
    /// </summary>
    public static EdgeTtsConfig Load(string path, out string? problem)
    {
        problem = null;
        if (!File.Exists(path)) return new EdgeTtsConfig();

        try
        {
            var json = File.ReadAllText(path);
            var loaded = JsonSerializer.Deserialize<EdgeTtsConfig>(json, JsonOptions);
            if (loaded == null)
            {
                problem = "файл пуст";
                return new EdgeTtsConfig();
            }

            var trimmed = loaded.Sanitize();
            if (trimmed != null) problem = trimmed;
            return loaded;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
        {
            problem = ex is JsonException ? "файл не читается как JSON" : ex.GetType().Name;
            return new EdgeTtsConfig();
        }
    }

    /// <summary>
    /// Приведение прочитанного файла к рабочему виду. Возвращает описание
    /// того, что пришлось выбросить, либо null, если файл в порядке.
    /// </summary>
    public string? Sanitize()
    {
        var notes = new List<string>();

        if (Version <= 0 || Version > FormatVersion)
        {
            notes.Add("неизвестная версия файла");
            Version = FormatVersion;
        }

        if (string.IsNullOrWhiteSpace(TokenVersion) || !int.TryParse(TokenVersion.Trim(), out var tokenVersion) ||
            tokenVersion <= 0)
        {
            notes.Add("версия токена заменена на 2");
            TokenVersion = "2";
        }
        else TokenVersion = tokenVersion.ToString();

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var endpoints = new List<EdgeEndpointConfig>();
        foreach (var endpoint in Endpoints ?? new List<EdgeEndpointConfig>())
        {
            if (endpoint == null || !endpoint.IsUsable) continue;
            if (!seen.Add(endpoint.WsBase.Trim())) continue;
            endpoint.Name = endpoint.Name.Trim();
            endpoint.WsBase = endpoint.WsBase.Trim();
            endpoint.TokenParam = endpoint.TokenParam.Trim();
            endpoint.VoicesUrl = endpoint.VoicesUrl.Trim();
            if (string.IsNullOrWhiteSpace(endpoint.SubProtocol)) endpoint.SubProtocol = null;
            endpoints.Add(endpoint);
        }
        if (endpoints.Count == 0)
        {
            notes.Add("адреса заменены на встроенные");
            endpoints = DefaultEndpoints();
        }
        if (endpoints.Count != (Endpoints?.Count ?? 0)) notes.Add("часть адресов пропущена");
        Endpoints = endpoints;

        var versions = (ChromiumVersions ?? new List<string>())
            .Select(v => v?.Trim() ?? "")
            .Where(v => IsUsableVersion(v))
            .Distinct()
            .ToList();
        if (versions.Count == 0)
        {
            notes.Add("версии браузера заменены на встроенные");
            versions = DefaultChromiumVersions();
        }
        ChromiumVersions = versions;

        return notes.Count == 0 ? null : string.Join(", ", notes);
    }

    /// <summary>Версия пригодна для токена: есть номер сборки и мажор не старше 130.</summary>
    public static bool IsUsableVersion(string? version)
    {
        if (string.IsNullOrWhiteSpace(version)) return false;
        var parts = version.Trim().Split('.');
        return parts.Length >= 3 && int.TryParse(parts[0], out var major) && major >= 130;
    }

    /// <summary>
    /// Запись файла. Как и настройки, пишем через временный файл: обрыв на
    /// середине не должен оставить огрызок, из-за которого озвучка потеряет
    /// адреса при следующем запуске.
    /// </summary>
    public void Save(string path)
    {
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

        var json = JsonSerializer.Serialize(this, JsonOptions);
        var tmp = path + ".tmp";
        using (var fs = new FileStream(tmp, FileMode.Create, FileAccess.Write, FileShare.None,
                   bufferSize: 4096, options: FileOptions.WriteThrough))
        using (var writer = new StreamWriter(fs, new System.Text.UTF8Encoding(false)))
        {
            writer.Write(json);
            writer.Flush();
            fs.Flush(flushToDisk: true);
        }

        try
        {
            File.Move(tmp, path, overwrite: true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            File.Copy(tmp, path, overwrite: true);
            try { File.Delete(tmp); } catch { }
        }
    }

    /// <summary>
    /// Сохранить испорченный файл рядом, чтобы его можно было посмотреть.
    /// Молчаливая перезапись скрыла бы от пользователя причину сбоя.
    /// </summary>
    public static void KeepBroken(string path)
    {
        try
        {
            if (File.Exists(path)) File.Copy(path, path + ".broken", overwrite: true);
        }
        catch { /* копия — необязательная страховка */ }
    }
}
