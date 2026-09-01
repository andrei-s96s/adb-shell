import { adbApi, el, errorMessage } from '../api.js';
import { onDeviceChanged, getCurrentSerial } from '../state.js';

// MARK: Wi-Fi отладка

let wirelessPortEl: HTMLInputElement;
let wirelessStatusEl: HTMLDivElement;

function initWireless(): void {
  wirelessPortEl = el<HTMLInputElement>('wireless-port');
  wirelessStatusEl = el<HTMLDivElement>('wireless-status');
  el<HTMLButtonElement>('wireless-enable').addEventListener('click', () => {
    const serial = getCurrentSerial();
    if (!serial) return;
    const port = Number.parseInt(wirelessPortEl.value, 10) || 5555;
    wirelessStatusEl.textContent = 'Включение…';
    adbApi
      .enableWirelessDebugging(serial, port)
      .then(() => adbApi.deviceIPAddress(serial))
      .then((ip) => {
        wirelessStatusEl.textContent = ip ? `Готово: ${ip}:${port}` : 'Включено, но IP не найден (нет Wi-Fi?)';
      })
      .catch((error) => {
        wirelessStatusEl.textContent = `Ошибка: ${errorMessage(error)}`;
      });
  });
}

// MARK: Проброс портов

let forwardListEl: HTMLUListElement;
let reverseListEl: HTMLUListElement;
let portForwardStatusEl: HTMLDivElement;

function initPortForwarding(): void {
  forwardListEl = el<HTMLUListElement>('forward-list');
  reverseListEl = el<HTMLUListElement>('reverse-list');
  portForwardStatusEl = el<HTMLDivElement>('port-forward-status');

  el<HTMLButtonElement>('forward-add').addEventListener('click', () => {
    const serial = getCurrentSerial();
    if (!serial) return;
    const host = el<HTMLInputElement>('forward-host').value.trim();
    const device = el<HTMLInputElement>('forward-device').value.trim();
    if (!host || !device) return;
    runPortAction(async () => {
      await adbApi.addForward(serial, normalizeSpec(host), normalizeSpec(device));
      await refreshPortForwarding(serial);
    });
  });

  el<HTMLButtonElement>('reverse-add').addEventListener('click', () => {
    const serial = getCurrentSerial();
    if (!serial) return;
    const device = el<HTMLInputElement>('reverse-device').value.trim();
    const host = el<HTMLInputElement>('reverse-host').value.trim();
    if (!device || !host) return;
    runPortAction(async () => {
      await adbApi.addReverse(serial, normalizeSpec(device), normalizeSpec(host));
      await refreshPortForwarding(serial);
    });
  });
}

function normalizeSpec(raw: string): string {
  return raw.includes(':') ? raw : `tcp:${raw}`;
}

function runPortAction(action: () => Promise<void>): void {
  portForwardStatusEl.textContent = '';
  action().catch((error) => {
    portForwardStatusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  });
}

async function refreshPortForwarding(serial: string): Promise<void> {
  const [forwards, reverses] = await Promise.all([adbApi.listForwards(serial), adbApi.listReverses(serial)]);

  forwardListEl.innerHTML = '';
  for (const rule of forwards) {
    const li = document.createElement('li');
    li.className = 'row';
    li.innerHTML = `<span>${rule.hostSpec} → ${rule.deviceSpec}</span>`;
    const del = document.createElement('button');
    del.textContent = '✕';
    del.addEventListener('click', () =>
      runPortAction(async () => {
        await adbApi.removeForward(serial, rule.hostSpec);
        await refreshPortForwarding(serial);
      })
    );
    li.appendChild(del);
    forwardListEl.appendChild(li);
  }

  reverseListEl.innerHTML = '';
  for (const rule of reverses) {
    const li = document.createElement('li');
    li.className = 'row';
    li.innerHTML = `<span>${rule.deviceSpec} → ${rule.hostSpec}</span>`;
    const del = document.createElement('button');
    del.textContent = '✕';
    del.addEventListener('click', () =>
      runPortAction(async () => {
        await adbApi.removeReverse(serial, rule.deviceSpec);
        await refreshPortForwarding(serial);
      })
    );
    li.appendChild(del);
    reverseListEl.appendChild(li);
  }
}

// MARK: Свойства устройства

let propsListEl: HTMLDivElement;
let propsSearchEl: HTMLInputElement;
let propsCountEl: HTMLDivElement;
let allProps: Array<{ key: string; value: string }> = [];

function initDeviceProperties(): void {
  propsListEl = el<HTMLDivElement>('props-list');
  propsSearchEl = el<HTMLInputElement>('props-search');
  propsCountEl = el<HTMLDivElement>('props-count');
  propsSearchEl.addEventListener('input', renderProps);
}

function renderProps(): void {
  const query = propsSearchEl.value.trim().toLowerCase();
  const filtered = query
    ? allProps.filter((p) => p.key.toLowerCase().includes(query) || p.value.toLowerCase().includes(query))
    : allProps;

  propsCountEl.textContent = `${filtered.length} из ${allProps.length}`;
  propsListEl.innerHTML = '';
  for (const prop of filtered) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.innerHTML = `<span class="prop-key">${prop.key}</span><span class="prop-value">${prop.value || '—'}</span>`;
    propsListEl.appendChild(row);
  }
}

// MARK: Инициализация

export function initToolsScreen(): void {
  initWireless();
  initPortForwarding();
  initDeviceProperties();

  onDeviceChanged((serial) => {
    wirelessStatusEl.textContent = '';
    portForwardStatusEl.textContent = '';
    forwardListEl.innerHTML = '';
    reverseListEl.innerHTML = '';
    allProps = [];
    renderProps();

    if (!serial) return;
    void refreshPortForwarding(serial);
    adbApi
      .allProperties(serial)
      .then((props) => {
        allProps = props;
        renderProps();
      })
      .catch(() => {
        /* тихо игнорируем — свойства не критичны для остального экрана */
      });
  });
}
