# ADB Shell Desktop (Electron)

Кроссплатформенный порт [ADB Shell](../README.md) — независимый Node/
TypeScript/Electron проект внутри этого же репозитория, не пересекается с
Swift-кодом в `../Sources/`. См. **[PLAN.md](PLAN.md)** — статус по фазам и
обоснование решений.

Сейчас (Фаза 1, начало): рабочий каркас — реальное Electron-окно, список
устройств через `adb devices -l`, подключение по IP. Остальные экраны ещё
не перенесены.

## Запуск в разработке

```bash
npm install
npm start
```

## Тесты

Только чистые функции парсинга (без Electron) — через встроенный тест-раннер
Node, без Jest/Vitest:

```bash
npm test
```

## Структура

```
desktop/
  src/
    main/
      main.ts        — точка входа Electron, создание окна, IPC-хендлеры
      preload.ts      — contextBridge, единственный мост renderer → main
      adb/
        AdbService.ts     — обёртка над CLI adb (порт ADBService.swift)
        parsers/          — чистые функции парсинга (порт Swift-парсеров,
                            те же тестовые кейсы)
        types/
    renderer/
      index.html
      renderer.ts     — рендерер, без фреймворка пока (см. PLAN.md)
      styles/theme.css — палитра портирована из Design/Theme.swift (CP.*)
    test/             — юнит-тесты (node --test)
```

## Почему Electron

Самый обкатанный в продакшене из рассмотренных вариантов (Tauri, Flutter,
Avalonia) — на нём держатся VS Code, Slack, Discord, Figma Desktop. Не
самый современный по архитектуре, зато с наибольшим запасом надёжности.
