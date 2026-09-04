// Порт Sources/AdbShell/Services/IconService.swift — извлекает и кеширует
// реальные иконки приложений из APK через `aapt2 dump badging`: подтягивает
// APK с устройства (pm path + pull), узнаёт путь к иконке внутри архива,
// вытаскивает именно этот файл. Не поддерживается: adaptive icons без
// legacy PNG-фолбэка (путь — XML вроде res/mipmap-anydpi-v26/ic_launcher.xml,
// не растровая картинка) -- в этом случае просто нет иконки, плейсхолдер в UI.
//
// `/usr/bin/unzip -p` (macOS-only в оригинале) заменён на adm-zip
// (уже зависимость проекта, см. appBundles/AppBundleService.ts) --
// кросс-платформенно читает конкретный entry без распаковки всего архива.
//
// Дисковый кеш -- userData/IconCache (Electron не имеет универсального
// аналога ~/Library/Caches на всех платформах, в отличие от userData;
// в отличие от снапшотов, это не принципиально: иконки полностью
// регенерируемы, потеря кеша просто означает повторное извлечение).

import { app } from 'electron';
import AdmZip from 'adm-zip';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

import { AdbService } from '../adb/AdbService';
import { primaryApkPath } from '../adb/parsers/ApkPathParser';
import { parseIconPath } from '../adb/parsers/IconPathParser';
import { ApkLibraryService } from '../apkLibrary/ApkLibraryService';

const MAX_CONCURRENT = 3;

export class AppIconService {
  private attempted = new Set<string>();
  private activeCount = 0;
  private pendingQueue: (() => void)[] = [];

  private get cacheDir(): string {
    return path.join(app.getPath('userData'), 'IconCache');
  }

  private cachePath(packageName: string): string {
    return path.join(this.cacheDir, `${packageName}.png`);
  }

  /** Отдаёт кешированную иконку сразу (без обращения к устройству), либо
   * undefined если её ещё не пытались получить / получение не удалось. */
  cachedIcon(packageName: string): Buffer | undefined {
    try {
      return fs.readFileSync(this.cachePath(packageName));
    } catch {
      return undefined;
    }
  }

  /** Не больше одного обращения к устройству за сессию на пакет (успех или
   * неудача — attempted не сбрасывается) и не больше MAX_CONCURRENT
   * одновременных pull'ов целых APK. */
  async fetch(serial: string, packageName: string, adb: AdbService): Promise<Buffer | undefined> {
    const cached = this.cachedIcon(packageName);
    if (cached) return cached;
    if (this.attempted.has(packageName)) return undefined;
    this.attempted.add(packageName);

    return this.enqueue(() => this.fetchNow(serial, packageName, adb));
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    return new Promise((resolve) => {
      const run = (): void => {
        this.activeCount += 1;
        work()
          .then(resolve)
          .finally(() => {
            this.activeCount -= 1;
            const next = this.pendingQueue.shift();
            if (next) next();
          });
      };
      if (this.activeCount < MAX_CONCURRENT) run();
      else this.pendingQueue.push(run);
    });
  }

  private async fetchNow(serial: string, packageName: string, adb: AdbService): Promise<Buffer | undefined> {
    const aapt2 = ApkLibraryService.locateAapt2();
    if (!aapt2) return undefined;
    const tmpApk = path.join(os.tmpdir(), `adbshell-icon-${randomUUID()}.apk`);
    try {
      const paths = await adb.apkPaths(serial, packageName).catch(() => []);
      const remotePath = primaryApkPath(paths);
      if (!remotePath) return undefined;
      await adb.pull(serial, remotePath, tmpApk);

      const badging = await runCapturingStdout(aapt2, ['dump', 'badging', tmpApk]);
      const iconEntry = parseIconPath(badging);
      if (!iconEntry || iconEntry.toLowerCase().endsWith('.xml')) return undefined;

      const zip = new AdmZip(tmpApk);
      const data = zip.readFile(iconEntry);
      if (!data || data.length === 0) return undefined;

      await fsPromises.mkdir(this.cacheDir, { recursive: true });
      await fsPromises.writeFile(this.cachePath(packageName), data);
      return data;
    } catch {
      // Иконка необязательна для работы приложения -- молча оставляем плейсхолдер.
      return undefined;
    } finally {
      await fsPromises.rm(tmpApk, { force: true });
    }
  }
}

function runCapturingStdout(executable: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(executable, args, { windowsHide: true });
    } catch (error) {
      reject(error as Error);
      return;
    }
    let stdout = '';
    child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
    child.on('error', reject);
    child.on('close', () => resolve(stdout));
  });
}
