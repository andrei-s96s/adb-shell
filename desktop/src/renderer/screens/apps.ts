import { adbApi, el, errorMessage } from '../api.js';
import type { InstalledApp, AppDetail } from '../api.js';
import { onDeviceChanged, getCurrentSerial } from '../state.js';
import { openDeviceCompareModal } from './deviceCompare.js';

const NET_POLL_INTERVAL_MS = 3000;

let listEl: HTMLUListElement;
let detailEl: HTMLDivElement;
let statusEl: HTMLDivElement;
let searchEl: HTMLInputElement;
let showSystemEl: HTMLInputElement;
let apps: InstalledApp[] = [];
let selectedPackage: string | undefined;
let netPollTimer: ReturnType<typeof setInterval> | undefined;
let lastNetSample: { rx: number; tx: number; at: number } | undefined;

export function initAppsScreen(): void {
  listEl = el<HTMLUListElement>('apps-list');
  detailEl = el<HTMLDivElement>('apps-detail');
  statusEl = el<HTMLDivElement>('apps-status');
  searchEl = el<HTMLInputElement>('apps-search');
  showSystemEl = el<HTMLInputElement>('apps-show-system');

  searchEl.addEventListener('input', renderList);
  showSystemEl.addEventListener('change', renderList);
  el<HTMLButtonElement>('apps-install').addEventListener('click', () => void installApk());
  el<HTMLButtonElement>('apps-export-csv').addEventListener('click', () => void exportCsv());
  el<HTMLButtonElement>('apps-compare').addEventListener('click', () => {
    const serial = getCurrentSerial();
    if (serial) openDeviceCompareModal(serial);
  });

  onDeviceChanged((serial) => {
    selectedPackage = undefined;
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

async function installApk(): Promise<void> {
  const serial = getCurrentSerial();
  if (!serial) {
    statusEl.textContent = 'Нет подключённого устройства — выберите устройство слева';
    return;
  }
  const apkPath = await adbApi.selectApkFile();
  if (!apkPath) return;
  statusEl.textContent = `Установка ${apkPath}…`;
  try {
    await adbApi.install(serial, apkPath);
    statusEl.textContent = 'Установлено';
    await loadApps(serial);
  } catch (error) {
    statusEl.textContent = `Ошибка установки: ${errorMessage(error)}`;
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

  listEl.innerHTML = '';
  for (const app of filtered) {
    const li = document.createElement('li');
    li.className = 'row' + (app.packageName === selectedPackage ? ' selected' : '');
    li.textContent = app.packageName + (app.isSystem ? '  [SYS]' : '') + (!app.isEnabled ? '  (выкл)' : '');
    li.addEventListener('click', () => {
      selectedPackage = app.packageName;
      renderList();
      const serial = getCurrentSerial();
      if (serial) void loadDetail(serial, app.packageName);
    });
    listEl.appendChild(li);
  }
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

function renderDetail(detail?: AppDetail, serial?: string): void {
  stopNetPolling();
  if (!detail || !serial) {
    detailEl.innerHTML = '<p class="placeholder">Выберите приложение слева</p>';
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
        selectedPackage = undefined;
        await loadApps(serial);
        renderDetail();
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
