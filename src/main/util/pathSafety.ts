// Защита от path traversal там, где путь к файлу на диске приходит извне
// (из renderer через IPC) и ведёт к fs.unlinkSync/аналогичной необратимой
// операции. Тот же принцип, что уже применён рядом через path.basename() в
// ApkLibraryService.downloadFromUrl/downloadFDroidUpdate и в
// AppBundleService.importBundle — но там он закрывает попадание "../../.."
// в имя файла ДО сборки пути; здесь же входной путь уже собран целиком
// (пришёл с renderer как есть), так что нужна проверка после разрешения
// пути, а не до.

import * as path from 'node:path';

/** true, если resolved-путь target лежит внутри resolved-директории
 * directory (сам directory включительно не считается "внутри себя же" по
 * границе, но файлы и вложенные папки — да). */
export function isPathWithinDirectory(target: string, directory: string): boolean {
  const resolvedDir = path.resolve(directory);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget === resolvedDir || resolvedTarget.startsWith(resolvedDir + path.sep);
}

/** Бросает, если target не лежит внутри directory — использовать перед
 * любой необратимой файловой операцией (unlink и т.п.) над путём,
 * пришедшим с renderer по IPC. */
export function assertPathWithinDirectory(target: string, directory: string): void {
  if (!isPathWithinDirectory(target, directory)) {
    throw new Error('Путь вне ожидаемой директории');
  }
}
