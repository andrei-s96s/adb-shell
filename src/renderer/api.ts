// Типизированная обёртка над window.adbApi (выставлен preload.ts через
// contextBridge). Типы данных объявлены здесь же, а не импортированы из
// main/adb/** — renderer компилируется отдельным tsconfig.renderer.json
// (ES-модули), и импорт (даже `import type`) файла с рантайм-кодом из main
// заставляет tsc реально пере-эмитить этот файл под ES-модули поверх уже
// собранной main/commonjs версии, ломая её. Раньше так и было и это молча
// портило dist/main/adb/types/*.js — поймано через реальный запуск
// Electron ("SyntaxError: Unexpected token 'export'"), не просто чтением
// кода. Общих типов немного — дублировать дешевле, чем бороться с rootDir.

export interface Device {
  serial: string;
  state: 'device' | 'offline' | 'unauthorized' | 'noPermissions' | 'unknown';
  model?: string;
  product?: string;
  transportId?: string;
}

export interface InstalledApp {
  packageName: string;
  isSystem: boolean;
  isEnabled: boolean;
}

export interface AppPermission {
  name: string;
  granted: boolean;
  isRuntime: boolean;
}

export interface AppDetail {
  packageName: string;
  versionName?: string;
  versionCode?: string;
  firstInstallTime?: string;
  lastUpdateTime?: string;
  targetSdk?: string;
  apkPath?: string;
  isEnabled: boolean;
  permissions: AppPermission[];
  uid?: number;
}

export interface RemoteFile {
  name: string;
  path: string;
  isDirectory: boolean;
  isSymlink: boolean;
  sizeBytes?: number;
  permissions: string;
  modified?: string;
}

export interface PortForwardRule {
  direction: 'forward' | 'reverse';
  hostSpec: string;
  deviceSpec: string;
}

export interface DeviceProperty {
  key: string;
  value: string;
}

export interface DeviceStats {
  cpuPercent?: number;
  memUsedKB: number;
  memTotalKB: number;
  batteryLevel?: number;
  batteryTemperature?: number;
  isCharging: boolean;
  timestamp: number;
}

export interface RunningProcess {
  pid: number;
  ppid?: number;
  user: string;
  rssKB?: number;
  name: string;
}

export interface ApkFile {
  path: string;
  name: string;
  sizeBytes: number;
  modifiedMs: number;
}

export interface SavedCommand {
  id: string;
  text: string;
  isFavorite: boolean;
  lastUsedMs: number;
}

export interface ApkManifestInfo {
  packageName?: string;
  versionName?: string;
  versionCode?: string;
  minSdk?: string;
  targetSdk?: string;
  applicationLabel?: string;
  permissions: string[];
  rawBadging: string;
}

export interface FDroidUpdateInfo {
  packageName: string;
  installedVersionCode: number;
  latestVersionCode: number;
  latestVersionName?: string;
}

export interface InstallToAllResult {
  successCount: number;
  total: number;
  failures: string[];
}

export interface ReleaseAsset {
  name: string;
  url: string;
}

export interface UpdateInfo {
  version: string;
  releaseUrl: string;
  assets: ReleaseAsset[];
}

export interface MdnsDevice {
  name: string;
  type: string;
  address: string;
}

export interface DownloadProgress {
  receivedBytes: number;
  /** undefined -- сервер не прислал Content-Length, показываем только
   * скачанный объём без процента (см. main/util/download.ts). */
  totalBytes?: number;
}

export interface DeviceHistoryEntry {
  serial: string;
  model?: string;
  product?: string;
  firstSeenMs: number;
  lastSeenMs: number;
}

export interface ConnectionProfile {
  id: string;
  name: string;
  host: string;
  autoConnect: boolean;
}

export type SecurityLevel = 'ok' | 'warning' | 'critical';

export interface SecurityFinding {
  level: SecurityLevel;
  messageKey: string;
}

