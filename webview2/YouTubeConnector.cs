using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace YawaChat;

/// <summary>
/// Быстрый YouTube Live-коннектор без пользовательского API-ключа.
///
/// Старый вариант последовательно открывал три адреса с таймаутом 20 секунд
/// каждый и искал continuation только рядом с liveChatRenderer. После изменений
/// YouTube это давало до минуты ожидания и вечный статус «подключение».
///
/// Новый порядок повторяет рабочий YawaChat_Hub:
///   1. /live, /streams и Innertube search проверяются ПАРАЛЛЕЛЬНО;
///   2. весь поиск ограничен восемью секундами;
///   3. каждый найденный videoId подтверждается отдельной watch-страницей;
///   4. чат и updated_metadata открываются отдельно для каждого эфира;
///   5. если continuation нет в HTML, используется youtubei/v1/next;
///   6. timed/invalidation/reload continuation поддерживаются одинаково, а
///      replay/архивные данные отбрасываются.
/// </summary>
public sealed class YouTubeConnector : IPlatformConnector
{
    // Публичный ключ WEB-клиента: он встроен в youtube.com и используется самим
    // сайтом. Это не пользовательский Google API key и не секрет.
    private const string InnertubeKey = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
    private const string DefaultClientVersion = "2.20241216.01.00";

    private readonly string _user;
    private readonly string _directVideoId;
    private readonly Action<ChatEvent> _emit;
    private readonly Action<string, int> _status;
    private readonly Action<Exception> _reportError;

    private sealed record LiveInfo(string VideoId, string Html, string PageUrl);
    private sealed record ChatSession(string Key, string ClientVersion, string Continuation);
    private sealed record PollBatch(string Continuation, int TimeoutMs);
    /* Найденный поиском эфир: контекст карточки нужен, чтобы убедиться, что
       это трансляция НАШЕГО канала, а не чужого с похожим названием. */
    private sealed record SearchHit(string VideoId, string Context);

    /* Состояние одного эфира канала: зрители суммируются по всем эфирам, а
       признак конца нужен чату, чтобы не опрашивать завершённое видео вечно. */
    private sealed class LiveState
    {
        public LiveState(string videoId) => VideoId = videoId;
        public string VideoId { get; }
        public int Viewers;
        public bool Ended;
    }

    /* Канал может вести два эфира одновременно: обычный широкий и вертикальный
       (Shorts). У каждого своё видео и свой чат, поэтому опрашиваем все найденные
       эфиры параллельно и складываем сообщения в одну ленту. */
    private const int MaxParallelLives = 4;
    private const int MaxCandidateLives = MaxParallelLives * 3;

    /* Пока идёт хотя бы один эфир, канал перепроверяется с этим интервалом:
       второй эфир часто запускают уже после первого (например, запланирован
       вертикальный, а широкий включили вручную позже). Раньше поиск повторялся
       только после завершения ВСЕХ найденных эфиров, и второй не замечался
       до конца первого. Интервал как у фоновой проверки офлайн-канала. */
    private const int RediscoverIntervalMs = 45_000;

    /* Защита от повторов: одно и то же сообщение площадка может прислать дважды
       (повтор продолжения, общий чат у двух эфиров) — в ленте строка должна
       быть одна. Храним последние ключи, память не растёт бесконечно. */
    private const int SeenLimit = 800;
    private readonly object _seenGate = new();
    private readonly HashSet<string> _seen = new(StringComparer.Ordinal);
    private readonly Queue<string> _seenOrder = new();

    /* Смайлы эфира: код вроде face-blue-smiling → адрес картинки.
       Сюда попадают и глобальные коды, и смайлы канала. Параллельные эфиры
       одного канала делят этот коннектор, поэтому словарь под замком. */
    private const int EmojiCatalogLimit = 2000;
    private readonly object _emojiGate = new();
    private readonly Dictionary<string, string> _emojiByShortcut =
        new(StringComparer.OrdinalIgnoreCase);

