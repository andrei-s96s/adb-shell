// Порт Sources/AdbShell/Services/ScreenMirrorService.swift — зеркалирование
// экрана устройства через scrcpy (https://github.com/Genymobile/scrcpy,
// Apache-2.0), вшитый в приложение (см. scripts/fetch-scrcpy.js), как и adb.
// Полноценный live-видеопоток с вводом мыши/клавиатуры — отдельный движок,
// который scrcpy уже решает надёжно и открыто; переизобретать его смысла
// нет. Здесь только находим бинарник и запускаем его как внешний процесс —
// своё окно scrcpy рисует сам.

import { spawn, ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { computeGridLayout, Rect } from './mirrorGridLayout';

/** Имя папки в vendor/ для текущей платформы -- 3 варианта, а не 2 (раньше
 * было "win32 ? 'win' : 'mac'", молча ломавшееся на Linux, где искало
 * бинарники в vendor/mac/). */
function vendorDirName(): 'win' | 'mac' | 'linux' {
  if (process.platform === 'win32') return 'win';
  if (process.platform === 'darwin') return 'mac';
  return 'linux';
}

export class MirrorError extends Error {}

export interface LaunchOptions {
  windowFrame?: Rect;
  recordPath?: string;
}

export class ScreenMirrorService {
  private processes = new Map<string, ChildProcess>();

  /** 1) вшитый в приложение бинарник (build.mac/win/linux.extraResources в
   * package.json кладёт его в resources), 2) vendor/<platform>/ для
   * разработки (npm run fetch:... не через electron-builder), 3) на macOS/
   * Linux — системный scrcpy (brew install scrcpy / из пакетного менеджера
   * дистрибутива), для симметрии с оригиналом (свой adb мы точно так же
   * сознательно не вшиваем на этих двух платформах — см. fetch-scrcpy.js). */
  static locateScrcpy(): string | undefined {
    const exeName = process.platform === 'win32' ? 'scrcpy.exe' : 'scrcpy';
    const resourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath;
    if (resourcesPath) {
      const bundled = path.join(resourcesPath, exeName);
      if (fs.existsSync(bundled)) return bundled;
    }
    const vendorDir = vendorDirName();
    const devPath = path.join(__dirname, '..', '..', '..', 'vendor', vendorDir, exeName);
    if (fs.existsSync(devPath)) return devPath;
    if (process.platform === 'darwin') {
      for (const candidate of ['/opt/homebrew/bin/scrcpy', '/usr/local/bin/scrcpy', '/opt/local/bin/scrcpy']) {
        if (fs.existsSync(candidate)) return candidate;
      }
    }
    if (process.platform === 'linux') {
      for (const candidate of ['/usr/bin/scrcpy', '/usr/local/bin/scrcpy']) {
        if (fs.existsSync(candidate)) return candidate;
      }
    }
    return undefined;
  }

  /** Путь к вшитому scrcpy-server (для SCRCPY_SERVER_PATH). Если scrcpy
   * системный — undefined, он сам найдёт свой server рядом с собой. */
  static locateBundledServer(): string | undefined {
    const resourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath;
    if (resourcesPath) {
      const bundled = path.join(resourcesPath, 'scrcpy-server');
      if (fs.existsSync(bundled)) return bundled;
    }
    const devPath = path.join(__dirname, '..', '..', '..', 'vendor', vendorDirName(), 'scrcpy-server');
    if (fs.existsSync(devPath)) return devPath;
    return undefined;
  }

  isAvailable(): boolean {
    return ScreenMirrorService.locateScrcpy() !== undefined;
  }

  isRunning(serial: string): boolean {
    return this.processes.has(serial);
  }

  runningSerials(): string[] {
    return [...this.processes.keys()];
  }

  /** Запускает `scrcpy -s <serial>`, указывая ему на уже вшитый adb (ADB=)
   * и вшитый scrcpy-server (SCRCPY_SERVER_PATH=). Если для этого serial уже
   * есть запущенный процесс — не открывает второе окно поверх него.
   * onExit вызывается при завершении процесса (сняли зеркалирование), в т.ч.
   * если пользователь просто закрыл окно scrcpy сам. */
  launch(serial: string, adbPath: string, options: LaunchOptions, onExit: (serial: string) => void): void {
    if (this.processes.has(serial)) return;
    const scrcpyPath = ScreenMirrorService.locateScrcpy();
    if (!scrcpyPath) throw new MirrorError('scrcpy не найден');

    const args = ['-s', serial, '--window-title', serial];
    if (options.recordPath) args.push('--record', options.recordPath);
    if (options.windowFrame) {
      const { x, y, width, height } = options.windowFrame;
      args.push('--window-x', String(x), '--window-y', String(y), '--window-width', String(width), '--window-height', String(height));
    }

    const env: NodeJS.ProcessEnv = { ...process.env, ADB: adbPath };
    const serverPath = ScreenMirrorService.locateBundledServer();
    if (serverPath) env.SCRCPY_SERVER_PATH = serverPath;

    let child: ChildProcess;
    try {
      child = spawn(scrcpyPath, args, { env, windowsHide: false });
    } catch (error) {
      throw new MirrorError(`Не удалось запустить scrcpy: ${(error as Error).message}`);
    }
    this.processes.set(serial, child);
    const cleanup = (): void => {
      this.processes.delete(serial);
      onExit(serial);
    };
    child.on('exit', cleanup);
    child.on('error', cleanup);
  }

  /** Запускает scrcpy для каждого устройства и раскладывает их окна плиткой
   * по видимой области экрана (screenArea передаётся вызывающей стороной --
   * main.ts берёт его из Electron `screen`). Устройства, для которых
   * зеркалирование уже идёт, пропускаются; ошибка запуска одного устройства
   * не должна блокировать остальные (best-effort, как и в оригинале). */
  launchGrid(serials: string[], adbPath: string, screenArea: Rect, onExit: (serial: string) => void): void {
    const targets = serials.filter((s) => !this.isRunning(s));
    if (targets.length === 0) return;
    const rects = computeGridLayout(targets.length, screenArea);
    targets.forEach((serial, index) => {
      try {
        this.launch(serial, adbPath, { windowFrame: rects[index] }, onExit);
      } catch {
        // Best-effort -- одно устройство не смогло, остальные всё равно пробуем.
      }
    });
  }

  stopAll(): void {
    for (const child of this.processes.values()) child.kill();
    this.processes.clear();
  }
}
