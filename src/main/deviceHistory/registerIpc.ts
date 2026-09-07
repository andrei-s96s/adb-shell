// История подключений -- см. DeviceHistoryStore. Само наполнение истории
// (recordSeen) происходит не здесь, а в adb:listDevices (adb/registerDevicesIpc.ts) --
// это домен только для чтения/очистки уже накопленной истории.

import { ipcMain } from 'electron';
import { IpcContext } from '../ipcContext';

export function registerDeviceHistoryIpc(ctx: IpcContext): void {
  ipcMain.handle('deviceHistory:list', () => ctx.deviceHistory.list());
  ipcMain.handle('deviceHistory:remove', (_e, serial: string) => ctx.deviceHistory.remove(serial));
  ipcMain.handle('deviceHistory:clear', () => ctx.deviceHistory.clear());
}
