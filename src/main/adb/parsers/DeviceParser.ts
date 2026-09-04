// Порт ADBService.parseDevices(from:) из Sources/AdbShell/Services/ADBService.swift —
// парсинг вывода `adb devices -l`.

import { Device, DeviceState } from '../types/Device';

const KNOWN_STATES: Record<string, DeviceState> = {
  device: 'device',
  offline: 'offline',
  unauthorized: 'unauthorized',
};
// Примечание (сохранено из оригинала): реальный статус "нет прав" adb
// печатает как ДВА слова "no permissions" через пробел. Токенизация ниже
// режет строку по пробелам и сравнивает только один токен (parts[1]) —
// то же ограничение, что и в исходном Swift-парсере, портируется с
// сохранением поведения, а не молча исправляется в рамках этого переноса.

export function parseDevices(output: string): Device[] {
  const devices: Device[] = [];
  const lines = output.split('\n');

  for (const rawLine of lines) {
    if (rawLine.startsWith('List of devices')) continue;
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) continue;

    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length < 2) continue;

    const serial = parts[0];
    const stateRaw = parts[1];
    const state: DeviceState = KNOWN_STATES[stateRaw] ?? 'unknown';

    let model: string | undefined;
    let product: string | undefined;
    let transportId: string | undefined;
    for (const token of parts.slice(2)) {
      if (token.startsWith('model:')) model = token.slice('model:'.length);
      if (token.startsWith('product:')) product = token.slice('product:'.length);
      if (token.startsWith('transport_id:')) transportId = token.slice('transport_id:'.length);
    }

    devices.push({ serial, state, model, product, transportId });
  }

  return devices;
}
