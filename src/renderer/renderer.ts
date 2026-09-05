import { adbApi, el, errorMessage } from './api.js';
import type { Device, MdnsDevice, ConnectionProfile } from './api.js';
import { setCurrentSerial, getCurrentSerial, onDeviceChanged } from './state.js';
import { initTabs } from './tabs.js';
import { initAppsScreen } from './screens/apps.js';
import { initApkLibraryScreen } from './screens/apkLibrary.js';
import { initFilesScreen } from './screens/files.js';
import { initShellScreen } from './screens/shellScreen.js';
import { initToolsScreen } from './screens/tools.js';
import { initMonitorScreen } from './screens/monitor.js';
import { initLogcatScreen } from './screens/logcat.js';
import { initSettingsScreen, applyTheme } from './screens/settings.js';
import { initDonateScreen } from './screens/donate.js';
import { initMacrosScreen } from './screens/macros.js';
import { initCommandPalette } from './screens/commandPalette.js';

const deviceListEl = el<HTMLUListElement>('device-list');
const statusEl = el<HTMLDivElement>('status');
const refreshBtn = el<HTMLButtonElement>('refresh-btn');
const connectBtn = el<HTMLButtonElement>('connect-btn');
const connectHostInput = el<HTMLInputElement>('connect-host');
const pairBtn = el<HTMLButtonElement>('pair-btn');
const pairHostInput = el<HTMLInputElement>('pair-host');
const pairCodeInput = el<HTMLInputElement>('pair-code');
const pinnedStripEl = el<HTMLDivElement>('pinned-strip');
const mdnsSectionEl = el<HTMLDivElement>('mdns-section');
const mdnsListEl = el<HTMLUListElement>('mdns-list');
const profilesListEl = el<HTMLUListElement>('profiles-list');
const profileNameInput = el<HTMLInputElement>('profile-name');
const profileHostInput = el<HTMLInputElement>('profile-host');
const profileAddBtn = el<HTMLButtonElement>('profile-add');
const profileExportBtn = el<HTMLButtonElement>('profile-export');
const profileImportBtn = el<HTMLButtonElement>('profile-import');
const demoModeToggleBtn = el<HTMLButtonElement>('demo-mode-toggle');

let devices: Device[] = [];
let nicknames: Record<string, string> = {};
let pinnedSerials: string[] = [];
let mdnsDevices: MdnsDevice[] = [];
let profiles: ConnectionProfile[] = [];
/** Демо-режим -- одно виртуальное устройство без реального adb, см.
 * main/adb/demo/DemoAdbService.ts. Состояние живёт в main-процессе
 * (demoMode:get/set) — здесь только зеркало для отрисовки кнопки/пустого
 * состояния списка устройств. */
let demoModeOn = false;
/** serial устройства, для которого сейчас открыт инлайн-редактор имени —
 * не больше одного одновременно, повторный клик на другую строку закрывает
 * предыдущий редактор без сохранения (как blur). */
let renamingSerial: string | undefined;

