// Порт LogLine.parse(_:) из Sources/AdbShell/Models/LogLine.swift — разбор
// строки `adb logcat -v threadtime`:
// "08-23 23:10:15.123  1234  1234 D ActivityManager: Some message"
// Строки, не подходящие под формат (заголовки буфера и т.п.), становятся
// обычным info-логом целиком в message — так поток не теряет данные.

import { LogLevel, LogLine, logLevelFromLetter } from '../types/LogLine';

function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t';
}

export function parseLogLine(rawLine: string): LogLine | null {
  const trimmed = rawLine.trim();
  if (trimmed.length === 0) return null;

  const fallback = (): LogLine => ({
    raw: trimmed,
    timestamp: undefined,
    pid: undefined,
    tid: undefined,
    level: LogLevel.Info,
    tag: undefined,
    message: trimmed,
  });

  let i = 0;
  function scanToken(): string | undefined {
    const start = i;
    while (i < trimmed.length && !isSpace(trimmed[i])) i++;
    if (i === start) return undefined;
    return trimmed.slice(start, i);
  }
  function skipSpaces(): void {
    while (i < trimmed.length && isSpace(trimmed[i])) i++;
  }

  const datePart = scanToken();
  if (datePart === undefined) return fallback();
  skipSpaces();
  const timePart = scanToken();
  if (timePart === undefined || !datePart.includes('-') || !timePart.includes(':')) return fallback();

  skipSpaces();
  const pid = scanToken();
  if (pid === undefined) return fallback();
  skipSpaces();
  const tid = scanToken();
  if (tid === undefined) return fallback();
  skipSpaces();
  const levelToken = scanToken();
  if (levelToken === undefined || levelToken.length !== 1) return fallback();
  const level = logLevelFromLetter(levelToken);
  if (level === undefined) return fallback();
  skipSpaces();

  const rest = trimmed.slice(i);
  let tag: string | undefined;
  let message = rest;
  const colonIdx = rest.indexOf(': ');
  if (colonIdx !== -1) {
    tag = rest.slice(0, colonIdx).trim();
    message = rest.slice(colonIdx + 2);
  }

  return {
    raw: trimmed,
    timestamp: `${datePart} ${timePart}`,
    pid,
    tid,
    level,
    tag,
    message,
  };
}
