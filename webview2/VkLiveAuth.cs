using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace YawaChat;

/*
 * ============================================================================
 *  ВПИШИТЕ СЮДА ДАННЫЕ СВОЕГО ПРИЛОЖЕНИЯ VK ВИДЕО LIVE
 * ============================================================================
 *
 *  Где взять:
 *    1. Откройте https://dev.live.vkvideo.ru/apps и войдите через VK ID.
 *    2. «Создать приложение»: название, описание, иконка — любые.
 *       URL для web-push оставьте пустым.
 *    3. В поле redirect-ссылки вставьте РОВНО тот адрес, который указан ниже
 *       в RedirectUri (по умолчанию http://localhost:8579/yawachatredirecturl).
 *    4. После создания скопируйте ID приложения и секретный ключ
 *       и подставьте их в ClientId и ClientSecret.
 *
 *  Больше нигде в коде менять ничего не нужно: вход, продление и отзыв
 *  токенов, отправка в чат и награды берут данные только отсюда.
 * ============================================================================
 */
public static class VkLiveApp
{
    /// ID приложения из кабинета разработчика VK Видео Live.
    public const string ClientId = "137eklia1p16sxc0";

    /// Секретный ключ приложения. Хранится только в вашей сборке.
    public const string ClientSecret = "6SFa8GQO6OlyU7yCiKPsH3G2A1SRqdNbPuTYJCnQUNdTwykp8n71v49vglrw0n4o";

    /// Адрес возврата. Должен совпадать с указанным при регистрации
    /// приложения; порт обязан быть свободен на компьютере пользователя.
    public const string RedirectUri = "http://localhost:8579/yawachatredirecturl";

    /// Права приложения. Запрашиваем всё, что умеет приложение: отправку в
    /// чат, настройки чата, баллы канала с наградами и роли канала.
    public const string Scopes =
        "channel:credentials,channel:stream:settings,chat:message:send,chat:settings," +
        "channel:points,channel:points:rewards,channel:points:rewards:demands,channel:roles";

    /// Заполнены ли данные приложения (иначе вход показывает понятную подсказку).
    public static bool Configured =>
        ClientId.Length > 0
        && ClientSecret.Length > 0
        && !ClientId.StartsWith("ВПИШИТЕ", StringComparison.Ordinal)
        && !ClientSecret.StartsWith("ВПИШИТЕ", StringComparison.Ordinal);

    internal const string NotConfiguredMessage =
        "Не заданы данные приложения VK Видео Live. Создайте приложение на "
        + "dev.live.vkvideo.ru/apps и впишите ClientId и ClientSecret в VkLiveAuth.cs";
}

/// <summary>
/// Авторизация VK Видео Live по Authorization Code Flow.
///
/// Логика повторяет рабочую схему расширения VkLiveService для Streamer.bot:
/// браузер открывается на auth.live.vkvideo.ru, код возврата ловит локальный
/// слушатель на redirect-адресе, затем код меняется на пару токенов запросом с
/// Basic-авторизацией приложения. Отличие от первоисточника одно: вместо
/// HttpListener используется обычный TCP-слушатель на петлевом адресе — ему не
/// нужны права администратора и регистрация URL в системе.
/// </summary>
public static class VkLiveAuth
{
    private const string AuthorizeUrl = "https://auth.live.vkvideo.ru/app/oauth2/authorize";
    private const string TokenUrl = "https://api.live.vkvideo.ru/oauth/server/token";
    private const string RevokeUrl = "https://api.live.vkvideo.ru/oauth/server/revoke";

    /// Сколько ждём подтверждения в браузере, прежде чем снять ожидание.
    private static readonly TimeSpan LoginTimeout = TimeSpan.FromMinutes(5);

    public sealed record Tokens(string Access, string Refresh, DateTime ExpiresAtUtc);

    /// Профиль вошедшего аккаунта: ник показываем в интерфейсе, channel —
    /// адрес собственного канала (нужен наградам и настройкам чата).
    public sealed record Profile(long UserId, string Nick, string AvatarUrl, string Channel);

    public sealed record Session(Tokens Tokens, Profile Profile);

    /* ===================== вход ===================== */

