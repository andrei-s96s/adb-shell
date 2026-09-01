import { contextBridge, ipcRenderer } from 'electron';

// Единственный мост renderer -> main; renderer работает с contextIsolation
// включённым и nodeIntegration выключенным (см. main.ts) — доступ к adb
// только через этот явный, узкий API, ничего больше не пробрасывается.
contextBridge.exposeInMainWorld('adbApi', {
  listDevices: () => ipcRenderer.invoke('adb:listDevices'),
  connect: (host: string) => ipcRenderer.invoke('adb:connect', host),
  shell: (serial: string, command: string) => ipcRenderer.invoke('adb:shell', serial, command),
});
