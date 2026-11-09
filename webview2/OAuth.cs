using System.Net;
using System.Text.Json;

namespace YawaChat;

/// <summary>
/// Авторизация единственного оставшегося чат-бота — Twitch.
/// VK Видео Live здесь намеренно не авторизуется: чтение VK-чата работает
/// отдельным публичным коннектором и не зависит от аккаунта бота.
/// </summary>
public static class AppAuth
{
    public const string TwitchClientId = "3qcjmtqkoobdcrrxzqbcw75n7egr8n";

    /// Права Twitch для чтения/отправки сообщений и модерации.
    private const string TwitchScopes =
        "chat:read chat:edit moderator:manage:chat_messages moderator:manage:banned_users " +
        "moderator:manage:chat_settings channel:moderate " +
        "moderator:read:followers channel:read:subscriptions channel:read:redemptions " +
        // создание наград за баллы канала прямо из приложения
        "channel:manage:redemptions bits:read " +
        "user:write:chat user:bot channel:bot";

    /// Результат входа. Channel совпадает с аккаунтом Twitch, Refresh нужен
    /// для тихого продления токена во время длительной трансляции.
    public sealed record AuthResult(string Account, string Token, string Channel = "", string Refresh = "");

    /// Twitch device-код кладётся сюда хостом в буфер обмена.
    public static Action<string>? ClipboardWriter;

    public static async Task<AuthResult> AuthorizeAsync(string platform, CancellationToken ct = default)
    {
        if (platform != "twitch")
            throw new InvalidOperationException("Авторизация чат-бота доступна только для Twitch");
        return await TwitchDeviceAuthorizeAsync(ct);
    }

    public static async Task<AuthResult?> RefreshTwitchAsync(
        string refreshToken, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(refreshToken)) return null;

