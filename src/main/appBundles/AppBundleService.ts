// Порт "Наборов приложений" из Sources/AdbShell/ViewModels/AppsViewModel.swift
// (exportBundle/importBundle) -- общий движок экспорта/импорта, используется
// и "экспортом выбранных" (ручной multi-select + диалог сохранения), и
// снапшотом устройства (все пользовательские приложения, без диалога, см.
// DeviceSnapshotService.ts).
//
// ZipUtil.swift оборачивал macOS-only /usr/bin/ditto -- здесь вместо него
// adm-zip (чистый JS, без нативных зависимостей, работает одинаково на
// Windows/macOS). Формат manifest.json оставлен побайтово совместимым со
// Swift-оригиналом (те же имена полей, ISO8601-дата), поэтому старые
// .zip-наборы/снапшоты, экспортированные Swift-версией, всё ещё
// импортируются здесь.

import AdmZip from 'adm-zip';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import { AdbService } from '../adb/AdbService';
import { AppBundleEntry, AppBundleManifest, APKS_SUBDIRECTORY, BundleOperationResult, MANIFEST_FILE_NAME } from '../adb/types/AppBundleManifest';
import { primaryApkPath } from '../adb/parsers/ApkPathParser';
import { grantedRuntimePermissionNames } from './appBundleLogic';

export interface ExportBundleOutcome {
  entryCount: number;
  results: BundleOperationResult[];
}

export interface ImportBundleOutcome {
  results: BundleOperationResult[];
}

/** Тянет apk + выданные runtime-разрешения для каждого пакета из `packages`,
 * пишет manifest.json и zip'ует всё в destinationZip. Возвращает число
 * успешно вошедших в архив приложений (0 — ничего не экспортировано, файл
 * назначения не создаётся). */
export async function exportBundle(
  packages: string[],
  serial: string,
  sourceDeviceModel: string | undefined,
  destinationZip: string,
  adb: AdbService,
  onProgress?: (index: number, total: number, packageName: string) => void
): Promise<ExportBundleOutcome> {
  const workDir = path.join(os.tmpdir(), `AdbShellExport-${randomUUID()}`);
  const apksDir = path.join(workDir, APKS_SUBDIRECTORY);
  await fsPromises.mkdir(apksDir, { recursive: true });

  const results: BundleOperationResult[] = [];
  const entries: AppBundleEntry[] = [];

  try {
    for (let i = 0; i < packages.length; i++) {
      const pkg = packages[i];
      onProgress?.(i + 1, packages.length, pkg);
      try {
        const detail = await adb.appDetail(serial, pkg);
        const apkPaths = await adb.apkPaths(serial, pkg);
        const basePath = primaryApkPath(apkPaths);
        if (!basePath) {
          results.push({ packageName: pkg, success: false, message: 'APK не найден на устройстве' });
          continue;
        }
        const fileName = `${pkg}.apk`;
        const localApk = path.join(apksDir, fileName);
        await adb.pull(serial, basePath, localApk);

        const grantedRuntime = grantedRuntimePermissionNames(detail.permissions);
        entries.push({ packageName: pkg, apkFileName: fileName, versionName: detail.versionName, permissions: grantedRuntime });
        results.push({ packageName: pkg, success: true, message: `Разрешений: ${grantedRuntime.length}` });
      } catch (error) {
        results.push({ packageName: pkg, success: false, message: (error as Error).message });
      }
    }

    if (entries.length === 0) {
      return { entryCount: 0, results };
    }

    const manifest: AppBundleManifest = { exportedAt: new Date().toISOString(), sourceDeviceModel, entries };
    await fsPromises.writeFile(path.join(workDir, MANIFEST_FILE_NAME), JSON.stringify(manifest, null, 2), 'utf8');

    if (fs.existsSync(destinationZip)) await fsPromises.rm(destinationZip);
    const zip = new AdmZip();
    zip.addLocalFile(path.join(workDir, MANIFEST_FILE_NAME));
    zip.addLocalFolder(apksDir, APKS_SUBDIRECTORY);
    await zip.writeZipPromise(destinationZip);

    return { entryCount: entries.length, results };
  } finally {
    await fsPromises.rm(workDir, { recursive: true, force: true });
  }
}

/** Устанавливает набор из .zip: каждый apk + выдача сохранённых
 * runtime-разрешений через pm grant. Ошибка гранта отдельного разрешения не
 * прерывает импорт остальных -- не все разрешения обязаны существовать на
 * целевой версии Android. */
export async function importBundle(
  zipPath: string,
  serial: string,
  adb: AdbService,
  onProgress?: (index: number, total: number, packageName: string) => void
): Promise<ImportBundleOutcome> {
  const workDir = path.join(os.tmpdir(), `AdbShellImport-${randomUUID()}`);
  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(workDir, true);

    const manifestRaw = await fsPromises.readFile(path.join(workDir, MANIFEST_FILE_NAME), 'utf8');
    const manifest = JSON.parse(manifestRaw) as AppBundleManifest;

    const results: BundleOperationResult[] = [];
    for (let i = 0; i < manifest.entries.length; i++) {
      const entry = manifest.entries[i];
      onProgress?.(i + 1, manifest.entries.length, entry.packageName);
      const apkPath = path.join(workDir, APKS_SUBDIRECTORY, entry.apkFileName);
      if (!fs.existsSync(apkPath)) {
        results.push({ packageName: entry.packageName, success: false, message: 'APK отсутствует в наборе' });
        continue;
      }
      try {
        await adb.install(serial, apkPath);
        let grantedCount = 0;
        for (const permission of entry.permissions) {
          try {
            await adb.grantPermission(serial, entry.packageName, permission);
            grantedCount += 1;
          } catch {
            // Не все разрешения обязаны существовать на целевой версии Android.
          }
        }
        results.push({
          packageName: entry.packageName,
          success: true,
          message: `Выдано разрешений: ${grantedCount}/${entry.permissions.length}`,
        });
      } catch (error) {
        results.push({ packageName: entry.packageName, success: false, message: (error as Error).message });
      }
    }
    return { results };
  } finally {
    await fsPromises.rm(workDir, { recursive: true, force: true });
  }
}
