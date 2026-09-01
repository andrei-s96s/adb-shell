# ADB Shell Desktop (Electron)

Кроссплатформенный порт [ADB Shell](../README.md) — независимый Node/
TypeScript/Electron проект внутри этого же репозитория, не пересекается с
Swift-кодом в `../Sources/`. См. **[PLAN.md](PLAN.md)** — статус по фазам и
обоснование решений.

Сейчас: устройства (список, подключение по IP), приложения (список,
детали, runtime-разрешения, force-stop/очистка данных/enable-disable/
удаление), файловый браузер устройства, Shell-раннер, Wi-Fi ADB, проброс
портов, свойства устройства с поиском, мониторинг (CPU/RAM/батарея,
процессы) и Logcat (живой стрим с фильтрами). Упаковано под Windows
(NSIS) и macOS (zip) через electron-builder. Ещё не перенесено: макросы,
зеркалирование экрана, снапшоты устройства, F-Droid обновления,
автообновление приложения — см. **[PLAN.md](PLAN.md)**.

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
      error-handler.js — classic-скрипт, ловит ошибки загрузки модулей
                          в DOM (CSP не пускает инлайн-скрипты в index.html)
      api.ts          — типизированная обёртка над window.adbApi + свои
                          копии типов (не импортируются из main/ — иначе
                          отдельный tsconfig.renderer.json с ES-модулями
                          пере-эмитит файл main/commonjs поверх самого себя)
      state.ts        — текущее выбранное устройство + подписка на смену
      tabs.ts         — переключение вкладок
      renderer.ts     — точка входа, список устройств, без фреймворка
                          пока (см. PLAN.md)
      screens/        — apps.ts, files.ts, shellScreen.ts, tools.ts —
                          по одному модулю на вкладку
      styles/theme.css — палитра портирована из Design/Theme.swift (CP.*)
    test/             — юнит-тесты (node --test)
```

Два tsconfig — `tsconfig.json` (main, CommonJS) и `tsconfig.renderer.json`
(renderer, ES-модули, т.к. renderer.js грузится как `<script type="module">`
— без этого повторная загрузка скрипта кидала "Identifier already
declared"). Относительные импорты внутри renderer обязаны писаться с
явным `.js` (`from './api.js'`, не `from './api'`) — нативный ESM в
браузере не резолвит расширения сам, а `moduleResolution: "bundler"` в
tsconfig их и не добавляет.

## Почему Electron

Самый обкатанный в продакшене из рассмотренных вариантов (Tauri, Flutter,
Avalonia) — на нём держатся VS Code, Slack, Discord, Figma Desktop. Не
самый современный по архитектуре, зато с наибольшим запасом надёжности.
