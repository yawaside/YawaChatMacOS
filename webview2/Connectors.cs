using System.Net;
using System.Net.Http.Headers;
using System.Net.Security;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace YawaChat;

/* ============================================================
 * Коннекторы площадок (перенос desktop/electron/connectors).
 * Анонимное чтение чата, без OAuth там, где это возможно.
 * Все сообщения уходят в единую точку HostApi.PushChatMessage.
 *
 * Статусы канала:
 *   connecting — идёт подключение
 *   connected  — чат читается, эфир не подтверждён
 *   online     — подтверждён живой эфир (есть данные стрима)
 *   offline    — канала нет в эфире
 *   error      — сбой подключения
 * ============================================================ */

public sealed class ChannelSubInput
{
    public string platform { get; set; } = "";
    public string username { get; set; } = "";
    public string? token { get; set; }
    public string? currency { get; set; }
}

/// OAuth-учётные данные MemeAlerts (раздел «Донаты»). Хост хранит их в
/// настройках, молча продлевает access token по одноразовому refresh token
/// (ротация: новую пару сразу сохраняем) и отдаёт коннектору готовый токен.
public sealed class MemeAlertsAuth
{
    public string ClientId = "";
    public string ClientSecret = "";
    public string RedirectUri = "";
    public string AccessToken = "";
    public string RefreshToken = "";
    public long ExpiresAtMs;
    /// Имя и код аккаунта (GET /api/v1/user/oauth) — для статуса в «Донатах».
    public string Name = "";
    public string Code = "";
}

/// Сообщение чата, которое уходит в рендерер (форма = ChatMsg на фронте).
public sealed class ChatEvent
{
    public string platform { get; set; } = "";
    public string channel { get; set; } = "";
    public string author { get; set; } = "";
    public string color { get; set; } = "";
    public string text { get; set; } = "";
    public string kind { get; set; } = "chat";
    public string[]? badges { get; set; }
    /// ОРИГИНАЛЬНЫЕ значки площадки: картинка + подсказка.
    public BadgeIcon[]? badgeIcons { get; set; }
    /// Аватар автора, если площадка его передаёт (Kick, VK, TikTok, YouTube).
    public string? avatar { get; set; }
    public double? amount { get; set; }
    public string? currency { get; set; }
    /* Идентификаторы Twitch — нужны для НАСТОЯЩЕЙ модерации через Helix:
       msgId — что удалять, userId — кого банить, roomId — в каком канале. */
    public string? msgId { get; set; }
    public string? userId { get; set; }
    public string? roomId { get; set; }
    /// Сквозной номер сообщения в потоке приложения. Окно приложения
    /// возвращает его в chat.hide, когда строку скрыли автомодерация или
    /// фильтры: виджет OBS и оверлей получили её тем же потоком и должны
    /// снять с показа (у площадок, кроме Twitch, своих идентификаторов нет).
    public long sid { get; set; }
    /* Награда за баллы канала (kind == "reward"). Название лежит и в text,
       но звук привязывается к награде, поэтому структурные поля обязательны:
       правка формулировки текста не должна молча ломать настройки стримера. */
    public string? rewardTitle { get; set; }
    public string? rewardId { get; set; }
    public int? rewardCost { get; set; }
    /* Это собственное сообщение приложения, которое площадка вернула обратно
       в поток чата. Окно уже показало его сразу после отправки, поэтому в
       ленту окна такой кадр не идёт (иначе сообщение дублируется). В виджет
       OBS и оверлей он по-прежнему попадает: там нужен полный чат. */
    public bool echoOfOwn { get; set; }
    public long ts { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}

/* ================= собственные сообщения: защита от дублей =================
   Отправляя сообщение из окна приложения, мы показываем его сразу. Площадка
   при этом возвращает это же сообщение в читаемый нами поток чата:
   VK Видео Live — всегда, Twitch — когда отправка шла через API (нужна для
   закрепления). Раньше в ленте появлялись две одинаковые строки.

   Здесь запоминается текст только что отправленного сообщения, и первое
   совпавшее входящее событие помечается как эхо: окно его не получает,
   виджет и оверлей — получают. Ключ живёт недолго, а каждое совпадение
   расходует одну запись: если зритель напишет ровно тот же текст чуть позже,
   его сообщение останется видимым. */
internal static class SelfEchoGuard
{
    private const int TtlMs = 20_000;
    private const int MaxEntries = 40;

    private sealed class Pending
    {
        public int Count;
        public long At;
    }

    private static readonly Dictionary<string, Pending> Map = new(StringComparer.Ordinal);
    private static readonly object Gate = new();

    private static string Key(string platform, string channel, string text) =>
        $"{platform}\u0001{channel.Trim().TrimStart('@', '#').ToLowerInvariant()}\u0001{Normalize(text)}";

    private static string Normalize(string text) =>
        Regex.Replace((text ?? "").Replace('\u00a0', ' ').Replace('\u200b', ' '), @"\s+", " ").Trim();

    public static void Remember(string platform, string channel, string text)
    {
        var key = Key(platform, channel, text);
        lock (Gate)
        {
            Sweep();
            if (Map.TryGetValue(key, out var entry))
            {
                entry.Count++;
                entry.At = Environment.TickCount64;
                return;
            }
            Map[key] = new Pending { Count = 1, At = Environment.TickCount64 };
        }
    }

    public static void Forget(string platform, string channel, string text)
    {
        var key = Key(platform, channel, text);
        lock (Gate)
        {
            if (!Map.TryGetValue(key, out var entry)) return;
            entry.Count--;
            if (entry.Count <= 0) Map.Remove(key);
        }
    }

    /// true — это эхо только что отправленного из приложения сообщения.
    public static bool Consume(string platform, string channel, string text)
    {
        var key = Key(platform, channel, text);
        lock (Gate)
        {
            Sweep();
            if (!Map.TryGetValue(key, out var entry) || entry.Count <= 0) return false;
            entry.Count--;
            if (entry.Count <= 0) Map.Remove(key);
            return true;
        }
    }

    private static void Sweep()
    {
        if (Map.Count == 0) return;
        var now = Environment.TickCount64;
        var dead = new List<string>();
        foreach (var kv in Map)
            if (now - kv.Value.At > TtlMs) dead.Add(kv.Key);
        foreach (var key in dead) Map.Remove(key);
        if (Map.Count <= MaxEntries) return;
        foreach (var key in Map.Keys.Take(Map.Count - MaxEntries).ToList()) Map.Remove(key);
    }
}

/* ================= каталог наград за баллы канала =================
   Название награды нужно звуку: правило «награда → звук» ищется по названию.
   Площадка в событии активации иногда присылает только идентификатор награды,
   поэтому список, загруженный из кабинета (экран «Награды за баллы»),
   запоминается здесь и используется как подсказка id → название. */
internal static class RewardCatalog
{
    private static readonly Dictionary<string, string> VkTitles = new(StringComparer.OrdinalIgnoreCase);
    private static readonly Dictionary<string, int> VkCosts = new(StringComparer.OrdinalIgnoreCase);
    private static readonly object Gate = new();

    public static void RememberVk(string? id, string? title, long? cost = null)
    {
        var key = (id ?? "").Trim();
        var name = (title ?? "").Trim();
        if (key.Length == 0) return;
        lock (Gate)
        {
            if (name.Length > 0 && !name.Equals("награда", StringComparison.OrdinalIgnoreCase))
            {
                if (VkTitles.Count > 500) VkTitles.Clear();
                VkTitles[key] = name;
            }
            if (cost is > 0)
            {
                if (VkCosts.Count > 500) VkCosts.Clear();
                VkCosts[key] = (int)Math.Clamp(cost.Value, 1, int.MaxValue);
            }
        }
    }

    public static string? VkTitle(string? id)
    {
        var key = (id ?? "").Trim();
        if (key.Length == 0) return null;
        lock (Gate) return VkTitles.TryGetValue(key, out var title) ? title : null;
    }

    public static int? VkCost(string? id)
    {
        var key = (id ?? "").Trim();
        if (key.Length == 0) return null;
        lock (Gate) return VkCosts.TryGetValue(key, out var cost) ? cost : null;
    }
}

/// Оригинальный значок площадки: ссылка на картинку и понятное название.
public sealed class BadgeIcon
{
    public string url { get; set; } = "";
    public string title { get; set; } = "";
}

public interface IPlatformConnector : IDisposable
{
    Task RunAsync(CancellationToken ct);
}

/* ------------------------- менеджер ------------------------- */

public sealed class ConnectorManager : IDisposable
{
    /// Токен и логин авторизованного бота Twitch (подставляет HostApi).
    public static string BotToken = "";
    public static string BotLogin = "";
    /// <summary>
    /// Продление входа Twitch по сохранённому токену продления (задаёт HostApi).
    /// true — вход продлён и BotToken уже обновлён; false — нужен повторный вход.
    /// </summary>
    public static Func<Task<bool>>? RenewTwitchAuth;
    /// Токен VK нужен не для чтения публичного чата, а для приватной
    /// websocket-подписки на активации наград. Источник задаёт HostApi.
    public static Func<Task<string>>? VkAccessTokenProvider;
    /// Канонический URL собственного канала VK вошедшего аккаунта (задаёт HostApi).
    public static Func<string>? VkChannelProvider;
    /// <summary>
    /// OAuth-авторизация MemeAlerts (актуальный access token) — задаёт HostApi.
    /// MemeAlerts не имеет «народного» пути по токену виджета: коннектору
    /// нужен access token авторизованного приложения, который HostApi хранит
    /// в настройках и молча продлевает по refresh token. Null — аккаунт не
    /// подключён, коннектору нужно показать, куда идти пользователю.
    /// </summary>
    public static Func<CancellationToken, Task<MemeAlertsAuth?>>? MemeAlertsAuthProvider;

    private static async Task<string> CurrentVkAccessTokenAsync(ChannelSubInput sub)
    {
        var provider = VkAccessTokenProvider;
        if (provider != null)
        {
            try
            {
                var token = await provider();
                if (!string.IsNullOrWhiteSpace(token)) return token.Trim();
            }
            catch (Exception ex)
            {
                AppLog.Warning("vk", $"Не удалось получить токен подписки на награды ({ex.GetType().Name})");
            }
        }
        return (sub.token ?? "").Trim();
    }

    /// Одновременно продлеваем вход только одним запросом, иначе несколько
    /// каналов разом ушли бы обновлять токен и мешали друг другу.
    private static readonly SemaphoreSlim _renewGate = new(1, 1);
    private static DateTime _lastRenewAt = DateTime.MinValue;

    /// <summary>Пытается продлить вход. Не чаще одного раза в минуту.</summary>
    public static async Task<bool> TryRenewTwitchAsync()
    {
        var renew = RenewTwitchAuth;
        if (renew == null) return false;

        await _renewGate.WaitAsync();
        try
        {
            // Токен мог быть обновлён соседним каналом, пока мы ждали.
            if (DateTime.UtcNow - _lastRenewAt < TimeSpan.FromMinutes(1))
                return !string.IsNullOrWhiteSpace(BotToken);
            _lastRenewAt = DateTime.UtcNow;
            return await renew();
        }
        catch { return false; }
        finally { _renewGate.Release(); }
    }

    public delegate void OnChatMessage(ChatEvent msg);
    public delegate void OnChannelStatus(string platform, string username, string status, int viewers);
    public delegate void OnChannelLikes(string platform, string username, long likes);
    public delegate void OnChannelError(string platform, string username, string reason);
    /// Красивое имя канала: площадки вроде Rutube адресуются номером,
    /// а показывать пользователю нужно название канала.
    public delegate void OnChannelTitle(string platform, string username, string title);

    private readonly OnChatMessage _onMsg;
    private readonly OnChannelStatus _onStatus;
    private readonly OnChannelError? _onError;
    private readonly OnChannelTitle? _onTitle;
    private readonly OnChannelLikes? _onLikes;
    // CTS регистрируется до запуска коннектора: Disconnect может прийти,
    // пока его создание или первый сетевой запрос ещё не закончились.
    private readonly Dictionary<string, (IPlatformConnector? conn, CancellationTokenSource cts)> _live = new();
    private readonly Dictionary<string, ChannelSubInput> _subscriptions = new();
    private readonly Dictionary<string, (string status, int viewers)> _lastStatuses = new();
    private readonly Dictionary<string, string> _lastErrors = new();

    public ConnectorManager(OnChatMessage onMsg, OnChannelStatus onStatus,
        OnChannelTitle? onTitle = null, OnChannelError? onError = null, OnChannelLikes? onLikes = null)
    {
        _onMsg = onMsg;
        _onStatus = onStatus;
        _onTitle = onTitle;
        _onError = onError;
        _onLikes = onLikes;
    }

    public void Connect(ChannelSubInput sub)
    {
        var key = $"{sub.platform}:{sub.username.ToLowerInvariant()}";
        Disconnect(sub.platform, sub.username);
        var cts = new CancellationTokenSource();
        lock (_live)
        {
            _subscriptions[key] = sub;
            _live[key] = (null, cts);
        }

        bool current() => !cts.IsCancellationRequested &&
            _live.TryGetValue(key, out var entry) && ReferenceEquals(entry.cts, cts);

        void emit(ChatEvent m)
        {
            lock (_live) if (current()) _onMsg(m);
        }

        void status(string s, int v)
        {
            // Статус от прежнего подключения не должен перезаписать новый.
            // Одинаковые опросы площадки не заставляют React перерисовываться.
            bool statusChanged;
            lock (_live)
            {
                if (!current()) return;
                var hadPrevious = _lastStatuses.TryGetValue(key, out var prev);
                if (hadPrevious && prev.status == s && prev.viewers == v) return;
                statusChanged = !hadPrevious || prev.status != s;
                _lastStatuses[key] = (s, v);
                if (s is "online" or "connected" or "offline") _lastErrors.Remove(key);
                _onStatus(sub.platform, sub.username, s, v);
            }
            // Просмотры меняются часто; в журнал попадают только смены
            // состояния, чтобы не записывать каждое обновление зрителей.
            if (statusChanged) AppLog.Info("channel", $"{sub.platform}/{sub.username}: {s}");
        }

        void channelLikes(long count)
        {
            if (count < 0) return;
            lock (_live)
            {
                if (!current()) return;
                _onLikes?.Invoke(sub.platform, sub.username, count);
            }
        }

        void error(string reason)
        {
            lock (_live)
            {
                if (!current()) return;
                status("error", 0);
                if (_lastErrors.TryGetValue(key, out var last) && last == reason) return;
                _lastErrors[key] = reason;
                _onError?.Invoke(sub.platform, sub.username, reason);
            }
            AppLog.Error("channel", $"{sub.platform}/{sub.username}: {reason}");
        }

        void reportException(Exception ex) => error(ChannelErrorText.Describe(sub.platform, ex));

        // Название канала отправляем один раз: повторы UI не нужны.
        var titleSent = false;
        void title(string t)
        {
            lock (_live)
            {
                if (!current() || titleSent || string.IsNullOrWhiteSpace(t)) return;
                titleSent = true;
                _onTitle?.Invoke(sub.platform, sub.username, t.Trim());
            }
        }

        status("connecting", 0);

        // Twitch: события канала идут отдельным каналом EventSub параллельно IRC
        if (sub.platform == "twitch")
        {
            _ = Task.Run(async () =>
            {
                while (!cts.IsCancellationRequested)
                {
                    if (string.IsNullOrWhiteSpace(BotToken))
                    {
                        try { await Task.Delay(5000, cts.Token); } catch { return; }
                        continue;
                    }
                    using var es = new TwitchEventSubConnector(sub.username, emit);
                    try { await es.RunAsync(cts.Token); }
                    catch (OperationCanceledException) { return; }
                    catch (Exception ex) { AppLog.Warning("eventsub", $"{key}: {ex.GetType().Name}"); }
                    try { await Task.Delay(5000, cts.Token); } catch { return; }
                }
            }, CancellationToken.None);
        }

        // авто-переподключение с нарастающей паузой
        _ = Task.Run(async () =>
        {
            int attempt = 0;
            while (!cts.IsCancellationRequested)
            {
                IPlatformConnector? conn = null;
                try
                {
                    conn = sub.platform switch
                    {
                        // токен бота даёт права модерации и отправки сообщений
                        "twitch" => new TwitchIrcConnector(sub.username, emit, status, BotToken, BotLogin),
                        "kick" => new KickConnector(sub.username, emit, status),
                        "vkplay" => new VkVideoLiveConnector(
                            sub.username, await CurrentVkAccessTokenAsync(sub), emit, status),
                        "youtube" => new YouTubeConnector(sub.username, emit, status, reportException),
                        // TikTok: единственный путь — tiktok-live-connector через Node-мост
                        "tiktok" => new TikTokConnector(sub.username, emit, status, error, channelLikes),
                        "rutube" => new RutubeConnector(sub.username, emit, status, title),
                        "boosty" => new BoostyConnector(sub.username, sub.token ?? "", emit, status),
                        "donationalerts" => new DonationAlertsConnector(sub.username, sub.token ?? "", emit, status),
                        "donatepay" => new DonatePayConnector(sub.currency ?? "₽", sub.token ?? "", emit, status),
                        // MemeAlerts: OAuth-токены живут в настройках хоста,
                        // коннектор берёт их из провайдера в момент подключения.
                        "memealerts" => new MemeAlertsConnector(sub.username, emit, status),
                        _ => throw new InvalidOperationException($"неизвестная площадка {sub.platform}"),
                    };
                    bool registered;
                    lock (_live)
                    {
                        registered = current();
                        if (registered) _live[key] = (conn, cts);
                    }
                    if (!registered) return; // finally освободит созданный коннектор
                    await conn.RunAsync(cts.Token);
                    // Выход без отмены обычно означает потерю соединения. Исключение:
                    // Rutube завершает проверку офлайн-канала, чтобы поискать эфир снова.
                    lock (_live)
                    {
                        if (current() && (!_lastStatuses.TryGetValue(key, out var last) || last.status != "offline"))
                            error("Соединение с чатом прервалось. Приложение попробует подключиться снова.");
                    }
                    attempt = 0;
                }
                catch (OperationCanceledException) when (cts.IsCancellationRequested) { return; }
                catch (Exception ex)
                {
                    AppLog.Warning("channel", $"{key}: сбой {ex.GetType().Name}");
                    reportException(ex);
                }
                finally
                {
                    try { conn?.Dispose(); } catch { }
                    lock (_live) if (current()) _live[key] = (null, cts);
                }

                if (cts.IsCancellationRequested) return;
                var delay = Math.Min(30_000, 3_000 * Math.Max(1, ++attempt));
                try { await Task.Delay(delay, cts.Token); } catch { return; }
            }
        }, CancellationToken.None);
    }

