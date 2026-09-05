import {
  app,
  BrowserWindow,
  ipcMain,
  IpcMainInvokeEvent,
  dialog,
  shell,
  Notification,
  clipboard,
  nativeImage,
  globalShortcut,
  screen,
} from 'electron';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fsPromises from 'node:fs/promises';
import { AdbService } from './adb/AdbService';
import { DemoAdbService } from './adb/demo/DemoAdbService';
import { DemoLogcatSession } from './adb/demo/DemoLogcatSession';
import { DEMO_SERIAL } from './adb/demo/demoData';
import { LogcatSession } from './adb/LogcatSession';
import { ApkLibraryService } from './apkLibrary/ApkLibraryService';
import { isReadyState, displayName } from './adb/types/Device';
import { ApkFile } from './adb/types/ApkFile';
import { FDroidUpdateInfo, fdroidDownloadUrl } from './adb/types/FDroidUpdateInfo';
import { checkFDroidUpdate } from './apkLibrary/FDroidUpdateChecker';
import { checkForUpdate } from './updateChecker';
import { ConnectionProfileStore } from './connectionProfiles/ConnectionProfileStore';
import { DeviceNicknameStore } from './deviceNicknames/DeviceNicknameStore';
import { DevicePinStore } from './devicePins/DevicePinStore';
import { AppSettingsStore } from './settings/AppSettingsStore';
import { AlertArmState, checkThresholds, initialArmState } from './monitoring/alertThresholdLogic';
import { DeviceStats } from './adb/types/DeviceStats';
import { comparePackages } from './adb/parsers/PackageDiff';
import { analyzeSecurity } from './adb/parsers/DeviceSecurityAnalyzer';
import { timestampForFilename } from './util/timestamp';
import { ApkTagStore } from './apkLibrary/ApkTagStore';
import { IntentPresetStore } from './intentPresets/IntentPresetStore';
import { MacroStore } from './macros/MacroStore';
import { runMacro } from './macros/MacroRunner';
import { exportBundle, importBundle } from './appBundles/AppBundleService';
import { DeviceSnapshotService } from './deviceSnapshots/DeviceSnapshotService';
import { ScreenMirrorService, MirrorError } from './screenMirror/ScreenMirrorService';
import { AppIconService } from './appIcons/AppIconService';
import { ShellHistoryStore } from './shellHistory/ShellHistoryStore';

// Демо-режим переключается через мутацию этой переменной (demoMode:set,
// см. ниже) -- все `ipcMain.handle(...)` ниже читают `adb` из замыкания
// каждый раз, когда реально выполняются (а не один раз при регистрации),
// поэтому реассайн здесь мгновенно меняет поведение ВСЕХ уже
// зарегистрированных обработчиков без необходимости их пересоздавать.
const realAdb = new AdbService();
const demoAdb = new DemoAdbService();
let adb: AdbService = realAdb;
let demoModeEnabled = false;
const apkLibrary = new ApkLibraryService();
const apkTags = new ApkTagStore();
const intentPresets = new IntentPresetStore();
const macroStore = new MacroStore();
const appIcons = new AppIconService();
const shellHistory = new ShellHistoryStore();
const deviceSnapshots = new DeviceSnapshotService();
const screenMirror = new ScreenMirrorService();
const connectionProfiles = new ConnectionProfileStore();
const deviceNicknames = new DeviceNicknameStore();
const devicePins = new DevicePinStore();
const appSettings = new AppSettingsStore();
let alertArmState: AlertArmState = initialArmState();
const logcatSessions = new Map<string, LogcatSession | DemoLogcatSession>();
/** Serial выбранного в renderer устройства -- renderer сообщает о каждой
 * смене через hotkey:setSelectedSerial, потому что глобальный хоткей
 * (см. registerScreenshotHotkey ниже) обязан работать и когда окно не в
 * фокусе, то есть без похода за состоянием в renderer в момент нажатия. */
let hotkeySelectedSerial: string | undefined;
const HOTKEY_ACCELERATOR = 'CommandOrControl+Shift+S';

/** Тихий скриншот выбранного устройства прямо на Рабочий стол -- аналог
 * GlobalHotkeyService.captureScreenshot(devicesVM:) из
 * Sources/AdbShell/Services/GlobalHotkeyService.swift. Никакого превью --
 * успех/ошибка сообщаются только системным уведомлением. */
