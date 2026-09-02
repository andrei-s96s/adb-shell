// Порт Sources/AdbShell/Views/ApkLibraryView.swift (+ ApkLibraryViewModel) —
// локальный каталог APK, доступный и без подключённого устройства: тот же
// класс требования, что уже привёл к фиксу "нельзя работать с приложениями
// без устройства" (см. renderer.ts). Установка на устройство — единственное
// действие здесь, которому реально нужен serial; сам список, добавление,
// скачивание по ссылке и проверка обновлений с F-Droid работают всегда.
//
// Сознательно не перенесено из Swift-версии (см. PLAN.md): тегирование
// файлов, drag-and-drop прямо в окно, отдельный "Инфо"-лист с разрешениями
// из манифеста — самостоятельные, менее приоритетные куски.

import { adbApi, el, errorMessage } from '../api.js';
import type { ApkFile, FDroidUpdateInfo } from '../api.js';
import { onDeviceChanged, getCurrentSerial } from '../state.js';

let dirEl: HTMLDivElement;
let statusEl: HTMLDivElement;
let listEl: HTMLUListElement;
let files: ApkFile[] = [];
let fdroidUpdates: Record<string, FDroidUpdateInfo> = {};
let installingPath: string | undefined;
let isCheckingUpdates = false;

export function initApkLibraryScreen(): void {
  dirEl = el<HTMLDivElement>('apklibrary-dir');
  statusEl = el<HTMLDivElement>('apklibrary-status');
  listEl = el<HTMLUListElement>('apklibrary-list');

  el<HTMLButtonElement>('apklibrary-choose-dir').addEventListener('click', () => void chooseDirectory());
  el<HTMLButtonElement>('apklibrary-reveal').addEventListener('click', () => void adbApi.apkLibraryRevealInFileManager());
  el<HTMLButtonElement>('apklibrary-add').addEventListener('click', () => void addFiles());
  el<HTMLButtonElement>('apklibrary-download').addEventListener('click', () => void downloadFromUrl());
  el<HTMLButtonElement>('apklibrary-check-updates').addEventListener('click', () => void checkForUpdates());

  // Установка требует serial, но список/добавление/проверка обновлений —
  // нет, поэтому просто перерисовываем ряды при смене устройства (чтобы
  // кнопки "Установить"/"На все устройства" включились или выключились),
  // а не прячем экран и не перезагружаем сам список.
  onDeviceChanged(() => renderList());

  void refresh();
}

