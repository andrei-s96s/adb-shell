// Общая load/save-логика для простых JSON-сторов в userData/*.json --
// device-nicknames, pinned-devices, connection-profiles, macros,
// intent-presets, apk-tags, shell-history, app-settings: у каждого было
// дословно продублировано чтение (readFileSync+JSON.parse с try/catch на
// фолбэк-значение) и запись (mkdirSync+writeFileSync).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

/** isValid проверяет разобранный JSON перед тем, как довериться ему как T
 * (плоский Array.isArray(...) для списков, typeof === 'object' для
 * словарей/объекта настроек) -- на отсутствующем файле, повреждённом JSON
 * или неожиданной форме тихо возвращает fallback, ничего не бросая: та же
 * семантика, что была в каждом сторе по отдельности ("не критично — просто
 * не переживёт перезапуск"). */
export function loadJsonStore<T>(configPath: string, isValid: (parsed: unknown) => boolean, fallback: T): T {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return isValid(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Пишет data в configPath атомарно: во временный файл рядом, затем
 * fs.renameSync поверх настоящего пути. Простой writeFileSync прямо в
 * целевой файл мог оставить наполовину записанный JSON, если приложение
 * упадёт/потеряет питание посреди записи -- на следующем запуске
 * loadJsonStore() поймал бы SyntaxError от JSON.parse на обрезанном файле
 * и молча вернул fallback, то есть тихая потеря всех никнеймов/пинов/
 * макросов/профилей и т.д. rename на той же файловой системе атомарен
 * (POSIX rename(2); на Windows -- fs.renameSync через MoveFileEx), так что
 * на диске в любой момент лежит либо старая, либо новая полная версия
 * файла, никогда обрезанная середина записи. */
export function saveJsonStore(configPath: string, data: unknown): void {
  try {
    const dir = path.dirname(configPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = path.join(dir, `.${path.basename(configPath)}.${randomUUID().slice(0, 8)}.tmp`);
    fs.writeFileSync(tmpPath, JSON.stringify(data));
    fs.renameSync(tmpPath, configPath);
  } catch {
    // Не критично — просто не переживёт перезапуск.
  }
}
