// Порт Sources/AdbShell/Services/DeviceStatsParser.swift — разбор трёх
// shell-команд, из которых собирается DeviceStats: `dumpsys cpuinfo`,
// `cat /proc/meminfo`, `dumpsys battery`.

import { DeviceStats } from '../types/DeviceStats';

/** Строка "TOTAL" в `dumpsys cpuinfo` выглядит как "23% TOTAL: 12% user + ..."
 * — берём число перед первым "% TOTAL". */
export function parseCpuPercent(output: string): number | undefined {
  for (const line of output.split('\n')) {
    const idx = line.indexOf('% TOTAL');
    if (idx === -1) continue;
    const prefix = line.slice(0, idx).trim();
    const digits = prefix.split(' ').pop() ?? prefix;
    const value = Number.parseFloat(digits.trim());
    if (!Number.isNaN(value)) return Math.min(Math.max(value, 0), 100);
  }
  return undefined;
}

/** `/proc/meminfo`: MemTotal - MemAvailable (либо MemFree, если MemAvailable
 * недоступен — на старых ядрах его может не быть). */
export function parseMemInfo(output: string): { usedKB: number; totalKB: number } | undefined {
  let total: number | undefined;
  let available: number | undefined;
  let free: number | undefined;

  for (const line of output.split('\n')) {
    const parts = line.split(':');
    if (parts.length !== 2) continue;
    const key = parts[0].trim();
    const valueDigits = parts[1].trim().split(' ')[0];
    const value = Number.parseInt(valueDigits, 10);
    if (Number.isNaN(value)) continue;
    if (key === 'MemTotal') total = value;
    else if (key === 'MemAvailable') available = value;
    else if (key === 'MemFree') free = value;
  }

  if (total === undefined) return undefined;
  const used = total - (available ?? free ?? total);
  return { usedKB: Math.max(used, 0), totalKB: total };
}

export interface BatteryInfo {
  level?: number;
  temperature?: number;
  charging: boolean;
}

/** `dumpsys battery`: level/scale дают процент, temperature — в десятых
 * долях °C, заряд определяем по status==2 (BATTERY_STATUS_CHARGING) либо
 * по *_powered. */
export function parseBattery(output: string): BatteryInfo {
  let level: number | undefined;
  let scale: number | undefined;
  let temperature: number | undefined;
  let status: number | undefined;
  let anyPowered = false;

  const toInt = (s: string): number | undefined => {
    const n = Number.parseInt(s, 10);
    return Number.isNaN(n) ? undefined : n;
  };

  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    switch (key) {
      case 'level':
        level = toInt(value);
        break;
      case 'scale':
        scale = toInt(value);
        break;
      case 'status':
        status = toInt(value);
        break;
      case 'temperature': {
        const n = Number.parseFloat(value);
        temperature = Number.isNaN(n) ? undefined : n / 10;
        break;
      }
      case 'AC powered':
      case 'USB powered':
      case 'Wireless powered':
      case 'Dock powered':
        if (value === 'true') anyPowered = true;
        break;
      default:
        break;
    }
  }

  const percent =
    level === undefined ? undefined : scale !== undefined && scale > 0 && scale !== 100 ? Math.round((level / scale) * 100) : level;
  const charging = status === 2 || anyPowered;
  return { level: percent, temperature, charging };
}

export function parseDeviceStats(
  cpuOutput: string,
  memOutput: string,
  batteryOutput: string,
  timestamp: number = Date.now()
): DeviceStats {
  const mem = parseMemInfo(memOutput);
  const battery = parseBattery(batteryOutput);
  return {
    cpuPercent: parseCpuPercent(cpuOutput),
    memUsedKB: mem?.usedKB ?? 0,
    memTotalKB: mem?.totalKB ?? 0,
    batteryLevel: battery.level,
    batteryTemperature: battery.temperature,
    isCharging: battery.charging,
    timestamp,
  };
}
