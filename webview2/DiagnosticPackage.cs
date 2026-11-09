using System.IO.Compression;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace YawaChat;

/// <summary>Экспортирует только метаданные событий, никогда не копирует строки
/// журналов целиком: свободный текст ошибок может содержать пароль или URL,
/// даже если маскирование журнала не распознало новый формат площадки.</summary>
internal static class DiagnosticPackage
{
    private static readonly Regex Line = new(
        @"^(?<time>\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z) \[(?<level>DEBUG|INFO|WARNING|ERROR|CRITICAL)\] \[[^\]]*\] ",
        RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
    private static readonly string[] Files = { "app.log", "bot.log", "moderation.log", "oauth.log", "crash.log", "tiktok.log" };
    private static readonly HashSet<string> Platforms = new(StringComparer.Ordinal)
    { "twitch", "youtube", "vkplay", "kick", "tiktok", "rutube", "boosty", "donationalerts", "donatepay" };
    private static readonly HashSet<string> States = new(StringComparer.Ordinal)
    { "online", "connected", "offline", "connecting", "error" };

    internal static void Create(string destination, string logsDir, string version,
        IEnumerable<(string platform, string status)> channels)
    {
        var channelCounts = channels.Where(c => Platforms.Contains(c.platform) && States.Contains(c.status))
            .GroupBy(c => (c.platform, c.status))
            .OrderBy(g => g.Key.platform).ThenBy(g => g.Key.status)
            .Select(g => new { platform = g.Key.platform, status = g.Key.status, count = g.Count() }).ToArray();
        // Запись во временный файл: неполный архив не выдаём за готовый отчёт.
        var temp = destination + ".tmp";
        try
        {
            using (var archive = ZipFile.Open(temp, ZipArchiveMode.Create))
            {
                var info = archive.CreateEntry("summary.json");
                using (var writer = new StreamWriter(info.Open(), new UTF8Encoding(false)))
                    writer.Write(JsonSerializer.Serialize(new {
                        version, createdUtc = DateTimeOffset.UtcNow, channels = channelCounts,
                        note = "Личные данные, имена каналов и тексты ошибок не включены. События содержат только время, уровень и категорию журнала."
                    }, new JsonSerializerOptions { WriteIndented = true }));

                var events = archive.CreateEntry("events.tsv");
                using (var writer = new StreamWriter(events.Open(), new UTF8Encoding(false)))
                {
                    writer.WriteLine("utc\tlevel\tcategory");
                    foreach (var name in Files)
                        for (var copy = 2; copy >= 0; copy--)
                        {
                            var path = Path.Combine(logsDir, name + (copy == 0 ? "" : "." + copy));
                            try
                            {
                                if (!File.Exists(path) || new FileInfo(path).Length > 1_048_576) continue;
                                // Даже в файлах с неверной кодировкой не переносим произвольный текст.
                                foreach (var line in File.ReadLines(path).Take(20_000))
                                {
                                    var match = Line.Match(line);
                                    if (match.Success)
                                        writer.WriteLine($"{match.Groups["time"].Value}\t{match.Groups["level"].Value}\t{name}");
                                }
                            }
                            catch (IOException) { /* журнал мог повернуться во время экспорта */ }
                            catch (UnauthorizedAccessException) { /* недоступный журнал пропускаем */ }
                            catch (RegexMatchTimeoutException) { /* повреждённый журнал пропускаем */ }
                        }
                }
            }
            File.Move(temp, destination, overwrite: true);
        }
        finally { try { if (File.Exists(temp)) File.Delete(temp); } catch { } }
    }
}
