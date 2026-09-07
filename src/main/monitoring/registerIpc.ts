// Мониторинг и диагностика — живые графики CPU/памяти, процессы, карточка
// "Безопасность", сетевой трафик приложения, экранное время, ANR/tombstone,
// пороговые уведомления при высоком CPU/низком заряде.

import { ipcMain, Notification } from 'electron';
import { IpcContext } from '../ipcContext';
import { AlertArmState, checkThresholds, initialArmState } from './alertThresholdLogic';
import { DeviceStats } from '../adb/types/DeviceStats';
import { analyzeSecurity } from '../adb/parsers/DeviceSecurityAnalyzer';

export function registerMonitoringIpc(ctx: IpcContext): void {
  // Один вызов вместо двух -- deviceStats и runningProcesses раньше были
  // отдельными IPC-каналами (4 отдельных adb-процесса вместе), см.
  // AdbService.deviceStatsAndProcesses() про склейку.
  ipcMain.handle('adb:deviceStatsAndProcesses', (_e, serial: string) => ctx.adb.deviceStatsAndProcesses(serial));
  ipcMain.handle('adb:killProcess', (_e, serial: string, pid: number) => ctx.adb.killProcess(serial, pid));

  // Безопасность устройства -- разовая проверка (свойства не меняются на
  // лету), карточка в Мониторинге.
  ipcMain.handle('adb:securityInfo', async (_e, serial: string) => analyzeSecurity(await ctx.adb.securityInfo(serial)));

  // Сетевой трафик приложения (панель деталей приложения, поллинг 3с на
  // стороне renderer) и экранное время (разовая загрузка в Мониторинге).
  ipcMain.handle('adb:networkUsage', (_e, serial: string, uid: number) => ctx.adb.networkUsage(serial, uid));
  ipcMain.handle('adb:usageStats', (_e, serial: string) => ctx.adb.usageStats(serial));

  // ANR / tombstones -- кнопка "Crashes" в Logcat.
  ipcMain.handle('adb:crashTraces', (_e, serial: string) => ctx.adb.crashTraces(serial));
  ipcMain.handle('adb:readCrashTrace', (_e, serial: string, filePath: string) => ctx.adb.readCrashTrace(serial, filePath));

  // Пороговые уведомления при высоком CPU/низком заряде -- alertArmState
  // локален этому модулю (кроме этих двух хендлеров его больше никто не
  // читает и не пишет).
  let alertArmState: AlertArmState = initialArmState();
  ipcMain.handle('monitoring:resetAlertArm', () => {
    alertArmState = initialArmState();
  });
  ipcMain.handle('monitoring:checkThresholds', (_e, stats: DeviceStats) => {
    const settings = ctx.appSettings.get();
    const result = checkThresholds(alertArmState, stats, {
      enabled: settings.statsAlertsEnabled,
      cpuThreshold: settings.statsAlertCpuThreshold,
      batteryThreshold: settings.statsAlertBatteryThreshold,
    });
    alertArmState = result.armState;
    if (result.cpuAlertFired) {
      new Notification({
        title: 'Высокая нагрузка CPU',
        body: `CPU: ${Math.round(result.cpuAlertFired.cpuPercent)}%`,
      }).show();
    }
    if (result.batteryAlertFired) {
      new Notification({
        title: 'Низкий заряд батареи',
        body: `Батарея: ${result.batteryAlertFired.batteryLevel}%`,
      }).show();
    }
    return result;
  });
}
