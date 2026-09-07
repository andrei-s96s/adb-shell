// Порт Sources/AdbShell/ViewModels/ApkLibraryViewModel.swift — локальный
// каталог, куда пользователь складывает .apk файлы (кнопкой "Добавить..."
// или скачиванием по ссылке). Показывает содержимое и умеет ставить любой
// файл на устройство — доступно и без подключённого устройства (сам список
// и проверка обновлений не требуют adb вообще, только установка). Путь к
// каталогу настраиваемый и сохраняется между запусками (в отличие от
// UserDefaults в Swift-версии — простой JSON-файл в userData Electron).
//
// В отличие от AdbService, этот модуль ЗАВИСИТ от electron (app.getPath) —
// его директория/установки на диск не тестируются node --test напрямую;
// чистая логика (разбор ответа F-Droid, разбор aapt2 badging) вынесена в
// отдельные протестированные функции (parseApkBadging, parseFDroidResponse).
//
// Сознательно НЕ перенесено из Swift-версии: тегирование файлов
// (ApkTagStore), drag-and-drop прямо в окно, полноценный "Инфо"-лист с
// правами приложения — самостоятельные, менее приоритетные куски; здесь
// сделан упор на то, что явно попросили: список без устройства + проверка
// обновлений.

import { app } from 'electron';
import AdmZip from 'adm-zip';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

import { ApkFile } from '../adb/types/ApkFile';
import { ApkManifestInfo } from '../adb/types/ApkManifestInfo';
import { AppIcon } from '../adb/types/AppIcon';
import { parseApkBadging } from '../adb/parsers/ApkBadgingParser';
import { parseIconPath } from '../adb/parsers/IconPathParser';
import { resolveAdaptiveIconFile } from '../adb/parsers/AdaptiveIconResolver';
import { FDroidUpdateInfo, fdroidDownloadUrl } from '../adb/types/FDroidUpdateInfo';
import { checkFDroidUpdate } from './FDroidUpdateChecker';
import { downloadWithProgress, DownloadProgress } from '../util/download';
import { assertPathWithinDirectory } from '../util/pathSafety';
import { mapWithConcurrency } from '../util/concurrency';
import { loadJsonStore, saveJsonStore } from '../util/jsonStore';
import { findOutdatedDuplicates, InspectedApkFile, OutdatedDuplicate } from './apkLibraryLogic';
import { findCertificateInEntries, ApkCertificateInfo } from './apkSignatureLogic';
import { ApkSignatureInfo } from '../adb/types/ApkSignatureInfo';
import { sha256OfFile } from '../util/sha256';

const CONFIG_FILE = 'apk-library-config.json';

export class ApkLibraryService {
  private directory: string;
  /** Кеш иконок на время жизни процесса, не на диске (в отличие от
   * AppIconService) -- локальный файл уже лежит на диске у пользователя,
   * извлечение не требует pull с устройства, так что нет того же повода
   * переживать повторный запуск aapt2 между запусками приложения. Ключ
   * включает mtime -- если пользователь заменит файл по тому же пути новой
   * версией apk, кеш не отдаст иконку от старой. */
  private iconCache = new Map<string, AppIcon>();
  /** Тот же принцип и тот же формат ключа (apkPath:mtime), что и у
   * iconCache выше, но для сырого текста `aapt2 dump badging` -- inspect()
   * (просмотр манифеста в UI) и extractIcon() (поиск пути иконки внутри
   * манифеста) раньше независимо перезапускали aapt2 на один и тот же
   * файл, каждый со своим отдельным spawn; checkFDroidUpdates() вдобавок
   * вызывает inspect() на КАЖДЫЙ файл библиотеки. */
  private badgingCache = new Map<string, string>();

  constructor() {
    this.directory = this.loadSavedDirectory() ?? path.join(app.getPath('documents'), 'AdbShell', 'APK');
    // Сконструирован на верхнем уровне main.ts, до app.whenReady() -- если
    // mkdirSync здесь бросит исключение (нет прав на Documents, каталог
    // недоступен из-за OneDrive-редиректа и т.п. на Windows), необработанное
    // синхронное исключение в конструкторе уронит ВЕСЬ процесс до открытия
    // хоть одного окна -- ровно то, что выглядит как "приложение не
    // открывается". list()/importFiles() уже переживают отсутствующий
    // каталог сами, так что здесь достаточно не дать ошибке всплыть.
    try {
      fs.mkdirSync(this.directory, { recursive: true });
    } catch {
      // Каталог останется недоступен -- library.list() и другие методы
      // уже обрабатывают эту ситуацию корректно (пустой список и т.д.).
    }
  }

