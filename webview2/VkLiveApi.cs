using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace YawaChat;

/// <summary>
/// Клиент официального DevAPI VK Видео Live (apidev.live.vkvideo.ru).
///
/// Все методы требуют пользовательский токен, полученный в <see cref="VkLiveAuth"/>.
/// Класс намеренно без состояния: токен приходит параметром, а продлевает его
/// хост — так один и тот же код годится и для чата, и для наград.
/// </summary>
public static class VkLiveApi
{
    /// Точка входа DevAPI. Публичный анонимный чат читает другой адрес
    /// (api.live.vkvideo.ru) — он остаётся в коннекторе и входа не требует.
    public const string Host = "https://apidev.live.vkvideo.ru/v1";

    /// Признак «токен больше не принимают» — хосту это сигнал продлить вход.
    public sealed class UnauthorizedException(string message) : InvalidOperationException(message);

    /* ===================== базовые запросы ===================== */

    public static Task<JsonElement> GetAsync(string path, string token, CancellationToken ct = default) =>
        SendAsync(HttpMethod.Get, path, token, null, ct);

    public static Task<JsonElement> PostAsync(
        string path, string token, string? jsonBody = null, CancellationToken ct = default) =>
        SendAsync(HttpMethod.Post, path, token, jsonBody ?? "{}", ct);

    private static async Task<JsonElement> SendAsync(
        HttpMethod method, string path, string token, string? jsonBody, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(token))
            throw new UnauthorizedException("Нет токена VK Видео Live — войдите в разделе «Чат-бот»");

        using var http = Net.Http(TimeSpan.FromSeconds(20));
        using var request = new HttpRequestMessage(method, Host + path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (jsonBody != null)
            request.Content = new StringContent(jsonBody, Encoding.UTF8, "application/json");

        using var response = await http.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);

        if (response.StatusCode == HttpStatusCode.Unauthorized)
            throw new UnauthorizedException("VK Видео Live не принял токен");
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException(
                $"VK Видео Live ({(int)response.StatusCode}): {VkLiveAuth.Describe(body)}");

