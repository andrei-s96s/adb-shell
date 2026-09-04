// Порт MdnsParser.parse(_:) из Sources/AdbShell/Models/MdnsDevice.swift —
// парсинг вывода `adb mdns services`.

import { MdnsDevice } from '../types/MdnsDevice';

/** Формат вывода `adb mdns services` — по одной службе на строку, поля
 * разделены табуляцией: имя, тип записи, ip:port. Заголовочная строка
 * "List of discovered mdns services" пропускается. */
export function parseMdnsServices(output: string): MdnsDevice[] {
  const devices: MdnsDevice[] = [];
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.toLowerCase().startsWith('list of discovered')) continue;

    const parts = line.split('\t').map((part) => part.trim());
    if (parts.length < 3) continue;
    const [name, type, address] = parts;
    if (!address.includes(':') || name.length === 0) continue;

    devices.push({ name, type, address });
  }
  return devices;
}