    private static readonly Regex ShortcutInText = new(@":([^:\s""\\<>]{1,80}):", RegexOptions.Compiled);
    private static readonly Regex EmojiCdnUrl = new(
        @"https://(?:yt3\.ggpht\.com|yt3\.googleusercontent\.com|i\.ytimg\.com)/[^\s""'\\<>]+",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex AltThenSrc = new(
        @"alt="":([^:""]{1,80}):""[^>]{0,500}?src=""(https://[^""]+)""",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex SrcThenAlt = new(
        @"src=""(https://[^""]+)""[^>]{0,500}?alt="":([^:""]{1,80}):""",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public YouTubeConnector(string user, Action<ChatEvent> emit, Action<string, int> status,
        Action<Exception> reportError)
    {
        (_user, _directVideoId) = NormalizeTarget(user);
        _emit = emit;
        _status = status;
        _reportError = reportError;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        using var handler = new HttpClientHandler
        {
            AllowAutoRedirect = true,
            AutomaticDecompression = DecompressionMethods.All,
        };
        using var http = new HttpClient(handler) { Timeout = Timeout.InfiniteTimeSpan };
        http.DefaultRequestHeaders.UserAgent.ParseAdd(Net.UA);
        http.DefaultRequestHeaders.TryAddWithoutValidation("Accept-Language", "ru-RU,ru;q=0.9,en;q=0.8");
        // Без consent-cookie YouTube иногда редиректит на consent.youtube.com,
        // где нет videoId и continuation.
        http.DefaultRequestHeaders.TryAddWithoutValidation(
            "Cookie", "CONSENT=YES+cb.20210328-17-p0.en+FX; SOCS=CAI");

        // Пока канал офлайн, статус НЕ переключается в «подключение» на каждой
        // фоновой перепроверке: иначе карточка канала мигала, а в ленте каждые
        // 45 секунд появлялась новая строка «офлайн — чат ждёт эфир».
        var wasOffline = false;
        var attempts = 0;
        while (!ct.IsCancellationRequested)
        {
            if (!wasOffline) _status("connecting", 0);

            List<LiveInfo> lives;
            try { lives = await FindLivesAsync(http, ct); }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { return; }
            catch (Exception ex)
            {
                wasOffline = false;
                _reportError(ex);
                if (!await DelayAsync(attempts++ < 3 ? 5_000 : 15_000, ct)) return;
                continue;
            }

            if (lives.Count == 0)
            {
                wasOffline = true;
                _status("offline", 0);
                // Быстро подхватываем начавшийся эфир, затем экономим запросы.
                var wait = attempts < 2 ? 6_000 : attempts < 4 ? 15_000 : 45_000;
                attempts++;
                if (!await DelayAsync(wait, ct)) return;
                continue;
            }
            wasOffline = false;
            attempts = 0;

            /* Каждый найденный videoId уже подтверждён отдельной страницей
               видео. Для него создаём отдельный чат и отдельный polling
               updated_metadata: нельзя брать ключ, continuation или зрителей
               первого эфира для второго. Список растёт: эфиры, начатые позже,
               добавляются сюда при перепроверке канала. */
            var states = new List<LiveState>();
            var viewersGate = new object();

            void ReportViewers(LiveState state, int value)
            {
                lock (viewersGate)
                {
                    if (state.Ended) return;
                    value = Math.Max(0, value);
                    if (state.Viewers == value) return;
                    state.Viewers = value;
                    var total = states.Where(s => !s.Ended).Sum(s => s.Viewers);
                    _status("online", total);
                }
            }

            void EndLive(LiveState state)
            {
                lock (viewersGate)
                {
                    if (state.Ended) return;
                    state.Ended = true;
                    state.Viewers = 0;
                    var active = states.Where(s => !s.Ended).Sum(s => s.Viewers);
                    _status(active > 0 ? "online" : "offline", active);
                }
            }

            using var livesCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            /* Контуры эфиров по videoId. Ключ остаётся и после конца эфира:
               площадка ещё какое-то время показывает завершённую трансляцию
               как идущую, и без этого она переподключалась бы по кругу. */
            var liveTasks = new Dictionary<string, Task>(StringComparer.Ordinal);

            void StartLive(LiveInfo live)
            {
                var state = new LiveState(live.VideoId);
                lock (viewersGate) states.Add(state);
                var key = Extract(live.Html, "\"INNERTUBE_API_KEY\":\"", "\"")
                    ?? InnertubeKey;
                var clientVersion = Extract(live.Html, "\"INNERTUBE_CLIENT_VERSION\":\"", "\"")
                    ?? DefaultClientVersion;

                liveTasks[live.VideoId] = RunLiveAsync(
                    http, live, state, key, clientVersion,
                    value => ReportViewers(state, value),
                    () => EndLive(state),
                    livesCts.Token);
            }

            _status("online", 0);
            foreach (var live in lives) StartLive(live);

            /* Пока идёт хотя бы один эфир, канал периодически перепроверяется,
               и новые эфиры подключаются к уже работающим — не дожидаясь
               конца первого. Для конкретного видео (ссылка на эфир) других
               эфиров быть не может, там перепроверка не нужна. */
            try
            {
                while (!ct.IsCancellationRequested)
                {
                    var running = liveTasks.Values.Where(t => !t.IsCompleted).ToArray();
                    if (running.Length == 0) break;

                    var allDone = Task.WhenAll(running);
                    if (_directVideoId.Length == 11)
                    {
                        await allDone;
                        break;
                    }

                    // Таймер перепроверки гасим сразу, как только эфиры закончились:
                    // иначе он доживал бы свои секунды уже после выхода из цикла.
                    using var tickCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                    var tick = Task.Delay(RediscoverIntervalMs, tickCts.Token);
                    var first = await Task.WhenAny(allDone, tick);
                    tickCts.Cancel();
                    if (first == allDone || ct.IsCancellationRequested) break;

                    List<LiveInfo> found;
                    try { found = await FindLivesAsync(http, ct, liveTasks.Keys); }
                    catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
                    catch { continue; } // сеть моргнула — текущие эфиры продолжают работать

                    foreach (var live in found)
                    {
                        if (liveTasks.ContainsKey(live.VideoId)) continue;
                        if (liveTasks.Values.Count(t => !t.IsCompleted) >= MaxParallelLives) break;
                        StartLive(live);
                    }
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { return; }
            catch { /* отдельный эфир мог завершиться с ошибкой — найдём его заново */ }

            livesCts.Cancel();
            foreach (var task in liveTasks.Values)
            {
                try { await task; }
                catch (OperationCanceledException) { }
                catch { }
            }

            if (ct.IsCancellationRequested) return;
            _status("connected", 0);
            if (!await DelayAsync(3_000, ct)) return;
        }
    }

    /// Один независимый контур для одного подтверждённого эфира.
    private async Task RunLiveAsync(
        HttpClient http,
        LiveInfo live,
        LiveState state,
        string metadataKey,
        string metadataClientVersion,
        Action<int> reportViewers,
        Action markEnded,
        CancellationToken ct)
    {
        var viewersTask = RefreshViewersAsync(
            http, live.VideoId, metadataKey, metadataClientVersion,
            state, reportViewers, markEnded, ct);
        var chatTask = ChatLoopAsync(http, live, state, reportViewers, ct);
        try
        {
            await Task.WhenAll(viewersTask, chatTask);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
        finally
        {
            // Если metadata подтвердил конец эфира, не оставляем его чат
            // активным и не даём старому videoId удерживать канал.
            try { await Task.WhenAll(viewersTask, chatTask); }
            catch { }
        }
    }

    /// <summary>
    /// Находит только текущие эфиры указанного канала. Страница канала и
    /// глобальный поиск дают кандидатов, но каждый videoId дополнительно
    /// проверяется собственной watch-страницей перед запуском чата.
    /// </summary>
    // known — эфиры, к которым уже подключены: их страницы заново не
    // запрашиваются и в ответ они не попадают; при перепроверке канала
    // нужны только новые.
    private async Task<List<LiveInfo>> FindLivesAsync(
        HttpClient http, CancellationToken ct, IEnumerable<string>? known = null)
    {
        if (_directVideoId.Length == 11)
        {
            var watch = $"https://www.youtube.com/watch?v={_directVideoId}";
            var html = await GetTextAsync(http, watch, ct, 7);
            if (html.Length == 0)
                throw new InvalidOperationException("YouTube: страница эфира недоступна");
            return IsCurrentLiveHtml(html, _directVideoId)
                ? new List<LiveInfo> { new(_directVideoId, html, watch) }
                : new List<LiveInfo>();
        }

        using var searchCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        searchCts.CancelAfter(TimeSpan.FromSeconds(8));

        var id = Uri.EscapeDataString(_user);
        var urls = _user.StartsWith("UC", StringComparison.Ordinal) && _user.Length > 20
            ? new[]
            {
                $"https://www.youtube.com/channel/{id}/live",
                $"https://www.youtube.com/channel/{id}/streams",
                $"https://www.youtube.com/channel/{id}/shorts",
            }
            : new[]
            {
                $"https://www.youtube.com/@{id}/live",
                $"https://www.youtube.com/@{id}/streams",
                $"https://www.youtube.com/@{id}/shorts",
                $"https://www.youtube.com/c/{id}/live",
                $"https://www.youtube.com/user/{id}/live",
                $"https://www.youtube.com/{id}/live",
            };

        var pageTasks = urls
            .Select(url => FindFromPageSafeAsync(http, url, searchCts.Token, ct))
            .ToArray();
        var searchTask = FindFromSearchAsync(http, _user, searchCts.Token);
        var candidates = new List<LiveInfo>();
        var seen = new HashSet<string>(known ?? Enumerable.Empty<string>(), StringComparer.Ordinal);
        var pageHtmls = new List<string>();

        try
        {
            var pages = await Task.WhenAll(pageTasks);
            foreach (var page in pages)
            {
                if (page == null) continue;
                pageHtmls.Add(page.Html);
                foreach (var live in page.Lives)
                {
                    if (seen.Add(live.VideoId)) candidates.Add(live);
                    if (candidates.Count >= MaxCandidateLives) break;
                }
                if (candidates.Count >= MaxCandidateLives) break;
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch { /* отдельная страница недоступна — проверяем остальные источники */ }

        // Глобальный поиск может вернуть чужой эфир с похожим названием.
        // Принимаем его только если карточка явно принадлежит этому каналу.
        var ownChannelId = OwnChannelId(pageHtmls);
        try
        {
            var hits = await searchTask;
            if (hits != null && ownChannelId.Length > 0)
            {
                foreach (var hit in hits)
                {
                    if (candidates.Count >= MaxCandidateLives) break;
                    if (!hit.Context.Contains(ownChannelId, StringComparison.Ordinal)) continue;
                    if (seen.Add(hit.VideoId))
                        candidates.Add(new LiveInfo(
                            hit.VideoId, hit.Context,
                            $"https://www.youtube.com/watch?v={hit.VideoId}"));
                }
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch { /* канала достаточно, если его страницы уже ответили */ }

        if (candidates.Count == 0)
        {
            // «Не в эфире» можно сказать, только если хотя бы одна страница
            // канала ответила. Когда недоступны все, это ошибка подключения.
            if (pageHtmls.Count == 0)
                throw new InvalidOperationException("YouTube: страницы канала недоступны");
            return candidates;
        }

        // Кандидаты с channel/streams страниц тоже перепроверяются: там рядом
        // с текущим эфиром находятся архивы и рекомендации с чужими чатами.
        var confirmations = candidates
            .Take(MaxCandidateLives)
            .Select(candidate => ConfirmLiveAsync(http, candidate, ownChannelId, ct))
            .ToArray();
        LiveInfo?[] checkedLives;
        try { checkedLives = await Task.WhenAll(confirmations); }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch { return new List<LiveInfo>(); }

        var result = new List<LiveInfo>();
        var confirmed = new HashSet<string>(StringComparer.Ordinal);
        foreach (var live in checkedLives)
        {
            if (live != null && confirmed.Add(live.VideoId)) result.Add(live);
            if (result.Count >= MaxParallelLives) break;
        }
        return result;
    }

    private static async Task<LiveInfo?> ConfirmLiveAsync(
        HttpClient http,
        LiveInfo candidate,
        string expectedChannelId,
        CancellationToken ct)
    {
        var watchUrl = $"https://www.youtube.com/watch?v={candidate.VideoId}";
        var html = await GetTextAsync(
            http, watchUrl, ct, 7,
            candidate.PageUrl.StartsWith("http", StringComparison.Ordinal)
                ? candidate.PageUrl
                : "https://www.youtube.com/");
        if (!IsCurrentLiveHtml(html, candidate.VideoId)) return null;

        // YouTube должен отдать владельца видео. Без него нельзя отличить
        // рекомендацию с похожим названием от эфира нашего канала.
        if (expectedChannelId.Length > 0)
        {
            var videoChannelId = ExtractVideoChannelId(html);
            if (videoChannelId.Length == 0 ||
                !videoChannelId.Equals(expectedChannelId, StringComparison.Ordinal))
                return null;
        }

        return new LiveInfo(candidate.VideoId, html, watchUrl);
    }

    private static bool IsCurrentLiveHtml(string html, string videoId = "")
    {
        if (html.Length < 500) return false;

        // Ограничиваем проверку областью player response. Внизу watch-страницы
        // могут находиться рекомендации с LIVE_NOW, которые нельзя принимать
        // за состояние проверяемого videoId.
        var playerStart = html.IndexOf("\"videoDetails\"", StringComparison.Ordinal);
        var scope = html;
        if (playerStart >= 0)
            scope = html.Substring(playerStart, Math.Min(200_000, html.Length - playerStart));

        if (videoId.Length == 11)
        {
            var videoPattern = "\"videoId\"\\s*:\\s*\"" + Regex.Escape(videoId) + "\"";
            if (!Regex.IsMatch(scope, videoPattern)) return false;
        }

        // isLiveContent alone also appears on archived broadcasts. Нужен
        // именно live-now marker from the player response, not рекомендация.
        return Regex.IsMatch(
            scope,
            @"""isLiveNow""\s*:\s*true|""isLive""\s*:\s*true|""liveBroadcastDetails""\s*:\s*\{[^}]{0,2000}?""isLiveNow""\s*:\s*true|BADGE_STYLE_TYPE_LIVE_NOW|LIVE_NOW|""style""\s*:\s*""LIVE""",
            RegexOptions.IgnoreCase | RegexOptions.Singleline);
    }

    private static string ExtractVideoChannelId(string html)
    {
        var start = html.IndexOf("\"videoDetails\"", StringComparison.Ordinal);
        if (start < 0) return "";
        var length = Math.Min(20_000, html.Length - start);
        var section = html.Substring(start, length);
        var match = Regex.Match(section, @"""channelId""\s*:\s*""(UC[\w-]{22})""");
        return match.Success ? match.Groups[1].Value : "";
    }

    /// <summary>
    /// Канал-владелец страниц: нужен, чтобы отличить свои эфиры от чужих в
    /// результатах глобального поиска. Берётся из метаданных страницы, а не
    /// из первого попавшегося идентификатора — в рекомендациях полно чужих.
    /// </summary>
    private string OwnChannelId(List<string> pageHtmls)
    {
        if (_user.StartsWith("UC", StringComparison.Ordinal) && _user.Length > 20)
            return _user;
        foreach (var html in pageHtmls)
        {
            var id = ExtractOwnChannelId(html);
            if (id.Length > 0) return id;
        }
        return "";
    }

    private static string ExtractOwnChannelId(string html)
    {
        if (html.Length < 500) return "";
        var meta = Regex.Match(
            html,
            @"""channelMetadataRenderer""\s*:\s*\{[^}]{0,2000}?""externalId""\s*:\s*""(UC[\w-]{22})""",
            RegexOptions.Singleline);
        if (meta.Success) return meta.Groups[1].Value;
        var any = Regex.Match(html, @"""externalId""\s*:\s*""(UC[\w-]{22})""");
        return any.Success ? any.Groups[1].Value : "";
    }

    /* Ответ страницы: сам текст нужен даже когда эфира нет — из него узнаём
       идентификатор канала для проверки результатов глобального поиска. */
    private sealed record PageResult(string Html, List<LiveInfo> Lives);

    private static async Task<PageResult?> FindFromPageSafeAsync(
        HttpClient http, string url, CancellationToken searchCt, CancellationToken outerCt)
    {
        try { return await FindFromPageAsync(http, url, searchCt); }
        catch (OperationCanceledException) when (!outerCt.IsCancellationRequested) { return null; }
    }

    private static async Task<PageResult?> FindFromPageAsync(
        HttpClient http, string url, CancellationToken ct)
    {
        var html = await GetTextAsync(http, url, ct, 7);
        if (html.Length == 0) return null;
        var ids = ExtractLiveVideoIds(html, url);
        return new PageResult(html, ids.Select(v => new LiveInfo(v, html, url)).ToList());
    }

    private static async Task<List<SearchHit>?> FindFromSearchAsync(
        HttpClient http, string query, CancellationToken ct)
    {
        var payload = JsonSerializer.Serialize(new
        {
            context = new
            {
                client = new
                {
                    clientName = "WEB",
                    clientVersion = DefaultClientVersion,
                    hl = "ru",
                    gl = "RU",
                },
            },
            query,
            // Фильтр YouTube Search «Live».
            @params = "EgJAAQ==",
        });

        var json = await PostJsonAsync(
            http,
            $"https://www.youtube.com/youtubei/v1/search?key={InnertubeKey}&prettyPrint=false",
            payload,
            DefaultClientVersion,
            ct,
            7);
        if (json.Length == 0) return null;

        try
        {
            using var doc = JsonDocument.Parse(json);
            var hits = FindLiveVideoIds(doc.RootElement);
            return hits.Count == 0 ? null : hits;
        }
        catch { return null; }
    }

    /// <summary>
    /// Все видео страницы, помеченные как идущие прямо сейчас. Их бывает два:
    /// широковещательный эфир и вертикальный (Shorts) — у каждого свой чат.
    /// </summary>
    private static List<string> ExtractLiveVideoIds(string html, string pageUrl)
    {
        var ids = new List<string>();
        if (!IsLiveHtml(html)) return ids;

        /* На страницах-списках («Видео», Shorts) первый попавшийся videoId —
           это любой ролик: подключись мы к нему, в ленту полились бы старые
           сообщения из чата записи. Там годятся только видео с меткой «в эфире».
           На странице /live сам ролик и есть эфир, там шаблон шире. */
        var isLivePage = pageUrl.EndsWith("/live", StringComparison.OrdinalIgnoreCase);

        // Первым делом — сам ролик страницы (canonical / videoDetails).
        var main = ExtractLiveVideoId(html, allowAnyVideo: isLivePage);
        if (main.Length == 11) ids.Add(main);

        // Затем все видео, рядом с которыми площадка поставила метку «в эфире».
        // Просто собирать все videoId нельзя: на странице полно чужих роликов,
        // и чат записи вылил бы в ленту старые сообщения как новые.
        const string livePattern =
            @"""videoId""\s*:\s*""([\w-]{11})""(?:(?!""videoId"").){0,1200}?(?:""isLiveNow""\s*:\s*true|""isLive""\s*:\s*true|BADGE_STYLE_TYPE_LIVE_NOW|LIVE_NOW)";

        foreach (Match m in Regex.Matches(html, livePattern, RegexOptions.IgnoreCase | RegexOptions.Singleline))
        {
            var id = m.Groups[1].Value;
            if (id.Length == 11 && !ids.Contains(id, StringComparer.Ordinal)) ids.Add(id);
            if (ids.Count >= MaxParallelLives) break;
        }

        /* Новая разметка списков («карточки»): метка «в эфире» стоит в бейдже
           превью ДО идентификатора видео, а сам идентификатор записан как
           contentId. Шаблон выше её не видит, поэтому карточки разбираются
           отдельно, каждая в своих границах. Лишние кандидаты не страшны: их
           всё равно подтверждает страница самого видео. */
        foreach (var id in ExtractLockupLiveIds(html))
        {
            if (ids.Count >= MaxParallelLives) break;
            if (!ids.Contains(id, StringComparer.Ordinal)) ids.Add(id);
        }
        return ids;
    }

    private const string LockupMarker = "\"lockupViewModel\":{";
    private static readonly Regex LockupLiveBadge = new(
        @"THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE\b|BADGE_STYLE_TYPE_LIVE_NOW|""isLiveNow""\s*:\s*true",
        RegexOptions.Compiled);
    private static readonly Regex LockupContentId = new(
        @"""contentId""\s*:\s*""([\w-]{11})""",
        RegexOptions.Compiled);

    /// <summary>Идентификаторы видео из карточек списка с меткой «в эфире».</summary>
    private static List<string> ExtractLockupLiveIds(string html)
    {
        var ids = new List<string>();
        var pos = html.IndexOf(LockupMarker, StringComparison.Ordinal);
        while (pos >= 0 && ids.Count < MaxParallelLives)
        {
            var next = html.IndexOf(LockupMarker, pos + LockupMarker.Length, StringComparison.Ordinal);
            var end = next >= 0 ? next : html.Length;
            // Карточка — несколько тысяч символов; длиннее — уже не карточка.
            var segment = html.Substring(pos, Math.Min(end - pos, 40_000));
            if (LockupLiveBadge.IsMatch(segment))
            {
                var m = LockupContentId.Match(segment);
                if (m.Success && !ids.Contains(m.Groups[1].Value, StringComparer.Ordinal))
                    ids.Add(m.Groups[1].Value);
            }
            pos = next;
        }
        return ids;
    }

    private static string ExtractLiveVideoId(string html, bool allowAnyVideo = false)
    {
        if (!IsLiveHtml(html)) return "";

        /* allowAnyVideo — последний шаблон «любой videoId подряд». Он уместен
           только на странице /live, где первый ролик и есть эфир. На страницах
           со списками им пользоваться нельзя. */
        var patterns = allowAnyVideo
            ? new[]
            {
                @"<link\s+rel=""canonical""\s+href=""https://www\.youtube\.com/watch\?v=([\w-]{11})",
                @"""videoDetails""\s*:\s*\{\s*""videoId""\s*:\s*""([\w-]{11})""",
                @"""videoId""\s*:\s*""([\w-]{11})""(?:(?!""videoId"").){0,1200}?(?:""isLiveNow""\s*:\s*true|""isLive""\s*:\s*true|BADGE_STYLE_TYPE_LIVE_NOW|LIVE_NOW)",
                @"""videoId""\s*:\s*""([\w-]{11})""",
            }
            : new[]
            {
                @"<link\s+rel=""canonical""\s+href=""https://www\.youtube\.com/watch\?v=([\w-]{11})",
                @"""videoDetails""\s*:\s*\{\s*""videoId""\s*:\s*""([\w-]{11})""",
                @"""videoId""\s*:\s*""([\w-]{11})""(?:(?!""videoId"").){0,1200}?(?:""isLiveNow""\s*:\s*true|""isLive""\s*:\s*true|BADGE_STYLE_TYPE_LIVE_NOW|LIVE_NOW)",
            };
        foreach (var pattern in patterns)
        {
            var match = Regex.Match(html, pattern, RegexOptions.IgnoreCase | RegexOptions.Singleline);
            if (match.Success) return match.Groups[1].Value;
        }
        return "";
    }

    private static bool IsLiveHtml(string html) =>
        html.Length > 500 && Regex.IsMatch(
            html,
            @"""isLiveNow""\s*:\s*true|""isLive""\s*:\s*true|BADGE_STYLE_TYPE_LIVE_NOW|LIVE_NOW|""style""\s*:\s*""LIVE""|THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE\b",
            RegexOptions.IgnoreCase);

    /// <summary>
    /// Все видео из ответа поиска, помеченные как идущие в эфире. Берётся
    /// только карточка целиком (с названием и владельцем): вложенные ссылки
    /// с тем же videoId владельца не содержат, и по ним нельзя понять,
    /// наш это эфир или чужой. Контекст карточки хранится для проверки.
    /// </summary>
    private static List<SearchHit> FindLiveVideoIds(JsonElement el)
    {
        var hits = new List<SearchHit>();
        var seen = new HashSet<string>(StringComparer.Ordinal);

        void Walk(JsonElement node, int depth)
        {
            if (depth > 20 || hits.Count >= MaxParallelLives) return;

            if (node.ValueKind == JsonValueKind.Object)
            {
                if (node.TryGetProperty("videoId", out var idEl) && idEl.ValueKind == JsonValueKind.String)
                {
                    var id = idEl.GetString() ?? "";
                    if (id.Length == 11)
                    {
                        var raw = node.GetRawText();
                        // Только карточка целиком: вложенные ссылки владельца
                        // не содержат и в учёт не идут (иначе они же и
                        // заблокировали бы карточку через seen).
                        var isCard = raw.Contains("ownerText", StringComparison.Ordinal)
                            || raw.Contains("bylineText", StringComparison.Ordinal)
                            || raw.Contains("\"title\"", StringComparison.Ordinal);
                        if (isCard && seen.Add(id)
                            && Regex.IsMatch(raw, "LIVE|isLiveNow|BADGE_STYLE_TYPE_LIVE", RegexOptions.IgnoreCase))
                            hits.Add(new SearchHit(id, raw));
                    }
                }
                foreach (var prop in node.EnumerateObject()) Walk(prop.Value, depth + 1);
            }
            else if (node.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in node.EnumerateArray()) Walk(item, depth + 1);
            }
        }

        Walk(el, 0);
        return hits;
    }

    private async Task<ChatSession?> OpenChatAsync(
        HttpClient http, string videoId, CancellationToken ct)
    {
        var html = await GetTextAsync(
            http,
            $"https://www.youtube.com/live_chat?is_popout=1&v={videoId}",
            ct,
            7,
            $"https://www.youtube.com/watch?v={videoId}");
        // Каталог смайлов (включая смайлы канала) лежит в HTML чата ещё до
        // первого опроса. Без него текстовые :код: так и остались бы текстом.
        AbsorbEmojisFromText(html);

        var key = Extract(html, "\"INNERTUBE_API_KEY\":\"", "\"") ?? InnertubeKey;
        var clientVersion =
            Extract(html, "\"INNERTUBE_CLIENT_VERSION\":\"", "\"") ??
            Extract(html, "\"clientVersion\":\"", "\"") ??
            DefaultClientVersion;
        var continuation = ExtractContinuationFromHtml(html);

        if (continuation.Length == 0)
        {
            var payload = JsonSerializer.Serialize(new
            {
                context = new
                {
                    client = new
                    {
                        clientName = "WEB",
                        clientVersion,
                        hl = "ru",
                        gl = "RU",
                    },
                },
                videoId,
            });
            var next = await PostJsonAsync(
                http,
                $"https://www.youtube.com/youtubei/v1/next?key={key}&prettyPrint=false",
                payload,
                clientVersion,
                ct,
                7);
            try
            {
                using var doc = JsonDocument.Parse(next);
                AbsorbEmojis(doc.RootElement);
                continuation = FindContinuation(doc.RootElement).token;
            }
            catch { /* чат закрыт или ответ изменился */ }
        }

        return continuation.Length > 0
            ? new ChatSession(key, clientVersion, continuation)
            : null;
    }

    private async Task<PollBatch?> PollAsync(
        HttpClient http,
        string key,
        string clientVersion,
        string continuation,
        bool emitMessages,
        Action<int>? onViewers,
        CancellationToken ct)
    {
        var payload = JsonSerializer.Serialize(new
        {
            context = new
            {
                client = new
                {
                    clientName = "WEB",
                    clientVersion,
                    hl = "ru",
                    gl = "RU",
                },
            },
            continuation,
        });

        var json = await PostJsonAsync(
            http,
            $"https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key={key}&prettyPrint=false",
            payload,
            clientVersion,
            ct,
            10);
        if (json.Length == 0) return null;

        /* Чат записи: если площадка отвечает «продолжением записи», эфир уже
           закончился. Такие сообщения в ленту не пускаем — иначе после
           завершения стрима туда вылилась бы вся его история. */
        if (json.Contains("liveChatReplayContinuationData", StringComparison.OrdinalIgnoreCase))
            return null;

        try
        {
            using var doc = JsonDocument.Parse(json);
            // Сначала каталог, потом сообщения: текстовый :код: в этой же
            // пачке уже сможет стать картинкой, в том числе смайлом канала.
            AbsorbEmojis(doc.RootElement);
            if (!doc.RootElement.TryGetProperty("continuationContents", out var cc) ||
                !cc.TryGetProperty("liveChatContinuation", out var liveChat))
                return null;

            /* Актуальное число зрителей приходит прямо с обновлениями чата
               (updateViewershipAction) — свежее и точнее, чем отдельный опрос:
               счётчик двигается по тем же данным, что видит страница эфира. */
            if (onViewers != null
                && TryFindYouTubeViewers(liveChat, out var chatViewers, out var stillLive)
                && stillLive)
                onViewers(chatViewers);

            if (emitMessages && liveChat.TryGetProperty("actions", out var actions) &&
                actions.ValueKind == JsonValueKind.Array)
            {
                foreach (var action in actions.EnumerateArray()) HandleYouTubeAction(action);
            }

            var next = FindContinuation(liveChat);
            return next.token.Length > 0
                ? new PollBatch(next.token, next.timeoutMs > 0 ? next.timeoutMs : 4_000)
                : null;
        }
        catch { return null; }
    }

    private void HandleYouTubeAction(JsonElement action)
    {
        if (action.TryGetProperty("addChatItemAction", out var add) &&
            add.TryGetProperty("item", out var item))
        {
            HandleYouTubeItem(item);
            return;
        }

        // replayChatItemAction намеренно игнорируется: подключаем только
        // liveChatContinuation, чтобы архивный чат не попал в текущую ленту.
    }

    private static (string token, int timeoutMs) FindContinuation(JsonElement el, int depth = 0)
    {
        if (depth > 20) return ("", 0);
        if (el.ValueKind == JsonValueKind.Object)
        {
            foreach (var name in new[]
            {
                "invalidationContinuationData",
                "timedContinuationData",
                "reloadContinuationData",
                /* Опрос обновлений эфира: каждый videoId получает только
                   собственное продолжение metadata, без общего кэша. */
                "updatedMetadataContinuationData",
            })
            {
                if (!el.TryGetProperty(name, out var data) || data.ValueKind != JsonValueKind.Object)
                    continue;
                if (!data.TryGetProperty("continuation", out var tokenEl) ||
                    tokenEl.ValueKind != JsonValueKind.String)
                    continue;
                var token = tokenEl.GetString() ?? "";
                var timeout = data.TryGetProperty("timeoutMs", out var timeoutEl) &&
                              timeoutEl.TryGetInt32(out var ms) ? ms : 4_000;
                if (token.Length > 0) return (token, timeout);
            }

            foreach (var prop in el.EnumerateObject())
            {
                var found = FindContinuation(prop.Value, depth + 1);
                if (found.token.Length > 0) return found;
            }
        }
        else if (el.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in el.EnumerateArray())
            {
                var found = FindContinuation(item, depth + 1);
                if (found.token.Length > 0) return found;
            }
        }
        return ("", 0);
    }

    private static string ExtractContinuationFromHtml(string html)
    {
        if (html.Length == 0 || html.Contains("liveChatReplay", StringComparison.OrdinalIgnoreCase)) return "";
        var patterns = new[]
        {
            @"""(?:invalidation|timed|reload)ContinuationData""\s*:\s*\{\s*""continuation""\s*:\s*""([^""]{20,})""",
            @"""continuation""\s*:\s*""([^""]{20,})""",
        };
        foreach (var pattern in patterns)
        {
            var match = Regex.Match(html, pattern, RegexOptions.IgnoreCase);
            if (!match.Success) continue;
            try
            {
                return JsonSerializer.Deserialize<string>($"\"{match.Groups[1].Value}\"") ?? "";
            }
            catch { return match.Groups[1].Value; }
        }
        return "";
    }

    /// Чат одного подтверждённого эфира. Если чат временно недоступен,
    /// переоткрываем его, пока отдельный metadata-polling не подтвердит конец.
    private async Task ChatLoopAsync(
        HttpClient http,
        LiveInfo live,
        LiveState state,
        Action<int> report,
        CancellationToken ct)
    {
        while (!ct.IsCancellationRequested && !state.Ended)
        {
            ChatSession? session;
            try { session = await OpenChatAsync(http, live.VideoId, ct); }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { return; }
            catch { session = null; }

            if (session == null)
            {
                if (!await DelayAsync(20_000, ct)) return;
                continue;
            }

            var continuation = session.Continuation;
            var misses = 0;
            var skipHistory = true;
            while (!ct.IsCancellationRequested && !state.Ended)
            {
                PollBatch? batch;
                try
                {
                    batch = await PollAsync(
                        http, session.Key, session.ClientVersion, continuation,
                        emitMessages: !skipHistory,
                        v => { if (!state.Ended) report(v); },
                        ct);
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested) { return; }
                catch { batch = null; }

                skipHistory = false;
                if (batch == null)
                {
                    if (++misses >= 3) break;
                    if (!await DelayAsync(2_500, ct)) return;
                    continue;
                }

                misses = 0;
                continuation = batch.Continuation;
                var waitMs = Math.Clamp(batch.TimeoutMs, 800, 4_000);
                if (!await DelayAsync(waitMs, ct)) return;
            }

            if (ct.IsCancellationRequested || state.Ended) return;
            // Сбой одного chat continuation не завершает второй эфир и не
            // отменяет его viewers-polling — просто открываем чат заново.
            if (!await DelayAsync(2_500, ct)) return;
        }
    }

    private async Task RefreshViewersAsync(
        HttpClient http,
        string videoId,
        string key,
        string clientVersion,
        LiveState state,
        Action<int> report,
        Action markEnded,
        CancellationToken ct)
    {
        var continuation = "";

        while (!ct.IsCancellationRequested && !state.Ended)
        {
            var nextDelayMs = Net.ViewerPollMs;
            // YouTube сам обновляет online через /updated_metadata. Повторный
            // GET watch-страницы был неверен: HTML кэшируется и часто содержит
            // накопленные просмотры записи, а не concurrent viewers.
            object payloadObject;
            if (continuation.Length > 0)
            {
                payloadObject = new
                {
                    context = new
                    {
                        client = new { clientName = "WEB", clientVersion, hl = "ru", gl = "RU" },
                    },
                    videoId,
                    continuation,
                };
            }
            else
            {
                payloadObject = new
                {
                    context = new
                    {
                        client = new { clientName = "WEB", clientVersion, hl = "ru", gl = "RU" },
                    },
                    videoId,
                };
            }

            var json = await PostJsonAsync(
                http,
                $"https://www.youtube.com/youtubei/v1/updated_metadata?key={key}&prettyPrint=false",
                JsonSerializer.Serialize(payloadObject),
                clientVersion,
                ct,
                7);

            if (json.Length > 0)
            {
                try
                {
                    using var doc = JsonDocument.Parse(json);
                    if (TryFindYouTubeViewers(doc.RootElement, out var viewers, out var isLive))
                    {
                        if (!isLive)
                        {
                            markEnded();
                            return;
                        }
                        // Ноль — допустимое значение для маленького эфира.
                        report(viewers);
                    }

                    var next = FindContinuation(doc.RootElement);
                    if (next.token.Length > 0)
                    {
                        continuation = next.token;
                        if (next.timeoutMs > 0)
                            nextDelayMs = Math.Clamp(next.timeoutMs, 3_000, Net.ViewerPollMs);
                    }
                }
                catch { /* формат ответа временно изменился — повторим */ }
            }

            if (!await DelayAsync(nextDelayMs, ct)) return;
        }
    }

    /// <summary>
    /// Находит updateViewershipAction → videoViewCountRenderer в ответе
    /// /updated_metadata. originalViewCount — приоритетное машинное поле;
    /// если его нет, извлекаем цифры из локализованного Text.
    /// </summary>
    private static bool TryFindYouTubeViewers(JsonElement el, out int viewers, out bool isLive, int depth = 0)
    {
        viewers = 0;
        isLive = true;
        if (depth > 24) return false;

        if (el.ValueKind == JsonValueKind.Object)
        {
            if (el.TryGetProperty("updateViewershipAction", out var action) &&
                action.ValueKind == JsonValueKind.Object)
            {
                var target = action.TryGetProperty("viewCount", out var vc) ? vc : action;
                isLive = !Net.TryFind(target, "isLive", out var liveEl) ||
                         liveEl.ValueKind != JsonValueKind.False;

                if (Net.TryFind(target, "originalViewCount", out var original))
                {
                    if (original.ValueKind == JsonValueKind.String &&
                        long.TryParse(original.GetString(), out var n))
                    {
                        viewers = n <= 0 ? 0 : n >= int.MaxValue ? int.MaxValue : (int)n;
                        return true;
                    }
                    if (original.ValueKind == JsonValueKind.Number && original.TryGetInt64(out var ni))
                    {
                        viewers = ni <= 0 ? 0 : ni >= int.MaxValue ? int.MaxValue : (int)ni;
                        return true;
                    }
                }

                foreach (var name in new[] { "unlabeledViewCountValue", "viewCount", "shortViewCount" })
                {
                    if (!Net.TryFind(target, name, out var textEl)) continue;
                    var parsed = ParseLocalizedCount(textEl.GetRawText());
                    if (parsed >= 0) { viewers = parsed; return true; }
                }
                return false;
            }

            foreach (var prop in el.EnumerateObject())
                if (TryFindYouTubeViewers(prop.Value, out viewers, out isLive, depth + 1)) return true;
        }
        else if (el.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in el.EnumerateArray())
                if (TryFindYouTubeViewers(item, out viewers, out isLive, depth + 1)) return true;
        }
        return false;
    }

    private static int ParseLocalizedCount(string raw)
    {
        // exact-числа: "1 234 watching now", "1,234 watching"
        var decoded = raw.Replace("\\u00a0", " ").Replace("\\u202f", " ");
        var match = Regex.Match(decoded, @"(?<![\d.,])([\d][\d\s,.]*)(?:\s*(тыс|тыс\.|k|млн|m))?",
            RegexOptions.IgnoreCase);
        if (!match.Success) return -1;

        var suffix = match.Groups[2].Value.ToLowerInvariant();
        var number = match.Groups[1].Value.Trim();
        if (suffix.Length == 0)
        {
            var digits = Regex.Replace(number, @"\D", "");
            return long.TryParse(digits, out var exact)
                ? exact <= 0 ? 0 : exact >= int.MaxValue ? int.MaxValue : (int)exact
                : -1;
        }

        number = number.Replace(" ", "").Replace(',', '.');
        if (!double.TryParse(number, System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out var compact)) return -1;
        var multiplier = suffix.StartsWith("м") || suffix == "m" ? 1_000_000d : 1_000d;
        return (int)Math.Clamp(Math.Round(compact * multiplier), 0, int.MaxValue);
    }

    private static async Task<string> GetTextAsync(
        HttpClient http,
        string url,
        CancellationToken ct,
        int timeoutSeconds,
        string? referer = null)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(timeoutSeconds));
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            req.Headers.Accept.ParseAdd("text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8");
            req.Headers.Referrer = new Uri(referer ?? "https://www.youtube.com/");
            using var res = await http.SendAsync(req, HttpCompletionOption.ResponseContentRead, timeout.Token);
            if (!res.IsSuccessStatusCode) return "";
            return await res.Content.ReadAsStringAsync(timeout.Token);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch { return ""; }
    }

    private static async Task<string> PostJsonAsync(
        HttpClient http,
        string url,
        string json,
        string clientVersion,
        CancellationToken ct,
        int timeoutSeconds)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(timeoutSeconds));
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json"),
            };
            req.Headers.Referrer = new Uri("https://www.youtube.com/");
            req.Headers.TryAddWithoutValidation("Origin", "https://www.youtube.com");
            req.Headers.TryAddWithoutValidation("X-YouTube-Client-Name", "1");
            req.Headers.TryAddWithoutValidation("X-YouTube-Client-Version", clientVersion);
            using var res = await http.SendAsync(req, HttpCompletionOption.ResponseContentRead, timeout.Token);
            if (!res.IsSuccessStatusCode) return "";
            return await res.Content.ReadAsStringAsync(timeout.Token);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch { return ""; }
    }

    private static async Task<bool> DelayAsync(int milliseconds, CancellationToken ct)
    {
        try { await Task.Delay(milliseconds, ct); return true; }
        catch (OperationCanceledException) { return false; }
    }

    private static (string user, string directVideoId) NormalizeTarget(string raw)
    {
        var value = (raw ?? "").Trim();
        var direct = Regex.Match(value, @"(?:youtu\.be/|[?&]v=)([\w-]{11})", RegexOptions.IgnoreCase);
        if (direct.Success) return (value, direct.Groups[1].Value);

        var channel = Regex.Match(
            value,
            @"youtube\.com/(?:@|channel/|user/|c/)?([^/?#]+)",
            RegexOptions.IgnoreCase);
        if (channel.Success) value = channel.Groups[1].Value;
        value = value.TrimStart('@').Split('/', '?', '&', '#')[0].Trim();
        return (value, "");
    }

    /// Обычные сообщения, memberships, Super Chat и подарочные подписки.
    /// <summary>
    /// Ключи сообщения: его номер у площадки и отдельно автор+время+текст.
    /// Проверяются оба: одно и то же сообщение в чатах широкого и
    /// вертикального эфиров идёт под разными номерами, но с тем же автором,
    /// временем и текстом. Ключ по содержимому требует время — без него
    /// повторный текст того же автора через час тоже считался бы дублем.
    /// </summary>
    private static string[] MessageKeys(JsonElement el, string text)
    {
        if (el.ValueKind != JsonValueKind.Object) return Array.Empty<string>();

        var keys = new List<string>(2);
        var id = el.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.String
            ? idEl.GetString() ?? "" : "";
        if (id.Length > 0) keys.Add("id:" + id);

        var author = el.TryGetProperty("authorExternalChannelId", out var aEl) && aEl.ValueKind == JsonValueKind.String
            ? aEl.GetString() ?? "" : "";
        var time = el.TryGetProperty("timestampUsec", out var tEl) && tEl.ValueKind == JsonValueKind.String
            ? tEl.GetString() ?? "" : "";
        if (time.Length > 0) keys.Add($"key:{author}|{time}|{text}");

        return keys.ToArray();
    }

    /// <summary>
    /// Уже видели это сообщение? Два эфира канала и повтор продолжения от
    /// площадки не должны давать две одинаковые строки в ленте.
    /// </summary>
    private bool AlreadySeen(JsonElement renderer, string text)
    {
        var keys = MessageKeys(renderer, text);
        if (keys.Length == 0) return false;

        lock (_seenGate)
        {
            foreach (var key in keys)
            {
                if (_seen.Contains(key))
                {
                    // Дубль: дописываем недостающие ключи, чтобы и другие его
                    // копии ловились, и возвращаем «уже видели».
                    foreach (var missing in keys)
                        if (_seen.Add(missing)) _seenOrder.Enqueue(missing);
                    while (_seenOrder.Count > SeenLimit)
                        _seen.Remove(_seenOrder.Dequeue());
                    return true;
                }
            }
            foreach (var key in keys)
            {
                _seen.Add(key);
                _seenOrder.Enqueue(key);
            }
            // Держим только последние ключи: память не растёт бесконечно.
            while (_seenOrder.Count > SeenLimit)
                _seen.Remove(_seenOrder.Dequeue());
            return false;
        }
    }

    private void HandleYouTubeItem(JsonElement item)
    {
        if (item.TryGetProperty("liveChatTextMessageRenderer", out var message))
        {
            var text = ParseYouTubeRuns(message, "message");
            if (text.Length == 0) return;
            if (AlreadySeen(message, text)) return;
            Emit(ExtractAuthor(message), text, "chat", ExtractBadges(message));
            return;
        }

        if (item.TryGetProperty("liveChatMembershipItemRenderer", out var member))
        {
            var header = ParseYouTubeRuns(member, "headerSubtext");
            if (header.Length == 0) header = "оформил спонсорскую подписку";
            var comment = ParseYouTubeRuns(member, "message");
            if (AlreadySeen(member, comment)) return;
            Emit(
                ExtractAuthor(member),
                comment.Length == 0 ? header : $"{header}: {comment}",
                "sub",
                ExtractBadges(member, "sub"));
            return;
        }

        if (item.TryGetProperty("liveChatPaidMessageRenderer", out var paid))
        {
            var text = ParseYouTubeRuns(paid, "message");
            var amountText = paid.TryGetProperty("purchaseAmountText", out var amountEl) &&
                             amountEl.TryGetProperty("simpleText", out var simple)
                ? simple.GetString() ?? ""
                : "";
            var (amount, currency) = ParseAmountAndCurrency(amountText);
            if (AlreadySeen(paid, text)) return;
            Emit(
                ExtractAuthor(paid),
                text.Length == 0 ? $"Super Chat {amountText}" : text,
                "donate",
                ExtractBadges(paid),
                amount,
                currency);
            return;
        }

        if (item.TryGetProperty("liveChatPaidStickerRenderer", out var sticker))
        {
            var amountText = sticker.TryGetProperty("purchaseAmountText", out var amountEl) &&
                             amountEl.TryGetProperty("simpleText", out var simple)
                ? simple.GetString() ?? ""
                : "";
            var (amount, currency) = ParseAmountAndCurrency(amountText);
            if (AlreadySeen(sticker, amountText)) return;
            // Платный стикер — это картинка: раньше в ленту уходила только
            // строка с суммой, теперь к ней прикладывается сам стикер.
            var stickerImage = ExtractStickerImage(sticker);
            var stickerLabel = $"Super Sticker {amountText}".Trim();
            var stickerText = stickerImage.Length > 0
                ? $"{Net.Emote(stickerImage, "sticker")} {stickerLabel}".Trim()
                : stickerLabel;
            Emit(
                ExtractAuthor(sticker),
                stickerText,
                "donate",
                ExtractBadges(sticker),
                amount,
                currency);
            return;
        }

        if (item.TryGetProperty("liveChatSponsorshipsGiftPurchaseAnnouncementRenderer", out var gift) &&
            gift.TryGetProperty("header", out var giftHeaderContainer) &&
            giftHeaderContainer.TryGetProperty("liveChatSponsorshipsHeaderRenderer", out var giftHeader))
        {
            var text = ParseYouTubeRuns(giftHeader, "primaryText");
            if (AlreadySeen(gift, text)) return;
            Emit(
                ExtractAuthor(giftHeader),
                text.Length == 0 ? "подарил спонсорские подписки" : text,
                "gift",
                new[] { "sub" });
            return;
        }

        if (item.TryGetProperty("liveChatSponsorshipsGiftRedemptionAnnouncementRenderer", out var redeem))
        {
            var text = ParseYouTubeRuns(redeem, "message");
            if (AlreadySeen(redeem, text)) return;
            Emit(
                ExtractAuthor(redeem),
                text.Length == 0 ? "получил подарочную спонсорскую подписку" : text,
                "sub");
        }
    }

    private void Emit(
        string author,
        string text,
        string kind,
        string[]? badges = null,
        double? amount = null,
        string? currency = null)
    {
        _emit(new ChatEvent
        {
            platform = "youtube",
            channel = _user,
            author = author,
            text = text,
            kind = kind,
            badges = badges is { Length: > 0 } ? badges : null,
            amount = amount,
            currency = currency,
        });
    }

    private static string ExtractAuthor(JsonElement el)
    {
        if (!el.TryGetProperty("authorName", out var author)) return "зритель";
        if (author.TryGetProperty("simpleText", out var simple))
            return simple.GetString() ?? "зритель";
        if (author.TryGetProperty("runs", out var runs) &&
            runs.ValueKind == JsonValueKind.Array && runs.GetArrayLength() > 0 &&
            runs[0].TryGetProperty("text", out var text))
            return text.GetString() ?? "зритель";
        return "зритель";
    }

    private static string[] ExtractBadges(JsonElement el, string fallback = "")
    {
        var list = new List<string>();
        if (el.TryGetProperty("authorBadges", out var badges))
        {
            var raw = badges.GetRawText();
            if (raw.Contains("moderator", StringComparison.OrdinalIgnoreCase) ||
                raw.Contains("owner", StringComparison.OrdinalIgnoreCase)) list.Add("mod");
            if (raw.Contains("member", StringComparison.OrdinalIgnoreCase)) list.Add("sub");
            if (raw.Contains("verified", StringComparison.OrdinalIgnoreCase)) list.Add("vip");
        }
        if (list.Count == 0 && fallback.Length > 0) list.Add(fallback);
        return list.ToArray();
    }

    /// <summary>
    /// Текст сообщения. Если рядом с текстом есть объект смайла — берём его
    /// картинку, а не подпись :код:. simpleText не перебивает runs: в нём
    /// часто только текстовый код, а картинка лежит в runs.
    /// </summary>
    private string ParseYouTubeRuns(JsonElement parent, string property)
    {
        if (!parent.TryGetProperty(property, out var value)) return "";

        var hasRuns = value.TryGetProperty("runs", out var runs) &&
                      runs.ValueKind == JsonValueKind.Array &&
                      runs.GetArrayLength() > 0;
        if (!hasRuns)
        {
            if (value.TryGetProperty("simpleText", out var simpleOnly))
                return ApplyShortcuts(simpleOnly.GetString() ?? "");
            return "";
        }

        var result = new StringBuilder();
        foreach (var run in runs.EnumerateArray())
        {
            if (run.TryGetProperty("emoji", out var emoji) && emoji.ValueKind == JsonValueKind.Object)
            {
                RememberEmojiFromObject(emoji);
                var shortcut = FirstShortcut(emoji);
                var imageUrl = ExtractEmojiImage(emoji);
                if (imageUrl.Length == 0 && TryResolveEmoji(shortcut, out var known))
                    imageUrl = known;

                if (imageUrl.Length > 0)
                {
                    result.Append(Net.Emote(imageUrl, YouTubeEmoteName(emoji, shortcut)));
                    continue;
                }

                var custom = emoji.TryGetProperty("isCustomEmoji", out var customEl) &&
                             customEl.ValueKind == JsonValueKind.True;
                var emojiId = emoji.TryGetProperty("emojiId", out var idEl) && idEl.ValueKind == JsonValueKind.String
                    ? idEl.GetString() ?? ""
                    : "";
                // Короткий значок Юникода площадка иногда кладёт в emojiId.
                // Длинный идентификатор канала картинкой не является — не пишем его текстом.
                if (!custom && emojiId.Length is > 0 and <= 16 &&
                    emojiId.IndexOf(':') < 0 && emojiId.IndexOf('/') < 0)
                {
                    result.Append(emojiId);
                    continue;
                }
                if (shortcut.Length > 0)
                {
                    result.Append(shortcut.Contains(':') ? shortcut : ":" + shortcut.Trim(':') + ":");
                    continue;
                }
                if (run.TryGetProperty("text", out var emojiText))
                    result.Append(ApplyShortcuts(emojiText.GetString() ?? ""));
                continue;
            }

            if (run.TryGetProperty("text", out var text))
                result.Append(ApplyShortcuts(text.GetString() ?? ""));
        }
        return result.ToString();
    }

    /// <summary>
    /// Картинка именно этого смайла: самая крупная https-миниатюра его
    /// собственного набора. Общий поиск по дереву брать нельзя — первым
    /// находится чужой адрес, и смайл остаётся текстом или чужой картинкой.
    /// </summary>
    private static string ExtractEmojiImage(JsonElement emoji)
    {
        if (emoji.ValueKind != JsonValueKind.Object) return "";

        if (emoji.TryGetProperty("image", out var image))
        {
            if (image.ValueKind == JsonValueKind.String)
            {
                var direct = NormalizeImageUrl(image.GetString() ?? "");
                if (direct.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) return direct;
            }
            var fromImage = LargestThumbnail(image);
            if (fromImage.Length > 0) return fromImage;
        }

        return LargestThumbnail(emoji);
    }

    private static string LargestThumbnail(JsonElement owner)
    {
        if (owner.ValueKind != JsonValueKind.Object) return "";
        if (!owner.TryGetProperty("thumbnails", out var thumbs) || thumbs.ValueKind != JsonValueKind.Array)
            return "";

        var bestUrl = "";
        var bestSize = -1;
        foreach (var thumb in thumbs.EnumerateArray())
        {
            if (thumb.ValueKind != JsonValueKind.Object) continue;
            if (!thumb.TryGetProperty("url", out var urlEl) || urlEl.ValueKind != JsonValueKind.String)
                continue;
            var url = NormalizeImageUrl(urlEl.GetString() ?? "");
            if (!url.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) continue;

            var size = 0;
            if (thumb.TryGetProperty("width", out var w) && w.TryGetInt32(out var wi)) size = Math.Max(size, wi);
            if (thumb.TryGetProperty("height", out var h) && h.TryGetInt32(out var hi)) size = Math.Max(size, hi);
            // При равном размере берём последнюю: у площадки она обычно крупнее.
            if (bestUrl.Length == 0 || size >= bestSize)
            {
                bestSize = size;
                bestUrl = url;
            }
        }
        return bestUrl;
    }

    private static string FirstShortcut(JsonElement emoji)
    {
        if (!emoji.TryGetProperty("shortcuts", out var shortcuts) ||
            shortcuts.ValueKind != JsonValueKind.Array || shortcuts.GetArrayLength() == 0 ||
            shortcuts[0].ValueKind != JsonValueKind.String)
            return "";
        return shortcuts[0].GetString() ?? "";
    }

    /// <summary>
    /// Запоминает смайл из объекта сообщения, чтобы следующий текстовый :код:
    /// (в том числе смайл канала) тоже стал картинкой.
    /// </summary>
    private void RememberEmojiFromObject(JsonElement emoji)
    {
        if (emoji.ValueKind != JsonValueKind.Object) return;
        if (!emoji.TryGetProperty("shortcuts", out var shortcuts) || shortcuts.ValueKind != JsonValueKind.Array)
            return;
        var url = ExtractEmojiImage(emoji);
        if (url.Length == 0) return;
        foreach (var item in shortcuts.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String) continue;
            RememberEmoji(item.GetString(), url, trusted: true);
        }
    }

    /// <summary>
    /// Обходит ответ чата и забирает каталог смайлов до разбора сообщений.
    /// </summary>
    private void AbsorbEmojis(JsonElement el, int depth = 0)
    {
        try
        {
            if (depth > 24) return;
            if (el.ValueKind == JsonValueKind.Object)
            {
                RememberEmojiFromObject(el);
                foreach (var prop in el.EnumerateObject())
                    AbsorbEmojis(prop.Value, depth + 1);
            }
            else if (el.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in el.EnumerateArray())
                    AbsorbEmojis(item, depth + 1);
            }
        }
        catch { /* каталог необязателен: известные смайлы всё равно рисуются */ }
    }

    /// <summary>
    /// Каталог из HTML чата: и обычный JSON, и тот же JSON, экранированный
    /// внутри страницы. Плюс картинки панели с подписью alt=":код:".
    /// </summary>
    private void AbsorbEmojisFromText(string? source)
    {
        if (string.IsNullOrEmpty(source)) return;
        if (source.IndexOf("shortcuts", StringComparison.OrdinalIgnoreCase) < 0 &&
            source.IndexOf("alt=", StringComparison.OrdinalIgnoreCase) < 0)
            return;
        try
        {
            var text = source
                .Replace("\\\"", "\"", StringComparison.Ordinal)
                .Replace("\\/", "/", StringComparison.Ordinal)
                .Replace("\\u0026", "&", StringComparison.OrdinalIgnoreCase)
                .Replace("\\u003d", "=", StringComparison.OrdinalIgnoreCase)
                .Replace("\\u003a", ":", StringComparison.OrdinalIgnoreCase)
                .Replace("\\u0022", "\"", StringComparison.OrdinalIgnoreCase)
                .Replace("&quot;", "\"", StringComparison.OrdinalIgnoreCase)
                .Replace("&amp;", "&", StringComparison.OrdinalIgnoreCase);
            ScanShortcuts(text);
            ScanAltImages(text);
        }
        catch { /* без каталога остаются глобальные смайлы */ }
    }

    private void ScanShortcuts(string text)
    {
        var search = 0;
        while (search < text.Length)
        {
            var at = text.IndexOf("shortcuts", search, StringComparison.OrdinalIgnoreCase);
            if (at < 0) break;
            search = at + 9;

            var bracket = text.IndexOf('[', at);
            if (bracket < 0 || bracket - at > 40) continue;
            var close = text.IndexOf(']', bracket + 1);
            if (close < 0 || close - bracket > 500) continue;

            var limit = Math.Min(text.Length, close + 900);
            var nextEmoji = text.IndexOf("emojiId", close + 1, StringComparison.OrdinalIgnoreCase);
            if (nextEmoji > close && nextEmoji < limit) limit = nextEmoji;
            var nextShort = text.IndexOf("shortcuts", close + 1, StringComparison.OrdinalIgnoreCase);
            if (nextShort > close && nextShort < limit) limit = nextShort;
            var after = text.Substring(close, limit - close);
            var urlMatch = EmojiCdnUrl.Match(after);
            string rawUrl;
            if (urlMatch.Success)
                rawUrl = urlMatch.Value;
            else
            {
                // Картинка иногда стоит перед списком кодов, в том же объекте.
                var back = Math.Max(0, bracket - 700);
                var prev = text.LastIndexOf("emojiId", bracket, bracket - back, StringComparison.OrdinalIgnoreCase);
                if (prev >= 0) back = Math.Min(bracket, prev);
                rawUrl = "";
                foreach (Match earlier in EmojiCdnUrl.Matches(text.Substring(back, bracket - back)))
                    rawUrl = earlier.Value;
                if (rawUrl.Length == 0) continue;
            }

            var url = NormalizeImageUrl(rawUrl.TrimEnd(',', '\\', '}', ';'));
            if (url.Length == 0) continue;
            var array = text.Substring(bracket, close - bracket + 1);
            foreach (Match match in ShortcutInText.Matches(array))
                RememberEmoji(match.Groups[1].Value, url, trusted: false);
        }
    }

    private void ScanAltImages(string text)
    {
        foreach (Match match in AltThenSrc.Matches(text))
            RememberEmoji(match.Groups[1].Value, match.Groups[2].Value, trusted: false);
        foreach (Match match in SrcThenAlt.Matches(text))
            RememberEmoji(match.Groups[2].Value, match.Groups[1].Value, trusted: false);
    }

    /// <summary>
    /// Запоминает код смайла. Сомнительный адрес из HTML не подменяет уже
    /// известную картинку глобального смайла: рядом часто лежит фото автора
    /// с того же сайта картинок.
    /// </summary>
    private void RememberEmoji(string? shortcut, string? url, bool trusted)
    {
        var key = (shortcut ?? "").Trim().Trim(':').Trim();
        var normalized = NormalizeImageUrl(url ?? "");
        if (key.Length is 0 or > 80 || normalized.Length == 0) return;
        if (!IsEmojiCdn(normalized)) return;
        if (key.IndexOf('|') >= 0 || key.IndexOf('[') >= 0 || key.IndexOf(']') >= 0) return;

        if (!trusted && YouTubeEmojis.TryGet(key, out var known) && !SameImage(known, normalized))
            return;

        lock (_emojiGate)
        {
            if (_emojiByShortcut.Count >= EmojiCatalogLimit && !_emojiByShortcut.ContainsKey(key))
                return;
            _emojiByShortcut[key] = normalized;
        }
    }

    private bool TryResolveEmoji(string? shortcut, out string url)
    {
        url = "";
        var key = (shortcut ?? "").Trim().Trim(':').Trim();
        if (key.Length == 0) return false;
        lock (_emojiGate)
        {
            if (_emojiByShortcut.TryGetValue(key, out var cached) && !string.IsNullOrEmpty(cached))
            {
                url = cached;
                return true;
            }
        }
        return YouTubeEmojis.TryGet(key, out url);
    }

    /// <summary>
    /// Подставляет картинки вместо :код: только в обычном тексте.
    /// Уже готовый токен [[e|адрес|имя]] не трогает — иначе сломалась бы ссылка.
    /// </summary>
    private string ApplyShortcuts(string text)
    {
        if (string.IsNullOrEmpty(text) || text.IndexOf(':') < 0) return text ?? "";

        var sb = new StringBuilder(text.Length + 16);
        var i = 0;
        while (i < text.Length)
        {
            if (text.AsSpan(i).StartsWith("[[e|"))
            {
                var end = text.IndexOf("]]", i + 4, StringComparison.Ordinal);
                if (end > 0)
                {
                    sb.Append(text, i, end + 2 - i);
                    i = end + 2;
                    continue;
                }
            }

            if (text[i] == ':')
            {
                var end = text.IndexOf(':', i + 1);
                if (end > i + 1 && end - i <= 82)
                {
                    var code = text.Substring(i + 1, end - i - 1);
                    if (IsShortcutCode(code) && TryResolveEmoji(code, out var url))
                    {
                        sb.Append(Net.Emote(url, SanitizeEmoteName(code)));
                        i = end + 1;
                        continue;
                    }
                }
            }

            sb.Append(text[i]);
            i++;
        }
        return sb.ToString();
    }

    private static bool IsShortcutCode(string code)
    {
        if (code.Length is 0 or > 80) return false;
        foreach (var ch in code)
        {
            if (char.IsWhiteSpace(ch) || ch is ':' or '|' or '[' or ']' or '"' or '\\' or '<' or '>' or '/' or '?')
                return false;
        }
        return true;
    }

    private static bool IsEmojiCdn(string url) =>
        url.Contains("ggpht.com", StringComparison.OrdinalIgnoreCase) ||
        url.Contains("googleusercontent.com", StringComparison.OrdinalIgnoreCase) ||
        url.Contains("ytimg.com", StringComparison.OrdinalIgnoreCase);

    private static bool SameImage(string a, string b)
    {
        static string Id(string u)
        {
            string[] markers = { "ggpht.com/", "googleusercontent.com/", "ytimg.com/" };
            foreach (var marker in markers)
            {
                var i = u.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
                if (i < 0) continue;
                var rest = u[(i + marker.Length)..];
                var cut = rest.IndexOfAny(new[] { '=', '?', '"', ' ' });
                return cut > 0 ? rest[..cut] : rest;
            }
            return u;
        }
        return string.Equals(Id(a), Id(b), StringComparison.Ordinal);
    }

    private static string SanitizeEmoteName(string name)
    {
        name = (name ?? "").Trim().Trim(':').Trim();
        name = name.Replace("|", " ").Replace("[", "(").Replace("]", ")").Trim();
        if (name.Length == 0) name = "emote";
        return name.Length > 48 ? name[..48].Trim() : name;
    }

    /// <summary>
    /// Картинка платного стикера: лежит строго в его собственном поле.
    /// Общий поиск по дереву брать нельзя — первым находится фото автора.
    /// </summary>
    private static string ExtractStickerImage(JsonElement paidSticker)
    {
        if (paidSticker.TryGetProperty("sticker", out var sticker) &&
            sticker.TryGetProperty("thumbnails", out var thumbs) &&
            thumbs.ValueKind == JsonValueKind.Array && thumbs.GetArrayLength() > 0)
        {
            var raw = Net.FindString(thumbs[thumbs.GetArrayLength() - 1], "url") ?? "";
            return NormalizeImageUrl(raw);
        }
        return "";
    }

    /// <summary>
    /// Полный адрес картинки: страница чата грузит только обычные ссылки.
    /// </summary>
    private static string NormalizeImageUrl(string url)
    {
        url = (url ?? "").Trim();
        if (url.StartsWith("//", StringComparison.Ordinal)) return "https:" + url;
        if (url.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ||
            url.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
            return url;
        return "";
    }

    /// <summary>
    /// Подпись смайла для картинки: короткий код, понятное название или
    /// подпись картинки. Пустой не возвращается — иначе токен ломался бы,
    /// а в ленте вместо смайла оставался текст.
    /// </summary>
    private static string YouTubeEmoteName(JsonElement emoji, string shortcut)
    {
        var name = shortcut.Trim().Trim(':').Trim();
        if (name.Length == 0 &&
            emoji.TryGetProperty("searchTerms", out var terms) &&
            terms.ValueKind == JsonValueKind.Array && terms.GetArrayLength() > 0)
            name = terms[0].GetString()?.Trim() ?? "";
        if (name.Length == 0)
            name = Net.FindString(emoji, "label") ?? "";
        return SanitizeEmoteName(name);
    }

    private static (double? amount, string currency) ParseAmountAndCurrency(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return (null, "₽");
        var match = Regex.Match(text, @"([\d\s.,]+)");
        double? amount = null;
        if (match.Success)
        {
            var number = match.Groups[1].Value
                .Replace(" ", "")
                .Replace(" ", "")
                .Replace(',', '.');
            if (double.TryParse(
                number,
                System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture,
                out var parsed))
                amount = parsed;
        }
        var currency = text.Contains('$') ? "$" :
                       text.Contains('€') ? "€" :
                       text.Contains('£') ? "£" : "₽";
        return (amount, currency);
    }

    private static string? Extract(string source, string from, string to)
    {
        var start = source.IndexOf(from, StringComparison.Ordinal);
        if (start < 0) return null;
        start += from.Length;
        var end = source.IndexOf(to, start, StringComparison.Ordinal);
        return end < 0 ? null : source[start..end];
    }

    public void Dispose() { }
}
