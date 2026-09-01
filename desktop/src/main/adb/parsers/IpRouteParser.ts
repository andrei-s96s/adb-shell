// Порт Sources/AdbShell/Services/IpRouteParser.swift — достаёт IP устройства
// из вывода `adb shell ip route`, нужен после `adb tcpip` для подсказки
// `adb connect <ip>:<port>`.

export function parseDeviceIP(output: string): string | undefined {
  const lines = output.split('\n');
  const wlanLine = lines.find((l) => l.includes('wlan') && l.includes(' src '));
  const anyLine = lines.find((l) => l.includes(' src '));
  const line = wlanLine ?? anyLine;
  if (!line) return undefined;

  const parts = line.split(' ').filter(Boolean);
  const srcIndex = parts.indexOf('src');
  if (srcIndex === -1 || srcIndex + 1 >= parts.length) return undefined;
  return parts[srcIndex + 1];
}
