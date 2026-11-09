using System.Text.Json.Nodes;

namespace YawaChat;

/// <summary>Последовательные, повторно применимые миграции файла настроек.
/// Версия 0 — профили до введения schemaVersion. Не удаляем неизвестные поля:
/// они могут принадлежать более новой версии приложения.</summary>
internal static class SettingsMigrations
{
    internal const int CurrentVersion = 1;

    internal static bool Apply(JsonObject settings)
    {
        int version;
        try { version = settings["schemaVersion"]?.GetValue<int>() ?? 0; }
        catch { throw new InvalidDataException("Некорректная версия схемы настроек"); }
        if (version < 0) throw new InvalidDataException("Некорректная версия схемы настроек");
        // Новый профиль читаем без преобразования: не стираем незнакомые данные.
        if (version > CurrentVersion) return false;

        var changed = false;
        if (version < 1)
        {
            // Учётные данные VK из профилей ранних версий не подходят текущему
            // входу (другое приложение и другой набор прав): убираем их, чтобы
            // пользователь вошёл заново. Подписки VK Видео Live не трогаем.
            foreach (var key in new[]
            {
                "botToken:vkplay", "botRefresh:vkplay", "botUserId:vkplay",
                "vkChannel", "vkScopes", "vkClientId", "vkServiceToken",
            }) changed |= settings.Remove(key);

            if (settings["botAuth"] is JsonObject auth && auth.Remove("vkplay"))
            {
                changed = true;
                if (auth.Count == 0) settings.Remove("botAuth");
            }
            settings["schemaVersion"] = 1;
            changed = true;
        }
        return changed;
    }
}
