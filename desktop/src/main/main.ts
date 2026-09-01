import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, dialog } from 'electron';
import * as path from 'node:path';
import { AdbService } from './adb/AdbService';
import { LogcatSession } from './adb/LogcatSession';

const adb = new AdbService();
const logcatSessions = new Map<string, LogcatSession>();

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
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
  // Устройства
  ipcMain.handle('adb:listDevices', () => adb.listDevices());
  ipcMain.handle('adb:connect', (_e, host: string) => adb.connect(host));
  ipcMain.handle('adb:disconnect', (_e, serial: string) => adb.disconnect(serial));
  ipcMain.handle('adb:pair', (_e, hostPort: string, code: string) => adb.pair(hostPort, code));

  // Приложения
  ipcMain.handle('adb:listApps', (_e, serial: string) => adb.listApps(serial));
  ipcMain.handle('adb:appDetail', (_e, serial: string, packageName: string) => adb.appDetail(serial, packageName));
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

  // Файлы устройства
  ipcMain.handle('adb:listDirectory', (_e, serial: string, dirPath: string) => adb.listDirectory(serial, dirPath));
  ipcMain.handle('adb:makeDirectory', (_e, serial: string, dirPath: string) => adb.makeDirectory(serial, dirPath));
  ipcMain.handle('adb:removeRemote', (_e, serial: string, targetPath: string, recursive: boolean) =>
    adb.removeRemote(serial, targetPath, recursive)
  );

  // Shell
  ipcMain.handle('adb:shell', (_e, serial: string, command: string) => adb.shell(serial, command));

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

  // Logcat — живой стрим, строки уходят в renderer как события 'logcat:line',
  // а не через ответ на invoke (сессия долгоживущая, невозможно вернуть
  // одно значение).
  ipcMain.handle('adb:startLogcat', (event: IpcMainInvokeEvent, serial: string) => {
    logcatSessions.get(serial)?.stop();
    const session = new LogcatSession(adb.adbPath, serial);
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
    const session = logcatSessions.get(serial) ?? new LogcatSession(adb.adbPath, serial);
    session.clearDeviceBuffer();
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

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
});
