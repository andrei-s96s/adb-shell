// Закреплённые устройства (pinned tabs) — персистентно, в отличие от
// Swift-оригинала (см. devicePinsLogic.ts).

import { ipcMain } from 'electron';
import { IpcContext } from '../ipcContext';

export function registerDevicePinsIpc(ctx: IpcContext): void {
  ipcMain.handle('devicePins:list', () => ctx.devicePins.list());
  ipcMain.handle('devicePins:toggle', (_e, serial: string) => ctx.devicePins.toggle(serial));
}
