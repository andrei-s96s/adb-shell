// Аналог UserDefaults в Swift-версии для мелких скалярных настроек уровня
// приложения — StatsAlertSettings.swift (пороги CPU/батареи) читает те же
// ключи, что пишет SettingsView через @AppStorage. Здесь это один плоский
// JSON-объект в userData/app-settings.json — новые настройки (например,
// тумблер глобального хоткея скриншота из следующей волны) добавляются
// новым полем в тот же файл, а не отдельным стором на каждую мелочь.

import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface AppSettings {
  statsAlertsEnabled: boolean;
  statsAlertCpuThreshold: number;
  statsAlertBatteryThreshold: number;
}

const CONFIG_FILE = 'app-settings.json';

const DEFAULTS: AppSettings = {
  statsAlertsEnabled: false,
  statsAlertCpuThreshold: 90,
  statsAlertBatteryThreshold: 15,
};

export class AppSettingsStore {
  private settings: AppSettings;

  constructor() {
    this.settings = { ...DEFAULTS, ...this.load() };
  }

  private get configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILE);
  }

  private load(): Partial<AppSettings> {
    try {
      const raw = fs.readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as Partial<AppSettings>) : {};
    } catch {
      return {};
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(this.settings));
    } catch {
      // Не критично — просто не переживёт перезапуск.
    }
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
