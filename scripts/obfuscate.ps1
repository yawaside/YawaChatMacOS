#!/usr/bin/env pwsh
<#
Обфускация релизного YawaChat.dll (Obfuscar, MIT-лицензия).

Скрипт вызывается CI МЕЖДУ сборкой хоста и single-file publish:
защита попадает ТОЛЬКО в готовый релизный exe. Исходники репозитория,
локальные dev-сборки и сам git-репозиторий остаются обычными —
склонировать и собрать проект можно как раньше, никаких секретов
и подготовленных «защищённых» артефактов в репозитории нет.

Использование:
  pwsh scripts/obfuscate.ps1 -BinDir webview2/bin/Release/net8.0-windows/win-x64

Порядок (release.yml):
  1) dotnet build  -c Release -r win-x64 --self-contained true
  2) scripts/obfuscate.ps1 (этот скрипт)
  3) dotnet publish -p:PublishSingleFile=true ... --no-build

Инструмент закреплён: Obfuscar.GlobalTool 2.2.50 — СТАБИЛЬНАЯ версия
движка «Obfuscar for .NET» (линейка 3.x ещё beta — в CI не используем).
Важно: на NuGet два пакета — «Obfuscar» (legacy, .NET Framework, НЕ
dotnet-инструмент) и «Obfuscar.GlobalTool» (тот же движок, tool-упаковка).
Ставим именно GlobalTool.

Что делает:
  1) ставит Obfuscar.GlobalTool, если инструмента ещё нет;
  2) обфусцирует YawaChat.dll в отдельный временный каталог:
       - переименование ВСЕХ типов/методов/полей (публичных и внутренних) —
         KeepPublicApi=false + HidePrivateApi=true;
       - сокрытие строковых констант (в 2.x включено по умолчанию:
         константы уходят в XOR-кодированный буфер и не читаются
         strings/декомпилятором);
       - имена СВОЙСТВ не трогаются (RenameProperties=false) — это
         JSON-протокол с рендерером (анонимные типы и ChannelSubInput
         сериализуются через рефлексию по именам свойств);
       - встроенные ресурсы (интерфейс, Node.js, мост TikTok) сохраняются;
  3) ПРОВЕРЯЕТ результат до замены:
       - сборка читается как валидная .NET-сборка, точка входа на месте;
       - JSON-протокол (ChannelSubInput) цел — свойства на месте;
       - переименование реально произошло (старые имена исчезли);
  4) заменяет исходный dll обфусцированным.

Если результат не прошёл проверку — сборка ПАДАЕТ с ошибкой,
битый exe в релиз не попадает.
#>
param(
  [Parameter(Mandatory = $true)][string]$BinDir
)

$ErrorActionPreference = 'Stop'

$toolPackage = 'Obfuscar.GlobalTool'
$toolVersion = '2.2.50'

$dll = Join-Path $BinDir 'YawaChat.dll'
if (-not (Test-Path -LiteralPath $dll)) {
  throw "Не найден $dll. Сначала соберите хост: dotnet build webview2/YawaChat.WebView2.csproj -c Release -r win-x64 --self-contained true"
}

# ---------- 1. инструмент ----------
$obfuscarExe = $null
$cmd = Get-Command Obfuscar -ErrorAction SilentlyContinue
if ($cmd) { $obfuscarExe = $cmd.Source }
if (-not $obfuscarExe) {
  Write-Host "Устанавливаю $toolPackage (закреплённая стабильная версия $toolVersion)..."
  dotnet tool install --global $toolPackage --version $toolVersion
  if ($LASTEXITCODE -ne 0) { throw "Не удалось установить $toolPackage $toolVersion (dotnet tool install)" }
  # после установки каталог global-инструментов может ещё не быть в PATH
  $cmd = Get-Command Obfuscar -ErrorAction SilentlyContinue
  if ($cmd) { $obfuscarExe = $cmd.Source }
  else {
    # shim'ы global-инструментов лежат здесь независимо от PATH
    $shims = Join-Path $env:USERPROFILE '.dotnet\tools'
    $hit = Get-ChildItem -Path $shims -Filter 'obfuscar*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hit) { $obfuscarExe = $hit.FullName }
  }
  if (-not $obfuscarExe) { throw "$toolPackage установлен, но исполняемый файл не найден" }
}

