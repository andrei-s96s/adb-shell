// Порт DumpsysParser.parseVersionCodes(from:) из
// Sources/AdbShell/Services/DumpsysParser.swift — разбор ПОЛНОГО вывода
// `dumpsys package` (без имени конкретного пакета — весь список сразу,
// один вызов на всё устройство) на versionCode каждого пакета. Используется
// для массовой сверки установленных пакетов с F-Droid без отдельного
// dumpsys на каждый пакет.

export function parseVersionCodes(output: string): Record<string, number> {
  const result: Record<string, number> = {};
  let currentPackage: string | undefined;
  let recordedForCurrent = false;

  for (const rawLine of output.split('\n')) {
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('Package [')) {
      const openBracket = trimmed.indexOf('[');
      const closeBracket = trimmed.indexOf(']');
      if (openBracket !== -1 && closeBracket !== -1 && openBracket < closeBracket) {
        currentPackage = trimmed.slice(openBracket + 1, closeBracket);
        recordedForCurrent = false;
      }
      continue;
    }

    if (!currentPackage || recordedForCurrent) continue;
    const marker = 'versionCode=';
    const idx = trimmed.indexOf(marker);
    if (idx === -1) continue;
    const rest = trimmed.slice(idx + marker.length);
    const codeToken = rest.split(' ')[0];
    const code = Number.parseInt(codeToken, 10);
    if (!Number.isNaN(code)) {
      result[currentPackage] = code;
      recordedForCurrent = true;
    }
  }
  return result;
}
