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
import { makeSnapshotFilename, parseSnapshotFilename, snapshotsToPruneAfterTaking } from './deviceSnapshotLogic';
import { assertPathWithinDirectory } from '../util/pathSafety';

export interface DeviceSnapshotInfo {
  path: string;
  deviceLabel: string;
  appCount: number;
  createdAtMs: number;
}

/** Снапшотов на ОДНО устройство больше этого -- при регулярном снятии
 * снапшотов одного и того же устройства (deviceLabel) папка Snapshots
 * иначе растёт бессрочно, каждый снапшот -- полный .zip со ВСЕМИ
 * пользовательскими APK устройства. take() ниже сам подчищает лишнее сразу
 * после успешного снятия нового. */
const MAX_SNAPSHOTS_PER_DEVICE = 5;

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
    const outcome = await exportBundle(packages, serial, deviceLabel, destination, adb, onProgress);
    if (outcome.entryCount > 0) this.pruneOldSnapshots(deviceLabel);
    return outcome;
  }

  /** Держит не больше MAX_SNAPSHOTS_PER_DEVICE снапшотов на каждое устройство
   * -- см. snapshotsToPruneAfterTaking() в deviceSnapshotLogic.ts про то,
   * какие именно считаются лишними. Удаляет молча, остальные устройства не
   * трогает. */
  private pruneOldSnapshots(deviceLabel: string): void {
    const stale = snapshotsToPruneAfterTaking(this.list(), deviceLabel, MAX_SNAPSHOTS_PER_DEVICE);
    for (const snap of stale) {
      try {
        this.delete(snap.path);
      } catch {
        // Не критично -- максимум останется на один лишний файл больше положенного.
      }
    }
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
    assertPathWithinDirectory(snapshotPath, this.directory);
    fs.unlinkSync(snapshotPath);
  }
}
