// Порт Sources/AdbShell/Models/ApkManifestInfo.swift

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