export interface NetworkUsage {
  rxBytes: number;
  txBytes: number;
}

export interface AppUsageStat {
  packageName: string;
  totalSeconds: number;
}

export type CrashTraceKind = 'anr' | 'tombstone';

export interface CrashTraceFile {
  path: string;
  name: string;
  kind: CrashTraceKind;
}

export interface PackageDiffResult {
  onlyInA: string[];
  onlyInB: string[];
  commonCount: number;
}

export interface AppSettings {
  statsAlertsEnabled: boolean;
  statsAlertCpuThreshold: number;
  statsAlertBatteryThreshold: number;
  globalScreenshotHotkeyEnabled: boolean;
  screenshotHotkeyAccelerator?: string;
  defaultShowSystemApps: boolean;
  autoCheckUpdates: boolean;
  themePreference: 'system' | 'light' | 'dark';
}

export interface ThresholdCheckResult {
  cpuAlertFired?: { cpuPercent: number };
  batteryAlertFired?: { batteryLevel: number };
}

export interface IntentPreset {
  id: string;
  name: string;
  uri: string;
}

export interface MacroStep {
  id: string;
  argsLine: string;
  isDelay?: boolean;
  delayMs?: number;
  runIf?: 'onPreviousSuccess' | 'onPreviousFailure';
}

export interface Macro {
  id: string;
  name: string;
  steps: MacroStep[];
  autorunOnConnect: boolean;
  abortOnFirstFailure: boolean;
  hotkeyAccelerator?: string;
  tags?: string[];
  scheduleIntervalMinutes?: number;
}

export interface MacroRunResult {
  argsLine: string;
  output: string;
  isError: boolean;
  skipped?: boolean;
}

export interface MacroRunOutcome {
  completedFully: boolean;
  results: MacroRunResult[];
}

export interface MacroRunHistoryEntry {
  id: string;
  macroId: string;
  macroName: string;
  serial: string;
  deviceLabel: string;
  startedAtMs: number;
  completedFully: boolean;
  results: MacroRunResult[];
}

export interface BundleOperationResult {
  packageName: string;
  success: boolean;
  message: string;
}

export interface ExportBundleOutcome {
  entryCount: number;
  results: BundleOperationResult[];
}

export interface ImportBundleOutcome {
  results: BundleOperationResult[];
}

export interface DeviceSnapshotInfo {
  path: string;
  deviceLabel: string;
  appCount: number;
  createdAtMs: number;
}

export interface OutdatedDuplicate {
  packageName: string;
  latestVersionCode: number;
  latestFileName: string;
}

export interface ManifestPackageDiff {
  packageName: string;
  inA: boolean;
  inB: boolean;
  versionA?: string;
  versionB?: string;
  addedPermissions: string[];
  removedPermissions: string[];
}

export interface InstallBatchFileResult {
  apkPath: string;
  success: boolean;
  message: string;
}

/** Общая форма результата для всех "на все выбранные разом" операций над
 * пакетами (удаление, force-stop, очистка данных, вкл/выкл) -- не только
 * удаление, несмотря на то что появился вместе с ним первым. */
export interface PackageBatchResult {
  packageName: string;
  success: boolean;
  message: string;
}

export type LogLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface LogLine {
  raw: string;
  timestamp?: string;
  pid?: string;
  tid?: string;
  level: LogLevel;
  tag?: string;
  message: string;
}

export interface AdbApi {
  checkForUpdates(): Promise<UpdateInfo | undefined>;
  downloadUpdate(assets: ReleaseAsset[]): Promise<void>;
  openExternal(url: string): Promise<void>;

  demoModeGet(): Promise<boolean>;
  demoModeSet(enabled: boolean): Promise<boolean>;

