import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { ApkFile } from './adb/types/ApkFile';
import { FDroidUpdateInfo } from './adb/types/FDroidUpdateInfo';

// Единственный мост renderer -> main; renderer работает с contextIsolation
// включённым и nodeIntegration выключенным (см. main.ts) — доступ к adb
// только через этот явный, узкий API, ничего больше не пробрасывается.
contextBridge.exposeInMainWorld('adbApi', {
  // Устройства
  listDevices: () => ipcRenderer.invoke('adb:listDevices'),
  connect: (host: string) => ipcRenderer.invoke('adb:connect', host),
  disconnect: (serial: string) => ipcRenderer.invoke('adb:disconnect', serial),
  pair: (hostPort: string, code: string) => ipcRenderer.invoke('adb:pair', hostPort, code),

  // Приложения
  listApps: (serial: string) => ipcRenderer.invoke('adb:listApps', serial),
  appDetail: (serial: string, packageName: string) => ipcRenderer.invoke('adb:appDetail', serial, packageName),
  install: (serial: string, apkPath: string) => ipcRenderer.invoke('adb:install', serial, apkPath),
  uninstall: (serial: string, packageName: string) => ipcRenderer.invoke('adb:uninstall', serial, packageName),
  forceStop: (serial: string, packageName: string) => ipcRenderer.invoke('adb:forceStop', serial, packageName),
  clearData: (serial: string, packageName: string) => ipcRenderer.invoke('adb:clearData', serial, packageName),
  setEnabled: (serial: string, packageName: string, enabled: boolean) =>
    ipcRenderer.invoke('adb:setEnabled', serial, packageName, enabled),
  grantPermission: (serial: string, packageName: string, permission: string) =>
    ipcRenderer.invoke('adb:grantPermission', serial, packageName, permission),
  revokePermission: (serial: string, packageName: string, permission: string) =>
    ipcRenderer.invoke('adb:revokePermission', serial, packageName, permission),
  selectApkFile: (): Promise<string | undefined> => ipcRenderer.invoke('dialog:selectApk'),

  // Библиотека APK — доступна без подключённого устройства
  apkLibraryList: (): Promise<ApkFile[]> => ipcRenderer.invoke('apkLibrary:list'),
  apkLibraryGetDirectory: (): Promise<string> => ipcRenderer.invoke('apkLibrary:getDirectory'),
  apkLibraryChooseDirectory: (): Promise<string> => ipcRenderer.invoke('apkLibrary:chooseDirectory'),
  apkLibraryAddFiles: (): Promise<ApkFile[]> => ipcRenderer.invoke('apkLibrary:addFiles'),
  apkLibraryDeleteFile: (filePath: string): Promise<void> => ipcRenderer.invoke('apkLibrary:deleteFile', filePath),
  apkLibraryRevealInFileManager: (): Promise<string> => ipcRenderer.invoke('apkLibrary:revealInFileManager'),
  apkLibraryDownloadFromUrl: (url: string, filename?: string): Promise<string> =>
    ipcRenderer.invoke('apkLibrary:downloadFromUrl', url, filename),
  apkLibraryCheckFDroidUpdates: (): Promise<Record<string, FDroidUpdateInfo>> =>
    ipcRenderer.invoke('apkLibrary:checkFDroidUpdates'),
  apkLibraryDownloadFDroidUpdate: (file: ApkFile, update: FDroidUpdateInfo): Promise<string> =>
    ipcRenderer.invoke('apkLibrary:downloadFDroidUpdate', file, update),
  apkLibraryInstallToAllDevices: (
    apkPath: string
  ): Promise<{ successCount: number; total: number; failures: string[] }> =>
    ipcRenderer.invoke('apkLibrary:installToAllDevices', apkPath),

  // Файлы устройства
  listDirectory: (serial: string, dirPath: string) => ipcRenderer.invoke('adb:listDirectory', serial, dirPath),
  makeDirectory: (serial: string, dirPath: string) => ipcRenderer.invoke('adb:makeDirectory', serial, dirPath),
  removeRemote: (serial: string, targetPath: string, recursive: boolean) =>
    ipcRenderer.invoke('adb:removeRemote', serial, targetPath, recursive),

  // Shell
  shell: (serial: string, command: string) => ipcRenderer.invoke('adb:shell', serial, command),

  // Wi-Fi отладка
  enableWirelessDebugging: (serial: string, port: number) =>
    ipcRenderer.invoke('adb:enableWirelessDebugging', serial, port),
  deviceIPAddress: (serial: string) => ipcRenderer.invoke('adb:deviceIPAddress', serial),

  // Проброс портов
  listForwards: (serial: string) => ipcRenderer.invoke('adb:listForwards', serial),
  addForward: (serial: string, hostSpec: string, deviceSpec: string) =>
    ipcRenderer.invoke('adb:addForward', serial, hostSpec, deviceSpec),
  removeForward: (serial: string, hostSpec: string) => ipcRenderer.invoke('adb:removeForward', serial, hostSpec),
  listReverses: (serial: string) => ipcRenderer.invoke('adb:listReverses', serial),
  addReverse: (serial: string, deviceSpec: string, hostSpec: string) =>
    ipcRenderer.invoke('adb:addReverse', serial, deviceSpec, hostSpec),
  removeReverse: (serial: string, deviceSpec: string) => ipcRenderer.invoke('adb:removeReverse', serial, deviceSpec),

  // Свойства устройства
  allProperties: (serial: string) => ipcRenderer.invoke('adb:allProperties', serial),

  // Мониторинг
  deviceStats: (serial: string) => ipcRenderer.invoke('adb:deviceStats', serial),
  runningProcesses: (serial: string) => ipcRenderer.invoke('adb:runningProcesses', serial),
  killProcess: (serial: string, pid: number) => ipcRenderer.invoke('adb:killProcess', serial, pid),

  // Logcat — живой стрим строк через событие, не через invoke
  startLogcat: (serial: string) => ipcRenderer.invoke('adb:startLogcat', serial),
  stopLogcat: (serial: string) => ipcRenderer.invoke('adb:stopLogcat', serial),
  clearLogcatBuffer: (serial: string) => ipcRenderer.invoke('adb:clearLogcatBuffer', serial),
  onLogcatLine: (callback: (serial: string, line: string) => void) => {
    const listener = (_event: IpcRendererEvent, serial: string, line: string) => callback(serial, line);
    ipcRenderer.on('logcat:line', listener);
    return () => ipcRenderer.removeListener('logcat:line', listener);
  },
});
