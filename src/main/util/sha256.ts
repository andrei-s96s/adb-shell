// Потоковый sha256 файла -- не читает файл целиком в память (он может быть
// сотни МБ). Тот же приём, что уже применяется в updateInstaller.ts для
// сверки скачанного обновления с контрольной суммой релиза; вынесен сюда как
// отдельный переиспользуемый util, а не скопирован повторно, для нового
// вызывающего кода (проверка подписи APK).

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';

export function sha256OfFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