  listDevices(): Promise<Device[]>;
  connect(host: string): Promise<string>;
  disconnect(serial: string): Promise<void>;
  pair(hostPort: string, code: string): Promise<string>;
  discoverMdns(): Promise<MdnsDevice[]>;
  restartAdbServer(): Promise<void>;
  onDownloadUpdateProgress(callback: (progress: DownloadProgress) => void): () => void;
  onApkLibraryDownloadProgress(callback: (progress: DownloadProgress) => void): () => void;
  restartAdbServer(): Promise<void>;

  deviceNicknamesList(): Promise<Record<string, string>>;
  deviceNicknamesSet(serial: string, name: string): Promise<Record<string, string>>;

  devicePinsList(): Promise<string[]>;
  devicePinsToggle(serial: string): Promise<string[]>;

  deviceTagsList(): Promise<Record<string, string[]>>;
  deviceTagsAddTag(serial: string, tag: string): Promise<Record<string, string[]>>;
  deviceTagsRemoveTag(serial: string, tag: string): Promise<Record<string, string[]>>;

  deviceHistoryList(): Promise<DeviceHistoryEntry[]>;
  deviceHistoryRemove(serial: string): Promise<DeviceHistoryEntry[]>;
  deviceHistoryClear(): Promise<DeviceHistoryEntry[]>;

  connectionProfilesList(): Promise<ConnectionProfile[]>;
  connectionProfilesAdd(name: string, host: string): Promise<ConnectionProfile[]>;
  connectionProfilesRemove(id: string): Promise<ConnectionProfile[]>;
  connectionProfilesToggleAutoConnect(id: string): Promise<ConnectionProfile[]>;
  connectionProfilesClear(): Promise<ConnectionProfile[]>;
  connectionProfilesConnect(host: string): Promise<string>;
  connectionProfilesAutoConnect(): Promise<number>;
  connectionProfilesExport(): Promise<boolean>;
  connectionProfilesImport(): Promise<ConnectionProfile[]>;

  listApps(serial: string): Promise<InstalledApp[]>;
  appsCheckFDroidUpdates(serial: string): Promise<Record<string, FDroidUpdateInfo>>;
  appsInstallFDroidUpdate(serial: string, packageName: string, latestVersionCode: number): Promise<void>;
  iconGet(serial: string, packageName: string): Promise<string | undefined>;
  appDetail(serial: string, packageName: string): Promise<AppDetail>;
  install(serial: string, apkPath: string): Promise<string>;
  uninstall(serial: string, packageName: string): Promise<void>;
  forceStop(serial: string, packageName: string): Promise<void>;
  clearData(serial: string, packageName: string): Promise<void>;
  setEnabled(serial: string, packageName: string, enabled: boolean): Promise<void>;
  grantPermission(serial: string, packageName: string, permission: string): Promise<void>;
  revokePermission(serial: string, packageName: string, permission: string): Promise<void>;
  selectApkFile(): Promise<string | undefined>;
  selectApkFiles(): Promise<string[]>;

  appsDeleteSelected(serial: string, packages: string[]): Promise<PackageBatchResult[]>;
  appsForceStopSelected(serial: string, packages: string[]): Promise<PackageBatchResult[]>;
  appsClearDataSelected(serial: string, packages: string[]): Promise<PackageBatchResult[]>;
  appsSetEnabledSelected(serial: string, packages: string[], enabled: boolean): Promise<PackageBatchResult[]>;
  appsInstallBatch(serial: string, apkPaths: string[]): Promise<InstallBatchFileResult[]>;
  appsExportSelected(serial: string, packages: string[]): Promise<ExportBundleOutcome | undefined>;
  appsImportBundle(serial: string): Promise<ImportBundleOutcome | undefined>;

  snapshotsList(): Promise<DeviceSnapshotInfo[]>;
  snapshotsTake(serial: string, packages: string[], deviceLabel: string): Promise<ExportBundleOutcome>;
  snapshotsRestore(snapshotPath: string, serial: string): Promise<ImportBundleOutcome>;
  snapshotsDelete(snapshotPath: string): Promise<void>;
  snapshotsReveal(snapshotPath: string): Promise<void>;
  snapshotsDiff(pathA: string, pathB: string): Promise<ManifestPackageDiff[]>;

