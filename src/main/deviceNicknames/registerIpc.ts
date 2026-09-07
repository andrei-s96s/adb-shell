// Никнеймы устройств — по serial, не зависят от adb model.

import { ipcMain } from 'electron';
import { IpcContext } from '../ipcContext';

export function registerDeviceNicknamesIpc(ctx: IpcContext): void {
  ipcMain.handle('deviceNicknames:list', () => ctx.deviceNicknames.list());
  ipcMain.handle('deviceNicknames:set', (_e, serial: string, name: string) => ctx.deviceNicknames.setNickname(serial, name));
}
