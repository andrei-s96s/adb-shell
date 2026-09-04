// Порт DeviceStatsViewModel.checkThresholds(_:) из
// Sources/AdbShell/ViewModels/DeviceStatsViewModel.swift — однократное
// уведомление при пересечении порога (не на каждом тике поллинга, пока
// значение держится за порогом), "взводится" заново, когда показатель
// возвращается в норму. Без гистерезиса — тот же порог для срабатывания и
// для повторного взвода (>=/< для CPU, <=/> для батареи).

export interface AlertArmState {
  cpuArmed: boolean;
  batteryArmed: boolean;
}

export function initialArmState(): AlertArmState {
  return { cpuArmed: true, batteryArmed: true };
}

export interface AlertThresholdSettings {
  enabled: boolean;
  cpuThreshold: number;
  batteryThreshold: number;
}

export interface StatsSample {
  cpuPercent?: number;
  batteryLevel?: number;
  isCharging: boolean;
}

export interface ThresholdCheckResult {
  armState: AlertArmState;
  cpuAlertFired?: { cpuPercent: number };
  /** Батарея на зарядке никогда не считается "низкой", вне зависимости от уровня. */
  batteryAlertFired?: { batteryLevel: number };
}

export function checkThresholds(
  armState: AlertArmState,
  stats: StatsSample,
  settings: AlertThresholdSettings
): ThresholdCheckResult {
  if (!settings.enabled) return { armState };

  let cpuArmed = armState.cpuArmed;
  let batteryArmed = armState.batteryArmed;
  let cpuAlertFired: { cpuPercent: number } | undefined;
  let batteryAlertFired: { batteryLevel: number } | undefined;

  if (stats.cpuPercent !== undefined) {
    if (stats.cpuPercent >= settings.cpuThreshold && cpuArmed) {
      cpuArmed = false;
      cpuAlertFired = { cpuPercent: stats.cpuPercent };
    } else if (stats.cpuPercent < settings.cpuThreshold) {
      cpuArmed = true;
    }
  }

  if (stats.batteryLevel !== undefined && !stats.isCharging) {
    if (stats.batteryLevel <= settings.batteryThreshold && batteryArmed) {
      batteryArmed = false;
      batteryAlertFired = { batteryLevel: stats.batteryLevel };
    } else if (stats.batteryLevel > settings.batteryThreshold) {
      batteryArmed = true;
    }
  }

  return { armState: { cpuArmed, batteryArmed }, cpuAlertFired, batteryAlertFired };
}
