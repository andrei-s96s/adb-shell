import { adbApi, el, errorMessage } from '../api.js';
import type { InstalledApp, AppDetail, FDroidUpdateInfo } from '../api.js';
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
let onlyFDroidUpdatesEl: HTMLInputElement;
let batchToolbarEl: HTMLDivElement;
let apps: InstalledApp[] = [];
/** Найденные на F-Droid обновления для установленных приложений, по
 * packageName -- порт AppsViewModel.fdroidUpdates. Заполняется в фоне
 * после загрузки списка, ничего не скачивает/не ставит само. */
let fdroidUpdates: Record<string, FDroidUpdateInfo> = {};
/** Мультивыбор в духе Finder: обычный клик выбирает одну строку, ⌘/Ctrl-клик
 * добавляет/убирает, ⇧-клик выделяет диапазон от последнего "обычного"
 * клика. Порт AppsViewModel.handleRowClick (см. main/apps/multiSelectLogic.ts
 * -- продублировано здесь напрямую, renderer не импортирует main/*). */
let selectedForBatch = new Set<string>();
let lastClickedPackage: string | undefined;
let netPollTimer: ReturnType<typeof setInterval> | undefined;
let lastNetSample: { rx: number; tx: number; at: number } | undefined;

/** packageName -> <li> текущего рендера списка -- заполняется в renderList(),
 * позволяет клику по строке (простой клик подсвечивает выбор, но не меняет
 * набор отфильтрованных приложений) переключать класс .selected точечно, не
 * пересобирая innerHTML и не запрашивая иконки заново на каждый клик. */
let rowsByPackage = new Map<string, HTMLLIElement>();

/** serial:packageName -> data URI -- renderList() вызывается не только при
 * смене устройства/списка, а на каждый keystroke в поиске и (раньше) на
 * каждый клик по строке; без кэша уже показанная иконка перезапрашивалась
 * бы по IPC заново при каждом таком вызове, хотя AppIconService на стороне
 * main и так уже кеширует на диске -- сам круговой IPC-запрос и base64
 * data-URI собираются заново впустую, плюс иконка визуально мигала
 * (сброс на плейсхолдер и повторная асинхронная подгрузка). */
const iconCache = new Map<string, string>();

let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;

export function initAppsScreen(): void {
  listEl = el<HTMLUListElement>('apps-list');
  detailEl = el<HTMLDivElement>('apps-detail');
  statusEl = el<HTMLDivElement>('apps-status');
  searchEl = el<HTMLInputElement>('apps-search');
  showSystemEl = el<HTMLInputElement>('apps-show-system');
  onlyFDroidUpdatesEl = el<HTMLInputElement>('apps-only-fdroid-updates');
  batchToolbarEl = el<HTMLDivElement>('apps-batch-toolbar');

  // Debounce -- ввод короткого запроса из нескольких символов иначе означает
  // столько же полных перерисовок списка подряд (renderList() пересоздаёт
  // все строки), заметно на списке из сотни+ приложений. showSystemEl/
  // onlyFDroidUpdatesEl -- дискретные чекбоксы, не поток событий как ввод
  // текста, дебаунс им не нужен.
  searchEl.addEventListener('input', scheduleSearchRender);
  showSystemEl.addEventListener('change', renderList);
  onlyFDroidUpdatesEl.addEventListener('change', renderList);
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
  el<HTMLButtonElement>('apps-force-stop-selected').addEventListener('click', () => void forceStopSelected());
  el<HTMLButtonElement>('apps-clear-data-selected').addEventListener('click', () => void clearDataSelectedBatch());
  el<HTMLButtonElement>('apps-enable-selected').addEventListener('click', () => void setEnabledSelectedBatch(true));
  el<HTMLButtonElement>('apps-disable-selected').addEventListener('click', () => void setEnabledSelectedBatch(false));
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

function scheduleSearchRender(): void {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    searchDebounceTimer = undefined;
    renderList();
  }, 200);
}

function filteredApps(): InstalledApp[] {
  const query = searchEl.value.trim().toLowerCase();
  const showSystem = showSystemEl.checked;
  const onlyFDroidUpdates = onlyFDroidUpdatesEl.checked;
  return apps.filter(
    (a) =>
      (showSystem || !a.isSystem) &&
      (!query || a.packageName.toLowerCase().includes(query)) &&
      (!onlyFDroidUpdates || fdroidUpdates[a.packageName] !== undefined)
  );
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
    const results = await adbApi.appsDeleteSelected(serial, packages);
    const failed = results.filter((r) => !r.success);
    clearSelection();
    await loadApps(serial);
    renderDetail();
    statusEl.textContent =
      failed.length === 0
        ? `Удалено: ${results.length}`
        : `Удалено ${results.length - failed.length} из ${results.length}. Ошибки: ${failed.map((f) => f.message).join('; ')}`;
    if (results.length > 1) {
      try {
        new Notification('Пакетное удаление', { body: `Удалено ${results.length - failed.length} из ${results.length}` });
      } catch {
        // Не критично.
      }
    }
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}

