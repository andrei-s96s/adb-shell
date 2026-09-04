// Порт Sources/AdbShell/Models/RunningProcess.swift

export interface RunningProcess {
  pid: number;
  ppid?: number;
  user: string;
  rssKB?: number;
  name: string;
}