    public void Disconnect(string platform, string username)
    {
        var key = $"{platform}:{username.ToLowerInvariant()}";
        (IPlatformConnector? conn, CancellationTokenSource cts) item;
        lock (_live)
        {
            _subscriptions.Remove(key);
            _lastStatuses.Remove(key);
            _lastErrors.Remove(key);
            if (!_live.Remove(key, out item)) return;
        }
        // После удаления из _live события прежнего экземпляра уже отвергаются
        // проверкой current() — даже если новый канал успели подключить.
        try { item.cts.Cancel(); } catch { }
        try { item.conn?.Dispose(); } catch { }
    }

    /// <summary>
    /// После OAuth переподключаем уже работающие Twitch-каналы: иначе они
    /// продолжают жить в анонимной justinfan-сессии и не возвращают события
    /// модерации/статуса авторизованного аккаунта.
    /// </summary>
    public void RefreshTwitchAuth() => RefreshAuth("twitch");

    /// Переподключить каналы площадки после смены токена.
    public void RefreshAuth(string platform)
    {
        ChannelSubInput[] list;
        lock (_live)
            list = _subscriptions.Values
                .Where(s => s.platform == platform)
                .ToArray();

        foreach (var sub in list)
        {
            Disconnect(sub.platform, sub.username);
            Connect(sub);
        }
    }

    public void Dispose()
    {
        string[] keys;
        lock (_live) keys = _live.Keys.ToArray();
        foreach (var k in keys)
        {
            var parts = k.Split(':', 2);
            Disconnect(parts[0], parts.Length > 1 ? parts[1] : "");
        }
    }
}

/* ------------------------- хелперы ------------------------- */

internal static class Net
{
    public const string UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

    public static HttpClient Http(TimeSpan? timeout = null)
    {
        var h = new HttpClient();
        h.DefaultRequestHeaders.UserAgent.ParseAdd(UA);
        h.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        h.Timeout = timeout ?? TimeSpan.FromSeconds(20);
        return h;
    }

    public static async Task<string?> WsRecv(ClientWebSocket ws, CancellationToken ct)
    {
        var buffer = new byte[32768];
        using var ms = new MemoryStream();
        WebSocketReceiveResult res;
        do
        {
            res = await ws.ReceiveAsync(buffer, ct);
            if (res.MessageType == WebSocketMessageType.Close) return null;
            ms.Write(buffer, 0, res.Count);
        } while (!res.EndOfMessage);
        return Encoding.UTF8.GetString(ms.ToArray());
    }

    public static Task WsSend(ClientWebSocket ws, string text, CancellationToken ct) =>
        ws.SendAsync(Encoding.UTF8.GetBytes(text), WebSocketMessageType.Text, true, ct);

    /// <summary>
    /// Единый период опроса числа зрителей для всех площадок. Раньше у каждой
    /// был свой (Twitch 45 с, Kick 60 с, VK — вообще один раз при подключении),
    /// поэтому счётчик отставал или застывал. 10 секунд — быстрый, но
    /// безопасный для лимитов площадок интервал; YouTube отдельно следует
    /// серверному timeoutMs (обычно 5 секунд).
    /// </summary>
    public const int ViewerPollMs = 10_000;

    /// Задержка, которая возвращает false вместо исключения при отмене —
    /// удобно для фоновых циклов опроса.
    public static async Task<bool> DelayAsync(int milliseconds, CancellationToken ct)
    {
        try { await Task.Delay(milliseconds, ct); return true; }
        catch (OperationCanceledException) { return false; }
    }

    public static string StripHtml(string s) => Regex.Replace(s, "<[^>]+>", "");

    /// <summary>
    /// Универсальный токен картиночного смайла: [[e|URL|имя]].
    /// Рендерер превращает его в <img>, поэтому смайлы всех площадок
    /// (Twitch, Kick, VK) показываются картинками, а не текстом.
    /// </summary>
    public static string Emote(string url, string name) => $"[[e|{url}|{name}]]";

    /// Разбивка строки на code points (для корректной работы с индексами Twitch).
    public static List<string> ToCodePoints(string s)
    {
        var list = new List<string>(s.Length);
        for (int i = 0; i < s.Length;)
        {
            int len = char.IsHighSurrogate(s[i]) && i + 1 < s.Length && char.IsLowSurrogate(s[i + 1]) ? 2 : 1;
            list.Add(s.Substring(i, len));
            i += len;
        }
        return list;
    }

    /// Рекурсивный поиск свойства по имени в JSON-дереве (структуры площадок часто меняются).
    public static bool TryFind(JsonElement el, string name, out JsonElement found, int depth = 6)
    {
        found = default;
        if (depth < 0) return false;
        if (el.ValueKind == JsonValueKind.Object)
        {
            foreach (var p in el.EnumerateObject())
            {
                if (p.NameEquals(name)) { found = p.Value; return true; }
                if (TryFind(p.Value, name, out found, depth - 1)) return true;
            }
        }
        else if (el.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in el.EnumerateArray())
                if (TryFind(item, name, out found, depth - 1)) return true;
        }
        return false;
    }

    public static string? FindString(JsonElement el, string name) =>
        TryFind(el, name, out var f) && f.ValueKind == JsonValueKind.String ? f.GetString() : null;

    /// <summary>
    /// Значение поля строкой. Площадки кладут идентификаторы то строкой, то
    /// числом; раньше числовой id награды терялся, и звук награды не находился.
    /// </summary>
    public static string? FindText(JsonElement el, string name) =>
        TryFind(el, name, out var f)
            ? f.ValueKind switch
            {
                JsonValueKind.String => f.GetString(),
                JsonValueKind.Number => f.GetRawText(),
                _ => null,
            }
            : null;

    /// <summary>Первое непустое значение из нескольких возможных имён поля.</summary>
    public static string? FindAnyText(JsonElement el, params string[] names)
    {
        foreach (var name in names)
        {
            var value = FindText(el, name);
            if (!string.IsNullOrWhiteSpace(value)) return value;
        }
        return null;
    }

    /// <summary>Строка или число из уже найденного JsonElement (без поиска).</summary>
    public static string? TextOf(JsonElement el) =>
        el.ValueKind switch
        {
            JsonValueKind.String => el.GetString(),
            JsonValueKind.Number => el.GetRawText(),
            _ => null,
        };

    public static int FindInt(JsonElement el, string name) =>
        TryFind(el, name, out var f) && f.ValueKind == JsonValueKind.Number && f.TryGetInt32(out var v) ? v : 0;

    public static bool FindBool(JsonElement el, string name) =>
        TryFind(el, name, out var f) && f.ValueKind == JsonValueKind.True;
}

/* ================== TWITCH: оригинальные значки и аватары ==================
 * Значки берём из публичного справочника badges.twitch.tv — это тот же
 * источник, которым пользуется сам сайт Twitch, поэтому картинки ровно те,
 * что зритель видит в чате (включая значки конкретного канала: подписчик
 * с нужным сроком, кастомные значки стримера).
 * Аватары запрашиваются публичным GraphQL twitch.tv — тем же, что уже
 * используется для счётчика зрителей, без входа пользователя. */
internal static class TwitchAssets
{
    private const string WebClientId = "kimne78kx3ncx6brgo4mv6wki5h1ko";
    private const string Gql = "https://gql.twitch.tv/gql";

    private sealed record BadgeInfo(string Url, string Title);

    // ключ: "setID/version" → картинка и подпись
    private static readonly Dictionary<string, BadgeInfo> _global = new(StringComparer.OrdinalIgnoreCase);
    private static readonly Dictionary<string, Dictionary<string, BadgeInfo>> _channel = new(StringComparer.OrdinalIgnoreCase);
    private static readonly HashSet<string> _channelLoading = new(StringComparer.OrdinalIgnoreCase);
    private static bool _globalLoading;
    private static readonly object _gate = new();

    private static readonly Dictionary<string, string> _avatars = new(StringComparer.OrdinalIgnoreCase);
    private static readonly HashSet<string> _avatarLoading = new(StringComparer.OrdinalIgnoreCase);

    private static HttpClient Client()
    {
        var http = Net.Http(TimeSpan.FromSeconds(12));
        http.DefaultRequestHeaders.TryAddWithoutValidation("Client-Id", WebClientId);
        return http;
    }

    private static async Task<JsonDocument?> QueryAsync(string query, object? variables = null)
    {
        try
        {
            using var http = Client();
            var payload = JsonSerializer.Serialize(new { query, variables });
            using var body = new StringContent(payload, Encoding.UTF8, "application/json");
            using var res = await http.PostAsync(Gql, body);
            if (!res.IsSuccessStatusCode) return null;
            return JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        }
        catch { return null; }
    }

    /// Разбор массива значков GraphQL в словарь "setID/version".
    private static void Parse(JsonElement list, Dictionary<string, BadgeInfo> into)
    {
        if (list.ValueKind != JsonValueKind.Array) return;
        foreach (var b in list.EnumerateArray())
        {
            var set = b.TryGetProperty("setID", out var s) ? s.GetString() : null;
            var ver = b.TryGetProperty("version", out var v) ? v.GetString() : null;
            var url = b.TryGetProperty("imageURL", out var u) ? u.GetString() : null;
            if (string.IsNullOrEmpty(set) || string.IsNullOrEmpty(ver) || string.IsNullOrEmpty(url)) continue;
            var title = (b.TryGetProperty("title", out var t) ? t.GetString() : null) ?? set;
            into[$"{set}/{ver}"] = new BadgeInfo(url, title);
        }
    }

    /// <summary>
    /// Подгружает оригинальные значки Twitch: глобальные и значки канала.
    /// ВАЖНО: старый справочник badges.twitch.tv отключён Twitch (домена
    /// больше нет в DNS), поэтому значки берутся тем же GraphQL, которым
    /// пользуется сайт twitch.tv. Без этого в чате показывались только
    /// встроенные иконки приложения.
    /// </summary>
    public static void Prefetch(string channelLogin)
    {
        var login = (channelLogin ?? "").Trim().ToLowerInvariant();

        lock (_gate)
        {
            if (_global.Count == 0 && !_globalLoading)
            {
                _globalLoading = true;
                _ = Task.Run(async () =>
                {
                    for (var attempt = 0; attempt < 4; attempt++)
                    {
                        using var doc = await QueryAsync(
                            "query{badges{setID version title imageURL(size:DOUBLE)}}");
                        if (doc != null &&
                            doc.RootElement.TryGetProperty("data", out var data) &&
                            data.TryGetProperty("badges", out var arr))
                        {
                            lock (_gate) Parse(arr, _global);
                            if (_global.Count > 0) break;
                        }
                        await Task.Delay(3000 * (attempt + 1));
                    }
                    lock (_gate) _globalLoading = false;
                });
            }

            if (login.Length == 0 || _channel.ContainsKey(login) || !_channelLoading.Add(login)) return;
        }

        _ = Task.Run(async () =>
        {
            var map = new Dictionary<string, BadgeInfo>(StringComparer.OrdinalIgnoreCase);
            using (var doc = await QueryAsync(
                "query($l:String!){user(login:$l){broadcastBadges{setID version title imageURL(size:DOUBLE)}}}",
                new { l = login }))
            {
                if (doc != null &&
                    doc.RootElement.TryGetProperty("data", out var data) &&
                    data.TryGetProperty("user", out var user) &&
                    user.ValueKind == JsonValueKind.Object &&
                    user.TryGetProperty("broadcastBadges", out var arr))
                    Parse(arr, map);
            }
            lock (_gate)
            {
                _channel[login] = map;
                _channelLoading.Remove(login);
            }
        });
    }

    /// Значки сообщения по тегу IRC вида "moderator/1,subscriber/12".
    public static BadgeIcon[]? Resolve(string badgesTag, string channelLogin)
    {
        if (string.IsNullOrWhiteSpace(badgesTag)) return null;
        var login = (channelLogin ?? "").Trim().ToLowerInvariant();
        var list = new List<BadgeIcon>();
        lock (_gate)
        {
            _channel.TryGetValue(login, out var own);
            foreach (var raw in badgesTag.Split(',', StringSplitOptions.RemoveEmptyEntries))
            {
                var key = raw.Trim();
                BadgeInfo? info = null;
                // значок канала важнее глобального: у подписчиков свои картинки
                if (own != null && own.TryGetValue(key, out var ci)) info = ci;
                else if (_global.TryGetValue(key, out var gi)) info = gi;
                if (info != null) list.Add(new BadgeIcon { url = info.Url, title = info.Title });
            }
        }
        return list.Count > 0 ? list.ToArray() : null;
    }

    /// Аватар пользователя Twitch: из памяти, иначе подгружаем в фоне.
    public static string? Avatar(string login)
    {
        var key = (login ?? "").Trim().ToLowerInvariant();
        if (key.Length == 0) return null;
        lock (_gate)
        {
            if (_avatars.TryGetValue(key, out var url)) return url.Length > 0 ? url : null;
            if (_avatars.Count > 800) _avatars.Clear();      // память под контролем
            if (!_avatarLoading.Add(key)) return null;
        }

        _ = Task.Run(async () =>
        {
            var found = "";
            using (var doc = await QueryAsync(
                "query($l:String!){user(login:$l){profileImageURL(width:70)}}", new { l = key }))
            {
                if (doc != null) found = Net.FindString(doc.RootElement, "profileImageURL") ?? "";
            }
            lock (_gate)
            {
                _avatars[key] = found;
                _avatarLoading.Remove(key);
            }
        });
        return null;
    }
}
/* ========================== TWITCH (IRC, анонимное чтение) ========================== */

