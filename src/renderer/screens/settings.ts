// Экран настроек приложения — порт SettingsView из
// Sources/AdbShell/Views/SettingsView.swift: пороги уведомлений
// (StatsAlertSettings.swift), глобальный хоткей, автопроверка обновлений,
// системные приложения по умолчанию, быстрая очистка истории shell/
// профилей, ручной выбор темы (ThemePreference.swift), ссылки на
// репозиторий, Releases и донат.

import { adbApi, el, errorMessage } from '../api.js';

const REPO_URL = 'https://github.com/andrei-s96s/adb-shell';
const DONATE_URL = 'https://andrei-s96s.github.io/adb-shell/';

let enabledEl: HTMLInputElement;
let cpuEl: HTMLInputElement;
let batteryEl: HTMLInputElement;
let hotkeyEnabledEl: HTMLInputElement;
let autoUpdateCheckEl: HTMLInputElement;
let defaultSystemAppsEl: HTMLInputElement;
let themeEl: HTMLSelectElement;
let statusEl: HTMLDivElement;

/** Применяет выбор темы к документу -- data-theme="light"/"dark" форсирует
 * конкретную тему в theme.css, отсутствие атрибута ("system") оставляет
 * решение за prefers-color-scheme. Вызывается и здесь при сохранении
 * настройки, и один раз при старте рендерера (renderer.ts), чтобы тема не
 * "мигала" системной, пока пользователь не откроет вкладку Настройки. */
export function applyTheme(preference: 'system' | 'light' | 'dark'): void {
  if (preference === 'system') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = preference;
  }
}

export function initSettingsScreen(): void {
  enabledEl = el<HTMLInputElement>('settings-alerts-enabled');
  cpuEl = el<HTMLInputElement>('settings-cpu-threshold');
  batteryEl = el<HTMLInputElement>('settings-battery-threshold');
  hotkeyEnabledEl = el<HTMLInputElement>('settings-hotkey-enabled');
  autoUpdateCheckEl = el<HTMLInputElement>('settings-auto-update-check');
  defaultSystemAppsEl = el<HTMLInputElement>('settings-default-system-apps');
  themeEl = el<HTMLSelectElement>('settings-theme');
  statusEl = el<HTMLDivElement>('settings-status');

  void load();

  for (const input of [enabledEl, cpuEl, batteryEl, hotkeyEnabledEl, autoUpdateCheckEl, defaultSystemAppsEl, themeEl]) {
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
  el<HTMLButtonElement>('settings-open-donate').addEventListener('click', () => void adbApi.openExternal(DONATE_URL));
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
    themeEl.value = settings.themePreference;
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}

async function save(): Promise<void> {
  const cpu = Number.parseFloat(cpuEl.value);
  const battery = Number.parseFloat(batteryEl.value);
  const themePreference = themeEl.value as 'system' | 'light' | 'dark';
  try {
    await adbApi.settingsUpdate({
      statsAlertsEnabled: enabledEl.checked,
      statsAlertCpuThreshold: Number.isFinite(cpu) ? cpu : 90,
      statsAlertBatteryThreshold: Number.isFinite(battery) ? battery : 15,
      globalScreenshotHotkeyEnabled: hotkeyEnabledEl.checked,
      autoCheckUpdates: autoUpdateCheckEl.checked,
      defaultShowSystemApps: defaultSystemAppsEl.checked,
      themePreference,
    });
    applyTheme(themePreference);
    statusEl.textContent = 'Сохранено';
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}
