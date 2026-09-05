// Порт Sources/AdbShell/Views/ApkLibraryView.swift (+ ApkLibraryViewModel) —
// локальный каталог APK, доступный и без подключённого устройства: тот же
// класс требования, что уже привёл к фиксу "нельзя работать с приложениями
// без устройства" (см. renderer.ts). Установка на устройство — единственное
// действие здесь, которому реально нужен serial; сам список, добавление,
// скачивание по ссылке и проверка обновлений с F-Droid работают всегда.
//
// Теги -- пользовательские метки для файлов библиотеки, порт ApkTagStore
// (Sources/AdbShell/Services/ApkTagStore.swift): чипы-фильтр над списком,
// инлайн-добавление/удаление тегов у каждого файла.
//
import { adbApi, el, errorMessage } from '../api.js';
import type { ApkFile, FDroidUpdateInfo } from '../api.js';
import { onDeviceChanged, getCurrentSerial } from '../state.js';
import { openApkInfoModal } from './apkInfo.js';
import { openTextPromptModal } from '../modal.js';

// Дубликат PLACEHOLDER_ICON из apps.ts (см. комментарий там) -- тот же
// нейтральный плейсхолдер для локального файла, пока (или если) реальная
// иконка из .apk не пришла.
const PLACEHOLDER_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="7" fill="#8886"/></svg>'
  );

let dirEl: HTMLDivElement;
let statusEl: HTMLDivElement;
let listEl: HTMLUListElement;
let tagFilterEl: HTMLDivElement;
let files: ApkFile[] = [];
let fdroidUpdates: Record<string, FDroidUpdateInfo> = {};
let tagsByPath: Record<string, string[]> = {};
let activeTagFilter: string | undefined;
let installingPath: string | undefined;
let isCheckingUpdates = false;

export function initApkLibraryScreen(): void {
  dirEl = el<HTMLDivElement>('apklibrary-dir');
  statusEl = el<HTMLDivElement>('apklibrary-status');
  listEl = el<HTMLUListElement>('apklibrary-list');
  tagFilterEl = el<HTMLDivElement>('apklibrary-tag-filter');

  el<HTMLButtonElement>('apklibrary-choose-dir').addEventListener('click', () => void chooseDirectory());
  el<HTMLButtonElement>('apklibrary-reveal').addEventListener('click', () => void revealInFileManager());
  el<HTMLButtonElement>('apklibrary-add').addEventListener('click', () => void addFiles());
  el<HTMLButtonElement>('apklibrary-download').addEventListener('click', () => void downloadFromUrl());
  el<HTMLButtonElement>('apklibrary-check-updates').addEventListener('click', () => void checkForUpdates());

  // Drag&drop .apk прямо в эту вкладку импортирует в библиотеку -- своя,
  // более специфичная обработка, чем глобальный drop в renderer.ts
  // (устанавливает на устройство), поэтому останавливаем всплытие.
  const panel = el<HTMLElement>('tab-apklibrary');
  panel.addEventListener('dragover', (event) => event.preventDefault());
  panel.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const paths = Array.from(event.dataTransfer?.files ?? [])
      .filter((f) => f.name.toLowerCase().endsWith('.apk'))
      .map((f) => adbApi.getPathForFile(f));
    if (paths.length === 0) return;
    adbApi
      .apkLibraryImportPaths(paths)
      .then((updated) => {
        files = updated;
        renderList();
      })
      .catch((error) => (statusEl.textContent = `Ошибка: ${errorMessage(error)}`));
  });

  // Установка требует serial, но список/добавление/проверка обновлений —
  // нет, поэтому просто перерисовываем ряды при смене устройства (чтобы
  // кнопки "Установить"/"На все устройства" включились или выключились),
  // а не прячем экран и не перезагружаем сам список.
  onDeviceChanged(() => renderList());

  void refresh();
}

async function refresh(): Promise<void> {
  try {
    const [dir, list, tags] = await Promise.all([
      adbApi.apkLibraryGetDirectory(),
      adbApi.apkLibraryList(),
      adbApi.apkLibraryTagsList(),
    ]);
    dirEl.textContent = dir;
    dirEl.title = dir;
    files = list;
    tagsByPath = tags;
    renderTagFilter();
    renderList();
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}

function renderTagFilter(): void {
  const allTags = [...new Set(Object.values(tagsByPath).flat())].sort();
  tagFilterEl.innerHTML = '';
  if (activeTagFilter && !allTags.includes(activeTagFilter)) activeTagFilter = undefined;
  for (const tag of allTags) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip' + (tag === activeTagFilter ? ' active' : '');
    chip.textContent = tag;
    chip.addEventListener('click', () => {
      activeTagFilter = activeTagFilter === tag ? undefined : tag;
      renderTagFilter();
      renderList();
    });
    tagFilterEl.appendChild(chip);
  }
}