  apkLibraryList(): Promise<ApkFile[]>;
  apkLibraryGetDirectory(): Promise<string>;
  apkLibraryChooseDirectory(): Promise<string>;
  apkLibraryAddFiles(): Promise<ApkFile[]>;
  apkLibraryDeleteFile(filePath: string): Promise<void>;
  apkLibraryRevealInFileManager(): Promise<string>;
  apkLibraryDownloadFromUrl(url: string, filename?: string): Promise<string>;
  apkLibraryCheckFDroidUpdates(): Promise<Record<string, FDroidUpdateInfo>>;
  apkLibraryFindOutdatedDuplicates(): Promise<Record<string, OutdatedDuplicate>>;
  apkLibraryDownloadFDroidUpdate(file: ApkFile, update: FDroidUpdateInfo): Promise<string>;
  apkLibraryInstallToAllDevices(apkPath: string, tag?: string): Promise<InstallToAllResult>;
  apkLibraryTagsList(): Promise<Record<string, string[]>>;
  apkLibraryAddTag(filePath: string, tag: string): Promise<Record<string, string[]>>;
  apkLibraryRemoveTag(filePath: string, tag: string): Promise<Record<string, string[]>>;
  apkLibraryImportPaths(paths: string[]): Promise<ApkFile[]>;
  apkLibraryInspect(apkPath: string): Promise<ApkManifestInfo>;
  apkLibraryGetIcon(apkPath: string): Promise<string | undefined>;

  listDirectory(serial: string, dirPath: string): Promise<RemoteFile[]>;
  makeDirectory(serial: string, dirPath: string): Promise<void>;
  removeRemote(serial: string, targetPath: string, recursive: boolean): Promise<void>;
  push(serial: string, localPath: string, remotePath: string): Promise<void>;
  selectFileToPush(): Promise<string | undefined>;
  pullToChosenPath(serial: string, remotePath: string, suggestedName: string): Promise<boolean>;
  appsExportApk(serial: string, packageName: string): Promise<boolean>;
  getPathForFile(file: File): string;

  shell(serial: string, command: string): Promise<string>;
  runRaw(serial: string, argsLine: string): Promise<string>;
  killShell(serial: string): Promise<boolean>;

  shellHistoryList(): Promise<SavedCommand[]>;
  shellHistoryRecord(text: string): Promise<SavedCommand[]>;
  shellHistoryFavorite(text: string): Promise<SavedCommand[]>;
  shellHistoryToggleFavorite(id: string): Promise<SavedCommand[]>;
  shellHistoryRemove(id: string): Promise<SavedCommand[]>;
  shellHistoryClear(): Promise<SavedCommand[]>;
  openDeepLink(serial: string, uri: string): Promise<string>;
  intentPresetsList(): Promise<IntentPreset[]>;
  intentPresetsAdd(name: string, uri: string): Promise<IntentPreset[]>;
  intentPresetsRemove(id: string): Promise<IntentPreset[]>;

  macrosList(): Promise<Macro[]>;
  macrosAdd(
    name: string,
    steps: MacroStep[],
    autorunOnConnect: boolean,
    abortOnFirstFailure: boolean,
    hotkeyAccelerator?: string,
    scheduleIntervalMinutes?: number
  ): Promise<Macro[]>;
  macrosUpdate(
    id: string,
    name: string,
    steps: MacroStep[],
    autorunOnConnect: boolean,
    abortOnFirstFailure: boolean,
    hotkeyAccelerator?: string,
    scheduleIntervalMinutes?: number
  ): Promise<Macro[]>;
  macrosParseScript(rawText: string): Promise<MacroStep[]>;
  macrosRemove(id: string): Promise<Macro[]>;
  macrosAddTag(id: string, tag: string): Promise<Macro[]>;
  macrosRemoveTag(id: string, tag: string): Promise<Macro[]>;
  macrosActiveHotkeys(): Promise<string[]>;
  macrosRun(macroId: string, serial: string, variables: Record<string, string>, runId: string): Promise<MacroRunOutcome>;
  macrosRunOnAll(macroId: string, variables: Record<string, string>, tag?: string): Promise<InstallToAllResult>;
  onMacroStepResult(callback: (runId: string, macroId: string, index: number, total: number, result: MacroRunResult) => void): () => void;
  macrosExport(): Promise<boolean>;
  macrosImport(): Promise<Macro[]>;
  macroRunHistoryList(): Promise<MacroRunHistoryEntry[]>;
  macroRunHistoryClear(): Promise<MacroRunHistoryEntry[]>;

