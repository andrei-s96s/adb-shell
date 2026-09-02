// Порт Sources/AdbShell/Models/ApkFile.swift

export interface ApkFile {
  path: string;
  name: string;
  sizeBytes: number;
  /** Мс с эпохи (Date.getTime()) — сериализуется через IPC как обычное число. */
  modifiedMs: number;
}
