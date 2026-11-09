using System.Net.Http.Headers;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace YawaChat;

/// <summary>
/// MemeAlerts — площадка донатов и мем-стикеров (memealerts.com).
///
/// Подключение — по официальному ext-api (документация:
/// memealerts.com/developers/api), устроенному по образцу DonationAlerts:
/// OAuth 2.0 (Authorization Code) + Centrifugo v5 для real-time событий.
///
/// Порядок подключения:
///   1. GET /api/v1/user/oauth — id пользователя и socket_connection_token
///      (access token даёт HostApi: он хранит OAuth-учётные данные из
///      раздела «Донаты» и молча продлевает просроченный access token);
///   2. подключение к wss://memealerts.com/connection/websocket и
///      авторизация токеном сокета → сервер выдаёт client id (UUID);
///   3. POST /api/v1/centrifuge/subscribe — отдельный токен подписки на
///      приватный канал донатов «$alerts:donation_&lt;id&gt;»;
///   4. подписка по WebSocket (method 1) — далее идут события
///      { reason: "new", data: { ...донат... } }.
///
/// В ленту попадают два вида событий канала:
///   • донат деньгами (type "currency") — сумма в рублях, в общем потоке
///     это обычный донат (звук, лента, полоса донатов);
///   • донат мемкоинами (type "coins") — как биты у Twitch: показывается
///     отдельным видом и в денежную полосу не попадает.
/// </summary>
public sealed class MemeAlertsConnector : IPlatformConnector
{
    private const string ApiBase = "https://memealerts.com";
    private const string WsUrl = "wss://memealerts.com/connection/websocket";

    private readonly string _channel;
    private readonly Action<ChatEvent> _emit;
    private readonly Action<string, int> _status;
    private ClientWebSocket? _ws;

    /// Показанные донаты: площадка повторяет последние события при
    /// переподключении, дубли в ленте не нужны.
    private readonly HashSet<string> _seen = new(StringComparer.Ordinal);
    private readonly Queue<string> _seenOrder = new();

    public MemeAlertsConnector(string channel, Action<ChatEvent> emit, Action<string, int> status)
    {
        _channel = string.IsNullOrWhiteSpace(channel) ? "донаты" : channel;
        _emit = emit;
        _status = status;
    }

    private void Remember(string id)
    {
        if (!_seen.Add(id)) return;
        _seenOrder.Enqueue(id);
        while (_seenOrder.Count > 500) _seen.Remove(_seenOrder.Dequeue());
    }

    /// Поле «строкой»: площадка отдаёт id и суммы и строкой, и числом.
    private static string? IdOrNum(JsonElement el, string name)
    {
        if (Net.TryFind(el, name, out var f))
        {
            if (f.ValueKind == JsonValueKind.String) return f.GetString();
            if (f.ValueKind == JsonValueKind.Number) return f.GetRawText();
        }
        return null;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        // OAuth-учётные данные (access/refresh token) живут в настройках
        // хоста, а не в канале: у площадки нет «народного» пути по токену
        // виджета, только авторизованное приложение.
        var auth = await ConnectorManager.MemeAlertsAuthProvider?.Invoke(ct);
        if (auth == null || auth.AccessToken.Length == 0)
            throw new InvalidOperationException(
                "MemeAlerts: аккаунт не подключён. Откройте раздел «Донаты» и нажмите «Подключить».");
        if (auth.ClientId.Length == 0 || auth.ClientSecret.Length == 0)
            throw new InvalidOperationException(
                "MemeAlerts: не указаны Client ID и Client Secret приложения. Впишите их в разделе «Донаты».");

        _status("connecting", 0);

        using var http = Net.Http(TimeSpan.FromSeconds(15));
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);