public sealed class TwitchIrcConnector : IPlatformConnector
{
    private readonly string _user;
    private readonly Action<ChatEvent> _emit;
    private readonly Action<string, int> _status;
    private readonly string _botToken;
    private readonly string _botLogin;
    private ClientWebSocket? _chatWs;
    private CancellationTokenSource? _viewerCts;

    /// <summary>Room-id канала: приходит в тегах и нужен модерации Helix.</summary>
    public static readonly Dictionary<string, string> RoomIds = new(StringComparer.OrdinalIgnoreCase);

    /// Живые авторизованные подключения по каналам — через них бот
    /// отправляет ответы команд (IRC-путь надёжнее Helix: ему достаточно
    /// права chat:edit, которое есть даже у старых токенов).
    private static readonly Dictionary<string, TwitchIrcConnector> Live = new(StringComparer.OrdinalIgnoreCase);

    private bool _authenticated;
    /// <summary>Логин авторизованного бота: по нему отличаем свои сообщения.</summary>
    private string _selfLogin = "";
    private readonly SemaphoreSlim _sendGate = new(1, 1);

    private bool ChatSocketOpen => _chatWs?.State == WebSocketState.Open;

    /// ClientWebSocket не допускает несколько параллельных SendAsync, поэтому
    /// все IRC-команды (PING, JOIN и сообщения бота) проходят через один gate.
    private async Task SendIrcAsync(string line, CancellationToken ct = default)
    {
        var ws = _chatWs;
        if (ws?.State != WebSocketState.Open) throw new IOException("Twitch IRC socket закрыт");
        await _sendGate.WaitAsync(ct);
        try
        {
            var bytes = Encoding.UTF8.GetBytes(line + "\r\n");
            await ws.SendAsync(bytes, WebSocketMessageType.Text, true, ct);
        }
        finally { _sendGate.Release(); }
    }

    /// Логин аккаунта по токену (Twitch validate).
    private static async Task<string> ResolveLoginAsync(string token, CancellationToken ct)
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
            http.DefaultRequestHeaders.Add("Authorization", $"OAuth {token}");
            var body = await http.GetStringAsync("https://id.twitch.tv/oauth2/validate", ct);
            using var doc = JsonDocument.Parse(body);
            return Net.FindString(doc.RootElement, "login") ?? "";
        }
        catch { return ""; }
    }

    /// Отправить сообщение в чат канала от имени авторизованного аккаунта.
    public static async Task<bool> TrySendAsync(string channel, string text)
    {
        var key = channel.Trim().TrimStart('#', '@').ToLowerInvariant();

        // Соединение могло ещё подниматься (после входа коннектор
        // переподключается) — коротко ждём готовности, иначе ответ терялся.
        TwitchIrcConnector? conn = null;
        for (var attempt = 0; attempt < 10; attempt++)
        {
            lock (Live) Live.TryGetValue(key, out conn);
            if (conn is { _authenticated: true, ChatSocketOpen: true }) break;
            await Task.Delay(300);
        }
        if (conn is null || !conn._authenticated || !conn.ChatSocketOpen) return false;

        try
        {
            // защита от разрыва строки: перевод строки завершил бы команду IRC
            var safe = text.Replace("\r", " ").Replace("\n", " ");
            if (safe.Length > 480) safe = safe[..480];
            await conn.SendIrcAsync($"PRIVMSG #{conn._user} :{safe}");
            return true;
        }
        catch { return false; }
    }

    public TwitchIrcConnector(string user, Action<ChatEvent> emit, Action<string, int> status,
        string botToken = "", string botLogin = "")
    {
        _user = user.ToLowerInvariant();
        _emit = emit;
        _status = status;
        _botToken = botToken;
        _botLogin = botLogin;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        _status("connecting", 0);

        // Справочник оригинальных значков грузим заранее: к первому сообщению
        // картинки уже на месте, и встроенные иконки даже не мелькают.
        TwitchAssets.Prefetch(_user);

        var cleanToken = (_botToken ?? "").Trim()
            .Replace("oauth:", "", StringComparison.OrdinalIgnoreCase).Trim();
        var configuredLogin = (_botLogin ?? "").Trim();

        // Если логин не сохранён, validate выполняется ПАРАЛЛЕЛЬНО открытию
        // сокета и ограничен 3 секундами — больше он JOIN не задерживает.
        var loginTask = cleanToken.Length > 0 && configuredLogin.Length == 0
            ? ResolveLoginAsync(cleanToken, ct)
            : Task.FromResult(configuredLogin);

        _chatWs = new ClientWebSocket();
        _chatWs.Options.KeepAliveInterval = TimeSpan.FromSeconds(30);

        // БЕЗОПАСНОСТЬ: всегда проверяем TLS-сертификат штатным валидатором.
        // Нельзя повторять соединение с отключённой проверкой даже при локальной
        // TLS-инспекции: по этому сокету передаётся токен бота, а такой обход
        // превращал бы подменённый сертификат в незаметный перехват учётных данных.
        var ircUri = new Uri("wss://irc-ws.chat.twitch.tv:443");
        using (var connectCts = CancellationTokenSource.CreateLinkedTokenSource(ct))
        {
            connectCts.CancelAfter(TimeSpan.FromSeconds(10));
            try
            {
                await _chatWs.ConnectAsync(ircUri, connectCts.Token);
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                throw new TimeoutException("Twitch IRC: нет ответа за 10 секунд");
            }
        }

        var botLogin = await loginTask;
        var useBot = cleanToken.Length > 0 && botLogin.Length > 0;
        var nick = useBot
            ? botLogin.ToLowerInvariant()
            : $"justinfan{Random.Shared.Next(10000, 99999)}";
        _selfLogin = useBot ? nick : "";

        lock (Live) Live[_user] = this;

        // Twitch IRC over WebSocket — тот же транспорт, что в рабочем
        // YawaChat_Hub. Порт 443 обычно открывается мгновенно даже там, где
        // сырой TLS-порт 6697 фильтруется провайдером или антивирусом.
        await SendIrcAsync("CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership", ct);
        await SendIrcAsync(useBot ? $"PASS oauth:{cleanToken}" : "PASS SCHMOOPIIFS", ct);
        await SendIrcAsync($"NICK {nick}", ct);
        await SendIrcAsync($"USER {nick} 8 * :{nick}", ct);
        await SendIrcAsync($"JOIN #{_user}", ct);

        _authenticated = useBot;
        // Не ждём decapi/первое сообщение IRC: сокет уже открыт, JOIN отправлен.
        _status("connected", 0);

        // Реальный статус эфира и зрители обновляются в фоне и не блокируют чат.
        // 1) Публичный GraphQL самого twitch.tv — не зависит от входа/прав
        //    пользователя и возвращает viewersCount прямо из текущего stream.
        // 2) Официальный Helix — запасной путь при наличии OAuth.
        // 3) decapi — последний резерв. Раньше Helix с неподходящим/истёкшим
        //    токеном и кэширующий decapi оставляли счётчик на нуле.
        _viewerCts?.Cancel();
        _viewerCts?.Dispose();
        _viewerCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var viewerToken = _viewerCts.Token;
        _ = Task.Run(async () =>
        {
            using var http = Net.Http(TimeSpan.FromSeconds(6));
            const string webClientId = "kimne78kx3ncx6brgo4mv6wki5h1ko";
            const string gqlQuery =
                "query YawaViewerCount($login: String!) { user(login: $login) { stream { viewersCount type } } }";

            while (!viewerToken.IsCancellationRequested)
            {
                var updated = false;

                // Основной публичный путь — ровно тот запрос, который
                // использует веб-клиент Twitch (Client-Id публичный, не секрет).
                try
                {
                    var payload = JsonSerializer.Serialize(new
                    {
                        operationName = "YawaViewerCount",
                        variables = new { login = _user },
                        query = gqlQuery,
                    });
                    using var req = new HttpRequestMessage(HttpMethod.Post, "https://gql.twitch.tv/gql");
                    req.Headers.TryAddWithoutValidation("Client-Id", webClientId);
                    req.Headers.TryAddWithoutValidation("Cache-Control", "no-cache, no-store");
                    req.Content = new StringContent(payload, Encoding.UTF8, "application/json");
                    using var res = await http.SendAsync(req, viewerToken);
                    if (res.IsSuccessStatusCode)
                    {
                        using var d = JsonDocument.Parse(await res.Content.ReadAsStringAsync(viewerToken));
                        if (Net.TryFind(d.RootElement, "stream", out var stream))
                        {
                            if (stream.ValueKind == JsonValueKind.Null)
                                _status("offline", 0);
                            else if (stream.ValueKind == JsonValueKind.Object)
                                _status("online", Net.FindInt(stream, "viewersCount"));
                            updated = stream.ValueKind is JsonValueKind.Null or JsonValueKind.Object;
                        }
                    }
                }
                catch { /* упадём в Helix ниже */ }

                var token = (string.IsNullOrWhiteSpace(_botToken)
                    ? ConnectorManager.BotToken : _botToken)
                    .Replace("oauth:", "", StringComparison.OrdinalIgnoreCase).Trim();
                if (!updated && token.Length > 0)
                {
                    try
                    {
                        using var req = new HttpRequestMessage(HttpMethod.Get,
                            $"https://api.twitch.tv/helix/streams?user_login={Uri.EscapeDataString(_user)}&first=1");
                        req.Headers.TryAddWithoutValidation("Authorization", $"Bearer {token}");
                        req.Headers.TryAddWithoutValidation("Client-Id", AppAuth.TwitchClientId);
                        req.Headers.TryAddWithoutValidation("Cache-Control", "no-cache, no-store");
                        using var res = await http.SendAsync(req, viewerToken);
                        if (res.IsSuccessStatusCode)
                        {
                            using var d = JsonDocument.Parse(await res.Content.ReadAsStringAsync(viewerToken));
                            if (d.RootElement.TryGetProperty("data", out var arr) &&
                                arr.ValueKind == JsonValueKind.Array)
                            {
                                if (arr.GetArrayLength() > 0)
                                    _status("online", Net.FindInt(arr[0], "viewer_count"));
                                else
                                    _status("offline", 0);
                                updated = true;
                            }
                        }
                    }
                    catch { /* упадём в decapi ниже */ }
                }

                if (!updated)
                {
                    try
                    {
                        var nonce = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                        var s = (await http.GetStringAsync(
                            $"https://decapi.me/twitch/viewercount/{_user}?_={nonce}", viewerToken)).Trim();
                        if (int.TryParse(s, out var v) && v >= 0)
                            _status("online", v);
                        else if (s.Contains("offline", StringComparison.OrdinalIgnoreCase))
                            _status("offline", 0);
                    }
                    catch { /* сеть не влияет на готовность IRC */ }
                }

                if (!await Net.DelayAsync(Net.ViewerPollMs, viewerToken)) return;
            }
        }, CancellationToken.None);

        while (!ct.IsCancellationRequested)
        {
            var frame = await Net.WsRecv(_chatWs, ct);
            if (frame == null) throw new IOException("Twitch IRC: соединение закрыто");

            foreach (var line in frame.Split("\r\n", StringSplitOptions.RemoveEmptyEntries))
            {
                if (line.StartsWith("PING", StringComparison.Ordinal))
                {
                    await SendIrcAsync("PONG :tmi.twitch.tv", ct);
                    continue;
                }

                if (line.Contains("NOTICE", StringComparison.Ordinal) &&
                    (line.Contains("authentication failed", StringComparison.OrdinalIgnoreCase) ||
                     line.Contains("Improperly formatted auth", StringComparison.OrdinalIgnoreCase) ||
                     line.Contains("Login unsuccessful", StringComparison.OrdinalIgnoreCase)))
                {
                    // Сломанный токен не должен лишать пользователя публичного
                    // чата: сразу пробуем анонимный вход на текущем сокете.
                    _authenticated = false;
                    var guest = $"justinfan{Random.Shared.Next(10000, 99999)}";
                    await SendIrcAsync("PASS SCHMOOPIIFS", ct);
                    await SendIrcAsync($"NICK {guest}", ct);
                    await SendIrcAsync($"USER {guest} 8 * :{guest}", ct);
                    await SendIrcAsync($"JOIN #{_user}", ct);
                    continue;
                }

                try
                {
                    if (line.Contains(" PRIVMSG ", StringComparison.Ordinal)) HandlePrivmsg(line);
                    else if (line.Contains(" USERNOTICE ", StringComparison.Ordinal)) HandleUserNotice(line);
                    else if (line.Contains(" CLEARMSG ", StringComparison.Ordinal)) HandleClearMsg(line);
                    else if (line.Contains(" CLEARCHAT ", StringComparison.Ordinal)) HandleClearChat(line);
                    else if (line.Contains(" ROOMSTATE ", StringComparison.Ordinal))
                    {
                        var tags = Tags(line);
                        if (tags.TryGetValue("room-id", out var rid) && rid.Length > 0)
                            lock (RoomIds) RoomIds[_user] = rid;
                    }
                }
                catch (Exception ex)
                {
                    AppLog.Debug("twitch", $"Ошибка разбора сообщения: {ex.GetType().Name}");
                }
            }
        }
    }

    private static Dictionary<string, string> Tags(string line)
    {
        var map = new Dictionary<string, string>();
        if (!line.StartsWith('@')) return map;
        var end = line.IndexOf(' ');
        if (end < 1) return map;
        foreach (var kv in line.Substring(1, end - 1).Split(';'))
        {
            var eq = kv.IndexOf('=');
            if (eq > 0) map[kv[..eq]] = kv[(eq + 1)..];
        }
        return map;
    }

    private static string ExtractText(string line, string marker)
    {
        var mi = line.IndexOf(marker, StringComparison.Ordinal);
        if (mi < 0) return "";
        var i = line.IndexOf(" :", mi, StringComparison.Ordinal);
        return i < 0 ? "" : line[(i + 2)..];
    }

    private void HandlePrivmsg(string line)
    {
        var tags = Tags(line);
        var text = ExtractText(line, "PRIVMSG");
        if (string.IsNullOrEmpty(text)) return;

        /* Своё сообщение, отправленное ради закрепления через API, Twitch
           возвращает в IRC как обычную строку чата. Окно уже показало его
           сразу, поэтому помечаем кадр эхом: в ленту окна он не попадёт.
           Проверяем ДО разбора эмоутов: сравнение идёт с исходным текстом,
           который отправляло приложение. */
        var senderLogin = tags.TryGetValue("login", out var loginTag) ? loginTag.Trim().ToLowerInvariant() : "";
        var ownEcho = _selfLogin.Length > 0
            && senderLogin == _selfLogin
            && SelfEchoGuard.Consume("twitch", _user, text);

        // Эмоуты Twitch: "25:0-4,12-23/354:30-35".
        // ВАЖНО: индексы указаны в code points (символах Юникода), а не в UTF-16.
        // Раньше это давало выход за границы на кириллице/эмодзи и роняло коннектор.
        if (tags.TryGetValue("emotes", out var em) && !string.IsNullOrEmpty(em))
        {
            var cps = Net.ToCodePoints(text);
            var spans = new List<(int start, int end, string id)>();
            foreach (var group in em.Split('/'))
            {
                // Twitch указывает id один раз на всю группу:
                //   25:0-4,6-10,12-16
                // Старый код ждал "25:" перед каждым диапазоном и терял
                // второй и последующие одинаковые смайлы.
                var colon = group.IndexOf(':');
                if (colon <= 0) continue;
                var id = group[..colon];
                foreach (var range in group[(colon + 1)..].Split(','))
                {
                    var dash = range.IndexOf('-');
                    if (dash <= 0) continue;
                    if (int.TryParse(range[..dash], out var s) &&
                        int.TryParse(range[(dash + 1)..], out var e))
                        spans.Add((s, e, id));
                }
            }

            spans.Sort((a, b) => b.start.CompareTo(a.start));
            foreach (var (s, e, id) in spans)
            {
                if (s < 0 || e >= cps.Count || e < s) continue;
                cps.RemoveRange(s, e - s + 1);
                cps.Insert(s, Net.Emote($"https://static-cdn.jtvnw.net/emoticons/v2/{id}/default/dark/2.0", "emote"));
            }
            text = string.Concat(cps);
        }

        var badgeTag = tags.TryGetValue("badges", out var b) ? b : "";
        var badges = ParseBadges(badgeTag);
        var roomId = tags.TryGetValue("room-id", out var room) && room.Length > 0 ? room : "";
        if (roomId.Length > 0) lock (RoomIds) RoomIds[_user] = roomId;

        // оригинальные значки и аватар Twitch — как в самом чате площадки
        TwitchAssets.Prefetch(_user);
        var login = tags.TryGetValue("login", out var lg) && lg.Length > 0
            ? lg
            : (tags.TryGetValue("display-name", out var dnl) ? dnl : _user);

        _emit(new ChatEvent
        {
            platform = "twitch",
            channel = _user,
            author = tags.TryGetValue("display-name", out var dn) && dn.Length > 0 ? dn : _user,
            color = tags.TryGetValue("color", out var c) ? c : "",
            text = text,
            kind = "chat",
            echoOfOwn = ownEcho,
            badges = badges.Length > 0 ? badges : null,
            badgeIcons = TwitchAssets.Resolve(badgeTag, _user),
            avatar = TwitchAssets.Avatar(login.ToLowerInvariant()),
            // идентификаторы для модерации через Helix
            msgId = tags.TryGetValue("id", out var mid) ? mid : null,
            userId = tags.TryGetValue("user-id", out var uid) ? uid : null,
            roomId = tags.TryGetValue("room-id", out var rid2) ? rid2 : null,
        });
    }

    /// Сообщение удалено модератором (в том числе из другого клиента).
    private void HandleClearMsg(string line)
    {
        var tags = Tags(line);
        var target = tags.TryGetValue("target-msg-id", out var t) ? t : "";
        if (target.Length == 0) return;
        _emit(new ChatEvent
        {
            platform = "twitch",
            channel = _user,
            kind = "moderation.delete",
            msgId = target,
            author = tags.TryGetValue("login", out var l) ? l : "",
            text = "",
        });
    }

    /// Бан/таймаут пользователя либо полная очистка чата.
    private void HandleClearChat(string line)
    {
        var tags = Tags(line);
        var login = ExtractText(line, "CLEARCHAT").Trim();
        var targetUserId = tags.TryGetValue("target-user-id", out var tu) ? tu.Trim() : "";
        var isSingleUser = login.Length > 0 || targetUserId.Length > 0;
        _emit(new ChatEvent
        {
            platform = "twitch",
            channel = _user,
            kind = isSingleUser ? "moderation.ban" : "moderation.clear",
            author = login,
            userId = targetUserId.Length > 0 ? targetUserId : null,
            text = tags.TryGetValue("ban-duration", out var d) ? d : "",
        });
    }

    private void HandleUserNotice(string line)
    {
        var tags = Tags(line);
        if (!tags.TryGetValue("msg-id", out var id)) return;
        var sys = tags.TryGetValue("system-msg", out var sm) ? sm.Replace("\\s", " ") : "";
        var author = tags.TryGetValue("display-name", out var dn) ? dn : "";
        var ev = new ChatEvent { platform = "twitch", channel = _user, author = author, text = sys };
        switch (id)
        {
            case "sub": case "resub": ev.kind = "sub"; break;
            case "subgift": case "submysterygift": ev.kind = "gift"; break;
            case "raid": ev.kind = "raid"; break;
            case "bitsbadgetier": ev.kind = "bits"; break;
            default: return;
        }
        _emit(ev);
    }

    private static string[] ParseBadges(string s)
    {
        var list = new List<string>();
        foreach (var b in s.Split(',', StringSplitOptions.RemoveEmptyEntries))
        {
            var name = b.Split('/')[0];
            var map = name switch
            {
                // владелец канала — отдельный значок (камера), а не «модератор»
                "broadcaster" => "broadcaster",
                "moderator" => "mod",
                "subscriber" => "sub",
                "founder" => "founder",
                "vip" => "vip",
                "turbo" or "premium" => "turbo",
                "staff" or "admin" or "global_mod" => "staff",
                "partner" or "verified" => "verified",
                // наградные и выбираемые значки Twitch
                "bits" or "bits-leader" or "anonymous-cheerer" => "bits",
                "sub-gifter" or "sub-gift-leader" => "gifter",
                "artist-badge" => "artist",
                _ => "",
            };
            if (map.Length > 0) list.Add(map);
        }
        return list.ToArray();
    }

    public void Dispose()
    {
        lock (Live)
        {
            if (Live.TryGetValue(_user, out var cur) && ReferenceEquals(cur, this)) Live.Remove(_user);
        }
        _authenticated = false;
        try { _viewerCts?.Cancel(); } catch { }
        try { _viewerCts?.Dispose(); } catch { }
        _viewerCts = null;
        var ws = _chatWs;
        _chatWs = null;
        try { ws?.Abort(); } catch { }
        try { ws?.Dispose(); } catch { }
    }
}

