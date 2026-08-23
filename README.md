# ADB Shell

Нативное macOS-приложение (SwiftUI) для работы с любыми Android-устройствами
через `adb`: просмотр и управление приложениями, разрешения, установка APK,
shell и скриншоты — по USB или по сети.

## Скачать готовое приложение

Собранная `.app` публикуется автоматически на каждый релиз:
**[скачать последнюю версию](https://github.com/andrei-s96s/adb-shell/releases/latest)**
(файл `AdbShell-macOS.zip`).

`adb` (Android Platform Tools, Apache-2.0) вшит прямо в `.app` — отдельно
ставить его на Mac не нужно, ничего больше скачивать не требуется.

Приложение не подписано платным Apple Developer ID и не нотаризовано, поэтому
при первом запуске Gatekeeper может отказать. Снять карантин после распаковки:

```bash
xattr -cr AdbShell.app
```

и/или через Finder: правый клик по `AdbShell.app` → «Открыть» → «Открыть» в
диалоге предупреждения. Само приложение умеет проверять обновления при
запуске и предлагает поставить новую версию в один клик (кнопка «Проверить
обновления» / баннер в сайдбаре).

## Возможности

- Список подключённых устройств (USB и сетевой adb `connect ip:port`)
- Просмотр установленных приложений (пользовательские / системные), поиск
- Детали приложения: версия, target SDK, даты установки/обновления, путь к APK
- Просмотр и управление runtime-разрешениями (выдать / забрать)
- Установка / удаление APK
- Force stop, очистка данных, включение/отключение приложения
- Библиотека APK — локальная папка (по умолчанию `~/Documents/AdbShell/APK`,
  путь можно сменить), куда можно перетащить `.apk`-файлы и установить их на
  устройство в один клик; доступна и без подключённого устройства
- Shell-раннер (`adb shell <команда>`) с персистентной историей и избранным,
  скриншот экрана устройства
- Live Logcat: стриминг `adb logcat`, фильтр по тексту/уровню, подсветка ошибок
- Экспорт списка установленных пакетов в CSV
- Индикатор версии/сборки Android устройства в шапке
- Файловый браузер устройства: навигация, push/pull (в т.ч. drag&drop),
  создание папок, удаление, экспорт APK установленного приложения на Mac
- Пакетная установка/удаление приложений с отчётом по каждому элементу
- Проверка обновлений на GitHub Releases и самообновление приложения

## Требования

Для готового релиза (см. выше) — только macOS 13+, ничего ставить не нужно.

Для сборки из исходников:
- macOS 13+
- Swift 5.9+ (входит в Command Line Tools, Xcode не обязателен)
- `adb` в `PATH` только для `swift run` (например,
  `brew install android-platform-tools`) — `build_app.sh` сам скачивает и
  вшивает adb в `.app`, системный нужен лишь для запуска через `swift run`

## Запуск в режиме разработки

```bash
swift run
```

## Тесты

```bash
swift test
```

Юнит-тесты покрывают парсинг `dumpsys package` (версии, runtime/install-time
разрешения), парсинг `adb devices -l`, склейку списка пакетов и сравнение
версий для автообновления. На машине без полного Xcode (только Command Line
Tools) `swift test` может не найти модуль `Testing` — это ограничение
локального окружения, в CI (GitHub Actions, полный Xcode) тесты гоняются
штатно на каждый push.

## Сборка приложения (.app)

```bash
./build_app.sh
open AdbShell.app
```

Скрипт собирает release-бинарник, скачивает (кеширует в `.build/`) и вшивает
`adb` из официальных Android Platform Tools, упаковывает всё в `AdbShell.app`
с ad-hoc подписью — можно перетащить в `/Applications` и запускать двойным
кликом.

## Релиз новой версии

1. Обновить `AppVersion.current` в
   [UpdateService.swift](Sources/AdbShell/Services/UpdateService.swift) и
   `CFBundleShortVersionString`/`CFBundleVersion` в
   [Resources/Info.plist](Resources/Info.plist).
2. Запушить тег `vX.Y.Z` — workflow
   [release.yml](.github/workflows/release.yml) соберёт `.app`, упакует в
   `AdbShell-macOS.zip` и опубликует на GitHub Releases.

## Структура проекта

```
Sources/AdbShell/
  Models/       — Device, InstalledApp, AppDetail, AppPermission, ApkFile
  Services/     — ADBService (обёртка над CLI adb), DumpsysParser, UpdateService
  ViewModels/   — DevicesViewModel, AppsViewModel, AppDetailViewModel, ApkLibraryViewModel
  Views/        — ContentView, DeviceSidebarView, AppsView, AppDetailPanel, ApkLibraryView, ShellRunnerView
  Design/       — Theme.swift (цветовая палитра и компоненты)
Tests/AdbShellTests/ — юнит-тесты (Swift Testing)
```

См. [ROADMAP.md](ROADMAP.md) — план развития по версиям.

## Лицензии

`adb` — часть Android Platform Tools от Google, распространяется под
Apache License 2.0; при сборке `.app` рядом кладётся `adb-NOTICE.txt` с
атрибуцией. Исходники ADB Shell — см. лицензию репозитория.