async function captureScreenshotToDesktop(): Promise<void> {
  const serial = hotkeySelectedSerial;
  if (!serial) return;
  try {
    const data = await adb.screenshot(serial);
    const fileName = `adbshell-screenshot-${timestampForFilename(new Date())}.png`;
    const filePath = path.join(app.getPath('desktop') || os.homedir(), fileName);
    await fsPromises.writeFile(filePath, data);
    new Notification({ title: 'Скриншот сохранён', body: fileName }).show();
  } catch (error) {
    new Notification({ title: 'Не удалось сделать скриншот', body: (error as Error).message }).show();
  }
}

/** Регистрирует/снимает глобальный хоткей по текущему значению настройки --
 * вызывается при старте приложения и при каждом изменении настройки. */
function applyHotkeySetting(): void {
  globalShortcut.unregister(HOTKEY_ACCELERATOR);
  if (appSettings.get().globalScreenshotHotkeyEnabled) {
    // register() возвращает false, если сочетание уже занято другим
    // приложением/системой -- не бросает исключение, тихо не активируется.
    globalShortcut.register(HOTKEY_ACCELERATOR, () => void captureScreenshotToDesktop());
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    // Без минимума окно можно сжать до ширины, на которой .panel-left
    // (320px, не сжимается) уже не помещается рядом с .panel-right --
    // поймано прогоном через CDP на принудительно суженном viewport
    // (~650px): .panel-left/.panel-right на вкладке "Приложения" и
    // карточки на "Инструментах" вылезали за границы. При 900px и шире
    // переполнений не возникает ни на одной вкладке -- 920 даёт запас.
    minWidth: 920,
    minHeight: 600,
    title: 'ADB Shell',
    backgroundColor: '#0b0b0d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  void win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

function registerIpcHandlers(): void {
  // Проверка обновлений — только уведомление со ссылкой на релиз, см.
  // updateChecker.ts про то, почему не автозамена файла на лету.
  ipcMain.handle('app:checkForUpdates', () => checkForUpdate(app.getVersion()));
  ipcMain.handle('app:openExternal', (_e, url: string) => {
    // На всякий случай ограничиваем схему -- renderer не грузит внешний
    // контент, но контекстный мост в принципе вызываем из кода страницы.
    if (url.startsWith('https://') || url.startsWith('http://')) {
      return shell.openExternal(url);
    }
    return undefined;
  });

  // Демо-режим -- одно виртуальное устройство без реального adb/устройства
  // (см. adb/demo/DemoAdbService.ts). set() переключает и `adb`, и то,
  // какой класс сессии logcat:start создаёт ниже; mirror:launch отдельно
  // отказывает для demo-serial (зеркалить нечего, реального экрана нет).
  ipcMain.handle('demoMode:get', () => demoModeEnabled);
  ipcMain.handle('demoMode:set', (_e, enabled: boolean) => {
    demoModeEnabled = enabled;
    adb = enabled ? demoAdb : realAdb;
    return demoModeEnabled;
  });

  // Устройства
  ipcMain.handle('adb:listDevices', () => adb.listDevices());
  ipcMain.handle('adb:connect', (_e, host: string) => adb.connect(host));
  ipcMain.handle('adb:disconnect', (_e, serial: string) => adb.disconnect(serial));
  ipcMain.handle('adb:pair', (_e, hostPort: string, code: string) => adb.pair(hostPort, code));
  // mDNS-автообнаружение устройств с беспроводной отладкой (Android 11+) —
  // renderer сам опрашивает раз в 5с (см. startMdnsPolling в renderer.ts),
  // отдельного долгоживущего процесса в main для этого не требуется.
  ipcMain.handle('adb:discoverMdns', () => adb.discoverMdnsDevices());

  // Никнеймы устройств — по serial, не зависят от adb model.
  ipcMain.handle('deviceNicknames:list', () => deviceNicknames.list());
  ipcMain.handle('deviceNicknames:set', (_e, serial: string, name: string) => deviceNicknames.setNickname(serial, name));

  // Закреплённые устройства (pinned tabs) — персистентно, в отличие от
  // Swift-оригинала (см. devicePinsLogic.ts).
  ipcMain.handle('devicePins:list', () => devicePins.list());
  ipcMain.handle('devicePins:toggle', (_e, serial: string) => devicePins.toggle(serial));

  // Профили подключения (сохранённые host + автоконнект при старте).
  ipcMain.handle('connectionProfiles:list', () => connectionProfiles.list());
  ipcMain.handle('connectionProfiles:add', (_e, name: string, host: string) => connectionProfiles.add(name, host));
  ipcMain.handle('connectionProfiles:remove', (_e, id: string) => connectionProfiles.remove(id));
  ipcMain.handle('connectionProfiles:toggleAutoConnect', (_e, id: string) => connectionProfiles.toggleAutoConnect(id));
  ipcMain.handle('connectionProfiles:clear', () => connectionProfiles.clear());
  // Подключение по адресу конкретного профиля — переиспользует adb.connect
  // (та же нормализация host без порта, см. AdbService.connect).
  ipcMain.handle('connectionProfiles:connect', (_e, host: string) => adb.connect(host));
  // Best-effort автоподключение при старте — вызывается renderer'ом один раз
  // после первого refreshDevices(), ошибка одного профиля не мешает
  // остальным (устройство может быть выключено/недоступно).
  ipcMain.handle('connectionProfiles:autoConnect', async () => {
    const profiles = connectionProfiles.autoConnectProfiles;
    for (const profile of profiles) {
      try {
        await adb.connect(profile.host);
      } catch {
        // Устройство может быть недоступно — не должно блокировать остальные.
      }
    }
    return profiles.length;
  });
  ipcMain.handle('connectionProfiles:export', async (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Экспорт профилей подключения',
      defaultPath: 'adbshell-profiles.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    };
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return false;
    await fsPromises.writeFile(result.filePath, connectionProfiles.exportJSON(), 'utf8');
    return true;
  });
  ipcMain.handle('connectionProfiles:import', async (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Импорт профилей подключения',
      properties: ['openFile' as const],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return connectionProfiles.list();
    const raw = await fsPromises.readFile(result.filePaths[0], 'utf8');
    return connectionProfiles.importJSON(raw);
  });

  // Приложения
  ipcMain.handle('adb:listApps', (_e, serial: string) => adb.listApps(serial));
  // Реальные иконки приложений (aapt2 + adm-zip) -- лениво, по одному
  // запросу на строку списка, см. appIcons/AppIconService.ts.
  ipcMain.handle('icons:get', async (_e, serial: string, packageName: string) => {
    const data = await appIcons.fetch(serial, packageName, adb);
    return data ? data.toString('base64') : undefined;
  });
  ipcMain.handle('adb:appDetail', (_e, serial: string, packageName: string) => adb.appDetail(serial, packageName));
  // Сверка установленных пользовательских приложений с F-Droid: один
  // bulk-дамп versionCode со всего устройства + сетевые запросы с
  // ограничением параллелизма (тот же worker-pool, что и у библиотеки APK
  // в ApkLibraryService.checkFDroidUpdates). Ничего не ставит сама -- только
  // сообщает о найденном обновлении, установка отдельным вызовом ниже.
  ipcMain.handle('apps:checkFDroidUpdates', async (_e, serial: string) => {
    const [apps, versionCodes] = await Promise.all([
      adb.listApps(serial),
      adb.installedVersionCodes(serial).catch((): Record<string, number> => ({})),
    ]);
    const candidates = apps.filter((a) => !a.isSystem && versionCodes[a.packageName] !== undefined);
    const results: Record<string, FDroidUpdateInfo> = {};
    const maxConcurrent = 4;
    let index = 0;
    const worker = async (): Promise<void> => {
      while (index < candidates.length) {
        const app = candidates[index++];
        const update = await checkFDroidUpdate(app.packageName, versionCodes[app.packageName]).catch(() => undefined);
        if (update) results[app.packageName] = update;
      }
    };
    await Promise.all(Array.from({ length: maxConcurrent }, () => worker()));
    return results;
  });
  // Скачивает найденную версию с F-Droid во временный файл и ставит на то
  // же устройство -- предложение, не автодействие, выполняется только по
  // явному нажатию кнопки в детали приложения.
  ipcMain.handle('apps:installFDroidUpdate', async (_e, serial: string, packageName: string, latestVersionCode: number) => {
    const tmpPath = path.join(os.tmpdir(), `fdroid-${packageName}-${latestVersionCode}.apk`);
    try {
      const response = await fetch(fdroidDownloadUrl({ packageName, latestVersionCode, installedVersionCode: 0 }));
      if (!response.ok) throw new Error(`HTTP ${response.status} при скачивании обновления`);
      await fsPromises.writeFile(tmpPath, Buffer.from(await response.arrayBuffer()));
      await adb.install(serial, tmpPath);
    } finally {
      await fsPromises.rm(tmpPath, { force: true });
    }
  });
  ipcMain.handle('adb:install', (_e, serial: string, apkPath: string) => adb.install(serial, apkPath));
  ipcMain.handle('adb:uninstall', (_e, serial: string, packageName: string) => adb.uninstall(serial, packageName));
  ipcMain.handle('adb:forceStop', (_e, serial: string, packageName: string) => adb.forceStop(serial, packageName));
  ipcMain.handle('adb:clearData', (_e, serial: string, packageName: string) => adb.clearData(serial, packageName));
  ipcMain.handle('adb:setEnabled', (_e, serial: string, packageName: string, enabled: boolean) =>
    adb.setEnabled(serial, packageName, enabled)
  );
  ipcMain.handle('adb:grantPermission', (_e, serial: string, packageName: string, permission: string) =>
    adb.grantPermission(serial, packageName, permission)
  );
  ipcMain.handle('adb:revokePermission', (_e, serial: string, packageName: string, permission: string) =>
    adb.revokePermission(serial, packageName, permission)
  );
  // AdbService.install() существовал и был проброшен через IPC, но нигде в
  // renderer не было способа выбрать локальный файл для установки — кнопка
  // без диалога выбора файла бесполезна. Диалог обязан открываться из main
  // (renderer в sandboxed contextIsolation-режиме доступа к нативным
  // диалогам не имеет).
  ipcMain.handle('dialog:selectApk', async (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Выберите APK',
      properties: ['openFile' as const],
      filters: [{ name: 'Android package', extensions: ['apk'] }],
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return undefined;
    return result.filePaths[0];
  });
  ipcMain.handle('dialog:selectApks', async (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Выберите APK (можно несколько)',
      properties: ['openFile' as const, 'multiSelections' as const],
      filters: [{ name: 'Android package', extensions: ['apk'] }],
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled ? [] : result.filePaths;
  });

  // Пакетное удаление/установка (мультивыбор в духе Finder, apps.ts) --
  // последовательно, не параллельно, тот же порядок, что и в оригинале.
  ipcMain.handle('apps:deleteSelected', async (_e, serial: string, packages: string[]) => {
    const sorted = [...packages].sort();
    for (const pkg of sorted) {
      try {
        await adb.uninstall(serial, pkg);
      } catch {
        // Продолжаем остальные -- одна неудача не должна прерывать пакет.
      }
    }
    return sorted.length;
  });
  ipcMain.handle('apps:installBatch', async (_e, serial: string, apkPaths: string[]) => {
    const results: { apkPath: string; success: boolean; message: string }[] = [];
    for (const apkPath of apkPaths) {
      try {
        const output = await adb.install(serial, apkPath);
        results.push({ apkPath, success: true, message: output });
      } catch (error) {
        results.push({ apkPath, success: false, message: (error as Error).message });
      }
    }
    return results;
  });

  // Наборы приложений (экспорт/импорт с runtime-разрешениями) и снапшоты
  // устройства -- см. AppBundleService.ts/DeviceSnapshotService.ts.
  ipcMain.handle('apps:exportSelected', async (event: IpcMainInvokeEvent, serial: string, packages: string[]) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Экспорт набора приложений',
      defaultPath: `apps-export-${timestampForFilename(new Date())}.zip`,
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    };
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return undefined;
    const outcome = await exportBundle(packages, serial, undefined, result.filePath, adb);
    if (outcome.entryCount > 0) shell.showItemInFolder(result.filePath);
    return outcome;
  });
  ipcMain.handle('apps:importBundle', async (event: IpcMainInvokeEvent, serial: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Импорт набора приложений',
      properties: ['openFile' as const],
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return undefined;
    return importBundle(result.filePaths[0], serial, adb);
  });

  ipcMain.handle('snapshots:list', () => deviceSnapshots.list());
  ipcMain.handle('snapshots:take', async (_e, serial: string, packages: string[], deviceLabel: string) =>
    deviceSnapshots.take(packages, serial, deviceLabel, adb)
  );
  ipcMain.handle('snapshots:restore', (_e, snapshotPath: string, serial: string) =>
    deviceSnapshots.restore(snapshotPath, serial, adb)
  );
  ipcMain.handle('snapshots:delete', (_e, snapshotPath: string) => deviceSnapshots.delete(snapshotPath));
  ipcMain.handle('snapshots:reveal', (_e, snapshotPath: string) => shell.showItemInFolder(snapshotPath));

  // Библиотека APK — локальный каталог с .apk, доступный и без
  // подключённого устройства (тот же класс требования, что уже привёл к
  // фиксу "нельзя работать с приложениями без устройства": библиотеку
  // тоже можно смотреть/пополнять/проверять на обновления без adb).
  ipcMain.handle('apkLibrary:list', () => apkLibrary.list());
  ipcMain.handle('apkLibrary:getDirectory', () => apkLibrary.getDirectory());
  ipcMain.handle('apkLibrary:chooseDirectory', async (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Выберите папку для библиотеки APK',
      properties: ['openDirectory' as const, 'createDirectory' as const],
      defaultPath: apkLibrary.getDirectory(),
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return apkLibrary.getDirectory();
    apkLibrary.setDirectory(result.filePaths[0]);
    return apkLibrary.getDirectory();
  });
  ipcMain.handle('apkLibrary:addFiles', async (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Добавить APK в библиотеку',
      properties: ['openFile' as const, 'multiSelections' as const],
      filters: [{ name: 'Android package', extensions: ['apk'] }],
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return apkLibrary.list();
    apkLibrary.importFiles(result.filePaths);
    return apkLibrary.list();
  });
  // Импорт готовыми путями -- для drag&drop прямо в окно библиотеки (пути уже
  // известны через webUtils.getPathForFile в renderer, диалог не нужен),
  // в отличие от apkLibrary:addFiles выше (кнопка -> диалог выбора файла).
  ipcMain.handle('apkLibrary:importPaths', (_e, paths: string[]) => {
    apkLibrary.importFiles(paths.filter((p) => p.toLowerCase().endsWith('.apk')));
    return apkLibrary.list();
  });
  ipcMain.handle('apkLibrary:inspect', (_e, apkPath: string) => ApkLibraryService.inspect(apkPath));
  ipcMain.handle('apkLibrary:deleteFile', (_e, filePath: string) => apkLibrary.deleteFile(filePath));
  ipcMain.handle('apkLibrary:revealInFileManager', () => shell.openPath(apkLibrary.getDirectory()));
  ipcMain.handle('apkLibrary:downloadFromUrl', (_e, url: string, filename?: string) => apkLibrary.downloadFromUrl(url, filename));
  ipcMain.handle('apkLibrary:checkFDroidUpdates', () => apkLibrary.checkFDroidUpdates());
  ipcMain.handle('apkLibrary:downloadFDroidUpdate', (_e, file: ApkFile, update: FDroidUpdateInfo) =>
    apkLibrary.downloadFDroidUpdate(file, update)
  );
  // Установка на устройство переиспользует adb:install (см. ниже); здесь —
  // только "поставить на все готовые сразу", специфичное для библиотеки.
  ipcMain.handle('apkLibrary:installToAllDevices', async (_e, apkPath: string) => {
    const devices = (await adb.listDevices()).filter((d) => isReadyState(d.state));
    if (devices.length === 0) {
      return { successCount: 0, total: 0, failures: [] as string[] };
    }
    const failures: string[] = [];
    let successCount = 0;
    for (const device of devices) {
      try {
        await adb.install(device.serial, apkPath);
        successCount += 1;
      } catch (error) {
        failures.push(`${displayName(device)}: ${(error as Error).message}`);
      }
    }
    return { successCount, total: devices.length, failures };
  });

  // Теги файлов библиотеки APK -- по полному пути на диске (файлы не
  // хранят метаданные сами по себе).
  ipcMain.handle('apkLibrary:tagsList', () => apkTags.list());
  ipcMain.handle('apkLibrary:addTag', (_e, filePath: string, tag: string) => apkTags.addTag(filePath, tag));
  ipcMain.handle('apkLibrary:removeTag', (_e, filePath: string, tag: string) => apkTags.removeTag(filePath, tag));

  // Файлы устройства
  ipcMain.handle('adb:listDirectory', (_e, serial: string, dirPath: string) => adb.listDirectory(serial, dirPath));
  ipcMain.handle('adb:makeDirectory', (_e, serial: string, dirPath: string) => adb.makeDirectory(serial, dirPath));
  ipcMain.handle('adb:removeRemote', (_e, serial: string, targetPath: string, recursive: boolean) =>
    adb.removeRemote(serial, targetPath, recursive)
  );
  // push(localPath) приходит либо из диалога выбора файла, либо готовым
  // абсолютным путём с drag&drop (webUtils.getPathForFile, см. preload.ts) --
  // сам push ничего не открывает сам. pull, наоборот, всегда спрашивает
  // "куда сохранить" через диалог здесь же (renderer выбора пути не видит).
  ipcMain.handle('adb:push', (_e, serial: string, localPath: string, remotePath: string) => adb.push(serial, localPath, remotePath));
  ipcMain.handle('dialog:selectFileToPush', async (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = { title: 'Выберите файл для отправки на устройство', properties: ['openFile' as const] };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled || result.filePaths.length === 0 ? undefined : result.filePaths[0];
  });
  ipcMain.handle('adb:pullToChosenPath', async (event: IpcMainInvokeEvent, serial: string, remotePath: string, suggestedName: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = { title: 'Сохранить как', defaultPath: suggestedName };
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return false;
    await adb.pull(serial, remotePath, result.filePath);
    shell.showItemInFolder(result.filePath);
    return true;
  });
  // Экспорт APK установленного приложения обратно на компьютер (pm path + pull).
  ipcMain.handle('apps:exportApk', async (event: IpcMainInvokeEvent, serial: string, packageName: string) => {
    const paths = await adb.apkPaths(serial, packageName);
    const basePath = paths.find((p) => p.endsWith('base.apk')) ?? paths[0];
    if (!basePath) return false;
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = { title: 'Экспортировать APK', defaultPath: `${packageName}.apk`, filters: [{ name: 'APK', extensions: ['apk'] }] };
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return false;
    await adb.pull(serial, basePath, result.filePath);
    shell.showItemInFolder(result.filePath);
    return true;
  });

  // Shell
  ipcMain.handle('adb:shell', (_e, serial: string, command: string) => adb.shell(serial, command));
  ipcMain.handle('adb:runRaw', (_e, serial: string, argsLine: string) => adb.runRaw(serial, argsLine));

  // Персистентная история shell-команд + избранное.
  ipcMain.handle('shellHistory:list', () => shellHistory.list());
  ipcMain.handle('shellHistory:record', (_e, text: string) => shellHistory.record(text));
  ipcMain.handle('shellHistory:favorite', (_e, text: string) => shellHistory.favorite(text));
  ipcMain.handle('shellHistory:toggleFavorite', (_e, id: string) => shellHistory.toggleFavorite(id));
  ipcMain.handle('shellHistory:remove', (_e, id: string) => shellHistory.remove(id));
  ipcMain.handle('shellHistory:clear', () => shellHistory.clear());

  // Intent/deep-link тестер + сохранённые пресеты
  ipcMain.handle('adb:openDeepLink', (_e, serial: string, uri: string) => adb.openDeepLink(serial, uri));
  ipcMain.handle('intentPresets:list', () => intentPresets.list());
  ipcMain.handle('intentPresets:add', (_e, name: string, uri: string) => intentPresets.add(name, uri));
  ipcMain.handle('intentPresets:remove', (_e, id: string) => intentPresets.remove(id));

  // Зеркалирование экрана через scrcpy -- своё окно рисует сам scrcpy,
  // здесь только запуск процесса и отслеживание, какие serial сейчас
  // зеркалятся (push-событие 'mirror:stopped', когда окно закрыто -- в т.ч.
  // если пользователь закрыл его сам, не из ADB Shell).
  ipcMain.handle('mirror:isAvailable', () => screenMirror.isAvailable());
  ipcMain.handle('mirror:runningSerials', () => screenMirror.runningSerials());
  ipcMain.handle('mirror:launch', (event: IpcMainInvokeEvent, serial: string, recordPath?: string) => {
    if (serial === DEMO_SERIAL) throw new MirrorError('Зеркалирование недоступно для демо-устройства — у него нет настоящего экрана');
    screenMirror.launch(serial, adb.adbPath, { recordPath }, (stoppedSerial) => {
      if (!event.sender.isDestroyed()) event.sender.send('mirror:stopped', stoppedSerial);
    });
  });
  ipcMain.handle('mirror:launchGrid', (event: IpcMainInvokeEvent, serials: string[]) => {
    if (serials.includes(DEMO_SERIAL)) throw new MirrorError('Зеркалирование недоступно для демо-устройства — у него нет настоящего экрана');
    const display = screen.getPrimaryDisplay();
    screenMirror.launchGrid(serials, adb.adbPath, display.workArea, (stoppedSerial) => {
      if (!event.sender.isDestroyed()) event.sender.send('mirror:stopped', stoppedSerial);
    });
  });
  ipcMain.handle('dialog:selectRecordPath', async (event: IpcMainInvokeEvent, serial: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Записать зеркалирование в файл',
      defaultPath: `adbshell-${serial.replace(/[:/\\]/g, '-')}-${timestampForFilename(new Date())}.mp4`,
      filters: [{ name: 'MP4', extensions: ['mp4'] }],
    };
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    return result.canceled ? undefined : result.filePath;
  });

  // Макросы -- именованные последовательности adb-команд.
  ipcMain.handle('macros:list', () => macroStore.list());
  ipcMain.handle(
    'macros:add',
    (_e, name: string, rawText: string, autorunOnConnect: boolean, abortOnFirstFailure: boolean) =>
      macroStore.add(name, rawText, autorunOnConnect, abortOnFirstFailure)
  );
  ipcMain.handle(
    'macros:update',
    (_e, id: string, name: string, rawText: string, autorunOnConnect: boolean, abortOnFirstFailure: boolean) =>
      macroStore.update(id, name, rawText, autorunOnConnect, abortOnFirstFailure)
  );
  ipcMain.handle('macros:remove', (_e, id: string) => macroStore.remove(id));
  // Выполнение -- см. MacroRunner.ts про то, почему результаты шагов не
  // транслируются построчно, а возвращаются одним ответом по завершении.
  ipcMain.handle('macros:run', (_e, macroId: string, serial: string, variables: Record<string, string>) => {
    const macro = macroStore.get(macroId);
    if (!macro) throw new Error('Макрос не найден');
    return runMacro(macro, serial, adb, variables);
  });
  ipcMain.handle('macros:export', async (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Экспорт макросов',
      defaultPath: 'adbshell-macros.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    };
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return false;
    await fsPromises.writeFile(result.filePath, macroStore.exportJSON(), 'utf8');
    return true;
  });
  ipcMain.handle('macros:import', async (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Импорт макросов',
      properties: ['openFile' as const],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return macroStore.list();
    const raw = await fsPromises.readFile(result.filePaths[0], 'utf8');
    return macroStore.importJSON(raw);
  });

  // Wi-Fi отладка
  ipcMain.handle('adb:enableWirelessDebugging', (_e, serial: string, port: number) =>
    adb.enableWirelessDebugging(serial, port)
  );
  ipcMain.handle('adb:deviceIPAddress', (_e, serial: string) => adb.deviceIPAddress(serial));

  // Проброс портов
  ipcMain.handle('adb:listForwards', (_e, serial: string) => adb.listForwards(serial));
  ipcMain.handle('adb:addForward', (_e, serial: string, hostSpec: string, deviceSpec: string) =>
    adb.addForward(serial, hostSpec, deviceSpec)
  );
  ipcMain.handle('adb:removeForward', (_e, serial: string, hostSpec: string) => adb.removeForward(serial, hostSpec));
  ipcMain.handle('adb:listReverses', (_e, serial: string) => adb.listReverses(serial));
  ipcMain.handle('adb:addReverse', (_e, serial: string, deviceSpec: string, hostSpec: string) =>
    adb.addReverse(serial, deviceSpec, hostSpec)
  );
  ipcMain.handle('adb:removeReverse', (_e, serial: string, deviceSpec: string) => adb.removeReverse(serial, deviceSpec));

  // Свойства устройства
  ipcMain.handle('adb:allProperties', (_e, serial: string) => adb.allProperties(serial));

  // Мониторинг
  ipcMain.handle('adb:deviceStats', (_e, serial: string) => adb.deviceStats(serial));
  ipcMain.handle('adb:runningProcesses', (_e, serial: string) => adb.runningProcesses(serial));
  ipcMain.handle('adb:killProcess', (_e, serial: string, pid: number) => adb.killProcess(serial, pid));

  // Безопасность устройства -- разовая проверка (свойства не меняются на
  // лету), карточка в Мониторинге.
  ipcMain.handle('adb:securityInfo', async (_e, serial: string) => analyzeSecurity(await adb.securityInfo(serial)));

  // Сетевой трафик приложения (панель деталей приложения, поллинг 3с на
  // стороне renderer) и экранное время (разовая загрузка в Мониторинге).
  ipcMain.handle('adb:networkUsage', (_e, serial: string, uid: number) => adb.networkUsage(serial, uid));
  ipcMain.handle('adb:usageStats', (_e, serial: string) => adb.usageStats(serial));

  // ANR / tombstones -- кнопка "Crashes" в Logcat.
  ipcMain.handle('adb:crashTraces', (_e, serial: string) => adb.crashTraces(serial));
  ipcMain.handle('adb:readCrashTrace', (_e, serial: string, filePath: string) => adb.readCrashTrace(serial, filePath));

  // Сравнение установленных пакетов двух устройств -- сама выборка списков
  // и diff выполняются здесь же, renderer получает уже готовый результат.
  ipcMain.handle('adb:comparePackages', async (_e, serialA: string, serialB: string) => {
    const [appsA, appsB] = await Promise.all([adb.listApps(serialA), adb.listApps(serialB)]);
    return comparePackages(
      appsA.map((a) => a.packageName),
      appsB.map((a) => a.packageName)
    );
  });

  // Настройки приложения (пороги CPU/батареи и т.п. -- один общий JSON,
  // см. AppSettingsStore) и однократные уведомления при пересечении порога.
  ipcMain.handle('settings:get', () => appSettings.get());
  ipcMain.handle('settings:update', (_e, partial) => {
    const updated = appSettings.update(partial);
    applyHotkeySetting();
    return updated;
  });
  ipcMain.handle('monitoring:resetAlertArm', () => {
    alertArmState = initialArmState();
  });
  ipcMain.handle('monitoring:checkThresholds', (_e, stats: DeviceStats) => {
    const settings = appSettings.get();
    const result = checkThresholds(alertArmState, stats, {
      enabled: settings.statsAlertsEnabled,
      cpuThreshold: settings.statsAlertCpuThreshold,
      batteryThreshold: settings.statsAlertBatteryThreshold,
    });
    alertArmState = result.armState;
    if (result.cpuAlertFired) {
      new Notification({
        title: 'Высокая нагрузка CPU',
        body: `CPU: ${Math.round(result.cpuAlertFired.cpuPercent)}%`,
      }).show();
    }
    if (result.batteryAlertFired) {
      new Notification({
        title: 'Низкий заряд батареи',
        body: `Батарея: ${result.batteryAlertFired.batteryLevel}%`,
      }).show();
    }
    return result;
  });

  // Экспорт CSV (список пакетов, история мониторинга) -- диалог сохранения
  // обязан открываться из main (см. dialog:selectApk выше), содержимое CSV
  // уже готово к записи, приходит от renderer строкой.
  ipcMain.handle('dialog:saveCsv', async (event: IpcMainInvokeEvent, defaultName: string, content: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Экспорт CSV',
      defaultPath: defaultName,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    };
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return false;
    await fsPromises.writeFile(result.filePath, content, 'utf8');
    shell.showItemInFolder(result.filePath);
    return true;
  });

  // Скриншот -- ручная кнопка (превью-модалка с Copy/Save As, см.
  // renderer/screens/shellScreen.ts) поверх того же AdbService.screenshot,
  // что использует и глобальный хоткей выше.
  ipcMain.handle('adb:screenshot', async (_e, serial: string) => {
    const data = await adb.screenshot(serial);
    return data.toString('base64');
  });
  ipcMain.handle('clipboard:writeImagePng', (_e, base64Png: string) => {
    clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(base64Png, 'base64')));
  });
  ipcMain.handle('dialog:saveScreenshot', async (event: IpcMainInvokeEvent, base64Png: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Сохранить скриншот',
      defaultPath: `adbshell-screenshot-${timestampForFilename(new Date())}.png`,
      filters: [{ name: 'PNG', extensions: ['png'] }],
    };
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return false;
    await fsPromises.writeFile(result.filePath, Buffer.from(base64Png, 'base64'));
    shell.showItemInFolder(result.filePath);
    return true;
  });

  // Renderer держит main в курсе текущего выбранного устройства -- нужно
  // глобальному хоткею (работает и когда окно не в фокусе, см. выше).
  ipcMain.handle('hotkey:setSelectedSerial', (_e, serial: string | undefined) => {
    hotkeySelectedSerial = serial;
  });

  // Logcat — живой стрим, строки уходят в renderer как события 'logcat:line',
  // а не через ответ на invoke (сессия долгоживущая, невозможно вернуть
  // одно значение).
  ipcMain.handle('adb:startLogcat', (event: IpcMainInvokeEvent, serial: string) => {
    logcatSessions.get(serial)?.stop();
    const session = serial === DEMO_SERIAL ? new DemoLogcatSession(adb.adbPath, serial) : new LogcatSession(adb.adbPath, serial);
    logcatSessions.set(serial, session);
    session.start((line) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('logcat:line', serial, line);
      }
    });
  });
  ipcMain.handle('adb:stopLogcat', (_e, serial: string) => {
    logcatSessions.get(serial)?.stop();
    logcatSessions.delete(serial);
  });
  ipcMain.handle('adb:clearLogcatBuffer', (_e, serial: string) => {
    // Работает и без активного стрима — просто спавнит `adb logcat -c` разово.
    const session = logcatSessions.get(serial) ?? (serial === DEMO_SERIAL ? new DemoLogcatSession(adb.adbPath, serial) : new LogcatSession(adb.adbPath, serial));
    session.clearDeviceBuffer();
  });
}

// Без этого необработанное исключение/rejection в main-процессе (вне
// ipcMain.handle, который сам сериализует брошенное в отклонённый промис
// на стороне renderer) по умолчанию у Electron просто валит всё
// приложение без единого сообщения пользователю — то самое "просто не
// открылось". showErrorBox не требует готового окна/renderer, поэтому
// безопасен даже на самых ранних этапах старта.
process.on('uncaughtException', (error) => {
  dialog.showErrorBox('ADB Shell — непредвиденная ошибка', error.stack ?? error.message);
});
process.on('unhandledRejection', (reason) => {
  dialog.showErrorBox('ADB Shell — непредвиденная ошибка', reason instanceof Error ? (reason.stack ?? reason.message) : String(reason));
});

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  applyHotkeySetting();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  for (const session of logcatSessions.values()) session.stop();
  logcatSessions.clear();
  globalShortcut.unregisterAll();
  screenMirror.stopAll();
});
