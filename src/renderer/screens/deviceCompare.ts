// Порт DeviceCompareViewModel/DeviceCompareSheet из
// Sources/AdbShell/ViewModels/DeviceCompareViewModel.swift +
// Views/DeviceCompareSheet.swift.

import { adbApi, el, errorMessage } from '../api.js';
import type { Device } from '../api.js';
import { openModal } from '../modal.js';

export function openDeviceCompareModal(currentSerial: string): void {
  openModal('Сравнить устройства', (body) => {
    body.innerHTML = '<p class="hint">Загрузка списка устройств…</p>';
    void adbApi.listDevices().then((devices) => {
      const others = devices.filter((d) => d.serial !== currentSerial && d.state === 'device');
      renderPicker(body, currentSerial, others);
    });
  });
}

function renderPicker(body: HTMLDivElement, currentSerial: string, others: Device[]): void {
  body.innerHTML = '';
  if (others.length === 0) {
    body.innerHTML = '<p class="hint">Нет других подключённых устройств для сравнения.</p>';
    return;
  }

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  const select = document.createElement('select');
  for (const device of others) {
    const option = document.createElement('option');
    option.value = device.serial;
    option.textContent = device.model ? device.model.replace(/_/g, ' ') : device.serial;
    select.appendChild(option);
  }
  toolbar.appendChild(select);
  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.textContent = 'Сравнить';
  toolbar.appendChild(runBtn);
  body.appendChild(toolbar);

  const statusEl = document.createElement('div');
  statusEl.className = 'hint';
  body.appendChild(statusEl);

  const resultsEl = document.createElement('div');
  body.appendChild(resultsEl);

  runBtn.addEventListener('click', () => {
    statusEl.textContent = 'Сравнение…';
    resultsEl.innerHTML = '';
    adbApi
      .comparePackages(currentSerial, select.value)
      .then((result) => {
        statusEl.textContent = `${result.commonCount} общих пакетов`;
        resultsEl.innerHTML = '';
        const columns = document.createElement('div');
        columns.className = 'compare-columns';
        columns.appendChild(buildColumn('Только здесь', result.onlyInA));
        columns.appendChild(buildColumn('Только там', result.onlyInB));
        resultsEl.appendChild(columns);
      })
      .catch((error) => {
        statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
      });
  });
}

function buildColumn(title: string, packages: string[]): HTMLDivElement {
  const column = document.createElement('div');
  column.className = 'compare-column';
  const heading = document.createElement('h4');
  heading.textContent = `${title} (${packages.length})`;
  column.appendChild(heading);
  const list = document.createElement('ul');
  for (const pkg of packages) {
    const li = document.createElement('li');
    li.textContent = pkg;
    list.appendChild(li);
  }
  column.appendChild(list);
  return column;
}
