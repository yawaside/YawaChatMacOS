using Microsoft.Win32;

namespace YawaChat;

/// <summary>
/// Озвучка через SAPI (COM «SAPI.SpVoice»). Interop без дополнительных
/// NuGet-пакетов.
///
/// Системный голос — запасной путь озвучки, когда облачный сервис недоступен.
/// Поэтому здесь важно не только «прочитать фразу», но и не сменить голос:
/// подбор идёт по полу того облачного голоса, который выбрал пользователь.
/// Иначе во время эфира женский голос внезапно сменялся мужским и обратно —
/// именно так это выглядело у зрителей.
/// </summary>
public sealed class SapiTts : IDisposable
{
    /// Системный голос: описание (оно же идентификатор для выбора), пол и
    /// признак русского языка.
    public sealed record SystemVoice(string Id, string Title, string Gender, bool Russian);

    private readonly object _gate = new();
    /* Очередь фраз: системный голос не умеет говорить две фразы разом, а
       параллельные вызовы (основной путь и запасной) раньше накладывались
       друг на друга — речь «съезжалась» в кашу или обрывалась. */
    private readonly SemaphoreSlim _fifo = new(1, 1);
    private int _generation;
    private dynamic? _voice;
    private Thread? _thread;
    private bool _cancelRequested;

    private dynamic Voice
    {
        get
        {
            _voice ??= Activator.CreateInstance(
                Type.GetTypeFromProgID("SAPI.SpVoice", throwOnError: true)!)
                ?? throw new InvalidOperationException("SAPI недоступен");
            return _voice;
        }
    }

    /// Озвучить текст и завершить таск по окончании фразы (синхронный Speak в воркере).
    public async Task SpeakAsync(
        string text,
        string voiceName,
        int rate,
        int volume,
        Action<byte[]>? onAudioReady = null,
        bool playLocally = true)
    {
        var generation = Volatile.Read(ref _generation);
        await _fifo.WaitAsync();
        try
        {
            // Пока фраза ждала своей очереди, очередь очистили — говорить нечего.
            if (Volatile.Read(ref _generation) != generation) return;
            await SpeakNowAsync(text, voiceName, rate, volume, onAudioReady, playLocally);
        }
        finally
        {
            _fifo.Release();
        }
    }

    private Task SpeakNowAsync(
        string text,
        string voiceName,
        int rate,
        int volume,
        Action<byte[]>? onAudioReady,
        bool playLocally)
    {
        var tcs = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        lock (_gate) _cancelRequested = false;
        _thread = new Thread(() =>
        {
            try
            {
                var v = Voice;
                try
                {
                    var tokens = v.GetVoices();
                    var matched = false;
                    for (int i = 0; i < tokens.Count; i++)
                    {
                        var t = tokens.Item(i);
                        string desc = t.GetDescription();
                        if (!string.IsNullOrEmpty(voiceName) &&
                            desc.Contains(voiceName, StringComparison.OrdinalIgnoreCase))
                        {
                            v.Voice = t;
                            matched = true;
                            break;
                        }
                    }

                    /* Запрошенного голоса в системе нет (или имя пришло пустым).
                       Раньше фраза читалась голосом Windows по умолчанию — чаще
                       всего английским мужским, и русский текст звучал чужим
                       голосом. Теперь берём русский голос того же пола, что и
                       запрошенный. */
                    if (!matched)
                    {
                        var wanted = PickRussianVoice(GenderOfDescription(voiceName));
                        if (!string.IsNullOrWhiteSpace(wanted))
                        {
                            for (int i = 0; i < tokens.Count; i++)
                            {
                                var t = tokens.Item(i);
                                string desc = t.GetDescription();
                                if (desc.Contains(wanted, StringComparison.OrdinalIgnoreCase))
                                {
                                    v.Voice = t;
                                    break;
                                }
                            }
                        }
                    }
                }
                catch { /* голос по умолчанию */ }

                v.Rate = Math.Clamp(rate, -10, 10);

                // Если нужен поток для виджета OBS (или озвучка на ПК выключена),
                // синтезируем WAV в память и отправляем в OBS.
                byte[]? wavBytes = null;
                if (onAudioReady != null)
                {
                    var tmp = Path.Combine(Path.GetTempPath(), $"yawa-sapi-{Guid.NewGuid():N}.wav");
                    try
                    {
                        var voiceType = Type.GetTypeFromProgID("SAPI.SpVoice");
                        var fsType = Type.GetTypeFromProgID("SAPI.SpFileStream");
                        if (voiceType != null && fsType != null)
                        {
                            var wavVoiceObj = Activator.CreateInstance(voiceType);
                            var fsObj = Activator.CreateInstance(fsType);
                            if (wavVoiceObj != null && fsObj != null)
                            {
                                dynamic wavVoice = wavVoiceObj;
                                dynamic fs = fsObj;
                                try
                                {
                                    try { wavVoice.Voice = v.Voice; } catch { }
                                    wavVoice.Rate = Math.Clamp(rate, -10, 10);
                                    wavVoice.Volume = 100;
                                    fs.Open(tmp, 3, false); // SSFMCreateForWrite = 3
                                    wavVoice.AudioOutputStream = fs;
                                    wavVoice.Speak(text, 0);
                                }
                                finally
                                {
                                    try { wavVoice.AudioOutputStream = null; } catch { }
                                    try { fs.Close(); } catch { }
                                }
                                if (File.Exists(tmp))
                                {
                                    wavBytes = File.ReadAllBytes(tmp);
                                    if (wavBytes.Length > 44)
                                    {
                                        var copy = wavBytes;
                                        _ = Task.Run(() => { try { onAudioReady(copy); } catch { } });
                                    }
                                }
                            }
                        }
                    }
                    catch { }
                    finally
                    {
                        try { if (File.Exists(tmp)) File.Delete(tmp); } catch { }
                    }
                }

                if (playLocally)
                {
                    v.Volume = Math.Clamp(volume, 0, 100);
                    // SVSFlagsAsync=1 — не блокируем COM-поток, ждём флаг окончания
                    v.Speak(text, 1);
                    // Без потолка WaitUntilDone крутился бы вечно, если системный
                    // голос завис — очередь озвучки тогда молчала до перезапуска.
                    var maxMs = Math.Clamp(text.Length * 120 + 3000, 5000, 90_000);
                    var waited = 0;
                    var hung = false;
                    while ((int)v.WaitUntilDone(100) == 0)
                    {
                        waited += 100;
                        lock (_gate) if (_cancelRequested) break;
                        if (waited >= maxMs) { hung = true; break; }
                    }
                    if (hung) ResetVoice();
                }
                else
                {
                    // Воспроизведение на ПК отключено: выдерживаем длительность WAV,
                    // чтобы фразы в виджете OBS шли строго по очереди.
                    var durationMs = EstimateWavDurationMs(wavBytes, text);
                    var waited = 0;
                    while (waited < durationMs)
                    {
                        lock (_gate) if (_cancelRequested) break;
                        Thread.Sleep(100);
                        waited += 100;
                    }
                }
            }
            catch { /* голос мог быть сброшен Clear() */ }
            tcs.TrySetResult();
        }) { IsBackground = true, Name = "yawa-tts" };
        _thread.Start();
        return tcs.Task;
    }

