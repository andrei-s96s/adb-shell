// Порт DeviceSnapshot-части AppsView/AppsViewModel из
// Sources/AdbShell/Views/AppsView.swift -- снапшот всех пользовательских
// приложений устройства одной кнопкой (без ручного выбора), список
// сохранённых снапшотов с восстановлением на любое устройство.

import { adbApi, errorMessage } from '../api.js';
import type { InstalledApp, DeviceSnapshotInfo, ManifestPackageDiff } from '../api.js';
import { openModal } from '../modal.js';

export function openSnapshotsModal(serial: string, currentApps: InstalledApp[], onRestored: () => void): void {
  openModal('Снапшоты устройства', (body) => {
    const takeBtn = document.createElement('button');
    takeBtn.type = 'button';
    takeBtn.textContent = 'Снять новый снапшот (все пользовательские приложения)';
    body.appendChild(takeBtn);

    // Сравнение двух снапшотов -- отмечаются чекбоксом в списке ниже, кнопка
    // появляется, когда отмечено ровно два.
    const diffBtn = document.createElement('button');
    diffBtn.type = 'button';
    diffBtn.textContent = 'Сравнить выбранные';
    diffBtn.hidden = true;
    body.appendChild(diffBtn);

    const statusEl = document.createElement('div');
    statusEl.className = 'hint';
    body.appendChild(statusEl);

    const listEl = document.createElement('ul');
    listEl.className = 'scroll-list';
    listEl.style.marginTop = '10px';
    body.appendChild(listEl);

    let snapshots: DeviceSnapshotInfo[] = [];
    const selectedForDiff = new Set<string>();

    const updateDiffButton = (): void => {
      diffBtn.hidden = selectedForDiff.size !== 2;
    };

    diffBtn.addEventListener('click', () => {
      const [pathA, pathB] = [...selectedForDiff];
      const a = snapshots.find((s) => s.path === pathA);
      const b = snapshots.find((s) => s.path === pathB);
      if (!a || !b) return;
      // Всегда старый -> новый, независимо от порядка кликов при выборе.
      const [older, newer] = [a, b].sort((x, y) => x.createdAtMs - y.createdAtMs);
      openSnapshotDiffModal(older, newer);
    });

    const refresh = (): void => {
      adbApi
        .snapshotsList()
        .then((list) => {
          snapshots = list;
          // Снапшот мог быть удалён (deleteBtn ниже) с момента предыдущего
          // выбора -- убираем ставшие невалидными пути, чтобы диалог
          // сравнения не открылся на несуществующем файле.
          const stillPresent = new Set(list.map((s) => s.path));
          for (const p of [...selectedForDiff]) if (!stillPresent.has(p)) selectedForDiff.delete(p);
          render();
        })
        .catch((error) => (statusEl.textContent = `Ошибка: ${errorMessage(error)}`));
    };

    function render(): void {
      listEl.innerHTML = '';
      updateDiffButton();
      if (snapshots.length === 0) {
        listEl.innerHTML = '<li class="hint">Снапшотов ещё нет</li>';
        return;
      }
      for (const snap of snapshots) {
        const li = document.createElement('li');
        li.className = 'row';

        const diffCheckbox = document.createElement('input');
        diffCheckbox.type = 'checkbox';
        diffCheckbox.title = 'Выбрать для сравнения (ровно два снапшота)';
        diffCheckbox.checked = selectedForDiff.has(snap.path);
        diffCheckbox.addEventListener('change', () => {
          if (diffCheckbox.checked) {
            if (selectedForDiff.size >= 2) {
              // Уже выбраны два -- третий чекбокс не даём отметить, вместо
              // непредсказуемой замены одного из уже выбранных.
              diffCheckbox.checked = false;
              return;
            }
            selectedForDiff.add(snap.path);
          } else {
            selectedForDiff.delete(snap.path);
          }
          updateDiffButton();
        });
        li.appendChild(diffCheckbox);

        const label = document.createElement('span');
        label.textContent = `${snap.deviceLabel} — ${snap.appCount} прил. — ${new Date(snap.createdAtMs).toLocaleString('ru-RU')}`;
        li.appendChild(label);

        const actions = document.createElement('div');
        actions.className = 'apk-row-actions';

        const restoreBtn = document.createElement('button');
        restoreBtn.type = 'button';
        restoreBtn.textContent = 'Восстановить';
        restoreBtn.addEventListener('click', () => {
          // Без disabled быстрый двойной клик запускал два параллельных
          // DeviceSnapshotService.restore() на одно и то же устройство --
          // независимые adb install/pm grant гонялись бы одновременно, мешая
          // друг другу и перезаписывая один и тот же statusEl. Тот же
          // паттерн, что уже применён на takeBtn чуть выше.
          restoreBtn.disabled = true;
          statusEl.textContent = 'Восстановление…';
          adbApi
            .snapshotsRestore(snap.path, serial)
            .then((outcome) => {
              const failed = outcome.results.filter((r) => !r.success);
              statusEl.textContent = `Восстановлено ${outcome.results.length - failed.length} из ${outcome.results.length}`;
              onRestored();
            })
            .catch((error) => (statusEl.textContent = `Ошибка: ${errorMessage(error)}`))
            .finally(() => {
              restoreBtn.disabled = false;
            });
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

/** Читает manifest.json из обоих снапшотов (без распаковки apk, см.
 * DeviceSnapshotService.readManifest()) и показывает, какие пакеты
 * появились/пропали/сменили версию или набор выданных разрешений --
 * тот же приём, что и diff версии/разрешений в apkInfo.ts, только между
 * двумя снапшотами, а не файлом и установленной версией. */
function openSnapshotDiffModal(older: DeviceSnapshotInfo, newer: DeviceSnapshotInfo): void {
  const fmt = (s: DeviceSnapshotInfo): string => `${s.deviceLabel} (${new Date(s.createdAtMs).toLocaleString('ru-RU')})`;
  openModal(`Сравнение снапшотов`, (body) => {
    const header = document.createElement('div');
    header.className = 'hint';
    header.textContent = `${fmt(older)}  →  ${fmt(newer)}`;
    body.appendChild(header);

    const resultEl = document.createElement('div');
    resultEl.style.marginTop = '10px';
    resultEl.innerHTML = '<p class="hint">Сравнение…</p>';
    body.appendChild(resultEl);

    adbApi
      .snapshotsDiff(older.path, newer.path)
      .then((diff) => renderSnapshotDiff(resultEl, diff))
      .catch((error) => {
        resultEl.innerHTML = `<p class="error">Ошибка: ${errorMessage(error)}</p>`;
      });
  });
}

function renderSnapshotDiff(container: HTMLDivElement, diff: ManifestPackageDiff[]): void {
  container.innerHTML = '';
  if (diff.length === 0) {
    container.innerHTML = '<p class="hint">Отличий не найдено — список приложений и выданных разрешений идентичен</p>';
    return;
  }
  for (const entry of diff) {
    const card = document.createElement('div');
    card.className = 'settings-section';

    const title = document.createElement('h3');
    title.textContent = entry.packageName;
    card.appendChild(title);

    if (!entry.inA) {
      card.appendChild(diffLine('Появился в новом снапшоте', 'var(--cp-emerald)'));
    } else if (!entry.inB) {
      card.appendChild(diffLine('Пропал в новом снапшоте', 'var(--cp-crimson)'));
    } else if (entry.versionA !== entry.versionB) {
      card.appendChild(diffLine(`Версия: ${entry.versionA ?? '—'} → ${entry.versionB ?? '—'}`));
    }
    if (entry.addedPermissions.length > 0) card.appendChild(diffLine(`+ ${entry.addedPermissions.join(', ')}`, 'var(--cp-emerald)'));
    if (entry.removedPermissions.length > 0) card.appendChild(diffLine(`− ${entry.removedPermissions.join(', ')}`, 'var(--cp-crimson)'));

    container.appendChild(card);
  }
}

function diffLine(text: string, color?: string): HTMLDivElement {
  const line = document.createElement('div');
  line.className = 'hint';
  line.style.textTransform = 'none';
  line.textContent = text;
  if (color) line.style.color = color;
  return line;
}