/** Общий раннер для батч-операций над выбранными пакетами (force-stop,
 * очистка данных, вкл/выкл) -- те же статус/подсчёт успехов-неудач/
 * уведомление, что и у deleteSelected() выше, но без специфичных для
 * удаления шагов (полная перезагрузка списка, сброс выделения). Возвращает
 * serial и итог вызвавшей функции, чтобы та сама решила, что обновить
 * дальше (deleteSelected/exportSelected выше написаны раньше и оставлены
 * как есть, без миграции на этот хелпер). */
async function runBatchPackageAction(
  actionVerb: string,
  apiCall: (serial: string, packages: string[]) => Promise<{ packageName: string; success: boolean; message: string }[]>
): Promise<{ serial: string; results: { packageName: string; success: boolean; message: string }[] } | undefined> {
  const serial = getCurrentSerial();
  if (!serial || selectedForBatch.size === 0) return undefined;
  const packages = [...selectedForBatch];
  statusEl.textContent = `${actionVerb} (${packages.length})…`;
  try {
    const results = await apiCall(serial, packages);
    const failed = results.filter((r) => !r.success);
    statusEl.textContent =
      failed.length === 0
        ? `${actionVerb}: готово (${results.length})`
        : `${actionVerb}: ${results.length - failed.length} из ${results.length}. Ошибки: ${failed.map((f) => f.message).join('; ')}`;
    if (results.length > 1) {
      try {
        new Notification(actionVerb, { body: `Готово: ${results.length - failed.length} из ${results.length}` });
      } catch {
        // Не критично.
      }
    }
    return { serial, results };
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
    return undefined;
  }
}

async function forceStopSelected(): Promise<void> {
  const outcome = await runBatchPackageAction('Force stop', adbApi.appsForceStopSelected);
  if (outcome && selectedForBatch.size === 1) void loadDetail(outcome.serial, [...selectedForBatch][0]);
}

async function clearDataSelectedBatch(): Promise<void> {
  const outcome = await runBatchPackageAction('Очистка данных', adbApi.appsClearDataSelected);
  if (outcome && selectedForBatch.size === 1) void loadDetail(outcome.serial, [...selectedForBatch][0]);
}

async function setEnabledSelectedBatch(enabled: boolean): Promise<void> {
  const outcome = await runBatchPackageAction(enabled ? 'Включение' : 'Отключение', (serial, packages) =>
    adbApi.appsSetEnabledSelected(serial, packages, enabled)
  );
  if (!outcome) return;
  // isEnabled отражается прямо в подписи строки ("(выкл)") -- в отличие от
  // force-stop/очистки данных, список нужно перерисовать.
  await loadApps(outcome.serial);
  if (selectedForBatch.size === 1) void loadDetail(outcome.serial, [...selectedForBatch][0]);
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
  fdroidUpdates = {};
  try {
    apps = await adbApi.listApps(serial);
    statusEl.textContent = '';
    renderList();
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
    return;
  }
  // В фоне, не блокируя список -- сверка может занять время на устройствах
  // с сотнями приложений (сетевые запросы к F-Droid по одному на кандидата).
  adbApi
    .appsCheckFDroidUpdates(serial)
    .then((updates) => {
      if (getCurrentSerial() !== serial) return; // устройство сменилось, пока летел запрос
      fdroidUpdates = updates;
      renderList();
      if (selectedForBatch.size === 1) renderDetail(lastLoadedDetail, serial);
    })
    .catch(() => {
      // Вторичная функциональность -- молча оставляем список без бейджей.
    });
}