/* ========================== KICK (Pusher WebSocket) ========================== */

/* ============ TWITCH EVENTSUB (фолловы, подписки, награды, рейды, биты) ============ */

/// <summary>
/// События канала Twitch приходят НЕ в IRC, а через EventSub WebSocket.
/// Именно поэтому раньше в ленте не было фолловов, подписок и наград за
/// баллы: IRC отдаёт только USERNOTICE (ресабы/рейды) и ничего про
/// награды и новых фолловеров. Работает поверх токена, полученного при
/// входе в разделе «Чат-бот».
/// </summary>
public sealed class TwitchEventSubConnector : IPlatformConnector
{
    private const string WsUrl = "wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30";

    private readonly string _channelLogin;
    private readonly Action<ChatEvent> _emit;
    private ClientWebSocket? _ws;

    public TwitchEventSubConnector(string channelLogin, Action<ChatEvent> emit)
    {
        _channelLogin = channelLogin.Trim().TrimStart('@').ToLowerInvariant();
        _emit = emit;
    }

    /// Диагностика видна пользователю в ленте: иначе «событий нет» без причины.
    private void Note(string text) => _emit(new ChatEvent
    {
        platform = "twitch",
        channel = _channelLogin,
        kind = "system",
        text = text,
    });

    /// Уже показанные диагностические Note (на канал и ситуацию за сессию
    /// приложения): один и тот же статус не должен спамить в ленту на
    /// каждом переподключении EventSub.
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, byte> _notedOnce =
        new(StringComparer.OrdinalIgnoreCase);

    private void NoteOnce(string situation, string text)
    {
        if (_notedOnce.TryAdd(_channelLogin + "|" + situation, 0))
            Note(text);
    }

    public async Task RunAsync(CancellationToken ct)
    {
        var token = ConnectorManager.BotToken;
        if (string.IsNullOrWhiteSpace(token)) return;   // без входа событий нет

        using var http = Net.Http();
        http.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");
        http.DefaultRequestHeaders.Add("Client-Id", AppAuth.TwitchClientId);

        var broadcasterId = await UserId(http, _channelLogin, ct);
        var selfId = await SelfId(token, ct);

        // Пустой selfId = токен истёк (обычно через сутки). Раньше здесь
        // просто писалась строка в ленту — и так каждые пять секунд без
        // конца. Теперь молча продлеваем вход и повторяем попытку.
        if (selfId.Length == 0 && await ConnectorManager.TryRenewTwitchAsync())
        {
            token = ConnectorManager.BotToken;
            if (!string.IsNullOrWhiteSpace(token))
            {
                http.DefaultRequestHeaders.Remove("Authorization");
                http.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");
                selfId = await SelfId(token, ct);
                if (broadcasterId.Length == 0)
                    broadcasterId = await UserId(http, _channelLogin, ct);
            }
        }

        if (broadcasterId.Length == 0 || selfId.Length == 0)
        {
            // Одно сообщение на канал за сеанс вместо потока одинаковых строк.
            NoteOnce("no-id", selfId.Length == 0
                ? "Twitch: вход устарел — войдите в чат-бот заново, чтобы вернулись события канала"
                : $"События Twitch: не удалось определить id канала {_channelLogin}");
            // Пауза перед следующей попыткой: без неё менеджер дёргал
            // подключение каждые пять секунд.
            await Net.DelayAsync(300_000, ct);
            return;
        }

        _ws = new ClientWebSocket();
        await _ws.ConnectAsync(new Uri(WsUrl), ct);

        while (!ct.IsCancellationRequested)
        {
            var frame = await Net.WsRecv(_ws, ct);
            if (frame == null) throw new InvalidOperationException("Twitch EventSub: соединение закрыто");

            using var doc = JsonDocument.Parse(frame);
            var root = doc.RootElement;
            if (!root.TryGetProperty("metadata", out var meta)) continue;
            var msgType = meta.TryGetProperty("message_type", out var mt) ? mt.GetString() : "";

            if (msgType == "session_welcome")
            {
                var sessionId = Net.FindString(root, "id") ?? "";
                if (sessionId.Length == 0) continue;
                await Subscribe(http, sessionId, broadcasterId, selfId, ct);
            }
            else if (msgType == "notification")
            {
                try { HandleNotification(root); }
                catch (Exception ex) { AppLog.Debug("eventsub", $"Ошибка разбора события: {ex.GetType().Name}"); }
            }
            else if (msgType == "session_reconnect")
            {
                // Twitch просит переехать — выходим, менеджер переподключит
                throw new InvalidOperationException("Twitch EventSub: требуется переподключение");
            }
        }
    }

    private static async Task<string> UserId(HttpClient http, string login, CancellationToken ct)
    {
        try
        {
            var body = await http.GetStringAsync(
                $"https://api.twitch.tv/helix/users?login={Uri.EscapeDataString(login)}", ct);
            using var d = JsonDocument.Parse(body);
            return d.RootElement.TryGetProperty("data", out var arr) && arr.GetArrayLength() > 0
                ? Net.FindString(arr[0], "id") ?? "" : "";
        }
        catch { return ""; }
    }

    private static async Task<string> SelfId(string token, CancellationToken ct)
    {
        try
        {
            using var vh = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
            vh.DefaultRequestHeaders.Add("Authorization", $"OAuth {token}");
            var body = await vh.GetStringAsync("https://id.twitch.tv/oauth2/validate", ct);
            using var d = JsonDocument.Parse(body);
            return Net.FindString(d.RootElement, "user_id") ?? "";
        }
        catch { return ""; }
    }

    /// Подписки на события канала. Часть требует, чтобы вход был выполнен
    /// владельцем канала (награды, подписки) — такие просто не создадутся.
    private async Task Subscribe(HttpClient http, string sessionId, string broadcasterId, string selfId, CancellationToken ct)
    {
        var subs = new (string type, string version, object condition)[]
        {
            ("channel.follow", "2", new { broadcaster_user_id = broadcasterId, moderator_user_id = selfId }),
            ("channel.subscribe", "1", new { broadcaster_user_id = broadcasterId }),
            ("channel.subscription.gift", "1", new { broadcaster_user_id = broadcasterId }),
            ("channel.subscription.message", "1", new { broadcaster_user_id = broadcasterId }),
            ("channel.cheer", "1", new { broadcaster_user_id = broadcasterId }),
            ("channel.raid", "1", new { to_broadcaster_user_id = broadcasterId }),
            ("channel.channel_points_custom_reward_redemption.add", "1", new { broadcaster_user_id = broadcasterId }),
        };

        int ok = 0, failed = 0, denied = 0;
        foreach (var (type, version, condition) in subs)
        {
            try
            {
                var payload = JsonSerializer.Serialize(new
                {
                    type,
                    version,
                    condition,
                    transport = new { method = "websocket", session_id = sessionId },
                });
                using var content = new StringContent(payload, Encoding.UTF8, "application/json");
                var res = await http.PostAsync("https://api.twitch.tv/helix/eventsub/subscriptions", content, ct);
                if (!res.IsSuccessStatusCode)
                {
                    failed++;
                    if ((int)res.StatusCode == 403) denied++;
                    // По одной Note на тип НЕ пишем: на канале без мод-прав
                    // 403 получали все 7 подписок, и каждое переподключение
                    // заливало ленту семью служебными строками.
                }
                else ok++;
            }
            catch { failed++; }
        }

        // Один дедуплицированный итог на ситуацию (повторные переподключения
        // EventSub его не размножат).
        if (failed == 0)
            NoteOnce("ok", $"События Twitch подключены ({ok} подписок): фолловы, подписки, награды, рейды");
        else if (ok == 0 && denied == failed)
            NoteOnce("denied",
                $"События Twitch на @{_channelLogin} недоступны: нужны права модератора канала " +
                "(фолловы/подписки/биты приходят только там, где вы модератор)");
        else if (ok == 0)
            NoteOnce("failed",
                $"События Twitch: подписки отклонены ({failed} из {subs.Length}). " +
                "Если канал ваш — выйдите и войдите в Twitch заново (нужны новые права)");
        else
            NoteOnce("partial",
                $"События Twitch: активно {ok}, отклонено {failed} — для отклонённых нужны права модератора");
    }

    private void HandleNotification(JsonElement root)
    {
        var subType = root.TryGetProperty("metadata", out var meta) && meta.TryGetProperty("subscription_type", out var st)
            ? st.GetString() ?? "" : "";
        if (!root.TryGetProperty("payload", out var payload) || !payload.TryGetProperty("event", out var ev)) return;

        string user = Net.FindString(ev, "user_name") ?? Net.FindString(ev, "user_login") ?? "";
        var e = new ChatEvent { platform = "twitch", channel = _channelLogin, author = user };

        switch (subType)
        {
            case "channel.follow":
                e.kind = "sub";
                e.text = "новый фолловер";
                break;

            case "channel.subscribe":
            {
                var tier = Net.FindString(ev, "tier") ?? "1000";
                e.kind = "sub";
                e.text = $"оформил подписку (Tier {tier[..1]})";
                break;
            }

            case "channel.subscription.message":
            {
                var months = Net.FindInt(ev, "cumulative_months");
                var text = Net.TryFind(ev, "message", out var mo) ? Net.FindString(mo, "text") ?? "" : "";
                e.kind = "sub";
                e.text = months > 0 ? $"продлил подписку ({months} мес.) {text}".Trim() : $"продлил подписку {text}".Trim();
                break;
            }

            case "channel.subscription.gift":
            {
                var total = Net.FindInt(ev, "total");
                var anon = Net.TryFind(ev, "is_anonymous", out var an) && an.ValueKind == JsonValueKind.True;
                e.kind = "gift";
                e.author = anon ? "Аноним" : user;
                e.text = $"подарил {(total > 0 ? total : 1)} подписк(и)";
                break;
            }

            case "channel.cheer":
            {
                var bits = Net.FindInt(ev, "bits");
                var anon = Net.TryFind(ev, "is_anonymous", out var ca) && ca.ValueKind == JsonValueKind.True;
                e.kind = "bits";
                e.author = anon ? "Аноним" : user;
                e.text = $"отправил {bits} бит(ов) {Net.FindString(ev, "message") ?? ""}".Trim();
                break;
            }

            case "channel.raid":
            {
                var from = Net.FindString(ev, "from_broadcaster_user_name") ?? "";
                var viewers = Net.FindInt(ev, "viewers");
                e.kind = "raid";
                e.author = from;
                e.text = $"рейд на {viewers} зрителей";
                break;
            }

            case "channel.channel_points_custom_reward_redemption.add":
            {
                var hasReward = Net.TryFind(ev, "reward", out var rw);
                var rewardName = hasReward
                    ? Net.FindAnyText(rw, "title", "name") ?? "награда"
                    : "награда";
                var input = Net.FindString(ev, "user_input") ?? "";
                e.kind = "reward";
                // название, идентификатор и стоимость награды — отдельными
                // полями: по ним окно приложения выбирает звук этой награды
                if (hasReward)
                {
                    e.rewardTitle = rewardName;
                    e.rewardId = Net.FindAnyText(rw, "id", "reward_id");
                    // стоимость не у всех площадок есть: отсутствие ≠ 0 баллов
                    e.rewardCost = Net.TryFind(rw, "cost", out var costEl)
                        && costEl.ValueKind == JsonValueKind.Number
                        && costEl.TryGetInt32(out var cost)
                        ? cost
                        : (int?)null;
                }
                e.text = string.IsNullOrWhiteSpace(input)
                    ? $"активировал награду «{rewardName}»"
                    : $"активировал награду «{rewardName}»: {input}";
                break;
            }

            default:
                return;
        }

        _emit(e);
    }

