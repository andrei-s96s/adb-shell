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

  onDeviceChanged((serial) => {
    listEl.innerHTML = '';
    if (serial) void refresh();
  });
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