        /* 1) профиль: id аккаунта и токен подключения к Centrifugo */
        var userHttp = await http.GetAsync($"{ApiBase}/api/v1/user/oauth", ct);
        var userResp = await userHttp.Content.ReadAsStringAsync(ct);
        if (!userHttp.IsSuccessStatusCode)
            throw new InvalidOperationException(userHttp.StatusCode switch
            {
                System.Net.HttpStatusCode.Unauthorized =>
                    "MemeAlerts: доступ отозван или истёк. Подключите аккаунт заново в разделе «Донаты».",
                System.Net.HttpStatusCode.Forbidden =>
                    "MemeAlerts: у токена нет прав. Переподключите аккаунт в разделе «Донаты».",
                _ => $"MemeAlerts: API ответил {(int)userHttp.StatusCode}",
            });

        string socketToken, uid;
        using (var userDoc = JsonDocument.Parse(userResp))
        {
            if (!userDoc.RootElement.TryGetProperty("data", out var data))
                throw new InvalidOperationException("MemeAlerts: неожиданный ответ API (нет data)");
            socketToken = Net.FindString(data, "socket_connection_token") ?? "";
            if (socketToken.Length == 0)
                throw new InvalidOperationException("MemeAlerts: нет токена подключения — переподключите аккаунт");
            uid = IdOrNum(data, "id") ?? "";
        }
        if (uid.Length == 0)
            throw new InvalidOperationException("MemeAlerts: API не вернул id аккаунта");

        /* 2) подключение и авторизация сокета → client id */
        var ws = new ClientWebSocket();
        _ws = ws; // поле — для Dispose
        ws.Options.SetRequestHeader("Origin", "https://memealerts.com");
        ws.Options.SetRequestHeader("User-Agent", Net.UA);
        await ws.ConnectAsync(new Uri(WsUrl), ct);

        await Net.WsSend(ws,
            JsonSerializer.Serialize(new { @params = new { token = socketToken }, id = 1 }), ct);

        var hello = await Net.WsRecv(ws, ct)
            ?? throw new InvalidOperationException("MemeAlerts: сервер закрыл соединение");

        string clientId;
        using (var helloDoc = JsonDocument.Parse(hello))
        {
            if (helloDoc.RootElement.TryGetProperty("error", out var err))
                throw new InvalidOperationException("MemeAlerts: доступ отклонён — " +
                    (Net.FindString(err, "message") ?? "проверьте подключение аккаунта"));
            clientId = Net.FindString(helloDoc.RootElement, "client") ?? "";
        }
        if (clientId.Length == 0)
            throw new InvalidOperationException("MemeAlerts: сервер не подтвердил подключение");

        /* 3) токен подписки на приватный канал донатов */
        var channelName = $"$alerts:donation_{uid}";
        var subBody = JsonSerializer.Serialize(new { channels = new[] { channelName }, client = clientId });
        using var subContent = new StringContent(subBody, Encoding.UTF8, "application/json");
        var subResp = await http.PostAsync($"{ApiBase}/api/v1/centrifuge/subscribe", subContent, ct);
        var subText = await subResp.Content.ReadAsStringAsync(ct);
        if (!subResp.IsSuccessStatusCode)
            throw new InvalidOperationException(
                $"MemeAlerts: подписка отклонена ({(int)subResp.StatusCode}). Переподключите аккаунт.");

        string channelToken;
        try
        {
            using var subDoc = JsonDocument.Parse(subText);
            channelToken = "";
            if (subDoc.RootElement.TryGetProperty("channels", out var chArr) && chArr.ValueKind == JsonValueKind.Array)
            {
                foreach (var ch in chArr.EnumerateArray())
                {
                    var t = Net.FindString(ch, "token") ?? "";
                    if (t.Length > 0) { channelToken = t; break; }
                }
            }
            if (channelToken.Length == 0)
                throw new InvalidOperationException("MemeAlerts: нет токена подписки на канал донатов");
        }
        catch (InvalidOperationException) { throw; }
        catch { throw new InvalidOperationException("MemeAlerts: неожиданный ответ при подписке"); }

        /* 4) подписка на канал по WebSocket */
        await Net.WsSend(ws, JsonSerializer.Serialize(new
        {
            @params = new { channel = channelName, token = channelToken },
            method = 1,
            id = 2,
        }), ct);

        _status("connected", 0);

