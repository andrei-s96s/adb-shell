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
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

import { ApkFile } from '../adb/types/ApkFile';
import { ApkManifestInfo } from '../adb/types/ApkManifestInfo';
import { parseApkBadging } from '../adb/parsers/ApkBadgingParser';
import { FDroidUpdateInfo, fdroidDownloadUrl } from '../adb/types/FDroidUpdateInfo';
import { checkFDroidUpdate } from './FDroidUpdateChecker';

const CONFIG_FILE = 'apk-library-config.json';

export class ApkLibraryService {
  private directory: string;

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
    try {
      const raw = fs.readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(raw) as { directory?: string };
      return typeof parsed.directory === 'string' && parsed.directory.length > 0 ? parsed.directory : undefined;
    } catch {
      return undefined;
    }
  }

  private saveDirectory(): void {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify({ directory: this.directory }));
    } catch {
      // Не критично — просто не переживёт перезапуск, каталог всё равно рабочий.
    }
  }

  getDirectory(): string {
    return this.directory;
  }

  setDirectory(dir: string): void {
    this.directory = dir;
    fs.mkdirSync(this.directory, { recursive: true });
    this.saveDirectory();
  }

  list(): ApkFile[] {
    let entries: string[];
    try {
      entries = fs.readdirSync(this.directory);
    } catch {
      return [];
    }
    const files = entries
      .filter((name) => name.toLowerCase().endsWith('.apk'))
      .map((name): ApkFile | undefined => {
        const fullPath = path.join(this.directory, name);
        try {
          const stat = fs.statSync(fullPath);
          return { path: fullPath, name, sizeBytes: stat.size, modifiedMs: stat.mtimeMs };
        } catch {
          return undefined;
        }
      })
      .filter((f): f is ApkFile => f !== undefined);
    return files.sort((a, b) => b.modifiedMs - a.modifiedMs);
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
    fs.unlinkSync(filePath);
  }

  revealInFileManager(): string {
    return this.directory;
  }

  /** Скачивает .apk по прямой ссылке в текущую библиотеку. Не проверяет
   * Content-Type (некоторые CI/artifact-серверы отдают его неправильно) —
   * полагается на то, что ссылка действительно отдаёт APK. */
  async downloadFromUrl(urlString: string, filename?: string): Promise<string> {
    let url: URL;
    try {
      url = new URL(urlString.trim());
    } catch {
      throw new Error('Некорректная ссылка');
    }
    const rawName = filename?.trim() || path.basename(url.pathname) || 'download.apk';
    const finalName = rawName.toLowerCase().endsWith('.apk') ? rawName : `${rawName}.apk`;
    const destination = path.join(this.directory, finalName);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} при скачивании`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(destination, buffer);
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
    const vendorDir = process.platform === 'win32' ? 'win' : 'mac';
    const devPath = path.join(__dirname, '..', '..', '..', 'vendor', vendorDir, exeName);
    if (fs.existsSync(devPath)) return devPath;
    return undefined;
  }

  /** Читает манифест локального .apk через aapt2 dump badging — без
   * установки на устройство. */
  static async inspect(apkPath: string): Promise<ApkManifestInfo> {
    const aapt2 = ApkLibraryService.locateAapt2();
    if (!aapt2) throw new Error('aapt2 не найден — сборка без вшитого бинарника');
    const output = await runCapturingStdout(aapt2, ['dump', 'badging', apkPath]);
    return parseApkBadging(output);
  }

  /** Проверяет обновления с F-Droid для всех файлов библиотеки — ключ
   * результата это ApkFile.path. Только обнаруживает: ничего не скачивает
   * без явного отдельного вызова downloadFDroidUpdate(). Если aapt2 не
   * вшит, тихо возвращает пустой результат (F-Droid-проверка недоступна,
   * но список файлов и обычная установка работают всё равно). */
  async checkFDroidUpdates(): Promise<Record<string, FDroidUpdateInfo>> {
    if (!ApkLibraryService.locateAapt2()) return {};
    const files = this.list();
    const results: Record<string, FDroidUpdateInfo> = {};
    const maxConcurrent = 4;
    let index = 0;
    const worker = async (): Promise<void> => {
      while (index < files.length) {
        const file = files[index++];
        try {
          const info = await ApkLibraryService.inspect(file.path);
          const versionCode = info.packageName && info.versionCode ? Number(info.versionCode) : undefined;
          if (!info.packageName || versionCode === undefined || Number.isNaN(versionCode)) continue;
          const update = await checkFDroidUpdate(info.packageName, versionCode);
          if (update) results[file.path] = update;
        } catch {
          // Файл без читаемого манифеста просто пропускается.
        }
      }
    };
    await Promise.all(Array.from({ length: maxConcurrent }, () => worker()));
    return results;
  }

  /** Скачивает более новую версию с F-Droid в библиотеку и удаляет старый
   * файл. Выполняется только по явному нажатию пользователя. */
  async downloadFDroidUpdate(file: ApkFile, update: FDroidUpdateInfo): Promise<string> {
    const destName = `${update.packageName}_${update.latestVersionCode}.apk`;
    const destination = path.join(this.directory, destName);
    const response = await fetch(fdroidDownloadUrl(update));
    if (!response.ok) throw new Error(`HTTP ${response.status} при скачивании обновления`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(destination, buffer);
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
