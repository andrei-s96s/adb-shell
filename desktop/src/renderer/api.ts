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

export interface AdbApi {
  listDevices(): Promise<Device[]>;
  connect(host: string): Promise<string>;
  disconnect(serial: string): Promise<void>;
  pair(hostPort: string, code: string): Promise<string>;

  listApps(serial: string): Promise<InstalledApp[]>;
  appDetail(serial: string, packageName: string): Promise<AppDetail>;
  install(serial: string, apkPath: string): Promise<string>;
  uninstall(serial: string, packageName: string): Promise<void>;
  forceStop(serial: string, packageName: string): Promise<void>;
  clearData(serial: string, packageName: string): Promise<void>;
  setEnabled(serial: string, packageName: string, enabled: boolean): Promise<void>;
  grantPermission(serial: string, packageName: string, permission: string): Promise<void>;
  revokePermission(serial: string, packageName: string, permission: string): Promise<void>;

  listDirectory(serial: string, dirPath: string): Promise<RemoteFile[]>;
  makeDirectory(serial: string, dirPath: string): Promise<void>;
  removeRemote(serial: string, targetPath: string, recursive: boolean): Promise<void>;

  shell(serial: string, command: string): Promise<string>;

  enableWirelessDebugging(serial: string, port: number): Promise<string>;
  deviceIPAddress(serial: string): Promise<string | undefined>;

  listForwards(serial: string): Promise<PortForwardRule[]>;
  addForward(serial: string, hostSpec: string, deviceSpec: string): Promise<void>;
  removeForward(serial: string, hostSpec: string): Promise<void>;
  listReverses(serial: string): Promise<PortForwardRule[]>;
  addReverse(serial: string, deviceSpec: string, hostSpec: string): Promise<void>;
  removeReverse(serial: string, deviceSpec: string): Promise<void>;

  allProperties(serial: string): Promise<DeviceProperty[]>;
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
