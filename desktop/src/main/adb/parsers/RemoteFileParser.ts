// Порт Sources/AdbShell/Services/RemoteFileParser.swift — парсинг вывода
// `adb shell ls -la <path>` (формат toybox/coreutils).

import { RemoteFile, joinRemotePath } from '../types/RemoteFile';

const LINE_REGEX =
  /^([bcdlpsD-][-rwxsStT]{9})\S*\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(.+)$/;

export function parseRemoteFiles(output: string, parentPath: string): RemoteFile[] {
  const results: RemoteFile[] = [];

  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('total ')) continue;

    const match = LINE_REGEX.exec(line);
    if (!match) continue;

    const permissions = match[1];
    const sizeString = match[5];
    const date = match[6];
    const time = match[7];
    let name = match[8];

    const isDirectory = permissions.startsWith('d');
    const isSymlink = permissions.startsWith('l');

    if (isSymlink) {
      const arrowIdx = name.indexOf(' -> ');
      if (arrowIdx !== -1) name = name.slice(0, arrowIdx);
    }
    if (name === '.' || name === '..') continue;

    const sizeBytes = Number.parseInt(sizeString, 10);
    results.push({
      name,
      path: joinRemotePath(parentPath, name),
      isDirectory,
      isSymlink,
      sizeBytes: Number.isNaN(sizeBytes) ? undefined : sizeBytes,
      permissions,
      modified: `${date} ${time}`,
    });
  }

  return results.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}
