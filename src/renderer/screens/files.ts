import { adbApi, el, errorMessage } from '../api.js';
import type { RemoteFile } from '../api.js';
import { onDeviceChanged, getCurrentSerial } from '../state.js';
import { openTextPromptModal } from '../modal.js';

let pathEl: HTMLInputElement;
let listEl: HTMLUListElement;
let statusEl: HTMLDivElement;
let searchEl: HTMLInputElement;
let batchToolbarEl: HTMLDivElement;
let currentPath = '/sdcard';
/** Текущий листинг папки -- хранится отдельно от отрисованного списка,
 * чтобы поиск (см. filteredEntries) мог фильтровать без повторного похода
 * на устройство, тот же приём, что и apps.ts (apps + filteredApps()). */
let entries: RemoteFile[] = [];
/** Мультивыбор по путям -- через чекбокс в каждой строке, а НЕ клик по всей
 * строке (как в apps.ts): клик по имени папки здесь уже занят навигацией
 * внутрь неё, совмещать его же с выбором строки было бы неоднозначно. */
let selectedPaths = new Set<string>();

export function initFilesScreen(): void {
  pathEl = el<HTMLInputElement>('files-path');
  listEl = el<HTMLUListElement>('files-list');
  statusEl = el<HTMLDivElement>('files-status');
  searchEl = el<HTMLInputElement>('files-search');
  batchToolbarEl = el<HTMLDivElement>('files-batch-toolbar');
  pathEl.value = currentPath;

  searchEl.addEventListener('input', renderList);

  el<HTMLButtonElement>('files-go').addEventListener('click', () => {
    currentPath = pathEl.value.trim() || '/';
    void refresh();
  });
  el<HTMLButtonElement>('files-up').addEventListener('click', () => {
    const parent = currentPath.replace(/\/+$/, '').split('/').slice(0, -1).join('/');
    currentPath = parent.length > 0 ? parent : '/';
    void refresh();
  });
  el<HTMLButtonElement>('files-mkdir').addEventListener('click', () => {
    void (async () => {
      const name = await openTextPromptModal('Новая папка', 'имя папки');
      if (!name) return;
      const serial = getCurrentSerial();
      if (!serial) return;
      run(async () => {
        await adbApi.makeDirectory(serial, joinPath(currentPath, name));
        await refresh();
      });
    })();
  });
  el<HTMLButtonElement>('files-push').addEventListener('click', () => void pushViaDialog());
  el<HTMLButtonElement>('files-delete-selected').addEventListener('click', () => void deleteSelected());

  const panel = el<HTMLElement>('tab-files');
  panel.addEventListener('dragover', (event) => event.preventDefault());
  panel.addEventListener('drop', (event) => {
    // Своя, более специфичная обработка drop, чем глобальная (renderer.ts
    // initGlobalApkDrop — установка .apk на устройство) -- здесь push
    // ЛЮБОГО файла в текущую папку на устройстве, поэтому останавливаем
    // всплытие.
    event.preventDefault();
    event.stopPropagation();
    const serial = getCurrentSerial();
    if (!serial) return;
    for (const file of Array.from(event.dataTransfer?.files ?? [])) {
      void pushOne(serial, adbApi.getPathForFile(file), file.name);
    }
  });

  onDeviceChanged((serial) => {
    entries = [];
    clearSelection();
    listEl.innerHTML = '';
    if (serial) {
      void refresh();
    } else {
      statusEl.textContent = 'Нет подключённого устройства — выберите устройство слева';
    }
  });
}

function clearSelection(): void {
  selectedPaths = new Set();
}

function filteredEntries(): RemoteFile[] {
  const query = searchEl.value.trim().toLowerCase();
  if (!query) return entries;
  return entries.filter((e) => e.name.toLowerCase().includes(query));
}

async function pushViaDialog(): Promise<void> {
  const serial = getCurrentSerial();
  if (!serial) return;
  const localPath = await adbApi.selectFileToPush();
  if (!localPath) return;
  const name = localPath.split(/[/\\]/).pop() ?? localPath;
  await pushOne(serial, localPath, name);
}

async function pushOne(serial: string, localPath: string, fileName: string): Promise<void> {
  statusEl.textContent = `Отправка ${fileName}…`;
  try {
    await adbApi.push(serial, localPath, joinPath(currentPath, fileName));
    statusEl.textContent = `Отправлено: ${fileName}`;
    await refresh();
  } catch (error) {
    statusEl.textContent = `Ошибка отправки: ${errorMessage(error)}`;
  }
}

/** Удаление всех отмеченных чекбоксом строк одним нажатием -- та же логика,
 * что и apps.ts deleteSelected() (продолжаем остальные при ошибке одной,
 * не прерываем пакет на полпути). */
