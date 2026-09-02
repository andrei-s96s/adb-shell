// Порт Sources/AdbShell/Models/FDroidUpdateInfo.swift

export interface FDroidUpdateInfo {
  packageName: string;
  installedVersionCode: number;
  latestVersionCode: number;
  latestVersionName?: string;
}

/** Официальный URL прямой сборки F-Droid: repo/<pkg>_<versionCode>.apk. */
export function fdroidDownloadUrl(info: FDroidUpdateInfo): string {
  return `https://f-droid.org/repo/${info.packageName}_${info.latestVersionCode}.apk`;
}

export function fdroidPageUrl(info: FDroidUpdateInfo): string {
  return `https://f-droid.org/packages/${info.packageName}/`;
}
