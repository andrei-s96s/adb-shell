import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, dialog, shell, Notification, clipboard, ClipboardItem, globalShortcut } from 'electron';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fsPromises from 'node:fs/promises';
import { AdbService } from './adb/AdbService';
import { DemoAdbService } from './adb/demo/DemoAdbService';
import { LogcatSession } from './adb/LogcatSession';
import { DemoLogcatSession } from './adb/demo/DemoLogcatSession';
import { ApkLibraryService } from './apkLibrary/ApkLibraryService';
import { checkForUpdate, pickAssetForPlatform, findChecksumAsset, ReleaseAsset } from './updateChecker';
import { downloadAndPrepareUpdate, launchPreparedUpdate } from './updateInstaller';
import { ConnectionProfileStore } from './connectionProfiles/ConnectionProfileStore';
import { DeviceNicknameStore } from './deviceNicknames/DeviceNicknameStore';
import { DevicePinStore } from './devicePins/DevicePinStore';
import { DeviceTagStore } from './deviceTags/DeviceTagStore';
import { DeviceHistoryStore } from './deviceHistory/DeviceHistoryStore';
import { AppSettingsStore, DEFAULT_SCREENSHOT_HOTKEY } from './settings/AppSettingsStore';
import { timestampForFilename } from './util/timestamp';
import { showSaveDialogFor, showOpenDialogFor } from './util/dialogs';
import { mapWithConcurrency } from './util/concurrency';
import { isReadyState, displayName } from './adb/types/Device';
import { sanitizeDeviceLabel } from './deviceSnapshots/deviceSnapshotLogic';
import { ApkTagStore } from './apkLibrary/ApkTagStore';
import { IntentPresetStore } from './intentPresets/IntentPresetStore';
import { MacroStore } from './macros/MacroStore';
import { runMacro } from './macros/MacroRunner';
import { variableNames } from './macros/macroRunnerLogic';
import { DeviceSnapshotService } from './deviceSnapshots/DeviceSnapshotService';
import { ScreenMirrorService } from './screenMirror/ScreenMirrorService';
import { AppIconService } from './appIcons/AppIconService';
import { ShellHistoryStore } from './shellHistory/ShellHistoryStore';
import { IpcContext } from './ipcContext';

import { registerDeviceNicknamesIpc } from './deviceNicknames/registerIpc';
import { registerDevicePinsIpc } from './devicePins/registerIpc';
import { registerDeviceTagsIpc } from './deviceTags/registerIpc';
import { registerDeviceHistoryIpc } from './deviceHistory/registerIpc';
import { registerConnectionProfilesIpc } from './connectionProfiles/registerIpc';
import { registerDevicesIpc } from './adb/registerDevicesIpc';
import { registerAppsIpc } from './apps/registerIpc';
import { registerSnapshotsIpc } from './deviceSnapshots/registerIpc';
import { registerApkLibraryIpc } from './apkLibrary/registerIpc';
import { registerFilesIpc } from './adb/registerFilesIpc';
import { registerShellIpc } from './shellHistory/registerIpc';
import { registerIntentPresetsIpc } from './intentPresets/registerIpc';
import { registerMirrorIpc } from './screenMirror/registerIpc';
import { registerMacrosIpc } from './macros/registerIpc';
import { registerNetworkIpc } from './adb/registerNetworkIpc';
import { registerMonitoringIpc } from './monitoring/registerIpc';
import { registerSettingsIpc } from './settings/registerIpc';
import { registerLogcatIpc } from './adb/registerLogcatIpc';

// Демо-режим переключается через мутацию ctx.adb (demoMode:set, см. ниже) --
// все хендлеры домена (в т.ч. вынесенные в registerXxxIpc-модули) читают
// ctx.adb каждый раз, когда реально выполняются (а не один раз при
// регистрации), поэтому реассайн здесь мгновенно меняет поведение ВСЕХ уже
// зарегистрированных обработчиков без необходимости их пересоздавать.
const realAdb = new AdbService();
const demoAdb = new DemoAdbService();
let demoModeEnabled = false;

const appSettings = new AppSettingsStore();

/** Общий на процесс контекст, который читают/пишут IPC-хендлеры, разложенные
 * по registerXxxIpc(ctx)-функциям рядом с соответствующими сервисами -- см.
 * ipcContext.ts про то, почему именно так, а не отдельный параметр на
 * каждый сервис. */
