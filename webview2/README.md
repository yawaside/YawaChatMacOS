# YawaChat — WebView2-оболочка

Порт десктоп-оболочки с **Electron на WebView2**. Интерфейс не изменён ни на пиксель:
окно рендерит ту же Vite-сборку (`dist/index.html`), что и раньше, — меняется только
«несущий» слой (main-процесс). Вместо Node.js/Chromium-связки — лёгкий exe на
.NET 8 с движком Edge WebView2 (поставляется с Windows 10/11).

## Как собрать

```bash
# 1) интерфейс (из корня репозитория)
npm install
npm run build            # → dist/index.html (single-file)

# 2) встроенный рантайм (Node.js + готовый TikTok-мост) — чтобы exe
#    был автономным и на ПК пользователя ничего ставить не требовалось
npm run bundle:runtime   # → webview2/runtime/node.exe + tiktok-bridge.zip

# 3) оболочка
cd webview2
dotnet restore
dotnet publish -c Release -r win-x64 --self-contained false
# готовый exe → bin/Release/net8.0-windows/win-x64/publish/YawaChat.exe
```

Шаг 2 опционален: без `webview2/runtime/` хост соберётся как раньше — с поиском
системного Node.js (dev-режим). Релизный CI вызывает `bundle-runtime` всегда.

## Журнал приложения

Все журналы хоста находятся в `%LOCALAPPDATA%\YawaChat\logs`: основной
`app.log` (запуск, статусы каналов, сбои интерфейса, настройки, виджет),
`crash.log` и подробные `bot.log`, `moderation.log`, `oauth.log`, `tiktok.log`.
Время — UTC, в каждой строке указаны уровень и источник. Каждый файл
ограничен 1 МБ и двумя предыдущими копиями (`.1` и `.2`): для шести видов
журналов максимум 18 МБ. Старые неограниченные файлы из `%TEMP%` удаляются
без переноса, так как в них могли остаться секреты.

В журнал не пишутся тексты сообщений, сырые ответы площадок, пароли прокси
и коды входа; возможные адреса и токены дополнительно вырезаются перед
записью. По умолчанию записываются уровни `INFO` и выше. Для подробной
диагностики можно запустить приложение с `YAWACHAT_LOG_LEVEL=Debug`.
Журналы никуда не отправляются автоматически. Отдельные проверки ротации
и маскирования запускаются командой
`dotnet run --project tests/LoggingTests/LoggingTests.csproj -c Release`.

