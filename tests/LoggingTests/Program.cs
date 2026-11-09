using System.Text.RegularExpressions;

namespace YawaChat;

internal static class Program
{
    private static int _failed;

    private static void Main()
    {
        Run("одна папка, категории и уровни", DirectoryAndLevels);
        Run("ротация и общий лимит файлов", Rotation);
        Run("длинная запись ограничена по UTF-8", OversizedEntry);
        Run("секреты и переносы строк не сохраняются", Redaction);
        Run("параллельные потоки не смешивают строки", ConcurrentWrites);
        Run("ошибка диска не прерывает работу", DiskFailure);
        if (_failed != 0) Environment.ExitCode = 1;
    }

    private static void Run(string name, Action<string> check)
    {
        var dir = Path.Combine(Path.GetTempPath(), "yawa-log-test-" + Guid.NewGuid().ToString("N"));
        try
        {
            check(dir);
            Console.WriteLine("PASS " + name);
        }
        catch (Exception ex)
        {
            _failed++;
            Console.Error.WriteLine("FAIL " + name + ": " + ex);
        }
        finally
        {
            try { if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true); } catch { }
        }
    }

    private static void Check(bool condition, string reason)
    {
        if (!condition) throw new Exception(reason);
    }

    private static void DirectoryAndLevels(string dir)
    {
        var writer = new RotatingLogWriter(dir, minLevel: LogLevel.Info);
        Check(writer.Write(LogFile.App, LogLevel.Debug, "channel", "только для отладки"), "debug-фильтр");
        Check(!Directory.Exists(dir), "DEBUG попал на диск при минимальном уровне INFO");
        Check(writer.Write(LogFile.App, LogLevel.Info, "app", "запущено"), "app.log");
        foreach (var file in Enum.GetValues<LogFile>())
            Check(writer.Write(file, LogLevel.Warning, "test", "проверка"), $"журнал {file}");
        Check(Directory.GetFiles(dir).Length == Enum.GetValues<LogFile>().Length, "неверное число файлов");
        var line = File.ReadAllText(writer.PathFor(LogFile.App));
        Check(Regex.IsMatch(line, @"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z \[INFO\] \[app\] запущено"),
            "неверный формат времени/уровня/источника");
        Check(writer.PathFor(LogFile.TikTok).StartsWith(dir, StringComparison.Ordinal), "папки не совпадают");
    }

    private static void Rotation(string dir)
    {
        var writer = new RotatingLogWriter(dir, maxBytes: 300, backups: 2);
        var path = writer.PathFor(LogFile.App);
        for (var i = 0; i < 24; i++)
            Check(writer.Write(LogFile.App, LogLevel.Info, "rotation", $"item-{i:00} " + new string('х', 60)),
                "запись при ротации");
        var files = new[] { path, path + ".1", path + ".2" };
        Check(files.All(File.Exists), "нет копий после ротации");
        Check(files.All(f => new FileInfo(f).Length <= 300), "превышен лимит файла");
        Check(Directory.GetFiles(dir).Length == files.Length, "лишние копии");
        Check(File.ReadAllText(path).Contains("item-23"), "последнее событие потеряно");
        Check(!files.Any(f => File.ReadAllText(f).Contains("item-00")), "старые события не вытеснены");
        Check(writer.Write(LogFile.OAuth, LogLevel.Info, "oauth", "отдельно"), "независимый журнал");
        Check(new FileInfo(writer.PathFor(LogFile.OAuth)).Length <= 300, "другой журнал превышает лимит");
    }

    private static void OversizedEntry(string dir)
    {
        var writer = new RotatingLogWriter(dir, maxBytes: 256, backups: 0);
        Check(writer.Write(LogFile.App, LogLevel.Error, "test", new string('ж', 10_000)), "длинная запись");
        Check(new FileInfo(writer.PathFor(LogFile.App)).Length <= 256, "длинное сообщение вышло за лимит");
        Check(File.ReadAllText(writer.PathFor(LogFile.App)).Contains('…'), "нет отметки обрезки");
    }

    private static void Redaction(string dir)
    {
        var writer = new RotatingLogWriter(dir);
        var payload = "Authorization: Bearer SecretBearer42\n" +
            "oauth:SecretOAuth42 access_token=SecretAccess42 " +
            "\"refresh_token\":\"Secret Refresh42\" password=SecretPass42 " +
            "https://user:SecretProxy42@proxy.test/path/SecretPath42?token=SecretQuery42\n" +
            "[CRITICAL] fake line";
        Check(writer.Write(LogFile.OAuth, LogLevel.Warning, "oauth", payload), "запись с секретами");
        var text = File.ReadAllText(writer.PathFor(LogFile.OAuth));
        foreach (var secret in new[]
        {
            "SecretBearer42", "SecretOAuth42", "SecretAccess42", "Secret Refresh42",
            "SecretPass42", "SecretProxy42", "SecretPath42", "SecretQuery42",
        })
            Check(!text.Contains(secret, StringComparison.Ordinal), $"в журнале остался секрет {secret}");
        Check(text.Contains("[адрес]", StringComparison.Ordinal), "адрес не скрыт");
        Check(text.Split(Environment.NewLine, StringSplitOptions.RemoveEmptyEntries).Length == 1,
            "переносы строк позволили подделать запись");
    }

    private static void ConcurrentWrites(string dir)
    {
        var writer = new RotatingLogWriter(dir);
        Parallel.For(0, 150, i => Check(writer.Write(LogFile.App, LogLevel.Info, "tasks", $"item-{i:000}"),
            "конкурентная запись"));
        var lines = File.ReadAllLines(writer.PathFor(LogFile.App));
        Check(lines.Length == 150, "часть конкурентных записей потеряна");
        Check(lines.All(line => Regex.IsMatch(line, @"\[INFO\] \[tasks\] item-\d{3}$")),
            "перемешались строки");
    }

    private static void DiskFailure(string dir)
    {
        Directory.CreateDirectory(dir);
        var blocked = Path.Combine(dir, "blocked");
        File.WriteAllText(blocked, "not a directory");
        var writer = new RotatingLogWriter(Path.Combine(blocked, "logs"));
        Check(!writer.Write(LogFile.App, LogLevel.Error, "test", "error"),
            "ошибка диска не была обработана");
    }
}