async function deleteSelected(): Promise<void> {
  const serial = getCurrentSerial();
  if (!serial || selectedPaths.size === 0) return;
  const targets = entries.filter((e) => selectedPaths.has(e.path));
  statusEl.textContent = `Удаление ${targets.length}…`;
  let deleted = 0;
  for (const entry of targets) {
    try {
      await adbApi.removeRemote(serial, entry.path, entry.isDirectory);
      deleted += 1;
    } catch {
      // Продолжаем остальные -- одна неудача не должна прерывать пакет.
    }
  }
  clearSelection();
  statusEl.textContent = `Удалено: ${deleted}/${targets.length}`;
  await refresh();
}

function joinPath(parent: string, name: string): string {
  return parent.endsWith('/') ? parent + name : parent + '/' + name;
}

async function refresh(): Promise<void> {
  const serial = getCurrentSerial();
  if (!serial) return;
  pathEl.value = currentPath;
  clearSelection();
  statusEl.textContent = 'Загрузка…';
  try {
    entries = await adbApi.listDirectory(serial, currentPath);
    statusEl.textContent = '';
    renderList();
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
    entries = [];
    listEl.innerHTML = '';
  }
}

function renderList(): void {
  const serial = getCurrentSerial();
  listEl.innerHTML = '';
  for (const entry of filteredEntries()) {
    const li = document.createElement('li');
    li.className = 'row';

    // Группа "чекбокс + имя" одним flex-элементом -- иначе при 3-4 прямых
    // детях у li сам .row (justify-content: space-between, см. theme.css)
    // равномерно раскидал бы чекбокс/имя/кнопки по всей ширине строки
    // вместо аккуратного "инфо слева, действия справа", как у остальных
    // вкладок со схожим списком (apps.ts -- .apps-row-main).
    const main = document.createElement('div');
    main.className = 'files-row-main';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedPaths.has(entry.path);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedPaths.add(entry.path);
      else selectedPaths.delete(entry.path);
      renderBatchToolbar();
    });
    main.appendChild(checkbox);

    const label = document.createElement('span');
    label.textContent = (entry.isDirectory ? '📁 ' : '📄 ') + entry.name + (entry.sizeBytes !== undefined ? `  (${entry.sizeBytes} B)` : '');
    label.style.cursor = entry.isDirectory ? 'pointer' : 'default';
    if (entry.isDirectory) {
      label.addEventListener('click', () => {
        currentPath = entry.path;
        void refresh();
      });
    }
    main.appendChild(label);
    li.appendChild(main);

    // Обе кнопки в ОДНОЙ группе -- вторым (и последним) прямым ребёнком li,
    // рядом с main выше. Раньше "Скачать"/"Удалить" были отдельными прямыми
    // детьми li -- при 2-3 прямых детях .row (justify-content: space-between)
    // распределяет свободное место МЕЖДУ ВСЕМИ ними поровну, а не "инфо
    // слева, кнопки одним блоком справа": чем короче имя файла, тем больше
    // свободного места и тем сильнее раздвигало "Скачать" от "Удалить" --
    // реальный баг, пойманный вживую ("кнопка скачать уезжает от разной
    // длины имени файла"). Ровно тот же принцип, что и main выше (см.
    // комментарий там) и .device-row-actions в renderer.ts.
    const actions = document.createElement('div');
    actions.className = 'files-row-actions';

    if (!entry.isDirectory && serial) {
      const pull = document.createElement('button');
      pull.textContent = 'Скачать';
      pull.addEventListener('click', () =>
        run(async () => {
          const saved = await adbApi.pullToChosenPath(serial, entry.path, entry.name);
          if (saved) statusEl.textContent = `Скачано: ${entry.name}`;
        })
      );
      actions.appendChild(pull);
    }

    if (serial) {
      const del = document.createElement('button');
      del.textContent = 'Удалить';
      del.addEventListener('click', () =>
        run(async () => {
          await adbApi.removeRemote(serial, entry.path, entry.isDirectory);
          await refresh();
        })
      );
      actions.appendChild(del);
    }

    if (actions.childElementCount > 0) li.appendChild(actions);

    listEl.appendChild(li);
  }
  renderBatchToolbar();
}

function renderBatchToolbar(): void {
  batchToolbarEl.hidden = selectedPaths.size === 0;
  const countEl = document.getElementById('files-selected-count');
  if (countEl) countEl.textContent = `Выбрано: ${selectedPaths.size}`;
}

function run(action: () => Promise<void>): void {
  statusEl.textContent = '';
  action().catch((error) => {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  });
}
