// Порт DeviceSnapshot-части AppsView/AppsViewModel из
// Sources/AdbShell/Views/AppsView.swift -- снапшот всех пользовательских
// приложений устройства одной кнопкой (без ручного выбора), список
// сохранённых снапшотов с восстановлением на любое устройство.

import { adbApi, errorMessage } from '../api.js';
import type { InstalledApp, DeviceSnapshotInfo } from '../api.js';
import { openModal } from '../modal.js';

export function openSnapshotsModal(serial: string, currentApps: InstalledApp[], onRestored: () => void): void {
  openModal('Снапшоты устройства', (body) => {
    const takeBtn = document.createElement('button');
    takeBtn.type = 'button';
    takeBtn.textContent = 'Снять новый снапшот (все пользовательские приложения)';
    body.appendChild(takeBtn);

    const statusEl = document.createElement('div');
    statusEl.className = 'hint';
    body.appendChild(statusEl);

    const listEl = document.createElement('ul');
    listEl.className = 'scroll-list';
    listEl.style.marginTop = '10px';
    body.appendChild(listEl);

    let snapshots: DeviceSnapshotInfo[] = [];

    const refresh = (): void => {
      adbApi
        .snapshotsList()
        .then((list) => {
          snapshots = list;
          render();
        })
        .catch((error) => (statusEl.textContent = `Ошибка: ${errorMessage(error)}`));
    };

    function render(): void {
      listEl.innerHTML = '';
      if (snapshots.length === 0) {
        listEl.innerHTML = '<li class="hint">Снапшотов ещё нет</li>';
        return;
      }
      for (const snap of snapshots) {
        const li = document.createElement('li');
        li.className = 'row';
        const label = document.createElement('span');
        label.textContent = `${snap.deviceLabel} — ${snap.appCount} прил. — ${new Date(snap.createdAtMs).toLocaleString('ru-RU')}`;
        li.appendChild(label);

        const actions = document.createElement('div');
        actions.className = 'apk-row-actions';

        const restoreBtn = document.createElement('button');
        restoreBtn.type = 'button';
        restoreBtn.textContent = 'Восстановить';
        restoreBtn.addEventListener('click', () => {
          statusEl.textContent = 'Восстановление…';
          adbApi
            .snapshotsRestore(snap.path, serial)
            .then((outcome) => {
              const failed = outcome.results.filter((r) => !r.success);
              statusEl.textContent = `Восстановлено ${outcome.results.length - failed.length} из ${outcome.results.length}`;
              onRestored();
            })
            .catch((error) => (statusEl.textContent = `Ошибка: ${errorMessage(error)}`));
        });
        actions.appendChild(restoreBtn);

        const revealBtn = document.createElement('button');
        revealBtn.type = 'button';
        revealBtn.textContent = 'Показать в проводнике';
        revealBtn.addEventListener('click', () => void adbApi.snapshotsReveal(snap.path));
        actions.appendChild(revealBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.textContent = '✕';
        deleteBtn.addEventListener('click', () => {
          adbApi
            .snapshotsDelete(snap.path)
            .then(refresh)
            .catch((error) => (statusEl.textContent = `Ошибка: ${errorMessage(error)}`));
        });
        actions.appendChild(deleteBtn);

        li.appendChild(actions);
        listEl.appendChild(li);
      }
    }

    takeBtn.addEventListener('click', () => {
      const packages = currentApps.filter((a) => !a.isSystem).map((a) => a.packageName);
      if (packages.length === 0) {
        statusEl.textContent = 'Нет пользовательских приложений для снапшота';
        return;
      }
      takeBtn.disabled = true;
      statusEl.textContent = `Снимаю снапшот (${packages.length} приложений)…`;
      adbApi
        .listDevices()
        .then((devices) => {
          const device = devices.find((d) => d.serial === serial);
          const deviceLabel = device?.model ? device.model.replace(/_/g, ' ') : serial;
          return adbApi.snapshotsTake(serial, packages, deviceLabel);
        })
        .then((outcome) => {
          statusEl.textContent = `Снапшот готов: ${outcome.entryCount} приложений`;
          refresh();
        })
        .catch((error) => (statusEl.textContent = `Ошибка: ${errorMessage(error)}`))
        .finally(() => {
          takeBtn.disabled = false;
        });
    });

    refresh();
  });
}
