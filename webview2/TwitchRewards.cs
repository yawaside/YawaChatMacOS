using System.Net;
using System.Text.Json;

namespace YawaChat;

/// <summary>
/// Награды за баллы канала Twitch: их список нужен приложению, чтобы заранее
/// подготовить правила звуков — пользователю остаётся выбрать звук каждой
/// награде, а не вписывать названия руками.
///
/// Берём награды именно авторизованного канала: список наград отдаётся только
/// владельцу канала, поэтому вход в «Чат-боте» и является подтверждением прав.
/// </summary>
public static class TwitchRewards
{
    public sealed record Reward(string Id, string Title, int Cost);

    /// <summary>
    /// Все награды канала (постранично, со всеми страницами — их редко больше
    /// одной, но у крупных каналов список длинный).
    /// </summary>
    public static async Task<(bool ok, string error, List<Reward> rewards)> ListAsync(
        string channelLogin, CancellationToken ct = default)
    {
        var token = ConnectorManager.BotToken;
        if (string.IsNullOrWhiteSpace(token))
            return (false, "Сначала войдите в Twitch — награды берутся из вашего канала", new List<Reward>());

        try
        {
            // Свои таймауты поменьше стандартных: список наград нужен здесь и
            // сейчас, а интерфейс ждёт ответа ограниченное время.
            using var http = Net.Http(TimeSpan.FromSeconds(12));
            http.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");
            http.DefaultRequestHeaders.Add("Client-Id", AppAuth.TwitchClientId);

            var broadcasterId = await UserIdAsync(http, channelLogin, ct);
            if (broadcasterId.Length == 0)
                return (false, $"Не удалось найти канал Twitch @{channelLogin}", new List<Reward>());

            var rewards = new List<Reward>();
            string? cursor = null;
            for (var page = 0; page < 5; page++)
            {
                var url =
                    $"https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id={broadcasterId}&first=100";
                if (!string.IsNullOrEmpty(cursor)) url += $"&after={Uri.EscapeDataString(cursor)}";
                var body = await http.GetStringAsync(url, ct);
                using var doc = JsonDocument.Parse(body);

                if (doc.RootElement.TryGetProperty("data", out var data))
                    foreach (var item in data.EnumerateArray())
                    {
                        var title = (Net.FindString(item, "title") ?? "").Trim();
                        if (title.Length == 0) continue;
                        var id = Net.FindString(item, "id") ?? "";
                        // cost есть у всех наград, но пустое значение лучше не
                        // показывать как «0 баллов»
                        var cost = Net.TryFind(item, "cost", out var c)
                            && c.ValueKind == JsonValueKind.Number
                            && c.TryGetInt32(out var cv)
                                ? cv
                                : 0;
                        rewards.Add(new Reward(id, title, cost));
                    }

                cursor = doc.RootElement.TryGetProperty("pagination", out var pg)
                    ? Net.FindString(pg, "cursor")
                    : null;
                if (string.IsNullOrEmpty(cursor)) break;
            }

            return (true, "", rewards);
        }
        catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.Unauthorized)
        {
            // Токен живёт считаные часы: без продления список наград молча
            // перестал бы открываться, поэтому говорим причину словами.
            return (false, "Twitch не отдал список наград: войдите в чат-бот заново", new List<Reward>());
        }
        catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.Forbidden)
        {
            return (false,
                "Награды этого канала Twitch не отдаются: список есть только у владельца канала",
                new List<Reward>());
        }
        catch (Exception ex)
        {
            AppLog.Warning("rewards", $"Список наград Twitch недоступен: {ex.GetType().Name}");
            return (false, "Не удалось получить список наград Twitch — попробуйте ещё раз", new List<Reward>());
        }
    }

    /// <summary>Верхняя граница стоимости награды Twitch — по правилам самой площадки.</summary>
    public const int MaxCost = 1_000_000;

    /// <summary>Минимальная стоимость награды Twitch.</summary>
    public const int MinCost = 1;

    /// <summary>
    /// Создание награды за баллы канала. Награда появляется сразу включённой:
    /// стример создаёт её перед эфиром и ждёт, что зрители смогут её взять.
    ///
    /// Возвращает id созданной награды. Ошибки переводим в понятные слова:
    /// чаще всего это «нет права управлять наградами» (нужен повторный вход
    /// после расширения прав) или «такая награда уже есть».
    /// </summary>
    public static async Task<(bool ok, string error, string id)> CreateAsync(
        string channelLogin, string title, int cost, string prompt, CancellationToken ct = default)
    {
        var name = (title ?? "").Trim();
        if (name.Length == 0) return (false, "Укажите название награды", "");
        if (name.Length > 45) name = name[..45];
        if (cost < MinCost || cost > MaxCost)
            return (false, $"Стоимость награды Twitch — от {MinCost} до {MaxCost} баллов", "");

        var token = ConnectorManager.BotToken;
        if (string.IsNullOrWhiteSpace(token))
            return (false, "Сначала войдите в Twitch — награды создаются в вашем канале", "");

        try
        {
            using var http = Net.Http(TimeSpan.FromSeconds(15));
            http.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");
            http.DefaultRequestHeaders.Add("Client-Id", AppAuth.TwitchClientId);

            var broadcasterId = await UserIdAsync(http, channelLogin, ct);
            if (broadcasterId.Length == 0)
                return (false, $"Не удалось найти канал Twitch @{channelLogin}", "");

            var body = JsonSerializer.Serialize(new
            {
                title = name,
                cost,
                prompt = (prompt ?? "").Trim(),
                is_enabled = true,
            });
            using var content = new StringContent(body, System.Text.Encoding.UTF8, "application/json");
            using var response = await http.PostAsync(
                $"https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id={broadcasterId}",
                content, ct);
            var text = await response.Content.ReadAsStringAsync(ct);

            if (response.IsSuccessStatusCode)
            {
                using var doc = JsonDocument.Parse(text);
                var id = doc.RootElement.TryGetProperty("data", out var arr) && arr.GetArrayLength() > 0
                    ? Net.FindString(arr[0], "id") ?? ""
                    : "";
                return id.Length > 0
                    ? (true, "", id)
                    : (false, "Twitch принял запрос, но не вернул награду — обновите список", "");
            }

            if (response.StatusCode == HttpStatusCode.Unauthorized)
                return (false, "Twitch не принял вход: войдите в чат-бот заново", "");
            if (response.StatusCode == HttpStatusCode.Forbidden)
                return (false,
                    "Twitch не разрешил создание наград: войдите в чат-бот заново — нужен доступ к управлению наградами",
                    "");
            if (response.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Conflict)
            {
                var reason = Net.FindString(JsonElementOrEmpty(text), "message");
                return (false, "Twitch отклонил награду: " + (reason ?? "проверьте название и стоимость"), "");
            }

            return (false, $"Twitch ответил {(int)response.StatusCode}", "");
        }
        catch (Exception ex)
        {
            AppLog.Warning("rewards", $"Создание награды Twitch: {ex.GetType().Name}");
            return (false, "Не удалось создать награду Twitch — проверьте связь и попробуйте ещё раз", "");
        }
    }

    /// Разбор тела ошибки: площадка присылает {"message": "..."} — показываем
    /// причину словами площадки, она точнее любого нашего текста.
    private static JsonElement JsonElementOrEmpty(string body)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            return doc.RootElement.Clone();
        }
        catch (JsonException)
        {
            return default;
        }
    }

    private static async Task<string> UserIdAsync(HttpClient http, string login, CancellationToken ct)
    {
        try
        {
            var body = await http.GetStringAsync(
                $"https://api.twitch.tv/helix/users?login={Uri.EscapeDataString(login)}", ct);
            using var d = JsonDocument.Parse(body);
            return d.RootElement.TryGetProperty("data", out var arr) && arr.GetArrayLength() > 0
                ? Net.FindString(arr[0], "id") ?? ""
                : "";
        }
        catch { return ""; }
    }
}
