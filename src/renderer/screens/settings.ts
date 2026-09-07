// Экран настроек приложения — порт SettingsView из
// Sources/AdbShell/Views/SettingsView.swift: пороги уведомлений
// (StatsAlertSettings.swift), глобальный хоткей, автопроверка обновлений,
// системные приложения по умолчанию, быстрая очистка истории shell/
// профилей, ручной выбор темы (ThemePreference.swift), ссылки на
// репозиторий, Releases и донат.

import { adbApi, el, errorMessage } from '../api.js';
import { t } from '../i18n.js';

const REPO_URL = 'https://github.com/andrei-s96s/adb-shell';

let enabledEl: HTMLInputElement;
let cpuEl: HTMLInputElement;
let batteryEl: HTMLInputElement;
let hotkeyEnabledEl: HTMLInputElement;
let hotkeyAcceleratorEl: HTMLInputElement;
let hotkeyStatusEl: HTMLSpanElement;
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
  hotkeyAcceleratorEl = el<HTMLInputElement>('settings-hotkey-accelerator');
  hotkeyStatusEl = el<HTMLSpanElement>('settings-hotkey-status');
  autoUpdateCheckEl = el<HTMLInputElement>('settings-auto-update-check');
  defaultSystemAppsEl = el<HTMLInputElement>('settings-default-system-apps');
  themeEl = el<HTMLSelectElement>('settings-theme');
  statusEl = el<HTMLDivElement>('settings-status');

  void load();

  for (const input of [
    enabledEl,
    cpuEl,
    batteryEl,
    hotkeyEnabledEl,
    hotkeyAcceleratorEl,
    autoUpdateCheckEl,
    defaultSystemAppsEl,
    themeEl,
  ]) {
    input.addEventListener('change', () => void save());
  }

  el<HTMLButtonElement>('settings-clear-shell-history').addEventListener('click', () => {
    adbApi
      .shellHistoryClear()
      .then(() => (statusEl.textContent = t('История shell очищена')))
      .catch((error) => (statusEl.textContent = `${t('Ошибка')}: ${errorMessage(error)}`));
  });
  el<HTMLButtonElement>('settings-clear-profiles').addEventListener('click', () => {
    adbApi
      .connectionProfilesClear()
      .then(() => (statusEl.textContent = t('Профили подключения очищены')))
      .catch((error) => (statusEl.textContent = `${t('Ошибка')}: ${errorMessage(error)}`));
  });
  el<HTMLButtonElement>('settings-open-repo').addEventListener('click', () => void adbApi.openExternal(REPO_URL));
  el<HTMLButtonElement>('settings-open-releases').addEventListener('click', () => void adbApi.openExternal(`${REPO_URL}/releases`));
  // Раньше открывала внешнюю страницу-донор в браузере -- теперь вся её
  // информация показана прямо в приложении, во вкладке "Донат" (donate.ts),
  // поэтому кнопка просто переключает на неё (тот же приём, что и переход
  // по результату вкладки в commandPalette.ts).
  el<HTMLButtonElement>('settings-open-donate').addEventListener('click', () => {
    document.querySelector<HTMLButtonElement>('#tabs button[data-tab="donate"]')?.click();
  });
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
    hotkeyAcceleratorEl.value = settings.screenshotHotkeyAccelerator ?? '';
    autoUpdateCheckEl.checked = settings.autoCheckUpdates;
    defaultSystemAppsEl.checked = settings.defaultShowSystemApps;
    themeEl.value = settings.themePreference;
    void refreshHotkeyStatus();
  } catch (error) {
    statusEl.textContent = `${t('Ошибка')}: ${errorMessage(error)}`;
  }
}

/** Бейдж "хоткей реально сейчас активен" -- тот же приём, что и у ⌨/⌨⚠ в
 * списке макросов (macros.ts): сочетание может быть настроено и включено,
 * но не зарегистрировано, если оно уже занято другим приложением/ОС --
 * без явной обратной связи пользователь не узнал бы об этом никак, кроме
 * как заметив, что хоткей "просто не работает". Пусто, если тумблер сейчас
 * выключен -- показывать предупреждение про заведомо выключенную функцию
 * только сбивало бы с толку. */
async function refreshHotkeyStatus(): Promise<void> {
  if (!hotkeyEnabledEl.checked) {
    hotkeyStatusEl.textContent = '';
    hotkeyStatusEl.title = '';
    return;
  }
  try {
    const active = await adbApi.settingsScreenshotHotkeyActive();
    hotkeyStatusEl.textContent = active ? t('⌨ активен') : t('⌨⚠ не активен');
    hotkeyStatusEl.title = active ? '' : t('Сочетание занято другим приложением или ОС -- попробуйте другое');
  } catch {
    hotkeyStatusEl.textContent = '';
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
      screenshotHotkeyAccelerator: hotkeyAcceleratorEl.value.trim() || undefined,
      autoCheckUpdates: autoUpdateCheckEl.checked,
      defaultShowSystemApps: defaultSystemAppsEl.checked,
      themePreference,
    });
    applyTheme(themePreference);
    statusEl.textContent = t('Сохранено');
    // main уже перерегистрировал хоткей синхронно внутри settings:update
    // (applyMacroHotkeys()+applyHotkeySetting() в main.ts) -- к этому
    // моменту сервер уже знает актуальное состояние.
    void refreshHotkeyStatus();
  } catch (error) {
    statusEl.textContent = `${t('Ошибка')}: ${errorMessage(error)}`;
  }
}