async function refreshDevices(): Promise<void> {
  statusEl.textContent = 'Обновление…';
  try {
    devices = await adbApi.listDevices();
    renderDeviceList();
    renderPinnedStrip();
    renderMdnsList();
    statusEl.textContent = '';

    const current = getCurrentSerial();
    if (current && !devices.some((d) => d.serial === current)) {
      selectDevice(undefined);
    }
    void triggerAutorunMacros(devices);
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}

function renderDemoModeButton(): void {
  demoModeToggleBtn.textContent = demoModeOn ? '🎭 Демо-режим (вкл)' : '🎭 Демо-режим';
  demoModeToggleBtn.classList.toggle('active', demoModeOn);
  demoModeToggleBtn.title = demoModeOn
    ? 'Выключить демо-режим и вернуться к реальным устройствам'
    : 'Демо-устройство без реального adb — посмотреть весь функционал';
}

/** Полная замена, а не дополнение к реальным устройствам — пока демо-режим
 * включён, adb:listDevices в main-процессе отдаёт ТОЛЬКО демо-устройство
 * (см. DemoAdbService), поэтому после переключения обязательно
 * перезапрашиваем список, а не просто дорисовываем кнопку. */
async function toggleDemoMode(): Promise<void> {
  demoModeToggleBtn.disabled = true;
  try {
    demoModeOn = await adbApi.demoModeSet(!demoModeOn);
    renderDemoModeButton();
    await refreshDevices();
    if (demoModeOn && devices.length > 0) selectDevice(devices[0].serial);
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  } finally {
    demoModeToggleBtn.disabled = false;
  }
}

/** Порт DevicesViewModel.triggerAutorunMacros(for:) из
 * Sources/AdbShell/ViewModels/DevicesViewModel.swift -- запускает макросы с
 * автозапуском только для устройств, которые ИМЕННО СЕЙЧАС стали готовыми
 * (не на каждом тике поллинга, пока устройство уже готово). Fire-and-forget:
 * ошибки отдельных шагов здесь не показываются пользователю. */
let lastReadySerials = new Set<string>();
async function triggerAutorunMacros(currentDevices: Device[]): Promise<void> {
  const readyNow = new Set(currentDevices.filter((d) => d.state === 'device').map((d) => d.serial));
  const newlyReady = [...readyNow].filter((serial) => !lastReadySerials.has(serial));
  lastReadySerials = readyNow;
  if (newlyReady.length === 0) return;

  let autorunMacros;
  try {
    autorunMacros = (await adbApi.macrosList()).filter((m) => m.autorunOnConnect);
  } catch {
    return;
  }
  if (autorunMacros.length === 0) return;

  for (const serial of newlyReady) {
    for (const macro of autorunMacros) {
      adbApi.macrosRun(macro.id, serial, {}).catch(() => {});
    }
  }
}

/** Порт Device.displayName из Sources/AdbShell/Models/Device.swift (модель с
 * "_" заменённым на пробел, иначе serial), с никнеймом поверх, если задан —
 * тот же приоритет, что и в оригинале (DeviceNicknameStore используется
 * везде, где вычисляется displayName). */
function deviceLabel(device: Device): string {
  const nickname = nicknames[device.serial];
  if (nickname) return nickname;
  return device.model ? device.model.replace(/_/g, ' ') : device.serial;
}

function renderDeviceList(): void {
  deviceListEl.innerHTML = '';
  if (devices.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Нет подключённых устройств';
    deviceListEl.appendChild(li);

    if (!demoModeOn) {
      const tryDemoBtn = document.createElement('button');
      tryDemoBtn.type = 'button';
      tryDemoBtn.textContent = 'Включить демо-режим';
      tryDemoBtn.addEventListener('click', () => void toggleDemoMode());
      const hintLi = document.createElement('li');
      hintLi.className = 'empty';
      hintLi.appendChild(tryDemoBtn);
      deviceListEl.appendChild(hintLi);
    }
    return;
  }
  for (const device of devices) {
    const li = document.createElement('li');
    li.className = 'row' + (device.serial === getCurrentSerial() ? ' selected' : '');

    const main = document.createElement('div');
    main.className = 'device-row-main';

    if (renamingSerial === device.serial) {
      const input = document.createElement('input');
      input.className = 'device-rename-input';
      input.value = nicknames[device.serial] ?? '';
      input.placeholder = deviceLabel(device);
      const commit = (): void => {
        void (async () => {
          nicknames = await adbApi.deviceNicknamesSet(device.serial, input.value);
          renamingSerial = undefined;
          renderDeviceList();
          renderPinnedStrip();
        })();
      };
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') {
          renamingSerial = undefined;
          renderDeviceList();
        }
      });
      input.addEventListener('blur', commit);
      main.appendChild(input);
      li.appendChild(main);
      deviceListEl.appendChild(li);
      input.focus();
      input.select();
      continue;
    }

    const label = document.createElement('span');
    label.className = 'device-row-label';
    label.textContent = `${deviceLabel(device)} — ${device.state}`;
    label.title = device.serial;
    label.addEventListener('click', () => selectDevice(device.serial));
    main.appendChild(label);

    const actions = document.createElement('div');
    actions.className = 'device-row-actions';

    const pinBtn = document.createElement('button');
    pinBtn.textContent = '📌';
    pinBtn.title = pinnedSerials.includes(device.serial) ? 'Открепить' : 'Закрепить';
    if (pinnedSerials.includes(device.serial)) pinBtn.classList.add('active');
    pinBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      void (async () => {
        pinnedSerials = await adbApi.devicePinsToggle(device.serial);
        renderDeviceList();
        renderPinnedStrip();
      })();
    });
    actions.appendChild(pinBtn);

    const renameBtn = document.createElement('button');
    renameBtn.textContent = '✎';
    renameBtn.title = 'Переименовать';
    renameBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      renamingSerial = device.serial;
      renderDeviceList();
    });
    actions.appendChild(renameBtn);

    if (device.serial.includes(':')) {
      const disconnectBtn = document.createElement('button');
      disconnectBtn.textContent = '✕';
      disconnectBtn.title = 'Отключить';
      disconnectBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        void (async () => {
          try {
            await adbApi.disconnect(device.serial);
            if (getCurrentSerial() === device.serial) selectDevice(undefined);
            await refreshDevices();
          } catch (error) {
            statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
          }
        })();
      });
      actions.appendChild(disconnectBtn);
    }

    main.appendChild(actions);
    li.appendChild(main);
    deviceListEl.appendChild(li);
  }
}