        // Пульс, чтобы сервер не разрывал idle-соединение (как у DonationAlerts).
        _ = Task.Run(async () =>
        {
            while (!ct.IsCancellationRequested)
            {
                try { await Net.WsSend(ws, "{\"method\":7,\"id\":7}", ct); } catch { return; }
                try { await Task.Delay(25000, ct); } catch { return; }
            }
        }, CancellationToken.None);

        while (!ct.IsCancellationRequested)
        {
            var text = await Net.WsRecv(ws, ct);
            if (text == null) throw new InvalidOperationException("MemeAlerts: соединение закрыто");

            try
            {
                using var doc = JsonDocument.Parse(text);
                if (!Net.TryFind(doc.RootElement, "data", out var payloadEl)) continue;
                // Тело события: { reason: "new", data: { ...донат... } }.
                // Данные могут лежать вложенными строкой (Centrifugo так
                // отдаёт у части площадок) — разбираем обе формы.
                JsonElement body = payloadEl;
                if (payloadEl.ValueKind == JsonValueKind.String)
                {
                    using var parsed = JsonDocument.Parse(payloadEl.GetString() ?? "{}");
                    body = parsed.RootElement.Clone();
                }
                else if (Net.TryFind(payloadEl, "data", out var innerEl))
                {
                    body = innerEl.Clone();
                }

                var reason = Net.FindString(body, "reason") ?? "";
                if (reason.Length > 0 && reason != "new") continue;
                if (Net.TryFind(body, "data", out var donationEl) && donationEl.ValueKind == JsonValueKind.Object)
                    EmitDonation(donationEl);
            }
            catch (JsonException) { /* служебный кадр */ }
            catch (InvalidOperationException) { throw; }
            catch (Exception ex)
            {
                AppLog.Debug("memealerts", $"Ошибка разбора доната: {ex.GetType().Name}");
            }
        }
    }

    private void EmitDonation(JsonElement d)
    {
        var id = IdOrNum(d, "id") ?? "";
        if (id.Length > 0)
        {
            lock (_seen)
            {
                if (_seen.Contains(id)) return;
                Remember(id);
            }
        }

        var author = (Net.FindString(d, "username") ?? "").Trim();
        if (author.Length == 0) author = "Аноним";
        var message = Net.StripHtml(Net.FindString(d, "message") ?? "").Trim();
        var goal = (Net.FindString(d, "goalTitle") ?? "").Trim();
        var text = goal.Length > 0
            ? (message.Length > 0 ? $"{message} → {goal}" : goal)
            : message;

        double? amount = null;
        if (Net.TryFind(d, "amount", out var am))
        {
            if (am.ValueKind == JsonValueKind.Number && am.TryGetDouble(out var a)) amount = a;
            else if (am.ValueKind == JsonValueKind.String &&
                     double.TryParse(am.GetString()?.Replace(',', '.'),
                         System.Globalization.NumberStyles.Any,
                         System.Globalization.CultureInfo.InvariantCulture, out var a2)) amount = a2;
        }

        // Деньги и мемкоины — разные «валюты»: донат деньгами идёт общим
        // потоком (полоса донатов считает именно его), мемкоины — как биты.
        var type = Net.FindString(d, "type") ?? "";
        if (type == "currency")
        {
            _emit(new ChatEvent
            {
                platform = "memealerts",
                channel = _channel,
                author = author,
                text = text,
                kind = "donate",
                amount = amount,
                // Денежные донаты площадки — в рублях (склонения
                // «рубль/рубля/рублей» приходят в currencyName).
                currency = "₽",
            });
            return;
        }

        var coinName = (Net.FindString(d, "currencyName") ?? "").Trim();
        if (coinName.Length == 0) coinName = "мемкоинов";
        _emit(new ChatEvent
        {
            platform = "memealerts",
            channel = _channel,
            author = author,
            text = text.Length > 0 ? text : $"отправил {amount?.ToString() ?? "0"} {coinName}",
            kind = "bits",
            amount = amount,
            currency = coinName,
        });
    }

    public void Dispose()
    {
        try { _ws?.Abort(); } catch { }
        try { _ws?.Dispose(); } catch { }
    }
}
