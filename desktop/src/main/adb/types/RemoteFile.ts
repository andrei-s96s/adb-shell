// Порт Sources/AdbShell/Models/RemoteFile.swift

export interface RemoteFile {
  name: string;
  path: string;
  isDirectory: boolean;
  isSymlink: boolean;
  sizeBytes?: number;
  permissions: string;
  modified?: string;
}

export function joinRemotePath(parent: string, name: string): string {
  return parent.endsWith('/') ? parent + name : parent + '/' + name;
}