    public static async Task<Session> AuthorizeAsync(CancellationToken ct = default)
    {
        if (!VkLiveApp.Configured)
            throw new InvalidOperationException(VkLiveApp.NotConfiguredMessage);

        var redirect = ParseRedirect(VkLiveApp.RedirectUri);
        var state = Guid.NewGuid().ToString("N");

        using var listener = new CallbackListener(redirect.Port);
        Log("[start] vk: ждём подтверждение в браузере");

        OpenInBrowser(BuildAuthorizeUrl(state));

        var callback = await listener.WaitAsync(redirect.Path, LoginTimeout, ct);
        if (callback.Error.Length > 0)
            throw new InvalidOperationException($"VK Видео Live отклонил вход: {callback.Error}");
        if (!string.Equals(callback.State, state, StringComparison.Ordinal))
            throw new InvalidOperationException("Ответ VK Видео Live не совпал с запросом входа — повторите вход");
        if (callback.Code.Length == 0)
            throw new InvalidOperationException("VK Видео Live не вернул код авторизации");

        var tokens = await ExchangeCodeAsync(callback.Code, ct);
        var profile = await ProfileAsync(tokens.Access, ct);
        Log($"[ok] vk: вход выполнен как {profile.Nick}");
        return new Session(tokens, profile);
    }

    private static string BuildAuthorizeUrl(string state)
    {
        var url = new StringBuilder(AuthorizeUrl);
        url.Append("?client_id=").Append(Uri.EscapeDataString(VkLiveApp.ClientId));
        url.Append("&redirect_uri=").Append(Uri.EscapeDataString(VkLiveApp.RedirectUri));
        url.Append("&response_type=code");
        url.Append("&scope=").Append(Uri.EscapeDataString(VkLiveApp.Scopes));
        url.Append("&state=").Append(Uri.EscapeDataString(state));
        return url.ToString();
    }

    private static void OpenInBrowser(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch
        {
            throw new InvalidOperationException("Не удалось открыть браузер для входа в VK Видео Live");
        }
    }

    /* ===================== токены ===================== */

    private static async Task<Tokens> ExchangeCodeAsync(string code, CancellationToken ct) =>
        await TokenRequestAsync(
            new Dictionary<string, string>
            {
                ["grant_type"] = "authorization_code",
                ["code"] = code,
                ["redirect_uri"] = VkLiveApp.RedirectUri,
            },
            previousRefresh: "",
            ct);

    /// <summary>
    /// Продление доступа. Возвращает null, если площадка отозвала доступ —
    /// тогда интерфейс просит войти заново, а не сыплет ошибками.
    /// </summary>
    public static async Task<Tokens?> RefreshAsync(string refreshToken, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(refreshToken)) return null;
        if (!VkLiveApp.Configured) throw new InvalidOperationException(VkLiveApp.NotConfiguredMessage);

