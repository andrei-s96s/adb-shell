// Аналог UserDefaults в Swift-версии для мелких скалярных настроек уровня
// приложения — StatsAlertSettings.swift (пороги CPU/батареи) читает те же
// ключи, что пишет SettingsView через @AppStorage. Здесь это один плоский
// JSON-объект в userData/app-settings.json — новые настройки (например,
// тумблер глобального хоткея скриншота из следующей волны) добавляются
// новым полем в тот же файл, а не отдельным стором на каждую мелочь.

import { app } from 'electron';
import * as path from 'node:path';
import { loadJsonStore, saveJsonStore } from '../util/jsonStore';

/** Сочетание по умолчанию для globalScreenshotHotkeyEnabled --
 * используется, когда screenshotHotkeyAccelerator не задан явно (в т.ч. у
 * всех настроек, сохранённых до появления кастомизации). */
export const DEFAULT_SCREENSHOT_HOTKEY = 'CommandOrControl+Shift+S';

export interface AppSettings {
  statsAlertsEnabled: boolean;
  statsAlertCpuThreshold: number;
  statsAlertBatteryThreshold: number;
  /** Глобальный хоткей -- тихий скриншот выбранного устройства прямо на
   * Рабочий стол, работает даже когда окно не в фокусе. Аналог
   * @AppStorage("globalScreenshotHotkeyEnabled") в Swift-версии. */
  globalScreenshotHotkeyEnabled: boolean;
  /** Конкретное сочетание клавиш (формат Electron Accelerator) --
   * undefined/пусто -- используется DEFAULT_SCREENSHOT_HOTKEY. Появилось
   * позже самого тумблера выше -- у настроек, сохранённых до этого,
   * просто отсутствует, что корректно читается как "не переопределён". */
  screenshotHotkeyAccelerator?: string;
  /** Показывать системные приложения по умолчанию при открытии вкладки
   * Приложения (сам чекбокс в тулбаре по-прежнему можно переключить). */
  defaultShowSystemApps: boolean;
  /** Проверять обновления приложения при каждом запуске. */
  autoCheckUpdates: boolean;
  /** Ручной выбор темы поверх системной -- порт ThemePreference.swift.
   * "system" следует prefers-color-scheme (как было по умолчанию до этого
   * поля), "light"/"dark" форсируют конкретную тему независимо от ОС. */
  themePreference: 'system' | 'light' | 'dark';
  /** Язык интерфейса. Применяется целиком при старте рендерера (см.
   * renderer.ts/i18n.ts) -- смена в Настройках требует перезапуска
   * приложения, а не перерисовки уже построенного интерфейса на лету. */
  locale: 'ru' | 'en';
}

const CONFIG_FILE = 'app-settings.json';

const DEFAULTS: AppSettings = {
  statsAlertsEnabled: false,
  statsAlertCpuThreshold: 90,
  statsAlertBatteryThreshold: 15,
  globalScreenshotHotkeyEnabled: false,
  defaultShowSystemApps: false,
  autoCheckUpdates: true,
  // Swift-оригинал по умолчанию форсировал тёмную тему (не "системную") --
  // тот же выбор здесь, палитра CP.* и задумана в первую очередь как тёмная.
  themePreference: 'dark',
  locale: 'ru',
};

export class AppSettingsStore {
  private settings: AppSettings;

  constructor() {
    const loaded = loadJsonStore<Partial<AppSettings>>(this.configPath, (p) => !!p && typeof p === 'object', {});
    // locale отсутствует в сохранённом файле и у пользователя, впервые
    // запустившего версию, где появилось это поле, и у по-настоящему нового
    // пользователя -- в обоих случаях явного выбора ещё не было, поэтому
    // подставляем язык ОС, а не жёстко DEFAULTS.locale. Дальше это уже
    // обычное персистентное поле: один раз сохранённый (в т.ч. этим же
    // выводом) выбор всегда побеждает при следующих запусках.
    const inferredLocale = loaded.locale ?? (app.getLocale().toLowerCase().startsWith('ru') ? 'ru' : 'en');
    this.settings = { ...DEFAULTS, ...loaded, locale: inferredLocale };
  }

  private get configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILE);
  }

  private save(): void {
    saveJsonStore(this.configPath, this.settings);
  }

  get(): AppSettings {
    return this.settings;
  }

  update(partial: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...partial };
    this.save();
    return this.settings;
  }
}