function renderList(): void {
  const filtered = filteredApps();
  const order = filtered.map((a) => a.packageName);

  listEl.innerHTML = '';
  rowsByPackage = new Map();
  const serialForIcons = getCurrentSerial();
  for (const app of filtered) {
    const li = document.createElement('li');
    li.className = 'row' + (selectedForBatch.has(app.packageName) ? ' selected' : '');
    rowsByPackage.set(app.packageName, li);

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

    if (fdroidUpdates[app.packageName]) {
      const updateBadge = document.createElement('span');
      updateBadge.className = 'apk-update-badge';
      updateBadge.textContent = '↑ F-Droid';
      main.appendChild(updateBadge);
    }

    li.appendChild(main);

    li.addEventListener('click', (event) => {
      handleRowClick(app.packageName, order, event.metaKey || event.ctrlKey, event.shiftKey);
      // Точечно переключаем .selected на уже существующих строках -- клик
      // выбора не меняет отфильтрованный набор, полная пересборка списка
      // (и вместе с ней -- безусловная перезагрузка всех видимых иконок по
      // IPC) здесь не нужна.
      updateSelectionClasses();
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

function updateSelectionClasses(): void {
  for (const [pkg, li] of rowsByPackage) {
    li.classList.toggle('selected', selectedForBatch.has(pkg));
  }
}

function renderBatchToolbar(): void {
  batchToolbarEl.hidden = selectedForBatch.size === 0;
  const countEl = document.getElementById('apps-selected-count');
  if (countEl) countEl.textContent = `Выбрано: ${selectedForBatch.size}`;
}

let lastLoadedDetail: AppDetail | undefined;

/** Быстрые клики по соседним строкам запускают несколько параллельных
 * adbApi.appDetail(), которые могут разрешиться не в порядке кликов
 * (dumpsys package выполняется разное время для разных пакетов) -- без
 * этой проверки renderDetail() показал бы данные не того приложения,
 * что реально выделено сейчас, а кнопки действий (Force stop и т.п.)
 * захватили бы в замыкании чужой packageName. Тот же приём уже применён
 * в loadApps() для устаревшего ответа по смене устройства. */
function isDetailRequestStale(serial: string, packageName: string): boolean {
  return getCurrentSerial() !== serial || selectedForBatch.size !== 1 || !selectedForBatch.has(packageName);
}

async function loadDetail(serial: string, packageName: string): Promise<void> {
  stopNetPolling();
  detailEl.innerHTML = '<p class="placeholder">Загрузка…</p>';
  try {
    const detail = await adbApi.appDetail(serial, packageName);
    if (isDetailRequestStale(serial, packageName)) return;
    renderDetail(detail, serial);
    if (detail.uid !== undefined) startNetPolling(serial, detail.uid);
  } catch (error) {
    if (isDetailRequestStale(serial, packageName)) return;
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
  const cacheKey = `${serial}:${packageName}`;
  const cached = iconCache.get(cacheKey);
  if (cached) {
    icon.src = cached;
    return;
  }
  adbApi
    .iconGet(serial, packageName)
    .then((dataUri) => {
      // Полный data: URI, а не голый base64 -- сама иконка может быть и
      // PNG, и WEBP (см. AppIconService.ts), MIME для <img> собирается на
      // стороне main, здесь просто присваивается как есть.
      if (!dataUri) return;
      iconCache.set(cacheKey, dataUri);
      if (!icon.isConnected) return; // строка могла уйти из DOM, пока летел запрос
      icon.src = dataUri;
    })
    .catch(() => {
      // Иконка необязательна -- плейсхолдер остаётся.
    });
}

function renderDetail(detail?: AppDetail, serial?: string): void {
  stopNetPolling();
  lastLoadedDetail = detail;
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

  const update = fdroidUpdates[detail.packageName];
  if (update) {
    detailEl.appendChild(buildFDroidUpdateCard(update, serial, detail.packageName));
  }

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

/** Порт AppDetailPanel.fdroidUpdateCard из Sources/AdbShell/Views/AppDetailPanel.swift
 * -- найденное на F-Droid обновление, предложение, не автодействие: ставится
 * только по клику на кнопку. */
function buildFDroidUpdateCard(update: FDroidUpdateInfo, serial: string, packageName: string): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'settings-section';
  card.style.borderColor = 'var(--cp-gold)';

  const title = document.createElement('div');
  title.style.color = 'var(--cp-gold)';
  title.style.fontWeight = '600';
  title.textContent = `↑ Доступно обновление на F-Droid: ${update.latestVersionName ?? update.latestVersionCode}`;
  card.appendChild(title);

  const source = document.createElement('div');
  source.className = 'hint';
  source.textContent = 'Источник: официальный каталог F-Droid';
  card.appendChild(source);

  const actionsRow = document.createElement('div');
  actionsRow.className = 'toolbar';

  const installBtn = document.createElement('button');
  installBtn.textContent = 'Установить';
  installBtn.addEventListener('click', () =>
    run(async () => {
      installBtn.disabled = true;
      installBtn.textContent = '…';
      try {
        await adbApi.appsInstallFDroidUpdate(serial, packageName, update.latestVersionCode);
        delete fdroidUpdates[packageName];
        statusEl.textContent = 'Обновлено';
        await loadDetail(serial, packageName);
      } finally {
        installBtn.disabled = false;
        installBtn.textContent = 'Установить';
      }
    })
  );
  actionsRow.appendChild(installBtn);

  const openPageBtn = document.createElement('button');
  openPageBtn.textContent = 'Страница на F-Droid';
  openPageBtn.addEventListener('click', () => void adbApi.openExternal(`https://f-droid.org/packages/${packageName}/`));
  actionsRow.appendChild(openPageBtn);

  card.appendChild(actionsRow);
  return card;
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
