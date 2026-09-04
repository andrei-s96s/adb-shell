// Экран настроек приложения — порт SettingsView из
// Sources/AdbShell/Views/SettingsView.swift: пороги уведомлений
// (StatsAlertSettings.swift), глобальный хоткей, автопроверка обновлений,
// системные приложения по умолчанию, быстрая очистка истории shell/
// профилей, ссылки на репозиторий и Releases.
//
// Сознательно не перенесено: ручной выбор темы (Системная/Светлая/Тёмная) --
// theme.css уже следует системной теме через prefers-color-scheme, а
// доп. тумблер "всегда светлая/тёмная" для инструмента, который и так
// корректно следует системе, не стоил отдельной ревизии в рамках переноса.

import { adbApi, el, errorMessage } from '../api.js';

const REPO_URL = 'https://github.com/andrei-s96s/adb-shell';

let enabledEl: HTMLInputElement;
let cpuEl: HTMLInputElement;
let batteryEl: HTMLInputElement;
let hotkeyEnabledEl: HTMLInputElement;
let autoUpdateCheckEl: HTMLInputElement;
let defaultSystemAppsEl: HTMLInputElement;
let statusEl: HTMLDivElement;

export function initSettingsScreen(): void {
  enabledEl = el<HTMLInputElement>('settings-alerts-enabled');
  cpuEl = el<HTMLInputElement>('settings-cpu-threshold');
  batteryEl = el<HTMLInputElement>('settings-battery-threshold');
  hotkeyEnabledEl = el<HTMLInputElement>('settings-hotkey-enabled');
  autoUpdateCheckEl = el<HTMLInputElement>('settings-auto-update-check');
  defaultSystemAppsEl = el<HTMLInputElement>('settings-default-system-apps');
  statusEl = el<HTMLDivElement>('settings-status');

  void load();

  for (const input of [enabledEl, cpuEl, batteryEl, hotkeyEnabledEl, autoUpdateCheckEl, defaultSystemAppsEl]) {
    input.addEventListener('change', () => void save());
  }

  el<HTMLButtonElement>('settings-clear-shell-history').addEventListener('click', () => {
    adbApi
      .shellHistoryClear()
      .then(() => (statusEl.textContent = 'История shell очищена'))
      .catch((error) => (statusEl.textContent = `Ошибка: ${errorMessage(error)}`));
  });
  el<HTMLButtonElement>('settings-clear-profiles').addEventListener('click', () => {
    adbApi
      .connectionProfilesClear()
      .then(() => (statusEl.textContent = 'Профили подключения очищены'))
      .catch((error) => (statusEl.textContent = `Ошибка: ${errorMessage(error)}`));
  });
  el<HTMLButtonElement>('settings-open-repo').addEventListener('click', () => void adbApi.openExternal(REPO_URL));
  el<HTMLButtonElement>('settings-open-releases').addEventListener('click', () => void adbApi.openExternal(`${REPO_URL}/releases`));
}

/** Значение, применённое при загрузке вкладки Приложения по умолчанию --
 * читается apps.ts один раз при инициализации экрана. */
export async function loadDefaultShowSystemApps(): Promise<boolean> {
  try {
    return (await adbApi.settingsGet()).defaultShowSystemApps;
  } catch {
    return false;
  }
}

async function load(): Promise<void> {
  try {
    const settings = await adbApi.settingsGet();
    enabledEl.checked = settings.statsAlertsEnabled;
    cpuEl.value = String(settings.statsAlertCpuThreshold);
    batteryEl.value = String(settings.statsAlertBatteryThreshold);
    hotkeyEnabledEl.checked = settings.globalScreenshotHotkeyEnabled;
    autoUpdateCheckEl.checked = settings.autoCheckUpdates;
    defaultSystemAppsEl.checked = settings.defaultShowSystemApps;
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}

async function save(): Promise<void> {
  const cpu = Number.parseFloat(cpuEl.value);
  const battery = Number.parseFloat(batteryEl.value);
  try {
    await adbApi.settingsUpdate({
      statsAlertsEnabled: enabledEl.checked,
      statsAlertCpuThreshold: Number.isFinite(cpu) ? cpu : 90,
      statsAlertBatteryThreshold: Number.isFinite(battery) ? battery : 15,
      globalScreenshotHotkeyEnabled: hotkeyEnabledEl.checked,
      autoCheckUpdates: autoUpdateCheckEl.checked,
      defaultShowSystemApps: defaultSystemAppsEl.checked,
    });
    statusEl.textContent = 'Сохранено';
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}
