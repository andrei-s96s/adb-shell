import { adbApi, el, errorMessage } from './api.js';
import type { Device } from './api.js';
import { setCurrentSerial, getCurrentSerial } from './state.js';
import { initTabs } from './tabs.js';
import { initAppsScreen } from './screens/apps.js';
import { initApkLibraryScreen } from './screens/apkLibrary.js';
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
const pairBtn = el<HTMLButtonElement>('pair-btn');
const pairHostInput = el<HTMLInputElement>('pair-host');
const pairCodeInput = el<HTMLInputElement>('pair-code');

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
    li.className = 'row' + (device.serial === getCurrentSerial() ? ' selected' : '');

    const label = document.createElement('span');
    label.textContent = `${device.model ?? device.serial} — ${device.state}`;
    label.style.cursor = 'pointer';
    label.addEventListener('click', () => selectDevice(device.serial));
    li.appendChild(label);

    if (device.serial.includes(':')) {
      const disconnectBtn = document.createElement('button');
      disconnectBtn.textContent = '✕';
      disconnectBtn.title = 'Отключить';
      disconnectBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        void (async () => {
          try {
            await adbApi.disconnect(device.serial);
            if (getCurrentSerial() === device.serial) selectDevice(undefined);
            await refreshDevices();
          } catch (error) {
            statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
          }
        })();
      });
      li.appendChild(disconnectBtn);
    }

    deviceListEl.appendChild(li);
  }
}

function selectDevice(serial: string | undefined): void {
  // #content (вкладки) видны ВСЕГДА, вне зависимости от выбора устройства —
  // раньше вся навигация блокировалась до выбора устройства, тот же класс
  // ошибки, что уже чинили в Swift-версии для библиотеки APK ("доступна и
  // без подключённого устройства"). Каждый экран сам решает, что показать
  // при отсутствии serial (см. onDeviceChanged в screens/*.ts), а не прячется
  // целиком за пределами достижимости.
  setCurrentSerial(serial);
  renderDeviceList();
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

pairBtn.addEventListener('click', () => {
  void (async () => {
    const hostPort = pairHostInput.value.trim();
    const code = pairCodeInput.value.trim();
    if (!hostPort || !code) return;
    statusEl.textContent = 'Сопряжение…';
    try {
      const result = await adbApi.pair(hostPort, code);
      statusEl.textContent = result;
      pairHostInput.value = '';
      pairCodeInput.value = '';
    } catch (error) {
      statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
    }
  })();
});

initTabs();
initAppsScreen();
initApkLibraryScreen();
initFilesScreen();
initShellScreen();
initToolsScreen();
initMonitorScreen();
initLogcatScreen();
selectDevice(undefined);
void refreshDevices();