  enableWirelessDebugging(serial: string, port: number): Promise<string>;
  deviceIPAddress(serial: string): Promise<string | undefined>;

  listForwards(serial: string): Promise<PortForwardRule[]>;
  addForward(serial: string, hostSpec: string, deviceSpec: string): Promise<void>;
  removeForward(serial: string, hostSpec: string): Promise<void>;
  listReverses(serial: string): Promise<PortForwardRule[]>;
  addReverse(serial: string, deviceSpec: string, hostSpec: string): Promise<void>;
  removeReverse(serial: string, deviceSpec: string): Promise<void>;

  allProperties(serial: string): Promise<DeviceProperty[]>;

  deviceStatsAndProcesses(serial: string): Promise<{ stats: DeviceStats; processes: RunningProcess[] }>;
  killProcess(serial: string, pid: number): Promise<void>;

  securityInfo(serial: string): Promise<SecurityFinding[]>;
  networkUsage(serial: string, uid: number): Promise<NetworkUsage>;
  usageStats(serial: string): Promise<AppUsageStat[]>;
  crashTraces(serial: string): Promise<CrashTraceFile[]>;
  readCrashTrace(serial: string, filePath: string): Promise<string>;
  bugreport(serial: string): Promise<string | undefined>;
  killBugreport(serial: string): Promise<boolean>;
  comparePackages(serialA: string, serialB: string): Promise<PackageDiffResult>;

  settingsGet(): Promise<AppSettings>;
  settingsUpdate(partial: Partial<AppSettings>): Promise<AppSettings>;
  settingsScreenshotHotkeyActive(): Promise<boolean>;
  resetAlertArm(): Promise<void>;
  checkAlertThresholds(stats: DeviceStats): Promise<ThresholdCheckResult>;

  saveCsv(defaultName: string, content: string): Promise<boolean>;
  saveText(defaultName: string, content: string, filterName: string, filterExtensions: string[]): Promise<boolean>;

  screenshot(serial: string): Promise<string>;
  clipboardWriteImagePng(base64Png: string): Promise<void>;
  saveScreenshot(base64Png: string): Promise<boolean>;
  selectScreenshotAllDir(): Promise<string | undefined>;
  screenshotAllDevices(directory: string, tag?: string): Promise<InstallToAllResult>;
  setHotkeySelectedSerial(serial: string | undefined): Promise<void>;

  startLogcat(serial: string): Promise<void>;
  stopLogcat(serial: string): Promise<void>;
  clearLogcatBuffer(serial: string): Promise<void>;
  onLogcatLine(callback: (serial: string, line: string) => void): () => void;
  onLogcatEnded(callback: (serial: string) => void): () => void;

  mirrorIsAvailable(): Promise<boolean>;
  mirrorRunningSerials(): Promise<string[]>;
  mirrorLaunch(serial: string, recordPath?: string): Promise<void>;
  mirrorLaunchGrid(serials: string[]): Promise<void>;
  selectRecordPath(serial: string): Promise<string | undefined>;
  onMirrorStopped(callback: (serial: string) => void): () => void;
}

export const adbApi: AdbApi = (window as unknown as { adbApi: AdbApi }).adbApi;

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Element #${id} not found`);
  return found as T;
}
