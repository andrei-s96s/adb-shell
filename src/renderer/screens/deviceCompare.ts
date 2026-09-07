// Порт DeviceCompareViewModel/DeviceCompareSheet из
// Sources/AdbShell/ViewModels/DeviceCompareViewModel.swift +
// Views/DeviceCompareSheet.swift.

import { adbApi, el, errorMessage } from '../api.js';
import type { Device, DeviceProperty } from '../api.js';
import { openModal } from '../modal.js';
import { t } from '../i18n.js';

/** getprop-ключи для сводки сравнения устройств -- те же стандартные AOSP-
 * свойства, что уже читает AdbService.securityInfo() для "Безопасности"
 * (ro.boot.*), только другой набор: то, что чаще всего расходится между
 * двумя устройствами и объясняет разницу в поведении/багах (разная версия
 * Android/патч безопасности -- частая причина "у меня работает, у него
 * нет"). label используется и как подпись строки, и в title ячейки. */
const SUMMARY_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'ro.product.model', label: 'Модель' },
  { key: 'ro.product.manufacturer', label: 'Производитель' },
  { key: 'ro.build.version.release', label: 'Android' },
  { key: 'ro.build.version.sdk', label: 'SDK' },
  { key: 'ro.build.version.security_patch', label: 'Патч безопасности' },
];

function propValue(properties: DeviceProperty[], key: string): string {
  return properties.find((p) => p.key === key)?.value || '—';
}

/** Таблица "поле / значение А / значение Б" -- строка с расходящимися
 * значениями подсвечивается (.differs), это и есть весь смысл сводки:
 * не просто показать значения, а сразу бросить в глаза, чем два
 * устройства отличаются. */
function buildSummaryTable(propsA: DeviceProperty[], propsB: DeviceProperty[]): HTMLTableElement {
  const table = document.createElement('table');
  table.className = 'compare-summary';
  for (const field of SUMMARY_FIELDS) {
    const valueA = propValue(propsA, field.key);
    const valueB = propValue(propsB, field.key);
    const tr = document.createElement('tr');
    if (valueA !== valueB) tr.className = 'differs';

    const th = document.createElement('th');
    th.textContent = t(field.label);
    tr.appendChild(th);

    const tdA = document.createElement('td');
    tdA.textContent = valueA;
    tr.appendChild(tdA);

    const tdB = document.createElement('td');
    tdB.textContent = valueB;
    tr.appendChild(tdB);

    table.appendChild(tr);
  }
  return table;
}

export function openDeviceCompareModal(currentSerial: string): void {
  openModal(t('Сравнить устройства'), (body) => {
    body.innerHTML = `<p class="hint">${t('Загрузка списка устройств…')}</p>`;
    void adbApi.listDevices().then((devices) => {
      const others = devices.filter((d) => d.serial !== currentSerial && d.state === 'device');
      renderPicker(body, currentSerial, others);
    });
  });
}

function renderPicker(body: HTMLDivElement, currentSerial: string, others: Device[]): void {
  body.innerHTML = '';
  if (others.length === 0) {
    body.innerHTML = `<p class="hint">${t('Нет других подключённых устройств для сравнения.')}</p>`;
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
  runBtn.textContent = t('Сравнить');
  toolbar.appendChild(runBtn);
  body.appendChild(toolbar);

  const statusEl = document.createElement('div');
  statusEl.className = 'hint';
  body.appendChild(statusEl);

  const resultsEl = document.createElement('div');
  body.appendChild(resultsEl);

  runBtn.addEventListener('click', () => {
    statusEl.textContent = t('Сравнение…');
    resultsEl.innerHTML = '';
    const otherSerial = select.value;
    Promise.all([
      adbApi.comparePackages(currentSerial, otherSerial),
      adbApi.allProperties(currentSerial),
      adbApi.allProperties(otherSerial),
    ])
      .then(([result, propsA, propsB]) => {
        statusEl.textContent = t('{count} общих пакетов', { count: result.commonCount });
        resultsEl.innerHTML = '';
        resultsEl.appendChild(buildSummaryTable(propsA, propsB));
        const columns = document.createElement('div');
        columns.className = 'compare-columns';
        columns.appendChild(buildColumn(t('Только здесь'), result.onlyInA));
        columns.appendChild(buildColumn(t('Только там'), result.onlyInB));
        resultsEl.appendChild(columns);
      })
      .catch((error) => {
        statusEl.textContent = `${t('Ошибка')}: ${errorMessage(error)}`;
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
