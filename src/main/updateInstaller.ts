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
// Скачивание -- потоковое, через util/download.ts, с отчётом о прогрессе
// по мере получения байт (файл в десятки-сотни МБ иначе выглядит как
// зависшее "Скачивание…" без единого признака жизни, особенно на медленном
// интернете).

import { app, shell } from 'electron';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import AdmZip from 'adm-zip';
import { downloadWithProgress, DownloadProgress } from './util/download';

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

/** checksumUrl -- ссылка на опубликованный release.yml ассет
 * `<assetName>.sha256` (см. findChecksumAsset в updateChecker.ts),
 * undefined для релизов без него (обновление тогда идёт без сверки, как и
 * раньше). HTTPS защищает канал скачивания, но не защищает от
 * компрометации самого релиза (утёкший токен публикации, ошибка при
 * аплоаде) -- на Windows скачанный .exe запускается сразу без единого
 * подтверждения пользователя, так что сверка перед запуском не лишняя. */
export async function downloadAndPrepareUpdate(
  url: string,
  assetName: string,
  onProgress?: (progress: DownloadProgress) => void,
  checksumUrl?: string
): Promise<PreparedUpdate> {
  const destPath = path.join(downloadDir(), assetName);
  try {
    await downloadWithProgress(url, destPath, { timeoutMs: DOWNLOAD_TIMEOUT_MS, onProgress });
  } catch (error) {
    // Перебрасываем как UpdateInstallError -- вызывающий код (main.ts)
    // и раньше ожидал именно этот тип для сообщения об ошибке скачивания.
    throw new UpdateInstallError((error as Error).message);
  }

  if (checksumUrl) {
    await verifyChecksumOrThrow(destPath, checksumUrl);
  }

  if (assetName.endsWith('.exe')) {
    return { kind: 'run-installer', path: destPath };
  }

  if (assetName.endsWith('.AppImage')) {
    fs.chmodSync(destPath, 0o755);
    return { kind: 'reveal-appimage', path: destPath };
  }

  if (assetName.endsWith('.zip')) {
    const baseName = assetName.replace(/\.zip$/, '');
    // Случайный суффикс на каждую попытку скачивания -- убирает саму
    // возможность коллизии с папкой предыдущей попытки (уже открытой в
    // Finder, возможно ещё индексируемой Spotlight/iCloud).
    cleanupPreviousExtractions(baseName);
    const extractDir = path.join(downloadDir(), `${baseName}-${randomUUID().slice(0, 8)}`);
    // Реальный отчёт: "ENOENT... chmod .../app.asar" внутри распаковки --
    // воспроизводился даже с уникальной extractDir на каждую попытку (см.
    // выше), то есть дело не в гонке МЕЖДУ попытками, а в самой распаковке
    // ЭТОГО архива через adm-zip (чистый JS-парсер zip). macOS .app-бандлы
    // содержат symlink'и (Contents/Frameworks/*.framework/Versions/Current
    // и т.п.) -- adm-zip, в отличие от системных инструментов, не всегда
    // корректно переживает их порядок при распаковке, отсюда и ENOENT на
    // chmod уже вроде бы записанного файла. Заменено на `ditto` -- ровно
    // тот инструмент, который Apple официально рекомендует для распаковки
    // .zip именно с .app внутри (тот же, которым пользуется notarization
    // tooling/Xcode), см. extractZipToDirectory ниже. AdmZip оставлен
    // только для ЧТЕНИЯ списка записей (getEntries -- не пишет на диск),
    // чтобы узнать имя .app-папки внутри архива.
    await extractZipToDirectory(destPath, extractDir);
    const zip = new AdmZip(destPath);
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

/** Скачивает <assetName>.sha256 (обычный текстовый файл: голый hex-дайджест
 * или традиционный формат `sha256sum` -- "<hex>  <filename>"), сверяет с
 * фактическим sha256 скачанного файла. При несовпадении удаляет скачанный
 * файл и бросает -- не оставляет на диске файл, не прошедший проверку, и
 * не даёт installAndPrepareUpdate дойти до launchPreparedUpdate() (который
 * на Windows запускает .exe без единого подтверждения пользователя). */
async function verifyChecksumOrThrow(filePath: string, checksumUrl: string): Promise<void> {
  const expected = await fetchExpectedSha256(checksumUrl);
  const actual = await sha256OfFile(filePath);
  if (actual !== expected) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Не критично -- главное, что мы не продолжаем с этим файлом дальше.
    }
    throw new UpdateInstallError(
      'Скачанный файл обновления не прошёл проверку контрольной суммы -- возможно, повреждён при скачивании или подменён. Установка отменена.'
    );
  }
}

