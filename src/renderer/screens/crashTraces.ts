// Порт CrashTracesViewModel/CrashTracesSheet из
// Sources/AdbShell/ViewModels/CrashTracesViewModel.swift +
// Views/CrashTracesSheet.swift. Точка входа — кнопка "Crashes…" в Logcat,
// как и в оригинале.

import { adbApi, errorMessage } from '../api.js';
import type { CrashTraceFile } from '../api.js';
import { openModal } from '../modal.js';

export function openCrashTracesModal(serial: string): void {
  openModal('ANR / Tombstones', (body) => {
    body.innerHTML = '<p class="hint">Загрузка…</p>';
    adbApi
      .crashTraces(serial)
      // Сортировка по убыванию имени файла -- имена обычно содержат
      // временную метку, так новые оказываются сверху (как в оригинале:
      // это строковая сортировка, а не разбор реальной даты).
      .then((files) => [...files].sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0)))
      .then((files) => renderLayout(body, serial, files))
      .catch((error) => {
        body.innerHTML = `<p class="error">Ошибка: ${errorMessage(error)}</p>`;
      });
  });
}

function renderLayout(body: HTMLDivElement, serial: string, files: CrashTraceFile[]): void {
  body.innerHTML = '';
  if (files.length === 0) {
    body.innerHTML = '<p class="hint">Файлов не найдено (без root каталоги /data/anr и /data/tombstones обычно недоступны).</p>';
    return;
  }

  const layout = document.createElement('div');
  layout.className = 'trace-layout';

  const list = document.createElement('ul');
  list.className = 'trace-list scroll-list';

  const contentEl = document.createElement('div');
  contentEl.className = 'trace-content';
  contentEl.textContent = 'Выберите файл слева';

  for (const file of files) {
    const li = document.createElement('li');
    li.className = 'row';
    const label = document.createElement('span');
    label.textContent = `${file.kind === 'anr' ? '⏳' : '☠️'} ${file.name}`;
    label.title = file.path;
    li.appendChild(label);
    li.addEventListener('click', () => {
      for (const other of Array.from(list.children)) other.classList.remove('selected');
      li.classList.add('selected');
      contentEl.textContent = 'Загрузка…';
      adbApi
        .readCrashTrace(serial, file.path)
        .then((text) => {
          contentEl.textContent = text.length > 0 ? text : '(пусто)';
        })
        .catch((error) => {
          contentEl.textContent = `Ошибка: ${errorMessage(error)}`;
        });
    });
    list.appendChild(li);
  }

  layout.appendChild(list);
  layout.appendChild(contentEl);
  body.appendChild(layout);
}
