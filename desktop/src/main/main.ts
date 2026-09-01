import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'node:path';
import { AdbService } from './adb/AdbService';

const adb = new AdbService();

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
