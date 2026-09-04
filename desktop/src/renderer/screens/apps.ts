import { adbApi, el, errorMessage } from '../api.js';
import type { InstalledApp, AppDetail } from '../api.js';
import { onDeviceChanged, getCurrentSerial } from '../state.js';
import { openDeviceCompareModal } from './deviceCompare.js';
import { openSnapshotsModal } from './snapshots.js';
import { loadDefaultShowSystemApps } from './settings.js';

const NET_POLL_INTERVAL_MS = 3000;

// Простая нейтральная иконка-плейсхолдер (квадрат со скруглением) --
// показывается, пока (или если) реальная иконка из APK не пришла (порт
// IconService.swift). Инлайновый SVG вместо файла-ассета -- одна строка,
// не нужно тянуть отдельный ресурс в сборку.
const PLACEHOLDER_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="7" fill="#8886"/></svg>'
  );

let listEl: HTMLUListElement;
let detailEl: HTMLDivElement;
let statusEl: HTMLDivElement;
let searchEl: HTMLInputElement;
let showSystemEl: HTMLInputElement;
let batchToolbarEl: HTMLDivElement;
let apps: InstalledApp[] = [];
/** Мультивыбор в духе Finder: обычный клик выбирает одну строку, ⌘/Ctrl-клик
 * добавляет/убирает, ⇧-клик выделяет диапазон от последнего "обычного"
 * клика. Порт AppsViewModel.handleRowClick (см. main/apps/multiSelectLogic.ts
 * -- продублировано здесь напрямую, renderer не импортирует main/*). */
let selectedForBatch = new Set<string>();
let lastClickedPackage: string | undefined;
let netPollTimer: ReturnType<typeof setInterval> | undefined;
let lastNetSample: { rx: number; tx: number; at: number } | undefined;

export function initAppsScreen(): void {
  listEl = el<HTMLUListElement>('apps-list');
  detailEl = el<HTMLDivElement>('apps-detail');
  statusEl = el<HTMLDivElement>('apps-status');
  searchEl = el<HTMLInputElement>('apps-search');
  showSystemEl = el<HTMLInputElement>('apps-show-system');
  batchToolbarEl = el<HTMLDivElement>('apps-batch-toolbar');

  searchEl.addEventListener('input', renderList);
  showSystemEl.addEventListener('change', renderList);
  void loadDefaultShowSystemApps().then((value) => {
    showSystemEl.checked = value;
  });
  el<HTMLButtonElement>('apps-install').addEventListener('click', () => void installApks());
  el<HTMLButtonElement>('apps-export-csv').addEventListener('click', () => void exportCsv());
  el<HTMLButtonElement>('apps-compare').addEventListener('click', () => {
    const serial = getCurrentSerial();
    if (serial) openDeviceCompareModal(serial);
  });
  el<HTMLButtonElement>('apps-import-bundle').addEventListener('click', () => void importBundle());
  el<HTMLButtonElement>('apps-snapshot').addEventListener('click', () => {
    const serial = getCurrentSerial();
    if (serial) openSnapshotsModal(serial, apps, () => void loadApps(serial));
  });
  el<HTMLButtonElement>('apps-export-selected').addEventListener('click', () => void exportSelected());
  el<HTMLButtonElement>('apps-delete-selected').addEventListener('click', () => void deleteSelected());

  onDeviceChanged((serial) => {
    clearSelection();
    apps = [];
    renderList();
    renderDetail();
    if (serial) {
      void loadApps(serial);
    } else {
      statusEl.textContent = 'Нет подключённого устройства — выберите устройство слева';
    }
  });
}

function clearSelection(): void {
  selectedForBatch = new Set();
  lastClickedPackage = undefined;
}

function filteredApps(): InstalledApp[] {
  const query = searchEl.value.trim().toLowerCase();
  const showSystem = showSystemEl.checked;
  return apps.filter((a) => (showSystem || !a.isSystem) && (!query || a.packageName.toLowerCase().includes(query)));
}