/** Разбирает содержимое ассета `<файл>.sha256` -- голый hex-дайджест или
 * традиционный вывод `sha256sum` вида "<hex>  <filename>" (первый
 * пробельно-отделённый токен покрывает оба случая). Вынесено в чистую
 * функцию отдельно от fetch -- сеть/Electron мокать неудобно, а разбор
 * стоит покрыть тестом (тот же принцип, что и у fdroidPackageUrl/
 * parseFDroidResponse в apkLibrary/FDroidUpdateChecker.ts). */
export function parseSha256Text(text: string): string {
  const hex = text.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new UpdateInstallError('Файл контрольной суммы обновления повреждён или имеет неожиданный формат');
  }
  return hex;
}

async function fetchExpectedSha256(checksumUrl: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(checksumUrl);
  } catch (error) {
    throw new UpdateInstallError(`Не удалось скачать контрольную сумму обновления: ${(error as Error).message}`);
  }
  if (!response.ok) {
    throw new UpdateInstallError(`Не удалось скачать контрольную сумму обновления (HTTP ${response.status})`);
  }
  return parseSha256Text(await response.text());
}

/** Потоково (не читая весь файл в память -- он может быть сотни МБ), как и
 * само скачивание в util/download.ts. */
function sha256OfFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/** Убирает распаковки предыдущих попыток обновления того же релиза
 * (`baseName-<uuid>`), оставшиеся от прошлых нажатий кнопки скачивания --
 * иначе на диске в "Загрузках" копился бы мусор при каждой повторной
 * попытке. Не трогает сам baseName без суффикса (на случай, если он
 * когда-то создавался старой версией без randomUUID) и не считается
 * критичным шагом -- ошибка здесь не должна мешать самому обновлению. */
function cleanupPreviousExtractions(baseName: string): void {
  const dir = downloadDir();
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === baseName || !entry.startsWith(`${baseName}-`)) continue;
    try {
      fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
    } catch {
      // Не критично -- максимум останется лишняя папка в Загрузках.
    }
  }
}

/** Распаковывает .zip в extractDir через системный `ditto -x -k` -- эта
 * ветка (assetName.endsWith('.zip')) в принципе достижима только на macOS
 * (Windows/Linux скачивают .exe/.AppImage, см. pickAssetForPlatform), так
 * что platform-проверка здесь не нужна. Одна повторная попытка на прочие
 * переходные сбои файловой системы (антивирус/Spotlight/iCloud ещё держат
 * только что созданный путь); AdmZip.extractAllTo -- последний резерв на
 * случай, если ditto почему-то недоступен (не должно случаться на
 * настоящем macOS, но не должно и блокировать обновление полностью). */
async function extractZipToDirectory(zipPath: string, extractDir: string): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      fs.mkdirSync(extractDir, { recursive: true });
      execFileSync('ditto', ['-x', '-k', zipPath, extractDir]);
      return;
    } catch (error) {
      if (attempt === 2) {
        try {
          fs.rmSync(extractDir, { recursive: true, force: true });
          new AdmZip(zipPath).extractAllTo(extractDir, true);
          return;
        } catch {
          throw error;
        }
      }
      try {
        fs.rmSync(extractDir, { recursive: true, force: true });
      } catch {
        // Не критично -- следующая попытка всё равно перезапишет.
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
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