    public void Dispose() { try { _ws?.Abort(); } catch { } }
}

public sealed class KickConnector : IPlatformConnector
{
    private readonly string _user;
    private readonly Action<ChatEvent> _emit;
    private readonly Action<string, int> _status;
    private ClientWebSocket? _ws;
    private CancellationTokenSource? _viewerCts;

    public KickConnector(string user, Action<ChatEvent> emit, Action<string, int> status)
    {
        _user = user.ToLowerInvariant();
        _emit = emit;
        _status = status;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        _status("connecting", 0);
        using var http = Net.Http();
        var chJson = await http.GetStringAsync($"https://kick.com/api/v2/channels/{_user}", ct);
        using var ch = JsonDocument.Parse(chJson);
        if (!ch.RootElement.TryGetProperty("chatroom", out var room))
            throw new InvalidOperationException($"Kick: канал «{_user}» не найден");
        var chatroomId = room.GetProperty("id").GetInt32();
        var isLive = ch.RootElement.TryGetProperty("livestream", out var ls) && ls.ValueKind == JsonValueKind.Object;
        var viewers = isLive && ls.TryGetProperty("viewer_count", out var vc) ? vc.GetInt32() : 0;

        _ws = new ClientWebSocket();
        await _ws.ConnectAsync(
            new Uri("wss://ws-us2.pusher.com/app/eb1d5f283081a78b932c?protocol=7&client=js&version=7.6.0&flash=false"), ct);
        await Net.WsSend(_ws, JsonSerializer.Serialize(new
        {
            @event = "pusher:subscribe",
            data = new { auth = "", channel = $"chatrooms.{chatroomId}.v2" },
        }), ct);

        _status(isLive ? "online" : "connected", viewers);

        // Периодическая проверка эфира и числа зрителей. Раньше пауза была
        // 60 секунд — счётчик Kick обновлялся раз в минуту и выглядел
        // «замороженным»; теперь общий для всех площадок интервал.
        _viewerCts?.Cancel();
        _viewerCts?.Dispose();
        _viewerCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var viewerToken = _viewerCts.Token;
        _ = Task.Run(async () =>
        {
            using var poll = Net.Http(TimeSpan.FromSeconds(6));
            while (!viewerToken.IsCancellationRequested)
            {
                if (!await Net.DelayAsync(Net.ViewerPollMs, viewerToken)) return;
                try
                {
                    var nonce = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                    var j = await poll.GetStringAsync(
                        $"https://kick.com/api/v2/channels/{_user}?_={nonce}", viewerToken);
                    using var d = JsonDocument.Parse(j);
                    var live = d.RootElement.TryGetProperty("livestream", out var l) && l.ValueKind == JsonValueKind.Object;
                    var v = live && l.TryGetProperty("viewer_count", out var x) ? x.GetInt32() : 0;
                    _status(live ? "online" : "connected", v);
                }
                catch { }
            }
        }, CancellationToken.None);

        while (!ct.IsCancellationRequested)
        {
            var text = await Net.WsRecv(_ws, ct);
            if (text == null) throw new InvalidOperationException("Kick: соединение закрыто");
            using var doc = JsonDocument.Parse(text);
            var evName = doc.RootElement.TryGetProperty("event", out var e) ? e.GetString() : "";
            if (evName == "pusher:ping")
            {
                await Net.WsSend(_ws, "{\"event\":\"pusher:pong\",\"data\":{}}", ct);
                continue;
            }
            if (!string.Equals(evName, "App\\Events\\ChatMessageEvent", StringComparison.Ordinal)) continue;

            var payload = doc.RootElement.GetProperty("data").GetString();
            if (string.IsNullOrEmpty(payload)) continue;
            using var inner = JsonDocument.Parse(payload);
            var dataEl = inner.RootElement;

            if (dataEl.TryGetProperty("type", out var tp))
            {
                var t = tp.GetString();
                if (t != "message" && t != "reply") continue;
            }
            var content = dataEl.TryGetProperty("content", out var c) ? c.GetString() ?? "" : "";
            // смайлы Kick: [emote:123456:KEKW] → картинка с CDN
            content = Regex.Replace(content, @"\[emote:(\d+):([\w]+)\]",
                m => Net.Emote($"https://files.kick.com/emotes/{m.Groups[1].Value}/fullsize", m.Groups[2].Value));
            if (content.Length == 0) continue;

            var sender = dataEl.GetProperty("sender");
            var author = sender.TryGetProperty("username", out var un) ? un.GetString() ?? "" : "";
            var color = "";
            var badges = new List<string>();
            if (sender.TryGetProperty("identity", out var idn))
            {
                if (idn.TryGetProperty("color", out var cl)) color = cl.GetString() ?? "";
                if (idn.TryGetProperty("badges", out var bArr) && bArr.ValueKind == JsonValueKind.Array)
                    foreach (var b in bArr.EnumerateArray())
                    {
                        var t = b.TryGetProperty("type", out var bt) ? bt.GetString() : "";
                        var map = t switch
                        {
                            "broadcaster" => "broadcaster",
                            "moderator" => "mod",
                            "subscriber" or "sub_gifter" => "sub",
                            "founder" => "founder",
                            "vip" => "vip",
                            "staff" => "staff",
                            "verified" => "verified",
                            _ => "",
                        };
                        if (map.Length > 0) badges.Add(map);
                    }
            }
            _emit(new ChatEvent
            {
                platform = "kick",
                channel = _user,
                author = author,
                color = color,
                text = content,
                kind = "chat",
                badges = badges.Count > 0 ? badges.ToArray() : null,
                avatar = Net.FindString(sender, "profile_pic") ?? Net.FindString(sender, "profilePic"),
            });
        }
    }

    public void Dispose()
    {
        try { _viewerCts?.Cancel(); } catch { }
        try { _viewerCts?.Dispose(); } catch { }
        _viewerCts = null;
        try { _ws?.Abort(); } catch { }
    }
}

/* ============ VK ВИДЕО LIVE (Centrifugo v2, публичный чат) ============
 * Публичный чат читается без OAuth; авторизованный токен дополнительно
 * используется для экспериментальной приватной подписки на активации наград.
 * Протокол (реверс официального веб-клиента live.vkvideo.ru):
 *   1. GET https://api.live.vkvideo.ru/v1/blog/{channel}  → publicWebSocketChannel
 *   2. GET https://api.live.vkvideo.ru/v1/ws/connect      → токен подключения
 *   3. wss://pubsub.live.vkvideo.ru/connection/websocket?cf_protocol_version=v2
 *      с обязательным заголовком Origin: https://live.vkvideo.ru
 *   4. {"connect":{"token":..,"name":"js"},"id":1}
 *      {"subscribe":{"channel":"public-chat:<ch>"},"id":2}
 *      {"subscribe":{"channel":"channel-info:<ch>"},"id":3}
 *   5. keep-alive: сервер шлёт "{}", клиент обязан ответить "{}"
 * Сообщение: push.pub.data.type == "message", блоки текста лежат в data.data[]
 * ==================================================================== */

public sealed class VkVideoLiveConnector : IPlatformConnector
{
    private const string ApiBase = "https://api.live.vkvideo.ru/v1";
    private const string WsUrl = "wss://pubsub.live.vkvideo.ru/connection/websocket?cf_protocol_version=v2";
    private const string DevWsUrl = "wss://pubsub-dev.live.vkvideo.ru/connection/websocket?format=json&cf_protocol_version=v2";
    private const string Origin = "https://live.vkvideo.ru";

    private readonly string _user;
    private readonly string _accessToken;
    private readonly Action<ChatEvent> _emit;
    private readonly Action<string, int> _status;
    private ClientWebSocket? _ws;
    private ClientWebSocket? _devWs;
    private CancellationTokenSource? _viewerCts;
    private CancellationTokenSource? _devCts;

    /// Сигнал «опросить зрителей немедленно». Эфир начинается событием сокета,
    /// а число зрителей приходит только опросом: без этого сигнала счётчик
    /// оставался нулевым до конца десятисекундной паузы.
    private readonly SemaphoreSlim _pollNow = new(0, 1);

    /// <summary>id заявок на награды, уже показанных в ленте (с ограничением размера).</summary>
    private readonly object _demandGate = new();
    private readonly List<string> _seenDemandIds = new();
    private int _catalogRefreshing;

    /// <summary>
    /// Отметить заявку на награду. false — кадр-повтор той же заявки
    /// (создание и смена статуса приходят отдельными событиями).
    /// </summary>
    private bool RememberDemand(string demandId)
    {
        lock (_demandGate)
        {
            if (_seenDemandIds.Contains(demandId)) return false;
            _seenDemandIds.Add(demandId);
            while (_seenDemandIds.Count > 200) _seenDemandIds.RemoveAt(0);
            return true;
        }
    }

    private void RequestViewerPoll()
    {
        try { if (_pollNow.CurrentCount == 0) _pollNow.Release(); } catch { }
    }

    public VkVideoLiveConnector(
        string user, string accessToken, Action<ChatEvent> emit, Action<string, int> status)
    {
        _user = VkLiveApi.NormalizeChannel(user).ToLowerInvariant();
        _accessToken = (accessToken ?? "").Trim();
        _emit = emit;
        _status = status;
    }

    private IEnumerable<string> DevChannelCandidates()
    {
        var list = new List<string>();
        if (_user.Length > 0) list.Add(_user);
        try
        {
            var own = VkLiveApi.NormalizeChannel(ConnectorManager.VkChannelProvider?.Invoke() ?? "").ToLowerInvariant();
            if (own.Length > 0 && !list.Contains(own, StringComparer.OrdinalIgnoreCase))
                list.Add(own);
        }
        catch { }
        return list;
    }

    private async Task<string> CurrentDevTokenAsync()
    {
        try
        {
            var provider = ConnectorManager.VkAccessTokenProvider;
            if (provider != null)
            {
                var fresh = await provider();
                if (!string.IsNullOrWhiteSpace(fresh)) return fresh.Trim();
            }
        }
        catch { }
        return _accessToken;
    }

