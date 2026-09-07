// Порт ApkInfoSheet/ApkInfoViewModel из Sources/AdbShell/Views/ApkInfoSheet.swift
// + ViewModels/ApkInfoViewModel.swift -- манифест локального .apk через
// aapt2 (без установки) и, если на выбранном устройстве уже стоит эта же
// версия пакета, diff версии и разрешений с тем, что будет после обновления.

import { adbApi, errorMessage } from '../api.js';
import type { ApkManifestInfo, ApkSignatureInfo, AppDetail } from '../api.js';
import { openModal } from '../modal.js';

export function openApkInfoModal(apkPath: string, fileName: string, serial: string | undefined): void {
  openModal(`Инфо — ${fileName}`, (body) => {
    body.innerHTML = '<p class="hint">Чтение манифеста…</p>';

    adbApi
      .apkLibraryInspect(apkPath)
      .then(async (manifest) => {
        let installed: AppDetail | undefined;
        if (serial && manifest.packageName) {
          try {
            installed = await adbApi.appDetail(serial, manifest.packageName);
          } catch {
            // Пакета нет на устройстве (или устройства нет вообще) -- это
            // просто значит "новая установка", не ошибка.
          }
        }
        render(body, manifest, installed);
        // Подпись считается отдельно и не блокирует показ манифеста -- sha256
        // всего файла может занять заметное время на большом APK, а
        // сканирование сертификата вообще необязательно должно что-то найти.
        renderSignature(body, apkPath);
      })
      .catch((error) => {
        body.innerHTML = `<p class="error">Ошибка: ${errorMessage(error)}</p>`;
      });
  });
}

function render(body: HTMLDivElement, manifest: ApkManifestInfo, installed: AppDetail | undefined): void {
  body.innerHTML = '';

  const manifestCard = document.createElement('div');
  manifestCard.className = 'settings-section';
  manifestCard.appendChild(infoRow('Package', manifest.packageName ?? '—'));
  manifestCard.appendChild(infoRow('Название', manifest.applicationLabel ?? '—'));
  manifestCard.appendChild(infoRow('Версия', `${manifest.versionName ?? '—'} (${manifest.versionCode ?? '—'})`));
  manifestCard.appendChild(infoRow('SDK (min/target)', `${manifest.minSdk ?? '—'} / ${manifest.targetSdk ?? '—'}`));
  body.appendChild(manifestCard);

  if (installed) {
    const installedPermNames = new Set(installed.permissions.map((p) => p.name));
    const newPermNames = new Set(manifest.permissions);
    const added = manifest.permissions.filter((p) => !installedPermNames.has(p));
    const removed = installed.permissions.map((p) => p.name).filter((p) => !newPermNames.has(p));

    const diffCard = document.createElement('div');
    diffCard.className = 'settings-section';
    const diffTitle = document.createElement('h3');
    diffTitle.textContent = 'Отличия от установленной версии';
    diffCard.appendChild(diffTitle);
    diffCard.appendChild(infoRow('Установлено', installed.versionName ?? '—'));
    diffCard.appendChild(infoRow('В этом файле', manifest.versionName ?? '—'));

    if (added.length === 0 && removed.length === 0) {
      const same = document.createElement('div');
      same.className = 'hint';
      same.textContent = 'Разрешения не изменились';
      diffCard.appendChild(same);
    } else {
      if (added.length > 0) diffCard.appendChild(permList(`Новые разрешения (${added.length})`, added, 'var(--cp-emerald)'));
      if (removed.length > 0) diffCard.appendChild(permList(`Пропавшие разрешения (${removed.length})`, removed, 'var(--cp-crimson)'));
    }
    body.appendChild(diffCard);
  }

  body.appendChild(permList(`Все разрешения (${manifest.permissions.length})`, manifest.permissions));
}

/** Считается и добавляется в модалку отдельным подзапросом (не блокирует
 * показ манифеста выше) -- sha256 всего файла на большом APK заметно
 * дольше, чем разбор badging через уже-закешированный aapt2, а сертификат
 * подписи вообще не гарантированно найдётся (см. apkSignatureLogic.ts). */
function renderSignature(body: HTMLDivElement, apkPath: string): void {
  const card = document.createElement('div');
  card.className = 'settings-section';
  const heading = document.createElement('h3');
  heading.textContent = 'Подпись';
  card.appendChild(heading);
  const placeholder = document.createElement('div');
  placeholder.className = 'hint';
  placeholder.textContent = 'Вычисление sha256…';
  card.appendChild(placeholder);
  body.appendChild(card);

  adbApi
    .apkLibrarySignatureInfo(apkPath)
    .then((info: ApkSignatureInfo) => {
      card.removeChild(placeholder);
      card.appendChild(infoRow('sha256', info.sha256));
      if (info.certificate) {
        const cert = info.certificate;
        card.appendChild(infoRow('Издатель', cert.subject.replace(/\n/g, ', ')));
        if (!cert.selfSigned) {
          card.appendChild(infoRow('Выдан кем (issuer)', cert.issuer.replace(/\n/g, ', ')));
        }
        card.appendChild(infoRow('Действителен', `${cert.validFrom} — ${cert.validTo}`));
        card.appendChild(infoRow('Отпечаток сертификата', cert.fingerprint256));
      } else {
        const noCert = document.createElement('div');
        noCert.className = 'hint';
        noCert.textContent =
          'Сертификат подписи не найден -- либо APK подписан только v2/v3-схемой без v1-совместимости, либо файл повреждён';
        card.appendChild(noCert);
      }
    })
    .catch((error) => {
      placeholder.textContent = `Не удалось проверить подпись: ${errorMessage(error)}`;
      placeholder.className = 'error';
    });
}

function infoRow(label: string, value: string): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'settings-row';
  const labelEl = document.createElement('span');
  labelEl.className = 'hint';
  labelEl.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.textContent = value;
  row.append(labelEl, valueEl);
  return row;
}

function permList(title: string, names: string[], color?: string): HTMLDivElement {
  const section = document.createElement('div');
  section.className = 'settings-section';
  const heading = document.createElement('h3');
  heading.textContent = title;
  if (color) heading.style.color = color;
  section.appendChild(heading);
  for (const name of names) {
    const line = document.createElement('div');
    line.className = 'hint';
    line.style.textTransform = 'none';
    line.textContent = name;
    section.appendChild(line);
  }
  return section;
}
