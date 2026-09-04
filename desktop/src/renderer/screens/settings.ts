// Экран настроек приложения. Пока только пороги CPU/батареи для
// уведомлений (StatsAlertSettings.swift) — следующая волна добавит сюда же
// тумблер глобального хоткея скриншота, в тот же userData/app-settings.json.

import { adbApi, el, errorMessage } from '../api.js';

let enabledEl: HTMLInputElement;
let cpuEl: HTMLInputElement;
let batteryEl: HTMLInputElement;
let statusEl: HTMLDivElement;

export function initSettingsScreen(): void {
  enabledEl = el<HTMLInputElement>('settings-alerts-enabled');
  cpuEl = el<HTMLInputElement>('settings-cpu-threshold');
  batteryEl = el<HTMLInputElement>('settings-battery-threshold');
  statusEl = el<HTMLDivElement>('settings-status');

  void load();

  for (const input of [enabledEl, cpuEl, batteryEl]) {
    input.addEventListener('change', () => void save());
  }
}

async function load(): Promise<void> {
  try {
    const settings = await adbApi.settingsGet();
    enabledEl.checked = settings.statsAlertsEnabled;
    cpuEl.value = String(settings.statsAlertCpuThreshold);
    batteryEl.value = String(settings.statsAlertBatteryThreshold);
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
    });
    statusEl.textContent = 'Сохранено';
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}
