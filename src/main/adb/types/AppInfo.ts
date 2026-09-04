// Порт Sources/AdbShell/Models/AppInfo.swift

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

export function permissionShortName(permission: AppPermission): string {
  const parts = permission.name.split('.');
  return parts.length > 0 ? parts[parts.length - 1] : permission.name;
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
  /** Linux UID приложения на устройстве (userId= в dumpsys package). */
  uid?: number;
}