async function exportCsv(): Promise<void> {
  const serial = getCurrentSerial();
  if (!serial) return;
  let csv = 'package_name,is_system,is_enabled\n';
  for (const app of filteredApps()) {
    csv += `${app.packageName},${app.isSystem},${app.isEnabled}\n`;
  }
  try {
    const saved = await adbApi.saveCsv(`packages-${serial}.csv`, csv);
    if (saved) statusEl.textContent = 'Экспортировано';
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}

/** Порт AppsViewModel.installBatch -- выбор нескольких файлов сразу
 * (диалог всегда позволяет мультивыбор, один файл — частный случай). */
async function installApks(): Promise<void> {
  const serial = getCurrentSerial();
  if (!serial) {
    statusEl.textContent = 'Нет подключённого устройства — выберите устройство слева';
    return;
  }
  const apkPaths = await adbApi.selectApkFiles();
  if (apkPaths.length === 0) return;
  statusEl.textContent = `Установка ${apkPaths.length} APK…`;
  try {
    const results = await adbApi.appsInstallBatch(serial, apkPaths);
    const failed = results.filter((r) => !r.success);
    statusEl.textContent =
      failed.length === 0 ? `Установлено: ${results.length}` : `Установлено ${results.length - failed.length} из ${results.length}. Ошибки: ${failed.map((f) => f.message).join('; ')}`;
    if (results.length > 1) {
      try {
        new Notification('Пакетная установка', { body: `Установлено ${results.length - failed.length} из ${results.length}` });
      } catch {
        // Не критично.
      }
    }
    await loadApps(serial);
  } catch (error) {
    statusEl.textContent = `Ошибка установки: ${errorMessage(error)}`;
  }
}

async function deleteSelected(): Promise<void> {
  const serial = getCurrentSerial();
  if (!serial || selectedForBatch.size === 0) return;
  const packages = [...selectedForBatch];
  statusEl.textContent = `Удаление ${packages.length}…`;
  try {
    const count = await adbApi.appsDeleteSelected(serial, packages);
    clearSelection();
    await loadApps(serial);
    renderDetail();
    statusEl.textContent = `Удалено: ${count}`;
    if (count > 1) {
      try {
        new Notification('Пакетное удаление', { body: `Удалено приложений: ${count}` });
      } catch {
        // Не критично.
      }
    }
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}

/** Порт AppsViewModel.exportSelected -- выбранные приложения вместе с их
 * выданными runtime-разрешениями в один .zip. */
async function exportSelected(): Promise<void> {
  const serial = getCurrentSerial();
  if (!serial || selectedForBatch.size === 0) return;
  const packages = [...selectedForBatch];
  statusEl.textContent = 'Экспорт…';
  try {
    const outcome = await adbApi.appsExportSelected(serial, packages);
    if (!outcome) {
      statusEl.textContent = '';
      return;
    }
    statusEl.textContent = outcome.entryCount > 0 ? `Экспортировано приложений: ${outcome.entryCount}` : 'Ничего не экспортировано';
    clearSelection();
    renderList();
    renderBatchToolbar();
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}

/** Порт AppsViewModel.importBundle -- ставит набор из .zip: apk + сохранённые
 * runtime-разрешения через pm grant. */
async function importBundle(): Promise<void> {
  const serial = getCurrentSerial();
  if (!serial) {
    statusEl.textContent = 'Нет подключённого устройства — выберите устройство слева';
    return;
  }
  statusEl.textContent = 'Импорт…';
  try {
    const outcome = await adbApi.appsImportBundle(serial);
    if (!outcome) {
      statusEl.textContent = '';
      return;
    }
    const failed = outcome.results.filter((r) => !r.success);
    statusEl.textContent =
      failed.length === 0
        ? `Импортировано: ${outcome.results.length}`
        : `Импортировано ${outcome.results.length - failed.length} из ${outcome.results.length}`;
    await loadApps(serial);
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}

async function loadApps(serial: string): Promise<void> {
  statusEl.textContent = 'Загрузка списка приложений…';
  try {
    apps = await adbApi.listApps(serial);
    statusEl.textContent = '';
    renderList();
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}

function renderList(): void {
  const filtered = filteredApps();
  const order = filtered.map((a) => a.packageName);

  listEl.innerHTML = '';
  const serialForIcons = getCurrentSerial();
  for (const app of filtered) {
    const li = document.createElement('li');
    li.className = 'row' + (selectedForBatch.has(app.packageName) ? ' selected' : '');

    const main = document.createElement('div');
    main.className = 'apps-row-main';

    const icon = document.createElement('img');
    icon.className = 'app-icon';
    icon.src = PLACEHOLDER_ICON;
    main.appendChild(icon);
    if (serialForIcons) loadIcon(icon, serialForIcons, app.packageName);

    const label = document.createElement('span');
    label.textContent = app.packageName + (app.isSystem ? '  [SYS]' : '') + (!app.isEnabled ? '  (выкл)' : '');
    main.appendChild(label);

    li.appendChild(main);

    li.addEventListener('click', (event) => {
      handleRowClick(app.packageName, order, event.metaKey || event.ctrlKey, event.shiftKey);
      renderList();
      renderBatchToolbar();
      const serial = getCurrentSerial();
      if (serial && selectedForBatch.size === 1) {
        void loadDetail(serial, [...selectedForBatch][0]);
      } else {
        renderDetail();
      }
    });
    listEl.appendChild(li);
  }
}

/** Дубликат main/apps/multiSelectLogic.ts (см. комментарий там про то, почему
 * не импортируется напрямую) -- обычный клик выбирает одну строку, ⌘/Ctrl
 * добавляет/убирает, ⇧ выделяет диапазон от последнего обычного клика. */
function handleRowClick(packageName: string, order: string[], meta: boolean, shift: boolean): void {
  if (meta) {
    if (selectedForBatch.has(packageName)) {
      selectedForBatch.delete(packageName);
    } else {
      selectedForBatch.add(packageName);
    }
    lastClickedPackage = packageName;
    return;
  }
  if (shift && lastClickedPackage !== undefined) {
    const anchorIdx = order.indexOf(lastClickedPackage);
    const clickedIdx = order.indexOf(packageName);
    if (anchorIdx !== -1 && clickedIdx !== -1) {
      const from = Math.min(anchorIdx, clickedIdx);
      const to = Math.max(anchorIdx, clickedIdx);
      for (let i = from; i <= to; i++) selectedForBatch.add(order[i]);
      return;
    }
  }
  selectedForBatch = new Set([packageName]);
  lastClickedPackage = packageName;
}

function renderBatchToolbar(): void {
  batchToolbarEl.hidden = selectedForBatch.size === 0;
  const countEl = document.getElementById('apps-selected-count');
  if (countEl) countEl.textContent = `Выбрано: ${selectedForBatch.size}`;
}

async function loadDetail(serial: string, packageName: string): Promise<void> {
  stopNetPolling();
  detailEl.innerHTML = '<p class="placeholder">Загрузка…</p>';
  try {
    const detail = await adbApi.appDetail(serial, packageName);
    renderDetail(detail, serial);
    if (detail.uid !== undefined) startNetPolling(serial, detail.uid);
  } catch (error) {
    detailEl.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = `Ошибка: ${errorMessage(error)}`;
    detailEl.appendChild(p);
  }
}

function startNetPolling(serial: string, uid: number): void {
  lastNetSample = undefined;
  const tick = (): void => {
    adbApi
      .networkUsage(serial, uid)
      .then((usage) => {
        const now = Date.now();
        const netLineEl = document.getElementById('apps-detail-net');
        if (!netLineEl) return;
        if (lastNetSample) {
          const dt = (now - lastNetSample.at) / 1000;
          if (dt > 0) {
            const rxRate = Math.max(0, (usage.rxBytes - lastNetSample.rx) / dt);
            const txRate = Math.max(0, (usage.txBytes - lastNetSample.tx) / dt);
            netLineEl.textContent = `сеть: ↓ ${formatRate(rxRate)} · ↑ ${formatRate(txRate)} (всего ↓ ${formatBytes(usage.rxBytes)} / ↑ ${formatBytes(usage.txBytes)})`;
          }
        }
        lastNetSample = { rx: usage.rxBytes, tx: usage.txBytes, at: now };
      })
      // Секция вторичная -- не должна затирать основную панель ошибкой.
      .catch(() => {});
  };
  void tick();
  netPollTimer = setInterval(tick, NET_POLL_INTERVAL_MS);
}

function stopNetPolling(): void {
  if (netPollTimer) clearInterval(netPollTimer);
  netPollTimer = undefined;
  lastNetSample = undefined;
}

function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes.toFixed(0)} B`;
}

/** Лениво подгружает реальную иконку приложения (см.
 * main/appIcons/AppIconService.ts) -- каждая видимая строка запрашивает
 * свою один раз; если строка успела уйти из DOM (сменился список/устройство,
 * пока летел запрос), просто не применяем устаревший результат. */
function loadIcon(icon: HTMLImageElement, serial: string, packageName: string): void {
  adbApi
    .iconGet(serial, packageName)
    .then((base64) => {
      if (!base64 || !icon.isConnected) return;
      icon.src = `data:image/png;base64,${base64}`;
    })
    .catch(() => {
      // Иконка необязательна -- плейсхолдер остаётся.
    });
}

function renderDetail(detail?: AppDetail, serial?: string): void {
  stopNetPolling();
  if (!detail || !serial) {
    detailEl.innerHTML =
      selectedForBatch.size > 1
        ? `<p class="placeholder">Выбрано приложений: ${selectedForBatch.size} — используйте Экспортировать/Удалить выбранные</p>`
        : '<p class="placeholder">Выберите приложение слева</p>';
    return;
  }

  detailEl.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'detail-header';

  const title = document.createElement('h2');
  title.textContent = detail.packageName;
  header.appendChild(title);

  const versionLine = document.createElement('div');
  versionLine.className = 'hint';
  versionLine.textContent = `версия ${detail.versionName ?? '—'} (${detail.versionCode ?? '—'}) · target SDK ${detail.targetSdk ?? '—'}`;
  header.appendChild(versionLine);

  const pathLine = document.createElement('div');
  pathLine.className = 'hint';
  pathLine.textContent = `путь: ${detail.apkPath ?? '—'}`;
  header.appendChild(pathLine);

  if (detail.uid !== undefined) {
    const netLine = document.createElement('div');
    netLine.className = 'hint';
    netLine.id = 'apps-detail-net';
    netLine.textContent = 'сеть: —';
    header.appendChild(netLine);
  }

  const datesLine = document.createElement('div');
  datesLine.className = 'hint';
  datesLine.textContent = `установлено: ${detail.firstInstallTime ?? '—'} · обновлено: ${detail.lastUpdateTime ?? '—'}`;
  header.appendChild(datesLine);

  detailEl.appendChild(header);

  const actions = document.createElement('div');
  actions.className = 'actions-row';
  actions.appendChild(actionButton('Force stop', () => run(() => adbApi.forceStop(serial, detail.packageName))));
  actions.appendChild(actionButton('Очистить данные', () => run(() => adbApi.clearData(serial, detail.packageName))));
  actions.appendChild(
    actionButton('Экспортировать APK', () =>
      run(async () => {
        const saved = await adbApi.appsExportApk(serial, detail.packageName);
        statusEl.textContent = saved ? 'APK экспортирован' : '';
      })
    )
  );
  actions.appendChild(
    actionButton(detail.isEnabled ? 'Отключить' : 'Включить', () =>
      run(async () => {
        await adbApi.setEnabled(serial, detail.packageName, !detail.isEnabled);
        await loadDetail(serial, detail.packageName);
      })
    )
  );
  actions.appendChild(
    actionButton('Удалить', () =>
      run(async () => {
        await adbApi.uninstall(serial, detail.packageName);
        clearSelection();
        await loadApps(serial);
        renderDetail();
        renderBatchToolbar();
      })
    )
  );
  detailEl.appendChild(actions);

  const permsTitle = document.createElement('div');
  permsTitle.className = 'hint section-title';
  permsTitle.textContent = `Разрешения (${detail.permissions.length})`;
  detailEl.appendChild(permsTitle);

  const permsList = document.createElement('ul');
  permsList.className = 'perms-list';
  for (const perm of detail.permissions) {
    const li = document.createElement('li');
    li.className = 'row';
    const label = document.createElement('span');
    label.textContent = perm.name;
    li.appendChild(label);
    if (perm.isRuntime) {
      const button = document.createElement('button');
      button.textContent = perm.granted ? 'Забрать' : 'Выдать';
      button.addEventListener('click', () =>
        run(async () => {
          if (perm.granted) {
            await adbApi.revokePermission(serial, detail.packageName, perm.name);
          } else {
            await adbApi.grantPermission(serial, detail.packageName, perm.name);
          }
          await loadDetail(serial, detail.packageName);
        })
      );
      li.appendChild(button);
    } else {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = perm.granted ? 'AUTO' : '—';
      li.appendChild(badge);
    }
    permsList.appendChild(li);
  }
  detailEl.appendChild(permsList);
}

function actionButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function run(action: () => Promise<void>): void {
  statusEl.textContent = '';
  action().catch((error) => {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  });
}
