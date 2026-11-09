using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace YawaChat;

internal enum LogFile { App, Bot, Moderation, OAuth, Crash, TikTok }
internal enum LogLevel { Debug, Info, Warning, Error, Critical }

/// <summary>
/// Все журналы хоста лежат в одной папке: %LOCALAPPDATA%\YawaChat\logs.
/// Отдельные файлы нужны для подробностей OAuth, бота, модерации и TikTok;
/// формат, редактирование секретов и ограничение размера у них общие.
/// Логи не являются хранилищем настроек и никогда не отправляются в сеть.
/// </summary>
internal static class AppLog
{
    internal static readonly string DirectoryPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "YawaChat", "logs");

    // 1 МБ на текущий файл + две копии: не более 3 МБ на категорию.
    private static readonly RotatingLogWriter Writer = new(DirectoryPath, minLevel: ReadLevel());

    internal static string PathFor(LogFile file) => Writer.PathFor(file);

    internal static bool Write(LogFile file, LogLevel level, string source, string message) =>
        Writer.Write(file, level, source, message);

    internal static bool Info(string source, string message) => Write(LogFile.App, LogLevel.Info, source, message);
    internal static bool Warning(string source, string message) => Write(LogFile.App, LogLevel.Warning, source, message);
    internal static bool Error(string source, string message) => Write(LogFile.App, LogLevel.Error, source, message);
    internal static bool Debug(string source, string message) => Write(LogFile.App, LogLevel.Debug, source, message);

    private static LogLevel ReadLevel()
    {
        var setting = Environment.GetEnvironmentVariable("YAWACHAT_LOG_LEVEL");
        return Enum.TryParse<LogLevel>(setting, ignoreCase: true, out var level)
            && Enum.IsDefined(level) ? level : LogLevel.Info;
    }
}

/// <summary>
/// Синхронная запись под одной блокировкой: коннекторы работают параллельно,
/// а запись и ротация не должны мешать друг другу. Экземпляр можно создать с
/// маленьким лимитом и отдельным каталогом для теста без запуска Windows UI.
/// Ошибка диска никогда не должна останавливать эфир.
/// </summary>
internal sealed class RotatingLogWriter
{
    private const int MaxMessageChars = 2_000;
    private readonly string _directory;
    private readonly int _maxBytes;
    private readonly int _backups;
    private readonly LogLevel _minLevel;
    private readonly object _gate = new();

    private static readonly Regex Url = new(@"\b(?:https?|wss?)://[^\s<>\[\]\(\)""']+",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
    private static readonly Regex Secret = new(
        @"\b(?:access[_-]?token|refresh[_-]?token|device[_-]?code|user[_-]?code|client[_-]?secret|api[_-]?key|password|passwd|authorization|cookie|secret|token|signature|oauth)\b\s*[""']?\s*[:=]\s*(?:""[^""]*""|'[^']*'|[^\s,;&\}\]]+)",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
    private static readonly Regex AuthHeader = new(@"\b(?:Bearer|OAuth|Basic)\s+[^\s,;]+",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));

    internal RotatingLogWriter(string directory, int maxBytes = 1_048_576, int backups = 2,
        LogLevel minLevel = LogLevel.Info)
    {
        if (maxBytes < 256) throw new ArgumentOutOfRangeException(nameof(maxBytes));
        if (backups is < 0 or > 10) throw new ArgumentOutOfRangeException(nameof(backups));
        _directory = directory;
        _maxBytes = maxBytes;
        _backups = backups;
        _minLevel = minLevel;
    }

    internal string PathFor(LogFile file) => Path.Combine(_directory, file switch
    {
        LogFile.App => "app.log",
        LogFile.Bot => "bot.log",
        LogFile.Moderation => "moderation.log",
        LogFile.OAuth => "oauth.log",
        LogFile.Crash => "crash.log",
        LogFile.TikTok => "tiktok.log",
        _ => throw new ArgumentOutOfRangeException(nameof(file)),
    });

    internal bool Write(LogFile file, LogLevel level, string source, string message)
    {
        if (level < _minLevel) return true;
        try
        {
            var path = PathFor(file);
            var line = Format(level, source, message);
            lock (_gate)
            {
                Directory.CreateDirectory(_directory);
                long size = File.Exists(path) ? new FileInfo(path).Length : 0;
                // Старый/повреждённый файл не переносим в копии без лимита.
                if (size > _maxBytes) { File.Delete(path); size = 0; }
                if (size + line.Length > _maxBytes) Rotate(path);
                using var stream = new FileStream(path, FileMode.Append, FileAccess.Write,
                    FileShare.ReadWrite | FileShare.Delete);
                stream.Write(line);
            }
            return true;
        }
        catch
        {
            // Запись журналов не должна ломать подключение или окно ошибки.
            return false;
        }
    }

    private void Rotate(string path)
    {
        for (var i = _backups; i >= 1; i--)
        {
            var from = i == 1 ? path : $"{path}.{i - 1}";
            var to = $"{path}.{i}";
            if (File.Exists(to)) File.Delete(to);
            if (File.Exists(from))
            {
                if (new FileInfo(from).Length > _maxBytes) File.Delete(from);
                else File.Move(from, to);
            }
        }
        if (_backups == 0 && File.Exists(path)) File.Delete(path);
    }

    private byte[] Format(LogLevel level, string source, string message)
    {
        var date = DateTimeOffset.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
        var label = Clean(source, 48);
        var prefix = $"{date} [{level.ToString().ToUpperInvariant()}] [{label}] ";
        var text = Clean(message, MaxMessageChars);
        var suffix = Environment.NewLine;
        var budget = _maxBytes - Encoding.UTF8.GetByteCount(prefix + suffix);
        if (Encoding.UTF8.GetByteCount(text) > budget)
        {
            // Бинарный поиск по UTF-8: даже одно очень длинное сообщение не
            // способно превысить лимит файла, в том числе с Unicode.
            var low = 0;
            var high = text.Length;
            while (low < high)
            {
                var mid = (low + high + 1) / 2;
                if (Encoding.UTF8.GetByteCount(text.AsSpan(0, mid)) <= budget - 3) low = mid;
                else high = mid - 1;
            }
            text = text[..low] + "…";
        }
        return Encoding.UTF8.GetBytes(prefix + text + suffix);
    }

    private static string Clean(string? text, int maxChars)
    {
        // Сначала ограничиваем произвольный ввод (ошибка сервера/моста), потом
        // вырезаем URL целиком: в query, userinfo и даже path бывают секреты.
        text = text is { Length: > 0 } ? text[..Math.Min(text.Length, maxChars * 4)] : "";
        try
        {
            text = Url.Replace(text, "[адрес]");
            text = AuthHeader.Replace(text, "[скрыто]");
            text = Secret.Replace(text, m =>
            {
                var separator = m.Value.IndexOfAny(new[] { ':', '=' });
                return separator < 0 ? "[скрыто]" : m.Value[..(separator + 1)] + "[скрыто]";
            });
        }
        catch (RegexMatchTimeoutException)
        {
            // При подозрительно дорогом вводе не пишем его даже частично.
            return "[сообщение скрыто]";
        }
        var oneLine = new string(text.Select(ch =>
            char.IsControl(ch) || ch is '\u2028' or '\u2029' ? ' ' : ch).ToArray());
        return oneLine.Length <= maxChars ? oneLine : oneLine[..maxChars] + "…";
    }
}
