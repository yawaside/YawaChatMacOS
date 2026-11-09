namespace YawaChat;

/// <summary>
/// Контроль единственного экземпляра приложения.
///
/// Зачем. Все постоянные данные приложения — файл настроек и профиль WebView2 —
/// лежат в одной папке (%LOCALAPPDATA%\YawaChat). Два запущенных экземпляра
/// делят их между собой: интерфейс читает и пишет одни и те же ключи, а
/// сохранённые каналы и входы перезаписывает тот экземпляр, который закрылся
/// последним. Microsoft отдельно отмечает, что работа двух процессов WebView2
/// на одной user data folder не гарантирована.
///
/// Как устроено. Именованный мьютекс в пределах сеанса Windows (<c>Local\</c>)
/// определяет, кто запущен первым. Второй экземпляр не создаёт своё окно — он
/// поднимает именованное событие, по которому первый показывает уже открытое
/// окно, и тихо завершается.
///
/// Отказоустойчивость. Если контроль организовать не удалось (создание
/// именованного объекта запрещено политикой, имя занято чужим процессом),
/// приложение запускается как раньше: старт важнее проверки.
/// </summary>
internal sealed class SingleInstance : IDisposable
{
    /* Имена в пространстве Local\ — они видны только в текущем сеансе Windows.
       Global\ объединил бы все сеансы, и при быстрой смене пользователя второй
       аккаунт не смог бы запустить собственное приложение. */
    private const string MutexName = @"Local\YawaChat.SingleInstance";
    private const string ActivateEventName = @"Local\YawaChat.ShowWindow";

    private readonly Mutex _mutex;
    /// Канал «второй экземпляр просит показать окно». Null, если создать его
    /// не удалось: контроль по мьютексу при этом продолжает работать.
    private EventWaitHandle? _activate;
    private readonly CancellationTokenSource _cts = new();
    private Thread? _listener;
    private int _disposed;

    private SingleInstance(Mutex mutex) => _mutex = mutex;

    /// <summary>Пытается занять место единственного экземпляра приложения.</summary>
    /// <param name="onActivate">
    /// Вызывается в фоновом потоке, когда второй экземпляр попросил показать
    /// окно. Адресат сам переносит вызов в поток интерфейса.
    /// </param>
    /// <param name="guard">
    /// Держатель контроля. Его нельзя освобождать, пока приложение работает:
    /// иначе мьютекс освободится и следующий запуск сочтёт себя первым.
    /// Значение null при возврате true означает, что контроль недоступен и
    /// приложение работает без него (как в прежних версиях).
    /// </param>
    /// <returns>
    /// true — это первый экземпляр, можно запускаться;
    /// false — приложение уже работает, сигнал ему отправлен, нужно выйти.
    /// </returns>
    public static bool TryAcquire(Action onActivate, out SingleInstance? guard)
    {
        guard = null;
        Mutex? mutex = null;
        try
        {
            mutex = new Mutex(initiallyOwned: true, MutexName, out var createdNew);
            if (!createdNew)
            {
                // Экземпляр уже есть: просим его показаться и выходим.
                mutex.Dispose();
                NotifyRunningInstance();
                return false;
            }
        }
        catch (UnauthorizedAccessException)
        {
            // Доступ к существующему именованному объекту запрещён. Считаем,
            // что приложение уже запущено — второе окно не открываем.
            try { mutex?.Dispose(); } catch { }
            NotifyRunningInstance();
            return false;
        }
        catch
        {
            // Контроль организовать не удалось — стартуем без него.
            try { mutex?.Dispose(); } catch { }
            return true;
        }

        var instance = new SingleInstance(mutex!);
        instance.StartListening(onActivate);
        guard = instance;
        return true;
    }

    /// Фоновый поток, который ждёт просьбы показать окно от второго экземпляра.
    private void StartListening(Action onActivate)
    {
        EventWaitHandle activate;
        try
        {
            activate = new EventWaitHandle(false, EventResetMode.AutoReset, ActivateEventName);
            _activate = activate;
        }
        catch
        {
            // Событие недоступно: второй экземпляр по-прежнему не запустится,
            // но не сможет показать окно первого.
            _activate = null;
            return;
        }

        var stop = _cts.Token;
        _listener = new Thread(() =>
        {
            // Сигнал остановки будит ожидающий поток — иначе Dispose завис бы
            // до завершения процесса.
            using var wakeOnStop = stop.Register(() => { try { activate.Set(); } catch { } });
            while (!stop.IsCancellationRequested)
            {
                try { activate.WaitOne(); }
                catch { return; }
                if (stop.IsCancellationRequested) return;
                // Сбой показа окна не должен ронять приложение.
                try { onActivate(); } catch { }
            }
        })
        {
            IsBackground = true,
            Name = "YawaChat.SingleInstance",
        };
        _listener.Start();
    }

    /// Просит уже работающий экземпляр показать окно.
    private static void NotifyRunningInstance()
    {
        try
        {
            if (EventWaitHandle.TryOpenExisting(ActivateEventName, out var existing))
            {
                using (existing) existing.Set();
            }
            // События нет (например, первый экземпляр ещё стартует или завис) —
            // второй всё равно выходит: два окна на одних настройках хуже.
        }
        catch { /* показать окно не удалось — просто выходим */ }
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0) return;
        try { _cts.Cancel(); } catch { }
        try { _listener?.Join(500); } catch { }
        try { _cts.Dispose(); } catch { }
        try { _activate?.Dispose(); } catch { }
        try
        {
            // Мьютекс взят при создании (initiallyOwned) — освобождаем явно,
            // чтобы следующий запуск стал первым сразу, не дожидаясь выхода процесса.
            try { _mutex.ReleaseMutex(); } catch { }
            _mutex.Dispose();
        }
        catch { }
    }
}
