# ADB Shell

Нативное macOS-приложение (SwiftUI) для работы с Android-устройствами через `adb` —
в первую очередь для отладки медиасистемы Voyah по USB или по сети.

## Возможности

- Список подключённых устройств (USB и сетевой adb `connect ip:port`)
- Просмотр установленных приложений (пользовательские / системные), поиск
- Детали приложения: версия, target SDK, даты установки/обновления, путь к APK
- Просмотр и управление runtime-разрешениями (выдать / забрать)
- Установка / удаление APK
- Force stop, очистка данных, включение/отключение приложения
- Библиотека APK — локальная папка `~/Documents/AdbShell/APK`, куда можно
  перетащить `.apk`-файлы и установить их на устройство в один клик
- Простой shell-раннер (`adb shell <команда>`) и скриншот экрана устройства

## Требования

- macOS 13+
- `adb` в `PATH` (например, `brew install android-platform-tools`)
- Swift 5.9+ (входит в Command Line Tools, Xcode не обязателен)

## Запуск в режиме разработки

```bash
swift run
```

## Сборка приложения (.app)

```bash
./build_app.sh
open AdbShell.app
```

Скрипт собирает release-бинарник и упаковывает его в `AdbShell.app` с ad-hoc
подписью — можно перетащить в `/Applications` и запускать двойным кликом.

## Структура проекта

```
Sources/AdbShell/
  Models/       — Device, InstalledApp, AppDetail, AppPermission, ApkFile
  Services/     — ADBService (обёртка над CLI adb), DumpsysParser
  ViewModels/   — DevicesViewModel, AppsViewModel, AppDetailViewModel, ApkLibraryViewModel
  Views/        — ContentView, DeviceSidebarView, AppsView, AppDetailPanel, ApkLibraryView, ShellRunnerView
  Design/       — Theme.swift (цветовая палитра и компоненты)
```
