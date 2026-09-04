import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { ApkFile } from './adb/types/ApkFile';
import { FDroidUpdateInfo } from './adb/types/FDroidUpdateInfo';
import { UpdateInfo } from './updateChecker';
import { MdnsDevice } from './adb/types/MdnsDevice';
import { ConnectionProfile } from './adb/types/ConnectionProfile';
import { SecurityFinding } from './adb/types/DeviceSecurityInfo';
import { NetworkUsage } from './adb/parsers/NetworkUsageParser';
import { AppUsageStat } from './adb/types/AppUsageStat';
import { CrashTraceFile } from './adb/types/CrashTraceFile';
import { PackageDiffResult } from './adb/parsers/PackageDiff';
import { AppSettings } from './settings/AppSettingsStore';
import { DeviceStats } from './adb/types/DeviceStats';
import { ThresholdCheckResult } from './monitoring/alertThresholdLogic';

// Единственный мост renderer -> main; renderer работает с contextIsolation
// включённым и nodeIntegration выключенным (см. main.ts) — доступ к adb
// только через этот явный, узкий API, ничего больше не пробрасывается.
contextBridge.exposeInMainWorld('adbApi', {
  checkForUpdates: (): Promise<UpdateInfo | undefined> => ipcRenderer.invoke('app:checkForUpdates'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),

  // Устройства
  listDevices: () => ipcRenderer.invoke('adb:listDevices'),
  connect: (host: string) => ipcRenderer.invoke('adb:connect', host),
  disconnect: (serial: string) => ipcRenderer.invoke('adb:disconnect', serial),
  pair: (hostPort: string, code: string) => ipcRenderer.invoke('adb:pair', hostPort, code),
  discoverMdns: (): Promise<MdnsDevice[]> => ipcRenderer.invoke('adb:discoverMdns'),

  // Никнеймы устройств
  deviceNicknamesList: (): Promise<Record<string, string>> => ipcRenderer.invoke('deviceNicknames:list'),
  deviceNicknamesSet: (serial: string, name: string): Promise<Record<string, string>> =>
    ipcRenderer.invoke('deviceNicknames:set', serial, name),

  // Закреплённые устройства
  devicePinsList: (): Promise<string[]> => ipcRenderer.invoke('devicePins:list'),
  devicePinsToggle: (serial: string): Promise<string[]> => ipcRenderer.invoke('devicePins:toggle', serial),

  // Профили подключения
  connectionProfilesList: (): Promise<ConnectionProfile[]> => ipcRenderer.invoke('connectionProfiles:list'),
  connectionProfilesAdd: (name: string, host: string): Promise<ConnectionProfile[]> =>
    ipcRenderer.invoke('connectionProfiles:add', name, host),
  connectionProfilesRemove: (id: string): Promise<ConnectionProfile[]> =>
    ipcRenderer.invoke('connectionProfiles:remove', id),
  connectionProfilesToggleAutoConnect: (id: string): Promise<ConnectionProfile[]> =>
    ipcRenderer.invoke('connectionProfiles:toggleAutoConnect', id),
  connectionProfilesConnect: (host: string): Promise<string> => ipcRenderer.invoke('connectionProfiles:connect', host),
  connectionProfilesAutoConnect: (): Promise<number> => ipcRenderer.invoke('connectionProfiles:autoConnect'),
  connectionProfilesExport: (): Promise<boolean> => ipcRenderer.invoke('connectionProfiles:export'),
  connectionProfilesImport: (): Promise<ConnectionProfile[]> => ipcRenderer.invoke('connectionProfiles:import'),

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

  securityInfo: (serial: string): Promise<SecurityFinding[]> => ipcRenderer.invoke('adb:securityInfo', serial),
  networkUsage: (serial: string, uid: number): Promise<NetworkUsage> => ipcRenderer.invoke('adb:networkUsage', serial, uid),
  usageStats: (serial: string): Promise<AppUsageStat[]> => ipcRenderer.invoke('adb:usageStats', serial),
  crashTraces: (serial: string): Promise<CrashTraceFile[]> => ipcRenderer.invoke('adb:crashTraces', serial),
  readCrashTrace: (serial: string, filePath: string): Promise<string> =>
    ipcRenderer.invoke('adb:readCrashTrace', serial, filePath),
  comparePackages: (serialA: string, serialB: string): Promise<PackageDiffResult> =>
    ipcRenderer.invoke('adb:comparePackages', serialA, serialB),

  settingsGet: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  settingsUpdate: (partial: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke('settings:update', partial),
  resetAlertArm: (): Promise<void> => ipcRenderer.invoke('monitoring:resetAlertArm'),
  checkAlertThresholds: (stats: DeviceStats): Promise<ThresholdCheckResult> =>
    ipcRenderer.invoke('monitoring:checkThresholds', stats),

  saveCsv: (defaultName: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke('dialog:saveCsv', defaultName, content),

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