/** Полоска закреплённых устройств над вкладками — только реально видимые
 * сейчас (закреплённый serial отключённого устройства просто не рисуется,
 * но остаётся в pinnedSerials и появится снова при переподключении). */
function renderPinnedStrip(): void {
  const pinnedDevices = pinnedSerials
    .map((serial) => devices.find((d) => d.serial === serial))
    .filter((d): d is Device => d !== undefined);

  pinnedStripEl.innerHTML = '';
  pinnedStripEl.hidden = pinnedDevices.length === 0;
  for (const device of pinnedDevices) {
    const chip = document.createElement('div');
    chip.className = 'pinned-chip' + (device.serial === getCurrentSerial() ? ' active' : '');
    const label = document.createElement('span');
    label.textContent = deviceLabel(device);
    chip.appendChild(label);
    chip.addEventListener('click', () => selectDevice(device.serial));

    const unpin = document.createElement('button');
    unpin.textContent = '✕';
    unpin.title = 'Открепить';
    unpin.addEventListener('click', (event) => {
      event.stopPropagation();
      void (async () => {
        pinnedSerials = await adbApi.devicePinsToggle(device.serial);
        renderDeviceList();
        renderPinnedStrip();
      })();
    });
    chip.appendChild(unpin);

    pinnedStripEl.appendChild(chip);
  }
}

// MARK: mDNS-автообнаружение

async function refreshMdns(): Promise<void> {
  try {
    mdnsDevices = await adbApi.discoverMdns();
  } catch {
    // mDNS-демон может быть недоступен на этой машине — тихо пропускаем тик.
    return;
  }
  renderMdnsList();
}

function renderMdnsList(): void {
  const connectedSerials = new Set(devices.map((d) => d.serial));
  const undiscovered = mdnsDevices.filter((d) => !connectedSerials.has(d.address));

  mdnsSectionEl.hidden = undiscovered.length === 0;
  mdnsListEl.innerHTML = '';
  for (const mdnsDevice of undiscovered) {
    const li = document.createElement('li');
    li.className = 'row';
    const label = document.createElement('span');
    const needsPairing = mdnsDevice.type.includes('pairing');
    label.textContent = `${needsPairing ? '🟡' : '🟢'} ${mdnsDevice.name}`;
    label.title = mdnsDevice.address;
    li.appendChild(label);

    const actionBtn = document.createElement('button');
    if (needsPairing) {
      actionBtn.textContent = 'Сопрячь';
      actionBtn.addEventListener('click', () => {
        pairHostInput.value = mdnsDevice.address;
        pairCodeInput.focus();
      });
    } else {
      actionBtn.textContent = 'Connect';
      actionBtn.addEventListener('click', () => {
        void (async () => {
          statusEl.textContent = 'Подключение…';
          try {
            statusEl.textContent = await adbApi.connect(mdnsDevice.address);
            await refreshDevices();
          } catch (error) {
            statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
          }
        })();
      });
    }
    li.appendChild(actionBtn);
    mdnsListEl.appendChild(li);
  }
}

// MARK: Профили подключения

async function refreshProfiles(): Promise<void> {
  profiles = await adbApi.connectionProfilesList();
  renderProfilesList();
}

