using System.Reflection;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace YawaChat;

/// <summary>
/// Ярлык приложения на рабочем столе.
///
/// Приложение portable: установщика нет, ярлык раньше создавал пользователь
/// вручную. Такой ярлык вёл на прежний файл и показывал старую иконку.
/// Теперь ярлык создаёт само приложение при первом запуске, а значок берётся
/// из него самого — тот же, что в трее, на панели задач и в проводнике.
/// </summary>
internal static class DesktopShortcut
{
    private const string Name = "YawaChat.lnk";
    private const string LegacyName = "YawaChatHub.lnk";

    /// <summary>
    /// Создаёт ярлык, если его ещё не было. Возвращает путь файла программы,
    /// для которого ярлык создан (его приложение запоминает в настройках) —
    /// или null, если ничего делать не пришлось.
    ///
    /// Ярлык, удалённый пользователем вручную, заново не навязывается:
    /// повторное создание происходит только если приложение переехало
    /// в другую папку.
    /// </summary>
    public static string? TryEnsure(string previousTarget)
    {
        var exe = Environment.ProcessPath;
        if (string.IsNullOrEmpty(exe) || !exe.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
            return null;

        var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        if (string.IsNullOrEmpty(desktop) || !Directory.Exists(desktop)) return null;

        var link = Path.Combine(desktop, Name);
        if (previousTarget.Length > 0
            && previousTarget.Equals(exe, StringComparison.OrdinalIgnoreCase))
            return null;

        if (!Write(link, exe)) return null;

        // Ярлык прежнего имени вёл на старый файл и показывал старую иконку —
        // заменяем его, чтобы на рабочем столе не осталось двух приложений.
        try
        {
            var legacy = Path.Combine(desktop, LegacyName);
            if (File.Exists(legacy)) File.Delete(legacy);
        }
        catch { /* ярлык мог быть занят — не критично */ }

        return exe;
    }

    /// <summary>
    /// Запись ярлыка штатным компонентом Windows: файл .lnk формирует
    /// WScript.Shell, поэтому собственный формат ярлыка не нужен. Значок —
    /// из самого приложения (IconLocation = exe, индекс 0).
    /// </summary>
    private static bool Write(string path, string exe)
    {
        object? shell = null;
        object? link = null;
        try
        {
            var type = Type.GetTypeFromProgID("WScript.Shell");
            if (type == null) return false;

            shell = Activator.CreateInstance(type);
            if (shell == null) return false;

            link = type.InvokeMember(
                "CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { path });
            if (link == null) return false;

            var linkType = link.GetType();
            void Set(string property, string value) =>
                linkType.InvokeMember(property, BindingFlags.SetProperty, null, link, new object[] { value });

            Set("TargetPath", exe);
            Set("WorkingDirectory", Path.GetDirectoryName(exe) ?? "");
            Set("IconLocation", exe + ",0");
            Set("Description", "YawaChat — чат всех стримов в одном окне");

            linkType.InvokeMember("Save", BindingFlags.InvokeMethod, null, link, Array.Empty<object>());
            return File.Exists(path);
        }
        catch
        {
            return false; // ярлык — удобство, а не условие работы приложения
        }
        finally
        {
            if (link != null) Marshal.FinalReleaseComObject(link);
            if (shell != null) Marshal.FinalReleaseComObject(shell);
        }
    }

    /* ---------- автозапуск с Windows (1.9а) ---------- */

    /// <summary>Ключ автозапуска текущего пользователя и имя нашего значения.</summary>
    private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string RunValueName = "YawaChat";

    /// <summary>
    /// Включён ли автозапуск: в HKCU\...\Run есть наше значение с путём exe.
    /// Проверяется именно наличие записи — путь мог измениться после переезда
    /// приложения, и при следующем включении он обновится.
    /// </summary>
    public static bool GetAutostart()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: false);
            return key?.GetValue(RunValueName) is string value && value.Length > 0;
        }
        catch { return false; }
    }

    /// <summary>
    /// Включает или выключает автозапуск: записывает (или удаляет) путь
    /// текущего приложения в HKCU\...\Run. Ключ текущего пользователя —
    /// права администратора не нужны. Любая ошибка глотается: автозапуск
    /// удобство, а не условие работы приложения.
    /// </summary>
    public static void SetAutostart(bool enabled)
    {
        try
        {
            using var key = Registry.CurrentUser.CreateSubKey(RunKeyPath, writable: true);
            if (key == null) return;

            if (enabled)
            {
                var exe = Environment.ProcessPath;
                if (string.IsNullOrEmpty(exe)) return;
                // Кавычки обязательны: путь к portable-сборке обычно содержит пробелы.
                key.SetValue(RunValueName, $"\"{exe}\"");
            }
            else
            {
                key.DeleteValue(RunValueName, throwOnMissingValue: false);
            }
        }
        catch { /* не критично: без автозапуска приложение работает так же */ }
    }
}
