// Порт parseListing(_:dir:kind:) из Sources/AdbShell/Services/ADBService.swift
// — разбор `ls -1` вывода для /data/anr/ и /data/tombstones/.

import { CrashTraceFile, CrashTraceKind } from '../types/CrashTraceFile';

export function parseCrashTraceListing(stdout: string, dir: string, kind: CrashTraceKind): CrashTraceFile[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== '.' && line !== '..')
    .map((name) => ({ path: dir + name, name, kind }));
}
