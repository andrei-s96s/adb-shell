// Запуск ОДНОГО макроса на НЕСКОЛЬКИХ устройствах разом -- общая логика
// между macros:runOnAll (registerIpc.ts) и периодическим запуском по
// расписанию (main.ts, scheduleIntervalMinutes) -- раньше была продублирована
// целиком между macros:runOnAll и тем, что стало бы копией того же кода для
// планировщика.

import { AdbService } from '../adb/AdbService';
import { Device, displayName } from '../adb/types/Device';
import { Macro } from '../adb/types/Macro';
import { runMacro } from './MacroRunner';
import { MacroRunHistoryStore } from '../macroRunHistory/MacroRunHistoryStore';
import { mapWithConcurrency } from '../util/concurrency';

export interface RunOnDevicesResult {
  successCount: number;
  total: number;
  failures: string[];
}

/** mapWithConcurrency с лимитом 3 -- то же ограничение, что и у
 * adb:screenshotAllDevices/apkLibrary:installToAllDevices, каждое устройство
 * пишет свою запись в журнал запусков независимо от остальных (одна неудача
 * не должна ни прерывать батч, ни портить историю остальных). */
export async function runMacroOnDevices(
  macro: Macro,
  devices: Device[],
  service: AdbService,
  variables: Record<string, string>,
  macroRunHistory: MacroRunHistoryStore
): Promise<RunOnDevicesResult> {
  const failures: string[] = [];
  let successCount = 0;
  await mapWithConcurrency(devices, 3, async (device) => {
    const startedAtMs = Date.now();
    try {
      const outcome = await runMacro(macro, device.serial, service, variables);
      macroRunHistory.record(macro, device.serial, displayName(device), startedAtMs, outcome.completedFully, outcome.results);
      if (outcome.completedFully) successCount += 1;
      else failures.push(`${displayName(device)}: остановлено на ошибке`);
    } catch (error) {
      macroRunHistory.record(macro, device.serial, displayName(device), startedAtMs, false, []);
      failures.push(`${displayName(device)}: ${(error as Error).message}`);
    }
  });
  return { successCount, total: devices.length, failures };
}