    private static int EstimateWavDurationMs(byte[]? wav, string text)
    {
        if (wav != null && wav.Length > 44)
        {
            var byteRate = BitConverter.ToInt32(wav, 28);
            if (byteRate > 1000)
            {
                var ms = (int)Math.Ceiling((wav.Length - 44) * 1000.0 / byteRate) + 150;
                return Math.Clamp(ms, 400, 90_000);
            }
        }
        return Math.Clamp(text.Length * 75 + 500, 600, 30_000);
    }

    /* ================= какие голоса есть в системе ================= */

    /// Ветки реестра, где SAPI хранит описания голосов и их атрибуты
    /// (пол и язык указаны там явно — это надёжнее, чем угадывать по имени).
    private static readonly string[] TokenRoots =
    {
        @"SOFTWARE\Microsoft\Speech\Voices\Tokens",
        @"SOFTWARE\WOW6432Node\Microsoft\Speech\Voices\Tokens",
        @"SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens",
        @"SOFTWARE\WOW6432Node\Microsoft\Speech_OneCore\Voices\Tokens",
    };

    private static Dictionary<string, (string Gender, string Language)>? _tokenAttributes;
    private static readonly object AttributesGate = new();

    private static Dictionary<string, (string Gender, string Language)> TokenAttributes
    {
        get
        {
            lock (AttributesGate)
            {
                if (_tokenAttributes != null) return _tokenAttributes;
                var map = new Dictionary<string, (string, string)>(StringComparer.OrdinalIgnoreCase);
                foreach (var hive in new[] { Registry.LocalMachine, Registry.CurrentUser })
                {
                    foreach (var root in TokenRoots)
                    {
                        try
                        {
                            using var tokens = hive.OpenSubKey(root);
                            if (tokens == null) continue;
                            foreach (var name in tokens.GetSubKeyNames())
                            {
                                try
                                {
                                    using var token = tokens.OpenSubKey(name);
                                    if (token?.GetValue(null) is not string description ||
                                        string.IsNullOrWhiteSpace(description))
                                        continue;
                                    using var attrs = token.OpenSubKey("Attributes");
                                    var gender = (attrs?.GetValue("Gender") as string) ?? "";
                                    var language = (attrs?.GetValue("Language") as string) ?? "";
                                    map[description.Trim()] = (gender.Trim(), language.Trim());
                                }
                                catch { /* голос без атрибутов — определим по имени */ }
                            }
                        }
                        catch { /* ветки может не быть */ }
                    }
                }
                return _tokenAttributes = map;
            }
        }
    }