    private async Task RefreshRewardCatalogAsync(string token, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(token)) return;
        if (Interlocked.CompareExchange(ref _catalogRefreshing, 1, 0) != 0) return;
        try
        {
            foreach (var ch in DevChannelCandidates())
            {
                try
                {
                    var rewards = await VkLiveApi.RewardsAsync(ch, token, ct);
                    foreach (var r in rewards)
                        RewardCatalog.RememberVk(r.Id, r.Name, r.Price);
                    if (rewards.Count > 0) break;
                }
                catch { }
            }
        }
        finally
        {
            Interlocked.Exchange(ref _catalogRefreshing, 0);
        }
    }

    /// Блок данных ответа: API кладёт полезное в "data", но не всегда.
    private static JsonElement VkDataScope(JsonElement root) =>
        root.TryGetProperty("data", out var d) && d.ValueKind == JsonValueKind.Object ? d : root;

    /// Эфир идёт? Читаем isOnline из блока данных, а не первый попавшийся
    /// в дереве — рядом могут лежать статусы соседних блоков с иным значением.
    private static bool VkIsOnline(JsonElement root)
    {
        var scope = VkDataScope(root);
        if (scope.TryGetProperty("isOnline", out var io) &&
            (io.ValueKind == JsonValueKind.True || io.ValueKind == JsonValueKind.False))
            return io.ValueKind == JsonValueKind.True;
        if (scope.TryGetProperty("online", out var on2) &&
            (on2.ValueKind == JsonValueKind.True || on2.ValueKind == JsonValueKind.False))
            return on2.ValueKind == JsonValueKind.True;
        return Net.FindBool(root, "isOnline");
    }

    /// Текущие зрители — это count.viewers блока данных. Общий рекурсивный
    /// поиск по дереву мог попасть в одноимённое поле другого блока
    /// (пиковые/архивные значения) и вернуть устаревшее число — поэтому 0
    /// зрителей никогда не доходил до приложения.
    private static int VkViewers(JsonElement root)
    {
        var scope = VkDataScope(root);
        if (scope.TryGetProperty("count", out var count) && count.ValueKind == JsonValueKind.Object
            && count.TryGetProperty("viewers", out var cv) && cv.TryGetInt32(out var v))
            return v;
        if (scope.TryGetProperty("viewers", out var dv) && dv.TryGetInt32(out var v2))
            return v2;
        return Net.FindInt(root, "viewers");
    }

    /// Запрашивает подпись для приватного канала наград. Вызов использует
    /// Authorization, заданный на HttpClient; без входа сервер вернёт пустой tokens.
    private static async Task<string> VkSubscriptionTokenAsync(HttpClient http, string channel, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get,
            $"{ApiBase}/ws/subscribe?channels={Uri.EscapeDataString(channel)}");
        using var resp = await http.SendAsync(req, ct);
        if (!resp.IsSuccessStatusCode) return "";
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
        if (!Net.TryFind(doc.RootElement, "tokens", out var tokens) || tokens.ValueKind != JsonValueKind.Array)
            return "";
        foreach (var item in tokens.EnumerateArray())
        {
            var name = Net.FindString(item, "channel") ?? "";
            if (name.Length == 0 || name == channel)
                return Net.FindString(item, "token") ?? "";
        }
        return "";
    }

    public async Task RunAsync(CancellationToken ct)
    {
        _status("connecting", 0);

        using var http = Net.Http();
        http.DefaultRequestHeaders.Add("Origin", Origin);
        http.DefaultRequestHeaders.Referrer = new Uri($"{Origin}/{_user}");
        if (_accessToken.Length > 0)
        {
            // Для закрытого channel-info-manage нужен токен пользователя:
            // /ws/subscribe без Authorization возвращает пустой список tokens.
            http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", _accessToken);
        }

        /* 1) информация о канале */
        var blogResp = await http.GetAsync($"{ApiBase}/blog/{_user}", ct);
        if (!blogResp.IsSuccessStatusCode)
            throw new InvalidOperationException($"VK: канал «{_user}» не найден ({(int)blogResp.StatusCode})");
        var blogJson = await blogResp.Content.ReadAsStringAsync(ct);

        using var blogDoc = JsonDocument.Parse(blogJson);
        var blogRoot = blogDoc.RootElement;

        var wsChannel = Net.FindString(blogRoot, "publicWebSocketChannel");
        if (string.IsNullOrEmpty(wsChannel))
            throw new InvalidOperationException("VK: не удалось получить канал чата (publicWebSocketChannel)");

        // API возвращает, например, "blogger:9671656". Рабочий клиент VK
        // берёт часть ПОСЛЕ двоеточия и подписывается на public-chat:9671656.
        var wsChannelId = wsChannel.Contains(':')
            ? wsChannel[(wsChannel.LastIndexOf(':') + 1)..]
            : wsChannel;
        if (string.IsNullOrWhiteSpace(wsChannelId))
            throw new InvalidOperationException("VK: пустой идентификатор websocket-канала");

        // Текущий API отделил профиль канала (/blog) от эфира
        // (/public_video_stream). В /blog больше НЕТ isOnline/viewers, поэтому
        // старый код всегда видел false/0. Читаем фактический эфир отдельно.
        bool live = false;
        int viewers = 0;
        try
        {
            var nonce = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            using var streamReq = new HttpRequestMessage(HttpMethod.Get,
                $"{ApiBase}/blog/{_user}/public_video_stream?_={nonce}");
            streamReq.Headers.TryAddWithoutValidation("Cache-Control", "no-cache, no-store");
            using var streamResp = await http.SendAsync(streamReq, ct);
            if (streamResp.IsSuccessStatusCode)
            {
                using var streamDoc = JsonDocument.Parse(await streamResp.Content.ReadAsStringAsync(ct));
                live = VkIsOnline(streamDoc.RootElement);
                viewers = VkViewers(streamDoc.RootElement);
            }
        }
        catch { /* чат всё равно подключаем */ }

        /* 2) websocket-токен публичного клиента. Вход аккаунта бота здесь не
           нужен: чтение чата остаётся анонимным и работает для любого канала,
           а токен входа используется только для отправки и наград. */
        string wsToken = "";
        try
        {
            using var tokenReq = new HttpRequestMessage(HttpMethod.Get, $"{ApiBase}/ws/connect");
            var tokenResp = await http.SendAsync(tokenReq, ct);
            var tokenJson = await tokenResp.Content.ReadAsStringAsync(ct);
            using var tokenDoc = JsonDocument.Parse(tokenJson);
            wsToken = Net.FindString(tokenDoc.RootElement, "token") ?? "";
        }
        catch { /* публичный чат читается и с пустым токеном */ }

        /* 3) Centrifugo v2 */
        _ws = new ClientWebSocket();
        _ws.Options.SetRequestHeader("Origin", Origin);
        _ws.Options.SetRequestHeader("User-Agent", Net.UA);
        await _ws.ConnectAsync(new Uri(WsUrl), ct);

        await Net.WsSend(_ws, JsonSerializer.Serialize(new { connect = new { token = wsToken, name = "js" }, id = 1 }), ct);
        var hello = await Net.WsRecv(_ws, ct);
        if (hello == null) throw new InvalidOperationException("VK: сервер закрыл соединение при подключении");
        if (hello.Contains("\"error\"", StringComparison.Ordinal))
            throw new InvalidOperationException("VK: отказ авторизации сокета — " + hello);

        var chatCh = $"public-chat:{wsChannelId}";
        var infoCh = $"channel-info:{wsChannelId}";

        await Net.WsSend(_ws, JsonSerializer.Serialize(new { subscribe = new { channel = chatCh }, id = 2 }), ct);
        try
        {
            await WaitForSubscriptionAsync(_ws, 2, ct);
        }
        catch (Exception ex)
        {
            /* Площадка возвращает идентификатор канала то с префиксом
               («blogger:9671656»), то без него. Если подписка с обрезанным
               вариантом отклонена — пробуем исходное значение целиком,
               иначе чат просто не подключался. */
            if (wsChannel == wsChannelId) throw;
            chatCh = $"public-chat:{wsChannel}";
            infoCh = $"channel-info:{wsChannel}";
            AppLog.Warning("vk", $"Подписка на чат не прошла ({ex.GetType().Name}), пробуем запасной канал");
            await Net.WsSend(_ws, JsonSerializer.Serialize(new { subscribe = new { channel = chatCh }, id = 4 }), ct);
            await WaitForSubscriptionAsync(_ws, 4, ct);
        }

        await Net.WsSend(_ws, JsonSerializer.Serialize(new { subscribe = new { channel = infoCh }, id = 3 }), ct);
        // Информация об эфире вспомогательная: её ответ обработает основной
        // цикл. Не блокируем приём сообщений чата ожиданием второй подписки.

        /* Активации наград VK Видео Live:
           1) Попытка приватной подписки на основном сокете (если поддерживается);
           2) Основной официальный путь DevAPI: отдельный сокет
              wss://pubsub-dev.live.vkvideo.ru с подпиской на private_channel_points /
              channel_points + предзагрузка каталога наград и страховочный опрос
              заявок (/v1/channel_point/reward/demands). */
        var manageCh = $"channel-info-manage:{wsChannelId}";
        if (_accessToken.Length > 0)
        {
            try
            {
                var manageToken = await VkSubscriptionTokenAsync(http, manageCh, ct);
                if (manageToken.Length > 0)
                {
                    const int rewardSubscriptionId = 10;
                    await Net.WsSend(_ws, JsonSerializer.Serialize(
                        new { subscribe = new { channel = manageCh, token = manageToken }, id = rewardSubscriptionId }), ct);
                    await WaitForSubscriptionAsync(_ws, rewardSubscriptionId, ct);
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch { /* основной путь наград — DevAPI-сокет ниже */ }
        }

        _devCts?.Cancel();
        _devCts?.Dispose();
        _devCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var devToken = _devCts.Token;
        _ = Task.Run(() => RunDevRewardsLoopAsync(devToken), CancellationToken.None);

        _status(live ? "online" : "connected", live ? viewers : 0);

        /* 3.5) Периодический опрос зрителей. РАНЬШЕ ЕГО НЕ БЫЛО: число
               зрителей бралось один раз при подключении и потом менялось
               только если сокет пришлёт stream_online_status — на практике
               такое событие приходит редко, и счётчик стоял на месте всю
               трансляцию. Теперь состояние канала перечитывается наравне
               с остальными площадками. */
        _viewerCts?.Cancel();
        _viewerCts?.Dispose();
        _viewerCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var viewerToken = _viewerCts.Token;
        _ = Task.Run(async () =>
        {
            using var poll = Net.Http(TimeSpan.FromSeconds(6));
            poll.DefaultRequestHeaders.Add("Origin", Origin);
            poll.DefaultRequestHeaders.Referrer = new Uri($"{Origin}/{_user}");

            while (!viewerToken.IsCancellationRequested)
            {
                // Ждём либо обычную паузу, либо сигнал «эфир начался» —
                // тогда зрители обновляются сразу, а не через десять секунд.
                try { await _pollNow.WaitAsync(Net.ViewerPollMs, viewerToken); }
                catch (OperationCanceledException) { return; }

                try
                {
                    var nonce = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                    using var req = new HttpRequestMessage(HttpMethod.Get,
                        $"{ApiBase}/blog/{_user}/public_video_stream?_={nonce}");
                    req.Headers.TryAddWithoutValidation("Cache-Control", "no-cache, no-store");
                    using var res = await poll.SendAsync(req, viewerToken);
                    if (!res.IsSuccessStatusCode) continue;
                    using var d = JsonDocument.Parse(await res.Content.ReadAsStringAsync(viewerToken));
                    var v = VkViewers(d.RootElement);
                    // Признак эфира у VK приходит не всегда: если площадка
                    // вернула зрителей, эфир точно идёт. Раньше при неузнанном
                    // признаке счётчик принудительно обнулялся.
                    var on = VkIsOnline(d.RootElement) || v > 0;
                    _status(on ? "online" : "connected", on ? v : 0);
                }
                catch { /* временная сетевая ошибка — повторим на следующем круге */ }
            }
        }, CancellationToken.None);

        /* 4) приём сообщений; keep-alive: на "{}" отвечаем "{}" */
        while (!ct.IsCancellationRequested)
        {
            var frame = await Net.WsRecv(_ws, ct);
            if (frame == null) throw new InvalidOperationException("VK: соединение с чатом закрыто");

            // Centrifugo шлёт JSON-объекты, разделённые переводом строки
            foreach (var line in frame.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                var s = line.Trim();
                if (s.Length == 0) continue;
                if (s == "{}")
                {
                    await Net.WsSend(_ws, "{}", ct);   // pong обязателен, иначе сервер рвёт связь
                    continue;
                }
                // Сырой кадр может содержать чат или токен подписки.
                try { HandleFrame(s); }
                catch (Exception ex) { AppLog.Debug("vk", $"Ошибка разбора кадра: {ex.GetType().Name}"); }
            }
        }
    }

    private void HandlePossiblePush(string frame)
    {
        foreach (var line in frame.Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            var value = line.Trim();
            if (value.Length == 0 || value == "{}") continue;
            try { HandleFrame(value); } catch { }
        }
    }

    /// Ждём подтверждение конкретной команды subscribe, не теряя push-события.
    private async Task WaitForSubscriptionAsync(ClientWebSocket ws, int commandId, CancellationToken ct)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(8));
        var waitToken = timeout.Token;

        try
        {
            while (!waitToken.IsCancellationRequested)
            {
                var frame = await Net.WsRecv(ws, waitToken)
                    ?? throw new InvalidOperationException("VK: соединение закрыто во время подписки");
                if (frame.Trim() == "{}")
                {
                    await Net.WsSend(ws, "{}", waitToken);
                    continue;
                }

                foreach (var line in frame.Split('\n', StringSplitOptions.RemoveEmptyEntries))
                {
                    using var doc = JsonDocument.Parse(line);
                    var root = doc.RootElement;
                    if (root.TryGetProperty("push", out _))
                    {
                        HandlePossiblePush(line);
                        continue;
                    }
                    if (!root.TryGetProperty("id", out var id) || id.GetInt32() != commandId)
                        continue;
                    if (root.TryGetProperty("error", out var error))
                    {
                        var reason = Net.FindString(error, "message") ?? error.GetRawText();
                        throw new InvalidOperationException($"VK: подписка {commandId} отклонена: {reason}");
                    }
                    return;
                }
            }
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new TimeoutException($"VK: нет подтверждения подписки {commandId}");
        }

        throw new TimeoutException($"VK: нет подтверждения подписки {commandId}");
    }

    /// <summary>
    /// Фоновый приём событий наград за баллы через официальный DevAPI VK Видео Live:
    /// 1) предзагружает каталог наград канала (id → название и цена);
    /// 2) подключает сокет wss://pubsub-dev.live.vkvideo.ru с подпиской на
    ///    private_channel_points / channel_points;
    /// 3) параллельно опрашивает /v1/channel_point/reward/demands как страховку.
    /// </summary>
    private async Task RunDevRewardsLoopAsync(CancellationToken ct)
    {
        var initialDemandsSeeded = false;
        while (!ct.IsCancellationRequested)
        {
            var token = await CurrentDevTokenAsync();
            if (string.IsNullOrWhiteSpace(token))
            {
                if (!await Net.DelayAsync(5000, ct)) return;
                continue;
            }

            await RefreshRewardCatalogAsync(token, ct);

            // Определяем рабочий URL канала для DevAPI (на случай, если в подписке
            // указан никнейм, а канонический URL канала лежит в botChannel:vkplay).
            var devChannel = _user;
            Dictionary<string, string>? wsChannels = null;
            foreach (var candidate in DevChannelCandidates())
            {
                try
                {
                    wsChannels = await VkLiveApi.WebSocketChannelsAsync(candidate, token, ct);
                    devChannel = candidate;
                    if (wsChannels.Count > 0) break;
                }
                catch { }
            }

            // При первом запуске запоминаем уже висящие старые заявки, чтобы они
            // не озвучивались как новые при старте приложения.
            if (!initialDemandsSeeded)
            {
                try
                {
                    var existing = await VkLiveApi.DemandsAsync(devChannel, token, 50, 0, ct);
                    foreach (var d in existing.Demands)
                    {
                        if (d.Id > 0) RememberDemand(d.Id.ToString());
                    }
                    initialDemandsSeeded = true;
                }
                catch { }
            }

            using var loopCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            var loopToken = loopCts.Token;

            // Страховочный опрос списка заявок на награды каждые 4 секунды:
            // если WebSocket-событие задержалось или не пришло, заявка всё равно
            // мгновенно сработает, а дубликаты отсеет RememberDemand.
            var pollTask = Task.Run(async () =>
            {
                while (!loopToken.IsCancellationRequested)
                {
                    if (!await Net.DelayAsync(4000, loopToken)) return;
                    try
                    {
                        var curToken = await CurrentDevTokenAsync();
                        if (string.IsNullOrWhiteSpace(curToken)) continue;
                        var page = await VkLiveApi.DemandsAsync(devChannel, curToken, 20, 0, loopToken);
                        var demands = page.Demands;
                        if (!initialDemandsSeeded)
                        {
                            foreach (var d in demands)
                                if (d.Id > 0) RememberDemand(d.Id.ToString());
                            initialDemandsSeeded = true;
                            continue;
                        }
                        // Идём от старых к новым
                        for (int i = demands.Count - 1; i >= 0; i--)
                        {
                            var d = demands[i];
                            if (d.Id <= 0) continue;
                            var status = (d.Status ?? "").Trim().ToLowerInvariant();
                            if (status is "rejected" or "canceled" or "cancelled")
                            {
                                RememberDemand(d.Id.ToString());
                                continue;
                            }
                            if (!RememberDemand(d.Id.ToString())) continue;
                            if (!string.IsNullOrWhiteSpace(d.RewardId) && RewardCatalog.VkTitle(d.RewardId) == null)
                                await RefreshRewardCatalogAsync(curToken, loopToken);
                            EmitRewardEvent(
                                d.RewardId,
                                RewardCatalog.VkTitle(d.RewardId),
                                d.Price > 0 ? d.Price : RewardCatalog.VkCost(d.RewardId),
                                d.UserNick,
                                d.UserId > 0 ? d.UserId.ToString() : "",
                                d.Text);
                        }
                    }
                    catch { }
                }
            }, CancellationToken.None);

            try
            {
                var wsToken = await VkLiveApi.WebSocketTokenAsync(token, loopToken);
                wsChannels ??= await VkLiveApi.WebSocketChannelsAsync(devChannel, token, loopToken);

                var wantedKeys = new[] { "private_channel_points", "channel_points", "private_info", "info" };
                var channelsToSub = new List<string>();
                foreach (var k in wantedKeys)
                {
                    if (wsChannels.TryGetValue(k, out var chName) && !string.IsNullOrWhiteSpace(chName)
                        && !channelsToSub.Contains(chName, StringComparer.Ordinal))
                    {
                        channelsToSub.Add(chName);
                    }
                }

                if (wsToken.Length > 0 && channelsToSub.Count > 0)
                {
                    var subTokens = await VkLiveApi.SubscriptionTokensAsync(channelsToSub, token, loopToken);
                    using var devWs = new ClientWebSocket();
                    _devWs = devWs;
                    devWs.Options.SetRequestHeader("Origin", Origin);
                    devWs.Options.SetRequestHeader("User-Agent", Net.UA);
                    await devWs.ConnectAsync(new Uri(DevWsUrl), loopToken);

                    await Net.WsSend(devWs, JsonSerializer.Serialize(new { connect = new { token = wsToken }, id = 1 }), loopToken);
                    var hello = await Net.WsRecv(devWs, loopToken);
                    if (hello == null || hello.Contains("\"error\"", StringComparison.Ordinal))
                        throw new InvalidOperationException("VK DevWS: отказ подключения");

                    var subId = 2;
                    var subscribedAny = false;
                    foreach (var chName in channelsToSub)
                    {
                        try
                        {
                            subTokens.TryGetValue(chName, out var subTok);
                            var id = subId++;
                            object subPayload = !string.IsNullOrEmpty(subTok)
                                ? new { subscribe = new { channel = chName, token = subTok }, id }
                                : new { subscribe = new { channel = chName }, id };
                            await Net.WsSend(devWs, JsonSerializer.Serialize(subPayload), loopToken);
                            await WaitForSubscriptionAsync(devWs, id, loopToken);
                            subscribedAny = true;
                        }
                        catch { /* часть каналов может не требовать подписки или быть недоступна */ }
                    }

                    if (subscribedAny)
                        AppLog.Info("vk", $"Подписка DevAPI на награды и события активна ({devChannel})");

                    while (!loopToken.IsCancellationRequested)
                    {
                        var frame = await Net.WsRecv(devWs, loopToken);
                        if (frame == null) break;
                        foreach (var line in frame.Split('\n', StringSplitOptions.RemoveEmptyEntries))
                        {
                            var s = line.Trim();
                            if (s.Length == 0) continue;
                            if (s == "{}")
                            {
                                await Net.WsSend(devWs, "{}", loopToken);
                                continue;
                            }
                            try { HandleFrame(s); }
                            catch (Exception ex) { AppLog.Debug("vk", $"Ошибка разбора кадра DevAPI: {ex.GetType().Name}"); }
                        }
                    }
                }
                else
                {
                    // Если сокет DevAPI не дал каналов, держим цикл опроса заявок.
                    await pollTask;
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                AppLog.Debug("vk", $"Переподключение сокета наград VK ({ex.GetType().Name})");
            }
            finally
            {
                try { loopCts.Cancel(); } catch { }
                try { _devWs?.Abort(); } catch { }
                _devWs = null;
                try { await pollTask; } catch { }
            }

            if (!await Net.DelayAsync(5000, ct)) return;
        }
    }

    private void EmitRewardEvent(
        string? rewardId,
        string? knownTitle,
        int? rewardCost,
        string? nick,
        string? userId,
        string? userText)
    {
        var rewardName = (knownTitle ?? "").Trim();
        var hasRewardName = rewardName.Length > 0 && !rewardName.Equals("награда", StringComparison.OrdinalIgnoreCase);
        if (!hasRewardName && !string.IsNullOrWhiteSpace(rewardId))
        {
            rewardName = RewardCatalog.VkTitle(rewardId) ?? "";
            hasRewardName = rewardName.Length > 0;
        }
        if (hasRewardName && !string.IsNullOrWhiteSpace(rewardId))
            RewardCatalog.RememberVk(rewardId, rewardName, rewardCost);
        if (string.IsNullOrWhiteSpace(rewardName))
            rewardName = "награда";
        if (rewardCost == null && !string.IsNullOrWhiteSpace(rewardId))
            rewardCost = RewardCatalog.VkCost(rewardId);

        var cleanUser = (nick ?? "").Trim();
        var cleanUid = (userId ?? "").Trim();
        var cleanText = (userText ?? "").Trim();

        _emit(new ChatEvent
        {
            platform = "vkplay",
            channel = _user,
            author = cleanUser,
            userId = cleanUid.Length > 0 ? cleanUid : null,
            text = cleanText.Length == 0
                ? $"активировал награду «{rewardName}»"
                : $"активировал награду «{rewardName}»: {cleanText}",
            kind = "reward",
            rewardTitle = hasRewardName ? rewardName : null,
            rewardId = !string.IsNullOrWhiteSpace(rewardId) ? rewardId : null,
            rewardCost = rewardCost,
        });

        if (cleanText.Length > 0)
        {
            _emit(new ChatEvent
            {
                platform = "vkplay",
                channel = _user,
                author = cleanUser,
                userId = cleanUid.Length > 0 ? cleanUid : null,
                text = cleanText,
                kind = "chat",
            });
        }
    }

    private void HandleFrame(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        // ответ на subscribe с ошибкой — сразу видно причину
        if (root.TryGetProperty("error", out _))
        {
            AppLog.Warning("vk", "Площадка отклонила подписку на чат");
            return;
        }

        if (!root.TryGetProperty("push", out var push)) return;
        if (!push.TryGetProperty("pub", out var pub)) return;
        if (!pub.TryGetProperty("data", out var data)) return;

        var pushChannel = push.TryGetProperty("channel", out var chProp) ? chProp.GetString() ?? "" : "";
        var type = data.TryGetProperty("type", out var t) ? t.GetString() ?? "" : "";

        // Если кадр пришёл из канала наград DevAPI (channel_points / private_channel_points),
        // а тип не указан или содержит reward/demand — обрабатываем как активацию награды.
        if ((pushChannel.Contains("channel_points", StringComparison.OrdinalIgnoreCase)
             || type.Contains("reward_demand", StringComparison.OrdinalIgnoreCase)
             || type.Contains("channel_points_reward", StringComparison.OrdinalIgnoreCase))
            && type is not ("cp_reward_demand" or "cp_reward_demand_update" or "reward_demand"
                or "channel_points_reward_demand_create" or "channel_points_reward_demand_update"))
        {
            type = "channel_points_reward_demand_create";
        }

        // страховка: тип не распознан, но структура похожа на сообщение чата
        if (string.IsNullOrEmpty(type) && data.TryGetProperty("data", out _))
            type = "message";

        switch (type)
        {
            case "message":
                EmitChat(data);
                break;

            case "stream_online_status":
            {
                // единственный достоверный источник статуса эфира. Событие
                // часто приходит ВЛОЖЕННЫМ (type снаружи, данные внутри data) —
                // разворачиваем, иначе статус и зрители терялись, а нулевое
                // число зрителей до ленты не доходило.
                var inner = data.TryGetProperty("data", out var sd) && sd.ValueKind == JsonValueKind.Object ? sd : data;
                var online = inner.TryGetProperty("isOnline", out var io) && io.ValueKind == JsonValueKind.True;
                var v = 0;
                if (inner.TryGetProperty("count", out var cc) && cc.ValueKind == JsonValueKind.Object
                    && cc.TryGetProperty("viewers", out var ccv) && ccv.TryGetInt32(out var cvv))
                    v = cvv;
                else if (inner.TryGetProperty("viewers", out var vw) && vw.TryGetInt32(out var vi))
                    v = vi;
                _status(online ? "online" : "connected", online ? v : 0);
                // событие без числа зрителей — уточняем их прямым запросом
                if (online && v == 0) RequestViewerPoll();
                break;
            }

            case "stream_start":
                // Эфир начался. Число зрителей площадка отдаёт отдельно,
                // поэтому сразу просим внеочередной опрос: раньше счётчик
                // так и оставался нулевым, пока не подойдёт очередная пауза.
                _status("online", 0);
                RequestViewerPoll();
                break;

            case "stream_end":
                _status("connected", 0);
                break;

            // Награда за баллы канала (веб-сокет и официальный DevAPI).
            case "cp_reward_demand":
            case "cp_reward_demand_update":
            case "reward_demand":
            case "channel_points_reward_demand_create":
            case "channel_points_reward_demand_update":
            {
                var inner = data.TryGetProperty("data", out var rd) && rd.ValueKind == JsonValueKind.Object ? rd : data;
                // В DevAPI полезные поля лежат внутри data.demand
                var demand = inner.TryGetProperty("demand", out var dem) && dem.ValueKind == JsonValueKind.Object
                    ? dem : inner;

                /* Одна активация награды приходит двумя кадрами: создание
                   заявки и смена её статуса (одобрение или отказ). Помним id
                   заявок (demandId / demand_id / demand.id): повторный кадр
                   той же заявки не дублируется. */
                var demandId = Net.FindAnyText(demand, "demandId", "demand_id");
                if (string.IsNullOrWhiteSpace(demandId) && demand.TryGetProperty("id", out var didEl))
                    demandId = Net.TextOf(didEl);
                if (!string.IsNullOrWhiteSpace(demandId) && !RememberDemand(demandId))
                    break;

                // Зритель лежит отдельным блоком user, а не полями рядом.
                var who = demand.TryGetProperty("user", out var uEl) && uEl.ValueKind == JsonValueKind.Object
                    ? uEl : demand;
                var nick = Net.FindString(who, "nick")
                    ?? Net.FindString(who, "displayName")
                    ?? Net.FindString(demand, "nick")
                    ?? Net.FindString(demand, "displayName") ?? "";
                var userId = Net.TryFind(who, "id", out var uidEl) && uidEl.ValueKind == JsonValueKind.Number
                    ? uidEl.GetRawText() : "";

                var hasReward = demand.TryGetProperty("reward", out var rw) || Net.TryFind(demand, "reward", out rw);
                string? rewardId = null;
                var rewardName = "";
                if (hasReward)
                {
                    if (rw.ValueKind == JsonValueKind.Object)
                    {
                        rewardId = Net.FindAnyText(rw, "id", "reward_id");
                        rewardName = Net.FindAnyText(rw, "name", "title") ?? "";
                    }
                    else
                    {
                        rewardId = Net.TextOf(rw);
                    }
                }
                if (string.IsNullOrWhiteSpace(rewardId))
                    rewardId = Net.FindAnyText(demand, "reward_id", "rewardId");
                if (string.IsNullOrWhiteSpace(rewardName))
                    rewardName = Net.FindAnyText(demand, "reward_name", "rewardName", "reward_title") ?? "";

                // Если название в кадре не пришло и его ещё нет в каталоге —
                // подгружаем каталог в фоне для следующих активаций.
                if (string.IsNullOrWhiteSpace(rewardName)
                    && !string.IsNullOrWhiteSpace(rewardId)
                    && RewardCatalog.VkTitle(rewardId) == null)
                {
                    _ = Task.Run(async () =>
                    {
                        try
                        {
                            var tok = await CurrentDevTokenAsync();
                            await RefreshRewardCatalogAsync(tok, CancellationToken.None);
                        }
                        catch { }
                    });
                }

                int? rewardCost = null;
                if (hasReward && rw.ValueKind == JsonValueKind.Object)
                {
                    var hasCost = Net.TryFind(rw, "price", out var priceEl);
                    if (!hasCost) hasCost = Net.TryFind(rw, "cost", out priceEl);
                    if (hasCost && priceEl.ValueKind == JsonValueKind.Number && priceEl.TryGetInt32(out var price))
                        rewardCost = price;
                }
                if (rewardCost == null && demand.TryGetProperty("price", out var demPrice)
                    && demPrice.ValueKind == JsonValueKind.Number && demPrice.TryGetInt32(out var dp))
                {
                    rewardCost = dp;
                }

                var userText = BlocksToText(demand, "activationMessage");
                if (userText.Length == 0)
                    userText = BlocksToText(demand, "message_parts");
                if (userText.Length == 0)
                    userText = BlocksToText(demand, "parts");
                if (userText.Length == 0)
                    userText = Net.FindString(demand, "userText")
                        ?? Net.FindString(demand, "user_text") ?? "";

                EmitRewardEvent(rewardId, rewardName, rewardCost, nick, userId, userText);
                break;
            }

            // Донаты и события VK приходят журналом действий канала
            case "actions_journal_new_event":
            case "action_journal_new_event":
            {
                var inner = data.TryGetProperty("data", out var jd) ? jd : data;
                var evType = inner.TryGetProperty("type", out var jt) ? jt.GetString() : "";
                /* Зритель в журнале лежит отдельным блоком (follower /
                   subscriber / user), а не полями рядом с типом события —
                   из-за этого имя приходило пустым. */
                var who = inner;
                foreach (var field in new[] { "follower", "subscriber", "user", "donator" })
                {
                    if (inner.TryGetProperty(field, out var whoEl) && whoEl.ValueKind == JsonValueKind.Object)
                    {
                        who = whoEl;
                        break;
                    }
                }
                var nick = Net.FindString(who, "displayName") ?? Net.FindString(who, "nick")
                    ?? Net.FindString(inner, "displayName") ?? Net.FindString(inner, "nick") ?? "";
                var evUserId = Net.TryFind(who, "id", out var jId) && jId.ValueKind == JsonValueKind.Number
                    ? jId.GetRawText() : "";
                var ev = new ChatEvent
                {
                    platform = "vkplay",
                    channel = _user,
                    author = nick,
                    userId = evUserId.Length > 0 ? evUserId : null,
                };

                switch (evType)
                {
                    case "following":
                    case "actions_journal_follower":
                    case "follower":
                        ev.kind = "sub";
                        ev.text = "новый отслеживающий";
                        break;

                    case "subscription":
                    case "actions_journal_subscription":
                    case "channel_subscription":
                    case "channel_subscription_renew":
                        ev.kind = "sub";
                        ev.text = "оформил подписку канала";
                        break;

                    case "donation":
                    case "actions_journal_donation":
                    {
                        var amount = Net.FindInt(inner, "amount");
                        ev.kind = "donate";
                        ev.amount = amount > 0 ? amount : null;
                        ev.currency = "₽";
                        ev.text = Net.FindString(inner, "message") ?? "";
                        break;
                    }

                    default:
                        return;   // неизвестное событие журнала пропускаем
                }
                _emit(ev);
                break;
            }
        }
    }

    /// Массив блоков текста (text / smile / mention / link) в одну строку.
    /// Поддерживает и веб-формат ({ type: "text", content: ... }), и формат
    /// официального DevAPI ({ text: { content: ... } }, { smile: { ... } }).
    private static string BlocksToText(JsonElement scope, string field)
    {
        if (!scope.TryGetProperty(field, out var blocks) || blocks.ValueKind != JsonValueKind.Array)
            return "";
        var sb = new StringBuilder();
        foreach (var b in blocks.EnumerateArray())
        {
            if (b.ValueKind != JsonValueKind.Object) continue;
            var bt = b.TryGetProperty("type", out var bty) ? bty.GetString() ?? "" : "";
            if (bt.Length > 0)
            {
                switch (bt)
                {
                    case "text":
                        sb.Append(ParseTextBlock(b.TryGetProperty("content", out var cEl) ? cEl.GetString() ?? "" : ""));
                        break;
                    case "smile":
                    {
                        var url = Net.FindString(b, "largeUrl") ?? Net.FindString(b, "large_url")
                                  ?? Net.FindString(b, "mediumUrl") ?? Net.FindString(b, "medium_url")
                                  ?? Net.FindString(b, "smallUrl") ?? Net.FindString(b, "small_url");
                        var nm = Net.FindString(b, "name") ?? "smile";
                        sb.Append(string.IsNullOrEmpty(url) ? $":{nm}:" : Net.Emote(url, nm));
                        break;
                    }
                    case "mention":
                        sb.Append('@')
                          .Append(Net.FindString(b, "displayName") ?? Net.FindString(b, "nick") ?? "")
                          .Append(' ');
                        break;
                    case "link":
                        sb.Append(Net.FindString(b, "content") ?? Net.FindString(b, "url") ?? "");
                        break;
                }
                continue;
            }

            // Формат DevAPI: вложенные объекты text / smile / mention / link
            if (b.TryGetProperty("text", out var tObj) && tObj.ValueKind == JsonValueKind.Object)
            {
                sb.Append(ParseTextBlock(Net.FindString(tObj, "content") ?? ""));
            }
            else if (b.TryGetProperty("smile", out var sObj) && sObj.ValueKind == JsonValueKind.Object)
            {
                var url = Net.FindString(sObj, "large_url") ?? Net.FindString(sObj, "largeUrl")
                          ?? Net.FindString(sObj, "medium_url") ?? Net.FindString(sObj, "small_url");
                var nm = Net.FindString(sObj, "name") ?? "smile";
                sb.Append(string.IsNullOrEmpty(url) ? $":{nm}:" : Net.Emote(url, nm));
            }
            else if (b.TryGetProperty("mention", out var mObj) && mObj.ValueKind == JsonValueKind.Object)
            {
                sb.Append('@')
                  .Append(Net.FindString(mObj, "displayName") ?? Net.FindString(mObj, "nick") ?? "")
                  .Append(' ');
            }
            else if (b.TryGetProperty("link", out var lObj) && lObj.ValueKind == JsonValueKind.Object)
            {
                sb.Append(Net.FindString(lObj, "content") ?? Net.FindString(lObj, "url") ?? "");
            }
        }
        return sb.ToString().Trim();
    }

    private void EmitChat(JsonElement data)
    {
        // тело сообщения: обычно data.data, но встречается и плоская форма
        var msg = data.TryGetProperty("data", out var inner) ? inner : data;

        // автор: author → user → рекурсивный поиск по дереву
        var author = "";
        if (msg.TryGetProperty("author", out var a) || msg.TryGetProperty("user", out a))
            author = (a.TryGetProperty("displayName", out var dn) ? dn.GetString() : null)
                     ?? (a.TryGetProperty("nick", out var nk) ? nk.GetString() : null)
                     ?? "";
        if (string.IsNullOrEmpty(author))
            author = Net.FindString(msg, "displayName") ?? Net.FindString(msg, "nick") ?? "";

        /* Сохраняем идентификаторы автора и сообщения для событий чата.
           Публичный DevAPI не описывает отдельных методов удаления/таймаута;
           /ban указан в гайде; приложение отправляет его через чат API,
           но не получает отдельного подтверждения выполнения. */
        var userId = "";
        if (msg.TryGetProperty("author", out var aIdEl) || msg.TryGetProperty("user", out aIdEl))
        {
            if (aIdEl.ValueKind == JsonValueKind.Object
                && aIdEl.TryGetProperty("id", out var idEl2) && idEl2.ValueKind == JsonValueKind.Number)
                userId = idEl2.GetRawText();
        }
        if (userId.Length == 0 && Net.TryFind(msg, "id", out var anyId) && anyId.ValueKind == JsonValueKind.Number)
            userId = anyId.GetRawText();

        var msgId = msg.TryGetProperty("id", out var msgIdEl) && msgIdEl.ValueKind == JsonValueKind.Number
            ? msgIdEl.GetRawText() : "";

        // бейджи: владелец / модератор + ОРИГИНАЛЬНЫЕ значки площадки
        var badges = new List<string>();
        var badgeIcons = new List<BadgeIcon>();
        if (msg.TryGetProperty("author", out var au))
        {
            if (au.TryGetProperty("isOwner", out var ow) && ow.ValueKind == JsonValueKind.True) badges.Add("broadcaster");
            else if ((au.TryGetProperty("isChatModerator", out var cm) && cm.ValueKind == JsonValueKind.True) ||
                     (au.TryGetProperty("isChannelModerator", out var chm) && chm.ValueKind == JsonValueKind.True))
                badges.Add("mod");
            if (au.TryGetProperty("badges", out var bd) && bd.ValueKind == JsonValueKind.Array && bd.GetArrayLength() > 0)
            {
                badges.Add("sub");
                // VK отдаёт значки готовыми картинками — берём их как есть
                foreach (var b in bd.EnumerateArray())
                {
                    var url = Net.FindString(b, "largeUrl") ?? Net.FindString(b, "mediumUrl")
                              ?? Net.FindString(b, "smallUrl");
                    if (string.IsNullOrEmpty(url)) continue;
                    badgeIcons.Add(new BadgeIcon { url = url, title = Net.FindString(b, "name") ?? "значок" });
                }
            }
        }

        // текст: массив блоков (text / smile / mention / link)
        var sb = new StringBuilder();
        if (!msg.TryGetProperty("data", out var blocks) || blocks.ValueKind != JsonValueKind.Array)
            Net.TryFind(msg, "data", out blocks);   // блоки могут лежать глубже

        if (blocks.ValueKind == JsonValueKind.Array)
        {
            foreach (var b in blocks.EnumerateArray())
            {
                var bt = b.TryGetProperty("type", out var bty) ? bty.GetString() : "";
                switch (bt)
                {
                    case "text":
                    {
                        // content — строка с JSON-массивом: "[\"привет\",\"unstyled\",[]]"
                        var raw = b.TryGetProperty("content", out var cEl) ? cEl.GetString() ?? "" : "";
                        sb.Append(ParseTextBlock(raw));
                        break;
                    }
                    case "smile":
                    {
                        // смайлы VK приходят с готовыми URL — показываем картинкой
                        var url = (b.TryGetProperty("largeUrl", out var lu2) ? lu2.GetString() : null)
                                  ?? (b.TryGetProperty("mediumUrl", out var mu) ? mu.GetString() : null)
                                  ?? (b.TryGetProperty("smallUrl", out var su) ? su.GetString() : null);
                        var nm = b.TryGetProperty("name", out var sn) ? sn.GetString() ?? "smile" : "smile";
                        sb.Append(string.IsNullOrEmpty(url) ? $":{nm}:" : Net.Emote(url, nm));
                        break;
                    }
                    case "mention":
                        sb.Append('@')
                          .Append((b.TryGetProperty("displayName", out var mdn) ? mdn.GetString() : null)
                                  ?? (b.TryGetProperty("nick", out var mn) ? mn.GetString() : "") ?? "")
                          .Append(' ');
                        break;
                    case "link":
                        sb.Append(b.TryGetProperty("content", out var lc) ? lc.GetString() : b.TryGetProperty("url", out var lu) ? lu.GetString() : "");
                        break;
                }
            }
        }

        var text = sb.ToString().Trim();
        // последний резерв: простое текстовое поле
        if (text.Length == 0) text = (Net.FindString(msg, "text") ?? "").Trim();
        if (text.Length == 0) return;

        /* VK возвращает в публичный чат сообщение, отправленное приложением.
           Окно уже показало его сразу после отправки — помечаем кадр эхом,
           чтобы в ленте окна не было двух одинаковых строк. */
        var ownEcho = SelfEchoGuard.Consume("vkplay", _user, text);

        _emit(new ChatEvent
        {
            platform = "vkplay",
            channel = _user,
            author = author,
            text = text,
            kind = "chat",
            echoOfOwn = ownEcho,
            // нужны для модерации на площадке
            userId = userId.Length > 0 ? userId : null,
            msgId = msgId.Length > 0 ? msgId : null,
            badges = badges.Count > 0 ? badges.ToArray() : null,
            badgeIcons = badgeIcons.Count > 0 ? badgeIcons.ToArray() : null,
            // аватар автора: показывается кружком слева от ника
            avatar = Net.FindString(msg, "avatarUrl") ?? Net.FindString(msg, "avatar"),
        });
    }

    /// Блок текста приходит как строка с JSON-массивом ["текст","unstyled",[]]
    private static string ParseTextBlock(string raw)
    {
        if (string.IsNullOrEmpty(raw)) return "";
        if (!raw.TrimStart().StartsWith('[')) return raw;
        try
        {
            using var d = JsonDocument.Parse(raw);
            if (d.RootElement.ValueKind == JsonValueKind.Array && d.RootElement.GetArrayLength() > 0)
            {
                var first = d.RootElement[0];
                if (first.ValueKind == JsonValueKind.String) return first.GetString() ?? "";
            }
        }
        catch { }
        return raw;
    }

    public void Dispose()
    {
        try { _viewerCts?.Cancel(); } catch { }
        try { _viewerCts?.Dispose(); } catch { }
        _viewerCts = null;
        try { _devCts?.Cancel(); } catch { }
        try { _devCts?.Dispose(); } catch { }
        _devCts = null;
        try { _pollNow.Dispose(); } catch { }
        try { _devWs?.Abort(); } catch { }
        try { _ws?.Abort(); } catch { }
    }
}