async function revealInFileManager(): Promise<void> {
  // shell.openPath не бросает исключение при неудаче — резолвится строкой
  // с текстом ошибки (пустая строка = успех), поэтому обычный try/catch
  // здесь ничего не поймает без явной проверки результата.
  try {
    const error = await adbApi.apkLibraryRevealInFileManager();
    if (error) statusEl.textContent = `Ошибка: ${error}`;
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}

async function chooseDirectory(): Promise<void> {
  statusEl.textContent = '';
  try {
    const dir = await adbApi.apkLibraryChooseDirectory();
    dirEl.textContent = dir;
    dirEl.title = dir;
    fdroidUpdates = {};
    await refresh();
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
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
  const url = await openTextPromptModal('Скачать .apk по ссылке', 'https://example.com/app.apk');
  if (!url) return;
  const filename = await openTextPromptModal('Имя файла (необязательно)', 'по умолчанию — из ссылки');
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
  const visible = activeTagFilter ? files.filter((f) => (tagsByPath[f.path] ?? []).includes(activeTagFilter!)) : files;
  if (visible.length === 0) {
    const li = document.createElement('li');
    li.className = 'row empty';
    li.textContent = files.length === 0 ? 'Библиотека пуста — добавьте .apk кнопкой выше' : 'Нет файлов с этим тегом';
    listEl.appendChild(li);
    return;
  }

  const serial = getCurrentSerial();
  for (const file of visible) {
    listEl.appendChild(renderRow(file, serial));
  }
}

function renderRow(file: ApkFile, serial: string | undefined): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'row';

  const icon = document.createElement('img');
  icon.className = 'app-icon';
  icon.src = PLACEHOLDER_ICON;
  li.appendChild(icon);
  loadIcon(icon, file.path);

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

  const tagsRow = document.createElement('div');
  tagsRow.className = 'apk-row-tags';
  for (const tag of tagsByPath[file.path] ?? []) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    const label = document.createElement('span');
    label.textContent = tag;
    chip.appendChild(label);
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Убрать тег';
    removeBtn.addEventListener('click', () => void removeTag(file, tag));
    chip.appendChild(removeBtn);
    tagsRow.appendChild(chip);
  }
  const addTagBtn = document.createElement('button');
  addTagBtn.type = 'button';
  addTagBtn.className = 'tag-add-btn';
  addTagBtn.textContent = '+ тег';
  addTagBtn.addEventListener('click', () => void promptAddTag(file));
  tagsRow.appendChild(addTagBtn);
  main.appendChild(tagsRow);

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

  const infoBtn = document.createElement('button');
  infoBtn.textContent = 'Инфо';
  infoBtn.addEventListener('click', () => openApkInfoModal(file.path, file.name, serial));
  actions.appendChild(infoBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = 'Удалить';
  deleteBtn.addEventListener('click', () => void deleteFile(file));
  actions.appendChild(deleteBtn);

  li.appendChild(actions);
  return li;
}

function loadIcon(icon: HTMLImageElement, apkPath: string): void {
  adbApi
    .apkLibraryGetIcon(apkPath)
    .then((dataUri) => {
      if (!dataUri || !icon.isConnected) return;
      icon.src = dataUri;
    })
    .catch(() => {
      // Иконка необязательна -- плейсхолдер остаётся.
    });
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
    // Порт NotificationService.notify(...) из ApkLibraryViewModel.installToAllDevices
    // (Sources/AdbShell/ViewModels/ApkLibraryViewModel.swift) -- всегда, не
    // только при count>1, в отличие от пакетной установки/удаления в apps.ts.
    if (result.total > 0) {
      try {
        new Notification('Установка на все устройства', {
          body: result.failures.length === 0 ? `${file.name}: установлено на ${result.successCount}` : `${file.name}: установлено на ${result.successCount} из ${result.total}`,
        });
      } catch {
        // Не критично.
      }
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

async function promptAddTag(file: ApkFile): Promise<void> {
  const tag = await openTextPromptModal('Добавить тег', 'тег');
  if (!tag || !tag.trim()) return;
  try {
    tagsByPath = await adbApi.apkLibraryAddTag(file.path, tag);
    renderTagFilter();
    renderList();
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}

async function removeTag(file: ApkFile, tag: string): Promise<void> {
  try {
    tagsByPath = await adbApi.apkLibraryRemoveTag(file.path, tag);
    renderTagFilter();
    renderList();
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
