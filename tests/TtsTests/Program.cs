namespace YawaChat;

/// <summary>
/// Тесты токена подключения к сервису озвучки. Эталонные значения получены
/// из эталонной реализации протокола (edge-tts, drm.py версии 2) для
/// фиксированных моментов времени: если алгоритм разойдётся с сервисом,
/// озвучка начнёт получать отказ 403 на каждом подключении.
/// </summary>
internal static class Program
{
    private static int _failed;

    private static void Main()
    {
        Run("токен совпадает с эталоном", ReferenceVectors);
        Run("форма токена: 16 + дефис + 64", TokenShape);
        Run("внутри пяти минут токен не меняется", Step);
        Run("соседние пятиминутки дают разные токены", DifferentSteps);
        Run("настройки подключения читаются из файла", ConfigRead);
        Run("испорченный файл не оставляет без адресов", ConfigBroken);
        Run("пустой список адресов заменяется встроенными", ConfigNoEndpoints);
        Run("запись настроек не теряет адрес и версию", ConfigRoundTrip);
        if (_failed != 0) Environment.ExitCode = 1;
    }

    private static void Run(string name, Action check)
    {
        try
        {
            check();
            Console.WriteLine("PASS " + name);
        }
        catch (Exception ex)
        {
            _failed++;
            Console.Error.WriteLine("FAIL " + name + ": " + ex.Message);
        }
    }

    private static void Check(bool condition, string reason)
    {
        if (!condition) throw new InvalidOperationException(reason);
    }

    private static void ReferenceVectors()
    {
        var cases = new (double Seconds, string Expected)[]
        {
            (0d, "52BC7A17B50DFEC9-28C4394775C8751CD2F6859C030C06DB1489ACAB3B3A7651831FC26895177ED6"),
            (1762000000d, "4404CE4124108A51-9D8B24A039B7BDF487FCD8B8BF5FA5C1BAE53368325CCF467D2F888B39C50DEA"),
            (1762000123.456d, "4404CE4124108A51-9D8B24A039B7BDF487FCD8B8BF5FA5C1BAE53368325CCF467D2F888B39C50DEA"),
            (1800000000d, "99E54519B490BE5C-E162DB0977FBDCB9B86DD8148BF1BCDC3C0303176CE39852A42B415935C20654"),
            (1893456000d, "7442B6E630CDF0DE-CE82EC1509335DC856270C1EEB0F7F2575909AC26840D2C15B28A41EBB7E9CCF"),
        };

        foreach (var (seconds, expected) in cases)
        {
            var actual = SecMsGec.Generate(seconds);
            Check(actual == expected, $"для {seconds} получено {actual}, ожидалось {expected}");
        }
    }

    private static void TokenShape()
    {
        var token = SecMsGec.Generate();
        var parts = token.Split('-');
        Check(parts.Length == 2, "в токене должен быть ровно один дефис");
        Check(parts[0].Length == 16, "перемешанная часть должна быть длиной 16");
        Check(parts[1].Length == 64, "дайджест должен быть длиной 64");
        Check(token.All(c => char.IsDigit(c) || (c >= 'A' && c <= 'F') || c == '-'),
            "токен состоит только из заглавных шестнадцатеричных цифр и дефиса");
    }

    private static void Step()
    {
        const double start = 1762000100d;
        var first = SecMsGec.Generate(start);
        Check(SecMsGec.Generate(start + 60d) == first, "внутри пятиминутки токен изменился");
        Check(SecMsGec.Generate(start - 20d) == first, "внутри пятиминутки токен изменился на границе");
    }

    private static void DifferentSteps()
    {
        const double start = 1762000100d;
        Check(SecMsGec.Generate(start) != SecMsGec.Generate(start + 300d),
            "соседние пятиминутки дали одинаковый токен");
    }

    /* ---------- файл настроек подключения ---------- */

    private static string TempFile() =>
        Path.Combine(Path.GetTempPath(), "yawachat-edge-" + Guid.NewGuid().ToString("N") + ".json");

    private static void ConfigRead()
    {
        var path = TempFile();
        try
        {
            File.WriteAllText(path, """
            {
              "version": 1,
              "tokenVersion": "2",
              "chromiumVersions": ["156.0.1000.10", "143.0.3650.75"],
              "endpoints": [
                {
                  "name": "новый",
                  "wsBase": "wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1",
                  "tokenParam": "Ocp-Apim-Subscription-Key",
                  "voicesUrl": "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list",
                  "subProtocol": "synthesize",
                  "backup": false
                }
              ]
            }
            """);

            var config = EdgeTtsConfig.Load(path, out var problem);
            Check(problem == null, "исправный файл не должен давать замечаний: " + problem);
            Check(config.Primary?.Name == "новый", "основной адрес взят не из файла");
            Check(config.ChromiumVersions[0] == "156.0.1000.10", "версия из файла не стала первой");
            Check(config.Endpoints.Count == 1, "лишние адреса не должны появляться");
        }
        finally { File.Delete(path); }
    }

    private static void ConfigBroken()
    {
        var path = TempFile();
        try
        {
            File.WriteAllText(path, "{ это не json");
            var config = EdgeTtsConfig.Load(path, out var problem);
            Check(problem != null, "испорченный файл должен быть замечен");
            Check(config.Endpoints.Count == EdgeTtsConfig.DefaultEndpoints().Count,
                "без встроенных адресов приложение осталось бы без озвучки");
            Check(config.Primary != null, "основного адреса нет");
        }
        finally { File.Delete(path); }
    }

    private static void ConfigNoEndpoints()
    {
        var path = TempFile();
        try
        {
            File.WriteAllText(path, """{"endpoints":[],"chromiumVersions":[]}""");
            var config = EdgeTtsConfig.Load(path, out var problem);
            Check(problem != null, "пустой файл должен быть замечен");
            Check(config.Endpoints.Count == EdgeTtsConfig.DefaultEndpoints().Count, "адреса не вернулись");
            Check(config.ChromiumVersions.Count > 0, "версии не вернулись");
        }
        finally { File.Delete(path); }
    }

    private static void ConfigRoundTrip()
    {
        var path = TempFile();
        try
        {
            var config = new EdgeTtsConfig();
            config.Endpoints[0].WsBase = "wss://example.invalid/tts";
            config.ChromiumVersions.Insert(0, "157.0.2000.5");
            config.CheckedUtc = "2026-11-02T10:00:00Z";
            config.LastResult = "адрес и версия протокола в порядке";
            config.Save(path);

            var loaded = EdgeTtsConfig.Load(path, out var problem);
            Check(problem == null, "свой же файл должен читаться без замечаний: " + problem);
            Check(loaded.Primary?.WsBase == "wss://example.invalid/tts", "адрес потерялся при записи");
            Check(loaded.ChromiumVersions[0] == "157.0.2000.5", "версия потерялась при записи");
            Check(loaded.LastResult == "адрес и версия протокола в порядке", "итог проверки потерялся");
        }
        finally { File.Delete(path); }
    }
}