  private get configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILE);
  }

  private loadSavedDirectory(): string | undefined {
    const parsed = loadJsonStore<{ directory?: string }>(this.configPath, (p) => !!p && typeof p === 'object', {});
    return typeof parsed.directory === 'string' && parsed.directory.length > 0 ? parsed.directory : undefined;
  }

  private saveDirectory(): void {
    saveJsonStore(this.configPath, { directory: this.directory });
  }

  getDirectory(): string {
    return this.directory;
  }

  setDirectory(dir: string): void {
    this.directory = dir;
    fs.mkdirSync(this.directory, { recursive: true });
    this.saveDirectory();
  }

  /** Асинхронно (fs/promises), не fs.readdirSync/statSync -- эта функция
   * вызывается на каждое открытие/обновление вкладки "Библиотека APK", а
   * раньше синхронно блокировала весь main-процесс (все IPC-хендлеры,
   * не только этой вкладки) на время сканирования папки, чувствительно
   * при большом числе файлов. stat() по файлам идёт без ограничения
   * параллелизма (в отличие от adb-вызовов/spawn -- это дешёвые локальные
   * syscall на метаданные, не сетевые/процессные операции, лимитировать
   * их нет повода). */
  async list(): Promise<ApkFile[]> {
    let entries: string[];
    try {
      entries = await fsPromises.readdir(this.directory);
    } catch {
      return [];
    }
    const apkNames = entries.filter((name) => name.toLowerCase().endsWith('.apk'));
    const files = await Promise.all(
      apkNames.map(async (name): Promise<ApkFile | undefined> => {
        const fullPath = path.join(this.directory, name);
        try {
          const stat = await fsPromises.stat(fullPath);
          return { path: fullPath, name, sizeBytes: stat.size, modifiedMs: stat.mtimeMs };
        } catch {
          return undefined;
        }
      })
    );
    return files.filter((f): f is ApkFile => f !== undefined).sort((a, b) => b.modifiedMs - a.modifiedMs);
  }

  /** Копирует выбранные файлы в библиотеку (перезаписывая одноимённые). */
  importFiles(sourcePaths: string[]): void {
    for (const source of sourcePaths) {
      if (path.extname(source).toLowerCase() !== '.apk') continue;
      const dest = path.join(this.directory, path.basename(source));
      if (path.resolve(dest) === path.resolve(source)) continue;
      fs.copyFileSync(source, dest);
    }
  }

  deleteFile(filePath: string): void {
    assertPathWithinDirectory(filePath, this.directory);
    fs.unlinkSync(filePath);
  }

  revealInFileManager(): string {
    return this.directory;
  }

  /** Скачивает .apk по прямой ссылке в текущую библиотеку. Не проверяет
   * Content-Type (некоторые CI/artifact-серверы отдают его неправильно) —
   * полагается на то, что ссылка действительно отдаёт APK. */
  async downloadFromUrl(urlString: string, filename?: string, onProgress?: (progress: DownloadProgress) => void): Promise<string> {
    let url: URL;
    try {
      url = new URL(urlString.trim());
    } catch {
      throw new Error('Некорректная ссылка');
    }
    const rawName = filename?.trim() || path.basename(url.pathname) || 'download.apk';
    const withExtension = rawName.toLowerCase().endsWith('.apk') ? rawName : `${rawName}.apk`;
    // basename -- filename в теории всегда вводит сам пользователь в этом
    // же диалоге, но на всякий случай не позволяем "../../.."  в нём
    // вырваться из директории библиотеки (тот же принцип, что и в
    // downloadFDroidUpdate ниже и importBundle в AppBundleService.ts).
    const finalName = path.basename(withExtension);
    const destination = path.join(this.directory, finalName);

    await downloadWithProgress(url.toString(), destination, { onProgress });
    return finalName;
  }

  /** Аналог IconService.locateAapt2() — вшитый бинарник (упаковка кладёт
   * его в resources), при разработке — vendor/<platform>/. */
  static locateAapt2(): string | undefined {
    const exeName = process.platform === 'win32' ? 'aapt2.exe' : 'aapt2';
    const resourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath;
    if (resourcesPath) {
      const bundled = path.join(resourcesPath, exeName);
      if (fs.existsSync(bundled)) return bundled;
    }
    const vendorDir = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
    const devPath = path.join(__dirname, '..', '..', '..', 'vendor', vendorDir, exeName);
    if (fs.existsSync(devPath)) return devPath;
    return undefined;
  }

  /** aapt2 dump badging, с кэшем по (apkPath, mtime) в badgingCache -- общий
   * для inspect() и extractIcon() ниже, которые раньше независимо
   * перезапускали aapt2 на один и тот же файл. */
  private async getBadging(apkPath: string): Promise<string> {
    const aapt2 = ApkLibraryService.locateAapt2();
    if (!aapt2) throw new Error('aapt2 не найден — сборка без вшитого бинарника');
    let mtimeMs = 0;
    try {
      mtimeMs = fs.statSync(apkPath).mtimeMs;
    } catch {
      // Файл мог исчезнуть между list() и этим вызовом -- не критично,
      // просто не закешируется осмысленно (mtimeMs остаётся 0).
    }
    const cacheKey = `${apkPath}:${mtimeMs}`;
    const cached = this.badgingCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const output = await runCapturingStdout(aapt2, ['dump', 'badging', apkPath]);
    this.badgingCache.set(cacheKey, output);
    return output;
  }

  /** Читает манифест локального .apk через aapt2 dump badging — без
   * установки на устройство. */
  async inspect(apkPath: string): Promise<ApkManifestInfo> {
    const output = await this.getBadging(apkPath);
    return parseApkBadging(output);
  }

  /** Иконка локального .apk -- та же логика, что и AppIconService (см. там
   * подробный комментарий про adaptive icons и resolveAdaptiveIconFile),
   * но без шага pull: файл уже на диске. */
  async extractIcon(apkPath: string): Promise<AppIcon | undefined> {
    const aapt2 = ApkLibraryService.locateAapt2();
    if (!aapt2) return undefined;

    let mtimeMs: number;
    try {
      mtimeMs = fs.statSync(apkPath).mtimeMs;
    } catch {
      return undefined;
    }
    const cacheKey = `${apkPath}:${mtimeMs}`;
    const cached = this.iconCache.get(cacheKey);
    if (cached) return cached;

    try {
      const badging = await this.getBadging(apkPath);
      const iconEntry = parseIconPath(badging);
      if (!iconEntry) return undefined;

      let zipEntryPath = iconEntry;
      let mimeType: AppIcon['mimeType'] = 'image/png';
      if (iconEntry.toLowerCase().endsWith('.xml')) {
        const resources = await runCapturingStdout(aapt2, ['dump', 'resources', apkPath]);
        const resolved = resolveAdaptiveIconFile(resources, iconEntry);
        if (!resolved) return undefined;
        zipEntryPath = resolved.zipEntryPath;
        mimeType = resolved.mimeType;
      } else if (iconEntry.toLowerCase().endsWith('.webp')) {
        mimeType = 'image/webp';
      }

      const zip = new AdmZip(apkPath);
      const data = zip.readFile(zipEntryPath);
      if (!data || data.length === 0) return undefined;

      const icon: AppIcon = { data, mimeType };
      this.iconCache.set(cacheKey, icon);
      return icon;
    } catch {
      // Иконка необязательна -- список файлов остаётся с плейсхолдером.
      return undefined;
    }
  }

  /** Проверяет обновления с F-Droid для всех файлов библиотеки — ключ
   * результата это ApkFile.path. Только обнаруживает: ничего не скачивает
   * без явного отдельного вызова downloadFDroidUpdate(). Если aapt2 не
   * вшит, тихо возвращает пустой результат (F-Droid-проверка недоступна,
   * но список файлов и обычная установка работают всё равно). */
  async checkFDroidUpdates(): Promise<Record<string, FDroidUpdateInfo>> {
    if (!ApkLibraryService.locateAapt2()) return {};
    const files = await this.list();
    const results: Record<string, FDroidUpdateInfo> = {};
    await mapWithConcurrency(files, 4, async (file) => {
      try {
        const info = await this.inspect(file.path);
        const versionCode = info.packageName && info.versionCode ? Number(info.versionCode) : undefined;
        if (!info.packageName || versionCode === undefined || Number.isNaN(versionCode)) return;
        const update = await checkFDroidUpdate(info.packageName, versionCode);
        if (update) results[file.path] = update;
      } catch {
        // Файл без читаемого манифеста просто пропускается.
      }
    });
    return results;
  }

  /** Находит файлы библиотеки, для которых в ней же есть файл того же
   * packageName с большим versionCode -- см. findOutdatedDuplicates() в
   * apkLibraryLogic.ts про то, что именно считается "устаревшим". Ничего
   * не удаляет сама, только сообщает; тот же worker-pool (mapWithConcurrency,
   * лимит 4), что и checkFDroidUpdates() выше, и та же кэшированная
   * getBadging()/inspect() -- если пользователь только что открывал
   * библиотеку или проверял F-Droid обновления, aapt2 по этим файлам уже
   * не перезапускается. */
  async findOutdatedDuplicates(): Promise<Record<string, OutdatedDuplicate>> {
    if (!ApkLibraryService.locateAapt2()) return {};
    const files = await this.list();
    const inspected = await mapWithConcurrency(files, 4, async (file): Promise<InspectedApkFile | undefined> => {
      try {
        const info = await this.inspect(file.path);
        const versionCode = info.packageName && info.versionCode ? Number(info.versionCode) : undefined;
        if (!info.packageName || versionCode === undefined || Number.isNaN(versionCode)) return undefined;
        return { path: file.path, name: file.name, packageName: info.packageName, versionCode };
      } catch {
        return undefined;
      }
    });
    return findOutdatedDuplicates(inspected.filter((f): f is InspectedApkFile => f !== undefined));
  }

  /** sha256 всего файла (надёжный сигнал всегда) + best-effort сертификат
   * подписи из JAR/v1-подписи (см. apkSignatureLogic.ts -- почему именно
   * best-effort, а не полноценный PKCS#7-разбор). Не кэшируется: в отличие
   * от иконки/badging, вызывается по явному запросу пользователя (кнопка в
   * карточке "Инфо"), а не на каждую строку списка библиотеки. */
  async getSignatureInfo(apkPath: string): Promise<ApkSignatureInfo> {
    const sha256 = await sha256OfFile(apkPath);
    let certificate: ApkCertificateInfo | undefined;
    try {
      const zip = new AdmZip(apkPath);
      const entries = zip
        .getEntries()
        .filter((entry) => /^META-INF\/[^/]+\.(RSA|DSA|EC)$/i.test(entry.entryName))
        .map((entry) => entry.getData());
      certificate = findCertificateInEntries(entries);
    } catch {
      // Файл может быть повреждён или не быть валидным zip вовсе -- sha256
      // выше уже посчитан и остаётся единственным, но надёжным сигналом.
    }
    return { sha256, certificate };
  }

  /** Скачивает более новую версию с F-Droid в библиотеку и удаляет старый
   * файл. Выполняется только по явному нажатию пользователя. Потоково, как
   * и downloadFromUrl() выше -- через тот же downloadWithProgress(), а не
   * fetch().arrayBuffer() целиком в память: F-Droid отдаёт обычные APK,
   * которые могут быть по сотне МБ (игры, приложения с большим количеством
   * встроенных ассетов), а сборка всего файла в памяти перед записью на
   * диск не нужна ни для чего, кроме лишнего пика памяти. */
  async downloadFDroidUpdate(file: ApkFile, update: FDroidUpdateInfo, onProgress?: (progress: DownloadProgress) => void): Promise<string> {
    // basename -- update.packageName приходит из JSON-ответа F-Droid API
    // (см. FDroidUpdateChecker.ts), т.е. это сетевые данные, а не то, что
    // приложение само проверило/сгенерировало. Без этого скомпрометированный
    // сервер/MITM мог бы прислать packageName вроде "../../../../любой/файл"
    // и указать, куда именно на диске пользователя писать -- ровно тот же
    // класс проблемы, что и в importBundle (AppBundleService.ts).
    const destName = path.basename(`${update.packageName}_${update.latestVersionCode}.apk`);
    const destination = path.join(this.directory, destName);
    await downloadWithProgress(fdroidDownloadUrl(update), destination, { onProgress });
    if (path.resolve(destination) !== path.resolve(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch {
        // Старый файл мог быть уже удалён вручную — не критично.
      }
    }
    return destName;
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