# ---------- 2. обфускация ----------
$binDirAbs = (Resolve-Path -LiteralPath $BinDir).Path
$dllAbs = (Resolve-Path -LiteralPath $dll).Path
$outDir = Join-Path ([System.IO.Path]::GetTempPath()) ('yawa-obfuscar-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $outDir | Out-Null
try {
  # Схема конфигурации 2.2.x (проверена по документации Obfuscar):
  #   InPath / OutPath  — абсолютные пути (ввод для резолвинга / вывод);
  #   KeepPublicApi=false + HidePrivateApi=true — переименовать всё;
  #   RenameProperties=false — имена свойств = JSON-протокол, не трогаем;
  #   HideStrings/SuppressIldasm включены явно, чтобы поведение не зависело от defaults версии.
  $configXml = @"
<?xml version="1.0" encoding="utf-8"?>
<Obfuscator>
  <Var name="InPath" value="$binDirAbs" />
  <Var name="OutPath" value="$outDir" />
  <Var name="KeepPublicApi" value="false" />
  <Var name="HidePrivateApi" value="true" />
  <Var name="RenameFields" value="true" />
  <Var name="RenameProperties" value="false" />
  <Var name="HideStrings" value="true" />
  <Var name="SuppressIldasm" value="true" />
  <Module file="$dllAbs">
    <SkipType name="YawaChat.ChannelSubInput" />
  </Module>
</Obfuscator>
"@
  $configPath = Join-Path $outDir 'Obfuscar.xml'
  Set-Content -LiteralPath $configPath -Value $configXml -Encoding utf8

  Write-Host "Обфускация: $dllAbs"
  & $obfuscarExe $configPath
  if ($LASTEXITCODE -ne 0) { throw "Обфускация завершилась с ошибкой (код $LASTEXITCODE)" }

  $obfDll = Join-Path $outDir 'YawaChat.dll'
  if (-not (Test-Path -LiteralPath $obfDll)) {
    throw 'Obfuscar не создал YawaChat.dll в каталоге вывода'
  }

  # ---------- 3. проверка результата ----------
  Write-Host 'Проверяю обфусцированную сборку...'
  $asm = [System.Reflection.Assembly]::LoadFile((Resolve-Path -LiteralPath $obfDll).Path)
  if (-not $asm.EntryPoint) { throw 'Обфусцированная сборка без точки входа' }

  # JSON-протокол обязан остаться: рендерер и хост договариваются
  # по именам свойств ChannelSubInput.
  $sub = $asm.GetType('YawaChat.ChannelSubInput')
  if (-not $sub) { throw 'Обфускация сломала тип YawaChat.ChannelSubInput (JSON-протокол)' }
  $propNames = ($sub.GetProperties() | ForEach-Object { $_.Name }) -join ','
  foreach ($required in 'platform', 'username', 'token', 'currency') {
    if ($propNames -notlike "*$required*") {
      throw "Обфускация сломала JSON-протокол: свойства [$propNames]"
    }
  }

  # Проверяем, что защита охватила не одну случайную точку, а ключевые
  # компоненты хоста. При регрессии настройки CI/release завершатся ошибкой.
  foreach ($typeName in @(
    'YawaChat.HostApi',
    'YawaChat.AppAuth',
    'YawaChat.ConnectorManager',
    'YawaChat.TwitchIrcConnector',
    'YawaChat.OverlayWindow',
    'YawaChat.WidgetServer'
  )) {
    if ($asm.GetType($typeName)) {
      throw "Обфускация не переименовала $typeName — сборка не будет опубликована"
    }
  }
  if ($asm.GetType('YawaChat.Program')) {
    Write-Host 'Точка входа Program оставлена без переименования; проверка ключевых компонентов пройдена.'
  }

  # Строковые литералы с внутренними адресами/энтропией не должны оставаться
  # открытыми в IL. Это также подтверждает работу HideStrings в закреплённой версии.
  $rawText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($obfDll))
  foreach ($sentinel in @('YawaChat/settings/v1', 'irc-ws.chat.twitch.tv')) {
    if ($rawText.Contains($sentinel)) {
      throw "В obfuscated-сборке осталась открытая строковая константа: $sentinel"
    }
  }

  # Встроенный интерфейс должен сохраниться после обработки сборки.
  if ($asm.GetManifestResourceNames() -notcontains 'yawa-renderer-index.html') {
    throw 'Обфускация потеряла встроенный интерфейс приложения'
  }

  # ---------- 4. замена ----------
  Copy-Item -LiteralPath $obfDll -Destination $dll -Force
  $kb = [math]::Round((Get-Item -LiteralPath $dll).Length / 1KB, 0)
  Write-Host "Готово: YawaChat.dll обфусцирован ($kb КБ). Имена типов/методов/полей и строковые константы в релизном exe закрыты."
}
finally {
  Remove-Item -LiteralPath $outDir -Recurse -Force -ErrorAction SilentlyContinue
}
