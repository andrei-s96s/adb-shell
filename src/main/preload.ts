import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron';
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
import { IntentPreset } from './adb/types/IntentPreset';
import { Macro } from './adb/types/Macro';
import { MacroRunOutcome } from './macros/MacroRunner';
import { ExportBundleOutcome, ImportBundleOutcome } from './appBundles/AppBundleService';
import { DeviceSnapshotInfo } from './deviceSnapshots/DeviceSnapshotService';
import { ApkManifestInfo } from './adb/types/ApkManifestInfo';
import { SavedCommand } from './shellHistory/shellHistoryLogic';

// Единственный мост renderer -> main; renderer работает с contextIsolation
// включённым и nodeIntegration выключенным (см. main.ts) — доступ к adb
// только через этот явный, узкий API, ничего больше не пробрасывается.
contextBridge.exposeInMainWorld('adbApi', {
  checkForUpdates: (): Promise<UpdateInfo | undefined> => ipcRenderer.invoke('app:checkForUpdates'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),

  // Демо-режим -- см. main/adb/demo/DemoAdbService.ts
  demoModeGet: (): Promise<boolean> => ipcRenderer.invoke('demoMode:get'),
  demoModeSet: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke('demoMode:set', enabled),

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
  connectionProfilesClear: (): Promise<ConnectionProfile[]> => ipcRenderer.invoke('connectionProfiles:clear'),
  connectionProfilesConnect: (host: string): Promise<string> => ipcRenderer.invoke('connectionProfiles:connect', host),
  connectionProfilesAutoConnect: (): Promise<number> => ipcRenderer.invoke('connectionProfiles:autoConnect'),
  connectionProfilesExport: (): Promise<boolean> => ipcRenderer.invoke('connectionProfiles:export'),
  connectionProfilesImport: (): Promise<ConnectionProfile[]> => ipcRenderer.invoke('connectionProfiles:import'),

  // Приложения
  listApps: (serial: string) => ipcRenderer.invoke('adb:listApps', serial),
  appsCheckFDroidUpdates: (serial: string): Promise<Record<string, FDroidUpdateInfo>> =>
    ipcRenderer.invoke('apps:checkFDroidUpdates', serial),
  appsInstallFDroidUpdate: (serial: string, packageName: string, latestVersionCode: number): Promise<void> =>
    ipcRenderer.invoke('apps:installFDroidUpdate', serial, packageName, latestVersionCode),
  iconGet: (serial: string, packageName: string): Promise<string | undefined> => ipcRenderer.invoke('icons:get', serial, packageName),
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
  selectApkFiles: (): Promise<string[]> => ipcRenderer.invoke('dialog:selectApks'),

  appsDeleteSelected: (serial: string, packages: string[]): Promise<number> =>
    ipcRenderer.invoke('apps:deleteSelected', serial, packages),
  appsInstallBatch: (
    serial: string,
    apkPaths: string[]
  ): Promise<{ apkPath: string; success: boolean; message: string }[]> =>
    ipcRenderer.invoke('apps:installBatch', serial, apkPaths),
  appsExportSelected: (serial: string, packages: string[]): Promise<ExportBundleOutcome | undefined> =>
    ipcRenderer.invoke('apps:exportSelected', serial, packages),
  appsImportBundle: (serial: string): Promise<ImportBundleOutcome | undefined> =>
    ipcRenderer.invoke('apps:importBundle', serial),

  snapshotsList: (): Promise<DeviceSnapshotInfo[]> => ipcRenderer.invoke('snapshots:list'),
  snapshotsTake: (serial: string, packages: string[], deviceLabel: string): Promise<ExportBundleOutcome> =>
    ipcRenderer.invoke('snapshots:take', serial, packages, deviceLabel),
  snapshotsRestore: (snapshotPath: string, serial: string): Promise<ImportBundleOutcome> =>
    ipcRenderer.invoke('snapshots:restore', snapshotPath, serial),
  snapshotsDelete: (snapshotPath: string): Promise<void> => ipcRenderer.invoke('snapshots:delete', snapshotPath),
  snapshotsReveal: (snapshotPath: string): Promise<void> => ipcRenderer.invoke('snapshots:reveal', snapshotPath),

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
  apkLibraryTagsList: (): Promise<Record<string, string[]>> => ipcRenderer.invoke('apkLibrary:tagsList'),
  apkLibraryAddTag: (filePath: string, tag: string): Promise<Record<string, string[]>> =>
    ipcRenderer.invoke('apkLibrary:addTag', filePath, tag),
  apkLibraryRemoveTag: (filePath: string, tag: string): Promise<Record<string, string[]>> =>
    ipcRenderer.invoke('apkLibrary:removeTag', filePath, tag),
  apkLibraryImportPaths: (paths: string[]): Promise<ApkFile[]> => ipcRenderer.invoke('apkLibrary:importPaths', paths),
  apkLibraryInspect: (apkPath: string): Promise<ApkManifestInfo> => ipcRenderer.invoke('apkLibrary:inspect', apkPath),

  // Файлы устройства
  listDirectory: (serial: string, dirPath: string) => ipcRenderer.invoke('adb:listDirectory', serial, dirPath),
  makeDirectory: (serial: string, dirPath: string) => ipcRenderer.invoke('adb:makeDirectory', serial, dirPath),
  removeRemote: (serial: string, targetPath: string, recursive: boolean) =>
    ipcRenderer.invoke('adb:removeRemote', serial, targetPath, recursive),
  push: (serial: string, localPath: string, remotePath: string): Promise<void> =>
    ipcRenderer.invoke('adb:push', serial, localPath, remotePath),
  selectFileToPush: (): Promise<string | undefined> => ipcRenderer.invoke('dialog:selectFileToPush'),
  pullToChosenPath: (serial: string, remotePath: string, suggestedName: string): Promise<boolean> =>
    ipcRenderer.invoke('adb:pullToChosenPath', serial, remotePath, suggestedName),
  appsExportApk: (serial: string, packageName: string): Promise<boolean> =>
    ipcRenderer.invoke('apps:exportApk', serial, packageName),
  /** Абсолютный локальный путь для File, полученного через drag&drop --
   * File.path убран из Electron 32+ по соображениям изоляции контекста,
   * актуальная замена — webUtils.getPathForFile (сам File-объект спокойно
   * проходит через contextBridge, у Electron для него есть спецобработка). */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  // Shell
  shell: (serial: string, command: string) => ipcRenderer.invoke('adb:shell', serial, command),
  runRaw: (serial: string, argsLine: string) => ipcRenderer.invoke('adb:runRaw', serial, argsLine),

  shellHistoryList: (): Promise<SavedCommand[]> => ipcRenderer.invoke('shellHistory:list'),
  shellHistoryRecord: (text: string): Promise<SavedCommand[]> => ipcRenderer.invoke('shellHistory:record', text),
  shellHistoryFavorite: (text: string): Promise<SavedCommand[]> => ipcRenderer.invoke('shellHistory:favorite', text),
  shellHistoryToggleFavorite: (id: string): Promise<SavedCommand[]> => ipcRenderer.invoke('shellHistory:toggleFavorite', id),
  shellHistoryRemove: (id: string): Promise<SavedCommand[]> => ipcRenderer.invoke('shellHistory:remove', id),
  shellHistoryClear: (): Promise<SavedCommand[]> => ipcRenderer.invoke('shellHistory:clear'),

  openDeepLink: (serial: string, uri: string): Promise<string> => ipcRenderer.invoke('adb:openDeepLink', serial, uri),
  intentPresetsList: (): Promise<IntentPreset[]> => ipcRenderer.invoke('intentPresets:list'),
  intentPresetsAdd: (name: string, uri: string): Promise<IntentPreset[]> =>
    ipcRenderer.invoke('intentPresets:add', name, uri),
  intentPresetsRemove: (id: string): Promise<IntentPreset[]> => ipcRenderer.invoke('intentPresets:remove', id),

  macrosList: (): Promise<Macro[]> => ipcRenderer.invoke('macros:list'),
  macrosAdd: (name: string, rawText: string, autorunOnConnect: boolean, abortOnFirstFailure: boolean): Promise<Macro[]> =>
    ipcRenderer.invoke('macros:add', name, rawText, autorunOnConnect, abortOnFirstFailure),
  macrosUpdate: (
    id: string,
    name: string,
    rawText: string,
    autorunOnConnect: boolean,
    abortOnFirstFailure: boolean
  ): Promise<Macro[]> => ipcRenderer.invoke('macros:update', id, name, rawText, autorunOnConnect, abortOnFirstFailure),
  macrosRemove: (id: string): Promise<Macro[]> => ipcRenderer.invoke('macros:remove', id),
  macrosRun: (macroId: string, serial: string, variables: Record<string, string>): Promise<MacroRunOutcome> =>
    ipcRenderer.invoke('macros:run', macroId, serial, variables),
  macrosExport: (): Promise<boolean> => ipcRenderer.invoke('macros:export'),
  macrosImport: (): Promise<Macro[]> => ipcRenderer.invoke('macros:import'),

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

  screenshot: (serial: string): Promise<string> => ipcRenderer.invoke('adb:screenshot', serial),
  clipboardWriteImagePng: (base64Png: string): Promise<void> => ipcRenderer.invoke('clipboard:writeImagePng', base64Png),
  saveScreenshot: (base64Png: string): Promise<boolean> => ipcRenderer.invoke('dialog:saveScreenshot', base64Png),
  setHotkeySelectedSerial: (serial: string | undefined): Promise<void> =>
    ipcRenderer.invoke('hotkey:setSelectedSerial', serial),

  // Logcat — живой стрим строк через событие, не через invoke
  startLogcat: (serial: string) => ipcRenderer.invoke('adb:startLogcat', serial),
  stopLogcat: (serial: string) => ipcRenderer.invoke('adb:stopLogcat', serial),
  clearLogcatBuffer: (serial: string) => ipcRenderer.invoke('adb:clearLogcatBuffer', serial),
  onLogcatLine: (callback: (serial: string, line: string) => void) => {
    const listener = (_event: IpcRendererEvent, serial: string, line: string) => callback(serial, line);
    ipcRenderer.on('logcat:line', listener);
    return () => ipcRenderer.removeListener('logcat:line', listener);
  },

  mirrorIsAvailable: (): Promise<boolean> => ipcRenderer.invoke('mirror:isAvailable'),
  mirrorRunningSerials: (): Promise<string[]> => ipcRenderer.invoke('mirror:runningSerials'),
  mirrorLaunch: (serial: string, recordPath?: string): Promise<void> => ipcRenderer.invoke('mirror:launch', serial, recordPath),
  mirrorLaunchGrid: (serials: string[]): Promise<void> => ipcRenderer.invoke('mirror:launchGrid', serials),
  selectRecordPath: (serial: string): Promise<string | undefined> => ipcRenderer.invoke('dialog:selectRecordPath', serial),
  onMirrorStopped: (callback: (serial: string) => void) => {
    const listener = (_event: IpcRendererEvent, serial: string) => callback(serial);
    ipcRenderer.on('mirror:stopped', listener);
    return () => ipcRenderer.removeListener('mirror:stopped', listener);
  },
});
