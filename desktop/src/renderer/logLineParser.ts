// Копия main/adb/parsers/LogLineParser.ts для рендерера — см. комментарий в
// api.ts про то, почему renderer не импортирует файлы с рантайм-кодом из
// main/adb/** напрямую (ломает CommonJS-сборку main при пере-компиляции
// под ES-модули). Логика разбора строк logcat приходит из main как готовый
// текст (IPC-событие), поэтому парсить их и на стороне renderer тоже нужно
// — для подсветки по уровню и фильтрации без похода обратно в main.

import type { LogLevel, LogLine } from './api.js';

function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t';
}

function levelFromLetter(letter: string): LogLevel | undefined {
  switch (letter) {
    case 'V':
      return 0;
    case 'D':
      return 1;
    case 'I':
      return 2;
    case 'W':
      return 3;
    case 'E':
      return 4;
    case 'F':
      return 5;
    default:
      return undefined;
  }
}

export function levelLabel(level: LogLevel): string {
  return ['V', 'D', 'I', 'W', 'E', 'F'][level] ?? '?';
}

export function parseLogLine(rawLine: string): LogLine | null {
  const trimmed = rawLine.trim();
  if (trimmed.length === 0) return null;

  const fallback = (): LogLine => ({
    raw: trimmed,
    timestamp: undefined,
    pid: undefined,
    tid: undefined,
    level: 2,
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
  const level = levelFromLetter(levelToken);
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