/* ================== DONATIONALERTS (Centrifugo по секретному токену) ================== */

public sealed class DonationAlertsConnector : IPlatformConnector
{
    private readonly string _user;
    private readonly string _token;
    private readonly Action<ChatEvent> _emit;
    private readonly Action<string, int> _status;
    private ClientWebSocket? _ws;

    public DonationAlertsConnector(string user, string token, Action<ChatEvent> emit, Action<string, int> status)
    {
        _user = user;
        _token = token;
        _emit = emit;
        _status = status;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_token))
            throw new InvalidOperationException(
                "DonationAlerts: вставьте токен из ссылки виджета алертов (Алерты → ссылка ...token=XXXX)");
        _status("connecting", 0);

        // токен вставляют по-разному: с префиксом, ссылкой или как есть
        var token = _token.Trim();
        if (token.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) token = token[7..].Trim();
        var fromUrl = Regex.Match(token, @"token=([A-Za-z0-9_\-]+)");
        if (fromUrl.Success) token = fromUrl.Groups[1].Value;

        // КОРОТКИЙ токен = токен виджета алертов (его вставляет большинство
        // пользователей: он есть в ссылке виджета и не требует OAuth-приложения).
        // Такой токен работает по socket.io, а не по Centrifugo/OAuth.
        if (token.Length < 100)
        {
            await RunWidgetSocketAsync(token, ct);
            return;
        }

        using var http = Net.Http();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Диагностика вместо «молча не подключается»: показываем реальный код ответа.
        var userHttp = await http.GetAsync("https://www.donationalerts.com/api/v1/user/oauth", ct);
        var userResp = await userHttp.Content.ReadAsStringAsync(ct);
        if (!userHttp.IsSuccessStatusCode)
            throw new InvalidOperationException(userHttp.StatusCode switch
            {
                System.Net.HttpStatusCode.Unauthorized =>
                    "DonationAlerts: токен недействителен или истёк. Нужен OAuth access token со scope oauth-user-show и oauth-donation-subscribe",
                System.Net.HttpStatusCode.Forbidden =>
                    "DonationAlerts: у токена нет прав oauth-user-show / oauth-donation-subscribe",
                _ => $"DonationAlerts: API ответил {(int)userHttp.StatusCode}",
            });

        using var userDoc = JsonDocument.Parse(userResp);
        if (!userDoc.RootElement.TryGetProperty("data", out var data))
            throw new InvalidOperationException("DonationAlerts: неожиданный ответ API (нет data)");
        var uid = data.TryGetProperty("id", out var idEl) && idEl.TryGetInt64(out var idVal)
            ? idVal.ToString()
            : throw new InvalidOperationException("DonationAlerts: API не вернул id пользователя");
        var socketToken = data.TryGetProperty("socket_connection_token", out var sct) ? sct.GetString() ?? "" : "";
        if (socketToken.Length == 0)
            throw new InvalidOperationException("DonationAlerts: нет socket_connection_token — добавьте scope oauth-donation-subscribe");

        _ws = new ClientWebSocket();
        await _ws.ConnectAsync(new Uri("wss://centrifugo.donationalerts.com/connection/websocket"), ct);
        // Команда connect по документации DA: params + id, БЕЗ method
        // (method=1 — это subscribe, из-за чего рукопожатие не проходило).
        await Net.WsSend(_ws, JsonSerializer.Serialize(new { @params = new { token = socketToken }, id = 1 }), ct);

        string? clientId = null;
        var handshake = await Net.WsRecv(_ws, ct) ?? throw new InvalidOperationException("DonationAlerts: нет ответа");
        using (var hs = JsonDocument.Parse(handshake))
            if (hs.RootElement.TryGetProperty("result", out var res) && res.TryGetProperty("client", out var cl))
                clientId = cl.GetString();
        if (string.IsNullOrEmpty(clientId)) throw new InvalidOperationException("DonationAlerts: client id не получен");

        var channelName = $"$alerts:donation_{uid}";
        var subBody = JsonSerializer.Serialize(new { channels = new[] { channelName }, client = clientId });
        using var subContent = new StringContent(subBody, Encoding.UTF8, "application/json");
        var subResp = await http.PostAsync("https://www.donationalerts.com/api/v1/centrifuge/subscribe", subContent, ct);
        var subText = await subResp.Content.ReadAsStringAsync(ct);
        if (!subResp.IsSuccessStatusCode)
            throw new InvalidOperationException($"DonationAlerts: подписка отклонена ({(int)subResp.StatusCode}) {subText}");

        // Полученный channel token обязателен: без него Centrifugo не отдаёт события.
        try
        {
            using var subDoc = JsonDocument.Parse(subText);
            if (subDoc.RootElement.TryGetProperty("channels", out var chArr) && chArr.ValueKind == JsonValueKind.Array)
            {
                foreach (var ch in chArr.EnumerateArray())
                {
                    var name = Net.FindString(ch, "channel") ?? channelName;
                    var chToken = Net.FindString(ch, "token") ?? "";
                    if (chToken.Length == 0) continue;
                    await Net.WsSend(_ws, JsonSerializer.Serialize(new
                    {
                        @params = new { channel = name, token = chToken },
                        method = 1,
                        id = 2,
                    }), ct);
                }
            }
        }
        catch (InvalidOperationException) { throw; }
        catch { /* формат ответа изменился — событий ждём по общему каналу */ }

        _status("connected", 0);

        _ = Task.Run(async () =>
        {
            while (!ct.IsCancellationRequested)
            {
                try { await Net.WsSend(_ws!, "{\"method\":7,\"id\":7}", ct); } catch { return; }
                try { await Task.Delay(25000, ct); } catch { return; }
            }
        }, CancellationToken.None);

        while (!ct.IsCancellationRequested)
        {
            var text = await Net.WsRecv(_ws, ct);
            if (text == null) throw new InvalidOperationException("DonationAlerts: соединение закрыто");

            // Строгий разбор Centrifugo вместо поиска подстроки "username":
            // раньше одно и то же событие попадало в ленту несколько раз
            // (данные дублируются в разных полях кадра).
            try
            {
                using var doc = JsonDocument.Parse(text);
                if (!Net.TryFind(doc.RootElement, "data", out var payloadEl)) continue;
                // тело алерта может лежать глубже: result.data.data
                var body = Net.TryFind(payloadEl, "data", out var innerEl) ? innerEl : payloadEl;
                if (body.ValueKind == JsonValueKind.String)
                {
                    using var parsed = JsonDocument.Parse(body.GetString() ?? "{}");
                    EmitDonation(parsed.RootElement);
                }
                else EmitDonation(body);
            }
            catch (JsonException) { /* служебный кадр */ }
        }
    }

    /// <summary>
    /// Подключение по токену виджета алертов (socket.io / Engine.IO v3).
    /// Это «народный» путь DonationAlerts: токен виден прямо в ссылке виджета,
    /// OAuth-приложение регистрировать не нужно.
    /// </summary>
    private async Task RunWidgetSocketAsync(string widgetToken, CancellationToken ct)
    {
        _ws = new ClientWebSocket();
        _ws.Options.SetRequestHeader("Origin", "https://www.donationalerts.com");
        _ws.Options.SetRequestHeader("User-Agent", Net.UA);
        await _ws.ConnectAsync(
            new Uri("wss://socket.donationalerts.com/socket.io/?EIO=3&transport=websocket"), ct);

        // Engine.IO ping, чтобы сервер не разорвал соединение
        _ = Task.Run(async () =>
        {
            while (!ct.IsCancellationRequested)
            {
                try { await Net.WsSend(_ws!, "2", ct); } catch { return; }
                try { await Task.Delay(20000, ct); } catch { return; }
            }
        }, CancellationToken.None);

        bool registered = false;
        while (!ct.IsCancellationRequested)
        {
            var frame = await Net.WsRecv(_ws, ct);
            if (frame == null) throw new InvalidOperationException("DonationAlerts: соединение закрыто");
            if (frame.Length == 0) continue;

            // служебные пакеты Engine.IO
            if (frame == "2") { await Net.WsSend(_ws, "3", ct); continue; }
            if (frame == "3") continue;

            if (frame[0] == '0')
            {
                // handshake получен — входим в неймспейс
                await Net.WsSend(_ws, "40", ct);
                continue;
            }

            if (frame.StartsWith("40", StringComparison.Ordinal) && !registered)
            {
                registered = true;
                var hello = JsonSerializer.Serialize(new { token = widgetToken, type = "alert_widget" });
                await Net.WsSend(_ws, $"42[\"add-user\",{hello}]", ct);
                _status("connected", 0);
                continue;
            }

            if (!frame.StartsWith("42", StringComparison.Ordinal)) continue;

            // 42["donation",{...}]
            var payload = frame[2..];
            try
            {
                using var doc = JsonDocument.Parse(payload);
                if (doc.RootElement.ValueKind != JsonValueKind.Array || doc.RootElement.GetArrayLength() < 2) continue;
                var name = doc.RootElement[0].GetString() ?? "";
                if (!name.Contains("donation", StringComparison.OrdinalIgnoreCase)) continue;

                var d = doc.RootElement[1];
                // тело иногда приходит строкой с JSON внутри
                if (d.ValueKind == JsonValueKind.String)
                {
                    using var inner = JsonDocument.Parse(d.GetString() ?? "{}");
                    EmitDonation(inner.RootElement);
                }
                else EmitDonation(d);
            }
            catch (Exception ex) { AppLog.Debug("donationalerts", $"Ошибка разбора доната: {ex.GetType().Name}"); }
        }
    }

    /// ID уже показанных донатов: страховка от повторной доставки одного
    /// события (Centrifugo может прислать его в нескольких кадрах).
    private readonly HashSet<string> _seenDonations = new();

    private void EmitDonation(JsonElement d)
    {
        // Пропускаем всё, что не является алертом доната
        var alertType = Net.FindString(d, "alert_type") ?? "";
        if (alertType.Length > 0 && alertType != "1" && !alertType.Contains("donation", StringComparison.OrdinalIgnoreCase))
            return;

        var id = Net.FindString(d, "id") ?? "";
        if (id.Length == 0 && Net.TryFind(d, "id", out var idEl) && idEl.ValueKind == JsonValueKind.Number)
            id = idEl.GetRawText();
        if (id.Length > 0)
        {
            lock (_seenDonations)
            {
                if (!_seenDonations.Add(id)) return;      // дубликат — игнорируем
                if (_seenDonations.Count > 500) _seenDonations.Clear();
            }
        }

        var user = Net.FindString(d, "username") ?? Net.FindString(d, "name") ?? "Аноним";
        var message = Net.FindString(d, "message") ?? "";
        var currency = Net.FindString(d, "currency") ?? "RUB";
        double? amount = null;
        if (Net.TryFind(d, "amount", out var am))
        {
            if (am.ValueKind == JsonValueKind.Number && am.TryGetDouble(out var a)) amount = a;
            else if (am.ValueKind == JsonValueKind.String &&
                     double.TryParse(am.GetString()?.Replace(',', '.'),
                         System.Globalization.NumberStyles.Any,
                         System.Globalization.CultureInfo.InvariantCulture, out var a2)) amount = a2;
        }

        _emit(new ChatEvent
        {
            platform = "donationalerts",
            channel = _user,
            author = user,
            text = Net.StripHtml(message),
            kind = "donate",
            amount = amount,
            currency = currency == "USD" ? "$" : currency == "EUR" ? "€" : "₽",
        });
    }

    public void Dispose() { try { _ws?.Abort(); } catch { } }
}
