// История подключений -- список всех устройств, хотя бы раз увиденных в
// `adb devices` (см. DeviceHistoryStore), включая давно отключённые сетевые
// устройства -- модалка со списком, клик "Подключить" на сетевой записи
// подставляет её host вызывающему коду (renderer.ts решает, как именно
// подключаться и обновлять список устройств -- тот же принцип, что и
// onPick в shellHistoryModal.ts).

import { adbApi, errorMessage } from '../api.js';
import type { DeviceHistoryEntry } from '../api.js';
import { openModal } from '../modal.js';
import { t, formatDateTime } from '../i18n.js';

export function openDeviceHistoryModal(onConnect: (host: string) => void): void {
  openModal(t('История подключений'), (body) => {
    body.innerHTML = `<p class="hint">${t('Загрузка…')}</p>`;
    adbApi
      .deviceHistoryList()
      .then((items) => render(body, items, onConnect))
      .catch((error) => {
        body.innerHTML = `<p class="error">${t('Ошибка')}: ${errorMessage(error)}</p>`;
      });
  });
}

function render(body: HTMLDivElement, items: DeviceHistoryEntry[], onConnect: (host: string) => void): void {
  body.innerHTML = '';

  const list = document.createElement('ul');
  list.className = 'scroll-list small';
  if (items.length === 0) {
    list.innerHTML = `<li class="hint">${t('Пока пусто -- список наполняется по мере подключения устройств')}</li>`;
  }
  for (const entry of items) {
    const li = document.createElement('li');
    li.className = 'row';

    const label = document.createElement('span');
    const title = entry.model ? entry.model.replace(/_/g, ' ') : entry.serial;
    label.textContent = `${title} — ${formatDateTime(entry.lastSeenMs)}`;
    label.title = entry.serial;
    li.appendChild(label);

    // Сетевой serial -- вида host:port, тот же признак, что уже
    // используется в renderer.ts (device.serial.includes(':')) для кнопки
    // "Отключить" -- только такие записи имеют смысл переподключать отсюда,
    // у USB-устройства serial не адрес, `adb connect` с ним не сработает.
    if (entry.serial.includes(':')) {
      const connectBtn = document.createElement('button');
      connectBtn.type = 'button';
      connectBtn.textContent = t('Подключить');
      connectBtn.addEventListener('click', () => onConnect(entry.serial));
      li.appendChild(connectBtn);
    }

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '✕';
    removeBtn.title = t('Убрать из истории');
    removeBtn.addEventListener('click', () => {
      adbApi
        .deviceHistoryRemove(entry.serial)
        .then((updated) => render(body, updated, onConnect))
        .catch(() => {});
    });
    li.appendChild(removeBtn);

    list.appendChild(li);
  }
  body.appendChild(list);

  if (items.length > 0) {
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = t('Очистить историю');
    clearBtn.style.marginTop = 'var(--space-8)';
    clearBtn.addEventListener('click', () => {
      adbApi
        .deviceHistoryClear()
        .then((updated) => render(body, updated, onConnect))
        .catch(() => {});
    });
    body.appendChild(clearBtn);
  }
}