    /// Все голоса, которые SAPI может выбрать, с определённым полом и языком.
    /// Список кэшируется: перебор COM-голосов небыстрый, а вызов нужен на
    /// каждую запасную фразу.
    private static SystemVoice[]? _voicesCache;
    private static readonly object VoicesGate = new();

    public static SystemVoice[] ListSystemVoices()
    {
        lock (VoicesGate)
        {
            if (_voicesCache is { Length: > 0 } cached) return cached;
            var list = EnumerateSystemVoices();
            // Пустой результат не запоминаем: SAPI мог быть ещё не готов.
            if (list.Length > 0) _voicesCache = list;
            return list;
        }
    }

    private static SystemVoice[] EnumerateSystemVoices()
    {
        var list = new List<SystemVoice>();
        dynamic? v = null;
        try
        {
            v = Activator.CreateInstance(Type.GetTypeFromProgID("SAPI.SpVoice", true)!)!;
            var tokens = v.GetVoices();
            for (int i = 0; i < tokens.Count; i++)
            {
                string desc = tokens.Item(i).GetDescription();
                if (string.IsNullOrWhiteSpace(desc)) continue;
                desc = desc.Trim();
                list.Add(new SystemVoice(desc, desc, GenderOfDescription(desc), IsRussian(desc)));
            }
        }
        catch { /* SAPI недоступен — список останется пустым */ }
        finally
        {
            if (v != null)
            {
                try { System.Runtime.InteropServices.Marshal.ReleaseComObject(v); } catch { }
            }
        }
        return list.ToArray();
    }

    /// Русские системные голоса: сначала женские и мужские по порядку, как их
    /// отдаёт система, но «Desktop»-варианты (полные голоса Windows) впереди
    /// урезанных «Mobile» — они звучат ровнее.
    public static SystemVoice[] RussianVoices() =>
        ListSystemVoices()
            .Where(v => v.Russian)
            .OrderByDescending(v => v.Id.Contains("Desktop", StringComparison.OrdinalIgnoreCase))
            .ToArray();

    /// Русские системные голоса SAPI для панели «Озвучка».
    public static object[] ListRussianVoices() =>
        RussianVoices()
            .Select(v => (object)new { id = v.Id, title = v.Title, gender = v.Gender })
            .ToArray();

    /// <summary>
    /// Имя русского системного голоса для запасной озвучки. Нужно, когда
    /// облачный голос недоступен: идентификатор облачного голоса системе
    /// незнаком, и без этого выбора Windows читала бы русский текст
    /// английским голосом по умолчанию.
    /// </summary>
    /// <param name="gender">
    /// Пол облачного голоса («Female»/«Male»). Запасной голос подбирается
    /// того же пола — озвучка не должна «менять пол» на середине эфира.
    /// </param>
    /// <param name="preferredName">
    /// Имя, которое ищем в системных голосах: у части облачных голосов есть
    /// тёзка в Windows (например, Светлана) — с ней запасная озвучка звучит
    /// почти как основная.
    /// </param>
    public static string PickRussianVoice(string? gender = null, string? preferredName = null)
    {
        var voices = RussianVoices();
        if (voices.Length == 0) return "";

        if (!string.IsNullOrWhiteSpace(preferredName))
        {
            var byName = voices.FirstOrDefault(v =>
                v.Id.Contains(preferredName!, StringComparison.OrdinalIgnoreCase));
            if (byName != null) return byName.Id;
        }

        var wanted = NormalizeGender(gender);
        if (wanted.Length > 0)
        {
            var same = voices.FirstOrDefault(v => v.Gender == wanted);
            if (same != null) return same.Id;
        }
        // Голоса нужного пола в системе нет — берём любой русский: лучше
        // прочитать фразу, чем промолчать.
        return voices[0].Id;
    }

    /// Пол голоса по его описанию: атрибут из реестра, затем само описание,
    /// затем известное имя.
    public static string GenderOfDescription(string? description)
    {
        if (string.IsNullOrWhiteSpace(description)) return "";
        var desc = description!.Trim();

        if (TokenAttributes.TryGetValue(desc, out var attrs) &&
            NormalizeGender(attrs.Gender) is { Length: > 0 } fromRegistry)
            return fromRegistry;

        if (desc.Contains("female", StringComparison.OrdinalIgnoreCase) ||
            desc.Contains("женск", StringComparison.OrdinalIgnoreCase))
            return "Female";
        if (desc.Contains("male", StringComparison.OrdinalIgnoreCase) ||
            desc.Contains("мужск", StringComparison.OrdinalIgnoreCase))
            return "Male";

        foreach (var name in FemaleNames)
            if (desc.Contains(name, StringComparison.OrdinalIgnoreCase)) return "Female";
        foreach (var name in MaleNames)
            if (desc.Contains(name, StringComparison.OrdinalIgnoreCase)) return "Male";

        return "";
    }

