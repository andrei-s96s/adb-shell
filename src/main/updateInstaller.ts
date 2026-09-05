// Скачивание и подготовка выбранного релиз-ассета к установке — средний
// вариант между "просто уведомление со ссылкой" (что было раньше, см.
// updateChecker.ts) и полноценным электрон-апдейтером (что ненадёжно без
// платного сертификата, см. комментарий там же). Не подменяет запущенное
// приложение "по-тихому": скачивает нужный под текущую платформу файл, а
// дальше по платформе -- Windows: сразу запускает скачанный .exe-
// установщик (SmartScreen всё равно один раз предупредит про неизвестного
// издателя, это не в нашей власти без сертификата); macOS: распаковывает
// .zip и показывает готовый .app в Finder, сняв карантин, чтобы двойной
// клик сработал сразу, без "повреждён и не может быть открыт" (тот же повод,
// что уже объяснён в afterSign.js); Linux: делает AppImage исполняемым и
// показывает в файловом менеджере. Пользователь по-прежнему сам делает
// финальный шаг -- но не должен идти в браузер и искать нужный файл под
// свою ОС вручную.
//
// Скачивание -- целиком в память и один writeFile, без потокового прогресса
// (тот же приём, что уже используется для скачивания APK по ссылке, см.
// ApkLibraryService.downloadFromUrl -- тот же порядок величины файлов,
// то же "Скачивание…" без процента в UI).

import { app, shell } from 'electron';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import AdmZip from 'adm-zip';

export class UpdateInstallError extends Error {}

export type PreparedUpdateKind = 'run-installer' | 'reveal-app' | 'reveal-appimage';

export interface PreparedUpdate {
  kind: PreparedUpdateKind;
  path: string;
}

/** Каталог "Загрузки" пользователя, а не userData/temp -- так скачанный
 * файл лежит там же, где пользователь и так ожидает видеть скачанное, и
 * никуда не теряется, если он решит не ставить обновление сразу. */
function downloadDir(): string {
  return app.getPath('downloads');
}

// Инсталляторы -- десятки-сотни МБ (вшитые adb/aapt2/scrcpy), а не пара
// килобайт метаданных релиза (там же, в checkForUpdate(), таймаут 10с) --
// без отдельного, более щедрого таймаута зависшее соединение оставило бы
// кнопку в состоянии "Скачивание…" бесконечно, без единого шанса на ошибку
// и повторную попытку.
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    // fetch() резолвится, как только пришли заголовки -- таймер должен
    // оставаться активным и через arrayBuffer() тоже (собственно скачивание
    // тела, самая долгая часть на файле в десятки-сотни МБ), поэтому весь
    // блок в одном try -- один clearTimeout в finally после ВСЕГО, а не
    // сразу после await fetch(), как было в первой версии этого фикса
    // (защищала бы только быстрое установление соединения, не сам трансфер).
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new UpdateInstallError(`Не удалось скачать обновление: HTTP ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await fsPromises.mkdir(path.dirname(destPath), { recursive: true });
    await fsPromises.writeFile(destPath, buffer);
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new UpdateInstallError('Скачивание обновления заняло слишком много времени -- проверьте соединение и попробуйте ещё раз');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function downloadAndPrepareUpdate(url: string, assetName: string): Promise<PreparedUpdate> {
  const destPath = path.join(downloadDir(), assetName);
  await downloadToFile(url, destPath);

  if (assetName.endsWith('.exe')) {
    return { kind: 'run-installer', path: destPath };
  }

  if (assetName.endsWith('.AppImage')) {
    fs.chmodSync(destPath, 0o755);
    return { kind: 'reveal-appimage', path: destPath };
  }

  if (assetName.endsWith('.zip')) {
    const extractDir = path.join(downloadDir(), assetName.replace(/\.zip$/, ''));
    const zip = new AdmZip(destPath);
    zip.extractAllTo(extractDir, true);
    const topLevelDirs = new Set(zip.getEntries().map((e) => e.entryName.split('/')[0]));
    const appName = [...topLevelDirs].find((name) => name.endsWith('.app'));
    if (!appName) throw new UpdateInstallError('В скачанном архиве не найдено приложение (.app)');
    const appPath = path.join(extractDir, appName);

    if (process.platform === 'darwin') {
      try {
        // Снимает com.apple.quarantine с распакованного .app -- без этого
        // Gatekeeper показал бы "повреждён и не может быть открыт" при
        // первом запуске из Finder (тот же сценарий, что уже разобран в
        // afterSign.js для собранного релиза, только здесь источник карантина
        // -- сам факт скачивания .zip через fetch, а не браузер).
        execFileSync('xattr', ['-dr', 'com.apple.quarantine', appPath]);
      } catch {
        // Не критично -- если xattr недоступен/не сработал, пользователь
        // всё равно сможет открыть через правый клик -> "Открыть".
      }
    }
    return { kind: 'reveal-app', path: appPath };
  }

  throw new UpdateInstallError(`Неизвестный тип файла обновления: ${assetName}`);
}

/** Финальный шаг, который пользователь и так делает при обычной ручной
 * установке -- просто без похода в браузер за файлом до этого. */
export async function launchPreparedUpdate(prepared: PreparedUpdate): Promise<void> {
  if (prepared.kind === 'run-installer') {
    const error = await shell.openPath(prepared.path);
    if (error) throw new UpdateInstallError(error);
    return;
  }
  shell.showItemInFolder(prepared.path);
}
