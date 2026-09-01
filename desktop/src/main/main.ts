import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'node:path';
import { AdbService } from './adb/AdbService';

const adb = new AdbService();

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
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
  ipcMain.handle('adb:listDevices', () => adb.listDevices());
  ipcMain.handle('adb:connect', (_event, host: string) => adb.connect(host));
  ipcMain.handle('adb:shell', (_event, serial: string, command: string) => adb.shell(serial, command));
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