const ctx: IpcContext = {
  adb: realAdb,
  realAdb,
  apkLibrary: new ApkLibraryService(),
  apkTags: new ApkTagStore(),
  intentPresets: new IntentPresetStore(),
  macroStore: new MacroStore(),
  appIcons: new AppIconService(),
  shellHistory: new ShellHistoryStore(),
  deviceSnapshots: new DeviceSnapshotService(),
  screenMirror: new ScreenMirrorService(),
  connectionProfiles: new ConnectionProfileStore(),
  deviceNicknames: new DeviceNicknameStore(),
  devicePins: new DevicePinStore(),
  deviceTags: new DeviceTagStore(),
  deviceHistory: new DeviceHistoryStore(),
  appSettings,
  logcatSessions: new Map<string, LogcatSession | DemoLogcatSession>(),
  applyHotkeySetting: () => applyHotkeySetting(),
  applyMacroHotkeys: () => applyMacroHotkeys(),
  activeMacroHotkeyAccelerators: () => [...registeredMacroAccelerators],
  isScreenshotHotkeyActive: () => registeredScreenshotAccelerator !== undefined,
};

/** Serial выбранного в renderer устройства -- renderer сообщает о каждой
 * смене через hotkey:setSelectedSerial, потому что глобальный хоткей
 * (см. applyHotkeySetting ниже) обязан работать и когда окно не в
 * фокусе, то есть без похода за состоянием в renderer в момент нажатия. */
let hotkeySelectedSerial: string | undefined;

/** Сочетание, которым СЕЙЧАС настроен хоткей скриншота (задано пользователем
 * в Настройках, либо DEFAULT_SCREENSHOT_HOTKEY) -- используется и здесь
 * (что регистрировать), и в applyMacroHotkeys() ниже (что не отдавать
 * макросу), поэтому читает settings напрямую, а не хранит своё отдельное
 * состояние -- изменение настройки должно быть видно обеим функциям сразу,
 * без риска разойтись. */
function screenshotHotkeyAccelerator(): string {
  return appSettings.get().screenshotHotkeyAccelerator?.trim() || DEFAULT_SCREENSHOT_HOTKEY;
}

/** Тихий скриншот выбранного устройства прямо на Рабочий стол -- аналог
 * GlobalHotkeyService.captureScreenshot(devicesVM:) из
 * Sources/AdbShell/Services/GlobalHotkeyService.swift. Никакого превью --
 * успех/ошибка сообщаются только системным уведомлением. */
async function captureScreenshotToDesktop(): Promise<void> {
  const serial = hotkeySelectedSerial;
  if (!serial) return;
  try {
    const data = await ctx.adb.screenshot(serial);
    const fileName = `adbshell-screenshot-${timestampForFilename(new Date())}.png`;
    const filePath = path.join(app.getPath('desktop') || os.homedir(), fileName);
    await fsPromises.writeFile(filePath, data);
    new Notification({ title: 'Скриншот сохранён', body: fileName }).show();
  } catch (error) {
    new Notification({ title: 'Не удалось сделать скриншот', body: (error as Error).message }).show();
  }
}

/** Что РЕАЛЬНО сейчас зарегистрировано globalShortcut для скриншота --
 * отдельно от screenshotHotkeyAccelerator() (то, чем НАСТРОЕНО): нужно,
 * чтобы снять именно старое сочетание перед регистрацией нового, если
 * пользователь его сменил -- globalShortcut.unregister() снимает только
 * точное совпадение строки, снятие по уже неактуальному значению из
 * настроек ничего не даст. undefined -- хоткей сейчас выключен или не
 * удалось зарегистрировать (сочетание занято другим приложением/ОС). */
let registeredScreenshotAccelerator: string | undefined;

/** Регистрирует/снимает глобальный хоткей по текущему значению настройки --
 * вызывается при старте приложения и при каждом изменении настройки
 * (тумблер вкл/выкл, само сочетание). */
function applyHotkeySetting(): void {
  if (registeredScreenshotAccelerator) {
    globalShortcut.unregister(registeredScreenshotAccelerator);
    registeredScreenshotAccelerator = undefined;
  }
  if (appSettings.get().globalScreenshotHotkeyEnabled) {
    const accelerator = screenshotHotkeyAccelerator();
    // register() возвращает false, если сочетание уже занято другим
    // приложением/системой -- не бросает исключение, тихо не активируется.
    const ok = globalShortcut.register(accelerator, () => void captureScreenshotToDesktop());
    if (ok) registeredScreenshotAccelerator = accelerator;
  }
}