function renderProfilesList(): void {
  profilesListEl.innerHTML = '';
  for (const profile of profiles) {
    const li = document.createElement('li');
    li.className = 'row';

    const label = document.createElement('span');
    label.textContent = profile.name;
    label.title = profile.host;
    li.appendChild(label);

    const star = document.createElement('button');
    star.textContent = profile.autoConnect ? '★' : '☆';
    star.title = 'Автоподключение при запуске';
    if (profile.autoConnect) star.classList.add('active');
    star.addEventListener('click', () => {
      void (async () => {
        profiles = await adbApi.connectionProfilesToggleAutoConnect(profile.id);
        renderProfilesList();
      })();
    });
    li.appendChild(star);

    const connectProfileBtn = document.createElement('button');
    connectProfileBtn.textContent = 'Connect';
    connectProfileBtn.addEventListener('click', () => {
      void (async () => {
        statusEl.textContent = 'Подключение…';
        try {
          statusEl.textContent = await adbApi.connectionProfilesConnect(profile.host);
          await refreshDevices();
        } catch (error) {
          statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
        }
      })();
    });
    li.appendChild(connectProfileBtn);

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.title = 'Удалить профиль';
    removeBtn.addEventListener('click', () => {
      void (async () => {
        profiles = await adbApi.connectionProfilesRemove(profile.id);
        renderProfilesList();
      })();
    });
    li.appendChild(removeBtn);

    profilesListEl.appendChild(li);
  }
}

profileAddBtn.addEventListener('click', () => {
  void (async () => {
    const host = profileHostInput.value.trim();
    if (!host) return;
    profiles = await adbApi.connectionProfilesAdd(profileNameInput.value, host);
    profileNameInput.value = '';
    profileHostInput.value = '';
    renderProfilesList();
  })();
});

profileExportBtn.addEventListener('click', () => {
  void adbApi.connectionProfilesExport().then((saved) => {
    if (saved) statusEl.textContent = 'Профили экспортированы';
  });
});

profileImportBtn.addEventListener('click', () => {
  void (async () => {
    profiles = await adbApi.connectionProfilesImport();
    renderProfilesList();
    statusEl.textContent = 'Профили импортированы';
  })();
});

demoModeToggleBtn.addEventListener('click', () => void toggleDemoMode());

function selectDevice(serial: string | undefined): void {
  // #content (вкладки) видны ВСЕГДА, вне зависимости от выбора устройства —
  // раньше вся навигация блокировалась до выбора устройства, тот же класс
  // ошибки, что уже чинили в Swift-версии для библиотеки APK ("доступна и
  // без подключённого устройства"). Каждый экран сам решает, что показать
  // при отсутствии serial (см. onDeviceChanged в screens/*.ts), а не прячется
  // целиком за пределами достижимости.
  setCurrentSerial(serial);
  renderDeviceList();
  renderPinnedStrip();
}

/** Точка входа для командной палитры (screens/commandPalette.ts) — выбор
 * устройства оттуда должен так же обновить подсветку в сайдбаре, как и
 * обычный клик по строке. */
export function selectDeviceFromPalette(serial: string): void {
  selectDevice(serial);
}

refreshBtn.addEventListener('click', () => void refreshDevices());

connectBtn.addEventListener('click', () => {
  void (async () => {
    const host = connectHostInput.value.trim();
    if (!host) return;
    statusEl.textContent = 'Подключение…';
    try {
      const result = await adbApi.connect(host);
      statusEl.textContent = result;
      await refreshDevices();
    } catch (error) {
      statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
    }
  })();
});

pairBtn.addEventListener('click', () => {
  void (async () => {
    const hostPort = pairHostInput.value.trim();
    const code = pairCodeInput.value.trim();
    if (!hostPort || !code) return;
    statusEl.textContent = 'Сопряжение…';
    try {
      const result = await adbApi.pair(hostPort, code);
      statusEl.textContent = result;
      pairHostInput.value = '';
      pairCodeInput.value = '';
    } catch (error) {
      statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
    }
  })();
});

initTabs();
initAppsScreen();
initApkLibraryScreen();
initFilesScreen();
initShellScreen();
initToolsScreen();
initMonitorScreen();
initLogcatScreen();
initSettingsScreen();
initMacrosScreen();
initDonateScreen();
initCommandPalette();
// Держим main в курсе выбранного устройства -- нужно глобальному хоткею
// скриншота (main.ts, HOTKEY_ACCELERATOR), который обязан работать и когда
// окно не в фокусе, то есть без похода за состоянием сюда в момент нажатия.
onDeviceChanged((serial) => void adbApi.setHotkeySelectedSerial(serial));
initGlobalApkDrop();
selectDevice(undefined);
void bootDeviceIdentity();
void refreshProfiles();
void applyThemeOnBoot();

/** Применяет сохранённый выбор темы сразу при старте — до того, как
 * пользователь откроет вкладку Настройки, иначе окно на пару кадров
 * мигнёт системной темой вместо форсированной light/dark. */
