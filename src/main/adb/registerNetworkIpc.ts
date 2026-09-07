// Wi-Fi отладка, проброс портов, все системные свойства устройства.

import { ipcMain } from 'electron';
import { IpcContext } from '../ipcContext';

export function registerNetworkIpc(ctx: IpcContext): void {
  // Wi-Fi отладка
  ipcMain.handle('adb:enableWirelessDebugging', (_e, serial: string, port: number) =>
    ctx.adb.enableWirelessDebugging(serial, port)
  );
  ipcMain.handle('adb:deviceIPAddress', (_e, serial: string) => ctx.adb.deviceIPAddress(serial));

  // Проброс портов
  ipcMain.handle('adb:listForwards', (_e, serial: string) => ctx.adb.listForwards(serial));
  ipcMain.handle('adb:addForward', (_e, serial: string, hostSpec: string, deviceSpec: string) =>
    ctx.adb.addForward(serial, hostSpec, deviceSpec)
  );
  ipcMain.handle('adb:removeForward', (_e, serial: string, hostSpec: string) => ctx.adb.removeForward(serial, hostSpec));
  ipcMain.handle('adb:listReverses', (_e, serial: string) => ctx.adb.listReverses(serial));
  ipcMain.handle('adb:addReverse', (_e, serial: string, deviceSpec: string, hostSpec: string) =>
    ctx.adb.addReverse(serial, deviceSpec, hostSpec)
  );
  ipcMain.handle('adb:removeReverse', (_e, serial: string, deviceSpec: string) => ctx.adb.removeReverse(serial, deviceSpec));

  // Свойства устройства
  ipcMain.handle('adb:allProperties', (_e, serial: string) => ctx.adb.allProperties(serial));
}
