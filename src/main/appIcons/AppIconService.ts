// Порт Sources/AdbShell/Services/IconService.swift — извлекает и кеширует
// реальные иконки приложений из APK через `aapt2 dump badging`: подтягивает
// APK с устройства (pm path + pull), узнаёт путь к иконке внутри архива,
// вытаскивает именно этот файл.
//
// adaptive icons (путь из badging — XML вроде
// res/mipmap-anydpi-v26/ic_launcher.xml, не растровая картинка) — это
// БОЛЬШИНСТВО реальных приложений (все, что собраны под targetSdk 26+,
// то есть фактически всё, что публикуется в Google Play с 2018 года).
// Раньше в этом случае иконки просто не было -- проверено на реальных APK
// (Яндекс.Навигатор, LocalSend, HUD Speed из ~/apk) -- 3 из 4 отдавали XML,
// плейсхолдер был бы у подавляющего большинства установленных приложений,
// не у редкого края. resolveAdaptiveIconFile() (AdaptiveIconResolver.ts)
// смотрит `aapt2 dump resources` и находит растровый (PNG/WEBP) вариант
// того же ресурса на другой плотности/API — см. комментарий и тесты там
// про оба встретившихся реальных случая (растровый вариант в том же
// блоке; ссылка "()" по умолчанию на другой ресурс).
//
// `/usr/bin/unzip -p` (macOS-only в оригинале) заменён на adm-zip
// (уже зависимость проекта, см. appBundles/AppBundleService.ts) --
// кросс-платформенно читает конкретный entry без распаковки всего архива.
//
// Дисковый кеш -- userData/IconCache (Electron не имеет универсального
// аналога ~/Library/Caches на всех платформах, в отличие от userData;
// в отличие от снапшотов, это не принципиально: иконки полностью
// регенерируемы, потеря кеша просто означает повторное извлечение).
// Расширение кеш-файла отражает реальный MIME (.png/.webp) — раньше кеш
// был жёстко .png, что было бы неверно для WEBP-иконок (сами байты не
// PNG, простое переименование расширения их не конвертирует).

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
import { resolveAdaptiveIconFile } from '../adb/parsers/AdaptiveIconResolver';
import { AppIcon } from '../adb/types/AppIcon';
import { ApkLibraryService } from '../apkLibrary/ApkLibraryService';

const MAX_CONCURRENT = 3;

function extensionFor(mimeType: AppIcon['mimeType']): string {
  return mimeType === 'image/webp' ? 'webp' : 'png';
}

export class AppIconService {
  private attempted = new Set<string>();
  private activeCount = 0;
  private pendingQueue: (() => void)[] = [];

  private get cacheDir(): string {
    return path.join(app.getPath('userData'), 'IconCache');
  }

  private cachePath(packageName: string, extension: string): string {
    return path.join(this.cacheDir, `${packageName}.${extension}`);
  }

  /** Отдаёт кешированную иконку сразу (без обращения к устройству), либо
   * undefined если её ещё не пытались получить / получение не удалось.
   * Пробует оба возможных расширения -- на диске мог остаться кеш от
   * прошлой версии (см. комментарий вверху файла про смену .png на
   * MIME-based). */
  cachedIcon(packageName: string): AppIcon | undefined {
    for (const mimeType of ['image/png', 'image/webp'] as const) {
      try {
        return { data: fs.readFileSync(this.cachePath(packageName, extensionFor(mimeType))), mimeType };
      } catch {
        continue;
      }
    }
    return undefined;
  }

  /** Не больше одного обращения к устройству за сессию на пакет (успех или
   * неудача — attempted не сбрасывается) и не больше MAX_CONCURRENT
   * одновременных pull'ов целых APK. */
  async fetch(serial: string, packageName: string, adb: AdbService): Promise<AppIcon | undefined> {
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

  private async fetchNow(serial: string, packageName: string, adb: AdbService): Promise<AppIcon | undefined> {
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
      if (!iconEntry) return undefined;

      let zipEntryPath = iconEntry;
      let mimeType: AppIcon['mimeType'] = 'image/png';
      if (iconEntry.toLowerCase().endsWith('.xml')) {
        const resources = await runCapturingStdout(aapt2, ['dump', 'resources', tmpApk]);
        const resolved = resolveAdaptiveIconFile(resources, iconEntry);
        if (!resolved) return undefined;
        zipEntryPath = resolved.zipEntryPath;
        mimeType = resolved.mimeType;
      } else if (iconEntry.toLowerCase().endsWith('.webp')) {
        mimeType = 'image/webp';
      }

      const zip = new AdmZip(tmpApk);
      const data = zip.readFile(zipEntryPath);
      if (!data || data.length === 0) return undefined;

      await fsPromises.mkdir(this.cacheDir, { recursive: true });
      await fsPromises.writeFile(this.cachePath(packageName, extensionFor(mimeType)), data);
      return { data, mimeType };
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