        try
        {
            var tokens = await TokenRequestAsync(
                new Dictionary<string, string>
                {
                    ["grant_type"] = "refresh_token",
                    ["refresh_token"] = refreshToken,
                    // VK требует тот же redirect_uri, что и при выдаче кода
                    ["redirect_uri"] = VkLiveApp.RedirectUri,
                },
                previousRefresh: refreshToken,
                ct);
            Log("[refresh] vk: вход продлён");
            return tokens;
        }
        catch (Exception ex)
        {
            Log($"[refresh] vk: продлить не удалось ({ex.GetType().Name})", LogLevel.Warning);
            return null;
        }
    }

    private static async Task<Tokens> TokenRequestAsync(
        Dictionary<string, string> form, string previousRefresh, CancellationToken ct)
    {
        using var http = Net.Http(TimeSpan.FromSeconds(20));
        using var request = new HttpRequestMessage(HttpMethod.Post, TokenUrl)
        {
            Content = new FormUrlEncodedContent(form),
        };
        request.Headers.Authorization = BasicAuth();

        using var response = await http.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException(
                $"VK Видео Live не выдал токен ({(int)response.StatusCode}): {Describe(body)}");

        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;
        var access = Text(root, "access_token");
        if (access.Length == 0)
            throw new InvalidOperationException("VK Видео Live вернул пустой токен доступа");

        var refresh = Text(root, "refresh_token");
        if (refresh.Length == 0) refresh = previousRefresh;

        // expires_in — у пользовательских токенов, expire_time — у серверных
        var seconds = Number(root, "expires_in") ?? Number(root, "expire_time") ?? 3600;
        return new Tokens(access, refresh, DateTime.UtcNow.AddSeconds(seconds));
    }

    /// Отзыв токена при выходе. Ошибку не поднимаем: даже если площадка не
    /// ответила, локально выход всё равно выполняется.
    public static async Task RevokeAsync(string token, string tokenTypeHint, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(token) || !VkLiveApp.Configured) return;
        try
        {
            using var http = Net.Http(TimeSpan.FromSeconds(15));
            using var request = new HttpRequestMessage(HttpMethod.Post, RevokeUrl)
            {
                Content = new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["token"] = token,
                    ["token_type_hint"] = tokenTypeHint,
                }),
            };
            request.Headers.Authorization = BasicAuth();
            using var response = await http.SendAsync(request, ct);
            Log($"[logout] vk: отзыв {tokenTypeHint} — код {(int)response.StatusCode}");
        }
        catch (Exception ex)
        {
            Log($"[logout] vk: отзыв не прошёл ({ex.GetType().Name})", LogLevel.Warning);
        }
    }

    private static AuthenticationHeaderValue BasicAuth() =>
        new("Basic", Convert.ToBase64String(
            Encoding.UTF8.GetBytes($"{VkLiveApp.ClientId}:{VkLiveApp.ClientSecret}")));

    /* ===================== профиль ===================== */

    /// <summary>
    /// Кто вошёл: ник, аватар и адрес собственного канала. Этим же запросом
    /// проверяется токен, вставленный вручную.
    /// </summary>
    public static async Task<Profile> ProfileAsync(string accessToken, CancellationToken ct = default)
    {
        var root = await VkLiveApi.GetAsync("/current_user", accessToken, ct);
        var data = root.TryGetProperty("data", out var d) ? d : default;
        if (data.ValueKind != JsonValueKind.Object)
            throw new InvalidOperationException("VK Видео Live не вернул данные аккаунта");

        var user = data.TryGetProperty("user", out var u) && u.ValueKind == JsonValueKind.Object ? u : default;
        var nick = user.ValueKind == JsonValueKind.Object ? Text(user, "nick") : "";
        if (nick.Length == 0)
            throw new InvalidOperationException("VK Видео Live не вернул имя аккаунта");

        var avatar = user.ValueKind == JsonValueKind.Object ? Text(user, "avatar_url") : "";
        var id = user.ValueKind == JsonValueKind.Object ? (long)(Number(user, "id") ?? 0) : 0;

        // Собственный канал: data.channel.url, иначе первый из data.channels
        var channel = "";
        if (data.TryGetProperty("channel", out var ch) && ch.ValueKind == JsonValueKind.Object)
            channel = VkLiveApi.NormalizeChannel(Text(ch, "url"));
        if (channel.Length == 0
            && data.TryGetProperty("channels", out var list)
            && list.ValueKind == JsonValueKind.Array
            && list.GetArrayLength() > 0)
            channel = VkLiveApi.NormalizeChannel(Text(list[0], "url"));
        if (channel.Length == 0)
            channel = VkLiveApi.NormalizeChannel(nick);

        return new Profile(id, nick, avatar, channel);
    }

    /* ===================== приём кода возврата ===================== */

    private static (string Path, int Port) ParseRedirect(string redirectUri)
    {
        if (!Uri.TryCreate(redirectUri, UriKind.Absolute, out var uri))
            throw new InvalidOperationException($"Неверный адрес возврата VK: {redirectUri}");
        if (!uri.IsLoopback)
            throw new InvalidOperationException(
                "Адрес возврата VK должен указывать на этот компьютер (localhost)");
        return (uri.AbsolutePath.Length == 0 ? "/" : uri.AbsolutePath, uri.Port);
    }

    private sealed record Callback(string Code, string State, string Error);

    /// <summary>
    /// Минимальный локальный сервер на время входа: принимает единственный
    /// GET-запрос по адресу возврата, отдаёт страницу «можно закрыть окно» и
    /// возвращает приложению код авторизации.
    /// </summary>
    private sealed class CallbackListener : IDisposable
    {
        private readonly TcpListener _listener;

        public CallbackListener(int port)
        {
            _listener = new TcpListener(IPAddress.Loopback, port);
            try
            {
                _listener.Start();
            }
            catch (SocketException)
            {
                throw new InvalidOperationException(
                    $"Порт {port} занят другой программой — освободите его или поменяйте "
                    + "адрес возврата в приложении VK и в VkLiveAuth.cs");
            }
        }

        public async Task<Callback> WaitAsync(string path, TimeSpan timeout, CancellationToken ct)
        {
            using var limit = CancellationTokenSource.CreateLinkedTokenSource(ct);
            limit.CancelAfter(timeout);

            while (true)
            {
                TcpClient client;
                try
                {
                    client = await _listener.AcceptTcpClientAsync(limit.Token);
                }
                catch (OperationCanceledException)
                {
                    if (ct.IsCancellationRequested) throw;
                    throw new InvalidOperationException(
                        "Вход в VK Видео Live не подтверждён вовремя — нажмите «Войти» ещё раз");
                }

                using (client)
                {
                    var target = await ReadRequestTargetAsync(client, limit.Token);
                    if (target.Length == 0) continue;

                    var split = target.IndexOf('?');
                    var requestPath = split < 0 ? target : target[..split];
                    var query = split < 0 ? "" : target[(split + 1)..];

                    // Браузер любит дополнительно просить /favicon.ico — такие
                    // запросы закрываем молча и ждём настоящий ответ VK.
                    if (!string.Equals(requestPath, path, StringComparison.OrdinalIgnoreCase))
                    {
                        await RespondAsync(client, "Страница не найдена", limit.Token);
                        continue;
                    }

                    var parsed = ParseQuery(query);
                    parsed.TryGetValue("code", out var code);
                    parsed.TryGetValue("state", out var state);
                    parsed.TryGetValue("error", out var error);
                    parsed.TryGetValue("error_description", out var description);

                    var message = (code ?? "").Length > 0
                        ? "Готово! Авторизация VK Видео Live завершена — вернитесь в YawaChat."
                        : "Вход не завершён. Вернитесь в YawaChat и попробуйте ещё раз.";
                    await RespondAsync(client, message, limit.Token);

                    return new Callback(
                        code ?? "",
                        state ?? "",
                        (description ?? error ?? "").Trim());
                }
            }
        }

        private static async Task<string> ReadRequestTargetAsync(TcpClient client, CancellationToken ct)
        {
            var buffer = new byte[4096];
            var stream = client.GetStream();
            var read = await stream.ReadAsync(buffer, ct);
            if (read <= 0) return "";

            var head = Encoding.UTF8.GetString(buffer, 0, read);
            var lineEnd = head.IndexOf('\r');
            if (lineEnd < 0) lineEnd = head.IndexOf('\n');
            if (lineEnd < 0) lineEnd = head.Length;

            // «GET /path?query HTTP/1.1»
            var parts = head[..lineEnd].Split(' ');
            return parts.Length >= 2 ? parts[1] : "";
        }

        private static async Task RespondAsync(TcpClient client, string message, CancellationToken ct)
        {
            var page =
                "<!doctype html><html lang=\"ru\"><head><meta charset=\"utf-8\">"
                + "<title>YawaChat · VK Видео Live</title></head>"
                + "<body style=\"font-family:system-ui;background:#14161c;color:#e8eaf0;"
                + "display:flex;align-items:center;justify-content:center;height:100vh;margin:0\">"
                + $"<p style=\"font-size:18px\">{WebUtility.HtmlEncode(message)}</p></body></html>";
            var body = Encoding.UTF8.GetBytes(page);
            var header = Encoding.UTF8.GetBytes(
                "HTTP/1.1 200 OK\r\n"
                + "Content-Type: text/html; charset=utf-8\r\n"
                + $"Content-Length: {body.Length}\r\n"
                + "Connection: close\r\n\r\n");

            var stream = client.GetStream();
            await stream.WriteAsync(header, ct);
            await stream.WriteAsync(body, ct);
            await stream.FlushAsync(ct);
        }

        private static Dictionary<string, string> ParseQuery(string query)
        {
            var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var pair in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
            {
                var eq = pair.IndexOf('=');
                var key = eq < 0 ? pair : pair[..eq];
                var value = eq < 0 ? "" : pair[(eq + 1)..];
                result[Uri.UnescapeDataString(key)] = Uri.UnescapeDataString(value.Replace('+', ' '));
            }
            return result;
        }

        public void Dispose()
        {
            try { _listener.Stop(); } catch { /* слушатель уже закрыт */ }
        }
    }

    /* ===================== мелочи ===================== */

    internal static string Text(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object
        && element.TryGetProperty(name, out var value)
        && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? ""
            : "";

    internal static double? Number(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object
        && element.TryGetProperty(name, out var value)
        && value.ValueKind == JsonValueKind.Number
            ? value.GetDouble()
            : null;

    /// Текст ошибки площадки без лишнего JSON-шума.
    internal static string Describe(string body)
    {
        if (string.IsNullOrWhiteSpace(body)) return "пустой ответ";
        try
        {
            using var doc = JsonDocument.Parse(body);
            var description = Text(doc.RootElement, "error_description");
            var error = Text(doc.RootElement, "error");
            if (description.Length > 0) return description;
            if (error.Length > 0) return error;
        }
        catch (JsonException)
        {
            /* не JSON — показываем как есть */
        }
        return body.Length > 200 ? body[..200] : body;
    }

    internal static void Log(string line, LogLevel level = LogLevel.Info) =>
        AppLog.Write(LogFile.OAuth, level, "vk", line);
}
