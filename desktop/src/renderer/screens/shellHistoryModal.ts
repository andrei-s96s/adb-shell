// Порт избранного/истории из Sources/AdbShell/Services/ShellHistoryStore.swift
// -- модалка со списком избранных и недавних команд, клик подставляет текст
// в поле ввода Shell.

import { adbApi, errorMessage } from '../api.js';
import type { SavedCommand } from '../api.js';
import { openModal } from '../modal.js';

export function openShellHistoryModal(onPick: (text: string) => void): void {
  openModal('История команд', (body) => {
    body.innerHTML = '<p class="hint">Загрузка…</p>';
    adbApi
      .shellHistoryList()
      .then((items) => render(body, items, onPick))
      .catch((error) => {
        body.innerHTML = `<p class="error">Ошибка: ${errorMessage(error)}</p>`;
      });
  });
}

function render(body: HTMLDivElement, items: SavedCommand[], onPick: (text: string) => void): void {
  body.innerHTML = '';
  const favorites = items.filter((i) => i.isFavorite).sort((a, b) => a.text.localeCompare(b.text));
  const recent = items.filter((i) => !i.isFavorite).sort((a, b) => b.lastUsedMs - a.lastUsedMs);

  body.appendChild(section('Избранное', favorites, onPick, () => render(body, items, onPick), (updated) => (items = updated)));
  body.appendChild(section('Недавние', recent, onPick, () => render(body, items, onPick), (updated) => (items = updated)));

  if (items.length > 0) {
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'Очистить всю историю';
    clearBtn.addEventListener('click', () => {
      adbApi
        .shellHistoryClear()
        .then((updated) => render(body, updated, onPick))
        .catch(() => {});
    });
    body.appendChild(clearBtn);
  }
}

function section(
  title: string,
  commands: SavedCommand[],
  onPick: (text: string) => void,
  refresh: () => void,
  setItems: (items: SavedCommand[]) => void
): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'hint section-title';
  wrapper.textContent = `${title} (${commands.length})`;

  const container = document.createElement('div');
  container.appendChild(wrapper);

  const list = document.createElement('ul');
  list.className = 'scroll-list small';
  if (commands.length === 0) {
    list.innerHTML = '<li class="hint">Пусто</li>';
  }
  for (const cmd of commands) {
    const li = document.createElement('li');
    li.className = 'row';
    const label = document.createElement('span');
    label.textContent = cmd.text;
    label.style.cursor = 'pointer';
    label.addEventListener('click', () => onPick(cmd.text));
    li.appendChild(label);

    const starBtn = document.createElement('button');
    starBtn.type = 'button';
    starBtn.textContent = cmd.isFavorite ? '★' : '☆';
    starBtn.addEventListener('click', () => {
      adbApi
        .shellHistoryToggleFavorite(cmd.id)
        .then((updated) => {
          setItems(updated);
          refresh();
        })
        .catch(() => {});
    });
    li.appendChild(starBtn);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      adbApi
        .shellHistoryRemove(cmd.id)
        .then((updated) => {
          setItems(updated);
          refresh();
        })
        .catch(() => {});
    });
    li.appendChild(removeBtn);

    list.appendChild(li);
  }
  container.appendChild(list);
  return container;
}