        if (body.Trim().Length == 0) return default;
        try
        {
            using var doc = JsonDocument.Parse(body);
            // Клонируем: документ закрывается вместе с запросом.
            return doc.RootElement.Clone();
        }
        catch (JsonException)
        {
            return default;
        }
    }

    private static string Query(params (string key, string value)[] parameters)
    {
        var sb = new StringBuilder();
        foreach (var (key, value) in parameters)
        {
            if (value.Length == 0) continue;
            sb.Append(sb.Length == 0 ? '?' : '&');
            sb.Append(Uri.EscapeDataString(key)).Append('=').Append(Uri.EscapeDataString(value));
        }
        return sb.ToString();
    }

    /// Имя канала из адреса live.vkvideo.ru/<канал> — без схемы, @ и слэшей.
    public static string NormalizeChannel(string channel)
    {
        var value = (channel ?? "").Trim().TrimStart('@').Trim('/');
        var slash = value.LastIndexOf('/');
        if (slash >= 0) value = value[(slash + 1)..];
        return value;
    }

    /* ===================== канал и трансляция ===================== */

    public sealed record ChannelState(string StreamId, string Status, int Viewers, string Title);

    /// <summary>Текущее состояние канала: id трансляции, статус и зрители.</summary>
    public static async Task<ChannelState> ChannelAsync(
        string channel, string token, CancellationToken ct = default)
    {
        var root = await GetAsync(
            "/channel" + Query(("channel_url", NormalizeChannel(channel))), token, ct);

        var data = Child(root, "data");
        var stream = Child(data, "stream");
        var counters = Child(stream, "counters");

        return new ChannelState(
            VkLiveAuth.Text(stream, "id"),
            VkLiveAuth.Text(stream, "status"),
            (int)(VkLiveAuth.Number(counters, "viewers") ?? 0),
            VkLiveAuth.Text(stream, "title"));
    }

    /// <summary>Токен подключения к Centrifugo v2 серверу DevAPI (pubsub-dev.live.vkvideo.ru).</summary>
    public static async Task<string> WebSocketTokenAsync(string token, CancellationToken ct = default)
    {
        var root = await GetAsync("/websocket/token", token, ct);
        var data = Child(root, "data");
        return VkLiveAuth.Text(data, "token");
    }

    /// <summary>Имена realtime-каналов из /v1/channel (web_socket_channels).</summary>
    public static async Task<Dictionary<string, string>> WebSocketChannelsAsync(
        string channel, string token, CancellationToken ct = default)
    {
        var root = await GetAsync(
            "/channel" + Query(("channel_url", NormalizeChannel(channel))), token, ct);
        var data = Child(root, "data");
        var chanObj = Child(data, "channel");
        if (chanObj.ValueKind != JsonValueKind.Object) chanObj = data;
        var wsChannels = Child(chanObj, "web_socket_channels");
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (wsChannels.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in wsChannels.EnumerateObject())
            {
                if (prop.Value.ValueKind == JsonValueKind.String)
                {
                    var val = (prop.Value.GetString() ?? "").Trim();
                    if (val.Length > 0) result[prop.Name] = val;
                }
            }
        }
        return result;
    }

    /// <summary>Подписные токены для каналов Centrifugo v2 DevAPI (/v1/websocket/subscription_token).</summary>
    public static async Task<Dictionary<string, string>> SubscriptionTokensAsync(
        IEnumerable<string> channels, string token, CancellationToken ct = default)
    {
        var list = channels
            .Select(c => (c ?? "").Trim())
            .Where(c => c.Length > 0)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        if (list.Length == 0) return result;

        var root = await GetAsync(
            "/websocket/subscription_token" + Query(("channels", string.Join(",", list))), token, ct);
        var data = Child(root, "data");
        foreach (var arrName in new[] { "channel_tokens", "tokens" })
        {
            if (data.ValueKind == JsonValueKind.Object
                && data.TryGetProperty(arrName, out var arr)
                && arr.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in arr.EnumerateArray())
                {
                    var ch = VkLiveAuth.Text(item, "channel");
                    var tok = VkLiveAuth.Text(item, "token");
                    if (ch.Length > 0 && tok.Length > 0) result[ch] = tok;
                }
            }
        }
        return result;
    }

    /* ===================== отправка в чат ===================== */

    /// id активной трансляции живёт недолго — кэшируем на минуту, чтобы
    /// каждый ответ бота не стоил лишнего запроса к площадке.
    private static readonly ConcurrentDictionary<string, (string StreamId, DateTime Until)> StreamIds = new();

    /// <summary>
    /// Отправка сообщения в чат канала от имени вошедшего аккаунта.
    /// Требует права chat:message:send и идущую трансляцию: без эфира у VK
    /// нет id трансляции, а значит и чата, в который можно писать.
    /// </summary>
    public static async Task SendMessageAsync(
        string channel, string text, string token, CancellationToken ct = default)
    {
        var name = NormalizeChannel(channel);
        var message = (text ?? "").Trim();
        if (message.Length == 0) return;
        // Запас по длине сообщения чата VK.
        if (message.Length > 500) message = message[..500];

        var streamId = await StreamIdAsync(name, token, ct);
        var payload = JsonSerializer.Serialize(new
        {
            parts = new object[] { new { text = new { content = message } } },
        });

        try
        {
            await PostAsync(
                "/chat/message/send" + Query(("channel_url", name), ("stream_id", streamId)),
                token, payload, ct);
        }
        catch (InvalidOperationException ex) when (ex is not UnauthorizedException && streamId.Length > 0)
        {
            // Трансляция могла смениться — обновляем id и пробуем ещё раз.
            StreamIds.TryRemove(name, out _);
            var fresh = await StreamIdAsync(name, token, ct);
            await PostAsync(
                "/chat/message/send" + Query(("channel_url", name), ("stream_id", fresh)),
                token, payload, ct);
        }

        AppLog.Write(LogFile.Bot, LogLevel.Info, "vk", $"-> {name}: сообщение отправлено");
    }

    private static async Task<string> StreamIdAsync(string channel, string token, CancellationToken ct)
    {
        if (StreamIds.TryGetValue(channel, out var cached) && cached.Until > DateTime.UtcNow)
            return cached.StreamId;

        var state = await ChannelAsync(channel, token, ct);
        if (state.StreamId.Length == 0)
            throw new InvalidOperationException(
                $"На канале «{channel}» сейчас нет трансляции — VK Видео Live принимает сообщения только в эфире");

        StreamIds[channel] = (state.StreamId, DateTime.UtcNow.AddMinutes(1));
        return state.StreamId;
    }

    /* ===================== настройки чата (режимы) ===================== */

    /// <summary>Текущие настройки чата канала (право chat:settings).</summary>
    public static async Task<JsonElement> ChatSettingsAsync(
        string channel, string token, CancellationToken ct = default)
    {
        var root = await GetAsync(
            "/chat/settings" + Query(("channel_url", NormalizeChannel(channel))), token, ct);
        return Child(Child(root, "data"), "chat_settings");
    }

    /// <summary>
    /// Изменение настроек чата. VK принимает объект целиком, поэтому сначала
    /// читаем текущие настройки и правим только нужные поля — иначе чужие
    /// настройки канала сбрасывались бы на значения по умолчанию.
    /// </summary>
    public static async Task EditChatSettingsAsync(
        string channel,
        string token,
        Action<Dictionary<string, object?>> patch,
        CancellationToken ct = default)
    {
        var name = NormalizeChannel(channel);
        var current = await ChatSettingsAsync(name, token, ct);

        var settings = current.ValueKind == JsonValueKind.Object
            ? JsonSerializer.Deserialize<Dictionary<string, object?>>(current.GetRawText())
              ?? new Dictionary<string, object?>()
            : new Dictionary<string, object?>();

        patch(settings);

        var payload = JsonSerializer.Serialize(new { chat_settings = settings });
        await PostAsync("/chat/settings/edit" + Query(("channel_url", name)), token, payload, ct);
    }

    /* ===================== зрители чата ===================== */

    public sealed record Member(long Id, string Nick, string AvatarUrl, bool IsModerator, bool IsOwner);

    /// <summary>Зрители, которые сейчас в чате (не более 200 — ограничение VK).</summary>
    public static async Task<List<Member>> MembersAsync(
        string channel, string token, int limit = 200, CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 200);
        var root = await GetAsync(
            "/chat/members" + Query(
                ("channel_url", NormalizeChannel(channel)),
                ("limit", limit.ToString())),
            token, ct);

        var result = new List<Member>();
        var users = Child(Child(root, "data"), "users");
        if (users.ValueKind != JsonValueKind.Array) return result;

        foreach (var user in users.EnumerateArray())
            result.Add(new Member(
                (long)(VkLiveAuth.Number(user, "id") ?? 0),
                VkLiveAuth.Text(user, "nick"),
                VkLiveAuth.Text(user, "avatar_url"),
                Flag(user, "is_moderator"),
                Flag(user, "is_owner")));

        return result;
    }

    /// <summary>Карточка зрителя: модераторство и статистика идут отдельно от списка ролей канала.</summary>
    public static Task<JsonElement> MemberAsync(
        string channel, long userId, string token, CancellationToken ct = default) =>
        GetAsync(
            "/chat/member" + Query(
                ("channel_url", NormalizeChannel(channel)),
                ("user_id", userId.ToString())),
            token, ct);

    /// <summary>id зрителя по нику среди присутствующих в чате (как в первоисточнике).</summary>
    public static async Task<long> FindUserIdAsync(
        string channel, string nick, string token, CancellationToken ct = default)
    {
        var target = (nick ?? "").Trim();
        if (target.Length == 0) return 0;

        foreach (var member in await MembersAsync(channel, token, 200, ct))
            if (string.Equals(member.Nick, target, StringComparison.OrdinalIgnoreCase))
                return member.Id;
        return 0;
    }

    /* ===================== баллы канала и награды ===================== */

    public sealed record Reward(string Id, string Name, long Price, bool Disabled, bool MessageRequired);

    /// <summary>Награды канала (право channel:points:rewards, только у владельца).</summary>
    public static async Task<List<Reward>> RewardsAsync(
        string channel, string token, CancellationToken ct = default)
    {
        var root = await GetAsync(
            "/channel_point/rewards/manage_info" + Query(("channel_url", NormalizeChannel(channel))),
            token, ct);

        var rewards = new List<Reward>();
        var items = Child(Child(root, "data"), "rewards");
        if (items.ValueKind != JsonValueKind.Array) return rewards;

        foreach (var item in items.EnumerateArray())
        {
            var name = VkLiveAuth.Text(item, "name");
            if (name.Length == 0) continue;
            rewards.Add(new Reward(
                TextOrNumber(item, "id"),
                name,
                (long)(VkLiveAuth.Number(item, "price") ?? 0),
                Flag(item, "is_disabled"),
                Flag(item, "is_message_required")));
        }
        return rewards;
    }

    /// <summary>Верхняя граница стоимости награды VK — как у самой площадки.</summary>
    public const long MaxRewardPrice = 1_000_000;

    /// <summary>Минимальная стоимость награды VK.</summary>
    public const long MinRewardPrice = 1;

    /// <summary>
    /// Создание награды за баллы канала. Площадка принимает сразу весь набор
    /// полей награды: название, цену, описание, обязательность сообщения и
    /// ограничения по числу активаций. Ограничения не задаём (0 — без предела),
    /// чтобы награда вела себя как обычная, созданная в кабинете.
    ///
    /// Возвращает id созданной награды.
    /// </summary>
    public static async Task<string> CreateRewardAsync(
        string channel, string name, long price, string description, bool messageRequired,
        string token, CancellationToken ct = default)
    {
        var title = (name ?? "").Trim();
        if (title.Length == 0) throw new InvalidOperationException("Укажите название награды");
        if (title.Length > 45) title = title[..45];
        if (price < MinRewardPrice || price > MaxRewardPrice)
            throw new InvalidOperationException(
                $"Стоимость награды VK Видео Live — от {MinRewardPrice} до {MaxRewardPrice} баллов");

        var payload = JsonSerializer.Serialize(new
        {
            reward = new
            {
                name = title,
                price,
                description = (description ?? "").Trim(),
                is_message_required = messageRequired,
                background_color = 0,
                max_uses_count = 0,
                max_uses_count_per_user = 0,
                repair_timeout = 0,
            },
        });

        var root = await PostAsync(
            "/channel_point/reward/create" + Query(("channel_url", NormalizeChannel(channel))),
            token, payload, ct);

        var id = TextOrNumber(Child(Child(root, "data"), "reward"), "id");
        if (id.Length == 0) id = TextOrNumber(Child(root, "reward"), "id");
        if (id.Length == 0)
            throw new InvalidOperationException("VK Видео Live принял запрос, но не вернул награду — обновите список");
        return id;
    }

    /// <summary>id награды по её названию — так же, как это делает VkLiveService.</summary>
    public static async Task<string> RewardIdByNameAsync(
        string channel, string rewardName, string token, CancellationToken ct = default)
    {
        var target = (rewardName ?? "").Trim();
        if (target.Length == 0) return "";

        foreach (var reward in await RewardsAsync(channel, token, ct))
            if (string.Equals(reward.Name, target, StringComparison.OrdinalIgnoreCase))
                return reward.Id;
        return "";
    }

    public static Task EnableRewardAsync(
        string channel, string rewardId, string token, CancellationToken ct = default) =>
        PostAsync(
            "/channel_point/reward/enable" + Query(
                ("channel_url", NormalizeChannel(channel)), ("reward_id", rewardId)),
            token, "{}", ct);

    public static Task DisableRewardAsync(
        string channel, string rewardId, string token, CancellationToken ct = default) =>
        PostAsync(
            "/channel_point/reward/disable" + Query(
                ("channel_url", NormalizeChannel(channel)), ("reward_id", rewardId)),
            token, "{}", ct);

    /// <summary>
    /// Активация награды от своего имени. Ссылку VK показывает отдельной
    /// частью сообщения, обычный текст — текстовой: это различие сохранено
    /// из рабочей реализации первоисточника.
    /// </summary>
    public static Task ActivateRewardAsync(
        string channel, string rewardId, string message, string token, CancellationToken ct = default)
    {
        var text = (message ?? "").Trim();
        object part = Uri.TryCreate(text, UriKind.Absolute, out var link)
            && (link.Scheme == Uri.UriSchemeHttp || link.Scheme == Uri.UriSchemeHttps)
                ? new { link = new { content = text, url = text } }
                : new { text = new { content = text } };

        var payload = JsonSerializer.Serialize(new
        {
            reward = new { id = rewardId, message = new { parts = new[] { part } } },
        });

        return PostAsync(
            "/channel_point/reward/activate" + Query(("channel_url", NormalizeChannel(channel))),
            token, payload, ct);
    }

    public sealed record Demand(
        long Id,
        string RewardId,
        long UserId,
        string UserNick,
        string Status,
        int Price = 0,
        string Text = "");

    /// <summary>Заявки на награды (очередь запросов зрителей).</summary>
    public static async Task<(List<Demand> Demands, bool IsLast)> DemandsAsync(
        string channel, string token, int limit = 50, int offset = 0, CancellationToken ct = default)
    {
        var root = await GetAsync(
            "/channel_point/reward/demands" + Query(
                ("channel_url", NormalizeChannel(channel)),
                ("limit", Math.Clamp(limit, 1, 200).ToString()),
                ("offset", Math.Max(0, offset).ToString())),
            token, ct);

        var demands = new List<Demand>();
        var items = Child(Child(root, "data"), "demands");
        if (items.ValueKind == JsonValueKind.Array)
            foreach (var item in items.EnumerateArray())
            {
                var user = Child(item, "user");
                var reward = Child(item, "reward");
                var price = (int)(VkLiveAuth.Number(item, "price")
                                  ?? VkLiveAuth.Number(reward, "price")
                                  ?? 0);
                var msgText = "";
                if (item.TryGetProperty("message_parts", out var mp) && mp.ValueKind == JsonValueKind.Array)
                {
                    var sb = new StringBuilder();
                    foreach (var part in mp.EnumerateArray())
                    {
                        if (part.ValueKind != JsonValueKind.Object) continue;
                        if (part.TryGetProperty("text", out var tObj) && tObj.ValueKind == JsonValueKind.Object)
                            sb.Append(VkLiveAuth.Text(tObj, "content"));
                        else if (part.TryGetProperty("link", out var lObj) && lObj.ValueKind == JsonValueKind.Object)
                            sb.Append(VkLiveAuth.Text(lObj, "content") is { Length: > 0 } lc ? lc : VkLiveAuth.Text(lObj, "url"));
                        else if (part.TryGetProperty("mention", out var mObj) && mObj.ValueKind == JsonValueKind.Object)
                            sb.Append('@').Append(VkLiveAuth.Text(mObj, "nick")).Append(' ');
                    }
                    msgText = sb.ToString().Trim();
                }
                demands.Add(new Demand(
                    (long)(VkLiveAuth.Number(item, "id") ?? 0),
                    TextOrNumber(reward, "id"),
                    (long)(VkLiveAuth.Number(user, "id") ?? 0),
                    VkLiveAuth.Text(user, "nick"),
                    VkLiveAuth.Text(item, "status"),
                    price,
                    msgText));
            }

        var extra = Child(root, "extra");
        var isLast = extra.ValueKind == JsonValueKind.Object
            && extra.TryGetProperty("is_last", out var last)
            && last.ValueKind != JsonValueKind.False;

        return (demands, isLast);
    }

    public static Task AcceptDemandAsync(
        string channel, long demandId, string token, CancellationToken ct = default) =>
        DemandStatusAsync(channel, demandId, token, "accept", ct);

    public static Task RejectDemandAsync(
        string channel, long demandId, string token, CancellationToken ct = default) =>
        DemandStatusAsync(channel, demandId, token, "reject", ct);

    private static Task DemandStatusAsync(
        string channel, long demandId, string token, string action, CancellationToken ct)
    {
        var payload = JsonSerializer.Serialize(new { demands = new[] { new { id = demandId } } });
        return PostAsync(
            $"/channel_point/reward/demand/{action}" + Query(("channel_url", NormalizeChannel(channel))),
            token, payload, ct);
    }

    /* ===================== роли канала ===================== */

    public sealed record Role(string Id, string Name);

    public static async Task<List<Role>> RolesAsync(
        string channel, string token, CancellationToken ct = default)
    {
        var root = await GetAsync(
            "/channel_roles" + Query(("channel_url", NormalizeChannel(channel))), token, ct);
        return ReadRoles(Child(Child(root, "data"), "roles"));
    }

    public static async Task<List<Role>> UserRolesAsync(
        string channel, long userId, string token, CancellationToken ct = default)
    {
        var root = await GetAsync(
            "/channel_roles/user" + Query(
                ("channel_url", NormalizeChannel(channel)), ("user_id", userId.ToString())),
            token, ct);
        return ReadRoles(Child(Child(root, "data"), "roles"));
    }

    /// <summary>
    /// Назначение списка ролей-значков канала зрителю (заменяет список целиком).
    /// Права модератора отображаются отдельным полем и этим методом не выдаются.
    /// </summary>
    public static Task SetUserRolesAsync(
        string channel, long userId, IEnumerable<string> roleIds, string token, CancellationToken ct = default)
    {
        var payload = JsonSerializer.Serialize(new
        {
            roles = roleIds.Select(id => new { id }).ToArray(),
        });
        return PostAsync(
            "/channel_roles/user/set" + Query(
                ("channel_url", NormalizeChannel(channel)), ("user_id", userId.ToString())),
            token, payload, ct);
    }

    private static List<Role> ReadRoles(JsonElement roles)
    {
        var result = new List<Role>();
        if (roles.ValueKind != JsonValueKind.Array) return result;
        foreach (var role in roles.EnumerateArray())
            result.Add(new Role(VkLiveAuth.Text(role, "id"), VkLiveAuth.Text(role, "name")));
        return result;
    }

    /* ===================== мелочи ===================== */

    internal static JsonElement Child(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value)
            ? value
            : default;

    /// <summary>
    /// Значение поля строкой — даже если площадка прислала его числом.
    /// Идентификатор награды в разных ответах приходит то строкой, то числом:
    /// id, прочитанный только как строка, терялся — правило «награда → звук»
    /// оставалось без id, а каталог названий наград не пополнялся.
    /// </summary>
    internal static string TextOrNumber(JsonElement element, string name)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(name, out var value))
            return "";
        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString() ?? "",
            JsonValueKind.Number => value.GetRawText(),
            _ => "",
        };
    }

    private static bool Flag(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object
        && element.TryGetProperty(name, out var value)
        && value.ValueKind == JsonValueKind.True;
}
