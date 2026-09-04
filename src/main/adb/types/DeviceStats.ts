// Порт Sources/AdbShell/Models/DeviceStats.swift

export interface DeviceStats {
  cpuPercent?: number;
  memUsedKB: number;
  memTotalKB: number;
  batteryLevel?: number;
  batteryTemperature?: number;
  isCharging: boolean;
  /** epoch ms */
  timestamp: number;
}

export function memUsedPercent(stats: DeviceStats): number | undefined {
  if (stats.memTotalKB <= 0) return undefined;
  return (stats.memUsedKB / stats.memTotalKB) * 100;
}
