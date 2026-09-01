// Порт Sources/AdbShell/Services/PortForwardParser.swift — парсинг вывода
// `adb forward --list` / `adb reverse --list`. Обе команды печатают строки
// вида "<serial> <spec1> <spec2>", но в разном порядке смысла столбцов: у
// forward это (local, remote), у reverse — (remote, local).

import { PortForwardRule } from '../types/PortForwardRule';

function parseList(
  output: string,
  serial: string,
  make: (col1: string, col2: string) => PortForwardRule
): PortForwardRule[] {
  const rules: PortForwardRule[] = [];
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split(/\s+/).filter(Boolean);
    if (parts.length < 3 || parts[0] !== serial) continue;
    rules.push(make(parts[1], parts[2]));
  }
  return rules;
}

export function parseForwardList(output: string, serial: string): PortForwardRule[] {
  return parseList(output, serial, (col1, col2) => ({
    direction: 'forward',
    hostSpec: col1,
    deviceSpec: col2,
  }));
}

export function parseReverseList(output: string, serial: string): PortForwardRule[] {
  // adb reverse --list печатает "<serial> <remote> <local>" — remote (на
  // устройстве) первым, local (на хосте) вторым.
  return parseList(output, serial, (col1, col2) => ({
    direction: 'reverse',
    hostSpec: col2,
    deviceSpec: col1,
  }));
}
