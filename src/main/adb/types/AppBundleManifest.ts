// Порт Sources/AdbShell/Models/AppBundleManifest.swift — формат "набора
// приложений": экспорт нескольких APK вместе с их выданными
// runtime-разрешениями, чтобы поставить всё на другое устройство одним
// кликом с теми же правами. Хранится как .zip: manifest.json + apks/*.apk.
// Поля манифеста намеренно совпадают со Swift-оригиналом байт-в-байт (те же
// имена, ISO8601-дата) — старые .zip-наборы/снапшоты, экспортированные
// Swift-версией, остаются импортируемыми в этом порту.

export interface AppBundleEntry {
  packageName: string;
  apkFileName: string;
  versionName?: string;
  /** Только runtime-разрешения, которые были выданы (isRuntime && granted) —
   * install-time разрешения выдаются автоматически при установке. */
  permissions: string[];
}

export interface AppBundleManifest {
  exportedAt: string;
  sourceDeviceModel?: string;
  entries: AppBundleEntry[];
}

export const MANIFEST_FILE_NAME = 'manifest.json';
export const APKS_SUBDIRECTORY = 'apks';

export interface BundleOperationResult {
  packageName: string;
  success: boolean;
  message: string;
}