/** Запускает макрос по глобальному хоткею на hotkeySelectedSerial (то же
 * значение, что уже использует captureScreenshotToDesktop выше) -- работает
 * и когда окно не в фокусе, поэтому переменные ${ИМЯ} здесь не спросить:
 * applyMacroHotkeys() ниже вообще не регистрирует хоткей для макроса с
 * переменными. Результат -- только системным уведомлением, макрос мог
 * запуститься, пока пользователь работает в другом приложении и не видит
 * вкладку "Макросы". */
async function runMacroFromHotkey(macroId: string): Promise<void> {
  const serial = hotkeySelectedSerial;
  if (!serial) return;
  const macro = ctx.macroStore.get(macroId);
  if (!macro) return;
  try {
    const outcome = await runMacro(macro, serial, ctx.adb, {});
    new Notification({
      title: `Макрос «${macro.name}» (хоткей)`,
      body: outcome.completedFully ? 'Выполнен полностью' : 'Остановлен на ошибке',
    }).show();
  } catch (error) {
    new Notification({ title: `Макрос «${macro.name}» — ошибка`, body: (error as Error).message }).show();
  }
}

/** Аккселераторы макросов, зарегистрированные ПРЯМО СЕЙЧАС -- отдельно от
 * скриншот-хоткея (свой unregister по имени) и друг от друга, чтобы
 * applyMacroHotkeys() ниже мог явно снять именно macro-хоткеи перед
 * перерегистрацией, не трогая скриншот-хоткей. */
let registeredMacroAccelerators: string[] = [];

/** Перерегистрирует глобальные хоткеи всех макросов -- вызывается при
 * старте приложения, при каждом add/update/remove/import макросов (см.
 * IpcContext.applyMacroHotkeys) и при изменении хоткея скриншота в
 * Настройках (то, что макросу нельзя занять, само может смениться).
 * Явно пропускает точное совпадение с screenshotHotkeyAccelerator() --
 * Electron иначе тихо отдал бы это сочетание макросу, унеся с собой уже
 * работавший хоткей скриншота без единого предупреждения. Сверяется с
 * НАСТРОЕННЫМ значением, а не с тем, что реально сейчас зарегистрировано
 * (registeredScreenshotAccelerator может быть undefined, если тумблер
 * скриншот-хоткея сейчас выключен) -- иначе включение тумблера обратно
 * могло бы обнаружить, что сочетание уже "украдено" макросом, который
 * успел зарегистрироваться в промежутке. Макрос-vs-макрос коллизии (два
 * макроса с одним и тем же сочетанием) Electron тоже не разруливает -- в
 * списке макросов (macros.ts) такой макрос помечается как "хоткей не
 * активен" через macros:activeHotkeys. */
