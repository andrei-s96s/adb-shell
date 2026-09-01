import { adbApi, el, errorMessage } from './api.js';
import type { Device } from './api.js';
import { setCurrentSerial, getCurrentSerial } from './state.js';
import { initTabs } from './tabs.js';
import { initAppsScreen } from './screens/apps.js';
import { initFilesScreen } from './screens/files.js';
import { initShellScreen } from './screens/shellScreen.js';
import { initToolsScreen } from './screens/tools.js';
import { initMonitorScreen } from './screens/monitor.js';
import { initLogcatScreen } from './screens/logcat.js';

const deviceListEl = el<HTMLUListElement>('device-list');
const statusEl = el<HTMLDivElement>('status');
const refreshBtn = el<HTMLButtonElement>('refresh-btn');
const connectBtn = el<HTMLButtonElement>('connect-btn');
const connectHostInput = el<HTMLInputElement>('connect-host');
const contentEl = el<HTMLDivElement>('content');
const noDeviceHintEl = el<HTMLParagraphElement>('no-device-hint');

let devices: Device[] = [];

async function refreshDevices(): Promise<void> {
  statusEl.textContent = 'Обновление…';
  try {
    devices = await adbApi.listDevices();
    renderDeviceList();
    statusEl.textContent = '';

    const current = getCurrentSerial();
    if (current && !devices.some((d) => d.serial === current)) {
      selectDevice(undefined);
    }
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}

function renderDeviceList(): void {
  deviceListEl.innerHTML = '';
  if (devices.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Нет подключённых устройств';
    deviceListEl.appendChild(li);
    return;
  }
  for (const device of devices) {
    const li = document.createElement('li');
    li.className = device.serial === getCurrentSerial() ? 'selected' : '';
    li.textContent = `${device.model ?? device.serial} — ${device.state}`;
    li.addEventListener('click', () => selectDevice(device.serial));
    deviceListEl.appendChild(li);
  }
}

function selectDevice(serial: string | undefined): void {
  setCurrentSerial(serial);
  renderDeviceList();
  contentEl.style.display = serial ? 'flex' : 'none';
  noDeviceHintEl.style.display = serial ? 'none' : 'block';
}

refreshBtn.addEventListener('click', () => void refreshDevices());

connectBtn.addEventListener('click', () => {
  void (async () => {
    const host = connectHostInput.value.trim();
    if (!host) return;
    statusEl.textContent = 'Подключение…';
    try {
      const result = await adbApi.connect(host);
      statusEl.textContent = result;
      await refreshDevices();
    } catch (error) {
      statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
    }
  })();
});

initTabs();
initAppsScreen();
initFilesScreen();
initShellScreen();
initToolsScreen();
initMonitorScreen();
initLogcatScreen();
selectDevice(undefined);
void refreshDevices();
