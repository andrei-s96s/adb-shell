// Порт Sources/AdbShell/Models/LogLine.swift

export enum LogLevel {
  Verbose = 0,
  Debug = 1,
  Info = 2,
  Warn = 3,
  Error = 4,
  Fatal = 5,
}

export function logLevelFromLetter(letter: string): LogLevel | undefined {
  switch (letter) {
    case 'V':
      return LogLevel.Verbose;
    case 'D':
      return LogLevel.Debug;
    case 'I':
      return LogLevel.Info;
    case 'W':
      return LogLevel.Warn;
    case 'E':
      return LogLevel.Error;
    case 'F':
      return LogLevel.Fatal;
    default:
      return undefined;
  }
}

export function logLevelLabel(level: LogLevel): string {
  return ['V', 'D', 'I', 'W', 'E', 'F'][level] ?? '?';
}

export interface LogLine {
  raw: string;
  timestamp?: string;
  pid?: string;
  tid?: string;
  level: LogLevel;
  tag?: string;
  message: string;
}
