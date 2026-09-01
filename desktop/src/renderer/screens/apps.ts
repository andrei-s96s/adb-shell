import { adbApi, el, errorMessage } from '../api.js';
import type { InstalledApp, AppDetail } from '../api.js';
import { onDeviceChanged, getCurrentSerial } from '../state.js';

let listEl: HTMLUListElement;
let detailEl: HTMLDivElement;
let statusEl: HTMLDivElement;
let searchEl: HTMLInputElement;
let showSystemEl: HTMLInputElement;
let apps: InstalledApp[] = [];
let selectedPackage: string | undefined;

export function initAppsScreen(): void {
  listEl = el<HTMLUListElement>('apps-list');
  detailEl = el<HTMLDivElement>('apps-detail');
  statusEl = el<HTMLDivElement>('apps-status');
  searchEl = el<HTMLInputElement>('apps-search');
  showSystemEl = el<HTMLInputElement>('apps-show-system');

  searchEl.addEventListener('input', renderList);
  showSystemEl.addEventListener('change', renderList);
  el<HTMLButtonElement>('apps-install').addEventListener('click', () => void installApk());

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
  const query = searchEl.value.trim().toLowerCase();
  const showSystem = showSystemEl.checked;
  const filtered = apps.filter((a) => (showSystem || !a.isSystem) && (!query || a.packageName.toLowerCase().includes(query)));

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
  detailEl.innerHTML = '<p class="placeholder">Загрузка…</p>';
  try {
    const detail = await adbApi.appDetail(serial, packageName);
    renderDetail(detail, serial);
  } catch (error) {
    detailEl.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = `Ошибка: ${errorMessage(error)}`;
    detailEl.appendChild(p);
  }
}

function renderDetail(detail?: AppDetail, serial?: string): void {
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