        try
        {
            using var http = NewHttp();
            var (status, body) = await Post(
                http,
                "https://id.twitch.tv/oauth2/token",
                new Dictionary<string, string>
                {
                    ["client_id"] = TwitchClientId,
                    ["grant_type"] = "refresh_token",
                    ["refresh_token"] = refreshToken,
                },
                ct);

            if (status != HttpStatusCode.OK)
            {
                OAuthLog.Write($"[refresh] отказ {(int)status}" +
                    (body.Contains("invalid_grant", StringComparison.OrdinalIgnoreCase) ? " (доступ отозван)" : ""),
                    LogLevel.Warning);
                return null;
            }

            using var doc = JsonDocument.Parse(body);
            var token = StringProperty(doc.RootElement, "access_token");
            if (token.Length == 0) return null;
            var next = StringProperty(doc.RootElement, "refresh_token");
            if (next.Length == 0) next = refreshToken;

            var account = await VerifyAsync("twitch", token, ct);
            OAuthLog.Write($"[refresh] twitch: вход продлён для {account}");
            return new AuthResult(account, token, account, next);
        }
        catch (Exception ex)
        {
            OAuthLog.Write($"[refresh] сбой {ex.GetType().Name}", LogLevel.Warning);
            return null;
        }
    }

    private static async Task<AuthResult> TwitchDeviceAuthorizeAsync(CancellationToken ct)
    {
        using var http = NewHttp();

        OAuthLog.Write("[start] twitch: запрашиваем device-код");
        var (status, body) = await Post(
            http,
            "https://id.twitch.tv/oauth2/device",
            new Dictionary<string, string>
            {
                ["client_id"] = TwitchClientId,
                ["scopes"] = TwitchScopes,
            },
            ct);
        if (status != HttpStatusCode.OK)
            throw new InvalidOperationException($"Twitch не выдал device-код: {body}");

        using var init = JsonDocument.Parse(body);
        var deviceCode = StringProperty(init.RootElement, "device_code");
        if (deviceCode.Length == 0)
            throw new InvalidOperationException("Twitch не вернул device_code");
        var userCode = StringProperty(init.RootElement, "user_code");
        var verifyUri = StringProperty(init.RootElement, "verification_uri");
        if (verifyUri.Length == 0) verifyUri = "https://www.twitch.tv/activate";
        var interval = IntProperty(init.RootElement, "interval", 5);
        if (interval < 3) interval = 3;
        var expiresIn = IntProperty(init.RootElement, "expires_in", 900);

        OAuthLog.Write($"[device] код ({userCode.Length} символов) в буфере обмена, открываем страницу активации");
        try { ClipboardWriter?.Invoke(userCode); } catch { }
        try
        {
            System.Diagnostics.Process.Start(
                new System.Diagnostics.ProcessStartInfo(verifyUri) { UseShellExecute = true });
        }
        catch
        {
            throw new InvalidOperationException("Не удалось открыть браузер");
        }

        var deadline = DateTime.UtcNow.AddSeconds(expiresIn);
        while (DateTime.UtcNow < deadline)
        {
            await Task.Delay(interval * 1000, ct);

            var (pollStatus, pollBody) = await Post(
                http,
                "https://id.twitch.tv/oauth2/token",
                new Dictionary<string, string>
                {
                    ["client_id"] = TwitchClientId,
                    ["device_code"] = deviceCode,
                    ["grant_type"] = "urn:ietf:params:oauth:grant-type:device_code",
                },
                ct);

            if (pollStatus == HttpStatusCode.OK)
            {
                using var granted = JsonDocument.Parse(pollBody);
                var token = StringProperty(granted.RootElement, "access_token");
                if (token.Length == 0)
                    throw new InvalidOperationException("Twitch не вернул access_token");
                var refresh = StringProperty(granted.RootElement, "refresh_token");
                OAuthLog.Write("[token] twitch: токен получен, проверяем…");
                var account = await VerifyAsync("twitch", token, ct);
                OAuthLog.Write($"[ok] twitch: бот подключён как {account}");
                return new AuthResult(account, token, account, refresh);
            }

            if (pollBody.Contains("authorization_pending", StringComparison.OrdinalIgnoreCase))
                continue;
            if (pollBody.Contains("slow_down", StringComparison.OrdinalIgnoreCase))
            {
                interval += 5;
                continue;
            }

            OAuthLog.Write($"[error] отказ {(int)pollStatus}", LogLevel.Warning);
            throw new InvalidOperationException($"Twitch отклонил вход: {pollBody}");
        }

        OAuthLog.Write("[timeout] код не подтверждён вовремя", LogLevel.Warning);
        throw new InvalidOperationException(
            "Код не подтверждён на странице twitch.tv/activate — нажмите «Войти» ещё раз");
    }

    public static async Task<string> VerifyAsync(
        string platform, string token, CancellationToken ct = default)
    {
        if (platform != "twitch")
            throw new InvalidOperationException("Проверка токена доступна только для Twitch");

        token = token.Replace("oauth:", "", StringComparison.OrdinalIgnoreCase).Trim();
        if (token.Length == 0)
            throw new InvalidOperationException("Пустой токен Twitch");

        using var http = NewHttp();
        http.DefaultRequestHeaders.Add("Authorization", $"OAuth {token}");
        using var response = await http.GetAsync("https://id.twitch.tv/oauth2/validate", ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException("Twitch отклонил токен");

        using var doc = JsonDocument.Parse(body);
        var login = StringProperty(doc.RootElement, "login");
        if (login.Length == 0)
            throw new InvalidOperationException("Twitch не вернул аккаунт");
        return login;
    }

    private static HttpClient NewHttp()
    {
        var http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        http.DefaultRequestHeaders.UserAgent.ParseAdd(Net.UA);
        return http;
    }

    private static async Task<(HttpStatusCode status, string body)> Post(
        HttpClient http,
        string url,
        Dictionary<string, string> form,
        CancellationToken ct)
    {
        using var response = await http.PostAsync(url, new FormUrlEncodedContent(form), ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        return (response.StatusCode, body);
    }

    private static string StringProperty(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? ""
            : "";

    private static int IntProperty(JsonElement element, string name, int fallback) =>
        element.TryGetProperty(name, out var value) && value.TryGetInt32(out var number)
            ? number
            : fallback;

    private static class OAuthLog
    {
        public static void Write(string line, LogLevel level = LogLevel.Info)
        {
            AppLog.Write(LogFile.OAuth, level, "twitch", line);
        }
    }
}