async function refresh(): Promise<void> {
  try {
    const [dir, list] = await Promise.all([adbApi.apkLibraryGetDirectory(), adbApi.apkLibraryList()]);
    dirEl.textContent = dir;
    dirEl.title = dir;
    files = list;
    renderList();
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}

async function chooseDirectory(): Promise<void> {
  const dir = await adbApi.apkLibraryChooseDirectory();
  dirEl.textContent = dir;
  dirEl.title = dir;
  fdroidUpdates = {};
  await refresh();
}

async function addFiles(): Promise<void> {
  statusEl.textContent = '';
  try {
    files = await adbApi.apkLibraryAddFiles();
    renderList();
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}

async function downloadFromUrl(): Promise<void> {
  const url = prompt('Ссылка на .apk:');
  if (!url) return;
  const filename = prompt('Имя файла (необязательно, по умолчанию — из ссылки):') ?? undefined;
  statusEl.textContent = 'Скачивание…';
  try {
    const name = await adbApi.apkLibraryDownloadFromUrl(url, filename || undefined);
    statusEl.textContent = `Скачано: ${name}`;
    await refresh();
  } catch (error) {
    statusEl.textContent = `Ошибка скачивания: ${errorMessage(error)}`;
  }
}

async function checkForUpdates(): Promise<void> {
  if (isCheckingUpdates) return;
  isCheckingUpdates = true;
  statusEl.textContent = 'Проверка обновлений на F-Droid…';
  try {
    fdroidUpdates = await adbApi.apkLibraryCheckFDroidUpdates();
    const count = Object.keys(fdroidUpdates).length;
    statusEl.textContent = count > 0 ? `Найдено обновлений: ${count}` : 'Обновлений не найдено';
    renderList();
  } catch (error) {
    statusEl.textContent = `Ошибка проверки обновлений: ${errorMessage(error)}`;
  } finally {
    isCheckingUpdates = false;
  }
}

function renderList(): void {
  listEl.innerHTML = '';
  if (files.length === 0) {
    const li = document.createElement('li');
    li.className = 'row empty';
    li.textContent = 'Библиотека пуста — добавьте .apk кнопкой выше';
    listEl.appendChild(li);
    return;
  }

  const serial = getCurrentSerial();
  for (const file of files) {
    listEl.appendChild(renderRow(file, serial));
  }
}

function renderRow(file: ApkFile, serial: string | undefined): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'row';

  const main = document.createElement('div');
  main.className = 'apk-row-main';

  const name = document.createElement('span');
  name.textContent = file.name;
  main.appendChild(name);

  const meta = document.createElement('span');
  meta.className = 'hint';
  meta.textContent = `${formatBytes(file.sizeBytes)} · ${new Date(file.modifiedMs).toLocaleString('ru-RU')}`;
  main.appendChild(meta);

  const update = fdroidUpdates[file.path];
  if (update) {
    const badge = document.createElement('span');
    badge.className = 'apk-update-badge';
    badge.textContent = `↑ F-Droid: ${update.latestVersionName ?? update.latestVersionCode}`;
    main.appendChild(badge);
  }

  li.appendChild(main);

  const actions = document.createElement('div');
  actions.className = 'apk-row-actions';

  if (update) {
    const updateBtn = document.createElement('button');
    updateBtn.textContent = installingPath === file.path ? '…' : 'Обновить';
    updateBtn.disabled = installingPath === file.path;
    updateBtn.addEventListener('click', () => void downloadUpdate(file, update));
    actions.appendChild(updateBtn);
  }

  const installBtn = document.createElement('button');
  installBtn.textContent = installingPath === file.path ? '…' : 'Установить';
  installBtn.disabled = !serial || installingPath === file.path;
  installBtn.title = serial ? '' : 'Нет подключённого устройства';
  installBtn.addEventListener('click', () => void installOne(file, serial));
  actions.appendChild(installBtn);

  const installAllBtn = document.createElement('button');
  installAllBtn.textContent = 'На все устройства';
  installAllBtn.disabled = installingPath === file.path;
  installAllBtn.addEventListener('click', () => void installToAll(file));
  actions.appendChild(installAllBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = 'Удалить';
  deleteBtn.addEventListener('click', () => void deleteFile(file));
  actions.appendChild(deleteBtn);

  li.appendChild(actions);
  return li;
}

async function installOne(file: ApkFile, serial: string | undefined): Promise<void> {
  if (!serial) return;
  installingPath = file.path;
  renderList();
  statusEl.textContent = `Установка ${file.name}…`;
  try {
    await adbApi.install(serial, file.path);
    statusEl.textContent = `Установлено: ${file.name}`;
  } catch (error) {
    statusEl.textContent = `Ошибка установки: ${errorMessage(error)}`;
  } finally {
    installingPath = undefined;
    renderList();
  }
}

async function installToAll(file: ApkFile): Promise<void> {
  installingPath = file.path;
  renderList();
  statusEl.textContent = `Установка ${file.name} на все готовые устройства…`;
  try {
    const result = await adbApi.apkLibraryInstallToAllDevices(file.path);
    if (result.total === 0) {
      statusEl.textContent = 'Нет готовых устройств';
    } else if (result.failures.length === 0) {
      statusEl.textContent = `Установлено на ${result.successCount} из ${result.total}`;
    } else {
      statusEl.textContent = `Установлено на ${result.successCount} из ${result.total}. Ошибки: ${result.failures.join('; ')}`;
    }
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  } finally {
    installingPath = undefined;
    renderList();
  }
}

async function downloadUpdate(file: ApkFile, update: FDroidUpdateInfo): Promise<void> {
  installingPath = file.path;
  renderList();
  statusEl.textContent = `Скачивание обновления ${update.latestVersionName ?? update.latestVersionCode}…`;
  try {
    await adbApi.apkLibraryDownloadFDroidUpdate(file, update);
    delete fdroidUpdates[file.path];
    statusEl.textContent = 'Обновлено';
    await refresh();
  } catch (error) {
    statusEl.textContent = `Ошибка обновления: ${errorMessage(error)}`;
  } finally {
    installingPath = undefined;
    renderList();
  }
}

async function deleteFile(file: ApkFile): Promise<void> {
  try {
    await adbApi.apkLibraryDeleteFile(file.path);
    delete fdroidUpdates[file.path];
    await refresh();
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} Б`;
  const units = ['КБ', 'МБ', 'ГБ'];
  let value = bytes / 1000;
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}