    /// Русский ли это голос: языковой атрибут из реестра, затем описание,
    /// затем известные русские имена.
    private static bool IsRussian(string description)
    {
        if (TokenAttributes.TryGetValue(description, out var attrs) && IsRussianLcid(attrs.Language))
            return true;

        if (description.Contains("Russian", StringComparison.OrdinalIgnoreCase) ||
            description.Contains("русск", StringComparison.OrdinalIgnoreCase) ||
            description.Contains("(Russia)", StringComparison.OrdinalIgnoreCase))
            return true;

        foreach (var name in FemaleNames.Concat(MaleNames))
            if (RussianOnlyNames.Contains(name) &&
                description.Contains(name, StringComparison.OrdinalIgnoreCase))
                return true;

        return false;
    }

    /// Языковой атрибут SAPI — код языка: 0x419 (или 1049) для русского.
    private static bool IsRussianLcid(string? language)
    {
        if (string.IsNullOrWhiteSpace(language)) return false;
        var text = language!.Trim();
        if (int.TryParse(text, System.Globalization.NumberStyles.HexNumber,
                System.Globalization.CultureInfo.InvariantCulture, out var hex) && hex == 0x419)
            return true;
        return int.TryParse(text, out var dec) && dec == 1049;
    }

    private static string NormalizeGender(string? gender)
    {
        if (string.IsNullOrWhiteSpace(gender)) return "";
        var g = gender!.Trim();
        if (g.StartsWith("f", StringComparison.OrdinalIgnoreCase) ||
            g.StartsWith("жен", StringComparison.OrdinalIgnoreCase) ||
            g.StartsWith("ж", StringComparison.OrdinalIgnoreCase))
            return "Female";
        if (g.StartsWith("m", StringComparison.OrdinalIgnoreCase) ||
            g.StartsWith("муж", StringComparison.OrdinalIgnoreCase))
            return "Male";
        return "";
    }

    /// Имена, по которым пол определяется, если в реестре атрибута нет.
    private static readonly string[] FemaleNames =
    {
        "Ирина", "Irina", "Катя", "Katya", "Милена", "Milena", "Светлана", "Svetlana",
        "Алёна", "Alyona", "Alena", "Елена", "Elena", "Дарья", "Darya", "Татьяна",
        "Tatyana", "Ольга", "Olga", "Мария", "Maria", "Анастасия", "Anastasia",
        "Юлия", "Yulia", "Наталья", "Natalia", "Анна", "Anna", "Виктория", "Viktoria",
        "Zira", "Hazel", "Susan", "Linda", "Eva", "Heera", "Kalpana", "Catherine",
    };

    private static readonly string[] MaleNames =
    {
        "Павел", "Pavel", "Юрий", "Yuri", "Дмитрий", "Dmitry", "Михаил", "Mikhail",
        "Александр", "Aleksandr", "Alexander", "Николай", "Nikolai", "Максим", "Maksim",
        "Артём", "Artem", "Владимир", "Vladimir", "Сергей", "Sergey", "Иван", "Ivan",
        "David", "Mark", "George", "James", "Ravi", "Raul", "Guy", "Paul",
    };

    /// Имена, которые встречаются только у русских голосов: по ним находим
    /// русский голос даже в системе с другим языком интерфейса.
    private static readonly HashSet<string> RussianOnlyNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "Ирина", "Irina", "Павел", "Pavel", "Светлана", "Svetlana", "Дмитрий", "Dmitry",
        "Катя", "Katya", "Милена", "Milena", "Алёна", "Alyona",
    };

    public void Pause() { try { Voice.Pause(); } catch { } }
    public void Resume() { try { Voice.Resume(); } catch { } }

    /// Сбросить очередь: пропустить всё озвученное и стоящее в очереди SAPI.
    public void Clear()
    {
        // Фразы, которые ещё только ждут своей очереди, озвучивать уже не нужно.
        Interlocked.Increment(ref _generation);
        lock (_gate) _cancelRequested = true;
        try { Voice.Skip("Sentence", int.MaxValue); } catch { }
    }

    /// Пересоздаём COM-голос: после зависания тот же экземпляр больше не говорит.
    private void ResetVoice()
    {
        lock (_gate)
        {
            if (_voice == null) return;
            try { System.Runtime.InteropServices.Marshal.ReleaseComObject(_voice); } catch { }
            _voice = null;
        }
    }

    public void Dispose()
    {
        Clear();
        try { _thread?.Join(300); } catch { }
        try { _fifo.Dispose(); } catch { }
        ResetVoice();
    }
}
