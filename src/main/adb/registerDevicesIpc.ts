// Устройства — список, подключение по сети, сопряжение, mDNS-автообнаружение,
// перезапуск adb-сервера.

import { ipcMain } from 'electron';
import { IpcContext } from '../ipcContext';

export function registerDevicesIpc(ctx: IpcContext): void {
  ipcMain.handle('adb:listDevices', () => ctx.adb.listDevices());
  ipcMain.handle('adb:connect', (_e, host: string) => ctx.adb.connect(host));
  ipcMain.handle('adb:disconnect', (_e, serial: string) => ctx.adb.disconnect(serial));
  ipcMain.handle('adb:pair', (_e, hostPort: string, code: string) => ctx.adb.pair(hostPort, code));
  // mDNS-автообнаружение устройств с беспроводной отладкой (Android 11+) —
  // renderer сам опрашивает раз в 5с (см. startMdnsPolling в renderer.ts),
  // отдельного долгоживущего процесса в main для этого не требуется.
  ipcMain.handle('adb:discoverMdns', () => ctx.adb.discoverMdnsDevices());
  // Намеренно realAdb, а не переключаемый ctx.adb -- эта кнопка лечит
  // НАСТОЯЩИЙ adb-сервер (см. AdbService.restartServer()), у демо-режима
  // никакого своего процесса нет и лечить нечего, но пользователь мог
  // включить демо именно ПОТОМУ, что настоящий adb сломан (ровно так и
  // начиналась эта история) -- кнопка должна работать независимо от того,
  // какой режим сейчас выбран в UI.
  ipcMain.handle('adb:restartServer', () => ctx.realAdb.restartServer());
}