function applyMacroHotkeys(): void {
  for (const accelerator of registeredMacroAccelerators) globalShortcut.unregister(accelerator);
  registeredMacroAccelerators = [];
  const reservedForScreenshot = screenshotHotkeyAccelerator();
  for (const macro of ctx.macroStore.list()) {
    const accelerator = macro.hotkeyAccelerator;
    if (!accelerator || accelerator === reservedForScreenshot) continue;
    if (variableNames(macro).length > 0) continue;
    const ok = globalShortcut.register(accelerator, () => void runMacroFromHotkey(macro.id));
    if (ok) registeredMacroAccelerators.push(accelerator);
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    // 1200 (было) не хватало на полосу вкладок -- 10 вкладок (с "Донат")
    // при этой ширине переносят "Библиотека APK" на 2 строки, а "Донат"
    // обрезается за границей #content (у #tabs нет ни переноса, ни
    // горизонтального скролла). Замерено через getBoundingClientRect на
    // реальной сборке вкладок: ряду нужно ~930px, при 1300 всё влезает
    // впритык, 1360 даёт заметный запас на случай чуть более широких
    // системных шрифтов Windows/Linux относительно macOS.
    width: 1360,
    height: 760,
    // Без минимума окно можно сжать до ширины, на которой .panel-left
    // (320px, не сжимается) уже не помещается рядом с .panel-right --
    // поймано прогоном через CDP на принудительно суженном viewport
    // (~650px): .panel-left/.panel-right на вкладке "Приложения" и
    // карточки на "Инструментах" вылезали за границы. При 900px и шире
    // переполнений не возникает ни на одной вкладке -- 920 даёт запас.
    // (Полоса вкладок при таком сжатии тоже переносится/обрезается — тот
    // же эффект, что и раньше при дефолтных 1200, отдельная, менее
    // приоритетная история, чем стартовый размер окна.)
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
  // Скачивает и готовит к установке файл под текущую платформу (см.
  // updateInstaller.ts) -- renderer передаёт весь список ассетов с уже
  // сделанной ранее проверки (checkForUpdatesOnce), выбор конкретного файла
  // под платформу -- здесь, не на стороне renderer (там process.platform не
  // проброшен через contextBridge, да и логика выбора и так уже одна на
  // main-процесс -- см. pickAssetForPlatform).
  ipcMain.handle('app:downloadUpdate', async (event: IpcMainInvokeEvent, assets: ReleaseAsset[]) => {
    const asset = pickAssetForPlatform(assets, process.platform, process.arch);
    if (!asset) throw new Error('Не найден подходящий файл обновления для этой платформы в этом релизе');
    const checksumAsset = findChecksumAsset(assets, asset.name);
    const prepared = await downloadAndPrepareUpdate(
      asset.url,
      asset.name,
      (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send('app:downloadProgress', progress);
      },
      checksumAsset?.url
    );
    await launchPreparedUpdate(prepared);
  });
  ipcMain.handle('app:openExternal', (_e, url: string) => {
    // На всякий случай ограничиваем схему -- renderer не грузит внешний
    // контент, но контекстный мост в принципе вызываем из кода страницы.
    if (url.startsWith('https://') || url.startsWith('http://')) {
      return shell.openExternal(url);
    }
    return undefined;
  });

  // Демо-режим -- одно виртуальное устройство без реального adb/устройства
  // (см. adb/demo/DemoAdbService.ts). set() переключает ctx.adb, которое
  // читают все домены, зарегистрированные ниже; mirror:launch отдельно
  // отказывает для demo-serial (зеркалить нечего, реального экрана нет).
  ipcMain.handle('demoMode:get', () => demoModeEnabled);
  ipcMain.handle('demoMode:set', (_e, enabled: boolean) => {
    demoModeEnabled = enabled;
    ctx.adb = enabled ? demoAdb : realAdb;
    return demoModeEnabled;
  });

  registerDeviceNicknamesIpc(ctx);
  registerDevicePinsIpc(ctx);
  registerDeviceTagsIpc(ctx);
  registerDeviceHistoryIpc(ctx);
  registerConnectionProfilesIpc(ctx);
  registerDevicesIpc(ctx);
  registerAppsIpc(ctx);
  registerSnapshotsIpc(ctx);
  registerApkLibraryIpc(ctx);
  registerFilesIpc(ctx);
  registerShellIpc(ctx);
  registerIntentPresetsIpc(ctx);
  registerMirrorIpc(ctx);
  registerMacrosIpc(ctx);
  registerNetworkIpc(ctx);
  registerMonitoringIpc(ctx);
  registerSettingsIpc(ctx);
  registerLogcatIpc(ctx);

  // Экспорт CSV (список пакетов, история мониторинга) -- диалог сохранения
  // обязан открываться из main (см. util/dialogs.ts), содержимое CSV уже
  // готово к записи, приходит от renderer строкой.
  ipcMain.handle('dialog:saveCsv', async (event: IpcMainInvokeEvent, defaultName: string, content: string) => {
    const result = await showSaveDialogFor(event, {
      title: 'Экспорт CSV',
      defaultPath: defaultName,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (result.canceled || !result.filePath) return false;
    await fsPromises.writeFile(result.filePath, content, 'utf8');
    shell.showItemInFolder(result.filePath);
    return true;
  });
  // Общий вариант dialog:saveCsv выше -- под произвольный текст с
  // произвольным расширением (например, экспорт буфера logcat в .txt/.log,
  // см. renderer/screens/logcat.ts). saveCsv жёстко хардкодит фильтр под
  // CSV и не годится напрямую для этого, заводить отдельный
  // dialog:saveLogcat ради одного текстового экспорта не было смысла.
  ipcMain.handle(
    'dialog:saveText',
    async (event: IpcMainInvokeEvent, defaultName: string, content: string, filterName: string, filterExtensions: string[]) => {
      const result = await showSaveDialogFor(event, {
        title: 'Сохранить',
        defaultPath: defaultName,
        filters: [{ name: filterName, extensions: filterExtensions }],
      });
      if (result.canceled || !result.filePath) return false;
      await fsPromises.writeFile(result.filePath, content, 'utf8');
      shell.showItemInFolder(result.filePath);
      return true;
    }
  );

  // Скриншот -- ручная кнопка (превью-модалка с Copy/Save As, см.
  // renderer/screens/shellScreen.ts) поверх того же AdbService.screenshot,
  // что использует и глобальный хоткей выше.
  ipcMain.handle('adb:screenshot', async (_e, serial: string) => {
    const data = await ctx.adb.screenshot(serial);
    return data.toString('base64');
  });
  // Electron 44 полностью переписал clipboard под W3C Clipboard API --
  // синхронный clipboard.writeImage(nativeImage) убран без замены,
  // используем задокументированную миграцию: async clipboard.write() с
  // ClipboardItem, значение -- Blob с MIME-типом (Buffer сам по себе не
  // принимается, см. https://www.electronjs.org/docs/latest/breaking-changes
  // раздел про clipboard).
  ipcMain.handle('clipboard:writeImagePng', async (_e, base64Png: string) => {
    const buffer = Buffer.from(base64Png, 'base64');
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([buffer], { type: 'image/png' }) })]);
  });
  ipcMain.handle('dialog:saveScreenshot', async (event: IpcMainInvokeEvent, base64Png: string) => {
    const result = await showSaveDialogFor(event, {
      title: 'Сохранить скриншот',
      defaultPath: `adbshell-screenshot-${timestampForFilename(new Date())}.png`,
      filters: [{ name: 'PNG', extensions: ['png'] }],
    });
    if (result.canceled || !result.filePath) return false;
    await fsPromises.writeFile(result.filePath, Buffer.from(base64Png, 'base64'));
    shell.showItemInFolder(result.filePath);
    return true;
  });

  // Скриншот сразу со всех подключённых устройств -- по аналогии с уже
  // существующей плиткой зеркалирования (mirror:launchGrid) и broadcast-
  // режимом shell: выбор папки один раз, дальше adb.screenshot() на
  // каждое готовое устройство независимо (отдельный exec-out процесс на
  // serial, в отличие от разделяемой adb shell-сессии, параллелится без
  // проблем) -- лимит 3, как и у apkLibrary:installToAllDevices.
  ipcMain.handle('dialog:selectScreenshotAllDir', async (event: IpcMainInvokeEvent) => {
    const result = await showOpenDialogFor(event, {
      title: 'Куда сохранить скриншоты со всех устройств',
      properties: ['openDirectory' as const, 'createDirectory' as const],
    });
    return result.canceled || result.filePaths.length === 0 ? undefined : result.filePaths[0];
  });
  ipcMain.handle('adb:screenshotAllDevices', async (_e, directory: string) => {
    const devices = (await ctx.adb.listDevices()).filter((d) => isReadyState(d.state));
    if (devices.length === 0) {
      return { successCount: 0, total: 0, failures: [] as string[] };
    }
    const failures: string[] = [];
    let successCount = 0;
    await mapWithConcurrency(devices, 3, async (device) => {
      try {
        const data = await ctx.adb.screenshot(device.serial);
        // serial обязателен в имени файла (не только модель) -- два
        // устройства одной модели, но с разными serial, иначе получили бы
        // одинаковое имя файла в одном и том же батче и второй скриншот
        // молча перезаписал бы первый.
        const modelLabel = device.model ? sanitizeDeviceLabel(device.model.replace(/_/g, ' ')) : undefined;
        const label = modelLabel ? `${modelLabel}-${sanitizeDeviceLabel(device.serial)}` : sanitizeDeviceLabel(device.serial);
        const fileName = `adbshell-screenshot-${label}-${timestampForFilename(new Date())}.png`;
        await fsPromises.writeFile(path.join(directory, fileName), data);
        successCount += 1;
      } catch (error) {
        failures.push(`${displayName(device)}: ${(error as Error).message}`);
      }
    });
    return { successCount, total: devices.length, failures };
  });

  // Renderer держит main в курсе текущего выбранного устройства -- нужно
  // глобальному хоткею (работает и когда окно не в фокусе, см. выше).
  ipcMain.handle('hotkey:setSelectedSerial', (_e, serial: string | undefined) => {
    hotkeySelectedSerial = serial;
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
  applyMacroHotkeys();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  for (const session of ctx.logcatSessions.values()) session.stop();
  ctx.logcatSessions.clear();
  globalShortcut.unregisterAll();
  ctx.screenMirror.stopAll();
});
