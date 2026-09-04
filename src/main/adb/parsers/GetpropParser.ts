// Порт Sources/AdbShell/Services/GetpropParser.swift — парсинг вывода
// `adb shell getprop` (строки вида "[key]: [value]").

export interface DeviceProperty {
  key: string;
  value: string;
}

export function parseGetprop(output: string): DeviceProperty[] {
  const results: DeviceProperty[] = [];
  const marker = ']: [';

  for (const line of output.split('\n')) {
    const idx = line.indexOf(marker);
    if (idx === -1) continue;
    const keyPart = line.slice(0, idx);
    if (!keyPart.startsWith('[')) continue;
    const key = keyPart.slice(1);

    let value = line.slice(idx + marker.length);
    if (value.endsWith(']')) value = value.slice(0, -1);

    results.push({ key, value });
  }

  return results.sort((a, b) => a.key.localeCompare(b.key));
}