async function applyThemeOnBoot(): Promise<void> {
  try {
    applyTheme((await adbApi.settingsGet()).themePreference);
  } catch {
    // Не критично — останется системная тема до открытия Настроек.
  }
}

/** Порт ContentView.onDrop(of: [.fileURL]) из Sources/AdbShell/Views/ContentView.swift
 * -- drag&drop .apk-файла в любое место окна устанавливает его на выбранное
 * устройство, без похода во вкладку "Библиотека APK". Вкладки "Библиотека
 * APK" и "Файлы" перехватывают drop раньше (stopPropagation в их модулях) --
 * там своя, более специфичная обработка (импорт в библиотеку / push). */
function initGlobalApkDrop(): void {
  document.body.addEventListener('dragover', (event) => {
    event.preventDefault();
  });
  document.body.addEventListener('drop', (event) => {
    event.preventDefault();
    const serial = getCurrentSerial();
    if (!serial) {
      statusEl.textContent = 'Нет подключённого устройства — выберите устройство слева';
      return;
    }
    const files = Array.from(event.dataTransfer?.files ?? []);
    const apkFiles = files.filter((f) => f.name.toLowerCase().endsWith('.apk'));
    if (apkFiles.length === 0) return;
    for (const file of apkFiles) {
      const path = adbApi.getPathForFile(file);
      statusEl.textContent = `Установка ${file.name}…`;
      adbApi
        .install(serial, path)
        .then(() => {
          statusEl.textContent = `Установлено: ${file.name}`;
        })
        .catch((error) => {
          statusEl.textContent = `Ошибка установки ${file.name}: ${errorMessage(error)}`;
        });
    }
  });
}
void checkForUpdatesOnce();

/** Никнеймы/пины грузятся один раз при старте и дальше держатся в памяти,
 * обновляясь локально после каждой мутации (adbApi.deviceNicknamesSet/
 * devicePinsToggle возвращают новое состояние) — не имеет смысла
 * перезапрашивать их на каждый 3-секундный тик поллинга устройств. */
async function bootDeviceIdentity(): Promise<void> {
  try {
    [nicknames, pinnedSerials] = await Promise.all([adbApi.deviceNicknamesList(), adbApi.devicePinsList()]);
  } catch {
    // Не критично — список устройств отрисуется без никнеймов/пинов.
  }
  try {
    demoModeOn = await adbApi.demoModeGet();
    renderDemoModeButton();
  } catch {
    // Не критично — кнопка останется в состоянии "выключено" по умолчанию.
  }
  await refreshDevices();
  renderDeviceList();
  renderPinnedStrip();

  // Best-effort автоподключение сохранённых профилей — как и в Swift-версии,
  // делается один раз при старте, ошибки отдельных профилей не показываются.
  try {
    const count = await adbApi.connectionProfilesAutoConnect();
    if (count > 0) await refreshDevices();
  } catch {
    // Тихо игнорируем.
  }

  // Периодический опрос устройств и mDNS-находок — то же поведение, что и
  // в Swift-версии (DevicesViewModel.startPolling — 3с; startMdnsDiscovery —
  // 5с), раньше в desktop-версии обновление было только по кнопке.
  setInterval(() => void refreshDevices(), 3000);
  setInterval(() => void refreshMdns(), 5000);
  void refreshMdns();
}

// Раз за запуск, не периодический опрос -- обычному пользователю этого
// достаточно, а GitHub API не дёргается лишний раз. Только уведомление +
// ссылка на страницу релиза, ничего не скачивает и не подменяет само —
// см. updateChecker.ts про то, почему не полноценное автообновление.
async function checkForUpdatesOnce(): Promise<void> {
  try {
    const settings = await adbApi.settingsGet();
    if (!settings.autoCheckUpdates) return;
    const update = await adbApi.checkForUpdates();
    if (!update) return;
    const banner = el<HTMLDivElement>('update-banner');
    el<HTMLSpanElement>('update-banner-text').textContent = `Доступна версия ${update.version}`;
    el<HTMLButtonElement>('update-banner-open').addEventListener('click', () => void adbApi.openExternal(update.releaseUrl));
    el<HTMLButtonElement>('update-banner-dismiss').addEventListener('click', () => {
      banner.hidden = true;
    });
    banner.hidden = false;
  } catch {
    // Тихо игнорируем -- проверка обновлений не должна мешать обычной работе.
  }
}
