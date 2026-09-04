// Порт DeviceSnapshot-части AppsViewModel из
// Sources/AdbShell/ViewModels/AppsViewModel.swift -- локально сохранённые
// снапшоты всех пользовательских приложений устройства вместе с выданными
// runtime-разрешениями, тот же .zip-формат, что и "набор приложений", но
// хранится сам в userData (аналог ~/Library/Application Support, НЕ Caches
// -- см. комментарий в DeviceSnapshot.swift про то, почему не Caches),
// без диалога сохранения.

import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import { AdbService } from '../adb/AdbService';
import { exportBundle, importBundle, ExportBundleOutcome, ImportBundleOutcome } from '../appBundles/AppBundleService';
import { makeSnapshotFilename, parseSnapshotFilename } from './deviceSnapshotLogic';

export interface DeviceSnapshotInfo {
  path: string;
  deviceLabel: string;
  appCount: number;
  createdAtMs: number;
}

export class DeviceSnapshotService {
  get directory(): string {
    return path.join(app.getPath('userData'), 'Snapshots');
  }

  list(): DeviceSnapshotInfo[] {
    let names: string[];
    try {
      names = fs.readdirSync(this.directory);
    } catch {
      return [];
    }
    const snapshots: DeviceSnapshotInfo[] = [];
    for (const name of names) {
      if (!name.toLowerCase().endsWith('.zip')) continue;
      const parsed = parseSnapshotFilename(name);
      if (!parsed) continue;
      const fullPath = path.join(this.directory, name);
      let createdAtMs = 0;
      try {
        createdAtMs = fs.statSync(fullPath).mtimeMs;
      } catch {
        // Файл мог исчезнуть между readdirSync и statSync -- пропускаем молча.
        continue;
      }
      snapshots.push({ path: fullPath, deviceLabel: parsed.label, appCount: parsed.appCount, createdAtMs });
    }
    return snapshots.sort((a, b) => b.createdAtMs - a.createdAtMs);
  }

  async take(
    packages: string[],
    serial: string,
    deviceLabel: string,
    adb: AdbService,
    onProgress?: (index: number, total: number, packageName: string) => void
  ): Promise<ExportBundleOutcome> {
    fs.mkdirSync(this.directory, { recursive: true });
    const uniqueSuffix = randomUUID().slice(0, 8);
    const destination = path.join(this.directory, makeSnapshotFilename(deviceLabel, packages.length, uniqueSuffix));
    return exportBundle(packages, serial, deviceLabel, destination, adb, onProgress);
  }

  async restore(
    snapshotPath: string,
    serial: string,
    adb: AdbService,
    onProgress?: (index: number, total: number, packageName: string) => void
  ): Promise<ImportBundleOutcome> {
    return importBundle(snapshotPath, serial, adb, onProgress);
  }

  delete(snapshotPath: string): void {
    fs.unlinkSync(snapshotPath);
  }
}
