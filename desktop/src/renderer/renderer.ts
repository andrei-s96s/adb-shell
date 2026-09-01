// Простой DOM-скрипт без фреймворка (см. PLAN.md — React и т.п. добавим,
// когда экран реально разрастётся). Загружается как обычный <script>, а не
// как модуль — поэтому никаких import/export здесь: window.adbApi доступен
// как ambient-глобал через contextBridge (preload.ts).

interface DeviceSummary {
  serial: string;
  state: string;
  model?: string;
}

const adbApi = (window as unknown as {
  adbApi: {
    listDevices(): Promise<DeviceSummary[]>;
    connect(host: string): Promise<string>;
    shell(serial: string, command: string): Promise<string>;
  };
}).adbApi;

const deviceListEl = document.getElementById('device-list') as HTMLUListElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
const connectBtn = document.getElementById('connect-btn') as HTMLButtonElement;
const connectHostInput = document.getElementById('connect-host') as HTMLInputElement;

async function refreshDevices(): Promise<void> {
  statusEl.textContent = 'Обновление…';
  try {
    const devices = await adbApi.listDevices();
    deviceListEl.innerHTML = '';
    if (devices.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Нет подключённых устройств';
      deviceListEl.appendChild(li);
    } else {
      for (const device of devices) {
        const li = document.createElement('li');
        li.textContent = `${device.model ?? device.serial} — ${device.state}`;
        deviceListEl.appendChild(li);
      }
    }
    statusEl.textContent = '';
  } catch (error) {
    statusEl.textContent = `Ошибка: ${(error as Error).message}`;
  }
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
      statusEl.textContent = `Ошибка: ${(error as Error).message}`;
    }
  })();
});

void refreshDevices();
