using System.Security.Cryptography;
using System.Text;

namespace YawaChat;

/// <summary>
/// Шифрование чувствительных настроек в settings.json.
///
/// Токены чат-бота и секреты подключённых источников не сохраняются в
/// открытом виде: значения защищаются DPAPI (Data Protection API) в режиме CurrentUser:
/// расшифровать значение может только тот же пользователь Windows — даже
/// если сам файл скопировать на другой компьютер или прочитать из-под
/// другого аккаунта, токены останутся нерасшифрованными.
///
/// Формат записи: "yawaenc1:" + Base64(ProtectedData). Старые настройки
/// (без префикса) читаются как есть — переход без потери данных: при первом
/// сохранении они автоматически перепишутся в зашифрованном виде.
/// </summary>
internal static class SettingsCrypto
{
    /// Маркер зашифрованного значения. Версия в префиксе оставляет
    /// возможность сменить алгоритм, не ломая старые файлы.
    private const string Prefix = "yawaenc1:";

    /// Энтропия (соль) DPAPI: привязывает шифр именно к этому приложению —
    /// значение, зашифрованное YawaChat, не расшифруется другим приложением
    /// даже у того же пользователя.
    private static readonly byte[] Entropy =
        Encoding.UTF8.GetBytes("YawaChat/settings/v1");

    /// Соль прежнего имени приложения: у обновившихся с ранних версий токены
    /// чат-бота зашифрованы ею. Читаем их этим ключом (вход не теряется),
    /// а при первом сохранении значение перезапишется уже новым.
    private static readonly byte[] LegacyEntropy =
        Encoding.UTF8.GetBytes("YawaChatHub/settings/v1");

    /// Ключи settings.json, хранящие секреты или содержащие токены площадок.
    /// Для subscriptions шифруется весь JSON-объект, чтобы не дублировать
    /// секреты каждого коннектора в открытом виде.
    public static bool IsSensitiveKey(string key) =>
        key.Equals("subscriptions", StringComparison.OrdinalIgnoreCase) ||
        key.Equals("memealerts", StringComparison.OrdinalIgnoreCase) ||
        key.StartsWith("botToken:", StringComparison.OrdinalIgnoreCase) ||
        key.StartsWith("botRefresh:", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Шифрует значение для записи в settings.json. При невозможности
    /// защитить значение ошибка поднимается выше: не сохраняем секрет открытым.
    /// </summary>
    public static string? EncryptValue(string? value)
    {
        if (string.IsNullOrEmpty(value)) return value;
        var encrypted = ProtectedData.Protect(
            Encoding.UTF8.GetBytes(value), Entropy, DataProtectionScope.CurrentUser);
        return Prefix + Convert.ToBase64String(encrypted);
    }

    /// <summary>
    /// Раскрывает значение из settings.json. Понимает и старый формат
    /// (открытый токен, без префикса) — возвращается как есть.
    /// </summary>
    public static string? DecryptValue(string? value)
    {
        if (string.IsNullOrEmpty(value) || value.Length < Prefix.Length) return value;
        if (!value.StartsWith(Prefix, StringComparison.Ordinal)) return value;

        byte[] cipher;
        try { cipher = Convert.FromBase64String(value[Prefix.Length..]); }
        catch { return ""; } // битая запись в файле настроек

        try
        {
            return Encoding.UTF8.GetString(
                ProtectedData.Unprotect(cipher, Entropy, DataProtectionScope.CurrentUser));
        }
        catch { /* ниже пробуем ключ прежнего имени приложения */ }

        try
        {
            return Encoding.UTF8.GetString(
                ProtectedData.Unprotect(cipher, LegacyEntropy, DataProtectionScope.CurrentUser));
        }
        catch
        {
            // Зашифровано под другим пользователем или на другой машине:
            // восстановить нечем — токен придётся ввести заново.
            return "";
        }
    }
}
