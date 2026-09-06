// Общий потоковый загрузчик -- раньше и updateInstaller.ts, и
// ApkLibraryService.downloadFromUrl/downloadFDroidUpdate скачивали файл
// ЦЕЛИКОМ в память через response.arrayBuffer() и только потом одним
// writeFile писали на диск: ни намёка на прогресс (кнопка застревала на
// "Скачивание…" без процента на файле в сотни МБ, как апдейт macOS), и
// лишний пик памяти на размер всего файла. Здесь -- response.body как поток,
// пишем чанками сразу в файл и сообщаем о каждом полученном куске через
// onProgress, вызывающая сторона решает, как это показать (или не
// показывать вовсе, если onProgress не передан).

import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';

export class DownloadError extends Error {}

export interface DownloadProgress {
  receivedBytes: number;
  /** undefined -- сервер не прислал Content-Length (бывает у некоторых
   * CI/artifact-раздающих серверов) -- вызывающая сторона показывает
   * только скачанный объём, без процента, а не врёт про 0%/100%. */
  totalBytes?: number;
}

export interface DownloadOptions {
  timeoutMs?: number;
  onProgress?: (progress: DownloadProgress) => void;
}

/** Скачивает url в destPath. Таймаут (если задан) укрывает ВЕСЬ жизненный
 * цикл запроса -- и ожидание заголовков, и чтение тела потоком до конца, а
 * не только `await fetch()` (та же ошибка, что уже когда-то была поймана и
 * исправлена в updateInstaller.ts -- fetch() резолвится на заголовках, не
 * на полном теле). */
export async function downloadWithProgress(url: string, destPath: string, options: DownloadOptions = {}): Promise<void> {
  const controller = new AbortController();
  const timer = options.timeoutMs ? setTimeout(() => controller.abort(), options.timeoutMs) : undefined;
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new DownloadError(`HTTP ${response.status} при скачивании`);
    }
    const totalHeader = response.headers.get('content-length');
    const totalBytes = totalHeader && Number(totalHeader) > 0 ? Number(totalHeader) : undefined;

    await fsPromises.mkdir(path.dirname(destPath), { recursive: true });
    const fileHandle = await fsPromises.open(destPath, 'w');
    try {
      let receivedBytes = 0;
      const body = response.body;
      if (body) {
        const reader = (body as ReadableStream<Uint8Array>).getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength > 0) {
            await fileHandle.write(value);
            receivedBytes += value.byteLength;
            options.onProgress?.({ receivedBytes, totalBytes });
          }
        }
      } else {
        // На случай окружения, где response.body недоступен потоком --
        // скачивание всё равно должно завершиться, просто без промежуточного
        // прогресса (единственный отчёт -- по завершении).
        const buffer = Buffer.from(await response.arrayBuffer());
        await fileHandle.write(buffer);
        receivedBytes = buffer.length;
        options.onProgress?.({ receivedBytes, totalBytes });
      }
    } finally {
      await fileHandle.close();
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new DownloadError('Скачивание заняло слишком много времени -- проверьте соединение и попробуйте ещё раз');
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
