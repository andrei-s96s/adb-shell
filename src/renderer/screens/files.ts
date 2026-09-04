import { adbApi, el, errorMessage } from '../api.js';
import type { RemoteFile } from '../api.js';
import { onDeviceChanged, getCurrentSerial } from '../state.js';

let pathEl: HTMLInputElement;
let listEl: HTMLUListElement;
let statusEl: HTMLDivElement;
let currentPath = '/sdcard';

export function initFilesScreen(): void {
  pathEl = el<HTMLInputElement>('files-path');
  listEl = el<HTMLUListElement>('files-list');
  statusEl = el<HTMLDivElement>('files-status');
  pathEl.value = currentPath;

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
    const name = prompt('Имя новой папки:');
    if (!name) return;
    const serial = getCurrentSerial();
    if (!serial) return;
    run(async () => {
      await adbApi.makeDirectory(serial, joinPath(currentPath, name));
      await refresh();
    });
  });
  el<HTMLButtonElement>('files-push').addEventListener('click', () => void pushViaDialog());

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
    listEl.innerHTML = '';
    if (serial) {
      void refresh();
    } else {
      statusEl.textContent = 'Нет подключённого устройства — выберите устройство слева';
    }
  });
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

function joinPath(parent: string, name: string): string {
  return parent.endsWith('/') ? parent + name : parent + '/' + name;
}

async function refresh(): Promise<void> {
  const serial = getCurrentSerial();
  if (!serial) return;
  pathEl.value = currentPath;
  statusEl.textContent = 'Загрузка…';
  try {
    const entries = await adbApi.listDirectory(serial, currentPath);
    statusEl.textContent = '';
    renderList(entries, serial);
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
    listEl.innerHTML = '';
  }
}

function renderList(entries: RemoteFile[], serial: string): void {
  listEl.innerHTML = '';
  for (const entry of entries) {
    const li = document.createElement('li');
    li.className = 'row';

    const label = document.createElement('span');
    label.textContent = (entry.isDirectory ? '📁 ' : '📄 ') + entry.name + (entry.sizeBytes !== undefined ? `  (${entry.sizeBytes} B)` : '');
    label.style.cursor = entry.isDirectory ? 'pointer' : 'default';
    if (entry.isDirectory) {
      label.addEventListener('click', () => {
        currentPath = entry.path;
        void refresh();
      });
    }
    li.appendChild(label);

    if (!entry.isDirectory) {
      const pull = document.createElement('button');
      pull.textContent = 'Скачать';
      pull.addEventListener('click', () =>
        run(async () => {
          const saved = await adbApi.pullToChosenPath(serial, entry.path, entry.name);
          if (saved) statusEl.textContent = `Скачано: ${entry.name}`;
        })
      );
      li.appendChild(pull);
    }

    const del = document.createElement('button');
    del.textContent = 'Удалить';
    del.addEventListener('click', () =>
      run(async () => {
        await adbApi.removeRemote(serial, entry.path, entry.isDirectory);
        await refresh();
      })
    );
    li.appendChild(del);

    listEl.appendChild(li);
  }
}

function run(action: () => Promise<void>): void {
  statusEl.textContent = '';
  action().catch((error) => {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  });
}