Требования: .NET 8 SDK и WebView2 Runtime (в Win11 уже есть). Флаг `--dev` запускает
окно против `vite dev` (http://localhost:5173), `--hidden` — старт в трее.

## Настройки подключения озвучки

Адреса сервиса Edge TTS и версия протокола живут отдельным файлом
`%LOCALAPPDATA%\YawaChat\edge-tts.json`, рядом с `settings.json`. Файла нет —
он создаётся при первом запуске из встроенных значений.

- При запуске хост поднимает соединение; если оно не поднялось, он перебирает
  адреса из файла и версии браузера для токена, а рабочую связку записывает
  в файл первой. Пересобирать приложение при смене сервера не нужно.
- Кнопка «Обновить» в настройках озвучки запускает ту же проверку вручную:
  «Успех» — адрес и протокол в порядке; «Обновлено» — рабочим оказался другой
  адрес или версия, файл уже поправлен.
- Файл можно править вручную: порядок `endpoints` — приоритет адресов,
  `backup: true` — запасной адрес, `tokenVersion` — префикс версии токена
  (`Sec-MS-GEC-Version=<tokenVersion>-<chromium>`), `chromiumVersions` — версии
  браузера, первая предпочтительнее.
- Повреждённый файл не оставляет без озвучки: берутся встроенные значения, а
  испорченная копия сохраняется рядом как `edge-tts.json.broken`.

## Защита релизного exe от декомпиляции

Релизный single-file exe обфусцируется **только в CI** (release.yml), между
сборкой и single-file publish:

```
dotnet build  -c Release -r win-x64 --self-contained true
pwsh scripts/obfuscate.ps1 -BinDir webview2/bin/Release/net8.0-windows/win-x64
dotnet publish -p:PublishSingleFile=true ... --no-build
```

Обфускатор — [Obfuscar](https://github.com/obfuscar/Obfuscar) (MIT; версия
2.2.50 пакета `Obfuscar.GlobalTool` закреплена в скрипте — стабильная
ветка 2.x, 3.x пока не используется). Что закрывается в итоговом exe:

- имена всех типов/методов/полей (публичных и внутренних);
- строковые константы (XOR-шифрование);
- PDB в сборку не включается (`DebugType=none` — в них лежат пути к исходникам).

Имена **свойств** обфускация не трогает: это JSON-протокол с рендерером
(анонимные типы и `ChannelSubInput` сериализуются через рефлексию по именам
свойств). Встроенные ресурсы (рендерер, Node.js, TikTok-мост) сохраняются.

Скрипт проверяет результат перед заменой dll: сборка читается, JSON-протокол
цел, имена реально переименованы — иначе сборка падает, и битый exe в релиз
не попадает. Тот же шаг прогоняется в CI на каждый пуш (ci.yml).

Репозиторий при этом остаётся обычным: ни защищённых артефактов, ни секретов —
клонировать и собирать локально можно как раньше. Локальные сборки
обфускацией не покрываются (как и задумано: защита только для готового exe).

Подробности — в `Info/SECURITY-AUDIT.md`.

## Соответствие частям Electron-оболочки

| Electron (desktop/electron)          | WebView2 (webview2/)                                   |
| ------------------------------------ | ------------------------------------------------------ |
| main.js · BrowserWindow frame:false  | Program.cs · FormBorderStyle.None + WM_NCHITTEST       |
| ipcMain.handle("settings.*")         | HostApi settings.get/set → %LOCALAPPDATA%\...\settings.json |
| app.getPath("userData")              | %LOCALAPPDATA%\YawaChat                             |
| tray + контекстное меню              | NotifyIcon (Показать / Выход)                          |
| globalShortcut.register              | RegisterHotKey / WM_HOTKEY → событие `hotkey`          |
| tts.js (System.Speech / say)         | SapiTts.cs · COM «SAPI.SpVoice»                        |
| overlay.js (setIgnoreMouseEvents)    | OverlayWindow.cs · WS_EX_TRANSPARENT поверх игры       |
| widget-server (express → /widget)    | WidgetServer.cs · HttpListener + SSE /widget/events    |
| IPC main → renderer (chat message)   | PostWebMessageAsJson `{event:"chat.message"}`          |
| preload · contextBridge              | chrome.webview.postMessage + window.drag               |
| electron-updater / релизы            | без изменений: GitHub Actions (см. корень)             |
| проверка зависимостей при старте     | Prerequisites.cs · окно «Установить WebView2» + авто-установка |

## Протокол моста

Рендерер (src/lib/bridge.ts) шлёт `chrome.webview.postMessage({id, method, args})`,
хост отвечает `PostWebMessageAsJson({id, ok, result|error})`. События от хоста:
`{event, payload}` — `hotkey`, `chat.message`. В браузере (без WebView2)
включается прежний демо-режим, интерфейс работает как сайт-витрина.

## Коннекторы площадок (webview2/Connectors.cs)

В готовом приложении демо-режима нет: каналы подключаются реальными коннекторами
(мост `channels.connect/disconnect/reconnect`), события уходят в ленту, озвучку,
оверлей и SSE-виджет одновременно через `HostApi.PushChatMessage`.

| Площадка       | Протокол                                                          | Статус / что проверено                                              |
| -------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| Twitch         | IRC WebSocket `wss://irc-ws.chat.twitch.tv:443` + tags            | быстро: общий дедлайн 10 сек, JOIN не ждёт decapi; сообщения, цвета, бейджи, эмоуты, USERNOTICE; зрители — decapi в фоне (45 сек) |
| Kick           | REST `kick.com/api/v2/channels/{u}` → Pusher WS `chatrooms.{id}.v2` | стабильно: сообщения + эмоуты `[emote:id:name]`, бейджи, зрители (60 сек) |
| VK Play Live   | REST `api.live.vkvideo.ru/v1/blog/{u}` → Centrifugo WS `channel-chat:{id}` | живая проверка нужна: формат pub-сообщений разобран защитно (regex по nick/text) |
| YouTube Live   | параллельно `/live`, `/streams`, Innertube search → popout chat / `get_live_chat` | поиск ограничен 8 сек; HTML + `youtubei/v1/next` fallback; офлайн перепроверяется через 45 сек, чат — timed/invalidation/reload continuation |
| DonationAlerts | REST `user/oauth` (Bearer secret) → Centrifugo WS `$alerts:donation_{uid}` | по документации API v1; нужен реальный секретный токен из профиля |
| TikTok Live    | `tiktok-live-connector` через Node-мост `tiktok-bridge/bridge.js`   | стабильно: тот же путь, что в Electron-сборке YawaChat_Hub — комната ищется через `api-live/user/room`, чат берётся из `decodedData` + `chat`, подарки/подписки/лайки/зрители; **автономно: Node.exe и node_modules встроены в релизный exe** (`scripts/bundle-runtime.mjs` → ресурсы `yawa-node.exe`, `yawa-tiktok-bridge.zip`), на ПК ничего ставить не нужно |

Проверка в сборке: все коннекторы -managed, с токенами отмены и отчётом статуса
(`channel.status` → UI). Живое тестирование: подключить реальные каналы и смотреть
статусы — «подключение… → в эфире / офлайн / ошибка».
