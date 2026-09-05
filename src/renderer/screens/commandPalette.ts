// Порт CommandPaletteView из Sources/AdbShell/Views/CommandPaletteView.swift
// — быстрый поиск (⌘K/Ctrl+K): переключение вкладки, выбор устройства или
// запуск макроса, без похода мышью в сайдбар/тулбар. Список источников
// сознательно небольшой и статичный (вкладки, устройства, макросы), а не
// индекс всего приложения — этого достаточно для быстрой навигации.

import { adbApi } from '../api.js';
import type { Device, Macro } from '../api.js';
import { getCurrentSerial } from '../state.js';
import { selectDeviceFromPalette } from '../renderer.js';

const TABS: { id: string; title: string }[] = [
  { id: 'apps', title: 'Приложения' },
  { id: 'apklibrary', title: 'Библиотека APK' },
  { id: 'files', title: 'Файлы' },
  { id: 'shell', title: 'Shell' },
  { id: 'macros', title: 'Макросы' },
  { id: 'tools', title: 'Инструменты' },
  { id: 'monitor', title: 'Мониторинг' },
  { id: 'logcat', title: 'Logcat' },
  { id: 'settings', title: 'Настройки' },
  { id: 'donate', title: 'Донат' },
];

type PaletteResult =
  | { kind: 'tab'; tabId: string; title: string }
  | { kind: 'device'; serial: string; label: string; ready: boolean }
  | { kind: 'macro'; id: string; name: string };

export function initCommandPalette(): void {
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openCommandPalette();
    }
  });
}

function openCommandPalette(): void {
  // Только одна палитра одновременно -- повторный ⌘K закрывает старую и
  // не плодит наложенные друг на друга оверлеи.
  document.querySelector('.palette-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay palette-overlay';
  const panel = document.createElement('div');
  panel.className = 'palette-panel';

  const input = document.createElement('input');
  input.className = 'palette-input';
  input.placeholder = 'Вкладка, устройство или макрос…';
  panel.appendChild(input);

  const resultsEl = document.createElement('div');
  resultsEl.className = 'palette-results';
  panel.appendChild(resultsEl);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  input.focus();

  let devices: Device[] = [];
  let macros: Macro[] = [];
  let results: PaletteResult[] = [];

  function close(): void {
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
  }

  function computeResults(): PaletteResult[] {
    const needle = input.value.trim().toLowerCase();
    const tabs: PaletteResult[] = TABS.filter((t) => !needle || t.title.toLowerCase().includes(needle)).map((t) => ({
      kind: 'tab',
      tabId: t.id,
      title: t.title,
    }));
    const deviceResults: PaletteResult[] = devices
      .filter((d) => {
        const label = d.model ? d.model.replace(/_/g, ' ') : d.serial;
        return !needle || label.toLowerCase().includes(needle);
      })
      .map((d) => ({
        kind: 'device',
        serial: d.serial,
        label: d.model ? d.model.replace(/_/g, ' ') : d.serial,
        ready: d.state === 'device',
      }));
    const macroResults: PaletteResult[] = macros
      .filter((m) => !needle || m.name.toLowerCase().includes(needle))
      .map((m) => ({ kind: 'macro', id: m.id, name: m.name }));
    return [...tabs, ...deviceResults, ...macroResults];
  }

  function render(): void {
    results = computeResults();
    resultsEl.innerHTML = '';
    if (results.length === 0) {
      resultsEl.innerHTML = '<div class="hint" style="padding:14px">Ничего не найдено</div>';
      return;
    }
    for (const result of results) {
      const row = document.createElement('div');
      row.className = 'palette-row';
      const label = document.createElement('span');
      const kindBadge = document.createElement('span');
      kindBadge.className = 'badge';
      if (result.kind === 'tab') {
        label.textContent = result.title;
        kindBadge.textContent = 'вкладка';
      } else if (result.kind === 'device') {
        label.textContent = `${result.ready ? '🟢' : '🔴'} ${result.label}`;
        kindBadge.textContent = 'устройство';
      } else {
        label.textContent = `▶ ${result.name}`;
        kindBadge.textContent = 'макрос';
      }
      row.appendChild(label);
      row.appendChild(kindBadge);
      row.addEventListener('click', () => activate(result));
      resultsEl.appendChild(row);
    }
  }

  function activate(result: PaletteResult): void {
    if (result.kind === 'tab') {
      const btn = document.querySelector<HTMLButtonElement>(`#tabs button[data-tab="${result.tabId}"]`);
      btn?.click();
    } else if (result.kind === 'device') {
      selectDeviceFromPalette(result.serial);
    } else {
      const serial = getCurrentSerial();
      if (serial) adbApi.macrosRun(result.id, serial, {}).catch(() => {});
      document.querySelector<HTMLButtonElement>('#tabs button[data-tab="macros"]')?.click();
    }
    close();
  }

  input.addEventListener('input', render);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && results.length > 0) activate(results[0]);
  });

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKeydown);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  Promise.all([adbApi.listDevices().catch((): Device[] => []), adbApi.macrosList().catch((): Macro[] => [])]).then(
    ([deviceList, macroList]) => {
      devices = deviceList;
      macros = macroList;
      render();
    }
  );
  render();
}
