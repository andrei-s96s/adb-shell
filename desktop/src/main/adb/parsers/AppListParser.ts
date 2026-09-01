// Порт ADBService.mergeApps(all:user:disabled:) из ADBService.swift — склеивает
// три вывода `pm list packages` в список приложений с флагами isSystem/isEnabled.

import { InstalledApp } from '../types/AppInfo';

function packageSet(output: string): Set<string> {
  const result = new Set<string>();
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('package:')) {
      result.add(line.slice('package:'.length));
    }
  }
  return result;
}

export function mergeApps(all: string, user: string, disabled: string): InstalledApp[] {
  const allSet = packageSet(all);
  const userSet = packageSet(user);
  const disabledSet = packageSet(disabled);

  return Array.from(allSet)
    .map((packageName) => ({
      packageName,
      isSystem: !userSet.has(packageName),
      isEnabled: !disabledSet.has(packageName),
    }))
    .sort((a, b) => a.packageName.toLowerCase().localeCompare(b.packageName.toLowerCase()));
}
