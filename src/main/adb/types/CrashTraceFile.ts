// Порт Sources/AdbShell/Models/CrashTraceFile.swift

export type CrashTraceKind = 'anr' | 'tombstone';

export interface CrashTraceFile {
  path: string;
  name: string;
  kind: CrashTraceKind;
}
