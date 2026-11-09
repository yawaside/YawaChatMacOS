using System.Text.Json;

namespace YawaChat;

/// <summary>
/// Проверка новой версии (задача 1.5): раз за запуск, в фоне и ПОСЛЕ старта
/// интерфейса, спрашиваем у GitHub самый свежий релиз. Если он новее текущей
/// версии — сообщаем интерфейсу (уведомление «Доступна версия X — скачать»).
///
/// Это НЕ телеметрия: один запрос к публичному списку релизов, никаких
/// пользовательских данных, и без ответа сети приложение работает ровно так
/// же — проверка просто тихо не происходит.
/// </summary>
internal static class VersionCheck
{
    private const string LatestReleaseUrl =
        "https://api.github.com/repos/yawaside/YawaChatHub/releases/latest";

    /// <summary>
    /// Свежий релиз: версия (без «v») и куда скачивать. Ссылка — прямой файл
    /// приложения, если среди вложений есть .exe; иначе страница релиза.
    /// Null — сеть недоступна, ответ не распознан или релизов нет.
    /// </summary>
    public static async Task<(string Version, string DownloadUrl)?> GetLatestAsync()
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };
            http.DefaultRequestHeaders.UserAgent.ParseAdd("YawaChat");
            using var response = await http.GetAsync(
                LatestReleaseUrl, HttpCompletionOption.ResponseHeadersRead);
            if (!response.IsSuccessStatusCode) return null;

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStreamAsync());
            var root = doc.RootElement;
            if (!root.TryGetProperty("tag_name", out var tag)) return null;

            var version = (tag.GetString() ?? "").TrimStart('v', 'V');
            if (version.Length == 0) return null;

            var download =
                (root.TryGetProperty("url", out var page) ? page.GetString() : null) ?? "";
            if (root.TryGetProperty("assets", out var assets)
                && assets.ValueKind == JsonValueKind.Array)
            {
                foreach (var a in assets.EnumerateArray())
                {
                    var name = (a.TryGetProperty("name", out var n) ? n.GetString() : null) ?? "";
                    if (name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
                        && a.TryGetProperty("browser_download_url", out var dl)
                        && dl.GetString() is { Length: > 0 } url)
                    {
                        download = url;
                        break;
                    }
                }
            }

            return (version, download);
        }
        catch { /* без сети / чужой ответ — проверка просто не состоялась */ }
        return null;
    }

    /// <summary>
    /// Сравнение версий major.minor.patch: &gt;0 — a новее b, 0 — равны.
    /// Нечитаемые фрагменты считаем нулями: проверка лучше молча пропустить,
    /// чем сообщить о «новом» релизе с не распознанным номером.
    /// </summary>
    public static int Compare(string a, string b)
    {
        int[] Parse(string v) =>
            v.Split('.')
                .Select(p => int.TryParse(p, out var n) ? n : 0)
                .Take(3)
                .ToArray();

        var pa = Parse(a);
        var pb = Parse(b);
        for (var i = 0; i < 3; i++)
        {
            var x = i < pa.Length ? pa[i] : 0;
            var y = i < pb.Length ? pb[i] : 0;
            if (x != y) return x.CompareTo(y);
        }
        return 0;
    }
}
